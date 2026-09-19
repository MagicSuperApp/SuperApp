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
   * Khẩu hiệu NGẮN — hiện dưới tên app ở màn đăng nhập
   * (`screens/LoginNetworkScreen.tsx`), ngay cạnh logo.
   *
   * Khác `tagline` ở ĐỘ DÀI, và độ dài ở đây là một ràng buộc bố cục chứ không
   * phải sở thích: dòng này được kéo giãn khoảng cách chữ cho RỘNG ĐÚNG BẰNG tên
   * app ở trên nó. Một câu dài thì bị thu nhỏ cỡ chữ để vừa bề ngang ấy, và tới
   * một lúc nó nhỏ tới mức không đọc được. Giữ dưới khoảng 22 ký tự.
   *
   * `tagline` không dùng lại được: bản của Aladin là *"Một ứng dụng, bốn việc —
   * và danh tính là của chính anh chị."*, một câu KỂ CHUYỆN dài gấp ba mức này.
   * Hai câu phục vụ hai chỗ khác nhau nên chúng là hai trường.
   *
   * BẮT BUỘC, không `?`, cùng lý do với `tagline`: app thứ ba quên khai thì
   * `tsc` đỏ, thay vì lặng lẽ mượn câu của app khác.
   */
  slogan: Record<LangCode, string>;

  /**
   * BA ĐỨC TÍNH — dòng nằm DƯỚI cả cụm nhận diện ở màn đăng nhập, giãn chữ cho
   * rộng đúng bằng cụm.
   *
   * Ba trường chữ, ba chỗ đứng, đừng gộp:
   *  · `tagline` — câu KỂ, dài, ở màn chào (`OnboardingScreen`).
   *  · `slogan`  — câu ngắn nằm SÁT DƯỚI CHỮ HIỆU, rộng đúng bằng chữ hiệu.
   *  · `virtues` — dòng này, nằm dưới CẢ CỤM, rộng đúng bằng cả cụm.
   *
   * Vì sao nó phải là trường riêng chứ không phải nửa sau của `tagline`: hai dòng
   * hiện CÙNG LÚC trên cùng một màn, nên dùng lại một chuỗi là in nó hai lần.
   *
   * Giữ ngắn — ba từ, cùng luật bố cục với `slogan`: dòng bị kéo giãn cho vừa bề
   * ngang cụm, câu càng dài thì cỡ chữ càng bị thu cho tới lúc không đọc được.
   *
   * BẮT BUỘC KHAI, và `null` là một lời khai hợp lệ — cùng luật với `mascot`. App
   * nào đã gói ba đức tính vào chính `slogan` thì khai `null`, đừng chẻ ra thành
   * hai dòng nói cùng một điều. Để `?` thì app mới quên khai sẽ lặng lẽ không hiện
   * dòng nào mà không ai biết là đang thiếu.
   */
  virtues: Record<LangCode, string> | null;

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
   * CỤM NHẬN DIỆN đặt trên nền TỐI — HAI MẢNH RỜI, vẽ bằng đúng bộ sinh dựng ảnh
   * cửa hàng. Ba màn trước-đăng-nhập ghép chúng lại qua `components/BrandLockup`,
   * thay cho cặp [ô vuông dấu hiệu] + [chữ `displayName`].
   *
   * ⚠ TRƯỚC 19/09/2026 đây là MỘT trường, một ảnh gộp (`lockup-on-dark.png`).
   * Tách ra vì hai chuyện mà ảnh gộp không làm được, và cả hai đều không kêu:
   *
   *  1. **Xếp lại bố cục.** Có màn cần [dấu hiệu | chữ hiệu + khẩu hiệu] nằm
   *     ngang, có màn cần chồng dọc. Ảnh gộp chỉ biết một cách xếp, nên đổi bố
   *     cục hoá ra là vẽ lại ảnh — và ảnh mới thì không đối chiếu được với ảnh cũ.
   *  2. **Căn theo CHỮ HIỆU.** Ràng buộc "khẩu hiệu rộng đúng bằng chữ hiệu" cần
   *     biết chữ hiệu bắt đầu và kết thúc ở đâu. Trong ảnh gộp nó chỉ là các điểm
   *     ảnh; số đo duy nhất lấy được là bề ngang CẢ CỤM, và căn theo nó thì khẩu
   *     hiệu thò ra dưới cả dấu hiệu.
   *
   * BẮT BUỘC KHAI, và `null` là một lời khai hợp lệ — cùng luật với `mascot`. App
   * nào chưa có cụm thì khai `null` và ba màn kia tự rơi về cặp cũ. Để `?` thì một
   * app mới quên khai sẽ lặng lẽ chạy đường rơi mà không ai biết là đang thiếu.
   *
   * VÌ SAO CHỈ CÓ BẢN CHO NỀN TỐI (ÂM BẢN): cả ba chỗ dùng đều là nền lục sẫm, và
   * mực của hai mảnh này là TRẮNG. `logo` KHÔNG thay được — đo ra mực lục
   * (CheckFarm ≈ `(60,148,90)`, Aladin ≈ `(74,116,70)`), tức lục trên lục: nó
   * không biến mất hẳn nên không có gì kêu, nó chỉ mờ đi. Một bản mực lục cho nền
   * sáng có tồn tại trong bộ nhận diện, nhưng KHÔNG kèm vào đây khi chưa màn nào
   * đặt nó — một tài sản không có nơi đọc là tài sản không ai bảo trì.
   *
   * ⚠ Lý do CŨ ở dòng này ("một tệp ảnh không ai dùng vẫn đi vào gói cài") đã bị
   * chính tệp này bác: hai lời khai app nằm chung một mô-đun với `require()` tĩnh
   * ở tầng mô-đun và Metro không cắt cây, nên gói cài của Aladin ĐÃ chứa sẵn
   * `lockup-on-dark.png`, `logo.png`, `qr-backdrop.png` của CheckFarm. Kết luận
   * không đổi, nhưng lý do thì phải đúng — một lý do sai sẽ được trích lại cho
   * quyết định sau.
   *
   * ⚠ Hai mảnh KHÔNG chứa câu chữ nào, và đó là ràng buộc chứ không phải lựa chọn
   * thẩm mỹ: app chạy bốn thứ tiếng và đã có `tagline`/`slogan`/`virtues` dịch
   * theo ngôn ngữ người dùng chọn. Nướng một câu tiếng Việt vào ảnh là thay một
   * dòng dịch được bằng một dòng không dịch được, và người đọc tiếng Nhật sẽ gặp
   * nó. Ảnh nộp cửa hàng thì ngược lại — một trang một ngôn ngữ — nên ở đó câu ấy
   * phải nằm trong ảnh. Bộ sinh cưỡng chế đúng ranh giới này: nó TỪ CHỐI cờ
   * bỏ-câu-giới-thiệu cho hai ảnh nộp Play.
   */
  brandMarkOnDark: ImageSourcePropType | null;

  /**
   * CHỮ HIỆU trên nền tối — tên app vẽ sẵn, đi đôi với `brandMarkOnDark`.
   *
   * Hai trường chứ không phải một mảng hai phần tử: mỗi mảnh có một VAI khác nhau
   * ở tầng trợ năng (chữ hiệu MANG tên app và nhận `accessibilityLabel`, dấu hiệu
   * là hình trang trí), và một mảng thì không nói được điều đó.
   *
   * Khai một mảnh mà bỏ mảnh kia là trạng thái vô nghĩa — `BrandLockup` đòi đủ
   * cả hai mới ghép, thiếu một là rơi về cặp cũ.
   */
  brandWordmarkOnDark: ImageSourcePropType | null;

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
   * Ô TRÁI của thanh tab — app tự khai, KHÔNG kế thừa im lặng.
   *
   * Bắt buộc (không `?`) là chủ ý: một trường tuỳ chọn thì app mới sinh ra sẽ
   * nhận mặc định của nền mà không ai gõ một chữ nào, và thanh của nó trùng
   * thanh app khác — đúng hình dạng vừa phải đi sửa. Khai tường minh thì việc
   * "trùng" là một lựa chọn có người ký tên, không phải một sự im lặng.
   *
   * Chỉ có ô TRÁI khai được. Ô giữa là nút cổng nằm trong khuyết tròn và ô phải
   * là avatar người dùng — hai thứ đó là kết cấu của thanh, lý do đầy đủ ở
   * `navigation/resolveVisibleTabs.ts` khối `NEO_*`.
   */
  anchorLeft: string;

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
  // Bản NGẮN cho màn đăng nhập. Bốn chữ, không vế phụ, không dấu gạch ngang.
  slogan: {
    vi: 'Bảo mật, minh bạch, thân thiện',
    en: 'Secure, transparent, user-friendly',
    zh: '安全、透明、用户友好',
    ja: '安全、透明、ユーザーフレンドリー',
  },
  // `slogan` của Aladin ĐÃ LÀ ba đức tính, nên không chẻ thành hai dòng nói cùng
  // một điều. `null` chứ không chép lại câu ấy xuống đây.
  virtues: null,
  // NGUYÊN BYTE tệp `assets/images/logo.png` bốn màn vẫn đang dùng — đối chiếu
  // bằng `cmp` lúc chuyển. Aladin đã phát hành, nên đợt này không được đổi một
  // pixel nào của nó; cái đổi là CHỖ khai, không phải hình.
  logo: require('../../instances/aladin/brand/logo.png'),
  // CHƯA CÓ cụm nhận diện. `null` chứ không mượn cụm của CheckFarm — ba màn
  // trước-đăng-nhập tự rơi về cặp [ô vuông dấu hiệu] + [chữ tên app] như trước,
  // không đổi một pixel nào của Aladin trong đợt này.
  //
  // ⚠ Việc còn nợ, đã đo chứ không phỏng đoán: đường rơi ấy vẽ `logo.png` (mực
  // lục ≈ `(74,116,70)`) lên nền lục sẫm của ba màn — lục trên lục. Không có lỗi
  // nào để lần ra vì dấu hiệu vẫn hiện, chỉ mờ. Sửa được bằng đúng một thứ: một
  // bản ÂM của dấu Aladin. Bản đó chưa có trong kho, và dựng hộ một dấu thương
  // hiệu thì sai thẩm quyền — nên để nguyên và ghi ra đây.
  brandMarkOnDark: null,
  brandWordmarkOnDark: null,
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
    // Ví là NEO trái từ 13/09/2026 (`resolveVisibleTabs.NEO_LEFT`). Nó đứng
    // trước `chat` ở đây vì mảng này là TẬP ĐẦY ĐỦ theo thứ tự khai, còn thứ tự
    // VẼ do resolver quyết — giữ hai thứ đó tách nhau là chủ ý của SG9 §2.
    { kind: 'host', route: 'PhoenixWallet' },
    { kind: 'module', moduleId: 'chat' },
    // `trace` gỡ khỏi đây 19/09/2026 cùng lượt gỡ khỏi `modules`. Để lại một ô
    // trỏ vào module đã tắt thì `instanceParity` đỏ — và nó đỏ ĐÚNG: ô ấy vẫn
    // chiếm chỗ trong phép xếp thứ tự mà không bao giờ vẽ được.
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'work' },
    { kind: 'module', moduleId: 'join' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  // Ô trái Aladin = VÍ. Aladin là app việc làm: người dùng nhận tiền công, nên
  // ví là thứ họ mở nhiều nhất sau Trang chủ.
  anchorLeft: 'PhoenixWallet',
  // Việc làm lên trước — kể cả với người chưa có dữ liệu nào. Người mở Aladin
  // đến vì việc, không đến vì vườn.
  // `ChatHome` vào bảng từ 13/09/2026: chat thôi làm NEO (ô trái nay là Ví —
  // xem `resolveVisibleTabs.NEO_LEFT`), nên nó phải tranh SLOT như mọi module.
  // Aladin xếp nó sau Việc làm và trước Góp máy: người mở Aladin đến vì việc,
  // nhưng nhắn tin là thứ họ dùng hằng ngày hơn góp máy.
  slotPriority: {
    default: ['WorkHome', 'ChatHome', 'JoinHome'],
    shipper: ['WorkHome', 'ChatHome', 'JoinHome'],
  },
  // `brandName` lấy từ chính `displayName` — trước đợt này theme mặc định trả
  // `'OriLife'`, tức app tên Aladin mà mọi chỗ hỏi tên thương hiệu đều nhận về
  // tên một NỀN TẢNG khác. OriLife là nền nhận diện, không phải tên app.
  themeConfig: { ...DEFAULT_THEME_CONFIG, brandName: 'Aladin' },
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
  // ── TẠM THỜI bỏ `trace` — chủ dự án chốt 19/09/2026 ───────────────────────
  //
  // Aladin còn Việc làm · Trò chuyện · Góp máy, cộng ô Ví ở `anchorLeft` (Ví
  // KHÔNG phải một module, nên nó không chịu phép lọc này).
  //
  // Vì sao viết ra danh sách thay vì `'all'`: `'all'` là một lời khai về CHÍNH
  // SÁCH ("app lõi chạy mọi module"), còn bây giờ chính sách đã khác. Giữ `'all'`
  // rồi chặn `trace` ở chỗ khác sẽ để lại hai nguồn cho cùng một sự thật, và
  // nguồn thứ hai sẽ trôi.
  //
  // ⚠️ `'all'` có một tính chất mà danh sách KHÔNG có, và mất nó là cái giá phải
  // trả có chủ ý: module thêm sau này **tự động** vào `'all'`, còn danh sách thì
  // không — thêm một module mới mà quên tên nó ở đây thì Aladin lặng lẽ không có
  // nó. Ngày `trace` quay lại, đổi dòng này về `'all'` là đủ.
  //
  // Chữ "TẠM THỜI" là nguyên văn của chủ dự án, giữ lại để lần đọc sau biết đây
  // là một lượt tắt chứ không phải một quyết định về phạm vi sản phẩm.
  modules: ['chat', 'work', 'join'],
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
  // 07/09/2026; bản tiếng Việt đổi 18/09/2026 theo chốt của chủ dự án CheckFarm).
  // Cùng luật với địa chỉ pháp nhân bên dưới: câu chữ là của CheckFarm, KHÔNG suy
  // ra từ kho này và không sửa hộ.
  //
  // Chỉ bản `vi` đổi. Ba bản kia giữ nguyên vì chúng vốn dịch theo nghĩa "truy
  // nguồn" và không mang nét phân biệt giữa hai cách nói tiếng Việt.
  tagline: {
    vi: 'Truy xuất nguồn gốc — Nâng tầm nông sản',
    en: 'Trace the Source — Elevate the Produce',
    zh: '追溯源头，提升农产价值',
    ja: '源流をたどり、農産物の価値を高める',
  },
  // ĐỦ HAI VẾ, và bản `vi` là chuỗi CHUẨN của bộ sinh nhận diện — hằng `TAG` ở
  // `Logo/play-store/build-feature-graphic.py` kho CheckFarm, gạch nối THƯỜNG
  // (`-`), không phải gạch dài. Chính chuỗi này là ràng buộc số 1 trong bốn ràng
  // buộc bố cục, và cỡ chữ lẫn cỡ dấu hiệu đều là nghiệm giải ra TỪ nó.
  //
  // ⚠ Bản trước ở đây chỉ có nửa đầu ("Truy xuất nguồn gốc"), rồi một bản sửa
  // giữa chừng đổi thành nửa sau ("Nâng tầm nông sản"). Cả hai đều sai cùng một
  // kiểu: cắt câu thì hai ràng buộc bố cục vẫn giải được, cụm vẫn dựng ra cân
  // đối, và không có gì kêu — chỉ là nó không còn là cụm của thương hiệu này.
  // Đừng cắt câu để cho vừa; cần hẹp hơn thì hạ cỡ, đó là việc của bố cục.
  slogan: {
    vi: 'Truy xuất nguồn gốc - Nâng tầm nông sản',
    en: 'Trace the Source - Elevate the Produce',
    zh: '追溯源头 - 提升农产价值',
    ja: '源流をたどり、農産物の価値を高める',
  },
  // Dòng dưới CẢ CỤM ở màn đăng nhập. Bản `vi` do chủ dự án chốt 19/09/2026.
  //
  // ⚠ Ba bản kia là bản DỊCH DỰNG Ở KHO NÀY, không phải chuỗi nhà CheckFarm cấp —
  // khác hẳn `tagline`/`slogan` ở trên. Đã gửi thư sang nhà CheckFarm xin bản
  // chính thức; nhận được thì thay, đừng coi ba dòng này là câu chữ đã chốt.
  // ── Đổi 2026-09-19: bỏ "Chính xác", thay bằng "Trực quan" ──────────────────
  //
  // Chủ dự án chốt, và lý do đáng ghi lại vì nó là một quyết định về thứ app DÁM
  // HỨA: độ chính xác đang là thứ phải cố hoàn thiện, chưa phải thứ đã đạt. Ba
  // số đo cùng ngày đứng sau: `NO_FRUIT_IN_PHOTO` trả câu khuyên ngược chiều với
  // nguyên nhân (13/49 ảnh hỏng, 12/13 hồi phục khi thu nhỏ khung); 0/185 cây
  // từng mang mức lộ vị-trí người dùng chọn; và việc chia thân/gốc hiện còn dựa
  // trên một tín hiệu gián tiếp (`treeCaptureParts.ts`).
  //
  // Một khẩu hiệu là một khẳng định người khác dùng để quyết định có tin hay
  // không — nên nó chịu đúng luật `Forall §Kỷ luật phát ngôn`: nhãn chắc phải có
  // bằng chứng, chưa có thì hạ xuống. "Minh bạch" và "Tiện lợi" thì app làm được
  // và chứng minh được ngay hôm nay; "Chính xác" thì chưa.
  virtues: {
    vi: 'Minh bạch - Tiện lợi - Trực quan',
    en: 'Transparent - Convenient - Intuitive',
    zh: '透明 · 便捷 · 直观',
    ja: '透明・手軽・直感的',
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
  // Hai mảnh ÂM BẢN, mực TRẮNG trên nền trong suốt, cắt sát hộp mực.
  //
  // CẢ HAI ĐỀU SINH RA TỪ `lockup-on-dark.png` — tệp ấy vẫn nằm cạnh đây và vẫn
  // là nguồn, hai mảnh này là bản CẮT có nhãn. Ảnh gộp đến từ bộ sinh dựng ảnh
  // cửa hàng ở kho `CheckFarm/Docs`
  // (`Logo/play-store/build-feature-graphic.py --variant ink-on-dark --no-tagline`
  // — kho KHÁC kho này, nên đừng đi tìm đường dẫn đó ở đây), nên hai mảnh không
  // thể trôi khỏi ảnh cửa hàng: cùng dấu hiệu, cùng phông, cùng cỡ chữ đã giải ra
  // từ bốn ràng buộc bố cục. `md5` ảnh gộp lúc chép sang: `ba0b2c2b8b6ae38fa8f232c83b90ec26`.
  //
  // Phép cắt, đo bằng kênh alpha của chính ảnh gộp 856×136 (19/09/2026) — dựng
  // lại được bằng đúng hai hộp này, không phải cắt bằng mắt:
  //     mark-on-dark.png      ← (0, 0, 157, 136)     157×136
  //     wordmark-on-dark.png  ← (207, 18, 856, 117)  649×99
  brandMarkOnDark: require('../../instances/checkfarm/brand/mark-on-dark.png'),
  brandWordmarkOnDark: require('../../instances/checkfarm/brand/wordmark-on-dark.png'),
  // Dùng chính dấu của họ làm nền tem. Trước đợt này tem QR mọi app đều mang mặt
  // cười Aladin, mà tem thì IN RA rồi dán lên nông sản — sai ở đây không thu về được.
  qrBackdrop: require('../../instances/checkfarm/brand/qr-backdrop.png'),
  // CHƯA CÓ linh vật riêng. Để `null` thay vì mượn linh vật Aladin: bong bóng
  // trợ lý nổi trên MỌI màn, nên mượn là đặt dấu nhà khác vào chỗ dễ thấy nhất.
  // Nơi dùng rơi về `logo` tĩnh (`components/BlinkLogo.tsx`).
  mascot: null,
  // Trang của CheckFarm, nhà CheckFarm cấp 18/09/2026. Bản trước để `null` kèm câu
  // *"nhà CheckFarm chưa cấp địa chỉ trang web nào"* — câu đó đúng lúc viết và đã
  // hết đúng: trang chạy từ 25/08/2026, tức `null` sống thêm 24 ngày sau khi hết
  // đúng. Không có gì đỏ ở đó, và sẽ không có: `null` là một giá trị HỢP LỆ của
  // trường này, nên không phép kiểm nào phân biệt được "chưa có trang" với "có
  // trang mà chưa ai khai".
  //
  // Hai tên, không phải một — đo bằng `curl -o /dev/null -w '%{http_code}'`
  // 18/09/2026: `https://checkfarm.com` → 200 và `https://www.checkfarm.com` → 200,
  // cùng một gốc tệp. Nên `hosts` phải kê CẢ HAI: `ALLOWED_HOSTS`
  // (`utils/webLink.ts:38`) so tên máy chủ ĐÚNG BẰNG chuỗi, không so theo phần
  // đuôi, nên thiếu `www.` là mọi liên kết mang tiền tố đó bị chặn im.
  website: { url: 'https://checkfarm.com', hosts: ['checkfarm.com', 'www.checkfarm.com'] },
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
    // Ví là NEO trái từ 13/09/2026 (`resolveVisibleTabs.NEO_LEFT`). Mảng này là
    // TẬP ĐẦY ĐỦ theo thứ tự khai, còn thứ tự VẼ do resolver quyết — giữ hai thứ
    // đó tách nhau là chủ ý của SG9 §2.
    { kind: 'host', route: 'PhoenixWallet' },
    { kind: 'module', moduleId: 'trace' },
    { kind: 'host', route: 'Home' },
    { kind: 'module', moduleId: 'join' },
    { kind: 'host', route: 'Account' },
  ],
  initialTabRoute: 'Home',
  // ── Ô TRÁI = VƯỜN, và vì sao hai app phải lệch nhau ở đây ──────────────────
  //
  // Apple 4.3 ("Spam — bản sao chỉ khác biệt nhỏ") và Google Play ("nội dung
  // trùng lặp") đều xét hai app CÙNG một nhà phát hành. Hai app này dùng chung
  // một binary, chung bộ route, chung nhãn — nên thanh điều hướng là bề mặt mà
  // người xét duyệt so sánh TRƯỚC TIÊN, vì nó nằm trên mọi ảnh chụp màn hình.
  //
  // Đo 2026-09-14: hai app ra thanh lệch đúng **1 ô trên 5** ở persona mặc định,
  // và lệch **0 ô** ở persona `shipper` — hai bảng `slotPriority.shipper` khi ấy
  // là hai mảng giống nhau từng phần tử. Bài kiểm `slotPriorityWiring.test.ts`
  // vẫn xanh, vì nó chỉ hỏi `not.toEqual` ở ĐÚNG persona mặc định: một phép đo
  // trả lời "có khác ít nhất một chỗ" cho một câu đang hỏi "khác đủ chưa".
  //
  // Nay: Vườn lên ô trái (CheckFarm là app nông — vườn là thứ mở đầu tiên), Ví
  // xuống tranh slot.
  anchorLeft: 'Farms',
  // Bảng RIÊNG, không dùng hằng của nền — dùng hằng nền là lý do bảng `shipper`
  // hai app từng giống nhau từng phần tử.
  slotPriority: {
    // Vườn đã ở ô trái ⟹ nó tự bị loại khỏi vòng tranh slot (`seen`).
    //
    // `ChatHome` và `WorkHome` đều KHÔNG có trong hai bảng này, và đó không phải
    // chuyện thẩm mỹ: kho có một cổng riêng đòi **mọi route trong `slotPriority`
    // phải TỚI ĐƯỢC** (`src/config/` — bài "cấu hình điều hướng không trỏ vào
    // module đã tắt"). Hai module ấy đã tắt ở `modules` bên dưới ⟹ để tên chúng
    // ở đây là khai một đường không tồn tại. Trông cậy vào `isAvailable` lọc hộ
    // lúc chạy là đúng hành vi nhưng SAI lời khai: bảng ưu tiên là thứ người đọc
    // cấu hình dùng để biết app này có gì.
    //
    // Hệ quả hình thức phải nói ra: hàng còn BỐN ô nên nút giữa rơi ở 37,5%
    // chiều ngang thay vì 50%. Giữ nguyên đánh đổi đó — bỏ bớt một mục cho nút
    // về đúng tâm là bỏ nó khỏi cả thanh tab LẪN cổng xoè, vì `resolveGateItems`
    // dựng cung từ CHÍNH bảng này. Khi ấy module vẫn khai bật, màn vẫn đăng ký,
    // mà không lối nào tới: đúng lớp hỏng "hàm có, đường không có" mà không cổng
    // kiểu nào bắt và không bài hàm thuần nào đỏ. Chiều sai thì im lặng, chiều
    // đúng thì chỉ hơi xấu.
    default: ['PhoenixWallet', 'JoinHome'],
    // Người giao hàng ở CheckFarm mở mục Tham gia trước, Ví giữ ô còn lại — đảo
    // thứ tự so với persona mặc định để hai bảng không lại thành hai mảng giống
    // nhau từng phần tử, đúng cái vừa đo được ở trên.
    shipper: ['JoinHome', 'PhoenixWallet'],
  },
  // Bảng màu do chính nhà CheckFarm chốt và gửi sang (không phải bản bịa ở đây
  // rồi thành mặc định không ai dám đổi). Giá trị + lý do từng ràng buộc nằm ở
  // `theme/theme.config.ts`; ràng buộc nặng nhất là màu nhãn `#298A4A` TRƯỢT
  // ngưỡng tương phản AA cho chữ cỡ thường, nên nó chỉ đi vào chỗ là hình.
  themeConfig: CHECKFARM_THEME_CONFIG,
  adaptive: DEFAULT_ADAPTIVE_CONFIG,
  // ── DANH SÁCH CHỌN, và `chat` lẫn `work` đều KHÔNG có trong đó ─────────────
  //
  // Đây là **danh sách chọn**, không phải danh sách trừ — khai những module app
  // này CÓ, chứ không khai những module nó bỏ. Hai cách viết ra cùng một tập hôm
  // nay nhưng già đi ngược nhau: thêm một module mới vào nền thì danh sách chọn
  // giữ nguyên hành vi (app không tự nhận thứ chưa ai xét), còn danh sách trừ tự
  // bật nó lên cho mọi app mà không ai gõ một chữ nào.
  //
  // Vì sao hai module này tắt cho đợt nộp — quyết định của chủ sở hữu, chốt
  // 2026-09-12 và giữ nguyên tới 2026-09-14. Apple guideline 1.2 đòi ĐỦ BA cơ
  // chế cho **nội dung do người dùng tạo**: chặn người, báo cáo nội dung, lọc
  // nội dung. Cả `chat` (tin nhắn) lẫn `work` (tin tuyển việc, hồ sơ thợ) đều là
  // nội dung do người dùng tạo — một sàn việc làm không kém một hộp thư ở điểm
  // này, vì nó cũng cho người lạ đăng chữ và ảnh mà người khác đọc. Đo trong kho
  // này cùng ngày:
  //
  //   grep -rln "blockUser|reportUser|moderation" src/   →  0 tệp
  //
  //   (đọc ở SỐ TỆP, không đọc ở số dòng: một tệp nhắc chữ "moderation" trong
  //   chú thích vẫn là 0 cơ chế)
  //
  // Guideline 1.2 là cửa TỪ CHỐI thẳng, không nhắc nhở; và một lượt từ chối làm
  // chậm CẢ HAI app cùng pháp nhân. Thứ tự dựng đã bàn: chặn → báo cáo → lọc.
  //
  // Đây là quyết định CHO ĐỢT NỘP, không phải bỏ hai module: mã của chúng còn
  // nguyên trong kho và Aladin vẫn bật cả hai. Bật lại ở đây là thêm phần tử vào
  // mảng này, thêm mục vào `tabs` và thêm route vào `slotPriority`, sau khi ba
  // cơ chế đã có và đo được.
  //
  // Hai điều PHẢI biết kèm, vì cả hai đều dễ đọc nhầm theo chiều có lợi:
  //   · Tắt module KHÔNG làm gói nhẹ đi. `registry.ts` vẫn nhập tĩnh mọi màn;
  //     cái tắt là ĐƯỜNG TỚI (tab, mục cổng xoè, đăng ký route), không phải mã.
  //   · Ví KHÔNG tắt theo. Bốn màn ví khai thẳng ở tầng host, không mang
  //     `moduleId` nào, nên phép lọc `ENABLED_MODULES` không chạm tới chúng. Ô
  //     "Financial features" của Google vẫn phải khai CÓ.
  //
  // Và giữ nguyên điều đã ghi từ trước: việc chọn module nào là quyền của nhà
  // CheckFarm ở kho của họ (chủ sở hữu bàn giao 2026-09-10). Dòng này là trạng
  // thái hôm nay của bản dựng đang thử, không phải một phán quyết vĩnh viễn.
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
