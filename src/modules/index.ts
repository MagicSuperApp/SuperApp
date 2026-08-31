// modules/index.ts
// Catalog tất cả module trong app — được HomeScreen và navigator dùng.
//
// YC-2: registry tay này là nguồn entrypoint/route HIỆN TẠI. Bản declarative
// tương ứng (validate bằng ./manifest.schema.json) nằm tại:
//   ./trace/module.manifest.json, ./proofchat/module.manifest.json,
//   ./work/module.manifest.json, ./join/module.manifest.json
// YC-3 ĐÃ refactor nav sang registry config-driven (INTEGRATION-STANDARD §7.1):
// xem src/navigation/registry.ts + src/config/instance.config.ts.
// routeName dưới đây = route nav THẬT, đã thống nhất với manifest.routes
// (đã sửa lệch 'TraceDashboard' → 'Dashboard' ở YC-3).

import type { ImageSourcePropType } from 'react-native';
import { TRACE_THEME, CHAT_THEME, WORK_THEME, LAMPNET_THEME } from '../theme';
import type { ModuleTheme } from '../theme/tokens';

export interface ModuleEntry {
  theme: ModuleTheme;
  title: string;
  description: string;
  icon: string;              // MaterialCommunityIcons (fallback nếu chưa có ảnh)
  image: ImageSourcePropType; // PNG nhân vật minh hoạ hành động của module
  bgDark: string;            // Màu background đậm cho card ở HomeScreen
  routeName: string;
  available: boolean;
}

export const MODULES: ModuleEntry[] = [
  {
    theme: TRACE_THEME,
    title: 'Truy xuất',
    description: 'Quản lý trang trại & truy xuất nguồn gốc nông sản',
    icon: 'pine-tree',
    image: require('../../assets/images/modules/scan-fi.png'),
    bgDark: '#0F5132',
    routeName: 'Farms', // tab Trace (hiện Dashboard) → mở kèm navbar; KHÔNG dùng root-stack 'Dashboard'
    available: true,
  },
  {
    theme: CHAT_THEME,
    title: 'Trò chuyện',
    description: 'Tin nhắn xác thực bằng chữ ký blockchain',
    icon: 'message-text-outline',
    image: require('../../assets/images/modules/chat-fi.png'),
    bgDark: '#421e8a',
    routeName: 'ChatHome',
    available: true,
  },
  {
    theme: WORK_THEME,
    title: 'Việc làm',
    description: 'Tìm việc & đặt thợ mọi lĩnh vực',
    icon: 'briefcase-outline',
    image: require('../../assets/images/modules/job-fi.png'),
    bgDark: WORK_THEME.primaryDeep,
    routeName: 'WorkHome',
    available: true,
  },
  {
    theme: LAMPNET_THEME,
    title: 'Góp máy',
    description: 'Góp sức máy cho mạng lưới & nhận thưởng',
    icon: 'lightning-bolt',
    // Chưa có PNG nhân vật riêng cho Kết đèn — dùng tạm ảnh scan (fallback icon vẫn hiện).
    // TODO(thiết kế): bổ sung assets/images/modules/lamp-fi.png.
    image: require('../../assets/images/modules/scan-fi.png'),
    bgDark: '#C47F0D', // lampnet.primaryDeep (giữ nhất quán catalog card — bgDark hex thô như các entry khác)
    routeName: 'JoinHome',
    available: true,
  },
];

export { TRACE_THEME, CHAT_THEME, WORK_THEME, LAMPNET_THEME };
