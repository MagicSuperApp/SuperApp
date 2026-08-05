// i18n/useNationalLanguage.ts
//
// Hook để một màn VẼ LẠI khi người dùng đổi ngôn ngữ.
//
// Vì sao cần: `getNationalLanguage()` là hàm thuần đọc một biến module — React không
// biết nó đổi. Không có hook này thì đổi ngôn ngữ xong thanh điều hướng vẫn giữ chữ cũ
// cho tới khi màn tình cờ vẽ lại vì lý do khác. Người dùng sẽ đổi đi đổi lại vì tưởng
// bấm hụt.

import { useEffect, useState } from 'react';

import {
  getNationalLanguage,
  onNationalLanguageChange,
  type LangCode,
} from './languages';

/** Ngôn ngữ quốc gia hiện hành, tự cập nhật khi đổi. */
export function useNationalLanguage(): LangCode {
  const [lang, setLang] = useState<LangCode>(getNationalLanguage);

  useEffect(() => {
    // Đọc lại ngay khi gắn: ngôn ngữ có thể đã đổi giữa lúc dựng state ban đầu và lúc
    // effect chạy (ví dụ `loadNationalLanguage()` vừa xong ở màn khởi động).
    setLang(getNationalLanguage());
    return onNationalLanguageChange(setLang);
  }, []);

  return lang;
}
