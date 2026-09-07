/**
 * Khoá lại ba tính chất vừa được dựng. Cả ba đều thuộc loại HỎNG MÀ KHÔNG KÊU:
 * gỡ chúng ra thì app vẫn dựng được, `tsc` vẫn xanh, không màn nào đổi hình, và
 * người đầu tiên phát hiện là người dùng đã mất ví.
 *
 * Đây là bài kiểm ĐỌC NGUỒN (cùng loại với `navigation/authGate.test.tsx` §B).
 * Nó không chạy màn hình — nó canh cho ba câu dưới đây còn đúng:
 *
 *   1. Cổng sinh trắc đứng GIỮA việc tạo ví và việc lộ bí mật, không đứng trước
 *      cả hai. Đứng trước cả hai thì người không qua được cổng sẽ không có ví.
 *   2. Cổng dùng `signRaw` (chip bật hộp thoại) chứ không `simplePrompt` (JS bật,
 *      trả boolean). Đường đăng nhập của app đã bỏ `simplePrompt` vì lý do đó.
 *   3. Màn xuất hiện DID cùng 24 từ. Thiếu nó thì người khôi phục trên máy mới bị
 *      hỏi một chuỗi chưa ai bảo họ chép.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, 'SeedExportScreen.tsx'),
  'utf8',
);
const MANIFEST = fs.readFileSync(
  path.join(__dirname, '../../android/app/src/main/AndroidManifest.xml'),
  'utf8',
);

/** Vị trí xuất hiện đầu tiên; -1 nếu không có. Dùng để so THỨ TỰ, không chỉ sự có mặt. */
const at = (needle: string): number => SRC.indexOf(needle);

describe('A — cổng chắn việc LỘ, không chắn việc TẠO VÍ', () => {
  it('tạo ví (getOrCreateMasterKek) chạy TRƯỚC cổng', () => {
    const taoVi = at('await getOrCreateMasterKek()');
    const cong = at('await signRaw(');
    expect(taoVi).toBeGreaterThan(-1);
    expect(cong).toBeGreaterThan(-1);
    // Đảo thứ tự hai dòng này là biến cổng bảo mật thành cổng chặn người dùng
    // khỏi ví của chính họ: hai lối vào khác dẫn tới đây để TẠO ví, không phải
    // để xem cụm từ.
    expect(taoVi).toBeLessThan(cong);
  });

  it('lộ bí mật (masterKekToMnemonic) chạy SAU cổng', () => {
    const cong = at('await signRaw(');
    const lo = at('await taadEnclave.masterKekToMnemonic(');
    expect(lo).toBeGreaterThan(-1);
    expect(cong).toBeLessThan(lo);
  });

  it('không nuốt lỗi sinh trắc — người dùng tự huỷ và máy khoá tạm là hai câu khác nhau', () => {
    expect(SRC).toContain('PhoenixKeyNativeError.USER_CANCELED');
    expect(SRC).toContain('PhoenixKeyNativeError.BIOMETRIC_LOCKOUT');
  });
});

describe('B — cổng là chữ ký do CHIP xác nhận, không phải boolean của JS', () => {
  it('dùng signRaw', () => {
    // Khớp TỪNG TÊN một, không khớp cả dòng import. Bản đầu so nguyên văn
    // `"import { signRaw, currentUserDid } from '../sdk/phoenixKey';"` và sẽ
    // đỏ chỉ vì ai đó đảo thứ tự hai cái tên — một phép kiểm vỡ vì lý do không
    // liên quan gì tới thứ nó canh thì sớm muộn cũng bị tắt đi.
    expect(SRC).toMatch(/import\s*\{[^}]*\bsignRaw\b[^}]*\}\s*from\s*'\.\.\/sdk\/phoenixKey'/);
    expect(SRC).toMatch(/import\s*\{[^}]*\bcurrentUserDid\b[^}]*\}\s*from\s*'\.\.\/sdk\/phoenixKey'/);
  });

  it('KHÔNG quay lại simplePrompt', () => {
    // `simplePrompt()` trả một boolean ở tầng JS: ai sửa được luồng JS là đổi
    // được nó thành true. LoginScreen đã bỏ nó vì đúng lý do này.
    //
    // Khớp dạng LỜI GỌI (`.simplePrompt(`), không khớp trần chữ `simplePrompt`:
    // bản đầu của bài kiểm này khớp trần và tự đỏ, vì chính khối chú thích giải
    // thích *vì sao không dùng* `simplePrompt` cũng chứa chữ đó. Một cổng đo văn
    // bản mà không phân biệt mã với lời bàn về mã thì nó cấm luôn việc ghi lại lý
    // do — và lý do là thứ giữ cho người sau không dựng lại cái đã tháo.
    expect(SRC).not.toMatch(/\.simplePrompt\s*\(/);
  });
});

