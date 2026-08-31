/**
 * Theme của instance có TỚI được chỗ 90 tệp thật sự đọc không.
 *
 * Vì sao cần bài kiểm riêng: cơ chế white-label từng chạy đúng ở `getTheme()`
 * (5 tệp đọc) và câm ở alias `COLORS`/`NEUTRAL`/`NAV`/`HEADER_COLORS` (90 tệp
 * đọc, qua `StyleSheet.create` lúc import top-level). Không có phép đo nào đỏ:
 * app thứ hai chỉ dựng ra mang màu app thứ nhất.
 *
 * Nên bài kiểm này KHÔNG hỏi `getTheme()` — nó hỏi đúng các alias.
 */
import {
  COLORS,
  NEUTRAL,
  NAV,
  HEADER_COLORS,
  TRACE_THEME,
  getTheme,
  setActiveThemeConfig,
} from './index';
import { DEFAULT_THEME_CONFIG, CHECKFARM_THEME_CONFIG } from './theme.config';
import { APP_TOKENS, NAV_TOKENS, HEADER_TOKENS, NEUTRAL_TOKENS, BRAND_TOKENS } from './tokens';

afterEach(() => {
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
});

it('COLORS đổi theo instance, không phải ảnh chụp lúc nạp module', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  expect(COLORS.bg).toBe('#FAF7F0');
  expect(COLORS.accent).toBe('#23763F');
  expect(getTheme().app.bg).toBe(COLORS.bg);
});

it('NEUTRAL, NAV, HEADER_COLORS, brand cũng đổi — không chỉ mình COLORS', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  expect(NEUTRAL.text).toBe('#1A1A1A');
  expect(NAV.tabBarBorder).toBe('rgba(203, 228, 213, 0.71)');
  expect(HEADER_COLORS.bg).toBe('#174F2A');
  expect(TRACE_THEME.primary).toBe('#23763F');
});

it('nạp lại theme mặc định thì mọi khoá VỀ giá trị nền, không giữ vết', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
  expect(COLORS.bg).toBe(APP_TOKENS.bg);
  expect(COLORS.accent).toBe(APP_TOKENS.accent);
  expect(NEUTRAL.text).toBe(NEUTRAL_TOKENS.text);
  expect(NAV.tabBarBorder).toBe(NAV_TOKENS.tabBarBorder);
  expect(HEADER_COLORS.bg).toBe(HEADER_TOKENS.bg);
  expect(TRACE_THEME.primary).toBe(BRAND_TOKENS.trace.primary);
});

it('ghi đè KHÔNG được rò ngược vào bộ token nền', () => {
  setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
  expect(APP_TOKENS.bg).toBe('#ffffff');
  expect(HEADER_TOKENS.bg).toBe('#264E7E');
  expect(BRAND_TOKENS.trace.primary).toBe('#0F8A6A');
});
