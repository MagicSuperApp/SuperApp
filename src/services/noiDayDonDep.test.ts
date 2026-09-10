// services/noiDayDonDep.test.ts
//
// HÀM DỌN DẸP PHẢI CÓ NGƯỜI GỌI (Issue #286, #288).
//
// ⛔ Cùng LỚP lỗi lặp lại: thứ dọn dẹp được viết cùng lúc với thứ nó dọn, rồi
//    bước nối dây không xảy ra. Không cổng nào đỏ, vì một hàm không ai gọi thì
//    biên dịch vẫn xanh và test cũ vẫn xanh.
//
//      clearMerkleSession   → đăng xuất để lại hạt giống khoá KÝ, hạn 12 giờ
//      clearTreeImages      → xoá cây để lại ảnh
//      clearVideoProofs     → xoá cây để lại sổ video bằng chứng
//      clearTreePosition    → xoá cây để lại toạ độ 3D
//      database.deleteTree  → xoá cây để lại HÀNG SQLite, và `syncTreesFromBackend`
//                             rơi về `database.getTrees` khi mạng trượt ⇒ cây "đã
//                             xoá vĩnh viễn" HIỆN LẠI trong danh sách
//      setPushNavigator     → bấm thông báo đẩy không mở màn nào
//
// Bài kiểm giữ hai điều, và điều thứ hai mới là điều khó giữ:
//   1. `forgetTreeLocally` thật sự dọn đủ bốn nơi, và một nơi hỏng không chặn ba
//      nơi còn lại;
//   2. các LỜI GỌI còn ở đúng chỗ — quét mã nguồn, khớp `tên(`, KHÔNG khớp tên
//      trần. Lý do cụ thể: ba trong các hàm này cũng xuất hiện trong khối
//      `export default` của chính tệp chúng, nên phép so bằng tên trần sẽ xanh cả
//      khi lời gọi đã bị gỡ mất — đúng cái bẫy đã dựng ra sáu chỗ ở trên.
//      Khuôn này lấy từ `proofchatTokenOwner.test.ts` điều 5.

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDeleteTree = jest.fn(async (_treeId: string) => {});
jest.mock('../utils/database', () => ({
  database: { deleteTree: (id: string) => mockDeleteTree(id) },
}));

import { forgetTreeLocally } from './treeLocalCleanup';
import { appendTreeImages, loadTreeImages } from './treeImageStore';
import { appendVideoProof, loadVideoProofs } from './videoProofStore';
import { saveTreePosition, loadTreePosition } from '../features/space3d/positionStore';

const TREE = 'tree-abc';

const gieoDauVet = async () => {
  await appendTreeImages(TREE, ['file:///anh-1.jpg']);
  await appendVideoProof(TREE, { videoCid: 'cid-1', kind: 'tree', at: '2026-09-09T00:00:00Z' });
  await saveTreePosition(TREE, { x: 1, z: 2 });
};

describe('forgetTreeLocally — xoá cây thì dấu vết trên máy đi theo', () => {
  beforeEach(async () => {
    mockDeleteTree.mockClear();
    mockDeleteTree.mockImplementation(async () => {});
    await AsyncStorage.clear();
  });

  it('dọn đủ BỐN nơi: ảnh, video, toạ độ, hàng SQLite', async () => {
    await gieoDauVet();
    expect(await loadTreeImages(TREE)).toHaveLength(1);
    expect(await loadVideoProofs(TREE)).toHaveLength(1);
    expect(await loadTreePosition(TREE)).not.toBeNull();

    await forgetTreeLocally(TREE);

    expect(await loadTreeImages(TREE)).toEqual([]);
    expect(await loadVideoProofs(TREE)).toEqual([]);
    expect(await loadTreePosition(TREE)).toBeNull();
    expect(mockDeleteTree).toHaveBeenCalledWith(TREE);
  });

  it('DB chưa mở (deleteTree NÉM) không được chặn ba kho kia, và không ném ra ngoài', async () => {
    mockDeleteTree.mockImplementation(async () => {
      throw new Error('[Database] DB not initialized for user: null');
    });
    await gieoDauVet();

    await expect(forgetTreeLocally(TREE)).resolves.toBeUndefined();

    expect(await loadTreeImages(TREE)).toEqual([]);
    expect(await loadVideoProofs(TREE)).toEqual([]);
    expect(await loadTreePosition(TREE)).toBeNull();
  });

  it('treeId rỗng thì không đụng gì', async () => {
    await forgetTreeLocally('');
    expect(mockDeleteTree).not.toHaveBeenCalled();
  });
});

describe('lời gọi phải CÒN Ở ĐÓ — quét mã nguồn, khớp lời gọi', () => {
  const doc = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('handleDelete gọi forgetTreeLocally, và gọi SAU khi máy chủ đã xoá', () => {
    const src = doc('../screens/TreeManagementScreen.tsx');
    expect(src).toContain("import { forgetTreeLocally } from '../services/treeLocalCleanup';");
    expect(src).toContain('await forgetTreeLocally(item.tree_id);');
    // Dọn TRƯỚC `res.ok` là xoá ảnh/video của một cây vẫn còn sống trên máy chủ.
    const sauKhiOk = src.slice(src.indexOf('const res = await deleteTree('));
    expect(sauKhiOk.indexOf('if (res.ok)')).toBeLessThan(
      sauKhiOk.indexOf('await forgetTreeLocally(item.tree_id);'),
    );
  });

  it('NavigationContainer trao hàm điều hướng cho push ở onReady', () => {
    const src = doc('../navigation/index.tsx');
    expect(src).toContain('createNavigationContainerRef');
    expect(src).toContain('setPushNavigator((screen, params) =>');
    // Phải nằm TRONG `onReady` — trao sớm hơn là trao một tham chiếu chưa dùng được.
    const tuOnReady = src.slice(src.indexOf('onReady={'));
    expect(tuOnReady.indexOf('setPushNavigator(')).toBeGreaterThan(-1);
    expect(tuOnReady.indexOf('setPushNavigator(')).toBeLessThan(tuOnReady.indexOf('</NavigationContainer>'));
  });

  it('logoutUser gọi clearMerkleSession', () => {
    const src = doc('../store/userSlice.ts');
    expect(src).toContain("import { clearMerkleSession } from '../services/proofchatIdentity';");
    expect(src).toContain('await clearMerkleSession();');
  });
});
