/**
 * provenanceView — đọc hồ sơ xuất xứ ra những mảnh MÀN HÌNH cần.
 *
 * Tệp thuần tính, tách khỏi màn để test được không cần mạng.
 *
 * ══ MỌI TỆP ĐỀU LẤY QUA `lampnet_view` ═══════════════════════════════════
 * Hồ sơ chỉ trả `cid`, không trả URL. Đường xem là `{lampnet_view}/{cid}` —
 * đúng như thân thật đo được 19/08:
 *
 *   lampnet_view = "https://lampnet.cloud"
 *   images[1].cid = "ln1q_1c5d971864734cb3_file"
 *   ⇒ https://lampnet.cloud/ln1q_1c5d971864734cb3_file
 *
 * Ảnh và model 3D dùng CÙNG một quy tắc, khác nhau ở chỗ lấy `cid` từ đâu. Nên
 * đừng đóng cứng `https://lampnet.cloud` ở bất kỳ đâu: `lampnet_view` là trường
 * máy chủ gửi, và ngày nó đổi (hoặc trỏ sang cổng riêng của một tổ chức) thì mọi
 * ảnh phải đi theo, không phải một nửa.
 */

import { tf } from '../../i18n';
import { imageViewUrl, type Provenance } from '../../services/provenanceService';
import { isValidLatLon } from '../wayfind/wayfind';

/** Model 3D trong hồ sơ. Trường đọc từ thân thật, đo 2026-08-19. */
export interface Model3d {
  format?: string;
  cid?: string;
  n_points?: number;
  n_cams?: number;
  coverage?: {
    covered_deg?: number;
    max_gap_deg?: number;
    full?: boolean;
    /** Câu tiếng Việt của MÁY CHỦ. Hiện thẳng, đừng tự soạn lại. */
    advice?: string;
  };
  /**
   * Phán quyết của máy chủ về đám mây điểm (OriLife PR #445, CHƯA gộp lúc viết).
   *
   * `low_confidence` — có bản dựng thì LUÔN có phán quyết; 0 điểm là fail-closed
   * `true`. Trường VẮNG = máy chủ bản cũ, và vắng KHÔNG có nghĩa là "đáng tin".
   *
   * ⛔ `n_points_scene` CỐ Ý không khai ở đây. OriLife nói rõ nó có thể là `null`
   * = KHÔNG BIẾT, và làn cây không đo số này lần nào. Khai ra là mời người sau
   * dựng tỉ lệ `n_points / n_points_scene` — tỉ lệ đó ra 1,00 ("tách nền hoàn
   * hảo") cho đúng cái làn không lọc nền một lần nào.
   */
  trust?: {
    low_confidence?: boolean;
  };
  [k: string]: unknown;
}

export function model3dOf(p: Provenance | null | undefined): Model3d | null {
  const m = p?.model3d;
  return m && typeof m === 'object' ? (m as Model3d) : null;
}

/**
 * Đường tải model 3D. `null` khi không có, hoặc khi ĐỊNH DẠNG không đọc được.
 *
 * Chỉ nhận `ply` vì đó là định dạng bộ xem đang giải mã được. Trả URL cho một
 * định dạng lạ nghĩa là tải về vài trăm KB rồi hỏng lặng lẽ ở khâu giải mã —
 * người dùng thấy một ô quay mãi không ra gì.
 */
export function model3dUrl(p: Provenance | null | undefined): string | null {
  const m = model3dOf(p);
  const fmt = typeof m?.format === 'string' ? m.format.toLowerCase() : '';
  if (fmt !== 'ply') return null;
  return imageViewUrl(p, typeof m?.cid === 'string' ? m.cid : null);
}

/** Mọi ảnh trong hồ sơ, đã quy về URL đầy đủ. Ảnh thiếu `cid` bị bỏ. */
export function galleryUrls(p: Provenance | null | undefined): string[] {
  const imgs = Array.isArray(p?.images) ? p.images : [];
  const out: string[] = [];
  for (const im of imgs) {
    const u = imageViewUrl(p, typeof im?.cid === 'string' ? im.cid : null);
    if (u) out.push(u);
  }
  return out;
}

/**
 * Toạ độ để vẽ lên bản đồ. `null` khi hồ sơ không có.
 *
 * ⚠ Đây có thể là toạ độ ĐÃ LÀM THÔ. Nơi vẽ PHẢI hỏi `gpsPrecision` trước khi
 * quyết vẽ ghim hay vẽ vòng — xem `provenanceService.canPinExactly`. Hàm này chỉ
 * đọc số, không có ý kiến gì về độ chính xác.
 */
