/**
 * Module Truy xuất phải MANG MÀU CỦA APP ĐANG CHẠY, không mang màu của app đầu tiên.
 *
 * ── Vì sao bài này đo HÀNH VI, không đo mã nguồn ───────────────────────────
 * `theme/hexNhanDien.test.ts` dựng tập màu cần canh TỪ `theme/tokens.ts`, nên
 * nó không thể nhìn thấy một bảng nằm ngoài `tokens.ts`. Đó là đúng chỗ lỗi đã
 * đi qua: `depth.ts` giữ ba sắc xanh riêng (`#166e43` / `#11563a` / `#DDF3EC`),
 * 0 lần xuất hiện trong `tokens.ts`, nên phép kiểm xanh và không canh gì.
 *
 * Bài này hỏi câu duy nhất mà phép so giá trị không hỏi được: **đổi instance
 * thì màu module CÓ đổi theo không?** Một bảng song song, dù mang màu gì, cũng
 * trả lời SAI câu đó.
 *
 * Hai cực bắt buộc, và chúng là lý do bài này có nghĩa:
 *   · đặt theme CheckFarm ⟹ `TONE.primary` phải RA màu CheckFarm
 *   · đặt lại theme mặc định ⟹ nó phải VỀ màu nền
 * Thiếu cực thứ hai thì một hằng gõ cứng bằng đúng màu CheckFarm cũng xanh.
 */
import { setActiveThemeConfig } from '../../../theme';
import { CHECKFARM_THEME_CONFIG, DEFAULT_THEME_CONFIG } from '../../../theme/theme.config';
import { BRAND_TOKENS } from '../../../theme/tokens';
import { GRADIENT, NATURE, TONE } from './depth';

afterEach(() => {
  setActiveThemeConfig(DEFAULT_THEME_CONFIG);
});

/** Màu nhãn của CheckFarm, lấy TỪ chính cấu hình của họ — không gõ lại ở đây. */
const CF = CHECKFARM_THEME_CONFIG.brand!.trace!;

it('hai instance phải khai hai màu KHÁC nhau, nếu không bài dưới vô nghĩa', () => {
  expect(CF.primary).toBeDefined();
  expect(CF.primary).not.toBe(BRAND_TOKENS.trace.primary);
  expect(CF.primaryDeep).not.toBe(BRAND_TOKENS.trace.primaryDeep);
});

describe('màu chủ đạo của module đi theo instance', () => {
  it('đặt theme CheckFarm → `TONE` ra màu CheckFarm', () => {
    setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
    expect(TONE.primary).toBe(CF.primary);
    expect(TONE.primaryDeep).toBe(CF.primaryDeep);
    expect(TONE.primarySoft).toBe(CF.primaryLight);
  });

  it('`NATURE` — tên cũ, cùng nguồn mới', () => {
    setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
    expect(NATURE.leaf).toBe(CF.primary);
    expect(NATURE.leafDeep).toBe(CF.primaryDeep);
    expect(NATURE.leafSoft).toBe(CF.primaryLight);
  });

  it('chuyển sắc cũng theo, không chụp giá trị lúc nạp module', () => {
    // `GRADIENT.action` và `GRADIENT.hero` dựng từ màu nhãn. Một đối tượng chụp
    // sẵn lúc `import` sẽ đứng im ở màu app đầu tiên, mà vẫn trông đúng kiểu.
    setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
    expect(GRADIENT.action.from).toBe(CF.primary);
    expect(GRADIENT.action.to).toBe(CF.primaryDeep);
    expect(GRADIENT.hero.to).toBe(CF.primaryLight);
  });

  it('về theme mặc định thì màu VỀ theo — không giữ vết', () => {
    setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
    setActiveThemeConfig(DEFAULT_THEME_CONFIG);
    expect(TONE.primary).toBe(BRAND_TOKENS.trace.primary);
    expect(TONE.primaryDeep).toBe(BRAND_TOKENS.trace.primaryDeep);
    expect(GRADIENT.action.from).toBe(BRAND_TOKENS.trace.primary);
  });
});

describe('màu MINH HOẠ của module thì KHÔNG đổi theo app', () => {
  it('`moss` / `sun` / `water` / `bark` đứng yên qua hai instance', () => {
    // Chúng mang nghĩa nghề vườn (hoạ tiết lá, quả chín, nước mưa, chữ), không
    // mang nhãn hiệu. Cho chúng đổi theo app là đổi NGHĨA, không phải đổi hình
    // thức — và lúc đó một app khai tông cam sẽ có "nước mưa" màu cam.
    const before = [NATURE.moss, NATURE.sun, NATURE.water, NATURE.bark, NATURE.paper];
    setActiveThemeConfig(CHECKFARM_THEME_CONFIG);
    expect([NATURE.moss, NATURE.sun, NATURE.water, NATURE.bark, NATURE.paper]).toEqual(before);
  });
});
