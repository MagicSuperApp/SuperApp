// screens/WebPageScreen.tsx
//
// Mở một trang web CỦA NHÀ MÌNH ngay trong app (hiện chỉ `aladin.work`).
//
// ── Ba điều màn này CỐ Ý KHÔNG làm ──────────────────────────────────────────
// 1. KHÔNG mở địa chỉ tuỳ ý. `isAllowedWebUrl` (src/utils/webLink.ts) quyết định,
//    và địa chỉ ngoài bảng thì màn này KHÔNG tự mở bằng trình duyệt hộ — nó nói ra
//    rằng không mở được. Tự mở hộ là biến một tham số sai thành hành vi trông-như-đúng.
// 2. KHÔNG chuyển phiên đăng nhập của app sang trang web. Chưa có thoả thuận bàn
//    giao phiên nào giữa app và aladin.work (đã tìm, không có). Vì vậy trang mở ở
//    chế độ KHÁCH, và màn nói thẳng câu đó (`web.notSignedIn`) thay vì để người
//    dùng tự đoán vì sao trang bảo họ chưa đăng nhập.
// 3. KHÔNG mở cửa sổ con (`setSupportMultipleWindows={false}`) và không cho điều
//    hướng ra ngoài bảng — bấm vào một liên kết ngoài thì đẩy sang trình duyệt của
//    máy, chứ không tải trong khung có cầu nối JavaScript của app.

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../theme';
import { t } from '../i18n';
import { useTk } from '../i18n/keys';
import { DEFAULT_INSTANCE } from '../config/instance.config';
import { ALLOWED_WEB_ORIGINS, APP_WEB_URL, isAllowedWebUrl } from '../utils/webLink';

type WebPageParams = { url?: string; title?: string; guestNote?: boolean };
type WebPageRoute = RouteProp<{ WebPage: WebPageParams }, 'WebPage'>;

const WebPageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<WebPageRoute>();
  const tk = useTk();

  // App chưa khai trang web thì đích mặc định là chuỗi rỗng — `isAllowedWebUrl`
  // trượt, và màn hiện đúng lời từ chối bên dưới. Cố ý không rơi về trang của
  // app khác: đó là lỗi vừa gỡ (xem `InstanceConfig.website`).
  const { url = APP_WEB_URL ?? '', title, guestNote = true } = route.params ?? {};
  const allowed = isAllowedWebUrl(url);

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Chi tiết lỗi thô (mô tả của hệ điều hành / mã HTTP) — hiện kèm câu tiếng Việt.
  // "Không mở được trang" một mình thì không ai chẩn được là DNS, chứng chỉ, hay 500.
  const [errDetail, setErrDetail] = useState('');

  const reload = useCallback(() => {
    setFailed(false);
    setErrDetail('');
    setLoading(true);
    webRef.current?.reload();
  }, []);

  const openOutside = useCallback(() => {
    Linking.openURL(url).catch(() => {
      setFailed(true);
      setErrDetail('Máy không mở được trình duyệt.');
    });
  }, [url]);

  // Điều hướng trong khung: chỉ cho phép trang nhà mình. Liên kết ra ngoài KHÔNG
  // tải ở đây — đẩy sang trình duyệt của máy, nơi người dùng nhìn thấy thanh địa chỉ.
  const onShouldStartLoadWithRequest = useCallback(
    (req: { url: string }) => {
      if (req.url === 'about:blank' || isAllowedWebUrl(req.url)) return true;
      Linking.openURL(req.url).catch(() => {});
      return false;
    },
    [],
  );

  // Tiêu đề rơi về TÊN MÁY CỦA APP ĐANG DỰNG, không về một tên máy gõ cứng.
  // Tới 2026-09-10 dòng này ghi `'aladin.work'`, nên trong app CheckFarm — vốn
  // khai `website: null`, tức LUÔN đi vào nhánh từ chối bên dưới — thanh tiêu đề
  // hiện tên miền của một doanh nghiệp khác, ở cả bốn ngôn ngữ (chuỗi đó không
  // có trong từ điển nên không lối dịch nào chạm tới).
  const fallbackTitle = DEFAULT_INSTANCE.website?.hosts[0] ?? '';

  // `open-in-new` CHỈ hiện khi địa chỉ đã qua phép kiểm. `openOutside` gọi
  // `Linking.openURL(url)` không lọc gì, nên bày nó trong nhánh TỪ CHỐI là dựng
  // đúng cái mà khối chú thích đầu tệp nói màn này không làm: một nút mở hộ,
  // đứng ngay dưới câu bảo rằng không mở được.
  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
        <Icon name="arrow-left" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title ?? fallbackTitle}
      </Text>
      {allowed && (
        <TouchableOpacity onPress={openOutside} hitSlop={12}>
          <Icon name="open-in-new" size={22} color={COLORS.text} />
        </TouchableOpacity>
      )}
    </View>
  );

  // Địa chỉ ngoài bảng: TỪ CHỐI và nói rõ. Không tự mở hộ bằng trình duyệt — chỗ gọi
  // truyền sai thì phải thấy mình sai.
  if (!allowed) {
    return (
      <SafeAreaView style={styles.root}>
        {header}
        <View style={styles.center}>
          <Icon name="shield-alert-outline" size={44} color={COLORS.warning} />
          <Text style={styles.errText}>
            {t('Địa chỉ này không nằm trong danh sách trang của {brand} nên app không mở.')}
          </Text>
          <Text style={styles.errDetail} numberOfLines={2}>{url}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {header}

      {guestNote && (
        <View style={styles.notice}>
          <Icon name="account-off-outline" size={16} color={COLORS.textSub} />
          <Text style={styles.noticeText}>{tk('web.notSignedIn')}</Text>
        </View>
      )}

      <View style={styles.webWrap}>
        {!failed && (
          <WebView
            ref={webRef}
            source={{ uri: url }}
            originWhitelist={ALLOWED_WEB_ORIGINS}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            // Không chia sẻ phiên: không bơm cookie/token nào của app vào đây.
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={(e) => {
              setLoading(false);
              setFailed(true);
              setErrDetail(e?.nativeEvent?.description ?? 'lỗi không rõ');
            }}
            onHttpError={(e) => {
              setLoading(false);
              const status = e?.nativeEvent?.statusCode;
              // 4xx/5xx của chính trang chủ = trang hỏng thật, không phải mạng.
              setFailed(true);
              setErrDetail(`Máy chủ trả HTTP ${status ?? '?'}`);
            }}
            style={styles.web}
          />
        )}

        {loading && !failed && (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{tk('web.loading')}</Text>
          </View>
        )}

        {failed && (
          <View style={styles.center}>
            <Icon name="wifi-off" size={44} color={COLORS.textMuted} />
            <Text style={styles.errText}>{tk('web.failed')}</Text>
            {!!errDetail && <Text style={styles.errDetail}>{errDetail}</Text>}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={reload}>
                <Text style={styles.btnText}>{tk('web.retry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={openOutside}>
                <Text style={[styles.btnText, styles.btnGhostText]}>{tk('web.openOutside')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.inputBg,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.textSub },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: { fontSize: 13, color: COLORS.textSub },
  errText: { fontSize: 14, lineHeight: 20, color: COLORS.text, textAlign: 'center' },
  errDetail: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
  },
  btnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.text },
});

export default WebPageScreen;
