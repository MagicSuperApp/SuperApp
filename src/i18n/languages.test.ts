// i18n/languages.test.ts
//
// Canh SEAM NGÔN NGỮ: chuẩn hoá thẻ BCP-47, dò ngôn ngữ máy, nhớ lựa chọn, báo
// cho giao diện vẽ lại, và — quan trọng nhất — KHÔNG nhãn nav nào bị bỏ sót ở
// một ngôn ngữ (thứ chỉ lộ ra sau khi phát hành).
//
// LỊCH SỬ: bài này viết cho `src/i18n/languages.ts` — một kho trạng thái ngôn ngữ
// RIÊNG (khoá `app_lang_v1`, chỉ vi·zh·ja) chạy song song với `i18n/store.ts`
// (khoá `app_language_v1`, lớp tự dịch toàn app). Hai kho = người dùng đổi ngôn
// ngữ ở Cài đặt thì nhãn nav không đổi theo. Đã gộp về MỘT kho (`store.ts`);
// bài test giữ nguyên ý đồ, chỉ trỏ sang API hợp nhất:
//   · `SUPPORTED_LANGS` nay CÓ 'en' — app dịch được toàn bộ giao diện nên tiếng
//     Anh là lựa chọn ngang hàng. Danh sách "ngôn ngữ quốc gia" (dòng dưới ô tab,
//     không gồm 'en') tách ra thành `NATIONAL_LANGS`.
//   · `setNationalLanguage` → `setLanguage` (đồng bộ; ghi đĩa chạy nền).
//   · `loadNationalLanguage` → `hydrateLanguage` / `whenLanguageReady`.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SUPPORTED_LANGS,
  NATIONAL_LANGS,
  LANG_ENDONYM,
  DEFAULT_LANG,
  normalizeLangTag,
  detectDeviceLang,
  isLangCode,
  type LangCode,
} from './types';
import {
  getLanguage,
  setLanguage,
  hasChosenLanguage,
  hydrateLanguage,
  subscribe,
  __resetLanguageForTest,
  LANG_STORAGE_KEY,
} from './store';
import { NAV_FRAME } from '../navigation/navLabels';
import { SUBHOME_FRAME } from '../navigation/subHomeLabels';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetLanguageForTest();
  jest.clearAllMocks();
});

describe('normalizeLangTag', () => {
  it.each([
    ['vi', 'vi'],
    ['vi-VN', 'vi'],
    ['zh', 'zh'],
    ['zh-Hans-CN', 'zh'],
    ['zh_TW', 'zh'],
    ['ja', 'ja'],
    ['ja_JP', 'ja'],
    ['JA-JP', 'ja'],
    ['  VI  ', 'vi'],
    ['en-GB', 'en'],
  ])('nhận %s → %s', (input, want) => {
    expect(normalizeLangTag(input)).toBe(want);
  });

  it.each([['th'], ['fr'], ['ko'], [''], ['   '], [null], [undefined]])(
    'trả null cho %s (không hỗ trợ)',
    (input) => {
      expect(normalizeLangTag(input as string | null)).toBeNull();
    },
  );
});

describe('detectDeviceLang', () => {
  it('trả một mã app hỗ trợ, hoặc null — không bao giờ ném', () => {
    const got = detectDeviceLang();
    expect(got === null || isLangCode(got)).toBe(true);
  });
});

