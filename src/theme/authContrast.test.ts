/**
 * Cửa vào (đăng ký / đăng nhập) — màu phải ĐỔI THEO APP và phải qua AA.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Tới 2026-09-11 bảng màu luồng vào là một object gõ cứng ở
 * `features/auth/theme.ts` (`AUTH_BLUE`), đứng NGOÀI tầng chủ đề. Bốn màn cửa
 * vào đọc thẳng nó, nên bản CheckFarm — đã xanh lục ở mọi màn khác — vẫn xanh
 * LAM ở đúng quãng người dùng gặp đầu tiên. Không bài kiểm nào đỏ:
 * `instanceThemeReach.test.ts` hỏi các alias `COLORS`/`NAV`/`HEADER_COLORS`, mà
 * bảng này không đi qua alias nào; `hexNhanDien.test.ts` chỉ canh giá trị TRÙNG
 * token nhận diện, mà dải lam này không trùng giá trị nào.
 *
 * ── Hai vế, và vế thứ hai mới là vế khó ─────────────────────────────────────
 * (1) tương phản: TÍNH lại từ chính giá trị trong bảng, không chép số.
 * (2) PHÂN BIỆT ĐƯỢC HAI APP: một bài chạy xanh y hệt cho cả hai app thì nó
 *     không kiểm gì. Nên bài dưới đòi hai bảng phải KHÁC nhau ở các vai màu, và
 *     đòi `setActiveThemeConfig` thật sự đẩy được giá trị tới alias mà bốn màn
 *     đọc — chứ không chỉ tới `getTheme()`.
 */
import { AUTH_BLUE, AUTH_WARN } from '../features/auth/theme';

import { AUTH_COLORS, setActiveThemeConfig } from './index';
import { CHECKFARM_THEME_CONFIG, DEFAULT_THEME_CONFIG } from './theme.config';
import { AUTH_TOKENS } from './tokens';

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
/** Tỉ số tương phản WCAG 2.x giữa hai màu ĐẶC. */
const contrastRatio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

const AA = 4.5;
/** Ngưỡng cho thành phần KHÔNG phải chữ (biểu tượng, viền) — WCAG 1.4.11. */
const AA_GRAPHIC = 3;

afterEach(() => {
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
});

it('công thức tự kiểm — đối chiếu với ba số tính tay', () => {
  // Không có mục này thì mọi mục dưới xanh y hệt khi công thức trả hằng số.
  expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  expect(contrastRatio('#2C5BC4', '#FFFFFF')).toBeCloseTo(6.18, 2);
  expect(contrastRatio('#23763F', '#FFFFFF')).toBeCloseTo(5.62, 2);
});

it('bậc chữ nhạt nhất của bản mặc định KHÔNG còn là giá trị đã trượt', () => {
  // `#8A95A8` là giá trị cũ: 2,81 trên `bgSoft`, 3,02 trên thẻ trắng — dưới AA ở
  // CẢ HAI nền nó đứng lên. Ghim cả giá trị lẫn LÝ DO, để lần sau ai định trả nó
  // về thì thấy ngay con số.
  expect(contrastRatio('#8A95A8', AUTH_TOKENS.bgSoft)).toBeLessThan(AA);
  expect(AUTH_TOKENS.textMuted).not.toBe('#8A95A8');
});

describe.each([
  ['mặc định (Aladin)', DEFAULT_THEME_CONFIG],
  ['CheckFarm', CHECKFARM_THEME_CONFIG],
])('bảng cửa vào — %s', (_ten, config) => {
  beforeEach(() => {
    setActiveThemeConfig(config);
  });

  it('mọi bậc CHỮ đạt AA trên cả nền màn lẫn thẻ trắng', () => {
    const backdrops = [AUTH_COLORS.bgSoft, AUTH_COLORS.white];
    const textRoles = {
      text: AUTH_COLORS.text,
      textSub: AUTH_COLORS.textSub,
      textMuted: AUTH_COLORS.textMuted,
      // `primary` xuất hiện 28 lần trong bốn màn cửa vào, và trong đó có chỗ
      // dùng làm MÀU CHỮ (`SignUpBiometricScreen.tsx:516,561`) chứ không chỉ
      // làm nền nút — nên nó phải qua ngưỡng chữ, không phải ngưỡng hình.
      primary: AUTH_COLORS.primary,
      deep: AUTH_COLORS.deep,
    };
    const failed = Object.entries(textRoles).flatMap(([role, color]) =>
      backdrops
        .filter((bg) => contrastRatio(color, bg) < AA)
        .map((bg) => `${role} ${color} trên ${bg} = ${contrastRatio(color, bg).toFixed(2)}`),
    );
    expect(failed).toEqual([]);
  });

  it('chữ trắng trên nút chính đạt AA', () => {
    expect(contrastRatio(AUTH_COLORS.white, AUTH_COLORS.primary)).toBeGreaterThanOrEqual(AA);
  });

  it('khối cảnh báo — chữ đạt AA, dấu hiệu đạt ngưỡng phi-chữ', () => {
    expect(contrastRatio(AUTH_WARN.text, AUTH_WARN.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(AUTH_WARN.icon, AUTH_WARN.bg)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('hai bậc chữ phụ không rơi về cùng một giá trị', () => {
    expect(AUTH_COLORS.textMuted).not.toBe(AUTH_COLORS.textSub);
  });
});

it('ĐỔI THEO APP — bảng CheckFarm khác bảng mặc định ở mọi vai màu chính', () => {
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
  const base = { ...AUTH_COLORS };
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  const farm = { ...AUTH_COLORS };

  const same = (['deep', 'primary', 'pale', 'bgSoft', 'border', 'text', 'textSub', 'textMuted'] as const)
    .filter((k) => base[k] === farm[k]);
  expect(same).toEqual([]);
});

it('alias bốn màn ĐANG đọc cũng đổi theo — không chỉ `getTheme()`', () => {
  // `AUTH_BLUE` là thứ `SignUpBiometricScreen` & bạn của nó nhập, và chúng đọc
  // nó ở top-level `StyleSheet.create`. Hỏi đúng nó, không hỏi một lối khác.
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  expect(AUTH_BLUE.primary).toBe('#23763F');
  expect(AUTH_BLUE.bgSoft).toBe('#FAF7F0');
  expect(AUTH_WARN.icon).toBe('#9C4A1C');
});

it('nạp lại bảng mặc định thì mọi khoá VỀ giá trị nền, không giữ vết', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
  (Object.keys(AUTH_TOKENS) as Array<keyof typeof AUTH_TOKENS>).forEach((k) => {
    expect(AUTH_COLORS[k]).toBe(AUTH_TOKENS[k]);
  });
});

it('ghi đè KHÔNG rò ngược vào bộ token nền', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  expect(AUTH_TOKENS.primary).toBe('#2C5BC4');
  expect(AUTH_TOKENS.bgSoft).toBe('#F4F7FB');
});
