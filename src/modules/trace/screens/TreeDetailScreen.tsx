// modules/trace/screens/TreeDetailScreen.tsx
//
// 2-tab refactor:
//   - "Tổng quan": existing hero + fruit-list activity preserved.
//   - "Lịch sử":   list of capture history (local fruits).

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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import PaginationControls from '../components/PaginationControls';
import { RootState } from '../../../store';
import { Fruit } from '../types';
import { saveFruit, loadFruits } from '../store/farmSlice';
import { syncService } from '../../../services/syncService';
import { COLORS } from '../../../constants';
import { useAppDispatch } from '../../../store/hooks';
import StateView from '../../../components/state/StateView';
import TreeMetadataTab from './TreeMetadataTab';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';
import { loadTreeImages } from '../../../services/treeImageStore';
import { useSelector } from 'react-redux';

const { width } = Dimensions.get('window');
const ITEMS_PER_PAGE = 20;

type TabKey = 'overview' | 'history' | 'info';

const TAB_DEFS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'view-dashboard-outline' },
  { key: 'history',  label: 'Lịch sử',   icon: 'history' },
  { key: 'info',     label: 'Thông tin', icon: 'clipboard-text-outline' },
];

interface RouteParams { tree?: any; treeId?: string; initialTab?: TabKey; farmId?: string }

// ── Status config ─────────────────────────────────────────────────────────────
// Build 51 (2026-05-17): farmer-friendly Vietnamese status labels.
// "mature" → "Gần thu hoạch" (= chín, sẵn sàng thu hoạch) per user clarification.
// growing keep "Đang lớn" — natural Vietnamese. harvested/sold giữ nguyên.
// Multi-language sẽ ship phiên bản hoàn chỉnh (sau VN traction).
const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  growing:   { label: 'Đang lớn',        color: '#6FAF7F',        bg: 'rgba(111,175,127,0.18)', icon: 'sprout-outline' },
  mature:    { label: 'Gần thu hoạch',   color: COLORS.warning,   bg: 'rgba(176,125,47,0.12)',  icon: 'food-apple-outline' },
  harvested: { label: 'Đã thu hoạch',    color: COLORS.info,      bg: 'rgba(8,138,185,0.12)',   icon: 'basket-outline' },
  sold:      { label: 'Đã bán',          color: '#0033AD',        bg: 'rgba(0,51,173,0.08)',    icon: 'tag-outline' },
};
const getStatus = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.growing;

