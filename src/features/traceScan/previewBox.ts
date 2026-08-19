/**
 * previewBox — quy VÙNG MÁY CHỦ TRẢ VỀ (pixel ảnh) về ô vuông xem trực tiếp (dp).
 *
 * Tệp thuần tính. Đây là phần dễ sai nhất của màn quét: sai ở đây thì khung
 * nhận diện lệch khỏi quả — người dùng thấy máy khoanh vào chỗ trống và kết luận
 * app hỏng, dù máy chủ đã trả đúng.
 *
 * ── Ba hệ toạ độ, không được lẫn ────────────────────────────────────────────
 *   1. ẢNH GỬI ĐI — tấm đã CẮT VUÔNG và co nhỏ trước khi tải lên (xem
 *      `prepareImage`). `bbox` máy chủ trả về đo trên CHÍNH tấm này, không phải
 *      tấm gốc của máy ảnh. Cầm nhầm kích thước gốc vào đây là lệch đúng bằng tỉ
 *      lệ co.
 *   2. KHUNG XEM — ô vuông giữa màn, đơn vị dp.
 *   3. Khung bày ảnh theo lối `cover` — phóng cho phủ kín rồi CẮT hai bên. Phải
 *      trừ đúng phần bị cắt, nếu không mọi hộp trôi đều sang một phía.
 *
 * Từ bản cắt-vuông trở đi thì (1) và (2) CÙNG tỉ lệ 1:1, nên phép `cover` gần
 * như thành phép nhân thẳng. Vẫn giữ công thức đầy đủ: ngày nào bỏ bước cắt
 * vuông, hoặc ảnh lấy từ thư viện (không cắt), thì nó vẫn đúng.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** `[x, y, w, h]` theo pixel của tấm ảnh ĐÃ GỬI ĐI. */
export type PixelBbox = [number, number, number, number];

export interface Size { w: number; h: number }

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Hộp pixel ảnh → hộp dp trên khung xem, theo luật `cover`.
 *
 * Trả `null` khi thiếu số hoặc số vô nghĩa — nơi gọi bỏ hộp đó đi. Vẽ một hộp
 * dựng từ `NaN` là vẽ một ô nhấp nháy ở góc trên trái mà không ai đoán nổi từ đâu.
 *
 * Hộp bị cắt về trong lòng khung xem: phần quả nằm ngoài mép sau khi cắt `cover`
 * thì người dùng KHÔNG nhìn thấy, nên khoanh ra đó là khoanh vào chỗ họ không có
 * gì để đối chiếu.
 */
export function imageBoxToPreview(
  bbox: PixelBbox | null | undefined,
  image: Size | null | undefined,
  view: Size | null | undefined,
): Rect | null {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [bx, by, bw, bh] = bbox;
  if (!fin(bx) || !fin(by) || !fin(bw) || !fin(bh)) return null;
  if (bw <= 0 || bh <= 0) return null;
  if (!image || !fin(image.w) || !fin(image.h) || image.w <= 0 || image.h <= 0) return null;
  if (!view || !fin(view.w) || !fin(view.h) || view.w <= 0 || view.h <= 0) return null;

  const scale = Math.max(view.w / image.w, view.h / image.h);
  const offX = (view.w - image.w * scale) / 2;
  const offY = (view.h - image.h * scale) / 2;

  const cx0 = Math.max(0, Math.min(view.w, bx * scale + offX));
  const cy0 = Math.max(0, Math.min(view.h, by * scale + offY));
  const cx1 = Math.max(0, Math.min(view.w, (bx + bw) * scale + offX));
  const cy1 = Math.max(0, Math.min(view.h, (by + bh) * scale + offY));

  const w = cx1 - cx0;
  const h = cy1 - cy0;
  // Cắt xong mà không còn gì ⇒ quả nằm hẳn ngoài phần đang nhìn thấy.
  if (w <= 0 || h <= 0) return null;
  return { x: cx0, y: cy0, w, h };
}

