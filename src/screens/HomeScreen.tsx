// screens/HomeScreen.tsx
//
// Trang chủ chính (multi-module hub) — kiểu Momo.
// Hiển thị HeroBar, Carousel khuyến mãi, ModuleGrid (Trace/ProofChat/Work),
// QuickStats tóm tắt từ các module, và Recent activity.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
  Platform,
  RefreshControl,
  FlatList,
  Image,
  Modal,
  Easing,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { loadFarms, loadTrees } from '../modules/trace/store/farmSlice';
import { selectChainWallet } from '../store/userSlice';
import { NEUTRAL, withAlpha } from '../shared/theme';
import { MODULES, type ModuleEntry } from '../modules';
import {
  getRankedQuickActions,
  type RankedQuickAction,
} from '../services/featureUsageService';
import { COLORS } from '../constants';
import { fmtLamp } from '../utils/token';
import { useCollapsibleHeader } from '../components/AppHeader';
import { useCoachMarkTarget, useCoachMark } from '../onboarding/CoachMarkContext';
import { shouldAutoRunTutorial } from '../utils/tutorialStorage';

const { width } = Dimensions.get('window');
const H_PADDING = 20;
const CAROUSEL_W = width - H_PADDING * 2;
const CAROUSEL_H = 140;
const MODULE_GAP = 12;
// Card 2 cột. Trên máy nhỏ / landscape hẹp, nửa màn hình quá nhỏ khiến chữ tràn.
// Đặt sàn tối thiểu (MODULE_CARD_MIN) — nếu 1 nửa màn hình < sàn thì cho card
// chiếm gần trọn bề ngang (wrap xuống 1 cột) thay vì ép 2 cột chật.
const MODULE_CARD_MIN = 150;
const MODULE_HALF_W = (width - H_PADDING * 2 - MODULE_GAP) / 2;
const MODULE_CARD_W =
  MODULE_HALF_W >= MODULE_CARD_MIN ? MODULE_HALF_W : width - H_PADDING * 2;

// Khoảng chừa dưới cho CurvedTabBar (navbar khuyết-tròn) — thanh cao 64 + nút
// Home nhô lên 43 + cushion. Cộng thêm insets.bottom tại nơi dùng. Giữ đồng bộ
// với TAB_BAR_HEIGHT/FLOAT trong navigation/index.tsx.
const BOTTOM_NAV_CLEARANCE = 120;

// ── Hộp Quick Action (thu/mở) ───────────────────────────────────────────────
// Thanh header PHẲNG, không gradient. Chữ/icon dùng xanh-lá đậm — cùng ngôn ngữ
// màu với nhóm hành động "quét" (ACTION_COLORS.scan) ở navbar.
const QUICK_GREEN_DEEP = '#1F5C2A';
// 4 nút / hàng; nút thừa (tính năng hay dùng ngoài bộ mặc định) tự xuống hàng.
const QUICK_GAP = 8;
const QUICK_ITEM_W = (width - H_PADDING * 2 - QUICK_GAP * 3) / 4;

// Định dạng số dư token gọn cho stat row (làm tròn + phân tách hàng nghìn vi-VN).
const formatToken = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('vi-VN') : '0';

// ── Băng giới thiệu tính năng (nội dung viết cứng, KHÔNG phải dữ liệu giả) ──
// Chú thích cũ ghi "Mock data" nên đợt rà 15/08 suýt gỡ nhầm cả khu. Ba tấm này
// mô tả đúng tính năng đang có: truy xuất tới từng trái (chạy thật), Trò chuyện
// ("sắp ra mắt" — đúng, ProofChat còn sau cổng), Việc làm (có thật). Không tấm nào
// hứa khuyến mãi hay mốc thời gian, nên không quá hạn được. Đổi nội dung khi tính
// năng đổi; đừng nối API tin tức vào đây.
const BANNERS = [
  {
    id: 'b1',
    title: 'Truy xuất sầu riêng\ntới từng trái',
    sub: 'Định danh blockchain Cardano',
    bg: '#3B6EA8',
    icon: 'leaf-circle-outline',
  },
  {
    id: 'b2',
    title: 'Tính năng Trò chuyện sắp\nra mắt',
    sub: 'Tin nhắn xác thực bằng chữ ký',
    bg: '#264E7E',
    icon: 'message-text-outline',
  },
  {
    id: 'b3',
    title: 'Tìm việc · Đặt thợ\nmọi lĩnh vực',
    sub: 'Hợp đồng số · Ký quỹ blockchain',
    bg: '#4A86C2',
    icon: 'briefcase-search-outline',
  },
];

