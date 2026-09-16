import { Platform, PermissionsAndroid, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';

/**
 * Quyền dùng máy ảnh — hỏi TRƯỚC khi mở, cho cả iOS lẫn Android.
 *
 * ⛔ Vì sao phải tự hỏi trên iOS, dù `react-native-image-picker` có vẻ đã lo:
 *
 * Thư viện CÓ viết hàm kiểm quyền máy ảnh, và hàm đó KHÔNG BAO GIỜ được gọi.
 * `- (void)checkPermission:` khai ở `ImagePickerManager.mm:386` và cả tệp chỉ có
 * đúng một lần xuất hiện của cái tên đó — chính dòng khai nó
 * (`grep -c "checkPermission" … → 1`).
 *
 * Cổng quyền duy nhất còn sống nằm ở hai chỗ (`:88` và `:109`), cả hai đều bọc
 * trong `if([self.options[@"includeExtra"] boolValue])`, và cả hai đều gọi
 * `checkPhotosPermissions` — tức quyền THƯ VIỆN ẢNH, không phải quyền máy ảnh.
 * Bật `includeExtra` lên cũng không vá được: nó sẽ chặn theo đúng một quyền khác
 * với quyền đang thiếu.
 *
 * Hệ quả trên máy thật, đúng như đội thực địa báo: ai từng bấm "Không cho phép"
 * một lần thì iOS không hỏi lại nữa (iOS chỉ hỏi ĐÚNG MỘT LẦN trong đời cài đặt).
 * `launchCamera` vẫn dựng màn máy ảnh, màn đó đen, người dùng bấm Huỷ → thư viện
 * trả `didCancel`, và không một mã lỗi nào tới được JS. Màn im lặng, không ai
 * biết vì sao.
 *
 * Vì sao chuyện này không lộ ra trong lúc dựng: máy ảo LUÔN trả `camera_unavailable`
 * ngay ở đầu hàm, trước mọi nhánh quyền (`ImagePickerManager.mm:70-73`). Nên không
 * có phép thử nào trên máy ảo chạm được vào đường này.
 *
 * Nguồn quyền dùng ở đây là `RNCameraKitModule` — module đã có sẵn trong kho
 * (`react-native-camera-kit`, đang dùng cho ba màn quét mã). Phía iOS nó đọc thẳng
 * `AVCaptureDevice.authorizationStatus(for: .video)`
 * (`ios/ReactNativeCameraKit/CameraManager.swift:30-49`) và trả ba trạng thái:
 * `true` = đã cấp · `false` = đã từ chối hoặc bị hạn chế · `-1` = chưa hỏi lần nào.
 */
export type CameraPermission =
  /** Đã cấp — mở máy ảnh được. */
  | 'granted'
  /** Đã từ chối. iOS sẽ KHÔNG hỏi lại; đường duy nhất là Cài đặt. */
  | 'denied'
  /** Chưa hỏi lần nào — hỏi được. */
  | 'undetermined'
  /** Không đo được trên máy này (thiếu module gốc). Xem chú thích ở `ensure…`. */
  | 'unmeasurable';

interface CameraKitAuth extends TurboModule {
  checkDeviceCameraAuthorizationStatus?: () => Promise<boolean | number>;
  requestDeviceCameraAuthorization?: () => Promise<boolean>;
}

/**
 * Lấy module gốc mà KHÔNG ném khi nó vắng mặt.
 *
 * Cố ý dùng `TurboModuleRegistry.get` chứ không `getEnforcing`, và cố ý không
 * import sâu vào `src/specs` của gói: đường import sâu gãy im lặng ở lần nâng gói,
 * còn `getEnforcing` ném ngay lúc nạp tệp này — hai kiểu hỏng đều biến một bản vá
 * quyền thành một màn trắng.
 */
const cameraKit = (): CameraKitAuth | null =>
  TurboModuleRegistry.get<CameraKitAuth>('RNCameraKitModule') ?? null;

/** Đọc trạng thái quyền, KHÔNG hiện hộp hỏi nào. */
export async function checkCameraPermission(): Promise<CameraPermission> {
  if (Platform.OS === 'android') {
    const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    // Android không tách "chưa hỏi" khỏi "đã từ chối" ở hàm `check`. Trả
    // `undetermined` là đúng hơn `denied`: hỏi lại được, và hệ điều hành mới là
    // nơi biết có nên hiện hộp hay không.
    return ok ? 'granted' : 'undetermined';
  }
  if (Platform.OS !== 'ios') return 'unmeasurable';

  const mod = cameraKit();
  if (!mod?.checkDeviceCameraAuthorizationStatus) return 'unmeasurable';
  try {
    const status = await mod.checkDeviceCameraAuthorizationStatus();
    if (status === true) return 'granted';
    if (status === false) return 'denied';
    return 'undetermined'; // `-1`
  } catch {
    return 'unmeasurable';
  }
}

/**
 * Bảo đảm có quyền trước khi mở máy ảnh: hỏi nếu chưa hỏi lần nào, và trả về
 * trạng thái CUỐI CÙNG để nơi gọi quyết định nói gì với người dùng.
 *
 * `unmeasurable` cố ý KHÔNG chặn. Đo được thì chặn đúng; đo không được thì chặn
 * là tự tay tắt máy ảnh của mọi người vì một thứ mình không biết — trong khi
 * đường cũ (mở rồi để hệ điều hành xử) vẫn còn nguyên đó và không tệ hơn hôm nay.
 * Nơi gọi vẫn còn nhánh `errorCode` để bắt phần hệ điều hành nói ra được.
 */
export async function ensureCameraPermission(prompt: {
  title: string;
  message: string;
  buttonPositive: string;
  buttonNegative: string;
}): Promise<CameraPermission> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      prompt,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }

  const status = await checkCameraPermission();
  if (status !== 'undetermined') return status;

  const mod = cameraKit();
  if (!mod?.requestDeviceCameraAuthorization) return 'unmeasurable';
  try {
    // Hộp hỏi của iOS, chỉ hiện đúng một lần trong đời cài đặt. Bấm "Không cho
    // phép" ở đây là từ lần sau trở đi không còn hộp nào nữa.
    return (await mod.requestDeviceCameraAuthorization()) ? 'granted' : 'denied';
  } catch {
    return 'unmeasurable';
  }
}
