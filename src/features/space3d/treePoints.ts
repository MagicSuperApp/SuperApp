/**
 * space3d/treePoints — CÂY THẬT trong không-gian 3D: đám mây điểm từ OriLife.
 *
 * Nguồn: `GET /api/tree/{tree_id}/model3d` (auth, chỉ chủ vườn) — cửa máy chủ
 * dựng RIÊNG cho việc app tự vẽ cảnh native. Hợp đồng đầy đủ ghi ở
 * `services/treeReIDService.ts → getTreeModel3D`.
 *
 * ── Bản trước dùng SAI cửa, và đây là bài học ───────────────────────────────
 * Bản đầu đi qua `GET /api/provenance/{tree_id}` vì đó là cửa mà ô 3D ở màn
 * truy-xuất quả đang dùng. Nhưng cửa ấy là cửa CÔNG KHAI cho người mua: cây
 * riêng-tư trả 404. Kho sản xuất đo 08/2026 có **0 cây công khai** trên tổng
 * 139, nên với gần như mọi cây của chính chủ, lượt gọi trả 404 → mã ở đây đọc
 * thành "cây chưa dựng 3D" → rơi về cây tự tạo. Người dùng thấy đúng cái hình
 * nón mà bản sửa này sinh ra để thay thế, và KHÔNG có lỗi nào hiện lên.
 *
 * Hai chỗ khiến nó câm, cả hai đã sửa:
 *   1. sai cửa (công khai thay vì cửa của chủ) — nay dùng cửa chủ;
 *   2. "không đọc được" bị xếp chung nhánh với "chưa dựng" — nay tách hẳn, xem
 *      `kind: 'unreadable'` bên dưới.
 *
 * ── Khác gì ô xem ở màn truy-xuất ───────────────────────────────────────────
 *
 * 1. **Khung toạ-độ.** Ô xem kia canh tâm model về gốc rồi quay quanh nó. Ở vườn
 *    thì cây phải ĐỨNG TRÊN ĐẤT đúng chỗ của nó, nên khung ở đây là khung của
 *    `treeFrame`: cao đúng `TREE_HEIGHT`, tâm ngang trên trục, gốc chạm y = 0 —
 *    giống hệt cách `treeAsset.normalize()` đặt model .glb, để hai loại cây đứng
 *    lẫn trong một vườn mà không cái nào lún hay lơ lửng.
 *
 * 2. **Cỡ điểm.** `PointsMaterial.size` KHÔNG chịu ảnh hưởng của `scale` trên
 *    object: bộ đổ bóng của three tính `gl_PointSize = size * (scale / -mvPosition.z)`
 *    với `size` là uniform vật liệu, còn `mvPosition` đã ở hệ camera. Thu nhỏ cây
 *    mà giữ nguyên `size` thì được một khối chấm to bằng cả tán. Vì vậy cỡ điểm ở
 *    đây tính theo MÉT của cảnh vườn.
 *
 * 3. **Hình học dùng chung, vật liệu riêng.** Mở lại sơ-đồ vườn mà tải lại vài
 *    chục lượt là ngốn sóng của người đang đứng giữa vườn. Hình học nhớ theo
 *    `treeId`, mỗi lần dựng chỉ tạo vật liệu mới, chỗ dùng chỉ dọn vật liệu của
 *    mình. Đệm cố ý KHÔNG có hàm dọn: chặn trên là số cây người dùng thật sự mở,
 *    và mật-độ điểm thật rất thưa (máy chủ tự khai: trung-vị vài trăm điểm/cây).
 *
 * 4. **Có LƯỚI NỐI, không chỉ có chấm.** Máy chủ tự khai mật-độ thật rất thưa —
 *    trung-vị vài trăm điểm mỗi cây, và *"478 điểm vẽ ra là một đám bụi chứ chưa
 *    ra dáng cây"*. Đúng như thế trên máy thật: chấm rời không đọc ra hình gì.
 *    Nên mỗi điểm được nối tới `NEIGHBORS_PER_POINT` điểm gần nó nhất, xem
 *    `buildEdgeGeometry` — mắt người đọc ra bề mặt từ lưới, không đọc ra từ bụi.
 */

