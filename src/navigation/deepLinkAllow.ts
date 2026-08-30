// navigation/deepLinkAllow.ts
//
// ROUTE NÀO MỞ ĐƯỢC TỪ NGOÀI — DANH SÁCH TRẮNG VIẾT TAY, KHÔNG PHẢI VÒNG LẶP.
//
// ══ Lỗi đang vá ═══════════════════════════════════════════════════════════════
// `buildLinking()` dựng bảng đường dẫn bằng một vòng lặp trên TOÀN BỘ
// `MODULE_STACK_SCREENS`:
//
//     MODULE_STACK_SCREENS.forEach(({ moduleId, route }) => {
//       screens[route] = `${moduleId}/${route}`;
//     });
//
// Nghĩa là **mọi route của mọi module bật đều mở được từ ngoài**, và route mới
// thêm sau này **mặc định MỞ** — không ai phải quyết gì, không ai phải nhớ gì.
// Đếm được 25 route, gồm `ChatRoom` (hội thoại riêng), `FarmDetail`/`TreeDetail`
// (vườn riêng), `Contracts`/`ContractDetail`/`WorkerProfile` (hợp đồng riêng).
//
// ══ Vì sao chuyện đó nguy hiểm hơn nó trông ═══════════════════════════════════
// `ProtectedMain` chỉ bọc ĐÚNG route `Main`. 25 route module là **anh em ruột**
// của `Main` trong cùng một `Stack.Navigator` phẳng, KHÔNG nằm dưới nó. Một liên
// kết mở thẳng `chat/ChatRoom` lúc khởi động lạnh thì luồng không đi qua `Main`,
// nên `ProtectedMain` không chạy lần nào — không có cổng nào để vượt.
//
// Cộng thêm: `auth_token` nằm trong AsyncStorage và năm service ReID đọc THẲNG từ
// đó, không qua Redux (`treeReIDService.ts:6`, `animalReIDService.ts:7`,
// `careService.ts:8`, `fruitReIDService`, `orilifeDidAuth.ts:15`). Nên "đã mở khoá
// chưa" có hai câu trả lời, và cổng đang đọc câu dễ hơn.
//
// ══ Vì sao KHÔNG dựng "hàng đợi chờ cổng mở" thay cho danh sách trắng ═════════
// Nhà ProofChat bác đúng một kế hoạch nhà này định làm (thư `ma:sa-linking-gate`).
// "Giữ đường dẫn lại chờ cổng mở rồi mới điều hướng" — chờ **cổng nào**? Không có
// cổng nào cai quản 25 route đó. Hàng đợi buộc phải chờ một điều kiện thay thế:
//
//   · chờ `state.user.currentUser` — Redux nạp lại từ bộ nhớ máy lúc khởi động;
//     nạp được mà không cần sinh trắc ⇒ điều kiện ĐÚNG NGAY từ đầu ⇒ nhả tức thì;
//   · chờ `auth_token` — còn tệ hơn, đó chính là nguồn sự thật DỄ HƠN.
//
// Cả hai ra cùng một thứ: một cơ chế **có hình dạng của cổng, có tên như cổng, và
// nhả mọi thứ đi qua**. Sau đó `grep` báo CÓ hàng đợi, người soát đọc tên hàm rồi
// tin là đã gác. Từ chối thì lộ ra ngay; xếp hàng rồi nhả thì im lặng.
//
// ══ Cái tệp này làm, và cái nó KHÔNG làm ══════════════════════════════════════
// LÀM: đổi mặc định. Route mới thêm sau này **mặc định ĐÓNG** với liên kết ngoài;
// muốn mở thì phải viết tên nó vào đây, tức là phải có người quyết.
//
// KHÔNG LÀM: không dựng lại bảng đường dẫn để mọi route module nằm dưới cổng. Đó
// là việc phải làm và nó đang chờ chủ dự án quyết — tệp này không thay thế nó, và
// đừng đọc tệp này thành "lỗ đã đóng". Lỗ chỉ hẹp lại từ 25 route xuống 0 route
// MỞ ĐƯỢC TỪ NGOÀI; bảng đường dẫn bên trong vẫn phẳng y như cũ.

/**
 * Route module mở được từ liên kết ngoài. **RỖNG là có chủ ý, không phải chưa
 * điền.**
 *
 * Hôm nay không route module nào cần mở từ ngoài: lược đồ `lamp://` chưa khai với
 * hệ điều hành (`Info.plist` không có `CFBundleURLTypes`, `AndroidManifest.xml`
 * không có `<data android:scheme>`), nên chưa liên kết hợp lệ nào từ ngoài đi vào
 * đường này. Đóng lại hôm nay **không lấy mất của người dùng thật thứ gì**.
 *
 * ⚠️ Đây là trạng thái TẠM, và điều kiện gỡ nói rõ ở đây để nó đừng thành vĩnh
 * viễn mà không ai quyết: mở lại từng route MỘT KHI đã có cổng mà người dùng phải
 * VƯỢT QUA (không phải một giá trị đã sẵn có lúc khởi động), và khi route đó được
 * xét là không lộ dữ liệu riêng.
 *
 * Thêm một dòng vào đây là một quyết định sản phẩm. Kèm lý do.
 */
export const MODULE_DEEP_LINK_ALLOW: readonly string[] = [];

/**
 * Route HOST mở được từ ngoài, kèm đường dẫn. Ba route này đã được xét riêng:
 *
 *   · `Main`  — route DUY NHẤT có cổng (`ProtectedMain` kiểm `currentUser` rồi
 *               `reset` về `Login`). Đây là chỗ đúng để một liên kết ngoài rơi vào.
 *   · `TraceScan`     — màn quét của NGƯỜI MUA, không đăng nhập, không dữ liệu riêng.
 *   · `LanguageSelect`— chọn ngôn ngữ, không đọc dữ liệu nào.
 *
 * Các route HOST khác cố ý KHÔNG có mặt — `Wakeme` (chuyển LAMP thật), `TreeDrift`
 * và `TreeShare` (đọc/ghi dữ liệu riêng của vườn), `Guardian`, `ActivityLog`.
 */
export const HOST_DEEP_LINK_PATHS: Readonly<Record<string, string>> = {
  Main: 'main',
  LanguageSelect: 'language',
};

/**
 * Dựng bảng `config.screens` cho React Navigation.
 *
 * `moduleScreens` là toàn bộ route module đã đăng ký; hàm này **lọc** nó qua danh
 * sách trắng chứ không đổ hết vào. Route có trong danh sách trắng mà không có
 * trong `moduleScreens` thì bỏ qua lặng lẽ — module tắt thì route của nó không tồn
 * tại, đó không phải lỗi.
 *
 * `traceScanRoute` truyền vào thay vì đóng cứng, vì tên route đó là hằng dùng chung
 * ở nơi khác.
 */
export function buildDeepLinkScreens(
  moduleScreens: readonly { moduleId: string; route: string }[],
  traceScanRoute: string,
): Record<string, string> {
  const screens: Record<string, string> = { ...HOST_DEEP_LINK_PATHS };
  screens[traceScanRoute] = 'trace-scan';

  const allow = new Set(MODULE_DEEP_LINK_ALLOW);
  for (const { moduleId, route } of moduleScreens) {
    if (allow.has(route)) screens[route] = `${moduleId}/${route}`;
  }
  return screens;
}
