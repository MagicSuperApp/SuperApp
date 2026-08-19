import { LOOKUP_MAX_BYTES } from '../../services/fruitLookupService';
import { SHRINK_LADDER, centerSquareCrop, prepareForLookup, resizeTarget } from './prepareImage';

// Ảnh: cân bằng `expo-file-system/legacy` (qua `imageBytes`). Bảng dưới cho phép
// mỗi URI khai một dung lượng riêng.
const mockSizes: Record<string, number> = {};
jest.mock(
  'expo-file-system/legacy',
  () => ({ getInfoAsync: jest.fn(async (uri: string) => ({ exists: true, size: mockSizes[uri] })) }),
  { virtual: true },
);

// `expo-image-manipulator` là mô-đun NATIVE — trong node nó không có thật, nên
// test tự dựng. `mockManipulate` giả trả URI theo bậc để đo đúng bậc nào được dùng.
const mockManipulate = jest.fn();
jest.mock(
  'expo-image-manipulator',
  () => ({ manipulateAsync: (...a: unknown[]) => mockManipulate(...a), SaveFormat: { JPEG: 'jpeg' } }),
  { virtual: true },
);

const SRC = 'file:///cap.jpg';

beforeEach(() => {
  for (const k of Object.keys(mockSizes)) delete mockSizes[k];
  mockManipulate.mockReset();
});

describe('resizeTarget', () => {
  it('đặt ĐÚNG MỘT chiều — đặt cả hai là ép tỉ lệ, quả méo thì vân vỏ méo theo', () => {
    expect(resizeTarget({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600 });
    expect(resizeTarget({ width: 3000, height: 4000 }, 1600)).toEqual({ height: 1600 });
  });
  it('ảnh đã đủ nhỏ → null (không co)', () => {
    expect(resizeTarget({ width: 800, height: 600 }, 1600)).toBeNull();
  });
  it('số rác → null', () => {
    expect(resizeTarget({ width: NaN, height: 0 }, 1600)).toBeNull();
  });
});

describe('prepareForLookup', () => {
  it('ảnh đã dưới trần thì gửi NGUYÊN tấm — co lại chỉ mất chi tiết', async () => {
    mockSizes[SRC] = 900_000;
    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.resized).toBe(false);
    expect(r.image.uri).toBe(SRC);
    expect(r.image.width).toBe(4000);
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('ảnh quá nặng → co bậc ĐẦU, dừng ngay khi lọt trần', async () => {
    mockSizes[SRC] = 4_000_000;
    mockSizes['file:///s0.jpg'] = 1_200_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///s0.jpg', width: 1600, height: 1200 });

    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.uri).toBe('file:///s0.jpg');
    expect(r.image.width).toBe(1600);
    expect(r.image.resized).toBe(true);
    expect(mockManipulate).toHaveBeenCalledTimes(1);
    // Bậc đầu của thang, không phải một con số nào khác.
    expect(mockManipulate.mock.calls[0][1]).toEqual([{ resize: { width: SHRINK_LADDER[0].maxEdge } }]);
  });

  it('bậc đầu vẫn nặng → tụt xuống bậc sau', async () => {
    mockSizes[SRC] = 8_000_000;
    mockSizes['file:///s0.jpg'] = 3_000_000;
    mockSizes['file:///s1.jpg'] = 1_000_000;
    mockManipulate
      .mockResolvedValueOnce({ uri: 'file:///s0.jpg', width: 1600, height: 1200 })
      .mockResolvedValueOnce({ uri: 'file:///s1.jpg', width: 1280, height: 960 });

    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.uri).toBe('file:///s1.jpg');
    expect(mockManipulate).toHaveBeenCalledTimes(2);
  });

  it('một bậc NÉM thì thử bậc nhỏ hơn, không chết cả lượt', async () => {
    mockSizes[SRC] = 8_000_000;
    mockSizes['file:///s1.jpg'] = 1_000_000;
    mockManipulate
      .mockRejectedValueOnce(new Error('hết bộ nhớ'))
      .mockResolvedValueOnce({ uri: 'file:///s1.jpg', width: 1280, height: 960 });

    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('ok');
  });

  it('co hết thang vẫn nặng → too_large, và KHÔNG đổ tại thiếu mô-đun', async () => {
    mockSizes[SRC] = 9_000_000;
    for (let i = 0; i < SHRINK_LADDER.length; i++) {
      mockSizes[`file:///x${i}.jpg`] = LOOKUP_MAX_BYTES + 1;
      mockManipulate.mockResolvedValueOnce({ uri: `file:///x${i}.jpg`, width: 100, height: 100 });
    }
    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('too_large');
    if (r.kind !== 'too_large') return;
    expect(r.noResizer).toBe(false);
  });

  it('co được nhưng KHÔNG cân được bậc đó → vẫn nhận, để máy chủ phán', async () => {
    mockSizes[SRC] = 5_000_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///nosize.jpg', width: 1600, height: 1200 });
    const r = await prepareForLookup(SRC, 4000, 3000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.bytes).toBeNull();
  });

  it('KHÔNG cân được tấm nào → vẫn gửi thử, không chặn oan', async () => {
    // `mockSizes` không khai URI nào → `imageBytes` trả null ở mọi bậc. Đường này
    // phải kết thúc bằng "gửi đi", vì chặn một tấm chưa đo được là chặn oan.
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///unknown-s0.jpg', width: 1600, height: 1200 });
    const r = await prepareForLookup('file:///unknown.jpg', 4000, 3000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.bytes).toBeNull();
  });

  it('URI không phải file:// (content://) → không cân được, vẫn đi tiếp', async () => {
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///from-content.jpg', width: 1600, height: 1200 });
    const r = await prepareForLookup('content://media/42', 4000, 3000);
    expect(r.kind).toBe('ok');
  });
});

