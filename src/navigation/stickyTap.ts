/**
 * stickyTap — MỘT cú chạm ở chế độ DÍNH thì nên làm gì.
 *
 * ── Vì sao tách ra khỏi `navigation/index.tsx` ──────────────────────────────
 * Quy tắc này quyết định người dùng có với tới được tầng 2 hay không, mà nó nằm
 * lẫn trong một tệp 1.700 dòng đầy PanResponder và toạ-độ cung — chỗ `jest` không
 * dựng nổi. Tách thành hàm THUẦN thì khoá được bằng bảng số.
 *
 * ── Bệnh đang chữa ──────────────────────────────────────────────────────────
 * Cung xoè có HAI cách mở: KÉO (thả để chọn) và CHẠM (dính, chạm để chọn). Tầng 2
 * — nơi chứa "Quét cây", "Quét con vật", "Quét nhãn thuốc" — trước bản này CHỈ tới
 * được bằng cử chỉ kéo HAI CHẶNG: kéo tới mục cha, GIỮ 0,5 giây cho arc con bung
 * ra, rồi kéo tiếp ra vòng ngoài mới thả. Ai không làm nổi cử chỉ đó thì không có
 * đường nào khác: `SUB_ACTIONS.Farms` là lối vào DUY NHẤT của `TreeIdentity` trong
 * cung (`resolveGateItems.ts`), và chạm vào "Trang trại" ở chế độ dính chỉ mở màn
 * danh sách vườn.
 *
 * ── Quy tắc, đúng hai dòng ──────────────────────────────────────────────────
 * Chạm mục CÓ arc con  → bung arc con (vẫn dính, vẫn chạm để chọn).
 * Chạm lại chính mục đó khi arc con ĐANG mở → chạy hành động của nó như cũ.
 *
 * Nhờ dòng thứ hai mà KHÔNG mất gì: màn chính của module vẫn tới được bằng chạm,
 * chỉ là mất thêm một cú. Đổi lại năm hành động trước nay không ai với tới được
 * thì nay tới được bằng hai cú chạm thường.
 *
 * Cử chỉ KÉO không đụng tới — hàm này chỉ được gọi ở nhánh dính.
 */

/** Mục tầng 1 mà cú chạm rơi vào — chỉ cần biết nó có arc con hay không. */
export interface StickyTapItem {
  /** Có hành động nhanh tầng 2 (`GateItem.subActions` không rỗng). */
  hasSub?: boolean;
}

export type StickyTapResult =
  /** Bung arc con của mục `index`. */
  | { kind: 'openSub'; index: number }
  /** Chạy hành động của mục `index` (mở module) — như hành vi cũ. */
  | { kind: 'run'; index: number };

/**
 * @param item   mục vừa bị chạm
 * @param index  vị trí của nó trên cung
 * @param level  tầng đang hiện (1 = cung chính, 2 = đang mở arc con)
 * @param parent mục đang mở arc con (-1 khi chưa mở)
 */
export function stickyTapAction(
  item: StickyTapItem | undefined,
  index: number,
  level: 1 | 2,
  parent: number,
): StickyTapResult {
  // Chạm lại đúng mục đang mở arc con = "tôi muốn chính module này", không phải
  // hành động nhanh nào cả. Đây là đường thoát để không mất màn chính của module.
  if (level === 2 && parent === index) return { kind: 'run', index };
  if (item?.hasSub) return { kind: 'openSub', index };
  return { kind: 'run', index };
}
