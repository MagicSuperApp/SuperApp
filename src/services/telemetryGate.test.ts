/**
 * Bài kiểm cho cổng lọc dữ liệu đi ra.
 *
 * Mỗi ca CHẶN đều có ca ĐỐI XỨNG cho qua ngay cạnh. Không có ca đối xứng thì
 * một cổng chặn-tất-cả cũng xanh, và cái xanh đó không nói gì về việc nó có
 * phân biệt được hay không.
 */
import {
  filterBeforeSend,
  forbiddenShape,
  ALLOWED_KEYS,
} from './telemetryGate';

describe('tầng 1 — tên chưa khai thì không đi', () => {
  it('bỏ khoá lạ, và ĐỂ LẠI DẤU chứ không xoá im lặng', () => {
    const { safe, dropped } = filterBeforeSend({ khoaLa: 'giá trị bất kỳ' });
    expect(dropped).toEqual(['khoaLa']);
    // Dấu phải còn: thiếu nó thì người đọc bản ghi tưởng mã không chạy tới đó.
    expect(safe.khoaLa).toBe('[bỏ:tên-chưa-khai]');
  });

  it('[đối xứng] khoá đã khai thì đi bình thường', () => {
    const { safe, dropped } = filterBeforeSend({ captureCount: 7, ok: true });
    expect(dropped).toEqual([]);
    expect(safe).toEqual({ captureCount: 7, ok: true });
  });

  it('lat/lon KHÔNG nằm trong danh sách cho phép', () => {
    expect(ALLOWED_KEYS).not.toContain('lat');
    expect(ALLOWED_KEYS).not.toContain('lon');
    const { dropped } = filterBeforeSend({ lat: 10.77, lon: 106.7 });
    expect(dropped.sort()).toEqual(['lat', 'lon']);
  });

  it('định danh người KHÔNG nằm trong danh sách cho phép', () => {
    for (const k of ['did', 'userId', 'username', 'owner', 'uri']) {
      expect(ALLOWED_KEYS).not.toContain(k);
    }
  });
});

describe('tầng 2 — hình dạng bí mật bị chặn dù tên hợp lệ', () => {
  // Đây là tầng quan trọng hơn: `err` là khoá HỢP LỆ và cần cho chẩn đoán,
  // nhưng nội dung của nó do thư viện bên ngoài quyết, không do kho này quyết.

  it('cụm 24 từ đội lốt một thông điệp lỗi', () => {
    const cum =
      'abandon ability able about above absent absorb abstract absurd abuse ' +
      'access accident account accuse achieve acid acoustic acquire across act ' +
      'action actor actress adapt';
    const { safe, dropped } = filterBeforeSend({ err: cum });
    expect(dropped).toEqual(['err']);
    expect(safe.err).toBe('[bỏ:hình-dạng-recovery-phrase]');
  });

  it('[đối xứng] thông điệp lỗi bình thường vẫn đi qua', () => {
    const { safe, dropped } = filterBeforeSend({ err: 'Network request failed' });
    expect(dropped).toEqual([]);
    expect(safe.err).toBe('Network request failed');
  });

  it('chuỗi 64 hex (Master_KEK / băm) bị chặn', () => {
    const kek = 'a'.repeat(64);
    expect(forbiddenShape(kek)).toBe('hex-64');
    expect(filterBeforeSend({ message: kek }).dropped).toEqual(['message']);
  });

  it('[đối xứng] mã băm ngắn dùng để đối chiếu vẫn đi qua', () => {
    expect(forbiddenShape('a1b2c3d4')).toBeNull();
    expect(filterBeforeSend({ message: 'sha=a1b2c3d4' }).dropped).toEqual([]);
  });

  it('DID bị chặn', () => {
    const did = `did:phoenix:abcdefghijklm:${'f'.repeat(64)}`;
    expect(forbiddenShape(did)).not.toBeNull();
    expect(filterBeforeSend({ err: did }).dropped).toEqual(['err']);
  });

  it('địa chỉ ví Cardano bị chặn', () => {
    const addr = 'addr1qx' + 'y'.repeat(40);
    expect(forbiddenShape(addr)).toBe('wallet-address');
  });

  it('[đối xứng] chữ "addr" trong câu văn KHÔNG bị chặn', () => {
    expect(forbiddenShape('bad addr in config')).toBeNull();
  });
});

describe('không nuốt lỗi, không đệm giá trị giả', () => {
  it('null giữ nguyên là null — không đổi thành chuỗi rỗng', () => {
    // Chuỗi rỗng lẫn với "trường này vốn rỗng"; null thì tự khai là không có.
    expect(filterBeforeSend({ err: null }).safe.err).toBeNull();
  });

  it('tham chiếu vòng không làm mất cả bản ghi, và tự khai là đã hỏng', () => {
    const vong: Record<string, unknown> = { message: null };
    vong.message = vong; // tự trỏ vào chính nó
    const { safe } = filterBeforeSend(vong);
    expect(String(safe.message)).toContain('[bỏ:');
  });

  it('đầu vào rỗng không ném', () => {
    expect(filterBeforeSend(null).safe).toEqual({});
    expect(filterBeforeSend(undefined).dropped).toEqual([]);
  });

  it('vết ngăn xếp dài bị cắt, và dấu … cho biết là đã cắt', () => {
    // Vết ngăn xếp thật có dấu chấm, gạch chéo, ngoặc — nên không khối liền nào
    // đủ 60 ký tự để khớp mẫu base64. Bản đầu của bài kiểm này dùng 500 chữ `x`
    // liền và trượt: cổng chặn nó ở TẦNG 2 chứ không cắt. Cổng đúng, bài kiểm
    // sai — một khối 500 ký tự chữ-số liền đúng là thứ phải chặn.
    const dai = Array.from(
      { length: 40 },
      (_, i) => `at fn${i} (src/mod/file${i}.ts:${i}:12)`,
    ).join(' ');
    expect(dai.length).toBeGreaterThan(500);
    const out = String(filterBeforeSend({ stackTrace: dai }).safe.stackTrace);
    expect(out.length).toBeLessThan(dai.length);
    expect(out.endsWith('…')).toBe(true);
  });

  it('THỨ TỰ: soi hình dạng TRƯỚC khi cắt ngắn', () => {
    // Cắt trước thì 300 ký tự đầu của một bí mật vẫn đi ra mạng. Đảo hai bước
    // này là lỗ, và nó không làm bài kiểm nào khác đỏ.
    const biMat = 'k'.repeat(64) + ' ' + 'đuôi vô hại '.repeat(40);
    const out = String(filterBeforeSend({ message: biMat }).safe.message);
    expect(out).toContain('[bỏ:hình-dạng-');
    expect(out).not.toContain('kkkk');
  });
});
