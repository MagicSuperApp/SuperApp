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
// ── ĐỔI LẠI 2026-09-10: app CHỌN được module, qua một lời khai ──────────────
// Chủ sở hữu bẻ lại hướng: nền tảng sẽ có hàng trăm module, và mỗi doanh nghiệp
// dựng app riêng chỉ cần một phần trong đó. Bắt họ nhận hết là bắt họ phát hành
// một app đầy tính năng không liên quan tới ngành của họ.
//
// Lệnh cấm ở trên KHÔNG sai lúc nó được viết — chỗ hỏng nó chỉ ra là thật. Cái
// sai là cách chữa: cấm hẳn thay vì làm hai ca phân biệt được. Bản này giữ
// nguyên chẩn đoán và đổi thuốc.
//
// Trường `modules: 'all' | ModuleId[]` (xem `InstanceConfig` bên dưới). `'all'`
// là lời khai "app này lấy cả sổ, kể cả module thêm sau" — nhờ nó, "cố ý không
// lấy" và "quên khai" thôi cho ra cùng một dữ liệu, và phép kiểm bắt được ca
// thứ hai. Danh sách để bấm chọn ở `navigation/moduleCatalog.ts`.
//
// Hai app hiện tại đều khai `'all'`, nên bản này KHÔNG đổi hành vi một bit nào —
// nó chỉ mở đường. Việc chọn module là quyền của kho app từng doanh nghiệp.
//
// Cái được phép khác nhau giữa hai app: tên, chủ đề màu, thứ tự và độ nổi bật
// của điểm vào — và nay cả TẬP module. Ranh giới đó là nội dung của tệp này.
//
// RÀNG BUỘC SỐNG CÒN (INV-SEC / QĐ-1) — giữ nguyên:
//   - Thuần GIÁ TRỊ: chuỗi id, mảng id, ref tới ThemeConfig đã compile-sẵn.
//   - KHÔNG biểu thức, KHÔNG eval, KHÔNG đường dẫn tải động.
//   - Offline-first: toàn bộ config + screen nhúng trong binary, dựng nav
//     KHÔNG phụ thuộc mạng.

import { APP_INSTANCE } from '@env';
import type { ImageSourcePropType } from 'react-native';
import type { AnimationObject } from 'lottie-react-native';

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
/**
 * Nguồn cho `LottieView` — KHÁC `ImageSourcePropType`.
 *
 * Tách kiểu chứ không dùng chung: `lottie-react-native` không nhận id tài sản
 * dạng SỐ mà Metro cấp cho ảnh. Khai chung một kiểu thì `tsc` đỏ ở chỗ dùng chứ
 * không đỏ ở chỗ khai — tức lỗi hiện ra xa nơi gây ra nó.
 */
