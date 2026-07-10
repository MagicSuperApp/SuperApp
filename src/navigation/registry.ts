// navigation/registry.ts
//
// MODULE REGISTRY (YC-3) — ánh xạ moduleId → { manifest, screens, entrypoint }.
// Đây là KEYSTONE để 1 base sinh nhiều app: navigator KHÔNG còn liệt kê tay
// 28 screen; nó DUYỆT registry + instance.config để dựng nav.
//
// RÀNG BUỘC SỐNG CÒN (INV-SEC / QĐ-1 — INTEGRATION-STANDARD §1.2, §7.1):
//   - Screen components import TĨNH (compile-sẵn trong binary). KHÔNG dynamic
//     import / KHÔNG eval. Registry chỉ TẬP HỢP (collect) component đã import,
//     KHÔNG tải runtime.
//   - Manifest import tĩnh từ JSON (declarative thuần). Manifest cho biết
//     route/entrypoint/navSlot/icon; registry cung component cho từng route.
//   - Offline: tất cả nhúng binary; dựng nav không phụ thuộc mạng.
//
// Manifest `routes` là DANH SÁCH route name của module; với mỗi route phải có
// đúng một component trong `screens`. CONTRACT: keys(screens) === manifest.routes
// (đối chiếu bằng assertRouteParity() khi DEV để bắt lệch sớm).

import type { ComponentType } from 'react';

// --- Manifests (declarative, import tĩnh) ---------------------------------
import traceManifest from '../modules/trace/module.manifest.json';
import proofchatManifest from '../modules/proofchat/module.manifest.json';
import workManifest from '../modules/work/module.manifest.json';
import orgMintManifest from '../modules/phoenixOrgMint/module.manifest.json';

// --- Trace screens (compile-sẵn) ------------------------------------------
import FarmListScreen from '../modules/trace/screens/FarmListScreen';
import DashboardScreen from '../modules/trace/screens/DashboardScreen';
import FarmDetailScreen from '../modules/trace/screens/FarmDetailScreen';
import TreeDetailScreen from '../modules/trace/screens/TreeDetailScreen';
import ActivityScreen from '../modules/trace/screens/ActivityScreen';

// --- ProofChat screens ----------------------------------------------------
import ProofChatHomeScreen from '../modules/proofchat/features/chat/screens/ProofChatHomeScreen';
import ProofChatRoomScreen from '../modules/proofchat/features/chat/screens/ChatScreen';

// --- Work screens ---------------------------------------------------------
import WorkHomeScreen from '../modules/work/screens/WorkHomeScreen';
import JobDetailScreen from '../modules/work/screens/JobDetailScreen';
import PostJobScreen from '../modules/work/screens/PostJobScreen';
import WorkerProfileScreen from '../modules/work/screens/WorkerProfileScreen';

// --- OrgDID + mint LAMP screens --------------------------------------------
import OrgMintHomeScreen from '../modules/phoenixOrgMint/screens/OrgMintHomeScreen';
import OrgMintCreateScreen from '../modules/phoenixOrgMint/screens/OrgMintCreateScreen';
import OrgMintConfirmScreen from '../modules/phoenixOrgMint/screens/OrgMintConfirmScreen';
import OrgMintResultScreen from '../modules/phoenixOrgMint/screens/OrgMintResultScreen';

export type ScreenComponent = ComponentType<any>;

// Hình dạng tối thiểu của manifest mà registry/navigator tiêu thụ.
// (Manifest JSON còn nhiều trường khác — capabilities/billing... — không cần ở
//  tầng nav nên không khai ở đây.)
export interface ModuleManifest {
  moduleId: string;
  displayName: { vi?: string; en?: string };
  integrationKind: 'silent' | 'feature';
  entrypoint: string;
  route: string;
  icon: { name: string; colorToken: string };
  navSlot: 'tab' | 'hub' | 'primary' | 'secondary' | 'contextual';
  routes: string[];
}

export interface RegistryEntry {
  manifest: ModuleManifest;
  // route name -> component (compile-sẵn). Phủ đúng manifest.routes.
  screens: Record<string, ScreenComponent>;
}

// moduleId nội bộ (ngắn gọn cho instance.config) — KHÁC moduleId reverse-DNS
// trong manifest (magiclamp.trace). Map id ngắn ↔ entry.
export type ModuleId = 'trace' | 'proofchat' | 'work' | 'orgmint';

