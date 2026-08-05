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
import { ensurePhoenixSession } from '../services/phoenixSessionService';
import { ensureStandardWalletRegistered } from '../services/standardWalletService';
import { initPush } from '../services/pushHandler';
import Toast from 'react-native-toast-message';
import NetInfo from '@react-native-community/netinfo';
import { handleNavigationStateChange } from '../services/analytics';
import { Icon } from '../components/Icon';
import RootErrorBoundary from '../components/RootErrorBoundary';
import { COLORS, ACTION_COLORS } from '../theme';
import { syncService } from '../services/syncService';
import { flushVideoUploadQueue } from '../services/videoUploadQueue';
import AppHeader, { AppHeaderProvider } from '../components/AppHeader';
import { NAV_FRAME, navNational, navIcon } from './navLabels';
import { hasChosenLanguage, whenLanguageReady } from '../i18n';
import NavItemFrame from './NavItemFrame';
import { useVisibleTabs } from './useVisibleTabs';
import { NEO_CENTER, NEO_RIGHT } from './resolveVisibleTabs';
import { resolveGateItems, type GateItem } from './resolveGateItems';
import { TRACE_SCAN_ROUTE_NAME } from './traceScan';

// --- Host shell screens (KHÔNG thuộc module — vỏ giữ tĩnh) ------------------
import LoginScreen from '../screens/LoginScreen';
// Màn hỏi ngôn ngữ LẦN ĐẦU (máy vừa cài) — đứng TRƯỚC Login trong luồng khởi động.
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import ActivationScreen from '../screens/ActivationScreen';
import HomeScreen from '../screens/HomeScreen';
import SignUpBiometricScreen from '../features/auth/screens/SignUpBiometricScreen';
import SignUpCompleteScreen from '../features/auth/screens/SignUpCompleteScreen';
import AccountScreen from '../screens/AccountScreen';
import BiometricSettings from '../screens/BiometricSettings';
import NotificationScreen from '../screens/NotificationScreen';
// PhoenixKey — duyệt ký / guardian / nhật ký hoạt động.
// (Khôi phục thiết bị dùng màn có sẵn RestoreIdentityScreen — đã hoàn thiện attach.)
import SignRequestScreen from '../screens/SignRequestScreen';
import GuardianScreen from '../screens/GuardianScreen';
import ActivityLogScreen from '../screens/ActivityLogScreen';
// Host-level capture/identity screens (dùng chung nhiều luồng, chưa thuộc module nào)
import FruitListScreen from '../screens/FruitListScreen';
import FruitCropperScreen from '../screens/FruitCropperScreen';
import TreeMap2DScreen from '../screens/TreeMap2DScreen';
import FarmMap2DScreen from '../screens/FarmMap2DScreen';
// Space3D/FruitPlace3D nạp LAZY (định nghĩa gần HOST_STACK_SCREENS bên dưới) để expo
// (expo-gl → expo-modules-core) KHÔNG chạy lúc startup. Xem chú thích tại chỗ định nghĩa.
import GLErrorBoundary from '../components/GLErrorBoundary';
import TreeIdentityScreen from '../screens/TreeIdentityScreen';
import TreeEnrollScreen from '../screens/TreeEnrollScreen';
import FruitVideoScreen from '../screens/FruitVideoScreen';
import TreeVideoScreen from '../screens/TreeVideoScreen';
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
import StakingScreen from '../screens/StakingScreen';
import OrgDidScreen from '../screens/OrgDidScreen';
import OrgAuthorityScreen from '../screens/OrgAuthorityScreen';
import PoolHomeScreen from '../modules/pool/screens/PoolHomeScreen';
import OrgMintScreen from '../screens/OrgMintScreen';
import WebLoginScanScreen from '../screens/WebLoginScanScreen';
import TraceScanScreen from '../screens/TraceScanScreen';
import ExportIdentityScreen from '../screens/ExportIdentityScreen';
import UsernameScreen from '../screens/UsernameScreen';
// ProofChat wallet/escrow: hiện vẫn đăng ký ở host stack (chưa khai trong manifest
// proofchat — anh Aladin chốt chat KHÔNG ví/escrow; giữ route để không vỡ màn cũ).
import ProofChatWalletScreen from '../modules/proofchat/features/wallet/screens/WalletScreen';
import ProofChatEscrowScreen from '../modules/proofchat/features/escrow/screens/EscrowScreen';
// Wrapper Native gọi FarmDetail trực tiếp (giữ nguyên hành vi cũ).
import FarmDetailScreen from '../modules/trace/screens/FarmDetailScreen';

import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import AssistantBubble from '../components/AssistantBubble';
import { CoachMarkProvider, useCoachMarkTarget } from '../onboarding/CoachMarkContext';
import CoachMarkOverlay from '../onboarding/CoachMarkOverlay';
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
// Nhãn/icon tab DẪN XUẤT từ NAV_FRAME (navLabels.ts) — nguồn DUY NHẤT. Nhãn tab
// khác displayName module (module 'proofchat' tên "ProofChat"; nav ngắn = "Chat").
// Đây là quyết định của INSTANCE (experience layer), sống ở tầng nav — không nhét
// vào manifest. Tiêu đề đơn-dòng (header/screen title) lấy nhãn NGÔN NGỮ QUỐC GIA;
// còn thanh tab dưới vẽ song ngữ qua NavItemFrame.
const TAB_TITLES: Record<string, string> = Object.fromEntries(
  Object.keys(NAV_FRAME).map((route) => [route, navNational(route)]),
);

// Icon đơn (filled) cho tiêu đề/host — dẫn xuất từ registry.
const TAB_ICONS: Record<string, string> = Object.fromEntries(
  Object.keys(NAV_FRAME).map((route) => [route, navIcon(route, true)]),
);

