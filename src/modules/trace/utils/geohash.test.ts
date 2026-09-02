// modules/trace/utils/geohash.test.ts
//
// Tệp này từng tên `implicitParent.test.ts`. Hai nhóm bài cũ —
// `buildSquareBoundary` và `formatImplicitFarmName` — gỡ cùng lượt với hai hàm
// duy nhất đọc chúng (lý do đầy đủ ở đầu `geohash.ts`).
//
// Gỡ bài kiểm của mã đã gỡ, chứ không giữ lại cho đẹp con số: một bài xanh cho
// một hàm không đường nào tới thì nó không canh gì, nó chỉ làm bộ đếm to lên và
// làm người đọc tin là chỗ đó có người trông.
//
// Đầu tệp cũ còn một câu phải nói rõ là SAI, vì nó là cái cớ để hai luồng nặng
// nhất tệp không có bài nào: "The find-or-create flows […] are integration-tested
// separately on device — not unit-tested here." Không nơi nào trong `src/` gọi
// tới hai luồng đó, nên chúng cũng chưa từng chạy trên máy nào để mà thử.

import { computeGeohash, computeGeohash7 } from './geohash';

describe('computeGeohash', () => {
  test('precision 7 returns exactly 7 lowercase alphanumeric chars', () => {
    const gh = computeGeohash(12.6, 108.0, 7);
    expect(gh).toHaveLength(7);
    expect(gh).toMatch(/^[a-z0-9]+$/);
  });

  test('precision 5 returns 5 chars', () => {
    expect(computeGeohash(12.6, 108.0, 5)).toHaveLength(5);
  });

  test('Đắk Lắk anchor (12.6, 108.0) → w6m4ek (precision 6)', () => {
    // Reference: known geohash for (12.6, 108.0) is "w6m4ek..."
    expect(computeGeohash(12.6, 108.0, 6).startsWith('w6')).toBe(true);
  });

  test('Hanoi anchor (21.0, 105.85) → w7er... (geohash for Hanoi area)', () => {
    // Hanoi is in geohash region "w7" — northern Vietnam
    expect(computeGeohash(21.0, 105.85, 2)).toBe('w7');
  });

  test('equator + greenwich (0, 0) → s00000... (known anchor)', () => {
    expect(computeGeohash(0, 0, 6)).toBe('s00000');
  });

  test('nearby points share long geohash prefix', () => {
    const a = computeGeohash(12.6, 108.0, 7);
    const b = computeGeohash(12.6001, 108.0001, 7);
    // Should share at least 5 chars (~5km cell)
    let shared = 0;
    for (let i = 0; i < 7; i++) if (a[i] === b[i]) shared++; else break;
    expect(shared).toBeGreaterThanOrEqual(5);
  });

  test('throws on invalid lat', () => {
    expect(() => computeGeohash(91, 0, 7)).toThrow();
    expect(() => computeGeohash(-91, 0, 7)).toThrow();
  });

  test('throws on invalid lng', () => {
    expect(() => computeGeohash(0, 181, 7)).toThrow();
    expect(() => computeGeohash(0, -181, 7)).toThrow();
  });

  test('throws on invalid precision', () => {
    expect(() => computeGeohash(0, 0, 0)).toThrow();
    expect(() => computeGeohash(0, 0, 13)).toThrow();
  });
});

describe('computeGeohash7', () => {
  test('alias of computeGeohash with precision 7', () => {
    expect(computeGeohash7(12.6, 108.0)).toBe(computeGeohash(12.6, 108.0, 7));
  });

  test('matches backend pattern ^[a-z0-9]+$', () => {
    expect(computeGeohash7(12.6, 108.0)).toMatch(/^[a-z0-9]+$/);
  });

  test('always exactly 7 chars (regardless of coordinates)', () => {
    expect(computeGeohash7(0, 0)).toHaveLength(7);
    expect(computeGeohash7(89.9, 179.9)).toHaveLength(7);
    expect(computeGeohash7(-89.9, -179.9)).toHaveLength(7);
  });
});
