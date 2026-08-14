// screens/LoginScreen.tsx
//
// Cấu trúc:
//   ┌────────────────────────────┐
//   │  HERO blue + blob circles  │  ← branding + tiêu đề
//   ├────────────────────────────┤
//   │  Sheet trắng (uốn cong)     │
//   │  • 1 nút biometric (tròn)   │
//   │  • DID note                  │
//   │  • Sự kiện / tin tức         │
//   └────────────────────────────┘

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
  Dimensions,
  ScrollView,
  Easing,
  Image,
  Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { useAnalytics } from '../services/analytics';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { biometricKindFromType, phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import {
  isAvailable as isPhoenixKeyAvailable,
  PhoenixKeyNativeError,
} from '../services/phoenixKey-native';
import { currentUserDid, isKeypairEnrolled, signRaw } from '../sdk/phoenixKey';
import { loginUser } from '../store/userSlice';
import { showError } from '../utils/alert';
import LoginSuccessOverlay from '../components/LoginSuccessOverlay';
import LanguagePickerModal from '../components/LanguagePickerModal';
import { LANGUAGES, t, tf, useLanguage } from '../i18n';

const PHOENIX_USERS_KEY = '@phoenixkey/users';
const ACTIVE_USERNAME_KEY = '@phoenixkey/active_username';

interface PhoenixUserEntry {
  username: string;
  did: string;
  createdAt: number;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Aladin brand palette (xanh lá đậm + cam accent) — đồng bộ với app icon
const BLUE = {
  deep: '#1F5C2A',
  primary: '#2B7A39',
  mid: '#3D9248',
  light: '#7DBD89',
  pale: '#C8E3CE',
  white: '#FFFFFF',
  glow: 'rgba(168, 212, 176, 0.35)',
  glowSoft: 'rgba(232, 245, 235, 0.45)',
};
const ACCENT_ORANGE = '#E08C3A';

// ── Mock events / tin tức (sẽ đổi sang API thật sau) ────────────────────────
type EventItem = {
  id: string;
  badge: 'NEW' | 'HOT' | 'EVENT';
  badgeColor: string;
  icon: string;
  title: string;
  subtitle: string;
};

const EVENTS: EventItem[] = [
  {
    id: 'e1',
    badge: 'NEW',
    badgeColor: '#2B7A39',
    icon: 'message-badge-outline',
    title: 'Aladin Chat — phiên bản mới',
    subtitle: 'Tin nhắn ký số · Escrow tích hợp',
  },
  {
    id: 'e2',
    badge: 'HOT',
    badgeColor: '#E08C3A',
    icon: 'gift-outline',
    title: 'Đăng ký thợ — nhận 100 MAGIC',
    subtitle: 'Ưu đãi cho người mới đến 30/04',
  },
  {
    id: 'e3',
    badge: 'EVENT',
    badgeColor: '#3D7A5E',
    icon: 'calendar-star',
    title: 'Aladin Day 30/04',
    subtitle: 'Sự kiện cộng đồng & airdrop',
  },
];

// ── Component ───────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { trackPress, trackAction } = useAnalytics('LoginScreen');

  const [biometryType, setBiometryType] = useState<string>('');
  // `null` = CHƯA dò xong. Phân biệt với `false` (dò xong, máy không có cảm biến)
  // để nút không loé sang trạng thái tắt trong mấy khung hình đầu.
  const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Overlay hiệu ứng logo chớp mắt khi đăng nhập thành công (trước khi vào Main).
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeUser, setActiveUser] = useState<PhoenixUserEntry | null>(null);
  const [allUsers, setAllUsers] = useState<PhoenixUserEntry[]>([]);
  // Nút cờ ở góc trên-phải khu logo: đổi ngôn ngữ NGAY tại màn đăng nhập, không
  // phải đăng nhập vào mới đổi được (người dùng mới chưa có tài khoản).
  const [langOpen, setLangOpen] = useState(false);
  const lang = useLanguage();
  const langMeta = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0];

  // Load PhoenixUser đã đăng ký trên thiết bị mỗi khi màn này focus.
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [usersRaw, activeName] = await Promise.all([
            AsyncStorage.getItem(PHOENIX_USERS_KEY),
            AsyncStorage.getItem(ACTIVE_USERNAME_KEY),
          ]);
          if (cancelled) return;
          const users: PhoenixUserEntry[] = usersRaw ? JSON.parse(usersRaw) : [];
          setAllUsers(users);
          const active = activeName
            ? users.find(u => u.username === activeName)
            : users[users.length - 1];
          setActiveUser(active || null);
        } catch (e) {
          console.log('[Login] Load PhoenixUsers failed:', e);
        }
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const blob1 = useRef(new Animated.Value(0)).current;
  const blob2 = useRef(new Animated.Value(0)).current;
  const blob3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 700, useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 700, useNativeDriver: true,
      }),
    ]).start();

    // Loop floating blobs
    const float = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1, duration: dur,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0, duration: dur,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    float(blob1, 4500).start();
    float(blob2, 6000).start();
    float(blob3, 5200).start();

    (async () => {
      try {
        const rn = new ReactNativeBiometrics();
        const { available, biometryType: type } = await rn.isSensorAvailable();
        setSensorAvailable(available);
        setBiometryType(type || '');
      } catch (e) {
        console.log('[Login] Biometric sensor check failed:', e);
      }
    })();
  }, [fadeAnim, slideAnim, blob1, blob2, blob3]);

  const hasFaceId = biometryType === BiometryTypes.FaceID;
  const hasTouchId = biometryType === BiometryTypes.TouchID;
  // Đã dò XONG và máy không có cảm biến nào dùng được. `null` (chưa dò xong)
  // KHÔNG tính là không có — nếu tính thì nút tắt oan ngay khi mở màn.
  const noSensor = sensorAvailable === false;

  // Loại sinh trắc suy từ cảm biến thật — dùng cho phần đo lường.
  const bioKind = biometricKindFromType(biometryType);

  // Một nút, hình dạng do THIẾT BỊ quyết định. Nhánh áp chót phủ `Biometrics`
  // (Android gộp chung) lẫn lúc chưa dò xong (biometryType còn rỗng).
  const bioIcon = noSensor
    ? 'fingerprint-off'
    : hasFaceId
      ? 'face-recognition'
      : hasTouchId
        ? 'fingerprint'
        : 'fingerprint';
  // Nút không có chữ → nhãn cho trình đọc màn hình là thứ DUY NHẤT mô tả nó.
  // `accessibilityLabel` là prop chuỗi, không đi qua <Text> nên lớp tự dịch không
  // với tới: phải gọi `t()` tay.
  const bioLabel = t(
    noSensor
      ? 'Thiết bị chưa thiết lập sinh trắc học'
      : hasFaceId
        ? 'Đăng nhập bằng khuôn mặt'
        : hasTouchId
          ? 'Đăng nhập bằng vân tay'
          : 'Đăng nhập bằng sinh trắc học',
  );

  const runBiometric = async () => {
    if (busy || noSensor) return;
    // Hộp thoại sinh trắc do HỆ ĐIỀU HÀNH vẽ → KHÔNG đi qua <Text> nên lớp tự dịch
    // không với tới; phải gọi `t()` tay. Tra từ điển thay vì chuỗi ternary: ternary
    // 3 nhánh sẽ lặng lẽ hiện tiếng Trung cho tiếng Nhật (đúng lỗi đã gặp).
    const prompt = t('Xác thực sinh trắc học');
    // Ghi nhận lần nhấn nút sinh trắc + đánh dấu để đo độ trễ tới màn hình kế.
    // `kind` suy từ CẢM BIẾN THẬT, không từ nút người dùng bấm. Số liệu cũ tách
    // hai sự kiện theo nút nên đang đếm "người dùng bấm cái nào" — một lựa chọn
    // không tồn tại — chứ không đếm thứ đã thật sự xảy ra.
    trackPress('biometric_button', {
      action: 'login_biometric',
      metadata: { kind: bioKind, biometryType: biometryType || 'unknown' },
    });
    try {
      setBusy(true);
      if (!isPhoenixKeyAvailable()) {
        showError('Chưa dùng được danh tính trên máy này');
        return;
      }

      // Máy CHƯA có danh tính thì đi thẳng sang màn tạo tài khoản — hỏi sinh trắc
      // trước là bắt người dùng xác thực cho một cái khoá không tồn tại.
      const [did, hasKey] = await Promise.all([currentUserDid(), isKeypairEnrolled()]);
      if (!did || !hasKey) {
        navigation.navigate('SignUpBiometric' as never);
        return;
      }

      // ── XÁC THỰC BẰNG CHÍNH KHOÁ, không phải bằng một cờ boolean ─────────────
      // Trước đây chỗ này gọi `rn.simplePrompt()`: hộp thoại do JS bật, kết quả là
      // một `boolean` ở tầng JS, KHÔNG ràng buộc gì với cặp khoá trong chip. Ai sửa
      // được luồng JS (máy đã root/jailbreak, bundle bị vá, hook lúc chạy) là đổi
      // được `success` thành true, và bước sau cũng không kiểm gì thêm —
      // `isKeypairEnrolled()` chỉ hỏi "trong chip CÓ khoá không", không hỏi "chủ
      // khoá CÓ MẶT không". Cả đường đăng nhập không có một chữ ký nào.
      //
      // Nay đăng nhập đi đúng con đường mà việc KÝ đang đi: ký một chuỗi thử.
      // Hộp thoại sinh trắc do CHIP bật (BiometricPrompt gắn CryptoObject), và chữ
      // ký chỉ ra khi chip đã đối chiếu xong khuôn mặt/vân tay — sửa JS không đi
      // vòng được. Chữ ký này không gửi đi đâu: giá trị của nó nằm ở chỗ nó KHÔNG
      // TỒN TẠI nếu chủ khoá vắng mặt.
      //
      // Chuỗi thử đổi mỗi lần để không phải lúc nào cũng ký đúng một khối byte;
      // không cần nguồn ngẫu-nhiên mật-mã vì không ai xác minh chữ ký này — thứ
      // bảo vệ đăng nhập là lời gọi native NÉM khi chưa xác thực.
      //
      // ⚠️ Sinh THEO TỪNG BYTE để chuỗi hex LUÔN CHẴN. Bản đầu ghép
      // `Date.now().toString(16)` (11 ký tự) với 8 ký tự ngẫu nhiên = 19 ký tự LẺ;
      // `hexToBytes` bên native `require(length % 2 == 0)` nên ném ngay, mà lệnh đó
      // nằm CÙNG khối try với `initSign` ⇒ trả về `E_SIGN_INIT` — đúng cái mã mà
      // app đang dịch thành "khoá trên máy không còn dùng được". Kết quả: mọi lần
      // đăng nhập đều báo khoá hỏng dù khoá hoàn toàn bình thường.
      let nonceHex = '';
      for (let i = 0; i < 16; i++) {
        nonceHex += ((Math.random() * 256) | 0).toString(16).padStart(2, '0');
      }
      await signRaw(nonceHex, prompt, t('Xác thực để mở danh tính trên máy này'));

      const user = await phoenixKeyAuth.unlockExistingIdentity();
      if (!user) {
        // Có khoá nhưng không dựng lại được danh tính (DID hỏng/không hỗ trợ).
        navigation.navigate('SignUpBiometric' as never);
        return;
      }

      trackAction('login_success', {
        metadata: { kind: bioKind, biometryType: biometryType || 'unknown' },
      });
      await dispatch(loginUser(user as any) as any);
      // Hiện hiệu ứng logo chớp mắt; onDone của overlay sẽ reset về Main.
      setShowSuccess(true);
    } catch (e) {
      // Mã lỗi native đã có sẵn — gộp hết vào một câu "thất bại" là bắt người dùng
      // đoán xem họ vừa huỷ, hay máy đang khoá tạm, hay khoá đã hỏng.
      const code = (e as { code?: string } | null)?.code;
      if (code === PhoenixKeyNativeError.USER_CANCELED) return; // tự huỷ: im lặng quay lại
      if (code === PhoenixKeyNativeError.BIOMETRIC_LOCKOUT) {
        showError('Sai sinh trắc học nhiều lần nên máy đang tạm khoá. Chờ khoảng 30 giây rồi thử lại, hoặc mở khoá máy bằng mã PIN trước.');
        return;
      }
      if (code === PhoenixKeyNativeError.NO_KEY || code === PhoenixKeyNativeError.SIGN_INIT) {
        // Khoá không dùng được nữa — hay gặp nhất là người dùng vừa thêm/xoá vân tay
        // khiến hệ điều hành HUỶ khoá. `hasKey()` vẫn báo có, nên nếu không bắt ở đây
        // thì mãi tới lúc ký giao dịch mới lộ ra, muộn hơn nhiều.
        showError('Khoá trên máy không còn dùng được (thường do vừa thêm hoặc xoá vân tay/khuôn mặt trong Cài đặt). Hãy khôi phục danh tính để dùng tiếp.');
        return;
      }
      console.log('[Login] Biometric flow failed:', e);
      showError('Đăng nhập sinh trắc học thất bại');
    } finally {
      setBusy(false);
    }
  };

  // Blob translate ranges (subtle, in pixels)
  const blob1Y = blob1.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const blob1X = blob1.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const blob2Y = blob2.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const blob2X = blob2.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });
  const blob3Y = blob3.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
  const blob3X = blob3.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE.deep} />

      {/* ── HERO ZONE ───────────────────────────────────── */}
      <View style={styles.hero}>
        {/* Layered solid color base */}
        <View style={styles.heroBase} />
        <View style={styles.heroOverlay} />

        {/* Decorative blob circles */}
        <Animated.View
          style={[
            styles.blob, styles.blob1,
            { transform: [{ translateX: blob1X }, { translateY: blob1Y }] },
          ]}
        />
        <Animated.View
          style={[
            styles.blob, styles.blob2,
            { transform: [{ translateX: blob2X }, { translateY: blob2Y }] },
          ]}
        />
        <Animated.View
          style={[
            styles.blob, styles.blob3,
            { transform: [{ translateX: blob3X }, { translateY: blob3Y }] },
          ]}
        />
        <Animated.View
          style={[
            styles.blob, styles.blob4,
            { transform: [{ translateX: blob2X }, { translateY: blob3Y }] },
          ]}
        />
        {/* Tiny stars/dots */}
        {STAR_DOTS.map((d, i) => (
          <View
            key={i}
            style={[
              styles.starDot,
              { top: d.top, left: d.left, width: d.size, height: d.size, opacity: d.opacity },
            ]}
          />
        ))}

        {/* Hero content */}
        <Animated.View
          style={[
            styles.heroContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Hàng logo: logo trái · nút cờ đổi ngôn ngữ ở góc PHẢI (cùng hàng nên
              luôn nằm trên cùng khu logo dù chiều cao hero đổi theo màn hình). */}
          <View style={styles.logoRow}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Image source={require('../../assets/images/logo.png')} style={{ width: 50, height: 50, borderRadius: 9 }} />
              </View>
            </View>

            <TouchableOpacity
              style={styles.langBtn}
              activeOpacity={0.8}
              hitSlop={8}
              onPress={() => setLangOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={langMeta.endonym}
            >
              <Text style={styles.langFlag} allowFontScaling={false}>{langMeta.flag}</Text>
              <Icon name="chevron-down" size={14} color={BLUE.white} />
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.eyebrow}>ALADIN · DANH TÍNH SỐ</Text>
          <Text allowFontScaling={false} style={styles.title}>
            {/* `tf` giữ tên người ra NGOÀI khoá từ điển: nối chuỗi rồi mới dịch sẽ
                không bao giờ khớp, còn khuôn '{name}' cho bản dịch tự đặt lại vị
                trí (tiếng Nhật/Trung có trật tự từ khác tiếng Việt). */}
            {activeUser ? tf('Wellcome @{name}', { name: activeUser.username }) : 'Wellcome'}
          </Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {activeUser
              ? 'Quét khuôn mặt hoặc vân tay để mở khoá. Bảo mật tự chủ, không mật khẩu, không OTP.'
              : 'Quét khuôn mặt hoặc vân tay để mở khoá danh tính của bạn.\nBảo mật tự chủ — không mật khẩu, không OTP.'}
          </Text>
          {allUsers.length > 1 && activeUser && (
            <TouchableOpacity
              onPress={async () => {
                // Cycle qua usernames (tester có nhiều account demo).
                const idx = allUsers.findIndex(u => u.username === activeUser.username);
                const next = allUsers[(idx + 1) % allUsers.length];
                await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, next.username);
                setActiveUser(next);
              }}
              style={styles.switchUserPill}
            >
              <Icon name="account-switch-outline" size={12} color={BLUE.white} />
              <Text style={styles.switchUserText}>
                Đổi tài khoản ({allUsers.length})
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {/* ── SHEET ─────────────────────────────────────── */}
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Nút sinh trắc học — MỘT nút tròn, chỉ icon */}
        <Animated.View
          style={[
            styles.bioZone,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <BioButton
            icon={bioIcon}
            label={bioLabel}
            busy={busy}
            off={noSensor}
            onPress={runBiometric}
          />

          {/* Máy chưa có sinh trắc → nút tắt, và chỉ đường sang Cài đặt máy thay
              vì để người dùng bấm vào một nút không bao giờ chạy. */}
          {noSensor && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                trackPress('open_device_settings', { action: 'fix_no_biometric' });
                Linking.openSettings().catch(() => { });
              }}
              style={styles.bioHint}
              accessibilityRole="button"
            >
              <Text style={styles.bioHintText} allowFontScaling={false}>
                Bật Face ID hoặc vân tay trong Cài đặt máy để đăng nhập
              </Text>
              <Text style={styles.bioHintLink} allowFontScaling={false}>
                Mở Cài đặt
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* DID badge */}
        <View style={styles.didBadge}>
          <View style={styles.didIconWrap}>
            <Icon name="shield-check" size={14} color={BLUE.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.didTitle} allowFontScaling={false}>
              Danh tính của riêng bạn
            </Text>
            <Text style={styles.didSub} allowFontScaling={false}>
              Khoá riêng được giữ ngay trên thiết bị · Không có máy chủ nào lưu mật khẩu của bạn.
            </Text>
          </View>
        </View>

        {/* Sign up CTA */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            // Nhấn nút "Tạo tài khoản" → đo độ trễ đến màn SignUpBiometric.
            trackPress('signup_cta', { action: 'open_signup' });
            navigation.navigate('SignUpBiometric' as never);
          }}
          style={styles.signUpCard}
        >
          <View style={styles.signUpIcon}>
            <Icon name="account-plus-outline" size={20} color={BLUE.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.signUpTitle} allowFontScaling={false}>
              Chưa có tài khoản?
            </Text>
            <Text style={styles.signUpSub} allowFontScaling={false}>
              Tạo danh tính mới bằng sinh trắc học · 3 bước
            </Text>
          </View>
          <Icon name="arrow-right" size={18} color={BLUE.primary} />
        </TouchableOpacity>

        {/* Restore wallet CTA — khôi phục ví bằng cụm 24 từ (máy mới / cài lại) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            trackPress('restore_cta', { action: 'open_restore' });
            navigation.navigate('RestoreIdentity' as never);
          }}
          style={styles.signUpCard}
        >
          <View style={styles.signUpIcon}>
            <Icon name="backup-restore" size={20} color={BLUE.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.signUpTitle} allowFontScaling={false}>
              Đã có cụm 24 từ?
            </Text>
            <Text style={styles.signUpSub} allowFontScaling={false}>
              Khôi phục ví trên thiết bị này
            </Text>
          </View>
          <Icon name="arrow-right" size={18} color={BLUE.primary} />
        </TouchableOpacity>

        {/* Events */}
        <View style={styles.eventsHeader}>
          <View style={styles.eventsTitleRow}>
            <View style={styles.eventsDot} />
            <Text style={styles.eventsTitle} allowFontScaling={false}>
              TIN MỚI · SỰ KIỆN
            </Text>
          </View>
          <TouchableOpacity hitSlop={6}>
            <Text style={styles.eventsMore} allowFontScaling={false}>Xem tất cả</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.eventsList}
          decelerationRate="fast"
          snapToInterval={SCREEN_W * 0.78 + 12}
        >
          {EVENTS.map((ev, i) => (
            <EventCard key={ev.id} event={ev} index={i} fadeAnim={fadeAnim} />
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Icon name="lock-check-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.footerText} allowFontScaling={false}>
            Khóa riêng không bao giờ rời khỏi thiết bị · v2.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Hiệu ứng đăng nhập thành công — phủ toàn màn, chạy 1 nhịp chớp mắt rồi
          reset về Main. */}
      <LoginSuccessOverlay
        visible={showSuccess}
        username={activeUser?.username ?? 'bạn'}
        onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] })}
      />

      {/* Popup đổi ngôn ngữ — mở từ nút cờ ở góc trên-phải khu logo. */}
      <LanguagePickerModal visible={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

// Nút sinh trắc học duy nhất: hình tròn, chỉ icon, không chữ.
// Trạng thái "đang xác thực" báo bằng vòng sóng lan toả — giữ nút thuần icon
// thay vì chèn dòng chữ chỉ xuất hiện trong một khoảnh khắc.
const BioButton: React.FC<{
  icon: string;
  label: string;
  busy: boolean;
  /** Máy không có sinh trắc → nút tắt hẳn, không giả vờ bấm được. */
  off: boolean;
  onPress: () => void;
}> = ({ icon, label, busy, off, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!busy) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1, duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    // Dừng vòng lặp khi busy tắt HOẶC component tháo — thiếu bước này thì
    // Animated giữ tham chiếu và cảnh báo cập nhật state sau khi unmount.
    return () => loop.stop();
  }, [busy, pulse]);

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1], outputRange: [0.45, 0],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1], outputRange: [1, 1.6],
  });

  return (
    <>
      <Animated.View style={[styles.bioBtnWrap, { transform: [{ scale }] }]}>
        <Animated.View
          style={[
            styles.bioPulseRing,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
          pointerEvents="none"
        />
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={busy || off}
          onPressIn={() =>
            Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start()
          }
          onPressOut={() =>
            Animated.spring(scale, {
              toValue: 1, friction: 4, useNativeDriver: true,
            }).start()
          }
          onPress={onPress}
          style={[styles.bioBtn, busy && styles.bioBtnBusy, off && styles.bioBtnOff]}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy, disabled: busy || off }}
        >
          <Icon
            name={icon}
            size={BIO_ICON_SIZE}
            color={busy ? BLUE.white : BLUE.white}
          />
        </TouchableOpacity>
      </Animated.View>
      <Text style={styles.bioBtnLabel} allowFontScaling={false}>
        LOGIN WITH BIOMETRIC
      </Text>
    </>
  );
};

