/**
 * Bài kiểm cho `treePoints` — cây thật trong vườn 3D.
 *
 * Ba phần tách hẳn nhau:
 *   · `frameTreePoints`    — hình học thuần. Sai thì thấy ngay ngoài vườn: cây
 *     lún xuống đất, lơ lửng, hoặc to bằng cả thửa.
 *   · `readPointGeometry`  — đọc thân máy chủ. Máy chủ KHÔNG công bố schema phần
 *     hình học nên chỗ đọc phải dò nhiều hình dạng; bài kiểm ghim đúng những
 *     hình dạng đang đỡ, và ghim cả việc "không nhận ra" phải trả `null` chứ
 *     không trả một hình rỗng trông như thật.
 *   · `loadTreePoints`     — phân nhánh. Đây là phần đã từng sai và làm cả vườn
 *     hoá hình nón, nên nó được canh kỹ nhất.
 */

import * as THREE from 'three';
import { TREE_HEIGHT } from './treeFrame';
import {
  _resetTreePointsCacheForTest, buildEdgeGeometry, frameTreePoints, loadTreePoints,
  readPointGeometry,
} from './treePoints';

// GIỮ NGUYÊN phần còn lại của module: thay CẢ module là các hàm khác biến mất và
// lỗi hiện ra ở một chỗ chẳng liên quan.
jest.mock('../../services/treeReIDService', () => ({
  ...jest.requireActual('../../services/treeReIDService'),
  __esModule: true,
  getTreeModel3D: jest.fn(),
}));

const { getTreeModel3D } = require('../../services/treeReIDService');

/** Đám điểm hộp: rộng 2 (x), cao 4 (y), dày 2 (z), tâm lệch hẳn khỏi gốc. */
const BOX_POINTS: number[] = [];
for (const x of [10, 12]) {
  for (const y of [100, 104]) {
    for (const z of [-5, -3]) BOX_POINTS.push(x, y, z);
  }
}

function boxCloud(): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(BOX_POINTS, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial());
}

const ok = (data: any) => ({ ok: true, data });

beforeEach(() => {
  _resetTreePointsCacheForTest();
  jest.clearAllMocks();
});

describe('frameTreePoints', () => {
  it('thu về đúng chiều cao của khung vườn', () => {
    const p = frameTreePoints(boxCloud());
    expect(p.scale.y).toBeCloseTo(TREE_HEIGHT / 4, 6);
    expect(p.scale.x).toBeCloseTo(p.scale.y, 6);
    expect(p.scale.z).toBeCloseTo(p.scale.y, 6);
  });

  it('đặt GỐC cây chạm mặt đất, không phải tâm cây', () => {
    const p = frameTreePoints(boxCloud());
    p.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(TREE_HEIGHT, 5);
  });

  it('canh tâm ngang về trục đứng để cây mọc đúng chỗ đã đặt', () => {
    const p = frameTreePoints(boxCloud());
    p.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it('đám điểm dẹt (cao 0) không làm nổ phép chia', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 2, 1, 2], 3));
    const p = frameTreePoints(new THREE.Points(g, new THREE.PointsMaterial()));
    expect(p.scale.y).toBe(1);
  });
});