import * as THREE from 'three';
import { toByteArray } from 'base64-js';
import { ORILIFE_BASE } from '../../services/orilifeBase';
import { getTreeModel3D, type TreeModel3DResponse } from '../../services/treeReIDService';
import { TREE_HEIGHT } from './treeFrame';

/**
 * Trần số điểm xin về MỖI CÂY.
 *
 * Mặc-định của máy chủ là 20 000 — con số tính cho màn xem MỘT cây. Sơ-đồ vườn
 * vẽ hàng chục cây cùng lúc trên một ngữ-cảnh GL, nên xin trần đó là nhân số
 * điểm lên vài chục lần cho một cảnh mà mỗi cây chỉ chiếm vài chục pixel. 4 000
 * vẫn cao hơn nhiều lần mật-độ thật (máy chủ khai trung-vị vài trăm điểm/cây),
 * nên hôm nay nó không cắt gì cả — nó là cái phanh cho ngày dữ-liệu dày lên.
 */
const MAX_POINTS_PER_TREE = 4000;

/**
 * Cỡ một chấm, theo mét của cảnh vườn.
 *
 * Ô xem ở màn truy-xuất dùng 0,045 cho model trải ~5 đơn-vị — khoảng 1/110 chiều
 * cao vật thể. Ở vườn, camera đứng xa hơn nhiều và `sizeAttenuation` co chấm lại
 * theo khoảng cách, nên tỉ-lệ ấy cho ra một cái bóng mờ. 1/70 giữ được dáng cây
 * khi nhìn toàn vườn mà vẫn không vón cục lúc bay lại gần.
 */
const POINT_SIZE = TREE_HEIGHT / 70;

/** Màu dùng khi máy chủ không gửi màu đỉnh — cùng màu lá với cây dự phòng. */
const FALLBACK_POINT_COLOR = 0x7fb069;

/**
 * Mỗi điểm nối tới bao nhiêu điểm gần nhất.
 *
 * Ba là con số anh Aladin chốt, và nó có lý do hình học: nối tới 1 điểm chỉ ra
 * một chuỗi hạt, nối tới 2 ra những đường gấp khúc rời nhau, còn từ 3 trở lên
 * thì các đoạn bắt đầu khép thành tam giác và mắt đọc ra BỀ MẶT. Lên 4–5 thì số
 * đoạn tăng nhanh hơn hình mà nó thêm được, và cây thành một búi rối.
 *
 * Lưu ý: đây KHÔNG phải "mỗi điểm đúng 3 đoạn". Quan hệ láng giềng không đối
 * xứng (A gần B nhất, nhưng B có thể có ba điểm khác gần hơn A), nên sau khi
 * gộp trùng, một điểm ở giữa đám dày có thể mang nhiều hơn 3 đoạn.
 */
const NEIGHBORS_PER_POINT = 3;

/**
 * Trần chiều dài một đoạn nối, tính theo BỘI SỐ của khoảng cách láng-giềng
 * trung-vị của chính cây đó.
 *
 * Vì sao phải có: "ba điểm gần nhất" luôn tìm ra ba điểm, kể cả với một điểm
 * lạc nằm một mình giữa khoảng trống — và ba đoạn của nó sẽ bắc ngang qua cả
 * tán cây. Vài điểm lạc như vậy là đủ để biến lưới thành mạng nhện, đúng cái
 * "rối" cần tránh. Lấy trung-vị (không lấy trung-bình) vì trung-vị không bị
 * chính những điểm lạc đó kéo lệch.
 *
 * 3× là chỗ đủ rộng để không cắt lưới ở vùng thưa tự nhiên của tán, mà vẫn cắt
 * đứt những đoạn bắc qua khoảng trống thật.
 */
const MAX_EDGE_FACTOR = 3;

/**
 * Độ mờ của đường nối.
 *
 * Đường nối là thứ SUY RA, không phải thứ máy chủ đo được: nó là phỏng đoán của
 * app về "hai điểm này chắc cùng nằm trên một mặt". Nên nó phải nhạt hơn chính
 * các điểm — điểm là dữ-liệu thật, đường chỉ là cách đọc dữ-liệu ấy. Mờ nhẹ còn
 * giúp lớp lưới phía sau lộ qua lớp trước, nên khối cây có chiều sâu thay vì
 * thành một cái vỏ đặc.
 */
