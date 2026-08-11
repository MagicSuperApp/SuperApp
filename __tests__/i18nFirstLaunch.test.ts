// __tests__/i18nFirstLaunch.test.ts
//
// Ghim luồng HỎI-MỘT-LẦN: máy vừa cài thì màn đầu tiên là "Chọn ngôn ngữ";
// đã chọn rồi thì vào thẳng Đăng nhập ở mọi lần mở sau.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANG } from '../src/i18n/types';

const KEY = 'app_language_v1';

// Mỗi test nạp lại module store để mô phỏng một lần MỞ APP mới (trạng thái
// ngôn ngữ là singleton mức module).
function freshStore() {
  let mod: typeof import('../src/i18n/store');
  jest.isolateModules(() => {
    mod = require('../src/i18n/store');
  });
  return mod!;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lần mở app ĐẦU TIÊN (chưa từng chọn)', () => {
  it('hasChosenLanguage() = false và ngôn ngữ rơi về DEFAULT_LANG', async () => {
    const store = freshStore();
    await store.whenLanguageReady();
    expect(store.hasChosenLanguage()).toBe(false);
    expect(store.getLanguage()).toBe(DEFAULT_LANG);
  });

  it('mở bằng TIẾNG ANH, KHÔNG chạy theo ngôn ngữ của điện thoại', async () => {
    // Máy đặt tiếng Nhật. Trước đây store lấy luôn locale này làm ngôn ngữ đầu;
    // nay tiếng Anh là chuẩn của app nên máy nào cũng mở ra tiếng Anh, rồi màn
    // "Chọn ngôn ngữ" mới hỏi. Ghim 'en' thẳng chứ không ghim DEFAULT_LANG: bài
    // này canh CHỦ ĐÍCH (tiếng Anh) chứ không canh giá trị hằng số.
    const spy = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => ({ resolvedOptions: () => ({ locale: 'ja-JP' }) }) as never);
    try {
      const store = freshStore();
      expect(store.getLanguage()).toBe('en'); // ngay trước cả khi đọc đĩa
      await store.whenLanguageReady();
      expect(store.getLanguage()).toBe('en');
      expect(store.hasChosenLanguage()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('bấm Tiếp tục mà KHÔNG đổi gì vẫn ghi nhận là đã chọn', async () => {
    const store = freshStore();
    await store.whenLanguageReady();
    // force — đúng như LanguageSelectScreen gọi khi người dùng giữ nguyên mặc định.
    store.setLanguage(DEFAULT_LANG, true);
    expect(store.hasChosenLanguage()).toBe(true);
    expect(await AsyncStorage.getItem(KEY)).toBe(DEFAULT_LANG);
  });
});

describe('các lần mở app SAU', () => {
  it('đọc lại đúng ngôn ngữ đã lưu và KHÔNG hỏi lại', async () => {
    await AsyncStorage.setItem(KEY, 'zh');
    const store = freshStore();
    await store.whenLanguageReady();
    expect(store.hasChosenLanguage()).toBe(true);
    expect(store.getLanguage()).toBe('zh');
  });

  it('giá trị lưu hỏng → coi như chưa chọn, rơi về DEFAULT_LANG', async () => {
    await AsyncStorage.setItem(KEY, 'klingon');
    const store = freshStore();
    await store.whenLanguageReady();
    expect(store.hasChosenLanguage()).toBe(false);
    expect(store.getLanguage()).toBe(DEFAULT_LANG);
  });
});

describe('whenLanguageReady()', () => {
  it('idempotent — gọi nhiều lần chỉ đọc storage một lần', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem');
    // Mock của async-storage vốn ĐÃ là jest.fn() → spy nhận luôn lịch sử gọi của
    // các test trước trong file. Xoá sạch để chỉ đếm lần đọc của test này.
    spy.mockClear();
    const store = freshStore();
    await Promise.all([store.whenLanguageReady(), store.whenLanguageReady(), store.hydrateLanguage()]);
    expect(spy.mock.calls.filter(([k]) => k === KEY)).toHaveLength(1);
    spy.mockRestore();
  });
});
