import { classify409 } from './treeEnrollConflict';

/**
 * Bài kiểm này khoá NGUYÊN VĂN ba câu máy chủ ném ra. Không phải câu bịa cho đẹp:
 * chép đúng từ mã OriLife trên `origin/main`. Vòng lặp ngoài vườn 12/08 xảy ra
 * đúng vì bên này chưa bao giờ đặt câu THẬT vào một bài kiểm — chỉ kiểm bằng
 * những chuỗi tự nghĩ ra, mà chuỗi tự nghĩ thì luôn chứa từ khoá mình đang dò.
 */

// visual_reid.py:264 — f"Cây này rất giống '{name}' đã có ({round(sim*100)}%) — có thể là CÙNG cây."
const CAU_NGHI_TRUNG = "Cây này rất giống 'Sầu 12' đã có (94%) — có thể là CÙNG cây.";
// visual_reid.py:846-848
const CAU_ANH_PHANG = 'Các góc gần như giống hệt nhau — nghi chụp lại MỘT tấm ảnh, không phải đi vòng quanh cây.';
// visual_reid.py:853-855
const CAU_NHIEU_CAY = 'Ảnh chứa NHIỀU cây khác nhau — hãy chụp lại một cây duy nhất.';

describe('classify409 — câu THẬT của máy chủ, không phải câu tự nghĩ', () => {
  it('câu nghi-trùng → duplicate (bản cũ trả unknown ⇒ vòng lặp)', () => {
    expect(classify409(CAU_NGHI_TRUNG)).toBe('duplicate');
    expect(classify409(CAU_NGHI_TRUNG)).not.toBe('unknown');
  });

  it('câu ảnh-phẳng → flat, KHÔNG được rơi nhầm sang duplicate', () => {
    // "giống hệt" và "rất giống" chỉ khác nhau một chữ. Nếu xét nhánh trùng trước
    // thì câu này thành 'duplicate' → app mời người dùng "Gộp vào cây cũ" trong khi
    // lỗi thật là họ chụp lại một tấm ảnh.
    expect(classify409(CAU_ANH_PHANG)).toBe('flat');
  });

  it('câu nhiều-cây → heterogeneous', () => {
    expect(classify409(CAU_NHIEU_CAY)).toBe('heterogeneous');
  });
});

describe('classify409 — cờ boolean là đường CHÍNH, dò chữ chỉ là lưới đỡ', () => {
  // treeReIDService suy `code` từ ba cờ boolean của thân 409. Khi có `code` thì
  // câu chữ KHÔNG được phép lật kết quả — kể cả câu chữ mâu thuẫn.
  it('code thắng câu chữ', () => {
    expect(classify409(CAU_NHIEU_CAY, 'duplicate_tree')).toBe('duplicate');
    expect(classify409(CAU_NGHI_TRUNG, 'flat')).toBe('flat');
    expect(classify409(CAU_ANH_PHANG, 'heterogeneous')).toBe('heterogeneous');
  });

  it('nhận cả hai cách viết mã trùng', () => {
    expect(classify409('', 'duplicate')).toBe('duplicate');
    expect(classify409('', 'duplicate_tree')).toBe('duplicate');
  });
});

describe('classify409 — vẫn còn ca unknown, và đó là điều PHẢI chấp nhận', () => {
  // Không cố làm hàm này đúng mọi câu. Máy chủ đổi chữ là nó trượt tiếp — nên
  // đường ra khỏi 409 ở màn đăng ký KHÔNG được phụ thuộc vào việc phân loại đúng:
  // nhánh 'unknown' vẫn phải mở nút "Tạo cây mới" (TreeEnrollScreen).
  it('câu lạ hoàn toàn → unknown', () => {
    expect(classify409('Máy chủ bận, thử lại sau.')).toBe('unknown');
  });

  it('thân rỗng, không cờ → unknown chứ không ném', () => {
    expect(classify409('')).toBe('unknown');
    expect(classify409(undefined as unknown as string)).toBe('unknown');
  });
});
