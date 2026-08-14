import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Đệm đáy cho thanh nút hành động chính (Vào ứng dụng · Đăng ký · Huỷ · Gửi…).
 *
 * VÌ SAO CẦN — không phải "quên inset", mà là edge-to-edge bị ép bật:
 * `android/build.gradle:5-6` đặt compileSdk/targetSdk = 36, và từ Android 15 (SDK 35)
 * edge-to-edge KHÔNG opt-out được ở SDK 36 (repo cũng không khai
 * `windowOptOutEdgeToEdgeEnforcement`). Cửa sổ app tràn xuống dưới thanh điều hướng
 * ⇒ `insets.bottom` = 24–48dp. Máy Android ≤14 thì `insets.bottom` = 0 và mọi thứ
 * trông bình thường. Đó là lý do nút chỉ sát mép trên MỘT SỐ dòng máy — không phải
 * do hãng máy, mà do phiên bản Android.
 *
 * VÌ SAO `Math.max` CHỨ KHÔNG PHẢI CỘNG THẲNG — cộng `insets.bottom` đơn thuần là
 * chưa đủ: trên máy Android cũ `insets.bottom` = 0, mà 14–18dp vẫn quá sát để ngón
 * cái bấm trúng. Nên phải có SÀN tối thiểu. Cùng khuôn với `HomeScreen.tsx:676-678`.
 *
 * `SafeAreaProvider` đã bọc ở root kèm `initialMetrics` (`App.tsx:67`) nên hook này
 * dùng được ở mọi màn.
 */
export const BOTTOM_ACTION_CLEARANCE = 24;

export function useBottomActionPadding(floor: number = BOTTOM_ACTION_CLEARANCE): number {
  const insets = useSafeAreaInsets();
  return Math.max(floor, insets.bottom + 12);
}
