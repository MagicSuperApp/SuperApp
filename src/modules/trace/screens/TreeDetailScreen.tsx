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
  Linking,
} from 'react-native';
// Icon: bo Font Awesome Solid tai qua Iconify (assets/icons -> icons.generated).
// Them icon moi: `node scripts/icons.js <ten-fa6-solid>`.
import Icon, { type IconName } from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import PaginationControls from '../components/PaginationControls';
import { RootState } from '../../../store';
import { COLORS } from '../../../constants';
// Nen huu co dung chung cua module (tong dat/la) - xem theme/depth.ts
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_CARD, ORGANIC_TILE, ELEVATION as ORG_ELEV, TYPE as ORG_TYPE,
} from '../theme/depth';
import { GroundBackdrop } from '../components/layered/Organic';
import { useTk } from '../../../i18n/keys';
import StateView from '../../../components/state/StateView';
import RemoteImage from '../../../components/RemoteImage';
import TreeMetadataTab from './TreeMetadataTab';
import EntityTimeline from '../components/EntityTimeline';
import TreePublicSheet from '../components/TreePublicSheet';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';
import { loadTreeImages } from '../../../services/treeImageStore';
import { fetchTreeViews, treeViewImageUrls } from '../../../services/treeViewsService';
import { loadVideoProofs, type VideoProof } from '../../../services/videoProofStore';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import rLog from '../../../services/remoteLogger';
import {
  getTreeLayout,
  type TreeLayoutResponse, type TreeLayoutFruit,
  type FruitStatus, type TreeZone,
} from '../../../services/fruitReIDService';
import { getTrees, mapTreeInfoToUI, removeTreeViews, setTreeFarm } from '../../../services/treeReIDService';
import { useSelector } from 'react-redux';

const { width } = Dimensions.get('window');
const ITEMS_PER_PAGE = 20;

type TabKey = 'overview' | 'history' | 'info';

const TAB_DEFS: { key: TabKey; labelKey: string; icon: IconName }[] = [
  { key: 'overview', labelKey: 'trace.tree.tabOverview', icon: 'table-cells-large' },
  { key: 'history', labelKey: 'trace.tree.tabHistory', icon: 'clock-rotate-left' },
  { key: 'info', labelKey: 'trace.tree.tabInfo', icon: 'clipboard-list' },
];

interface RouteParams { tree?: any; treeId?: string; initialTab?: TabKey; farmId?: string }

// ── Status config ─────────────────────────────────────────────────────────────
// Từ vựng trạng-thái theo ĐÚNG field-reid (on_tree / harvested / lost). Bộ cũ
// (growing/mature/sold) là của bảng SQLite `fruits` không còn dùng → lọc theo nó
// thì KHÔNG BAO GIỜ khớp quả thật, danh sách rỗng oan.
const STATUS_MAP: Record<FruitStatus, { labelKey: string; color: string; bg: string; icon: string }> = {
  on_tree: { labelKey: 'trace.fruit.onTree', color: ORG_TONE.primary, bg: ORG_TONE.primarySoft, icon: 'apple-whole' },
  harvested: { labelKey: 'trace.fruit.harvested', color: ORG_TONE.sun, bg: ORG_TONE.sunSoft, icon: 'basket-shopping' },
  lost: { labelKey: 'trace.fruit.lost', color: ORG_NATURE.barkSoft, bg: ORG_SURFACE.sunken, icon: 'circle-xmark' },
};
const getStatus = (s?: string) => STATUS_MAP[s as FruitStatus] ?? STATUS_MAP.on_tree;