// 1. Component bọc riêng cho việc gọi FarmDetail từ Native.
// PHẢI bọc RootErrorBoundary: đây là ROOT React thứ 2 (registerComponent bên dưới,
// do FarmDetailActivity Android nạp qua ReactRootView riêng). Lưới chống-trắng-màn
// ở index.js chỉ bọc root chính `aladin_mobile_fe` → root này nằm NGOÀI lưới đó;
// FarmDetailScreen (hoặc con) ném lúc render sẽ trắng câm nếu không có boundary tại đây.
const NativeFarmDetailWrapper = (props: any) => {
  return (
    <RootErrorBoundary>
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
    </RootErrorBoundary>
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
        icon: TAB_ICONS[tab.route] ?? 'table-cells-large',
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

// SG9 §2 — Route NÀO được vẽ nút, theo thứ tự nào, do `resolveVisibleTabs` quyết
// (3 NEO Chat·Home·Me + 2 slot thích ứng). Account NAY LÀ NEO HIỂN THỊ (ô "Me/Tôi"
// = avatar), không còn ẩn nút; module dôi ra (Farm/Work/Join) vào cổng xoè, KHÔNG
// biến mất. Nhãn/icon do NavItemFrame tự tra NAV_FRAME.

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
const DWELL_MS = 2000;         // giữ trên 1 mục bao lâu thì đặt làm mặc định (2s)
const LONGPRESS_MS = 300;      // giữ (không kéo) bao lâu thì xoè menu dính
const CONNECTOR_H = 3;         // độ dày đường nối trắng
const CONNECTOR_DOT = 14;      // đường kính chấm tròn 2 đầu đường nối
const DEFAULT_STORAGE_KEY = 'home_hub_default_v1';

// ── ARC MENU CON (TẦNG 2) — GIỮ 0.5s trên 1 service có SubHome → xoè arc con.
// Arc con là CUNG ĐỒNG TÂM (cùng tâm nút giữa) NẰM NGOÀI, ÔM TRỌN arc chính (bán
// kính lớn hơn) — KHÔNG phải cung nhỏ quanh mục. Đường nối trắng GHIM + GẤP KHÚC
// tại mục cha rồi kéo tiếp RA NGOÀI lên arc con.
const RADIAL_R_SUB = 212;      // bán kính GIỮA dải arc con (đồng tâm, ôm ngoài)
const RADIAL_RI_SUB = 186;     // bán kính TRONG dải arc con (sát ngoài arc chính)
const RADIAL_RO_SUB = 238;     // bán kính NGOÀI dải arc con
const SUB_ITEMS_SPREAD = 120;  // góc trải các MỤC con (co vào giữa, khỏi lọt mép)
const DWELL_SUB_MS = 500;      // GIỮ 0.5s trên mục có SubHome → mở arc con + ghim nối
const SUB_COLLAPSE_R = RADIAL_RI - 22; // kéo về GẦN tâm dưới đây → thu arc con
const PROMINENT_ICON = 34;     // cỡ icon mục NỔI BẬT (Trace) ở tầng 1
const RADIAL_BAND_SUB = RADIAL_RO_SUB - RADIAL_RI_SUB;

// Khoá mục = ActionDef.key (chuỗi ĐỘNG từ Action Registry SG4). KHÔNG cố định
// danh sách — menu suy hành động theo loại canh tác của user (reviewer §6).
type RadialKey = string;

// Điểm trên cực (góc đo từ trục ĐỨNG, dương = sang phải; màn hình y hướng xuống).
const polarPt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
};
const RADIAL_BAND = RADIAL_RO - RADIAL_RI; // độ dày dải cung

// Múi ACTIVE dạng MÚI CUNG (annular sector) — thay pill chữ nhật cũ (cạnh thẳng
// nhìn lệch với dải cong). Dựng bằng nhiều lát mỏng phủ chồng dọc theo cung, mỗi
// lát xoay theo tiếp tuyến → viền trong/ngoài ôm đúng độ cong của dải, như thể
// đoạn dải cung đó "sáng lên". KHÔNG cần react-native-svg.
//   c        : tâm cung (nút giữa)
//   centerDeg: góc TÂM của múi (độ, đo từ trục đứng — cùng hệ với polarPt)
//   spanDeg  : bề rộng góc của múi
//   rInner/rOuter: bán kính trong/ngoài (khớp dải cung)
const arcSegment = (
  c: { x: number; y: number },
  centerDeg: number,
  spanDeg: number,
  rInner: number,
  rOuter: number,
  color: string,
  keyPrefix: string,
) => {
  const thickness = rOuter - rInner;
  const rMid = (rInner + rOuter) / 2;
  // Lát đủ dày (~3°/lát) để cung mượt mà không quá nhiều View.
  const tiles = Math.max(5, Math.ceil(spanDeg / 3));
  const stepDeg = spanDeg / tiles;
  const startDeg = centerDeg - spanDeg / 2;
  // Dây cung một lát + phủ chồng 3px để không hở mạch giữa các lát.
  const tileW = 2 * rMid * Math.sin((stepDeg / 2) * (Math.PI / 180)) + 3;
  const nodes: React.ReactNode[] = [];
  for (let t = 0; t < tiles; t++) {
    const tdeg = startDeg + (t + 0.5) * stepDeg;
    const p = polarPt(c.x, c.y, rMid, tdeg);
    const tang = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2;
    const isEnd = t === 0 || t === tiles - 1;
    nodes.push(
      <View
        key={`${keyPrefix}-${t}`}
        style={{
          position: 'absolute',
          left: p.x - tileW / 2,
          top: p.y - thickness / 2,
          width: tileW,
          height: thickness,
          // Chỉ bo tròn hai lát ĐẦU/CUỐI → hai đầu múi bo tròn như pill cũ; lát
          // giữa vuông (phủ chồng nên không thấy cạnh).
          borderRadius: isEnd ? thickness / 2 : 0,
          backgroundColor: color,
          transform: [{ rotate: `${tang}rad` }],
        }}
      />,
    );
  }
  // Bọc trong 1 lớp có opacity: đặt opacity ở TỪNG lát thì vùng phủ chồng bị nhân
  // đôi alpha → sọc tối. Đặt ở lớp cha thì cả múi trong suốt đều.
  return (
    <View key={keyPrefix} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.96 }]}>
      {nodes}
    </View>
  );
};

interface RadialItem {
  key: RadialKey;
  icon: string;
  label: string;
  tint: string;   // màu nền khi được chọn
  x: number;      // toạ độ tâm mục (màn hình tuyệt đối)
  y: number;
  deg?: number;      // góc mục trên cung (từ trục đứng) — dựng arc con quanh đây
  prominent?: boolean; // mục NỔI BẬT (Trace) — vẽ to hơn, nằm giữa
  hasSub?: boolean;    // có arc con tầng-2 (service có SubHome)
}
// Mục arc con (tầng 2) = HÀNH ĐỘNG NHANH. route(+params) = đích CHẠY NGAY tính năng.
interface RadialSubItem {
  key: RadialKey;
  icon: string;
  label: string;
  tint: string;
  x: number;
  y: number;
  route: string;
  params?: Record<string, unknown>;
}
interface RadialMenuState {
  center: { x: number; y: number };
  items: RadialItem[];
  active: number;                    // -1 = chưa trúng mục nào (tầng 1)
  finger: { x: number; y: number };  // đầu ngón (vẽ đường nối)
  assigned: number;                  // index vừa đặt mặc định (-1 nếu chưa)
  sticky: boolean;                   // true = mở bằng TAP (dính, chạm để chọn);
                                     // false = mở bằng KÉO (thả để chọn)
  // ── Tầng 2 (arc con) ──
  level: 1 | 2;                      // tầng hiện tại
  parent: number;                    // index mục cha đang mở arc con (-1 nếu chưa)
  subItems: RadialSubItem[];         // mục arc con (rỗng nếu chưa mở)
  subActive: number;                 // index mục arc con đang trúng (-1)
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

