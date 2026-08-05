// Test cho seam ngôn ngữ.
//
// Canh ba thứ dễ hỏng âm thầm:
//  1. Thẻ ngôn ngữ máy có đủ dạng (`zh-Hans-CN`, `ja_JP`, `VI`) — nhận sai thì người
//     dùng Trung/Nhật mở app ra thấy tiếng Việt và không hiểu vì sao.
//  2. Thiếu nhãn cho một ngôn ngữ — rơi về tiếng Anh, chỉ phát hiện sau khi phát hành.
//  3. Kho cài đặt hỏng thì phải rơi về mặc định, KHÔNG được ném lúc khởi động.

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      __clear: () => {
        store = {};
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUPPORTED_LANGS,
  LANG_ENDONYM,
  DEFAULT_LANG,
  normalizeLangTag,
  getNationalLanguage,
  setNationalLanguage,
  loadNationalLanguage,
  onNationalLanguageChange,
  __resetLanguageForTest,
} from './languages';
import { NAV_FRAME } from '../navigation/navLabels';
import { SUBHOME_FRAME } from '../navigation/subHomeLabels';

beforeEach(() => {
  (AsyncStorage as unknown as { __clear: () => void }).__clear();
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
  ])('nhận %s → %s', (input, want) => {
    expect(normalizeLangTag(input)).toBe(want);
  });

  it.each([['en'], ['en-US'], ['th'], ['fr'], [''], ['   '], [null], [undefined]])(
    'trả null cho %s (không hỗ trợ)',
    input => {
      expect(normalizeLangTag(input as string | null)).toBeNull();
    },
  );

  it('KHÔNG nhận tiếng Anh — tiếng Anh là chuẩn, không phải một lựa chọn quốc gia', () => {
    expect(normalizeLangTag('en-GB')).toBeNull();
    expect(SUPPORTED_LANGS).not.toContain('en' as never);
  });
});

describe('nhớ và đổi ngôn ngữ', () => {
  it('chưa chọn bao giờ thì loadNationalLanguage giữ nguyên giá trị đang có', async () => {
    expect(await loadNationalLanguage()).toBe(DEFAULT_LANG);
  });

  it('nhớ lựa chọn và nạp lại được ở lần mở sau', async () => {
    await setNationalLanguage('ja');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('app_lang_v1', 'ja');

    __resetLanguageForTest(); // giả lập mở lại app
    expect(getNationalLanguage()).toBe(DEFAULT_LANG);
    expect(await loadNationalLanguage()).toBe('ja');
  });

  it('báo cho người nghe khi đổi, và huỷ đăng ký thì thôi báo', async () => {
    const seen: string[] = [];
    const off = onNationalLanguageChange(l => seen.push(l));
    await setNationalLanguage('zh');
    await setNationalLanguage('ja');
    off();
    await setNationalLanguage('vi');
    expect(seen).toEqual(['zh', 'ja']);
  });

  it('đặt lại đúng ngôn ngữ đang dùng thì không báo thừa', async () => {
    const seen: string[] = [];
    onNationalLanguageChange(l => seen.push(l));
    await setNationalLanguage(DEFAULT_LANG);
    expect(seen).toEqual([]);
  });

  it('mã không hỗ trợ bị bỏ qua, không đổi gì', async () => {
    await setNationalLanguage('en' as never);
    expect(getNationalLanguage()).toBe(DEFAULT_LANG);
  });

  it('kho cài đặt hỏng KHÔNG làm ném lúc khởi động', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('kho hỏng'));
    await expect(loadNationalLanguage()).resolves.toBe(DEFAULT_LANG);
  });

  it('ghi đĩa hỏng vẫn đổi được ngôn ngữ trong phiên này', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('đầy đĩa'));
    await setNationalLanguage('zh');
    expect(getNationalLanguage()).toBe('zh');
  });
});

describe('nhãn phải đủ cho MỌI ngôn ngữ hỗ trợ', () => {
  it('mỗi ngôn ngữ có tên viết bằng chính nó', () => {
    for (const code of SUPPORTED_LANGS) {
      expect(LANG_ENDONYM[code]).toBeTruthy();
    }
  });

  it('NAV_FRAME: không route nào thiếu nhãn ở bất kỳ ngôn ngữ nào', () => {
    const thieu: string[] = [];
    for (const [route, frame] of Object.entries(NAV_FRAME)) {
      for (const code of SUPPORTED_LANGS) {
        if (!frame.national[code]?.trim()) thieu.push(`${route}.${code}`);
      }
    }
    expect(thieu).toEqual([]);
  });

  it('SUBHOME_FRAME: không tab con nào thiếu nhãn ở bất kỳ ngôn ngữ nào', () => {
    const thieu: string[] = [];
    for (const [app, tabs] of Object.entries(SUBHOME_FRAME)) {
      for (const tab of tabs) {
        for (const code of SUPPORTED_LANGS) {
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
