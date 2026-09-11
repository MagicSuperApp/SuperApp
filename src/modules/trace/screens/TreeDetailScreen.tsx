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
  ActivityIndicator,
  Clipboard,
  Linking,
} from 'react-native';
// Icon: bo Font Awesome Solid tai qua Iconify (assets/icons -> icons.generated).
// Them icon moi: `node scripts/icons.js <ten-fa6-solid>`.
import Icon, { type IconName } from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import PaginationControls from '../components/PaginationControls';
import { RootState } from '../../../store';
import { COLORS } from '../../../constants';
// Nen huu co dung chung cua module (tong dat/la) - xem theme/depth.ts
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_TILE, ELEVATION as ORG_ELEV, TYPE as ORG_TYPE,
  GRADIENT as ORG_GRADIENT,
} from '../theme/depth';
import { GradientFill, GroundBackdrop } from '../components/layered/Organic';
import { BentoRow, BentoTile } from '../components/layered/Surface';
import RingProgress from '../components/layered/RingProgress';
import { treeFruitStats } from './treeFruitStats';
// Ô "3D" gắn CHÍNH bản dựng của màn đặt cây 3D — cùng model, cùng chấm quả, cùng
// bộ nhớ đệm. Xem khối chú thích ở chỗ dựng ô.
import TreeModelPreview from '../../../features/space3d/scene/TreeModelPreview';
import { type FruitDot } from '../../../features/space3d/scene/FruitDots';
import { coordFromServer } from '../../../features/space3d/treeFrame';
import { loadTreeModelId } from '../../../features/space3d/treeModelStore';
import { DEFAULT_TREE_MODEL_ID, type TreeModelId } from '../../../features/space3d/treeModels';
import GLErrorBoundary from '../../../components/GLErrorBoundary';
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
import { showError, showWarning } from '../../../utils/alert';
import { t } from '../../../i18n';

const { width } = Dimensions.get('window');
/**
 * 21, không phải 20 — CHIA HẾT cho số cột của lưới quả.
 *
 * 20 quả trên lưới ba cột cho ra sáu hàng đủ và một hàng lẻ hai quả, tức trang
 * nào cũng kết thúc bằng một hàng cụt. Đó không phải lỗi chức năng, nhưng nó là
 * thứ mắt bắt được ngay mà không gọi tên ra được.
 */
const ITEMS_PER_PAGE = 21;

/**
 * Màu phát sáng của ô KHÔNG GIAN — cùng giá trị với màn chi tiết vườn và với
 * `TreeShape`. Hai ô "3D" ở hai màn là một CẶP: cùng nền tối, cùng huy hiệu,
 * cùng sắc sáng. Lệch màu là lệch đúng chỗ người dùng nhận ra cặp.
 */
const SANG_KHONG_GIAN = '#7FE7C4';

/**
 * Nền của khung vẽ 3D — chặng TỐI của `GRADIENT.space`.
 *
 * `<Canvas>` tô nền đặc, nên ô 3D không thể để lộ chuyển sắc của ô Bento phía
 * sau. Lấy đúng một chặng của chính chuyển sắc đó thì mắt đọc ra MỘT khối tối,
 * không ra "một ô ảnh chưa tải xong nằm trong một cái thẻ".
 */
const NEN_KHONG_GIAN = ORG_GRADIENT.space.to;

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

// ── Nút quả ───────────────────────────────────────────────────────────────────
//
// Một quả = một nút TRÒN, ảnh quả làm nền, tên nằm DƯỚI nút.
//
// ── Thẻ cũ mang gì, và vì sao bỏ ─────────────────────────────────────────────
// Mỗi quả là một hàng ngang đầy: ảnh vuông · tên · chip trạng thái · số góc ảnh ·
// tầng · ngày ghi · mũi tên phải. Bảy thứ cho một quả, và một hàng ngang chỉ xếp
// được MỘT quả mỗi dòng — cây 60 quả thành 60 dòng phải cuộn.
//
// Lưới ba cột cho một màn chứa ~9 quả thay vì ~4, và bốn thứ vừa bỏ đi đều đọc
// được trong popup khi người ta thật sự cần tới chúng. Thứ KHÔNG bỏ được là ảnh:
// nhà vườn nhận ra quả của mình bằng mắt, không bằng cái tên máy sinh.
//
// ── Vì sao tên nằm DƯỚI nút, không nằm trong ─────────────────────────────────
// Nút cây bên màn vườn đặt tên vào GIỮA vòng tròn được, vì trong lòng nó trống.
// Trong lòng nút quả là một tấm ảnh, và chữ đè lên ảnh thì độ tương phản đổi
// theo từng tấm — chỗ tệ nhất quyết định chữ có đọc được hay không, mà ảnh quả
// sầu riêng thì chỗ nào cũng có thể là chỗ tệ nhất.
//
// ── Viền mang TRẠNG THÁI ─────────────────────────────────────────────────────
// Cùng vai với vòng tiến độ của nút cây: mép nút là chỗ nói trạng thái, lòng nút
// là chỗ nhận ra vật. Ba màu lấy thẳng từ `STATUS_MAP` nên chú giải và chấm
// không lệch nhau được.
const FruitChip = ({
  item,
  size,
  onPress,
}: {
  item: TreeLayoutFruit;
  size: number;
  onPress: () => void;
}) => {
  const tk = useTk();
  const st = getStatus(item.status);
  const thumb = item.thumbnail_url ? `${ORILIFE_BASE}${item.thumbnail_url}` : null;
  const ten = item.name || tk('trace.tree.unnamed');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{ width: size, alignItems: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={`${ten}, ${tk(st.labelKey)}`}
    >
      <View
        style={[
          styles.quaTron,
          { width: size, height: size, borderRadius: size / 2, borderColor: st.color },
        ]}
      >
        {/* Ảnh hỏng rơi về ĐÚNG ô biểu tượng vốn đã có cho trường hợp không ảnh —
            "có url mà tải hỏng" và "không có url" phải ra cùng một thứ, nếu không
            thì danh sách có những ô trống không giải thích được. */}
        <RemoteImage
          uri={thumb}
          style={styles.quaAnh}
          containerStyle={styles.quaAnh}
          resizeMode="cover"
          placeholder={
            <View style={[styles.quaTrong, { backgroundColor: st.bg }]}>
              <Icon name={st.icon as IconName} size={Math.round(size * 0.32)} color={st.color} />
            </View>
          }
        />
      </View>
      <Text style={styles.quaTen} numberOfLines={2}>{ten}</Text>
    </TouchableOpacity>
  );
};