export function gpsPoint(p: Provenance | null | undefined): { lat: number; lon: number } | null {
  const g = p?.gps;
  if (!Array.isArray(g) || g.length < 2) return null;
  const [lat, lon] = g;
  // Dải đã ép sẵn; `isValidLatLon` thêm nốt ràng buộc còn thiếu — loại `0/0`,
  // giá trị máy sinh ra khi chưa có định vị. Một ghim ở Vịnh Guinea trên màn
  // truy xuất đọc ra "quả này đến từ ngoài khơi châu Phi".
  return isValidLatLon({ lat, lon }) ? { lat, lon } : null;
}

/**
 * Câu về độ phủ của model. `null` = máy chủ không nói gì.
 *
 * Ưu tiên `advice` của máy chủ — nó biết vì sao model thưa (mới chụp một phía,
 * hay thiếu góc trên). App chỉ ghép thêm con số độ phủ cho gọn.
 */
export function coverageLine(p: Provenance | null | undefined): string | null {
  const cov = model3dOf(p)?.coverage;
  if (!cov) return null;
  const advice = typeof cov.advice === 'string' ? cov.advice.trim() : '';
  if (advice) return advice;
  const deg = cov.covered_deg;
  if (typeof deg === 'number' && Number.isFinite(deg)) {
    return tf('Đã chụp khoảng {deg}° quanh cây.', { deg: Math.round(deg) });
  }
  return null;
}

/**
 * Máy chủ có tự khai đám mây điểm này thưa không.
 *
 * Ba giá trị, không phải hai: `true` (máy chủ khai thưa) · `false` (máy chủ khai
 * đủ dày) · `null` (máy chủ KHÔNG nói). Gộp `null` vào `false` là biến "chưa biết"
 * thành một lời trấn an mà không ai phát ra.
 */
export function lowConfidenceOf(p: Provenance | null | undefined): boolean | null {
  const v = model3dOf(p)?.trust?.low_confidence;
  return typeof v === 'boolean' ? v : null;
}

export interface AnchorView {
  /** `confirmed` · `pending` · … — tên do máy chủ đặt. */
  status: string | null;
  /** Băm giao dịch, rút gọn để đọc được trên một dòng. */
  txShort: string | null;
  txFull: string | null;
  network: string | null;
  /** URL trình duyệt chuỗi, ĐÃ LỌC — chỉ http(s). */
  explorer: string | null;
  submittedAt: string | null;
}

