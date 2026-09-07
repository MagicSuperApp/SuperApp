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
import { DEFAULT_THEME_CONFIG, CHECKFARM_THEME_CONFIG } from '../theme/theme.config';
import type { AdaptiveConfig } from '../theme/adaptive';
import { DEFAULT_ADAPTIVE_CONFIG } from '../theme/adaptive';
// CỐ Ý import từ `moduleIds` chứ KHÔNG từ `registry`: registry import tĩnh mọi
// màn của mọi module, nên kéo nó vào đây là kéo cả cây component (và module
// native theo sau) vào mọi chỗ chỉ cần biết tên app.
// Chỉ lấy KIỂU. `i18n/translate.ts:21` đã nhập ngược lại tệp này, nên một lần
// nhập có giá trị chạy sẽ thành vòng. `import type` bị xoá lúc biên dịch.
import type { LangCode } from '../i18n/types';
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

/**
 * Pháp nhân VẬN HÀNH app — tên, địa chỉ, hòm thư nhận khiếu nại về dữ liệu.
 *
 * Vì sao đây là trường của INSTANCE chứ không phải hằng dùng chung: hai app do
 * HAI pháp nhân khác nhau sở hữu. Trước đợt này `legal/policyContent.ts` giữ
 * một hằng `OPERATOR` viết cứng tên Aladin, nên trang "Điều khoản & Chính sách"
 * TRONG app CheckFarm nói rằng Aladin vận hành nó, kèm địa chỉ nhà riêng và hòm
 * thư cá nhân của chủ Aladin.
 *
 * Đó không phải lỗi thẩm mỹ. Người dùng CheckFarm muốn yêu cầu xoá dữ liệu của
 * mình sẽ viết thư tới pháp nhân không phát hành app họ đang cầm; và trang cửa
 * hàng thì ghi nhà phát hành là CheckFarm. Hai văn bản mâu thuẫn, mỗi văn bản ở
 * một nơi, nên mâu thuẫn không bao giờ lộ ra cho tới lúc có tranh chấp thật.
 *
 * `address`/`contact` cho phép `null`: pháp nhân đang thành lập thì CHƯA CÓ, và
 * bịa ra một địa chỉ còn tệ hơn để trống. Trang chính sách hiện thẳng "chưa
 * công bố" thay vì mượn địa chỉ của pháp nhân khác. Bài kiểm
 * `instanceParity.test.ts` gọi tên app nào còn `null` là app CHƯA nộp cửa hàng
 * được — để chỗ trống đó không lặng lẽ đi lên Play.
 */
