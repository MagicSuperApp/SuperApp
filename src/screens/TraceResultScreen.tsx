// screens/TraceResultScreen.tsx
//
// MÀN KẾT QUẢ TRA MÃ — góc NGƯỜI MUA, không đăng nhập.
//
// VÌ SAO có màn riêng, dù `traceScan.ts` từng ghi "KHÔNG dựng màn provenance mới":
// dòng đó viết khi tin rằng `TreeDetail` dùng lại được. Đọc lại thì không:
// `TreeDetailScreen` tra cây trong Redux `state.farm.trees` (dòng 271-281) — tức
// vườn của CHÍNH người đang đăng nhập. Người mua quét mã trên bao bì không có cây
// nào trong store, nên đưa họ sang đó là chắc chắn ra màn "không tìm thấy" trong
// khi máy chủ vừa trả về đủ hồ sơ. Màn này hiển thị ĐÚNG cái cửa công khai trả về.
//
// Nguồn dữ liệu: `provenanceService` (đã có bài kiểm ở `provenanceService.test.ts`).
// Cửa `/api/tree_by_code/{code}` và `/api/provenance/{tree_id}` đều CÔNG KHAI —
// màn này KHÔNG gọi `ensureOrilifeToken`, chạy được khi chưa đăng nhập.
//
// LUẬT CỦA MÀN NÀY: không có số thì để trống, không điền số thay máy chủ.
//  · `not_public` là một CÂU TRẢ LỜI (cây riêng tư HOẶC không có — máy chủ cố ý gộp
//    hai ca, spec rọc-phách §18) → nói đúng cả hai khả năng, KHÔNG nói "không tồn tại".
//  · lỗi mạng KHÔNG được hiện thành "mã không hợp lệ" — đó là bịa câu trả lời từ một
//    phép đo hỏng. Nhánh riêng, có nút thử lại.
//  · số ảnh gọi ĐÚNG TÊN "góc chụp lúc đăng ký", không gọi là "số bằng chứng":
//    `images[] ↔ n_views ↔ embedding_hash` cùng mô tả MỘT tập góc lúc đăng ký
//    (thư OriLife 2026-08-17 §2, dẫn `server.py:1128`, `:3133`); lượt `verify_add`
//    và khung `tree_video` KHÔNG vào đó.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, API_BASE_URL } from '../constants';
import {
  getTreeByCode,
  getProvenance,
  gpsPrecision,
  gpsPrecisionLabelVi,
  isAnchored,
  imageViewUrl,
  type Provenance,
  type ProvenanceResult,
} from '../services/provenanceService';

export const TRACE_RESULT_ROUTE_NAME = 'TraceResult';

interface RouteParams {
  /** Mã in trên bao bì (`ORI-…`). Một trong hai tham số, ưu tiên mã. */
  code?: string;
  /** `tree_id` khi tới từ deep-link đã biết id. */
  treeId?: string;
}

type State =
  | { s: 'loading' }
  | { s: 'ok'; prov: Provenance }
  | { s: 'not_public' }
  | { s: 'error'; detail: string };