// ── Vòng tiến độ thu hoạch ───────────────────────────────────────────────────
//
// `CircleProgress` cũ ở đây đã bị GỠ, không phải sửa. Hai lỗi, mỗi lỗi tự nó đủ:
//
// 1. `pct: number` — kiểu không cho phép diễn đạt "chưa biết", nên nơi gọi buộc
//    phải điền `0`, và `0%` đọc ra "đã đếm, chưa thu quả nào". Đó chính là lỗi
//    #314: lượt lấy số liệu hỏng mà màn hình trình một số đo.
// 2. Nó vẽ bằng mẹo xoay viền một `View` bo tròn — đúng ở đúng bốn mốc
//    (0·25·50·75%) và sai ở mọi giá trị giữa, vì viền chia theo BỐN CẠNH chứ
//    không theo góc quét. `RingProgress.tsx` đã ghi nguyên văn chỗ này trong
//    docblock của nó, kèm tên tệp này.
//
// `RingProgress` nhận `pct: number | null`, vẽ cung bằng `strokeDasharray` nên
// đúng ở mọi phần trăm, và vẽ vòng NÉT ĐỨT khi chưa có số. Màn danh sách cây
// (`FarmDetailScreen` ▸ `TreeChip`) đã dùng nó từ trước — nay hai màn cùng một
// cách nói, không còn hai bản vòng tròn song song.
const HarvestRing: React.FC<{ pct: number | null; size?: number }> = ({ pct, size = 64 }) => {
  const tk = useTk();
  const chuaBiet = pct === null;
  return (
    <RingProgress
      pct={pct}
      size={size}
      stroke={5}
      fill="transparent"
      style={undefined}
    >
      {chuaBiet ? (
        <Text
          style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '700', textAlign: 'center' }}
          numberOfLines={2}
        >
          {tk('trace.tree.noHarvestData')}
        </Text>
      ) : (
        <>
          <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 }}>
            {pct}%
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '600' }}>
            {tk('trace.tree.harvestedShort')}
          </Text>
        </>
      )}
    </RingProgress>
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
  // Tấm "Khác" — ba việc hiếm, mỗi việc một dòng CÓ TÊN ĐẦY ĐỦ.
  const [moreOpen, setMoreOpen] = useState(false);
  /**
   * Thông tin PHỤ của thẻ Tổng quan có đang mở không.
   *
   * Đóng sẵn. Vị trí GPS, giống, năm trồng, đặc điểm máy chủ tả, mã lưu trữ
   * video — năm thứ đó đều có người cần, nhưng không ai cần chúng MỖI LẦN mở
   * màn. Bày sẵn cả năm là đẩy danh sách quả — thứ người ta mở màn này để xem —
   * xuống dưới nếp gấp.
   */
  const [moRong, setMoRong] = useState(false);
  /** Quả đang mở popup. `null` = không mở. */
  const [quaDangXem, setQuaDangXem] = useState<TreeLayoutFruit | null>(null);

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
    showError('Chưa đổi được vườn',
      r.notOwner
        ? 'Cây này không thuộc tài khoản đang đăng nhập.'
        : r.farmNotFound
          ? 'Không mở được vườn vừa chọn. Nạp lại danh sách vườn rồi thử lại.'
          : r.error?.detail ?? 'Không gọi được máy chủ. Thử lại khi có mạng.');
  }, [tree?.id]);

  // Xoá một góc ảnh hỏng — `POST /api/remove_views`.
  //
  // Xoá TỪNG góc một rồi nạp lại, KHÔNG gom nhiều chỉ số vào một lần bấm: sau mỗi
  // lần xoá các vị trí phía sau dồn lên, nên chỉ số thứ hai trong cùng một mẻ đã
  // trỏ sang góc khác.
  const handleDeleteView = useCallback((idx: number) => {
    const id = tree?.id;
    if (!id) return;
    showWarning('Xoá góc ảnh này?', 'Cây sẽ còn ít góc nhận dạng hơn. Chỉ nên xoá ảnh chụp hỏng hoặc chụp nhầm cây.', {
        confirmText: 'Xoá',
        cancelText: 'Thôi',
        onConfirm: async () => {
            setDeletingIdx(idx);
            const r = await removeTreeViews(ORILIFE_BASE, id, [idx]);
            setDeletingIdx(null);
            if (!r.ok) {
              showError(
                t('Chưa xoá được'),
                r.notOwner
                  ? t('Cây này không thuộc tài khoản đang đăng nhập.')
                  : r.error?.detail ?? t('Không gọi được máy chủ. Thử lại khi có mạng.'),
              );
              return;
            }
            // Đọc `removed` của máy chủ. `ok:true` mà `removed:0` là ca THẬT (chỉ
            // số ngoài phạm vi) — im lặng ở đây thì người dùng thấy ảnh vẫn còn và
            // tưởng app đơ.
            if ((r.removed ?? 0) === 0) {
              showWarning(t('Máy chủ không xoá góc nào'), t('Danh sách ảnh vừa đổi. Nạp lại rồi chọn lại ảnh cần xoá.'));
            }
            await loadImages().catch(() => undefined);
          },
    });
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

  /**
   * ── BA HOOK DƯỚI ĐÂY PHẢI NẰM TRÊN `if (!tree) return` ─────────────────────
   *
   * ⛔ Đã đặt sai một lần, ngay ở lượt viết chúng: chúng nằm dưới câu `return`
   *    sớm ở ngay dưới. Lúc cây CHƯA về (đang hỏi máy chủ) React dựng màn với
   *    ít hook hơn; tới khi cây về thì số hook tăng lên, và React ném
   *    *"Rendered more hooks than during the previous render"* — tức màn trắng,
   *    ở đúng đường mà mọi người mở màn này từ `TreeManagement` đều đi qua.
   *
   *    `tsc` không thấy gì, `jest` không thấy gì. Thứ bắt được là
   *    `react-hooks/rules-of-hooks` của eslint. Nên đừng gỡ quy tắc đó, và đừng
   *    đẩy hook nào xuống dưới câu return kia.
   */

  /**
   * Model 3D mà NGƯỜI DÙNG đã chọn cho cây này ở màn đặt cây 3D.
   *
   * Đọc từ đúng kho mà màn đó ghi (`treeModelStore`, AsyncStorage). Không đọc
   * được thì rơi về `DEFAULT_TREE_MODEL_ID` — cùng mặc định với màn kia, nên hai
   * chỗ không bao giờ hiện hai cây khác nhau cho cùng một cây.
   */
  const [modelId, setModelId] = useState<TreeModelId>(DEFAULT_TREE_MODEL_ID);
  useEffect(() => {
    const id = tree?.id;
    if (!id) return;
    let alive = true;
    loadTreeModelId(id)
      .then(m => { if (alive) setModelId(m); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tree?.id]);

  /**
   * Chấm quả cho ô 3D — CHỈ quả còn trên cây.
   *
   * Quả đã hái / đã mất không còn trên tán; vẽ chúng ra là nói sai về cái cây
   * đang đứng ngoài vườn. Toạ độ đi qua `coordFromServer` — ĐÚNG hàm mà cảnh 3D
   * thật dùng, nên quả nằm ở cùng một chỗ trong ô xem trước và trong màn 3D.
   *
   * Đọc thẳng `layout` chứ không đọc `fruitItems`: biến kia là một biểu thức
   * `?? []` dựng mảng MỚI mỗi lượt vẽ, nên để nó làm phụ thuộc thì `useMemo`
   * không nhớ được gì.
   */
  const chamQua: FruitDot[] = useMemo(
    () => (layout?.fruits ?? [])
      .filter(f => f.status === 'on_tree')
      .map(f => ({
        fruitId: f.fruit_id,
        name: f.name ?? '',
        status: f.status,
        coord: coordFromServer(f),
      })),
    [layout],
  );

  /**
   * Ô 3D chỉ được gắn khi màn ĐANG có tiêu điểm.
   *
   * Mỗi `<Canvas>` là một ngữ cảnh GL riêng — chính `TreeModelPreview` ghi cảnh
   * báo đó ở đầu tệp của nó. Giữ một ngữ cảnh sống trong lúc người dùng đã đi
   * sang màn khác là tiền pin trả cho một thứ không ai nhìn.
   */
  const manDangMo = useIsFocused();

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
  //
  // ⛔ CHƯA BIẾT đi bằng `null`, KHÔNG đi bằng `0`.
  //
  //    Bản trước: `stats?.total ?? fruitItems.length`. Lượt gọi lấy quả hỏng thì
  //    `layout` là `null`, `fruitItems` là mảng rỗng, và mọi ô hiện `0` — trông
  //    y hệt một cây đã được đếm và đếm ra không quả nào. Người ghi chép ngoài
  //    vườn chép con số đó vào báo cáo, và tới lúc đối chiếu thì không còn cách
  //    nào phân biệt "cây chưa ra quả" với "app không lấy được số liệu".
  //
  //    `harvestPct` nặng hơn một bậc: `totalFruits > 0 ? … : 0` ĐẶT phần trăm
  //    bằng 0, tức khẳng định "đã thu 0%" cho một cây chưa ai đếm.
  //
  // Màn danh sách cây và màn chi tiết vườn đã vá đúng chỗ này từ trước
  // (`RingProgress` nhận `pct: number | null`, vẽ vòng nét đứt). Màn này nay theo.
  // Luật ở `treeFruitStats.ts` — tách khỏi màn để còn kiểm được ở đúng ca đã
  // hỏng (dựng lại màn này thì phải dựng cả maplibre/camera/GL).
  const fruitItems: TreeLayoutFruit[] = layout?.fruits ?? [];
  const { total: totalFruits, onTree: onTreeCount, harvested: harvestedCount, lost: lostCount, harvestPct } =
    treeFruitStats(layout);
  /** `null` = chưa ai ước tính. `0` sẽ là "ước tính được, và bằng không". */
  const estimatedFruits: number | null = tree?.estimatedFruits ?? null;

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

  /**
   * Đường kính một nút quả trong lưới BA cột.
   *
   * Suy từ bề ngang màn chứ không gõ số: lề danh sách 20 mỗi bên (`listContent`),
   * hai khe 12 giữa ba cột. Gõ một con số cố định thì máy hẹp bị tràn còn máy
   * rộng thừa chỗ — và cả hai đều không có gì đỏ.
   */
  const CO_QUA = Math.floor((width - 20 * 2 - 12 * 2) / 3);

  /** Ảnh bìa của cây — tấm đầu dải, dùng làm nền ô "Ảnh". */
  const anhBia = treeImages.length > 0 ? treeImages[0] : null;

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
      {/* ── Hai việc thường xuyên ra ngoài KÈM CHỮ, ba việc hiếm vào tấm ───
          Chỗ này từng là BỐN nút icon xám: `map-pin` (đặt vị trí 3D), `spray-can`
          (nhật ký thuốc), `chart-line` (biến thiên), `share-nodes` (chia sẻ dữ
          liệu). Cùng `size={20}`, cùng `COLORS.textSub`, không nút nào có chữ, và
          cả bốn nằm sát nút quay-lại ở vùng ngón cái hay quét trúng. Bốn việc có
          hệ quả hoàn toàn khác nhau — trong đó `share-nodes` là hành động RA
          NGOÀI duy nhất — trông giống hệt nhau.
          Nhà OriLife đo trên nhật ký máy chủ: `api/care` 0 dòng trong 14 ngày,
          tệp kho `care_events.json` còn 28 byte từ 06/06. Nhật ký thuốc chạy
          được; nó chỉ là cái bình xịt xám thứ hai từ trái. Nên nó là nút được
          đưa ra ngoài kèm chữ. */}
      <TouchableOpacity
        style={styles.headerCareBtn}
        onPress={() => tree && (navigation as any).navigate('CareScan', {
          targetType: 'tree', targetId: tree.id, treeName: (tree as any).name,
        })}
        accessibilityRole="button"
      >
        <Icon name="spray-can" size={16} color={ORG_TONE.primary} />
        <Text style={styles.headerCareTxt}>{tk('trace.tree.actCare')}</Text>
      </TouchableOpacity>
      {/*
        BA DẤU CHẤM DỌC, không chữ.

        ⛔ Biểu tượng cũ tên `ellipsis` KHÔNG CÓ trong bộ icon của kho
           (`icons.generated.ts` có `ellipsis-vertical`, không có `ellipsis`), nên
           nút này lâu nay vẽ ra một ô TRỐNG bên cạnh chữ "Việc khác". Không lệnh
           nào báo: `Icon` nuốt tên lạ chứ không ném.

        Bỏ chữ đi được vì ba chấm dọc là quy ước ai cũng đọc được, và vì cái chữ
        ấy đang phải co xuống cỡ 10 để lọt vào hàng — cỡ chữ đó thì nó không còn
        giúp ai đọc nữa, nó chỉ chiếm chỗ của nút "Ghi thuốc" bên cạnh.
      */}
      <TouchableOpacity
        style={styles.headerMoreBtn}
        onPress={() => setMoreOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tk('trace.tree.moreActions')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon name="ellipsis-vertical" size={18} color={ORG_NATURE.bark} />
      </TouchableOpacity>
    </Animated.View>
  );

  // ── Overview tab content ────────────────────────────────────────────────────
  //
  // BA MỤC, mỗi mục trả lời MỘT câu. Trước bản này tab Tổng quan là chín khối
  // xếp dọc không có mục nào: thẻ tên cây · lưới 2×2 con số · hộp đặc điểm ·
  // dải ảnh · hộp bằng chứng video · chip 🍈 kèm nút 3D · dòng dự kiến · tiêu đề
  // danh sách quả · ô tìm kiếm. Chín khối, mỗi khối một nền riêng, một viền
  // riêng — và người dùng phải cuộn qua sáu khối mới tới được danh sách quả,
  // tức thứ họ mở màn này để xem.
  //
  //   Tổng quan   "cây này đang thế nào" — MỘT thẻ, số chính ở ngoài, số phụ
  //               trong một ngăn mở ra khi cần.
  //   Cây này     "nó trông ra sao" — ô 3D và ô ảnh, hai thứ NHÌN chứ không đọc.
  //   Quả         "trên cây có gì" — lưới nút tròn, ảnh quả làm nền.
  //
  // Mỗi mục cao vừa một tầm mắt, nên cuộn một nhịp là sang mục sau. Đó là điều
  // kiện thay cho "bớt khối đi": khối không mất, chúng về đúng mục của mình.
  const overviewHeader = (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

      {/* ═══ MỤC 1 — TỔNG QUAN ═══════════════════════════════════════════ */}
      <View style={styles.sectionRow}>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Tổng quan</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <GradientFill name="tile" />

        <View style={styles.panelTop}>
          <HarvestRing pct={harvestPct} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.panelName} numberOfLines={2}>{treeDisplayName}</Text>
            {treeShortCode ? (
              <Text style={styles.panelCode} numberOfLines={1}>Mã {treeShortCode}</Text>
            ) : null}
            {/* Hàng vườn LUÔN hiện, kể cả khi cây chưa thuộc vườn nào. Bản cũ ẩn
                hàng này khi không có tên vườn — đúng ca cây mồ côi, tức là ca
                DUY NHẤT cần sửa lại bị giấu đi. Chạm để gán vườn. */}
            <TouchableOpacity
              style={styles.panelFarmRow}
              activeOpacity={0.7}
              onPress={() => setFarmPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={farmLabel ? `Vườn ${farmLabel}, chạm để đổi` : 'Cây chưa thuộc vườn nào, chạm để chọn vườn'}
            >
              <Icon name="tree" size={12} color={farmLabel ? ORG_NATURE.barkSoft : ORG_TONE.sun} />
              <Text style={[styles.panelFarmTxt, !farmLabel && styles.panelFarmMissing]} numberOfLines={1}>
                {farmLabel ?? 'Chưa thuộc vườn nào — chạm để chọn'}
              </Text>
              <Icon name="chevron-right" size={11} color={ORG_NATURE.barkSoft} />
            </TouchableOpacity>
          </View>
        </View>

        {/*
          BỐN CON SỐ, MỘT HÀNG, trong CHÍNH thẻ này.

          Trước bản này chúng là bốn ô Bento rời nằm ngoài thẻ — bốn nền, bốn
          viền, hai hàng chiều cao. Nhưng chúng không phải bốn việc: chúng là bốn
          mặt của MỘT câu ("cây này đang thế nào"), tức đúng nội dung của thẻ
          Tổng quan. Vào trong thẻ thì chúng nói cùng một câu với cái tên và vòng
          tiến độ ngay trên, và tiết kiệm được một tầm mắt.
        */}
        <View style={styles.panelSo}>
          {[
            { n: totalFruits, nhan: tk('trace.tree.statRecorded'), mau: ORG_NATURE.bark },
            { n: onTreeCount, nhan: tk('trace.tree.statOnTree'), mau: ORG_TONE.primary },
            { n: harvestedCount, nhan: tk('trace.tree.statPicked'), mau: ORG_TONE.sun },
            { n: lostCount, nhan: tk('trace.tree.statLost'), mau: ORG_NATURE.barkSoft },
          ].map((o, idx) => (
            <React.Fragment key={o.nhan}>
              {idx > 0 ? <View style={styles.panelVach} /> : null}
              <View style={styles.panelO}>
                {/*
                  Chưa biết thì hiện dấu gạch, và hiện nó bằng màu CHỮ MỜ chứ
                  không bằng màu của ô. Một dấu gạch tô cùng màu với con số vẫn
                  đọc ra "một giá trị"; tô mờ thì nó đọc ra chỗ trống — đúng cái
                  nó là.
                */}
                <Text
                  style={[styles.panelOSo, { color: o.n === null ? COLORS.textMuted : o.mau }]}
                >
                  {o.n === null ? tk('trace.value.unknown') : o.n}
                </Text>
                <Text style={styles.panelONhan} numberOfLines={1}>{o.nhan}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ── Ngăn thông tin PHỤ ──────────────────────────────────────────── */}
        {moRong ? (
          <View style={styles.panelPhu}>
            {[
              { nhan: 'Vị trí', gt: gpsText },
              { nhan: 'Giống', gt: (tree?.species as string) || 'chưa ghi' },
              { nhan: 'Năm trồng', gt: tree?.plantedYear ? String(tree.plantedYear) : 'chưa ghi' },
              {
                nhan: 'Dự kiến cả mùa',
                // `null` = chưa ai ước tính. Bản cũ dùng `estimatedFruits > 0`,
                // nên một ước tính THẬT bằng 0 cũng bị đọc thành "chưa ước tính".
                gt:
                  estimatedFruits === null
                    ? tk('trace.tree.notEstimated')
                    : `${estimatedFruits} ${tk('trace.tree.fruitCountUnit')}`,
                uoc: estimatedFruits !== null,
              },
            ].map((d) => (
              <View key={d.nhan} style={styles.panelPhuHang}>
                <Text style={styles.panelPhuNhan}>{d.nhan}</Text>
                <Text style={styles.panelPhuGt} numberOfLines={1}>
                  {d.gt}
                  {d.uoc ? <Text style={styles.panelPhuUoc}>{tk('trace.tree.estimatedSuffix')}</Text> : null}
                </Text>
              </View>
            ))}

            {/* Máy chủ mô tả cây này bằng lời (`/api/tree_views?describe=1` →
                features_vi): cành chính hướng nào, quả nằm tầng nào…

                Khi cây ĐÃ có ảnh mà máy chủ vẫn chưa trả mô tả (bản máy chủ cũ
                bỏ qua tham số `describe`), nói thẳng ra một câu. Im lặng ở đây
                đọc đúng như "tính năng bị gỡ mất". */}
            {treeFeatures.length > 0 ? (
              <View style={styles.panelKhoi}>
                <Text style={styles.panelKhoiTitle}>{tk('trace.tree.featuresTitle')}</Text>
                {treeFeatures.map((f, k) => (
                  <Text key={`f${k}`} style={styles.featuresLine}>• {f}</Text>
                ))}
              </View>
            ) : treeImages.length > 0 ? (
              <View style={styles.panelKhoi}>
                <Text style={styles.panelKhoiTitle}>{tk('trace.tree.featuresTitle')}</Text>
                <Text style={styles.featuresPending}>{tk('trace.tree.featuresPending')}</Text>
              </View>
            ) : null}

            {/* Bằng chứng video trên LampNet. Hiện mã lưu trữ vì OriLife KHÔNG có
                route tra ngược — đây là chỗ duy nhất đội thực địa đối chiếu được
                sau buổi. Chạm để mở, biểu tượng chép để sao mã. */}
            {videoProofs.length > 0 ? (
              <View style={styles.panelKhoi}>
                <Text style={styles.panelKhoiTitle}>
                  {tk('trace.tree.videos', { n: videoProofs.length })}
                </Text>
                {videoProofs.map(pr => (
                  <TouchableOpacity
                    key={pr.videoCid}
                    style={styles.proofRow}
                    activeOpacity={0.7}
                    onPress={() => { Linking.openURL(`https://lampnet.cloud/${pr.videoCid}`); }}
                  >
                    <Icon
                      name={pr.stored === false ? 'triangle-exclamation' : 'shield-halved'}
                      size={15}
                      color={pr.stored === false ? ORG_TONE.sun : ORG_TONE.primary}
                    />
                    <View style={styles.proofBody}>
                      <Text style={styles.proofCid} numberOfLines={1}>{pr.videoCid}</Text>
                      <Text style={styles.proofMeta}>
                        {pr.stored === false ? tk('trace.tree.notUploaded') : ''}
                        {pr.at ? new Date(pr.at).toLocaleString('vi-VN') : ''}
                        {/* Cùng con số, cùng người đọc, nên phải cùng một lời rào với
                            màn kết quả quay quả: đây là số quả nhiều nhất trong MỘT
                            khung do bộ dò màu ước lượng, không phải số quả của cả cây.
                            Một màn có rào một màn không thì người ghi chép sẽ chép con
                            số ở màn không có rào. */}
                        {pr.nFruitsMax ? ` · ước lượng ${pr.nFruitsMax} quả trong 1 khung` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { Clipboard.setString(pr.videoCid); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Sao chép mã lưu trữ"
                    >
                      <Icon name="copy" size={14} color={ORG_NATURE.barkSoft} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.panelMoRong}
          onPress={() => setMoRong(v => !v)}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Text style={styles.panelMoRongTxt}>{moRong ? 'Thu gọn' : 'Xem thêm'}</Text>
          <Icon name={moRong ? 'chevron-up' : 'chevron-down'} size={13} color={ORG_TONE.primary} />
        </TouchableOpacity>
      </View>

      {/* ═══ MỤC 2 — CÂY NÀY ═════════════════════════════════════════════
          Hai ô NHÌN, không phải hai ô đọc. Cùng khuôn với hàng "xem trước" ở màn
          chi tiết vườn, và cố ý giống: ô tối bên trái mở không gian 3D, ô sáng
          bên phải là chính cái cây qua ống kính. Học một lần, dùng ở hai màn. */}
      <View style={styles.sectionRow}>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Cây này</Text>
        </View>
        {/* Bổ-sung góc nhìn cho cây bằng video → /api/tree/{id}/video (server
            chắt khung). Đây là lối DUY NHẤT để cây có thêm ảnh, nên nó phải ở
            ngay cạnh tiêu đề mục, không nằm lẫn trong dải. */}
        <TouchableOpacity style={styles.treeVideoBtn} onPress={handleTreeVideo} activeOpacity={0.85}>
          <Icon name="video" size={14} color={ORG_TONE.primary} />
          <Text style={styles.treeVideoBtnText}>Video cây</Text>
        </TouchableOpacity>
      </View>

      <BentoRow style={styles.bentoPreviews}>
        {/*
          Ô KHÔNG GIAN — ô tối duy nhất của màn.

          Nền tối không phải để cho khác lạ: một khối phát sáng chỉ đọc ra "không
          gian" khi quanh nó tối. Cùng hình ấy trên nền trắng thì vầng sáng biến
          mất và nó tụt về một hình vẽ phẳng.

          Hình bên trong là BẢN DỰNG THẬT của chính cây này — không phải một hình
          minh hoạ vẽ lại.

          ⛔ Bản trước ô này vẽ một khung tán bằng SVG: mấy vòng elip co giãn theo
             góc quay, trông như một khối cầu đang quay. Nó đẹp và nó RẺ, nhưng nó
             là một cái cây TỰ NGHĨ RA — mọi cây trong vườn cho ra cùng một hình,
             và hình đó không liên quan gì tới đám mây điểm mà chủ vườn đã chụp.
             Yêu cầu nói thẳng: *"sử dụng 3D từ 3D place luôn, không tạo thêm 1
             model giả"*.

          Nay ô gắn `TreeModelPreview` — CHÍNH component mà màn đặt cây 3D dùng —
          với CHÍNH `modelId` người dùng đã chọn cho cây này, và `FruitDots` là
          CHÍNH lớp chấm quả của cảnh 3D thật. Ba thứ đi cùng nhau nên ô xem
          trước và màn 3D không thể nói hai chuyện khác nhau về một cây.

          `treePoints` giữ bộ nhớ đệm ở tầng module, nên cây đã xem ở đây thì mở
          màn 3D không tải lại, và ngược lại.

          Cây chưa dựng 3D vẫn ra cây tự tạo — nhưng đó KHÔNG phải một model giả
          thêm vào: nó đúng là thứ màn 3D hiện cho cây chưa có đám mây điểm, tức
          ô đang nói thật về cái sẽ mở ra.
        */}
        <BentoTile
          flex={1}
          tone="space"
          onPress={handleView3D}
          padded={false}
          style={styles.bentoPreview}
        >
          {/* Lỗi trong cây con 3D KHÔNG được kéo sập cả màn chi tiết cây: người
              dùng vào đây để xem quả, không phải để xem 3D. */}
          <GLErrorBoundary tag="tree_detail_preview">
            {manDangMo && tree?.id ? (
              <TreeModelPreview
                modelId={modelId}
                treeId={tree.id}
                fruits={chamQua}
                fill
                /* `<Canvas>` tô nền ĐẶC. Truyền đúng chặng tối của ô không gian
                   vào đây, nếu không sẽ thấy một ô gần-đen nằm trong một khối
                   xanh đậm — hai màu tối khác nhau đọc ra "ảnh chưa tải xong". */
                background={NEN_KHONG_GIAN}
              />
            ) : null}
          </GLErrorBoundary>
          <View style={styles.badge3D}>
            <Icon name="cube" size={13} color={SANG_KHONG_GIAN} />
            <Text style={styles.badge3DTxt}>3D</Text>
          </View>
        </BentoTile>

        {/* Ô ẢNH — ảnh bìa làm nền, số ảnh làm nhãn. Chưa có ảnh thì ô tự đổi
            thành một lời mời CÓ VIỆC LÀM (quay video), chứ không phải một ô
            trống báo thiếu. */}
        <BentoTile
          flex={1}
          onPress={() => (anhBia ? setZoomImage(anhBia) : handleTreeVideo())}
          padded={false}
          style={styles.bentoPreview}
        >
          {anhBia ? (
            <>
              <RemoteImage
                uri={anhBia}
                fallbackUri={localImages[0]}
                retryKey={imgRetry}
                style={StyleSheet.absoluteFill}
                containerStyle={StyleSheet.absoluteFill}
                resizeMode="cover"
                placeholder={<View style={styles.anhTrong}><Icon name="image" size={24} color={ORG_NATURE.barkSoft} /></View>}
                accessibilityLabel="Ảnh bìa của cây"
              />
              <View style={styles.anhChip}>
                <Icon name="images" size={12} color={ORG_NATURE.bark} />
                <Text style={styles.anhChipTxt}>
                  {tk('trace.tree.photos', { n: treeImages.length })}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.anhMoi}>
              <Icon name="camera" size={22} color={ORG_TONE.primary} />
              <Text style={styles.anhMoiTxt}>Chưa có ảnh — quay video để thêm</Text>
            </View>
          )}
        </BentoTile>
      </BentoRow>

      {/* Dải ảnh ngang — MỘT hàng, cuộn ngang, không cao thêm theo số ảnh. Chỉ
          dựng khi CÓ ảnh: lúc chưa có, ô "Ảnh" ở trên đã nói điều đó và đã có
          việc để làm tiếp, nên một dải rỗng ở đây là lời thứ hai cho cùng tin. */}
      {treeImages.length > 0 ? (
        <View style={styles.daiAnh}>
          {/* Ảnh 404 KHÔNG có nghĩa là ảnh mất: `/gimg` xét quyền lúc gọi và trả
              404 giả-không-tồn-tại khi từ chối. Chữ phải nói đúng điều đó —
              tuyệt đối không viết "ảnh đã mất/đã xoá" và không tô đỏ như lỗi của
              app. */}
          {(brokenImages > 0 || imagesError) ? (
            <View style={styles.photoNote}>
              <Icon name="circle-info" size={13} color="#8a6d1f" />
              <Text style={styles.photoNoteText}>
                {imagesError ? tk('trace.tree.photoNetFail') : tk('trace.tree.photoServerFail')}
              </Text>
              <TouchableOpacity
                onPress={() => { setImgRetry(n => n + 1); loadImages().catch(() => undefined); }}
                style={styles.photoRetryBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.photoRetryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {treeImages.map((uri, k) => (
              <View key={`${uri}-${k}`}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setZoomImage(uri)}>
                  <RemoteImage
                    uri={uri}
                    fallbackUri={localImages[k]}
                    retryKey={imgRetry}
                    style={styles.photoThumb}
                    resizeMode="cover"
                    onFinalError={() => setBrokenImages(n => n + 1)}
                    placeholder={<Icon name="image" size={22} color="#9bb0a4" />}
                    accessibilityLabel={`Ảnh cây ${k + 1}`}
                  />
                </TouchableOpacity>
                {/* Chỉ ảnh nào ĐANG là ảnh máy chủ mới xoá được: `remove_views`
                    nhận vị trí trong `/api/tree_views`. Dải đang chạy bản lùi
                    local thì vị trí không khớp nữa ⇒ không hiện nút, thà thiếu
                    nút còn hơn xoá nhầm góc mà không ai thấy. */}
                {k < serverImgCount ? (
                  <TouchableOpacity
                    style={styles.photoDelBtn}
                    activeOpacity={0.8}
                    disabled={deletingIdx !== null}
                    onPress={() => handleDeleteView(k)}
                    accessibilityLabel={`Xoá ảnh cây ${k + 1}`}
                  >
                    {deletingIdx === k
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Icon name="trash" size={11} color="#fff" />}
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Danh sách bằng chứng video KHÔNG còn đứng ở đây. Nó đã về ngăn "Xem
          thêm" của thẻ Tổng quan — cùng chỗ với vị trí, giống, năm trồng: những
          thứ có người cần nhưng không ai cần MỖI LẦN mở màn.

          Bản ở đây là bản cũ còn sót sau cú dời, và nó sống lại vì một lần vá cú
          pháp: cú dời để lại khối JSX chưa đóng nên tệp không biên dịch được, và
          cách đóng nhanh nhất lại là dựng lại nguyên khối tại chỗ cũ. Hệ quả
          không kêu: màn hiện danh sách video HAI LẦN, và bản dưới đây là bản duy
          nhất còn giữ lời rào "trong 1 khung" — nên xoá nó mà không mang lời rào
          sang trước thì đúng cái mà chính lời rào ấy cảnh báo sẽ xảy ra. */}

      {/* ═══ MỤC 3 — QUẢ ═════════════════════════════════════════════════ */}
      <View style={[styles.sectionRow, styles.sectionQua]}>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Quả</Text>
          {/* `null` (chưa biết) KHÔNG hiện số — nhưng cũng không hiện `0`.
              Chỗ trống ở đây là đúng: nhánh lỗi của danh sách quả ngay bên dưới
              mới là chỗ nói vì sao. */}
          {totalFruits !== null && totalFruits > 0
            ? <Text style={styles.sectionCount}>{totalFruits}</Text>
            : null}
          {fruitsLoading ? <ActivityIndicator size="small" color={ORG_TONE.primary} /> : null}
        </View>
        {/*
          NÚT ĐẶC, chữ trắng. Trước bản này nó là nút viền nhạt trông y hệt ô tìm
          kiếm và ô lọc ngay dưới — ba khối cùng sắc, cùng độ dày viền, mà chỉ
          MỘT trong ba là việc thật sự tạo ra dữ liệu mới.

          MỘT cửa thêm quả. Bản cũ có thêm nút "Video quả" ngay cạnh, cũng nói là
          thêm quả nhưng chạy đường khác hẳn: `fruit_video` chỉ ĐẾM quả trên
          khung hình, KHÔNG enroll — nên quay xong danh sách vẫn rỗng.
        */}
        <TouchableOpacity
          style={styles.addFruitBtn}
          onPress={handleAddFruit}
          onPressIn={() => Animated.spring(btnScale, { toValue: 0.94, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
          activeOpacity={1}
          accessibilityRole="button"
        >
          <Animated.View style={[styles.addFruitBtnInner, { transform: [{ scale: btnScale }] }]}>
            <GradientFill name="action" />
            <Icon name="plus" size={15} color={COLORS.white} />
            <Text style={styles.addFruitBtnText}>{tk('trace.tree.addFruit')}</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Icon name="magnifying-glass" size={17} color={ORG_NATURE.barkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm quả theo tên…"
            placeholderTextColor={ORG_NATURE.barkSoft}
            value={searchQuery}
            onChangeText={(text) => { setSearchQuery(text); setCurrentPage(1); }}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); setCurrentPage(1); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="circle-xmark" size={16} color={ORG_NATURE.barkSoft} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.statusFilterBtn, statusFilter !== 'all' && styles.statusFilterBtnBat]}
          onPress={() => setStatusDropdownVisible(true)}
          accessibilityRole="button"
        >
          <Icon name="filter" size={16} color={statusFilter === 'all' ? ORG_NATURE.barkSoft : ORG_TONE.primary} />
          <Text
            style={[styles.statusFilterText, statusFilter !== 'all' && styles.statusFilterTextBat]}
            numberOfLines={1}
          >
            {statusFilter === 'all' ? tk('trace.fruit.allStatus') : tk(getStatus(statusFilter).labelKey)}
          </Text>
        </TouchableOpacity>
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
      ListHeaderComponent={overviewHeader}
      ListEmptyComponent={overviewEmpty}
      /*
        LƯỚI BA CỘT. `numColumns` là thuộc tính TĨNH của `FlatList` — đổi nó lúc
        chạy làm danh sách ném. Ở đây nó là hằng nên không sao; nếu ngày nào cần
        đổi theo bề ngang màn thì phải đổi cả `key` của danh sách.

        Ba chứ không bốn như lưới cây bên màn vườn: nút quả mang ẢNH, và ảnh
        đường kính 75 thì không còn nhận ra quả nào với quả nào — mà nhận ra quả
        bằng mắt chính là lý do nút này có ảnh.
      */
      numColumns={3}
      columnWrapperStyle={styles.quaHang}
      renderItem={({ item }) => (
        /* Chạm KHÔNG mở thẳng màn quả nữa — nó mở popup. Cùng nhịp làm việc với
           lưới cây bên màn vườn: người ta quét mắt qua lưới, chạm một quả để xem
           nhanh nó có gì, rồi chạm quả kế. Mở một màn cho mỗi lượt xem nhanh là
           bắt họ đi và quay lại — mất chỗ đang đứng trong lưới, mất cả trang. */
        <FruitChip item={item} size={CO_QUA} onPress={() => setQuaDangXem(item)} />
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

      {/*
        POPUP CHI TIẾT QUẢ.

        Chạm một nút quả mở cái này, KHÔNG mở thẳng màn quả. Cùng khuôn và cùng
        lý do với popup cây ở màn chi tiết vườn — hai màn phải cho ra cùng một
        thứ khi người dùng làm cùng một cử chỉ, nếu không thì họ phải học hai lần.

        Bốn dòng trong bảng chính là bốn thứ vừa bị bỏ khỏi thẻ quả cũ. Chúng
        không mất; chúng chỉ thôi chiếm chỗ ở mức danh sách, nơi không ai đọc.
      */}
      <Modal
        visible={quaDangXem != null}
        transparent
        animationType="fade"
        onRequestClose={() => setQuaDangXem(null)}
      >
        {/* Chạm ra ngoài là đóng — cách thoát mà ai cũng thử trước tiên. */}
        <TouchableOpacity
          style={styles.quaPopupNen}
          activeOpacity={1}
          onPress={() => setQuaDangXem(null)}
        />
        <View style={styles.quaPopupBoc} pointerEvents="box-none">
          <View style={styles.quaPopup}>
            <GradientFill name="tile" />

            <View style={styles.quaPopupDau}>
              <View
                style={[
                  styles.quaTron,
                  { width: 68, height: 68, borderRadius: 34, borderColor: getStatus(quaDangXem?.status).color },
                ]}
              >
                <RemoteImage
                  uri={quaDangXem?.thumbnail_url ? `${ORILIFE_BASE}${quaDangXem.thumbnail_url}` : null}
                  style={styles.quaAnh}
                  containerStyle={styles.quaAnh}
                  resizeMode="cover"
                  placeholder={
                    <View style={[styles.quaTrong, { backgroundColor: getStatus(quaDangXem?.status).bg }]}>
                      <Icon
                        name={getStatus(quaDangXem?.status).icon as IconName}
                        size={24}
                        color={getStatus(quaDangXem?.status).color}
                      />
                    </View>
                  }
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.quaPopupTen} numberOfLines={2}>
                  {quaDangXem?.name || tk('trace.tree.unnamed')}
                </Text>
                <View
                  style={[styles.fruitStatusChip, { backgroundColor: getStatus(quaDangXem?.status).bg, alignSelf: 'flex-start', marginTop: 5 }]}
                >
                  <View style={[styles.fruitStatusDot, { backgroundColor: getStatus(quaDangXem?.status).color }]} />
                  <Text style={[styles.fruitStatusText, { color: getStatus(quaDangXem?.status).color }]}>
                    {tk(getStatus(quaDangXem?.status).labelKey)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setQuaDangXem(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Đóng"
              >
                <Icon name="xmark" size={18} color={ORG_NATURE.barkSoft} />
              </TouchableOpacity>
            </View>

            <View style={styles.quaPopupBang}>
              {[
                // `?? 0` ở đây in ra "Số góc ảnh: 0" cho một quả mà máy chủ
                // KHÔNG trả trường `n_views` — tức khẳng định "chưa chụp góc
                // nào" thay cho "không biết". Ba hàng còn lại trong chính bảng
                // này đã nói chỗ trống bằng chữ; hàng này nay theo.
                { nhan: 'Số góc ảnh', gt: quaDangXem?.n_views == null ? tk('trace.value.unknown') : String(quaDangXem.n_views) },
                { nhan: 'Tầng trên cây', gt: quaDangXem?.zone ? ZONE_VI[quaDangXem.zone] : 'chưa đặt' },
                { nhan: 'Ngày ghi nhận', gt: fmtDate(quaDangXem?.enrolled_at) || tk('trace.tree.noDate') },
                { nhan: 'Mã quả', gt: (quaDangXem?.fruit_id ?? '').slice(-8).toUpperCase() || '—' },
              ].map((d) => (
                <View key={d.nhan} style={styles.quaPopupHang}>
                  <Text style={styles.quaPopupNhan}>{d.nhan}</Text>
                  <Text style={styles.quaPopupGt} numberOfLines={1}>{d.gt}</Text>
                </View>
              ))}
            </View>

            {/* Máy chủ chưa mở cửa cho MỘT quả (`fruitReIDService` không có route
                lấy một quả), nên "xem chi tiết" dẫn tới màn quả CỦA CÂY — đúng
                nơi xem được từng góc ảnh và thêm góc mới. Đó cũng là đích mà thẻ
                quả cũ vẫn dẫn tới, nên không mất đường nào. */}
            <TouchableOpacity
              style={styles.quaPopupNut}
              activeOpacity={0.88}
              onPress={() => { setQuaDangXem(null); handleAddFruit(); }}
              accessibilityRole="button"
            >
              <GradientFill name="action" />
              <Text style={styles.quaPopupNutTxt}>Xem chi tiết</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {/* Ba việc hiếm, gọi đúng tên. Riêng "chia sẻ dữ liệu" phải đọc được hết
          câu trước khi chạm — nó là việc đưa dữ liệu cho NGƯỜI KHÁC, không cùng
          hạng với hai việc còn lại. */}
      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        {/* Nền là một lớp RIÊNG, không phải cái bọc của tấm.

            Bản trước tấm nằm TRONG một `TouchableOpacity` phủ kín màn, nên chạm
            vào chính tấm — kể cả khoảng đệm giữa hai hàng — cũng đóng tấm. Chạm
            hụt một hàng là mất luôn tấm, và người dùng phải mở lại từ đầu. */}
        <TouchableOpacity
          style={styles.khacNen}
          activeOpacity={1}
          onPress={() => setMoreOpen(false)}
          accessibilityLabel="Đóng"
        />
        <View style={styles.khacBoc} pointerEvents="box-none">
          <View style={styles.khacTam}>
            <GradientFill name="tile" />
            <Text style={styles.khacTieuDe}>{tk('trace.tree.moreActions')}</Text>

            {/*
              BA HÀNG, mỗi hàng là một NÚT nhìn ra nút.

              ⛔ Bản trước ba hàng này dùng chung `styles.modalOption` với hai tấm
                 kia, mà style đó có `justifyContent: 'space-between'` — đúng cho
                 tấm lọc trạng thái, vì ở đó icon và chữ được bọc chung trong
                 `modalOptionLeft` còn vế phải là dấu tích. Ở đây KHÔNG có vế
                 phải và KHÔNG có bọc, nên `space-between` đẩy biểu tượng dính
                 mép trái và cả câu chữ dính mép phải, chừa một khoảng trống to
                 tướng ở giữa. Cộng thêm: không nền, không viền, ba biểu tượng
                 cùng một màu xám — ba việc khác hẳn nhau trông y hệt nhau, và
                 không hàng nào trông như bấm được.

              Nay mỗi hàng có mặt riêng, biểu tượng nằm trong một ô màu, và có
              mũi tên ở cuối vì cả ba đều ĐI SANG MÀN KHÁC.

              MÀU NÓI NGHĨA, không phải để cho vui:
                · xanh lá — đặt cây vào sơ đồ: việc trong không gian của mình;
                · xanh nước — biến thiên: thứ để ĐỌC, không tạo ra gì;
                · nắng — chia sẻ: việc DUY NHẤT đưa dữ liệu RA NGOÀI, nên nó phải
                  khác hạng với hai việc trên, không chỉ khác tên.
            */}
            {([
              {
                icon: 'map-pin',
                mau: ORG_TONE.primary,
                nen: ORG_TONE.primarySoft,
                nhan: tk('trace.tree.actPlace'),
                lam: () => handlePlaceInFarm(),
              },
              {
                icon: 'chart-line',
                mau: ORG_TONE.rain,
                nen: ORG_TONE.rainSoft,
                nhan: tk('trace.tree.actDrift'),
                lam: () => {
                  if (!tree) return;
                  (navigation as any).navigate('TreeDrift', {
                    treeId: tree.id, treeName: (tree as any).name,
                  });
                },
              },
              {
                icon: 'share-nodes',
                mau: ORG_TONE.sun,
                nen: ORG_TONE.sunSoft,
                nhan: tk('trace.tree.actShare'),
                lam: () => {
                  if (!tree) return;
                  (navigation as any).navigate('TreeShare', {
                    scopeType: 'tree', scopeId: tree.id, scopeName: (tree as any).name,
                  });
                },
              },
            ] as { icon: IconName; mau: string; nen: string; nhan: string; lam: () => void }[]).map(v => (
              <TouchableOpacity
                key={v.nhan}
                style={styles.khacHang}
                activeOpacity={0.75}
                onPress={() => { setMoreOpen(false); v.lam(); }}
                accessibilityRole="button"
                accessibilityLabel={v.nhan}
              >
                <View style={[styles.khacIcon, { backgroundColor: v.nen }]}>
                  <Icon name={v.icon} size={17} color={v.mau} />
                </View>
                <Text style={styles.khacNhan} numberOfLines={2}>{v.nhan}</Text>
                <Icon name="chevron-right" size={15} color={ORG_NATURE.barkSoft} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
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

  // ── Nút ba chấm ở đầu màn ──────────────────────────────────────────────────
  // Vuông 40, không chữ. Cạnh tối thiểu chỗ bấm của bộ token là 56, nhưng ở đây
  // `hitSlop` 10 mỗi phía cộng vào cho đủ 60 — vùng CHẠM đủ rộng mà vùng VẼ vẫn
  // nhỏ, nên nút không tranh chỗ với "Ghi thuốc" ngay cạnh.
  headerMoreBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },

  // ── MỤC 1 — thẻ Tổng quan ──────────────────────────────────────────────────
  panel: {
    borderRadius: 20,
    borderWidth: 1, borderColor: ORG_TONE.border,
    overflow: 'hidden',
    padding: 14,
    marginBottom: 18,
    ...ORG_ELEV.card,
  },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  panelName: { fontSize: 19, fontWeight: '800', color: ORG_NATURE.bark, letterSpacing: -0.3 },
  panelCode: { fontSize: 11.5, fontWeight: '600', color: ORG_NATURE.barkSoft, marginTop: 2 },
  panelFarmRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  panelFarmTxt: { flex: 1, fontSize: 12.5, color: ORG_NATURE.barkSoft },
  /** Cây mồ côi — sắc NẮNG, vì đây là chỗ có việc phải làm, không phải chỗ báo lỗi. */
  panelFarmMissing: { color: ORG_TONE.sun, fontWeight: '700' },

  panelSo: {
    flexDirection: 'row', alignItems: 'stretch',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: ORG_TONE.border,
  },
  panelVach: { width: 1, backgroundColor: ORG_TONE.border, marginVertical: 2 },
  panelO: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  panelOSo: { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  panelONhan: { fontSize: 10, color: ORG_NATURE.barkSoft },

  panelPhu: {
    marginTop: 12, paddingTop: 12, gap: 7,
    borderTopWidth: 1, borderTopColor: ORG_TONE.border,
  },
  panelPhuHang: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  panelPhuNhan: { fontSize: 12.5, color: ORG_NATURE.barkSoft },
  panelPhuGt: { fontSize: 13, fontWeight: '600', color: ORG_NATURE.bark, flexShrink: 1, textAlign: 'right' },
  panelPhuUoc: { fontSize: 11, fontWeight: '400', color: ORG_NATURE.barkSoft },
  panelKhoi: { marginTop: 4, gap: 4 },
  panelKhoiTitle: { fontSize: 11.5, fontWeight: '800', color: ORG_NATURE.bark, letterSpacing: 0.2 },

  /** Cả một hàng bấm được, không phải một chữ nhỏ bấm được. */
  panelMoRong: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: ORG_TONE.border,
  },
  panelMoRongTxt: { fontSize: 13, fontWeight: '700', color: ORG_TONE.primary },

  // ── MỤC 2 — hai ô xem trước ────────────────────────────────────────────────
  bentoPreviews: { marginBottom: 12 },
  bentoPreview: { height: 138, justifyContent: 'flex-end', alignItems: 'center' },
  /** Huy hiệu ở GÓC, không phải nhãn giữa ô: hình đã nói đây là không gian. */
  badge3D: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999,
    backgroundColor: 'rgba(127, 231, 196, 0.14)',
  },
  badge3DTxt: { fontSize: 11, fontWeight: '800', color: SANG_KHONG_GIAN },

  anhTrong: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_SURFACE.sunken,
  },
  /** Chip đếm ảnh — nền kính mờ, vì nó nằm TRÊN một tấm ảnh sáng tối bất kỳ. */
  anhChip: {
    position: 'absolute', left: 10, bottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  anhChipTxt: { fontSize: 11.5, fontWeight: '800', color: ORG_NATURE.bark },
  anhMoi: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  anhMoiTxt: { fontSize: 12, fontWeight: '700', color: ORG_TONE.primary, textAlign: 'center', lineHeight: 16 },

  daiAnh: { marginBottom: 18 },

  // ── MỤC 3 — nút quả ────────────────────────────────────────────────────────
  quaHang: { gap: 12, marginBottom: 14 },
  /**
   * Lòng nút là ẢNH, mép nút là TRẠNG THÁI.
   *
   * `overflow: 'hidden'` KHÔNG phải tuỳ chọn: ảnh bên trong là hình vuông, thiếu
   * dòng này thì bốn góc ảnh thò ra ngoài vòng tròn và nút thành hình vuông bo.
   * Màu viền do nơi dùng truyền vào, lấy thẳng từ `STATUS_MAP`.
   */
  quaTron: {
    overflow: 'hidden',
    borderWidth: 3,
    backgroundColor: ORG_SURFACE.sunken,
    alignItems: 'center', justifyContent: 'center',
  },
  quaAnh: { width: '100%', height: '100%' },
  quaTrong: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  quaTen: {
    marginTop: 7,
    fontSize: 11.5, fontWeight: '700', color: ORG_NATURE.bark,
    textAlign: 'center', lineHeight: 14, letterSpacing: -0.2,
  },

  // ── Popup chi tiết quả ─────────────────────────────────────────────────────
  quaPopupNen: { ...StyleSheet.absoluteFillObject, backgroundColor: ORG_SURFACE.scrim },
  quaPopupBoc: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  quaPopup: {
    width: '100%', maxWidth: 420,
    borderRadius: 20, overflow: 'hidden',
    padding: 18, gap: 14,
    borderWidth: 1, borderColor: ORG_TONE.border,
    ...ORG_ELEV.modal,
  },
  quaPopupDau: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quaPopupTen: { fontSize: 18, fontWeight: '800', color: ORG_NATURE.bark, letterSpacing: -0.3 },
  quaPopupBang: { gap: 7 },
  quaPopupHang: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  quaPopupNhan: { fontSize: 13, color: ORG_NATURE.barkSoft },
  quaPopupGt: { fontSize: 14, fontWeight: '600', color: ORG_NATURE.bark, flexShrink: 1, textAlign: 'right' },
  quaPopupNut: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 999, overflow: 'hidden',
  },
  quaPopupNutTxt: { fontSize: 15, fontWeight: '800', color: COLORS.white },

  // ── Tiêu đề mục Quả ────────────────────────────────────────────────────────
  sectionQua: { marginTop: 4 },
  sectionCount: {
    fontSize: 12, fontWeight: '800', color: ORG_TONE.primary,
    backgroundColor: ORG_TONE.primarySoft,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    overflow: 'hidden',
  },
  /** Ô lọc ĐANG bật phải trông khác ô lọc tắt — nếu không, không ai biết danh
   *  sách đang bị cắt bớt, và "mất quả" là kết luận tự nhiên tiếp theo. */
  statusFilterBtnBat: { borderColor: ORG_TONE.primary, backgroundColor: ORG_TONE.primarySoft },
  statusFilterTextBat: { color: ORG_TONE.primary, fontWeight: '800' },
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
  // Nút "Ghi thuốc" — việc hằng ngày, nên nó là nút DUY NHẤT ở đầu màn có nền
  // nổi và chữ đầy đủ. Xem chú thích ở phần Header về vì sao đúng nút này.
  headerCareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.primary,
  },
  headerCareTxt: { fontSize: 12.5, fontWeight: '800', color: ORG_TONE.primary },

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

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexGrow: 1,
  },

  farmPickEmpty: { fontSize: 13, color: COLORS.textMuted, paddingVertical: 8 },
  farmPickRemove: { color: COLORS.error },



  featuresLine: { fontSize: 14.5, color: ORG_NATURE.bark, lineHeight: 22 },
  featuresPending: { fontSize: 14, color: ORG_NATURE.barkSoft, lineHeight: 21 },
  treeVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  treeVideoBtnText: { fontSize: 12.5, fontWeight: '800', color: ORG_TONE.primary },
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
  zoomClose: {
    position: 'absolute', top: 48, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },



  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionTitle: { ...ORG_TYPE.section },
  addFruitBtn: { borderRadius: 999 },
  /**
   * Nút ĐẶC, chữ trắng, bo tròn hẳn.
   *
   * Bản trước: nền `accentGlow` rất nhạt, viền `TONE.border`, chữ xanh — tức
   * giống HỆT ô tìm kiếm và ô lọc ngay bên dưới nó. Ba khối cùng sắc, cùng độ
   * dày viền, mà chỉ MỘT trong ba tạo ra dữ liệu mới; hai cái kia chỉ lọc lại
   * thứ đã có. Nút chính của một mục phải khác hạng với các ô điều khiển quanh
   * nó, nếu không thì nó không còn là nút chính.
   *
   * `overflow: 'hidden'` ở lớp TRONG vì `GradientFill` nằm trong lớp đó.
   */
  addFruitBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    overflow: 'hidden',
  },
  addFruitBtnText: { fontSize: 13.5, fontWeight: '800', color: COLORS.white },

  fruitStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  fruitStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  fruitStatusText: { fontSize: 10, fontWeight: '600' },

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

  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
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
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 0 },
  statusFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...ORG_ELEV.card,
  },
  statusFilterText: { fontSize: 13, color: ORG_NATURE.barkSoft, fontWeight: '700', maxWidth: 92 },

  // ── Tấm "Khác" ─────────────────────────────────────────────────────────────
  khacNen: { ...StyleSheet.absoluteFillObject, backgroundColor: ORG_SURFACE.scrim },
  khacBoc: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  khacTam: {
    width: '100%', maxWidth: 400,
    borderRadius: 20, overflow: 'hidden',
    padding: 16, gap: 10,
    borderWidth: 1, borderColor: ORG_TONE.border,
    ...ORG_ELEV.modal,
  },
  /** Canh TRÁI, cùng mép với ba hàng dưới. Canh giữa thì tiêu đề trôi khỏi cột
   *  chữ của các hàng, và mắt phải nhảy hai lần cho một tấm ba dòng. */
  khacTieuDe: {
    fontSize: 16, fontWeight: '800', color: ORG_NATURE.bark,
    letterSpacing: -0.2, marginBottom: 2, paddingHorizontal: 2,
  },
  khacHang: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  khacIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  /** `flex: 1` là thứ giữ chữ SÁT biểu tượng: nhãn ở đây là cả một câu, và câu
   *  đó phải bắt đầu ngay sau ô màu rồi tự xuống dòng, không phải bị đẩy sang
   *  mép phải như bản trước. */
  khacNhan: {
    flex: 1,
    fontSize: 14.5, fontWeight: '600', color: ORG_NATURE.bark, lineHeight: 19,
  },

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