describe('readPointGeometry — dò hình dạng thân máy chủ', () => {
  it('mảng số phẳng [x,y,z,x,y,z,…]', () => {
    const r = readPointGeometry({ points: [0, 0, 0, 1, 2, 3] } as any);
    expect(r?.count).toBe(2);
    expect(r?.geometry.getAttribute('position').count).toBe(2);
  });

  it('mảng bộ ba [[x,y,z],…]', () => {
    const r = readPointGeometry({ points: [[0, 0, 0], [1, 2, 3], [4, 5, 6]] } as any);
    expect(r?.count).toBe(3);
  });

  it('hình học lồng trong khoá bao (`model`/`data`)', () => {
    expect(readPointGeometry({ data: { xyz: [0, 0, 0, 1, 1, 1] } } as any)?.count).toBe(2);
    expect(readPointGeometry({ model: { positions: [0, 0, 0] } } as any)?.count).toBe(1);
  });

  it('màu thang 0–255 được đưa về 0–1 (đưa nguyên vào three là cây trắng xoá)', () => {
    const r = readPointGeometry({ points: [0, 0, 0], colors: [255, 0, 128] } as any);
    const c = r?.geometry.getAttribute('color');
    expect(c?.count).toBe(1);
    expect(c?.getX(0)).toBeCloseTo(1, 5);
    expect(c?.getZ(0)).toBeCloseTo(128 / 255, 5);
  });

  it('màu đã ở thang 0–1 thì GIỮ NGUYÊN', () => {
    const r = readPointGeometry({ points: [0, 0, 0], rgb: [1, 0.5, 0] } as any);
    expect(r?.geometry.getAttribute('color')?.getY(0)).toBeCloseTo(0.5, 5);
  });

  it('màu lệch số lượng so với điểm thì BỎ màu, vẫn giữ hình', () => {
    const r = readPointGeometry({ points: [0, 0, 0, 1, 1, 1], colors: [255, 0, 0] } as any);
    expect(r?.count).toBe(2);
    expect(r?.geometry.getAttribute('color')).toBeUndefined();
  });

  it('mảng số lẻ (không chia hết 3) KHÔNG được nhận bừa', () => {
    expect(readPointGeometry({ points: [0, 0, 0, 1] } as any)).toBeNull();
  });

  it('thân không có hình học → null, KHÔNG phải một hình rỗng', () => {
    expect(readPointGeometry({ meta: { status: 'none' } } as any)).toBeNull();
    expect(readPointGeometry({ points: [] } as any)).toBeNull();
  });
});

