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
import OrgDidScreen from '../screens/OrgDidScreen';
import OrgMintScreen from '../screens/OrgMintScreen';
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
  Pressable,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
  Alert,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setChatbotEnabled } from '../store/chatbotSlice';
import { logoutUser } from '../store/userSlice';
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
  JoinHome: 'Kết đèn',
  Account: 'Tài khoản',
};

// Icon cho từng tab theo route name (giữ nguyên ánh xạ icon cũ của Aladin).
const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  ProofChatHome: 'chat-processing',
  Farms: 'sprout',
  WorkHome: 'briefcase',
  JoinHome: 'lightning-bolt',
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
  JoinHome: { icon: 'lightning-bolt-outline', iconActive: 'lightning-bolt', label: 'Kết đèn' },
  // 'Account' CỐ Ý không có ở đây → CurvedTabBar KHÔNG vẽ nút Tài khoản trên
  // navbar (route Account vẫn tồn tại như tab ẩn để thanh dưới hiện ở trang này).
};

// ── Toolbox cung tròn (KÉO nút chính để mở, kéo chọn, giữ 1s để đặt mặc định) ──
// Nút chính (giữa navbar) KHÔNG còn là "Home" cứng: KÉO nó ra → hiện toolbox cung
// tròn lấy nút làm tâm + làm tối màn hình + hiện hướng dẫn. Kéo tới 1 mục → THẢ để
// dùng ngay; hoặc GIỮ ~1s trên mục → đặt mục đó làm MẶC ĐỊNH (toả sóng báo hiệu),
// sau đó chỉ cần NHẤN 1 lần vào nút chính là chạy. Mục: Trang chủ · Tài khoản ·
// Bật/Tắt trợ lý · Đăng xuất. Khi kéo có đường nối TRẮNG (animation) từ tâm → mục.
//
// KIẾN TRÚC (vì sao không Modal): cử chỉ kéo phải LIÊN TỤC một mạch. Modal là cửa
// sổ Android riêng → có thể HUỶ (ACTION_CANCEL) chuỗi chạm đang chạy ở cửa sổ
// chính. Nên overlay vẽ ở GỐC app (cùng cửa sổ) qua Context: CurvedTabBar giữ
// PanResponder + tính toạ độ mục, đẩy state vào Context; HomeRadialOverlay chỉ VẼ,
// pointerEvents='none' để không cướp cử chỉ.
const RADIAL_R = 150;          // bán kính GIỮA dải cung (nơi đặt icon)
const RADIAL_RI = 118;         // bán kính TRONG của dải cung
const RADIAL_RO = 182;         // bán kính NGOÀI của dải cung
const RADIAL_ICON = 22;        // cỡ icon trong dải
const RADIAL_HITBOX = 60;      // đường kính vùng chạm mỗi mục (chế độ dính)
const RADIAL_SPREAD = 156;     // tổng góc mở của cung (độ)
const OPEN_DRAG = 14;          // kéo quá ngưỡng này (px) thì mở toolbox
const DWELL_MS = 1000;         // giữ trên 1 mục bao lâu thì đặt làm mặc định
const TAP_WINDOW = 300;        // cửa sổ gom nhiều lần chạm (phân biệt 1 vs 3 tap)
const CONNECTOR_H = 3;         // độ dày đường nối trắng
const CONNECTOR_DOT = 14;      // đường kính chấm tròn 2 đầu đường nối
const DEFAULT_STORAGE_KEY = 'home_hub_default_v1';

const RADIAL_KEYS = [
  'tree', 'fruit', 'animal', 'farm', 'home', 'account', 'assistant', 'logout',
] as const;
type RadialKey = (typeof RADIAL_KEYS)[number];

// Điểm trên cực (góc đo từ trục ĐỨNG, dương = sang phải; màn hình y hướng xuống).
const polarPt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
};
const RADIAL_BAND = RADIAL_RO - RADIAL_RI; // độ dày dải cung

