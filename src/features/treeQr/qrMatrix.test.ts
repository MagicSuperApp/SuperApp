import {
  FINDER_SIZE, QUIET_ZONE,
  buildQrMatrix, finderShields, isFinderZone, layoutQr,
} from './qrMatrix';

const URL = 'https://api.orilife.io/t/ORI-w3gvdcs-AB12CD34';

describe('buildQrMatrix', () => {
  it('dựng lưới vuông, cạnh lẻ theo chuẩn QR', () => {
    const m = buildQrMatrix(URL)!;
    expect(m).not.toBeNull();
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.length % 2).toBe(1);
    for (const row of m) expect(row).toHaveLength(m.length);
  });

  it('ba góc ĐỊNH VỊ có ô tối — mốc để máy quét tìm ra mã', () => {
    const m = buildQrMatrix(URL)!;
    const n = m.length;
    expect(m[0][0]).toBe(true);
    expect(m[0][n - 1]).toBe(true);
    expect(m[n - 1][0]).toBe(true);
  });

  it('chuỗi rỗng → null, KHÔNG phải lưới rỗng', () => {
    // Lưới rỗng vẽ ra một ô trắng trông y như mã đang tải; `null` buộc nơi gọi
    // phải nói ra là chưa có mã.
    expect(buildQrMatrix('')).toBeNull();
    expect(buildQrMatrix('   ')).toBeNull();
    expect(buildQrMatrix(null as any)).toBeNull();
  });

  it('chuỗi khác nhau cho lưới khác nhau', () => {
    const a = buildQrMatrix(URL)!;
    const b = buildQrMatrix(`${URL}X`)!;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('dùng mức sửa lỗi CAO — cùng chuỗi phải cần lưới dày hơn mức thấp', () => {
    // Ở mức H, một URL ~45 ký tự không thể nằm gọn trong phiên bản 1 (21×21).
    const m = buildQrMatrix(URL)!;
    expect(m.length).toBeGreaterThan(21);
  });
});

describe('isFinderZone — chỉ BA góc, không phải bốn', () => {
  const N = 25;
  it('nhận ba góc trên-trái, trên-phải, dưới-trái', () => {
    expect(isFinderZone(0, 0, N)).toBe(true);
    expect(isFinderZone(N - 1, 0, N)).toBe(true);
    expect(isFinderZone(0, N - 1, N)).toBe(true);
  });

  it('góc dưới-PHẢI KHÔNG có ô định vị — đó là cách máy biết mã xoay hướng nào', () => {
    expect(isFinderZone(N - 1, N - 1, N)).toBe(false);
  });

  it('ô sát ngay ngoài vùng 7×7 thì không tính', () => {
    expect(isFinderZone(FINDER_SIZE, FINDER_SIZE, N)).toBe(false);
    expect(isFinderZone(FINDER_SIZE - 1, FINDER_SIZE - 1, N)).toBe(true);
  });
});

describe('layoutQr', () => {
  const m = buildQrMatrix(URL)!;

  it('chừa lề trắng 4 ô mỗi phía — dán sát mép nhãn vẫn quét được', () => {
    const l = layoutQr(m, 300)!;
    expect(l.cell).toBeCloseTo(300 / (m.length + QUIET_ZONE * 2), 6);
    // Chấm đầu tiên phải nằm sau lề, không dính mép tấm.
    const first = l.dots[0] ?? l.finders[0];
    expect(first).toBeDefined();
  });

  it('ô định vị ra hình VUÔNG, phần còn lại ra chấm', () => {
    const l = layoutQr(m, 300)!;
    expect(l.finders.length).toBeGreaterThan(0);
    expect(l.dots.length).toBeGreaterThan(0);
    // Mỗi góc 7×7 nhưng chỉ đếm ô TỐI, nên không đúng 3×49.
    for (const f of l.finders) expect(f.size).toBeCloseTo(l.cell, 6);
  });

  it('mọi ô KHÔNG thuộc góc định vị đều có chấm, kể cả ô sáng', () => {
    // Ô sáng vẫn phải vẽ (bằng màu nền) để che ảnh nền — thiếu nó thì ảnh lộ
    // nguyên mảng và độ tương phản của mã đi luôn.
    const l = layoutQr(m, 300)!;
    const n = m.length;
    let expected = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (!isFinderZone(x, y, n)) expected++;
    }
    expect(l.dots).toHaveLength(expected);
    expect(l.dots.some(d => d.dark)).toBe(true);
    expect(l.dots.some(d => !d.dark)).toBe(true);
  });

  it('dotScale 1 → chấm chạm mép ô; nhỏ hơn thì ảnh nền lộ nhiều hơn', () => {
    const full = layoutQr(m, 300, 1)!;
    const small = layoutQr(m, 300, 0.8)!;
    expect(full.dots[0].r).toBeCloseTo(full.cell / 2, 6);
    expect(small.dots[0].r).toBeLessThan(full.dots[0].r);
  });

  it('KHÔNG cho chấm nhỏ dưới nửa ô — dưới đó là phá mã, không phải làm đẹp', () => {
    const tiny = layoutQr(m, 300, 0.1)!;
    expect(tiny.dots[0].r).toBeCloseTo(full(m).cell / 2 * 0.5, 6);
  });

  it('thiếu lưới / cạnh vô nghĩa → null', () => {
    expect(layoutQr(null, 300)).toBeNull();
    expect(layoutQr([], 300)).toBeNull();
    expect(layoutQr(m, 0)).toBeNull();
    expect(layoutQr(m, NaN)).toBeNull();
  });
});

function full(m: boolean[][]) { return layoutQr(m, 300, 1)!; }

describe('finderShields — nền TRƠN dưới ba góc', () => {
  const l = layoutQr(buildQrMatrix(URL)!, 300)!;

  it('đúng ba tấm, mỗi tấm bao 7 ô cộng một ô lề mỗi phía', () => {
    const sh = finderShields(l);
    expect(sh).toHaveLength(3);
    for (const s of sh) expect(s.size).toBeCloseTo((FINDER_SIZE + 2) * l.cell, 6);
  });

  it('không có lưới → mảng rỗng, không nổ', () => {
    expect(finderShields(null)).toEqual([]);
  });
});
