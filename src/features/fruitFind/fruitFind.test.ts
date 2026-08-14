/**
 * fruitFind.test — logic luồng "quét quả → ra cây".
 *
 * Trọng tâm các bài kiểm ở đây là những chỗ SAI THÌ IM LẶNG: gán nhầm cây cho
 * quả, coi lỗi mạng là "quả mới", và hiện nút phán quyết khi chưa có neo.
 */

import {
  nearbyTrees, countPositionedTrees, buildFruitTreeIndex, resolveCandidates,
  topCandidates, distinctTrees, outcomeOfScan, canSendVerdict,
  TOP_N, NEARBY_RADIUS_M,
} from './fruitFind';
import type { IdentifiedFruitCandidate } from '../../services/fruitReIDService';

const HERE = { lat: 12.6667, lon: 108.0382 };

const TREES = [
  { tree_id: 'T-gan', name: 'Cây đầu bờ', gps: [HERE.lat + 0.0001, HERE.lon] as [number, number] },
  { tree_id: 'T-giua', name: 'Cây giữa', gps: [HERE.lat + 0.0004, HERE.lon] as [number, number] },
  { tree_id: 'T-xa', name: 'Cây cuối vườn', gps: [HERE.lat + 0.002, HERE.lon] as [number, number] },
  { tree_id: 'T-mu', name: 'Cây chưa đặt vị trí', gps: null },
];

const cand = (over: Partial<IdentifiedFruitCandidate> & { fruit_id: string }): IdentifiedFruitCandidate => ({
  name: null, n_views: 1, thumbnail_url: null, bbox: null, ...over,
});

describe('nearbyTrees', () => {
  it('gần → xa, bỏ cây chưa có toạ-độ', () => {
    expect(nearbyTrees(HERE, TREES, { radiusM: 500 }).map(x => x.tree.tree_id))
      .toEqual(['T-gan', 'T-giua', 'T-xa']);
  });

  it('bán kính MẶC ĐỊNH là 60 m — cây cuối vườn (~222 m) nằm ngoài', () => {
    expect(NEARBY_RADIUS_M).toBe(60);
    expect(nearbyTrees(HERE, TREES).map(x => x.tree.tree_id)).toEqual(['T-gan', 'T-giua']);
  });

  it('KHÔNG có vị-trí → mảng rỗng, không đoán cây nào', () => {
    expect(nearbyTrees(null, TREES)).toEqual([]);
  });

  it('countPositionedTrees đếm đúng số cây có toạ-độ', () => {
    expect(countPositionedTrees(TREES)).toBe(3);
    expect(countPositionedTrees([])).toBe(0);
  });
});

describe('buildFruitTreeIndex', () => {
  it('gộp nhiều cây thành một bảng tra', () => {
    const idx = buildFruitTreeIndex([
      { treeId: 'T-gan', treeName: 'Cây đầu bờ', fruitIds: ['F1', 'F2'] },
      { treeId: 'T-xa', treeName: 'Cây cuối vườn', fruitIds: ['F3'] },
    ]);
    expect(idx.get('F1')).toEqual({ treeId: 'T-gan', treeName: 'Cây đầu bờ' });
    expect(idx.get('F3')).toEqual({ treeId: 'T-xa', treeName: 'Cây cuối vườn' });
    expect(idx.size).toBe(3);
  });

  it('quả trùng ở hai cây → GIỮ cây gần nhất (mục vào trước), không ghi đè', () => {
    const idx = buildFruitTreeIndex([
      { treeId: 'T-gan', treeName: 'gần', fruitIds: ['F1'] },
      { treeId: 'T-xa', treeName: 'xa', fruitIds: ['F1'] },
    ]);
    expect(idx.get('F1')?.treeId).toBe('T-gan');
  });

  it('tên cây thiếu → null chứ không undefined', () => {
    const idx = buildFruitTreeIndex([{ treeId: 'T', fruitIds: ['F'] }]);
    expect(idx.get('F')).toEqual({ treeId: 'T', treeName: null });
  });
});

