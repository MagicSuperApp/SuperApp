// i18n/dictionary.ts — GOM mọi bộ cụm từ thành MỘT bảng tra phẳng.
//
// Thêm bản dịch: sửa file trong src/i18n/phrases/, KHÔNG sửa file này.
// Trùng khoá giữa các bộ: bộ khai SAU đè bộ khai TRƯỚC (thứ tự trong mảng dưới).
// DEV sẽ cảnh báo khi phát hiện trùng để tránh hai chỗ dịch lệch nhau.

import type { PhraseMap } from './types';
import { COMMON } from './phrases/common';
import { ACCOUNT } from './phrases/account';
import { NAVIGATION } from './phrases/navigation';
import { TRACE } from './phrases/trace';
import { WORK } from './phrases/work';
import { CHAT } from './phrases/chat';
import { ERRORS } from './phrases/errors';
import { SCREENS } from './phrases/screens';
import { DIALOGS } from './phrases/dialogs';

const PARTS: Array<[string, PhraseMap]> = [
  ['common', COMMON],
  ['account', ACCOUNT],
  ['navigation', NAVIGATION],
  ['trace', TRACE],
  ['work', WORK],
  ['chat', CHAT],
  ['errors', ERRORS],
  ['screens', SCREENS],
  ['dialogs', DIALOGS],
];

function build(): PhraseMap {
  const out: PhraseMap = Object.create(null);
  const seen = __DEV__ ? new Map<string, string>() : null;
  for (const [name, part] of PARTS) {
    for (const key of Object.keys(part)) {
      if (seen) {
        const prev = seen.get(key);
        if (prev) {
          console.warn(`[i18n] khoá trùng "${key}": ${prev} → ${name} (bản sau đè bản trước)`);
        }
        seen.set(key, name);
      }
      out[key] = part[key];
    }
  }
  return out;
}

export const DICTIONARY: PhraseMap = build();

/** Số cụm từ đang có — dùng cho DEV/telemetry. */
export const DICTIONARY_SIZE = Object.keys(DICTIONARY).length;
