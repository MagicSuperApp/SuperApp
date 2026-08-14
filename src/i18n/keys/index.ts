/**
 * i18n/keys — CHUỖI THEO KHOÁ (`trace.button.addTree`), thay cho chuỗi tiếng Việt
 * viết thẳng trong mã.
 *
 * ── Vì sao thêm lối này, trong khi app đã có `autoText` ─────────────────────
 * Lối cũ lấy CHÍNH CÂU TIẾNG VIỆT làm khoá từ điển. Nó gọn lúc viết, nhưng:
 *   · Sửa một dấu phẩy trong câu là mất luôn bản dịch của cả 3 thứ tiếng — khoá
 *     đổi mà không có gì báo, người dùng nước ngoài lặng lẽ thấy tiếng Việt.
 *   · Hai chỗ khác nhau cùng viết "Đã lưu" buộc phải dùng CHUNG một bản dịch,
 *     dù ngữ cảnh khác hẳn nhau.
 *   · Mã nguồn đầy tiếng Việt — người viết phần mềm không đọc tiếng Việt thì
 *     không sửa được giao diện.
 * Khoá `trace.button.addTree` gỡ cả ba: câu chữ đổi bao nhiêu lần khoá vẫn đứng yên.
 *
 * ── Sống chung, không thay thế ──────────────────────────────────────────────
 * Hơn 2.000 dòng từ điển cũ và mấy chục màn vẫn chạy theo lối `autoText`. Rứt bỏ
 * trong một lần là chắc chắn làm vỡ chỗ nào đó không ai để ý. Lối khoá dùng cho
 * mã VIẾT MỚI (bắt đầu từ module Truy xuất); màn cũ chuyển dần.
 *
 * Chuỗi lấy theo khoá KHÔNG đi qua `autoText` nữa (nó tra theo câu tiếng Việt,
 * mà ở đây câu ra đã đúng ngôn ngữ rồi) — cũng chính là điều ta muốn.
 */

import { getLanguage, subscribe } from '../store';
import { DEFAULT_LANG, SOURCE_LANG, type LangCode } from '../types';
import { TRACE_STRINGS } from './trace';
import React from 'react';

/** Một khoá → bản dịch đủ 4 ngôn ngữ. Thiếu là `tsc` báo, không phải người dùng. */
export type KeyEntry = Record<LangCode, string>;
export type KeyMap = Record<string, KeyEntry>;

/** Gộp mọi bộ khoá. Thêm module mới thì thêm một dòng ở đây. */
const REGISTRY: KeyMap = {
  ...TRACE_STRINGS,
};

export type StringKey = keyof typeof TRACE_STRINGS;

/**
 * Khoá → chữ theo ngôn ngữ đang chọn.
 *
 * Rơi lần lượt: ngôn ngữ đang chọn → tiếng Anh → tiếng Việt → CHÍNH KHOÁ. Trả về
 * khoá là cố ý: thấy `trace.button.addTree` hiện trên màn thì biết ngay thiếu bản
 * dịch, còn trả chuỗi rỗng thì chỉ thấy một khoảng trống không ai giải thích được.
 */
export function tk(key: StringKey | string, vars?: Record<string, string | number>): string {
  const entry = REGISTRY[key as string];
  if (!entry) return key as string;
  const lang = getLanguage();
  const out = entry[lang] || entry[DEFAULT_LANG] || entry[SOURCE_LANG] || (key as string);
  return vars ? fill(out, vars) : out;
}

/** `'Còn {n} cây'` + `{ n: 3 }` → `'Còn 3 cây'`. Chỗ thay thiếu thì giữ nguyên `{n}`. */
function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * Bản dùng trong component: trả về chính `tk` nhưng ĐĂNG KÝ vẽ lại khi đổi ngôn
 * ngữ. Gọi thẳng `tk` trong lúc dựng cây thì đổi ngôn ngữ xong màn vẫn giữ chữ cũ
 * cho tới lần vẽ lại kế tiếp — thứ lỗi trông như "đổi ngôn ngữ không ăn".
 */
export function useTk(): typeof tk {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribe(() => force()), []);
  return tk;
}

/** Cho bài kiểm: liệt kê mọi khoá đang khai. */
export function allKeys(): string[] {
  return Object.keys(REGISTRY);
}

export { TRACE_STRINGS };
