// i18n/languages.ts
//
// NGÔN NGỮ QUỐC GIA — lớp mỏng đặt trên `store.ts`, KHÔNG còn giữ trạng thái riêng.
//
// ⚠ LỊCH SỬ, ĐỌC TRƯỚC KHI SỬA. Ngày 05/08 hai hệ đa ngôn ngữ được trộn vào `develop`
// cách nhau 3 phút (PR #103 rồi PR #104) và mỗi hệ mang một kho riêng:
//
//     tệp này        `app_lang_v1`      + biến `current` riêng   ← ĐÃ BỎ
//     store.ts       `app_language_v1`  + biến `current` riêng   ← nguồn DUY NHẤT
//
// Hai kho tách rời nghĩa là: người dùng đổi ngôn ngữ ở Cài đặt thì mọi chữ trong màn
// đổi theo (`t()` đọc `store.ts`) nhưng nhãn thanh điều hướng thì KHÔNG, vì nhãn đọc
// kho bên này. Người dùng sẽ bấm đi bấm lại vì tưởng mình bấm hụt. Lỗi này KHÔNG hiện
// ra ở `tsc` — nó chỉ hiện trên máy thật. Nên tệp này nay chỉ còn hai thứ:
//
//   1. hàm THUẦN (`normalizeLangTag`, `detectDeviceLang`) — có test canh;
//   2. lớp chuyển tiếp về `store.ts` cho mã cũ đang gọi tên hàm bên này.
//
// KHÔNG thêm biến trạng thái nào vào tệp này nữa. Ngôn ngữ sống ở `store.ts`.

import {
  NATIONAL_LANGS,
  type LangCode as AppLangCode,
  type NationalLang,
} from './types';
import { getLanguage, setLanguage, subscribe, whenLanguageReady } from './store';

/**
 * Ngôn ngữ QUỐC GIA được hỗ trợ. Tiếng Anh KHÔNG nằm ở đây vì nó là chuẩn, luôn hiện —
 * không phải một lựa chọn ngang hàng. Thêm thị trường = thêm một mã vào `NATIONAL_LANGS`
 * (`src/i18n/types.ts`) rồi bổ sung nhãn ở `NAV_FRAME` / `SUBHOME_FRAME`; TypeScript sẽ
 * chỉ ra mọi chỗ còn thiếu.
 */
export const SUPPORTED_LANGS = NATIONAL_LANGS;

/** Giữ tên cũ cho mã đã viết; nghĩa là "ngôn ngữ quốc gia", không gồm tiếng Anh. */
export type LangCode = NationalLang;

/** Ngôn ngữ quốc gia dùng khi chưa chọn và không dò được — thị trường đầu tiên. */
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

/**
 * Ngôn ngữ quốc gia hiện hành, hoặc `null` khi app đang đặt TIẾNG ANH.
 *
 * `null` không phải lỗi: tiếng Anh là dòng CHUẨN ở trên, nên lúc đó đơn giản là không
 * có dòng quốc gia nào để vẽ bên dưới. Nơi gọi phải xử `null` chứ đừng rơi về `'vi'` —
 * rơi về `'vi'` là in tiếng Việt cho người vừa cố tình chọn tiếng Anh.
 */
export function getNationalLanguage(): LangCode | null {
  const lang: AppLangCode = getLanguage();
  return lang === 'en' ? null : lang;
}

/** Đổi ngôn ngữ. Chuyển thẳng về `store.ts` — mọi chữ trong app đổi theo cùng một nhịp. */
export function setNationalLanguage(lang: LangCode): void {
  setLanguage(lang);
}

/** Nghe đổi ngôn ngữ. Trả hàm huỷ đăng ký. */
export function onNationalLanguageChange(fn: () => void): () => void {
  return subscribe(fn);
}

/**
 * Giữ tên cũ: chờ đọc xong lựa chọn đã lưu. Nay chỉ là `whenLanguageReady()` — điều
 * hướng gốc đã gọi hàm đó trước rồi, nên gọi lại là idempotent, không đọc đĩa hai lần.
 */
export function loadNationalLanguage(): Promise<void> {
  return whenLanguageReady();
}