// ── Fruit Card ────────────────────────────────────────────────────────────────
const FruitCard = ({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: () => void;
}) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const st = getStatus(item.status);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 55, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  const hIn  = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const hOut = () => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={hIn} onPressOut={hOut}>
        <View style={styles.fruitCard}>
          <View style={[styles.fruitIconWrap, { backgroundColor: st.bg }]}>
            <Icon name={st.icon} size={22} color={st.color} />
          </View>

          <View style={styles.fruitCardBody}>
            <View style={styles.fruitTopRow}>
              <Text style={styles.fruitCode}>{item.code}</Text>
              <View style={[styles.fruitStatusChip, { backgroundColor: st.bg }]}>
                <View style={[styles.fruitStatusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.fruitStatusText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>

            <View style={styles.fruitMetaRow}>
              {item.weightGram && (
                <View style={styles.fruitMetaItem}>
                  <Icon name="scale-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{item.weightGram}g</Text>
                </View>
              )}
              {item.diameter && (
                <View style={styles.fruitMetaItem}>
                  <Icon name="circle-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{item.diameter}cm</Text>
                </View>
              )}
              {item.identifiedAt && (
                <View style={styles.fruitMetaItem}>
                  <Icon name="calendar-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{item.identifiedAt}</Text>
                </View>
              )}
              {!item.weightGram && !item.diameter && !item.identifiedAt && (
                <Text style={styles.fruitMetaText}>Chưa có dữ liệu bổ sung</Text>
              )}
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
        <Text style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '600' }}>lớn</Text>
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
  const insets     = useSafeAreaInsets();
  const route      = useRoute();
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

  const dispatch   = useAppDispatch();
  const fruits     = useSelector((state: RootState) => state.farm.fruits);
  const farms      = useSelector((state: RootState) => state.farm.farms);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-12)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;

  // mesh viewer renders, even if the server's pre-computed fruit_count is stale
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'overview');
  const [captures, setCaptures] = useState<any[] | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);

  const [fruitIdentificationResult, setFruitIdentificationResult] = useState<{
    code: string;
    treeCode: string;
    farmCode: string;
    images: string[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);

  // Ảnh cây đã lưu (local, theo tree_id) — nguồn từ treeImageStore vì server
  // /api/trees không trả URL ảnh. Kèm 1 ảnh đang xem phóng to (lightbox).
  const [treeImages, setTreeImages] = useState<string[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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
    if (tree?.id) {
      dispatch(loadFruits(tree.id));
    }
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [tree?.id]);

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

  // Lazy-load captures the first time the user opens the History tab.
  const loadCaptures = useCallback(() => {
    if (!tree?.id || capturesLoading || captures !== null) return;
    setCapturesLoading(true);
    // Use local fruits data as capture history
    setTimeout(() => {
      setCaptures(fruits.map(f => ({
        id: f.id,
        capturedAt: f.createdAt ?? f.updatedAt,
        fruitId: f.fruitId,
        status: f.status,
      })));
      setCapturesLoading(false);
    }, 300);
  }, [tree?.id, capturesLoading, captures, fruits]);

  useEffect(() => {
    if (activeTab === 'history') loadCaptures();
  }, [activeTab, loadCaptures]);

  // "Thêm quả" = nhận diện/thêm QUẢ cho CHÍNH cây này — KHÔNG phải nhận diện cây.
  // Trước đây điều hướng nhầm sang 'TreeIdentity' (luồng nhận diện + đăng ký CÂY),
  // nên bấm "Thêm quả" lần đầu lại chạy ra quy trình nhận diện cây. Sửa: đi tới
  // luồng quả gắn theo cây (FruitList), truyền tree_id như TreeManagement vẫn làm.
  const handleAddFruit = () => {
    if (!tree) return;
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
    (navigation as any).navigate('TreeIdentity');
  };

  // Cây có mô hình 3D chưa? (cùng cách gate như FarmDetailScreen/TreeCard).
  const has3D = !!(tree?.has_3d ?? tree?.has3DModel ?? tree?.latest_mesh_cid ?? tree?.meshCid);
  // Mã cây công khai để mở trang /view/{code} (three.js) — server nhận `code`, không phải id.
  const tree3DCode = tree?.code ?? tree?.shortCode ?? '';

  // Mở màn xem 3D (WebView → GET /view/{code}). Server field-reid đã có sẵn endpoint này.
  const handleView3D = () => {
    if (!tree || !tree3DCode) return;
    (navigation as any).navigate('TreeViewer3D', {
      code: tree3DCode,
      treeName: treeDisplayName,
    });
  };

  const handleSaveOnnet = async () => {
    if (!fruitIdentificationResult || !tree) return;

    try {
      const newFruit: Fruit = {
        id: `fruit_${Date.now()}`,
        treeId: tree.id,
        code: fruitIdentificationResult.code,
        images: fruitIdentificationResult.images,
        status: 'growing',
      };

      await dispatch(saveFruit(newFruit));
      await syncService.addSyncItem('fruit_identification', {
        fruit: newFruit,
        treeCode: fruitIdentificationResult.treeCode,
        farmCode: fruitIdentificationResult.farmCode,
        images: fruitIdentificationResult.images,
      }, fruitIdentificationResult.images);

      setFruitIdentificationResult(null);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error saving fruit:', error);
    }
  };

  const handleCancelIdentification = () => setFruitIdentificationResult(null);

  // Derived stats
  const totalFruits    = fruits.length;
  const growing        = fruits.filter(f => f.status === 'growing').length;
  const mature         = fruits.filter(f => f.status === 'mature').length;
  const harvested      = fruits.filter(f => f.status === 'harvested').length;
  const harvestPct     = tree?.harvestProgress ?? 0;
  const estimatedFruits = tree?.estimatedFruits ?? 0;

  const sortedFruits = [...fruits].sort((a, b) => {
    const aTime = Number(a.id?.split('_')[1] ?? 0);
    const bTime = Number(b.id?.split('_')[1] ?? 0);
    return bTime - aTime;
  });

  const filteredFruits = sortedFruits.filter(fruit => {
    const matchesCode = fruit.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || fruit.status === statusFilter;
    return matchesCode && matchesStatus;
  });
  const totalPages = Math.ceil(filteredFruits.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedFruits = filteredFruits.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => setCurrentPage(page);

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setStatusDropdownVisible(false);
    setCurrentPage(1);
  };

  // Compute from the fruits list so the chip stays consistent with whatever the
  // mesh viewer renders, even if the server's pre-computed fruit_count is stale
  // (e.g. a fruit was just marked harvested locally).
  const fruitCount = fruits.filter(f => f.status !== 'harvested').length ?? 0;
  const nearRipeCount = fruits.filter(f => f.status === 'near_ripe' || f.status === 'ripe').length ?? 0;
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
            { icon: 'counter',             val: totalFruits,    label: 'quả đã ghi nhận',  color: COLORS.accent },
            { icon: 'sprout-outline',       val: growing,        label: 'đang lớn',         color: '#6FAF7F' },
            { icon: 'food-apple-outline',   val: mature,         label: 'gần thu hoạch',    color: COLORS.warning },
            { icon: 'basket-outline',       val: harvested,      label: 'đã thu hoạch',     color: COLORS.info },
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

      {/* Mesh fruit chip + capture-again CTA */}
      <View style={styles.meshChipRow}>
        <View style={styles.meshChip}>
          <Text style={styles.meshChipEmoji}>🍈</Text>
          <Text style={styles.meshChipText}>
            {fruitCount} quả{fruitCount > 0 ? ` · ${nearRipeCount} gần chín` : ''}
          </Text>
        </View>
        {has3D && (
          <TouchableOpacity style={styles.view3DBtn} onPress={handleView3D} activeOpacity={0.85}>
            <Icon name="cube-scan" size={16} color={COLORS.accent} />
            <Text style={styles.view3DBtnText}>Xem 3D</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.captureBtn} onPress={handleScan3D} activeOpacity={0.85}>
          <Icon name="camera-outline" size={16} color={COLORS.white} />
          <Text style={styles.captureBtnText}>Chụp lại</Text>
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
          <Text style={styles.sectionTitle}>DANH SÁCH QUẢ</Text>
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
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Icon name="magnify" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm theo mã quả..."
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

  const overviewEmpty =
    searchQuery.length > 0 || statusFilter !== 'all' ? (
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
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={overviewHeader}
      ListEmptyComponent={overviewEmpty}
      renderItem={({ item, index }) => (
        <FruitCard item={item} index={index} onPress={() => {}} />
      )}
      ListFooterComponent={
        totalPages > 1 ? (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onNextPage={handlePageChange.bind(null, currentPage + 1)}
            onPreviousPage={handlePageChange.bind(null, currentPage - 1)}
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
  const historyBody = (
    <FlatList
      data={captures ?? []}
      keyExtractor={(c) => c.capture_id}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListHeaderComponent={
        <View style={styles.historyHeader}>
          <Icon name="history" size={16} color={COLORS.accent} />
          <Text style={styles.historyHeaderText}>Các lần quét 3D gần đây</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Icon name="archive-outline" size={36} color={COLORS.accentLight} />
          <Text style={styles.emptyTitle}>
            {capturesLoading ? 'Đang tải lịch sử…' : 'Chưa có lần quét nào'}
          </Text>
          {!capturesLoading && (
            <Text style={styles.emptyBody}>
              Quét 3D cây này để tạo lần quét đầu tiên.
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.captureCard}>
          <View style={styles.captureIconWrap}>
            <Icon name="cube-scan" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.captureDate}>
              {new Date(item.captured_at).toLocaleString('vi-VN')}
            </Text>
            <Text style={styles.captureMeta}>
              {item.frame_count} frame · {item.cid_v2 ? 'đã refine v2' : 'v1'}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={COLORS.accentLight} />
        </View>
      )}
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

      {fruitIdentificationResult && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.identificationResult}>
            <View style={styles.resultHeader}>
              <Icon name="check-circle" size={48} color={COLORS.success} />
              <Text style={styles.resultTitle}>Đã xác định 1 quả!</Text>
            </View>

            <View style={styles.resultDetails}>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>MÃ QUẢ</Text>
                <Text style={styles.resultValue}>{fruitIdentificationResult.code}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>MÃ CÂY</Text>
                <Text style={styles.resultValue}>{fruitIdentificationResult.treeCode}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>MÃ TRẠI</Text>
                <Text style={styles.resultValue}>{fruitIdentificationResult.farmCode}</Text>
              </View>
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelIdentification}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveOnnet}
              >
                <Text style={styles.saveBtnText}>Lưu onnet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Existing Activity navigation — preserved per spec */}
      {activeTab === 'overview' && fruits.length > 0 && !fruitIdentificationResult && (
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

            {Object.entries(STATUS_MAP).map(([key, status]) => (
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
  fruitActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fruitVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f5e9',
    borderWidth: 1, borderColor: '#1b5e20',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
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
  fruitCardBody: { flex: 1, padding: 12 },
  fruitTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  fruitCode: { fontSize: 15, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },
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

  identificationResult: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  resultHeader: { alignItems: 'center', marginBottom: 32 },
  resultTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 12 },
  resultDetails: { width: '100%', marginBottom: 32 },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultLabel: { fontSize: 12, fontWeight: '700', color: COLORS.accent, letterSpacing: 1 },
  resultValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  resultActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },

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
  captureDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  captureMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});

export default TreeDetailScreen;
