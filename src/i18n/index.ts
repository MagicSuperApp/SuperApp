// i18n/index.ts — CỬA VÀO DUY NHẤT của hệ đa ngôn ngữ (vi · en · zh · ja).
//
// Dùng ở đâu:
//   · Chuỗi nằm trong <Text> / placeholder <TextInput> → KHÔNG cần làm gì, lớp
//     autoText đã dịch tự động (xem install.ts).
//   · Chuỗi ở nơi khác (accessibilityLabel, tiêu đề truyền qua props, chuỗi dựng
//     trong service/util) → gọi `t('…')`; trong component muốn vẽ lại khi đổi
//     ngôn ngữ thì dùng `useT()`.
//   · Chuỗi có chỗ thay → `tf('Xin chào {name}', { name })`.
//
// Thêm bản dịch: mở src/i18n/phrases/*.ts, thêm dòng `'chuỗi Việt': { en, zh, ja }`.
// Thiếu bản dịch → rơi về TIẾNG ANH; thiếu cả tiếng Anh (tên riêng, thuật ngữ, dữ
// liệu người dùng) → giữ nguyên chuỗi trong mã. An toàn theo thiết kế: không bao
// giờ ra màn trắng hay "missing.key.xxx".
//
// Ngôn ngữ mở app lần đầu là TIẾNG ANH cho mọi máy (DEFAULT_LANG) — không dò locale.

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
export {
  LANGUAGES,
  LANG_ENDONYM,
  SUPPORTED_LANGS,
  NATIONAL_LANGS,
  SOURCE_LANG,
  DEFAULT_LANG,
  FALLBACK_LANG,
  isLangCode,
  normalizeLangTag,
  detectDeviceLang,
} from './types';
export type {
  LangCode,
  LangMeta,
  NationalLang,
  Phrase,
  PhraseMap,
  TargetLang,
} from './types';