const EDGE_OPACITY = 0.55;

/** Số cây được tải cùng lúc. Vườn trăm cây mà bắn hết một lượt là nghẽn sóng. */
const MAX_PARALLEL = 3;

export interface TreePointsTemplate {
  geometry: THREE.BufferGeometry;
  /**
   * Lưới nối các điểm (`LineSegments`). `null` khi cây quá ít điểm để nối.
   *
   * Dựng MỘT LẦN lúc tải rồi nhớ trong đệm cùng với `geometry`: tìm láng giềng
   * là phần tốn nhất ở đây, và nó không đổi giữa các lần dựng lại cảnh.
   */
  edges: THREE.BufferGeometry | null;
  /** Số điểm ĐỌC ĐƯỢC từ thân trả về — không phải số máy chủ khai. */
  count: number;
  /** Câu của máy chủ về độ phủ ảnh chụp. Hiện nguyên văn, đừng soạn lại. */
  advice: string | null;
}

/**
 * Kết-quả hỏi đám mây điểm của một cây. Bốn nhánh, bốn câu khác hẳn nhau:
 *
 *   ok          — có hình để vẽ
 *   unavailable — máy chủ trả lời BÌNH THƯỜNG rằng chưa có bản dựng (`meta.status`
 *                 = none/building/failed). Không phải sự cố; cây mới nào cũng thế.
 *   unreadable  — máy chủ nói CÓ hình nhưng app không nhận ra hình dạng thân trả
 *                 về. Đây là lỗi CỦA APP (hoặc hợp đồng vừa đổi), và nó phải kêu
 *                 to: gộp nó vào `unavailable` là dựng lại đúng cái bẫy vừa gỡ —
 *                 cây im lặng thành hình nón, không ai biết vì sao.
 *   error       — trục trặc mạng / máy chủ. Đáng thử lại.
 */
export type TreePointsResult =
  | { kind: 'ok'; template: TreePointsTemplate }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unreadable'; message: string }
  | { kind: 'error'; message: string };

// ── Hàng chờ giới hạn ───────────────────────────────────────────────────────

let running = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running = Math.max(0, running - 1);
}

// ── Đọc hình học ────────────────────────────────────────────────────────────
//
// Máy chủ mô tả `meta.*` rất kỹ nhưng KHÔNG công bố schema phần hình học
// (OpenAPI ghi `schema: {}`), và cửa cần đăng nhập nên không lấy được một thân
// thật để đo. Nên phần đọc dưới đây CỐ Ý dò nhiều hình dạng hợp lý — và cố ý
// BÁO RÕ khi không hình nào khớp, kèm danh sách khoá thật sự nhận được, để lần
// sửa sau là việc mười giây chứ không phải một vòng đoán nữa.

const POINT_KEYS = ['points', 'xyz', 'positions', 'vertices', 'cloud'];
const COLOR_KEYS = ['colors', 'rgb', 'color'];

/** Nơi hình học có thể nằm: ngay gốc, hoặc lồng trong một khoá bao. */
function candidateHolders(body: TreeModel3DResponse): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [body as Record<string, unknown>];
  for (const k of ['model', 'model3d', 'data', 'points', 'cloud', 'geometry']) {
    const v = (body as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v as Record<string, unknown>);
  }
  return out;
}

/**
 * Một mảng số phẳng (`[x,y,z,x,y,z,…]`), một mảng bộ ba (`[[x,y,z],…]`), hoặc
 * một chuỗi base64 (`format=bin`) → `Float32Array`. Không nhận ra → `null`.
 */
function toFloats(value: unknown): Float32Array | null {
  if (typeof value === 'string') {
    // `format=bin`: toạ-độ nhị-phân base64. Mặc-định app xin `json`, nhưng nhận
    // được dạng này thì đọc luôn còn hơn ném đi.
    try {
      const bytes = toByteArray(value);
      if (bytes.byteLength === 0 || bytes.byteLength % 12 !== 0) return null;
      return new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0) return null;

  if (typeof value[0] === 'number') {
    if (value.length % 3 !== 0) return null;
    const out = new Float32Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const n = value[i];
      if (typeof n !== 'number' || !Number.isFinite(n)) return null;
      out[i] = n;
    }
    return out;
  }

  if (Array.isArray(value[0])) {
    const out = new Float32Array(value.length * 3);
    for (let i = 0; i < value.length; i++) {
      const tri = value[i] as unknown[];
      if (!Array.isArray(tri) || tri.length < 3) return null;
      for (let j = 0; j < 3; j++) {
        const n = tri[j];
        if (typeof n !== 'number' || !Number.isFinite(n)) return null;
        out[i * 3 + j] = n;
      }
    }
    return out;
  }
  return null;
}

