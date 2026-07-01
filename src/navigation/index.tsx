// navigation/index.tsx
//
// YC-3: nav CONFIG-DRIVEN. MainTabs + Stack KHÔNG còn liệt kê tay screen module;
// chúng DUYỆT MODULE_REGISTRY + DEFAULT_INSTANCE (config/instance.config) để dựng.
// Host shell (Login/Activation/Onboarding/Account/Home/Biometric/auth flow + các
// màn host khác) GIỮ import tĩnh ở đây — KHÔNG thuộc module.
//
// HÀNH VI GIỮ NGUYÊN (parity Aladin): auth gate, onboarding gate,
// syncService.start/drainNow, NetInfo, AssistantBubble, refreshWallet, Toast,
// linking deep-link. Module screens nạp qua registry (compile-sẵn, INV-SEC —
// KHÔNG dynamic import/eval).

import * as React from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { store, RootState } from '../store';
import { refreshWallet, resolveNetwork, refreshControllerPkh } from '../store/userSlice';
import { initPush } from '../services/pushHandler';
import Toast from 'react-native-toast-message';
import NetInfo from '@react-native-community/netinfo';
import { handleNavigationStateChange } from '../services/analytics';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../theme';
import { syncService } from '../services/syncService';

// --- Host shell screens (KHÔNG thuộc module — vỏ giữ tĩnh) ------------------
import LoginScreen from '../screens/LoginScreen';
import ActivationScreen from '../screens/ActivationScreen';
import HomeScreen from '../screens/HomeScreen';
import SignUpBiometricScreen from '../features/auth/screens/SignUpBiometricScreen';
import SignUpCompleteScreen from '../features/auth/screens/SignUpCompleteScreen';
import AccountScreen from '../screens/AccountScreen';
import BiometricSettings from '../screens/BiometricSettings';
import SurfaceTestCaptureScreen from '../screens/SurfaceTestCaptureScreen';
import OnboardingWizard from '../screens/OnboardingWizard';
// Host-level capture/identity screens (dùng chung nhiều luồng, chưa thuộc module nào)
import FruitListScreen from '../screens/FruitListScreen';
import FruitCropperScreen from '../screens/FruitCropperScreen';
import TreeMap2DScreen from '../screens/TreeMap2DScreen';
import FarmMap2DScreen from '../screens/FarmMap2DScreen';
import TreeIdentityScreen from '../screens/TreeIdentityScreen';
import TreeEnrollScreen from '../screens/TreeEnrollScreen';
import TreeManagementScreen from '../screens/TreeManagementScreen';
import AnimalIdentityScreen from '../screens/AnimalIdentityScreen';
import AnimalEnrollScreen from '../screens/AnimalEnrollScreen';
import AnimalManagementScreen from '../screens/AnimalManagementScreen';
import AnimalDetailScreen from '../screens/AnimalDetailScreen';
import TreeViewer3DScreen from '../screens/TreeViewer3DScreen';
import CareScanScreen from '../screens/CareScanScreen';
import SeedExportScreen from '../screens/SeedExportScreen';
import RestoreIdentityScreen from '../screens/RestoreIdentityScreen';
import PhoenixWalletScreen from '../screens/PhoenixWalletScreen';
import WebLoginScanScreen from '../screens/WebLoginScanScreen';
import ExportIdentityScreen from '../screens/ExportIdentityScreen';
import UsernameScreen from '../screens/UsernameScreen';
// ProofChat wallet/escrow: hiện vẫn đăng ký ở host stack (chưa khai trong manifest
// proofchat — anh Aladin chốt chat KHÔNG ví/escrow; giữ route để không vỡ màn cũ).
import ProofChatWalletScreen from '../modules/proofchat/features/wallet/screens/WalletScreen';
import ProofChatEscrowScreen from '../modules/proofchat/features/escrow/screens/EscrowScreen';
// Wrapper Native gọi FarmDetail trực tiếp (giữ nguyên hành vi cũ).
import FarmDetailScreen from '../modules/trace/screens/FarmDetailScreen';

import { shouldShowOnboarding } from '../utils/onboardingStorage';
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import AssistantBubble from '../components/AssistantBubble';
import { AppRegistry } from 'react-native';

