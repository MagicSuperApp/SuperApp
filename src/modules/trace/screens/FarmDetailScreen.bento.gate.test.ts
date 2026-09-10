/**
 * Cổng nguồn cho LƯỚI BENTO của màn chi tiết vườn.
 *
 * ⛔ Yêu cầu từ thực địa: *"màn hình chi tiết vườn trông khá rối đối với một
 *    nông dân"*. Đi đo thì "rối" hoá ra không phải một cảm giác mơ hồ — nó là
 *    ba thứ đếm được, và bài này giữ cho cả ba đừng quay lại.
 *
 * ── 1. MỘT VIỆC, MỘT LỐI VÀO ───────────────────────────────────────────────
 * Trước bản này `onActivityUpdate` được gắn ở HAI chỗ: một biểu tượng `file-pen`
 * không nhãn trên header, và nút lớn ở thanh đáy. Hai lối vào cho một việc là
 * hai chỗ người dùng phải tự hỏi "hai cái này có khác nhau không" — và câu hỏi
 * đó tốn nhiều sức hơn cả việc bấm nhầm.
 *
 * Bài dưới đếm LỜI GẮN (`onPress={...}`), không đếm tên hàm: tên hàm còn xuất
 * hiện ở chỗ khai tham số, nên đếm tên là đếm nhầm.
 *
 * ── 2. Ô KHÔNG ĐƯỢC TRỘN LOẠI ──────────────────────────────────────────────
 * Dải cũ (`statsBanner`) có ba ô trông ngang hàng: "cây", "quả dự kiến", và
 * "điểm GPS (nhấn xem)". Hai cái đầu là THÔNG TIN, cái thứ ba là NÚT — và nhãn
 * của nó phải xuống dòng để tự giải thích rằng mình bấm được. Một ô phải tự nói
 * được nó là gì mà không cần chú thích trong ngoặc.
 *
 * ── 3. SỐ ƯỚC TÍNH PHẢI TỰ KHAI LÀ ƯỚC TÍNH ────────────────────────────────
 * `totalFruits` là tổng `fruitCount` cộng dồn — một con số suy ra, không phải
 * số đếm được. Trước bản này nó hiện y hệt số cây. Một con số không nói mình là
 * ước tính là một con số sẽ bị mang đi dùng như số thật.
 *
 * ── Bài này đo GÌ, và KHÔNG đo gì ──────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với hai bài `.gate.test.ts` bên cạnh và vì cùng lý
 * do: dựng cả màn này (hơn 3.000 dòng, kéo theo bản đồ + máy ảnh + native)
 * trong jest là việc khác hẳn về giá.
 *
 * Nó KHÔNG đo màn có đẹp không, và không đo lưới có xuống dòng đúng trên máy
 * hẹp không. Phép đo cuối cho hai câu đó là mở màn thật trên máy thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** Đếm số lần một chuỗi xuất hiện. */
const dem = (needle: string): number => SRC.split(needle).length - 1;

/**
 * Chỉ giữ MÃ CHẠY: bỏ chú thích khối `/* *​/` và chú thích dòng `//`.
 *
 * Cần nó cho mọi phép so "KHÔNG được chứa". Chú thích giải thích một lỗi luôn
 * NHẮC TÊN lỗi đó, nên phép so trần bắt trúng chính lời giải thích rồi kết luận
 * là lỗi còn nguyên. Đã cắn ngay ở lượt viết bài này: ca "không còn nhãn (nhấn
 * xem)" đỏ vì chuỗi ấy nằm trong khối chú thích mô tả dải ô cũ.
 *
 * ⚠ Phép lọc này KHÔNG hiểu chuỗi ký tự: một `'http://…'` trong mã sẽ bị cắt từ
 * dấu `//` trở đi. Chấp nhận được ở đây vì mọi phép so bên dưới đều là "không
 * chứa" — cắt nhầm chỉ có thể làm bài XANH oan, không làm nó đỏ oan, và các ca
 * "phải chứa" thì dùng `SRC` gốc.
 */
