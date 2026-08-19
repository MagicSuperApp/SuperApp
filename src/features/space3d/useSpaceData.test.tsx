/**
 * Bài kiểm KHOÁ LẠI lỗi "vườn chưa vẽ ranh giới thì cây hiện sai chỗ".
 *
 * Lỗi cũ: `buildFarmRing` trả `origin = null` khi ranh giới có dưới 3 đỉnh, và
 * `useSpaceData` khi không có gốc thì bỏ luôn GPS thật của cây, rải chúng bằng
 * `seededPointInRing`. Vườn mới lập, chủ vườn vừa đi bộ ngoài nắng ghi toạ độ
 * từng gốc cây, mà sơ đồ 3D bày ra một mảnh vườn bịa. Không có gì trên màn nói
 * rằng đó là chỗ bịa — `posSource` là thứ duy nhất phân biệt được.
 *
 * Nên phép đo ở đây là chính `posSource`, không phải toạ độ: `'gps'` nghĩa là
 * màn đang vẽ số đo thật, `'auto'` nghĩa là màn đang vẽ số bịa ổn định.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import type { Farm, Tree } from '../../modules/trace/types';
import { useSpaceData, type SpaceData } from './useSpaceData';

/** Kho redux giả — thay mỗi ca kiểm. */
let mockStore: { farm: { farms: Farm[]; trees: Tree[] } } = {
  farm: { farms: [], trees: [] },
};

jest.mock('react-redux', () => ({
  useSelector: (fn: (s: unknown) => unknown) => fn(mockStore),
}));

// Quả chỉ nạp khi mở MỘT cây; ở đây luôn xem toàn cảnh nên chặn hẳn lượt gọi
// mạng, khỏi phụ thuộc vào thứ không liên quan tới phép đo.
jest.mock('../../services/fruitReIDService', () => ({
  getTreeLayout: jest.fn(() => Promise.resolve({ ok: false })),
}));

const tree = (over: Partial<Tree>): Tree => ({
  id: 't', farmId: 'f1', code: '', images: [],
  estimatedFruits: 0, fruitCount: 0,
  ...over,
});

const farm = (over: Partial<Farm>): Farm => ({
  id: 'f1', name: 'Vườn nhà', location: '', area: 0, treeCount: 0,
  ...over,
} as Farm);

/** Vườn CHƯA VẼ RANH GIỚI — `coordinates` rỗng. Đây là ca đang xét. */
const FARM_TRONG = farm({ id: 'f1', coordinates: [] });

/** Ranh giới thật, ô vuông ~110×110 m quanh (10,106). */
const RANH_GIOI = [
  { lat: 10.0, lng: 106.0 }, { lat: 10.001, lng: 106.0 },
  { lat: 10.001, lng: 106.001 }, { lat: 10.0, lng: 106.001 },
];

/** Đọc dữ liệu hook trả về, sau khi đã xả xong các effect đọc AsyncStorage. */
async function doc(): Promise<SpaceData> {
  let out!: SpaceData;
  const Probe: React.FC = () => {
    out = useSpaceData('f1');
    return <Text>ok</Text>;
  };
  await act(async () => { renderer.create(<Probe />); });
  await act(async () => { await Promise.resolve(); });
  return out;
}

beforeEach(() => {
  mockStore = { farm: { farms: [], trees: [] } };
});

describe('vườn CHƯA vẽ ranh giới nhưng cây CÓ GPS', () => {
  it('đặt cây theo GPS thật, không rải ngẫu nhiên', async () => {
    mockStore.farm.farms = [FARM_TRONG];
    mockStore.farm.trees = [
      tree({ id: 't1', latitude: 10.0000, longitude: 106.0000 }),
      tree({ id: 't2', latitude: 10.0009, longitude: 106.0000 }),
    ];

    const d = await doc();

    // Đây là điều kiện nghiệm thu: KHÔNG cây nào rơi về `'auto'`.
    expect(d.trees.map(t => t.posSource)).toEqual(['gps', 'gps']);
    expect(d.hasBoundary).toBe(false);

    // Gốc = trung bình hai cây, nên hai cây phải nằm hai bên gốc theo trục Bắc-Nam
    // và cách nhau đúng quãng thật (~100 m).
    expect(d.origin).not.toBeNull();
    expect(d.origin!.lat).toBeCloseTo(10.00045, 6);
    const [a, b] = d.trees;
    expect(a.pos.z).toBeGreaterThan(0);  // Nam của gốc
    expect(b.pos.z).toBeLessThan(0);     // Bắc của gốc
    expect(Math.abs(a.pos.z - b.pos.z)).toBeGreaterThan(90);
    expect(Math.abs(a.pos.z - b.pos.z)).toBeLessThan(110);
  });

  it('cây dùng lối đặt tên `location` cũng được tính', async () => {
    mockStore.farm.farms = [FARM_TRONG];
    mockStore.farm.trees = [tree({ id: 't1', location: { lat: 10.5, lng: 105.5 } })];

    const d = await doc();

    expect(d.trees[0].posSource).toBe('gps');
    expect(d.origin).toEqual({ lat: 10.5, lng: 105.5 });
  });

  it('cây toạ độ RÁC (0/0) không kéo tâm vườn đi, và tự nó về `auto`', async () => {
    mockStore.farm.farms = [FARM_TRONG];
    mockStore.farm.trees = [
      tree({ id: 't1', latitude: 10.5, longitude: 105.5 }),
      tree({ id: 't2', latitude: 0, longitude: 0 }),
    ];

    const d = await doc();

    // Tâm vườn bám cây thật; lọt cây 0/0 vào thì nó thành 5,25 / 52,75.
    expect(d.origin!.lat).toBeCloseTo(10.5, 6);
    expect(d.origin!.lng).toBeCloseTo(105.5, 6);
    expect(d.trees.map(t => t.posSource)).toEqual(['gps', 'auto']);
    // Và cây rác phải nằm trong ô vuông dự phòng, không văng ra hàng nghìn km.
    expect(Math.abs(d.trees[1].pos.x)).toBeLessThan(100);
    expect(Math.abs(d.trees[1].pos.z)).toBeLessThan(100);
  });

  it('KHÔNG cây nào có GPS → vẫn là `auto`, đúng như trước', async () => {
    mockStore.farm.farms = [FARM_TRONG];
    mockStore.farm.trees = [tree({ id: 't1' }), tree({ id: 't2' })];

    const d = await doc();

    expect(d.origin).toBeNull();
    expect(d.trees.map(t => t.posSource)).toEqual(['auto', 'auto']);
  });
});

describe('vườn ĐÃ vẽ ranh giới — hành vi cũ không đổi', () => {
  it('gốc vẫn là trọng tâm ranh giới, không phải tâm đàn cây', async () => {
    mockStore.farm.farms = [farm({ id: 'f1', coordinates: RANH_GIOI })];
    // Cây đứng lệch hẳn sang một góc: nếu gốc bị đàn cây kéo theo thì
    // `treeGeo.farmOrigin` (dùng ranh giới) và màn 3D sẽ hiểu khác nhau về gốc.
    mockStore.farm.trees = [tree({ id: 't1', latitude: 10.0009, longitude: 106.0009 })];

    const d = await doc();

    expect(d.hasBoundary).toBe(true);
    expect(d.origin!.lat).toBeCloseTo(10.0005, 7);
    expect(d.origin!.lng).toBeCloseTo(106.0005, 7);
    expect(d.trees[0].posSource).toBe('gps');
  });
});
