/**
 * Tương phản chữ/nền của bảng màu CheckFarm — TÍNH lại, không chép số.
 *
 * Ràng buộc gốc từ nhà CheckFarm: màu nhãn `#298A4A` đo 4,35 trên trắng và
 * 4,06 trên nền app — TRƯỢT ngưỡng WCAG AA 4,5 cho chữ cỡ thường. Nó chỉ đạt ở
 * cỡ lớn (≥24px đậm, ngưỡng 3:1). Người dùng app này phần lớn đứng ngoài nắng
 * cầm điện thoại rẻ, nên đây không phải chuyện thẩm mỹ.
 *
 * Bài kiểm tự tính tỉ số tương phản từ chính giá trị trong `CHECKFARM_THEME_CONFIG`.
 * Chép sẵn con số thì đổi một hex mà quên đổi số là bài kiểm vẫn xanh.
 */
import { CHECKFARM_THEME_CONFIG } from './theme.config';

const kenh = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const doSang = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * kenh((n >> 16) & 255) + 0.7152 * kenh((n >> 8) & 255) + 0.0722 * kenh(n & 255);
};
/** Tỉ số tương phản WCAG 2.x giữa hai màu đặc. */
const tuongPhan = (a: string, b: string): number => {
  const [x, y] = [doSang(a), doSang(b)];
  const [cao, thap] = x > y ? [x, y] : [y, x];
  return (cao + 0.05) / (thap + 0.05);
};

const AA = 4.5;
const NHAN = '#298A4A';
const app = CHECKFARM_THEME_CONFIG.app!;
const nen = [app.bg!, '#FFFFFF', app.card ?? '#FFFFFF'];

it('công thức tự kiểm — số phải khớp bảng nhà CheckFarm gửi', () => {
  expect(tuongPhan(NHAN, '#FFFFFF')).toBeCloseTo(4.35, 2);
  expect(tuongPhan('#23763F', '#FFFFFF')).toBeCloseTo(5.62, 2);
  expect(tuongPhan('#174F2A', '#FFFFFF')).toBeCloseTo(9.6, 2);
});

it('mọi token CHỮ đạt AA trên mọi nền của app', () => {
  const chu = {
    text: app.text!,
    textSub: app.textSub!,
    textMuted: app.textMuted!,
    accent: app.accent!,
    accentDeep: app.accentDeep!,
    warning: app.warning!,
  };
  const truot = Object.entries(chu).flatMap(([ten, mau]) =>
    nen.filter((b) => tuongPhan(mau, b) < AA).map((b) => `${ten} ${mau} trên ${b} = ${tuongPhan(mau, b).toFixed(2)}`),
  );
  expect(truot).toEqual([]);
});

it('màu nhãn KHÔNG được đặt vào token chữ nào', () => {
  const chuaNhan = Object.entries(app)
    .filter(([ten]) => /^(text|textSub|textMuted|accent|accentDeep|warning|borderFocus)$/.test(ten))
    .filter(([, mau]) => String(mau).toUpperCase() === NHAN)
    .map(([ten]) => ten);
  expect(chuaNhan).toEqual([]);
  // và lý do: chính nó trượt ngưỡng trên cả hai nền.
  expect(tuongPhan(NHAN, app.bg!)).toBeLessThan(AA);
  expect(tuongPhan(NHAN, '#FFFFFF')).toBeLessThan(AA);
});

it('chữ trắng trên nền đặc — nút chính và thanh trên', () => {
  // nút chính lấy `accent` chứ không lấy màu nhãn: trắng trên #298A4A chỉ 4,35.
  expect(tuongPhan('#FFFFFF', app.accent!)).toBeGreaterThanOrEqual(AA);
  expect(tuongPhan('#FFFFFF', CHECKFARM_THEME_CONFIG.header!.bg!)).toBeGreaterThanOrEqual(AA);
});