describe('C — DID đi cùng 24 từ', () => {
  it('màn lấy DID khi lộ cụm từ', () => {
    expect(SRC).toContain('setDid(await currentUserDid())');
  });

  it('việc LỘ chạy TRƯỚC lần đọc DID — đọc phụ không được chặn việc chính', () => {
    // `currentUserDid` là `AsyncStorage.getItem` trần. Đặt nó TRÊN `setRevealed`
    // thì một lần đọc ném là người dùng không bao giờ thấy 24 từ, dù chip đã xác
    // nhận xong và cụm từ đã nằm sẵn trong bộ nhớ. Hành vi ấy khoá ở
    // `SeedExportScreen.render.test.tsx`; phép so THỨ TỰ này thì bài kiểm dựng
    // màn không làm được, nên hai chỗ canh hai mặt khác nhau của cùng một lỗi.
    //
    // Khớp kèm dấu `;` — tức khớp CÂU LỆNH, không khớp chuỗi trần. Bản đầu của
    // phép so này đỏ, và đỏ vì một lý do đáng ghi lại: khối chú thích ngay trên
    // đoạn mã, giải thích *vì sao* thứ tự phải như vậy, có nhắc lại
    // `setDid(await currentUserDid())` trong dấu nháy ngược — và nó đứng TRƯỚC
    // đoạn mã thật. Đúng cái bẫy đã dính một lần ở §B với `simplePrompt`:
    // phép đo văn bản không phân biệt được mã với lời bàn về mã.
    const reveal = at('setRevealed(true);');
    const readDid = at('setDid(await currentUserDid());');
    expect(reveal).toBeGreaterThan(-1);
    expect(readDid).toBeGreaterThan(-1);
    expect(reveal).toBeLessThan(readDid);
  });

  it('có nhánh nói ra khi KHÔNG đọc được DID', () => {
    // Vẽ `null` ở nhánh này là dựng lại đúng trạng thái trước lượt sửa, nhưng
    // lần này người dùng tin là đã chép đủ.
    expect(SRC).toContain('Không đọc được mã định danh');
  });

  it('DID được hiện ra, không chỉ lấy về rồi bỏ đó', () => {
    expect(SRC).toContain('styles.didValue');
  });

  it('nói rõ 24 từ KHÔNG đủ trên máy mới', () => {
    expect(SRC).toContain('24 từ');
    expect(SRC).toContain('không đủ');
  });

  it('có câu chống lừa đảo hỏi xin cụm từ', () => {
    expect(SRC).toContain('đang lừa bạn');
  });
});

describe('D — không Activity nào mở ra ngoài mà thiếu intent-filter', () => {
  // Thiếu <intent-filter> chỉ chặn intent NGẦM ĐỊNH. Một app khác trên cùng máy
  // vẫn gọi được bằng intent TƯỜNG MINH. Nên `exported="true"` mà không có
  // intent-filter là một cửa mở mà không ai đọc manifest nhận ra là cửa.
  it('FarmDetailActivity đóng với bên ngoài', () => {
    const khoi = MANIFEST.indexOf('android:name=".FarmDetailActivity"');
    expect(khoi).toBeGreaterThan(-1);
    // Thẻ này TỰ ĐÓNG (`/>`), không có `</activity>`. Bản đầu của bài kiểm cắt
    // tới `</activity>` nên `indexOf` trả -1, `slice` ra chuỗi RỖNG, và phép so
    // sau đó đo một chuỗi rỗng — tức nó không đo gì mà vẫn cho ra một kết luận.
    const het = MANIFEST.indexOf('>', khoi);
    expect(het).toBeGreaterThan(khoi);
    const than = MANIFEST.slice(khoi, het + 1);
    expect(than).toContain('android:exported="false"');
  });

  it('chỉ đúng MỘT activity được mở ra ngoài, và nó là màn khởi chạy', () => {
    const soMo = (MANIFEST.match(/android:exported="true"/g) || []).length;
    expect(soMo).toBe(1);
    // Ca đối chứng: phép đếm trên có chạy thật, không phải khớp vào chuỗi rỗng.
    const soDong = (MANIFEST.match(/android:exported="false"/g) || []).length;
    expect(soDong).toBeGreaterThan(0);

    const khoi = MANIFEST.indexOf('android:name=".MainActivity"');
    const than = MANIFEST.slice(khoi, MANIFEST.indexOf('</activity>', khoi));
    expect(than).toContain('android.intent.category.LAUNCHER');
  });
});
