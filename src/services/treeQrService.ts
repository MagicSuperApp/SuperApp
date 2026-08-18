// services/treeQrService.ts
//
// MÃ TRUY XUẤT CÔNG KHAI của cây — dựng URL trang công khai + lấy ảnh QR.
//
// ── Vì sao có tệp này ────────────────────────────────────────────────────────
// Màn "Quét truy xuất" (`navigation/traceScan.ts`) đọc được mã `ORI-…` từ lâu,
// nhưng app KHÔNG có chỗ nào lấy được mã đó ra để đem in: grep toàn `src/` trước
// bản này cho 0 lần gọi `/qr/{code}` và 0 màn nào hiện chuỗi `ORI-…`. Tức là đầu
// ĐỌC đã sẵn sàng mà đầu PHÁT thì chưa có — quét mãi không ra vì chưa ai in nổi
// cái mã để mà dán. Tệp này nối đúng khúc đó.
//
// ── Thứ tự phải nhớ, đừng đảo ────────────────────────────────────────────────
// ĐỊNH DANH cây/quả trong OriLife là bằng ẢNH (`/api/fruit/identify`). Mã `ORI-…`
// KHÔNG định danh gì cả — nó là NHÃN máy chủ cấp SAU khi cây đã được định danh,
// để người mua tra nhanh trang xuất xứ mà không phải chụp lại quả. Bỏ mã này đi
// thì hệ vẫn định danh bình thường; bỏ đường ảnh đi thì hệ chết.
// Xem chú thích dài ở `navigation/traceScan.ts:46` — cùng một lời cảnh báo.
//
// ── Hợp đồng máy chủ ─────────────────────────────────────────────────────────
//   mã          `identity.tree_code()` = `ORI-{geohash7}-{crockford8}`
//   trang công khai  `{base}/t/{code}`      (server.py:730-741)
//   ảnh QR       `GET {base}/qr/{code}`  → SVG   (server.py:5431)
//   tra mã       `GET {base}/api/tree_by_code/{code}` — CÔNG KHAI, không auth
//
// Mã lấy từ `Provenance.code` (`GET /api/provenance/{tree_id}`, cũng công khai).
//
// ── CHƯA ĐO ĐƯỢC, nói thẳng ──────────────────────────────────────────────────
// Nhà này chưa quét thử một mã `ORI-…` in thật ngoài thực địa (issue #169 §6).
// Cửa `/qr/{code}` được đọc từ mã nguồn máy chủ, CHƯA gọi thật lần nào từ app.
// Nên `fetchTreeQrSvg` phải hỏng ÊM: mã chữ vẫn hiện được để người dùng tự dựng
// QR bằng công cụ khác. QR chỉ là tiện lợi; MÃ mới là thứ mang thông tin.

import { parseTreeCode } from '../navigation/traceScan';

/** Trần byte cho SVG nhận về. QR của một mã 20 ký tự chỉ vài KB; lớn hơn nhiều
 *  nghĩa là máy chủ trả nhầm thứ (trang HTML lỗi chẳng hạn) — không vẽ. */
const SVG_MAX_BYTES = 256 * 1024;

/** Chờ tối đa. In tem là việc làm tại chỗ, không phải nền — hỏng nhanh còn hơn treo. */
const FETCH_TIMEOUT_MS = 10_000;

/** Cắt `/` cuối để `${base}${path}` không sinh `//`. Giống `orilifeBase.ts`. */
function trimBase(base: string): string {
  return (base ?? '').trim().replace(/\/+$/, '');
}

/**
 * URL trang xuất xứ công khai — thứ được NHÚNG vào QR.
 *
 * Trả `null` nếu mã không đúng khuôn. Dùng `parseTreeCode` chứ KHÔNG tự viết lại
 * regex: bảng chữ (geohash bỏ a,i,l,o · crockford bỏ I,L,O,U) phải khớp máy chủ
 * từng ký tự, mà hai bản sao của một regex thì sớm muộn cũng lệch nhau.
 */
export function publicTraceUrl(base: string, code: string): string | null {
  const c = parseTreeCode(code);
  const b = trimBase(base);
  if (!c || !b) return null;
  return `${b}/t/${encodeURIComponent(c)}`;
}

/** URL cửa ảnh QR của máy chủ. `null` nếu mã không đúng khuôn. */
export function qrSvgUrl(base: string, code: string): string | null {
  const c = parseTreeCode(code);
  const b = trimBase(base);
  if (!c || !b) return null;
  return `${b}/qr/${encodeURIComponent(c)}`;
}

export interface TreeQrResult {
  ok: boolean;
  /** Nội dung SVG, sẵn sàng đưa cho `<SvgXml xml={…} />`. */
  svg?: string;
  /** Câu CHO NGƯỜI ĐỌC khi hỏng. Không phải stack, không phải mã lỗi trần. */
  error?: string;
}

/**
 * Lấy ảnh QR của mã cây.
 *
 * Không ném — trả `{ ok: false, error }`. Chỗ gọi là một tấm thẻ trong màn thông
 * tin; nó không được phép làm sập màn vì một cửa phụ chưa từng gọi thật lần nào.
 */
export async function fetchTreeQrSvg(
  base: string,
  code: string,
): Promise<TreeQrResult> {
  const url = qrSvgUrl(base, code);
  // Mã sai khuôn thì KHÔNG bắn lên máy chủ. Cùng lý lẽ với `parseTreeCode`: nới
  // ra là mang chuỗi lạ của người khác ra khỏi máy.
  if (!url) return { ok: false, error: 'Mã cây không đúng khuôn.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'image/svg+xml,text/plain,*/*' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Máy chủ trả HTTP ${res.status}.` };
    }
    const text = await res.text();
    if (text.length > SVG_MAX_BYTES) {
      return { ok: false, error: 'Ảnh QR trả về quá lớn, không vẽ.' };
    }
    // Máy chủ có thể trả trang lỗi HTML với mã 200. Đưa chuỗi đó cho `SvgXml`
    // thì nó ném ở tầng vẽ — bắt tại đây, nơi còn nói được câu tử tế.
    if (!/<svg[\s>]/i.test(text)) {
      return { ok: false, error: 'Máy chủ không trả ảnh QR.' };
    }
    return { ok: true, svg: text };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      error: aborted ? 'Quá hạn chờ máy chủ.' : 'Không nối được máy chủ.',
    };
  } finally {
    clearTimeout(timer);
  }
}
