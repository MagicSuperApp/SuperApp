/**
 * Bài kiểm cho KHO MỐC trong máy.
 *
 * Hai điều phải khoá:
 *   1. GHI RỒI ĐỌC LẠI CÒN NGUYÊN. Mốc không có bản trên máy chủ (xem
 *      `markerStore.ts`), nên bộ nhớ máy là bản DUY NHẤT — mất một lần là mất
 *      hẳn công đi bộ ngoài vườn.
 *   2. DỮ LIỆU HỎNG KHÔNG LÀM SẬP. Màn dẫn đường chạy giữa vườn, lúc người dùng
 *      đang cần nó nhất. Một bản ghi cũ thiếu trường không được phép kéo theo
 *      cả màn, và cũng không được kéo theo những mốc lành nằm cạnh nó.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  farmMarkersKey, loadFarmMarkers, MAX_MARKERS_PER_FARM, newMarkerId,
  normalizeMarker, removeFarmMarker, saveFarmMarker, type FarmMarker,
} from './markerStore';

const FARM = 'farm-1';

const moc = (over: Partial<FarmMarker> = {}): FarmMarker => ({
  id: 'mk-1',
  farmId: FARM,
  name: 'Cổng vườn',
  lat: 10.762622,
  lon: 106.660172,
  accuracyM: 8,
  createdAt: 1_700_000_000_000,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('ghi rồi đọc lại', () => {
  it('mốc còn nguyên từng trường sau khi đọc lại', async () => {
    await saveFarmMarker(FARM, moc({ photoPath: '/data/anh.jpg' }));

    const [m] = await loadFarmMarkers(FARM);
    expect(m.id).toBe('mk-1');
    expect(m.name).toBe('Cổng vườn');
    expect(m.lat).toBeCloseTo(10.762622, 9);
    expect(m.lon).toBeCloseTo(106.660172, 9);
    expect(m.accuracyM).toBe(8);
    expect(m.createdAt).toBe(1_700_000_000_000);
    // Đường dẫn được gắn scheme y như `treeImageStore`, để <Image> đọc được.
    expect(m.photoPath).toBe('file:///data/anh.jpg');
  });

  it('vườn chưa có mốc nào → mảng rỗng, không nổ', async () => {
    expect(await loadFarmMarkers(FARM)).toEqual([]);
    expect(await loadFarmMarkers('')).toEqual([]);
  });

  it('mốc MỚI đứng trước, và mỗi vườn một kho riêng', async () => {
    await saveFarmMarker(FARM, moc({ id: 'cu', name: 'Cũ', createdAt: 1000 }));
    await saveFarmMarker(FARM, moc({ id: 'moi', name: 'Mới', createdAt: 2000 }));
    await saveFarmMarker('farm-2', moc({ id: 'khac', name: 'Vườn kia' }));

    expect((await loadFarmMarkers(FARM)).map(m => m.id)).toEqual(['moi', 'cu']);
    expect((await loadFarmMarkers('farm-2')).map(m => m.id)).toEqual(['khac']);
  });

  it('ghi lại cùng một mã thì THAY, không thành hai mốc chồng nhau', async () => {
    await saveFarmMarker(FARM, moc({ name: 'Tên cũ' }));
    const sau = await saveFarmMarker(FARM, moc({ name: 'Tên mới' }));

    expect(sau).toHaveLength(1);
    expect(sau[0].name).toBe('Tên mới');
  });

  it('xoá một mốc, các mốc còn lại không suy suyển', async () => {
    await saveFarmMarker(FARM, moc({ id: 'a', name: 'A' }));
    await saveFarmMarker(FARM, moc({ id: 'b', name: 'B' }));

    const con = await removeFarmMarker(FARM, 'a');
    expect(con.map(m => m.id)).toEqual(['b']);
    expect((await loadFarmMarkers(FARM)).map(m => m.id)).toEqual(['b']);
  });

  it('mã mốc không trùng nhau', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newMarkerId()));
    expect(ids.size).toBe(200);
  });
});

describe('dữ liệu hỏng thì không làm sập', () => {
  it('chuỗi không phải JSON → coi như chưa có mốc', async () => {
    await AsyncStorage.setItem(farmMarkersKey(FARM), 'khong-phai-json{{{');
    await expect(loadFarmMarkers(FARM)).resolves.toEqual([]);
  });

  it('JSON đúng nhưng không phải mảng → rỗng', async () => {
    await AsyncStorage.setItem(farmMarkersKey(FARM), '{"id":"mk-1"}');
    await expect(loadFarmMarkers(FARM)).resolves.toEqual([]);
  });

  it('BỎ bản ghi hỏng, GIỮ bản ghi lành nằm cạnh', async () => {
    await AsyncStorage.setItem(farmMarkersKey(FARM), JSON.stringify([
      null,
      'chuoi-lac',
      { id: 'thieu-toa-do', name: 'Không toạ độ' },
      { id: 'khong-dao', name: 'Null Island', lat: 0, lon: 0 },
      { id: 'ngoai-khoang', name: 'Vĩ độ 999', lat: 999, lon: 10 },
      { name: 'Không mã', lat: 10.5, lon: 105.5 },
      { id: 'lanh', name: 'Máy bơm', lat: 10.5, lon: 105.5, accuracyM: 12, createdAt: 5 },
    ]));

    const ds = await loadFarmMarkers(FARM);
    expect(ds.map(m => m.id)).toEqual(['lanh']);
    expect(ds[0].name).toBe('Máy bơm');
  });

  it('trường thiếu được vá bằng giá trị nói THẬT, không bịa số', async () => {
    await AsyncStorage.setItem(farmMarkersKey(FARM), JSON.stringify([
      { id: 'x', lat: 10.5, lon: 105.5 },
    ]));

    const [m] = await loadFarmMarkers(FARM);
    expect(m.name).toBe('');
    // Không có sai số thì là `null` — "chưa biết", chứ không phải "0 m".
    expect(m.accuracyM).toBeNull();
    expect(m.photoPath).toBeUndefined();
    expect(m.farmId).toBe(FARM);
  });

  it('sai số âm / NaN cũng thành `null`, không lọt vào làm ngưỡng "đã tới"', async () => {
    expect(normalizeMarker({ ...moc(), accuracyM: -5 }, FARM)?.accuracyM).toBeNull();
    expect(normalizeMarker({ ...moc(), accuracyM: 'nhieu' }, FARM)?.accuracyM).toBeNull();
  });

  it('mốc toạ độ rác KHÔNG ghi được — chặn ngay ở đường vào', async () => {
    const sau = await saveFarmMarker(FARM, moc({ lat: 0, lon: 0 }));
    expect(sau).toEqual([]);
  });

  it('không ghi quá trần mỗi vườn', async () => {
    for (let i = 0; i < MAX_MARKERS_PER_FARM + 5; i++) {
      await saveFarmMarker(FARM, moc({ id: `mk-${i}`, createdAt: 1000 + i }));
    }
    expect(await loadFarmMarkers(FARM)).toHaveLength(MAX_MARKERS_PER_FARM);
  });
});
