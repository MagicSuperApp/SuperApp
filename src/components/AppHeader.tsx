// components/AppHeader.tsx
//
// HEADER TOÀN CỤC kiểu Facebook — hiển thị Ở MỌI MÀN (khu đã-đăng-nhập), gọn
// gàng, THU/THẢ theo cuộn: cuộn XUỐNG → header trượt lên ẩn; cuộn LÊN → thả
// xuống hiện lại. Bên phải có nút THÔNG BÁO (chuông) + nút TÀI KHOẢN (cạnh nhau)
// — Tài khoản KHÔNG nằm trên navbar mà đặt ở đây (quyết định UX: giống Facebook).
//
// KIẾN TRÚC (vì sao layout-flow, không overlay):
//   Header nằm TRONG luồng (một hàng phía trên khối tab), chiều CAO animate
//   0↔FULL. Nhờ vậy KHÔNG cần chừa padding-top riêng cho từng màn — khối tab
//   (flex:1) tự dãn/co khi header ẩn/hiện. Màn nào muốn header tự thu khi cuộn
//   thì gắn `useCollapsibleHeader().onScroll` vào ScrollView/FlatList của mình;
//   màn không gắn → header vẫn hiện (mặc định an toàn).
//
// Cơ chế thu/thả: theo HƯỚNG cuộn (không bám từng pixel) → chỉ animate 2 lần mỗi
// thao tác, mượt. Ở gần đỉnh (offset ~0) luôn hiện lại.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useCoachMarkTarget } from '../onboarding/CoachMarkContext';
import {
  HEADER_COLORS,
  PROOFCHAT_THEME,
  TRACE_THEME,
  WORK_THEME,
  LAMPNET_THEME,
} from '../theme';

const BAR_HEIGHT = 52;          // chiều cao phần nội dung header (không tính status bar)
const DIR_THRESHOLD = 8;        // px cuộn tối thiểu để đổi trạng thái (chống rung)
const NEAR_TOP = 24;            // gần đỉnh → luôn hiện lại

// Nền header ĐỔI THEO MÀU CHỦ ĐẠO của module/tab đang mở (dùng primaryDeep của
// từng brand — đủ đậm cho chữ/icon trắng đạt WCAG AA). Tab host (Home/Account)
// hoặc route lạ → nền mặc định (xanh đậm HEADER_COLORS.bg). KHÔNG hardcode hex —
// lấy từ brand token của theme.
const ROUTE_BG: Record<string, string> = {
  ProofChatHome: PROOFCHAT_THEME.primaryDeep,
  Farms:         TRACE_THEME.primaryDeep,
  WorkHome:      WORK_THEME.primaryDeep,
  JoinHome:      LAMPNET_THEME.primaryDeep,
};

// ── Context: trạng thái hiện/ẩn + tiêu đề + handler cuộn dùng chung ──────────
interface HeaderCtx {
  progress: Animated.Value;                 // 1 = hiện, 0 = ẩn
  fullHeight: number;                        // BAR_HEIGHT + safe-area top
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  title: string | null;
  setTitle: (t: string | null) => void;
  show: () => void;
}

const AppHeaderContext = React.createContext<HeaderCtx | null>(null);

export const AppHeaderProvider = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const fullHeight = BAR_HEIGHT + insets.top;
  const progress = React.useRef(new Animated.Value(1)).current;
  const shownRef = React.useRef(true);
  const lastY = React.useRef(0);
  const [title, setTitle] = React.useState<string | null>(null);

  const animate = React.useCallback(
    (toShown: boolean) => {
      if (shownRef.current === toShown) return;
      shownRef.current = toShown;
      Animated.timing(progress, {
        toValue: toShown ? 1 : 0,
        duration: 200,
        useNativeDriver: false, // animate HEIGHT (layout) → không dùng native driver
      }).start();
    },
    [progress],
  );

  const show = React.useCallback(() => animate(true), [animate]);

  const onScroll = React.useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;
      if (y <= NEAR_TOP) {
        animate(true);
        return;
      }
      if (dy > DIR_THRESHOLD) animate(false);      // cuộn xuống → ẩn
      else if (dy < -DIR_THRESHOLD) animate(true); // cuộn lên → hiện
    },
    [animate],
  );

  const value = React.useMemo<HeaderCtx>(
    () => ({ progress, fullHeight, onScroll, title, setTitle, show }),
    [progress, fullHeight, onScroll, title, show],
  );

  return <AppHeaderContext.Provider value={value}>{children}</AppHeaderContext.Provider>;
};