/**
 * Màu đỉnh. Máy chủ có thể gửi 0–255 (uchar, như tệp PLY gốc) hoặc 0–1. Đoán
 * theo giá trị lớn nhất: three cần 0–1, đưa nhầm thang 0–255 vào là cây trắng xoá.
 */
function toColors(value: unknown, pointCount: number): Float32Array | null {
  const raw = toFloats(value);
  if (!raw || raw.length !== pointCount * 3) return null;
  let max = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] > max) max = raw[i];
  if (max <= 1.0001) return raw;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] / 255;
  return out;
}

// ── Lưới nối: mỗi điểm tới N điểm gần nhất ─────────────────────────────────
//
// ── Vì sao KHÔNG so mọi cặp ────────────────────────────────────────────────
// So tất cả với tất cả là O(n²). Với trần 4 000 điểm/cây đó là 16 triệu phép
// đo cho MỘT cây, chạy trên luồng JS, nhân với số cây trong vườn — màn hình
// đứng hình vài giây ngay lúc mở. Nên điểm được ném vào một LƯỚI Ô VUÔNG trước:
// láng giềng gần nhất của một điểm chỉ có thể nằm trong ô của nó hoặc 26 ô kề,
// nên mỗi điểm chỉ so với vài chục điểm thay vì bốn nghìn.
//
// Cạnh ô chọn theo mật-độ (`res ≈ ∛(n/2)`) để mỗi ô có vài điểm: ô quá to thì
// quay lại so-tất-cả trong một ô, ô quá nhỏ thì phải quét nhiều vòng ô rỗng.

/** Khoá ô lưới. Ba toạ-độ ô gộp thành một số — Map<number> nhanh hơn Map<string>. */
const cellKey = (ix: number, iy: number, iz: number): number =>
  (ix + 1024) * 4194304 + (iy + 1024) * 2048 + (iz + 1024);

/**
 * Dựng lưới nối từ đám điểm: mỗi điểm nối tới `NEIGHBORS_PER_POINT` điểm gần
 * nhất, bỏ những đoạn dài bất thường, gộp đoạn trùng.
 *
 * Trả `null` khi không đủ điểm để thành lưới — chỗ gọi vẫn vẽ chấm bình thường.
 * Xuất khẩu để kiểm được bằng đám điểm tự dựng, không cần mạng.
 */
