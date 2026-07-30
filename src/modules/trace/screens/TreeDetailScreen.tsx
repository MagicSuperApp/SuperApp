// modules/trace/screens/TreeDetailScreen.tsx
//
// 3 tab:
//   - "Tổng quan": hero + DANH SÁCH QUẢ của cây.
//   - "Lịch sử":   quả đã ghi nhận theo thời gian.
//   - "Thông tin": metadata cây.
//
// NGUỒN DỮ-LIỆU QUẢ = field-reid `GET /api/tree/{id}/layout` — ĐÚNG nơi luồng
// "Thêm quả" (FruitList → FruitCropper → POST /api/fruit/enroll) ghi vào.
// Trước đây màn này đọc bảng SQLite `fruits` (thunk loadFruits), mà bảng đó CHỈ
// được ghi bởi luồng "Lưu onnet" đã bỏ → thêm quả xong danh sách vẫn RỖNG.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  TextInput,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import PaginationControls from '../components/PaginationControls';
import { RootState } from '../../../store';
import { COLORS } from '../../../constants';
import StateView from '../../../components/state/StateView';
import TreeMetadataTab from './TreeMetadataTab';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';
import { loadTreeImages } from '../../../services/treeImageStore';
import { loadVideoProofs, type VideoProof } from '../../../services/videoProofStore';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import rLog from '../../../services/remoteLogger';
import {
  getTreeLayout,
  type TreeLayoutResponse, type TreeLayoutFruit,
  type FruitStatus, type TreeZone,
} from '../../../services/fruitReIDService';
import { useSelector } from 'react-redux';

const { width } = Dimensions.get('window');
const ITEMS_PER_PAGE = 20;

type TabKey = 'overview' | 'history' | 'info';

const TAB_DEFS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'view-dashboard-outline' },
  { key: 'history', label: 'Lịch sử', icon: 'history' },
  { key: 'info', label: 'Thông tin', icon: 'clipboard-text-outline' },
];

interface RouteParams { tree?: any; treeId?: string; initialTab?: TabKey; farmId?: string }

// ── Status config ─────────────────────────────────────────────────────────────
// Từ vựng trạng-thái theo ĐÚNG field-reid (on_tree / harvested / lost). Bộ cũ
// (growing/mature/sold) là của bảng SQLite `fruits` không còn dùng → lọc theo nó
// thì KHÔNG BAO GIỜ khớp quả thật, danh sách rỗng oan.
const STATUS_MAP: Record<FruitStatus, { label: string; color: string; bg: string; icon: string }> = {
  on_tree: { label: 'Trên cây', color: '#6FAF7F', bg: 'rgba(111,175,127,0.18)', icon: 'fruit-cherries' },
  harvested: { label: 'Đã thu hoạch', color: COLORS.info, bg: 'rgba(8,138,185,0.12)', icon: 'basket-outline' },
  lost: { label: 'Đã mất', color: COLORS.textMuted, bg: 'rgba(0,0,0,0.06)', icon: 'close-circle-outline' },
};
const getStatus = (s?: string) => STATUS_MAP[s as FruitStatus] ?? STATUS_MAP.on_tree;

const ZONE_VI: Record<TreeZone, string> = { base: 'Gốc', mid: 'Thân giữa', canopy: 'Tán' };

/** ISO → dd/mm/yyyy (rỗng nếu server không trả / sai định dạng). */
const fmtDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN');
};

// ── Fruit Card ────────────────────────────────────────────────────────────────
const FruitCard = ({
  item,
  index,
  onPress,
}: {
  item: TreeLayoutFruit;
  index: number;
  onPress: () => void;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const st = getStatus(item.status);
  const thumb = item.thumbnail_url ? `${ORILIFE_BASE}${item.thumbnail_url}` : null;
  const enrolled = fmtDate(item.enrolled_at);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 55, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  const hIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const hOut = () => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={hIn} onPressOut={hOut}>
        <View style={styles.fruitCard}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.fruitThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.fruitIconWrap, { backgroundColor: st.bg }]}>
              <Icon name={st.icon} size={22} color={st.color} />
            </View>
          )}

          <View style={styles.fruitCardBody}>
            <View style={styles.fruitTopRow}>
              <Text style={styles.fruitCode} numberOfLines={1}>
                {item.name || '(chưa đặt tên)'}
              </Text>
              <View style={[styles.fruitStatusChip, { backgroundColor: st.bg }]}>
                <View style={[styles.fruitStatusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.fruitStatusText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>

            <View style={styles.fruitMetaRow}>
              <View style={styles.fruitMetaItem}>
                <Icon name="camera-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.fruitMetaText}>{item.n_views} góc</Text>
              </View>
              {item.zone && (
                <View style={styles.fruitMetaItem}>
                  <Icon name="map-marker-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{ZONE_VI[item.zone]}</Text>
                </View>
              )}
              {enrolled ? (
                <View style={styles.fruitMetaItem}>
                  <Icon name="calendar-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{enrolled}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Icon name="chevron-right" size={18} color={COLORS.accentLight} style={{ alignSelf: 'center', marginRight: 12 }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Circular progress (harvest %) ─────────────────────────────────────────────
const CircleProgress = ({ pct, size = 72 }: { pct: number; size?: number }) => {
  const animPct = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animPct, { toValue: pct, duration: 900, useNativeDriver: false }).start();
  }, [pct]);

  const stroke = 5;
  const deg = (pct / 100) * 360;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        borderWidth: stroke, borderColor: COLORS.border,
      }} />
      <View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        borderWidth: stroke,
        borderColor: COLORS.accent,
        borderRightColor: 'transparent',
        borderBottomColor: pct > 50 ? COLORS.accent : 'transparent',
        transform: [{ rotate: `${deg - 90}deg` }],
      }} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 }}>
          {pct}%
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '600' }}>đã thu</Text>
      </View>
    </View>
  );
};

