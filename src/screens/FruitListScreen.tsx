/**
 * FruitListScreen — quả của MỘT cây: thống kê, danh sách, chi tiết, gán giống.
 *
 *  - GET  /api/tree/{id}/layout   → giống + thống kê + danh sách quả
 *  - GET  /api/species/catalog    → bộ chọn giống (gán cho cây cũ chưa rõ giống)
 *  - POST /api/tree/set_species   → đặt giống → nạp lại (ẩn/hiện theo giống có-quả)
 *  - GET  /api/fruit/{id}/views   → ảnh các góc, hiện trong tấm chi tiết
 *  Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io).
 *
 * ── Bố cục: lọc theo trạng thái, không phải một danh sách phẳng ─────────────
 * Bản cũ đổ cả trăm quả vào một danh sách, kèm ba con số thống kê ở trên mà bấm
 * vào không ra gì. Câu hỏi thật của nhà vườn luôn là "quả nào CÒN TRÊN CÂY" hoặc
 * "đã hái bao nhiêu rồi" — nên ba con số đó nay chính là **bộ lọc bấm được**, và
 * số hiện trên mỗi mục đếm đúng phần đang lọc.
 *
 * ── Chữ ─────────────────────────────────────────────────────────────────────
 * Bảng `STATUS_VI`/`ZONE_VI` của bản cũ tên là "VI" nhưng ruột lại là tiếng Anh
 * ("On Tree", "Harvested", "Base", "Canopy") — nhà vườn đọc màn tiếng Việt mà
 * gặp bốn chữ tiếng Anh. Nay cả hai đi qua khoá chữ.
 *
 * Bộ icon dùng `components/Icon` (Font Awesome Solid) — KHÔNG emoji, không ký tự
 * hình trong chuỗi. Nút nổi "thêm quả" tự dựng bằng `Pressable` thay cho `FAB`
 * của react-native-paper: FAB kéo theo hình khối tròn đều và bóng của Material,
 * lạc hẳn giữa các thẻ bo góc lệch ở đây.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  RefreshControl, ScrollView, Alert, Platform, PermissionsAndroid, Linking,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, type CameraOptions } from 'react-native-image-picker';

import { Icon } from '../components/Icon';
import BottomSheet from '../components/BottomSheet';
import RemoteImage from '../components/RemoteImage';
import { useTk } from '../i18n/keys';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { buildCaptureMeta, serializeCaptureMeta } from '../services/captureMeta';
import { TreeReIDBridge } from '../services/treeReIDNativeBridge';
import {
  getTreeLayout, getSpeciesCatalog, setTreeSpecies, getFruitViews,
  type TreeLayoutResponse, type TreeLayoutFruit, type SpeciesCatalog,
  type FruitStatus, type TreeZone, type FruitView,
} from '../services/fruitReIDService';
import { withPhotoSave } from '../services/mediaSavePermission';
import { GroundBackdrop } from '../modules/trace/components/layered/Organic';
import {
  ELEVATION, NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../modules/trace/theme/depth';

const BASE_URL = ORILIFE_BASE;

const STATUS_KEY: Record<FruitStatus, string> = {
  on_tree: 'trace.fruit.onTree',
  harvested: 'trace.fruit.harvested',
  lost: 'trace.fruit.lost',
};
const STATUS_TONE: Record<FruitStatus, string> = {
  on_tree: TONE.primary,
  harvested: TONE.sun,
  lost: NATURE.barkSoft,
};
const ZONE_KEY: Record<TreeZone, string> = {
  base: 'trace.zone.base', mid: 'trace.zone.mid', canopy: 'trace.zone.canopy',
};

/** Mục lọc trên đầu danh sách. `null` = không lọc. */
const FILTERS: { key: string; status: FruitStatus | null }[] = [
  { key: 'trace.fruitList.statAll', status: null },
  { key: 'trace.fruit.onTree', status: 'on_tree' },
  { key: 'trace.fruit.harvested', status: 'harvested' },
  { key: 'trace.fruit.lost', status: 'lost' },
];

/** `enrolled_at` của server → ngày gọn. Chuỗi lạ thì trả rỗng chứ không "Invalid Date". */
function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

interface RouteParams { treeId: string; treeName?: string; farmId?: string }

const FruitListScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tk = useTk();
  const { treeId, treeName, farmId } = (route.params ?? {}) as RouteParams;

  const [layout, setLayout] = useState<TreeLayoutResponse | null>(null);
  const [catalog, setCatalog] = useState<SpeciesCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FruitStatus | null>(null);

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
    const opts: CameraOptions = { mediaType: 'photo', quality: 0.8, maxWidth: 1600, maxHeight: 1600, saveToPhotos: true };
    const cb = async (res: any) => {
      if (res.didCancel) return;
      if (res.errorCode) { Alert.alert('Lỗi ảnh', res.errorMessage || 'Không lấy được ảnh.'); return; }
      const a = res.assets?.[0];
      if (!a?.uri || !a.width || !a.height) { Alert.alert('Lỗi ảnh', 'Không đọc được kích thước ảnh — thử ảnh khác.'); return; }
      // Siêu dữ liệu đọc NGAY ĐÂY, không đợi lúc tải lên: heading/pitch là số đo
      // tại thời điểm bấm máy. Đọc muộn thì người ta đã xoay máy đi rồi, và một
      // góc sai tệ hơn không có góc. Hỏng thì bỏ trống, không chặn luồng chụp —
      // mất khối siêu dữ liệu là mất khả năng ĐO tấm ảnh, chặn ảnh là mất cả ảnh.
      let capture: string | undefined;
      try {
        capture = serializeCaptureMeta(await buildCaptureMeta(a, TreeReIDBridge));
      } catch { capture = undefined; }
      navigation.navigate('FruitCropper', {
        treeId,
        treeName: treeName || layout?.tree.name,
        imageUri: a.uri, imageW: a.width, imageH: a.height,
        capture,
        fruitId: forFruitId, fruitName: forFruitName,
        // Để màn khoanh đặt sẵn tên "Quả {n+1}". Nông dân nhắm 50–100 quả/người:
        // bắt họ tự nghĩ ra ngần ấy tên phân biệt được, gõ trên điện thoại giữa
        // vườn, là chỗ người ta bỏ cuộc — không phải chỗ nhận-diện sai.
        fruitCount: layout?.fruits?.length ?? 0,
      });
    };
    if (fromCamera) { if (await requestCameraPermission()) launchCamera(await withPhotoSave(opts), cb); }
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

  /**
   * Lối thứ ba: quay clip cả chùm.
   *
   * Đây KHÔNG phải đường tạo ra một quả trong danh sách — `fruit_video` chỉ đếm
   * quả trên các khung hình, không enroll. Nhãn trong tấm nói đúng điều đó, để
   * không ai quay xong rồi ngồi đợi một bản ghi không bao giờ tới.
   */
  const chooseVideo = useCallback(() => {
    setSourceSheet(false);
    setTimeout(() => navigation.navigate('FruitVideo', { treeId, treeName, farmId }), 220);
  }, [navigation, treeId, treeName, farmId]);

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

  const fruits = useMemo(() => layout?.fruits ?? [], [layout]);

  /** Đếm theo từng mục lọc — số trên chip và số quả thật luôn khớp vì cùng nguồn. */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: fruits.length, on_tree: 0, harvested: 0, lost: 0 };
    for (const f of fruits) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [fruits]);

  const shown = useMemo(
    () => (filter ? fruits.filter(f => f.status === filter) : fruits),
    [fruits, filter],
  );

  const renderFruit = ({ item }: { item: TreeLayoutFruit }) => {
    const tone = STATUS_TONE[item.status];
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => openDetail(item)}
      >
        <RemoteImage
          uri={item.thumbnail_url ? `${BASE_URL}${item.thumbnail_url}` : undefined}
          style={styles.thumb}
          containerStyle={[styles.thumb, styles.thumbPh]}
          resizeMode="cover"
          placeholder={<Icon name="apple-whole" size={22} color={NATURE.barkSoft} />}
        />
        <View style={styles.rowBody}>
          <Text style={styles.fname} numberOfLines={1}>
            {item.name || tk('trace.fruitList.unnamed')}
          </Text>
          <View style={styles.rowMeta}>
            <View style={[styles.statusDot, { backgroundColor: tone }]} />
            <Text style={[styles.statusTxt, { color: tone }]}>{tk(STATUS_KEY[item.status])}</Text>
            <Text style={styles.fmeta} numberOfLines={1}>
              · {tk('trace.fruitList.views', { n: item.n_views })}
              {item.zone ? ` · ${tk(ZONE_KEY[item.zone])}` : ''}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={15} color={NATURE.barkSoft} />
      </Pressable>
    );
  };

  // Vào thẳng từ cổng xoè "Quét quả" thì KHÔNG có treeId (actionRegistry chỉ trỏ route,
  // không kèm tham số). Trước đây màn vẫn dựng rồi gọi getTreeLayout(undefined) → màn
  // trống bảo người dùng tự đi tìm đường khác. Nói thật và chỉ đường về màn chọn cây.
  if (!treeId) {
    return (
      <View style={styles.root}>
        <GroundBackdrop variant="detail" />
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Icon name="apple-whole" size={30} color={TONE.primary} /></View>
          <Text style={styles.emptyTitle}>{tk('trace.fruitList.pickTreeFirst')}</Text>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            onPress={() => navigation.navigate('TreeManagement')}
          >
            <Icon name="tree" size={16} color={NATURE.paper} />
            <Text style={styles.ctaTxt}>{tk('trace.fruitList.pickTree')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <GroundBackdrop variant="detail" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TONE.primary} />
          <Text style={styles.muted}>{tk('trace.fruitList.loading')}</Text>
        </View>
      </View>
    );
  }

  const noFruitSpecies = speciesEntry && speciesEntry.has_fruit === false;

  return (
    <View style={styles.root}>
      <GroundBackdrop variant="detail" />

      {/* ── Đầu màn ── */}
      <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Icon name="arrow-left" size={20} color={NATURE.bark} />
        </Pressable>
        <View style={styles.headTitles}>
          <Text style={styles.title} numberOfLines={1}>
            {treeName || layout?.tree.name || tk('trace.fruitList.pickTree')}
          </Text>
          <Text style={styles.subtitle}>{tk('trace.fruitList.title')}</Text>
        </View>
        <Pressable
          style={styles.iconBtn}
          accessibilityLabel={tk('trace.fruitList.place3d')}
          onPress={() => navigation.navigate('Space3D', {
            mode: 'tree', treeId, treeName: treeName || layout?.tree.name,
          })}
        >
          <Icon name="cube" size={19} color={TONE.primary} />
        </Pressable>
      </View>

      {/* ── Giống cây ── */}
      {speciesEntry ? (
        <View style={styles.speciesRow}>
          <View style={styles.speciesChip}>
            <Icon name="leaf" size={12} color={TONE.primary} />
            <Text style={styles.speciesChipTxt}>{speciesEntry.name_vi}</Text>
          </View>
        </View>
      ) : catalog?.species?.length ? (
        <View style={styles.speciesPick}>
          <Text style={styles.speciesHint}>{tk('trace.fruitList.noSpecies')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spRow}>
            {catalog.species.map(s => (
              <Pressable
                key={s.id}
                style={({ pressed }) => [styles.spBtn, pressed && styles.pressed]}
                disabled={saving}
                onPress={() => pickSpecies(s.id)}
              >
                <Text style={styles.spBtnTxt}>{s.name_vi}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Bộ lọc kiêm thống kê ── */}
      {!noFruitSpecies && fruits.length > 0 && (
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const n = f.status ? (counts[f.status] ?? 0) : counts.all;
            const on = filter === f.status;
            return (
              <Pressable
                key={f.key}
                style={({ pressed }) => [styles.filterChip, on && styles.filterChipOn, pressed && styles.pressed]}
                onPress={() => setFilter(f.status)}
              >
                <Text style={[styles.filterNum, on && styles.filterNumOn]}>{n}</Text>
                <Text style={[styles.filterLbl, on && styles.filterLblOn]} numberOfLines={1}>{tk(f.key)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Lỗi PHỤ (đã có dữ liệu nhưng thao tác sau lỗi) — lỗi-tải-chính dồn vào khối dưới */}
      {error && layout ? (
        <View style={styles.errBar}>
          <Icon name="triangle-exclamation" size={14} color={TONE.sun} />
          <Text style={styles.errBarTxt} numberOfLines={2}>{error}</Text>
        </View>
      ) : null}

      {noFruitSpecies ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Icon name="leaf" size={28} color={NATURE.barkSoft} /></View>
          <Text style={styles.emptyTitle}>{tk('trace.fruitList.speciesNoFruit')}</Text>
          <Text style={styles.muted}>
            {tk('trace.fruitList.speciesNoFruitBody', { name: speciesEntry?.name_vi ?? '' })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={f => f.fruit_id}
          renderItem={renderFruit}
          contentContainerStyle={[
            shown.length ? styles.list : styles.listEmpty,
            { paddingBottom: insets.bottom + 110 },
          ]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: SPACE.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TONE.primary} />}
          ListEmptyComponent={
            error && !layout ? (
              // Lỗi tải (mạng yếu/server) — KHÔNG để empty-state gây hiểu lầm "cây rỗng".
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Icon name="wifi" size={26} color={TONE.sun} /></View>
                <Text style={styles.emptyTitle}>{tk('trace.fruitList.loadFail')}</Text>
                <Text style={styles.muted}>{error}</Text>
                <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={retry}>
                  <Icon name="arrow-rotate-left" size={15} color={NATURE.paper} />
                  <Text style={styles.ctaTxt}>{tk('trace.button.retry')}</Text>
                </Pressable>
              </View>
            ) : filter ? (
              // Lọc ra rỗng ≠ cây chưa có quả nào — nói khác nhau.
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Icon name="filter" size={24} color={NATURE.barkSoft} /></View>
                <Text style={styles.emptyTitle}>{tk('trace.fruitList.noneInFilter')}</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Icon name="apple-whole" size={28} color={TONE.primary} /></View>
                <Text style={styles.emptyTitle}>{tk('trace.fruitList.noFruit')}</Text>
                <Text style={styles.muted}>{tk('trace.fruitList.noFruitHint')}</Text>
                <Pressable
                  style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                  onPress={() => openSourceSheet()}
                >
                  <Icon name="crop-simple" size={15} color={NATURE.paper} />
                  <Text style={styles.ctaTxt}>{tk('trace.fruitList.firstFruit')}</Text>
                </Pressable>
              </View>
            )
          }
        />
      )}

      {/* Nút nổi: chỉ hiện với giống CÓ quả (giống không-quả → ẩn, nhất quán species-gating) */}
      {!noFruitSpecies && !loading ? (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 26 }]}>
          <Pressable
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
            onPress={() => openSourceSheet()}
            accessibilityLabel={tk('trace.fruitList.addFruit')}
          >
            <Icon name="plus" size={24} color={NATURE.paper} />
          </Pressable>
          <Text style={styles.fabLabel}>{tk('trace.fruitList.addFruit')}</Text>
        </View>
      ) : null}

      {/* ── Tấm chọn nguồn ảnh (thay Alert 3 nút) ── */}
      <BottomSheet
        visible={sourceSheet}
        onClose={() => setSourceSheet(false)}
        title={addViewTarget.current ? tk('trace.fruitList.addAngle') : tk('trace.fruitList.addFruit')}
        subtitle={addViewTarget.current
          ? tk('trace.fruitList.addAngleFor', { name: addViewTarget.current.name })
          : tk('trace.fruitList.pickPhoto')}
      >
        <SourceOption
          icon="camera"
          title={tk('trace.fruitList.shoot')}
          desc={tk('trace.fruitList.shootDesc')}
          onPress={() => chooseSource(true)}
        />
        <SourceOption
          icon="images"
          title={tk('trace.fruitList.fromLibrary')}
          desc={tk('trace.fruitList.fromLibraryDesc')}
          onPress={() => chooseSource(false)}
        />
        {/* Chỉ hiện khi THÊM QUẢ MỚI. Đang thêm GÓC ẢNH cho một quả cụ thể thì
            video vô nghĩa: nó không gắn được vào quả nào. */}
        {!addViewTarget.current && (
          <SourceOption
            icon="video"
            title={tk('trace.fruitList.shootVideo')}
            desc={tk('trace.fruitList.shootVideoDesc')}
            onPress={chooseVideo}
          />
        )}
        <Pressable style={styles.sheetCancel} onPress={() => setSourceSheet(false)}>
          <Text style={styles.sheetCancelTxt}>{tk('trace.fruitList.cancel')}</Text>
        </Pressable>
      </BottomSheet>

      {/* ── Chi tiết một quả ── */}
      <BottomSheet visible={detail != null} onClose={() => setDetail(null)}>
        {detail ? (
          <>
            <View style={styles.dHead}>
              <RemoteImage
                uri={detail.thumbnail_url ? `${BASE_URL}${detail.thumbnail_url}` : null}
                style={styles.dThumb}
                containerStyle={[styles.dThumb, styles.thumbPh]}
                resizeMode="cover"
                placeholder={<Icon name="apple-whole" size={26} color={NATURE.barkSoft} />}
              />
              <View style={styles.dHeadBody}>
                <Text style={styles.dName} numberOfLines={2}>
                  {detail.name || tk('trace.fruitList.unnamed')}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_TONE[detail.status] }]}>
                  <Text style={styles.statusPillTxt}>{tk(STATUS_KEY[detail.status])}</Text>
                </View>
              </View>
            </View>

            <View style={styles.dFacts}>
              <Fact icon="images" label={tk('trace.fruitList.angles')} value={String(detail.n_views)} />
              <Fact
                icon="location-dot"
                label={tk('trace.fruitList.spot')}
                value={detail.zone ? tk(ZONE_KEY[detail.zone]) : '—'}
              />
              <Fact
                icon="calendar"
                label={tk('trace.fruitList.recordedOn')}
                value={shortDate(detail.enrolled_at) || '—'}
              />
            </View>

            <Text style={styles.dSection}>{tk('trace.fruitList.anglePhotos')}</Text>
            {views.loading ? (
              <ActivityIndicator color={TONE.primary} style={styles.dStripLoading} />
            ) : views.error ? (
              <Text style={styles.dEmpty}>{views.error}</Text>
            ) : views.items.length === 0 ? (
              <Text style={styles.dEmpty}>{tk('trace.fruitList.noAngles')}</Text>
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
                      placeholder={<Icon name="image" size={20} color={NATURE.barkSoft} />}
                    />
                  ) : null
                ))}
              </ScrollView>
            )}

            <View style={styles.dActions}>
              <Pressable
                style={({ pressed }) => [styles.dGhostBtn, pressed && styles.pressed]}
                onPress={() => {
                  const f = detail;
                  setDetail(null);
                  navigation.navigate('Space3D', {
                    mode: 'tree', treeId, treeName: treeName || layout?.tree.name, fruitId: f.fruit_id,
                  });
                }}
              >
                <Icon name="cube" size={15} color={TONE.primary} />
                <Text style={styles.dGhostTxt}>{tk('trace.fruitList.place3d')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dPrimaryBtn, pressed && styles.pressed]}
                onPress={() => openSourceSheet({
                  id: detail.fruit_id,
                  name: detail.name || tk('trace.fruitList.unnamed'),
                })}
              >
                <Icon name="camera" size={15} color={NATURE.paper} />
                <Text style={styles.dPrimaryTxt}>{tk('trace.fruitList.addAngle')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
};

