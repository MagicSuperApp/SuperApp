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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { buildTree3D } from '../services/treeReIDService';
import { COLORS } from '../constants';
import rLog from '../services/remoteLogger';

const BASE_URL: string =
  ORILIFE_BASE;

// Origin tin-cậy duy nhất = backend field-reid. originWhitelist=['*'] cho tải mọi domain
// → rủi ro thực thi mã độc qua WebView bridge (Thư báo 2026-06-17).
const ALLOWED_ORIGIN: string = BASE_URL.replace(/\/+$/, '');

// Trang /view (server) nạp three.js từ unpkg qua <script type="importmap"> → BẮT BUỘC
// cho phép CDN này, nếu không `import 'three'` gãy → 3D không render (đen/trắng). Chỉ
// whitelist đúng CDN cần, KHÔNG mở '*' (giữ chống chèn mã độc qua WebView bridge).
const ALLOWED_CDNS: readonly string[] = ['https://unpkg.com'];

type TreeViewer3DParams = { code: string; treeName?: string; treeId?: string };
type TreeViewer3DRoute = RouteProp<{ TreeViewer3D: TreeViewer3DParams }, 'TreeViewer3D'>;

const TreeViewer3DScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<TreeViewer3DRoute>();
  const { code, treeName, treeId } = route.params ?? { code: '' };

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // 404 = cây public nhưng 3D CHƯA dựng xong (server trả HTML "đang dựng").
  // Tách khỏi lỗi mạng để không doạ người dùng bằng thông báo sai.
  const [notBuilt, setNotBuilt] = useState(false);
  // Chi tiết lỗi (mô tả iOS / HTTP status) — HIỆN lên UI để chẩn đoán tận nơi thay
  // vì "kiểm tra mạng" chung chung (vd cert SSL, 500, DNS...).
  const [errDetail, setErrDetail] = useState<string>('');
  // Trạng thái yêu cầu DỰNG 3D (POST build3d). Tách "đã xếp hàng" khỏi "đang dựng" (H-25).
  const [buildMsg, setBuildMsg] = useState<string>('');
  const [requesting, setRequesting] = useState(false);

  // Xếp cây vào làn dựng 3D của máy chủ. Server chỉ dựng khi làn provenance rảnh nên
  // building=true = "đã xếp hàng", KHÔNG hứa "đang dựng ngay" — nói đúng để đội không chờ mòn.
  const requestBuild = useCallback(async () => {
    if (!treeId || requesting) return;
    setRequesting(true);
    setBuildMsg('');
    const r = await buildTree3D(ORILIFE_BASE, treeId);
    setRequesting(false);
    if (r.ok && r.building) {
      setBuildMsg('Đã xếp cây vào hàng dựng 3D. Máy chủ dựng khi rảnh — quay lại sau ít phút rồi bấm "Thử lại".');
    } else if (r.noProvenance) {
      setBuildMsg('Cây chưa có xuất xứ (chưa đăng ký xong) nên chưa dựng được 3D.');
    } else if (r.error?.http_status === 401) {
      setBuildMsg('Phiên đăng nhập hết hạn. Hãy đăng nhập lại rồi thử.');
    } else {
      setBuildMsg('Chưa gửi được yêu cầu dựng. Thử lại sau ít phút.');
    }
  }, [treeId, requesting]);

  // Mã cây có thể chứa ký-tự cần mã-hoá URL — luôn encode để an-toàn.
  const url = useMemo(
    () => `${BASE_URL}/view/${encodeURIComponent(code)}`,
    [code],
  );

  // Trace mở màn 3D — nếu crash native, log cuối cùng cho biết đã tới đâu.
  useEffect(() => {
    rLog.viewer3d.webviewOpen(code ?? null, url);
    return () => rLog.viewer3d.webviewClose(code ?? null);
  }, [code, url]);

  const reload = useCallback(() => {
    setFailed(false);
    setNotBuilt(false);
    setErrDetail('');
    setBuildMsg('');
    setLoading(true);
    webRef.current?.reload();
  }, []);

  // Chặn điều hướng ra ngoài origin tin-cậy — chống redirect sang trang lạ. CHO PHÉP
  // thêm CDN three.js (unpkg) để viewer /view render được.
  const onShouldStartLoadWithRequest = useCallback(
    (req: { url: string }) =>
      req.url === 'about:blank' ||
      req.url.startsWith(`${ALLOWED_ORIGIN}/`) ||
      ALLOWED_CDNS.some((c) => req.url.startsWith(`${c}/`)),
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
            originWhitelist={[ALLOWED_ORIGIN, ...ALLOWED_CDNS]}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            // Giảm áp lực bộ nhớ WebGL: dùng layer phần cứng cho canvas 3D nặng.
            androidLayerType="hardware"
            onLoadStart={() => { setLoading(true); rLog.viewer3d.webviewLoadStart(url); }}
            onLoadEnd={() => { setLoading(false); rLog.viewer3d.webviewLoadEnd(url); }}
            onError={(e) => {
              setLoading(false);
              setFailed(true);
              const desc = e?.nativeEvent?.description ?? 'lỗi không rõ';
              setErrDetail(`Kết nối lỗi: ${desc}`);
              rLog.viewer3d.webviewLoadError(url, e?.nativeEvent?.description);
            }}
            onHttpError={(e) => {
              setLoading(false);
              const status = e?.nativeEvent?.statusCode;
              rLog.viewer3d.webviewHttpError(url, status);
              // 404 → 3D chưa dựng xong (không phải lỗi mạng). Server field-reid trả
              // 404 kèm HTML "Mô hình 3D đang dựng hoặc chưa có" cho cây public.
              if (status === 404) {
                setNotBuilt(true);
              } else {
                setErrDetail(`Máy chủ trả HTTP ${status ?? '?'}`);
                setFailed(true);
              }
            }}
            // ── CHỐNG CRASH APP: tiến trình renderer WebView chết (3D/WebGL hết RAM) ──
            // Android: KHÔNG xử lý onRenderProcessGone → CẢ APP CRASH. Xử lý ở đây =
            // log + hiện màn lỗi (reload) thay vì sập. Đây là nguyên nhân crash 3D hay gặp.
            onRenderProcessGone={(e: any) => {
              rLog.viewer3d.webviewRenderGone(url, e?.nativeEvent?.didCrash);
              setLoading(false);
              setFailed(true);
            }}
            // iOS: WKWebView content process bị hệ điều hành kill (bộ nhớ) → tránh sập.
            onContentProcessDidTerminate={() => {
              rLog.viewer3d.webviewProcessTerminated(url);
              setLoading(false);
              setFailed(true);
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
              Mô hình 3D chưa sẵn sàng.{'\n'}
              {treeId
                ? 'Bấm "Dựng 3D" để xếp cây vào hàng dựng của máy chủ.'
                : 'Hãy quét thêm ảnh và quay lại sau.'}
            </Text>
            {buildMsg ? <Text style={styles.buildMsgText}>{buildMsg}</Text> : null}
            {treeId ? (
              <TouchableOpacity style={styles.btn} onPress={requestBuild} disabled={requesting}>
                <Text style={styles.btnText}>{requesting ? 'Đang gửi…' : 'Dựng 3D'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.btnGhost} onPress={reload}>
              <Text style={styles.btnGhostText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {failed && (
          <View style={styles.center}>
            <Icon name="wifi-off" size={48} color={COLORS.textSub} />
            <Text style={styles.emptyText}>
              Không tải được mô hình 3D. Kiểm tra mạng rồi thử lại.
            </Text>
            {errDetail ? (
              <Text style={styles.errDetailText}>{errDetail}</Text>
            ) : null}
            <Text style={styles.errUrlText} numberOfLines={2}>
              {url}
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
  errDetailText: {
    marginTop: 10,
    color: '#c0392b',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  errUrlText: {
    marginTop: 6,
    color: COLORS.textSub,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  btn: {
    marginTop: 20,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  buildMsgText: {
    marginTop: 10,
    color: COLORS.textSub,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  btnGhost: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 10 },
  btnGhostText: { color: COLORS.accent, fontSize: 15, fontWeight: '600' },
});

export default TreeViewer3DScreen;
