// i18n/types.ts
//
// Mã ngôn ngữ app hỗ trợ. Mở rộng thị trường = thêm mã ở đây + thêm cột trong
// từ điển (src/i18n/phrases/*). KHÔNG khai ngôn ngữ ở nơi nào khác.

export type LangCode = 'vi' | 'en' | 'zh';

/** Ngôn ngữ GỐC của mã nguồn — mọi chuỗi trong code viết bằng tiếng Việt. */
export const SOURCE_LANG: LangCode = 'vi';

/**
 * Ngôn ngữ dùng khi người dùng CHƯA chọn (máy vừa cài, hoặc đọc AsyncStorage lỗi).
 *
 * ⚠️ Khác SOURCE_LANG: cụm từ nào chưa khai trong từ điển sẽ hiện NGUYÊN VĂN
 * tiếng Việt, nên đặt mặc định ≠ 'vi' đồng nghĩa giao diện có thể LẪN hai thứ
 * tiếng cho tới khi từ điển phủ hết. Đổi giá trị này là đổi hành vi lần chạy đầu
 * của MỌI máy mới — cân nhắc kỹ.
 */
export const DEFAULT_LANG: LangCode = 'en';

/** Ngôn ngữ ĐÍCH (cần dịch). Suy ra từ LangCode để không quên khi thêm mã mới. */
export type TargetLang = Exclude<LangCode, typeof SOURCE_LANG>;

/** Một mục từ điển: bản dịch cho TỪNG ngôn ngữ đích. */
export type Phrase = Partial<Record<TargetLang, string>>;

/** Từ điển: khoá = CHUỖI TIẾNG VIỆT trong mã nguồn (nguồn duy nhất, khỏi sinh key). */
export type PhraseMap = Record<string, Phrase>;

export interface LangMeta {
  code: LangCode;
  /**
   * Tên ngôn ngữ VIẾT BẰNG CHÍNH NÓ (endonym). Đây là chuẩn của mọi bộ chọn ngôn
   * ngữ: người lỡ đặt sai ngôn ngữ vẫn đọc được dòng của mình để quay lại. Vì là
   * TÊN RIÊNG nên KHÔNG khai trong từ điển — luôn hiển thị nguyên văn.
   */
  endonym: string;
  /** Cờ/emoji nhận diện nhanh. */
  flag: string;
}

// Thứ tự hiển thị trong popup chọn ngôn ngữ.
export const LANGUAGES: LangMeta[] = [
  { code: 'vi', endonym: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', endonym: 'English', flag: '🇬🇧' },
  { code: 'zh', endonym: '中文', flag: '🇨🇳' },
];

export const isLangCode = (v: unknown): v is LangCode =>
  v === 'vi' || v === 'en' || v === 'zh';
