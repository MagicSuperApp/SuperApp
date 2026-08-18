/**
 * fruitFind — LOGIC THUẦN của luồng "quét quả → ra cây".
 *
 * File THUẦN TÍNH (không import react-native / không gọi mạng) → test bằng jest.
 * Phần gọi máy chủ ở `services/fruitReIDService.ts`; màn `FruitScanScreen` chỉ vẽ.
 *
 * ── Điều quyết định toàn bộ thiết kế ở đây ──────────────────────────────────
 * Máy soi quả KHÔNG đủ chắc để tự trả lời. Số đo trên kho của OriLife
 * (`booth.py:60-70`, thư 08/08 §1) ở đúng ngưỡng đang chạy (0,72):
 *
 *     nhận đúng 83,3% cặp CÙNG một quả
 *     nhận NHẦM 73,0% (412/564) cặp quả KHÁC NHAU trên CÙNG MỘT CÂY
 *     siết tới 0,9067 mới hết nhầm — ở đó chỉ còn giữ 7,8% quả thật
 *     rank-1 tốt nhất 0,69  ·  rank-5 = 0,92–0,95  ← con số dùng được DUY NHẤT
 *
 * Và nhãn thật trên prod: hệ nói `MATCH` thì đúng **19/37 = 51,4%**.
 *
 * Nên ba luật dưới đây KHÔNG phải tuỳ chọn giao diện, chúng là hệ quả của số đo:
 *
 *   1. `decision` không bao giờ là câu trả lời — luôn bày danh sách để người chọn.
 *   2. Không dấu tích xanh cho `MATCH`. Ở 51,4% thì dấu tích là nói dối khoảng
 *      một nửa số lần, và nói dối theo đúng hướng nông dân sẽ tin.
 *   3. Bày TOP-5, không bày top-1. Chỉ ở rank-5 con số mới dùng được.
 *
 * ── Quả đã hái vẫn phải hiện ────────────────────────────────────────────────
 * Người tiêu dùng quét một quả đã hái ngoài chợ là ca dùng ĐÚNG — lọc nó đi là
 * chặn chính đường truy xuất nguồn gốc. Chỉ hiện nhãn vòng đời cho đúng.
 */

import { fromGpsPair, nearestFixes, type LatLon } from '../wayfind/wayfind';
import type {
  FruitDecision, FruitStatus, IdentifiedFruitCandidate,
} from '../../services/fruitReIDService';

/** Cây tối thiểu mà luồng này cần biết (khớp `TreeInfo` của treeReIDService). */
export interface FindableTree {
  tree_id: string;
  name?: string;
  gps?: [number, number] | null;
}

/**
 * Bày bao nhiêu ứng viên. NĂM, vì rank-5 (0,92–0,95) là điểm vận hành duy nhất
 * dùng được; rank-1 tốt nhất mới 0,69. Đây là con số đo được, không phải thẩm mỹ.
 */
export const TOP_N = 5;

/**
 * Bán kính coi là "cây quanh chỗ đứng" (mét), dùng để tra cây cho ứng viên và
 * để gợi ý cây khi máy không soi ra gì.
 *
 * 60 m chứ không phải 15 m: sai số GPS dưới tán dày thường 15–25 m, mà toạ-độ
 * cây cũng được ghi bằng chính loại GPS đó nên sai số CỘNG DỒN hai đầu. Siết
 * chặt là loại mất đúng cây đang đứng cạnh.
 */
export const NEARBY_RADIUS_M = 60;

/** Tra cây cho ứng viên bằng bao nhiêu cây gần nhất (mỗi cây 1 lượt GET rẻ). */
export const TREE_INDEX_LIMIT = 6;

/** Cây quanh chỗ đứng, gần → xa. Không có vị-trí → mảng rỗng (KHÔNG đoán bừa). */
export function nearbyTrees(
  here: LatLon | null,
  trees: readonly FindableTree[],
  opts?: { radiusM?: number; limit?: number },
): Array<{ tree: FindableTree; distanceM: number }> {
  if (!here) return [];
  return nearestFixes(here, trees, t => fromGpsPair(t.gps), {
    maxMeters: opts?.radiusM ?? NEARBY_RADIUS_M,
    limit: opts?.limit ?? TREE_INDEX_LIMIT,
  }).map(f => ({ tree: f.item, distanceM: f.distanceM }));
}

/** Bao nhiêu cây trong danh sách có toạ-độ dùng được. */
export function countPositionedTrees(trees: readonly FindableTree[]): number {
  return trees.reduce((n, t) => (fromGpsPair(t.gps) ? n + 1 : n), 0);
}

// ---------------------------------------------------------------------------
// Tra CÂY cho từng ứng viên
// ---------------------------------------------------------------------------

/** `fruit_id` → cây, dựng từ `GET /api/fruit/list?tree_id=` của các cây gần đó. */
export type FruitTreeIndex = Map<string, { treeId: string; treeName: string | null }>;

/** Gộp các danh sách quả theo cây thành một bảng tra `fruit_id → cây`. */
export function buildFruitTreeIndex(
  lists: ReadonlyArray<{
    treeId: string;
    treeName?: string | null;
    fruitIds: readonly string[];
  }>,
): FruitTreeIndex {
  const idx: FruitTreeIndex = new Map();
  for (const l of lists) {
    for (const fid of l.fruitIds) {
      // Quả đã gặp thì GIỮ cây đầu tiên: bảng dựng theo thứ tự cây GẦN → XA, nên
      // cây đầu là cây gần chỗ đứng nhất. Ghi đè là đẩy kết quả ra xa người dùng.
      if (!idx.has(fid)) idx.set(fid, { treeId: l.treeId, treeName: l.treeName ?? null });
    }
  }
  return idx;
}

