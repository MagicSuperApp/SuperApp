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
  chuanHoa, hopLe, nghieng, noiDiem, phang, viTriCay, vongRanh,
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

describe('vị trí cây — hai kiểu dữ liệu, cùng một kết quả', () => {
  it('đọc được `gps` dạng chuỗi', () => {
    expect(viTriCay({ gps: '12.5, 108.25' })).toEqual({ lat: 12.5, lng: 108.25 });
  });

  it('đọc được cặp `lat`/`lon` rời', () => {
    expect(viTriCay({ lat: 12.5, lon: 108.25 })).toEqual({ lat: 12.5, lng: 108.25 });
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
