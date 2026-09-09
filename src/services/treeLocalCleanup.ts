/**
 * treeLocalCleanup — MỘT CỬA dọn dấu vết CỤC BỘ của một cây vừa bị xoá (Issue #288).
 *
 * ⛔ Trước tệp này, `handleDelete` ở `TreeManagementScreen` làm đúng MỘT việc:
 * gọi `deleteTree()` lên máy chủ rồi lọc cây khỏi state React. Bốn hàm dọn dẹp
 * ĐÃ ĐƯỢC VIẾT SẴN cho đúng lúc này thì 0 nơi gọi:
 *
 *   treeImageStore.clearTreeImages     — ảnh của cây
 *   videoProofStore.clearVideoProofs   — sổ video bằng chứng
 *   positionStore.clearTreePosition    — toạ độ 3D trên bản đồ vườn
 *   database.deleteTree                — HÀNG trong SQLite
 *
 * Ba cái đầu là rác nằm im. Cái thứ tư KHÔNG nằm im: `syncTreesFromBackend`
 * (`modules/trace/store/farmSlice.ts:86-110`) khi gọi máy chủ không `ok` thì rơi về
 * `database.getTrees(farmId)`. Hàng SQLite chưa xoá nghĩa là MẤT MẠNG MỘT CÁI là
 * cây "đã xoá" hiện lại trong danh sách — người dùng vừa đọc "Không thể hoàn tác"
 * xong. Đó là lý do tệp này gộp cả hàng SQLite chứ không chỉ ba kho AsyncStorage.
 *
 * Vì sao MỘT CỬA, không phải bốn lời gọi rải trong màn hình: hôm nay chỉ có đúng
 * một lối xoá cây (`TreeManagementScreen.handleDelete` — đo bằng `grep -rn "deleteTree("`,
 * ra một lời gọi và hai định nghĩa). Ngày có lối thứ hai, lối đó phải làm đủ bốn
 * việc; một danh sách nằm rải trong một màn hình thì lối mới sẽ chép thiếu, và
 * chép thiếu ở đây không đỏ ở đâu cả. Đây là chỗ để chép ĐỦ bằng một dòng.
 *
 * Best-effort theo đúng khuôn `logoutUser` (`store/userSlice.ts`): mỗi việc một
 * `try/catch`, hỏng thì `console.warn` rồi ĐI TIẾP. Một việc dọn hỏng không được
 * chặn ba việc còn lại, và không được chặn màn hình cập nhật — cây đã xoá trên
 * máy chủ rồi, giữ nó lại trên màn hình là nói dối theo chiều ngược lại.
 */

import { clearTreeImages } from './treeImageStore';
import { clearVideoProofs } from './videoProofStore';
import { clearTreePosition } from '../features/space3d/positionStore';
import { database } from '../utils/database';

/** Xoá mọi dấu vết cục bộ của `treeId`. Gọi SAU khi máy chủ đã xoá thành công. */
export async function forgetTreeLocally(treeId: string): Promise<void> {
  if (!treeId) return;

  try {
    await clearTreeImages(treeId);
  } catch (error) {
    console.warn('[treeLocalCleanup] clearTreeImages lỗi (bỏ qua):', error);
  }

  try {
    await clearVideoProofs(treeId);
  } catch (error) {
    console.warn('[treeLocalCleanup] clearVideoProofs lỗi (bỏ qua):', error);
  }

  try {
    await clearTreePosition(treeId);
  } catch (error) {
    console.warn('[treeLocalCleanup] clearTreePosition lỗi (bỏ qua):', error);
  }

  try {
    // Hàm DUY NHẤT trong bốn hàm không tự nuốt lỗi: `database.deleteTree` NÉM khi
    // DB chưa mở (`utils/database.ts:308`). Ba hàm kia đã có `try/catch` bên trong,
    // vẫn bọc ở đây để hợp đồng "một việc hỏng không chặn việc khác" thuộc về CHỖ
    // NÀY, không phụ thuộc vào việc ba tệp kia có giữ nguyên nếp cũ hay không.
    await database.deleteTree(treeId);
  } catch (error) {
    console.warn('[treeLocalCleanup] database.deleteTree lỗi (bỏ qua):', error);
  }
}

export default { forgetTreeLocally };
