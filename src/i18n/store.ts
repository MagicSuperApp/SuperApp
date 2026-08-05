// i18n/store.ts
//
// TRẠNG THÁI NGÔN NGỮ — store ngoài React (module-level) + persist AsyncStorage.
//
// Vì sao KHÔNG dùng Redux: chuỗi cần dịch xuất hiện cả ở nơi KHÔNG phải component
// (service, util, alert, navigator options). `t()` phải gọi được ở mọi nơi, đồng
// bộ, không hook. Component vẫn re-render đúng lúc nhờ `useLanguage()` bọc
// useSyncExternalStore quanh store này.
//
// Đọc AsyncStorage là BẤT ĐỒNG BỘ → lúc app vừa khởi động ngôn ngữ tạm là
// DEFAULT_LANG, khi đọc xong sẽ notify → mọi Text tự vẽ lại. Không chớp vì đọc
// AsyncStorage thường < 50ms và điều hướng gốc còn chờ `whenLanguageReady()`
// trước khi dựng màn đầu tiên.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANG, isLangCode, type LangCode } from './types';

export const LANG_STORAGE_KEY = 'app_language_v1';

let current: LangCode = DEFAULT_LANG;
let hydrated = false;
// Người dùng ĐÃ tự chọn ngôn ngữ bao giờ chưa. Máy vừa cài = chưa → hiện màn
// "Chọn ngôn ngữ" trước cả màn Đăng nhập (xem screens/LanguageSelectScreen).
let chosen = false;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* một listener lỗi không được chặn các listener còn lại */
    }
  });
};

export function getLanguage(): LangCode {
  return current;
}

/** Đã đọc xong lựa chọn đã lưu chưa (để màn Cài đặt không nháy giá trị mặc định). */
export function isHydrated(): boolean {
  return hydrated;
}

/**
 * Người dùng đã từng CHỌN ngôn ngữ chưa (dù chọn ở màn đầu hay ở Cài đặt).
 * false = máy vừa cài → điều hướng vào màn "Chọn ngôn ngữ" trước Đăng nhập.
 * Chỉ có nghĩa SAU khi `whenLanguageReady()` resolve.
 */
export function hasChosenLanguage(): boolean {
  return chosen;
}

/**
 * Đổi ngôn ngữ + lưu lại. Gọi từ popup/màn chọn ngôn ngữ.
 * `force` = ghi nhận "đã chọn" ngay cả khi trùng ngôn ngữ đang dùng (người dùng
 * bấm xác nhận đúng ngôn ngữ mặc định ở màn đầu — vẫn tính là đã chọn).
 */
export function setLanguage(lang: LangCode, force = false): void {
  const same = lang === current;
  if (same && chosen && !force) return;
  current = lang;
  chosen = true;
  if (!same) notify();
  AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {
    /* mất persist thì phiên sau hỏi lại — không chặn UI */
  });
}

/**
 * Nạp lựa chọn đã lưu. Gọi MỘT lần lúc khởi động (src/i18n/install.ts).
 * Idempotent: gọi lại trả đúng promise cũ (dùng cho `whenLanguageReady`).
 */
export function hydrateLanguage(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY);
      if (isLangCode(saved)) {
        chosen = true;
        if (saved !== current) current = saved;
      }
    } catch {
      /* giữ mặc định 'vi', coi như chưa chọn */
    } finally {
      hydrated = true;
      notify();
    }
  })();
  return hydration;
}

/** Chờ đọc xong lựa chọn đã lưu — điều hướng gốc dùng để chọn màn đầu tiên. */
export function whenLanguageReady(): Promise<void> {
  return hydrateLanguage();
}

/** Đăng ký lắng nghe đổi ngôn ngữ. Trả hàm huỷ đăng ký (hợp đồng useSyncExternalStore). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
