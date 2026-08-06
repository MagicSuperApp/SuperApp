// Canh TỪ ĐIỂN — một lỗi duy nhất, nhưng là lỗi không ai nhìn thấy bằng mắt.
//
// `dictionary.ts` gộp 8 tệp cụm từ bằng spread. Hai tệp cùng khai một chuỗi tiếng Việt
// với hai bản dịch khác nhau thì tệp gộp SAU lặng lẽ đè tệp trước — không cảnh báo,
// không lỗi tsc, không lỗi lint. Chuyện này đã xảy ra thật: `'Đăng xuất'` có ở
// `account.ts` (zh '退出登录') và `navigation.ts` (zh '登出'), và bản thắng đổi theo thứ
// tự import.
//
// Bài test này không kiểm chất lượng bản dịch. Nó chỉ kiểm MỘT điều: mỗi chuỗi nguồn
// chỉ có đúng một bản dịch trong toàn hệ.

import { COMMON } from './phrases/common';
import { ACCOUNT } from './phrases/account';
import { NAVIGATION } from './phrases/navigation';
import { TRACE } from './phrases/trace';
import { WORK } from './phrases/work';
import { CHAT } from './phrases/chat';
import { ERRORS } from './phrases/errors';
import { SCREENS } from './phrases/screens';
import type { PhraseMap } from './types';

const FILES: Array<[string, PhraseMap]> = [
  ['common', COMMON],
  ['account', ACCOUNT],
  ['navigation', NAVIGATION],
  ['trace', TRACE],
  ['work', WORK],
  ['chat', CHAT],
  ['errors', ERRORS],
  ['screens', SCREENS],
];

describe('từ điển cụm từ', () => {
  it('không chuỗi nào có HAI bản dịch khác nhau ở hai tệp', () => {
    const first = new Map<string, { file: string; json: string }>();
    const conflicts: string[] = [];

    for (const [file, map] of FILES) {
      for (const [key, phrase] of Object.entries(map)) {
        const json = JSON.stringify(phrase);
        const prev = first.get(key);
        if (!prev) {
          first.set(key, { file, json });
        } else if (prev.json !== json) {
          conflicts.push(
            `"${key}" — ${prev.file}: ${prev.json}  ≠  ${file}: ${json}`,
          );
        }
      }
    }

    expect(conflicts).toEqual([]);
  });

  it('không mục nào để bản dịch rỗng — rỗng thì hiện tiếng Việt, thà bỏ hẳn còn hơn', () => {
    const empty: string[] = [];
    for (const [file, map] of FILES) {
      for (const [key, phrase] of Object.entries(map)) {
        for (const [lang, text] of Object.entries(phrase)) {
          if (typeof text === 'string' && !text.trim()) {
            empty.push(`${file}: "${key}".${lang}`);
          }
        }
      }
    }
    expect(empty).toEqual([]);
  });
});
