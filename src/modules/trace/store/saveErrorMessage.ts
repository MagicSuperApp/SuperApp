/**
 * Đọc thứ một thunk ném ra, lấy đúng câu dành cho người dùng.
 *
 * Vì sao phải là một hàm riêng chứ không phải một dòng trong `catch`: giá trị ném ra
 * ở đây KHÔNG phải `Error`. `createAsyncThunk` + `unwrap()` ném ra **chính giá trị đã
 * truyền vào `rejectWithValue`**, không bọc lại — và `farmSlice.saveTreeMetadata`
 * truyền vào một **chuỗi trần**. Viết `e?.message` trên một chuỗi ra `undefined`, nên
 * câu của máy chủ (thứ duy nhất nói được người dùng phải sửa gì) lặng lẽ bị thay bằng
 * câu chung chung của app. Không cổng kiểu nào bắt được: `e` khai là `any`.
 *
 * Đặt ở đây, cạnh chỗ ném, để hai bên không trôi khỏi nhau; và tách rời được thì
 * ghim được — màn hình không có bài render nào.
 */
export function saveErrorMessage(thrown: unknown, fallback: string): string {
  if (typeof thrown === 'string' && thrown.trim()) return thrown;
  const message = (thrown as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}