/** Ngược lại: người dùng chạm lên khung xem → điểm đó ở pixel nào của ảnh. */
export function previewPointToImage(
  point: { x: number; y: number },
  image: Size | null | undefined,
  view: Size | null | undefined,
): { x: number; y: number } | null {
  if (!point || !fin(point.x) || !fin(point.y)) return null;
  if (!image || !fin(image.w) || !fin(image.h) || image.w <= 0 || image.h <= 0) return null;
  if (!view || !fin(view.w) || !fin(view.h) || view.w <= 0 || view.h <= 0) return null;

  const scale = Math.max(view.w / image.w, view.h / image.h);
  const offX = (view.w - image.w * scale) / 2;
  const offY = (view.h - image.h * scale) / 2;
  return { x: (point.x - offX) / scale, y: (point.y - offY) / scale };
}

/**
 * Hộp nào chứa điểm này. `-1` = không hộp nào. Hộp NHỎ NHẤT thắng khi chồng nhau.
 *
 * Hai quả chồng nhau thì người ta nhắm vào quả nhỏ hơn — quả to đã dễ trúng ở
 * khắp phần còn lại của nó rồi.
 */
export function hitTest(rects: readonly (Rect | null)[], point: { x: number; y: number }): number {
  let best = -1;
  let bestArea = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!r) continue;
    if (point.x < r.x || point.x > r.x + r.w || point.y < r.y || point.y > r.y + r.h) continue;
    const area = r.w * r.h;
    if (area < bestArea) { bestArea = area; best = i; }
  }
  return best;
}

/** Tâm hộp. */
export function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Gán hộp MỚI vào các ô vẽ CŨ sao cho mỗi khung trôi tới chỗ gần nhất.
 *
 * Máy chủ không hứa giữ nguyên thứ tự `regions` giữa hai lượt. Gán theo chỉ số
 * thì lượt sau quả A rơi vào ô đang vẽ quả B: hai khung BAY CHÉO qua nhau giữa
 * màn hình, đúng lúc người dùng đang cố chạm vào một quả. Gán theo TÂM GẦN NHẤT
 * thì mỗi khung nhích một đoạn ngắn.
 *
 * Tham lam theo cặp gần nhất trước; phá hoà bằng chỉ số để kết quả TẤT ĐỊNH.
 */
export function matchSlots(
  prev: readonly (Rect | null)[],
  next: readonly Rect[],
  slots: number = Math.max(prev.length, next.length),
): (Rect | null)[] {
  const out: (Rect | null)[] = new Array(slots).fill(null);
  const takenSlot = new Set<number>();
  const usedNext = new Set<number>();

  const pairs: Array<{ slot: number; idx: number; d: number }> = [];
  for (let s = 0; s < Math.min(prev.length, slots); s++) {
    const p = prev[s];
    if (!p) continue;
    const pc = centerOf(p);
    for (let i = 0; i < next.length; i++) {
      const nc = centerOf(next[i]);
      pairs.push({ slot: s, idx: i, d: Math.hypot(pc.x - nc.x, pc.y - nc.y) });
    }
  }
  pairs.sort((a, b) => a.d - b.d || a.slot - b.slot || a.idx - b.idx);

  for (const p of pairs) {
    if (takenSlot.has(p.slot) || usedNext.has(p.idx)) continue;
    takenSlot.add(p.slot);
    usedNext.add(p.idx);
    out[p.slot] = next[p.idx];
  }

  for (let i = 0; i < next.length; i++) {
    if (usedNext.has(i)) continue;
    const free = out.findIndex((v, s) => v === null && !takenSlot.has(s));
    if (free === -1) break;
    takenSlot.add(free);
    out[free] = next[i];
  }
  return out;
}

/**
 * Nới hộp ra một chút trước khi gửi lại làm `bbox`.
 *
 * Hộp máy chủ trả bám sát mép quả; gửi lại đúng hộp đó thì lượt soi sau mất rìa
 * — mà rìa (cuống, vết sẹo, đường gân) là chỗ phân biệt hai quả cùng cây.
 */
export const BOX_PAD_RATIO = 0.06;

export function padBbox(bbox: PixelBbox, image: Size, ratio = BOX_PAD_RATIO): PixelBbox {
  const [x, y, w, h] = bbox;
  const dx = w * ratio;
  const dy = h * ratio;
  const nx = Math.max(0, x - dx);
  const ny = Math.max(0, y - dy);
  return [nx, ny, Math.min(image.w - nx, w + dx * 2), Math.min(image.h - ny, h + dy * 2)];
}