export function buildEdgeGeometry(
  positions: Float32Array,
  colors: Float32Array | null,
): THREE.BufferGeometry | null {
  const n = Math.floor(positions.length / 3);
  if (n < 3) return null;

  // ── Hộp bao + cạnh ô ──
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!(span > 0) || !Number.isFinite(span)) return null;

  const res = Math.min(48, Math.max(4, Math.round(Math.cbrt(n / 2))));
  const cell = span / res;

  const grid = new Map<number, number[]>();
  const cellOf = (v: number, min: number) => Math.floor((v - min) / cell);
  for (let i = 0; i < n; i++) {
    const k = cellKey(
      cellOf(positions[i * 3], minX),
      cellOf(positions[i * 3 + 1], minY),
      cellOf(positions[i * 3 + 2], minZ),
    );
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }

  const K = NEIGHBORS_PER_POINT;
  const nbr = new Int32Array(n * K).fill(-1);
  const nbrDist = new Float32Array(n * K).fill(Infinity);
  /** Khoảng cách tới láng giềng GẦN NHẤT của từng điểm — để lấy trung-vị. */
  const nearest = new Float32Array(n).fill(Infinity);

  const candidates: number[] = [];

  for (let i = 0; i < n; i++) {
    const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    const cx = cellOf(px, minX), cy = cellOf(py, minY), cz = cellOf(pz, minZ);

    // Quét vòng ô rộng dần: 3×3×3 trước, thiếu thì 5×5×5. Vùng thưa mới phải
    // quét rộng, và chỉ nó phải trả giá đó.
    for (let ring = 1; ring <= 2; ring++) {
      candidates.length = 0;
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dz = -ring; dz <= ring; dz++) {
            const bucket = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (bucket) for (let b = 0; b < bucket.length; b++) candidates.push(bucket[b]);
          }
        }
      }
      if (candidates.length > K) break;
    }

    for (let c = 0; c < candidates.length; c++) {
      const j = candidates[c];
      if (j === i) continue;
      const dx = positions[j * 3] - px;
      const dy = positions[j * 3 + 1] - py;
      const dz = positions[j * 3 + 2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= 0) continue; // điểm trùng khít: một đoạn dài 0, vẽ ra không thấy gì

      // Chèn vào danh sách K gần nhất (K = 3 nên chèn thẳng, không cần đống).
      for (let slot = 0; slot < K; slot++) {
        if (d2 < nbrDist[i * K + slot]) {
          for (let m = K - 1; m > slot; m--) {
            nbrDist[i * K + m] = nbrDist[i * K + m - 1];
            nbr[i * K + m] = nbr[i * K + m - 1];
          }
          nbrDist[i * K + slot] = d2;
          nbr[i * K + slot] = j;
          break;
        }
      }
    }
    nearest[i] = nbrDist[i * K];
  }

  // ── Trần chiều dài: bội số của khoảng cách láng-giềng TRUNG-VỊ ──
  const finite = Array.from(nearest).filter((d) => Number.isFinite(d) && d > 0);
  if (finite.length === 0) return null;
  finite.sort((a, b) => a - b);
  const medianD2 = finite[Math.floor(finite.length / 2)];
  const maxD2 = medianD2 * MAX_EDGE_FACTOR * MAX_EDGE_FACTOR;

  // ── Gộp đoạn trùng: A→B và B→A là MỘT đoạn ──
  const seen = new Set<number>();
  const line: number[] = [];
  const lineColors: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let slot = 0; slot < K; slot++) {
      const j = nbr[i * K + slot];
      if (j < 0) continue;
      if (nbrDist[i * K + slot] > maxD2) continue;
      const a = i < j ? i : j;
      const b = i < j ? j : i;
      const key = a * n + b;
      if (seen.has(key)) continue;
      seen.add(key);

      line.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
      );
      if (colors) {
        // Mỗi đầu đoạn lấy màu của CHÍNH điểm đó — three nội suy dọc đoạn, nên
        // đường nối mang đúng màu chụp được của hai đầu thay vì một màu bịa.
        lineColors.push(
          colors[a * 3], colors[a * 3 + 1], colors[a * 3 + 2],
          colors[b * 3], colors[b * 3 + 1], colors[b * 3 + 2],
        );
      }
    }
  }

  if (line.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  if (lineColors.length === line.length) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
  }
  return geometry;
}

interface ReadGeometry {
  geometry: THREE.BufferGeometry;
  count: number;
  edges: THREE.BufferGeometry | null;
}

/** Dựng `BufferGeometry` từ thân máy chủ. `null` = không nhận ra hình dạng. */
export function readPointGeometry(body: TreeModel3DResponse): ReadGeometry | null {
  for (const holder of candidateHolders(body)) {
    for (const key of POINT_KEYS) {
      const positions = toFloats(holder[key]);
      if (!positions || positions.length < 3) continue;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const count = positions.length / 3;
      let pointColors: Float32Array | null = null;
      for (const ck of COLOR_KEYS) {
        const colors = toColors(holder[ck], count);
        if (colors) {
          pointColors = colors;
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          break;
        }
      }
      return { geometry, count, edges: buildEdgeGeometry(positions, pointColors) };
    }
  }
  return null;
}

/** Tên các khoá thật sự nhận được — để câu báo lỗi nói được điều dùng được. */
function describeKeys(body: TreeModel3DResponse): string {
  const keys = Object.keys(body ?? {}).filter((k) => k !== 'meta');
  return keys.length ? keys.join(', ') : '(không có khoá nào)';
}

// ── Bộ nhớ đệm theo cây ─────────────────────────────────────────────────────

