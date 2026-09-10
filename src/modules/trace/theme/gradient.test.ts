/**
 * "Chuyển sắc organic NHẸ NHÀNG" — biến một chữ về gu thành hai con số.
 *
 * Yêu cầu ban đầu là một câu tiếng Việt: *"thiết kế có thể có chút gradient
 * organic nhẹ nhàng"*. Câu đó không tự bảo vệ được. Sáu tháng nữa ai đó thấy
 * màn hơi nhạt, kéo chặng dưới đậm thêm một chút, rồi thêm chút nữa — mỗi lần
 * đều "chỉ một chút", không lần nào có gì đỏ, và tới lúc người ta nhận ra thì
 * nền đã ăn mất chữ ngoài nắng.
 *
 * Bài này ghim hai điều, cả hai đều ĐO ĐƯỢC:
 *
 *   1. NHẸ = hai chặng của một chuyển sắc phải gần nhau. Ngưỡng 1,5 lần tỉ số
 *      tương phản. Sáu token hiện tại nằm trong khoảng 1,04–1,39, nên ngưỡng này
 *      không phải một con số vừa khít — nó còn chỗ cho một token mới hợp lệ, mà
 *      vẫn chặn được một chuyển sắc "từ trắng xuống xanh đậm".
 *
 *   2. onDark KHÔNG ĐƯỢC NÓI DỐI. `onDark` là thứ nơi dùng tin để chọn màu chữ
 *      (xem `BentoTile`). Khai sai một chữ ở đây là chữ trắng trên nền trắng —
 *      ở CHỖ TỆ NHẤT của nền, không phải trung bình.
 *
 * ── Vì sao đo ở CHẶNG tệ nhất chứ không đo trung bình ───────────────────────
 * Nền chuyển sắc có chỗ sáng chỗ tối, chữ thì một màu. Người đọc không đọc
 * trung bình — họ đọc từng chữ cái, và chữ cái nằm ở chỗ tệ nhất là chữ cái mất
 * trước. Nên chữ SÁNG đo trên chặng SÁNG nhất, chữ TỐI đo trên chặng TỐI nhất.
 *
 * Ngưỡng 4,5:1 là mức AA của WCAG cho chữ cỡ thường. Chọn mức cho chữ NHỎ chứ
 * không chọn mức nới cho chữ lớn (3:1), vì nhãn trong ô Bento là chữ nhỏ, và
 * người dùng là nhà vườn trên 40 tuổi cầm máy giữa nắng.
 */

import { GRADIENT, NATURE, type GradientToken } from './depth';

/** sRGB một kênh → tuyến tính. Công thức WCAG 2.x. */
const kenh = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Độ sáng tương đối của một màu `#rrggbb`. */
const doSang = (hex: string): number => {
  const h = hex.replace('#', '');
  // Ghi rõ vì đây là chỗ một token viết tắt `#fff` sẽ lọt qua mà ra số sai:
  // bài kiểm ngay dưới chặn hình dạng trước, nên hàm này chỉ nhận 6 ký tự.
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * kenh(r) + 0.7152 * kenh(g) + 0.0722 * kenh(b);
};

/** Tỉ số tương phản giữa hai màu, 1 (giống hệt) … 21 (đen trên trắng). */
const tuongPhan = (a: string, b: string): number => {
  const la = doSang(a);
  const lb = doSang(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const cacToken = Object.entries(GRADIENT) as Array<[string, GradientToken]>;

describe('token chuyển sắc — hình dạng', () => {
  it.each(cacToken)('`%s` có đủ bốn phần và màu đúng dạng #rrggbb', (_ten, g) => {
    // 6 ký tự, không chấp nhận `#fff`: `doSang` cắt theo vị trí nên bản viết tắt
    // ra một con số sai mà không ném — sai im lặng ngay trong chính phép đo.
    expect(g.from).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(g.to).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(Number.isFinite(g.angle)).toBe(true);
    expect(typeof g.onDark).toBe('boolean');
  });
});

describe('NHẸ là một con số, không phải một cảm giác', () => {
  it.each(cacToken)('`%s` — hai chặng lệch nhau dưới 1,5 lần', (_ten, g) => {
    expect(tuongPhan(g.from, g.to)).toBeLessThanOrEqual(1.5);
  });
});

describe('`onDark` phải khớp độ sáng THẬT của token', () => {
  // Chữ sáng và chữ tối mà nơi dùng thật sự vẽ ra (xem `BentoStat`).
  const CHU_SANG = NATURE.paper;
  const CHU_TOI = NATURE.bark;

  it.each(cacToken)('`%s` — chữ theo `onDark` đọc được ở chặng TỆ NHẤT', (_ten, g) => {
    const sangNhat = doSang(g.from) >= doSang(g.to) ? g.from : g.to;
    const toiNhat = doSang(g.from) < doSang(g.to) ? g.from : g.to;

    if (g.onDark) {
      // Chữ trắng: chỗ tệ nhất là chặng SÁNG nhất của nền.
      expect(tuongPhan(CHU_SANG, sangNhat)).toBeGreaterThanOrEqual(4.5);
    } else {
      // Chữ tối: chỗ tệ nhất là chặng TỐI nhất của nền.
      expect(tuongPhan(CHU_TOI, toiNhat)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('phép đo này có thật sự bắt được lỗi không', () => {
    // Đối chứng cho chính bài trên. Không có ca này thì một hàm `tuongPhan` luôn
    // trả 21 vẫn cho toàn bộ bài trên xanh, và cổng thành đồ trang trí.
    //
    // Ca đúng thứ sẽ xảy ra ngoài đời: ai đó thêm một token nền tối rồi quên đặt
    // `onDark`, nên nơi dùng vẽ chữ tối lên nó.
    const khaiSai: GradientToken = { from: '#166e43', to: '#11563a', angle: 135, onDark: false };
    const toiNhat = doSang(khaiSai.from) < doSang(khaiSai.to) ? khaiSai.from : khaiSai.to;
    expect(tuongPhan(NATURE.bark, toiNhat)).toBeLessThan(4.5);
  });
});