/** Một ứng viên đã bày ra được màn hình. */
export interface ResolvedCandidate {
  fruitId: string;
  name: string | null;
  nViews: number;
  thumbnailUrl: string | null;
  status: FruitStatus | null;
  treeId: string | null;
  treeName: string | null;
  /** Cây tra được từ đâu — để màn hình nói đúng mức chắc chắn. */
  treeSource: 'server' | 'nearby_index' | 'unknown';
}

/**
 * Gắn cây vào từng ứng viên: ưu tiên cây MÁY CHỦ trả, thiếu thì tra bảng cây gần
 * đó, vẫn thiếu thì để `unknown` — KHÔNG suy ra cây gần nhất rồi gán bừa. Gán sai
 * một lần là hồ sơ quả sai vĩnh viễn, mà người dùng không có cách nào biết.
 *
 * 15/08: OriLife xác nhận `identify` LUÔN trả `tree_id` (`server.py:6534-6536`),
 * nên nhánh `nearby_index` nay là lưới cho ca máy chủ tụt bản, không phải đường
 * chính. Lý do giữ thay vì xoá: xem chú thích ở `FruitScanScreen.tsx` (`buildIndex`).
 *
 * Kèm theo đó, nỗi lo cũ "quả ở cây ngoài 60 m, người mua quét ngoài chợ" tự tan:
 * máy chủ xếp hạng trên TOÀN kho của chủ sở hữu, không theo bán kính nào — thứ mà
 * bảng tra theo chỗ đứng không bao giờ có.
 */
export function resolveCandidates(
  candidates: readonly IdentifiedFruitCandidate[],
  index: FruitTreeIndex,
): ResolvedCandidate[] {
  return candidates.map((c): ResolvedCandidate => {
    const fromIdx = index.get(c.fruit_id);
    const treeId = c.tree_id ?? fromIdx?.treeId ?? null;
    const treeSource: ResolvedCandidate['treeSource'] =
      c.tree_id ? 'server' : fromIdx ? 'nearby_index' : 'unknown';
    return {
      fruitId: c.fruit_id,
      name: c.name ?? null,
      nViews: c.n_views ?? 0,
      thumbnailUrl: c.thumbnail_url ?? null,
      status: c.status ?? null,
      treeId,
      treeName: c.tree_name ?? fromIdx?.treeName ?? null,
      treeSource,
    };
  });
}

/**
 * Cắt còn TOP-5 và GIỮ NGUYÊN thứ tự máy chủ.
 *
 * Không xếp lại theo `status`, không đẩy quả đã hái xuống, không lọc gì cả: máy
 * chủ xếp theo độ giống, đó là thông tin duy nhất có ở đây, và người quét quả đã
 * hái ngoài chợ là ca dùng đúng.
 */
export function topCandidates(list: readonly ResolvedCandidate[], n: number = TOP_N): ResolvedCandidate[] {
  return list.slice(0, n);
}

/** Các cây RIÊNG BIỆT mà top-N chạm tới — "quả này ở cây nào" nhìn theo cây. */
export function distinctTrees(list: readonly ResolvedCandidate[]): Array<{ treeId: string; treeName: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ treeId: string; treeName: string | null }> = [];
  for (const c of list) {
    if (!c.treeId || seen.has(c.treeId)) continue;
    seen.add(c.treeId);
    out.push({ treeId: c.treeId, treeName: c.treeName });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kết cục của một lượt soi
// ---------------------------------------------------------------------------

export type ScanOutcome =
  /** Có danh sách để chọn. Đây là ca BÌNH THƯỜNG, kể cả khi decision là MATCH. */
  | 'pick'
  /** Máy đã soi và không đưa ra ứng viên nào → mời đăng ký quả mới. */
  | 'nothing_found'
  /** Máy chủ nói MATCH nhưng KHÔNG kèm danh sách (bản cũ) → không có gì để chọn. */
  | 'match_without_list'
  /** Gọi hỏng — chưa soi được gì. KHÁC HẲN "không tìm thấy". */
  | 'failed';

/**
 * Phân ca kết cục. Bốn ca vì mỗi ca phải nói một câu KHÁC NHAU với nông dân —
 * gộp lại là hoặc dối, hoặc bỏ họ giữa đường:
 *
 *   pick               → bày danh sách, để người chọn
 *   nothing_found      → "chưa thấy quả nào giống" → mời đăng ký quả mới
 *   match_without_list → máy nói chắc nhưng không cho danh sách. KHÔNG được dựa
 *                        vào `decision` để chốt (đúng 51,4%): nói thẳng là chưa
 *                        chọn được, rồi mời đi đường chọn-cây-trước.
 *   failed             → mạng/máy chủ hỏng → mời thử lại. KHÔNG phải "quả mới";
 *                        gọi nó là quả mới thì nông dân đăng ký trùng một hồ sơ
 *                        đã có, và không ai gộp lại được nữa.
 */
export function outcomeOfScan(
  ok: boolean,
  decision: FruitDecision | undefined,
  candidateCount: number,
): ScanOutcome {
  if (!ok) return 'failed';
  if (candidateCount > 0) return 'pick';
  return decision === 'MATCH' ? 'match_without_list' : 'nothing_found';
}

/**
 * Có được phép hiện nút "đúng quả / không phải" không.
 *
 * CHỈ khi có `query_id`, vì đó là neo duy nhất máy chủ nhận
 * (`/api/fruit/identify_verdict` không có tham số `fruit_id`). Vào bằng cửa
 * `candidates` thì chưa có neo — ẩn nút, đừng bịa.
 */
export function canSendVerdict(queryId: string | undefined | null): queryId is string {
  return typeof queryId === 'string' && queryId.length > 0;
}