const cache = new Map<string, Promise<TreePointsResult>>();

/** Câu tiếng Việt cho từng `meta.status` mà máy chủ khai. */
function messageForStatus(meta: TreeModel3DResponse['meta']): string {
  const status = typeof meta?.status === 'string' ? meta.status : '';
  if (status === 'building') {
    return 'Máy chủ đang dựng hình 3D cho cây này. Quay lại sau ít phút.';
  }
  if (status === 'failed') {
    // `meta.error` là câu lý-do của máy chủ. Nuốt nó đi là nông dân bấm dựng lại,
    // hỏng lại, mãi không ai nói vì sao.
    const why = typeof meta?.error === 'string' && meta.error.trim() ? ` ${meta.error.trim()}` : '';
    return `Lượt dựng hình 3D gần nhất chưa thành công.${why}`;
  }
  return 'Cây này chưa có hình 3D. Chụp thêm ảnh quanh cây rồi bấm dựng.';
}

async function fetchTemplate(treeId: string): Promise<TreePointsResult> {
  const res = await getTreeModel3D(ORILIFE_BASE, treeId, {
    maxPoints: MAX_POINTS_PER_TREE,
  });

  if (!res.ok || !res.data) {
    const err = res.error;
    if (err?.http_status === 403 || err?.http_status === 404) {
      // Máy chủ gộp "không có" với "không thuộc bạn" — đừng khẳng định ca nào.
      return { kind: 'unavailable', message: 'Không mở được hình 3D của cây này.' };
    }
    return { kind: 'error', message: err?.detail ?? 'Không hỏi được hình 3D của cây.' };
  }

  const body = res.data;
  const geometry = readPointGeometry(body);

  if (!geometry) {
    // KHÔNG rơi về "chưa dựng". Máy chủ có thể đã trả hình mà app đọc không ra,
    // và im lặng ở đây là quay lại đúng lỗi vừa sửa.
    const status = typeof body.meta?.status === 'string' ? body.meta.status : '';
    const declared = body.meta?.n_points_model;
    const looksBuilt =
      body.available === true
      || status === 'ready'
      || (typeof declared === 'number' && declared > 0);

    if (!looksBuilt) {
      return { kind: 'unavailable', message: messageForStatus(body.meta) };
    }
    return {
      kind: 'unreadable',
      message: `Máy chủ có hình 3D nhưng ứng dụng chưa đọc được dạng dữ-liệu này (khoá nhận được: ${describeKeys(body)}).`,
    };
  }

  const advice = body.meta?.coverage?.advice;
  return {
    kind: 'ok',
    template: {
      geometry: geometry.geometry,
      edges: geometry.edges,
      count: geometry.count,
      advice: typeof advice === 'string' && advice.trim() ? advice.trim() : null,
    },
  };
}

/**
 * Đám mây điểm của một cây. KHÔNG ném — mọi nhánh hỏng ra một `kind` riêng.
 * Kết-quả được nhớ theo `treeId`; gọi lại là lấy ngay bản đã có.
 */
export function loadTreePoints(treeId: string): Promise<TreePointsResult> {
  const id = (treeId ?? '').trim();
  if (!id) {
    return Promise.resolve({ kind: 'error', message: 'Thiếu mã cây.' });
  }
  const hit = cache.get(id);
  if (hit) return hit;

  const task = (async (): Promise<TreePointsResult> => {
    await acquire();
    try {
      return await fetchTemplate(id);
    } catch (e: any) {
      return { kind: 'error', message: e?.message ?? String(e) };
    } finally {
      release();
    }
  })().then((r) => {
    // Ca hỏng KHÔNG được nhớ mãi: mất sóng lúc mở màn mà nhớ lại thì cây đó câm
    // cho tới khi thoát hẳn app. `unavailable` thì nhớ — nó là sự thật về cây.
    // `unreadable` cũng không nhớ: hợp đồng có thể vừa được máy chủ sửa lại.
    if (r.kind === 'error' || r.kind === 'unreadable') cache.delete(id);
    return r;
  });

  cache.set(id, task);
  return task;
}