// --- Registry config-driven -------------------------------------------------
import {
  collectModuleScreens,
  getModuleEntrypoint,
  assertRouteParity,
} from './registry';
import { DEFAULT_INSTANCE } from '../config/instance.config';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Đối chiếu DEV: bắt lệch route ↔ component sớm (no-op nếu parity sạch).
if (__DEV__) {
  assertRouteParity();
}

// --- Host tab screens: route -> component cho các tab kind:'host' ----------
// Component lấy theo route name; instance.config chỉ tham chiếu route, không
// nhúng component (giữ config thuần giá trị).
const HOST_TAB_SCREENS: Record<string, React.ComponentType<any>> = {
  Home: HomeScreen,
  Account: AccountScreen,
};
// Nhãn tab theo route — GIỮ NGUYÊN parity Aladin. Cho cả host lẫn module:
// label tab có thể khác displayName module (vd module 'trace' tên "Truy xuất"
// nhưng tab Aladin hiển thị "Trang trại"). Đây là quyết định của INSTANCE
// (experience layer), nên ở tầng nav — không nhét vào manifest module.
const TAB_TITLES: Record<string, string> = {
  Home: 'Trang chủ',
  ProofChatHome: 'Tin nhắn',
  Farms: 'Trang trại',
  WorkHome: 'Việc làm',
  Account: 'Tài khoản',
};

// Icon cho từng tab theo route name (giữ nguyên ánh xạ icon cũ của Aladin).
const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  ProofChatHome: 'chat-processing',
  Farms: 'sprout',
  WorkHome: 'briefcase',
  Account: 'account-circle',
};

