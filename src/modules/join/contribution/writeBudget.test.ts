// modules/join/contribution/writeBudget.test.ts
//
// Kiểm chứng phanh tốc độ lấp — `Join/Join-Integration.md` §6.1a (≤1 GB mỗi 30 ngày)
// và §6.1b (hao mòn bộ nhớ nằm ở ghi lại lặp, không ở lần ghi đầu).
//
// Thời gian là ĐẦU VÀO của mọi hàm, nên không cần giả lập đồng hồ — test kiểm được
// đúng ranh giới ngày 29 / 30 / 31, chỗ mà cửa sổ lật và cửa sổ trượt khác nhau.

import { BYTES_PER_GB } from './quota';
import {
  EMPTY_LEDGER,
  WRITE_BUDGET_BYTES,
  WRITE_WINDOW_DAYS,
  canWrite,
  parseLedger,
  pruneLedger,
  recordWrite,
  remainingBytes,
  serializeLedger,
  usedBytes,
} from './writeBudget';

const GB = BYTES_PER_GB;
const MB = 1_000_000;
const DAY = 86_400_000;

/** Mốc thời gian cố định (2026-08-11T00:00:00Z) — test không được phụ thuộc lúc chạy. */
const T0 = Date.UTC(2026, 7, 11);
const daysAgo = (n: number): number => T0 - n * DAY;

describe('sổ rỗng', () => {
  it('chưa ghi gì ⇒ còn nguyên 1 GB', () => {
    expect(remainingBytes(EMPTY_LEDGER, T0)).toBe(WRITE_BUDGET_BYTES);
    expect(usedBytes(EMPTY_LEDGER, T0)).toBe(0);
  });

  it('trần đúng bằng 1 GB — §6.1a', () => {
    expect(WRITE_BUDGET_BYTES).toBe(1 * GB);
    expect(WRITE_WINDOW_DAYS).toBe(30);
  });
});

describe('cộng dồn trong cửa sổ', () => {
  it('ghi 600 MB ⇒ còn 400 MB', () => {
    const ledger = recordWrite(EMPTY_LEDGER, T0, 600 * MB);
    expect(remainingBytes(ledger, T0)).toBe(400 * MB);
  });

  it('xin nhiều hơn phần còn lại ⇒ từ chối; xin vừa đúng ⇒ cho', () => {
    const ledger = recordWrite(EMPTY_LEDGER, T0, 600 * MB);
    expect(canWrite(ledger, T0, 500 * MB)).toBe(false);
    expect(canWrite(ledger, T0, 400 * MB)).toBe(true);
  });

  it('nhiều lần ghi trong cùng một ngày gộp vào một mục', () => {
    let ledger = recordWrite(EMPTY_LEDGER, T0, 100 * MB);
    ledger = recordWrite(ledger, T0 + 3600_000, 150 * MB);
    expect(usedBytes(ledger, T0 + 7200_000)).toBe(250 * MB);
    expect(Object.keys(ledger.buckets)).toHaveLength(1);
  });

  it('không sửa sổ cũ tại chỗ (hàm thuần)', () => {
    const before = recordWrite(EMPTY_LEDGER, T0, 100 * MB);
    const snapshot = serializeLedger(before);
    recordWrite(before, T0, 200 * MB);
    expect(serializeLedger(before)).toBe(snapshot);
  });
});

describe('cửa sổ TRƯỢT, không phải cửa sổ lật', () => {
  it('lần ghi 29 ngày trước VẪN tính', () => {
    const ledger = recordWrite(EMPTY_LEDGER, daysAgo(29), 1 * GB);
    expect(remainingBytes(ledger, T0)).toBe(0);
    expect(canWrite(ledger, T0, 1 * MB)).toBe(false);
  });

  it('lần ghi 30 ngày trước đã rơi khỏi cửa sổ', () => {
    const ledger = recordWrite(EMPTY_LEDGER, daysAgo(30), 1 * GB);
    expect(remainingBytes(ledger, T0)).toBe(WRITE_BUDGET_BYTES);
  });

  it('ghi hết hạn mức rồi thì giữa cửa sổ vẫn bị chặn — chỗ cửa sổ lật cho lọt 2 GB', () => {
    const ledger = recordWrite(EMPTY_LEDGER, daysAgo(15), 1 * GB);
    expect(canWrite(ledger, T0, 1 * MB)).toBe(false);
    // và chỉ mở lại đúng 30 ngày sau lần ghi đó, không phải đầu tháng lịch
    expect(canWrite(ledger, daysAgo(15) + 30 * DAY, 1 * GB)).toBe(true);
  });

  it('sổ không phình: chỉ giữ tối đa 30 mục', () => {
    let ledger = EMPTY_LEDGER;
    for (let i = 0; i < 90; i += 1) ledger = recordWrite(ledger, daysAgo(i), 1 * MB);
    expect(Object.keys(pruneLedger(ledger, T0).buckets).length).toBeLessThanOrEqual(WRITE_WINDOW_DAYS);
  });
});

describe('fail-closed với đầu vào rác', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('canWrite(%p) ⇒ false', bytes => {
    expect(canWrite(EMPTY_LEDGER, T0, bytes)).toBe(false);
  });

  it('recordWrite bỏ qua số byte không hợp lệ, sổ giữ nguyên', () => {
    expect(recordWrite(EMPTY_LEDGER, T0, Number.NaN)).toBe(EMPTY_LEDGER);
    expect(recordWrite(EMPTY_LEDGER, T0, -5)).toBe(EMPTY_LEDGER);
  });

  it('vẫn ghi nhận lần ghi lỡ vượt trần — giấu đi là làm cửa sổ sau tính sai', () => {
    const ledger = recordWrite(EMPTY_LEDGER, T0, 2 * GB);
    expect(usedBytes(ledger, T0)).toBe(2 * GB);
    expect(remainingBytes(ledger, T0)).toBe(0);
  });
});

describe('parseLedger — sổ hỏng không được làm sập tính năng', () => {
  it('đi vòng qua chuỗi rồi về giữ nguyên nội dung', () => {
    const ledger = recordWrite(EMPTY_LEDGER, T0, 123 * MB);
    expect(parseLedger(serializeLedger(ledger))).toEqual(ledger);
  });

  it.each([null, '', 'không phải json', '[]', '{"buckets":42}', '{"khac":1}'])(
    'rác %p ⇒ sổ rỗng',
    raw => {
      expect(parseLedger(raw)).toEqual(EMPTY_LEDGER);
    },
  );

  it('loại từng mục lạ, giữ mục hợp lệ', () => {
    const parsed = parseLedger('{"buckets":{"20000":"nhiều","20001":50,"xyz":10,"20002":-3}}');
    expect(parsed.buckets).toEqual({ '20001': 50 });
  });
});