describe('centerSquareCrop — ô vuông người dùng thật sự nhìn thấy', () => {
  it('ảnh ngang 4:3 → cắt hai mép trái/phải đều nhau', () => {
    expect(centerSquareCrop(4000, 3000)).toEqual({
      originX: 500, originY: 0, width: 3000, height: 3000,
    });
  });

  it('ảnh dọc → cắt trên/dưới đều nhau', () => {
    expect(centerSquareCrop(3000, 4000)).toEqual({
      originX: 0, originY: 500, width: 3000, height: 3000,
    });
  });

  it('ảnh đã vuông → null, không cắt cho có', () => {
    expect(centerSquareCrop(2000, 2000)).toBeNull();
  });

  it('số rác → null', () => {
    expect(centerSquareCrop(0, 100)).toBeNull();
    expect(centerSquareCrop(NaN, 100)).toBeNull();
  });

  it('cạnh lẻ vẫn ra số NGUYÊN — để hai nền không lệch một pixel', () => {
    const c = centerSquareCrop(4001, 3001)!;
    for (const v of Object.values(c)) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('prepareForLookup — cắt về khung ngắm', () => {
  it('square: CẮT rồi mới CO, và thang co đo trên cỡ ĐÃ CẮT', async () => {
    mockSizes[SRC] = 5_000_000;
    mockSizes['file:///c0.jpg'] = 900_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///c0.jpg', width: 1600, height: 1600 });

    const r = await prepareForLookup(SRC, 4000, 3000, { square: true });
    expect(r.kind).toBe('ok');

    const actions = mockManipulate.mock.calls[0][1];
    // Cắt TRƯỚC: `crop` đo bằng pixel ảnh gốc, co trước là cắt vào toạ độ đã mất.
    expect(actions[0]).toEqual({
      crop: { originX: 500, originY: 0, width: 3000, height: 3000 },
    });
    // Cỡ sau cắt là 3000 (không phải 4000) → vẫn quá bậc đầu nên có resize.
    expect(actions[1]).toEqual({ resize: { width: SHRINK_LADDER[0].maxEdge } });
  });

  it('square: ảnh NHẸ vẫn phải cắt — không được đi đường tắt "đã dưới trần"', async () => {
    mockSizes[SRC] = 300_000;
    mockSizes['file:///c1.jpg'] = 250_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///c1.jpg', width: 3000, height: 3000 });

    const r = await prepareForLookup(SRC, 4000, 3000, { square: true });
    expect(mockManipulate).toHaveBeenCalledTimes(1);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.uri).toBe('file:///c1.jpg');
    expect(r.image.width).toBe(3000);
  });

  it('KHÔNG square (ảnh thư viện) → không có `crop` nào trong actions', async () => {
    mockSizes[SRC] = 5_000_000;
    mockSizes['file:///n0.jpg'] = 900_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///n0.jpg', width: 1600, height: 1200 });

    await prepareForLookup(SRC, 4000, 3000);
    const actions = mockManipulate.mock.calls[0][1];
    expect(actions.some((a: any) => 'crop' in a)).toBe(false);
  });

  it('ảnh đã vuông + square → không thêm bước cắt thừa', async () => {
    mockSizes[SRC] = 5_000_000;
    mockSizes['file:///s.jpg'] = 900_000;
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///s.jpg', width: 1600, height: 1600 });

    await prepareForLookup(SRC, 3000, 3000, { square: true });
    const actions = mockManipulate.mock.calls[0][1];
    expect(actions.some((a: any) => 'crop' in a)).toBe(false);
  });

  it('thiếu mô-đun co ảnh + ảnh đã nhẹ → vẫn gửi (rộng hơn khung ngắm còn hơn không tra được)', async () => {
    mockManipulate.mockImplementation(() => { throw new Error('không có mô-đun'); });
    mockSizes[SRC] = 500_000;
    const r = await prepareForLookup(SRC, 4000, 3000, { square: true });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.image.uri).toBe(SRC);
  });
});
