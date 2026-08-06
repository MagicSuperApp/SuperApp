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
  onNationalLanguageChange,
} from './languages';
import { LANG_STORAGE_KEY, setLanguage } from './store';
import { NAV_FRAME } from '../navigation/navLabels';
import { SUBHOME_FRAME } from '../navigation/subHomeLabels';

beforeEach(() => {
  (AsyncStorage as unknown as { __clear: () => void }).__clear();
  // Đặt lại về mặc định qua ĐÚNG kho đang dùng (`store.ts`) — `languages.ts` không còn
  // giữ trạng thái riêng nên cũng không còn hàm reset riêng.
  setLanguage(DEFAULT_LANG, true);
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

// Nhóm này canh đúng MỘT lỗi, và là lỗi đã thật sự xảy ra ngày 05/08: hai hệ đa ngôn
// ngữ vào `develop` cách nhau 3 phút, mỗi hệ một kho AsyncStorage riêng
// (`app_lang_v1` vs `app_language_v1`). Hậu quả trên máy thật: đổi ngôn ngữ ở Cài đặt
// thì chữ trong màn đổi, nhãn thanh điều hướng KHÔNG đổi. `tsc` không thấy được.
describe('ngôn ngữ quốc gia đọc CHUNG một kho với hệ dịch', () => {
  it('đổi ngôn ngữ là ghi vào ĐÚNG kho của store.ts, không phải kho thứ hai', () => {
    setNationalLanguage('ja');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(LANG_STORAGE_KEY, 'ja');
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('app_lang_v1', 'ja');
    expect(getNationalLanguage()).toBe('ja');
  });

  it('đặt ngôn ngữ qua store thì bên nhãn điều hướng thấy ngay', () => {
    setLanguage('zh');
    expect(getNationalLanguage()).toBe('zh');
  });

  it('app đang là TIẾNG ANH → không có ngôn ngữ quốc gia nào (null, không rơi về vi)', () => {
    setLanguage('en');
    expect(getNationalLanguage()).toBeNull();
  });

  it('báo cho người nghe khi đổi, và huỷ đăng ký thì thôi báo', () => {
    let count = 0;
    const off = onNationalLanguageChange(() => {
      count += 1;
    });
    setNationalLanguage('zh');
    setNationalLanguage('ja');
    off();
    setNationalLanguage('vi');
    expect(count).toBe(2);
  });

  it('ghi đĩa hỏng vẫn đổi được ngôn ngữ trong phiên này', () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('đầy đĩa'));
    setNationalLanguage('zh');
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