const ZONE_VI: Record<TreeZone, string> = { base: 'Base', mid: 'Mid', canopy: 'Canopy' };

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
  const tk = useTk();
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
          {/* Ảnh hỏng rơi về ĐÚNG ô icon vốn đã có cho trường hợp không ảnh — trước
              đây chỉ nhánh `thumb === null` dùng nó, còn "có url mà tải hỏng" thì để
              trống, cho ra ô xanh nhạt rỗng suốt cả danh sách. */}
          <RemoteImage
            uri={thumb}
            style={styles.fruitThumb}
            containerStyle={styles.fruitThumb}
            resizeMode="cover"
            placeholder={
              <View style={[styles.fruitIconWrap, { backgroundColor: st.bg }]}>
                <Icon name={st.icon} size={22} color={st.color} />
              </View>
            }
          />

          <View style={styles.fruitCardBody}>
            <View style={styles.fruitTopRow}>
              <Text style={styles.fruitCode} numberOfLines={1}>
                {item.name || tk('trace.tree.unnamed')}
              </Text>
              <View style={[styles.fruitStatusChip, { backgroundColor: st.bg }]}>
                <View style={[styles.fruitStatusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.fruitStatusText, { color: st.color }]}>{tk(st.labelKey)}</Text>
              </View>
            </View>

            <View style={styles.fruitMetaRow}>
              <View style={styles.fruitMetaItem}>
                <Icon name="camera" size={12} color={COLORS.textMuted} />
                <Text style={styles.fruitMetaText}>{item.n_views}</Text>
              </View>
              {item.zone && (
                <View style={styles.fruitMetaItem}>
                  <Icon name="location-dot" size={12} color={COLORS.textMuted} />
                  <Text style={styles.fruitMetaText}>{ZONE_VI[item.zone]}</Text>
                </View>
              )}
              {enrolled ? (
                <View style={styles.fruitMetaItem}>
                  <Icon name="calendar" size={12} color={COLORS.textMuted} />
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
        borderWidth: stroke, borderColor: ORG_TONE.border,
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
}> = ({ active, onChange }) => {
  const tk = useTk();
  return (
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
              {tk(t.labelKey)}
            </Text>
            {isActive && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

/** Kiểu riêng cho màn "chưa có cây" (đang tải / hỏi hỏng / không có). */
const noTreeStyles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  line: { marginTop: 16, fontSize: 16, color: COLORS.text, textAlign: 'center' },
  retry: {
    marginTop: 20, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: COLORS.accent, borderRadius: 8,
  },
  retryTxt: { color: COLORS.white, fontWeight: '600' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const TreeDetailScreen = () => {
  const tk = useTk();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = route.params as RouteParams | undefined;
  const treesInStore = useSelector((state: RootState) => state.farm.trees);
  // Chấp nhận cả {tree} (object) lẫn {treeId} (string). Caller cũ TreeEnroll /
  // TreeManagement chỉ truyền treeId → tra cây từ store theo id hoặc tree_id.
  // Chỉ dùng cây TÌM THẤY (đúng shape) nên không rủi ro sai ID.
  const treeFromStore = useMemo(() => {
    if (params?.tree) return params.tree;
    const id = params?.treeId;
    if (!id) return undefined;
    return treesInStore.find((t: any) => t?.id === id || t?.tree_id === id);
  }, [params?.tree, params?.treeId, treesInStore]);
  const initialTab = params?.initialTab;

  /**
   * ĐƯỜNG LÙI VỀ MÁY CHỦ khi Redux chưa có cây.
   *
   * Đo được: vào đây từ `TreeManagement` thì màn bật ngược trở ra. Danh sách ở
   * `TreeManagement` lấy THẲNG từ máy chủ (`GET /api/trees`) và không đổ vào
   * Redux, còn màn này chỉ tra Redux — nên cây vừa bấm không có trong store,
   * `tree` là `undefined`, và effect an-toàn cũ gọi `goBack()` ngay. Người dùng
   * thấy màn nhấp nháy rồi văng về, không một chữ giải thích.
   *
   * Nay: Redux không có thì HỎI MÁY CHỦ. Máy chủ chưa có cửa lấy MỘT cây
   * (`treeReIDService` chỉ mở `GET /api/trees`, xem danh sách endpoint đầu tệp
   * đó), nên hỏi cả danh sách rồi lọc theo `tree_id` — không bịa cửa mới.
   * Dựng đúng bằng `mapTreeInfoToUI`, cùng hàm store dùng, để cây đến từ hai
   * đường có CÙNG một hình dạng; hai hình dạng khác nhau là chỗ đẻ lỗi sau này.
   */
  const [fetchedTree, setFetchedTree] = useState<any>(null);
  /** Đang hỏi máy chủ. Khác hẳn "không có cây" — màn phải nói ra là đang chờ. */
  const [treeLoading, setTreeLoading] = useState(false);
  /** Hỏi hỏng (mạng/máy chủ). Còn cây hay không thì CHƯA BIẾT. */
  const [treeError, setTreeError] = useState<string | null>(null);
  /** Máy chủ trả lời rõ ràng là KHÔNG có cây này. Chỉ lúc đó mới được bật ra. */
  const [treeMissing, setTreeMissing] = useState(false);
  const [treeNonce, setTreeNonce] = useState(0);
  const retryTree = useCallback(() => {
    setTreeError(null);
    setTreeNonce(n => n + 1);
  }, []);

  const tree = treeFromStore ?? fetchedTree ?? undefined;

  useEffect(() => {
    const id = params?.treeId;
    // Đã có cây (tham số hoặc store) thì khỏi hỏi — đừng bắn thêm một lượt mạng
    // giữa vườn chỉ để lấy thứ đang cầm trong tay.
    if (treeFromStore || !id) return;
    let alive = true;
    setTreeLoading(true);
    setTreeError(null);
    setTreeMissing(false);
    (async () => {
      const res = await getTrees(ORILIFE_BASE, params?.farmId);
      if (!alive) return;
      if (!res.ok || !res.trees) {
        setTreeError(res.error?.detail || tk('map.tree.loadFail'));
      } else {
        const hit = res.trees.find(t => t.tree_id === id);
        if (hit) setFetchedTree(mapTreeInfoToUI(hit, params?.farmId ?? ''));
        else setTreeMissing(true);
      }
      setTreeLoading(false);
    })();
    return () => { alive = false; };
  }, [treeFromStore, params?.treeId, params?.farmId, treeNonce, tk]);

  // Bật ra CHỈ khi máy chủ cũng nói không có. Mạng hỏng thì ở lại và hỏi lại —
  // bật ra lúc chưa biết là biến một trục trặc mạng thành "cây này không tồn tại".
  useEffect(() => {
    if (treeMissing) navigation.goBack();
  }, [treeMissing, navigation]);

  const farms = useSelector((state: RootState) => state.farm.farms);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-12)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'overview');
  /** Tấm trượt "Công khai & mã QR" — mở từ nút trên thanh dưới. */
  const [publicOpen, setPublicOpen] = useState(false);

  // Quả của cây — lấy từ field-reid (xem chú thích đầu file).
  const [layout, setLayout] = useState<TreeLayoutResponse | null>(null);
  const [fruitsLoading, setFruitsLoading] = useState(false);
  const [fruitsError, setFruitsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);

  // Ảnh cây: ưu-tiên ảnh SERVER (GET /api/tree_views — sống theo tài-khoản, chống "đổi
  // máy mất ảnh"), gộp thêm ảnh local (treeImageStore) chưa kịp đồng-bộ. Kèm 1 ảnh đang
  // xem phóng to (lightbox).
  const [treeImages, setTreeImages] = useState<string[]>([]);
  /** Bản `file://` CÙNG những ảnh đó còn trong máy — đường lùi khi `/gimg` từ chối. */
  const [localImages, setLocalImages] = useState<string[]>([]);
  /** Lỗi tầng danh sách (`/api/tree_views`), phân biệt với lỗi tầng byte (`/gimg`). */
  const [imagesError, setImagesError] = useState<string | null>(null);
  /** Đếm ảnh hỏng hẳn để nói thật với người dùng "4 ảnh · 4 chưa xem được". */
  const [brokenImages, setBrokenImages] = useState(0);
  /** Đổi số này = ép nạp lại ảnh kèm URL mới, phá bộ đệm âm (404 bị cache). */
  const [imgRetry, setImgRetry] = useState(0);
  // Câu tiếng Việt máy chủ mô tả đặc điểm nhận dạng của cây (`?describe=1`). Backend
  // trả sẵn từ lâu (`server.py:3041`) nhưng màn này chưa bao giờ XIN, nên chưa bao giờ vẽ.
  const [treeFeatures, setTreeFeatures] = useState<string[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [videoProofs, setVideoProofs] = useState<VideoProof[]>([]);

  /**
   * Bao nhiêu ảnh ĐẦU dải là ảnh máy chủ. Con số này là điều kiện SỐNG CÒN của
   * nút xoá góc: `/api/remove_views` nhận VỊ TRÍ trong `/api/tree_views`, mà dải
   * ảnh ở đây có thể đang là danh sách LOCAL (đường lùi khi máy chủ trả rỗng).
   * Xoá theo vị trí của dải local = xoá nhầm góc khác trên máy chủ, và người dùng
   * KHÔNG thấy gì sai vì ảnh trong máy vẫn còn nguyên. Nên `0` = không cho xoá.
   */
  const [serverImgCount, setServerImgCount] = useState(0);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);

  /**
   * Vườn do màn này vừa gán. `undefined` = chưa đụng tới (dùng `tree.farmId`).
   * `null` = vừa gỡ khỏi vườn. Giữ riêng vì `tree` đến từ route/store, gán xong
   * mà chờ store đồng bộ thì hàng vườn vẫn hiện giá trị cũ.
   */
  const [farmOverride, setFarmOverride] = useState<string | null | undefined>(undefined);
  const [farmPickerOpen, setFarmPickerOpen] = useState(false);
  const [farmSaving, setFarmSaving] = useState(false);

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

  // Nạp ảnh cây. Tách thành hàm riêng vì cần gọi lại khi màn được focus (quay video
  // xong quay về) và khi người dùng bấm "Tải lại".
  //
  // HAI DANH SÁCH, KHÔNG CHỌN MỘT. Trước đây dòng này là
  //   `setTreeImages(serverImgs.length > 0 ? serverImgs : local)`
  // — điều kiện chọn là "danh sách server KHÔNG RỖNG", không phải "ảnh server HIỂN
  // THỊ ĐƯỢC". Mà byte ảnh đi qua `/gimg`, một cổng KHÔNG ký, xét quyền lúc gọi, đóng
  // theo tiến trình máy chủ. Nên `/api/tree_views` trả 200 kèm 4 URL trong khi cả 4
  // URL đó 404: app VỨT 4 ảnh `file://` đang nằm sẵn trong máy rồi vẽ 4 ô xám câm.
  // Nay giữ cả hai: dải vẫn đi theo thứ tự server (nguồn chuẩn, không nhân đôi ảnh),
  // ảnh nào hỏng thì `RemoteImage` tự tráo sang bản local CÙNG CHỈ SỐ.
  const loadImages = useCallback(async () => {
    const id = tree?.id;
    if (!id) return;
    const [viewsRes, local] = await Promise.all([
      fetchTreeViews(ORILIFE_BASE, id, { describe: true }).catch(() => null),
      loadTreeImages(id).catch(() => [] as string[]),
    ]);
    const localImgs = Array.from(new Set(local ?? []));
    const serverImgs = viewsRes?.ok ? treeViewImageUrls(viewsRes.data, ORILIFE_BASE) : [];
    setLocalImages(localImgs);
    setTreeImages(serverImgs.length > 0 ? serverImgs : localImgs);
    setServerImgCount(serverImgs.length);
    // Lỗi tầng DANH SÁCH (401 hết phiên / 403 không phải cây của bạn / mất mạng) —
    // trước đây cả ba cho ra cùng một mảng rỗng, không thông báo, không nút thử lại.
    setImagesError(viewsRes && !viewsRes.ok ? viewsRes.error?.type ?? 'unknown' : null);
    setBrokenImages(0);
    const feats = (viewsRes?.ok ? viewsRes.data?.views ?? [] : [])
      .flatMap(v => v.features_vi ?? [])
      .map(t => t.trim())
      .filter(Boolean);
    setTreeFeatures(Array.from(new Set(feats)).slice(0, 8));
  }, [tree?.id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadImages().catch(() => undefined).then(() => { if (!alive) return; });
      return () => { alive = false; };
    }, [loadImages]),
  );

  // Gán cây vào vườn / gỡ khỏi vườn — `POST /api/tree/set_farm`.
  //
  // VÌ SAO MÀN NÀY CẦN: cây đăng ký thiếu `farm_id` bị `/api/trees?farm_id` lọc
  // bỏ, tức nó BIẾN MẤT khỏi danh sách cây của vườn. Người dùng mở được nó qua
  // mã/quét nhưng không có đường nào sửa — trước đây app không hề gọi cửa này.
  const handlePickFarm = useCallback(async (farmId: string | null) => {
    const id = tree?.id;
    if (!id) return;
    setFarmSaving(true);
    const r = await setTreeFarm(ORILIFE_BASE, id, farmId);
    setFarmSaving(false);
    setFarmPickerOpen(false);
    if (r.ok) { setFarmOverride(r.farmId ?? null); return; }
    // 404 của máy chủ GỘP "vườn không tồn tại" với "vườn của người khác" — cố ý,
    // để không lộ sự tồn tại vườn người khác. App không được đoán ra một trong hai.
    Alert.alert(
      'Chưa đổi được vườn',
      r.notOwner
        ? 'Cây này không thuộc tài khoản đang đăng nhập.'
        : r.farmNotFound
          ? 'Không mở được vườn vừa chọn. Nạp lại danh sách vườn rồi thử lại.'
          : r.error?.detail ?? 'Không gọi được máy chủ. Thử lại khi có mạng.',
    );
  }, [tree?.id]);

  // Xoá một góc ảnh hỏng — `POST /api/remove_views`.
  //
  // Xoá TỪNG góc một rồi nạp lại, KHÔNG gom nhiều chỉ số vào một lần bấm: sau mỗi
  // lần xoá các vị trí phía sau dồn lên, nên chỉ số thứ hai trong cùng một mẻ đã
  // trỏ sang góc khác.
  const handleDeleteView = useCallback((idx: number) => {
    const id = tree?.id;
    if (!id) return;
    Alert.alert(
      'Xoá góc ảnh này?',
      'Cây sẽ còn ít góc nhận dạng hơn. Chỉ nên xoá ảnh chụp hỏng hoặc chụp nhầm cây.',
      [
        { text: 'Thôi', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            setDeletingIdx(idx);
            const r = await removeTreeViews(ORILIFE_BASE, id, [idx]);
            setDeletingIdx(null);
            if (!r.ok) {
              Alert.alert(
                'Chưa xoá được',
                r.notOwner
                  ? 'Cây này không thuộc tài khoản đang đăng nhập.'
                  : r.error?.detail ?? 'Không gọi được máy chủ. Thử lại khi có mạng.',
              );
              return;
            }
            // Đọc `removed` của máy chủ. `ok:true` mà `removed:0` là ca THẬT (chỉ
            // số ngoài phạm vi) — im lặng ở đây thì người dùng thấy ảnh vẫn còn và
            // tưởng app đơ.
            if ((r.removed ?? 0) === 0) {
              Alert.alert('Máy chủ không xoá góc nào', 'Danh sách ảnh vừa đổi. Nạp lại rồi chọn lại ảnh cần xoá.');
            }
            await loadImages().catch(() => undefined);
          },
        },
      ],
    );
  }, [tree?.id, loadImages]);

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
      setFruitsError(r.error?.detail ?? tk('trace.tree.fruitLoadFail'));
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

  // Chưa có cây thì màn phải nói ĐANG Ở ĐÂU trong ba tình huống khác hẳn nhau:
  // đang hỏi máy chủ / hỏi hỏng (chưa biết) / máy chủ nói không có. Trước bản
  // này cả ba đều bị effect an-toàn nuốt thành một cú `goBack()` im lặng.
  if (!tree) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? 56 : 40) + insets.top }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{tk('trace.tree.title')}</Text>
        </View>
        <View style={noTreeStyles.body}>
          {treeLoading ? (
            <>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={noTreeStyles.line}>{tk('map.tree.loading')}</Text>
            </>
          ) : (
            <>
              <Icon name="circle-exclamation" size={48} color={COLORS.error} />
              <Text style={noTreeStyles.line}>{treeError ?? tk('map.tree.notFound')}</Text>
              {/* Nút hỏi lại CHỈ hiện khi lỗi là do hỏi hỏng. Máy chủ đã nói
                  không có cây thì hỏi lại chẳng đổi được gì. */}
              {treeError ? (
                <TouchableOpacity style={noTreeStyles.retry} onPress={retryTree}>
                  <Text style={noTreeStyles.retryTxt}>{tk('trace.button.retry')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
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
    // Lối quay video giờ nằm TRONG trang này (tấm chọn nguồn ảnh), không còn là
    // nút riêng ở đây nữa — xem chú thích ở hàng nút bên dưới.
    (navigation as any).navigate('FruitList', {
      treeId: tree.id,
      treeName: (tree as any).name,
      farmId: tree.farmId,
    });
  };

  // Quay video ĐỊNH DANH CÂY → bổ-sung góc nhìn cho chính cây này (OriLife /api/tree/{id}/video).
  // Khác "Video quả": làm giàu góc của cây để nhận-diện sau chắc hơn.
  const handleTreeVideo = () => {
    if (!tree) return;
    (navigation as any).navigate('TreeVideo', {
      treeId: tree.id,
      treeName: (tree as any).name,
      farmId: tree.farmId,
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
    : tk('trace.tree.noGps');

  // Build 52 § A7 — farmer-friendly tree name (UUID → "Cây #3 góc Đông")
  // Vườn ĐANG hiệu lực = bản vừa gán ở màn này (nếu có), không thì bản của cây.
  const effectiveFarmId: string | null =
    farmOverride !== undefined ? farmOverride : (tree?.farmId ?? null);
  const currentFarm = effectiveFarmId ? farms.find(f => f.id === effectiveFarmId) ?? null : null;
  // Tên vườn hiện lên: ưu tiên tên trong danh sách vườn; `tree.farmName` là bản
  // chụp lúc mở màn nên chỉ dùng khi chưa gán lại ở đây.
  const farmLabel = currentFarm?.name
    ?? (farmOverride === undefined ? (tree?.farmName as string | undefined) : undefined)
    ?? null;
  const treeDisplayName = tree ? formatTreeName(tree, currentFarm) : '';
  const treeShortCode = tree ? shortTreeCode(tree) : '';

  // ── Header (shared across tabs) ─────────────────────────────────────────────
  const Header = (
    <Animated.View style={[styles.header, { paddingTop: 40 + insets.top }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Icon name="arrow-left" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerEyebrow}>{tk('trace.tree.title')}</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{treeDisplayName}</Text>
        {treeShortCode ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>{tk('trace.label.code')} {treeShortCode}</Text>
        ) : null}
      </View>
      {/* Đặt vị-trí cây trong sơ đồ 3D bằng tay (tuỳ chọn — mặc định theo GPS
          hoặc rải ngẫu nhiên ổn định trong ranh giới vườn). */}
      <TouchableOpacity style={styles.headerActionBtn} onPress={handlePlaceInFarm}>
        <Icon name="map-pin" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerActionBtn}
        onPress={() => tree && (navigation as any).navigate('CareScan', {
          targetType: 'tree', targetId: tree.id, treeName: (tree as any).name,
        })}
      >
        <Icon name="spray-can" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      {/* Biến thiên của cây — "cây thay lá rồi, máy còn nhận ra nó không?".
          Máy chủ tính sẵn số này từ lâu; đây là chỗ đầu tiên app hỏi tới. */}
      <TouchableOpacity
        style={styles.headerActionBtn}
        onPress={() => tree && (navigation as any).navigate('TreeDrift', {
          treeId: tree.id, treeName: (tree as any).name,
        })}
        accessibilityLabel="Biến thiên của cây"
      >
        <Icon name="chart-line" size={20} color={COLORS.textSub} />
      </TouchableOpacity>
      {/* Chia sẻ dữ liệu RIÊNG của đúng cây này cho một người — không phải mở
          công khai, và không đụng tới cây khác. */}
      <TouchableOpacity
        style={styles.headerActionBtn}
        onPress={() => tree && (navigation as any).navigate('TreeShare', {
          scopeType: 'tree', scopeId: tree.id, scopeName: (tree as any).name,
        })}
        accessibilityLabel="Chia sẻ dữ liệu riêng của cây"
      >
        <Icon name="share-nodes" size={20} color={COLORS.textSub} />
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
              {/* Hàng vườn LUÔN hiện, kể cả khi cây chưa thuộc vườn nào. Bản cũ
                  ẩn hàng này khi không có tên vườn — đúng ca cây mồ côi, tức là
                  ca DUY NHẤT cần sửa lại bị giấu đi. Chạm để gán vườn. */}
              <TouchableOpacity
                style={styles.heroFarmRow}
                activeOpacity={0.7}
                onPress={() => setFarmPickerOpen(true)}
                accessibilityLabel={farmLabel ? `Vườn ${farmLabel}, chạm để đổi` : 'Cây chưa thuộc vườn nào, chạm để chọn vườn'}
              >
                <Icon name="tree" size={12} color={farmLabel ? COLORS.textMuted : ORG_TONE.sun} />
                <Text style={[styles.heroFarmText, !farmLabel && styles.heroFarmMissing]}>
                  {farmLabel ?? 'Chưa thuộc vườn nào — chạm để chọn'}
                </Text>
              </TouchableOpacity>
              <View style={styles.heroFarmRow}>
                <Icon name="location-dot" size={12} color={COLORS.textMuted} />
                <Text style={styles.heroFarmText}>{gpsText}</Text>
              </View>
            </View>
          </View>
          <CircleProgress pct={harvestPct} size={72} />
        </View>

        <View style={styles.heroDivider}>
          <View style={styles.heroDividerLine} />
          <Icon name="leaf" size={12} color={COLORS.accentLight} />
          <View style={styles.heroDividerLine} />
        </View>

        <View style={styles.heroStats}>
          {[
            { icon: 'counter', val: totalFruits, label: tk('trace.tree.statRecorded'), color: ORG_TONE.primary },
            { icon: 'apple-whole', val: onTreeCount, label: tk('trace.tree.statOnTree'), color: ORG_TONE.leaf },
            { icon: 'basket-shopping', val: harvestedCount, label: tk('trace.tree.statPicked'), color: ORG_TONE.sun },
            { icon: 'circle-xmark', val: lostCount, label: tk('trace.tree.statLost'), color: ORG_NATURE.barkSoft },
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

      {/* Máy chủ mô tả cây này bằng lời (`/api/tree_views?describe=1` → features_vi):
          cành chính hướng nào, quả nằm tầng nào… Đặt NGAY DƯỚI tên cây vì đây là
          lời tả chính con cây, không phải chú thích cho dải ảnh — chỗ cũ của nó là
          cuối dải ảnh, phải cuộn hết ảnh mới thấy.

          Khi cây ĐÃ có ảnh mà máy chủ vẫn chưa trả mô tả (bản máy chủ cũ bỏ qua
          tham số `describe`), nói thẳng ra một câu. Im lặng ở đây đọc đúng như
          "tính năng bị gỡ mất". */}
      {treeFeatures.length > 0 ? (
        <View style={styles.featuresBox}>
          <Text style={styles.featuresTitle}>{tk('trace.tree.featuresTitle')}</Text>
          {treeFeatures.map((f, i) => (
            <Text key={`f${i}`} style={styles.featuresLine}>• {f}</Text>
          ))}
        </View>
      ) : treeImages.length > 0 ? (
        <View style={styles.featuresBox}>
          <Text style={styles.featuresTitle}>{tk('trace.tree.featuresTitle')}</Text>
          <Text style={styles.featuresPending}>{tk('trace.tree.featuresPending')}</Text>
        </View>
      ) : null}

      {/* Ảnh cây đã lưu — dải ngang, chạm để phóng to.
          LUÔN VẼ KHỐI NÀY, kể cả khi chưa có ảnh nào: nút "Video cây" nằm trong đây,
          mà đó đúng là lối để bổ sung ảnh. Ẩn khối khi rỗng = giấu mất lối thoát của
          người đang thiếu ảnh. */}
      {(
        <View style={styles.photoStripWrap}>
          <View style={styles.photoStripHeader}>
            <View style={styles.sectionLeft}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>
                {tk('trace.tree.photos', { n: treeImages.length })}
                {brokenImages > 0 ? tk('trace.tree.photosBroken', { n: brokenImages }) : ''}
              </Text>
            </View>
            {/* Bổ-sung góc nhìn cho cây bằng video → /api/tree/{id}/video (server chắt khung). */}
            <TouchableOpacity style={styles.treeVideoBtn} onPress={handleTreeVideo} activeOpacity={0.8}>
              <Icon name="video" size={15} color="#1b5e20" />
              <Text style={styles.treeVideoBtnText}>Video cây</Text>
            </TouchableOpacity>
          </View>

          {/* Ảnh 404 KHÔNG có nghĩa là ảnh mất: `/gimg` xét quyền lúc gọi và trả 404
              giả-không-tồn-tại khi từ chối. Chữ phải nói đúng điều đó — tuyệt đối
              không viết "ảnh đã mất/đã xoá" và không tô đỏ như lỗi của app. */}
          {(brokenImages > 0 || imagesError) && (
            <View style={styles.photoNote}>
              <Icon name="circle-info" size={13} color="#8a6d1f" />
              <Text style={styles.photoNoteText}>
                {imagesError
                  ? tk('trace.tree.photoNetFail')
                  : tk('trace.tree.photoServerFail')}
              </Text>
              <TouchableOpacity
                onPress={() => { setImgRetry(n => n + 1); loadImages().catch(() => undefined); }}
                style={styles.photoRetryBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.photoRetryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {treeImages.length === 0 && !imagesError && (
            <Text style={styles.photoEmptyText}>Cây này chưa có ảnh nào.</Text>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {treeImages.map((uri, i) => (
              <View key={`${uri}-${i}`}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setZoomImage(uri)}>
                  <RemoteImage
                    uri={uri}
                    fallbackUri={localImages[i]}
                    retryKey={imgRetry}
                    style={styles.photoThumb}
                    resizeMode="cover"
                    onFinalError={() => setBrokenImages(n => n + 1)}
                    placeholder={<Icon name="image" size={22} color="#9bb0a4" />}
                    accessibilityLabel={`Ảnh cây ${i + 1}`}
                  />
                </TouchableOpacity>
                {/* Chỉ ảnh nào ĐANG là ảnh máy chủ mới xoá được: `remove_views`
                    nhận vị trí trong `/api/tree_views`. Dải đang chạy bản lùi
                    local thì vị trí không khớp nữa ⇒ không hiện nút, thà thiếu
                    nút còn hơn xoá nhầm góc mà không ai thấy. */}
                {i < serverImgCount && (
                  <TouchableOpacity
                    style={styles.photoDelBtn}
                    activeOpacity={0.8}
                    disabled={deletingIdx !== null}
                    onPress={() => handleDeleteView(i)}
                    accessibilityLabel={`Xoá ảnh cây ${i + 1}`}
                  >
                    {deletingIdx === i
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Icon name="trash" size={11} color="#fff" />}
                  </TouchableOpacity>
                )}
              </View>
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
            <Text style={styles.sectionTitle}>{tk('trace.tree.videos', { n: videoProofs.length })}</Text>
          </View>
          {videoProofs.map(p => (
            <TouchableOpacity
              key={p.videoCid}
              style={styles.proofRow}
              activeOpacity={0.7}
              onPress={() => {
                Linking.openURL(`https://lampnet.cloud/${p.videoCid}`)
              }}
            >
              <Icon
                name={p.stored === false ? 'triangle-exclamation' : 'shield-halved'}
                size={15}
                color={p.stored === false ? '#B26A00' : '#1b5e20'}
              />
              <View style={styles.proofBody}>
                <Text style={styles.proofCid} numberOfLines={1}>{p.videoCid}</Text>
                <Text style={styles.proofMeta}>
                  {p.stored === false ? tk('trace.tree.notUploaded') : ''}
                  {p.at ? new Date(p.at).toLocaleString('vi-VN') : ''}
                  {p.nFruitsMax ? ` · khoảng ${p.nFruitsMax} quả` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => {
                Clipboard.setString(p.videoCid);
              }}>
                <Icon name="copy" size={14} color={COLORS.textMuted} />

              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mesh fruit chip + capture-again CTA */}
      <View style={styles.meshChipRow}>
        <View style={styles.meshChip}>
          <Text style={styles.meshChipEmoji}>🍈</Text>
          <Text style={styles.meshChipText}>
            {totalFruits}
          </Text>
        </View>
        <TouchableOpacity style={styles.captureBtn} onPress={handleView3D} activeOpacity={0.85}>
          <Icon name="expand" size={16} color={COLORS.white} />
          <Text style={styles.captureBtnText}>Sơ đồ 3D</Text>
        </TouchableOpacity>
      </View>

      {estimatedFruits > 0 && (
        <View style={styles.estimateNote}>
          <Icon name="chart-line" size={14} color={COLORS.accent} />
          <Text style={styles.estimateText}>
            Dự kiến <Text style={{ fontWeight: '700', color: COLORS.accent }}>{estimatedFruits} quả</Text> trong mùa này
          </Text>
        </View>
      )}

      <View style={styles.sectionRow}>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>
            {totalFruits > 0
              ? tk('trace.tree.fruitListN', { n: totalFruits })
              : tk('trace.tree.fruitList')}
          </Text>
          {fruitsLoading && <ActivityIndicator size="small" color={COLORS.accent} />}
        </View>
        <View style={styles.fruitActionRow}>
          <TouchableOpacity
            style={styles.addFruitBtn}
            onPress={handleAddFruit}
            onPressIn={() => Animated.spring(btnScale, { toValue: 0.94, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
            activeOpacity={1}
          >
            <Animated.View style={[styles.addFruitBtnInner, { transform: [{ scale: btnScale }] }]}>
              <Icon name="plus" size={15} color={COLORS.accent} />
              <Text style={styles.addFruitBtnText}>{tk('trace.tree.addFruit')}</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
      {/* MỘT cửa thêm quả. Bản cũ có thêm nút "Video quả" ngay cạnh, cũng nói là
          thêm quả nhưng chạy đường khác hẳn: `fruit_video` chỉ ĐẾM quả trên khung
          hình, KHÔNG enroll (xem đầu `fruitVideoService.ts`) — nên quay xong danh
          sách vẫn rỗng. Nay lối quay video nằm trong chính trang "Quả trên cây",
          cạnh chụp ảnh và thư viện, và nói rõ nó làm gì. */}

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Icon name="magnifying-glass" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
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
                <Icon name="xmark" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.statusFilterBtn}
            onPress={() => setStatusDropdownVisible(true)}
          >
            <Icon name="filter" size={18} color={COLORS.accent} />
            <Text style={styles.statusFilterText}>
              {statusFilter === 'all'
                ? tk('trace.fruit.allStatus')
                : tk(getStatus(statusFilter).labelKey)}
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
      <Icon name="plug-circle-xmark" size={36} color={COLORS.warning} />
      <Text style={styles.emptyTitle}>Không tải được quả</Text>
      <Text style={styles.emptyBody}>{fruitsError}</Text>
      <TouchableOpacity style={styles.emptyAddBtn} onPress={() => fetchFruits(true)}>
        <Icon name="arrows-rotate" size={15} color={COLORS.white} />
        <Text style={styles.emptyAddBtnText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  ) : searchQuery.length > 0 || statusFilter !== 'all' ? (
    <View style={styles.noSearchResults}>
      <View style={styles.emptyIconWrap}>
        <Icon name="magnifying-glass" size={36} color={COLORS.accentLight} />
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
        <Icon name="arrows-rotate" size={15} color={COLORS.white} />
        <Text style={styles.emptyAddBtnText}>Xóa bộ lọc</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <StateView
      status="empty"
      title="Chưa có quả nào"
      message={tk('trace.tree.noFruitHint')}
      actionLabel={tk('trace.tree.addFirstFruit')}
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
        <>
          {/*
            Dòng thời gian thật của CÂY, đặt TRÊN danh sách quả. Hai thứ trả lời hai
            câu khác nhau: danh sách quả trả lời "cây này có mấy quả", dòng thời gian
            trả lời "cây này đã trải qua những gì" — và câu thứ hai mới là thứ người
            mua nhìn vào. Trước bản này app chưa gọi đường timeline lần nào
            (`grep '/timeline' src/` = 0) dù máy chủ có nó từ lâu.
            Hỏng dòng thời gian KHÔNG được làm hỏng tab: component tự nuốt lỗi và
            hiện một dòng giải thích, danh sách quả bên dưới vẫn nguyên.
          */}
          {!!tree?.id && <EntityTimeline entityType="tree" entityId={tree.id} limit={5} />}
          <View style={styles.historyHeader}>
            <Icon name="clock-rotate-left" size={16} color={COLORS.accent} />
            <Text style={styles.historyHeaderText}>QUẢ ĐÃ GHI NHẬN GẦN ĐÂY</Text>
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          {fruitsLoading ? (
            <ActivityIndicator size="large" color={COLORS.accent} />
          ) : (
            <Icon name="box-archive" size={36} color={COLORS.accentLight} />
          )}
          <Text style={styles.emptyTitle}>
            {tk(fruitsLoading ? 'trace.tree.loadingHistory' : 'trace.tree.noFruit')}
          </Text>
          {!fruitsLoading && (
            <Text style={styles.emptyBody}>
              {fruitsError ?? tk('trace.tree.noFruitHintTab')}
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const st = getStatus(item.status);
        const thumb = item.thumbnail_url ? `${ORILIFE_BASE}${item.thumbnail_url}` : null;
        return (
          <View style={styles.captureCard}>
            <RemoteImage
              uri={thumb}
              style={styles.captureThumb}
              containerStyle={styles.captureThumb}
              resizeMode="cover"
              placeholder={
                <View style={styles.captureIconWrap}>
                  <Icon name={st.icon} size={20} color={st.color} />
                </View>
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.captureDate} numberOfLines={1}>
                {item.name || tk('trace.tree.unnamed')}
              </Text>
              <Text style={styles.captureMeta}>
                {fmtDate(item.enrolled_at) || tk('trace.tree.noDate')} · {item.n_views} D
                {item.zone ? ` · ${ZONE_VI[item.zone]}` : ''}
              </Text>
            </View>
            <View style={[styles.fruitStatusChip, { backgroundColor: st.bg }]}>
              <Text style={[styles.fruitStatusText, { color: st.color }]}>{tk(st.labelKey)}</Text>
            </View>
          </View>
        );
      }}
    />
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={ORG_SURFACE.ground} />
      <GroundBackdrop variant="detail" />
      {Header}
      <SegmentedTabBar active={activeTab} onChange={setActiveTab} />

      <View style={styles.tabBody}>
        {activeTab === 'overview' && overviewBody}
        {activeTab === 'history' && historyBody}
        {activeTab === 'info' && <TreeMetadataTab tree={tree} />}
      </View>

      {/*
        Thanh dưới của tab Tổng quan.

        ⚠ Điều kiện dựng thanh này đổi: trước đây nó chỉ hiện khi cây ĐÃ CÓ QUẢ
        (`fruitItems.length > 0`), vì trong thanh chỉ có nút thu hoạch. Nay nút
        "Công khai & mã QR" cũng nằm đây, mà bật công khai KHÔNG đợi cây có quả —
        nó là mắt xích ĐẦU của chuỗi truy xuất, phải bấm được từ ngày trồng. Nên
        thanh hiện ở mọi cây; riêng nút thu hoạch vẫn giữ điều kiện cũ.
      */}
      {activeTab === 'overview' && (
        <View style={[styles.bottomBar, { paddingBottom: (Platform.OS === 'ios' ? 36 : 24) + insets.bottom }]}>
          {/* Nút PHỤ, đặt trên nút chính: viền chứ không đặc, để hai nút không
              tranh nhau làm nút chính của màn. */}
          <TouchableOpacity
            style={styles.publicBtn}
            onPress={() => setPublicOpen(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
          >
            <Icon name="qrcode" size={18} color={COLORS.accent} />
            <Text style={styles.publicBtnText}>Công khai</Text>
            <Icon name="chevron-right" size={15} color={COLORS.accent} />
          </TouchableOpacity>

          {fruitItems.length > 0 && (
            <TouchableOpacity
              style={styles.harvestBtn}
              onPress={() => (navigation as any).navigate('Activity', { tree, farm: currentFarm ?? undefined })}
              activeOpacity={0.88}
            >
              <View style={styles.btnShine} />
              <Icon name="basket-shopping" size={19} color={COLORS.white} />
              <Text style={styles.harvestBtnText}>Thu hoạch</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!tree?.id && (
        <TreePublicSheet
          visible={publicOpen}
          onClose={() => setPublicOpen(false)}
          treeId={tree.id}
        />
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
          {/* Ảnh phóng to: nếu để `<Image>` trần thì ảnh 404 cho ra MÀN ĐEN CÂM phủ
              90% màn hình, chỉ còn nút X — hình dạng "app treo" rõ nhất trong luồng. */}
          {zoomImage && (
            <RemoteImage
              uri={zoomImage}
              fallbackUri={localImages[treeImages.indexOf(zoomImage)]}
              retryKey={imgRetry}
              style={styles.zoomImage}
              resizeMode="contain"
              accessibilityLabel="Ảnh cây phóng to"
              placeholder={
                <View style={styles.zoomFallback}>
                  <Icon name="image" size={40} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.zoomFallbackText}>
                    {tk('trace.tree.photoOneFail')}
                  </Text>
                  <TouchableOpacity
                    style={styles.zoomRetryBtn}
                    onPress={() => setImgRetry(n => n + 1)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.zoomRetryText}>Thử lại</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
          <TouchableOpacity
            style={styles.zoomClose}
            onPress={() => setZoomImage(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="xmark" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Chọn vườn cho cây (`/api/tree/set_farm`). Có cả lối GỠ khỏi vườn vì máy
          chủ nhận `farm_id` rỗng có chủ đích — người dùng nhặt nhầm vườn phải có
          đường lùi, không thì cây kẹt trong vườn sai vĩnh viễn. */}
      <Modal
        visible={farmPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFarmPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !farmSaving && setFarmPickerOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cây này thuộc vườn nào?</Text>
            {farms.length === 0 && (
              <Text style={styles.farmPickEmpty}>
                Tài khoản này chưa có vườn nào. Tạo vườn trước rồi quay lại đây.
              </Text>
            )}
            <ScrollView style={{ maxHeight: 260 }}>
              {farms.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.modalOption, effectiveFarmId === f.id && styles.modalOptionSelected]}
                  disabled={farmSaving}
                  onPress={() => handlePickFarm(f.id)}
                >
                  <Text style={[styles.modalOptionText, effectiveFarmId === f.id && styles.modalOptionTextSelected]}>
                    {f.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {effectiveFarmId && (
              <TouchableOpacity
                style={styles.modalOption}
                disabled={farmSaving}
                onPress={() => handlePickFarm(null)}
              >
                <Text style={[styles.modalOptionText, styles.farmPickRemove]}>Gỡ khỏi vườn</Text>
              </TouchableOpacity>
            )}
            {farmSaving && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.accent} />}
          </View>
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
                {tk('trace.fruit.allStatus')}
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
                    {tk(status.labelKey)}
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
  root: { flex: 1, backgroundColor: ORG_SURFACE.ground },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ORG_SURFACE.ground,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
    ...ORG_ELEV.card,
  },
  headerEyebrow: {
    fontSize: 14, fontWeight: '600', color: ORG_TONE.primary, marginBottom: 1,
  },
  headerTitle: {
    fontSize: 26, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 11, fontWeight: '500', color: COLORS.textMuted,
    letterSpacing: 0.5, marginTop: 2,
  },
  headerActionBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: ORG_TONE.border,
  },

  tabBar: {
    flexGrow: 0,
    backgroundColor: ORG_SURFACE.ground,
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
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 20,
    borderWidth: 1, borderColor: ORG_TONE.border,
    marginBottom: 12,
    ...ORG_ELEV.card,
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
  heroFarmMissing: { color: ORG_TONE.sun, fontWeight: '600' },
  farmPickEmpty: { fontSize: 13, color: COLORS.textMuted, paddingVertical: 8 },
  farmPickRemove: { color: COLORS.error },

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
  featuresBox: {
    marginHorizontal: 18, marginBottom: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: ORG_TONE.primarySoft, ...ORGANIC_CARD, gap: 3,
  },
  featuresTitle: { fontSize: 15, fontWeight: '700', color: ORG_TONE.primaryDeep, marginBottom: 4 },
  featuresLine: { fontSize: 14.5, color: ORG_NATURE.bark, lineHeight: 22 },
  featuresPending: { fontSize: 14, color: ORG_NATURE.barkSoft, lineHeight: 21 },
  photoStripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  treeVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f5e9',
    borderWidth: 1, borderColor: '#1b5e20',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  treeVideoBtnText: { fontSize: 13, fontWeight: '700', color: '#1b5e20' },
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
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  photoDelBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: { width: '100%', height: '80%' },
  zoomFallback: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  zoomFallbackText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  zoomRetryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  zoomRetryText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  photoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fdf6e3',
  },
  photoNoteText: { flex: 1, color: '#6b5518', fontSize: 12, lineHeight: 17 },
  photoRetryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#8a6d1f',
  },
  photoRetryText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  photoEmptyText: {
    marginHorizontal: 14,
    marginTop: 8,
    color: '#7d8f85',
    fontSize: 12.5,
  },
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
    borderColor: ORG_TONE.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  meshChipEmoji: { fontSize: 16 },
  meshChipText: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
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
    borderWidth: 1, borderColor: ORG_TONE.border,
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
  sectionTitle: { ...ORG_TYPE.section },
  addFruitBtn: { borderRadius: 10, overflow: 'hidden' },
  addFruitBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: ORG_TONE.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  addFruitBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  fruitActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fruitVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f5e9',
    borderWidth: 1, borderColor: '#1b5e20',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    flex: 1, justifyContent: 'center',
  },
  fruitVideoBtnText: { fontSize: 13, fontWeight: '700', color: '#1b5e20' },

  fruitCard: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 16, borderWidth: 1, borderColor: ORG_TONE.border,
    flexDirection: 'row', alignItems: 'center',
    ...ORG_ELEV.card,
    overflow: 'hidden',
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
    ...ORG_ELEV.card,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: ORG_SURFACE.ground,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    flexDirection: "row", gap: 12
  },
  publicBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1.5, borderColor: COLORS.accent, flex: 1,
  },
  publicBtnText: { fontSize: 14.5, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.2 },
  harvestBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden', position: 'relative',
    ...ORG_ELEV.cardStrong,
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
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...ORG_ELEV.card,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 0 },
  clearSearchBtn: { padding: 4 },
  statusFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    ...ORG_ELEV.card,
  },
  statusFilterText: { fontSize: 14, color: COLORS.accent, fontWeight: '600', flex: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    ...ORG_ELEV.modal,
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
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
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