// ── Mảnh nhỏ ────────────────────────────────────────────────────────────────

const Fact: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={styles.fact}>
    <Icon name={icon} size={14} color={NATURE.barkSoft} />
    <Text style={styles.factVal} numberOfLines={1}>{value}</Text>
    <Text style={styles.factLbl}>{label}</Text>
  </View>
);

const SourceOption: React.FC<{ icon: string; title: string; desc: string; onPress: () => void }> = ({
  icon, title, desc, onPress,
}) => (
  <Pressable style={({ pressed }) => [styles.srcOpt, pressed && styles.pressed]} onPress={onPress}>
    <View style={styles.srcIcon}><Icon name={icon} size={18} color={TONE.primary} /></View>
    <View style={styles.srcBody}>
      <Text style={styles.srcTitle}>{title}</Text>
      <Text style={styles.srcDesc}>{desc}</Text>
    </View>
    <Icon name="chevron-right" size={14} color={NATURE.barkSoft} />
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  pressed: { opacity: 0.9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xxl, gap: SPACE.sm },
  muted: { ...TYPE.caption, textAlign: 'center' },
  emptyIcon: {
    width: 68, height: 68, ...ORGANIC_TILE, marginBottom: SPACE.xs,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...TYPE.cardTitle, fontSize: 18, textAlign: 'center' },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md,
    backgroundColor: TONE.primary, ...ORGANIC_CARD, ...ELEVATION.cardStrong,
    paddingHorizontal: SPACE.xl, paddingVertical: 14,
  },
  ctaTxt: { color: NATURE.paper, fontSize: 16, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.md,
  },
  iconBtn: {
    width: 44, height: 44, ...ORGANIC_TILE, ...ELEVATION.card,
    backgroundColor: SURFACE.raised, alignItems: 'center', justifyContent: 'center',
  },
  headTitles: { flex: 1, minWidth: 0 },
  title: { ...TYPE.title, fontSize: 23 },
  subtitle: { ...TYPE.caption, fontSize: 13.5 },

  speciesRow: { paddingHorizontal: SPACE.page, paddingBottom: SPACE.md },
  speciesChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TONE.primarySoft, borderRadius: RADIUS.chip,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  speciesChipTxt: { fontSize: 13.5, fontWeight: '600', color: TONE.primaryDeep },
  speciesPick: { paddingHorizontal: SPACE.page, paddingBottom: SPACE.md, gap: SPACE.sm },
  speciesHint: { ...TYPE.caption, fontSize: 13.5 },
  spRow: { gap: SPACE.sm, paddingRight: SPACE.page },
  spBtn: {
    backgroundColor: SURFACE.raised, ...ELEVATION.card, borderRadius: RADIUS.chip,
    paddingHorizontal: 15, paddingVertical: 10,
  },
  spBtnTxt: { fontSize: 14.5, fontWeight: '600', color: NATURE.bark },

  filterRow: {
    flexDirection: 'row', gap: SPACE.sm,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.md,
  },
  filterChip: {
    flex: 1, alignItems: 'center', gap: 1, paddingVertical: 10,
    backgroundColor: SURFACE.raised, ...ORGANIC_TILE, ...ELEVATION.card,
  },
  filterChipOn: { backgroundColor: TONE.primary },
  filterNum: { fontSize: 19, fontWeight: '700', color: NATURE.bark },
  filterNumOn: { color: NATURE.paper },
  filterLbl: { fontSize: 11.5, color: NATURE.barkSoft },
  filterLblOn: { color: NATURE.paper },

  errBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    marginHorizontal: SPACE.page, marginBottom: SPACE.sm,
    backgroundColor: TONE.sunSoft, borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  errBarTxt: { flex: 1, fontSize: 13, color: NATURE.bark },

  list: { paddingHorizontal: SPACE.page, paddingTop: SPACE.xs },
  listEmpty: { flexGrow: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    padding: SPACE.md,
  },
  thumb: { width: 58, height: 58, ...ORGANIC_TILE },
  thumbPh: { backgroundColor: SURFACE.sunken, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  fname: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 13, fontWeight: '600' },
  fmeta: { flex: 1, fontSize: 13, color: NATURE.barkSoft },

  fabWrap: { position: 'absolute', right: SPACE.page, alignItems: 'center', gap: 5 },
  fab: {
    width: 60, height: 60,
    borderTopLeftRadius: 26, borderTopRightRadius: 20,
    borderBottomRightRadius: 26, borderBottomLeftRadius: 20,
    backgroundColor: TONE.primary, alignItems: 'center', justifyContent: 'center',
    ...ELEVATION.cardStrong,
  },
  fabLabel: { fontSize: 12.5, fontWeight: '600', color: TONE.primaryDeep },

  srcOpt: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingVertical: SPACE.md, paddingHorizontal: SPACE.xs,
  },
  srcIcon: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  srcBody: { flex: 1 },
  srcTitle: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  srcDesc: { ...TYPE.caption, fontSize: 13 },
  sheetCancel: { alignItems: 'center', paddingVertical: SPACE.lg, marginTop: SPACE.xs },
  sheetCancelTxt: { fontSize: 16, fontWeight: '600', color: NATURE.barkSoft },

  dHead: { flexDirection: 'row', gap: SPACE.md, alignItems: 'center' },
  dThumb: { width: 76, height: 76, ...ORGANIC_TILE },
  dHeadBody: { flex: 1, gap: SPACE.sm },
  dName: { ...TYPE.section, fontSize: 19 },
  statusPill: { alignSelf: 'flex-start', borderRadius: RADIUS.chip, paddingHorizontal: 11, paddingVertical: 5 },
  statusPillTxt: { color: NATURE.paper, fontSize: 12.5, fontWeight: '700' },

  dFacts: {
    flexDirection: 'row', marginTop: SPACE.lg,
    backgroundColor: SURFACE.sunken, ...ORGANIC_CARD, paddingVertical: SPACE.md,
  },
  fact: { flex: 1, alignItems: 'center', gap: 2 },
  factVal: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  factLbl: { fontSize: 12, color: NATURE.barkSoft },

  dSection: { ...TYPE.cardTitle, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  dStrip: { gap: SPACE.sm },
  dStripLoading: { paddingVertical: SPACE.lg },
  dShot: { width: 92, height: 92, ...ORGANIC_TILE },
  dEmpty: { ...TYPE.caption, paddingVertical: SPACE.md },

  dActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xl },
  dGhostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: TONE.primarySoft, ...ORGANIC_CARD, paddingVertical: 14,
  },
  dGhostTxt: { fontSize: 15, fontWeight: '700', color: TONE.primaryDeep },
  dPrimaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: TONE.primary, ...ORGANIC_CARD, ...ELEVATION.cardStrong, paddingVertical: 14,
  },
  dPrimaryTxt: { fontSize: 15, fontWeight: '700', color: NATURE.paper },
});

export default FruitListScreen;
