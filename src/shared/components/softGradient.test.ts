/**
 * Luật "chuyển sắc nhẹ nhàng" cho các màn NGOÀI module (Đăng nhập, Trang chủ).
 *
 * Bài này là bản song song của `modules/trace/theme/gradient.test.ts`, và nó tồn
 * tại vì cùng một lý do: yêu cầu ban đầu là một câu tiếng Việt — *"gradient nhẹ
 * nhàng như ở module Truy xuất và Trò chuyện"* — mà một câu thì không tự bảo vệ
 * được. Ai đó sẽ thấy màn hơi nhạt, kéo chặng cuối đậm thêm "một chút", rồi
 * thêm chút nữa, và tới lúc nhận ra thì nền đã ăn mất chữ.
 *
 * Khác bài bên Truy xuất ở một chỗ: bên đó các chặng là HẰNG gõ sẵn nên đo được
 * từng token. Ở đây chặng cuối do `deepen` SUY RA từ chặng đầu, mà chặng đầu là
 * màu của app đang chạy (`WORK_THEME`) hoặc của một mục trong danh mục module —
 * tức một tập mở. Nên bài này đo chính `deepen`: chứng minh tỉ lệ của nó nằm
 * dưới ngưỡng với MỌI màu đưa vào, chứ không chỉ với bảng màu hôm nay.
 */

import { deepen, tint } from './SoftGradient';

/** sRGB một kênh → tuyến tính. Công thức WCAG 2.x. */
const kenh = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Độ sáng tương đối của một màu `#rrggbb`. */
const doSang = (hex: string): number => {
  const h = hex.replace('#', '');
  return (
    0.2126 * kenh(parseInt(h.slice(0, 2), 16)) +
    0.7152 * kenh(parseInt(h.slice(2, 4), 16)) +
    0.0722 * kenh(parseInt(h.slice(4, 6), 16))
  );
};

