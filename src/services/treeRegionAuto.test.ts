import {
  pickBox,
  mapBoxToImage,
  autoTreeRegions,
  AMBIGUOUS_AREA_RATIO,
  BOX_PAD,
  type YoloBox,
} from './treeRegionAuto';
import { buildTreeRegions } from './treeReIDService';

const box = (x: number, y: number, w: number, h: number, conf = 0.9): YoloBox =>
  ({ x, y, w, h, conf });

describe('pickBox — nông dân không phải quyết ở ca thường', () => {
  it('khung không có box thì trả null, KHÔNG hỏi', () => {
    expect(pickBox([])).toEqual({ box: null, ambiguous: false });
    expect(pickBox(undefined)).toEqual({ box: null, ambiguous: false });
  });

  it('một cây rõ ràng to hơn ⟹ chọn luôn, không hỏi', () => {
    const big = box(0.3, 0.2, 0.4, 0.6);
    const small = box(0.02, 0.5, 0.1, 0.15);
    const r = pickBox([small, big]);
    expect(r.box).toBe(big);
    expect(r.ambiguous).toBe(false);
  });

  it('hai cây ngang nhau ⟹ bật cờ hỏi (đúng MỘT lần, ở màn quét)', () => {
    const a = box(0.05, 0.2, 0.4, 0.6);
    const b = box(0.55, 0.2, 0.4, 0.6);
    const r = pickBox([a, b]);
    expect(r.ambiguous).toBe(true);
    expect(r.box).toBeTruthy();
  });

  it('ngưỡng ngang-nhau đúng như khai báo', () => {
    const a = box(0, 0, 0.5, 0.5);               // 0.25
    const justUnder = box(0.5, 0, 0.5, 0.5 * (AMBIGUOUS_AREA_RATIO - 0.05));
    expect(pickBox([a, justUnder]).ambiguous).toBe(false);
  });

  it('box nhiễu dưới 1% khung bị loại — không thành "cây thứ hai"', () => {
    const real = box(0.2, 0.2, 0.5, 0.6);
    const noise = box(0.9, 0.9, 0.05, 0.05); // 0.0025
    const r = pickBox([real, noise]);
    expect(r.box).toBe(real);
    expect(r.ambiguous).toBe(false);
  });

  it('có box khung trước ⟹ bám tâm gần nhất và KHÔNG hỏi lại', () => {
    const prev = box(0.6, 0.2, 0.3, 0.6);
    const near = box(0.58, 0.22, 0.3, 0.6);
    const far = box(0.02, 0.2, 0.32, 0.62);
    const r = pickBox([far, near], prev);
    expect(r.box).toBe(near);
    expect(r.ambiguous).toBe(false);
  });

  it('bỏ box số rác (NaN / bề rộng 0)', () => {
    const ok = box(0.2, 0.2, 0.4, 0.5);
    const bad = [
      { x: NaN, y: 0, w: 0.4, h: 0.5, conf: 0.9 },
      { x: 0, y: 0, w: 0, h: 0.5, conf: 0.9 },
    ];
    expect(pickBox([...bad, ok]).box).toBe(ok);
  });
});

