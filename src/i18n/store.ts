// i18n/store.ts
//
// TRẠNG THÁI NGÔN NGỮ — store ngoài React (module-level) + persist AsyncStorage.
// ĐÂY LÀ NƠI DUY NHẤT giữ "app đang hiển thị ngôn ngữ nào". Nhãn nav, tab con,
// lớp tự dịch <Text> và màn Cài đặt đều đọc từ đây — hai kho trạng thái song song
// sẽ lệch nhau ngay lần đầu người dùng đổi ngôn ngữ.
//
// Vì sao KHÔNG dùng Redux: chuỗi cần dịch xuất hiện cả ở nơi KHÔNG phải component
// (service, util, alert, navigator options). `t()` phải gọi được ở mọi nơi, ĐỒNG
// BỘ, không hook — `navNational()` chẳng hạn được gọi giữa lúc render, không thể
// `await`. Component vẫn vẽ lại đúng lúc nhờ `useLanguage()` bọc
// useSyncExternalStore quanh store này.
//
// Giá trị ban đầu = DEFAULT_LANG ('en') — TIẾNG ANH cho mọi máy, KHÔNG dò locale
// (lý do đầy đủ ở `types.DEFAULT_LANG`). Đọc AsyncStorage là BẤT ĐỒNG BỘ, xong mới
// notify → mọi Text tự vẽ lại. Không chớp vì điều hướng gốc còn chờ
// `whenLanguageReady()` trước khi dựng màn đầu tiên.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANG, normalizeLangTag, type LangCode } from './types';

export const LANG_STORAGE_KEY = 'app_language_v1';

// Khoá của bản dựng trung gian (nhánh đa-ngôn-ngữ đầu tiên) — chỉ ĐỌC để không
// bắt người đã chọn ngôn ngữ ở bản đó phải chọn lại. Ghi thì luôn ghi khoá mới.
const LEGACY_STORAGE_KEY = 'app_lang_v1';

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
 *
 * Đổi giá trị và báo cho giao diện NGAY, phần ghi xuống máy chạy sau (không
 * `await`): người dùng thấy chữ đổi tức thì, đó là phản hồi họ cần.
 *
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
      const [saved, legacy] = await Promise.all([
        AsyncStorage.getItem(LANG_STORAGE_KEY),
        AsyncStorage.getItem(LEGACY_STORAGE_KEY),
      ]);
      const pick = normalizeLangTag(saved) ?? normalizeLangTag(legacy);
      if (pick) {
        chosen = true;
        if (pick !== current) current = pick;
      }
    } catch {
      /* giữ DEFAULT_LANG, coi như chưa chọn */
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

/** CHỈ dùng trong test — đặt lại trạng thái giữa các bài. */
export function __resetLanguageForTest(lang: LangCode = DEFAULT_LANG): void {
  current = lang;
  chosen = false;
  hydrated = false;
  hydration = null;
  listeners.clear();
}
