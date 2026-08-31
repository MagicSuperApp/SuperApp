// i18n/types.ts
//
// SEAM NGÔN NGỮ — nguồn DUY NHẤT khai ngôn ngữ app hỗ trợ.
//
// Mở rộng thị trường = thêm MỘT mã vào `SUPPORTED_LANGS` rồi bổ sung nhãn ở
// `NAV_FRAME` và cột mới trong `src/i18n/phrases/*`; TypeScript sẽ chỉ ra mọi
// chỗ còn thiếu (`NAV_FRAME` dùng `Record` ĐẦY ĐỦ, không phải `Partial`, chính
// vì lý do đó).
//
// KHÔNG thêm phụ thuộc native (`react-native-localize`) để dò ngôn ngữ máy —
// thêm là phải dựng lại cả hai nền tảng. `Intl` có sẵn trong Hermes là đủ; máy
// nào bị cắt `Intl` khỏi bản dựng gọn thì rơi về mặc định, không ném.

export const SUPPORTED_LANGS = ['vi', 'en', 'zh', 'ja'] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

/** Ngôn ngữ GỐC của mã nguồn — mọi chuỗi trong code viết bằng tiếng Việt. */
export const SOURCE_LANG: LangCode = 'vi';

/**
 * Ngôn ngữ app chạy khi người dùng CHƯA chọn — TIẾNG ANH, cho mọi máy.
 *
 * Thứ tự quyết định lúc khởi động: `DEFAULT_LANG` → `lựa chọn đã lưu` (ghi đè,
 * xem `store.hydrateLanguage`).
 *
 * ⚠️ CỐ Ý KHÔNG dò ngôn ngữ máy: tiếng Anh là ngôn ngữ CHUẨN của app (SG9 §5.2 —
 * khung nav để tiếng Anh ở dòng trên), nên máy mới cài phải mở ra bằng tiếng Anh
 * dù điện thoại đang đặt tiếng gì. Người dùng đổi ở màn "Chọn ngôn ngữ" hiện ngay
 * sau đó — một thao tác rõ ràng, hơn là đoán theo locale rồi đoán sai.
 * `detectDeviceLang()` vẫn còn ở cuối file cho ai cần, nhưng KHÔNG nối vào store.
 */
export const DEFAULT_LANG: LangCode = 'en';

/** Ngôn ngữ ĐÍCH (cần dịch). Suy ra từ LangCode để không quên khi thêm mã mới. */
export type TargetLang = Exclude<LangCode, typeof SOURCE_LANG>;

/**
 * Ngôn ngữ CHUẨN của từ điển — cụm từ thiếu bản dịch ở ngôn ngữ đang chọn sẽ rơi
 * về đây TRƯỚC khi rơi về chuỗi nguồn (xem `translate.compute`).
 *
 * Vì sao cần: khoá từ điển là chuỗi tiếng Việt trong mã, nên không có nấc này thì
 * một mục thiếu bản tiếng Nhật sẽ hiện NGUYÊN VĂN TIẾNG VIỆT giữa màn tiếng Nhật —
 * người dùng Nhật không đọc được gì. Tiếng Anh thì ít nhất còn đoán được, và
 * `phrases/*` phủ tiếng Anh đầy đủ nhất.
 *
 * Tách khỏi `DEFAULT_LANG` có chủ đích: đổi ngôn ngữ mở-máy-lần-đầu (một quyết
 * định về THỊ TRƯỜNG) không được lặng lẽ đổi luôn ngôn ngữ chống-đỡ của từ điển.
 */
export const FALLBACK_LANG: TargetLang = 'en';

/**
 * Ngôn ngữ QUỐC GIA — dùng cho khung điều hướng song ngữ (SG9 §5.2): tiếng Anh là
 * CHUẨN, luôn hiển thị ở dòng TRÊN; dòng DƯỚI là ngôn ngữ quốc gia. Nên 'en' bị
 * loại khỏi đây: nó đã nằm ở dòng trên rồi, khai lại là in trùng chữ.
 */
export const NATIONAL_LANGS = ['vi', 'zh', 'ja'] as const;
export type NationalLang = (typeof NATIONAL_LANGS)[number];

/** Một mục từ điển: bản dịch cho TỪNG ngôn ngữ đích. */
export type Phrase = Partial<Record<TargetLang, string>>;

/** Từ điển: khoá = CHUỖI TIẾNG VIỆT trong mã nguồn (nguồn duy nhất, khỏi sinh key). */
export type PhraseMap = Record<string, Phrase>;

export interface LangMeta {
  code: LangCode;
  /**
   * Tên ngôn ngữ VIẾT BẰNG CHÍNH NÓ (endonym). Đây là chuẩn của mọi bộ chọn ngôn
   * ngữ: người đang lạc trong giao diện họ không đọc được vẫn nhận ra dòng của
   * mình. Ghi "Tiếng Trung" thì đúng người cần nó nhất lại không tìm ra.
   * Vì là TÊN RIÊNG nên KHÔNG khai trong từ điển — luôn hiển thị nguyên văn.
   */
  endonym: string;
  /** Cờ/emoji nhận diện nhanh. */
  flag: string;
}

// Thứ tự hiển thị trong popup / màn chọn ngôn ngữ.
export const LANGUAGES: LangMeta[] = [
  { code: 'vi', endonym: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', endonym: 'English', flag: '🇬🇧' },
  { code: 'zh', endonym: '中文', flag: '🇨🇳' },
  { code: 'ja', endonym: '日本語', flag: '🇯🇵' },
];

/** Tên từng ngôn ngữ viết bằng chính nó, tra nhanh theo mã. */
export const LANG_ENDONYM: Record<LangCode, string> = LANGUAGES.reduce(
  (acc, l) => {
    acc[l.code] = l.endonym;
    return acc;
  },
  {} as Record<LangCode, string>,
);

export const isLangCode = (v: unknown): v is LangCode =>
  typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v);

/**
 * Đổi thẻ ngôn ngữ BCP-47 bất kỳ thành `LangCode`, hoặc `null` nếu không hỗ trợ.
 * Nhận cả `vi`, `vi-VN`, `zh-Hans-CN`, `ja_JP`, `ZH`. Hàm thuần — có test canh.
 */
export function normalizeLangTag(tag: string | null | undefined): LangCode | null {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return isLangCode(primary) ? primary : null;
}

/**
 * Ngôn ngữ máy đang đặt, hoặc `null` nếu không dò được / app không hỗ trợ.
 * Bọc try/catch vì `Intl` có thể bị cắt khỏi bản dựng Hermes gọn — thiếu nó phải
 * rơi về mặc định, KHÔNG được làm sập app ngay lúc khởi động.
 *
 * ⚠️ KHÔNG dùng để chọn ngôn ngữ lúc khởi động nữa (xem `DEFAULT_LANG`): máy mới
 * cài luôn mở bằng tiếng Anh. Giữ hàm lại vì nó là phần thuần, có test, và là chỗ
 * DUY NHẤT biết đọc locale — cần gợi ý ngôn ngữ ở đâu đó về sau thì gọi từ đây,
 * đừng viết lại.
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