/**
 * Đặt cây vào khung của vườn: cao đúng `TREE_HEIGHT`, tâm ngang trên trục, gốc
 * chạm mặt đất.
 *
 * Đo bằng `source` (hình học của các ĐIỂM) chứ không đo cả object: lưới nối chỉ
 * gồm những đoạn giữa các điểm đó nên không thể vượt ra ngoài hộp bao của chúng,
 * và đo một lần trên mảng thô thì rẻ hơn duyệt cả cây con.
 *
 * Đặt lại tỉ-lệ/vị-trí về mặc-định trước khi đo, nên gọi lại lần nữa trên cùng
 * một object vẫn ra đúng kết quả (không cộng dồn).
 *
 * Tách ra khỏi phần tải để kiểm được bằng hình học tự dựng, không cần mạng.
 * Trả về chính object đã truyền vào (đổi tại chỗ) cho gọn ở chỗ gọi.
 */
export function frameTreePoints<T extends THREE.Object3D>(
  object: T,
  source?: THREE.BufferGeometry,
): T {
  const geometry =
    source
    ?? ((object as unknown as { geometry?: THREE.BufferGeometry }).geometry);
  const attr = geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!attr) return object;

  const box = new THREE.Box3().setFromBufferAttribute(attr);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scale = size.y > 0 ? TREE_HEIGHT / size.y : 1;
  object.scale.setScalar(scale);
  // Kéo theo `box.min.y`, KHÔNG theo tâm: đám mây từ máy chủ nằm trong hệ của
  // camera lúc dựng, tâm nó không hề ở giữa thân cây. Theo tâm thì nửa số cây
  // trong vườn lún xuống đất, nửa còn lại lơ lửng.
  object.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return object;
}

/**
 * Dựng một cây dùng được ngay từ hình học đã nhớ: LƯỚI NỐI + các ĐIỂM, gộp
 * trong một nhóm để cả hai chịu chung một phép đặt khung.
 *
 * Vẽ cả hai chứ không chỉ vẽ lưới: điểm là dữ-liệu máy chủ thật sự đo được và
 * nó mang màu chụp từ ảnh; lưới chỉ là cách app đọc đám điểm ấy thành bề mặt.
 * Bỏ điểm đi là bỏ mất chỗ dày/thưa — thứ nói cho người dùng biết họ đã chụp kỹ
 * chỗ nào.
 */
export function buildTreePoints(template: TreePointsTemplate): THREE.Group {
  const group = new THREE.Group();

  const hasColor = !!template.geometry.getAttribute('color');
  const pointMaterial = new THREE.PointsMaterial({
    size: POINT_SIZE,
    vertexColors: hasColor,
    color: hasColor ? 0xffffff : FALLBACK_POINT_COLOR,
    sizeAttenuation: true,
  });

  if (template.edges) {
    const edgeHasColor = !!template.edges.getAttribute('color');
    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: edgeHasColor,
      color: edgeHasColor ? 0xffffff : FALLBACK_POINT_COLOR,
      transparent: true,
      opacity: EDGE_OPACITY,
      // Đoạn nối KHÔNG ghi vào bộ đệm độ sâu: có ghi thì đoạn nào vẽ trước sẽ
      // che mất đoạn nằm sau nó dù cả hai đều mờ, và khối cây lộ ra từng mảng
      // đặc tuỳ thứ tự vẽ.
      depthWrite: false,
    });
    group.add(new THREE.LineSegments(template.edges, edgeMaterial));
  }

  group.add(new THREE.Points(template.geometry, pointMaterial));
  return frameTreePoints(group, template.geometry);
}

/**
 * Dọn MỘT bản dựng. Chỉ dọn vật liệu — hình học thuộc về bộ nhớ đệm và còn cây
 * khác (hoặc lượt mở sau) đang dùng.
 */
export function disposeTreePointsInstance(object: THREE.Object3D | null | undefined): void {
  if (!object) return;
  object.traverse((child) => {
    const m = (child as { material?: THREE.Material | THREE.Material[] }).material;
    if (!m) return;
    try {
      if (Array.isArray(m)) m.forEach((x) => x?.dispose());
      else m.dispose();
    } catch {
      /* đã dọn rồi */
    }
  });
}

/** Chỉ dùng trong test — quên đệm mà không đụng tới GPU. */
export function _resetTreePointsCacheForTest(): void {
  cache.clear();
  waiting.length = 0;
  running = 0;
}