export type LottieSource = string | AnimationObject | { uri: string };

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

  /**
   * Mã app mà app này ĐANG MƯỢN pháp nhân — khai tường minh khi hai app cùng
   * một pháp nhân vận hành.
   *
   * VÌ SAO PHẢI KHAI thay vì cứ để trùng: chép nhầm khối `operator` của app cũ
   * sang app mới cho ra ĐÚNG cùng một trạng thái dữ liệu với việc mượn có chủ ý.
   * Không có trường này thì phép kiểm chỉ còn hai đường, và cả hai đều tệ — cấm
   * trùng (chặn cả ca hợp lệ) hoặc cho trùng (không bắt được ca chép nhầm). Khai
   * ra thì ca chép nhầm vẫn đỏ, vì bản chép không mang lời khai.
   *
   * Không cho bắc cầu: app được mượn phải tự đứng tên, không được lại đi mượn
   * app thứ ba.
   */
  sharedWith?: string;

  /**
   * Pháp nhân sẽ NHẬN CHUYỂN GIAO app này. Bắt buộc có khi `sharedWith` có.
   *
   * Đây là chỗ ghi nợ, và nó nằm trong dữ liệu chứ không nằm trong chú thích:
   * một dòng chú thích "tạm thời, chuyển giao sau" già đi lặng lẽ và không phép
   * kiểm nào đọc được nó. Trường này thì đọc được — nên ngày pháp nhân kia có
   * tài khoản cửa hàng riêng, chỗ cần sửa tự chỉ ra chính nó.
   */
  transferTo?: {
    name: string;
    nameEn?: string;
    /** Ngày bắt đầu mượn, dạng YYYY-MM-DD. */
    since: string;
  };
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
   * Dấu thương hiệu hiện TRONG app — khác biểu tượng ngoài màn hình chính của
   * điện thoại (thứ đó do `instances/<mã>/ios|android/` lo, tầng native).
   *
   * Hiện 4 chỗ: đầu màn (`components/AppHeader.tsx`), màn chọn ngôn ngữ, màn
   * chào, màn đăng nhập — tức mọi màn người dùng gặp trước khi đăng nhập, cộng
   * thanh trên cùng của mọi màn sau đó.
   *
   * VÌ SAO PHẢI LÀ TRƯỜNG CHỨ KHÔNG PHẢI MỘT TỆP DÙNG CHUNG: trước đợt này cả
   * bốn chỗ đều viết `require('../../assets/images/logo.png')`, một tệp duy
   * nhất, là dấu của **Aladin**. Nên app CheckFarm — pháp nhân khác, hồ sơ cửa
   * hàng khác — đeo dấu Aladin ở bốn màn. Đó không phải lỗi thẩm mỹ: cửa hàng
   * đọc việc một app mang nhận diện của app khác là dấu hiệu nhái, và chủ sở
   * hữu nêu thẳng rủi ro bị đánh dấu rác.
   *
   * Và chỗ hỏng thật nằm ở SỐ BỐN: gỡ dấu lạ ra khỏi một app đáng lẽ là sửa một
   * dòng khai báo, hoá ra là đi tìm bốn lời gọi rải bốn tệp — không phép đo nào
   * nói cho biết đã hết. Trường này làm số đó về một.
   *
   * KIỂU là `ImageSourcePropType` chứ không phải chuỗi đường dẫn: Metro gói ảnh
   * theo `require` TĨNH lúc dựng. Một chuỗi đường dẫn sẽ biên dịch trót lọt rồi
   * hỏng lúc chạy — đúng hình dạng lỗi mà lời khai này sinh ra để chặn.
   * (Cũng khớp ràng buộc QĐ-1 ở đầu tệp: thuần giá trị, không tải động.)
   */
  logo: ImageSourcePropType;

  /**
   * Ảnh nền của TEM MÃ QR dán lên nông sản (`features/treeQr/TreeQrCode.tsx`).
   *
   * Tách khỏi `logo` vì hai thứ này rơi khác nhau khi sai, và một trong hai
   * KHÔNG thu hồi được: tem QR được IN RA và dán lên hàng thật. Tới 2026-09-10
   * nó là `assets/images/QR_BG.png` — mặt cười của Aladin trên nền xanh Aladin —
   * dùng chung cho mọi app. Nông dân CheckFarm in tem cho vườn mình và dán dấu
   * của một doanh nghiệp khác lên nông sản của họ; sửa mã sau đó không gỡ được
   * những tem đã in.
   *
   * Cổng `instanceLogo.test.ts` đời đầu KHÔNG bắt được chỗ này: nó liệt kê hai
   * đường dẫn ảnh mà đợt vá hôm ấy đã đụng tới, và `QR_BG.png` không nằm trong
   * hai đường đó. Đó là lý do cổng nay đảo chiều — mọi lời gọi tài sản đều phải
   * khai, chứ không phải vài đường bị cấm.
   */
  qrBackdrop: ImageSourcePropType;

  /**
   * Linh vật động (Lottie) — bong bóng trợ lý và lớp hướng dẫn lần đầu.
   * `null` = app này chưa có linh vật riêng; nơi dùng rơi về `logo` tĩnh.
   *
   * Cho phép `null` chứ không mượn linh vật của app khác: tới 2026-09-10 cả hai
   * app cùng phát `assets/animations/blink_logo.json` — mặt cười Aladin, nháy
   * mắt — ở bong bóng trợ lý nổi trên MỌI màn. Mượn thì CheckFarm có một linh
   * vật, nhưng là linh vật của nhà khác, đứng ở chỗ dễ thấy nhất trong app.
   */
  mascot: { blink: LottieSource; talking: LottieSource } | null;

  /**
   * Trang web của app này — đích của mục "Tìm hiểu thêm" ở màn chào, và là
   * bảng tên máy DUY NHẤT được mở trong khung nhúng (`utils/webLink.ts`).
   *
   * `null` khi app chưa có trang web. Mục "Tìm hiểu thêm" tự ẩn, và bảng tên
   * máy cho phép rỗng — tức không địa chỉ nào mở được trong app. Đó là chiều
   * đúng để rơi: khung nhúng có cầu nối JavaScript, nên "không mở được gì" an
   * toàn hơn "mở nhầm nhà ai đó".
   *
   * Trước đợt này địa chỉ là một hằng dùng chung viết cứng `https://aladin.work/`,
   * kèm bảng tên máy cũng viết cứng đúng tên đó. Nên app CheckFarm mở trang chủ
   * của một doanh nghiệp khác, ngay trong app, dưới thanh tiêu đề ghi tên máy
   * lạ. Không phải chuyện thẩm mỹ: người dùng CheckFarm không có lý do nào để
   * tin trang đó, mà app thì đang bảo họ rằng đây là nhà mình.
   *
   * `hosts` tách khỏi `url` vì một trang thường có hai tên (`x.vn` và `www.x.vn`)
   * và phép kiểm KHÔNG so theo phần đuôi — lý do ghi ở đầu `utils/webLink.ts`.
   */
  website: { url: string; hosts: readonly string[] } | null;

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

  /**
   * Module app này BẬT. Danh mục để bấm chọn ở `navigation/moduleCatalog.ts`.
   *
   * Hai hình dạng, và khác biệt giữa chúng là toàn bộ lý do trường này an toàn:
   *
   *   `'all'`     — app LÕI. Module mới vào sổ là app này TỰ CÓ, không ai phải
   *                 nhớ. Đây là hành vi của cả hai app hiện tại.
   *   `ModuleId[]` — app CHỌN LỌC. Module mới KHÔNG tự vào, và đó là ĐÚNG Ý của
   *                 doanh nghiệp đó, không phải chỗ họ quên khai.
   *
   * VÌ SAO KHÔNG dùng một mảng trần cho cả hai: trường `enabledModules` đời đầu
   * đúng là một mảng trần, và nó hỏng CÂM — không có cách nào phân biệt "app
   * này cố ý không lấy module mới" với "app này quên khai module mới". Hai ca
   * cho ra dữ liệu giống hệt nhau, nên không phép kiểm nào bắt được ca thứ hai.
   * `'all'` là lời khai làm hai ca đó tách ra.
   *
   * VÌ SAO KHÔNG bắt khai danh sách BỎ: với hàng trăm module sắp có, danh sách
   * âm bắt mọi app phải sửa mỗi lần sổ dài thêm — tức chính cái hỏng-câm trên,
   * chỉ đổi dấu. (Chủ sở hữu chốt hướng này 2026-09-10.)
   *
   * ⚠ Tắt module KHÔNG làm gói nhẹ đi — xem khối đầu `moduleCatalog.ts`.
   */
  modules: 'all' | ModuleId[];
}

