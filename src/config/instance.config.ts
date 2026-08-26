// config/instance.config.ts
//
// KHAI BÁO INSTANCE (declarative thuần — YC-3, INTEGRATION-STANDARD §7.1).
// Đây là nơi DUY NHẤT quyết định "base SuperApp này chạy thành app NÀO".
//
// ── ĐỔI LỚN 2026-08-26: tập module KHÔNG còn là biến của instance ───────────
// Chủ nhân chốt: từ nay có HAI app song song sinh từ cùng nền mã — **Aladin**
// (chuyên sâu việc làm: freelancer, nội trợ, văn phòng) và **CheckFarm** (ngành
// nông: nông dân, ngư dân, người làm vườn, nhà cung cấp vật tư, thương lái, nhà
// máy chế biến, cán bộ quản lý nông sản). Kèm một yêu cầu cứng:
//
//   > khi các module, platform đã được deploy thì trên các app này cũng vẫn sẽ
//   > có được những tính năng mà nó đang tích hợp.
//
// Bản trước có trường `enabledModules` cho mỗi instance tự chọn tập module, và
// một ví dụ bị chú thích nói thẳng ý đồ: *"bỏ 'work' để cho thấy một app suy
// biến nạp ÍT module hơn vẫn chạy"*. Trường đó chính là công tắc vi phạm yêu
// cầu trên, và nó hỏng CÂM: `collectModuleScreens` gặp module vắng chỉ
// `console.warn` rồi bỏ qua (`navigation/registry.ts:170-174`) — không đỏ,
// không chặn. Ngày SuperApp thêm module thứ năm mà một app quên khai, app đó
// lặng lẽ thiếu tính năng và không phép đo nào kêu.
//
// Nên tập module nay là HẰNG DẪN XUẤT từ `MODULE_REGISTRY` (`ALL_MODULES` bên
// dưới) — thêm module vào registry là CẢ HAI app có, không ai phải nhớ.
//
// Cái được phép khác nhau giữa hai app là **lớp trình bày**: tên, chủ đề màu,
// thứ tự và độ nổi bật của điểm vào. KHÔNG phải sự CÓ MẶT của module. Ranh giới
// đó là toàn bộ nội dung của tệp này.
//
// RÀNG BUỘC SỐNG CÒN (INV-SEC / QĐ-1) — giữ nguyên:
//   - Thuần GIÁ TRỊ: chuỗi id, mảng id, ref tới ThemeConfig đã compile-sẵn.
//   - KHÔNG biểu thức, KHÔNG eval, KHÔNG đường dẫn tải động.
//   - Offline-first: toàn bộ config + screen nhúng trong binary, dựng nav
//     KHÔNG phụ thuộc mạng.

import { APP_INSTANCE } from '@env';

import type { ThemeConfig } from '../theme/theme.config';
import { DEFAULT_THEME_CONFIG } from '../theme/theme.config';
import type { AdaptiveConfig } from '../theme/adaptive';
import { DEFAULT_ADAPTIVE_CONFIG } from '../theme/adaptive';
// CỐ Ý import từ `moduleIds` chứ KHÔNG từ `registry`: registry import tĩnh mọi
// màn của mọi module, nên kéo nó vào đây là kéo cả cây component (và module
// native theo sau) vào mọi chỗ chỉ cần biết tên app.
import type { ModuleId } from '../navigation/moduleIds';
import { MODULE_IDS } from '../navigation/moduleIds';
import { SLOT_PRIORITY_DEFAULT, SLOT_PRIORITY_SHIPPER } from '../navigation/resolveVisibleTabs';

