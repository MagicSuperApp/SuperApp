// i18n/languages.ts
//
// SEAM NGÔN NGỮ — nguồn DUY NHẤT quyết định app đang hiển thị ngôn ngữ quốc gia nào.
//
// Bối cảnh: trước bản này `LangCode` chỉ có `'vi'` và `getNationalLanguage()` trả hằng
// `'vi'` (`navLabels.ts` bản cũ). Spec SG9 §"Đa ngôn ngữ về sau" đã đặt sẵn chỗ này làm
// seam duy nhất — đây là bản hiện thực hoá nó cho **vi · zh · ja**, giữ nguyên quy ước
// anh Aladin chốt: **tiếng Anh là CHUẨN** (luôn hiển thị), ngôn ngữ quốc gia đi kèm.
//
// KHÔNG thêm phụ thuộc native (`react-native-localize`) — thêm là phải dựng lại cả hai
// nền tảng, mà khâu build vừa mới gỡ được nút thắt. Dò ngôn ngữ máy bằng `Intl` có sẵn
// trong Hermes; máy nào không có `Intl` thì rơi về mặc định, không ném.
//
// ⚠ ĐÂY LÀ HẠ TẦNG, KHÔNG PHẢI BẢN DỊCH ĐẦY ĐỦ. Nó cấp: kiểu ngôn ngữ, cách dò, cách
// nhớ lựa chọn, và cách báo cho giao diện vẽ lại. Việc dịch toàn bộ chuỗi trong `src/`
// là việc riêng — xem `Specs/SG9-Nav-Frame-and-Shell-UX.md` §5.4.

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Ngôn ngữ QUỐC GIA được hỗ trợ. Tiếng Anh KHÔNG nằm ở đây vì nó là chuẩn, luôn hiện —
 * không phải một lựa chọn ngang hàng. Thêm thị trường = thêm một mã vào đây rồi bổ sung
 * nhãn ở `NAV_FRAME` / `SUBHOME_FRAME`; TypeScript sẽ chỉ ra mọi chỗ còn thiếu.
 */
export const SUPPORTED_LANGS = ['vi', 'zh', 'ja'] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

/** Ngôn ngữ dùng khi chưa chọn và không dò được — thị trường đầu tiên. */
export const DEFAULT_LANG: LangCode = 'vi';

/**
 * Tên từng ngôn ngữ VIẾT BẰNG CHÍNH NGÔN NGỮ ĐÓ (endonym). Người đang lạc trong một
 * giao diện họ không đọc được vẫn nhận ra dòng chữ của mình — nếu ghi "Tiếng Trung"
 * thì người Trung Quốc không tìm thấy, đó là lúc họ cần nhất.
 */
export const LANG_ENDONYM: Record<LangCode, string> = {
  vi: 'Tiếng Việt',
  zh: '中文',
  ja: '日本語',
};

const STORAGE_KEY = 'app_lang_v1';

/**
 * Đổi thẻ ngôn ngữ BCP-47 bất kỳ thành `LangCode`, hoặc `null` nếu không hỗ trợ.
 * Nhận cả `vi`, `vi-VN`, `zh-Hans-CN`, `ja_JP`, `ZH`. Hàm thuần — có test canh.
 */
export function normalizeLangTag(tag: string | null | undefined): LangCode | null {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(primary)
    ? (primary as LangCode)
    : null;
}

/**
 * Ngôn ngữ máy đang đặt, hoặc `null` nếu không dò được / không hỗ trợ.
 * Bọc try/catch vì `Intl` có thể bị cắt khỏi bản dựng Hermes gọn — thiếu nó phải rơi
 * về mặc định, KHÔNG được làm sập app ngay lúc khởi động.
 */
export function detectDeviceLang(): LangCode | null {
  try {
    const locale =
      typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : null;
    return normalizeLangTag(locale);
  } catch {
    return null;
  }
}

// Giá trị hiện hành. Đọc ĐỒNG BỘ vì `navNational()` được gọi trong lúc render — không
// thể `await` ở đó. `loadNationalLanguage()` chạy một lần lúc khởi động để nạp lựa chọn
// đã nhớ; trước lúc đó dùng ngôn ngữ máy.
let current: LangCode = detectDeviceLang() ?? DEFAULT_LANG;

type Listener = (lang: LangCode) => void;
const listeners = new Set<Listener>();

/** Ngôn ngữ quốc gia hiện hành. ĐỒNG BỘ — dùng được thẳng trong render. */
export function getNationalLanguage(): LangCode {
  return current;
}

/**
 * Nạp lựa chọn đã nhớ. Gọi MỘT LẦN lúc khởi động, trước khi vẽ khung điều hướng.
 * Chưa từng chọn → giữ ngôn ngữ máy đã dò.
 */
export async function loadNationalLanguage(): Promise<LangCode> {
  try {
    const saved = normalizeLangTag(await AsyncStorage.getItem(STORAGE_KEY));
    if (saved && saved !== current) {
      current = saved;
      listeners.forEach(fn => fn(current));
    }
  } catch {
    // Kho cài đặt hỏng thì vẫn chạy bằng ngôn ngữ máy — đừng chặn khởi động.
  }
  return current;
}

/** Đổi ngôn ngữ + nhớ lại. Báo cho mọi màn đang nghe để vẽ lại ngay, không cần khởi động lại. */
export async function setNationalLanguage(lang: LangCode): Promise<void> {
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return;
  if (lang === current) return;
  current = lang;
  listeners.forEach(fn => fn(current));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Không nhớ được thì lần mở sau về mặc định — vẫn hơn là chặn thao tác vừa rồi.
  }
}

/** Nghe đổi ngôn ngữ. Trả hàm huỷ đăng ký. */
export function onNationalLanguageChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** CHỈ dùng trong test — đặt lại trạng thái giữa các bài. */
export function __resetLanguageForTest(lang: LangCode = DEFAULT_LANG): void {
  current = lang;
  listeners.clear();
}
