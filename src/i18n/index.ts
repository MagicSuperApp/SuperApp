// i18n/index.ts — CỬA VÀO DUY NHẤT của hệ đa ngôn ngữ.
//
// Dùng ở đâu:
//   · Chuỗi nằm trong <Text> / placeholder <TextInput> → KHÔNG cần làm gì, lớp
//     autoText đã dịch tự động (xem install.ts).
//   · Chuỗi ở nơi khác (accessibilityLabel, tiêu đề truyền qua props, chuỗi dựng
//     trong service/util) → gọi `t('…')`; trong component muốn vẽ lại khi đổi
//     ngôn ngữ thì dùng `useT()`.
//   · Chuỗi có chỗ thay → `tf('Xin chào {name}', { name })`.
//
// Thêm bản dịch: mở src/i18n/phrases/*.ts, thêm dòng `'chuỗi Việt': { en, zh }`.
// KHÔNG có bản dịch → hiện nguyên tiếng Việt (an toàn theo thiết kế).

export { t, tf, hasTranslation, clearCache } from './translate';
export { useLanguage, useT } from './useLanguage';
export {
  getLanguage,
  setLanguage,
  isHydrated,
  hasChosenLanguage,
  hydrateLanguage,
  whenLanguageReady,
  subscribe,
  LANG_STORAGE_KEY,
} from './store';
export { installI18n } from './install';
export { LANGUAGES, SOURCE_LANG, DEFAULT_LANG, isLangCode } from './types';
export type { LangCode, LangMeta, Phrase, PhraseMap } from './types';