/**
 * Tập module thực của một instance.
 *
 * Tách thành hàm (chứ không để chỗ gọi tự `=== 'all' ? … : …`) vì đây là chỗ
 * DUY NHẤT biết `'all'` nghĩa là gì. Có hai chỗ gọi trở lên tự diễn giải là có
 * hai chỗ trôi khỏi nhau.
 */
export function resolveModules(instance: InstanceConfig): ModuleId[] {
  return instance.modules === 'all' ? [...ALL_MODULES] : [...instance.modules];
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
  // NGUYÊN BYTE tệp `assets/images/logo.png` bốn màn vẫn đang dùng — đối chiếu
  // bằng `cmp` lúc chuyển. Aladin đã phát hành, nên đợt này không được đổi một
  // pixel nào của nó; cái đổi là CHỖ khai, không phải hình.
  logo: require('../../instances/aladin/brand/logo.png'),
  // NGUYÊN BYTE `assets/images/QR_BG.png` đang in trên tem — `cmp` xác nhận lúc
  // chuyển. Tem đã dán ngoài đời không sửa được, nên đợt này không đổi hình.
  qrBackdrop: require('../../instances/aladin/brand/qr-backdrop.png'),
  mascot: {
    blink: require('../assets/animations/blink_logo.json'),
    talking: require('../assets/animations/talking_logo.json'),
  },
  website: { url: 'https://aladin.work/', hosts: ['aladin.work', 'www.aladin.work'] },
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
  // App lõi: mọi module, kể cả module thêm sau. Đây là app do bên vận hành nền
  // tảng phát hành, nên nó phải là chỗ module mới chạy thật đầu tiên.
  modules: 'all',
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
  // ÂM BẢN chính thức của nhà CheckFarm — `Logo/bieu-tuong-app/icon-1024.png`,
  // thu về 256px. Không phải bản dựng ở kho này: màu nền đọc ra từ ảnh là
  // `#298A4A`, khớp đúng `iconBackground` họ khai trong `instance.json`.
  //
  // ⚠ KHÔNG lấy `instances/checkfarm/brand/icon-1024.png` làm dấu trong app: tệp
  // đó là lớp TIỀN CẢNH cho biểu tượng thích ứng Android — mực TRẮNG trên nền
  // TRONG SUỐT. Đặt lên nền sáng của app thì không thấy gì, mà cũng chẳng có lỗi
  // nào để lần ra.
  logo: require('../../instances/checkfarm/brand/logo.png'),
  // Dùng chính dấu của họ làm nền tem. Trước đợt này tem QR mọi app đều mang mặt
  // cười Aladin, mà tem thì IN RA rồi dán lên nông sản — sai ở đây không thu về được.
  qrBackdrop: require('../../instances/checkfarm/brand/qr-backdrop.png'),
  // CHƯA CÓ linh vật riêng. Để `null` thay vì mượn linh vật Aladin: bong bóng
  // trợ lý nổi trên MỌI màn, nên mượn là đặt dấu nhà khác vào chỗ dễ thấy nhất.
  // Nơi dùng rơi về `logo` tĩnh (`components/BlinkLogo.tsx`).
  mascot: null,
  // CHƯA CÓ, và để trống là cố ý — nhà CheckFarm chưa cấp địa chỉ trang web nào.
  // Điền tạm `aladin.work` vào đây là dựng lại đúng lỗi vừa gỡ, chỉ đổi chỗ viết.
  // Ngày họ có trang, thêm cả `url` lẫn `hosts` ở ĐÂY, không sửa `utils/webLink.ts`.
  website: null,
  // ⛔ PHÁP NHÂN VẬN HÀNH — đọc hết trước khi sửa, chỗ này đã đảo chiều một lần.
  //
  // Bản trước ghi CheckFarm là pháp nhân ĐỘC LẬP, kèm câu cấm "KHÔNG điền tạm
  // địa chỉ của Aladin vào đây". Câu cấm đó viết ra để chặn một lỗi CÓ THẬT: một
  // bản cũ của `legal/policyContent.ts` giữ hằng `OPERATOR` viết cứng tên Aladin,
  // nên trang chính sách TRONG app CheckFarm nói Aladin vận hành nó — mà lúc ấy
  // Aladin KHÔNG vận hành nó. Đó là khai sai.
  //
  // Chủ sở hữu quyết ngày 2026-09-10: app phát hành dưới pháp nhân **Aladin**,
  // chuyển giao cho CheckFarm Inc sau. Nên hôm nay Aladin vận hành nó thật, và
  // khai Aladin ở đây là khai ĐÚNG. Trạng thái dữ liệu giống hệt lỗi cũ; điều
  // phân biệt hai ca nằm ở `sharedWith` + `transferTo` — có lời khai thì là mượn
  // có chủ ý, không có thì là chép nhầm. `instanceParity.test.ts` đọc đúng chỗ đó.
  //
  // Câu cấm cũ vẫn còn hiệu lực dưới dạng đã sửa: KHÔNG điền địa chỉ của một
  // pháp nhân vào app mà pháp nhân đó không vận hành. Ngày chuyển giao xong thì
  // ba chuỗi dưới đây phải quay về địa chỉ CheckFarm — do nhà CheckFarm cấp, KHÔNG
  // suy ra từ kho này. Bản của họ (cấp 01/09/2026) nằm trong `transferTo` để
  // không phải đi hỏi lại.
  operator: {
    name: 'Aladin',
    address:
      'Số nhà 77, đường Chà Là 11, Khu đô thị Vinhomes Ocean Park 2, Xã Nghĩa Trụ, Tỉnh Hưng Yên, Việt Nam',
    addressEn:
      'No. 77, Cha La 11 Street, Vinhomes Ocean Park 2, Nghia Tru Commune, Hung Yen Province, Vietnam',
    contact: 'aladincontract@gmail.com',
    sharedWith: 'aladin',
    transferTo: {
      name: 'Công ty Cổ phần CheckFarm',
      nameEn: 'CheckFarm Inc',
      since: '2026-09-10',
    },
  },
  tabs: [
    { kind: 'module', moduleId: 'trace' },
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'join' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  // Bảng RIÊNG, không dùng chung `SLOT_PRIORITY_DEFAULT` — bảng chung liệt
  // `WorkHome`, mà `work` đã tắt ở app này. Để nguyên bảng chung thì cổng xoè
  // vẫn vẽ mục Việc làm, người dùng bấm, và điều hướng tới một route chưa đăng
  // ký: không màn nào hiện, không lỗi nào ném.
  //
  // Hai ô, và phải là hai — dù nó làm nút giữa LỆCH KHỎI TÂM. Đánh đổi này viết
  // ra vì chiều sai của nó im lặng, còn chiều đúng thì chỉ hơi xấu.
  //
  // Thanh tab dựng theo khuôn `[neo trái, slot, Home, slot, neo phải]`
  // (`resolveVisibleTabs.ts:150`), và neo trái là hằng `ChatHome` của nền, không
  // phải thứ app khai. Tắt `chat` là neo ấy rụng, nên hàng còn BỐN ô và nút giữa
  // rơi ở 37,5% chiều ngang thay vì 50%.
  //
  // Bản đầu của đợt này hạ xuống MỘT ô cho nút giữa về đúng tâm. Bộ kiểm bắt
  // được, và nó bắt đúng: `resolveGateItems` dựng cung từ CHÍNH bảng này, nên bỏ
  // `JoinHome` khỏi bảng là bỏ nó khỏi cả thanh tab LẪN cổng xoè — module `join`
  // vẫn khai bật, màn vẫn đăng ký, mà không lối nào tới. Đúng lớp hỏng "hàm có,
  // đường không có": không cổng kiểu nào bắt, không bài hàm thuần nào đỏ.
  //
  // Đường lấy được cả hai là cho app khai NEO của nó thay vì nhận hằng của nền.
  // Đó là sửa mã dùng chung nhiều app, không phải sửa cấu hình một app, nên nó
  // nằm ngoài đợt này.
  slotPriority: {
    default: ['Farms', 'JoinHome'],
    shipper: ['Farms', 'JoinHome'],
  },
  // Bảng màu do chính nhà CheckFarm chốt và gửi sang (không phải bản bịa ở đây
  // rồi thành mặc định không ai dám đổi). Giá trị + lý do từng ràng buộc nằm ở
  // `theme/theme.config.ts`; ràng buộc nặng nhất là màu nhãn `#298A4A` TRƯỢT
  // ngưỡng tương phản AA cho chữ cỡ thường, nên nó chỉ đi vào chỗ là hình.
  themeConfig: CHECKFARM_THEME_CONFIG,
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
  // App CHỌN LỌC, không phải app lõi — và lý do là một ràng buộc của cửa hàng,
  // không phải một sở thích về sản phẩm.
  //
  // `chat` (tin nhắn) và `work` (sàn việc làm) là NỘI DUNG DO NGƯỜI DÙNG TẠO.
  // Apple guideline 1.2 và Google đều đòi app có thứ đó phải có đủ bốn cơ chế:
  // lọc nội dung · nút báo cáo · chặn người dùng khác · liên hệ công khai. Đo
  // trên toàn bộ `src/` ngày 10/09/2026, và đo lại 12/09: ba cơ chế đầu có
  // **0 dòng** — không phải chưa đủ tốt, là chưa tồn tại. Thiếu là bị TỪ CHỐI
  // duyệt, không phải bị nhắc nhở.
  //
  // Chủ sở hữu chốt 12/09/2026: bản đầu tắt hai module đó để nộp được, rồi dựng
  // đủ bốn cơ chế và bật lại sau. Thứ tự đã bàn: chặn → báo cáo → lọc.
  //
  // Hai điều PHẢI biết kèm, vì cả hai đều dễ đọc nhầm theo chiều có lợi:
  //   · Tắt module KHÔNG làm gói nhẹ đi. `registry.ts` vẫn nhập tĩnh mọi màn;
  //     cái tắt là ĐƯỜNG TỚI (tab, mục cổng xoè, đăng ký route), không phải mã.
  //   · Ví KHÔNG tắt theo. Bốn màn ví khai thẳng ở tầng host, không mang
  //     `moduleId` nào (`navigation/index.tsx:1768-1774`), nên phép lọc
  //     `ENABLED_MODULES` không chạm tới chúng. Ô "Financial features" của
  //     Google vẫn phải khai CÓ.
  modules: ['trace', 'join'],
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
 * Tập module của instance đang chạy — DẪN XUẤT từ `DEFAULT_INSTANCE.modules`.
 *
 * Trước bản này nó là hằng chung `ALL_MODULES` và không app nào chọn được.
 * Xem `resolveModules` để biết vì sao hình dạng là `'all' | ModuleId[]` chứ
 * không phải một mảng trần.
 */
export const ENABLED_MODULES: ModuleId[] = resolveModules(DEFAULT_INSTANCE);
