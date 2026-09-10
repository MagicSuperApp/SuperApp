/**
 * hostRoutes — DANH SÁCH KHAI của những màn HOST luôn mang theo.
 *
 * ── Vì sao tệp này tồn tại ──────────────────────────────────────────────────
 * `moduleCatalog.ts` trả lời được câu *"app này BẬT những module nào?"*. Nó
 * KHÔNG trả lời được câu mà danh mục vốn hứa: *"app này GỒM những gì?"*.
 *
 * Khác biệt đo được (2026-09-10, `develop` @ `add4d38`):
 *
 *     route bốn module trong danh mục nắm : 22   (trace 6 · chat 2 · work 12 · join 2)
 *     route `HOST_STACK_SCREENS` mang     : 55
 *
 * Tức một app khai `modules: []` vẫn mang 55 màn, trong đó có `PhoenixWallet`,
 * `Staking`, `FruitScan`, `TraceScan`, `TreeIdentity`, `AnimalIdentity`,
 * `SeedExport`. Danh mục sinh từ `module.manifest.json` nên nó chỉ nhìn thấy
 * thứ đã LÀ module; toàn bộ 55 màn kia nằm ngoài tầm nhìn của nó, và nằm ngoài
 * một cách **im lặng** — không phép đo nào kêu, không dòng nào đỏ.
 *
 * Nhà CheckFarm chỉ ra chỗ này qua màn ví (`HomeScreen.tsx:816`, khối "Thông
 * tin nhanh", không điều kiện nào bọc quanh). Đo lại thì cái thiếu rộng hơn một
 * màn: **thiếu phép đo trả lời "cái gì có trong app mà KHÔNG có trong danh mục"**.
 *
 * ── Tệp này làm gì, và KHÔNG làm gì ─────────────────────────────────────────
 * Nó **khai** tập ấy ra thành dữ liệu, để `hostRoutes.test.ts` canh được. Thêm
 * một màn host mà quên khai ở đây thì bài kiểm đỏ.
 *
 * Nó **KHÔNG** biện minh cho tập ấy. Màn nào trong danh sách dưới đây đáng lẽ
 * phải là module — ví, staking, cụm màn truy xuất — là quyết định sản phẩm của
 * chủ sở hữu, không phải của tệp này. Khai ra là điều kiện để bàn; nó không
 * thay cho việc bàn.
 *
 * ⚠ Đừng đọc danh sách này thành "những màn app nào cũng cần". Nó là *những màn
 * host đang mang*, đo được hôm nay. Hai câu đó khác nhau, và chỗ khác nhau ấy
 * chính là việc còn treo.
 *
 * ── Hệ quả ra ngoài, đã có người nêu ────────────────────────────────────────
 * Một app khai `modules: []` vẫn phải khai với cửa hàng rằng nó là ví tiền mã
 * hoá: người rà soát mở gói ra là thấy `sdk/taadEnclave.ts`, và câu hỏi của họ
 * là *ứng dụng làm gì*, không phải *người dùng bấm được gì*. Danh mục module
 * KHÔNG dùng làm lá chắn cho câu hỏi đó.
 */

/**
 * Mọi `name` khai trong `HOST_STACK_SCREENS` (`src/navigation/index.tsx`).
 *
 * Giữ ĐÚNG thứ tự xuất hiện trong mảng đó — để `git diff` của hai tệp đọc cạnh
 * nhau được, và để người thêm màn biết chép dòng khai vào đâu.
 */
export const HOST_ROUTES = [
  // Vào app + danh tính
  'Login',
  'LanguageSelect',
  'Onboarding',
  'WebPage',
  'Activation',
  'BiometricSettings',
  'DeleteAccount',
  'Terms',
  'SignRequest',
  'Guardian',
  'ActivityLog',
  'MyDevices',
  'Main',
  'Notifications',
  'ProofChatWallet',
  'ProofChatEscrow',
  'IdentityEntryChoice',
  'SignUpBiometric',
  'SignUpComplete',
  // Quả · cây · vườn — cụm truy xuất nằm ở HOST, không ở module `trace`
  'FruitList',
  'FruitCropper',
  'FruitScan',
  'FruitLookup',
  'Wayfind',
  'TraceNews',
  'TreeMap2D',
  'FarmMap2D',
  'Space3D',
  'FruitPlace3D',
  'TreeIdentity',
  'TreeEnroll',
  'FruitVideo',
  'TreeVideo',
  'TreeManagement',
  'AnimalIdentity',
  'AnimalEnroll',
  'AnimalManagement',
  'AnimalDetail',
  'TreeViewer3D',
  'CareScan',
  // Khoá · ví · phần thưởng
  'SeedExport',
  'RestoreIdentity',
  'PhoenixWallet',
  'Wakeme',
  'Staking',
  // Không gian doanh nghiệp
  'OrgDid',
  'OrgAuthority',
  'OrgMint',
  // Quét
  'WebLoginScan',
  'TraceScan',
  'TraceResult',
  // Cây: trôi · chia sẻ · xuất danh tính · tên đăng nhập
  'TreeDrift',
  'TreeShare',
  'ExportIdentity',
  'Username',
] as const;

export type HostRoute = (typeof HOST_ROUTES)[number];
