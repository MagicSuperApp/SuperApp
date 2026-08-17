// screens/TreeDriftScreen.tsx
//
// BIẾN THIÊN CỦA MỘT CÂY — "vùng nào trên cây bền, vùng nào hay đổi".
//
// Trả lời đúng câu người trồng hỏi sau vài tháng: *"cây thay lá hết rồi, máy còn
// nhận ra nó không?"* Kênh biến thiên THẤP là mỏ neo định danh; kênh CAO là chỗ
// nên chụp lại định kỳ.
//
// Máy chủ tính sẵn con số này từ lâu (`GET /api/tree_drift/{tree_id}`), app chưa
// hỏi lần nào. Tầng dịch vụ + bài kiểm đã có ở `services/treeDriftService.ts`;
// đây là màn còn thiếu.
//
// ── BA NHÁNH, KHÔNG PHẢI HAI ────────────────────────────────────────────────
// `not_enough_views` KHÔNG phải lỗi. Cây mới có 1 góc thì chưa có CẶP nào để đo
// — đó là một câu trả lời thật, và việc cần làm là *chụp thêm một góc*, không
// phải *thử lại*. Gộp nó vào nhánh lỗi là nói với người trồng rằng máy hỏng
// trong khi máy đang trả lời đúng. Ba nhánh dưới đây ra ba màn khác hẳn nhau.
//
// ── LUẬT CỦA MÀN NÀY ────────────────────────────────────────────────────────
// · Kênh nào máy chủ không gửi số thì để TRỐNG, không vẽ thanh 0%. Thanh 0% đọc
//   thành "kênh này hoàn toàn không đổi" — một kết luận mạnh, rút ra từ chỗ
//   không có phép đo nào.
// · `days_since_update === null` in "chưa rõ", KHÔNG in "0 ngày". "Cập nhật hôm
//   nay" và "không biết cập nhật bao giờ" là hai chuyện khác nhau.
// · `predict.message` là câu máy chủ soạn sẵn — hiện THẲNG. Tự ghép lại từ
//   `fast`/`stable` là viết lại kết luận của máy chủ bằng lời của app.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';

import { ORILIFE_BASE } from '../services/orilifeBase';
import {
  getTreeDrift, topDriftChannel, DRIFT_CHANNELS, DRIFT_LABEL_VI,
  type TreeDrift, type TreeDriftResult, type DriftChannel,
} from '../services/treeDriftService';
import {
  NATURE, SURFACE, TONE, TYPE, SPACE, RADIUS, ELEVATION, ORGANIC_CARD, TOUCH_MIN,
} from '../modules/trace/theme/depth';

export const TREE_DRIFT_ROUTE_NAME = 'TreeDrift';

interface RouteParams {
  treeId: string;
  /** Tên cây để hiện ở tiêu đề. Vắng thì hiện mã cây. */
  treeName?: string;
}

/**
 * Thanh biến thiên của một kênh.
 *
 * `value` là `1 − cosine` trung bình các cặp góc: 0 = mọi góc giống hệt nhau,
 * càng lớn càng đổi nhiều. Thực tế nằm gọn dưới 0,5 nên vẽ full-scale 0→1 thì
 * mọi thanh đều ngắn tũn và mắt không phân biệt được kênh nào hơn kênh nào —
 * dùng `scaleMax` là giá trị lớn nhất trong CHÍNH bảng này để so tương đối.
 *
 * Đổi lại, thanh dài nhất luôn chạm mép. Nên luôn in kèm SỐ THẬT: thanh để so
 * giữa các kênh với nhau, con số mới là phép đo.
 */
const DriftBar: React.FC<{
  channel: DriftChannel;
  value?: number;
  scaleMax: number;
  isTop: boolean;
}> = ({ channel, value, scaleMax, isTop }) => {
  const has = typeof value === 'number' && Number.isFinite(value);
  const pct = has && scaleMax > 0 ? Math.max(0.04, Math.min(1, value! / scaleMax)) : 0;

  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{DRIFT_LABEL_VI[channel]}</Text>
        {has ? (
          <Text style={[styles.barValue, isTop && styles.barValueTop]}>{value!.toFixed(3)}</Text>
        ) : (
          // Không có số thì nói KHÔNG CÓ SỐ. Đây là chỗ dễ mọc "vỏ im lặng" nhất
          // của màn: một thanh 0% trông y hệt một phép đo cho ra 0.
          <Text style={styles.barMissing}>chưa đo được</Text>
        )}
      </View>
      <View style={styles.barTrack}>
        {has && (
          <View
            style={[
              styles.barFill,
              { width: `${pct * 100}%` },
              isTop && { backgroundColor: TONE.sun },
            ]}
          />
        )}
      </View>
    </View>
  );
};

const TreeDriftScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const route = useRoute();
  const { treeId, treeName } = (route.params ?? {}) as RouteParams;

  const [result, setResult] = useState<TreeDriftResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getTreeDrift(ORILIFE_BASE, treeId);
    setResult(r);
    setLoading(false);
  }, [treeId]);

  useEffect(() => {
    if (treeId) load();
    else {
      // Mở màn mà không có mã cây là lỗi ĐIỀU HƯỚNG, không phải lỗi máy chủ —
      // nói đúng thế thay vì bắn một lượt gọi mạng chắc chắn hỏng.
      setResult({
        kind: 'error',
        error: { type: 'validation_error', detail: 'Thiếu mã cây', http_status: 0 },
      });
      setLoading(false);
    }
  }, [treeId, load]);

  const safeBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
      <TouchableOpacity onPress={safeBack} style={styles.backBtn} accessibilityLabel="Quay lại">
        <Icon name="chevron-left" size={28} color={NATURE.bark} />
      </TouchableOpacity>
      <View style={styles.headerMid}>
        <Text style={styles.headerTitle} numberOfLines={1}>Biến thiên của cây</Text>
        <Text style={styles.headerSub} numberOfLines={1}>{treeName || treeId || '—'}</Text>
      </View>
      <View style={{ width: 28 }} />
    </View>
  );

  // ── đang tải ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TONE.primary} />
          <Text style={styles.subtle}>Đang đo biến thiên giữa các góc chụp…</Text>
        </View>
      </View>
    );
  }

  // ── nhánh 2: chưa đủ góc để đo — KHÔNG phải lỗi ───────────────────────────
  if (result?.kind === 'not_enough_views') {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <View style={styles.center}>
          <Icon name="camera-plus-outline" size={54} color={TONE.primary} />
          <Text style={styles.emptyTitle}>Chưa đủ góc chụp để đo</Text>
          <Text style={styles.subtle}>
            Phép đo này so từng CẶP góc chụp với nhau, nên cây phải có ít nhất hai góc.
            Cây này chưa đủ — chưa có gì hỏng cả.
          </Text>
          <View style={styles.quoteBox}>
            <Text style={styles.quoteText}>{result.reason}</Text>
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('TreeVideo', { treeId })}
          >
            <Icon name="video-plus-outline" size={19} color="#fff" />
            <Text style={styles.primaryBtnText}>Bổ sung góc chụp</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={safeBack} style={styles.linkBtn}>
            <Text style={styles.linkText}>Để sau</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── nhánh 3: lỗi thật ─────────────────────────────────────────────────────
  if (result?.kind === 'error') {
    const net = result.error.type === 'network_error';
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <View style={styles.center}>
          <Icon
            name={net ? 'wifi-off' : 'alert-circle-outline'}
            size={54}
            color={TONE.danger}
          />
          <Text style={styles.emptyTitle}>
            {net ? 'Không nối được máy chủ' : 'Không xem được biến thiên'}
          </Text>
          <Text style={styles.subtle}>
            {net
              ? 'Mất sóng hoặc máy chủ không trả lời. Dữ liệu của cây vẫn nguyên.'
              : result.error.detail}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={load}>
            <Icon name="reload" size={19} color="#fff" />
            <Text style={styles.primaryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── nhánh 1: có số ────────────────────────────────────────────────────────
  const drift = (result as { kind: 'ok'; drift: TreeDrift }).drift;
  const top = topDriftChannel(drift);
  const values = DRIFT_CHANNELS.map((c) => drift.drift_per_channel[c]).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  const scaleMax = values.length ? Math.max(...values) : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {Header}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + SPACE.section }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Câu kết luận của MÁY CHỦ, hiện thẳng, không viết lại. */}
        <View style={styles.heroCard}>
          <Icon name="leaf-maple" size={26} color={TONE.primary} />
          <Text style={styles.heroText}>{drift.predict.message}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{drift.n_views}</Text>
            <Text style={styles.statLabel}>góc chụp</Text>
          </View>
          <View style={styles.statBox}>
            {/* `null` ≠ 0. Xem khối chú thích đầu tệp. */}
            {drift.days_since_update == null ? (
              <Text style={styles.statNumMissing}>chưa rõ</Text>
            ) : (
              <Text style={styles.statNum}>{drift.days_since_update}</Text>
            )}
            <Text style={styles.statLabel}>
              {drift.days_since_update == null ? 'lần cập nhật gần nhất' : 'ngày từ lần cập nhật'}
            </Text>
          </View>
        </View>

        <Text style={styles.section}>Biến thiên theo từng vùng</Text>
        <Text style={styles.sectionNote}>
          Số càng lớn, vùng đó càng đổi nhiều giữa các lần chụp. Thanh chỉ để so các vùng với
          nhau — con số mới là phép đo.
        </Text>
        <View style={styles.card}>
          {DRIFT_CHANNELS.map((c) => (
            <DriftBar
              key={c}
              channel={c}
              value={drift.drift_per_channel[c]}
              scaleMax={scaleMax}
              isTop={c === top}
            />
          ))}
        </View>

        {(drift.predict.stable?.length > 0 || drift.predict.fast?.length > 0) && (
          <>
            <Text style={styles.section}>Máy chủ đọc ra gì</Text>
            <View style={styles.card}>
              {drift.predict.stable?.length > 0 && (
                <View style={styles.readRow}>
                  <Icon name="anchor" size={20} color={TONE.primary} />
                  <View style={styles.readTextWrap}>
                    <Text style={styles.readTitle}>Vùng bền — mỏ neo định danh</Text>
                    <Text style={styles.readBody}>{drift.predict.stable.join(' · ')}</Text>
                  </View>
                </View>
              )}
              {drift.predict.fast?.length > 0 && (
                <View style={[styles.readRow, styles.readRowLast]}>
                  <Icon name="weather-windy" size={20} color={TONE.sun} />
                  <View style={styles.readTextWrap}>
                    <Text style={styles.readTitle}>Vùng hay đổi — nên chụp lại định kỳ</Text>
                    <Text style={styles.readBody}>{drift.predict.fast.join(' · ')}</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('TreeVideo', { treeId })}
        >
          <Icon name="video-plus-outline" size={19} color={TONE.primary} />
          <Text style={styles.secondaryBtnText}>Bổ sung góc chụp cho cây này</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingBottom: SPACE.md,
  },
  backBtn: { padding: SPACE.xs },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { ...TYPE.cardTitle },
  headerSub: { ...TYPE.caption, fontSize: 12 },

  scroll: { paddingHorizontal: SPACE.page },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACE.section, gap: SPACE.md,
  },
  subtle: { ...TYPE.body, textAlign: 'center' },
  emptyTitle: { ...TYPE.section, textAlign: 'center', marginTop: SPACE.xs },

  quoteBox: {
    backgroundColor: SURFACE.sunken, borderRadius: RADIUS.field,
    paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, marginTop: SPACE.xs,
  },
  quoteText: { ...TYPE.caption, fontStyle: 'italic', textAlign: 'center' },

  heroCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md,
    backgroundColor: TONE.primarySoft, ...ORGANIC_CARD,
    padding: SPACE.lg, marginTop: SPACE.sm,
  },
  heroText: { ...TYPE.body, flex: 1, color: NATURE.bark },

  statRow: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.lg },
  statBox: {
    flex: 1, backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    paddingVertical: SPACE.lg, paddingHorizontal: SPACE.md, alignItems: 'center', gap: SPACE.xs,
  },
  statNum: { ...TYPE.metricSm },
  statNumMissing: { ...TYPE.cardTitle, color: NATURE.barkSoft },
  statLabel: { ...TYPE.caption, fontSize: 13, textAlign: 'center' },

  section: { ...TYPE.section, marginTop: SPACE.section, marginBottom: SPACE.xs },
  sectionNote: { ...TYPE.caption, marginBottom: SPACE.md },

  card: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    padding: SPACE.lg, gap: SPACE.lg,
  },

  barRow: { gap: SPACE.sm },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barLabel: { ...TYPE.cardTitle, fontSize: 16 },
  barValue: { ...TYPE.caption, fontVariant: ['tabular-nums'], color: NATURE.bark },
  barValueTop: { color: TONE.sun, fontWeight: '700' },
  barMissing: { ...TYPE.caption, fontStyle: 'italic' },
  barTrack: {
    height: 10, borderRadius: RADIUS.chip, backgroundColor: SURFACE.sunken, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: RADIUS.chip, backgroundColor: TONE.primary },

  readRow: {
    flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start',
    paddingBottom: SPACE.lg, borderBottomWidth: 1, borderBottomColor: TONE.border,
  },
  readRowLast: { paddingBottom: 0, borderBottomWidth: 0 },
  readTextWrap: { flex: 1, gap: 2 },
  readTitle: { ...TYPE.cardTitle, fontSize: 15 },
  readBody: { ...TYPE.body, fontSize: 15 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: TONE.primary, borderRadius: RADIUS.field,
    paddingVertical: SPACE.lg, paddingHorizontal: SPACE.xxl, minHeight: TOUCH_MIN,
    marginTop: SPACE.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    borderWidth: 1.5, borderColor: TONE.primary, borderRadius: RADIUS.field,
    paddingVertical: SPACE.lg, minHeight: TOUCH_MIN, marginTop: SPACE.section,
  },
  secondaryBtnText: { color: TONE.primary, fontSize: 16, fontWeight: '700' },

  linkBtn: { minHeight: TOUCH_MIN, justifyContent: 'center' },
  linkText: { ...TYPE.body, color: NATURE.barkSoft },
});

export default TreeDriftScreen;