// HeroBar (thanh chào + chuông + avatar) ĐÃ DỜI lên AppHeader toàn cục
// (components/AppHeader.tsx) — thu/thả theo cuộn, hiển thị ở MỌI màn, nút Tài
// khoản + Thông báo nằm ở đó thay vì trong từng màn. Xoá khỏi Home để tránh 2
// thanh trên chồng nhau.

// ── Carousel ────────────────────────────────────────────────────────────────
const BannerCarousel = ({ fade }: { fade: Animated.Value }) => {
  const [active, setActive] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % BANNERS.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_W);
    if (idx !== active) setActive(idx);
  };

  return (
    <Animated.View style={{ opacity: fade }}>
      <FlatList
        ref={listRef}
        data={BANNERS}
        keyExtractor={(b) => b.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: CAROUSEL_W,
          offset: CAROUSEL_W * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={[styles.banner, { backgroundColor: item.bg, width: CAROUSEL_W }]}>
            <View style={styles.bannerOrb} />
            <View style={styles.bannerOrb2} />
            <View style={{ flex: 1 }}>
              {/* Tiêu đề có \n cứng — giới hạn 2 dòng + co chữ khi người dùng bật
                  font-scale lớn, tránh bị cắt cụt trong banner cao cố định. */}
              <Text
                style={styles.bannerTitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.title}
              </Text>
              <Text style={styles.bannerSub} numberOfLines={2}>
                {item.sub}
              </Text>
            </View>
            <View style={styles.bannerIconWrap}>
              <Icon name={item.icon} size={56} color="rgba(255,255,255,0.85)" />
            </View>
          </View>
        )}
      />
      <View style={styles.dots}>
        {BANNERS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === active && styles.dotActive]}
          />
        ))}
      </View>
    </Animated.View>
  );
};

type ModuleLayout = 'grid' | 'list';

