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
  CHAT_THEME,
  TRACE_THEME,
  WORK_THEME,
  LAMPNET_THEME,
} from '../theme';
import { TRACE_SCAN_ROUTE_NAME } from './traceScan';

import { tk } from '../i18n/keys';
// An toàn về chiều phụ thuộc: tệp này đã đứng SAU `instance.config`, còn
// `resolveVisibleTabs` thì không biết gì về instance — xem chú thích ở `slotPriority`.
import { DEFAULT_INSTANCE, ENABLED_MODULES } from '../config/instance.config';
import { moduleOwningRoute } from './moduleCatalog';
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
    { icon: 'tree', label: 'Quét cây', route: 'TreeIdentity' },
    // "Quét con vật" phải mở màn CÓ MÁY ẢNH. Trước đây nó trỏ `AnimalManagement`
    // — màn DANH SÁCH, không camera — nên cả nhánh vật nuôi không có lối vào nào:
    // `AnimalIdentity` có trong navigator mà 0 lời gọi `navigate`, còn `AnimalEnroll`
    // chỉ được gọi từ trong `AnimalIdentity` nên chết theo (sổ nợ H-13).
    // KHÔNG kèm params: cổng chỉ biết SỐ ĐẾM vườn, không biết mã vườn nào. Màn đích
    // tự chọn vườn (mẫu TreeEnrollScreen). Chuỗi bịa `'default'` đã từng ghi rác lên
    // máy chủ ở nhánh chăm sóc — đừng lặp lại.
    { icon: 'paw', label: 'Quét con vật', route: 'AnimalIdentity' },
    { icon: 'format-list-bulleted', label: 'Sổ vật nuôi', route: 'AnimalManagement' },
    // KHÔNG kèm `targetId: 'default'`/`farmId: 'default'` nữa. Chuỗi đó không phải mã
    // vườn — nó là mã BỊA, và màn quét chỉ chặn mã RỖNG nên nó lọt qua, rồi nhật ký
    // thuốc được POST thật lên máy chủ dưới một mã không thuộc về ai. Không màn nào
    // đọc lại được (mọi màn đọc theo `farm.id`/`tree.id` thật). Cách ly là thứ chặn
    // thu hoạch và chặn bán, nên ghi hụt ở đây đắt hơn hẳn chỗ khác.
    // Bỏ params đi thì `targetId` về rỗng và cổng chặn của màn quét bắt đúng ca này.
    { icon: 'syringe', label: 'Quét nhãn thuốc', route: 'CareScan' },
    { icon: 'warehouse', label: 'Thêm vườn', route: 'FarmDetail' },
  ],
  // Chat (proofchat): thông báo.
  // KHÔNG có mục ví. `module.manifest.json` của proofchat ghi rõ chat KHÔNG
  // escrow/ví và `routes` chỉ khai ["ChatHome","ChatRoom"] — mục
  // 'Mở ví' → 'ProofChatWallet' ở đây là lối vào trái quyết định đó (issue #110).
  ChatHome: [
    { icon: 'bell', label: 'Thông báo', route: 'Notifications' },
  ],
};

// route service → màu thương hiệu (brand token). Host (Home) dùng accent nền.
const SERVICE_TINT: Record<string, string> = {
  [NEO_CENTER]: COLORS.accent,        // Home
  [NEO_LEFT]: CHAT_THEME.primary, // Chat
  Farms: TRACE_THEME.primary,          // Farm
  WorkHome: WORK_THEME.primary,        // Work
  JoinHome: LAMPNET_THEME.primary,     // Join
  [NEO_RIGHT]: COLORS.accentDeep,      // Me (không lên cung — xem dưới)
};

// Trace-quét (§3) — màn QUÉT TIÊU DÙNG (TraceScan) đã dựng → item hiện trong cổng
// (đúng "một mục trong toolbox nút giữa" §3).
export const TRACE_SCAN_ROUTE: string | null = TRACE_SCAN_ROUTE_NAME;

/**
 * Route này có tới được trong app ĐANG DỰNG không?
 *
 * Route của host (Home/Account) luôn có. Route của một module chỉ có khi app
 * bật module đó — từ 2026-09-10 app chọn được tập module (`InstanceConfig.modules`).
 *
 * Vì sao phải lọc Ở ĐÂY chứ không chỉ ở thanh tab: thanh tab đã tự bỏ module tắt
 * (`navigation/index.tsx:213`), nhưng cổng xoè thì dựng từ `slotPriority` —
 * một bảng THỨ TỰ ROUTE, không biết gì về module. App tắt `work` mà bảng vẫn
 * liệt `WorkHome` thì cổng hiện đúng mục đó, người dùng bấm, và điều hướng tới
 * một route chưa đăng ký. Không màn nào hiện, không lỗi nào ném — đúng loại
 * hỏng CÂM mà cơ chế chọn module sinh ra để tránh, nên nó không được phép tự
 * mở lại ở đây.
 */
function routeIsReachable(route: string): boolean {
  const owner = moduleOwningRoute(route);
  return owner === null || ENABLED_MODULES.includes(owner);
}

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
  // Rót bảng ưu tiên CỦA APP ĐANG CHẠY vào. Trước bản này `slotPriority` trả hằng
  // của nền dùng chung, nên `InstanceConfig.slotPriority` có 0 người đọc: hai app
  // khai thứ tự khác nhau mà ra CÙNG một thanh điều hướng — hỏng kiểu trông như
  // đã cấu hình được, và không bài kiểm nào đỏ vì không có gì để đỏ.
  const order = [NEO_LEFT, ...slotPriority(persona, DEFAULT_INSTANCE.slotPriority)].filter(
    routeIsReachable,
  );
  const items = order.map(serviceItem);

  if (TRACE_SCAN_ROUTE && routeIsReachable(TRACE_SCAN_ROUTE)) {
    const trace: GateItem = {
      key: 'svc-trace-scan',
      icon: 'qrcode',
      // Mục NỔI BẬT, to nhất, nằm CHÍNH GIỮA cung — và trước đây nhãn là chuỗi
      // rỗng, nên thứ dễ thấy nhất trên cổng lại là thứ duy nhất không có tên.
      label: tk('trace.gate.scan'),
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
