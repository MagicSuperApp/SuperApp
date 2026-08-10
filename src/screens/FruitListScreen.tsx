/**
 * FruitListScreen — Quả của 1 cây: thống-kê + danh-sách + chi-tiết + gán LOÀI.
 *
 *  - GET /api/tree/{id}/layout → loài + thống-kê (tổng/định-danh/thu-hoạch) + danh-sách quả
 *  - GET /api/species/catalog → bộ chọn loài (gán cho cây cũ chưa rõ loài)
 *  - POST /api/tree/set_species → đặt loài → nạp lại (ẩn/hiện theo loài có-quả)
 *  - GET /api/fruit/{id}/views → ảnh các góc, hiện trong tấm CHI TIẾT QUẢ
 *  Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io).
 *
 * ── Giao diện ────────────────────────────────────────────────────────────────
 * Bộ icon dùng `components/Icon` (Font Awesome Solid) — KHÔNG emoji, không ký-tự
 * hình trong chuỗi (emoji hiển thị mỗi máy một kiểu và không đổi màu theo trạng
 * thái được). Nút + là `FAB` của react-native-paper, icon truyền bằng HÀM DỰNG
 * nên vẫn là icon của app chứ không kéo theo bộ font riêng của Paper.
 * Chọn nguồn ảnh và xem chi tiết quả đều dùng `BottomSheet` tự dựng thay cho
 * `Alert.alert` (xem lý do trong chính file đó).
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
  Alert, Platform, PermissionsAndroid, Linking,
} from 'react-native';
import { FAB } from 'react-native-paper';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { launchCamera, launchImageLibrary, type CameraOptions } from 'react-native-image-picker';
import { ORILIFE_BASE } from '../services/orilifeBase';

import { Icon } from '../components/Icon';
import BottomSheet from '../components/BottomSheet';
import { COLORS } from '../constants';
import {
  getTreeLayout, getSpeciesCatalog, setTreeSpecies, getFruitViews,
  type TreeLayoutResponse, type TreeLayoutFruit, type SpeciesCatalog,
  type FruitStatus, type TreeZone, type FruitView,
} from '../services/fruitReIDService';
import RemoteImage from '../components/RemoteImage';

const BASE_URL = ORILIFE_BASE;

const STATUS_VI: Record<FruitStatus, string> = { on_tree: 'On Tree', harvested: 'Harvested', lost: 'Lost' };
const STATUS_COLOR: Record<FruitStatus, string> = { on_tree: COLORS.success, harvested: COLORS.warning, lost: COLORS.textMuted };
const ZONE_VI: Record<TreeZone, string> = { base: 'Base', mid: 'Mid', canopy: 'Canopy' };

/** `enrolled_at` của server → ngày gọn. Chuỗi lạ thì trả rỗng chứ không "Invalid Date". */
function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

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

  // Tấm chọn nguồn ảnh (thay 3 nút của Alert) + tấm chi tiết 1 quả.
  const [sourceSheet, setSourceSheet] = useState(false);
  const [detail, setDetail] = useState<TreeLayoutFruit | null>(null);
  const [views, setViews] = useState<{ loading: boolean; items: FruitView[]; error: string | null }>(
    { loading: false, items: [], error: null },
  );

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
  // `forFruitId` có → mở cropper ở chế độ THÊM GÓC cho quả đó.
  const openCropper = useCallback(async (fromCamera: boolean, forFruitId?: string, forFruitName?: string) => {
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
        fruitId: forFruitId, fruitName: forFruitName,
      });
    };
    if (fromCamera) { if (await requestCameraPermission()) launchCamera(opts, cb); }
    else { launchImageLibrary(opts, cb); }
  }, [navigation, treeId, treeName, layout, requestCameraPermission]);

  /** Quả đang mở tấm chi tiết — giữ lại để tấm chọn ảnh biết đang thêm góc cho quả nào. */
  const addViewTarget = useRef<{ id: string; name: string } | null>(null);

  const openSourceSheet = useCallback((target?: { id: string; name: string }) => {
    addViewTarget.current = target ?? null;
    if (!target) { setSourceSheet(true); return; }
    // Mở từ tấm CHI TIẾT → đóng tấm đó rồi mới mở tấm chọn ảnh: hai `<Modal>`
    // chồng nhau hay nuốt thao tác của nhau trên cả iOS lẫn Android.
    setDetail(null);
    setTimeout(() => setSourceSheet(true), 220);
  }, []);

  const chooseSource = useCallback((fromCamera: boolean) => {
    const t = addViewTarget.current;
    setSourceSheet(false);
    // Đợi tấm đóng xong mới mở camera/thư-viện: mở chồng lên Modal đang đóng thì
    // trên Android bộ chọn ảnh có thể bị chính Modal nuốt mất.
    setTimeout(() => openCropper(fromCamera, t?.id, t?.name), 220);
  }, [openCropper]);

  const openDetail = useCallback(async (f: TreeLayoutFruit) => {
    setDetail(f);
    setViews({ loading: true, items: [], error: null });
    const r = await getFruitViews(BASE_URL, f.fruit_id);
    setViews(r.ok && r.data
      ? { loading: false, items: r.data.views ?? [], error: null }
      : { loading: false, items: [], error: r.error?.detail ?? 'Không tải được ảnh các góc.' });
  }, []);

  const speciesEntry = layout?.tree.species
    ? catalog?.species.find(s => s.id === layout.tree.species)
    : undefined;

  const renderFruit = ({ item }: { item: TreeLayoutFruit }) => {
    const thumb = item.thumbnail_url ? { uri: `${BASE_URL}${item.thumbnail_url}` } : undefined;
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openDetail(item)}>
        <RemoteImage
          uri={thumb?.uri}
          style={styles.thumb}
          containerStyle={[styles.thumb, styles.thumbPh]}
          resizeMode="cover"
          placeholder={<Icon name="apple-whole" size={22} color={COLORS.textMuted} />}
        />
        <View style={styles.rowBody}>
          <Text style={styles.fname} numberOfLines={1}>{item.name || 'Chưa đặt tên'}</Text>
          <View style={styles.rowMeta}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.status] }]} />
            <Text style={styles.fmeta} numberOfLines={1}>
              {STATUS_VI[item.status]} · {item.n_views} góc{item.zone ? ` · ${ZONE_VI[item.zone]}` : ''}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={14} color={COLORS.accentLight} />
      </TouchableOpacity>
    );
  };

  // Vào thẳng từ cổng xoè "Quét quả" thì KHÔNG có treeId (actionRegistry chỉ trỏ route,
  // không kèm tham số). Trước đây màn vẫn dựng rồi gọi getTreeLayout(undefined) → màn
  // trống bảo người dùng tự đi tìm đường khác. Nói thật và chỉ đường về màn chọn cây.
  if (!treeId) {
    return (
      <View style={styles.center}>
        <Icon name="apple-whole" size={40} color={COLORS.textMuted} />
        <Text style={styles.muted}>Hãy chọn cây trước, rồi mới xem quả của cây đó.</Text>
        <TouchableOpacity
          style={styles.pickTreeBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('TreeManagement')}
        >
          <Icon name="tree" size={16} color={COLORS.white} />
          <Text style={styles.pickTreeBtnText}>Chọn cây</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Đang tải quả…</Text>
      </View>
    );
  }

  const stats = layout?.stats;
  const fruits = layout?.fruits ?? [];
  const noFruitSpecies = speciesEntry && speciesEntry.has_fruit === false;

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Icon name="chevron-left" size={17} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headTitles}>
          <Text style={styles.eyebrow}>QUẢ TRÊN CÂY</Text>
          <Text style={styles.title} numberOfLines={1}>{treeName || layout?.tree.name || 'Cây'}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.75}
          accessibilityLabel="Sơ đồ 3D"
          onPress={() => navigation.navigate('Space3D', {
            mode: 'tree', treeId, treeName: treeName || layout?.tree.name,
          })}
        >
          <Icon name="cube" size={17} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Loài ───────────────────────────────────────────────────────────── */}
      {speciesEntry ? (
        <View style={styles.speciesRow}>
          <View style={styles.speciesChip}>
            <Icon name="leaf" size={11} color={COLORS.accent} />
            <Text style={styles.speciesChipTxt}>{speciesEntry.name_vi}</Text>
          </View>
        </View>
      ) : catalog?.species?.length ? (
        <View style={styles.speciesPick}>
          <Text style={styles.speciesHint}>Chưa rõ loài — chọn để hệ biết cây có quả hay không</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spRow}>
            {catalog.species.map(s => (
              <TouchableOpacity key={s.id} style={styles.spBtn} disabled={saving} onPress={() => pickSpecies(s.id)} activeOpacity={0.75}>
                <Text style={styles.spBtnTxt}>{s.name_vi}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Thống kê ───────────────────────────────────────────────────────── */}
      {stats ? (
        <View style={styles.statsCard}>
          <Stat label="Tổng" value={stats.total} />
          <View style={styles.statDivider} />
          <Stat label="Đã đặt tên" value={stats.named} color={COLORS.success} />
          <View style={styles.statDivider} />
          <Stat label="Thu hoạch" value={stats.harvested} color={COLORS.warning} />
        </View>
      ) : null}

      {/* Lỗi PHỤ (đã có dữ liệu nhưng thao tác sau lỗi) — lỗi-tải-chính dồn vào khối dưới */}
      {error && layout ? (
        <View style={styles.errBar}>
          <Icon name="triangle-exclamation" size={13} color={COLORS.warning} />
          <Text style={styles.errBarTxt} numberOfLines={2}>{error}</Text>
        </View>
      ) : null}

      {noFruitSpecies ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Icon name="leaf" size={26} color={COLORS.textMuted} /></View>
          <Text style={styles.emptyTitle}>Loài này không có quả</Text>
          <Text style={styles.muted}>
            {speciesEntry?.name_vi} không cho quả thương phẩm — đặc-điểm nhận dạng nằm ở thân/cành.
          </Text>
        </View>
      ) : (
        <FlatList
          data={fruits}
          keyExtractor={f => f.fruit_id}
          renderItem={renderFruit}
          contentContainerStyle={fruits.length ? styles.list : styles.listEmpty}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            error && !layout ? (
              // Lỗi tải (mạng yếu/server) — KHÔNG để empty-state gây hiểu lầm "cây rỗng".
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Icon name="wifi" size={24} color={COLORS.warning} /></View>
                <Text style={styles.emptyTitle}>Không tải được</Text>
                <Text style={styles.muted}>{error}</Text>
                <TouchableOpacity style={styles.cta} onPress={retry} activeOpacity={0.85}>
                  <Icon name="arrow-rotate-left" size={14} color={COLORS.white} />
                  <Text style={styles.ctaTxt}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Icon name="apple-whole" size={24} color={COLORS.accentLight} /></View>
                <Text style={styles.emptyTitle}>Chưa có quả nào</Text>
                <Text style={styles.muted}>Chụp hoặc chọn một tấm ảnh, khoanh quả vào vòng là xong.</Text>
                <TouchableOpacity style={styles.cta} onPress={() => openSourceSheet()} activeOpacity={0.85}>
                  <Icon name="crop-simple" size={14} color={COLORS.white} />
                  <Text style={styles.ctaTxt}>Khoanh quả đầu tiên</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* Nút nổi: chỉ hiện với loài CÓ quả (loài không-quả → ẩn, nhất quán species-gating) */}
      {!noFruitSpecies && !loading ? (
        <FAB
          // Icon truyền bằng hàm dựng → giữ bộ icon của app, không kéo theo font
          // MaterialCommunityIcons mà Paper dùng mặc định.
          icon={({ size, color }) => <Icon name="plus" size={size * 0.72} color={color} />}
          color={COLORS.white}
          style={styles.fab}
          onPress={() => openSourceSheet()}
          accessibilityLabel="Thêm quả"
        />
      ) : null}

      {/* ── Tấm chọn nguồn ảnh (thay Alert 3 nút) ──────────────────────────── */}
      <BottomSheet
        visible={sourceSheet}
        onClose={() => setSourceSheet(false)}
        title={addViewTarget.current ? 'Thêm góc ảnh' : 'Thêm quả'}
        subtitle={addViewTarget.current
          ? `Chụp thêm một góc cho “${addViewTarget.current.name}”.`
          : 'Chọn ảnh có quả, rồi khoanh quả vào vòng.'}
      >
        <SourceOption
          icon="camera"
          title="Chụp ảnh"
          desc="Mở máy ảnh và chụp trực tiếp"
          onPress={() => chooseSource(true)}
        />
        <SourceOption
          icon="images"
          title="Chọn từ thư viện"
          desc="Lấy ảnh đã có trong máy"
          onPress={() => chooseSource(false)}
        />
        <TouchableOpacity style={styles.sheetCancel} onPress={() => setSourceSheet(false)} activeOpacity={0.7}>
          <Text style={styles.sheetCancelTxt}>Huỷ</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ── Chi tiết 1 quả ─────────────────────────────────────────────────── */}
      <BottomSheet visible={detail != null} onClose={() => setDetail(null)}>
        {detail ? (
          <>
            <View style={styles.dHead}>
              <RemoteImage
                uri={detail.thumbnail_url ? `${BASE_URL}${detail.thumbnail_url}` : null}
                style={styles.dThumb}
                containerStyle={[styles.dThumb, styles.thumbPh]}
                resizeMode="cover"
                placeholder={<Icon name="apple-whole" size={26} color={COLORS.textMuted} />}
              />
              <View style={styles.dHeadBody}>
                <Text style={styles.dName} numberOfLines={2}>{detail.name || 'Chưa đặt tên'}</Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[detail.status] }]}>
                  <Text style={styles.statusPillTxt}>{STATUS_VI[detail.status]}</Text>
                </View>
              </View>
            </View>

            <View style={styles.dFacts}>
              <Fact icon="images" label="Góc ảnh" value={String(detail.n_views)} />
              <Fact icon="location-dot" label="Vị trí" value={detail.zone ? ZONE_VI[detail.zone] : '—'} />
              <Fact icon="calendar" label="Ghi nhận" value={shortDate(detail.enrolled_at) || '—'} />
            </View>

            <Text style={styles.dSection}>Ảnh các góc</Text>
            {views.loading ? (
              <ActivityIndicator color={COLORS.accent} style={styles.dStripLoading} />
            ) : views.error ? (
              <Text style={styles.dEmpty}>{views.error}</Text>
            ) : views.items.length === 0 ? (
              <Text style={styles.dEmpty}>Chưa có ảnh góc nào.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dStrip}>
                {/* Dải "Ảnh các góc": ngay trên đầu có chữ `Góc ảnh: N`. N ô trống mà
                    không một chữ giải thích đọc đúng như "mất ảnh". */}
                {views.items.map((v, i) => (
                  v.url ? (
                    <RemoteImage
                      key={`${v.url}-${i}`}
                      uri={/^https?:\/\//i.test(v.url) ? v.url : `${BASE_URL}${v.url}`}
                      style={styles.dShot}
                      containerStyle={[styles.dShot, styles.thumbPh]}
                      resizeMode="cover"
                      placeholder={<Icon name="image" size={20} color={COLORS.textMuted} />}
                    />
                  ) : null
                ))}
              </ScrollView>
            )}

            <View style={styles.dActions}>
              <TouchableOpacity
                style={styles.dGhostBtn}
                activeOpacity={0.8}
                onPress={() => {
                  const f = detail;
                  setDetail(null);
                  navigation.navigate('Space3D', {
                    mode: 'tree', treeId, treeName: treeName || layout?.tree.name, fruitId: f.fruit_id,
                  });
                }}
              >
                <Icon name="cube" size={14} color={COLORS.accent} />
                <Text style={styles.dGhostTxt}>3D Place</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dPrimaryBtn}
                activeOpacity={0.85}
                onPress={() => openSourceSheet({ id: detail.fruit_id, name: detail.name || 'quả này' })}
              >
                <Icon name="camera" size={14} color={COLORS.white} />
                <Text style={styles.dPrimaryTxt}>Thêm góc ảnh</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
};