describe('buildEdgeGeometry — nối mỗi điểm tới 3 điểm gần nhất', () => {
  /** Lưới đều: n×n×1 điểm cách nhau 1 đơn-vị trên mặt phẳng z = 0. */
  function grid(n: number): Float32Array {
    const out: number[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(i, j, 0);
    return new Float32Array(out);
  }

  const segCount = (g: any) => g.getAttribute('position').count / 2;

  it('quá ít điểm thì KHÔNG nối (chỗ gọi vẫn vẽ chấm bình thường)', () => {
    expect(buildEdgeGeometry(new Float32Array([0, 0, 0]), null)).toBeNull();
    expect(buildEdgeGeometry(new Float32Array([0, 0, 0, 1, 1, 1]), null)).toBeNull();
  });

  it('mọi điểm trùng khít nhau → không có đoạn nào (đoạn dài 0 vẽ ra không thấy)', () => {
    const same = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(buildEdgeGeometry(same, null)).toBeNull();
  });

  it('lưới đều: số đoạn nằm trong khoảng hợp lý, không nổ theo n²', () => {
    const g = buildEdgeGeometry(grid(10), null)!;
    expect(g).not.toBeNull();
    const segs = segCount(g);
    // Chặn trên lý thuyết là n×K (mỗi điểm 3 đoạn, trước khi gộp trùng).
    expect(segs).toBeLessThanOrEqual(100 * 3);
    // Và phải nhiều hơn hẳn một chuỗi hạt, nếu không lưới chẳng thành hình.
    expect(segs).toBeGreaterThan(100);
  });

  it('mỗi đoạn chỉ vẽ MỘT lần — A→B và B→A là một', () => {
    const g = buildEdgeGeometry(grid(6), null)!;
    const pos = g.getAttribute('position');
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i += 2) {
      const a = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
      const b = `${pos.getX(i + 1)},${pos.getY(i + 1)},${pos.getZ(i + 1)}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('KHÔNG bắc cầu qua khoảng trống lớn — điểm lạc không kéo mạng nhện', () => {
    // Một cụm dày ở gốc, cộng một điểm lạc ở rất xa. "Ba điểm gần nhất" của điểm
    // lạc vẫn là ba điểm trong cụm, và nếu không có trần chiều dài thì ba đoạn
    // đó bắc ngang qua cả cây.
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pts.push(i, j, 0);
    pts.push(500, 500, 500);
    const g = buildEdgeGeometry(new Float32Array(pts), null)!;
    const pos = g.getAttribute('position');
    let chamDiemLac = false;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) === 500 && pos.getY(i) === 500) chamDiemLac = true;
    }
    expect(chamDiemLac).toBe(false);
  });

  it('mang MÀU của hai điểm đầu đoạn (không bịa một màu chung)', () => {
    const pts = grid(4);
    const n = pts.length / 3;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = i / n;        // đỏ tăng dần theo chỉ số
      colors[i * 3 + 1] = 0.25;
      colors[i * 3 + 2] = 0.5;
    }
    const g = buildEdgeGeometry(pts, colors)!;
    const col = g.getAttribute('color');
    expect(col).toBeDefined();
    expect(col.count).toBe(g.getAttribute('position').count);
    // Ít nhất hai đầu đoạn phải khác màu nhau — nếu đều một màu thì màu bị bịa.
    const doList = new Set<number>();
    for (let i = 0; i < col.count; i++) doList.add(Math.round(col.getX(i) * 1000));
    expect(doList.size).toBeGreaterThan(1);
  });

  it('không màu điểm → không có thuộc tính màu trên lưới', () => {
    const g = buildEdgeGeometry(grid(4), null)!;
    expect(g.getAttribute('color')).toBeUndefined();
  });

  it('4 000 điểm vẫn dựng xong nhanh (lưới ô, không so mọi cặp)', () => {
    const pts = new Float32Array(4000 * 3);
    for (let i = 0; i < 4000; i++) {
      pts[i * 3] = Math.sin(i) * 3;
      pts[i * 3 + 1] = (i / 4000) * 4;
      pts[i * 3 + 2] = Math.cos(i) * 3;
    }
    const t0 = Date.now();
    const g = buildEdgeGeometry(pts, null);
    // So mọi cặp là 16 triệu phép đo; ngưỡng này chỉ để bắt ca thuật-toán tụt
    // về O(n²), không phải để đo tốc độ máy dựng.
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(g).not.toBeNull();
  });
});

describe('readPointGeometry — kèm lưới nối', () => {
  it('đủ điểm thì dựng luôn lưới nối', () => {
    const pts: number[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) pts.push(i, j, 0);
    const r = readPointGeometry({ points: pts } as any);
    expect(r?.count).toBe(16);
    expect(r?.edges).not.toBeNull();
  });

  it('hai điểm thì chỉ có chấm, không có lưới', () => {
    const r = readPointGeometry({ points: [0, 0, 0, 1, 1, 1] } as any);
    expect(r?.count).toBe(2);
    expect(r?.edges).toBeNull();
  });
});

describe('loadTreePoints — phân nhánh', () => {
  it('thiếu mã cây → lỗi, không gọi máy chủ', async () => {
    const r = await loadTreePoints('  ');
    expect(r.kind).toBe('error');
    expect(getTreeModel3D).not.toHaveBeenCalled();
  });

  it('gọi ĐÚNG cửa của CHỦ, kèm trần số điểm', async () => {
    // Bản trước gọi `/api/provenance/{id}` — cửa CÔNG KHAI, trả 404 cho cây
    // riêng-tư. Kho sản xuất có 0 cây công khai, nên mọi cây rơi về hình nón.
    getTreeModel3D.mockResolvedValue(ok({ points: [0, 0, 0, 0, 1, 0] }));
    await loadTreePoints('t-1');
    const [, treeId, opts] = getTreeModel3D.mock.calls[0];
    expect(treeId).toBe('t-1');
    expect(opts.maxPoints).toBeGreaterThan(0);
  });

  it('chưa dựng (`status: none`) → `unavailable` kèm việc cần làm', async () => {
    getTreeModel3D.mockResolvedValue(ok({ meta: { status: 'none' } }));
    const r = await loadTreePoints('t-2');
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.message).toMatch(/chụp thêm ảnh/i);
  });

  it('đang dựng (`status: building`) → câu KHÁC hẳn "chưa dựng"', async () => {
    getTreeModel3D.mockResolvedValue(ok({ meta: { status: 'building' } }));
    const r = await loadTreePoints('t-3');
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.message).toMatch(/đang dựng/i);
  });

  it('dựng hỏng (`status: failed`) → mang theo LÝ DO của máy chủ', async () => {
    // Gộp `failed` vào `none` là nông dân bấm dựng, hỏng, app lại mời bấm dựng,
    // vòng mãi không ai nói vì sao.
    getTreeModel3D.mockResolvedValue(
      ok({ meta: { status: 'failed', error: 'Ảnh quá ít góc.' } }),
    );
    const r = await loadTreePoints('t-4');
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.message).toContain('Ảnh quá ít góc.');
  });

  it('máy chủ NÓI CÓ hình mà app đọc không ra → `unreadable`, KHÔNG im lặng', async () => {
    // Đây là bất biến quan trọng nhất của tệp này. Xếp ca này vào `unavailable`
    // là dựng lại đúng cái bẫy vừa gỡ: cây hoá hình nón, không một dòng lỗi.
    getTreeModel3D.mockResolvedValue(
      ok({ available: true, hinh_la: [1, 2, 3], meta: { n_points_model: 812 } }),
    );
    const r = await loadTreePoints('t-5');
    expect(r.kind).toBe('unreadable');
    if (r.kind === 'unreadable') expect(r.message).toContain('hinh_la');
  });

  it('403/404 → `unavailable`, không khẳng định cây không tồn tại', async () => {
    getTreeModel3D.mockResolvedValue({
      ok: false,
      error: { type: 'validation_error', detail: 'x', http_status: 404 },
    });
    const r = await loadTreePoints('t-6');
    expect(r.kind).toBe('unavailable');
  });

  it('lỗi mạng → `error` (đáng thử lại)', async () => {
    getTreeModel3D.mockResolvedValue({
      ok: false,
      error: { type: 'network_error', detail: 'Mất kết nối', http_status: 0 },
    });
    const r = await loadTreePoints('t-7');
    expect(r.kind).toBe('error');
  });

  it('mang theo câu của máy chủ về độ phủ ảnh', async () => {
    getTreeModel3D.mockResolvedValue(
      ok({
        points: [0, 0, 0, 0, 1, 0],
        meta: { coverage: { advice: 'Mới chụp ~60° (một phía cây).' } },
      }),
    );
    const r = await loadTreePoints('t-8');
    if (r.kind !== 'ok') throw new Error('phải là ok');
    expect(r.template.advice).toBe('Mới chụp ~60° (một phía cây).');
    expect(r.template.count).toBe(2);
  });
});

describe('loadTreePoints — nhớ kết quả', () => {
  it('hỏi hai lần chỉ gọi máy chủ MỘT lần', async () => {
    getTreeModel3D.mockResolvedValue(ok({ points: [0, 0, 0, 0, 1, 0] }));
    await loadTreePoints('t-9');
    await loadTreePoints('t-9');
    expect(getTreeModel3D).toHaveBeenCalledTimes(1);
  });

  it('LỖI thì KHÔNG nhớ — mất sóng một lần không được làm cây câm mãi', async () => {
    getTreeModel3D.mockResolvedValueOnce({
      ok: false,
      error: { type: 'network_error', detail: 'Mất kết nối', http_status: 0 },
    });
    expect((await loadTreePoints('t-10')).kind).toBe('error');

    getTreeModel3D.mockResolvedValueOnce(ok({ points: [0, 0, 0, 0, 1, 0] }));
    expect((await loadTreePoints('t-10')).kind).toBe('ok');
    expect(getTreeModel3D).toHaveBeenCalledTimes(2);
  });

  it('`unreadable` cũng KHÔNG nhớ — hợp đồng máy chủ có thể vừa được sửa', async () => {
    getTreeModel3D.mockResolvedValueOnce(ok({ available: true, la: 1 }));
    expect((await loadTreePoints('t-11')).kind).toBe('unreadable');
    getTreeModel3D.mockResolvedValueOnce(ok({ points: [0, 0, 0] }));
    expect((await loadTreePoints('t-11')).kind).toBe('ok');
  });

  it('"chưa dựng" thì CÓ nhớ — đó là sự thật về cây, không phải sự cố', async () => {
    getTreeModel3D.mockResolvedValue(ok({ meta: { status: 'none' } }));
    await loadTreePoints('t-12');
    await loadTreePoints('t-12');
    expect(getTreeModel3D).toHaveBeenCalledTimes(1);
  });
});
