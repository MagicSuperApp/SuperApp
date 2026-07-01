/**
 * pushHandler — Firebase Cloud Messaging (FCM/APNs) cho PhoenixKey.
 *
 * Tương đương Enclave/lib/services/push_handler.dart. Nhiệm vụ:
 *   1. Xin quyền push, lấy token (iOS: APNs; Android: FCM).
 *   2. Đăng ký token với backend qua devices.register → backend gửi push được.
 *   3. Route data-only push → màn tương ứng (sign-request / activation).
 *
 * AN TOÀN: mọi lỗi (chưa build native module, chưa đăng nhập, mạng) → log + bỏ
 * qua, KHÔNG sập app. Đăng ký token cần Bearer (devices.register needsAuth) nên
 * gọi initPush SAU khi đăng nhập.
 *
 * Lưu ý: màn 'SignRequest'/'Activation' sẽ được nối khi làm Đợt 4 — hiện route là
 * no-op an toàn (chỉ điều hướng nếu route tồn tại).
 */

import { Platform } from 'react-native';
import { phoenixKeyApi } from './phoenixKey-api';

// Điều hướng do navigation cấp (tránh phụ thuộc vòng vào navigator).
type Navigate = (screen: string, params?: Record<string, unknown>) => void;
let navigateRef: Navigate | null = null;
export const setPushNavigator = (nav: Navigate): void => { navigateRef = nav; };

// Import động để app không cần native module lúc chạy nếu build chưa có messaging.
const getMessaging = async () => {
  try {
    const mod = await import('@react-native-firebase/messaging');
    return mod.default;
  } catch {
    return null;
  }
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