// ── Mảnh nhỏ ────────────────────────────────────────────────────────────────

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <View style={styles.stat}>
    <Text style={[styles.statVal, color ? { color } : null]}>{value}</Text>
    <Text style={styles.statLbl}>{label}</Text>
  </View>
);

const Fact: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={styles.fact}>
    <Icon name={icon} size={13} color={COLORS.textMuted} />
    <Text style={styles.factVal} numberOfLines={1}>{value}</Text>
    <Text style={styles.factLbl}>{label}</Text>
  </View>
);

const SourceOption: React.FC<{ icon: string; title: string; desc: string; onPress: () => void }> = ({
  icon, title, desc, onPress,
}) => (
  <TouchableOpacity style={styles.srcOpt} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.srcIcon}><Icon name={icon} size={17} color={COLORS.accent} /></View>
    <View style={styles.srcBody}>
      <Text style={styles.srcTitle}>{title}</Text>
      <Text style={styles.srcDesc}>{desc}</Text>
    </View>
    <Icon name="chevron-right" size={13} color={COLORS.accentLight} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  muted: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  pickTreeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
  },
  pickTreeBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
  },
  headTitles: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.8, color: COLORS.textMuted },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4, marginTop: 1 },

  // Loài
  speciesRow: { paddingHorizontal: 16, paddingBottom: 12 },
  speciesChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGlow, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  speciesChipTxt: { color: COLORS.accent, fontWeight: '700', fontSize: 12 },
  speciesPick: { paddingBottom: 12, gap: 8 },
  speciesHint: { color: COLORS.textMuted, fontSize: 12, paddingHorizontal: 16 },
  spRow: { paddingHorizontal: 16, gap: 8 },
  spBtn: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.inputBg,
  },
  spBtnTxt: { color: COLORS.textSub, fontWeight: '700', fontSize: 13 },

  // Thống kê
  statsCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: COLORS.inputBg, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, paddingVertical: 14,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 21, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  statLbl: { fontSize: 11, color: COLORS.textMuted },
  statDivider: { width: 1, height: 26, backgroundColor: COLORS.border },

  errBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
  },
  errBarTxt: { flex: 1, color: COLORS.warning, fontSize: 12, lineHeight: 17 },

  // Danh sách
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  listEmpty: { flexGrow: 1 },
  sep: { height: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.inputBg },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  fname: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  fmeta: { flex: 1, fontSize: 12, color: COLORS.textMuted },

  // Rỗng / lỗi
  emptyIcon: {
    width: 60, height: 60, borderRadius: 20, marginBottom: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: COLORS.accent, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
  },
  ctaTxt: { color: COLORS.white, fontSize: 14, fontWeight: '700' },

  fab: {
    position: 'absolute', right: 18, bottom: 24,
    backgroundColor: COLORS.accent, borderRadius: 18,
  },

  // Tấm chọn nguồn ảnh
  srcOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 16, marginBottom: 8,
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
  },
  srcIcon: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentGlow,
  },
  srcBody: { flex: 1, minWidth: 0, gap: 2 },
  srcTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  srcDesc: { fontSize: 12, color: COLORS.textMuted },
  sheetCancel: { alignItems: 'center', paddingVertical: 13, marginTop: 2 },
  sheetCancelTxt: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },

  // Chi tiết quả
  dHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  dThumb: { width: 68, height: 68, borderRadius: 18, backgroundColor: COLORS.inputBg },
  dHeadBody: { flex: 1, minWidth: 0, gap: 7, alignItems: 'flex-start' },
  dName: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  statusPillTxt: { color: COLORS.white, fontSize: 11, fontWeight: '800' },

  dFacts: {
    flexDirection: 'row', backgroundColor: COLORS.inputBg, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12,
  },
  fact: { flex: 1, alignItems: 'center', gap: 3 },
  factVal: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  factLbl: { fontSize: 10, color: COLORS.textMuted },

  dSection: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: COLORS.textMuted, marginTop: 18, marginBottom: 8 },
  dStrip: { gap: 8, paddingRight: 8 },
  dStripLoading: { alignSelf: 'flex-start', marginVertical: 12 },
  dShot: { width: 88, height: 88, borderRadius: 14, backgroundColor: COLORS.inputBg },
  dEmpty: { fontSize: 13, color: COLORS.textMuted, paddingVertical: 8 },

  dActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  dGhostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
  },
  dGhostTxt: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  dPrimaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 14, backgroundColor: COLORS.accent,
  },
  dPrimaryTxt: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});

export default FruitListScreen;
