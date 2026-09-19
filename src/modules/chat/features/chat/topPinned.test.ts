/**
 * Ca quan trọng nhất ở đây là ca PHÂN BIỆT ĐƯỢC hai cách đọc.
 *
 * Với một tin ghim, hoặc với thứ tự máy chủ trùng thứ tự thời gian, thì "lấy đầu
 * theo thứ tự máy chủ" và "lấy cuối theo thời gian" cho CÙNG kết quả — nên một
 * bài kiểm dựng bằng dữ liệu đẹp sẽ xanh với cả bản sai. Ca `🔴 CHỐT` dưới đây
 * cố ý dựng thứ tự máy chủ NGƯỢC với thứ tự danh sách.
 */
import { topPinned } from './topPinned';

const tin = (id: string) => ({ id, text: id });

describe('topPinned', () => {
  it('không có tin ghim nào → không có gì để hiện', () => {
    expect(topPinned([], ['a'])).toBeUndefined();
    expect(topPinned([], undefined)).toBeUndefined();
  });

  it('🔴 CHỐT — lấy ĐẦU theo thứ tự máy chủ, không lấy CUỐI theo thời gian', () => {
    // Danh sách theo thời gian: a (cũ) → b → c (mới nhất).
    // Người dùng đã kéo `a` lên trên cùng, nên máy chủ trả order = [a, c, b].
    //   đúng  → 'a'
    //   sai   → 'c' (phần tử cuối của danh sách thời gian — lỗi cũ ở ChatScreen)
    const ds = [tin('a'), tin('b'), tin('c')];
    expect(topPinned(ds, ['a', 'c', 'b'])!.id).toBe('a');
    expect(topPinned(ds, ['a', 'c', 'b'])!.id).not.toBe(ds[ds.length - 1].id);
  });

  it('thứ tự máy chủ chưa về → lùi về tin đầu danh sách, KHÔNG biến mất', () => {
    const ds = [tin('a'), tin('b')];
    expect(topPinned(ds, undefined)!.id).toBe('a');
    expect(topPinned(ds, [])!.id).toBe('a');
  });

  it('thứ tự máy chủ trỏ tới tin không còn hiển thị thì bỏ qua, đọc tiếp', () => {
    // `x` đã bị xoá hoặc nằm ngoài trang đã tải. Trả `undefined` ở đây là làm
    // thanh ghim biến mất trong khi vẫn còn hai tin đang được ghim.
    const ds = [tin('a'), tin('b')];
    expect(topPinned(ds, ['x', 'b', 'a'])!.id).toBe('b');
  });

  it('mọi mã trong thứ tự đều lạ → vẫn lùi về tin đầu danh sách', () => {
    expect(topPinned([tin('a')], ['x', 'y'])!.id).toBe('a');
  });
});