export const MODULE_REGISTRY: Record<ModuleId, RegistryEntry> = {
  trace: {
    manifest: traceManifest as ModuleManifest,
    screens: {
      // manifest.routes: ["Farms","Dashboard","FarmDetail","TreeDetail","Activity"]
      Farms: FarmListScreen, // entrypoint tab Trace = FarmList (route 'Farms')
      Dashboard: DashboardScreen,
      FarmDetail: FarmDetailScreen,
      TreeDetail: TreeDetailScreen,
      Activity: ActivityScreen,
    },
  },
  proofchat: {
    manifest: proofchatManifest as ModuleManifest,
    screens: {
      // manifest.routes: ["ProofChatHome","ProofChatRoom"]
      ProofChatHome: ProofChatHomeScreen,
      ProofChatRoom: ProofChatRoomScreen,
    },
  },
  work: {
    manifest: workManifest as ModuleManifest,
    screens: {
      // manifest.routes: ["WorkHome","JobDetail","PostJob","WorkerProfile"]
      WorkHome: WorkHomeScreen,
      JobDetail: JobDetailScreen,
      PostJob: PostJobScreen,
      WorkerProfile: WorkerProfileScreen,
    },
  },
  orgmint: {
    manifest: orgMintManifest as ModuleManifest,
    screens: {
      // manifest.routes: ["OrgMintHome","OrgMintCreate","OrgMintConfirm","OrgMintResult"]
      OrgMintHome: OrgMintHomeScreen,
      OrgMintCreate: OrgMintCreateScreen,
      OrgMintConfirm: OrgMintConfirmScreen,
      OrgMintResult: OrgMintResultScreen,
    },
  },
};

// ---------------------------------------------------------------------------
// Đối chiếu DEV: keys(screens) phải khớp manifest.routes (không thiếu/không dư).
// Bắt lệch tên route sớm (vd manifest đổi route mà quên thêm component).
// Gọi ở bootstrap khDev; no-op khi __DEV__ false.
// ---------------------------------------------------------------------------
export function assertRouteParity(): void {
  (Object.keys(MODULE_REGISTRY) as ModuleId[]).forEach((id) => {
    const { manifest, screens } = MODULE_REGISTRY[id];
    const declared = [...manifest.routes].sort();
    const provided = Object.keys(screens).sort();
    const missing = declared.filter((r) => !provided.includes(r));
    const extra = provided.filter((r) => !declared.includes(r));
    if (missing.length || extra.length) {
      console.warn(
        `[registry] route parity lệch cho '${id}' (${manifest.moduleId}): ` +
          `thiếu component=[${missing.join(',')}] dư component=[${extra.join(',')}]`,
      );
    }
    // entrypoint phải nằm trong routes + có component.
    if (!screens[manifest.entrypoint]) {
      console.warn(
        `[registry] entrypoint '${manifest.entrypoint}' của '${id}' không có component khớp.`,
      );
    }
  });
}

// Tập hợp TẤT CẢ (route, component) của các module được bật — để navigator
// đăng ký vào Stack. Trả mảng phẳng, ổn định theo thứ tự enabledModules.
export function collectModuleScreens(
  enabledModules: ModuleId[],
): Array<{ moduleId: ModuleId; route: string; component: ScreenComponent }> {
  const out: Array<{ moduleId: ModuleId; route: string; component: ScreenComponent }> = [];
  enabledModules.forEach((id) => {
    const entry = MODULE_REGISTRY[id];
    if (!entry) {
      console.warn(`[registry] enabledModules tham chiếu moduleId chưa đăng ký: '${id}'`);
      return;
    }
    Object.entries(entry.screens).forEach(([route, component]) => {
      out.push({ moduleId: id, route, component });
    });
  });
  return out;
}

// Lấy entrypoint (route + component) của một module — dùng dựng tab.
export function getModuleEntrypoint(
  moduleId: ModuleId,
): { route: string; component: ScreenComponent; title: string; icon: string } | null {
  const entry = MODULE_REGISTRY[moduleId];
  if (!entry) {
    console.warn(`[registry] getModuleEntrypoint: moduleId chưa đăng ký: '${moduleId}'`);
    return null;
  }
  const { manifest, screens } = entry;
  const route = manifest.entrypoint;
  const component = screens[route];
  if (!component) {
    console.warn(
      `[registry] entrypoint '${route}' của '${moduleId}' thiếu component — tab sẽ bị bỏ.`,
    );
    return null;
  }
  return {
    route,
    component,
    title: manifest.displayName?.vi ?? manifest.displayName?.en ?? route,
    icon: manifest.icon?.name ?? 'view-dashboard-outline',
  };
}
