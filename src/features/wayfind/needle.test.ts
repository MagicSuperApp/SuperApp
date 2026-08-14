import {
  needleAngle, shortestTurn, smoothHeading, smoothPosition,
} from './needle';

describe('shortestTurn — kim luôn đi vòng ngắn', () => {
  it('350° → 10° đi tới bằng cách CỘNG 20, không trừ 340', () => {
    expect(shortestTurn(350, 10)).toBe(370);
  });

  it('0° → 350° đi lùi 10, không tiến 350', () => {
    expect(shortestTurn(0, 350)).toBe(-10);
  });

  it('giữ được góc cộng dồn đã vượt nhiều vòng', () => {
    expect(shortestTurn(730, 0)).toBe(720);
  });

  it('quay đúng nửa vòng thì vẫn ra một góc cách 180 — không kẹt', () => {
    expect(Math.abs(shortestTurn(0, 180))).toBe(180);
  });

  it('số hỏng thì giữ nguyên góc đang có, không nhảy về 0', () => {
    expect(shortestTurn(123, Number.NaN)).toBe(123);
    expect(shortestTurn(Number.NaN, 45)).toBeNaN();
  });

  it('lặp nhiều lần quanh mốc 0 KHÔNG trôi tích luỹ', () => {
    let a = 0;
    for (let i = 0; i < 50; i += 1) {
      a = shortestTurn(a, 350);
      a = shortestTurn(a, 10);
    }
    // Mỗi cặp về đúng chỗ cũ → sau 50 vòng vẫn quanh 10°, không cộng dồn thành 1800.
    expect(Math.abs(a - 10)).toBeLessThanOrEqual(1);
  });
});

describe('smoothHeading — lọc rung la bàn', () => {
  it('lần đọc đầu nhận thẳng, không quét từ 0 lên', () => {
    expect(smoothHeading(null, 275)).toBe(275);
  });

  it('trung bình đi qua mốc 0 đúng chiều (350 và 10 → quanh 0, không phải 180)', () => {
    const out = smoothHeading(350, 10, 0.5);
    // 350 + 0,5 × (+20) = 360 → chuẩn hoá về 0
    expect(out).toBeCloseTo(0, 5);
  });

  it('alpha nhỏ thì bám chậm, alpha lớn thì bám nhanh', () => {
    const slow = smoothHeading(0, 100, 0.1);
    const fast = smoothHeading(0, 100, 0.9);
    expect(slow).toBeCloseTo(10, 5);
    expect(fast).toBeCloseTo(90, 5);
  });

  it('rung ±5° quanh một hướng thì đầu ra bám sát hướng đó', () => {
    let h: number | null = null;
    for (const raw of [90, 95, 85, 93, 87, 91, 89]) h = smoothHeading(h, raw);
    expect(Math.abs((h as number) - 90)).toBeLessThan(4);
  });

  it('số hỏng thì giữ giá trị cũ', () => {
    expect(smoothHeading(42, Number.NaN)).toBe(42);
  });
});

describe('needleAngle — hướng đi trừ hướng máy', () => {
  it('máy chĩa Bắc, đích ở Đông → mũi tên chỉ sang phải', () => {
    expect(needleAngle(90, 0)).toBe(90);
  });

  it('người xoay đúng về phía đích → mũi tên chỉ thẳng lên', () => {
    expect(needleAngle(90, 90)).toBe(0);
  });

  it('vượt mốc 0 vẫn ra góc trong 0…360', () => {
    expect(needleAngle(10, 40)).toBe(330);
  });

  it('chưa có la bàn → chỉ theo góc phương-vị tuyệt đối', () => {
    expect(needleAngle(215, null)).toBe(215);
  });
});

describe('smoothPosition — lọc nhiễu chỗ đứng, KHÔNG đóng băng nó', () => {
  const A = { lat: 10.5, lon: 106.5 };

  it('lần đọc đầu nhận thẳng', () => {
    expect(smoothPosition(null, A)).toEqual(A);
  });

  it('nhích nhẹ thì chỉ đi một phần quãng — kim thôi rung mà vẫn bám', () => {
    const out = smoothPosition(A, { lat: 10.5001, lon: 106.5 }, { alpha: 0.3, distanceM: 11 });
    expect(out.lat).toBeGreaterThan(A.lat);
    expect(out.lat).toBeLessThan(10.5001);
  });

  it('nhảy xa thì nhận THẲNG, không bò từ từ', () => {
    const far = { lat: 10.51, lon: 106.51 };
    expect(smoothPosition(A, far, { distanceM: 900 })).toEqual(far);
  });

  it('đứng yên rung quanh một điểm thì hội tụ về chính điểm đó', () => {
    let p: { lat: number; lon: number } | null = null;
    const jitter = [0.00002, -0.00003, 0.00001, -0.00002, 0.00003, -0.00001];
    for (const d of jitter) {
      p = smoothPosition(p, { lat: 10.5 + d, lon: 106.5 + d }, { distanceM: 3 });
    }
    expect(Math.abs((p as any).lat - 10.5)).toBeLessThan(0.00005);
  });

  it('đi thẳng một hướng thì bám theo, không đứng lại chỗ cũ', () => {
    let p: { lat: number; lon: number } | null = { lat: 10.5, lon: 106.5 };
    for (let i = 1; i <= 12; i += 1) {
      p = smoothPosition(p, { lat: 10.5 + i * 0.0001, lon: 106.5 }, { distanceM: 11 });
    }
    // Sau 12 bước phải đã đi được phần lớn quãng, không kẹt ở điểm xuất phát.
    expect(p.lat).toBeGreaterThan(10.5 + 0.0009);
  });

  it('toạ độ hỏng thì giữ giá trị cũ', () => {
    expect(smoothPosition(A, { lat: Number.NaN, lon: 106.5 })).toEqual(A);
  });
});
