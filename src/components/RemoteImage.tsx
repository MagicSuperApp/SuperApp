// components/RemoteImage.tsx
//
// Ảnh TỪ MÁY CHỦ, có đường lùi. Dùng thay `<Image source={{uri}}/>` ở mọi chỗ nạp
// ảnh qua mạng.
//
// VÌ SAO CẦN: ảnh cây/quả phục vụ qua `/gimg` của OriLife. Cổng gác xét quyền TẠI
// THỜI ĐIỂM GỌI và khi CHẶN thì trả **404** — dùng chung mã với "ảnh không tồn tại".
// Nên app không bao giờ phân biệt được hai ca đó, và câu trên màn phải là "ảnh chưa
// tải được", KHÔNG được viết "ảnh không tồn tại".
//
// ĐÍNH CHÍNH 10/08 (bản đầu tệp này viết SAI, giữ lại để không ai suy theo bản cũ):
// trước đây ghi "biến bật cổng nằm trên dòng lệnh tmux, tiến trình chết là cổng tự
// đóng". Không phải. OriLife đo lại: biến nằm trong `.env` của máy chủ, nên trạng
// thái cổng **sống qua khởi động lại**. Và mặc định trong mã là cổng **BẬT** — hiện
// prod đang chạy một van tạm để tắt nó. Hệ quả đảo ngược hẳn: cổng không "tự đóng
// rồi lại mở", mà đang MỞ thường trực; ngày ai đó đóng van thì MỌI ảnh cây/quả
// trong app thành ô trắng cùng lúc, im lặng.
//
// Vì vậy tệp này làm hai việc, không phải một:
//   · gắn `Authorization` vào chính yêu cầu ảnh (điều kiện để đóng được van);
//   · và giữ ba đường lùi bên dưới cho ca vẫn hỏng.
// Trước đây toàn bộ `src/` không một `<Image>` nào có `onError` → người dùng thấy ô
// xám câm và kết luận "app làm mất ảnh cây của tôi".
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ORILIFE_BASE } from '../services/orilifeBase';

// ── Xác thực cho ảnh ────────────────────────────────────────────────────────
// Dùng LẠI đúng đường của các service ReID: khoá AsyncStorage `auth_token` do
// `services/orilifeDidAuth.ts` ghi sau khi ký DID, đọc ra thành `Bearer <token>`.
// CỐ Ý không gọi `ensureOrilifeToken()` ở đây: hàm đó có thể kích hoạt ký DID, mà
// một dải 8 ảnh sẽ bật 8 lần hỏi sinh trắc. URL `/gimg` chỉ tới được SAU một lời
// gọi API có auth, nên token đã có sẵn lúc vẽ.
const AUTH_TOKEN_KEY = 'auth_token';

/** Đệm trong bộ nhớ: một dải ảnh không nên đọc AsyncStorage mỗi tấm. */
let _headerCache: { at: number; value: string | null } | null = null;
const HEADER_TTL_MS = 30_000;

/** Xoá đệm — gọi khi đăng xuất / đổi tài-khoản. */
export function resetRemoteImageAuthCache(): void {
  _headerCache = null;
}

/** `Bearer <auth_token>`, hoặc null. KHÔNG ném, KHÔNG log giá-trị token. */
async function authHeaderValue(force = false): Promise<string | null> {
  if (!force && _headerCache && Date.now() - _headerCache.at < HEADER_TTL_MS) {
    return _headerCache.value;
  }
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    const value = token ? `Bearer ${token}` : null;
    _headerCache = { at: Date.now(), value };
    return value;
  } catch {
    // Lỗi đọc kho: KHÔNG ghi đệm (để lần sau còn thử lại), và KHÔNG nổ.
    return null;
  }
}

/** `https://host:port` của URL, chữ thường. null nếu không phải http(s). */
function originOf(url: string): string | null {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

const ORILIFE_ORIGIN = originOf(ORILIFE_BASE);

/**
 * Chỉ gắn `Authorization` khi ảnh nằm ĐÚNG máy chủ OriLife.
 * `file://` / `data:` / `content://` là ảnh máy — không cần header. Host lạ thì
 * TUYỆT ĐỐI không gửi token đi (rò token sang bên thứ ba).
 * Quan trọng ở đây vì đường lùi thứ hai của component này chính là `file://`.
 */
export function shouldAttachAuth(uri: string): boolean {
  const o = originOf(uri);
  return o != null && ORILIFE_ORIGIN != null && o === ORILIFE_ORIGIN;
}

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

  // Header xác-thực cho nguồn ĐANG dùng. `ready:false` = chưa biết → CHƯA vẽ
  // <Image>, vì vẽ sớm là bắn một yêu cầu không mang token và ăn 404 oan, rồi
  // 404 đó còn nằm lại trong bộ đệm ảnh của hệ điều hành.
  //
  // Ảnh KHÔNG cần token (`file://` — đường lùi thứ hai, hoặc host khác) đi thẳng,
  // KHÔNG qua cổng chờ: bắt chúng chờ một lượt đọc kho là làm chậm đúng đường lùi
  // đang dùng để cứu ca hỏng.
  const needsAuth = !!current && shouldAttachAuth(current);
  const [auth, setAuth] = useState<{ forUri: string | null; value: string | null }>(
    { forUri: null, value: null },
  );
  const authReady = !needsAuth || auth.forUri === current;

  useEffect(() => {
    if (!needsAuth || !current) return;
    let alive = true;
    // `retryKey` đổi = người dùng bấm thử lại → đọc lại token, đừng tin đệm:
    // ca hỏng hay gặp nhất chính là token vừa hết hạn.
    authHeaderValue(retryKey > 0).then(v => {
      if (alive) setAuth({ forUri: current, value: v });
    });
    return () => { alive = false; };
  }, [current, needsAuth, retryKey]);

  const authValue = authReady && needsAuth ? auth.value : null;

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

  // Đang đọc token: giữ khung + vòng quay, KHÔNG vẽ <Image> vội (xem effect trên).
  if (current && !authReady) {
    return (
      <View style={[containerStyle ?? (style as StyleProp<ViewStyle>), styles.wrap]}>
        <View style={styles.center}>
          <ActivityIndicator size="small" />
        </View>
      </View>
    );
  }

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
        // `headers` đi thẳng xuống tầng native (Fresco/NSURLCache) — token KHÔNG
        // bao giờ nằm trong URL, nên không lọt vào log hay lịch-sử.
        // Đánh đổi đã biết: đệm ảnh native đánh theo URL chứ không theo header,
        // nên ảnh tải lúc van mở có thể còn hiện sau khi van đóng. Đó là đệm phía
        // máy, KHÔNG phải ranh giới bảo mật — đừng dựa vào nó.
        source={authValue ? { uri: current, headers: { Authorization: authValue } } : { uri: current }}
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