describe('mapBoxToImage — quy hệ preview về hệ ảnh', () => {
  it('cùng tỉ lệ: chỉ nhân kích thước, cộng phần nới', () => {
    const b = box(0.25, 0.25, 0.5, 0.5);
    const r = mapBoxToImage(b, 3 / 4, 300, 400)!;
    const padW = 0.5 * BOX_PAD;
    expect(r[0]).toBeCloseTo((0.25 - padW) * 300, 4);
    expect(r[2]).toBeCloseTo((0.5 + padW * 2) * 300, 4);
  });

  it('thiếu frameAspect ⟹ coi như trùng tỉ lệ, KHÔNG bịa phép cắt', () => {
    const b = box(0.25, 0.25, 0.5, 0.5);
    expect(mapBoxToImage(b, undefined, 300, 400)).toEqual(mapBoxToImage(b, 3 / 4, 300, 400));
    expect(mapBoxToImage(b, 0, 300, 400)).toEqual(mapBoxToImage(b, 3 / 4, 300, 400));
  });

  it('preview RỘNG hơn ảnh ⟹ giãn trục x, box giữa vẫn ở giữa', () => {
    // preview 1:1, ảnh 3:4 ⟹ ảnh chỉ giữ 0.75 bề ngang giữa của preview.
    const centred = box(0.45, 0.4, 0.1, 0.2);
    const r = mapBoxToImage(centred, 1, 300, 400)!;
    const cx = (r[0] + r[2] / 2) / 300;
    expect(cx).toBeCloseTo(0.5, 6);
    // bề ngang chuẩn-hoá nở ra đúng 1/0.75
    expect(r[2] / 300).toBeCloseTo(0.1 / 0.75 * (1 + BOX_PAD * 2), 6);
  });

  it('preview CAO hơn ảnh ⟹ giãn trục y', () => {
    const centred = box(0.4, 0.45, 0.2, 0.1);
    const r = mapBoxToImage(centred, 3 / 4, 400, 300)!;
    const cy = (r[1] + r[3] / 2) / 300;
    expect(cy).toBeCloseTo(0.5, 6);
  });

  it('box nằm hẳn trong phần bị cắt ⟹ null, không gửi vùng rỗng', () => {
    // preview 1:1, ảnh 3:4 giữ x∈[0.125,0.875]; box sát mép trái nằm ngoài.
    expect(mapBoxToImage(box(0.0, 0.4, 0.02, 0.5), 1, 300, 400)).toBeNull();
  });

  it('kẹp vào mép ảnh, không tràn ra ngoài', () => {
    const r = mapBoxToImage(box(0, 0, 1, 1), 3 / 4, 300, 400)!;
    expect(r).toEqual([0, 0, 300, 400]);
  });

  it('ảnh không có kích thước ⟹ null', () => {
    expect(mapBoxToImage(box(0.2, 0.2, 0.4, 0.4), 1, 0, 400)).toBeNull();
  });
});

describe('autoTreeRegions — song song files[], 0 quyết định', () => {
  const cap = (boxes: YoloBox[] | null) => ({
    width: 300, height: 400, frameAspect: 3 / 4, boxes,
  });

  it('mọi ảnh có cây ⟹ mỗi ảnh một vùng rect, đúng số lượng', () => {
    const { regions, ambiguousAt } = autoTreeRegions([
      cap([box(0.2, 0.2, 0.5, 0.6)]),
      cap([box(0.22, 0.2, 0.5, 0.6)]),
    ]);
    expect(regions).toHaveLength(2);
    expect(regions.every(r => r?.shape === 'rect')).toBe(true);
    expect(ambiguousAt).toEqual([]);
  });

  it('ảnh không thấy cây ⟹ null ĐÚNG VỊ TRÍ, không dồn mảng', () => {
    const { regions } = autoTreeRegions([
      cap([box(0.2, 0.2, 0.5, 0.6)]),
      cap([]),
      cap([box(0.21, 0.2, 0.5, 0.6)]),
    ]);
    expect(regions).toHaveLength(3);
    expect(regions[1]).toBeNull();
    expect(regions[0]).not.toBeNull();
    expect(regions[2]).not.toBeNull();
  });

  it('không ảnh nào thấy cây ⟹ buildTreeRegions trả null: hành vi y như cũ', () => {
    const { regions } = autoTreeRegions([cap([]), cap(null)]);
    expect(buildTreeRegions(regions)).toBeNull();
  });

  it('chỉ hỏi ở ảnh ĐẦU có hai cây ngang nhau — các ảnh sau bám dấu, không hỏi lại', () => {
    const two = [box(0.05, 0.2, 0.4, 0.6), box(0.55, 0.2, 0.4, 0.6)];
    const { ambiguousAt } = autoTreeRegions([cap(two), cap(two), cap(two)]);
    expect(ambiguousAt).toEqual([0]);
  });

  it('không có capture ⟹ mảng rỗng, không nổ', () => {
    expect(autoTreeRegions(undefined)).toEqual({ regions: [], ambiguousAt: [] });
    expect(autoTreeRegions([])).toEqual({ regions: [], ambiguousAt: [] });
  });

  it('ảnh lệch kích thước vẫn ra vùng đúng chỗ sau khi buildTreeRegions quy hệ', () => {
    const a = { width: 300, height: 400, frameAspect: 3 / 4, boxes: [box(0.25, 0.25, 0.5, 0.5)] };
    const b = { width: 600, height: 800, frameAspect: 3 / 4, boxes: [box(0.25, 0.25, 0.5, 0.5)] };
    const { regions } = autoTreeRegions([a, b]);
    const built = buildTreeRegions(regions)!;
    const items = JSON.parse(built.regions);
    expect(built.img_w).toBe('300');
    // ảnh 600px được quy về hệ 300px ⟹ hai vùng trùng nhau
    expect(items[1].bbox[0]).toBeCloseTo(items[0].bbox[0], 6);
    expect(items[1].bbox[2]).toBeCloseTo(items[0].bbox[2], 6);
  });
});