  // Khôi phục lựa chọn mặc định giữa các phiên. Khoá là ActionDef.key động —
  // chấp nhận mọi chuỗi; nếu không khớp hành động hiện tại, CurvedTabBar sẽ coi
  // như chưa đặt mặc định (mainIcon fallback về Trang chủ).
  React.useEffect(() => {
    AsyncStorage.getItem(DEFAULT_STORAGE_KEY)
      .then((v) => {
        if (v) setDefaultKeyState(v);
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
  const radial = React.useContext(RadialMenuContext);
  // Target cho luồng hướng dẫn: nút Chính (giữa) + tab Tài khoản (Me).
  const centerTarget = useCoachMarkTarget('nav.center');
  const accountTarget = useCoachMarkTarget('nav.account');
  // SG9 §4 — CỔNG THỐNG NHẤT: cung xoè nút giữa = SERVICE THUẦN (đổi-app), thay
  // menu hành động SG4. Mục persona-adaptive (Farm-first / Work-first) suy từ
  // "chữ ký domain" (số cây/quả/vườn) — chỉ tính lại khi số này đổi, tránh
  // re-render navbar mỗi lần store thay đổi bất kỳ.
  const farms = useSelector((s: RootState) => s.farm.farms.length);
  const trees = useSelector((s: RootState) => s.farm.trees.length);
  const fruits = useSelector((s: RootState) => s.farm.fruits.length);
  const actions = React.useMemo<GateItem[]>(
    () => resolveGateItems({ farms, trees, fruits }),
    [farms, trees, fruits],
  );

  // SG9 §2 — thanh ĐỘNG THEO PERSONA: chỉ vẽ các ô resolver chọn (3 NEO + 2 slot),
  // theo đúng thứ tự trái→phải. Slot chỉ nhận route THỰC SỰ dựng trong instance.
  const visibleTabs = useVisibleTabs({
    isAvailable: (r) => state.routes.some((rt) => rt.name === r),
  });
  // Ô "Me/Tôi" (Account) = AVATAR user. Chưa có ảnh hồ sơ → dùng initials từ tên
  // (khớp cách tính ở AccountScreen). Nối avatarUri khi hồ sơ có ảnh (§1).
  const currentUser = useSelector((s: RootState) => s.user.currentUser);
  const meInitials = React.useMemo(
    () =>
      (currentUser?.name ?? 'U')
        .split(' ')
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    [currentUser?.name],
  );

  const barHeight = TAB_BAR_HEIGHT + insets.bottom;
  const containerHeight = barHeight + FLOAT;
  // Tên route đang mở — dùng để ẩn navbar ở màn Kết đèn (JoinHome).
  const focusedName = state.routes[state.index]?.name;

  const homeIndex = state.routes.findIndex((r) => r.name === 'Home');
  // Notch + nút Home nổi đúng trên Ô Home. cx tính theo SỐ Ô HIỂN THỊ do resolver
  // trả (§2): 3 NEO + 2 slot = 5 ô, Home ở giữa (index 2) → notch rơi đúng tâm.
  const homeVisibleIndex = visibleTabs.indexOf(NEO_CENTER);
  const cx =
    homeVisibleIndex >= 0 && visibleTabs.length > 0
      ? ((homeVisibleIndex + 0.5) / visibleTabs.length) * width
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

  // Metadata từng mục cổng (icon/nhãn/màu). Màu = brand token mỗi service (đã gán
  // trong resolveGateItems — KHÔNG hardcode hex).
  const itemMeta = React.useMemo(() => {
    const m: Record<string, { icon: string; label: string; tint: string }> = {};
    actions.forEach((a) => {
      m[a.key] = { icon: a.icon, label: a.label, tint: a.tint };
    });
    return m;
  }, [actions]);

  // Thứ tự mục = thứ tự service persona-adaptive (Home·Chat·[persona] + Trace giữa).
  // Xếp đều & sát nhau trên cung hướng LÊN (tâm = nút chính). Mỗi mục nhớ `deg`
  // (góc trên cung) để dựng arc con quanh nó; `prominent`/`hasSub` cho render + cử chỉ.
  const radialItems = React.useMemo<RadialItem[]>(() => {
    const n = actions.length;
    const segW = RADIAL_SPREAD / n; // độ rộng mỗi đoạn
    return actions.map((a, i) => {
      const deg = -RADIAL_SPREAD / 2 + (i + 0.5) * segW;
      const rad = (deg * Math.PI) / 180;
      return {
        key: a.key,
        icon: a.icon,
        label: a.label,
        tint: a.tint,
        x: cx + RADIAL_R * Math.sin(rad),
        y: homeCenterY - RADIAL_R * Math.cos(rad),
        deg,
        prominent: !!a.prominent,
        hasSub: !!(a.subActions && a.subActions.length),
      };
    });
  }, [cx, homeCenterY, actions]);

  // Meta ARC CON (tầng 2) theo index mục cha = HÀNH ĐỘNG NHANH của module đó
  // (route đích thật). Rỗng cho module không có (Home/Work/Join/Trace).
  const subMetaByIndex = React.useMemo(
    () =>
      actions.map((a) =>
        (a.subActions ?? []).map((act) => ({
          key: act.key,
          route: act.route,
          params: act.params,
          icon: act.icon,
          label: act.label,
          tint: a.tint,
        })),
      ),
    [actions],
  );

  // Dựng vị trí mục arc con: cung ĐỒNG TÂM (tâm nút giữa) bán kính lớn hơn, ÔM
  // NGOÀI arc chính. Mục con trải đều quanh trục đứng (như arc chính, radius lớn).
  const computeSubItems = React.useCallback(
    (metas: Omit<RadialSubItem, 'x' | 'y'>[]): RadialSubItem[] => {
      const n = metas.length;
      if (!n) return [];
      const seg = SUB_ITEMS_SPREAD / n;
      return metas.map((m, j) => {
        const deg = -SUB_ITEMS_SPREAD / 2 + (j + 0.5) * seg;
        const rad = (deg * Math.PI) / 180;
        return {
          ...m,
          x: cx + RADIAL_R_SUB * Math.sin(rad),
          y: homeCenterY - RADIAL_R_SUB * Math.cos(rad),
        };
      });
    },
    [cx, homeCenterY],
  );

  // Mặc định HỢP LỆ: chỉ tính là "đã đặt" khi khoá còn khớp hành động hiện tại
  // (domain có thể đã đổi → khoá cũ mồ côi). Mồ côi → coi như CHƯA đặt (tap =
  // Trang chủ).
  const effectiveDefaultKey = defaultKey && itemMeta[defaultKey] ? defaultKey : null;

  // Refs cho callback PanResponder (tạo 1 lần) đọc trạng thái mới nhất.
  const stateRef = React.useRef<any>({});
  stateRef.current = {
    items: radialItems, cx, homeCenterY, homeKey, homeIsFocused,
    navigation, defaultKey: effectiveDefaultKey, actions,
    subMetaByIndex, computeSubItems,
    setMenu: radial?.setMenu, setDefaultKey: radial?.setDefaultKey, setRipple: radial?.setRipple,
    handlePress, menuOpen: !!radial?.menu,
  };

  const runActionRef = React.useRef<(key: RadialKey) => void>(() => {});
  runActionRef.current = (key) => {
    const s = stateRef.current;
    const item: GateItem | undefined = s.actions.find((a: GateItem) => a.key === key);
    if (!item) return;
    // Đổi-app: điều hướng tới route service của cổng (tab route đã đăng ký).
    s.navigation.navigate(item.route as never, item.params as never);
  };
  // Chạy HÀNH ĐỘNG NHANH ở arc con (tầng 2): điều hướng THẲNG route đích + params
  // → CHẠY NGAY tính năng (quét cây, mở ví…), KHÔNG mở lại màn module.
  const runSubRef = React.useRef<(route: string, params?: Record<string, unknown>) => void>(() => {});
  runSubRef.current = (route, params) => {
    stateRef.current.navigation.navigate(route as never, params as never);
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
  // Tầng hiện tại + mục cha đang mở arc con + mục con đang trúng.
  const levelRef = React.useRef<1 | 2>(1);
  const parentRef = React.useRef(-1);
  const subActiveRef = React.useRef(-1);
  const dwellTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // GIỮ (không kéo) → xoè menu dính. stickyOpenedRef đánh dấu lần THẢ ngay sau đó
  // là no-op (menu ở lại để chạm chọn), không tính là 1 cú tap.
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickyOpenedRef = React.useRef(false);
  // GIỮ 0.5s trên service có SubHome → mở arc con.
  const subOpenTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panRef = React.useRef<any>(null);
  if (!panRef.current) {
    const clearDwell = () => {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    };
    const clearSubOpen = () => {
      if (subOpenTimerRef.current) { clearTimeout(subOpenTimerRef.current); subOpenTimerRef.current = null; }
    };
    const clearLongPress = () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    };
    const resetLevels = () => {
      levelRef.current = 1;
      parentRef.current = -1;
      subActiveRef.current = -1;
    };
    const openMenu = () => {
      const s = stateRef.current;
      openRef.current = true;
      activeRef.current = -1;
      assignedRef.current = false;
      resetLevels();
      s.setMenu?.({
        center: { x: s.cx, y: s.homeCenterY },
        items: s.items,
        active: -1,
        finger: { x: s.cx, y: s.homeCenterY },
        assigned: -1,
        sticky: false,
        level: 1,
        parent: -1,
        subItems: [],
        subActive: -1,
      });
    };
    // Mở toolbar kiểu DÍNH (do TAP nút menu) — ở lại, chạm mục để chọn. Tầng-2
    // CHỈ áp dụng cho cử chỉ KÉO; chế độ dính giữ 1 tầng (đơn giản, dễ chạm).
    const openMenuSticky = () => {
      const s = stateRef.current;
      openRef.current = false;
      activeRef.current = -1;
      assignedRef.current = false;
      resetLevels();
      s.setMenu?.({
        center: { x: s.cx, y: s.homeCenterY },
        items: s.items,
        active: -1,
        finger: { x: s.cx, y: s.homeCenterY },
        assigned: -1,
        sticky: true,
        level: 1,
        parent: -1,
        subItems: [],
        subActive: -1,
      });
    };
    // Chọn mục tầng-1 theo GÓC quanh TÂM (nút chính).
    const pickLevel1 = (fx: number, fy: number, n: number) => {
      const dx = fx - stateRef.current.cx;
      const dy = fy - stateRef.current.homeCenterY;
      const radius = Math.hypot(dx, dy);
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      let best = -1;
      if (radius >= RADIAL_RI - 36 && deg >= -RADIAL_SPREAD / 2 && deg <= RADIAL_SPREAD / 2) {
        const segW = RADIAL_SPREAD / n;
        best = Math.min(n - 1, Math.max(0, Math.floor((deg + RADIAL_SPREAD / 2) / segW)));
      }
      return { best, radius };
    };
    // Chọn mục tầng-2: cung ĐỒNG TÂM (quanh nút giữa) bán kính lớn hơn.
    const pickLevel2 = (fx: number, fy: number, n: number) => {
      const dx = fx - stateRef.current.cx;
      const dy = fy - stateRef.current.homeCenterY;
      const radius = Math.hypot(dx, dy);
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      let best = -1;
      if (radius >= RADIAL_RI_SUB - 30 && deg >= -SUB_ITEMS_SPREAD / 2 && deg <= SUB_ITEMS_SPREAD / 2) {
        const seg = SUB_ITEMS_SPREAD / n;
        best = Math.min(n - 1, Math.max(0, Math.floor((deg + SUB_ITEMS_SPREAD / 2) / seg)));
      }
      return best;
    };
    // Mở arc con cho mục cha idx (do GIỮ 0.5s) — ghim đường nối gấp khúc tại mục.
    const openSub = (idx: number) => {
      const s = stateRef.current;
      const item: RadialItem | undefined = s.items[idx];
      const metas = s.subMetaByIndex?.[idx] ?? [];
      if (!item || metas.length === 0) return;
      const subItems = s.computeSubItems(metas);
      levelRef.current = 2;
      parentRef.current = idx;
      subActiveRef.current = -1;
      activeRef.current = idx;
      clearDwell();
      s.setMenu?.((m: RadialMenuState | null) =>
        m ? { ...m, active: idx, level: 2, parent: idx, subItems, subActive: -1 } : m,
      );
    };
    const updateActive = (fx: number, fy: number) => {
      const s = stateRef.current;
      const items: RadialItem[] = s.items;
      const n = items.length;

      // ── ĐANG Ở TẦNG 2: chọn mục con; kéo về GẦN TÂM → thu về tầng 1 ──
      if (levelRef.current === 2) {
        const p = parentRef.current;
        const parent = items[p];
        const metas = s.subMetaByIndex?.[p] ?? [];
        const distCenter = Math.hypot(fx - s.cx, fy - s.homeCenterY);
        if (!parent || metas.length === 0 || distCenter < SUB_COLLAPSE_R) {
          // Thu về tầng 1 (bỏ ghim). Move kế tiếp sẽ tự chọn lại mục tầng 1.
          levelRef.current = 1;
          subActiveRef.current = -1;
          activeRef.current = -1;
          clearDwell();
          clearSubOpen();
          s.setMenu?.((m: RadialMenuState | null) =>
            m ? { ...m, active: -1, level: 1, parent: -1, subItems: [], subActive: -1, finger: { x: fx, y: fy } } : m,
          );
          return;
        }
        const subBest = pickLevel2(fx, fy, metas.length);
        if (subBest !== subActiveRef.current) subActiveRef.current = subBest;
        s.setMenu?.((m: RadialMenuState | null) =>
          m ? { ...m, subActive: subBest, finger: { x: fx, y: fy } } : m,
        );
        return;
      }

      // ── ĐANG Ở TẦNG 1 ──
      const { best } = pickLevel1(fx, fy, n);
      const item = best >= 0 ? items[best] : null;

      if (best !== activeRef.current) {
        activeRef.current = best;
        clearDwell();
        clearSubOpen();
        if (item && item.hasSub) {
          // GIỮ 0.5s trên service có SubHome → mở arc con (ghim + gấp khúc).
          const idx = best;
          subOpenTimerRef.current = setTimeout(() => openSub(idx), DWELL_SUB_MS);
        } else if (best >= 0 && !assignedRef.current) {
          // Mục KHÔNG có SubHome: GIỮ 2s → đặt làm mặc định.
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
        stickyOpenedRef.current = false;
        levelRef.current = 1;
        parentRef.current = -1;
        subActiveRef.current = -1;
        // GIỮ (không kéo) ~300ms → xoè menu dính (cho người không quen thao tác kéo).
        clearLongPress();
        longPressTimerRef.current = setTimeout(() => {
          if (!openRef.current) {
            stickyOpenedRef.current = true;
            openMenuSticky();
          }
        }, LONGPRESS_MS);
      },
      onPanResponderMove: (_evt, g) => {
        if (stickyOpenedRef.current) return; // đã mở dính bằng giữ → bỏ qua kéo
        if (!openRef.current) {
          if (Math.hypot(g.dx, g.dy) > OPEN_DRAG) { clearLongPress(); openMenu(); }
          else return;
        }
        updateActive(g.moveX, g.moveY);
      },
      onPanResponderRelease: () => {
        clearDwell();
        clearLongPress();
        clearSubOpen();
        const s = stateRef.current;
        if (openRef.current) {
          // KÉO thả:
          //  - Tầng 2: thả trúng HÀNH ĐỘNG NHANH → chạy ngay tính năng. Thả KHÔNG
          //    trúng mục con (đã mở arc con nhưng chưa chọn) → HUỶ, KHÔNG mở màn
          //    module (tránh "mở nhầm màn").
          //  - Tầng 1: thả trúng mục → đổi-app (trừ khi vừa GIỮ 2s để đặt mặc định).
          const wasAssigned = assignedRef.current;
          const level = levelRef.current;
          const a = activeRef.current;
          const p = parentRef.current;
          const sub = subActiveRef.current;
          openRef.current = false;
          activeRef.current = -1;
          assignedRef.current = false;
          resetLevels();
          s.setMenu?.(null);
          if (level === 2) {
            if (sub >= 0) {
              const metas = s.subMetaByIndex?.[p] ?? [];
              const m = metas[sub];
              if (m) runSubRef.current(m.route, m.params);
            }
            // sub < 0 → huỷ (không điều hướng).
          } else if (!wasAssigned && a >= 0) {
            const item = s.items[a];
            if (item) runActionRef.current(item.key);
          }
        } else if (stickyOpenedRef.current) {
          // Vừa GIỮ để mở menu dính → thả tay là no-op (menu ở lại để chạm chọn).
        } else {
          // TAP nhanh (không kéo, không giữ). Reviewer §1:
          //   - Đã đặt mặc định → chạy mặc định.
          //   - Chưa đặt → về TRANG CHỦ (giữ pattern "nút giữa = màn chính").
          //   - Nếu menu dính đang mở (từ lần trước) → chạm nút chính để đóng.
          if (s.menuOpen) {
            s.setMenu?.(null);
          } else if (s.defaultKey) {
            runActionRef.current(s.defaultKey);
          } else {
            s.handlePress('Home', s.homeKey, s.homeIsFocused);
          }
        }
      },
      onPanResponderTerminate: () => {
        clearDwell();
        clearLongPress();
        clearSubOpen();
        openRef.current = false;
        activeRef.current = -1;
        assignedRef.current = false;
        stickyOpenedRef.current = false;
        resetLevels();
        stateRef.current.setMenu?.(null);
      },
    });
  }
  React.useEffect(() => () => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (subOpenTimerRef.current) clearTimeout(subOpenTimerRef.current);
  }, []);

  // Icon nút chính = hành động mặc định (nếu đã đặt & còn hợp lệ); chưa đặt =
  // TRANG CHỦ (tap về màn chính · giữ/kéo để xoè menu).
  const mainIcon =
    effectiveDefaultKey && itemMeta[effectiveDefaultKey]
      ? itemMeta[effectiveDefaultKey].icon
      : 'house';

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

      {/* Hàng tab — vẽ THEO thứ tự resolver (§2): Chat · slot · (Home) · slot · Me.
          Home là ô trống ở giữa (nút tròn nổi lấp vào). Ô "Me" vẽ AVATAR user. */}
      <View style={curvedStyles.tabRow}>
        {visibleTabs.map((name) => {
          if (name === NEO_CENTER) {
            return <View key={name} style={curvedStyles.homeSlot} />;
          }
          const routeIndex = state.routes.findIndex((r) => r.name === name);
          if (routeIndex < 0) return null; // route chưa dựng trong instance → bỏ
          const route = state.routes[routeIndex];
          const isFocused = state.index === routeIndex;
          return (
            <TouchableOpacity
              key={route.key}
              ref={name === NEO_RIGHT ? accountTarget.ref : undefined}
              style={curvedStyles.tabItem}
              activeOpacity={0.7}
              onPress={() => handlePress(route.name, route.key, isFocused)}
            >
              <NavItemFrame
                route={route.name}
                focused={isFocused}
                tint="#FFFFFF"
                dimTint="rgba(255,255,255,0.55)"
                initials={name === NEO_RIGHT ? meInitials : undefined}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* CỔNG (§4): nút tròn giữa. NHẤN 1 lần = về Trang chủ (hoặc dịch vụ mặc
          định nếu đã ghim); KÉO ra = xoè cung service để đổi-app / giữ 1s để đặt
          mặc định. Icon phản ánh dịch vụ mặc định hiện tại. */}
      {homeIndex >= 0 && (
        <View
          {...panRef.current.panHandlers}
          ref={centerTarget.ref}
          collapsable={false}
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
  },
  homeSlot: {
    flex: 1,
  },
  homeButton: {
    position: 'absolute',
    top: FLOAT - HOME_BTN_SIZE / 2,
    width: HOME_BTN_SIZE,
    height: HOME_BTN_SIZE,
    borderRadius: HOME_BTN_SIZE / 2,
    borderWidth: 3,
    // Nút chính HERO: màu ẤM tương phản cao (coral, token) nổi trên navbar xanh
    // đậm — bắt mắt, WCAG AA cho icon trắng. KHÔNG hardcode hex.
    borderColor: ACTION_COLORS.heroMainBorder,
    backgroundColor: ACTION_COLORS.heroMain,
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

  // Đường nối TRẮNG: nút chính → ĐẦU NGÓN đang kéo. Ở TẦNG 2 → GẤP KHÚC tại MỤC
  // CHA đang chọn: nút chính → mục cha → ngón (kéo tiếp lên arc con). Chấm tròn ở
  // mỗi đỉnh. CHỈ chế độ kéo (dính không có ngón để bám).
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, key: string) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return (
      <View
        key={key}
        style={[
          radialStyles.line,
          {
            left: (a.x + b.x) / 2 - len / 2,
            top: (a.y + b.y) / 2 - CONNECTOR_H / 2,
            width: len,
            transform: [{ rotate: `${ang}rad` }],
          },
        ]}
      />
    );
  };
  const dotAt = (p: { x: number; y: number }, key: string) => (
    <View key={key} style={[radialStyles.dot, { left: p.x - CONNECTOR_DOT / 2, top: p.y - CONNECTOR_DOT / 2 }]} />
  );
  let connector: React.ReactNode = null;
  if (menu && !sticky) {
    const c = menu.center;
    const f = menu.finger;
    const elbow =
      menu.level === 2 && menu.parent >= 0 ? menu.items[menu.parent] : null;
    connector = (
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: lineAnim }]}>
        {elbow ? (
          <>
            {seg(c, elbow, 'l1')}
            {seg(elbow, f, 'l2')}
            {dotAt(c, 'd0')}
            {dotAt(elbow, 'd1')}
            {dotAt(f, 'd2')}
          </>
        ) : (
          <>
            {seg(c, f, 'l1')}
            {dotAt(c, 'd0')}
            {dotAt(f, 'd2')}
          </>
        )}
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
            {sticky ? 'Chạm một dịch vụ để mở' : 'Kéo tới một dịch vụ rồi thả để mở'}
          </Text>
          <Text style={radialStyles.guideSub}>
            {sticky
              ? 'Chạm ra ngoài để đóng · nhấn giữ 2 giây (khi kéo) để đặt mặc định'
              : 'Kéo tiếp RA XA để mở mục con · giữ 2 giây trên dịch vụ để đặt mặc định'}
          </Text>
        </View>
      )}

      {/* Nút GỠ MẶC ĐỊNH — thay cho cử chỉ "chạm 3 lần" (reviewer §1). Chỉ hiện ở
          chế độ dính khi đang có mặc định. Nhấn → về nút Trang chủ. */}
      {menu && sticky && !!radial?.defaultKey && (
        <View pointerEvents="box-none" style={[radialStyles.removeWrap, { top: height * 0.3 - 64 }]}>
          <Pressable
            style={radialStyles.removeBtn}
            onPress={() => {
              radial?.setDefaultKey(null);
              radial?.setMenu(null);
            }}
          >
            <Icon name="circle-xmark" size={16} color="#FFFFFF" />
            <Text style={radialStyles.removeText}>Gỡ mặc định</Text>
          </Pressable>
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
          return (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {/* Vành nền: full-ring, phần dưới lọt ngoài màn nên nhìn như dải cung trên */}
              <View
                style={[
                  radialStyles.band,
                  { left: c.x - RADIAL_RO, top: c.y - RADIAL_RO, width: RADIAL_RO * 2, height: RADIAL_RO * 2 },
                ]}
              />
              {/* Múi đang chọn = MÚI CUNG khớp dải (bán kính trong/ngoài đúng dải,
                  hai đầu bo tròn). Chừa 6% mỗi đoạn để không đè lên đường chia. */}
              {hotIdx >= 0 &&
                arcSegment(
                  c,
                  a0 + (hotIdx + 0.5) * segW,
                  segW * 0.94,
                  RADIAL_RI,
                  RADIAL_RO,
                  menu.items[hotIdx].tint,
                  'mainseg',
                )}
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

      {/* Icon tầng-1 trong dải cung + nhãn khi đang chọn. Mục NỔI BẬT (Trace) vẽ
          TO hơn + vành sáng + luôn hiện nhãn. Khi đang ở tầng 2, mờ các mục KHÔNG
          phải cha để tập trung vào arc con. */}
      {menu &&
        menu.items.map((it, i) => {
          const hot = i === menu.active || i === menu.assigned;
          const prom = !!it.prominent;
          const iconSize = prom ? PROMINENT_ICON : hot ? RADIAL_ICON + 4 : RADIAL_ICON;
          const dimmed = menu.level === 2 && i !== menu.parent;
          return (
            <View
              key={it.key}
              pointerEvents="none"
              style={[
                radialStyles.itemWrap,
                { left: it.x - 56, top: it.y - iconSize / 2, opacity: dimmed ? 0.4 : 1 },
              ]}
            >
              {prom && <View style={[radialStyles.prominentHalo, { borderColor: it.tint }]} />}
              <Icon name={it.icon} size={iconSize} color="#FFFFFF" />
              {(hot || prom) && (
                <Text style={[radialStyles.itemLabel, radialStyles.itemLabelActive]} numberOfLines={1}>
                  {i === menu.assigned ? '✓ Mặc định' : it.label}
                </Text>
              )}
            </View>
          );
        })}

      {/* ARC CON (tầng 2): CUNG ĐỒNG TÂM (cùng nút giữa) bán kính lớn hơn, ÔM
          NGOÀI arc chính. Nền dải cung như arc chính + pill active + đường chia +
          icon/nhãn. Vành là full-ring (nửa dưới lọt ngoài màn) nên nhìn như cung
          trên ôm quanh arc chính. */}
      {menu &&
        menu.level === 2 &&
        menu.parent >= 0 &&
        menu.subItems.length > 0 &&
        (() => {
          const c = menu.center;
          const n = menu.subItems.length;
          const segS = SUB_ITEMS_SPREAD / n;
          const a0 = -SUB_ITEMS_SPREAD / 2;
          return (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {/* Vành nền arc con — đồng tâm, bán kính lớn hơn arc chính */}
              <View
                style={[
                  radialStyles.bandSub,
                  { left: c.x - RADIAL_RO_SUB, top: c.y - RADIAL_RO_SUB, width: RADIAL_RO_SUB * 2, height: RADIAL_RO_SUB * 2 },
                ]}
              />
              {/* Múi con đang chọn = MÚI CUNG khớp dải arc con */}
              {menu.subActive >= 0 &&
                arcSegment(
                  c,
                  a0 + (menu.subActive + 0.5) * segS,
                  segS * 0.94,
                  RADIAL_RI_SUB,
                  RADIAL_RO_SUB,
                  menu.subItems[menu.subActive].tint,
                  'subseg',
                )}
              {/* Đường chia giữa các mục con */}
              {Array.from({ length: n - 1 }, (_, k) => {
                const d = a0 + (k + 1) * segS;
                const pi = polarPt(c.x, c.y, RADIAL_RI_SUB, d);
                const po = polarPt(c.x, c.y, RADIAL_RO_SUB, d);
                const mx = (pi.x + po.x) / 2;
                const my = (pi.y + po.y) / 2;
                const rot = Math.atan2(po.y - pi.y, po.x - pi.x);
                return (
                  <View
                    key={`subdiv-${k}`}
                    style={[
                      radialStyles.divider,
                      {
                        left: mx - RADIAL_BAND_SUB / 2,
                        top: my - 0.75,
                        width: RADIAL_BAND_SUB,
                        transform: [{ rotate: `${rot}rad` }],
                      },
                    ]}
                  />
                );
              })}
              {/* Icon + nhãn mục con */}
              {menu.subItems.map((it, i) => {
                const h = i === menu.subActive;
                return (
                  <View
                    key={it.key}
                    pointerEvents="none"
                    style={[radialStyles.itemWrap, { left: it.x - 56, top: it.y - RADIAL_ICON / 2 }]}
                  >
                    <Icon name={it.icon} size={h ? RADIAL_ICON + 3 : RADIAL_ICON} color="#FFFFFF" />
                    {h && (
                      <Text style={[radialStyles.itemLabel, radialStyles.itemLabelActive]} numberOfLines={1}>
                        {it.label}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

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
  // Vành nền ARC CON — đồng tâm, bán kính lớn hơn; hơi nhạt hơn arc chính để
  // phân lớp (cung ngoài ôm cung trong).
  bandSub: {
    position: 'absolute',
    borderRadius: RADIAL_RO_SUB,
    borderWidth: RADIAL_BAND_SUB,
    borderColor: 'rgba(17, 17, 17, 0.58)',
    backgroundColor: 'transparent',
  },
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
  removeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 83, 60, 0.92)',
  },
  removeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  itemWrap: { position: 'absolute', width: 112, alignItems: 'center' },
  // Vành sáng sau mục NỔI BẬT (Trace) — vòng tròn viền, tâm khớp icon (icon ~34).
  prominentHalo: {
    position: 'absolute',
    top: -10,
    left: (112 - (PROMINENT_ICON + 20)) / 2, // căn giữa trong itemWrap rộng 112
    width: PROMINENT_ICON + 20,
    height: PROMINENT_ICON + 20,
    borderRadius: (PROMINENT_ICON + 20) / 2,
    borderWidth: 2.5,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
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
    backBehavior="initialRoute"
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
      // 1) Self-pair PhoenixKey session (mobile tự ký lấy session token) — BẮT BUỘC vì
      //    /wallet/standard/register cần Bearer session. User đăng-nhập-mobile-thuần
      //    không có token này → trước đây đăng-ký ví fail câm → /wallet/all rỗng → không
      //    hiện ví. 2) Đăng-ký ví Standard. 3) Refresh để /wallet/all trả về ví.
      //    Tuần-tự + best-effort (không chặn nếu lỗi/offline).
      (async () => {
        await ensurePhoenixSession();
        await ensureStandardWalletRegistered();
        dispatch(refreshWallet(did));
      })();
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

  // Header toàn cục Ở TRÊN khối tab (layout-flow): header co/giãn chiều cao khi
  // thu/thả nên KHÔNG cần chừa padding-top riêng cho từng tab. Nút Tài khoản +
  // Thông báo nằm trong header (KHÔNG trên navbar).
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <AppHeader />
      <View style={{ flex: 1 }}>
        <MainTabs />
      </View>
    </View>
  );
};

// --- Host-level stack screens (KHÔNG thuộc module) -------------------------
// Đăng ký tĩnh; giữ nguyên route name + options cũ.
// ── LAZY 3D ─────────────────────────────────────────────────────────────────
// Space3D/FruitPlace3D kéo @react-three/fiber/native → expo-gl → expo-modules-core.
// Nạp TĨNH khiến expo-modules-core chạy (globalThis.expo.EventEmitter) NGAY lúc startup;
// trên bản signed globalThis.expo chưa sẵn → crash CẢ APP. Nạp LƯỜI: chỉ khi mở màn 3D.
// Suspense + GLErrorBoundary: nếu expo vẫn lỗi thì chỉ hỏng khung 3D, KHÔNG sập app.
const _LazySpace3D = React.lazy(() => import('../screens/Space3DScreen'));
const _LazyFruitPlace3D = React.lazy(() => import('../screens/FruitPlace3DScreen'));
const _make3D = (Comp: React.LazyExoticComponent<any>, tag: string): React.FC<any> =>
  function Lazy3DScreen(props: any) {
    // GLErrorBoundary NGOÀI Suspense: lỗi lúc LAZY-IMPORT (module expo-modules-core
    // ném "globalThis.expo undefined" trên bản signed) được React.lazy re-throw ở
    // tầng render — ErrorBoundary phải bọc NGOÀI Suspense mới bắt được (nếu để trong
    // sẽ lọt → sập app). Bắt được = chỉ hiện màn lỗi 3D, app vẫn chạy.
    return (
      <GLErrorBoundary tag={tag}>
        <React.Suspense
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          }
        >
          <Comp {...props} />
        </React.Suspense>
      </GLErrorBoundary>
    );
  };
const Space3DScreen = _make3D(_LazySpace3D, 'space3d_lazy');
const FruitPlace3DScreen = _make3D(_LazyFruitPlace3D, 'fruitplace3d_lazy');

const HOST_STACK_SCREENS: Array<{
  name: string;
  component: React.ComponentType<any>;
  options?: object;
}> = [
  { name: 'Login', component: LoginScreen, options: { headerShown: false } },
  // Hỏi-một-lần lúc mới cài. Không gestureEnabled: vuốt-back ra khỏi màn này sẽ
  // để app không có màn nào ở dưới (đây là initialRoute khi chưa chọn ngôn ngữ).
  {
    name: 'LanguageSelect',
    component: LanguageSelectScreen,
    options: { headerShown: false, gestureEnabled: false },
  },
  { name: 'Activation', component: ActivationScreen },
  { name: 'BiometricSettings', component: BiometricSettings },
  // PhoenixKey feature screens.
  { name: 'SignRequest', component: SignRequestScreen, options: { headerShown: false } },
  { name: 'Guardian', component: GuardianScreen, options: { headerShown: false } },
  { name: 'ActivityLog', component: ActivityLogScreen, options: { headerShown: false } },
  { name: 'Main', component: ProtectedMain, options: { headerShown: false } },
  // Màn Thông báo — đích của nút chuông trên AppHeader (host-level).
  { name: 'Notifications', component: NotificationScreen, options: { headerShown: false } },
  // Tài khoản LÀ TAB (ô "Me/Tôi" = NEO hiển thị, SG9 §2) — vẫn là Tab.Screen để
  // navbar + AppHeader dùng chung ở trang này. KHÔNG đăng ký Account như MÀN
  // ROOT-STACK: màn root-stack sẽ
  // phủ TRÙM lên Main → che mất AppHeader (header sống ở ProtectedMain, TRÊN các
  // tab). Header (nút Tài khoản) mở qua navigate('Main', { screen: 'Account' }).
  // ProofChat ví/escrow — chưa khai manifest, giữ ở host stack.
  { name: 'ProofChatWallet', component: ProofChatWalletScreen, options: { headerShown: false } },
  { name: 'ProofChatEscrow', component: ProofChatEscrowScreen, options: { headerShown: false } },
  // Auth flow.
  { name: 'SignUpBiometric', component: SignUpBiometricScreen, options: { headerShown: false } },
  { name: 'SignUpComplete', component: SignUpCompleteScreen, options: { headerShown: false, gestureEnabled: false } },
  // Capture/identity screens dùng chung (host-level).
  { name: 'FruitList', component: FruitListScreen, options: { headerShown: false } },
  { name: 'FruitCropper', component: FruitCropperScreen, options: { headerShown: false } },
  // Sơ-đồ 2D CŨ — giữ đăng ký để deep-link cũ không gãy, nhưng KHÔNG nút nào trỏ
  // tới nữa: mọi lối vào sơ đồ nay mở 'Space3D' (một hệ giao diện 3D duy nhất).
  { name: 'TreeMap2D', component: TreeMap2DScreen, options: { headerShown: false } },
  { name: 'FarmMap2D', component: FarmMap2DScreen, options: { headerShown: false } },
  // KHÔNG-GIAN 3D DUY NHẤT: vườn ⇄ cây ⇄ quả (three + @react-three/fiber/native).
  { name: 'Space3D', component: Space3DScreen, options: { headerShown: false } },
  // Đặt toạ-độ 3D của quả trên cây bằng 3 hướng chiếu.
  { name: 'FruitPlace3D', component: FruitPlace3DScreen, options: { headerShown: false } },
  { name: 'TreeIdentity', component: TreeIdentityScreen, options: { headerShown: false } },
  { name: 'TreeEnroll', component: TreeEnrollScreen, options: { headerShown: false } },
  // Thu video QUẢ → gắn cây (OriLife User-Action-Flow). Quay native + upload fruit_video.
  { name: 'FruitVideo', component: FruitVideoScreen, options: { headerShown: false } },
  // Thu video ĐỊNH DANH CÂY → bổ-sung góc cho cây (OriLife). Quay native + upload tree/{id}/video.
  { name: 'TreeVideo', component: TreeVideoScreen, options: { headerShown: false } },
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
  { name: 'Staking', component: StakingScreen, options: { headerShown: false } },
  // Ví tổ chức — tạo OrgDID + mint LAMP bằng OrgDID (2 bước: mint kho → claim-release).
  { name: 'OrgDid', component: OrgDidScreen, options: { headerShown: false } },
  { name: 'OrgAuthority', component: OrgAuthorityScreen, options: { headerShown: false } },
  { name: 'OrgMint', component: OrgMintScreen, options: { headerShown: false } },
  // Pool (stake pool / SPO) — UI khung trỏ api.phoenixkey.me; contract chờ Phoenix (inbox).
  { name: 'PoolHome', component: PoolHomeScreen, options: { headerShown: false } },
  { name: 'WebLoginScan', component: WebLoginScanScreen, options: { headerShown: false } },
  // SG9 §3 — Quét truy xuất (consumer): host stack, full-bleed, KHÔNG lên tabs[]
  // (immersive-by-omission). Tới được qua nút Home header + cổng §4 + deep-link.
  { name: 'TraceScan', component: TraceScanScreen, options: { headerShown: false } },
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
  // SG9 §3 — mở màn quét truy xuất qua deep-link `magiclamp://trace-scan` (quét từ
  // platform khác). Màn CHI TIẾT (TreeDetail…) đã deep-link-được qua map module ở
  // trên → sản phẩm Aladin quét ngoài app mở thẳng màn kết quả.
  screens[TRACE_SCAN_ROUTE_NAME] = 'trace-scan';
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
      // Máy VỪA CÀI (chưa từng chọn ngôn ngữ) → màn đầu tiên là "Chọn ngôn ngữ",
      // rồi mới tới Đăng nhập. Đọc AsyncStorage là bất đồng bộ nên phải chờ ở đây;
      // quyết định trước khi dựng Stack để không thấy Login nhấp nháy rồi mới nhảy.
      // Lỗi đọc storage → coi như đã chọn (vào thẳng Login), KHÔNG chặn app.
      let firstRoute = 'Login';
      try {
        await whenLanguageReady();
        if (!hasChosenLanguage()) firstRoute = 'LanguageSelect';
      } catch (e) {
        console.warn('[Navigation] Không đọc được ngôn ngữ đã lưu:', e);
      }

      try {
        // Start sync service (database will be initialized per-user on login)
        console.log('[Navigation] Initializing sync service');
        syncService.start();
      } finally {
        // Bỏ 3 màn welcome/onboarding — vào thẳng Login (hoặc Chọn ngôn ngữ ở lần
        // mở đầu tiên). Người dùng luôn phải xác thực sinh trắc mỗi phiên; KHÔNG
        // auto-login vào Main.
        // finally: đây là điểm DUY NHẤT thoát spinner initialRoute=null. Nếu bất kỳ
        // init nào ở trên ném thì vẫn PHẢI mở khoá UI — nếu không app kẹt spinner câm.
        setInitialRoute(firstRoute);
      }
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
        // Mạng lên lại → thử gửi luôn các clip video còn kẹt trong hàng đợi bền.
        flushVideoUploadQueue().catch((err) =>
          console.warn('[Navigation] flushVideoUploadQueue failed:', err),
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
      <AppHeaderProvider>
      <CoachMarkProvider>
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
        {/* Luồng hướng dẫn (coach-mark) — trên tất cả, chặn thao tác khi chạy. */}
        <CoachMarkOverlay />
        <Toast />
      </NavigationContainer>
      </CoachMarkProvider>
      </AppHeaderProvider>
      </RadialMenuProvider>
    </Provider>
  );
};

export default AppNavigator;
