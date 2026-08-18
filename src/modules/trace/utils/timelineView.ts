/**
 * timelineView — QUYẾT ĐỊNH TRÌNH BÀY của dòng thời gian, tách thành hàm thuần.
 *
 * Tệp này gỡ ba trong bốn chỗ "nháp" mà issue #137 nêu. Ghi rõ chỗ nào đã có
 * căn cứ và chỗ nào vẫn là phỏng đoán, để không ai đọc nhầm cái sau thành cái
 * trước.
 *
 * ══ CĂN CỨ ĐÃ CÓ ═════════════════════════════════════════════════════════
 *
 * · **`payload` chứa gì** — cho tới nay chỉ đoán. Nhưng có MỘT nguồn chắc chắn
 *   mà issue chưa nhắc: **chính app này là một trong những bên GHI vào timeline**.
 *   `services/syncDispatch.ts:171-179` gửi
 *       payload: { activity_type, quoted_magic, materials[] }
 *   vào timeline của **vườn**, cho việc tưới · bón phân · phun thuốc · thu hoạch
 *   (`ACTIVITY_TO_TIMELINE_KIND`, `syncDispatch.ts:37-42`). Nên ba khoá đó KHÔNG
 *   phải phỏng đoán — chúng là hợp đồng của chính nhà mình, và chúng đúng là
 *   phần "nhật ký chăm sóc" mà bản bổ sung 18/08 nói tới.
 *
 *   Khoá do bên KHÁC ghi thì vẫn chưa biết, nên luật cũ giữ nguyên: chỉ lấy khoá
 *   có tên rõ nghĩa, không bao giờ đổ một object ra màn.
 *
 * · **`media` có URL tương đối không** — chưa đo được, và KHÔNG CẦN đo: nhận cả
 *   hai dạng. URL đã tuyệt đối thì để nguyên; đường bắt đầu bằng `/` thì ghép
 *   base. Cùng cách đã dùng cho `img_urls` ở `fruitLookupService`, và nó đúng ở
 *   cả hai ca nên không phải chờ ai dán thân 200 nữa.
 *
 * · **Mục KẾ THỪA từ vườn** (`inherited_from`, bản bổ sung 18/08) — một lần phun
 *   cả vườn là MỘT sự việc, không phải N sự việc trên N cây. Máy chủ kế thừa nó
 *   xuống cây, và phần nhìn phải phân biệt được, nếu không nông dân đọc thành
 *   "cây này được phun riêng 12 lần".
 *
 *   ⚠ Trường này CHƯA có trong `openapi.json` của bản đang chạy (đo 2026-08-18,
 *   commit `e5ffa3d` — `grep inherited` = 0). Nên mã dưới đây phải đúng ở CẢ HAI
 *   ca: chưa có trường ⇒ hành vi y như cũ; có trường ⇒ hiện nhãn "cả vườn". Không
 *   ca nào cần sửa lại.
 *
 * ══ CHỖ VẪN CHƯA CÓ CĂN CỨ ═══════════════════════════════════════════════
 * Số sự kiện hiện trước khi gộp, và bố cục (nằm trong tab "Lịch sử" hay tách
 * riêng). Cả hai vẫn chờ thân 200 thật / mắt người dựng. Đừng đọc tệp này như
 * thể đã chốt chúng.
 */

import type { TimelineEvent } from '../../../services/timelineService';

// ---------------------------------------------------------------------------
// Mục kế thừa từ vườn
// ---------------------------------------------------------------------------

/**
 * Sự việc này ghi ở VƯỜN rồi kế thừa xuống, hay là của chính thực thể này.
 *
 * Đọc `inherited_from` — máy chủ gắn khi kế thừa. Vắng mặt = của chính nó (và
 * cũng là ca của mọi bản máy chủ hiện tại, vì trường này chưa phát hành).
 */
