// config/instance.config.ts
//
// KHAI BÁO INSTANCE (declarative thuần — YC-3, INTEGRATION-STANDARD §7.1).
// Đây là nơi DUY NHẤT quyết định "base SuperApp này chạy thành app NÀO":
// bật/tắt module + thứ tự tab + brand theme. KHÔNG sửa code navigator để
// ra app khác — chỉ đổi object dưới đây (hoặc trỏ DEFAULT_INSTANCE sang
// instance khác lúc bootstrap).
//
// RÀNG BUỘC SỐNG CÒN (INV-SEC / QĐ-1):
//   - Thuần GIÁ TRỊ: chuỗi id, mảng id, ref tới ThemeConfig đã compile-sẵn.
//   - KHÔNG biểu thức, KHÔNG eval, KHÔNG đường dẫn tải động.
//   - Mọi moduleId ở đây phải có mặt trong MODULE_REGISTRY (compile-sẵn binary).
//   - Offline-first: toàn bộ config + screen nhúng trong binary, dựng nav
//     KHÔNG phụ thuộc mạng.

import type { ThemeConfig } from '../theme/theme.config';
import { DEFAULT_THEME_CONFIG } from '../theme/theme.config';
import type { AdaptiveConfig } from '../theme/adaptive';
import { DEFAULT_ADAPTIVE_CONFIG } from '../theme/adaptive';
import type { ModuleId } from '../navigation/registry';

// ---------------------------------------------------------------------------
// Một entry tab trong thanh điều hướng dưới (bottom tab).
//   - kind 'host'   : screen do HOST shell sở hữu (Home/Account...) — KHÔNG
//                     thuộc module nào; component lấy từ HOST_TABS bên dưới.
//   - kind 'module' : tab nạp từ entrypoint của module qua MODULE_REGISTRY.
// Cả hai chỉ tham chiếu bằng ĐỊNH DANH (route/moduleId) — không nhúng component
// vào config (component import tĩnh ở registry / navigator).
// ---------------------------------------------------------------------------
export type TabSpec =
  | { kind: 'host'; route: string }
  | { kind: 'module'; moduleId: ModuleId };

export interface InstanceConfig {
  // Nhãn instance (hiển thị/log).
  instanceId: string;
  displayName: string;

  // Module được BẬT cho instance này. Thứ tự không quan trọng ở đây — thứ tự
  // hiển thị do `tabs` quyết. Module bật mà không lên tab vẫn nạp route stack
  // (tới được qua navigate/deep-link), chỉ không có nút tab.
  enabledModules: ModuleId[];

  // Thứ tự + thành phần thanh tab dưới (trái → phải).
  tabs: TabSpec[];

  // Tab mặc định khi vào khu đã-đăng-nhập.
  initialTabRoute: string;

  // Brand theme cho instance — wire qua setActiveThemeConfig() lúc bootstrap.
  themeConfig: ThemeConfig;

  // Adaptive 2 cực (§7.2) — override cấp ADMIN của instance. 'auto' = để app
  // tự dò tier (thiết bị/mạng) + user vẫn được override. Wire qua
  // setActiveAdaptiveConfig() lúc bootstrap. Declarative thuần (QĐ-1).
  adaptive: AdaptiveConfig;
}

// ===========================================================================
// DEFAULT = ALADIN (parity tuyệt đối với nav hard-import cũ).
// 5 tab. Thứ tự đặt Home (host) Ở GIỮA để khớp navbar khuyết-tròn (CurvedTabBar):
// nút Home tròn nổi nằm lọt vào khuyết giữa thanh, 2 tab mỗi bên cân đối:
// ProofChatHome (proofchat) · Farms (trace) · Home (host) · WorkHome (work) ·
// Account (host). initialRouteName='Home'.
// ===========================================================================
export const ALADIN_INSTANCE: InstanceConfig = {
  instanceId: 'aladin',
  displayName: 'Aladin',
  enabledModules: ['trace', 'proofchat', 'work', 'orgmint'],
  tabs: [
    { kind: 'module', moduleId: 'proofchat' },
    { kind: 'module', moduleId: 'trace' },
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'work' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  themeConfig: DEFAULT_THEME_CONFIG,
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
};

// ---------------------------------------------------------------------------
// VÍ DỤ TonFarm (trace + chat + farm, KHÔNG work) — MINH HOẠ, KHÔNG kích hoạt.
// Cùng base binary, chỉ đổi tập module + tab + brand. KHÔNG sửa navigator.
// (farm = module SG-future; ở đây minh hoạ bằng 'trace'+'proofchat' đang có,
//  và bỏ 'work' để cho thấy một app suy biến nạp ÍT module hơn vẫn chạy.)
//
// export const TONFARM_INSTANCE: InstanceConfig = {
//   instanceId: 'tonfarm',
//   displayName: 'TonFarm',
//   enabledModules: ['trace', 'proofchat'],
//   tabs: [
//     { kind: 'host', route: 'Home' },
//     { kind: 'module', moduleId: 'trace' },
//     { kind: 'module', moduleId: 'proofchat' },
//     { kind: 'host', route: 'Account' },
//   ],
//   initialTabRoute: 'Home',
//   themeConfig: {
//     brandName: 'TonFarm',
//     // app: { accent: '#1F8A4C' },   // chỉ override GIÁ TRỊ token, không logic
//   },
// };
// ---------------------------------------------------------------------------

// Instance đang chạy. Đổi dòng này (trỏ sang TONFARM_INSTANCE...) để base
// SuperApp sinh app khác — KHÔNG đụng navigator/registry/screen.
export const DEFAULT_INSTANCE: InstanceConfig = ALADIN_INSTANCE;