// Hook cho màn hình: gắn onScroll để header tự thu khi cuộn. Trả kèm
// scrollEventThrottle chuẩn. Có `setTitle` để đặt tiêu đề riêng cho màn.
export function useCollapsibleHeader() {
  const ctx = React.useContext(AppHeaderContext);
  return {
    onScroll: ctx?.onScroll,
    scrollEventThrottle: 16,
    setTitle: ctx?.setTitle ?? (() => {}),
    showHeader: ctx?.show ?? (() => {}),
  };
}

// ── Header thật (đặt Ở TRÊN khối tab, trong ProtectedMain) ──────────────────
const AppHeader = () => {
  const ctx = React.useContext(AppHeaderContext);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useSelector((s: RootState) => s.user.currentUser);
  // Target luồng hướng dẫn: nút chuông thông báo.
  const bellTarget = useCoachMarkTarget('header.bell');

  // Tên tab đang mở (nằm trong navigator Main) → chọn màu nền theo module.
  const activeTabName = useNavigationState((state: any) => {
    const main = state?.routes?.find((r: any) => r.name === 'Main');
    const tab = main?.state;
    if (tab && typeof tab.index === 'number') return tab.routes?.[tab.index]?.name;
    return undefined;
  });
  const bg = (activeTabName && ROUTE_BG[activeTabName]) || HEADER_COLORS.bg;

  // ĐỔI TAB → luôn HIỆN LẠI header. Trạng thái thu/thả (progress) DÙNG CHUNG cho
  // mọi tab; nếu ở Trang chủ cuộn xuống làm header ẩn rồi chuyển sang màn KHÔNG
  // gắn onScroll (vd Tài khoản), header sẽ kẹt ẩn. Reset khi tab đổi để header
  // hiển thị đầy đủ trên MỌI màn (gồm Tài khoản).
  React.useEffect(() => {
    ctx?.show();
  }, [activeTabName, ctx]);

  if (!ctx) return null;

  const fullHeight = BAR_HEIGHT + insets.top;
  const height = ctx.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, fullHeight],
  });

  // Tên thương hiệu = "Aladin" (mặc định); màn có thể override qua ctx.setTitle.
  const title = ctx.title ?? 'Aladin';
  const greeting = `Xin chào ${user?.name ?? 'bạn'}`;

  return (
    <Animated.View style={[styles.wrap, { height, paddingTop: insets.top, backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />
      <Animated.View style={[styles.row, { opacity: ctx.progress }]}>
        {/* Trái: thương hiệu + lời chào (sub) */}
        <View style={styles.brandWrap}>
          <View style={styles.logoDot}>
            <Image source={require('../../assets/images/logo.png')} style={{ width: 30, height: 30, borderRadius: 9 }} />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {greeting}
            </Text>
          </View>
        </View>

        {/* Phải: QUÉT TRUY XUẤT (toàn cục — soi nguồn gốc mọi sản phẩm, §3) +
            THÔNG BÁO + TÀI KHOẢN */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            accessibilityLabel="Quét truy xuất"
            onPress={() => navigation.navigate('TraceScan')}
          >
            <Icon name="qrcode-scan" size={22} color={HEADER_COLORS.onBg} />
          </TouchableOpacity>

          <TouchableOpacity
            ref={bellTarget.ref}
            style={styles.iconBtn}
            activeOpacity={0.7}
            accessibilityLabel="Thông báo"
            onPress={() => navigation.navigate('Notifications')}
          >
            <Icon name="bell-outline" size={23} color={HEADER_COLORS.onBg} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarBtn}
            activeOpacity={0.7}
            accessibilityLabel="Tài khoản"
            // Tài khoản là TAB LỒNG trong navigator 'Main'. Header dùng nav của
            // root stack nên phải điều hướng LỒNG (navigate('Main',{screen})),
            // navigate('Account') trống sẽ KHÔNG chuyển được tab lồng.
            onPress={() => navigation.navigate('Main', { screen: 'Account' })}
          >
            <Icon name="account" size={20} color={HEADER_COLORS.onBg} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: HEADER_COLORS.bg,
    overflow: 'hidden',
    // Đổ bóng nhẹ dưới đáy header cho tách lớp.
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      default: {},
    }),
    zIndex: 10,
  },
  row: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandText: { flexShrink: 1 },
  logoDot: {
    borderRadius: 9,
    padding: 2,
    backgroundColor: HEADER_COLORS.onBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: HEADER_COLORS.onBg, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: HEADER_COLORS.onBgSub, fontSize: 12, fontWeight: '500', marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginLeft: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppHeader;