/** Ngày giờ máy chủ → câu tiếng Việt. Chuỗi lạ thì trả `null`, không in chuỗi thô. */
function formatVi(iso?: string): string | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const TraceResultScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const route = useRoute();
  const params = route.params as RouteParams | undefined;
  const code = params?.code?.trim() || '';
  const treeId = params?.treeId?.trim() || '';

  const [state, setState] = useState<State>({ s: 'loading' });

  const load = useCallback(async () => {
    setState({ s: 'loading' });
    let r: ProvenanceResult;
    if (code) r = await getTreeByCode(API_BASE_URL, code);
    else if (treeId) r = await getProvenance(API_BASE_URL, treeId);
    else {
      // Không tham số nào — lỗi của chỗ điều hướng, không phải của máy chủ.
      setState({ s: 'error', detail: 'Thiếu mã cây' });
      return;
    }
    if (r.kind === 'ok') setState({ s: 'ok', prov: r.provenance });
    else if (r.kind === 'not_public') setState({ s: 'not_public' });
    else setState({ s: 'error', detail: r.error.detail });
  }, [code, treeId]);

  useEffect(() => {
    load();
  }, [load]);

  const safeBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={safeBack} style={styles.backBtn} accessibilityLabel="Đóng">
        <Icon name="chevron-left" size={26} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Nguồn gốc</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  if (state.s === 'loading') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.subtle}>Đang tra máy chủ…</Text>
        </View>
      </View>
    );
  }

  // `not_public`: máy chủ CỐ Ý gộp "cây riêng tư" với "không có mã này" vào cùng
  // một câu trả lời, để mã lộ trên bao bì không dò được vườn riêng của người khác.
  // App không biết là ca nào ⇒ nói cả hai, không chọn bừa một.
  if (state.s === 'not_public') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <Icon name="lock-outline" size={52} color={COLORS.accentLight} />
          <Text style={styles.title}>Không xem được hồ sơ này</Text>
          <Text style={styles.subtle}>
            Mã có thể thuộc một cây chủ vườn để riêng tư, hoặc chưa có trong hệ thống.
            Máy chủ không phân biệt hai trường hợp này.
          </Text>
          {!!code && (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>MÃ ĐÃ TRA</Text>
              <Text style={styles.codeVal}>{code}</Text>
            </View>
          )}
          <TouchableOpacity onPress={safeBack}>
            <Text style={styles.linkText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Lỗi mạng/máy chủ — KHÁC hẳn `not_public`. Gộp hai cái này lại là nói với người
  // mua rằng mã sai trong khi thật ra mình chưa hỏi được máy chủ.
  if (state.s === 'error') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <Icon name="wifi-off" size={52} color={COLORS.accentLight} />
          <Text style={styles.title}>Chưa tra được</Text>
          <Text style={styles.subtle}>
            Chưa hỏi được máy chủ nên chưa biết mã này có hồ sơ hay không.
          </Text>
          <Text style={styles.errDetail}>{state.detail}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={load}>
            <Icon name="reload" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Thử lại</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={safeBack}>
            <Text style={styles.linkText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const p = state.prov;
  const prec = gpsPrecision(p);
  const gpsLine = gpsPrecisionLabelVi(prec, p.gps_precision_m);
  const anchored = isAnchored(p);
  const planted = formatVi(p.created_at);
  const images = Array.isArray(p.images) ? p.images : [];
  const thumb = images.length ? imageViewUrl(p, images[0]?.cid) : null;

  return (
    <View style={styles.root}>
      {Header}
      <ScrollView contentContainerStyle={styles.body}>
        {!!thumb && <Image source={{ uri: thumb }} style={styles.hero} resizeMode="cover" />}

        <Text style={styles.treeName}>{p.name?.trim() || 'Cây chưa đặt tên'}</Text>
        {!!p.code && <Text style={styles.codeInline}>{p.code}</Text>}

        <View style={styles.card}>
          <Row icon="calendar-blank-outline" label="Ghi nhận" value={planted} />
          <Row icon="map-marker-radius-outline" label="Vị trí" value={gpsLine} />
          {/* Tên đúng của con số: đây là số GÓC lúc đăng ký, KHÔNG phải số bằng chứng
              tích luỹ. Gọi sai tên là làm hồ sơ trông dày hơn thực tế. */}
          <Row
            icon="image-multiple-outline"
            label="Góc chụp lúc đăng ký"
            value={images.length ? String(images.length) : null}
          />
          {/* `isAnchored` trả `null` khi máy chủ không nói gì — ba nhánh, không hai. */}
          <Row
            icon="link-variant"
            label="Neo lên chuỗi"
            value={anchored === null ? null : anchored ? 'Đã neo' : 'Chưa neo'}
          />
        </View>

        <Text style={styles.foot}>
          Hồ sơ do máy chủ OriLife cung cấp. Mục nào để trống là mục máy chủ chưa cho biết —
          app không tự điền.
        </Text>
      </ScrollView>
    </View>
  );
};

/** Một dòng thông tin. `value === null` ⇒ hiện "chưa có" chứ không bịa. */
const Row = ({ icon, label, value }: { icon: string; label: string; value: string | null }) => (
  <View style={styles.row}>
    <Icon name={icon} size={18} color={COLORS.accent} style={{ marginTop: 2 }} />
    <View style={{ flex: 1 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, value === null && styles.rowValueEmpty]}>
        {value === null ? 'Máy chủ chưa cho biết' : value}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  hero: { width: '100%', height: 200, borderRadius: 16, backgroundColor: COLORS.card },
  treeName: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  codeInline: { fontSize: 13, color: COLORS.textMuted, marginTop: -8, letterSpacing: 0.5 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowLabel: { fontSize: 12, color: COLORS.textMuted, letterSpacing: 0.3 },
  rowValue: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  rowValueEmpty: { fontWeight: '400', color: COLORS.textMuted, fontStyle: 'italic' },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  subtle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  errDetail: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  foot: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18, marginTop: 4 },
  codeCard: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', gap: 4, maxWidth: '100%',
  },
  codeLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1 },
  codeVal: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkText: { color: COLORS.accentLight, fontSize: 14, marginTop: 4 },
});

export default TraceResultScreen;
