import { latestPair, monthLabel, toMonthly, type FaoRow } from './faostatService';

/** Hình dạng thật FAOSTAT trả về — chép từ một lần gọi thật. */
const rows: FaoRow[] = [
  { Year: 2024, Months: 'Annual value', Value: 17753706.5 },
  { Year: 2024, Months: 'January', Value: 16020523.3 },
  { Year: 2024, Months: 'February', Value: 16197311.5 },
  { Year: 2024, Months: 'December', Value: 20723781.6 },
];

describe('toMonthly — bỏ dòng "Annual value"', () => {
  it('KHÔNG nhận trung bình năm thành một tháng', () => {
    // Nhận nhầm là so "tháng 12" với "trung bình cả năm" rồi gọi đó là biến động tháng.
    const out = toMonthly(rows);
    expect(out).toHaveLength(3);
    expect(out.some(p => p.value === 17753706.5)).toBe(false);
  });

  it('xếp theo thứ tự thời gian, không theo thứ tự máy chủ trả về', () => {
    const out = toMonthly([
      { Year: 2024, Months: 'December', Value: 3 },
      { Year: 2023, Months: 'May', Value: 1 },
      { Year: 2024, Months: 'January', Value: 2 },
    ]);
    expect(out.map(p => p.value)).toEqual([1, 2, 3]);
  });

  it('bỏ dòng giá trị hỏng hoặc âm', () => {
    const out = toMonthly([
      { Year: 2024, Months: 'January', Value: 'x' },
      { Year: 2024, Months: 'March', Value: -5 },
      { Year: 2024, Months: 'April', Value: 10 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('mảng rỗng / rác → mảng rỗng, không nổ', () => {
    expect(toMonthly([])).toEqual([]);
    expect(toMonthly(undefined as any)).toEqual([]);
  });
});

describe('latestPair — tháng mới nhất và tháng liền trước', () => {
  it('lấy đúng hai tháng cuối', () => {
    const { latest, prev } = latestPair(toMonthly(rows));
    expect(latest!.monthIndex).toBe(11);
    expect(prev!.monthIndex).toBe(1);
  });

  it('chỉ có MỘT tháng → không có gì để so', () => {
    const { latest, prev } = latestPair(toMonthly([{ Year: 2024, Months: 'May', Value: 9 }]));
    expect(latest).not.toBeNull();
    expect(prev).toBeNull();
  });

  it('rỗng → cả hai null', () => {
    expect(latestPair([])).toEqual({ latest: null, prev: null });
  });
});

describe('monthLabel', () => {
  it('tháng đánh số từ 1 cho người đọc, không phải từ 0', () => {
    expect(monthLabel({ monthIndex: 11, year: 2024, value: 1 })).toEqual({ y: 2024, m: 12 });
  });
});
