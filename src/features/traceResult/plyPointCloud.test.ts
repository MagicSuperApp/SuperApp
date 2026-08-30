/**
 * Bài kiểm cho `plyPointCloud`.
 *
 * Tệp mẫu dựng theo ĐÚNG phần đầu của tệp thật (đo 2026-08-19,
 * `https://lampnet.cloud/ln1q_7da38f774a97ca3a_file`): PLY ascii, thuộc tính
 * `x y z` float cộng `red green blue` uchar. Chỉ rút số đỉnh xuống cho gọn.
 */

import { MAX_MODEL_BYTES, loadPointCloud, pointsFromGeometry, isGatewayPlaceholder } from './plyPointCloud';
import * as THREE from 'three';

const ASCII_PLY = [
  'ply',
  'format ascii 1.0',
  'element vertex 3',
  'property float x',
  'property float y',
  'property float z',
  'property uchar red',
  'property uchar green',
  'property uchar blue',
  'end_header',
  '-2.41026 2.23657 5.86080 142 138 152',
  '-2.33212 1.57016 5.70485 82 86 111',
  '-2.16473 -0.70671 5.31683 197 206 213',
  '',
].join('\n');

function bufOf(text: string): ArrayBuffer {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}

function mockFetch(impl: () => Promise<any>) {
  (global as any).fetch = jest.fn(impl);
}

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as any).fetch;
});

describe('loadPointCloud', () => {
  it('đọc được PLY ascii có màu — đúng hình dạng tệp thật', async () => {
    const buf = bufOf(ASCII_PLY);
    mockFetch(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }));

    const r = await loadPointCloud('https://lampnet.cloud/x');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.count).toBe(3);
    // Màu đỉnh PHẢI được giữ: không có nó thì mọi model trông y hệt nhau.
    expect(r.object.geometry.getAttribute('color')).toBeTruthy();
    expect((r.object.material as THREE.PointsMaterial).vertexColors).toBe(true);
  });

  it('404 ⇒ nhánh riêng "chưa dựng model", KHÔNG gộp vào lỗi mạng', async () => {
    mockFetch(async () => ({ ok: false, status: 404 }));
    expect((await loadPointCloud('https://lampnet.cloud/x')).kind).toBe('not_found');
  });

  it('tệp không phải PLY ⇒ unreadable (thử lại là vô ích, và màn phải biết thế)', async () => {
    const buf = bufOf('day khong phai la mot tep PLY');
    mockFetch(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }));
    expect((await loadPointCloud('https://lampnet.cloud/x')).kind).toBe('unreadable');
  });

  it('tệp rỗng ⇒ unreadable, không dựng một đám mây không điểm nào', async () => {
    mockFetch(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect((await loadPointCloud('https://lampnet.cloud/x')).kind).toBe('unreadable');
  });

  it('tệp vượt trần ⇒ too_large, chặn TRƯỚC khi giải mã', async () => {
    const big = new ArrayBuffer(MAX_MODEL_BYTES + 1);
    mockFetch(async () => ({ ok: true, status: 200, arrayBuffer: async () => big }));
    const r = await loadPointCloud('https://lampnet.cloud/x');
    expect(r.kind).toBe('too_large');
  });

  it('mất mạng ⇒ error có câu chi tiết, KHÔNG ném ra ngoài', async () => {
    mockFetch(async () => { throw new TypeError('Network request failed'); });
    const r = await loadPointCloud('https://lampnet.cloud/x');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.detail).toContain('Network request failed');
  });

  it('HTTP 500 ⇒ error kèm mã, không im lặng', async () => {
    mockFetch(async () => ({ ok: false, status: 500 }));
    const r = await loadPointCloud('https://lampnet.cloud/x');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.detail).toBe('HTTP 500');
  });
});

describe('pointsFromGeometry', () => {
  it('dời tâm về gốc — không dời thì vật quay quanh một trục nằm ngoài nó', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [10, 10, 10, 12, 12, 12], 3,
    ));
    const pts = pointsFromGeometry(g);
    pts.geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    pts.geometry.boundingBox!.getCenter(c);
    expect(Math.abs(c.x)).toBeLessThan(1e-5);
    expect(Math.abs(c.y)).toBeLessThan(1e-5);
    expect(Math.abs(c.z)).toBeLessThan(1e-5);
  });

  it('không có màu đỉnh thì tô xanh lá, và KHÔNG bật vertexColors', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3));
    const m = pointsFromGeometry(g).material as THREE.PointsMaterial;
    expect(m.vertexColors).toBe(false);
  });
});

/**
 * Cổng nội dung trả `200` + trang giao diện thay cho tệp.
 *
 * Nhà LampNet đo 2026-08-24: lớp phục vụ tĩnh nuốt `404` và thay bằng
 * `index.html` (13 855 byte). Một CID bịa hoàn toàn cũng trả đúng như vậy. Với
 * 60 tài liệu trên máy sản xuất, 11 tài liệu rơi vào ca này — tức mất tệp nhưng
 * báo thành công.
 *
 * Vì sao phải khoá bằng bài kiểm: ca này KHÔNG có triệu chứng nào ở tầng mã
 * trạng thái. Đường duy nhất nhận ra nó là `content-type`.
 */
describe('cổng trả trang giao diện thay cho tệp', () => {
  const GATEWAY_HTML = '<!doctype html><html><body>LampNet</body></html>';

  /** Phản hồi CÓ `headers` — `fetch` thật luôn có, mock cũ trong tệp này thì không. */
  const respond = (contentType: string, body: string) => ({
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  });

  it('`200 text/html` → `gone`, KHÔNG phải `unreadable`', async () => {
    mockFetch(async () => respond('text/html; charset=utf-8', GATEWAY_HTML));
    expect((await loadPointCloud('https://lampnet.cloud/ln1q_x')).kind).toBe('gone');
  });

  // Kho này gắn `text/plain` cho MỌI tệp, kể cả PLY nhị phân. Lọc rộng hơn
  // `text/html` là chặn nhầm chính đường đang chạy tốt — nên phải có bài này.
  it('`text/plain` KHÔNG bị coi là trang giao diện', () => {
    expect(isGatewayPlaceholder('text/plain')).toBe(false);
    expect(isGatewayPlaceholder('application/octet-stream')).toBe(false);
  });

  it('có kèm charset, khoảng trắng đầu, hoa thường lẫn lộn vẫn nhận ra', () => {
    expect(isGatewayPlaceholder(' text/html;charset=UTF-8')).toBe(true);
    expect(isGatewayPlaceholder('TEXT/HTML')).toBe(true);
  });

  it('thiếu hẳn `content-type` thì KHÔNG kết luận là trang giao diện', () => {
    expect(isGatewayPlaceholder(null)).toBe(false);
    expect(isGatewayPlaceholder(undefined)).toBe(false);
  });
});
