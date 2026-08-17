// config/quickActions.ts
//
// NƠI DUY NHẤT khai báo các nút Quick Action ở Trang chủ.
// Thêm/bớt/đổi nhãn nút → sửa đúng file này, không đụng HomeScreen.
//
// Luật hiển thị (xem services/featureUsageService.ts + screens/HomeScreen.tsx):
//   - Mở một tính năng (route của nó xuất hiện) = 1 LƯỢT DÙNG, ghi vào SQLite.
//   - Nút chỉ được THÊM vào Quick Action khi tính năng đạt >= QUICK_ACTION_MIN_USES lượt.
//   - Thứ tự nút = theo số lượt dùng giảm dần. KHÔNG nút nào có vị trí cố định.
//   - Chưa tính năng nào đủ lượt → Quick Action rỗng → ẩn cả khối (kể cả thanh đóng/mở).
//
// `route` vừa là đích điều hướng, VỪA là khoá đếm — nhờ vậy mọi lối vào tính năng
// (nút ở đây, mục Dịch vụ, navbar, menu hành động, deep-link) đều cộng vào cùng một
// con số, không cần bảng ánh xạ song song dễ lệch.

export type QuickActionConfig = {
  /** Tên route nav THẬT — cũng là khoá đếm trong bảng feature_usage_events. */
  route: string;
  /** Tham số truyền cho route (tĩnh). Cần tham số động → xử lý ở HomeScreen. */
  params?: Record<string, unknown>;
  label: string;
  labelEn: string;
  /** Ảnh PNG nhân vật (require) — ưu tiên hơn `icon` nếu có cả hai. */
  image?: number;
  /** Tên icon MaterialCommunityIcons, dùng khi không có `image`. */
  icon?: string;
  /** Module sở hữu tính năng — để lọc/nhóm về sau. */
  module: 'trace' | 'chat' | 'work' | 'lampnet';
};

// Ngưỡng "dùng nhiều" — dưới ngưỡng thì nút KHÔNG xuất hiện.
export const QUICK_ACTION_MIN_USES = 3;

// Hiện chỉ có 4 tính năng của module Trace. Module khác bổ sung entry vào đây.
export const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    route: 'TreeIdentity',
    label: 'Quét cây',
    labelEn: 'Tree',
    image: require('../../assets/images/modules/tree.png'),
    module: 'trace',
  },
  {
    route: 'AnimalManagement',
    label: 'Nhận diện\ncon vật',
    labelEn: 'Animal',
    icon: 'paw',
    module: 'trace',
  },
  {
    // Thu video quả → gắn cây (OriLife User-Action-Flow). Icon máy quay + dấu cộng.
    route: 'FruitVideo',
    label: 'Quay video\nquả',
    labelEn: 'Fruit video',
    icon: 'video-plus',
    module: 'trace',
  },
  {
    route: 'FarmDetail',
    label: 'Thêm Vườn',
    labelEn: 'Farm',
    image: require('../../assets/images/modules/add-growth.png'),
    module: 'trace',
  },
  {
    route: 'Farms',
    label: 'Vườn của tôi',
    labelEn: 'My farms',
    image: require('../../assets/images/modules/vegetable.png'),
    module: 'trace',
  },
];