const EventCard: React.FC<{
  event: EventItem;
  index: number;
  fadeAnim: Animated.Value;
}> = ({ event, index, fadeAnim }) => {
  const cardSlide = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.timing(cardSlide, {
      toValue: 0,
      duration: 500,
      delay: 150 + index * 80,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.eventCard,
        {
          opacity: fadeAnim,
          transform: [{ translateY: cardSlide }],
        },
      ]}
    >
      <View style={styles.eventTop}>
        <View
          style={[
            styles.eventBadge,
            { backgroundColor: event.badgeColor + '18', borderColor: event.badgeColor + '40' },
          ]}
        >
          <Text style={[styles.eventBadgeText, { color: event.badgeColor }]} allowFontScaling={false}>
            {event.badge}
          </Text>
        </View>
        <Icon name={event.icon} size={20} color={event.badgeColor} />
      </View>
      <Text style={styles.eventTitle} allowFontScaling={false} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.eventSub} allowFontScaling={false} numberOfLines={2}>
        {event.subtitle}
      </Text>
    </Animated.View>
  );
};

// ── Decorative star dots positions ──────────────────────────────────────────
type Dot = { top: `${number}%`; left: `${number}%`; size: number; opacity: number };
const STAR_DOTS: Dot[] = [
  { top: '8%', left: '15%', size: 3, opacity: 0.5 },
  { top: '14%', left: '78%', size: 4, opacity: 0.7 },
  { top: '32%', left: '88%', size: 2, opacity: 0.5 },
  { top: '40%', left: '10%', size: 3, opacity: 0.6 },
  { top: '20%', left: '40%', size: 2, opacity: 0.4 },
  { top: '50%', left: '60%', size: 2, opacity: 0.5 },
];