/** Rút gọn băm: `9d7e54a6…22980b09`. Chuỗi ngắn thì để nguyên. */
export function shortHash(h: string | null | undefined, keep = 8): string | null {
  const s = typeof h === 'string' ? h.trim() : '';
  if (!s) return null;
  if (s.length <= keep * 2 + 1) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

/**
 * Khối neo on-chain. `null` khi hồ sơ không có `anchor`.
 *
 * `explorer_url` do máy chủ gửi và app đem thẳng vào `Linking.openURL`, nên nó
 * đi qua bộ lọc: chỉ `http`/`https`. Không lọc thì một trường JSON đẩy được
 * `javascript:` hay deep-link của app khác vào tay người dùng.
 */
export function anchorView(p: Provenance | null | undefined): AnchorView | null {
  const a = p?.anchor;
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const str = (k: string): string | null => {
    const v = o[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const raw = str('explorer_url');
  const explorer = raw && /^https?:\/\//i.test(raw) ? raw : null;
  const txFull = str('tx_hash') ?? str('txid');
  return {
    status: str('status'),
    txFull,
    txShort: shortHash(txFull),
    network: str('network'),
    explorer,
    submittedAt: str('submitted_at'),
  };
}

// ---------------------------------------------------------------------------
// Người mua hỏi gì trước — "của ai", "ở đâu", "đã trải qua những gì"
// ---------------------------------------------------------------------------

/**
 * Tên chủ vườn. **Đo 2026-08-19: cửa công khai KHÔNG trả trường nào về chủ.**
 *
 * `_public_prov` là allowlist, và danh sách đo được trên thân thật gồm đúng:
 * `anchor · code · created_at · embedding_hash · gps · images · lampnet_base ·
 * lampnet_pending · lampnet_view · model3d · n_views · name · record_cid ·
 * record_hash · tree_id`. Không có `owner`, không có `farm`.
 *
 * Vẫn giữ hàm này, và vẫn ĐỌC nhiều tên trường, vì hai lẽ:
 *   · ngày máy chủ mở thêm `owner_name` (hoặc `farm_name`) thì màn hiện ra ngay,
 *     không phải chờ một bản app khác;
 *   · và nó buộc chỗ gọi phải xử lý nhánh `null` — tức phải NÓI RA rằng máy chủ
 *     không công khai chủ vườn, thay vì lặng lẽ bỏ trống một ô mà người mua đang
 *     tìm đúng nó.
 *
 * Tuyệt đối không lấy `author_did` của dòng thời gian đắp vào đây: DID là một
 * chuỗi băm, không phải tên người, và hiện nó ra chỉ làm ô "chủ vườn" trông như
 * đã có câu trả lời.
 */
export function ownerLine(p: Provenance | null | undefined): string | null {
  if (!p) return null;
  const o = p as unknown as Record<string, unknown>;
  for (const k of ['owner_name', 'owner', 'farm_name', 'farm']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const n = (v as Record<string, unknown>).name;
      if (typeof n === 'string' && n.trim()) return n.trim();
    }
  }
  return null;
}

/** Một mốc trong đời cây, dựng từ CHÍNH hồ sơ xuất xứ. */
export interface Milestone {
  key: string;
  /** ISO của máy chủ. `null` = có việc nhưng không có mốc thời gian. */
  at: string | null;
  title: string;
  note: string | null;
}

/**
 * Hai mốc mà hồ sơ công khai LUÔN mang theo: ngày ghi nhận, và lượt neo lên chuỗi.
 *
 * Vì sao cần: dòng thời gian đầy đủ (`/api/{type}/{id}/timeline`) đòi phiên đăng
 * nhập — đo 19/08 trả `401 {"error":"Cần đăng nhập."}` cho khách. Người mua quét
 * mã trên bao bì thì KHÔNG có phiên, nên với họ khối dòng thời gian rỗng.
 *
 * Hai mốc này không thay được dòng thời gian, và màn phải nói rõ chúng đến từ hồ
 * sơ xuất xứ chứ không phải từ nhật ký chăm sóc. Nhưng chúng có thật, có ngày
 * tháng, và trả lời được câu "cây này có từ bao giờ" — hơn một khối trống.
 */
export function milestones(p: Provenance | null | undefined): Milestone[] {
  if (!p) return [];
  const out: Milestone[] = [];

  const nViews = typeof p.n_views === 'number' && Number.isFinite(p.n_views)
    ? p.n_views
    : (Array.isArray(p.images) ? p.images.length : null);

  if (typeof p.created_at === 'string' && p.created_at.trim()) {
    out.push({
      key: 'enroll',
      at: p.created_at,
      title: 'Đăng ký vào hệ thống',
      // Gọi ĐÚNG TÊN con số: đây là số GÓC lúc đăng ký, không phải số bằng chứng
      // tích luỹ theo thời gian. Gọi sai là làm hồ sơ trông dày hơn thực tế.
      note: nViews === null ? null : `Chụp ${nViews} góc làm dấu nhận dạng`,
    });
  }

  const a = anchorView(p);
  if (a && (a.submittedAt || a.txShort)) {
    out.push({
      key: 'anchor',
      at: a.submittedAt,
      title: a.status === 'confirmed' ? 'Đã neo lên chuỗi khối' : 'Gửi neo lên chuỗi khối',
      note: a.network ? `Mạng ${a.network}` : null,
    });
  }

  // Cũ trước, mới sau — đây là ĐỜI CÂY kể xuôi, khác dòng thời gian chăm sóc
  // (mới nhất trước). Người mua đọc một tiểu sử, không đọc một bảng tin.
  return out.sort((x, y) => {
    const tx = x.at ? Date.parse(x.at) : NaN;
    const ty = y.at ? Date.parse(y.at) : NaN;
    if (Number.isNaN(tx) || Number.isNaN(ty)) return 0;
    return tx - ty;
  });
}

/**
 * Nhãn niềm tin hiện ngay dưới tên cây. Ba nhánh, không hai.
 *
 * `isAnchored` trả `null` khi máy chủ không nói gì về `anchor` — và "chưa neo"
 * với "không biết" là hai câu khác nhau. Người mua đọc "chưa neo" sẽ nghĩ chủ
 * vườn lười; đọc đúng "máy chủ chưa cho biết" thì họ biết là app đang thiếu tin.
 */
export function trustBadge(anchored: boolean | null): { text: string; tone: 'ok' | 'warn' | 'dim' } {
  if (anchored === true) return { text: 'Hồ sơ đã neo lên chuỗi khối', tone: 'ok' };
  if (anchored === false) return { text: 'Hồ sơ chưa neo lên chuỗi khối', tone: 'warn' };
  return { text: 'Máy chủ chưa cho biết đã neo hay chưa', tone: 'dim' };
}