/** Tỉ số tương phản giữa hai màu, 1 (giống hệt) … 21 (đen trên trắng). */
const tuongPhan = (a: string, b: string): number => {
  const la = doSang(a);
  const lb = doSang(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Mẫu màu để dò. Gồm CẢ các màu thật đang dùng làm chặng đầu (bốn `bgDark` của
 * danh mục module, ba màu banner, xanh nhãn hiệu) LẪN các trường hợp biên mà
 * bảng màu hôm nay chưa có: gần đen, gần trắng, bão hoà tối đa từng kênh.
 */
const MAU = [
  '#0F5132', '#421e8a', '#1F5C2A', '#C47F0D', '#2B7A39', // đang dùng thật
  '#000000', '#FFFFFF', '#010101', '#FEFEFE',            // hai đầu thang
  '#FF0000', '#00FF00', '#0000FF', '#808080', '#C0C0C0', // bão hoà / xám
];

describe('deepen — chặng cuối suy từ chặng đầu', () => {
  /**
   * NGƯỠNG 1,5 chép nguyên từ bài bên Truy xuất, để hai bộ chuyển sắc của app
   * cùng một định nghĩa "nhẹ" chứ không mỗi nơi một mức.
   */
  it('không bao giờ đẩy hai chặng lệch quá 1,5 lần, với bất kỳ màu nào', () => {
    for (const mau of MAU) {
      // Ghi kèm `mau` vào thông điệp: một lần đỏ phải nói ngay MÀU NÀO vỡ,
      // chứ không chỉ nói "1,62 không nhỏ hơn 1,5".
      const ratio = tuongPhan(mau, deepen(mau));
      expect(`${mau} → ${ratio.toFixed(2)}`).toBe(`${mau} → ${Math.min(ratio, 1.49).toFixed(2)}`);
    }
  });

  /**
   * TỐI ĐI, KHÔNG SÁNG LÊN — đây là cả lý do `deepen` tồn tại thay vì một hàm
   * `lighten`. Chữ trên các bề mặt dùng nó là chữ TRẮNG; một chặng sáng hơn là
   * hạ tương phản ở đúng nửa thẻ đó. Tối đi thì mọi vị trí trên nền đều tương
   * phản BẰNG HOẶC HƠN bản phẳng trước lượt này, nên không màn nào có thể tệ đi.
   */
  it('chặng cuối luôn tối hơn hoặc bằng chặng đầu', () => {
    for (const mau of MAU) {
      expect(doSang(deepen(mau))).toBeLessThanOrEqual(doSang(mau));
    }
  });

  /**
   * Trả NGUYÊN chuỗi khi không phải `#rrggbb`. Lúc đó hai chặng bằng nhau, tức
   * một mảng PHẲNG — vẫn là bản đang chạy, không phải một màn hỏng. Ghim lại vì
   * đó là hành vi dự phòng có chủ ý, dễ bị "sửa" thành ném lỗi.
   */
  it('bỏ qua chuỗi không phải hex 6 ký tự', () => {
    for (const x of ['rgba(0,0,0,0.5)', 'red', '#fff', '', 'transparent']) {
      expect(deepen(x)).toBe(x);
    }
  });

  it('chấp nhận hex viết hoa và có khoảng trắng thừa', () => {
    expect(deepen('  #2B7A39  ')).toBe(deepen('#2b7a39'));
  });
});

describe('tint — chặng sáng của nền trang', () => {
  /**
   * Nền trang nằm dưới TOÀN BỘ chữ của màn, nên ngưỡng ở đây chặt hơn hẳn ngưỡng
   * 1,5 của `deepen`: 1,12. Con số ấy là ranh giới giữa "mặt nền có hơi thở" và
   * "trên màn có hai vùng màu" — mà vùng thứ hai trên nền gần trắng thì đọc ra
   * vết ố, đúng lỗi vừa phải gỡ hai vệt loang tròn vì nó.
   *
   * 1,12 chứ không phải 1,10: cả dải dò dưới đây đo được cao nhất 1,117 (nền
   * trắng, nhãn `#3B6EA8`, mức 0,08 — tức mức ĐẬM NHẤT của khoảng cho phép).
   * Đặt ngưỡng ở 1,10 là bắt bài đỏ ngay với một mức vẫn còn hợp lệ.
   */
  const NEN = ['#FFFFFF', '#F7F8F7', '#FAF7F0'];
  const NHAN = ['#3B6EA8', '#2B7A39', '#23763F', '#C47F0D'];

  it('ở mức 0,04–0,08 thì không bao giờ lệch quá 1,12 lần so với nền', () => {
    for (const nen of NEN) {
      for (const nhan of NHAN) {
        for (const muc of [0.04, 0.05, 0.06, 0.07, 0.08]) {
          const ratio = tuongPhan(nen, tint(nen, nhan, muc));
          expect(`${nen}+${nhan}@${muc} → ${ratio.toFixed(2)}`).toBe(
            `${nen}+${nhan}@${muc} → ${Math.min(ratio, 1.12).toFixed(2)}`,
          );
        }
      }
    }
  });

  it('mức 0 giữ nguyên nền', () => {
    expect(tint('#FFFFFF', '#3B6EA8', 0)).toBe('#ffffff');
  });

  /**
   * `tint` phải ra HEX ĐẶC, không bao giờ ra một chuỗi có alpha — cả lý do nó
   * tồn tại thay vì một lời gọi `withAlpha`. Ghim lại vì "rút gọn" nó về
   * `withAlpha` là dựng lại đúng lỗi mảng màu neo ở góc.
   */
  it('luôn trả hex 6 ký tự đặc', () => {
    for (const nhan of NHAN) {
      expect(tint('#FFFFFF', nhan, 0.07)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('bỏ qua khi một trong hai màu không phải hex 6 ký tự', () => {
    expect(tint('#FFFFFF', 'rgba(0,0,0,0.1)', 0.07)).toBe('#FFFFFF');
    expect(tint('transparent', '#3B6EA8', 0.07)).toBe('transparent');
  });
});