// ── Segmented tab bar ────────────────────────────────────────────────────────
const SegmentedTabBar: React.FC<{
  active: TabKey;
  onChange: (key: TabKey) => void;
}> = ({ active, onChange }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={styles.tabBar}
    contentContainerStyle={styles.tabBarContent}
  >
    {TAB_DEFS.map((t) => {
      const isActive = t.key === active;
      return (
        <TouchableOpacity
          key={t.key}
          style={styles.tabBtn}
          onPress={() => onChange(t.key)}
          activeOpacity={0.85}
        >
          <Icon
            name={t.icon}
            size={16}
            color={isActive ? COLORS.accent : COLORS.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: isActive ? COLORS.accent : COLORS.textMuted, fontWeight: isActive ? '700' : '500' },
            ]}
          >
            {t.label}
          </Text>
          {isActive && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

// ── Main Screen ───────────────────────────────────────────────────────────────
const TreeDetailScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = route.params as RouteParams | undefined;
  const treesInStore = useSelector((state: RootState) => state.farm.trees);
  // Chấp nhận cả {tree} (object) lẫn {treeId} (string). Caller cũ TreeEnroll /
  // TreeManagement chỉ truyền treeId → tra cây từ store theo id hoặc tree_id.
  // Chỉ dùng cây TÌM THẤY (đúng shape) nên không rủi ro sai ID; không thấy →
  // rơi về màn not-found sẵn có bên dưới.
  const tree = useMemo(() => {
    if (params?.tree) return params.tree;
    const id = params?.treeId;
    if (!id) return undefined;
    return treesInStore.find((t: any) => t?.id === id || t?.tree_id === id);
  }, [params?.tree, params?.treeId, treesInStore]);
  const initialTab = params?.initialTab;

  // Safety check: if no tree data, go back
  useEffect(() => {
    if (!tree) {
      console.error('[TreeDetailScreen] No tree data provided, going back');
      navigation.goBack();
    }
  }, [tree, navigation]);

  const farms = useSelector((state: RootState) => state.farm.farms);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-12)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'overview');

  // Quả của cây — lấy từ field-reid (xem chú thích đầu file).
  const [layout, setLayout] = useState<TreeLayoutResponse | null>(null);
  const [fruitsLoading, setFruitsLoading] = useState(false);
  const [fruitsError, setFruitsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);

  // Ảnh cây đã lưu (local, theo tree_id) — nguồn từ treeImageStore vì server
  // /api/trees không trả URL ảnh. Kèm 1 ảnh đang xem phóng to (lightbox).
  const [treeImages, setTreeImages] = useState<string[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [videoProofs, setVideoProofs] = useState<VideoProof[]>([]);

  // Bằng chứng video đã lưu lên LampNet. Nạp lại mỗi lần màn được focus vì người
  // dùng vừa gửi video xong là quay về đây — không nạp lại thì tưởng chưa lưu.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const id = tree?.id;
      if (id) loadVideoProofs(id).then(p => { if (alive) setVideoProofs(p); });
      return () => { alive = false; };
    }, [tree?.id]),
  );

  useEffect(() => {
    let alive = true;
    const id = tree?.id;
    if (id) {
      // Gộp ảnh server (nếu sau này có) + ảnh local đã lưu theo tree_id.
      loadTreeImages(id).then(local => {
        if (!alive) return;
        const serverImgs: string[] = Array.isArray(tree?.images) ? tree.images : [];
        setTreeImages(Array.from(new Set([...serverImgs, ...local])));
      });
    }
    return () => { alive = false; };
  }, [tree?.id]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [tree?.id]);

  // Nạp quả từ field-reid. reqIdRef: chỉ nhận kết-quả của yêu-cầu MỚI NHẤT (đổi cây
  // / bấm thử-lại liên tục → không để phản hồi cũ về sau ghi đè danh sách mới).
  const reqIdRef = useRef(0);
  const fetchFruits = useCallback(async (showSpinner: boolean) => {
    const id = tree?.id;
    if (!id) return;
    const myReq = ++reqIdRef.current;
    if (showSpinner) setFruitsLoading(true);
    const r = await getTreeLayout(ORILIFE_BASE, id);
    if (myReq !== reqIdRef.current) return;
    if (r.ok && r.data) {
      setLayout(r.data);
      setFruitsError(null);
    } else {
      setFruitsError(r.error?.detail ?? 'Không tải được danh sách quả.');
    }
    setFruitsLoading(false);
  }, [tree?.id]);

  // Nạp lại MỖI LẦN màn được focus → khoanh quả ở FruitCropper xong quay về là
  // thấy ngay (lần đầu có spinner, các lần sau im lặng để không nháy màn hình).
  const firstFruitLoad = useRef(true);
  useFocusEffect(useCallback(() => {
    fetchFruits(firstFruitLoad.current);
    firstFruitLoad.current = false;
  }, [fetchFruits]));

  // Early return if no tree data to prevent crashes
  if (!tree) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? 56 : 40) + insets.top }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lỗi</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Icon name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ marginTop: 16, fontSize: 16, color: COLORS.text, textAlign: 'center' }}>
            Không tìm thấy thông tin cây
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.accent, borderRadius: 8 }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: COLORS.white, fontWeight: '600' }}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // "Thêm quả" = nhận diện/thêm QUẢ cho CHÍNH cây này — KHÔNG phải nhận diện cây.
  // Trước đây điều hướng nhầm sang 'TreeIdentity' (luồng nhận diện + đăng ký CÂY),
  // nên bấm "Thêm quả" lần đầu lại chạy ra quy trình nhận diện cây. Sửa: đi tới
  // luồng quả gắn theo cây (FruitList), truyền tree_id như TreeManagement vẫn làm.
  const handleAddFruit = () => {
    if (!tree) return;
    // Field-test Đức 26/07 mục 11 + fix #11: stub cũ navigate('TreeIdentity') mở nhầm
    // luồng NHẬN DIỆN CÂY. Dùng FruitList (→ FruitCropper → POST /api/fruit/enroll) —
    // ĐÚNG nơi /api/tree/{id}/layout đọc, để quả thêm xong HIỆN trong danh sách.
    // (FruitVideo là nút "Video quả" riêng bên dưới → không dùng lại ở đây cho khỏi trùng.)
    (navigation as any).navigate('FruitList', {
      treeId: tree.id,
      treeName: (tree as any).name,
      farmId: tree.farmId,
    });
  };

  // Quay video quả cho CHÍNH cây này (OriLife User-Action-Flow) — tự điền tree_id.
  const handleFruitVideo = () => {
    if (!tree) return;
    (navigation as any).navigate('FruitVideo', {
      treeId: tree.id,
      treeName: (tree as any).name,
      farmId: tree.farmId,
    });
  };

  const handleScan3D = () => {
    if (!tree) return;
    // Field-test Đức 26/07 mục 8: stub cũ navigate('TreeIdentity') = mở nhầm màn
    // nhận diện. Nút "Xem 3D" phải mở TreeViewer3D (dựng /view/{code}). Mẫu khớp
    // FarmDetailScreen.onView3D. Model dựng async phía server — màn tự hiện "đang dựng".
    (navigation as any).navigate('TreeViewer3D', {
      code: (tree as any).code ?? (tree as any).shortCode ?? '',
      treeName: (tree as any).name,
    });
  };

  // Mở KHÔNG-GIAN 3D chung: bay vào ĐÚNG cây này, thấy quả phát sáng trên tán.
  // Trước đây mở WebView /view/{code} và chỉ hiện khi cây đã quét 3D (has_3d);
  // nay không-gian 3D dựng từ model tree1.glb nên cây NÀO cũng xem được.
  const handleView3D = () => {
    if (!tree) return;
    // Trace điểm vào Space3D (GL/react-three-fiber) — mốc cuối nếu app crash khi mở 3D.
    rLog.viewer3d.spaceNav({ treeId: tree.id, farmId: tree.farmId });
    (navigation as any).navigate('Space3D', {
      mode: 'tree',
      treeId: tree.id,
      farmId: tree.farmId,
      treeName: treeDisplayName,
    });
  };

  // Mở toàn cảnh vườn, kèm chế độ đặt vị-trí cây này bằng tay (tính năng tuỳ chọn —
  // mặc định cây tự đứng theo GPS, hoặc rải ngẫu nhiên ổn định trong ranh giới).
  const handlePlaceInFarm = () => {
    if (!tree) return;
    (navigation as any).navigate('Space3D', {
      mode: 'farm',
      farmId: tree.farmId,
      placeTreeId: tree.id,
    });
  };

  // ── Dữ liệu quả (server) ───────────────────────────────────────────────────
  const fruitItems: TreeLayoutFruit[] = layout?.fruits ?? [];
  const stats = layout?.stats;
  const totalFruits = stats?.total ?? fruitItems.length;
  const onTreeCount = stats?.on_tree ?? fruitItems.filter(f => f.status === 'on_tree').length;
  const harvestedCount = stats?.harvested ?? fruitItems.filter(f => f.status === 'harvested').length;
  const lostCount = stats?.lost ?? fruitItems.filter(f => f.status === 'lost').length;
  // % thu hoạch tính TỪ QUẢ THẬT (server /api/trees không trả harvestProgress →
  // vòng tròn trước đây luôn đứng 0%).
  const harvestPct = totalFruits > 0 ? Math.round((harvestedCount / totalFruits) * 100) : 0;
  const estimatedFruits = tree?.estimatedFruits ?? 0;

  // Mới ghi nhận lên trước.
  const sortedFruits = [...fruitItems].sort((a, b) =>
    (b.enrolled_at ?? '').localeCompare(a.enrolled_at ?? '')
  );

  const filteredFruits = sortedFruits.filter(fruit => {
    const q = searchQuery.trim().toLowerCase();
    const matchesName = !q || (fruit.name ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || fruit.status === statusFilter;
    return matchesName && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredFruits.length / ITEMS_PER_PAGE));
  // Kẹp trang: danh sách co lại sau khi nạp lại (quả bị xoá/lọc) → trang hiện tại
  // có thể vượt tổng số trang, gây màn trắng "không có gì" dù vẫn còn quả.
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginatedFruits = filteredFruits.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setStatusDropdownVisible(false);
    setCurrentPage(1);
  };

  const gpsText = tree?.gps?.lat && tree?.gps?.lng
    ? `${tree.gps.lat.toFixed(4)}, ${tree.gps.lng.toFixed(4)}`
    : 'Chưa có vị trí GPS';

  // Build 52 § A7 — farmer-friendly tree name (UUID → "Cây #3 góc Đông")
  const currentFarm = tree ? farms.find(f => f.id === tree.farmId) : null;
  const treeDisplayName = tree ? formatTreeName(tree, currentFarm) : '';
  const treeShortCode = tree ? shortTreeCode(tree) : '';

  // ── Header (shared across tabs) ─────────────────────────────────────────────
  const Header = (
    <Animated.View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? 56 : 40) + insets.top }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Icon name="arrow-left" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerEyebrow}>THÔNG TIN CÂY</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{treeDisplayName}</Text>
        {treeShortCode ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>Mã: {treeShortCode}</Text>
        ) : null}
      </View>
      {/* Đặt vị-trí cây trong sơ đồ 3D bằng tay (tuỳ chọn — mặc định theo GPS
          hoặc rải ngẫu nhiên ổn định trong ranh giới vườn). */}
      <TouchableOpacity style={styles.headerActionBtn} onPress={handlePlaceInFarm}>
        <Icon name="map-marker-plus" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerActionBtn}
        onPress={() => tree && (navigation as any).navigate('CareScan', {
          targetType: 'tree', targetId: tree.id, treeName: (tree as any).name,
        })}
      >
        <Icon name="spray-bottle" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
    </Animated.View>
  );

  // ── Overview tab content ────────────────────────────────────────────────────
  const overviewHeader = (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

      {/* Tree info card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroLeft}>
            <View style={styles.heroIconWrap}>
              <Icon name="tree" size={32} color={COLORS.accent} />
              <View style={styles.heroIconGlow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>TÊN CÂY</Text>
              <Text style={styles.heroCode}>{treeDisplayName}</Text>
              {treeShortCode ? (
                <Text style={styles.heroCodeSub}>Mã: {treeShortCode}</Text>
              ) : null}
              {tree?.farmName && (
                <View style={styles.heroFarmRow}>
                  <Icon name="pine-tree" size={12} color={COLORS.textMuted} />
                  <Text style={styles.heroFarmText}>{tree?.farmName}</Text>
                </View>
              )}
              <View style={styles.heroFarmRow}>
                <Icon name="map-marker-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.heroFarmText}>{gpsText}</Text>
              </View>
            </View>
          </View>
          <CircleProgress pct={harvestPct} size={72} />
        </View>

        <View style={styles.heroDivider}>
          <View style={styles.heroDividerLine} />
          <Icon name="leaf-outline" size={12} color={COLORS.accentLight} />
          <View style={styles.heroDividerLine} />
        </View>

        <View style={styles.heroStats}>
          {[
            { icon: 'counter', val: totalFruits, label: 'quả đã ghi nhận', color: COLORS.accent },
            { icon: 'fruit-cherries', val: onTreeCount, label: 'trên cây', color: '#6FAF7F' },
            { icon: 'basket-outline', val: harvestedCount, label: 'đã thu hoạch', color: COLORS.info },
            { icon: 'close-circle-outline', val: lostCount, label: 'đã mất', color: COLORS.textMuted },
          ].map((s, i) => (
            <View
              key={i}
              style={[
                styles.heroStatItem,
                i < 3 && { borderRightWidth: 1, borderRightColor: COLORS.border },
              ]}
            >
              <Icon name={s.icon} size={15} color={s.color} />
              <Text style={[styles.heroStatVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.heroStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Ảnh cây đã lưu — dải ngang, chạm để phóng to. Ẩn nếu chưa có ảnh nào. */}
      {treeImages.length > 0 && (
        <View style={styles.photoStripWrap}>
          <View style={styles.sectionLeft}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>ẢNH CÂY ({treeImages.length})</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {treeImages.map((uri, i) => (
              <TouchableOpacity
                key={`${uri}-${i}`}
                activeOpacity={0.85}
                onPress={() => setZoomImage(uri)}
              >
                <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bằng chứng video trên LampNet. Hiện mã lưu trữ vì OriLife KHÔNG có route
          tra ngược — đây là chỗ duy nhất đội thực địa đối chiếu được sau buổi.
          Chạm để sao chép mã. */}
      {videoProofs.length > 0 && (
        <View style={styles.proofWrap}>
          <View style={styles.sectionLeft}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>VIDEO ĐÃ LƯU ({videoProofs.length})</Text>
          </View>
          {videoProofs.map(p => (
            <TouchableOpacity
              key={p.videoCid}
              style={styles.proofRow}
              activeOpacity={0.7}
              onPress={() => {
                Clipboard.setString(p.videoCid);
                Alert.alert('Đã sao chép', 'Mã lưu trữ đã vào bộ nhớ tạm.');
              }}
            >
              <Icon
                name={p.stored === false ? 'cloud-alert' : 'shield-check'}
                size={15}
                color={p.stored === false ? '#B26A00' : '#1b5e20'}
              />
              <View style={styles.proofBody}>
                <Text style={styles.proofCid} numberOfLines={1}>{p.videoCid}</Text>
                <Text style={styles.proofMeta}>
                  {p.stored === false ? 'Chưa lên được mạng · ' : ''}
                  {p.at ? new Date(p.at).toLocaleString('vi-VN') : ''}
                  {p.nFruitsMax ? ` · khoảng ${p.nFruitsMax} quả` : ''}
                </Text>
              </View>
              <Icon name="content-copy" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mesh fruit chip + capture-again CTA */}
      <View style={styles.meshChipRow}>
        <View style={styles.meshChip}>
          <Text style={styles.meshChipEmoji}>🍈</Text>
          <Text style={styles.meshChipText}>
            {totalFruits} quả{totalFruits > 0 ? ` · ${onTreeCount} trên cây` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.view3DBtn} onPress={handleScan3D} activeOpacity={0.85}>
          <Icon name="camera-outline" size={16} color={COLORS.accent} />
          <Text style={styles.view3DBtnText}>Chụp lại</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureBtn} onPress={handleView3D} activeOpacity={0.85}>
          <Icon name="cube-scan" size={16} color={COLORS.white} />
          <Text style={styles.captureBtnText}>Sơ đồ 3D</Text>
        </TouchableOpacity>
      </View>

      {estimatedFruits > 0 && (
        <View style={styles.estimateNote}>
          <Icon name="chart-bell-curve-cumulative" size={14} color={COLORS.accent} />
          <Text style={styles.estimateText}>
            Dự kiến <Text style={{ fontWeight: '700', color: COLORS.accent }}>{estimatedFruits} quả</Text> trong mùa này
          </Text>
        </View>
      )}

      <View style={styles.sectionRow}>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>
            DANH SÁCH QUẢ{totalFruits > 0 ? ` (${totalFruits})` : ''}
          </Text>
          {fruitsLoading && <ActivityIndicator size="small" color={COLORS.accent} />}
        </View>

      </View>
      <View style={styles.fruitActionRow}>
        {/* Quay video quả cho cây này (OriLife) — gắn tree_id, cho phép gắn sai. */}
        <TouchableOpacity style={styles.fruitVideoBtn} onPress={handleFruitVideo} activeOpacity={0.8}>
          <Icon name="video-plus" size={15} color="#1b5e20" />
          <Text style={styles.fruitVideoBtnText}>Video quả</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addFruitBtn}
          onPress={handleAddFruit}
          onPressIn={() => Animated.spring(btnScale, { toValue: 0.94, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
          activeOpacity={1}
        >
          <Animated.View style={[styles.addFruitBtnInner, { transform: [{ scale: btnScale }] }]}>
            <Icon name="plus" size={15} color={COLORS.accent} />
            <Text style={styles.addFruitBtnText}>Thêm quả</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Icon name="magnify" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm theo tên quả..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setCurrentPage(1);
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                style={styles.clearSearchBtn}
              >
                <Icon name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.statusFilterBtn}
            onPress={() => setStatusDropdownVisible(true)}
          >
            <Icon name="filter-variant" size={18} color={COLORS.accent} />
            <Text style={styles.statusFilterText}>
              {statusFilter === 'all' ? 'Tất cả trạng thái' : getStatus(statusFilter).label}
            </Text>
            <Icon name="chevron-down" size={18} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );

  // Thứ tự ưu tiên: đang tải → lỗi tải → không khớp bộ lọc → thật sự chưa có quả.
  // KHÔNG để lỗi mạng hiện ra như "chưa có quả" (nông dân tưởng mất dữ liệu).
  const overviewEmpty = fruitsLoading ? (
    <View style={styles.emptyWrap}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.emptyBody}>Đang tải danh sách quả…</Text>
    </View>
  ) : fruitsError ? (
    <View style={styles.emptyWrap}>
      <Icon name="wifi-off" size={36} color={COLORS.warning} />
      <Text style={styles.emptyTitle}>Không tải được quả</Text>
      <Text style={styles.emptyBody}>{fruitsError}</Text>
      <TouchableOpacity style={styles.emptyAddBtn} onPress={() => fetchFruits(true)}>
        <Icon name="refresh" size={15} color={COLORS.white} />
        <Text style={styles.emptyAddBtnText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  ) : searchQuery.length > 0 || statusFilter !== 'all' ? (
    <View style={styles.noSearchResults}>
      <View style={styles.emptyIconWrap}>
        <Icon name="magnify" size={36} color={COLORS.accentLight} />
        <View style={styles.emptyIconRing} />
      </View>
      <Text style={styles.emptyTitle}>Không tìm thấy quả nào</Text>
      <Text style={styles.emptyBody}>
        Không có quả nào khớp với bộ lọc hiện tại.
      </Text>
      <TouchableOpacity
        style={styles.emptyAddBtn}
        onPress={() => {
          setSearchQuery('');
          setStatusFilter('all');
          setCurrentPage(1);
        }}
      >
        <Icon name="refresh" size={15} color={COLORS.white} />
        <Text style={styles.emptyAddBtnText}>Xóa bộ lọc</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <StateView
      status="empty"
      title="Chưa có quả nào"
      message={'Hướng camera vào chùm quả và bấm "Thêm quả".'}
      actionLabel="Thêm quả đầu tiên"
      onAction={handleAddFruit}
    />
  );

  const overviewBody = (
    <FlatList
      data={paginatedFruits}
      keyExtractor={(item) => item.fruit_id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={overviewHeader}
      ListEmptyComponent={overviewEmpty}
      renderItem={({ item, index }) => (
        // Chạm 1 quả → màn quả đầy-đủ của cây (xem góc ảnh / sơ-đồ / thêm góc).
        <FruitCard item={item} index={index} onPress={handleAddFruit} />
      )}
      ListFooterComponent={
        totalPages > 1 ? (
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            onNextPage={handlePageChange.bind(null, page + 1)}
            onPreviousPage={handlePageChange.bind(null, page - 1)}
            startIndex={startIndex}
            endIndex={Math.min(startIndex + ITEMS_PER_PAGE, filteredFruits.length)}
            totalItems={filteredFruits.length}
          />
        ) : (
          <View style={{ height: 110 }} />
        )
      }
    />
  );

  // ── History tab content ─────────────────────────────────────────────────────
  // Lịch sử = các quả đã ghi nhận, mới nhất trước. Bản cũ đọc `capture_id`/
  // `captured_at`/`frame_count` từ object KHÔNG hề có các field đó → tab trắng +
  // "Invalid Date". Nay dùng đúng dữ-liệu quả server trả.
  const historyBody = (
    <FlatList
      data={sortedFruits}
      keyExtractor={(f) => f.fruit_id}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListHeaderComponent={
        <View style={styles.historyHeader}>
          <Icon name="history" size={16} color={COLORS.accent} />
          <Text style={styles.historyHeaderText}>QUẢ ĐÃ GHI NHẬN GẦN ĐÂY</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          {fruitsLoading ? (
            <ActivityIndicator size="large" color={COLORS.accent} />
          ) : (
            <Icon name="archive-outline" size={36} color={COLORS.accentLight} />
          )}
          <Text style={styles.emptyTitle}>
            {fruitsLoading ? 'Đang tải lịch sử…' : 'Chưa ghi nhận quả nào'}
          </Text>
          {!fruitsLoading && (
            <Text style={styles.emptyBody}>
              {fruitsError ?? 'Bấm "Thêm quả" ở tab Tổng quan để ghi nhận quả đầu tiên.'}
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const st = getStatus(item.status);
        const thumb = item.thumbnail_url ? `${ORILIFE_BASE}${item.thumbnail_url}` : null;
        return (
          <View style={styles.captureCard}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.captureThumb} resizeMode="cover" />
            ) : (
              <View style={styles.captureIconWrap}>
                <Icon name={st.icon} size={20} color={st.color} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.captureDate} numberOfLines={1}>
                {item.name || '(chưa đặt tên)'}
              </Text>
              <Text style={styles.captureMeta}>
                {fmtDate(item.enrolled_at) || 'chưa rõ ngày'} · {item.n_views} góc
                {item.zone ? ` · ${ZONE_VI[item.zone]}` : ''}
              </Text>
            </View>
            <View style={[styles.fruitStatusChip, { backgroundColor: st.bg }]}>
              <Text style={[styles.fruitStatusText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>
        );
      }}
    />
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      {Header}
      <SegmentedTabBar active={activeTab} onChange={setActiveTab} />

      <View style={styles.tabBody}>
        {activeTab === 'overview' && overviewBody}
        {activeTab === 'history' && historyBody}
        {activeTab === 'info' && <TreeMetadataTab tree={tree} />}
      </View>

      {/* Existing Activity navigation — preserved per spec */}
      {activeTab === 'overview' && fruitItems.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: (Platform.OS === 'ios' ? 36 : 24) + insets.bottom }]}>
          <TouchableOpacity
            style={styles.harvestBtn}
            onPress={() => (navigation as any).navigate('Activity', { tree, farm: currentFarm ?? undefined })}
            activeOpacity={0.88}
          >
            <View style={styles.btnShine} />
            <Icon name="basket-outline" size={19} color={COLORS.white} />
            <Text style={styles.harvestBtnText}>Thu hoạch quả</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lightbox ảnh cây */}
      <Modal
        visible={zoomImage != null}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomImage(null)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.zoomOverlay}
          activeOpacity={1}
          onPress={() => setZoomImage(null)}
        >
          {zoomImage && (
            <Image source={{ uri: zoomImage }} style={styles.zoomImage} resizeMode="contain" />
          )}
          <TouchableOpacity
            style={styles.zoomClose}
            onPress={() => setZoomImage(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={statusDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chọn trạng thái</Text>

            <TouchableOpacity
              style={[styles.modalOption, statusFilter === 'all' && styles.modalOptionSelected]}
              onPress={() => handleStatusFilterChange('all')}
            >
              <Text style={[styles.modalOptionText, statusFilter === 'all' && styles.modalOptionTextSelected]}>
                Tất cả trạng thái
              </Text>
              {statusFilter === 'all' && <Icon name="check" size={20} color={COLORS.accent} />}
            </TouchableOpacity>

            {(Object.entries(STATUS_MAP) as [FruitStatus, typeof STATUS_MAP[FruitStatus]][]).map(([key, status]) => (
              <TouchableOpacity
                key={key}
                style={[styles.modalOption, statusFilter === key && styles.modalOptionSelected]}
                onPress={() => handleStatusFilterChange(key)}
              >
                <View style={styles.modalOptionLeft}>
                  <View style={[styles.statusIconWrap, { backgroundColor: status.bg }]}>
                    <Icon name={status.icon} size={16} color={status.color} />
                  </View>
                  <Text style={[styles.modalOptionText, statusFilter === key && styles.modalOptionTextSelected]}>
                    {status.label}
                  </Text>
                </View>
                {statusFilter === key && <Icon name="check" size={20} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 2.5, marginBottom: 1,
  },
  headerTitle: {
    fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 11, fontWeight: '500', color: COLORS.textMuted,
    letterSpacing: 0.5, marginTop: 2,
  },
  headerActionBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  tabBar: {
    flexGrow: 0,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    position: 'relative',
  },
  tabLabel: { fontSize: 13 },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },

  tabBody: { flex: 1 },
  meshHost: { flex: 1 },

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexGrow: 1,
  },

  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16,
    elevation: 3,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    paddingBottom: 14,
    gap: 12,
  },
  heroLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  heroIconGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.accentLight, opacity: 0.3,
  },
  heroLabel: {
    fontSize: 9, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 2, marginBottom: 3,
  },
  heroCode: {
    fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroCodeSub: {
    fontSize: 11, fontWeight: '500', color: COLORS.textMuted,
    letterSpacing: 0.4, marginBottom: 2,
  },
  heroFarmRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  heroFarmText: { fontSize: 12, color: COLORS.textMuted },

  heroDivider: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, gap: 8,
    marginBottom: 0,
  },
  heroDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },

  heroStats: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: COLORS.border,
    marginTop: 0,
  },
  heroStatItem: {
    flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4,
  },
  heroStatVal: {
    fontSize: 18, fontWeight: '800', letterSpacing: -0.5,
  },
  heroStatLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },

  photoStripWrap: { marginBottom: 14, gap: 8 },
  proofWrap: { marginBottom: 14, gap: 8 },
  proofRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#c8e6c9', backgroundColor: '#f1f8e9',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  proofBody: { flex: 1, gap: 2 },
  proofCid: { fontSize: 12.5, fontWeight: '700', color: '#1b5e20' },
  proofMeta: { fontSize: 11.5, color: COLORS.textMuted },
  photoStrip: { gap: 8, paddingVertical: 2 },
  photoThumb: {
    width: 96, height: 96, borderRadius: 12,
    backgroundColor: COLORS.border,
    borderWidth: 1, borderColor: COLORS.border,
  },
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: { width: '100%', height: '80%' },
  zoomClose: {
    position: 'absolute', top: 48, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  meshChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  meshChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  meshChipEmoji: { fontSize: 16 },
  meshChipText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  captureBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  view3DBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  view3DBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },

  estimateNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16,
  },
  estimateText: { fontSize: 13, color: COLORS.textSub },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },
  addFruitBtn: { borderRadius: 10, overflow: 'hidden' },
  addFruitBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  addFruitBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  fruitActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 12 },
  fruitVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f5e9',
    borderWidth: 1, borderColor: '#1b5e20',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    flex: 1, justifyContent: 'center',
  },
  fruitVideoBtnText: { fontSize: 13, fontWeight: '700', color: '#1b5e20' },

  fruitCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 1, overflow: 'hidden',
  },
  fruitIconWrap: {
    width: 52, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch',
    borderRightWidth: 1, borderRightColor: COLORS.border,
  },
  fruitThumb: {
    width: 64, height: 64, alignSelf: 'center',
    marginLeft: 8, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
  },
  fruitCardBody: { flex: 1, padding: 12 },
  fruitTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  fruitCode: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2, marginRight: 8 },
  fruitStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  fruitStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  fruitStatusText: { fontSize: 10, fontWeight: '600' },
  fruitMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fruitMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fruitMetaText: { fontSize: 11, color: COLORS.textMuted },

  emptyWrap: {
    alignItems: 'center', paddingTop: 40, gap: 10,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, position: 'relative',
  },
  emptyIconRing: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 46, borderWidth: 1.5, borderColor: COLORS.accentLight, opacity: 0.3,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  emptyBody: {
    fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20,
    paddingHorizontal: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 13, paddingHorizontal: 24,
    borderRadius: 13, marginTop: 6,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10,
    elevation: 4,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  harvestBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14,
    elevation: 6,
  },
  harvestBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },
  btnShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 14,
  },

  searchContainer: { marginTop: 12, marginBottom: 8 },
  searchRow: { flexDirection: 'row', gap: 12 },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 0 },
  clearSearchBtn: { padding: 4 },
  statusFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  statusFilterText: { fontSize: 14, color: COLORS.accent, fontWeight: '600', flex: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalOptionSelected: { backgroundColor: COLORS.accentGlow },
  modalOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  modalOptionTextSelected: { color: COLORS.accent, fontWeight: '600' },

  noSearchResults: { alignItems: 'center', paddingTop: 40, gap: 10 },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  historyHeaderText: { fontSize: 12, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  captureIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  captureThumb: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
  },
  captureDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  captureMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});

export default TreeDetailScreen;