// ── Styles ──────────────────────────────────────────────────────────────────
const HERO_HEIGHT = Math.min(SCREEN_H * 0.46, 380);

// Nút sinh trắc co theo bề ngang màn nhưng bị chặn hai đầu: máy nhỏ vẫn đủ vùng
// chạm 44pt, máy tablet không phình thành cái đĩa.
const BIO_BTN_SIZE = Math.min(Math.max(SCREEN_W * 0.24, 84), 108);
const BIO_ICON_SIZE = Math.round(BIO_BTN_SIZE * 0.55);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLUE.deep },

  // ── HERO ─────────────────────────────────────────────
  hero: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  heroBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLUE.deep,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: BLUE.primary,
    opacity: 0.5,
  },

  // Decorative blobs
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blob1: {
    width: 240, height: 240,
    backgroundColor: BLUE.glow,
    top: -60, right: -80,
  },
  blob2: {
    width: 180, height: 180,
    backgroundColor: BLUE.glowSoft,
    top: 80, left: -60,
  },
  blob3: {
    width: 110, height: 110,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: 50, right: 60,
  },
  blob4: {
    width: 70, height: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: 50, left: 30,
  },

  starDot: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  heroContent: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    justifyContent: 'flex-start',
  },
  // Hàng chứa logo (trái) + nút cờ ngôn ngữ (phải).
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  logoOuter: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Nút cờ: viên thuốc trong suốt trên nền hero, đủ tương phản cho chữ/icon trắng.
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingLeft: 10, paddingRight: 7, paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    marginTop: 4,
  },
  langFlag: { fontSize: 18, lineHeight: 22 },
  logoInner: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    padding: 3,
  },
  eyebrow: {
    fontSize: 10, fontWeight: '800',
    color: BLUE.pale, letterSpacing: 3,
    marginBottom: 8,
  },
  title: {
    fontSize: 30, fontWeight: '800',
    color: BLUE.white, letterSpacing: -0.6,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.85)',
    lineHeight: 20, fontWeight: '400',
  },
  switchUserPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    marginTop: 12,
  },
  switchUserText: {
    fontSize: 11, fontWeight: '700',
    color: BLUE.white, letterSpacing: 0.2,
  },

  // ── SHEET ────────────────────────────────────────────
  sheet: {
    flex: 1,
    backgroundColor: COLORS.bg,
    marginTop: -24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 18,
  },

  // ── Nút sinh trắc học (1 nút tròn, chỉ icon) ──────────
  bioZone: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  bioBtnWrap: {
    width: BIO_BTN_SIZE, height: BIO_BTN_SIZE,
    alignItems: 'center', justifyContent: 'center',
    display: 'flex',
  },
  bioBtn: {
    width: BIO_BTN_SIZE - 2, height: BIO_BTN_SIZE - 2,
    borderRadius: BIO_BTN_SIZE / 2,
    backgroundColor: BLUE.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  bioBtnBusy: {
    backgroundColor: BLUE.mid,
  },
  // Máy không có sinh trắc: nút xám, phẳng (bỏ đổ bóng) — trông đúng như thứ
  // không bấm được, thay vì một nút xanh bấm vào chẳng có gì xảy ra.
  bioBtnOff: {
    backgroundColor: COLORS.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  // Câu chỉ đường sang Cài đặt máy khi không có cảm biến.
  bioHint: {
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
  bioHintText: {
    fontSize: 12, color: COLORS.textMuted,
    textAlign: 'center', lineHeight: 17,
  },
  bioHintLink: {
    fontSize: 12, fontWeight: '800',
    color: BLUE.primary, marginTop: 4,
  },
  bioBtnLabel: {
    fontSize: 11, color: COLORS.textMuted,
    marginTop: 14, letterSpacing: 1.2,
  },
  // Vòng sóng lan ra khi đang xác thực — nằm DƯỚI nút nên phải to hơn khung nút.
  bioPulseRing: {
    position: 'absolute',
    width: BIO_BTN_SIZE + 10, height: BIO_BTN_SIZE + 10,
    borderRadius: (BIO_BTN_SIZE + 10) / 2,
    backgroundColor: BLUE.primary,
  },

  // ── DID badge ─────────────────────────────────────────
  didBadge: {
    flexDirection: 'row',
    backgroundColor: BLUE.glowSoft,
    borderRadius: 14,
    padding: 12, gap: 10,
    borderWidth: 1, borderColor: BLUE.pale,
    marginBottom: 14,
  },

  signUpCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: BLUE.pale,
    marginBottom: 22,
  },
  signUpIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: BLUE.glowSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  signUpTitle: {
    fontSize: 14, fontWeight: '800',
    color: COLORS.text, letterSpacing: -0.2,
  },
  signUpSub: {
    fontSize: 11, color: COLORS.textMuted, marginTop: 2,
  },
  didIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: BLUE.white,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  didTitle: {
    fontSize: 12, fontWeight: '800',
    color: BLUE.deep, marginBottom: 2,
    letterSpacing: 0.1,
  },
  didSub: {
    fontSize: 11, color: COLORS.textSub, lineHeight: 16,
  },

  // ── Events ────────────────────────────────────────────
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventsDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: BLUE.primary,
  },
  eventsTitle: {
    fontSize: 11, fontWeight: '800',
    color: BLUE.primary, letterSpacing: 1.5,
  },
  eventsMore: {
    fontSize: 11, fontWeight: '700',
    color: BLUE.primary,
  },

  eventsList: {
    paddingRight: 22,
    paddingBottom: 4,
    gap: 12,
  },
  eventCard: {
    width: SCREEN_W * 0.72,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: BLUE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 10,
    elevation: 2,
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 7, borderWidth: 1,
  },
  eventBadgeText: {
    fontSize: 9, fontWeight: '900', letterSpacing: 0.6,
  },
  eventTitle: {
    fontSize: 13, fontWeight: '800',
    color: COLORS.text, letterSpacing: -0.2,
    marginBottom: 4, lineHeight: 18,
  },
  eventSub: {
    fontSize: 11, color: COLORS.textMuted, lineHeight: 16,
  },

  // ── Footer ────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: 11, color: COLORS.textMuted, fontWeight: '500',
  },
});

export default LoginScreen;