export interface OperatorInfo {
  /** Tên pháp nhân, tiếng Việt. */
  name: string;
  /** Tên pháp nhân tiếng Anh, nếu khác. Thiếu thì bản tiếng Anh dùng `name`. */
  nameEn?: string;
  address: string | null;
  addressEn: string | null;
  /** Hòm thư nhận yêu cầu về dữ liệu cá nhân. */
  contact: string | null;
}

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
   * Câu khẩu hiệu, đủ bốn thứ tiếng. Hiện MỘT chỗ: dưới tên app ở màn chào
   * (`screens/OnboardingScreen.tsx`) — chỗ người dùng nhìn một lần lúc mới cài.
   *
   * VÌ SAO NẰM Ở ĐÂY chứ không phải một khoá trong `i18n/keys`: khẩu hiệu là
   * câu app tự nói về MÌNH, nên nó thuộc danh tính instance chứ không phải chuỗi
   * dùng chung. Trước đó nó là khoá `onboarding.tagline` — "Một ứng dụng, bốn
   * việc" — và CheckFarm cũng hiện đúng câu định vị của Aladin. Cùng một lỗi với
   * `onboarding.title` đã gỡ trước đó (xem `i18n/keys/onboarding.ts`), chỉ khác
   * là lần này câu không mang tên app nên không phép kiểm nào bắt được.
   *
   * BẮT BUỘC, không `?`: app thứ ba quên khai thì `tsc` đỏ. Để tuỳ chọn kèm một
   * đường rơi về câu của app khác là dựng lại đúng cái vừa gỡ.
   */
  tagline: Record<LangCode, string>;

  /**
   * Pháp nhân vận hành app này. Phải khớp `operator` trong
   * `instances/<mã>/instance.json` — có bài kiểm đối chiếu.
   */
  operator: OperatorInfo;

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
  // Chuyển nguyên văn từ khoá `onboarding.tagline` đã gỡ — không viết lại câu
  // thương hiệu, chỉ dời chỗ ở.
  tagline: {
    vi: 'Một ứng dụng, bốn việc — và danh tính là của chính anh chị.',
    en: 'One app, four jobs — and the identity stays yours.',
    zh: '一个应用，四件事 —— 身份始终属于你自己。',
    ja: '一つのアプリで四つの仕事 — 本人確認はあなたのものです。',
  },
  operator: {
    name: 'Aladin',
    address:
      'Số nhà 77, đường Chà Là 11, Khu đô thị Vinhomes Ocean Park 2, Xã Nghĩa Trụ, Tỉnh Hưng Yên, Việt Nam',
    addressEn:
      'No. 77, Cha La 11 Street, Vinhomes Ocean Park 2, Nghia Tru Commune, Hung Yen Province, Vietnam',
    contact: 'aladincontract@gmail.com',
  },
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
  // Bốn chuỗi do nhà CheckFarm cấp (khoá `khau_hieu` bên kho cấu hình của họ,
  // 07/09/2026). Cùng luật với địa chỉ pháp nhân bên dưới: câu chữ là của
  // CheckFarm, KHÔNG suy ra từ kho này và không sửa hộ.
  tagline: {
    vi: 'Truy xuất từ nguồn — Nâng tầm nông sản',
    en: 'Trace the Source — Elevate the Produce',
    zh: '追溯源头，提升农产价值',
    ja: '源流をたどり、農産物の価値を高める',
  },
  // Pháp nhân ĐỘC LẬP — không phải DDC Holdings, không phải DDC DigiTech, không
  // phải Aladin Contract. Aladin Contract phát triển theo đơn đặt hàng và KHÔNG
  // giữ quyền sở hữu hay quyền kiểm soát thông tin nào.
  //
  // Ba trường dưới từng là `null` kèm ghi chú "công ty đang thành lập, chưa có
  // địa chỉ đăng ký". Nhà CheckFarm cấp đủ ngày 01/09/2026, nên `null` không
  // còn đúng.
  //
  // Câu cấm đi kèm thì GIỮ NGUYÊN hiệu lực, vì nó mới là phần đắt: KHÔNG điền
  // tạm địa chỉ của Aladin vào đây. Ba chuỗi này là địa chỉ của CheckFarm, do
  // nhà CheckFarm cấp — không suy ra từ kho này.
  operator: {
    name: 'Công ty Cổ phần CheckFarm',
    nameEn: 'CheckFarm Inc',
    address: '404 Nguyễn Thái Bình, Phường Tân Lập, tỉnh Đắk Lắk, Việt Nam',
    addressEn: '404 Nguyen Thai Binh, Tan Lap Ward, Dak Lak Province, Viet Nam',
    contact: 'contact@checkfarm.com',
  },
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
  // Bảng màu do chính nhà CheckFarm chốt và gửi sang (không phải bản bịa ở đây
  // rồi thành mặc định không ai dám đổi). Giá trị + lý do từng ràng buộc nằm ở
  // `theme/theme.config.ts`; ràng buộc nặng nhất là màu nhãn `#298A4A` TRƯỢT
  // ngưỡng tương phản AA cho chữ cỡ thường, nên nó chỉ đi vào chỗ là hình.
  themeConfig: CHECKFARM_THEME_CONFIG,
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