interface RadialItem {
  key: RadialKey;
  icon: string;
  label: string;
  tint: string;   // màu nền khi được chọn
  x: number;      // toạ độ tâm mục (màn hình tuyệt đối)
  y: number;
}
interface RadialMenuState {
  center: { x: number; y: number };
  items: RadialItem[];
  active: number;                    // -1 = chưa trúng mục nào
  finger: { x: number; y: number };  // đầu ngón (vẽ đường nối)
  assigned: number;                  // index vừa đặt mặc định (-1 nếu chưa)
  sticky: boolean;                   // true = mở bằng TAP (dính, chạm để chọn);
                                     // false = mở bằng KÉO (thả để chọn)
}
interface RippleState { x: number; y: number; nonce: number; }

const RadialMenuContext = React.createContext<{
  menu: RadialMenuState | null;
  setMenu: React.Dispatch<React.SetStateAction<RadialMenuState | null>>;
  defaultKey: RadialKey | null;
  setDefaultKey: (k: RadialKey | null) => void;
  ripple: RippleState | null;
  setRipple: React.Dispatch<React.SetStateAction<RippleState | null>>;
  // Runner hành động (do CurvedTabBar gán) để overlay chạy khi CHẠM mục ở chế độ dính.
  actionRef: React.MutableRefObject<(key: RadialKey) => void>;
} | null>(null);

const RadialMenuProvider = ({ children }: { children: React.ReactNode }) => {
  const [menu, setMenu] = React.useState<RadialMenuState | null>(null);
  const [defaultKey, setDefaultKeyState] = React.useState<RadialKey | null>(null);
  const [ripple, setRipple] = React.useState<RippleState | null>(null);
  const actionRef = React.useRef<(key: RadialKey) => void>(() => {});

  // Khôi phục lựa chọn mặc định giữa các phiên.
  React.useEffect(() => {
    AsyncStorage.getItem(DEFAULT_STORAGE_KEY)
      .then((v) => {
        if (v && (RADIAL_KEYS as readonly string[]).includes(v)) {
          setDefaultKeyState(v as RadialKey);
        }
      })
      .catch(() => {});
  }, []);

  const setDefaultKey = React.useCallback((k: RadialKey | null) => {
    setDefaultKeyState(k);
    AsyncStorage.setItem(DEFAULT_STORAGE_KEY, k ?? '').catch(() => {});
  }, []);

  return (
    <RadialMenuContext.Provider value={{ menu, setMenu, defaultKey, setDefaultKey, ripple, setRipple, actionRef }}>
      {children}
    </RadialMenuContext.Provider>
  );
};

const CurvedTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const dispatch = useDispatch<any>();
  const chatbotEnabled = useSelector((s: RootState) => s.chatbot.enabled);
  const radial = React.useContext(RadialMenuContext);
  const barHeight = TAB_BAR_HEIGHT + insets.bottom;
  const containerHeight = barHeight + FLOAT;
  // Tên route đang mở — dùng để ẩn navbar ở màn Kết đèn (JoinHome).
  const focusedName = state.routes[state.index]?.name;

  const homeIndex = state.routes.findIndex((r) => r.name === 'Home');
  // Notch + nút Home nổi đúng trên Ô Home. Chỉ đếm các route CÓ HIỂN THỊ (ô Home
  // + route có TAB_META); route ẩn (vd Account — tab không vẽ nút) KHÔNG chiếm ô
  // flex nên phải loại khỏi phép tính, nếu không notch sẽ lệch.
  const visibleRoutes = state.routes.filter((r) => r.name === 'Home' || !!TAB_META[r.name]);
  const homeVisibleIndex = visibleRoutes.findIndex((r) => r.name === 'Home');
  const cx =
    homeVisibleIndex >= 0 && visibleRoutes.length > 0
      ? ((homeVisibleIndex + 0.5) / visibleRoutes.length) * width
      : width / 2;

  const handlePress = (routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  // ── Toolbox cung tròn: hình học + cử chỉ KÉO-để-mở ─────────────────────────
  const homeKey = homeIndex >= 0 ? state.routes[homeIndex].key : '';
  const homeIsFocused = state.index === homeIndex;
  const homeCenterY = windowHeight - containerHeight + FLOAT; // tâm nút chính (Y màn hình)
  const defaultKey = radial?.defaultKey ?? null;

  // Metadata từng công cụ (icon/nhãn/màu). Assistant đổi theo trạng thái bật/tắt.
  // 4 mục quickaction (Cây/Quả/Con vật/Vườn) chuyển từ HomeScreen vào đây.
  const itemMeta = React.useMemo(
    () =>
      ({
        tree: { icon: 'pine-tree', label: 'Quét cây', tint: '#2B7A39' },
        fruit: { icon: 'food-apple', label: 'Quả', tint: '#C0392B' },
        animal: { icon: 'paw', label: 'Con vật', tint: '#7D3C98' },
        farm: { icon: 'barn', label: 'Thêm vườn', tint: '#B07D2F' },
        home: { icon: 'home-variant', label: 'Trang chủ', tint: COLORS.info },
        account: { icon: 'account-circle', label: 'Tài khoản', tint: COLORS.info },
        assistant: {
          icon: chatbotEnabled ? 'robot' : 'robot-off-outline',
          label: chatbotEnabled ? 'Tắt trợ lý' : 'Bật trợ lý',
          tint: COLORS.accent,
        },
        logout: { icon: 'logout', label: 'Đăng xuất', tint: '#E5533C' },
      }) as Record<RadialKey, { icon: string; label: string; tint: string }>,
    [chatbotEnabled],
  );

  // 8 mục xếp ĐỀU & SÁT NHAU trên cung hướng LÊN (tâm = nút chính). Góc đo từ
  // trục đứng; thứ tự: quickaction bên trái → hệ thống bên phải.
  const ORDER: RadialKey[] = [
    'tree', 'fruit', 'animal', 'farm', 'home', 'account', 'assistant', 'logout',
  ];
  const radialItems = React.useMemo<RadialItem[]>(() => {
    const n = ORDER.length;
    const segW = RADIAL_SPREAD / n; // độ rộng mỗi đoạn
    return ORDER.map((key, i) => {
      // Icon ở GIỮA đoạn i.
      const deg = -RADIAL_SPREAD / 2 + (i + 0.5) * segW;
      const a = (deg * Math.PI) / 180;
      return {
        key,
        ...itemMeta[key],
        x: cx + RADIAL_R * Math.sin(a),
        y: homeCenterY - RADIAL_R * Math.cos(a),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, homeCenterY, itemMeta]);

  // Refs cho callback PanResponder (tạo 1 lần) đọc trạng thái mới nhất.
  const stateRef = React.useRef<any>({});
  stateRef.current = {
    items: radialItems, cx, homeCenterY, homeKey, homeIsFocused,
    navigation, dispatch, chatbotEnabled, defaultKey,
    setMenu: radial?.setMenu, setDefaultKey: radial?.setDefaultKey, setRipple: radial?.setRipple,
    handlePress, menuOpen: !!radial?.menu,
  };

  const runActionRef = React.useRef<(key: RadialKey) => void>(() => {});
  runActionRef.current = (key) => {
    const s = stateRef.current;
    if (key === 'home') {
      s.handlePress('Home', s.homeKey, s.homeIsFocused);
    } else if (key === 'account') {
      s.navigation.navigate('Account');
    } else if (key === 'assistant') {
      s.dispatch(setChatbotEnabled(!s.chatbotEnabled));
    } else if (key === 'logout') {
      Alert.alert('Đăng xuất', 'Đăng xuất khỏi tài khoản này?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: () => s.dispatch(logoutUser()) },
      ]);
    } else if (key === 'tree') {
      s.navigation.navigate('TreeIdentity');
    } else if (key === 'fruit') {
      s.navigation.navigate('FruitList');
    } else if (key === 'animal') {
      s.navigation.navigate('AnimalManagement', { farmId: 'default' });
    } else if (key === 'farm') {
      s.navigation.navigate('FarmDetail');
    }
  };
  // Cho overlay (chế độ dính) gọi hành động khi CHẠM mục.
  if (radial?.actionRef) radial.actionRef.current = (k: RadialKey) => runActionRef.current(k);

  const rippleNonceRef = React.useRef(0);
  const assignRef = React.useRef<(i: number) => void>(() => {});
  assignRef.current = (i) => {
    const s = stateRef.current;
    const item = s.items[i];
    if (!item) return;
    s.setDefaultKey?.(item.key);
    assignedRef.current = true;
    s.setMenu?.((m: RadialMenuState | null) => (m ? { ...m, assigned: i } : m));
    rippleNonceRef.current += 1;
    s.setRipple?.({ x: s.cx, y: s.homeCenterY, nonce: rippleNonceRef.current });
  };

  const openRef = React.useRef(false);
  const activeRef = React.useRef(-1);
  const assignedRef = React.useRef(false);
  const dwellTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = React.useRef(0);
  const tapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panRef = React.useRef<any>(null);
  if (!panRef.current) {
    const clearDwell = () => {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    };
    const openMenu = () => {
      const s = stateRef.current;
      openRef.current = true;
      activeRef.current = -1;
      assignedRef.current = false;
      s.setMenu?.({
        center: { x: s.cx, y: s.homeCenterY },
        items: s.items,
        active: -1,
        finger: { x: s.cx, y: s.homeCenterY },
        assigned: -1,
        sticky: false,
      });
    };
    // Mở toolbar kiểu DÍNH (do TAP nút menu) — ở lại, chạm mục để chọn.
    const openMenuSticky = () => {
      const s = stateRef.current;
      openRef.current = false;
      activeRef.current = -1;
      assignedRef.current = false;
      s.setMenu?.({
        center: { x: s.cx, y: s.homeCenterY },
        items: s.items,
        active: -1,
        finger: { x: s.cx, y: s.homeCenterY },
        assigned: -1,
        sticky: true,
      });
    };
    const updateActive = (fx: number, fy: number) => {
      const s = stateRef.current;
      const n = s.items.length;
      // Chọn theo GÓC: ngón nằm trong dải cung (bán kính đủ) & trong quạt góc →
      // rơi vào đoạn nào thì chọn đoạn đó (highlight cả múi).
      const dx = fx - s.cx;
      const dy = fy - s.homeCenterY;
      const radius = Math.hypot(dx, dy);
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // từ trục đứng, phải = dương
      let best = -1;
      if (radius >= RADIAL_RI - 36 && deg >= -RADIAL_SPREAD / 2 && deg <= RADIAL_SPREAD / 2) {
        const segW = RADIAL_SPREAD / n;
        best = Math.min(n - 1, Math.max(0, Math.floor((deg + RADIAL_SPREAD / 2) / segW)));
      }
      if (best !== activeRef.current) {
        activeRef.current = best;
        clearDwell();
        // Kéo và GIỮ ~1s trên 1 mục → đặt mục đó làm mặc định.
        if (best >= 0 && !assignedRef.current) {
          const idx = best;
          dwellTimerRef.current = setTimeout(() => assignRef.current(idx), DWELL_MS);
        }
      }
      s.setMenu?.((m: RadialMenuState | null) =>
        m ? { ...m, active: best, finger: { x: fx, y: fy } } : m,
      );
    };
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        openRef.current = false;
        activeRef.current = -1;
        assignedRef.current = false;
      },
      onPanResponderMove: (_evt, g) => {
        if (!openRef.current) {
          if (Math.hypot(g.dx, g.dy) > OPEN_DRAG) openMenu();
          else return;
        }
        updateActive(g.moveX, g.moveY);
      },
      onPanResponderRelease: () => {
        clearDwell();
        const s = stateRef.current;
        if (openRef.current) {
          const a = activeRef.current;
          const wasAssigned = assignedRef.current;
          openRef.current = false;
          activeRef.current = -1;
          assignedRef.current = false;
          s.setMenu?.(null);
          // Nếu vừa đặt mặc định (giữ 1s) thì KHÔNG chạy luôn; ngược lại thả trúng
          // mục nào chạy mục đó.
          if (!wasAssigned && a >= 0) {
            const item = s.items[a];
            if (item) runActionRef.current(item.key);
          }
        } else {
          // TAP (không kéo).
          const dk = s.defaultKey;
          if (!dk) {
            // NÚT MENU (chưa đặt mặc định): tap để MỞ/ĐÓNG toolbar dính — không cần kéo.
            if (s.menuOpen) s.setMenu?.(null);
            else openMenuSticky();
          } else {
            // Có mặc định: gom tap — 1 tap CHẠY mặc định, 3 tap GỠ mặc định (về nút menu).
            tapCountRef.current += 1;
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
            if (tapCountRef.current >= 3) {
              tapCountRef.current = 0;
              s.setDefaultKey?.(null); // về nút menu
              rippleNonceRef.current += 1;
              s.setRipple?.({ x: s.cx, y: s.homeCenterY, nonce: rippleNonceRef.current });
            } else {
              tapTimerRef.current = setTimeout(() => {
                const cnt = tapCountRef.current;
                tapCountRef.current = 0;
                if (cnt >= 1) runActionRef.current(dk);
              }, TAP_WINDOW);
            }
          }
        }
      },
      onPanResponderTerminate: () => {
        clearDwell();
        openRef.current = false;
        activeRef.current = -1;
        assignedRef.current = false;
        stateRef.current.setMenu?.(null);
      },
    });
  }
  React.useEffect(() => () => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  // Icon nút chính = công cụ mặc định (nếu đã đặt); chưa đặt = NÚT MENU (tap để mở).
  const mainIcon = defaultKey ? itemMeta[defaultKey].icon : 'dots-grid';

  // Ẩn HẲN navbar ở màn Kết đèn (JoinHome) — tránh navbar nổi đè nội dung.
  // (Đặt SAU mọi hook để không vi phạm rules-of-hooks.)
  if (focusedName === 'JoinHome') return null;

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

      {/* Nút chính tròn nổi bật. NHẤN 1 lần = chạy công cụ mặc định (chưa đặt →
          Trang chủ); KÉO ra = mở toolbox cung tròn rồi kéo chọn / giữ 1s để đặt
          mặc định. Icon phản ánh công cụ mặc định hiện tại. */}
      {homeIndex >= 0 && (
        <View
          {...panRef.current.panHandlers}
          style={[curvedStyles.homeButton, { left: cx - HOME_BTN_SIZE / 2 }]}
        >
          <Icon name={mainIcon} size={30} color="#FFFFFF" />
        </View>
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

// ── Overlay toolbox cung tròn (VẼ ở gốc app, full-screen, KHÔNG bị cắt) ────────
// Hiện khi đang kéo nút chính; và hiện toả-sóng ngắn khi vừa đặt mặc định (dù đã
// thả). pointerEvents='none' để KHÔNG cướp cử chỉ đang chạy trên PanResponder của
// nút chính (cùng cửa sổ → kéo liên tục mượt).
const HomeRadialOverlay = () => {
  const radial = React.useContext(RadialMenuContext);
  const { height } = useWindowDimensions();
  const menu = radial?.menu ?? null;
  const ripple = radial?.ripple ?? null;
  const sticky = !!menu?.sticky; // true = mở bằng tap (chạm để chọn); false = kéo

  // Đường nối mờ→rõ khi đổi mục; toả sóng khi đặt mặc định.
  const lineAnim = React.useRef(new Animated.Value(0)).current;
  const rippleAnim = React.useRef(new Animated.Value(0)).current;
  const [rippleCenter, setRippleCenter] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    Animated.timing(lineAnim, {
      toValue: menu ? 1 : 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!menu, lineAnim]);

  React.useEffect(() => {
    if (!ripple) return;
    setRippleCenter({ x: ripple.x, y: ripple.y });
    rippleAnim.setValue(0);
    Animated.timing(rippleAnim, { toValue: 1, duration: 640, useNativeDriver: true }).start(
      () => setRippleCenter(null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ripple?.nonce]);

  if (!menu && !rippleCenter) return null;

  // Đường nối TRẮNG: nút chính → ĐẦU NGÓN đang kéo; 2 đầu là chấm tròn trắng.
  // CHỈ ở chế độ kéo (không dính) — chế độ dính không có ngón để bám.
  let connector: React.ReactNode = null;
  if (menu && !sticky) {
    const p1 = menu.center;
    const p2 = menu.finger;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    connector = (
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: lineAnim }]}>
        {/* Thân đường nối */}
        <View
          style={[
            radialStyles.line,
            {
              left: (p1.x + p2.x) / 2 - len / 2,
              top: (p1.y + p2.y) / 2 - CONNECTOR_H / 2,
              width: len,
              transform: [{ rotate: `${ang}rad` }],
            },
          ]}
        />
        {/* Chấm đầu ở nút chính */}
        <View style={[radialStyles.dot, { left: p1.x - CONNECTOR_DOT / 2, top: p1.y - CONNECTOR_DOT / 2 }]} />
        {/* Chấm đầu ở ngón tay */}
        <View style={[radialStyles.dot, { left: p2.x - CONNECTOR_DOT / 2, top: p2.y - CONNECTOR_DOT / 2 }]} />
      </Animated.View>
    );
  }

  return (
    // Chế độ DÍNH → overlay bắt chạm (tap mục / chạm ngoài để đóng). Chế độ kéo →
    // 'none' để không cướp cử chỉ đang chạy trên PanResponder nút chính.
    <View pointerEvents={sticky ? 'auto' : 'none'} style={radialStyles.overlay}>
      {/* Nền tối: ở chế độ dính là Pressable (chạm ngoài để đóng) */}
      {menu &&
        (sticky ? (
          <Pressable style={radialStyles.scrim} onPress={() => radial?.setMenu(null)} />
        ) : (
          <View style={radialStyles.scrim} />
        ))}

      {/* Hướng dẫn ngắn gọn trên nền tối */}
      {menu && (
        <View pointerEvents="none" style={[radialStyles.guideWrap, { top: height * 0.3 }]}>
          <Text style={radialStyles.guideTitle}>
            {sticky ? 'Chạm một công cụ để dùng' : 'Kéo tới một công cụ rồi thả để dùng'}
          </Text>
          <Text style={radialStyles.guideSub}>
            {sticky
              ? 'Chạm ra ngoài để đóng · nhấn giữ 1 giây (khi kéo) để đặt mặc định'
              : 'Giữ 1 giây trên công cụ để đặt mặc định · sau đó nhấn 1 lần để dùng nhanh · Chạm 3 lần vào nút chính để gỡ mặc định'}
          </Text>
        </View>
      )}

      {/* Dải cung nền (vành bo tròn viền dày) + múi active (pill) + đường chia */}
      {menu &&
        (() => {
          const c = menu.center;
          const n = menu.items.length;
          const segW = RADIAL_SPREAD / n;
          const a0 = -RADIAL_SPREAD / 2;
          const hotIdx =
            menu.active >= 0 ? menu.active : menu.assigned >= 0 ? menu.assigned : -1;
          // Chiều dài cung của một đoạn (xấp xỉ dây cung) → chiều dài pill.
          const chord = 2 * RADIAL_R * Math.sin((segW / 2) * (Math.PI / 180));
          return (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {/* Vành nền: full-ring, phần dưới lọt ngoài màn nên nhìn như dải cung trên */}
              <View
                style={[
                  radialStyles.band,
                  { left: c.x - RADIAL_RO, top: c.y - RADIAL_RO, width: RADIAL_RO * 2, height: RADIAL_RO * 2 },
                ]}
              />
              {/* Múi đang chọn (pill bo góc, xoay theo tiếp tuyến vành) */}
              {hotIdx >= 0 &&
                (() => {
                  const it = menu.items[hotIdx];
                  const tang = Math.atan2(it.y - c.y, it.x - c.x) + Math.PI / 2;
                  const L = chord + 14;
                  return (
                    <View
                      style={[
                        radialStyles.pill,
                        {
                          left: it.x - L / 2,
                          top: it.y - (RADIAL_BAND - 8) / 2,
                          width: L,
                          height: RADIAL_BAND - 8,
                          borderRadius: (RADIAL_BAND - 8) / 2,
                          backgroundColor: it.tint,
                          transform: [{ rotate: `${tang}rad` }],
                        },
                      ]}
                    />
                  );
                })()}
              {/* Đường kẻ chia đoạn (giữa các nút) */}
              {Array.from({ length: n - 1 }, (_, k) => {
                const d = a0 + (k + 1) * segW;
                const pi = polarPt(c.x, c.y, RADIAL_RI, d);
                const po = polarPt(c.x, c.y, RADIAL_RO, d);
                const mx = (pi.x + po.x) / 2;
                const my = (pi.y + po.y) / 2;
                const rot = Math.atan2(po.y - pi.y, po.x - pi.x);
                return (
                  <View
                    key={`div-${k}`}
                    style={[
                      radialStyles.divider,
                      {
                        left: mx - RADIAL_BAND / 2,
                        top: my - 0.75,
                        width: RADIAL_BAND,
                        transform: [{ rotate: `${rot}rad` }],
                      },
                    ]}
                  />
                );
              })}
            </View>
          );
        })()}

      {connector}

      {/* Toả sóng khi đặt mặc định (từ nút chính) */}
      {rippleCenter && (
        <Animated.View
          pointerEvents="none"
          style={[
            radialStyles.ripple,
            {
              left: rippleCenter.x - 34,
              top: rippleCenter.y - 34,
              opacity: rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [
                { scale: rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 4.4] }) },
              ],
            },
          ]}
        />
      )}

      {/* Icon nằm trong dải cung (không nền tròn riêng) + nhãn khi đang chọn */}
      {menu &&
        menu.items.map((it, i) => {
          const hot = i === menu.active || i === menu.assigned;
          return (
            <View
              key={it.key}
              pointerEvents="none"
              style={[radialStyles.itemWrap, { left: it.x - 56, top: it.y - RADIAL_ICON / 2 }]}
            >
              <Icon name={it.icon} size={hot ? RADIAL_ICON + 4 : RADIAL_ICON} color="#FFFFFF" />
              {hot && (
                <Text style={[radialStyles.itemLabel, radialStyles.itemLabelActive]} numberOfLines={1}>
                  {i === menu.assigned ? '✓ Mặc định' : it.label}
                </Text>
              )}
            </View>
          );
        })}

      {/* Vùng chạm từng mục — CHỈ ở chế độ dính (tap để chọn) */}
      {menu &&
        sticky &&
        menu.items.map((it, i) => (
          <Pressable
            key={`hit-${it.key}`}
            style={{
              position: 'absolute',
              left: it.x - RADIAL_HITBOX / 2,
              top: it.y - RADIAL_HITBOX / 2,
              width: RADIAL_HITBOX,
              height: RADIAL_HITBOX,
              borderRadius: RADIAL_HITBOX / 2,
            }}
            onPressIn={() => radial?.setMenu((m) => (m ? { ...m, active: i } : m))}
            onPress={() => {
              const key = it.key;
              radial?.setMenu(null);
              radial?.actionRef.current?.(key);
            }}
          />
        ))}
    </View>
  );
};

const radialStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9, 20, 34, 0.68)' },
  band: {
    position: 'absolute',
    borderRadius: RADIAL_RO,
    borderWidth: RADIAL_BAND,
    borderColor: 'rgba(17, 17, 17, 0.67)',
    backgroundColor: 'transparent',
  },
  pill: { position: 'absolute', opacity: 0.96 },
  divider: { position: 'absolute', height: 1.5, backgroundColor: 'rgba(255, 255, 255, 0.76)' },
  guideWrap: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  guideTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  guideSub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
  },
  line: {
    position: 'absolute',
    height: CONNECTOR_H,
    backgroundColor: '#FFFFFF',
    borderRadius: CONNECTOR_H / 2,
  },
  dot: {
    position: 'absolute',
    width: CONNECTOR_DOT,
    height: CONNECTOR_DOT,
    borderRadius: CONNECTOR_DOT / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 6,
  },
  ripple: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
  },
  itemWrap: { position: 'absolute', width: 112, alignItems: 'center' },
  itemLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 3,
  },
  itemLabelActive: { color: '#FFFFFF', fontWeight: '800' },
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
  { name: 'Main', component: ProtectedMain, options: { headerShown: false } },
  // Tài khoản LÀ TAB ẩn-nút (xem instance.config + TAB_META) để navbar hiện ở
  // trang này; toolbox cung tròn mở nó qua navigate('Account') → chuyển tab.
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
  // Ví tổ chức — tạo OrgDID + mint LAMP bằng OrgDID (2 bước: mint kho → claim-release).
  { name: 'OrgDid', component: OrgDidScreen, options: { headerShown: false } },
  { name: 'OrgMint', component: OrgMintScreen, options: { headerShown: false } },
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
      <RadialMenuProvider>
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
        {/* Overlay toolbox cung tròn — render TRÊN CÙNG (sau bubble), full-screen. */}
        <HomeRadialOverlay />
        <Toast />
      </NavigationContainer>
      </RadialMenuProvider>
    </Provider>
  );
};

export default AppNavigator;
