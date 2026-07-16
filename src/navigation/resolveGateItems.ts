// navigation/resolveGateItems.ts
//
// SG9 §4 — CỔNG ĐIỀU HƯỚNG THỐNG NHẤT: nội dung cung xoè của NÚT GIỮA.
//
// Anh Aladin chốt (Q&A thi công): cung = SERVICE THUẦN (thay menu hành động SG4).
// Kéo nút giữa → xoè cung persona-adaptive gồm: Trang chủ · các service Chat/Farm/
// Work/Join · Me (+ Trace-quét khi §3 dựng route quét). TÁI DÙNG đúng component
// cung xoè của Tùng (HomeRadialOverlay) — chỉ ĐỔI NGUỒN mục, KHÔNG vẽ menu mới.
//
// Vì sao cổng cần ĐỦ service (kể cả service đang trên thanh): với persona mặc
// định, Join NẰM NGOÀI thanh (§2) → cổng là lối DUY NHẤT tới Join. Cho cả nhóm
// service vào cổng để "đổi-app chỉ tốn một cử chỉ trên MỘT cổng" (§0).
//
// Màu mục = brand token mỗi service (KHÔNG hardcode hex; §8 sẽ nâng "màu sống").

import { navNational, navIcon } from './navLabels';
import {
  resolvePersona,
  slotPriority,
  NEO_LEFT,
  NEO_CENTER,
  NEO_RIGHT,
  type FarmSignal,
  type UsageMap,
} from './resolveVisibleTabs';
import {
  COLORS,
  PROOFCHAT_THEME,
  TRACE_THEME,
  WORK_THEME,
  LAMPNET_THEME,
} from '../theme';
import { TRACE_SCAN_ROUTE_NAME } from './traceScan';

// Mục cổng — SHAPE tương thích bộ chạy của HomeRadialOverlay (key/icon/label/
// route/params) + `tint` trực tiếp (thay `group` của ActionDef SG4).
export interface GateItem {
  key: string;
  icon: string;
  label: string;
  tint: string;
  route: string;
  params?: Record<string, unknown>;
  /** Trace-quét = nổi bật, nằm GIỮA cung (§ điều chỉnh menu arc). */
  prominent?: boolean;
  /** Hành động NHANH của module → kéo tới mục này mở ARC MENU CON (tầng 2), thả
   *  trúng = CHẠY NGAY tính năng (điều hướng thẳng route đích). */
  subActions?: GateSubItem[];
}

// Một hành động nhanh trong arc con — có route ĐÍCH THẬT (chạy tính năng ngay).
export interface GateSubItem {
  key: string;
  icon: string;
  label: string;
  route: string;
  params?: Record<string, unknown>;
}

// Hành động nhanh theo module (anh Aladin liệt kê). Route ĐÍCH có thật trong
// navigator (host/module stack) → thả trúng là chạy tính năng, KHÔNG mở lại màn
// module. Thêm hành động = thêm 1 dòng; icon Material Community.
const SUB_ACTIONS: Record<string, Omit<GateSubItem, 'key'>[]> = {
  // Trang trại (trace): quét cây · quét con vật · quét nhãn thuốc · thêm vườn.
  Farms: [
    { icon: 'pine-tree', label: 'Quét cây', route: 'TreeIdentity' },
    { icon: 'paw', label: 'Quét con vật', route: 'AnimalManagement', params: { farmId: 'default' } },
    { icon: 'needle', label: 'Quét nhãn thuốc', route: 'CareScan', params: { targetType: 'farm', targetId: 'default', farmId: 'default' } },
    { icon: 'barn', label: 'Thêm vườn', route: 'FarmDetail' },
  ],
  // Chat (proofchat): mở ví · thông báo.
  ProofChatHome: [
    { icon: 'wallet-outline', label: 'Mở ví', route: 'ProofChatWallet' },
    { icon: 'bell-outline', label: 'Thông báo', route: 'Notifications' },
  ],
};

// route service → màu thương hiệu (brand token). Host (Home) dùng accent nền.
const SERVICE_TINT: Record<string, string> = {
  [NEO_CENTER]: COLORS.accent,        // Home
  [NEO_LEFT]: PROOFCHAT_THEME.primary, // Chat
  Farms: TRACE_THEME.primary,          // Farm
  WorkHome: WORK_THEME.primary,        // Work
  JoinHome: LAMPNET_THEME.primary,     // Join
  [NEO_RIGHT]: COLORS.accentDeep,      // Me (không lên cung — xem dưới)
};

// Trace-quét (§3) — màn QUÉT TIÊU DÙNG (TraceScan) đã dựng → item hiện trong cổng
// (đúng "một mục trong toolbox nút giữa" §3).
export const TRACE_SCAN_ROUTE: string | null = TRACE_SCAN_ROUTE_NAME;

function serviceItem(route: string): GateItem {
  const item: GateItem = {
    key: `svc-${route}`,
    icon: navIcon(route, true),
    label: navNational(route),
    tint: SERVICE_TINT[route] ?? COLORS.accent,
    route,
  };
  // Module có hành động nhanh → gắn subActions (kéo tới mục này mở arc con tầng-2).
  const acts = SUB_ACTIONS[route];
  if (acts && acts.length) {
    item.subActions = acts.map((a, i) => ({ ...a, key: `${route}#${i}` }));
  }
  return item;
}

/**
 * Danh sách MỤC CỔNG theo thứ tự vẽ trên cung (persona-adaptive).
 *
 * Điều chỉnh menu arc (anh Aladin chốt):
 *   - BỎ "Me/Tôi" khỏi cung (Me tới qua ô tab dưới).
 *   - BỎ "Trang chủ" khỏi cung (nhấn nút giữa đã về Home).
 *   - Trace-quét NỔI BẬT + nằm CHÍNH GIỮA cung.
 *   - Service có SubHome (Chat/Farm) mang `subApp` → tầng-2 arc con khi kéo tới.
 *
 * Thứ tự: Chat · [slot persona] — rồi CHÈN Trace vào GIỮA.
 *
 * @param farm  tín hiệu domain (state.farm) — suy persona
 * @param usage tần suất mở route (chưa có nguồn → {})
 */
export function resolveGateItems(farm: FarmSignal, usage: UsageMap = {}): GateItem[] {
  const persona = resolvePersona(farm, usage);
  // Service lên cung (KHÔNG gồm Me VÀ KHÔNG gồm Home): Chat · 3 slot persona.
  // Bỏ Home khỏi cung vì NHẤN 1 lần vào nút giữa đã về Trang chủ → mục Home thừa.
  const order = [NEO_LEFT, ...slotPriority(persona)];
  const items = order.map(serviceItem);

  if (TRACE_SCAN_ROUTE) {
    const trace: GateItem = {
      key: 'svc-trace-scan',
      icon: 'qrcode-scan',
      label: 'Quét truy xuất',
      tint: TRACE_THEME.primaryDeep,
      route: TRACE_SCAN_ROUTE,
      prominent: true,
    };
    // Chèn vào CHÍNH GIỮA cung (index giữa của danh sách sau khi thêm).
    const mid = Math.floor((items.length + 1) / 2);
    items.splice(mid, 0, trace);
  }
  return items;
}
