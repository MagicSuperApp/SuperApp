/**
 * TreeViewer3DScreen — xem mô-hình 3D (point cloud + quả + khung xương) của cây.
 *
 * Backend field-reid dựng 3D (recon3d) và phục-vụ trang three.js tại GET /view/{code}.
 * Màn này nhúng trang đó bằng WebView (react-native-webview đã có sẵn trong app).
 *
 * Props qua navigation.route.params:
 *   { code: string, treeName?: string }
 *
 * UX (theo chuẩn OriLife): loading khi tải, báo lỗi thân-thiện khi mất mạng + nút thử lại,
 * KHÔNG hiện lỗi kỹ-thuật ra UI. Trang 3D là HTML công-khai (/view/{code}) nên không cần token.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { COLORS } from '../constants';

const BASE_URL: string =
  ORILIFE_BASE;

// Origin tin-cậy duy nhất = backend field-reid. originWhitelist=['*'] cho tải mọi domain
// → rủi ro thực thi mã độc qua WebView bridge (Thư báo 2026-06-17).
const ALLOWED_ORIGIN: string = BASE_URL.replace(/\/+$/, '');

type TreeViewer3DParams = { code: string; treeName?: string };
type TreeViewer3DRoute = RouteProp<{ TreeViewer3D: TreeViewer3DParams }, 'TreeViewer3D'>;

const TreeViewer3DScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<TreeViewer3DRoute>();
  const { code, treeName } = route.params ?? { code: '' };

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // 404 = cây public nhưng 3D CHƯA dựng xong (server trả HTML "đang dựng").
  // Tách khỏi lỗi mạng để không doạ người dùng bằng thông báo sai.
  const [notBuilt, setNotBuilt] = useState(false);

  // Mã cây có thể chứa ký-tự cần mã-hoá URL — luôn encode để an-toàn.
  const url = useMemo(
    () => `${BASE_URL}/view/${encodeURIComponent(code)}`,
    [code],
  );

  const reload = useCallback(() => {
    setFailed(false);
    setNotBuilt(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  // Chặn mọi điều hướng ra ngoài origin tin-cậy — chống redirect sang trang lạ.
  const onShouldStartLoadWithRequest = useCallback(
    (req: { url: string }) =>
      req.url === 'about:blank' || req.url.startsWith(`${ALLOWED_ORIGIN}/`),
    [],
  );

  if (!code) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Icon name="cube-outline" size={48} color={COLORS.textSub} />
          <Text style={styles.emptyText}>Cây này chưa có mã để xem mô-hình 3D.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {treeName ? `Mô hình 3D — ${treeName}` : 'Mô hình 3D cây'}
        </Text>
        <TouchableOpacity onPress={reload} hitSlop={12}>
          <Icon name="refresh" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.webWrap}>
        {!failed && !notBuilt && (
          <WebView
            ref={webRef}
            source={{ uri: url }}
            originWhitelist={[ALLOWED_ORIGIN]}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={(e) => {
              setLoading(false);
              // 404 → 3D chưa dựng xong (không phải lỗi mạng). Server field-reid trả
              // 404 kèm HTML "Mô hình 3D đang dựng hoặc chưa có" cho cây public.
              if (e?.nativeEvent?.statusCode === 404) {
                setNotBuilt(true);
              } else {
                setFailed(true);
              }
            }}
            style={styles.web}
          />
        )}

        {loading && !failed && !notBuilt && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Đang tải mô hình 3D…</Text>
          </View>
        )}

        {notBuilt && (
          <View style={styles.center}>
            <Icon name="cube-scan" size={48} color={COLORS.textSub} />
            <Text style={styles.emptyText}>
              Mô hình 3D đang được dựng hoặc chưa có. Hãy quét thêm ảnh và quay lại sau.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={reload}>
              <Text style={styles.btnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {failed && (
          <View style={styles.center}>
            <Icon name="wifi-off" size={48} color={COLORS.textSub} />
            <Text style={styles.emptyText}>
              Không tải được mô hình 3D. Kiểm tra mạng rồi thử lại.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={reload}>
              <Text style={styles.btnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.shadow,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginHorizontal: 12,
  },
  webWrap: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, color: COLORS.textSub, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: {
    marginTop: 12,
    color: COLORS.textSub,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: {
    marginTop: 20,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default TreeViewer3DScreen;
