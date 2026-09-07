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

describe('số và luận lý — danh sách CHẶN, không phải danh sách cho phép', () => {
  // Bản đầu bắt cả số và luận lý qua danh sách cho phép, và hỏng theo chiều
  // ngược: `rLog.phoenixWallet` gửi hasDid/hasPubkey/sigLen/saved — toàn luận lý
  // và độ dài, hoàn toàn vô hại — mà cổng bỏ sạch. Cổng chặn quá tay thì người
  // ta gỡ cổng, và lúc đó không còn gì chặn cả.

  it('luận lý và số đếm với khoá chưa khai VẪN đi qua', () => {
    const { safe, dropped } = filterBeforeSend({
      hasDid: true, hasPubkey: false, sigLen: 64, saved: true,
    });
    expect(dropped).toEqual([]);
    expect(safe).toEqual({ hasDid: true, hasPubkey: false, sigLen: 64, saved: true });
  });

  it('[đối xứng] số NHẠY CẢM vẫn bị chặn dù là số', () => {
    const { safe, dropped } = filterBeforeSend({ lat: 10.77, pin: 123456 });
    expect(dropped.sort()).toEqual(['lat', 'pin']);
    expect(safe.lat).toBe('[bỏ:số-nhạy-cảm]');
  });

  it('cùng cái tên nhưng giá trị là CHUỖI thì quay về danh sách cho phép', () => {
    // `sigLen` là số thì qua; là chuỗi thì phải khai tên — vì chuỗi chở được
    // bất cứ gì, kể cả khi đứng dưới một cái tên nghe vô hại.
    expect(filterBeforeSend({ sigLen: 64 }).dropped).toEqual([]);
    expect(filterBeforeSend({ sigLen: 'abc' }).dropped).toEqual(['sigLen']);
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

describe('chuỗi dài HỢP LỆ vẫn đi qua — mặt đối xứng của `long-base64`', () => {
  // Mẫu `long-base64` bắt mọi mạch ≥60 ký tự thuần `[A-Za-z0-9_-]`, và đó là
  // mẫu RỘNG nhất trong bộ. Người xem PR nêu đúng một chỗ trống: mọi bài kiểm
  // trước đây đều chứng minh bí mật BỊ CHẶN, không bài nào chứng minh một giá
  // trị dài nhưng vô hại KHÔNG bị mất. Một cổng chặn quá tay thì bị gỡ, và gỡ
  // rồi thì không còn gì chặn — nên mặt này phải có bài kiểm riêng.
  //
  // Điều cứu phần lớn giá trị thật là DẤU NGẮT: `.` `/` `:` khoảng trắng đều
  // cắt mạch, nên `\b...\b` không gom được 60 ký tự liền.

  // `dropped` là tên trường trong `FilterResult`. Trên đường truyền nó mang tên
  // `gateDropped` (`remoteLogger.ts:70`) — hai tên cho cùng một thứ, và bản đầu
  // của khối này gõ nhầm tên-đường-truyền vào chỗ đọc kết quả hàm rồi so với
  // `undefined`.
  const diQua = (v: string) => {
    const r = filterBeforeSend({ message: v });
    return { ra: String(r.safe.message ?? ''), boBot: r.dropped };
  };

  it('URL dài đi qua nguyên vẹn', () => {
    const url = 'https://api.orilife.io/v1/farms/12345/trees/67890/provenance?from=2026-01-01&to=2026-09-07';
    expect(url.length).toBeGreaterThan(60);
    const { ra, boBot } = diQua(url);
    expect(ra).toBe(url);
    expect(boBot).toHaveLength(0);
  });

  it('câu lỗi tiếng Việt dài đi qua', () => {
    const cau = 'Không kết nối được máy chủ truy xuất sau ba lần thử lại, lần cuối lúc 14 giờ 32 phút, mã trả về 503';
    expect(cau.length).toBeGreaterThan(60);
    expect(diQua(cau).ra).toBe(cau);
  });

  it('UUID đi qua — 36 ký tự, lại có gạch nối', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(diQua(id).ra).toBe(id);
  });

  it('mã tra cứu có dấu ngắt đi qua, dù tổng chiều dài vượt 60', () => {
    const ma = 'req_2026-09-07_farm-12345_tree-67890_scan-0042_dev-a1b2c3';
    expect(ma.length).toBeGreaterThan(50);
    expect(diQua(ma).ra).toBe(ma);
  });

  it('ĐỐI CHỨNG: bỏ hết dấu ngắt khỏi chính mã đó thì nó BỊ chặn', () => {
    // Không có ca này thì bốn phép so trên có thể đúng vì cổng đã hỏng hẳn,
    // chứ không vì dấu ngắt cứu chúng.
    const ma = 'req20260907farm12345tree67890scan0042deva1b2c3XyZqWeRtYuIoPaSdFgHjKl';
    expect(ma.length).toBeGreaterThan(60);
    const { ra, boBot } = diQua(ma);
    expect(ra).toContain('[bỏ:hình-dạng-long-base64]');
    expect(boBot).toContain('message');
  });

  it('trường bị bỏ phải KÊU — đó là điều kiện để giữ mẫu rộng', () => {
    // Toàn bộ lập luận "thà chặn nhầm còn hơn cho lọt" đứng trên một tiền đề:
    // chặn nhầm thì THẤY ĐƯỢC. Ngày nhánh bỏ im lặng đi, tiền đề sập và phải
    // thu hẹp mẫu. Bài kiểm này canh đúng tiền đề đó.
    const r = filterBeforeSend({ message: 'A'.repeat(80), event: 'thu' });
    expect(String(r.safe.message)).toContain('[bỏ:');
    expect(r.dropped).toContain('message');
    // Và trường lành lặn bên cạnh KHÔNG bị vạ lây.
    expect(r.safe.event).toBe('thu');
  });
});