const MA_CHAY = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('một việc chỉ có MỘT lối vào', () => {
  it('`onActivityUpdate` được gắn đúng MỘT chỗ', () => {
    expect(dem('onPress={onActivityUpdate}')).toBe(1);
  });

  it('xem sơ đồ 3D được gắn đúng MỘT chỗ', () => {
    // Trước bản này nó nằm ở thanh đáy; nay nó là một ô Bento. Gắn cả hai chỗ là
    // quay lại đúng lỗi vừa gỡ, chỉ đổi tên việc.
    expect(dem('onPress={onView3DFarm}')).toBe(1);
  });

  it('header KHÔNG còn biểu tượng ghi hoạt động không nhãn', () => {
    // `file-pen` là biểu tượng của lối vào thứ hai đã gỡ. Một biểu tượng không
    // nhãn trên header là thứ người dùng phải bấm thử mới biết nó làm gì.
    expect(MA_CHAY).not.toContain('name="file-pen"');
  });
});

describe('ô không trộn loại, và số phụ thì thu gọn', () => {
  it('dải ba ô thống kê cũ KHÔNG quay lại', () => {
    for (const chet of ['statsBanner', 'statBannerItem', 'statBannerVal', 'statBannerLabel']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });

  it('không còn nhãn phải xuống dòng để tự giải thích mình bấm được', () => {
    // `'điểm GPS\n(nhấn xem)'` — một nhãn phải nói "nhấn xem" là một ô chưa nói
    // được nó là nút.
    expect(MA_CHAY).not.toContain('(nhấn xem)');
  });

  it('số quả tự khai là ƯỚC TÍNH, ngay cạnh con số', () => {
    const i = SRC.indexOf('totalFruits.toLocaleString');
    expect(i).toBeGreaterThan(-1);
    // Trong phạm vi cùng một khối chữ, không phải ở một chú thích cuối trang.
    expect(SRC.slice(i, i + 200)).toContain('ước tính');
  });
});

describe('dòng thời gian là Ô LỚN NHẤT, không phải phần đuôi', () => {
  it('chỉ còn MỘT chỗ vẽ dòng thời gian của vườn', () => {
    // Trước bản này nó nằm trong `ListFooterComponent`, tức phải cuộn qua cả
    // danh sách cây mới thấy — chính bản ghi GỐC của mọi việc đồng áng là thứ
    // khuất nhất màn.
    expect(dem('<EntityTimeline')).toBe(1);
  });

  it('nó nằm trong ô hero, và ô hero nằm trong phần đầu cuộn được', () => {
    expect(SRC).toContain('ListHeaderComponent={bentoHeader}');
    const hero = SRC.indexOf('<BentoTile tone="hero"');
    const timeline = SRC.indexOf('<EntityTimeline');
    const dongHeader = SRC.indexOf('const bentoHeader');
    expect(dongHeader).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(dongHeader);
    expect(timeline).toBeGreaterThan(hero);
  });
});

describe('thanh đáy còn đúng một việc', () => {
  it('hai nút đã chuyển thành ô Bento KHÔNG còn ở thanh đáy', () => {
    for (const chet of ['view3DFarmBtn', 'view3DFarmBtnText']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });

  it('vẫn giữ phép đo chiều cao — thanh mỏng đi thì ô chừa phải theo', () => {
    // Thanh vừa rút từ hai hàng xuống một. Nếu ô chừa chỗ còn là hằng gõ tay
    // (bản trước #309) thì bản này để lại một khoảng trắng bằng nửa thanh cũ.
    // Giữ lời gọi này là giữ cho hai thứ đó không lệch nhau được nữa.
    expect(SRC).toContain('height: chieuCaoThanhDay || CHUA_DO_THANH_DAY');
    expect(SRC).toContain('setChieuCaoThanhDay(');
  });
});
