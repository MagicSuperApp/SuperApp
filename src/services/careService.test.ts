/**
 * Cờ `safe` của `/api/care/withdrawal` có BA giá-trị (OriLife `care.py:443-451`).
 * `null` = CHƯA XÁC ĐỊNH, KHÔNG phải an-toàn. Đây là mục có hậu-quả ngoài phần-mềm:
 * nói "an-toàn" khi hệ không biết là bảo nông-dân cứ hái, nông-sản đó ra chợ.
 */
import { safeStateOf } from './careService';

describe('safeStateOf — ba nhánh tường minh', () => {
  it('false → blocked (đang trong thời-gian cách-ly)', () => {
    expect(safeStateOf(false)).toBe('blocked');
  });

  it('true → safe', () => {
    expect(safeStateOf(true)).toBe('safe');
  });

  it('null → unknown, KHÔNG phải safe', () => {
    expect(safeStateOf(null)).toBe('unknown');
    expect(safeStateOf(null)).not.toBe('safe');
  });

  it('undefined (trường vắng mặt) → unknown, KHÔNG phải safe', () => {
    expect(safeStateOf(undefined)).toBe('unknown');
    expect(safeStateOf(undefined)).not.toBe('safe');
  });

  it('KHÔNG lặp lại hai lỗi đã biết: `safe ?? true` và `safe !== false`', () => {
    // Hai biểu-thức dưới đây là hai cách viết SAI đã gặp thật; giữ lại trong test
    // để chứng minh hàm này không đồng ý với chúng ở ca `null`.
    const sai1 = (s: boolean | null | undefined) => (s ?? true);          // null → true
    const sai2 = (s: boolean | null | undefined) => s !== false;          // null → true
    expect(sai1(null)).toBe(true);
    expect(sai2(null)).toBe(true);
    expect(safeStateOf(null)).toBe('unknown'); // hàm đúng thì không rơi vào 'safe'
  });
});
