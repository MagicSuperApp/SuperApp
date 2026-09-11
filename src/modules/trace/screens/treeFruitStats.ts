/**
 * Bốn con số quả của một cây, cộng phần trăm thu hoạch — và luật "chưa biết".
 *
 * ── Vì sao tách ra khỏi màn ────────────────────────────────────────────────
 * Luật này quyết định thứ người ngoài vườn ĐỌC và CHÉP vào sổ. Để nó nằm trong
 * thân `TreeDetailScreen` thì muốn kiểm phải dựng cả màn — maplibre, camera,
 * GL — nên trên thực tế nó sẽ không được kiểm. Tách ra là điều kiện để có một
 * bài kiểm chạy được ở đúng ca đã hỏng.
 *
 * ── Luật, một câu ──────────────────────────────────────────────────────────
 * **`null` là "chưa biết". `0` là một số đo bằng không.** Hai thứ khác nhau,
 * và mọi ô hiển thị phải phân biệt được chúng.
 *
 * Ca đã hỏng: `getTreeLayout` trượt ⟹ `layout === null` ⟹ `layout?.fruits ?? []`
 * cho mảng rỗng ⟹ bốn ô hiện `0`, vòng tiến độ hiện `0%`. Không dấu hiệu nào
 * nói rằng app không hỏi được. Một cây chưa ai đếm và một cây đếm ra không quả
 * nào trình ra CÙNG một màn hình.
 */
import type { TreeLayoutResponse } from '../../../services/fruitReIDService';

export interface TreeFruitStats {
  /** `null` ⟺ chưa có số liệu. Không bao giờ là `0` vì lý do "chưa lấy được". */
  total: number | null;
  onTree: number | null;
  harvested: number | null;
  lost: number | null;
  /** 0..100, hoặc `null` khi chưa biết. */
  harvestPct: number | null;
}

/**
 * @param layout bản đồ quả từ máy chủ. `null`/`undefined` = lượt gọi CHƯA về
 *   hoặc đã HỎNG — đó là toàn bộ chỗ phân biệt hai cực.
 */
export function treeFruitStats(layout: TreeLayoutResponse | null | undefined): TreeFruitStats {
  if (layout == null) {
    return { total: null, onTree: null, harvested: null, lost: null, harvestPct: null };
  }

  const fruits = layout.fruits ?? [];
  const stats = layout.stats;
  // Máy chủ có số thì tin số của máy chủ; không có trường đó thì đếm tại chỗ
  // trên danh sách nó vừa gửi. Cả hai đường đều là số ĐÃ ĐO — khác hẳn nhánh
  // `layout == null` ở trên, nơi không có gì để đo.
  const dem = (tuServer: number | undefined, taiCho: () => number): number =>
    typeof tuServer === 'number' ? tuServer : taiCho();

  const total = dem(stats?.total, () => fruits.length);
  const onTree = dem(stats?.on_tree, () => fruits.filter(f => f.status === 'on_tree').length);
  const harvested = dem(stats?.harvested, () => fruits.filter(f => f.status === 'harvested').length);
  const lost = dem(stats?.lost, () => fruits.filter(f => f.status === 'lost').length);

  return {
    total,
    onTree,
    harvested,
    lost,
    // Cây đã đếm mà chưa thu quả nào thì `0%` là ĐÚNG — nó là một số đo. Chỗ
    // sai của bản cũ không phải con số 0, mà là dùng nó cả khi không đếm được.
    harvestPct: total > 0 ? Math.round((harvested / total) * 100) : 0,
  };
}
