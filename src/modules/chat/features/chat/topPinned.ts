/**
 * Tin nào hiện trên thanh "đang ghim" — theo thứ tự MÁY CHỦ, không theo thời gian.
 *
 * ── Trục sai mà chỗ này từng đo bằng ─────────────────────────────────────────
 *
 * Bản trước lấy `pinned[pinned.length - 1]`: phần tử CUỐI của danh sách tin nhắn
 * đã lọc, tức tin ghim **mới nhất theo thời gian**. Nhưng máy chủ không sắp theo
 * thời điểm ghim — nó sắp theo thứ tự người dùng kéo thả, và khai rõ **phần tử
 * ĐẦU là ghim trên cùng** (`ProofChat/FE` ▸ `app/api/messages/messagePinService.ts:45`,
 * đọc trên `origin/main`). Nhà FE đã vá đúng lỗi này ở `91666eb` (2026-09-18) với
 * chẩn đoán nguyên văn: *"đó là nhầm trục"*.
 *
 * Đây là loại sai KHÔNG tự lộ ra: khi chỉ có một tin được ghim thì hai cách đọc
 * cho cùng kết quả, và khi người dùng chưa kéo thả bao giờ thì thứ tự máy chủ
 * tình cờ trùng thứ tự thời gian. Nó chỉ sai đúng lúc người dùng vừa cất công sắp
 * lại — tức đúng lúc họ quan tâm nhất tới thứ tự.
 *
 * ── Vì sao vẫn có đường lùi ─────────────────────────────────────────────────
 *
 * `order` đến từ máy chủ nên có thể rỗng (chưa đồng bộ lần nào) hoặc chứa mã tin
 * không còn trong danh sách đang hiển thị (tin bị xoá, hoặc nằm ngoài trang đã
 * tải). Lúc đó KHÔNG được trả về rỗng và cũng không được đoán — thanh ghim biến
 * mất trong khi tin vẫn đang được ghim là một câu nói sai về hệ. Đường lùi là tin
 * ĐẦU danh sách đã lọc, và nó được ghi ra ở đây chứ không giấu trong toán tử `??`.
 */

/** Chỉ cần bấy nhiêu để xếp thứ tự; màn hình truyền cả tin nhắn vào vẫn khớp. */
export interface CoMaTin {
  id: string;
}

export function topPinned<T extends CoMaTin>(
  pinned: readonly T[],
  order: readonly string[] | undefined,
): T | undefined {
  if (pinned.length === 0) return undefined;
  for (const id of order ?? []) {
    const tim = pinned.find(p => p.id === id);
    if (tim) return tim;
  }
  return pinned[0];
}
