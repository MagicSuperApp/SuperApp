/**
 * Bài kiểm cho `mnemonic.ts` — phép ĐẾM cụm từ khôi phục.
 *
 * Đây là chỗ đã làm nút Khôi phục chết: người dùng nhìn thấy 24 từ trên màn, máy
 * đếm ra 48 vì mỗi từ dính một số thứ tự. Đếm sai thì không có gì báo lỗi cả —
 * chỉ có một cái nút không bấm được.
 */

import { normalizeMnemonic, countMnemonicWords } from './mnemonic';

/** 24 từ hợp lệ (đầu wordlist BIP39 tiếng Anh) — dùng lại nhiều lần. */
const W24 = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent',
  'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
  'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
  'across', 'act', 'action', 'actor', 'actress', 'actual',
];

describe('countMnemonicWords', () => {
  it('đếm đúng cụm từ sạch', () => {
    expect(countMnemonicWords(W24.join(' '))).toBe(24);
  });

  it('SỐ THỨ TỰ không bị tính thành từ — đây là lỗi làm nút Khôi phục chết', () => {
    const numbered = W24.map((w, i) => `${i + 1}. ${w}`).join(' ');
    expect(countMnemonicWords(numbered)).toBe(24);
  });

  it('dấu phẩy, xuống dòng, khoảng trắng thừa đều không tính', () => {
    expect(countMnemonicWords(W24.join(', '))).toBe(24);
    expect(countMnemonicWords(W24.join('\n'))).toBe(24);
    expect(countMnemonicWords(`   ${W24.join('   ')}   `)).toBe(24);
  });

  it('gạch đầu dòng không tính', () => {
    expect(countMnemonicWords(W24.map(w => `- ${w}`).join('\n'))).toBe(24);
  });

  it('chuỗi rỗng / chỉ dấu câu → 0, không phải 1', () => {
    expect(countMnemonicWords('')).toBe(0);
    expect(countMnemonicWords('   ')).toBe(0);
    expect(countMnemonicWords('1. 2. 3.')).toBe(0);
  });

  it('thiếu/thừa từ vẫn đếm đúng để câu báo nói được con số thật', () => {
    expect(countMnemonicWords(W24.slice(0, 12).join(' '))).toBe(12);
    expect(countMnemonicWords([...W24, 'zoo'].join(' '))).toBe(25);
  });
});

describe('normalizeMnemonic', () => {
  it('viết thường — người dùng gõ hoa vẫn khớp wordlist', () => {
    expect(normalizeMnemonic('Abandon ABILITY able')).toBe('abandon ability able');
  });

  it('GIỮ chữ có dấu và kana — wordlist BIP39 còn bản Pháp và Nhật', () => {
    expect(normalizeMnemonic('abaisser abandon')).toBe('abaisser abandon');
    expect(normalizeMnemonic('éléphant café')).toBe('éléphant café');
    expect(normalizeMnemonic('あいこくしん あいさつ')).toBe('あいこくしん あいさつ');
  });

  it('trả chuỗi dùng được thẳng cho BIP39 (một khoảng trắng giữa các từ)', () => {
    expect(normalizeMnemonic('1) abandon,  2) ability\n3) able')).toBe('abandon ability able');
  });
});
