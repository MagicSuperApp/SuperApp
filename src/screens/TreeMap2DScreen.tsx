/**
 * TreeMap2DScreen — SƠ-ĐỒ KHÔNG-GIAN 2.5D quả trên cây (native port của tvOpen/tvBuildSvg)
 *
 *  Thân cây dọc giữa + 3 BĂNG ngang (🍃 Tán / 🌲 Thân giữa / 🌰 Gốc) + chấm QUẢ tròn,
 *  màu theo trạng-thái (on_tree có-tên = xanh, chưa-tên = trắng-viền, harvested = vàng, lost = xám),
 *  đặt absolute theo pos_x × rộng-băng và pos_h × cao-băng. Panel thống-kê + mốc ngữ-cảnh.
 *  Bấm 1 chấm quả → mở timeline ảnh các góc (getFruitViews) trong modal cuối màn.
 *
 *  KHÔNG dùng react-native-svg (app chưa link svg → tránh thêm một bước link native):
 *    băng/thân/chấm = View + borderRadius + position:absolute + transform.
 *    Toán bố-trí (zone→băng, pos_x/pos_h→toạ-độ chấm, tvLocalH, tvDotColor) port nguyên từ web.
 *
 *  Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io). Cùng client fruitReIDService.
 *  Route params (RouteParams): treeId, treeName?
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ORILIFE_BASE } from '../services/orilifeBase';

import { COLORS } from '../constants';
import {
  getTreeLayout, getFruitViews,
  type TreeLayoutResponse, type TreeLayoutFruit, type TreeMarker,
  type FruitView, type TreeZone,
} from '../services/fruitReIDService';
import RemoteImage from '../components/RemoteImage';

const BASE_URL = ORILIFE_BASE;

interface RouteParams { treeId: string; treeName?: string }

// ── Băng-vùng (port bands của tvBuildSvg) — thứ tự TRÊN→DƯỚI: tán / thân / gốc ──
type Band = { zone: TreeZone; label: string; fill: string };
const BANDS: Band[] = [
  { zone: 'canopy', label: '🍃 Tán', fill: '#E3F1E0' },
  { zone: 'mid', label: '🌲 Thân giữa', fill: '#EEF6EC' },
  { zone: 'base', label: '🌰 Gốc', fill: '#F1EDE4' },
];
const ZONE_INDEX: Record<TreeZone, number> = { canopy: 0, mid: 1, base: 2 };
const ZONE_VI: Record<TreeZone, string> = { canopy: '🍃 Tán (ngọn)', mid: '🌲 Thân giữa', base: '🌰 Gốc' };

const SIDE_VI: Record<TreeMarker['side'], string> = {
  left: '⬅️ trái', right: '➡️ phải', front: '⬆️ trước', back: '⬇️ sau',
};

// Màu chấm theo trạng-thái + tên (port tvDotColor). Trả {fill,stroke}.
function dotColor(fu: TreeLayoutFruit): { fill: string; stroke: string } {
  const st = fu.status || 'on_tree';
  if (st === 'harvested') return { fill: '#F9A825', stroke: '#C98A00' };
  if (st === 'lost') return { fill: '#90A4AE', stroke: '#607D8B' };
  const named = !!(fu.name && String(fu.name).trim());
  return named ? { fill: '#1B5E20', stroke: '#0F3D12' } : { fill: '#FFFFFF', stroke: '#1B5E20' };
}

// pos_h toàn-cây (0..1) → vị-trí TRONG băng zone (0..1). Mỗi zone chiếm 1/3 dải pos_h
// (port tvLocalH): base=[0,0.34), mid=[0.34,0.67), canopy=[0.67,1].
function localH(zone: TreeZone, h: number): number {
  let lo = 0, hi = 1;
  if (zone === 'base') { lo = 0; hi = 0.34; }
  else if (zone === 'mid') { lo = 0.34; hi = 0.67; }
  else { lo = 0.67; hi = 1; }
  if (h <= lo) return 0;
  if (h >= hi) return 1;
  return (h - lo) / (hi - lo);
}

const fmtDate = (s?: string): string => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Toạ-độ + bán-kính 1 chấm trong khung (đo bằng px màn, không phải viewBox SVG).
interface DotPlacement {
  fruit: TreeLayoutFruit;
  left: number; top: number; r: number;
  fill: string; stroke: string; name: string;
}

const TreeMap2DScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { treeId, treeName } = (route.params ?? {}) as RouteParams;
  const { width: screenW } = useWindowDimensions();

  const [layout, setLayout] = useState<TreeLayoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timeline ảnh 1 quả (modal cuối màn).
  const [tlFruit, setTlFruit] = useState<TreeLayoutFruit | null>(null);
  const [tlViews, setTlViews] = useState<FruitView[]>([]);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await getTreeLayout(BASE_URL, treeId);
    if (r.ok && r.data && r.data.ok) setLayout(r.data);
    else setError(r.error?.detail ?? 'Chưa tải được sơ đồ cây. Thử lại sau.');
  }, [treeId]);

  React.useEffect(() => {
    let alive = true;
    (async () => { setLoading(true); await load(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  const retry = useCallback(async () => { setLoading(true); await load(); setLoading(false); }, [load]);

  // Bấm chấm quả → mở modal + tải timeline ảnh các góc.
  const openTimeline = useCallback(async (fruit: TreeLayoutFruit) => {
    setTlFruit(fruit);
    setTlViews([]);
    setTlError(null);
    setTlLoading(true);
    const r = await getFruitViews(BASE_URL, fruit.fruit_id);
    setTlLoading(false);
    if (r.ok && r.data) setTlViews(r.data.views ?? []);
    else setTlError(r.error?.detail ?? 'Mạng yếu — chưa tải được ảnh quả.');
  }, []);
  const closeTimeline = useCallback(() => { setTlFruit(null); setTlViews([]); setTlError(null); }, []);

  // ── Kích thước khung sơ-đồ (đo px màn, KHÔNG dùng viewBox) ──────────────────
  // Khung rộng theo màn (trừ lề), tỉ-lệ ~ W:H = 320:420 của web.
  const PAD = 14;                                  // lề trong khung
  const frameW = Math.min(screenW - 24, 360);      // khung không quá rộng trên tablet
  const innerW = frameW - PAD * 2;
  const frameH = Math.round(frameW * (420 / 320)); // giữ tỉ-lệ web
  const bandH = (frameH - PAD * 2) / 3;
  const trunkX = frameW / 2;

  // Bố-trí chấm quả: port vòng-lặp tvBuildSvg (zone→băng, rải đều quả thiếu pos_x).
  const placements: DotPlacement[] = useMemo(() => {
    const fruits = layout?.fruits ?? [];
    // Đếm quả thiếu pos_x theo băng → rải đều.
    const fbTotal: Record<TreeZone, number> = { canopy: 0, mid: 0, base: 0 };
    fruits.forEach(fu => {
      const z: TreeZone = fu.zone && ZONE_INDEX[fu.zone] != null ? fu.zone : 'mid';
      if (fu.pos_x == null) fbTotal[z]++;
    });
    const fbCount: Record<TreeZone, number> = { canopy: 0, mid: 0, base: 0 };

    return fruits.map((fu): DotPlacement => {
      const z: TreeZone = fu.zone && ZONE_INDEX[fu.zone] != null ? fu.zone : 'mid';
      const bandTop = PAD + bandH * ZONE_INDEX[z];

      // px ngang trong khung.
      let px: number;
      if (fu.pos_x != null) {
        px = PAD + Math.max(0, Math.min(1, fu.pos_x)) * innerW;
      } else {
        const n = fbTotal[z] || 1;
        const k = fbCount[z]++;
        px = PAD + innerW * ((k + 1) / (n + 1));
      }
      // tránh đè thân: đẩy ra nếu rơi đúng giữa.
      if (Math.abs(px - trunkX) < 13) px += px < trunkX ? -16 : 16;
      px = Math.max(PAD + 8, Math.min(frameW - PAD - 8, px));

      // py trong băng zone (cao = trên).
      let py: number;
      if (fu.pos_h != null) {
        const lh = localH(z, fu.pos_h);
        py = bandTop + (1 - lh) * (bandH - 10) + 5;
      } else {
        py = bandTop + bandH * 0.5;
      }

      const c = dotColor(fu);
      const nv = Math.max(1, fu.n_views || 1);
      const r = Math.max(6, Math.min(13, 5 + nv * 1.4)); // chấm to = nhiều góc ảnh
      const name = fu.name && String(fu.name).trim() ? fu.name : '';
      // left/top = mép-trên-trái của View tròn (tâm − r).
      return { fruit: fu, left: px - r, top: py - r, r, fill: c.fill, stroke: c.stroke, name };
    });
  }, [layout, bandH, innerW, frameW, frameH, trunkX]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Đang tải sơ đồ cây…</Text>
      </View>
    );
  }

  // ── Lỗi tải (mạng yếu/server) — khối lỗi + thử lại ──────────────────────────
  if (error && !layout) {
    return (
      <View style={styles.container}>
        <Header title={`🗺 ${treeName || 'Sơ đồ cây'}`} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Icon name="wifi-off" size={44} color={COLORS.warning} />
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity style={styles.cta} onPress={retry}>
            <Icon name="refresh" size={18} color="#fff" />
            <Text style={styles.ctaTxt}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tree = layout?.tree;
  const st = layout?.stats;
  const fruits = layout?.fruits ?? [];
  const markers = layout?.markers ?? [];
  const total = st?.total ?? fruits.length;
  const named = st?.named ?? 0;
  const onTree = st?.on_tree ?? 0;
  const unnamed = Math.max(0, onTree - named);
  const harvested = st?.harvested ?? 0;

  return (
    <View style={styles.container}>
      <Header title={`🗺 ${tree?.name || treeName || 'Sơ đồ cây'}`} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Thống kê */}
        <View style={styles.statRow}>
          <Text style={styles.statTxt}>🍈 {total} quả</Text>
          <Text style={[styles.statTxt, styles.sNamed]}>🟢 {named} định-danh</Text>
          <Text style={[styles.statTxt, styles.sUn]}>⚪ {unnamed} chưa</Text>
          <Text style={[styles.statTxt, styles.sHar]}>🟡 {harvested} thu-hoạch</Text>
        </View>

        {/* Mốc ngữ-cảnh */}
        {markers.length > 0 ? (
          <View style={styles.markerWrap}>
            {markers.map((m, i) => (
              <Text key={`${m.label}-${i}`} style={styles.markerChip} numberOfLines={1}>
                📌 {m.label || '?'}{m.side ? ` · ${SIDE_VI[m.side] ?? ''}` : ''}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Chú giải */}
        <Text style={styles.legend}>
          🟢 đã định-danh · ⚪ chưa đặt tên · 🟡 đã thu · ⚫ mất · chấm to = nhiều góc ảnh.
        </Text>

        {/* SƠ-ĐỒ 2.5D: 3 băng + thân + chấm quả */}
        <View style={[styles.frame, { width: frameW, height: frameH }]}>
          {/* băng-vùng */}
          {BANDS.map((b, i) => (
            <View
              key={b.zone}
              style={[styles.band, {
                left: PAD, top: PAD + bandH * i, width: innerW, height: bandH, backgroundColor: b.fill,
              }]}
            >
              <Text style={styles.bandLabel}>{b.label}</Text>
            </View>
          ))}

          {/* thân cây dọc giữa */}
          <View style={[styles.trunk, { left: trunkX - 9, top: PAD, height: frameH - PAD * 2 }]} />

          {/* chấm quả + nhãn tên */}
          {placements.map(p => (
            <React.Fragment key={p.fruit.fruit_id}>
              {p.name ? (
                <Text
                  numberOfLines={1}
                  style={[styles.dotName, {
                    top: p.top - 15, left: p.left - 40, width: p.r * 2 + 80,
                  }]}
                >
                  {p.name.slice(0, 12)}
                </Text>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => openTimeline(p.fruit)}
                style={[styles.dot, {
                  left: p.left, top: p.top, width: p.r * 2, height: p.r * 2,
                  borderRadius: p.r, backgroundColor: p.fill, borderColor: p.stroke,
                }]}
              />
            </React.Fragment>
          ))}
        </View>

        {/* Empty: cây chưa có quả → khung trống có nhãn băng (đã vẽ trên) + dòng nhắc */}
        {fruits.length === 0 ? (
          <View style={styles.emptyNote}>
            <Icon name="sprout" size={32} color={COLORS.textMuted} />
            <Text style={styles.muted}>Cây này chưa có quả nào được gắn — sơ-đồ trống theo 3 băng Gốc/Thân/Tán.</Text>
          </View>
        ) : (
          <Text style={styles.tip}>Bấm 1 chấm quả để xem ảnh các góc theo thời gian.</Text>
        )}
      </ScrollView>

      {/* Timeline ảnh 1 quả (modal cuối màn) */}
      <Modal visible={tlFruit !== null} transparent animationType="slide" onRequestClose={closeTimeline}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                🍈 {tlFruit?.name?.trim() || 'Quả chưa đặt tên'}
              </Text>
              <TouchableOpacity onPress={closeTimeline} style={styles.sheetClose}>
                <Icon name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            {tlFruit?.zone ? (
              <Text style={styles.sheetMeta}>
                {ZONE_VI[tlFruit.zone]} · {tlViews.length} lần cập-nhật
              </Text>
            ) : null}

            {tlLoading ? (
              <View style={styles.sheetCenter}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.muted}>Đang tải ảnh quả…</Text>
              </View>
            ) : tlError ? (
              <View style={styles.sheetCenter}>
                <Icon name="wifi-off" size={34} color={COLORS.warning} />
                <Text style={styles.muted}>{tlError}</Text>
                {tlFruit ? (
                  <TouchableOpacity style={styles.cta} onPress={() => openTimeline(tlFruit)}>
                    <Icon name="refresh" size={16} color="#fff" />
                    <Text style={styles.ctaTxt}>Thử lại</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : tlViews.length === 0 ? (
              <View style={styles.sheetCenter}>
                <Text style={styles.muted}>Chưa có ảnh nào cho quả này.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tlRow}>
                {tlViews.map((v, i) => (
                  <View key={`${v.url ?? 'noimg'}-${i}`} style={styles.tlCard}>
                    <RemoteImage
                      uri={v.url ? (v.url.startsWith('http') ? v.url : `${BASE_URL}${v.url}`) : null}
                      style={styles.tlImg}
                      containerStyle={[styles.tlImg, styles.tlImgPh]}
                      resizeMode="cover"
                      placeholder={<Icon name="image-off" size={24} color={COLORS.textMuted} />}
                    />
                    <Text style={styles.tlDate}>{fmtDate(v.enrolled_at)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const Header: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.back}>
      <Icon name="chevron-left" size={26} color={COLORS.text} />
    </TouchableOpacity>
    <Text style={styles.title} numberOfLines={1}>{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  muted: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  scroll: { paddingHorizontal: 12, paddingBottom: 28, alignItems: 'center' },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', gap: 10, paddingVertical: 8, justifyContent: 'center' },
  statTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  sNamed: { color: COLORS.success },
  sUn: { color: COLORS.textSub },
  sHar: { color: COLORS.warning },

  markerWrap: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', gap: 6, marginBottom: 4, justifyContent: 'center' },
  markerChip: {
    fontSize: 12, color: '#8A6100', fontWeight: '600',
    backgroundColor: '#FFF6E0', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3,
  },

  legend: { fontSize: 12, color: COLORS.textSub, textAlign: 'center', marginVertical: 6, paddingHorizontal: 4 },

  frame: { position: 'relative', borderRadius: 14, backgroundColor: '#F7FAF6', marginTop: 4 },
  band: { position: 'absolute', borderRadius: 10 },
  bandLabel: { position: 'absolute', left: 8, top: 6, fontSize: 12, fontWeight: '700', color: '#33502F' },
  trunk: { position: 'absolute', width: 18, borderRadius: 9, backgroundColor: '#8D6E63', opacity: 0.55 },
  dot: { position: 'absolute', borderWidth: 2 },
  dotName: { position: 'absolute', fontSize: 9, fontWeight: '600', color: '#1A2E1A', textAlign: 'center' },

  emptyNote: { alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 20 },
  tip: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 10 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: COLORS.accent, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Timeline sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 24, maxHeight: '70%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.text },
  sheetClose: { padding: 4 },
  sheetMeta: { fontSize: 13, color: COLORS.textSub, marginTop: 2, marginBottom: 8 },
  sheetCenter: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 28 },
  tlRow: { gap: 10, paddingVertical: 6 },
  tlCard: { width: 116, alignItems: 'center' },
  tlImg: { width: 116, height: 148, borderRadius: 10, backgroundColor: '#E7EDE7' },
  tlImgPh: { alignItems: 'center', justifyContent: 'center' },
  tlDate: { fontSize: 12, color: COLORS.textSub, marginTop: 4 },
});

export default TreeMap2DScreen;
