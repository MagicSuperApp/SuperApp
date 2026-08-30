// i18n/translate.ts
//
// HÀM DỊCH — tra từ điển theo CHÍNH CHUỖI TIẾNG VIỆT trong mã nguồn.
//
// Vì sao khoá = chuỗi nguồn (không phải key kiểu `account.logout`):
//   1. App đã có 76k dòng chuỗi Việt hard-code. Đặt key mới = sửa 177 file, rủi ro cao.
//   2. Không khớp từ điển thì HIỆN NGUYÊN chuỗi Việt — hỏng từ điển KHÔNG bao giờ
//      ra màn hình trống hay "missing.key.xxx".
//   3. TÊN RIÊNG & THUẬT NGỮ (Aladin, PhoenixKey, DID, LAMP, MAGIC, Cardano, ADA,
//      CARP, ProofChat, LampNet…) chỉ cần KHÔNG khai trong từ điển là tự động giữ
//      nguyên ở mọi ngôn ngữ — đúng yêu cầu, không cần danh sách loại trừ riêng.
//
// Khoảng trắng hai đầu được GIỮ: JSX hay tách `{'Xin chào '}{name}` nên chuỗi tới
// đây thường dính space. Tra bản đã trim rồi ghép lại nguyên khoảng trắng cũ.
//
// NẤC RƠI: ngôn ngữ đang chọn → FALLBACK_LANG ('en') → chuỗi nguồn. Nấc giữa là
// điểm mấu chốt: thiếu một bản tiếng Nhật thì hiện TIẾNG ANH chứ không tống nguyên
// văn tiếng Việt vào giữa màn tiếng Nhật. Nấc cuối vẫn còn nguyên nên tên riêng &
// thuật ngữ (không khai trong từ điển) vẫn tự động giữ nguyên như trước.

import { DEFAULT_INSTANCE } from '../config/instance.config';
import { DICTIONARY } from './dictionary';
import { getLanguage } from './store';
import { FALLBACK_LANG, SOURCE_LANG, type LangCode, type TargetLang } from './types';

// Bộ nhớ đệm kết quả theo ngôn ngữ: Text vẽ lại rất nhiều lần, tránh chạy regex
// trim + tra map mỗi khung hình. Xoá sạch khi đổi ngôn ngữ (xem clearCache).
const cache = new Map<LangCode, Map<string, string>>();

const EDGE_WS = /^(\s*)([\s\S]*?)(\s*)$/;

function lookup(src: string, lang: TargetLang): string | undefined {
  const entry = DICTIONARY[src];
  const out = entry?.[lang];
  // Chuỗi rỗng trong từ điển = "cố ý không hiển thị gì" → vẫn hợp lệ.
  return typeof out === 'string' ? out : undefined;
}

function compute(src: string, lang: TargetLang): string {
  // Khớp CHÍNH XÁC ưu tiên hơn khớp sau khi trim, ở cả hai ngôn ngữ.
  const langs: TargetLang[] = lang === FALLBACK_LANG ? [lang] : [lang, FALLBACK_LANG];

  for (const l of langs) {
    const direct = lookup(src, l);
    if (direct !== undefined) return direct;
  }

  const m = EDGE_WS.exec(src);
  if (m && (m[1] || m[3]) && m[2]) {
    for (const l of langs) {
      const inner = lookup(m[2], l);
      if (inner !== undefined) return m[1] + inner + m[3];
    }
  }
  return src;
}

/**
 * Dịch một chuỗi tiếng Việt sang ngôn ngữ đang chọn.
 * Không có bản dịch → trả NGUYÊN chuỗi vào (an toàn theo thiết kế).
 */
export function t(src: string): string {
  if (!src) return src;
  const out = tRaw(src);
  return out.includes(BRAND_SLOT) ? out.split(BRAND_SLOT).join(BRAND) : out;
}

/**
 * `{brand}` — chỗ thay TÊN APP trong mọi chuỗi hiển thị.
 *
 * Vì sao nó nằm ở đây chứ không ở từng chỗ gọi: một nền mã sinh nhiều app, và
 * trước 2026-08-29 có 15 chuỗi ghi cứng "Aladin" trong từ điển — gồm cả những
 * câu xin quyền ("Aladin cần Camera để chụp ảnh cây") và câu chỉ đường sửa
 * quyền ("Cấp quyền GPS trong Cài đặt → Aladin"). Người dùng CheckFarm bị từ
 * chối quyền sẽ được bảo đi tìm một mục tên "Aladin" trong Cài đặt máy — mục đó
 * KHÔNG tồn tại trên máy họ. Họ kẹt ở đúng chỗ mà câu hướng dẫn lẽ ra gỡ.
 *
 * Đặt chỗ thay ở `t()` để chỗ gọi không phải đổi: viết `{brand}` trong từ điển
 * là xong, kể cả những chuỗi chưa ai viết. Thay ở từng chỗ gọi thì mỗi chuỗi
 * mới lại là một dịp quên.
 *
 * KHÔNG dịch tên app. Một app một tên, giống nhau ở cả bốn ngôn ngữ.
 */
const BRAND_SLOT = '{brand}';
const BRAND = DEFAULT_INSTANCE.displayName;

function tRaw(src: string): string {
  const lang = getLanguage();
  if (lang === SOURCE_LANG) return src;

  let byLang = cache.get(lang);
  if (!byLang) {
    byLang = new Map();
    cache.set(lang, byLang);
  }
  const hit = byLang.get(src);
  if (hit !== undefined) return hit;

  const out = compute(src, lang as TargetLang);
  byLang.set(src, out);
  return out;
}

/**
 * Dịch chuỗi có CHỖ THAY: `tf('Xin chào {name}', { name })`.
 * Khoá từ điển giữ nguyên dấu ngoặc nhọn để bản dịch tự đặt lại vị trí
 * (tiếng Trung/Anh có trật tự từ khác tiếng Việt).
 */
export function tf(src: string, vars: Record<string, string | number>): string {
  const tpl = t(src);
  return tpl.replace(/\{(\w+)\}/g, (whole, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : whole,
  );
}

/**
 * Có bản dịch cho chuỗi này ở ngôn ngữ đang chọn không (dùng cho DEV/kiểm tra).
 * CHẶT hơn `t()`: false vẫn có thể ra chữ tiếng Anh nhờ nấc FALLBACK_LANG — đây là
 * bài đo ĐỘ PHỦ từ điển, nên không được tính nấc rơi là "đã dịch".
 */
export function hasTranslation(src: string): boolean {
  const lang = getLanguage();
  if (lang === SOURCE_LANG) return true;
  return lookup(src, lang as TargetLang) !== undefined;
}

/** Xoá đệm — gọi khi từ điển được nạp lại (chỉ dùng trong DEV/hot-reload). */
export function clearCache(): void {
  cache.clear();
}
