// i18n/useLanguage.ts
//
// Hook đăng ký ngôn ngữ hiện hành. Dùng useSyncExternalStore để component vẽ lại
// NGAY khi người dùng đổi ngôn ngữ (không cần Provider, không remount navigator
// → không mất ngăn xếp điều hướng đang mở).

import { useSyncExternalStore } from 'react';
import { getLanguage, subscribe } from './store';
import { t } from './translate';
import type { LangCode } from './types';

/** Ngôn ngữ đang chọn; component gọi hook này sẽ tự vẽ lại khi ngôn ngữ đổi. */
export function useLanguage(): LangCode {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/**
 * Hàm dịch có ĐĂNG KÝ — dùng cho chuỗi KHÔNG nằm trong <Text> (placeholder tự
 * dựng, accessibilityLabel, tiêu đề truyền qua props…). Với chuỗi nằm trong
 * <Text> thì không cần: lớp autoText đã lo.
 */
export function useT(): (src: string) => string {
  useLanguage();
  return t;
}
