/**
 * Phân loại 409 của `/api/enroll` (OriLife field-reid).
 *
 * Tách khỏi `TreeEnrollScreen.tsx` vì một lý do cụ thể: hàm này là chỗ vòng lặp
 * 409 ngoài vườn sinh ra, mà nằm trong tệp màn hình thì không bài kiểm nào chạm
 * tới được (import màn hình kéo theo react-native + navigation + camera).
 *
 * `code` là đường CHÍNH — `treeReIDService` suy nó ra từ BA CỜ BOOLEAN máy chủ
 * thật sự gửi (`duplicate` / `flat` / `heterogeneous`, `server.py:2115/2120/2128`).
 * Dò chữ chỉ còn là lưới đỡ cho bản máy chủ cũ.
 *
 * VÌ SAO PHẢI ĐỔI — vòng lặp chủ nhân gặp ngoài vườn 12/08:
 * máy chủ ném câu «Cây này rất giống 'X' đã có (94%) — có thể là CÙNG cây»
 * (`visual_reid.py:264`). Câu đó KHÔNG chứa 'trùng', 'duplicate' hay 'already
 * exists' → bản cũ trả 'unknown' → rơi xuống hộp thoại 'Conflict' một nút OK.
 * Bấm OK rồi bấm Đăng ký lại gọi enroll KHÔNG cờ → cùng 409 → cùng hộp thoại.
 * Hộp thoại ba nút (Huỷ / Gộp vào cây cũ / Tạo cây mới) và `handleForceEnroll`
 * đều đã viết xong từ lâu và đúng — chỉ là không lần nào tới được.
 *
 * Nhánh `flat` hỏng y hệt mà chưa ai báo: câu máy chủ là «Các góc gần như giống
 * hệt nhau — nghi chụp lại MỘT tấm ảnh» (`visual_reid.py:846`), cũng không chứa
 * 'phẳng'/'lặp'. Chỉ `heterogeneous` may mắn đúng vì câu của nó có chữ 'NHIỀU cây'.
 *
 * Bài học ghi lại vì nó rộng hơn ca này: **phân loại lỗi bằng cách dò chữ trong
 * câu viết cho NGƯỜI ĐỌC là dựng một hợp đồng mà bên kia không biết mình đã ký.**
 * Máy chủ sửa một chữ trong câu tiếng Việt là nhánh xử lý chết — không bài kiểm
 * nào đỏ, không lỗi nào in ra, chỉ có nông dân đứng ngoài vườn bấm mãi một nút.
 */
export type Conflict409 = 'duplicate' | 'heterogeneous' | 'flat' | 'unknown';

export function classify409(detail: string, code?: string): Conflict409 {
  switch (code) {
    case 'duplicate_tree':
    case 'duplicate':
      return 'duplicate';
    case 'heterogeneous':
      return 'heterogeneous';
    case 'flat':
      return 'flat';
  }

  const d = (detail ?? '').toLowerCase();
  if (d.includes('heterogeneous') || d.includes('nhiều cây') || d.includes('multiple trees')) {
    return 'heterogeneous';
  }
  // 'giống hệt' phải xét TRƯỚC nhánh trùng: câu ảnh-phẳng là "gần như giống hệt
  // nhau", câu nghi-trùng là "rất giống" — hai câu chỉ khác nhau một chữ.
  if (d.includes('flat') || d.includes('phẳng') || d.includes('lặp') || d.includes('giống hệt')) {
    return 'flat';
  }
  if (
    d.includes('duplicate') || d.includes('trùng') || d.includes('already exists')
    || d.includes('rất giống') || d.includes('cùng cây')
  ) {
    return 'duplicate';
  }
  return 'unknown';
}
