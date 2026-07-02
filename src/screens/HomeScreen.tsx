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
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { NEUTRAL, withAlpha } from '../shared/theme';
import { MODULES, type ModuleEntry } from '../modules';
import { COLORS } from '../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CreateFarmPromptModal from '../components/CreateFarmPromptModal';
import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Alert, ActivityIndicator } from 'react-native';
import {
  getOrCreateImplicitFarm,
  getOrCreateImplicitTree,
  isImplicitCreationInFlight,
} from '../modules/trace/utils/implicitParent';

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

type QuickActionSheetOption = {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

type QuickActionSheetConfig = {
  title: string;
  subtitle: string;
  options: QuickActionSheetOption[];
};

// ── Mock data (sẽ thay bằng API thật khi module có) ────────────────────────
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

// ── Hero bar ────────────────────────────────────────────────────────────────
const HeroBar = ({
  name,
  initials,
  unreadCount,
  fade,
  slide,
  topInset,
  onPressBell,
  onPressAvatar,
}: {
  name: string;
  initials: string;
  unreadCount: number;
  fade: Animated.Value;
  slide: Animated.Value;
  topInset: number;
  onPressBell: () => void;
  onPressAvatar: () => void;
}) => (
  <Animated.View
    style={[
      styles.hero,
      { paddingTop: (Platform.OS === 'ios' ? 36 : 20) + 4 + topInset },
      { opacity: fade, transform: [{ translateY: slide }] },
    ]}
  >
    <TouchableOpacity onPress={onPressAvatar} activeOpacity={0.7} style={styles.heroLeft}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View>
        <Text style={styles.heroEyebrow}>Xin chào 👋</Text>
        <Text style={styles.heroName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </TouchableOpacity>

    <TouchableOpacity style={styles.bellWrap} onPress={onPressBell} activeOpacity={0.7}>
      <Icon name="bell" size={28} color={NEUTRAL.white} />
      {unreadCount > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  </Animated.View>
);

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
  const user = useSelector((s: RootState) => s.user.currentUser);
  const farms = useSelector((s: RootState) => s.farm.farms);
  const trees = useSelector((s: RootState) => s.farm.trees);
  const activities = useSelector((s: RootState) => s.farm.activities);

  // Mock badges cho ProofChat / Work cho tới khi có module thật
  const proofChatUnread = 0;
  const workMatches = 5;
  const totalUnread = proofChatUnread;

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;
  const carouselFade = useRef(new Animated.Value(0)).current;

  const [refreshing, setRefreshing] = useState(false);
  const [moduleLayout, setModuleLayout] = useState<ModuleLayout>('grid');
  const [showFarmPrompt, setShowFarmPrompt] = useState(false);
  const [quickSheet, setQuickSheet] = useState<QuickActionSheetConfig | null>(null);
  // Build 54 V5 — Quick Action state
  const [quickActionBusy, setQuickActionBusy] = useState<'tree' | 'fruit' | 'farm' | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Build 54 V5 — Quick Actions: 1-tap entry to identify a tree, scan
  // fruit, or create a farm. Implements §3.7 (1-tap-to-capture) of the
  // Independent Feature Operation principle.
  // ─────────────────────────────────────────────────────────────────────────
  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Quyền vị trí',
            message: 'Aladin cần quyền GPS để định vị nông trại / cây.',
            buttonPositive: 'Cho phép',
            buttonNegative: 'Từ chối',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    try {
      const status = await Geolocation.requestAuthorization('whenInUse');
      return status === 'granted';
    } catch {
      return false;
    }
  };

  const getCurrentGPS = (): Promise<{ lat: number; lng: number; accuracy: number | null }> =>
    new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  const handleQuickAddTree = async () => {
    if (quickActionBusy) return;
    setQuickActionBusy('tree');
    try {
      if (!user) {
        Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập trước.');
        return;
      }
      // KHÔNG ép tạo farm. Cây là thực thể ĐỘC LẬP có DID riêng — vào thẳng luồng
      // nhận-diện/đăng-ký ReID (TreeIdentity tự lo GPS + camera). Người làm thuê chưa
      // được phân quyền farm, hay người dùng tò mò test, đều quét cây được ngay.
      // Ai quản trại vẫn gắn cây vào trại qua FarmList → FarmDetail như cũ.
      (navigation as any).navigate('TreeIdentity');
    } catch (err: any) {
      console.error('[HomeScreen] handleQuickAddTree failed:', err);
      Alert.alert('Lỗi', 'Không mở được phần nhận diện cây. Bạn thử lại sau nhé.');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleQuickScanFruit = async () => {
    if (isImplicitCreationInFlight() || quickActionBusy) return;
    setQuickActionBusy('fruit');
    try {
      if (!user) {
        Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập trước.');
        return;
      }
      if (!(await requestLocationPermission())) {
        Alert.alert('Cần quyền vị trí', 'Bật GPS trong Cài đặt → Aladin.');
        return;
      }
      // GPS + tạo vườn/cây ngầm trên bản đồ — GIỮ NGUYÊN.
      const gps = await getCurrentGPS();
      const farm = await getOrCreateImplicitFarm({
        userDid: user.id,
        userName: user.name,
        gps,
        accuracyMeters: gps.accuracy,
      });
      await getOrCreateImplicitTree({
        farmId: farm.farmId,
        userDid: user.id,
        gps,
        accuracyMeters: gps.accuracy,
      });

      // Sau khi thêm GPS/vườn-cây trên bản đồ xong → sang màn Nhận diện (TreeIdentity),
      // thay cho scanner cũ (giống nút quick "Nhận diện").
      (navigation as any).navigate('TreeIdentity', { farmId: farm.farmId });
    } catch (err: any) {
      console.error('[HomeScreen] handleQuickScanFruit failed:', err);
      Alert.alert('Lỗi', 'Không thể nhận diện quả. Bạn thử lại sau nhé.');
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleQuickAddFarm = () => {
    // No implicit logic — direct path to AddFarmMode
    (navigation as any).navigate('FarmDetail');
  };

  const openQuickTreeSheet = () => {
    setQuickSheet({
      title: 'Bạn muốn nhận diện cây ở đâu?',
      subtitle: 'Chọn vườn trước để cây được gắn đúng vị trí.',
      options: [
        {
          key: 'nearest',
          icon: 'map-marker-radius',
          title: 'Nhận diện ngay',
          subtitle: 'Dùng GPS để chọn hoặc tạo vườn phù hợp',
          onPress: () => (navigation as any).navigate('TreeIdentity'),
        },
        {
          key: 'choose',
          icon: 'sprout',
          title: 'Chọn vườn có sẵn',
          subtitle: 'Mở danh sách vườn rồi chọn cây cần nhận diện',
          onPress: () => navigation.navigate('Farms' as never),
        },
        {
          key: 'new',
          icon: 'plus-circle-outline',
          title: 'Tạo vườn mới',
          subtitle: 'Tạo vườn tạm từ GPS rồi nhận diện cây',
          onPress: () => (navigation as any).navigate('TreeIdentity'),
        },
      ],
    });
  };

  const openQuickFruitSheet = () => {
    setQuickSheet({
      title: 'Quét quả ở đâu?',
      subtitle: 'Quả nên được gắn với cây hoặc vườn cụ thể.',
      options: [
        {
          key: 'choose-tree',
          icon: 'tree-outline',
          title: 'Chọn cây',
          subtitle: 'Gắn quả vào cây đã định danh',
          onPress: () => navigation.navigate('Farms' as never),
        },
        {
          key: 'scan-fruit',
          icon: 'fruit-cherries',
          title: 'Quét nhanh trong vườn gần nhất',
          subtitle: 'Dùng GPS để chọn hoặc tạo vườn phù hợp',
          onPress: handleQuickScanFruit,
        },
        {
          key: 'scan-tree-first',
          icon: 'tree-outline',
          title: 'Quét cây trước',
          subtitle: 'Nếu chưa có cây phù hợp',
          onPress: handleQuickAddTree,
        },
      ],
    });
  };

  // ✅ Check if user has no farms and hasn't dismissed the prompt
  useEffect(() => {
    const checkFarmPrompt = async () => {
      try {
        // ✅ Hide modal if user has farms
        if (farms.length > 0) {
          setShowFarmPrompt(false);
          return;
        }

        const dismissed = await AsyncStorage.getItem('farm_prompt_dismissed');
        if (!dismissed && farms.length === 0) {
          // Show modal after 500ms delay for better UX
          setTimeout(() => setShowFarmPrompt(true), 500);
        }
      } catch (error) {
        console.log('Error checking farm prompt:', error);
      }
    };

    checkFarmPrompt();
  }, [farms.length]);

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(carouselFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const moduleBadges: Record<string, number | undefined> = {
    trace: undefined,
    proofchat: proofChatUnread,
    work: workMatches,
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

  const handleCreateFarm = () => {
    setShowFarmPrompt(false);
    // Navigate to Farm creation screen
    navigation.navigate('Farms' as never);
  };

  const handleDismissFarmPrompt = async () => {
    setShowFarmPrompt(false);
    try {
      await AsyncStorage.setItem('farm_prompt_dismissed', 'true');
    } catch (error) {
      console.log('Error saving farm prompt dismissed:', error);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      {/* ✅ Farm Prompt Modal */}
      <CreateFarmPromptModal
        visible={showFarmPrompt}
        onCreateFarm={handleCreateFarm}
        onDismiss={handleDismissFarmPrompt}
      />

      <Modal
        visible={!!quickSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickSheet(null)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setQuickSheet(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.quickSheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.quickSheetTitle}>{quickSheet?.title}</Text>
            <Text style={styles.quickSheetSub}>{quickSheet?.subtitle}</Text>
            {quickSheet?.options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.quickSheetOption}
                activeOpacity={0.85}
                onPress={() => {
                  setQuickSheet(null);
                  option.onPress();
                }}
              >
                <View style={styles.quickSheetIconWrap}>
                  <Icon name={option.icon} size={22} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickSheetOptionTitle}>{option.title}</Text>
                  <Text style={styles.quickSheetOptionSub}>{option.subtitle}</Text>
                </View>
                <Icon name="chevron-right" size={22} color={NEUTRAL.textMuted} />
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <HeroBar
        name={user?.name ?? 'Người dùng'}
        initials={initials}
        unreadCount={totalUnread}
        fade={headerFade}
        slide={headerSlide}
        topInset={insets.top}
        onPressBell={() => {
          navigation.navigate('Activity' as never);
        }}
        onPressAvatar={() => navigation.navigate('Account' as never)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
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
        {/* Build 54 V5 — Quick Actions: 1-tap entry to identify a tree, capture
            3D tree scan, scan fruit, or create a farm. Implements §3.7 (1-tap-to-capture) of the
            Independent Feature Operation principle. Order per CPO Đức:
              🌳 Cây · Tree → 🍎 Quả · Fruit → 🗺️ Vườn · Farm */}
        <View style={styles.quickActionsRow}>
          {/* Tree Identity - Native implementation.
              Quét cây ĐỘC LẬP: vào thẳng TreeIdentity, KHÔNG ép chọn/tạo vườn.
              Cây enroll qua đây có farm_id=null — gắn vườn sau (tuỳ chọn). */}
          <TouchableOpacity
            style={[styles.quickActionBtn]}
            onPress={handleQuickAddTree}
            disabled={quickActionBusy !== null}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionIconWrap}>
              {quickActionBusy === 'tree' ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <Image
                  source={require('../../assets/images/modules/tree.png')}
                  style={styles.quickActionImg}
                  resizeMode="contain"
                />
              )}
            </View>
            <Text style={styles.quickActionLabel}>Quét cây</Text>
            <Text style={styles.quickActionLabelEn}>Tree</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionBtn]}
            onPress={openQuickFruitSheet}
            disabled={quickActionBusy !== null}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionIconWrap}>
              {quickActionBusy === 'fruit' ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <Image
                  source={require('../../assets/images/modules/vegetable.png')}
                  style={styles.quickActionImg}
                  resizeMode="contain"
                />
              )}
            </View>
            <Text style={styles.quickActionLabel}>Quả</Text>
            <Text style={styles.quickActionLabelEn}>Fruit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionBtn]}
            onPress={() => (navigation as any).navigate('AnimalManagement', { farmId: farms[0]?.id ?? 'default' })}
            disabled={quickActionBusy !== null}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionIconWrap}>
              <Icon name="paw" size={32} color={COLORS.accent} />
            </View>
            <Text style={styles.quickActionLabel}>Nhận diện{'\n'}con vật</Text>
            <Text style={styles.quickActionLabelEn}>Animal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionBtn]}
            onPress={handleQuickAddFarm}
            disabled={quickActionBusy !== null}
            activeOpacity={0.85}
          >
            <View style={styles.quickActionIconWrap}>
              {quickActionBusy === 'farm' ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <Image
                  source={require('../../assets/images/modules/add-growth.png')}
                  style={styles.quickActionImg}
                  resizeMode="contain"
                />
              )}
            </View>
            <Text style={styles.quickActionLabel}>Thêm Vườn</Text>
            <Text style={styles.quickActionLabelEn}>Farm</Text>
          </TouchableOpacity>
        </View>
        {/* Module Grid */}
        <View style={styles.moduleGridWrap}>
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
            <QuickStatRow
              index={0}
              icon="pine-tree"
              label="Trang trại đang theo dõi"
              value={`${farms.length} trang trại · ${trees.length} cây`}
              color="#3B6EA8"
              onPress={() => navigation.navigate('Farms' as never)}
            />
            <View style={styles.statDivider} />
            <QuickStatRow
              index={1}
              icon="message-text-outline"
              label="Tin nhắn ProofChat"
              value={`${proofChatUnread} tin nhắn mới`}
              color="#3B6EA8"
              onPress={() => navigation.navigate('ProofChatHome' as never)}
            />
            <View style={styles.statDivider} />
            <QuickStatRow
              index={2}
              icon="briefcase-outline"
              label="Việc làm phù hợp"
              value={`${workMatches} cơ hội mới`}
              color="#3B6EA8"
              onPress={() => navigation.navigate('WorkHome' as never)}
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

  // Build 54 V5 — Quick Actions row
  quickActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    minHeight: 108,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    shadowColor: NEUTRAL.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
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
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11, 27, 42, 0.35)',
  },
  quickSheetCard: {
    backgroundColor: NEUTRAL.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: NEUTRAL.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  quickSheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: NEUTRAL.text,
    letterSpacing: -0.4,
  },
  quickSheetSub: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
  },
  quickSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.borderSoft,
  },
  quickSheetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.accent, 0.10),
  },
  quickSheetOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: NEUTRAL.text,
  },
  quickSheetOptionSub: {
    fontSize: 12,
    color: NEUTRAL.textSub,
    marginTop: 2,
    lineHeight: 16,
  },
});

export default HomeScreen;
