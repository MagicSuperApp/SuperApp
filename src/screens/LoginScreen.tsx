// screens/LoginScreen.tsx
//
// Cấu trúc:
//   ┌────────────────────────────┐
//   │  HERO blue + blob circles  │  ← branding + tiêu đề
//   ├────────────────────────────┤
//   │  Sheet trắng (uốn cong)     │
//   │  • 2 nút biometric          │
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { useAnalytics } from '../services/analytics';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { BiometricKind, phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { isAvailable as isPhoenixKeyAvailable } from '../services/phoenixKey-native';
import { loginUser } from '../store/userSlice';
import { showError } from '../utils/alert';
import LoginSuccessOverlay from '../components/LoginSuccessOverlay';
import LanguagePickerModal from '../components/LanguagePickerModal';
import { LANGUAGES, useLanguage } from '../i18n';

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
  deep:    '#1F5C2A',
  primary: '#2B7A39',
  mid:     '#3D9248',
  light:   '#7DBD89',
  pale:    '#C8E3CE',
  white:   '#FFFFFF',
  glow:    'rgba(168, 212, 176, 0.35)',
  glowSoft:'rgba(232, 245, 235, 0.45)',
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
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [busyKind, setBusyKind] = useState<BiometricKind | null>(null);
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

  const runBiometric = async (kind: BiometricKind) => {
    if (busyKind) return;
    const langCode = langMeta.code;
    const prompt =
      langCode === 'vi' ? 'Xác thực sinh trắc học' :
      langCode === 'en' ? 'Biometric Authentication' :
      '生物识别认证';
    // Ghi nhận lần nhấn nút sinh trắc + đánh dấu để đo độ trễ tới màn hình kế.
    trackPress(kind === 'face' ? 'biometric_face_button' : 'biometric_fingerprint_button', {
      action: 'login_biometric',
      metadata: { kind },
    });
    try {
      setBusyKind(kind);
      if (sensorAvailable) {
        const rn = new ReactNativeBiometrics();
        const { success } = await rn.simplePrompt({
          promptMessage: prompt, cancelButtonText: 'Huỷ',
        });
        if (!success) { setBusyKind(null); return; }
      } else {
        showError(
          'Thiết bị chưa hỗ trợ sinh trắc học. Thử lập danh tính tạm thời trên thiết bị này.',
        );
      }

      // PhoenixKey flow: unlock existing identity
      let result;
      if (isPhoenixKeyAvailable()) {
        const user = await phoenixKeyAuth.unlockExistingIdentity();
        result = user
          ? { success: true, user, message: '' }
          : { success: false, user: null, message: 'Chưa có danh tính PhoenixKey' };
      } else {
        result = { success: false, user: null, message: 'PhoenixKey không khả dụng' };
      }

      if (result.success && result.user) {
        trackAction('login_success', { metadata: { kind } });
        await dispatch(loginUser(result.user as any) as any);
        // Hiện hiệu ứng logo chớp mắt; onDone của overlay sẽ reset về Main.
        setShowSuccess(true);
      } else if (isPhoenixKeyAvailable() && !result.user) {
        // Chưa có danh tính PhoenixKey → tự động chuyển sang màn tạo tài khoản
        navigation.navigate('SignUpBiometric' as never);
      } else {
        showError(result.message);
      }
    } catch (e) {
      console.log('[Login] Biometric flow failed:', e);
      showError('Đăng nhập sinh trắc học thất bại');
    } finally {
      setBusyKind(null);
    }
  };

  const hasFaceId = biometryType === BiometryTypes.FaceID;
  const hasTouchId = biometryType === BiometryTypes.TouchID;
  const isGenericBiometric =
    biometryType === BiometryTypes.Biometrics || (!hasFaceId && !hasTouchId);

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
          <Text allowFontScaling={false} style={styles.eyebrow}>ALADIN · PHOENIXKEY DID</Text>
          <Text allowFontScaling={false} style={styles.title}>
            {activeUser ? `Chào @${activeUser.username}` : 'Chào mừng trở lại'}
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

        {/* Biometric grid */}
        <Animated.View
          style={[
            styles.bioGrid,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <BioButton
            icon="face-recognition"
            title="Khuôn mặt"
            subtitle={hasFaceId ? 'Face ID' : 'Quét khuôn mặt'}
            busy={busyKind === 'face'}
            disabled={busyKind !== null}
            onPress={() => runBiometric('face')}
          />
          <BioButton
            icon="fingerprint"
            title="Vân tay"
            subtitle={
              hasTouchId
                ? 'Touch ID'
                : isGenericBiometric
                ? 'Sinh trắc học'
                : 'Quét vân tay'
            }
            busy={busyKind === 'fingerprint'}
            disabled={busyKind !== null}
            onPress={() => runBiometric('fingerprint')}
          />
        </Animated.View>

        {/* DID badge */}
        <View style={styles.didBadge}>
          <View style={styles.didIconWrap}>
            <Icon name="shield-check" size={14} color={BLUE.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.didTitle} allowFontScaling={false}>
              Định danh phi tập trung (DID)
            </Text>
            <Text style={styles.didSub} allowFontScaling={false}>
              Khóa riêng được giữ trên thiết bị bằng PhoenixKey · Không có máy chủ nào lưu mật khẩu của bạn.
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

const BioButton: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}> = ({ icon, title, subtitle, busy, disabled, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (busy) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1, duration: 800, useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0, duration: 800, useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [busy]);

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1], outputRange: [0, 0.4],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1], outputRange: [1, 1.25],
  });

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        disabled={disabled}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1, friction: 4, useNativeDriver: true,
          }).start()
        }
        onPress={onPress}
        style={[styles.bioBtn, busy && styles.bioBtnBusy]}
      >
        <View style={styles.bioIconOuter}>
          <Animated.View
            style={[
              styles.bioPulseRing,
              { opacity: ringOpacity, transform: [{ scale: ringScale }] },
            ]}
          />
          <View style={styles.bioIconWrap}>
            <Icon name={icon} size={36} color={BLUE.primary} />
          </View>
        </View>
        <Text allowFontScaling={false} style={styles.bioTitle}>{title}</Text>
        <Text allowFontScaling={false} style={styles.bioSub}>{subtitle}</Text>
        {busy && (
          <Text allowFontScaling={false} style={styles.bioBusy}>
            Đang xác thực…
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
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
  { top: '8%',  left: '15%', size: 3, opacity: 0.5 },
  { top: '14%', left: '78%', size: 4, opacity: 0.7 },
  { top: '32%', left: '88%', size: 2, opacity: 0.5 },
  { top: '40%', left: '10%', size: 3, opacity: 0.6 },
  { top: '20%', left: '40%', size: 2, opacity: 0.4 },
  { top: '50%', left: '60%', size: 2, opacity: 0.5 },
];

// ── Styles ──────────────────────────────────────────────────────────────────
const HERO_HEIGHT = Math.min(SCREEN_H * 0.46, 380);

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

  // ── Bio buttons ───────────────────────────────────────
  bioGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  bioBtn: {
    backgroundColor: '#618db318',
    borderRadius: 18,
    paddingVertical: 20, paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: "transparent",
    elevation: 4,
  },
  bioBtnBusy: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.glowSoft,
  },
  bioIconOuter: {
    width: 64, height: 64,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, position: 'relative',
  },
  bioPulseRing: {
    position: 'absolute',
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: BLUE.primary,
  },
  bioIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: BLUE.glow,
    borderWidth: 1, borderColor: BLUE.pale,
    alignItems: 'center', justifyContent: 'center',
  },
  bioTitle: {
    fontSize: 15, fontWeight: '800',
    color: COLORS.text, letterSpacing: -0.2,
  },
  bioSub: {
    fontSize: 11, color: COLORS.textMuted, marginTop: 3,
  },
  bioBusy: {
    fontSize: 10, color: BLUE.primary,
    fontWeight: '700', marginTop: 6, letterSpacing: 0.4,
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
