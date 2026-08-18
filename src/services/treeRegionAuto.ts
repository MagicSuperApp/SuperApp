/**
 * KHOANH CÂY TỰ ĐỘNG — quy box YOLO của máy thành `regions` gửi máy chủ.
 *
 * ── VÌ SAO CÓ TỆP NÀY ────────────────────────────────────────────────────────
 * Nông dân KHÔNG khoanh nổi mọi ảnh. Một cây chụp 8–16 khung, ngoài nắng, tay bẩn:
 * bắt vẽ đa giác từng ảnh vừa chậm vừa cho dữ liệu TỆ HƠN không khoanh — mỗi ảnh
 * lệch một kiểu, còn máy thì nhất quán giữa các khung.
 *
 * Mà máy đã biết sẵn: mỗi khung đều chạy YOLO ra box cây (`TreeReIDYolo`), và box
 * đó ĐANG được vẽ lên preview nông dân đang nhìn. Trước đây lúc bấm chụp thì box
 * bị vứt. Nay cầu native mang nó lên (`CapturedImage.boxes` + `frameAspect`), tệp
 * này quy nó về pixel ảnh.
 *
 * Ngân sách quyết định của nông dân:
 *   - 0 chạm  — ca thường: lấy thẳng box máy đã có.
 *   - 1 chạm  — CHỈ khi hai box lớn xấp xỉ nhau (hai cây liền kề thật). Cờ
 *               `ambiguousAt` báo ảnh nào; màn hình hỏi ngay lúc quét, và chỉ hỏi
 *               MỘT lần — các ảnh sau bám theo box gần tâm box đã chọn.
 *   - không bao giờ khoanh tay theo từng ảnh.
 *
 * ── HỆ TOẠ ĐỘ ────────────────────────────────────────────────────────────────
 * Box native chuẩn-hoá 0–1 theo frame PREVIEW (đã xoay về portrait). Ảnh lưu ra có
 * thể KHÁC tỉ lệ frame preview — máy ảnh cắt giữa. Nên phải quy hệ trước khi nhân
 * `imgW`/`imgH`, nếu không vùng trượt đúng vào ca tính năng này sinh ra để chặn.
 * Máy chủ nhận pixel của ảnh hiển thị (hợp đồng ⚠️5) — xem `TreeRegion`.
 */

import type { TreeRegion } from './treeReIDService';

/** Box YOLO như cầu native gửi lên: chuẩn-hoá 0–1 theo frame preview. */
export interface YoloBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

/** Hai box coi là "ngang nhau" khi diện tích cái nhì ≥ ngần này lần cái nhất. */
export const AMBIGUOUS_AREA_RATIO = 0.6;

/** Box nhỏ hơn 1% khung: lá lọt, cây nền — không phải chủ thể. */
export const MIN_BOX_AREA = 0.01;

/**
 * Nới box 4% mỗi chiều trước khi cắt. Box YOLO bám sát mép tán; máy chủ CẮT theo
 * vùng này rồi mới embed, nên bám sát quá là gọt mất rìa vỏ — đúng phần ReID cần.
 */
export const BOX_PAD = 0.04;

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const area = (b: YoloBox) => b.w * b.h;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Box dùng được: số hữu hạn, có bề rộng, không phải nhiễu. */
function usable(b: unknown): b is YoloBox {
  const o = b as YoloBox;
  return (
    !!o && fin(o.x) && fin(o.y) && fin(o.w) && fin(o.h) &&
    o.w > 0 && o.h > 0 && area(o) >= MIN_BOX_AREA
  );
}

/**
 * Chọn box chủ thể trong một khung.
 *
 * `prev` = box đã chọn ở khung TRƯỚC (cùng hệ chuẩn-hoá). Có `prev` thì bám theo
 * tâm gần nhất và KHÔNG hỏi lại — vòng chụp xoay quanh cây đã chọn nên nó bám gần
 * tâm khung, còn cây bên cạnh trôi ra.
 *
 * Không có `prev`: lấy box lớn nhất. `ambiguous` chỉ bật khi box nhì thật sự xấp xỉ
 * — luật trước, câu hỏi sau: chênh lệch rõ thì quyết luôn, không làm phiền.
 */
export function pickBox(
  boxes: unknown,
  prev?: YoloBox | null,
): { box: YoloBox | null; ambiguous: boolean } {
  const valid = (Array.isArray(boxes) ? boxes : []).filter(usable);
  if (valid.length === 0) return { box: null, ambiguous: false };

  if (prev && usable(prev)) {
    const cx = prev.x + prev.w / 2;
    const cy = prev.y + prev.h / 2;
    let best = valid[0];
    let bestD = Infinity;
    for (const b of valid) {
      const dx = b.x + b.w / 2 - cx;
      const dy = b.y + b.h / 2 - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = b; }
    }
    return { box: best, ambiguous: false };
  }

  const sorted = [...valid].sort((a, b) => area(b) - area(a));
  const ambiguous =
    sorted.length >= 2 && area(sorted[1]) / area(sorted[0]) >= AMBIGUOUS_AREA_RATIO;
  return { box: sorted[0], ambiguous };
}

