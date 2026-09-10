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

import { DEFAULT_INSTANCE } from '../../config/instance.config';
import { getLanguage, subscribe } from '../store';
import { DEFAULT_LANG, SOURCE_LANG, type LangCode } from '../types';
import { TRACE_STRINGS } from './trace';
import { MAP_STRINGS } from './map';
import { ONBOARDING_STRINGS } from './onboarding';
import { SCAN_STRINGS } from './scan';
import { IDENTITY_STRINGS } from './identity';
import React from 'react';

/** Một khoá → bản dịch đủ 4 ngôn ngữ. Thiếu là `tsc` báo, không phải người dùng. */
export type KeyEntry = Record<LangCode, string>;
export type KeyMap = Record<string, KeyEntry>;

/** Gộp mọi bộ khoá. Thêm module mới thì thêm một dòng ở đây. */
const REGISTRY: KeyMap = {
  ...TRACE_STRINGS,
  ...MAP_STRINGS,
  ...ONBOARDING_STRINGS,
  ...SCAN_STRINGS,
  ...IDENTITY_STRINGS,
};

export type StringKey =
  | keyof typeof TRACE_STRINGS
  | keyof typeof MAP_STRINGS
  | keyof typeof ONBOARDING_STRINGS
  | keyof typeof SCAN_STRINGS
  | keyof typeof IDENTITY_STRINGS;

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
  const raw = entry[lang] || entry[DEFAULT_LANG] || entry[SOURCE_LANG] || (key as string);
  // Thay ở ĐÂY chứ không ở từng chỗ gọi, vì cùng lý do đã ghi ở `translate.ts:78`:
  // chỗ gọi không phải biết gì, và chuỗi mang `{brand}` viết sau này cũng tự đúng.
  // Thay TRƯỚC `fill` để một `vars.brand` truyền tay không lặng lẽ đè tên app.
  const out = raw.includes(BRAND_SLOT) ? raw.split(BRAND_SLOT).join(BRAND) : raw;
  return vars ? fill(out, vars) : out;
}

/**
 * TÊN APP trong chuỗi hiển thị — cùng một chỗ thay với `t()` (`i18n/translate.ts`).
 *
 * ⛔ Thiếu vế này là lỗi ĐO ĐƯỢC, không phải chuyện đề phòng: `t()` thay `{brand}`
 * tập trung đúng để nơi gọi khỏi phải nhớ, còn `tk()` thì chỉ thay khi người gọi
 * TRUYỀN `vars` — mà không ai truyền `brand`, vì cả ý của thiết kế là không phải
 * truyền. Kết quả: mọi khoá chứa `{brand}` hiện ra nguyên văn dấu ngoặc nhọn.
 *
 * Hai khoá đang dính, và cái nặng hơn không phải cái dễ thấy:
 *   `trace.ask.placeholder`  → "Hỏi {brand} về vườn của bạn…" (xấu, ai cũng thấy)
 *   `map.permission.why`     → "{brand} cần vị trí để chỉ đường tới vườn…"
 *
 * Cái thứ hai là câu XIN QUYỀN. Đó đúng lớp hỏng mà `t()` sinh ra để chặn: người
 * dùng CheckFarm bị từ chối quyền được bảo đi tìm một mục tên khác trong Cài đặt
 * máy, và họ kẹt ở đúng chỗ mà câu hướng dẫn lẽ ra gỡ.
 *
 * KHÔNG dịch tên app. Một app một tên, giống nhau ở cả bốn ngôn ngữ.
 */
const BRAND_SLOT = '{brand}';
const BRAND = DEFAULT_INSTANCE.displayName;

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

export { TRACE_STRINGS, MAP_STRINGS, ONBOARDING_STRINGS, IDENTITY_STRINGS };

/**
 * TOÀN BỘ bộ khoá đã gộp — để bài kiểm soi được MỌI bộ, không riêng bộ nào.
 *
 * Trước đây bài kiểm "đủ 4 ngôn ngữ" chỉ chạy trên `TRACE_STRINGS`, nên bộ thêm
 * sau (map, onboarding) thiếu một ngôn ngữ vẫn xanh — cổng đo một tập hẹp hơn
 * tập nó khẳng định.
 */
export const ALL_STRINGS: KeyMap = REGISTRY;