// ---------------------------------------------------------------------------
// TẬP MODULE — HẰNG, dùng chung cho MỌI app.
//
// Nguồn là `MODULE_IDS` (`navigation/moduleIds.ts`), và `registry.ts` khai
// `Record<ModuleId, RegistryEntry>` từ đúng kiểu đó — nên `tsc` canh hai bên
// khỏi lệch: thêm một id mà quên khai entry là ĐỎ, và ngược lại. Không có
// đường nào để một app "có id mà không có màn" hay ngược lại.
// ---------------------------------------------------------------------------
export const ALL_MODULES: ModuleId[] = [...MODULE_IDS];

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
  /** Định danh instance — PHẢI khớp khoá trong `INSTANCES`. */
  instanceId: string;

  /**
   * Tên app hiện cho người dùng. ĐÂY là nguồn tên duy nhất: `theme/index.ts`
   * lấy `brandName` từ đây thay vì từ hằng viết cứng trong `theme.config.ts`.
   * Trước đợt này trường `displayName` có 0 nơi đọc, còn `brandName` mặc định
   * lại là `'OriLife'` — tức app tên Aladin mà mọi chỗ hỏi tên thương hiệu đều
   * nhận về tên một nền tảng khác.
   */
  displayName: string;

  /**
   * Thứ tự + thành phần thanh tab dưới (trái → phải).
   *
   * Đây là TẬP ĐẦY ĐỦ các route CÓ THỂ lên thanh. Việc CHỌN ô nào hiển thị do
   * `resolveVisibleTabs` quyết lúc chạy. Module không lên thanh vẫn nạp đủ route
   * stack (tới được qua navigate/deep-link/cổng xoè) — KHÔNG biến mất.
   */
  tabs: TabSpec[];

  /** Tab mặc định khi vào khu đã-đăng-nhập. */
  initialTabRoute: string;

  /**
   * Thứ tự ưu tiên 3 ô dịch vụ {Farms, WorkHome, JoinHome} cho hai persona.
   *
   * ĐÂY là trục ĐƯỢC PHÉP khác nhau giữa hai app, và là trục quan trọng nhất.
   * `resolvePersona` (`resolveVisibleTabs.ts:63-64`) suy persona từ tín hiệu
   * NÔNG NGHIỆP (`farms`/`trees`/`fruits`). Người dùng Aladin — freelancer, nội
   * trợ, văn phòng — luôn có ba tín hiệu đó bằng 0, nên rơi vào persona `'new'`
   * và nhận thứ tự mặc định `['Farms', 'WorkHome', 'JoinHome']`: **app việc làm
   * đặt ô Trang trại trước ô Việc làm**. Đó không phải lỗi của resolver, mà là
   * hệ quả của việc bảng ưu tiên nằm ở tầng module dùng chung.
   */
  slotPriority: { default: string[]; shipper: string[] };

  /** Brand theme cho instance — wire qua setActiveThemeConfig() lúc bootstrap. */
  themeConfig: ThemeConfig;

  /**
   * Adaptive 2 cực (§7.2) — override cấp ADMIN của instance. 'auto' = để app tự
   * dò tier (thiết bị/mạng) + user vẫn được override. Wire qua
   * setActiveAdaptiveConfig() lúc bootstrap. Declarative thuần (QĐ-1).
   */
  adaptive: AdaptiveConfig;
}