/**
 * Các box đáng đưa ra hỏi ở MỘT khung, lớn trước. Chỉ dùng cho lúc hỏi — luồng
 * thường không gọi tới. Cắt còn `max` vì hỏi quá hai ba lựa chọn thì người ta
 * bấm đại, tức là còn tệ hơn để máy tự quyết.
 */
export function candidateBoxes(
  capture: CaptureWithBoxes | null | undefined,
  max = 3,
): YoloBox[] {
  const valid = (Array.isArray(capture?.boxes) ? capture!.boxes! : []).filter(usable);
  return [...valid].sort((a, b) => area(b) - area(a)).slice(0, Math.max(0, max));
}

/**
 * Box (hệ preview) → bbox pixel của ảnh đã lưu.
 *
 * Preview và ảnh có thể khác tỉ lệ; giả thiết là hai bên nhìn CÙNG cảnh, canh
 * giữa, bên nào hẹp hơn thì bị cắt. `frameAspect` ≤ 0 hoặc không hữu hạn ⟹ coi
 * như trùng tỉ lệ (không bịa phép cắt khi không đo được).
 */
export function mapBoxToImage(
  box: YoloBox,
  frameAspect: number | null | undefined,
  imgW: number,
  imgH: number,
): [number, number, number, number] | null {
  if (!usable(box) || !fin(imgW) || !fin(imgH) || imgW <= 0 || imgH <= 0) return null;

  const aI = imgW / imgH;
  const aP = fin(frameAspect) && (frameAspect as number) > 0 ? (frameAspect as number) : aI;

  let x = box.x;
  let y = box.y;
  let w = box.w;
  let h = box.h;

  if (aP > aI) {
    // Preview RỘNG hơn ảnh ⟹ ảnh là preview bị cắt hai bên.
    const visible = aI / aP;
    x = (x - (1 - visible) / 2) / visible;
    w = w / visible;
  } else if (aP < aI) {
    // Preview CAO hơn ảnh ⟹ ảnh bị cắt trên dưới.
    const visible = aP / aI;
    y = (y - (1 - visible) / 2) / visible;
    h = h / visible;
  }

  // Nới rồi mới kẹp — nới xong tràn mép thì kẹp về mép, không đẩy vùng lệch đi.
  x -= w * BOX_PAD;
  y -= h * BOX_PAD;
  w += w * BOX_PAD * 2;
  h += h * BOX_PAD * 2;

  const x0 = clamp01(x);
  const y0 = clamp01(y);
  const x1 = clamp01(x + w);
  const y1 = clamp01(y + h);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null; // box nằm ngoài phần ảnh giữ lại

  return [x0 * imgW, y0 * imgH, (x1 - x0) * imgW, (y1 - y0) * imgH];
}

/** Ảnh đã chụp, đúng phần cần để suy vùng. */
export interface CaptureWithBoxes {
  width?: number | null;
  height?: number | null;
  boxes?: YoloBox[] | null;
  frameAspect?: number | null;
}

/**
 * Suy `regions` cho cả lượt gửi, SONG SONG `files[]`.
 *
 * `null` giữ nguyên vị trí = ảnh đó embed cả khung (khung không thấy cây). Toàn bộ
 * `null` thì `buildTreeRegions` trả `null` và không trường nào được gửi — hành vi
 * y hệt trước khi có tính năng này.
 *
 * `ambiguousAt` = chỉ số các ảnh có hai cây ngang nhau. Đây là chỗ DUY NHẤT đáng
 * hỏi nông dân, và chỉ hỏi cho ảnh ĐẦU tiên trong danh sách đó.
 */
export function autoTreeRegions(
  captures: ReadonlyArray<CaptureWithBoxes> | null | undefined,
  opts?: {
    /**
     * Box nông dân đã chọn ở lần hỏi (nếu có hỏi). Đặt làm dấu ban đầu ⟹ mọi
     * khung sau bám theo nó, và không còn khung nào bị coi là lưỡng lự nữa —
     * đó chính là chỗ "chỉ hỏi MỘT lần".
     */
    seed?: YoloBox | null;
  },
): { regions: Array<TreeRegion | null>; ambiguousAt: number[] } {
  if (!Array.isArray(captures) || captures.length === 0) {
    return { regions: [], ambiguousAt: [] };
  }

  const regions: Array<TreeRegion | null> = [];
  const ambiguousAt: number[] = [];
  const seed = opts?.seed;
  let prev: YoloBox | null = seed && usable(seed) ? seed : null;

  captures.forEach((c, i) => {
    const { box, ambiguous } = pickBox(c?.boxes, prev);
    if (ambiguous) ambiguousAt.push(i);
    if (!box) { regions.push(null); return; }

    prev = box; // bám dấu sang khung sau, kể cả khi ảnh này không quy được hệ

    const imgW = fin(c?.width) ? (c!.width as number) : 0;
    const imgH = fin(c?.height) ? (c!.height as number) : 0;
    const bbox = mapBoxToImage(box, c?.frameAspect, imgW, imgH);
    regions.push(bbox ? { bbox, shape: 'rect', imgW, imgH } : null);
  });

  return { regions, ambiguousAt };
}
