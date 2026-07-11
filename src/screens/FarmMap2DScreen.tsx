/**
 * FarmMap2DScreen — BẢN-ĐỒ VƯỜN (native port của fmOpen/fmBuildSvg)
 *
 *  Cây trong vườn chiếu theo GPS ra mét (x_m,y_m) → auto-fit vào khung, giữ tỉ-lệ, tâm giữa,
 *  y_m hướng BẮC lên trên. Mỗi cây = chấm tròn (xanh nếu có quả định-danh, trắng-viền nếu chưa)
 *  + nhãn tên. Bấm 1 cây → mở sơ-đồ quả (TreeMap2D).
 *  Cây CHƯA có GPS → liệt-kê dưới bản-đồ (vẫn bấm mở được sơ-đồ).
 *
 *  KHÔNG dùng react-native-svg: khung/chấm = View + borderRadius + position:absolute.
 *  Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io). Cùng client fruitReIDService.
 *  Route params (RouteParams): farmId? (hiện backend /api/farm/layout không lọc theo farm — bỏ qua).
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ORILIFE_BASE } from '../services/orilifeBase';

import { COLORS } from '../constants';
import {
  getFarmLayout,
  type FarmLayoutResponse, type FarmTree,
} from '../services/fruitReIDService';

const BASE_URL = ORILIFE_BASE;

interface RouteParams { farmId?: string }

interface TreePlacement {
  tree: FarmTree;
  left: number; top: number; r: number;
  fill: string; stroke: string; name: string;
}

const FarmMap2DScreen: React.FC = () => {
  useRoute(); // farmId chưa dùng (backend trả toàn vườn) — giữ để orchestrator gắn route params.
  const navigation = useNavigation<any>();
  const { width: screenW } = useWindowDimensions();

  const [data, setData] = useState<FarmLayoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await getFarmLayout(BASE_URL);
    if (r.ok && r.data && r.data.ok) setData(r.data);
    else setError(r.error?.detail ?? 'Chưa tải được sơ đồ vườn. Thử lại sau.');
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => { setLoading(true); await load(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  const retry = useCallback(async () => { setLoading(true); await load(); setLoading(false); }, [load]);

  const openTree = useCallback((t: FarmTree) => {
    navigation.navigate('TreeMap2D', { treeId: t.tree_id, treeName: t.name || 'Cây' });
  }, [navigation]);

  const trees = data?.trees ?? [];
  const placedTrees = useMemo(() => trees.filter(t => t.x_m != null && t.y_m != null), [trees]);
  const noGpsTrees = useMemo(() => trees.filter(t => t.x_m == null || t.y_m == null), [trees]);

  // ── Khung bản-đồ (đo px màn) ────────────────────────────────────────────────
  const PAD = 26;
  const frameW = Math.min(screenW - 24, 360);
  const frameH = frameW; // vuông như web (340×340)

  // Auto-fit (x_m,y_m) vào khung, giữ tỉ-lệ, tâm giữa (port fmBuildSvg).
  const placements: TreePlacement[] = useMemo(() => {
    if (placedTrees.length === 0) return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    placedTrees.forEach(t => {
      const x = t.x_m as number, y = t.y_m as number;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    let spanX = maxX - minX, spanY = maxY - minY;
    if (!(spanX > 0)) spanX = 1;
    if (!(spanY > 0)) spanY = 1;
    const scale = Math.min((frameW - PAD * 2) / spanX, (frameH - PAD * 2) / spanY);
    const usedW = spanX * scale, usedH = spanY * scale;
    const offX = PAD + ((frameW - PAD * 2) - usedW) / 2;
    const offY = PAD + ((frameH - PAD * 2) - usedH) / 2;

    return placedTrees.map((t): TreePlacement => {
      const x = t.x_m as number, y = t.y_m as number;
      const px = offX + (x - minX) * scale;
      const py = offY + (maxY - y) * scale; // y_m lớn (bắc) → lên trên (py nhỏ)
      const named = (t.named_fruits || 0) > 0;
      const fill = named ? '#1B5E20' : '#FFFFFF';
      const stroke = named ? '#0F3D12' : '#1B5E20';
      const r = 9;
      return { tree: t, left: px - r, top: py - r, r, fill, stroke, name: t.name || 'Cây' };
    });
  }, [placedTrees, frameW, frameH]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Đang tải sơ đồ vườn…</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.container}>
        <Header onBack={() => navigation.goBack()} />
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

  const namedTreeCount = trees.filter(t => (t.named_fruits || 0) > 0).length;

  return (
    <View style={styles.container}>
      <Header onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.statRow}>
          <Text style={styles.statTxt}>🌳 {trees.length} cây</Text>
          <Text style={[styles.statTxt, styles.sNamed]}>🟢 {namedTreeCount} có quả định-danh</Text>
        </View>
        <Text style={styles.legend}>
          🟢 cây có quả đã định-danh · ⚪ cây chưa · bấm cây để xem sơ-đồ quả.
        </Text>

        {trees.length === 0 ? (
          <View style={styles.emptyNote}>
            <Icon name="sprout" size={32} color={COLORS.textMuted} />
            <Text style={styles.muted}>Chưa có cây nào trong vườn.</Text>
          </View>
        ) : placements.length > 0 ? (
          <View style={[styles.frame, { width: frameW, height: frameH }]}>
            <Text style={styles.northLabel}>⬆️ Bắc</Text>
            {placements.map(p => (
              <React.Fragment key={p.tree.tree_id}>
                <Text
                  numberOfLines={1}
                  style={[styles.dotName, { top: p.top - 13, left: p.left - 40, width: p.r * 2 + 80 }]}
                >
                  {p.name.slice(0, 12)}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => openTree(p.tree)}
                  style={[styles.dot, {
                    left: p.left, top: p.top, width: p.r * 2, height: p.r * 2,
                    borderRadius: p.r, backgroundColor: p.fill, borderColor: p.stroke,
                  }]}
                />
              </React.Fragment>
            ))}
          </View>
        ) : (
          <View style={styles.emptyNote}>
            <Icon name="map-marker-off" size={32} color={COLORS.textMuted} />
            <Text style={styles.muted}>Chưa có cây nào có vị-trí GPS để vẽ bản-đồ.</Text>
          </View>
        )}

        {/* Cây chưa có GPS — danh sách bấm mở sơ-đồ quả */}
        {noGpsTrees.length > 0 ? (
          <View style={styles.noGpsBox}>
            <Text style={styles.noGpsTitle}>📍 Chưa có vị-trí ({noGpsTrees.length} cây):</Text>
            {noGpsTrees.map(t => (
              <TouchableOpacity key={t.tree_id} style={styles.noGpsRow} activeOpacity={0.7} onPress={() => openTree(t)}>
                <Text style={styles.noGpsName} numberOfLines={1}>• {t.name || 'Cây chưa đặt tên'}</Text>
                <Text style={styles.noGpsGo}>🗺 sơ đồ</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const Header: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.back}>
      <Icon name="chevron-left" size={26} color={COLORS.text} />
    </TouchableOpacity>
    <Text style={styles.title} numberOfLines={1}>🌳 Sơ đồ vườn</Text>
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

  statRow: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', gap: 12, paddingVertical: 8, justifyContent: 'center' },
  statTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  sNamed: { color: COLORS.success },
  legend: { fontSize: 12, color: COLORS.textSub, textAlign: 'center', marginVertical: 6, paddingHorizontal: 4 },

  frame: { position: 'relative', borderRadius: 12, backgroundColor: '#EEF4EC', marginTop: 4 },
  northLabel: { position: 'absolute', top: 6, alignSelf: 'center', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#778899' },
  dot: { position: 'absolute', borderWidth: 2 },
  dotName: { position: 'absolute', fontSize: 9, fontWeight: '600', color: '#1A2E1A', textAlign: 'center' },

  emptyNote: { alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 20 },

  noGpsBox: { alignSelf: 'stretch', marginTop: 14, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#0000000d' },
  noGpsTitle: { fontSize: 13, fontWeight: '700', color: '#8A6100', marginBottom: 6 },
  noGpsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 8 },
  noGpsName: { flex: 1, fontSize: 14, color: COLORS.text },
  noGpsGo: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: COLORS.accent, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default FarmMap2DScreen;