// ── Module card ─────────────────────────────────────────────────────────────
const ModuleCard = ({
  entry,
  badge,
  onPress,
  index,
  layout,
}: {
  entry: ModuleEntry;
  badge?: number;
  onPress: () => void;
  index: number;
  layout: ModuleLayout;
}) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 400,
        delay: 200 + index * 90,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 400,
        delay: 200 + index * 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const { available, bgDark } = entry;
  const isList = layout === 'list';

  return (
    <Animated.View
      style={{
        width: isList ? '100%' : MODULE_CARD_W,
        opacity: fade,
        transform: [{ translateY: slide }, { scale }],
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start()
        }
      >
        {isList ? (
          <View
            key="list"
            style={[
              styles.moduleCardList,
              {
                backgroundColor: withAlpha(bgDark, 0.08),
                borderColor: withAlpha(bgDark, 0.18),
              },
            ]}
          >
            <View
              style={[
                styles.moduleImageWrapList,
                { backgroundColor: withAlpha(bgDark, 0.10) },
              ]}
            >
              <Image
                source={entry.image}
                style={styles.moduleImageList}
                resizeMode="contain"
              />
              {badge !== undefined && badge > 0 && (
                <View style={[styles.moduleBadge, { backgroundColor: bgDark }]}>
                  <Text style={styles.moduleBadgeText}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.moduleTextWrapList}>
              <Text
                style={[styles.moduleTitleList, { color: bgDark }]}
                numberOfLines={1}
              >
                {entry.title}
              </Text>
              <Text
                style={[styles.moduleDescList, { color: withAlpha(bgDark, 0.75) }]}
                numberOfLines={2}
              >
                {entry.description}
              </Text>
            </View>

            <Icon name="chevron-right" size={22} color={withAlpha(bgDark, 0.6)} />

            {!available && (
              <View style={[styles.comingSoonBadgeList, { backgroundColor: bgDark }]}>
                <Text style={styles.comingSoonText}>SẮP RA MẮT</Text>
              </View>
            )}
          </View>
        ) : (
          <View
            key="grid"
            style={[
              styles.moduleCard,
              { backgroundColor: bgDark, shadowColor: bgDark },
            ]}
          >
            <View pointerEvents="none" style={styles.moduleOrb} />
            <View pointerEvents="none" style={styles.moduleOrb2} />

            <View style={styles.moduleContent}>
              <View style={styles.moduleImageWrap}>
                <Image
                  source={entry.image}
                  style={styles.moduleImageGrid}
                  resizeMode="contain"
                />
                {badge !== undefined && badge > 0 && (
                  <View style={styles.moduleBadge}>
                    <Text style={styles.moduleBadgeText}>
                      {badge > 99 ? '99+' : badge}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.moduleTextWrap}>
                <Text style={styles.moduleTitle} numberOfLines={1}>
                  {entry.title}
                </Text>
                <Text style={styles.moduleDesc} numberOfLines={3}>
                  {entry.description}
                </Text>
              </View>
            </View>

            {!available && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>SẮP RA MẮT</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Layout toggle ───────────────────────────────────────────────────────────
const LayoutToggle = ({
  value,
  onChange,
}: {
  value: ModuleLayout;
  onChange: (next: ModuleLayout) => void;
}) => (
  <View style={styles.layoutToggle}>
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onChange('grid')}
      style={[styles.layoutBtn, value === 'grid' && styles.layoutBtnActive]}
      hitSlop={6}
    >
      <Icon
        name="view-grid"
        size={16}
        color={value === 'grid' ? NEUTRAL.white : NEUTRAL.textMuted}
      />
    </TouchableOpacity>
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onChange('list')}
      style={[styles.layoutBtn, value === 'list' && styles.layoutBtnActive]}
      hitSlop={6}
    >
      <Icon
        name="view-agenda"
        size={16}
        color={value === 'list' ? NEUTRAL.white : NEUTRAL.textMuted}
      />
    </TouchableOpacity>
  </View>
);

// ── Quick stat row ──────────────────────────────────────────────────────────
const QuickStatRow = ({
  icon,
  label,
  value,
  color,
  onPress,
  index,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  onPress: () => void;
  index: number;
}) => {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 350,
      delay: 400 + index * 70,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade }}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.statRow}>
        <View style={[styles.statIcon, { backgroundColor: withAlpha(color, 0.12) }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={[styles.statValue, { color }]}>{value}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={NEUTRAL.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Section header ──────────────────────────────────────────────────────────
const SectionHeader = ({
  title,
  action,
  onActionPress,
}: {
  title: string;
  action?: string;
  onActionPress?: () => void;
}) => (
  <View style={styles.sectionRow}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={onActionPress} hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── Main Screen ─────────────────────────────────────────────────────────────
const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Target luồng hướng dẫn: khu "Dịch vụ" trên màn hình chính.
  const servicesTarget = useCoachMarkTarget('home.services');
  const { start: startTour } = useCoachMark();
  const autoTourRef = useRef(false);
  // Cuộn → thu/thả header toàn cục (Facebook-style). Header sống ở tầng nav; ở
  // đây chỉ nối onScroll của ScrollView vào.
  const { onScroll: onHeaderScroll, scrollEventThrottle: headerThrottle } = useCollapsibleHeader();
  const dispatch = useAppDispatch();
  const user = useSelector((s: RootState) => s.user.currentUser);
  const farms = useSelector((s: RootState) => s.farm.farms);
  const trees = useSelector((s: RootState) => s.farm.trees);
  const activities = useSelector((s: RootState) => s.farm.activities);

  // Warm-load dữ liệu trang trại vào store NGAY khi vào Home (sau đăng nhập DB đã
  // mở). Store KHÔNG được persist → mỗi phiên khởi động lại là rỗng; nếu Home không
  // chủ động nạp thì "Thông tin nhanh" hiện 0 trang trại/0 cây tới khi mở Dashboard,
  // và Dashboard là nơi DUY NHẤT nạp farm → mở Truy xuất dễ gặp màn trắng. Nạp ở đây
  // để Home phản ánh đúng số liệu VÀ hâm nóng store trước khi bấm Truy xuất.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await dispatch(loadFarms(uid)).unwrap();
        if (cancelled) return;
        for (const f of loaded) {
          if (cancelled) return;
          await dispatch(loadTrees(f.id)).unwrap();
        }
      } catch (_) {
        // DB chưa sẵn / lỗi đọc → im lặng; Dashboard sẽ thử lại & hiện trạng thái lỗi.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dispatch]);

  // Lần đầu người dùng vào Home sau khi đăng nhập → tự chạy luồng hướng dẫn
  // (một lần cho mỗi người; đã skip/hoàn thành thì không tự chạy lại — xem
  // utils/tutorialStorage). Chờ một nhịp cho layout (header + navbar + grid) ổn
  // định để đo spotlight chính xác.
  useEffect(() => {
    const uid = user?.id;
    if (!uid || autoTourRef.current) return;
    autoTourRef.current = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      if (await shouldAutoRunTutorial(uid)) {
        timer = setTimeout(() => startTour(uid), 700);
      }
    })();
    return () => clearTimeout(timer);
  }, [user?.id, startTour]);

  // Số THẬT (§6 — KHÔNG bịa dữ liệu):
  //  - ProofChat: tổng tin chưa đọc từ CHÍNH store màn Chat dùng (rẻ, không mock).
  //  - Work: chưa có nguồn thật → KHÔNG hiện số bịa (bỏ stat + badge, xem dưới).
  const proofChatUnread = useSelector((s: RootState) =>
    s.chat.rooms.reduce((n, r) => n + (r.unreadCount ?? 0), 0),
  );
  // Trạng thái VÍ thật: chỉ số ĐẾN TỪ CHAIN (selectChainWallet trả null khi chưa
  // đồng bộ → hiển thị "Chưa đồng bộ", KHÔNG số cũ/bịa).
  const chainWallet = useSelector(selectChainWallet);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;
  const carouselFade = useRef(new Animated.Value(0)).current;

  const [refreshing, setRefreshing] = useState(false);
  const [moduleLayout, setModuleLayout] = useState<ModuleLayout>('grid');

  // Hộp Quick Action: mặc định thu gọn (khi đã hiện — xem quickVisible bên dưới).
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBodyH, setQuickBodyH] = useState(0);
  // HAI Animated.Value tách driver — đây là mấu chốt để mở/đóng KHÔNG giật:
  //  - quickFx (native driver): opacity + trượt + xoay chevron, chạy trên UI thread.
  //  - quickH  (JS driver): CHỈ chiều cao (height không hỗ trợ native driver).
  // Một Animated.Value không được trộn 2 driver, nên phải tách. Trước đây gộp làm
  // một → mọi thứ chạy trên JS thread, mỗi khung phải qua cầu → giật.
  const quickFx = useRef(new Animated.Value(0)).current;
  const quickH = useRef(new Animated.Value(0)).current;

  const toggleQuick = () => {
    const next = !quickOpen;
    setQuickOpen(next);
    const duration = next ? 260 : 200;
    const easing = next ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic);
    Animated.parallel([
      Animated.timing(quickFx, { toValue: next ? 1 : 0, duration, easing, useNativeDriver: true }),
      Animated.timing(quickH, { toValue: next ? 1 : 0, duration, easing, useNativeDriver: false }),
    ]).start();
  };

  const onQuickBodyLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== quickBodyH) setQuickBodyH(h);
  };

  // ── Quick Action = 100% dữ liệu hành vi ───────────────────────────────────
  // Nút nào hiện, đứng thứ mấy đều do bảng feature_usage_events quyết định:
  // tính năng phải đạt >= QUICK_ACTION_MIN_USES lượt mở mới được thêm vào, và
  // sắp theo số lượt giảm dần. Máy mới cài → mảng rỗng → ẩn cả khối, kể cả thanh
  // đóng/mở. Bản thân việc ĐẾM nằm ở NavigationContainer.onStateChange nên bấm
  // mở tính năng từ đâu cũng tính (xem services/featureUsageService.ts).
  const [rankedActions, setRankedActions] = useState<RankedQuickAction[]>([]);

  const refreshQuickActions = React.useCallback(() => {
    getRankedQuickActions()
      .then(setRankedActions)
      .catch((err) => console.warn('[HomeScreen] getRankedQuickActions failed:', err));
  }, []);

  // Nạp lại mỗi lần Home được focus — vừa dùng tính năng xong quay về là thấy cập nhật.
  useEffect(() => {
    refreshQuickActions();
    const unsub = navigation.addListener('focus', refreshQuickActions);
    return unsub;
  }, [navigation, refreshQuickActions]);

  const quickVisible = rankedActions.length > 0;

  // Bấm nút Quick Action = điều hướng thẳng tới route trong config. KHÔNG gọi hàm
  // đếm ở đây: onStateChange sẽ tự ghi khi route mở — một luật đếm duy nhất.
  const onQuickActionPress = (action: RankedQuickAction) => {
    const params =
      // FarmDetail/AnimalManagement cần farm hiện có (nếu có) — tham số động, không
      // đặt tĩnh trong config được.
      action.route === 'AnimalManagement'
        ? { farmId: farms[0]?.id ?? 'default', ...action.params }
        : action.params;
    (navigation as any).navigate(action.route, params);
  };

  // BỎ modal "Tạo nông trại trước" tự bật.
  //
  // Ba lý do, lý do thứ ba mới là lý do chính:
  //   1. Nó là <Modal> phủ toàn màn (CreateFarmPromptModal.tsx:67) nên nó che cả
  //      navbar — người mới mở app ra thấy một cửa ải, không thấy sản phẩm.
  //   2. `setTimeout` ở bản cũ không có cleanup. Store không persist nên mỗi phiên
  //      `farms` khởi tạo rỗng rồi mới nạp; hẹn giờ 500ms đã đặt vẫn nổ sau khi
  //      farm về ⇒ người ĐÃ CÓ vườn vẫn bị đập modal vào mặt mỗi lần mở app.
  //   3. App này không chỉ dành cho nông dân. Người cộng đồng Cardano vào để dùng
  //      Ví, người LampNet vào để góp máy, freelancer vào để nhận việc, người mới
  //      vào để nhắn tin. Bắt tất cả tạo nông trại trước là hỏi sai câu hỏi ngay ở
  //      giây đầu tiên. Ai cần vườn thì vào tab Trang trại — nút tạo nằm sẵn ở đó.

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(carouselFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const moduleBadges: Record<string, number | undefined> = {
    trace: undefined,
    proofchat: proofChatUnread,
    work: undefined, // Work chưa có nguồn thật → không gắn badge số bịa.
  };

  const handleModulePress = (entry: ModuleEntry) => {
    if (!entry.available) {
      // Placeholder cho module chưa sẵn sàng
      return;
    }
    // routeName giờ khớp route nav thật (YC-3) — điều hướng thẳng, không cần map.
    navigation.navigate(entry.routeName as never);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise<void>((r) => setTimeout(() => r(), 800));
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      {/* HeroBar cũ ĐÃ BỎ: nút Tài khoản + Thông báo (chuông) nay nằm trong
          AppHeader toàn cục (thu/thả theo cuộn) ở tầng nav — tránh 2 thanh trên
          chồng nhau. Xem components/AppHeader.tsx. */}

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onHeaderScroll}
        scrollEventThrottle={headerThrottle}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 8 },
          // iOS-fix: CurvedTabBar (navbar) là position:absolute nổi trên nội dung.
          // Chừa đủ khoảng dưới = chiều cao thanh (64) + phần nhô nút Home (43) +
          // safe-area dưới, để item cuối KHÔNG bị navbar che. (BOTTOM_NAV_CLEARANCE)
          // Math.max: đảm bảo sàn tối thiểu ngay cả khi insets.bottom = 0 (Android
          // không có home-indicator) — tránh navbar nổi che nội dung cuối.
          { paddingBottom: Math.max(BOTTOM_NAV_CLEARANCE, insets.bottom + BOTTOM_NAV_CLEARANCE) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={NEUTRAL.text}
            colors={[NEUTRAL.text]}
          />
        }
      >
        {/* Carousel banner */}
        <View>
          <BannerCarousel fade={carouselFade} />
        </View>
        {/* Quick Action — nút nào hiện & đứng thứ mấy đều do HÀNH VI quyết định:
            danh sách nút khai ở config/quickActions.ts, lọc theo số lượt mở và sắp
            giảm dần. Chưa tính năng nào đủ ngưỡng → rankedActions rỗng → ẩn TOÀN BỘ
            khối, kể cả thanh đóng/mở. Lối vào tính năng lúc đó vẫn còn ở Dịch vụ,
            navbar và menu hành động. */}
        {quickVisible && (
          <View style={styles.quickCard}>
            {/* Thân hộp KHÔNG màu. Lượt render đầu chưa biết chiều cao thật → cho
                thân nằm absolute + opacity 0 để ĐO (onLayout) mà không chiếm chỗ.
                Đo xong (quickBodyH > 0) mới chuyển sang chiều cao có animation.
                Lớp ngoài chỉ animate HEIGHT (quickH, JS driver); lớp trong animate
                opacity + trượt (quickFx, native driver) → phần tốn kém nhất chạy
                trên UI thread, hết giật. */}
            <Animated.View
              style={[
                styles.quickBody,
                quickBodyH === 0
                  ? styles.quickBodyMeasuring
                  : {
                    height: quickH.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, quickBodyH],
                    }),
                  },
              ]}
              pointerEvents={quickOpen ? 'auto' : 'none'}
            >
              <Animated.View
                onLayout={onQuickBodyLayout}
                style={{
                  opacity: quickFx,
                  transform: [
                    {
                      translateY: quickFx.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-8, 0],
                      }),
                    },
                  ],
                }}
              >
                {/* Nút đến từ config/quickActions.ts; thứ tự = số lượt dùng thật
                    (dùng nhiều đứng đầu), không nút nào cố định vị trí. */}
                <View style={styles.quickActionsRow}>
                  {rankedActions.map((a) => (
                    <TouchableOpacity
                      key={a.route}
                      style={styles.quickActionBtn}
                      onPress={() => onQuickActionPress(a)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.quickActionIconWrap}>
                        {a.image ? (
                          <Image
                            source={a.image}
                            style={styles.quickActionImg}
                            resizeMode="contain"
                          />
                        ) : (
                          <Icon name={a.icon!} size={32} color={COLORS.accent} />
                        )}
                      </View>
                      <Text style={styles.quickActionLabel} numberOfLines={2}>
                        {a.label}
                      </Text>
                      {!!a.labelEn && (
                        <Text style={styles.quickActionLabelEn}>{a.labelEn}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </Animated.View>
            </Animated.View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={toggleQuick}
              style={styles.quickBar}
              accessibilityRole="button"
              accessibilityState={{ expanded: quickOpen }}
              accessibilityLabel={quickOpen ? 'Thu gọn thao tác nhanh' : 'Mở thao tác nhanh'}
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: quickFx.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '180deg'],
                      }),
                    },
                  ],
                }}
              >
                <Icon name="chevron-down" size={20} color={QUICK_GREEN_DEEP} style={styles.quickBarIcon} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Module Grid */}
        <View ref={servicesTarget.ref} collapsable={false} style={styles.moduleGridWrap}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Dịch vụ</Text>
            <LayoutToggle value={moduleLayout} onChange={setModuleLayout} />
          </View>
          <View style={styles.moduleGrid}>
            {MODULES.map((m, i) => {
              const card = (
                <ModuleCard
                  entry={m}
                  badge={moduleBadges[m.theme.key]}
                  index={i}
                  onPress={() => handleModulePress(m)}
                  layout={moduleLayout}
                />
              );
              return React.cloneElement(card, { key: m.theme.key });
            })}
          </View>
        </View>

        {/* Quick stats */}
        <View style={styles.quickStatsWrap}>
          <SectionHeader title="Thông tin nhanh" />
          <View style={styles.quickStatsCard}>
            {/* Ví THẬT (§6): số đến từ chain; chưa đồng bộ → "Chưa đồng bộ". */}
            <QuickStatRow
              index={0}
              icon="wallet-outline"
              label="Ví của tôi"
              value={
                chainWallet
                  ? `${formatToken(chainWallet.magicBalance)} MAGIC · ${fmtLamp(chainWallet.lampBalance)} LAMP`
                  : 'Chưa đồng bộ'
              }
              color={COLORS.accent}
              onPress={() => (navigation as any).navigate('PhoenixWallet')}
            />
            <View style={styles.statDivider} />
            <QuickStatRow
              index={1}
              icon="pine-tree"
              label="Trang trại đang theo dõi"
              value={`${farms.length} Farm · ${trees.length} Tree`}
              color={COLORS.accent}
              onPress={() => navigation.navigate('Farms' as never)}
            />
            <View style={styles.statDivider} />
            {/* ProofChat THẬT: đếm tin chưa đọc từ store; 0 → nhãn trung tính. */}
            <QuickStatRow
              index={2}
              icon="message-text-outline"
              label="Tin nhắn ProofChat"
              value={proofChatUnread > 0 ? `${proofChatUnread} new messages` : 'No new messages'}
              color={COLORS.accent}
              onPress={() => navigation.navigate('ChatHome' as never)}
            />
          </View>
        </View>

        {/* Recent activity */}
        <View style={styles.recentWrap}>
          <SectionHeader
            title="Hoạt động gần đây"
            action="Xem tất cả"
            onActionPress={() => navigation.navigate('Activity' as never)}
          />
          {activities.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="clipboard-text-outline" size={28} color={NEUTRAL.textMuted} />
              <Text style={styles.emptyText}>Chưa có hoạt động nào gần đây</Text>
            </View>
          ) : (
            activities.slice(0, 3).map((a, idx) => (
              <View key={a.id ?? idx} style={styles.recentItem}>
                <View
                  style={[
                    styles.recentIcon,
                    { backgroundColor: withAlpha('#3B6EA8', 0.12) },
                  ]}
                >
                  <Icon name="clipboard-text-outline" size={18} color="#3B6EA8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle} numberOfLines={1}>
                    {a.type}
                  </Text>
                  <Text style={styles.recentSub}>
                    {a.creditsUsed} MAGIC ·{' '}
                    {new Date(a.timestamp).toLocaleDateString('vi-VN')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  scroll: {
    paddingTop: 8,
    paddingHorizontal: H_PADDING,
    paddingBottom: 32,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.accentDeep,
    paddingTop: (Platform.OS === 'ios' ? 36 : 20) + 4,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    boxShadow: '0px 4px 12px rgba(59, 110, 168, 0.35)',
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: withAlpha('#ffffff', 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#8ca7c5',
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#cde0f6' },
  heroEyebrow: { fontSize: 11, color: NEUTRAL.white, fontWeight: '500' },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: NEUTRAL.white,
    letterSpacing: -0.3,
    maxWidth: width * 0.55,
  },
  bellWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: NEUTRAL.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: NEUTRAL.card,
  },
  bellBadgeText: { color: NEUTRAL.white, fontSize: 9, fontWeight: '800' },

  // Banner
  banner: {
    height: CAROUSEL_H,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  bannerOrb: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -30,
  },
  bannerOrb2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: 20,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: NEUTRAL.white,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  bannerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 6,
    fontWeight: '500',
  },
  bannerIconWrap: { marginLeft: 8 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NEUTRAL.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: NEUTRAL.text,
  },

  // Section header
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: NEUTRAL.text,
    letterSpacing: -0.2,
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: '600',
    color: NEUTRAL.textSub,
  },

  // Module grid (2 cột, card đậm, full bleed)
  moduleGridWrap: { marginTop: 24 },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MODULE_GAP,
  },
  moduleCard: {
    borderRadius: 22,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    height: 172,
    position: 'relative',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  moduleOrb: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -40,
    zIndex: 0,
  },
  moduleOrb2: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: -10,
    zIndex: 0,
  },
  moduleContent: {
    flex: 1,
    zIndex: 1,
    elevation: 1,
  },
  moduleImageWrap: {
    height: 76,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  moduleImage: {
    width: 76,
    height: 76,
  },
  moduleImageGrid: {
    position: 'absolute',
    top: -30,
    right: -22,
    width: 120,
    height: 120,
  },
  moduleBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: NEUTRAL.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  moduleBadgeText: { color: NEUTRAL.white, fontSize: 10, fontWeight: '800' },
  moduleTextWrap: {
    marginTop: 6,
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: NEUTRAL.white,
    letterSpacing: -0.3,
    textTransform: 'uppercase',
  },
  moduleDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    lineHeight: 15,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  comingSoonBadgeList: {
    position: 'absolute',
    top: 10,
    right: 12,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: '800',
    color: NEUTRAL.white,
    letterSpacing: 0.6,
  },

  // Module card — list variant (1 hàng, bg tint sáng, chữ màu module)
  moduleCardList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  moduleImageWrapList: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  moduleImageList: {
    width: 52,
    height: 52,
  },
  moduleTextWrapList: {
    flex: 1,
  },
  moduleTitleList: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.3,
    textTransform: 'uppercase',
  },
  moduleDescList: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 16,
  },

  // Layout toggle (grid / list)
  layoutToggle: {
    flexDirection: 'row',
    backgroundColor: NEUTRAL.bgWarm,
    borderRadius: 10,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  layoutBtn: {
    width: 30,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutBtnActive: {
    backgroundColor: COLORS.accent,
  },

  // Quick stats
  quickStatsWrap: { marginTop: 24 },
  quickStatsCard: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    overflow: 'hidden',
    shadowColor: NEUTRAL.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 11, color: NEUTRAL.textMuted, fontWeight: '500' },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  statDivider: {
    height: 1,
    backgroundColor: NEUTRAL.borderSoft,
    marginLeft: 62,
  },

  // Recent
  recentWrap: { marginTop: 24 },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginBottom: 8,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTitle: { fontSize: 13, fontWeight: '700', color: NEUTRAL.text },
  recentSub: { fontSize: 11, color: NEUTRAL.textMuted, marginTop: 2 },
  emptyCard: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 12, color: NEUTRAL.textMuted, fontWeight: '500' },

  // Hộp Quick Action thu/mở (mặc định đóng).
  // Hộp KHÔNG màu — chỉ thanh header có gradient.
  quickCard: {
    marginTop: 16,
    shadowColor: NEUTRAL.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    position: 'relative',
    justifyContent: 'center',
  },
  quickBarIcon: {
    width: 20,
    height: 20,
    borderRadius: 50,
    backgroundColor: withAlpha(COLORS.accent, 0.12),
  },
  quickBarTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: QUICK_GREEN_DEEP,
    letterSpacing: -0.2,
  },
  quickBarCoTitle: {
    fontSize: 12,
    color: QUICK_GREEN_DEEP,
    letterSpacing: -0.2,
  },
  quickBarHint: {
    fontSize: 11,
    fontWeight: '700',
    color: NEUTRAL.textSub,
    marginRight: 2,
  },
  quickBody: {
    overflow: 'hidden',
  },
  // Lượt render đầu: nằm ngoài dòng chảy layout để đo chiều cao thật mà không chớp.
  quickBodyMeasuring: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
  },

  // Build 54 V5 — Quick Actions row. 4 nút/hàng, nút thừa tự xuống hàng.
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 12,
    gap: QUICK_GAP,
  },
  // KHÔNG shadow/elevation: nút nằm trong hộp đang animate chiều cao — bóng đổ
  // phải tính lại mỗi khung hình (đắt trên Android) và chính là nguồn giật.
  quickActionBtn: {
    width: QUICK_ITEM_W,
    minHeight: 108,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEUTRAL.card,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: withAlpha(COLORS.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionImg: {
    width: 34,
    height: 34,
  },
  quickActionLabel: {
    color: COLORS.accentDeep,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 16,
  },
  quickActionLabelEn: {
    color: NEUTRAL.textSub,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});

export default HomeScreen;
