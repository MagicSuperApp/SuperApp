/**
 * plyPointCloud — tải và đọc đám mây điểm PLY của một cây.
 *
 * ── Thân thật, đo 2026-08-19 ────────────────────────────────────────────────
 *   GET https://lampnet.cloud/ln1q_7da38f774a97ca3a_file
 *   → 200, `text/plain`, 73 953 byte
 *   → `ply / format ascii 1.0 / element vertex 2048`
 *     thuộc tính: `x y z` (float) + `red green blue` (uchar)
 *
 * Hai điều rút ra, và cả hai đều đổi cách viết mã ở đây:
 *
 * 1. **`Content-Type` là `text/plain`, không phải `application/octet-stream`.**
 *    Nên đừng lọc theo kiểu MIME để đoán ascii hay nhị phân — máy chủ này gắn
 *    `text/plain` cho mọi tệp trong kho. `PLYLoader.parse` tự đọc dòng `format`
 *    trong phần đầu tệp, nên cứ đưa `ArrayBuffer` cho nó là xong: ascii hay
 *    nhị phân đều vào đúng nhánh, không cần app đoán.
 *
 * 2. **Điểm có MÀU.** Đó là màu chụp được từ ảnh thật của cây, và nó là thứ làm
 *    đám mây đọc ra dáng cây thay vì một vốc bụi trắng. Vậy vật liệu phải bật
 *    `vertexColors`, nếu không three vẽ tất cả bằng màu mặc định và mọi model
 *    trông y hệt nhau.
 *
 * ── Vì sao KHÔNG dùng `PLYLoader.load(url)` ─────────────────────────────────
 * Nó đi qua `THREE.FileLoader` → `XMLHttpRequest`. Trên RN thì XHR có chạy,
 * nhưng lỗi mạng chui ra dưới dạng một callback `onError` không mang mã HTTP,
 * nên không phân biệt được "404 chưa dựng model" với "mất sóng". Dùng `fetch`
 * rồi `parse` thì mã HTTP nằm trong tay, và màn nói được đúng câu.
 */

import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

/** Chờ lâu hơn ảnh: tệp model tới cả trăm KB và hội chợ thì sóng yếu. */
const TIMEOUT_MS = 30_000;

/**
 * Trần kích thước tệp, byte.
 *
 * Model đo được là 74 KB; 12 MB là rộng gấp trăm lần, đủ cho model dày hơn nhiều.
 * Có trần vì phía app không kiểm soát kho tệp: một `cid` trỏ nhầm sang video sẽ
 * nuốt hết bộ nhớ của máy yếu rồi làm app chết không lời nào.
 */
export const MAX_MODEL_BYTES = 12 * 1024 * 1024;

export type PointCloudResult =
  | { kind: 'ok'; object: THREE.Points; count: number }
  | { kind: 'not_found' }
  | { kind: 'too_large'; bytes: number }
  | { kind: 'unreadable'; detail: string }
  /**
   * Cổng trả `200` nhưng thân là TRANG GIAO DIỆN của cổng, không phải tệp.
   * Tách riêng khỏi `unreadable` vì hai ca đòi hai câu ngược nhau: `unreadable`
   * là "tệp có nhưng đọc không ra"; ca này là "tệp KHÔNG còn được phục vụ" —
   * bấm thử lại bao nhiêu lần cũng ra đúng trang đó.
   */
  | { kind: 'gone' }
  | { kind: 'error'; detail: string };

/**
 * Cổng nội dung có đang trả trang giao diện thay cho tệp không?
 *
 * ── Vì sao phải có phép thử này ─────────────────────────────────────────────
 * Nhà LampNet đo ngày 2026-08-24 và báo sang: lớp phục vụ tĩnh trước các nút
 * đang NUỐT `404` và thay bằng `index.html`. Hỏi một CID không còn mảnh nào —
 * kể cả một CID bịa hoàn toàn — thì nhận:
 *
 *     200  text/html  13855 byte
 *
 * Nút gốc trả `404` đúng chuẩn; chỉ lớp phía trước nói dối. Nên MỌI chỗ chỉ
 * kiểm `resp.ok` hay `status === 200` đều nhận trang HTML đó và coi là tải
 * thành công. Trong 60 tài liệu trên máy sản xuất, 11 tài liệu rơi vào ca này.
 *
 * Phép thử đúng là `content-type`, KHÔNG phải mã trạng thái. Và nó phải là
 * `startsWith('text/html')` chứ không phải so bằng: cổng gắn kèm charset.
 *
 * ⚠️ KHÔNG lọc theo `text/plain` — kho này gắn `text/plain` cho MỌI tệp trong
 * nó, kể cả PLY nhị phân (xem khối đầu tệp). Lọc rộng hơn `text/html` là chặn
 * nhầm chính đường đang chạy tốt.
 */
export function isGatewayPlaceholder(contentType: string | null | undefined): boolean {
  return (contentType ?? '').toLowerCase().trimStart().startsWith('text/html');
}

