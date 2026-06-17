/**
 * FruitListScreen — Quả của 1 cây: thống-kê + danh-sách + gán LOÀI (native, phase 2a)
 *
 *  - GET /api/tree/{id}/layout → loài + thống-kê (tổng/định-danh/thu-hoạch) + danh-sách quả
 *  - GET /api/species/catalog → bộ chọn loài (gán cho cây cũ chưa rõ loài)
 *  - POST /api/tree/set_species → đặt loài → nạp lại (ẩn/hiện theo loài có-quả)
 *  Backend = field-reid (ORILIFE_API_BASE_URL = test.orilife.io). Chưa có cropper/3D (phase sau).
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
  Alert, Platform, PermissionsAndroid, Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { launchCamera, launchImageLibrary, type CameraOptions } from 'react-native-image-picker';
import { ORILIFE_API_BASE_URL } from '@env';

import { COLORS } from '../constants';
import {
  getTreeLayout, getSpeciesCatalog, setTreeSpecies,
  type TreeLayoutResponse, type TreeLayoutFruit, type SpeciesCatalog,
  type FruitStatus, type TreeZone,
} from '../services/fruitReIDService';

const BASE_URL = (ORILIFE_API_BASE_URL as string | undefined) ?? 'https://test.orilife.io';

const STATUS_VI: Record<FruitStatus, string> = { on_tree: 'Trên cây', harvested: 'Đã thu', lost: 'Mất' };
const STATUS_COLOR: Record<FruitStatus, string> = { on_tree: COLORS.success, harvested: COLORS.warning, lost: COLORS.textMuted };
const ZONE_VI: Record<TreeZone, string> = { base: 'Gốc', mid: 'Thân giữa', canopy: 'Tán' };

interface RouteParams { treeId: string; treeName?: string }

const FruitListScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { treeId, treeName } = (route.params ?? {}) as RouteParams;

  const [layout, setLayout] = useState<TreeLayoutResponse | null>(null);
  const [catalog, setCatalog] = useState<SpeciesCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [lay, cat] = await Promise.all([
      getTreeLayout(BASE_URL, treeId),
      getSpeciesCatalog(BASE_URL),
    ]);
    if (lay.ok && lay.data) setLayout(lay.data);
    else setError(lay.error?.detail ?? 'Không tải được dữ liệu cây.');
    if (cat.ok && cat.data) setCatalog(cat.data);
  }, [treeId]);

  // Nạp lần đầu (có spinner) + nạp-lại IM LẶNG mỗi lần màn được focus lại
  // (sau khi khoanh quả ở cropper quay về → quả mới hiện ngay, không phải kéo refresh).
  const firstLoad = useRef(true);
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      if (firstLoad.current) setLoading(true);
      await load();
      if (alive && firstLoad.current) { setLoading(false); firstLoad.current = false; }
    })();
    return () => { alive = false; };
  }, [load]));

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // Thử tải lại (nút trong khối lỗi) — có spinner toàn màn để phản hồi rõ.
  const retry = useCallback(async () => { setLoading(true); await load(); setLoading(false); }, [load]);

  const pickSpecies = useCallback(async (speciesId: string) => {
    setSaving(true);
    const r = await setTreeSpecies(BASE_URL, treeId, speciesId);
    setSaving(false);
    if (r.ok) await load();
  }, [treeId, load]);

  // Xin quyền Camera (Android). iOS xin lúc launchCamera.
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      { title: 'Quyền Camera', message: 'Aladin cần Camera để chụp ảnh quả.', buttonPositive: 'Cho phép', buttonNegative: 'Từ chối' },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Cần quyền Camera', 'Vui lòng bật Camera trong Cài đặt.', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    return true;
  }, []);

  // Chọn ảnh (chụp/thư-viện) rồi mở cropper khung-tròn. imageW/H = pixel SAU resize
  // (asset.width/height đã theo maxWidth/maxHeight) → map-ngược vùng khung chuẩn.
  const openCropper = useCallback(async (fromCamera: boolean) => {
    const opts: CameraOptions = { mediaType: 'photo', quality: 0.8, maxWidth: 1600, maxHeight: 1600, saveToPhotos: false };
    const cb = (res: any) => {
      if (res.didCancel) return;
      if (res.errorCode) { Alert.alert('Lỗi ảnh', res.errorMessage || 'Không lấy được ảnh.'); return; }
      const a = res.assets?.[0];
      if (!a?.uri || !a.width || !a.height) { Alert.alert('Lỗi ảnh', 'Không đọc được kích thước ảnh — thử ảnh khác.'); return; }
      navigation.navigate('FruitCropper', {
        treeId,
        treeName: treeName || layout?.tree.name,
        imageUri: a.uri, imageW: a.width, imageH: a.height,
      });
    };
    if (fromCamera) { if (await requestCameraPermission()) launchCamera(opts, cb); }
    else { launchImageLibrary(opts, cb); }
  }, [navigation, treeId, treeName, layout, requestCameraPermission]);

  const promptAddFruit = useCallback(() => {
    Alert.alert('Thêm quả', 'Chọn nguồn ảnh để khoanh quả:', [
      { text: '📷 Chụp ảnh', onPress: () => openCropper(true) },
      { text: '🖼 Thư viện', onPress: () => openCropper(false) },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  }, [openCropper]);

  const speciesEntry = layout?.tree.species
    ? catalog?.species.find(s => s.id === layout.tree.species)
    : undefined;

  const renderFruit = ({ item }: { item: TreeLayoutFruit }) => {
    const thumb = item.thumbnail_url ? { uri: `${BASE_URL}${item.thumbnail_url}` } : undefined;
    return (
      <View style={styles.row}>
        {thumb
          ? <Image source={thumb} style={styles.thumb} resizeMode="cover" />
          : <View style={[styles.thumb, styles.thumbPh]}><Icon name="fruit-cherries" size={26} color={COLORS.textMuted} /></View>}
        <View style={styles.rowBody}>
          <Text style={styles.fname} numberOfLines={1}>{item.name || '(chưa đặt tên)'}</Text>
          <Text style={styles.fmeta}>
            {item.n_views} góc{item.zone ? ` · ${ZONE_VI[item.zone]}` : ''}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] }]}>
          <Text style={styles.badgeTxt}>{STATUS_VI[item.status]}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.accent} /><Text style={styles.muted}>Đang tải quả…</Text></View>;
  }

  const stats = layout?.stats;
  const fruits = layout?.fruits ?? [];
  const noFruitSpecies = speciesEntry && speciesEntry.has_fruit === false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>🥥 Quả · {treeName || layout?.tree.name || 'Cây'}</Text>
        <TouchableOpacity
          style={styles.mapBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('TreeMap2D', { treeId, treeName: treeName || layout?.tree.name })}
        >
          <Icon name="map-outline" size={16} color="#fff" />
          <Text style={styles.mapBtnTxt}>Sơ đồ cây</Text>
        </TouchableOpacity>
      </View>

      {/* Loài + bộ chọn loài (cây chưa rõ loài) */}
      <View style={styles.speciesBox}>
        {speciesEntry
          ? <Text style={styles.speciesChip}>🌿 {speciesEntry.name_vi}</Text>
          : <Text style={styles.muted}>Chưa rõ loài — chọn để hệ biết cây có quả hay không:</Text>}
        {!speciesEntry && catalog?.species?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spRow}>
            {catalog.species.map(s => (
              <TouchableOpacity key={s.id} style={styles.spBtn} disabled={saving} onPress={() => pickSpecies(s.id)}>
                <Text style={styles.spBtnTxt}>{s.name_vi}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {/* Thống kê */}
      {stats ? (
        <View style={styles.statsRow}>
          <Stat label="Tổng" value={stats.total} />
          <Stat label="Định-danh" value={stats.named} color={COLORS.success} />
          <Stat label="Thu hoạch" value={stats.harvested} color={COLORS.warning} />
        </View>
      ) : null}

      {/* Lỗi PHỤ (đã có dữ liệu nhưng thao tác sau lỗi) — lỗi-tải-chính dồn vào khối dưới */}
      {error && layout ? <Text style={styles.err}>{error}</Text> : null}

      {noFruitSpecies ? (
        <View style={styles.center}>
          <Icon name="leaf" size={40} color={COLORS.textMuted} />
          <Text style={styles.muted}>Loài {speciesEntry?.name_vi} không có quả thương phẩm — đặc-điểm ở thân/cành.</Text>
        </View>
      ) : (
        <FlatList
          data={fruits}
          keyExtractor={f => f.fruit_id}
          renderItem={renderFruit}
          contentContainerStyle={fruits.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            error && !layout ? (
              // Lỗi tải (mạng yếu/server) — KHÔNG để empty-state gây hiểu lầm "cây rỗng".
              <View style={styles.center}>
                <Icon name="wifi-off" size={40} color={COLORS.warning} />
                <Text style={styles.muted}>{error}</Text>
                <TouchableOpacity style={styles.emptyCta} onPress={retry}>
                  <Icon name="refresh" size={18} color="#fff" />
                  <Text style={styles.emptyCtaTxt}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.center}>
                <Icon name="sprout" size={40} color={COLORS.textMuted} />
                <Text style={styles.muted}>Cây này chưa có quả nào được gắn.</Text>
                <TouchableOpacity style={styles.emptyCta} onPress={promptAddFruit}>
                  <Icon name="plus-circle" size={18} color="#fff" />
                  <Text style={styles.emptyCtaTxt}>Khoanh quả đầu tiên</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* Nút nổi: chỉ hiện với loài CÓ quả (Sứ/loài không-quả → ẩn, nhất quán species-gating) */}
      {!noFruitSpecies && !loading ? (
        <TouchableOpacity style={styles.fab} activeOpacity={0.88} onPress={promptAddFruit}>
          <Icon name="plus" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <View style={styles.stat}>
    <Text style={[styles.statVal, color ? { color } : null]}>{value}</Text>
    <Text style={styles.statLbl}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  muted: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
  err: { color: COLORS.warning, fontSize: 13, paddingHorizontal: 16, paddingVertical: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, marginRight: 4 },
  mapBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  speciesBox: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  speciesChip: { alignSelf: 'flex-start', backgroundColor: COLORS.accentGlow, color: COLORS.accent, fontWeight: '700', fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  spRow: { flexDirection: 'row' },
  spBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, marginRight: 8 },
  spBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  stat: { alignItems: 'center', minWidth: 64 },
  statVal: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  statLbl: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  listEmpty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginTop: 8, gap: 11, borderWidth: 1, borderColor: '#0000000d' },
  thumb: { width: 54, height: 54, borderRadius: 9, backgroundColor: '#eef2ee' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  fname: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  fmeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 18, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: COLORS.accent, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
  },
  emptyCtaTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default FruitListScreen;
