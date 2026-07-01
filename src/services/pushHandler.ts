import { Platform } from 'react-native';
import { phoenixKeyApi } from './phoenixKey-api';

// Điều hướng do navigation cấp (tránh phụ thuộc vòng vào navigator).
type Navigate = (screen: string, params?: Record<string, unknown>) => void;
let navigateRef: Navigate | null = null;
export const setPushNavigator = (nav: Navigate): void => { navigateRef = nav; };

// Dynamic import: chỉ nạp module khi thực sự dùng (an toàn nếu build thiếu pod).
// Trả về hàm messaging() default export, hoặc null nếu module không có.
let _messaging: any | undefined;
const getMessaging = async (): Promise<any> => {
  if (_messaging !== undefined) return _messaging;
  try {
    const mod: any = await import('@react-native-firebase/messaging');
    _messaging = mod?.default ?? mod ?? null;
  } catch (e) {
    console.warn('[Push] messaging module chưa sẵn sàng:', e);
    _messaging = null;
  }
  return _messaging;
};

const registerToken = async (): Promise<void> => {
  try {
    const messaging = await getMessaging();
    if (!messaging) return;
    if (Platform.OS === 'ios') {
      const apnsToken = await messaging().getAPNSToken();
      const fcmToken = await messaging().getToken().catch(() => undefined);
      await phoenixKeyApi.devices.register({
        platform: 'ios',
        apnsToken: apnsToken ?? undefined,
        fcmToken: fcmToken ?? undefined,
      });
    } else {
      const fcmToken = await messaging().getToken();
      await phoenixKeyApi.devices.register({ platform: 'android', fcmToken });
    }
  } catch (e) {
    // Chưa đăng nhập / mạng / chưa có token → bỏ qua (đăng ký lại lúc refresh).
    console.warn('[Push] register token bỏ qua:', e);
  }
};

/** Route 1 push data-only → màn tương ứng. */
const handleMessage = (msg: { data?: Record<string, unknown> } | null): void => {
  const data = msg?.data ?? {};
  const type = data.type;
  if (type === 'sign_request' && data.requestId) {
    navigateRef?.('SignRequest', { requestId: String(data.requestId) });
  } else if (type === 'activation' && data.activationId) {
    navigateRef?.('Activation', { activationId: String(data.activationId) });
  }
};

/** Khởi tạo push. Gọi SAU đăng nhập. Idempotent (an toàn gọi nhiều lần). */
export const initPush = async (): Promise<void> => {
  try {
    const messaging = await getMessaging();
    if (!messaging) return;

    const status = await messaging().requestPermission();
    const enabled =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) return;

    await registerToken();
    messaging().onTokenRefresh(registerToken);
    messaging().onMessage(handleMessage);             // foreground
    messaging().onNotificationOpenedApp(handleMessage); // tap khi nền
    // TODO(Đợt 4): xử lý cold-start (getInitialMessage) khi có màn SignRequest/
    // Activation — route push mở app từ trạng thái tắt.
  } catch (e) {
    console.warn('[Push] init bỏ qua:', e);
  }
};