describe('nhớ và đổi ngôn ngữ', () => {
  it('chưa chọn bao giờ thì hydrate giữ nguyên giá trị đang có', async () => {
    const truoc = getLanguage();
    await hydrateLanguage();
    expect(getLanguage()).toBe(truoc);
    expect(hasChosenLanguage()).toBe(false);
  });

  it('nhớ lựa chọn và nạp lại được ở lần mở sau', async () => {
    setLanguage('ja');
    expect(getLanguage()).toBe('ja');
    // Ghi đĩa chạy nền (không await) — nhường một nhịp cho nó xong.
    await Promise.resolve();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(LANG_STORAGE_KEY, 'ja');

    __resetLanguageForTest(); // giả lập mở lại app
    await hydrateLanguage();
    expect(getLanguage()).toBe('ja');
    expect(hasChosenLanguage()).toBe(true);
  });

  it('đọc được lựa chọn của bản dựng TRUNG GIAN (khoá cũ app_lang_v1)', async () => {
    // Người đã chọn ngôn ngữ ở nhánh đa-ngôn-ngữ đầu tiên không phải chọn lại.
    await AsyncStorage.setItem('app_lang_v1', 'zh');
    await hydrateLanguage();
    expect(getLanguage()).toBe('zh');
    expect(hasChosenLanguage()).toBe(true);
  });

  it('báo cho người nghe khi đổi, và huỷ đăng ký thì thôi báo', () => {
    const seen: LangCode[] = [];
    const off = subscribe(() => seen.push(getLanguage()));
    setLanguage('zh');
    setLanguage('ja');
    off();
    setLanguage('vi');
    expect(seen).toEqual(['zh', 'ja']);
  });

  it('đặt lại đúng ngôn ngữ đang dùng thì không báo thừa', () => {
    setLanguage(DEFAULT_LANG);
    const seen: LangCode[] = [];
    subscribe(() => seen.push(getLanguage()));
    setLanguage(DEFAULT_LANG);
    expect(seen).toEqual([]);
  });

  it('kho cài đặt hỏng KHÔNG làm ném lúc khởi động', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('kho hỏng'));
    await expect(hydrateLanguage()).resolves.toBeUndefined();
    expect(isLangCode(getLanguage())).toBe(true);
  });

  it('ghi đĩa hỏng vẫn đổi được ngôn ngữ trong phiên này', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('đầy đĩa'));
    setLanguage('zh');
    expect(getLanguage()).toBe('zh');
  });
});

describe('nhãn phải đủ cho MỌI ngôn ngữ hỗ trợ', () => {
  it('danh sách ngôn ngữ gồm vi · en · zh · ja', () => {
    expect([...SUPPORTED_LANGS]).toEqual(['vi', 'en', 'zh', 'ja']);
  });

  it('ngôn ngữ QUỐC GIA (dòng dưới ô tab) không gồm en — nó đã ở dòng trên', () => {
    expect(NATIONAL_LANGS).not.toContain('en' as never);
  });

  it('mỗi ngôn ngữ có tên viết bằng CHÍNH nó', () => {
    for (const code of SUPPORTED_LANGS) {
      expect(LANG_ENDONYM[code]).toBeTruthy();
    }
    expect(LANG_ENDONYM.zh).toBe('中文');
    expect(LANG_ENDONYM.ja).toBe('日本語');
  });

  it('NAV_FRAME: không route nào thiếu nhãn ở bất kỳ ngôn ngữ nào', () => {
    const thieu: string[] = [];
    for (const [route, frame] of Object.entries(NAV_FRAME)) {
      for (const code of NATIONAL_LANGS) {
        if (!frame.national[code]?.trim()) thieu.push(`${route}.${code}`);
      }
    }
    expect(thieu).toEqual([]);
  });

  it('SUBHOME_FRAME: không tab con nào thiếu nhãn ở bất kỳ ngôn ngữ nào', () => {
    const thieu: string[] = [];
    for (const [app, tabs] of Object.entries(SUBHOME_FRAME)) {
      for (const tab of tabs) {
        for (const code of NATIONAL_LANGS) {
          if (!tab.national[code]?.trim()) thieu.push(`${app}.${tab.key}.${code}`);
        }
      }
    }
    expect(thieu).toEqual([]);
  });

  it('nhãn tiếng Anh vẫn còn nguyên — tiếng Anh là chuẩn, không được bỏ', () => {
    for (const frame of Object.values(NAV_FRAME)) {
      expect(frame.en.trim()).not.toBe('');
    }
  });
});