/**
 * Cỡ điểm vẽ ra, theo đơn vị của model.
 *
 * Model đo được trải chừng 5 đơn vị mỗi chiều với 2048 điểm — cỡ 0.045 cho ra
 * các chấm vừa chạm nhau ở khoảng cách camera tự canh, tức mắt đọc ra khối chứ
 * không đọc ra lưới rỗng. Không dùng `sizeAttenuation: false` (cỡ theo pixel) vì
 * lúc đó phóng vào là các chấm giữ nguyên và khối cây tan ra.
 */
const POINT_SIZE = 0.045;

/**
 * Màu nền ô xem 3D.
 *
 * Nằm ở đây chứ không ở component vì nó là một hệ quả của điều ngay trên: điểm
 * mang màu chụp từ ảnh thật, mà màu ảnh cây thì sáng và nhạt. Đặt chúng trên nền
 * sáng là mất hẳn khối. Cùng tông với `TreeModelPreview` để hai ô 3D trong app
 * trông là một họ.
 */
export const POINT_CLOUD_BACKDROP = '#0B1512';

/** Dựng `THREE.Points` từ hình học đã đọc, canh gốc về tâm hộp bao. */
export function pointsFromGeometry(geometry: THREE.BufferGeometry): THREE.Points {
  geometry.computeBoundingBox();
  // Dời tâm về gốc toạ độ: model từ máy chủ nằm trong hệ của camera lúc dựng
  // (đo được z ≈ 5.8), nên không dời thì vật quay quanh một trục ở ngoài nó và
  // người xem thấy cây văng ra khỏi khung mỗi vòng.
  geometry.center();

  const hasColor = !!geometry.getAttribute('color');
  const material = new THREE.PointsMaterial({
    size: POINT_SIZE,
    vertexColors: hasColor,
    // Không có màu đỉnh thì tô xanh lá — vẫn đọc ra dáng cây, và nói đúng rằng
    // đây là bản dựng của app chứ không phải màu chụp được.
    color: hasColor ? 0xffffff : 0x7fb069,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

/**
 * Tải một tệp PLY về và dựng thành đám mây điểm. KHÔNG ném.
 *
 * Mọi nhánh hỏng ra một `kind` riêng, vì bốn ca dưới đây cần bốn câu khác nhau
 * trên màn: chưa dựng model (404), tệp lạ, tệp quá to, và mất mạng. Gộp lại
 * thành "không xem được" là bắt người dùng đoán xem có nên thử lại hay không.
 */
export async function loadPointCloud(url: string): Promise<PointCloudResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);

    if (resp.status === 404) return { kind: 'not_found' };
    if (!resp.ok) return { kind: 'error', detail: `HTTP ${resp.status}` };

    // Đặt TRƯỚC `arrayBuffer()`: đọc 13 KB HTML về rồi mới loại là tốn sóng của
    // người đang đứng giữa vườn, và `PLYLoader` ném ra câu "unexpected token"
    // vô nghĩa với người đọc.
    if (isGatewayPlaceholder(resp.headers?.get?.('content-type'))) {
      return { kind: 'gone' };
    }

    const buf = await resp.arrayBuffer();
    if (buf.byteLength > MAX_MODEL_BYTES) {
      return { kind: 'too_large', bytes: buf.byteLength };
    }
    if (buf.byteLength === 0) {
      return { kind: 'unreadable', detail: 'Tệp model rỗng' };
    }

    let geometry: THREE.BufferGeometry;
    try {
      geometry = new PLYLoader().parse(buf) as THREE.BufferGeometry;
    } catch (e: any) {
      // Tệp không phải PLY, hoặc PLY hỏng. Đây KHÔNG phải lỗi mạng — nút "thử
      // lại" ở đây là vô ích, và màn phải nói đúng thế.
      return { kind: 'unreadable', detail: e?.message ?? String(e) };
    }

    const pos = geometry.getAttribute('position');
    if (!pos || pos.count === 0) {
      return { kind: 'unreadable', detail: 'Model không có điểm nào' };
    }

    return { kind: 'ok', object: pointsFromGeometry(geometry), count: pos.count };
  } catch (err: any) {
    clearTimeout(timer);
    const timedOut = err?.name === 'AbortError';
    return {
      kind: 'error',
      detail: timedOut ? 'Quá hạn chờ tải model' : (err?.message ?? String(err)),
    };
  }
}

/** Dọn GPU. Gọi khi tháo ô xem — `THREE.Points` không tự giải phóng bộ đệm. */
export function disposePoints(p: THREE.Points | null | undefined): void {
  if (!p) return;
  try { p.geometry?.dispose(); } catch { /* đã dọn rồi */ }
  const m = p.material as THREE.Material | THREE.Material[] | undefined;
  try {
    if (Array.isArray(m)) m.forEach((x) => x?.dispose());
    else m?.dispose();
  } catch { /* đã dọn rồi */ }
}