describe('resolveCandidates', () => {
  const idx = buildFruitTreeIndex([{ treeId: 'T-gan', treeName: 'Cây đầu bờ', fruitIds: ['F-idx'] }]);

  it('ưu tiên cây MÁY CHỦ trả', () => {
    const [r] = resolveCandidates([cand({ fruit_id: 'F1', tree_id: 'T-server', tree_name: 'Cây máy chủ' })], idx);
    expect(r.treeId).toBe('T-server');
    expect(r.treeName).toBe('Cây máy chủ');
    expect(r.treeSource).toBe('server');
  });

  it('máy chủ không trả cây → tra bảng cây gần đó, và ĐÁNH DẤU là tra được', () => {
    const [r] = resolveCandidates([cand({ fruit_id: 'F-idx' })], idx);
    expect(r.treeId).toBe('T-gan');
    expect(r.treeSource).toBe('nearby_index');
  });

  it('không tra được thì để TRỐNG — tuyệt đối không gán cây gần nhất cho xong', () => {
    const [r] = resolveCandidates([cand({ fruit_id: 'F-la' })], idx);
    expect(r.treeId).toBeNull();
    expect(r.treeName).toBeNull();
    expect(r.treeSource).toBe('unknown');
  });

  it('giữ nguyên vòng đời quả và các trường hiển thị', () => {
    const [r] = resolveCandidates(
      [cand({ fruit_id: 'F1', name: 'Chùm ngọn 3', n_views: 4, status: 'harvested', thumbnail_url: '/gimg/x' })],
      idx,
    );
    expect(r).toMatchObject({
      fruitId: 'F1', name: 'Chùm ngọn 3', nViews: 4, status: 'harvested', thumbnailUrl: '/gimg/x',
    });
  });

  it('trường thiếu không thành undefined lọt ra giao diện', () => {
    const [r] = resolveCandidates([cand({ fruit_id: 'F1' })], idx);
    expect(r.name).toBeNull();
    expect(r.status).toBeNull();
    expect(r.thumbnailUrl).toBeNull();
    expect(r.nViews).toBe(1);
  });
});

describe('topCandidates', () => {
  const many = resolveCandidates(
    Array.from({ length: 9 }, (_, i) => cand({ fruit_id: `F${i}` })),
    new Map(),
  );

  it('cắt còn 5 — rank-5 là điểm vận hành duy nhất dùng được', () => {
    expect(TOP_N).toBe(5);
    expect(topCandidates(many)).toHaveLength(5);
  });

  it('GIỮ NGUYÊN thứ tự máy chủ, không xếp lại', () => {
    expect(topCandidates(many).map(c => c.fruitId)).toEqual(['F0', 'F1', 'F2', 'F3', 'F4']);
  });

  it('KHÔNG lọc quả đã hái — quét quả ở chợ là ca dùng đúng', () => {
    const mixed = resolveCandidates(
      [cand({ fruit_id: 'A', status: 'harvested' }), cand({ fruit_id: 'B', status: 'on_tree' })],
      new Map(),
    );
    expect(topCandidates(mixed).map(c => c.fruitId)).toEqual(['A', 'B']);
  });

  it('ít hơn 5 thì trả hết, không đệm', () => {
    expect(topCandidates(many.slice(0, 2))).toHaveLength(2);
  });
});

describe('distinctTrees', () => {
  it('gom về các cây riêng biệt, giữ thứ tự gặp đầu tiên', () => {
    const list = resolveCandidates([
      cand({ fruit_id: 'A', tree_id: 'T1', tree_name: 'Một' }),
      cand({ fruit_id: 'B', tree_id: 'T2', tree_name: 'Hai' }),
      cand({ fruit_id: 'C', tree_id: 'T1', tree_name: 'Một' }),
    ], new Map());
    expect(distinctTrees(list)).toEqual([
      { treeId: 'T1', treeName: 'Một' },
      { treeId: 'T2', treeName: 'Hai' },
    ]);
  });

  it('bỏ qua ứng viên chưa tra được cây', () => {
    const list = resolveCandidates([cand({ fruit_id: 'A' })], new Map());
    expect(distinctTrees(list)).toEqual([]);
  });
});

describe('outcomeOfScan', () => {
  it('có ứng viên → bày danh sách, KỂ CẢ khi máy nói MATCH', () => {
    expect(outcomeOfScan(true, 'MATCH', 3)).toBe('pick');
    expect(outcomeOfScan(true, 'UNCERTAIN', 1)).toBe('pick');
  });

  it('đã soi, không ứng viên nào → mời đăng ký quả mới', () => {
    expect(outcomeOfScan(true, 'NO_MATCH', 0)).toBe('nothing_found');
    expect(outcomeOfScan(true, 'EMPTY_BUCKET', 0)).toBe('nothing_found');
    expect(outcomeOfScan(true, undefined, 0)).toBe('nothing_found');
  });

  it('MATCH mà không kèm danh sách (máy chủ bản cũ) là ca RIÊNG', () => {
    expect(outcomeOfScan(true, 'MATCH', 0)).toBe('match_without_list');
  });

  it('gọi hỏng KHÔNG được đọc thành "quả mới" — đó là đường tạo hồ sơ trùng', () => {
    expect(outcomeOfScan(false, undefined, 0)).toBe('failed');
    expect(outcomeOfScan(false, 'NO_MATCH', 0)).toBe('failed');
    expect(outcomeOfScan(false, 'MATCH', 5)).toBe('failed');
  });
});

describe('canSendVerdict', () => {
  it('chỉ gửi phán quyết khi có neo query_id', () => {
    expect(canSendVerdict('q-123')).toBe(true);
  });

  it('thiếu neo → ẩn nút, không bịa', () => {
    expect(canSendVerdict(undefined)).toBe(false);
    expect(canSendVerdict(null)).toBe(false);
    expect(canSendVerdict('')).toBe(false);
  });
});