export function inheritedFrom(ev: TimelineEvent | null | undefined): string | null {
  const raw = (ev as Record<string, unknown> | null)?.inherited_from;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  // Có bản gửi cả object `{entity_type, entity_id}` — nhận luôn, rẻ hơn là sửa sau.
  if (raw && typeof raw === 'object') {
    const id = (raw as Record<string, unknown>).entity_id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

/**
 * Mục kế thừa có được mang CHIP CHUỖI không: **không**.
 *
 * Chuỗi băm thuộc về bản ghi GỐC ở vườn. Bản sao kế thừa không mang chuỗi của
 * bản gốc, nên gắn chip "chuỗi liền mạch" lên nó là khẳng định một điều không ai
 * kiểm — đúng loại việc mà cả issue này lẫn `timelineService` đều cấm.
 */
export function showsChainChip(ev: TimelineEvent | null | undefined): boolean {
  return inheritedFrom(ev) === null;
}

// ---------------------------------------------------------------------------
// Tóm tắt một dòng từ `payload`
// ---------------------------------------------------------------------------

/** Nhãn Việt cho `activity_type` mà CHÍNH APP NÀY ghi (`syncDispatch.ts:37-42`). */
export const ACTIVITY_VI: Record<string, string> = {
  watering: 'Tưới nước',
  fertilizing: 'Bón phân',
  pesticide: 'Phun thuốc',
  harvesting: 'Thu hoạch',
};

/** Khoá ghi chú tự do — tên rõ nghĩa, an toàn để hiện thẳng. */
const NOTE_KEYS = ['note', 'ghi_chu', 'text', 'message', 'summary'] as const;

function firstString(p: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Tên các vật tư đã dùng, từ `materials[]`.
 *
 * Phần tử có thể là chuỗi, hoặc object có `name`/`ten`. Object không đọc được
 * thì BỎ phần tử đó — đừng để `[object Object]` lọt ra màn của nông dân.
 */
export function materialNames(p: Record<string, unknown>): string[] {
  const raw = p.materials;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const m of raw) {
    if (typeof m === 'string' && m.trim()) { out.push(m.trim()); continue; }
    if (m && typeof m === 'object') {
      const n = firstString(m as Record<string, unknown>, ['name', 'ten', 'label', 'product']);
      if (n) out.push(n);
    }
  }
  return out;
}

/**
 * Một dòng tóm tắt cho sự kiện. `null` = không có gì đáng nói.
 *
 * Thứ tự ưu tiên: ghi chú người dùng tự viết → việc đã làm kèm vật tư → số tệp
 * đính kèm. Ghi chú đứng đầu vì đó là câu do CON NGƯỜI viết cho người khác đọc;
 * mấy dòng còn lại là do máy dựng.
 */
export function summarise(ev: TimelineEvent | null | undefined): string | null {
  const p = ev?.payload;
  if (!p || typeof p !== 'object') {
    const n = Array.isArray(ev?.media) ? ev.media.length : 0;
    return n > 0 ? `${n} tệp đính kèm` : null;
  }
  const obj = p as Record<string, unknown>;

  const note = firstString(obj, NOTE_KEYS);
  if (note) return note;

  const act = typeof obj.activity_type === 'string' ? obj.activity_type : null;
  if (act) {
    const label = ACTIVITY_VI[act] ?? act;
    const mats = materialNames(obj);
    return mats.length > 0 ? `${label} · ${mats.join(', ')}` : label;
  }

  const mats = materialNames(obj);
  if (mats.length > 0) return mats.join(', ');

  const nMedia = Array.isArray(ev?.media) ? ev.media.length : 0;
  return nMedia > 0 ? `${nMedia} tệp đính kèm` : null;
}

// ---------------------------------------------------------------------------
// Ảnh đính kèm
// ---------------------------------------------------------------------------

/** Khoá có thể chứa đường dẫn ảnh trong một phần tử `media`. */
const MEDIA_URL_KEYS = ['url', 'uri', 'src', 'path', 'href'] as const;

/** Bao nhiêu ảnh bày ra một sự kiện. Quá số này thì hiện "+N". */
export const MEDIA_PREVIEW_MAX = 4;

/**
 * `media[]` → danh sách URL ĐẦY ĐỦ, sẵn sàng đưa vào `<RemoteImage>`.
 *
 * Nhận cả hai dạng mà không cần biết trước máy chủ trả dạng nào:
 *   · `"https://…"` hoặc `"file://…"` → giữ nguyên;
 *   · `"/gimg/abc"` → ghép base;
 *   · `{ url | uri | src | path | href: … }` → lấy khoá đầu tiên đọc được;
 *   · `{ cid: … }` → ghép `{base}/gimg/{cid}` (đường ảnh theo CID của OriLife).
 *
 * Phần tử không đọc được thì BỎ, không dựng một URL hỏng để rồi màn hiện ô vỡ.
 */
export function mediaUrls(
  media: unknown,
  baseUrl: string,
  max: number = MEDIA_PREVIEW_MAX,
): string[] {
  if (!Array.isArray(media)) return [];
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  const out: string[] = [];

  for (const m of media) {
    if (out.length >= max) break;
    let raw: string | null = null;

    if (typeof m === 'string') raw = m.trim() || null;
    else if (m && typeof m === 'object') {
      const o = m as Record<string, unknown>;
      raw = firstString(o, MEDIA_URL_KEYS);
      if (!raw) {
        const cid = firstString(o, ['cid']);
        if (cid) raw = `/gimg/${cid}`;
      }
    }
    if (!raw) continue;

    if (/^(https?:|file:|data:)/i.test(raw)) { out.push(raw); continue; }
    if (raw.startsWith('/')) { out.push(`${base}${raw}`); continue; }
    // Chuỗi không phải URL cũng không phải đường dẫn (ví dụ một mã trần) — BỎ.
    // Ghép bừa vào base là dựng một URL sai trông y như URL đúng.
  }
  return out;
}

/** Số ảnh còn lại sau khi cắt. `0` = không còn gì để nói. */
export function mediaOverflow(media: unknown, max: number = MEDIA_PREVIEW_MAX): number {
  if (!Array.isArray(media)) return 0;
  return Math.max(0, media.length - max);
}
