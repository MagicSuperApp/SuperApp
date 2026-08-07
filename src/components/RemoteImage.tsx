// components/RemoteImage.tsx
//
// Ảnh TỪ MÁY CHỦ, có đường lùi. Dùng thay `<Image source={{uri}}/>` ở mọi chỗ nạp
// ảnh qua mạng.
//
// VÌ SAO CẦN: ảnh cây/quả phục vụ qua `/gimg` của OriLife — endpoint KHÔNG ký, không
// token, không hạn dùng; quyền xét TẠI THỜI ĐIỂM GỌI, trượt thì trả 404 giả-không-
// tồn-tại. Cổng mở/đóng theo tiến trình máy chủ (biến bật cổng nằm trên dòng lệnh
// tmux, tiến trình chết là cổng tự đóng) nên app SẼ gặp ảnh hỏng bất kỳ lúc nào mà
// `/api/health` vẫn 200. Trước đây toàn bộ `src/` không một `<Image>` nào có
// `onError` → người dùng thấy ô xám câm và kết luận "app làm mất ảnh cây của tôi".
//
// BA ĐƯỜNG LÙI, theo thứ tự:
//   1. `uri` (ảnh máy chủ)
//   2. `fallbackUri` (bản `file://` CÙNG ảnh đó còn trong máy — nếu có)
//   3. `placeholder` (ô có icon + chữ), kèm `onRetry` do màn ngoài lo
//
// THỬ LẠI PHẢI ĐỔI URL: RN Image đi qua Fresco (Android) / NSURLCache (iOS), phản
// hồi 404 có thể nằm lại trong bộ đệm. Nạp lại đúng URL cũ thì vẫn trắng dù cổng đã
// mở lại. Vì vậy `retryKey` đổi → nối thêm `?r=<n>`. CHỈ nối cho http(s); `file://`
// giữ nguyên (thêm query vào đường dẫn tệp là hỏng).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View, StyleSheet } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';

/** Hạn chờ mềm: RN Image KHÔNG có timeout. Mạng hội chợ hay treo nửa vời (bắt tay
 *  TCP xong rồi đứng im) — không có mốc này thì ô ảnh quay vô hạn, không phân biệt
 *  được với 404. Quá hạn → coi như hỏng, đi tiếp đường lùi. */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface RemoteImageProps {
  /** URL ảnh máy chủ. Rỗng/undefined → vào thẳng placeholder. */
  uri?: string | null;
  /** Bản dự phòng trong máy (`file://...`) của ĐÚNG ảnh đó, nếu còn. */
  fallbackUri?: string | null;
  style?: StyleProp<ImageStyle>;
  /** Ô vẽ khi hết đường lùi. Bọc trong View cùng `style` để giữ khung. */
  placeholder?: React.ReactNode;
  /** Style cho khung bọc placeholder/loading (mặc định dùng chính `style`). */
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'center' | 'stretch';
  /** Đổi giá trị này = ép nạp lại kèm URL mới (phá bộ đệm). */
  retryKey?: number;
  timeoutMs?: number;
  /** Gọi khi ảnh hỏng hẳn (đã thử cả `fallbackUri`). Dùng để đếm/ghi log thực địa. */
  onFinalError?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Nối tham số phá-đệm cho http(s); để nguyên `file://`/`data:`/rỗng. */
export function withCacheBuster(uri: string | null | undefined, n: number): string | undefined {
  if (!uri) return undefined;
  if (n <= 0) return uri;
  if (!/^https?:\/\//i.test(uri)) return uri;
  return `${uri}${uri.includes('?') ? '&' : '?'}r=${n}`;
}

const RemoteImage: React.FC<RemoteImageProps> = ({
  uri,
  fallbackUri,
  style,
  placeholder,
  containerStyle,
  resizeMode = 'cover',
  retryKey = 0,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onFinalError,
  accessibilityLabel,
  testID,
}) => {
  // step 0 = ảnh máy chủ · 1 = bản trong máy · 2 = hết đường
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sources = [uri, fallbackUri];
  const current = withCacheBuster(sources[step] ?? null, retryKey);

  // `uri`/`fallbackUri`/`retryKey` đổi → bắt đầu lại từ đường đầu.
  useEffect(() => {
    setStep(0);
  }, [uri, fallbackUri, retryKey]);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clear, []);

  const nextStep = () => {
    clear();
    setLoading(false);
    // Bỏ qua đường lùi rỗng để không kẹt ở bước không có nguồn.
    const next = step + 1 === 1 && !fallbackUri ? 2 : step + 1;
    if (next >= 2) onFinalError?.();
    setStep(next);
  };

  if (!current) {
    return (
      <View style={[styles.center, containerStyle ?? (style as StyleProp<ViewStyle>)]}>
        {placeholder}
      </View>
    );
  }

  return (
    <View style={[containerStyle ?? (style as StyleProp<ViewStyle>), styles.wrap]}>
      <Image
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        source={{ uri: current }}
        // Khung do View ngoài giữ (đã mang `style`); ảnh chỉ lấp đầy khung đó. Đắp
        // `style` lần hai lên đây sẽ đá nhau với absoluteFill (width/height cứng).
        style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
        resizeMode={resizeMode}
        onLoadStart={() => {
          setLoading(true);
          clear();
          timer.current = setTimeout(nextStep, timeoutMs);
        }}
        onLoad={() => {
          clear();
          setLoading(false);
        }}
        onError={nextStep}
      />
      {loading && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="small" color="#8aa89a" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

export default RemoteImage;
