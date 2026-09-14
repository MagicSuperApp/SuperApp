/**
 * Phép chiếu hình bóng mảnh vườn — ba chỗ trượt, mỗi chỗ một ca.
 *
 * Cả ba đều hỏng theo kiểu KHÔNG lộ ra trên máy người sửa:
 *
 *   · Kéo giãn hai trục cho vừa hộp ⇒ mọi vườn ra hình vuông. Chỉ lộ khi đặt
 *     hai vườn khác dạng cạnh nhau, mà lúc dựng thì thường chỉ mở một vườn.
 *   · Quên lật trục y ⇒ vườn hiện ngược bắc-nam. Vườn gần vuông thì nhìn không
 *     ra, và không ai đi đối chiếu hình bóng với bản đồ thật.
 *   · Vườn suy biến ⇒ chia cho 0 ⇒ `NaN`. `NaN` trong `points` của SVG là một
 *     hình không vẽ gì mà cũng không báo gì — ô trống, không lỗi, không log.
 */

import {
  chuanHoa, hopLe, nghieng, noiDiem, phang, droppedPointCount, viTriCay, vongRanh, xoayNhe,
} from './farmShapeGeo';

describe('lọc điểm — thiếu thì loại, không đoán', () => {
  it('nhận cả `lng` lẫn `lon`', () => {
    expect(hopLe({ lat: 12, lng: 108 })).toBe(true);
    expect(hopLe({ lat: 12, lon: 108 })).toBe(true);
  });

  it('loại điểm thiếu, rỗng, hoặc không phải số', () => {
    for (const rac of [null, undefined, {}, { lat: 12 }, { lat: 'x', lng: 108 }, { lat: NaN, lng: 1 }]) {
      expect(hopLe(rac)).toBe(false);
    }
  });

  /**
   * ⛔ `Number.isFinite` một mình KHÔNG phải một phép kiểm toạ độ.
   *
   * `0` hữu hạn, `999` hữu hạn, `-5000` hữu hạn. Điểm `0/0` là giá trị máy sinh
   * ra khi chưa bắt được GPS; nó nằm ngoài khơi Vịnh Guinea, nên khung nhìn
   * phải giãn ra để chứa cả nó lẫn cụm cây thật, và cụm cây thật co lại thành
   * một chấm. Hình thửa lúc đó vẫn vẽ, vẫn không báo gì.
   *
   * Mỗi ca dưới đây phân biệt được HAI cực: cực bị loại và cực sát biên vẫn
   * phải được nhận. Thiếu vế thứ hai thì một phép kiểm siết quá tay cũng xanh.
   */
  it('loại `0/0` — "chưa có định vị", không phải một chỗ trên mặt đất', () => {
    expect(hopLe({ lat: 0, lng: 0 })).toBe(false);
    expect(hopLe({ lat: 0, lon: 0 })).toBe(false);
    // Nhưng `0` ở MỘT trục vẫn là toạ độ thật (xích đạo, hoặc kinh tuyến gốc).
    expect(hopLe({ lat: 0, lng: 105 })).toBe(true);
    expect(hopLe({ lat: 10, lng: 0 })).toBe(true);
  });

  it('loại toạ độ NGOÀI DẢI, và KHÔNG cắt nhầm biên', () => {
    for (const ngoai of [
      { lat: 91, lng: 105 }, { lat: -91, lng: 105 },
      { lat: 10, lng: 181 }, { lat: 10, lng: -5000 },
      { lat: 999, lng: 105 },
    ]) {
      expect(hopLe(ngoai)).toBe(false);
    }
    // Biên là giá trị HỢP LỆ — cực đối xứng của bốn ca trên.
    expect(hopLe({ lat: 90, lng: 180 })).toBe(true);
    expect(hopLe({ lat: -90, lng: -180 })).toBe(true);
  });

  it('trường VẮNG không được hoá thành `0`', () => {
    // `Number(null)` và `Number('')` đều ra `0`. Bản trước dùng `Number()` trần,
    // nên một bản ghi thiếu kinh độ trở thành một điểm ở Vịnh Guinea.
    expect(hopLe({ lat: 10.5, lng: null })).toBe(false);
    expect(hopLe({ lat: 10.5, lng: '' })).toBe(false);
    expect(hopLe({ lat: null, lng: null })).toBe(false);
    // Chuỗi số thì vẫn đọc được — đường `gps: "vĩ, kinh"` đi qua đây.
    expect(hopLe({ lat: '10.5', lng: '105.2' })).toBe(true);
  });

  it('`viTriCay` theo CÙNG luật, không lỏng hơn `hopLe`', () => {
    // Hai hàm này lọc cùng một đàn cây ở hai màn khác nhau. Lệch nhau là cùng
    // một cái cây được màn này nhận và màn kia loại.
    expect(viTriCay({ latitude: 0, longitude: 0 })).toBeNull();
    expect(viTriCay({ location: { lat: 0, lng: 0 } })).toBeNull();
    expect(viTriCay({ gps: '0, 0' })).toBeNull();
    expect(viTriCay({ lat: 999, lon: 105 })).toBeNull();
    // Cực đối xứng: cây thật vẫn đọc được qua cả bốn hình dạng.
    expect(viTriCay({ latitude: 12.5, longitude: 108.25 })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('điểm bị loại ĐẾM được — không biến mất im lặng', () => {
    const tho = [
      { lat: 12, lng: 108 },
      { lat: 0, lng: 0 },
      { lat: 12.1, lng: 108.1 },
      { lat: 999, lng: 108 },
    ];
    expect(vongRanh(tho)).toHaveLength(2);
    expect(droppedPointCount(tho)).toBe(2);
    // Vòng sạch thì con số phải là 0 — nếu không nó chỉ đang đếm bừa.
    expect(droppedPointCount([{ lat: 12, lng: 108 }, { lat: 12.1, lng: 108.1 }])).toBe(0);
  });

  it('`vongRanh` bỏ điểm rác giữa vòng thay vì kéo cả vòng thành NaN', () => {
    const ring = vongRanh([
      { lat: 12, lng: 108 },
      { lat: 'hỏng', lng: 108 },
      { lat: 12.1, lng: 108.1 },
    ]);
    expect(ring).toEqual([
      { lat: 12, lng: 108 },
      { lat: 12.1, lng: 108.1 },
    ]);
  });
});

describe('vị trí cây — BỐN kiểu dữ liệu, cùng một kết quả', () => {
  /*
   * ⛔ Bốn, không phải hai. Bản đầu của hàm chỉ đọc `gps`/`lat`/`lon` — ba khoá
   *    của bản ghi TỪ MÁY CHỦ — nên nó trả `null` cho mọi cây dựng theo
   *    `interface Tree` của module (`latitude`/`longitude`, hoặc `location`).
   *    Hai ô xem trước vẽ mảnh đất không một chấm nào, báo về hai lượt liền.
   *
   *    Bài kiểm cũ KHÔNG bắt được, và lý do đáng nhớ hơn cả lỗi: nó dựng dữ liệu
   *    giả theo đúng giả định sai của hàm. Bài kiểm và hàm cùng sinh ra từ một
   *    chỗ đọc thiếu, nên chúng đồng ý với nhau và cùng sai. Hai ca đầu dưới đây
   *    lấy hình dạng thẳng từ `modules/trace/types` — không từ đầu tôi.
   */
  it('đọc được `latitude`/`longitude` — kiểu `Tree` của module', () => {
    expect(viTriCay({ latitude: 12.5, longitude: 108.25 })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('đọc được `location: { lat, lng }` — dạng cặp', () => {
    expect(viTriCay({ location: { lat: 12.5, lng: 108.25 } })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('đọc được `gps` dạng chuỗi', () => {
    expect(viTriCay({ gps: '12.5, 108.25' })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('đọc được cặp `lat`/`lon` rời', () => {
    expect(viTriCay({ lat: 12.5, lon: 108.25 })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('một bản ghi Tree ĐỦ TRƯỜNG vẫn ra đúng toạ độ', () => {
    // Ca gần nhất với dữ liệu thật: bản ghi có cả đống trường khác, toạ độ chỉ
    // là hai trong số đó. Nếu hàm đọc nhầm khoá thì ca này đỏ chứ không phải
    // một ca dựng riêng hai trường.
    const cay = {
      id: 't1', farmId: 'f1', code: 'C1', images: [],
      estimatedFruits: 0, fruitCount: 0,
      latitude: 12.6789, longitude: 108.1234,
      species: 'sầu riêng', display_index: 3,
    };
    expect(viTriCay(cay)).toEqual({ lat: 12.6789, lng: 108.1234 });
  });

  it('không có toạ độ → `null`, không phải toạ độ 0,0', () => {
    // 0,0 là một điểm CÓ THẬT ngoài khơi vịnh Guinea. Trả 0,0 cho "không biết"
    // là vẽ một cái cây ở giữa Đại Tây Dương và không ai bảo là sai.
    expect(viTriCay({})).toBeNull();
    expect(viTriCay({ gps: 'hỏng' })).toBeNull();
  });
});

describe('chuẩn hoá GIỮ TỈ LỆ — vườn dài phải ra hình dài', () => {
  it('mảnh dài gấp đôi vẫn ra hình dài gấp đôi', () => {
    // Trải 0,02 độ theo kinh, 0,01 theo vĩ ⇒ rộng gấp đôi cao.
    const ring = [
      { lat: 10.00, lng: 100.00 },
      { lat: 10.00, lng: 100.02 },
      { lat: 10.01, lng: 100.02 },
      { lat: 10.01, lng: 100.00 },
    ];
    const ve = chuanHoa(ring);
    const ds = ring.map(ve);
    const rong = Math.max(...ds.map((d) => d.x)) - Math.min(...ds.map((d) => d.x));
    const cao = Math.max(...ds.map((d) => d.y)) - Math.min(...ds.map((d) => d.y));
    expect(rong / cao).toBeCloseTo(2, 5);
  });

  it('cạnh dài nhất lấp đầy hộp, cạnh ngắn được canh giữa', () => {
    const ring = [
      { lat: 10.00, lng: 100.00 },
      { lat: 10.00, lng: 100.02 },
      { lat: 10.01, lng: 100.02 },
      { lat: 10.01, lng: 100.00 },
    ];
    const ds = ring.map(chuanHoa(ring));
    expect(Math.min(...ds.map((d) => d.x))).toBeCloseTo(0, 6);
    expect(Math.max(...ds.map((d) => d.x))).toBeCloseTo(1, 6);
    // Cạnh ngắn: thừa 0,5 chia đôi hai bên ⇒ 0,25 … 0,75.
    expect(Math.min(...ds.map((d) => d.y))).toBeCloseTo(0.25, 6);
    expect(Math.max(...ds.map((d) => d.y))).toBeCloseTo(0.75, 6);
  });
});

describe('trục y phải LẬT — bắc ở trên', () => {
  it('điểm ở BẮC cho `y` NHỎ hơn điểm ở nam', () => {
    const ring = [
      { lat: 10.0, lng: 100.0 },
      { lat: 10.1, lng: 100.1 },
      { lat: 10.0, lng: 100.1 },
    ];
    const ve = chuanHoa(ring);
    const bac = ve({ lat: 10.1, lng: 100.05 });
    const nam = ve({ lat: 10.0, lng: 100.05 });
    expect(bac.y).toBeLessThan(nam.y);
  });
});

describe('vườn suy biến KHÔNG được ra NaN', () => {
  it('mọi điểm trùng nhau → vẫn là số, và nằm giữa hộp', () => {
    const ring = [
      { lat: 10, lng: 100 },
      { lat: 10, lng: 100 },
      { lat: 10, lng: 100 },
    ];
    const d = chuanHoa(ring)({ lat: 10, lng: 100 });
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
    expect(d.x).toBeCloseTo(0.5, 6);
    expect(d.y).toBeCloseTo(0.5, 6);
  });

  it('mọi điểm trên một đường thẳng đứng → vẫn là số', () => {
    const ring = [
      { lat: 10.0, lng: 100 },
      { lat: 10.1, lng: 100 },
      { lat: 10.2, lng: 100 },
    ];
    for (const d of ring.map(chuanHoa(ring))) {
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
    }
  });

  it('`noiDiem` của một vườn suy biến KHÔNG chứa NaN', () => {
    // Đây là chỗ `NaN` thật sự gây hại: SVG nhận `points="NaN,NaN"` rồi vẽ ra
    // một ô trống, im lặng. Ca này canh đúng chuỗi đi vào SVG.
    const ring = [
      { lat: 10, lng: 100 },
      { lat: 10, lng: 100 },
      { lat: 10, lng: 100 },
    ];
    const s = noiDiem(ring.map(chuanHoa(ring)).map(phang));
    expect(s).not.toContain('NaN');
  });
});

describe('hai khung vẽ nằm gọn trong viewBox 100×100', () => {
  const goc = [
    { lat: 10.0, lng: 100.0 },
    { lat: 10.0, lng: 100.1 },
    { lat: 10.1, lng: 100.1 },
    { lat: 10.1, lng: 100.0 },
  ];

  it('`phang` chừa lề đều 8 ở cả bốn phía', () => {
    const ds = goc.map(chuanHoa(goc)).map(phang);
    for (const d of ds) {
      expect(d.x).toBeGreaterThanOrEqual(8);
      expect(d.x).toBeLessThanOrEqual(92);
      expect(d.y).toBeGreaterThanOrEqual(8);
      expect(d.y).toBeLessThanOrEqual(92);
    }
  });

  it('`nghieng` cho hình thoi, và chừa chỗ dưới cho phần thành dựng', () => {
    const ds = goc.map(chuanHoa(goc)).map(nghieng);
    for (const d of ds) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(100);
      expect(d.y).toBeGreaterThanOrEqual(0);
      // Thành dựng xuống thêm 13; mặt trên phải kết thúc trước 100-13 để phần
      // thành không bị cắt mất ở mép dưới khung.
      expect(d.y).toBeLessThanOrEqual(87);
    }
    // Hình THOI: bốn góc ô vuông chiếu ra bốn đỉnh lệch nhau, không còn thẳng cột.
    const xs = new Set(ds.map((d) => Math.round(d.x)));
    expect(xs.size).toBeGreaterThan(2);
  });
});

describe('xoay nhẹ — quanh TÂM, không quanh gốc', () => {
  it('tâm hộp đứng yên', () => {
    // Xoay quanh gốc (0,0) thì tâm dời đi, và cả hình lệch ra một góc. Ca này
    // là cách rẻ nhất để phân biệt hai phép xoay.
    const d = xoayNhe(37)({ x: 0.5, y: 0.5 });
    expect(d.x).toBeCloseTo(0.5, 9);
    expect(d.y).toBeCloseTo(0.5, 9);
  });

  it('giữ nguyên khoảng cách tới tâm', () => {
    const truoc = { x: 0.9, y: 0.5 };
    const sau = xoayNhe(23)(truoc);
    const r = (p: { x: number; y: number }) => Math.hypot(p.x - 0.5, p.y - 0.5);
    expect(r(sau)).toBeCloseTo(r(truoc), 9);
  });

  it('xoay 0° là phép đồng nhất', () => {
    const d = xoayNhe(0)({ x: 0.2, y: 0.8 });
    expect(d.x).toBeCloseTo(0.2, 9);
    expect(d.y).toBeCloseTo(0.8, 9);
  });

  it('xoay 360° quay về đúng chỗ cũ', () => {
    const d = xoayNhe(360)({ x: 0.2, y: 0.8 });
    expect(d.x).toBeCloseTo(0.2, 9);
    expect(d.y).toBeCloseTo(0.8, 9);
  });

  it('KHÔNG sinh NaN với góc âm', () => {
    const d = xoayNhe(-14)({ x: 0.1, y: 0.1 });
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
  });
});