// 1. Component bọc riêng cho việc gọi FarmDetail từ Native (giữ nguyên).
const NativeFarmDetailWrapper = (props: any) => {
  return (
    <Provider store={store}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="FarmDetail"
            component={FarmDetailScreen}
            initialParams={props}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

AppRegistry.registerComponent('FarmDetailScreen', () => NativeFarmDetailWrapper);

// --- Dựng danh sách tab từ instance.config + registry ----------------------
// Mỗi tab: route name + component + title + icon. Host tab lấy từ HOST_TAB_*;
// module tab lấy entrypoint qua registry.
interface BuiltTab {
  route: string;
  component: React.ComponentType<any>;
  title: string;
  icon: string;
}

function buildTabs(): BuiltTab[] {
  const built: BuiltTab[] = [];
  DEFAULT_INSTANCE.tabs.forEach((tab) => {
    if (tab.kind === 'host') {
      const component = HOST_TAB_SCREENS[tab.route];
      if (!component) {
        console.warn(`[nav] host tab '${tab.route}' không có component — bỏ qua.`);
        return;
      }
      built.push({
        route: tab.route,
        component,
        title: TAB_TITLES[tab.route] ?? tab.route,
        icon: TAB_ICONS[tab.route] ?? 'view-dashboard-outline',
      });
    } else {
      // Tab module: chỉ dựng nếu module đó được BẬT (an toàn — tránh tab mồ côi).
      if (!DEFAULT_INSTANCE.enabledModules.includes(tab.moduleId)) {
        console.warn(`[nav] tab module '${tab.moduleId}' không nằm trong enabledModules — bỏ qua.`);
        return;
      }
      const ep = getModuleEntrypoint(tab.moduleId);
      if (!ep) return;
      built.push({
        route: ep.route,
        component: ep.component,
        // Nhãn tab ưu tiên override instance (parity Aladin); fallback displayName module.
        title: TAB_TITLES[ep.route] ?? ep.title,
        icon: TAB_ICONS[ep.route] ?? ep.icon,
      });
    }
  });
  return built;
}

const INSTANCE_TABS = buildTabs();

// ── Custom curved tab bar (thuần React Native, KHÔNG dùng native module) ──────
// Navbar màu xanh đậm (như HeroBar), góc trên bo mềm, KHUYẾT TRÒN TRONG SUỐT ở
// giữa. Khuyết được tạo bằng một hình tròn nền trong suốt + boxShadow spread:
// bóng (màu xanh) lấp đầy toàn thanh, riêng vùng hình tròn để trống → nhìn xuyên
// thấy nội dung phía sau. Overflow hidden cắt nửa trên hình tròn thành khuyết ở
// mép thanh. Nút Home tròn nổi bật, tách rời, không viền.
//
// Thanh là position:absolute (nổi trên nội dung) — màn hình dùng nó PHẢI chừa
// padding dưới = TAB_BAR_HEIGHT + insets.bottom + FLOAT để không bị che (xem
// HomeScreen). Đây là cách xử iOS "navbar che nội dung dưới".
const NAV_BG = COLORS.accentDeep;            // #264E7E — xanh đậm như herobar
const TAB_BAR_HEIGHT = 64;                   // chiều cao phần thanh điều hướng
const HOME_BTN_SIZE = 66;                    // đường kính nút Home
const NOTCH_D = HOME_BTN_SIZE + 20;          // đường kính khuyết (rộng hơn nút → có khe trong suốt bao quanh)
const FLOAT = NOTCH_D / 2;                   // phần nhô lên trên mép thanh
const CORNER_R = 26;                         // bo góc trên navbar

// Icon cho từng tab (filled khi active, outline khi inactive) + nhãn hiển thị.
const TAB_META: Record<string, { icon: string; iconActive: string; label: string }> = {
  ProofChatHome: { icon: 'chat-processing-outline', iconActive: 'chat-processing', label: 'Tin nhắn' },
  Farms: { icon: 'sprout-outline', iconActive: 'sprout', label: 'Trang trại' },
  WorkHome: { icon: 'briefcase-outline', iconActive: 'briefcase', label: 'Việc làm' },
  Account: { icon: 'account-circle-outline', iconActive: 'account-circle', label: 'Tài khoản' },
};

const CurvedTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cx = width / 2;
  const barHeight = TAB_BAR_HEIGHT + insets.bottom;
  const containerHeight = barHeight + FLOAT;

  const homeIndex = state.routes.findIndex((r) => r.name === 'Home');

  const handlePress = (routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={[curvedStyles.tabBarContainer, { height: containerHeight }]} pointerEvents="box-none">
      {/* Lớp thanh: overflow hidden để bo góc trên + cắt khuyết tròn ở mép trên */}
      <View
        pointerEvents="none"
        style={[curvedStyles.barClip, { top: FLOAT, height: barHeight }]}
      >
        {/* Hình tròn trong suốt; boxShadow spread màu xanh lấp đầy quanh nó →
            vùng tròn còn lại trong suốt = khuyết nhìn xuyên thấy phía sau */}
        <View style={[curvedStyles.notchHole, { left: cx - NOTCH_D / 2 }]} />
      </View>

      {/* Hàng tab — Home là ô trống ở giữa để giữ cân đối 2 bên */}
      <View style={curvedStyles.tabRow}>
        {state.routes.map((route, index) => {
          if (route.name === 'Home') {
            return <View key={route.key} style={curvedStyles.homeSlot} />;
          }
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const isFocused = state.index === index;
          const tint = isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.55)';
          return (
            <TouchableOpacity
              key={route.key}
              style={curvedStyles.tabItem}
              activeOpacity={0.7}
              onPress={() => handlePress(route.name, route.key, isFocused)}
            >
              <Icon name={isFocused ? meta.iconActive : meta.icon} size={24} color={tint} />
              <Text
                style={[curvedStyles.tabLabel, { color: tint, fontWeight: isFocused ? '700' : '500' }]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Nút Home tròn nổi bật, tách rời, nằm lọt vào khuyết giữa (không viền) */}
      {homeIndex >= 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handlePress('Home', state.routes[homeIndex].key, state.index === homeIndex)}
          style={[curvedStyles.homeButton, { left: cx - HOME_BTN_SIZE / 2 }]}
        >
          <Icon name="home" size={30} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const curvedStyles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  barClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: CORNER_R,
    borderTopRightRadius: CORNER_R,
  },
  notchHole: {
    position: 'absolute',
    top: -NOTCH_D / 2,
    width: NOTCH_D,
    height: NOTCH_D,
    borderRadius: NOTCH_D / 2,
    backgroundColor: 'transparent',
    // Bóng lan rộng (spread) phủ kín cả thanh bằng màu xanh, chừa lại vùng tròn
    boxShadow: `0px 0px 0px 2000px ${NAV_BG}`,
  },
  tabRow: {
    position: 'absolute',
    top: FLOAT,
    left: 0,
    right: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  homeSlot: {
    flex: 1,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.2,
  },
  homeButton: {
    position: 'absolute',
    top: FLOAT - HOME_BTN_SIZE / 2,
    width: HOME_BTN_SIZE,
    height: HOME_BTN_SIZE,
    borderRadius: HOME_BTN_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.accentLight,
    backgroundColor: COLORS.info,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accentDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 14,
  },
});

const MainTabs = () => (
  <Tab.Navigator
    initialRouteName={DEFAULT_INSTANCE.initialTabRoute}
    screenOptions={{ headerShown: false }}
    tabBar={(props) => <CurvedTabBar {...props} />}
  >
    {INSTANCE_TABS.map((t) => (
      <Tab.Screen
        key={t.route}
        name={t.route}
        component={t.component}
        options={{ title: t.title }}
      />
    ))}
  </Tab.Navigator>
);

const ProtectedMain = () => {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch<any>();
  const user = useSelector((state: RootState) => state.user.currentUser);

  React.useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [navigation, user]);

  // Ví THẬT: lấy số dư on-chain + mạng Cardano theo DID ngay khi vào khu đã-đăng-nhập (không bịa số)
  React.useEffect(() => {
    const did = user?.did || user?.id;
    if (did) {
      dispatch(refreshWallet(did));
      dispatch(resolveNetwork(did));
      dispatch(refreshControllerPkh(did));
      // Push FCM/APNs: đăng ký token với backend (devices.register cần Bearer →
      // gọi SAU đăng nhập). An toàn nếu build chưa có messaging (no-op).
      initPush();
    }
  }, [dispatch, user]);

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return <MainTabs />;
};

// --- Host-level stack screens (KHÔNG thuộc module) -------------------------
// Đăng ký tĩnh; giữ nguyên route name + options cũ.
const HOST_STACK_SCREENS: Array<{
  name: string;
  component: React.ComponentType<any>;
  options?: object;
}> = [
  { name: 'Onboarding', component: OnboardingWizard, options: { headerShown: false } },
  { name: 'Login', component: LoginScreen, options: { headerShown: false } },
  { name: 'Activation', component: ActivationScreen },
  { name: 'BiometricSettings', component: BiometricSettings },
  { name: 'SurfaceTestCapture', component: SurfaceTestCaptureScreen, options: { headerShown: false } },
  { name: 'Main', component: ProtectedMain, options: { headerShown: false } },
  // ProofChat ví/escrow — chưa khai manifest, giữ ở host stack.
  { name: 'ProofChatWallet', component: ProofChatWalletScreen, options: { headerShown: false } },
  { name: 'ProofChatEscrow', component: ProofChatEscrowScreen, options: { headerShown: false } },
  // Auth flow.
  { name: 'SignUpBiometric', component: SignUpBiometricScreen, options: { headerShown: false } },
  { name: 'SignUpComplete', component: SignUpCompleteScreen, options: { headerShown: false, gestureEnabled: false } },
  // Capture/identity screens dùng chung (host-level).
  { name: 'FruitList', component: FruitListScreen, options: { headerShown: false } },
  { name: 'FruitCropper', component: FruitCropperScreen, options: { headerShown: false } },
  { name: 'TreeMap2D', component: TreeMap2DScreen, options: { headerShown: false } },
  { name: 'FarmMap2D', component: FarmMap2DScreen, options: { headerShown: false } },
  { name: 'TreeIdentity', component: TreeIdentityScreen, options: { headerShown: false } },
  { name: 'TreeEnroll', component: TreeEnrollScreen, options: { headerShown: false } },
  { name: 'TreeManagement', component: TreeManagementScreen, options: { headerShown: false } },
  { name: 'AnimalIdentity', component: AnimalIdentityScreen, options: { headerShown: false } },
  { name: 'AnimalEnroll', component: AnimalEnrollScreen, options: { headerShown: false } },
  { name: 'AnimalManagement', component: AnimalManagementScreen, options: { headerShown: false } },
  { name: 'AnimalDetail', component: AnimalDetailScreen, options: { headerShown: false } },
  { name: 'TreeViewer3D', component: TreeViewer3DScreen, options: { headerShown: false } },
  { name: 'CareScan', component: CareScanScreen, options: { headerShown: false } },
  // PhoenixKey Enclave — sao lưu/khôi phục bằng cụm 24 từ (BIP39 / Master_KEK).
  { name: 'SeedExport', component: SeedExportScreen, options: { headerShown: false } },
  { name: 'RestoreIdentity', component: RestoreIdentityScreen, options: { headerShown: false } },
  { name: 'PhoenixWallet', component: PhoenixWalletScreen, options: { headerShown: false } },
  { name: 'WebLoginScan', component: WebLoginScanScreen, options: { headerShown: false } },
  { name: 'ExportIdentity', component: ExportIdentityScreen, options: { headerShown: false } },
  { name: 'Username', component: UsernameScreen, options: { headerShown: false } },
];

// --- Module stack screens (config-driven) ----------------------------------
// Mọi route của module BẬT đều đăng ký vào stack (tới được qua navigate/deep-link),
// kể cả route đã là tab — RN cho phép trùng tên giữa Tab và Stack vì khác navigator.
const MODULE_STACK_SCREENS = collectModuleScreens(DEFAULT_INSTANCE.enabledModules);

// --- Deep-link: magiclamp://<module>/<route> -------------------------------
// Map mỗi route module sang path 'magiclamp://<moduleId>/<route>'. Host route
// không khai (truy cập qua điều hướng nội bộ). Rẻ + declarative — bật luôn.
const buildLinking = () => {
  const screens: Record<string, string> = { Main: 'main' };
  MODULE_STACK_SCREENS.forEach(({ moduleId, route }) => {
    screens[route] = `${moduleId}/${route}`;
  });
  return {
    prefixes: ['magiclamp://'],
    config: { screens },
  };
};

const AppNavigator = () => {
  // Build 52 (2026-05-17) — first-launch onboarding gate.
  // Read AsyncStorage flag before deciding initial route so the user lands
  // on the 3-step wizard exactly once. While the read is in flight we
  // render a blank spinner — typically <50ms so it's invisible in practice.
  const [initialRoute, setInitialRoute] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Build 54 (CPO Đức 2026-05-18) — login required (biometric simplified).
    // Guest mode was considered but rejected: too much surface area for data
    // migration, privacy, and attack vectors. Biometric login is fast (~5s) and
    // already self-contained on device (see authService.loginWithBiometric).
    //
    // Reference: docs/PRINCIPLES/01-INDEPENDENT-FEATURE-OPERATION.md §3.3
    const initServices = async () => {
      // Start sync service (database will be initialized per-user on login)
      console.log('[Navigation] Initializing sync service');
      syncService.start();

      // Check onboarding status
      const show = await shouldShowOnboarding();

      // Always start from Login/Onboarding - never auto-login to Main
      // User must explicitly authenticate via biometric each session
      setInitialRoute(show ? 'Onboarding' : 'Login');
    };

    initServices();

    // Mạng phục hồi → đẩy ngay hàng đợi sync (không chờ interval 30s tiếp theo).
    let wasConnected: boolean | null = null;
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true && state.isInternetReachable !== false;
      if (isConnected && wasConnected === false) {
        console.log('[Navigation] Network restored — draining sync queue');
        syncService.drainNow().catch((err) =>
          console.warn('[Navigation] syncService.drainNow failed:', err),
        );
      }
      wasConnected = isConnected;
    });

    // Cleanup on unmount
    return () => {
      syncService.stop();
      unsubscribeNetInfo();
    };
  }, []);

  if (initialRoute === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <Provider store={store}>
      <NavigationContainer linking={buildLinking()} onStateChange={handleNavigationStateChange}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.bg },
            headerTintColor: COLORS.text,
            headerTitleStyle: { color: COLORS.text, fontWeight: '700' },
          }}
        >
          {/* Host shell screens (vỏ giữ tĩnh) */}
          {HOST_STACK_SCREENS.map((s) => (
            <Stack.Screen
              key={s.name}
              name={s.name}
              component={s.component}
              options={s.options}
            />
          ))}
          {/* Module screens nạp config-driven qua registry */}
          {MODULE_STACK_SCREENS.map(({ route, component }) => (
            <Stack.Screen
              key={route}
              name={route}
              component={component}
              options={{ headerShown: false }}
            />
          ))}
        </Stack.Navigator>
        <AssistantBubble />
        <Toast />
      </NavigationContainer>
    </Provider>
  );
};

export default AppNavigator;