// ===========================================================================
// ALADIN — chuyên sâu VIỆC LÀM.
//
// 5 ô. Home (host) đặt Ở GIỮA để khớp navbar khuyết-tròn (CurvedTabBar).
// ===========================================================================
export const ALADIN_INSTANCE: InstanceConfig = {
  instanceId: 'aladin',
  displayName: 'Aladin',
  tabs: [
    { kind: 'module', moduleId: 'chat' },
    { kind: 'module', moduleId: 'trace' },
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'work' },
    { kind: 'module', moduleId: 'join' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  // Việc làm lên trước — kể cả với người chưa có dữ liệu nào. Người mở Aladin
  // đến vì việc, không đến vì vườn.
  slotPriority: {
    default: ['WorkHome', 'JoinHome', 'Farms'],
    shipper: ['WorkHome', 'JoinHome', 'Farms'],
  },
  // `brandName` lấy từ chính `displayName` — trước đợt này theme mặc định trả
  // `'OriLife'`, tức app tên Aladin mà mọi chỗ hỏi tên thương hiệu đều nhận về
  // tên một NỀN TẢNG khác. OriLife là nền nhận diện, không phải tên app.
  themeConfig: { ...DEFAULT_THEME_CONFIG, brandName: 'Aladin' },
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
};

// ===========================================================================
// CHECKFARM — ngành nông.
//
// CÙNG tập module, cùng bộ route, cùng binary. Khác đúng ba thứ: tên, thứ tự ô,
// và chủ đề màu. Đó là toàn bộ khoảng cách được phép giữa hai app.
//
// ⚠️ KHÔNG thêm trường "bỏ bớt module" vào đây, dù có ai xin. Nếu CheckFarm
// không muốn ô Việc làm nổi trên thanh thì hạ nó xuống cuối `slotPriority` —
// module vẫn nạp, vẫn tới được qua cổng xoè và deep-link. "Đẩy ra khỏi thanh
// tab" và "không có trong app" là hai việc khác nhau, và chỉ việc đầu được phép.
// ===========================================================================
export const CHECKFARM_INSTANCE: InstanceConfig = {
  instanceId: 'checkfarm',
  displayName: 'CheckFarm',
  tabs: [
    { kind: 'module', moduleId: 'chat' },
    { kind: 'module', moduleId: 'trace' },
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'work' },
    { kind: 'module', moduleId: 'join' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  slotPriority: {
    default: SLOT_PRIORITY_DEFAULT,
    shipper: SLOT_PRIORITY_SHIPPER,
  },
  // [CHỜ nhà CheckFarm] bảng màu + biểu tượng riêng. Tới lúc đó dùng chung theme
  // để app dựng được và chạy được — CỐ Ý không bịa một bảng màu rồi để nó thành
  // mặc định không ai dám đổi.
  themeConfig: { ...DEFAULT_THEME_CONFIG, brandName: 'CheckFarm' },
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
};

// ---------------------------------------------------------------------------
// BẢNG INSTANCE — nguồn duy nhất cho bài kiểm bất biến và cho phép chọn lúc dựng.
// ---------------------------------------------------------------------------
export const INSTANCES: Record<string, InstanceConfig> = {
  [ALADIN_INSTANCE.instanceId]: ALADIN_INSTANCE,
  [CHECKFARM_INSTANCE.instanceId]: CHECKFARM_INSTANCE,
};

/**
 * Chọn instance theo id.
 *
 * Id LẠ thì NÉM, không rơi về mặc định. Rơi sạch ở đây nghĩa là dựng ra Aladin
 * rồi đem nộp cửa hàng dưới tên CheckFarm — một lỗi không có triệu chứng nào cho
 * tới khi người dùng mở app ra và thấy sai tên.
 *
 * Id RỖNG (biến chưa khai) thì về `aladin`: đó là ca máy lập trình viên chưa
 * dựng lại tệp biến môi trường, và ở đó ném là chặn đúng người không gây ra lỗi.
 * Đường DỰNG thì không rơi vào ca đó được — `APP_INSTANCE` nằm trong danh sách
 * đối chiếu của `.github/actions/rn-env` (bước so `import … from '@env'` với các
 * biến vừa ghi), nên bản dựng thiếu biến này ĐỎ trước khi ra tệp.
 */
export function resolveInstance(id: string | undefined | null): InstanceConfig {
  if (!id) return ALADIN_INSTANCE;
  const found = INSTANCES[id];
  if (!found) {
    throw new Error(
      `APP_INSTANCE='${id}' không có trong bảng INSTANCES. ` +
        `Giá trị hợp lệ: ${Object.keys(INSTANCES).join(' | ')}.`,
    );
  }
  return found;
}

/** Instance đang chạy — chốt lúc DỰNG, không đổi được lúc chạy. */
export const DEFAULT_INSTANCE: InstanceConfig = resolveInstance(APP_INSTANCE);

/**
 * Tập module của instance đang chạy.
 *
 * Giữ tên cũ để chỗ gọi không phải đổi, nhưng nay nó là HẰNG CHUNG chứ không
 * còn là lựa chọn của instance. Đừng khôi phục lại thành trường của
 * `InstanceConfig` — xem khối đầu tệp.
 */
export const ENABLED_MODULES: ModuleId[] = ALL_MODULES;
