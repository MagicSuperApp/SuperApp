// features/auth/screens/SignUpBiometricScreen.tsx
//
// BƯỚC 1/3 — Sinh trắc học (BẮT BUỘC).
// Đây KHÔNG phải xác thực — đây là tác nhân kích hoạt chip bảo mật trên thiết bị
// để sinh khóa phần cứng. Không có sinh trắc học = không có khóa = không tạo được tài khoản.
// Không có fallback.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Animated, Easing, Platform, ActivityIndicator,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_BLUE } from '../theme';
import StepIndicator from '../components/StepIndicator';
import { showError } from '../../../utils/alert';
import { biometricKindFromType, phoenixKeyAuth } from '../../../services/phoenixKeyAuthService';
import { loginUser } from '../../../store/userSlice';
import { useDispatch } from 'react-redux';

// PhoenixUser local registry — sẽ sync lên api.phoenixkey.me khi backend production sẵn sàng.
// Mỗi entry: { username, did, createdAt }.
const PHOENIX_USERS_KEY = '@phoenixkey/users';
const ACTIVE_USERNAME_KEY = '@phoenixkey/active_username';

// Username rules: lowercase a-z, digit 0-9, underscore; bắt đầu bằng chữ; 3-20 ký tự.
const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

type Stage =
  | 'idle'
  | 'prompting'    // OS biometric prompt
  | 'generating'   // sinh khóa trong Secure Enclave
  | 'done';

const SignUpBiometricScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();

  const [biometryType, setBiometryType] = useState<string>('');
  const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [username, setUsername] = useState('');
  const [existingUsernames, setExistingUsernames] = useState<string[]>([]);

  // Load danh sách username đã đăng ký trên thiết bị (để chặn trùng).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PHOENIX_USERS_KEY);
        if (raw) {
          const users = JSON.parse(raw) as Array<{ username: string }>;
          setExistingUsernames(users.map(u => u.username));
        }
      } catch (e) {
        console.log('[SignUp] Load existing users failed:', e);
      }
    })();
  }, []);

  const usernameTrim = username.trim().toLowerCase();
  const usernameStatus = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (usernameTrim.length === 0) return { ok: false };
    if (!USERNAME_REGEX.test(usernameTrim)) {
      return {
        ok: false,
        reason: 'Username 3–20 ký tự, bắt đầu bằng chữ thường, chỉ chứa a-z, 0-9, _',
      };
    }
    if (existingUsernames.includes(usernameTrim)) {
      return { ok: false, reason: 'Username này đã được đăng ký trên thiết bị' };
    }
    return { ok: true };
  }, [usernameTrim, existingUsernames]);

  const ringPulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, {
          toValue: 1, duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ringPulse, {
          toValue: 0, duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    (async () => {
      try {
        const rn = new ReactNativeBiometrics();
        const { available, biometryType: type } = await rn.isSensorAvailable();
        setSensorAvailable(available);
        setBiometryType(type || '');
      } catch (e) {
        console.log('[SignUp] Biometric sensor check failed:', e);
        setSensorAvailable(false);
      }
    })();
  }, []);

  const startEnrollment = async () => {
    if (stage !== 'idle') return;

    if (!usernameStatus.ok) {
      showError(usernameStatus.reason || 'Vui lòng nhập username hợp lệ trước khi xác thực.');
      return;
    }

    if (!sensorAvailable) {
      showError(
        'Thiết bị này chưa thiết lập sinh trắc học. Vui lòng bật Face ID / vân tay trong cài đặt của thiết bị, sau đó thử lại. Không có cách thay thế cho bước này.'
      );
      return;
    }

    setStage('prompting');
    try {
      const rn = new ReactNativeBiometrics();
      const { success } = await rn.simplePrompt({
        promptMessage: 'Kích hoạt chip bảo mật để sinh khóa',
        cancelButtonText: 'Huỷ',
      });
      if (!success) {
        setStage('idle');
        return;
      }
    } catch (_) {
      setStage('idle');
      return;
    }

    setStage('generating');

    try {
      // Loại sinh-trắc suy từ CẢM BIẾN THẬT, không từ nút. `hasFaceId ? 'face' :
      // 'fingerprint'` cũ gán nhầm 'fingerprint' cho máy Android chỉ báo
      // `Biometrics` (đúng ra là 'strong') — nhãn khoá sai so với thứ đã xảy ra.
      const { user } = await phoenixKeyAuth.registerIdentity(
        biometricKindFromType(biometryType),
      );
      const newEntry = { username: usernameTrim, did: user.did, createdAt: Date.now() };
      const raw = await AsyncStorage.getItem(PHOENIX_USERS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const nextList = list.filter((item: { username: string }) => item.username !== usernameTrim);
      nextList.push(newEntry);
      await AsyncStorage.setItem(PHOENIX_USERS_KEY, JSON.stringify(nextList));
      await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, usernameTrim);
      await dispatch(loginUser({ ...user, name: usernameTrim } as any) as any);
      setStage('done');
      setTimeout(
        () => navigation.navigate('SignUpComplete', { username: usernameTrim, user: { ...user, name: usernameTrim } }),
        600,
      );
    } catch (e: any) {
      console.log('[SignUp] PhoenixKey enrollment failed:', e);
      showError(e?.message || 'Không tạo được danh tính PhoenixKey. Vui lòng thử lại.');
      setStage('idle');
    }
  };

  const hasFaceId = biometryType === BiometryTypes.FaceID;
  const hasTouchId = biometryType === BiometryTypes.TouchID;
  const biometricLabel =
    hasFaceId ? 'Face ID' :
    hasTouchId ? 'Touch ID' :
    sensorAvailable ? 'Sinh trắc học' : null;

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_BLUE.bgSoft} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          disabled={stage !== 'idle'}
        >
          <Icon name="chevron-left" size={22} color={AUTH_BLUE.text} />
        </TouchableOpacity>
        <StepIndicator current={1} total={3} />
      </View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fade, transform: [{ translateY: slide }] },
        ]}
      >
        <Text style={styles.eyebrow}>TẠO DANH TÍNH</Text>
        {/* Tách '+ ' thành node RIÊNG: lớp autoText tra từ điển theo TỪNG child là
            chuỗi, nên để nguyên '+ Sinh trắc học' thì cả cụm không khớp khoá nào và
            lọt ra màn bằng tiếng Việt. */}
        <Text style={styles.title}>Tên đăng nhập{'\n'}{'+ '}Sinh trắc học</Text>
        <Text style={styles.subtitle}>
          Chọn tên đăng nhập (PhoenixUser), sau đó kích hoạt chip bảo mật bằng
          sinh trắc học. Khóa riêng sinh ngay trong chip và{' '}
          <Text style={styles.bold}>không bao giờ rời thiết bị</Text>.
        </Text>

        {/* Username input */}
        <View style={styles.usernameBox}>
          <View style={styles.usernameRow}>
            <Text style={styles.usernameAt}>@</Text>
            <TextInput
              style={styles.usernameInput}
              value={username}
              onChangeText={text => setUsername(text.replace(/\s/g, '').toLowerCase())}
              placeholder="ten_dang_nhap"
              placeholderTextColor={AUTH_BLUE.textSub}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={stage === 'idle'}
              allowFontScaling={false}
            />
            {usernameStatus.ok && (
              <Icon name="check-circle" size={18} color={AUTH_BLUE.primary} />
            )}
          </View>
          {usernameTrim.length > 0 && !usernameStatus.ok && usernameStatus.reason && (
            <Text style={styles.usernameError}>{usernameStatus.reason}</Text>
          )}
          {usernameTrim.length === 0 && (
            <Text style={styles.usernameHint}>
              3–20 ký tự · chữ thường, số, dấu _ · không thể trùng trong toàn hệ sinh thái
            </Text>
          )}
        </View>

        {/* Big animated icon */}
        <View style={styles.iconWrap}>
          <Animated.View
            style={[
              styles.ringPulse,
              { opacity: ringOpacity, transform: [{ scale: ringScale }] },
            ]}
          />
          <View style={styles.iconCircle}>
            <Icon
              name={hasFaceId ? 'face-recognition' : 'fingerprint'}
              size={56}
              color={AUTH_BLUE.primary}
            />
          </View>
        </View>

        {/* Sensor status */}
        <View style={styles.sensorPill}>
          {sensorAvailable === null ? (
            <>
              <ActivityIndicator size="small" color={AUTH_BLUE.primary} />
              <Text style={styles.sensorText}>Đang kiểm tra cảm biến…</Text>
            </>
          ) : sensorAvailable ? (
            <>
              <Icon name="check-circle" size={14} color={AUTH_BLUE.primary} />
              <Text style={styles.sensorText}>
                Thiết bị hỗ trợ: <Text style={styles.bold}>{biometricLabel}</Text>
              </Text>
            </>
          ) : (
            <>
              <Icon name="alert-circle" size={14} color="#C0533A" />
              <Text style={[styles.sensorText, { color: '#C0533A' }]}>
                Thiết bị chưa thiết lập sinh trắc học
              </Text>
            </>
          )}
        </View>

        {/* Mandatory notice */}
        <View style={styles.noticeBox}>
          <Icon name="shield-key-outline" size={16} color={AUTH_BLUE.primary} />
          <Text style={styles.noticeText}>
            Bước này <Text style={styles.bold}>bắt buộc</Text> — không có cách thay thế.
            Không có sinh trắc học → không có khóa → không tạo được tài khoản.
          </Text>
        </View>

        {/* Pipeline feedback */}
        {stage === 'generating' && (
          <View style={styles.pipelineBox}>
            <ActivityIndicator size="small" color={AUTH_BLUE.primary} />
            <Text style={styles.pipelineText}>Đang sinh khóa trong chip bảo mật…</Text>
          </View>
        )}
        {stage === 'done' && (
          <View style={styles.doneBox}>
            <Icon name="check-decagram" size={18} color={AUTH_BLUE.primary} />
            <Text style={styles.doneText}>Đã sinh khóa thành công.</Text>
          </View>
        )}
      </Animated.View>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={startEnrollment}
          disabled={stage !== 'idle' || !usernameStatus.ok}
          style={[
            styles.btnPrimary,
            (stage !== 'idle' || !usernameStatus.ok) && styles.btnDisabled,
          ]}
        >
          <Icon
            name={hasFaceId ? 'face-recognition' : 'fingerprint'}
            size={18}
            color={AUTH_BLUE.white}
          />
          <Text style={styles.btnPrimaryText}>
            {stage === 'prompting'
              ? 'Đang chờ xác thực…'
              : stage === 'generating'
              ? 'Đang sinh khóa…'
              : stage === 'done'
              ? 'Đã xong'
              : 'Bắt đầu xác thực sinh trắc học'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={stage !== 'idle'}
          hitSlop={8}
        >
          <Text style={styles.linkText}>Tôi đã có tài khoản — Đăng nhập</Text>
        </TouchableOpacity>
        {/* Đọc được TRƯỚC khi lập danh tính, không phải sau. Bước kế tiếp sinh một cặp
            khoá không khôi phục hộ được — người dùng có quyền biết điều đó trước khi bấm,
            và chỉ mục ở màn Tôi thì phải đăng nhập xong mới tới được. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Terms' as never)}
          disabled={stage !== 'idle'}
          hitSlop={8}
        >
          <Text style={styles.linkTextMuted}>Điều khoản & Chính sách</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const delay = (ms: number) => new Promise<void>(r => setTimeout(() => r(), ms));

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_BLUE.bgSoft },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: AUTH_BLUE.white,
    borderWidth: 1, borderColor: AUTH_BLUE.border,
    alignItems: 'center', justifyContent: 'center',
  },

  content: { flex: 1, paddingHorizontal: 22, paddingTop: 12 },

  eyebrow: {
    fontSize: 10, fontWeight: '800',
    color: AUTH_BLUE.primary, letterSpacing: 2.2,
    marginBottom: 8,
  },
  title: {
    fontSize: 28, fontWeight: '800',
    color: AUTH_BLUE.text, lineHeight: 34,
    letterSpacing: -0.5, marginBottom: 12,
  },
  subtitle: {
    fontSize: 13, color: AUTH_BLUE.textSub,
    lineHeight: 20, marginBottom: 28,
  },
  bold: { fontWeight: '800', color: AUTH_BLUE.text },

  iconWrap: {
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 8,
  },
  ringPulse: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: AUTH_BLUE.primary,
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 100,
    backgroundColor: AUTH_BLUE.white,
    borderWidth: 2, borderColor: AUTH_BLUE.pale,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AUTH_BLUE.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 16,
    elevation: 6,
  },

  usernameBox: {
    marginBottom: 18,
  },
  usernameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: AUTH_BLUE.white,
    borderWidth: 1.5, borderColor: AUTH_BLUE.pale,
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  usernameAt: {
    fontSize: 17, fontWeight: '800', color: AUTH_BLUE.primary,
  },
  usernameInput: {
    flex: 1,
    fontSize: 15, fontWeight: '700',
    color: AUTH_BLUE.text,
    padding: 0,
    letterSpacing: 0.2,
  },
  usernameError: {
    fontSize: 11, color: '#C0533A',
    fontWeight: '600',
    marginTop: 6, marginLeft: 4,
  },
  usernameHint: {
    fontSize: 11, color: AUTH_BLUE.textSub,
    marginTop: 6, marginLeft: 4,
  },
  sensorPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: AUTH_BLUE.glowSoft,
    borderWidth: 1, borderColor: AUTH_BLUE.pale,
    marginTop: 22, marginBottom: 18,
  },
  sensorText: { fontSize: 12, color: AUTH_BLUE.textSub, fontWeight: '600' },

  noticeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: AUTH_BLUE.white,
    padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: AUTH_BLUE.border,
  },
  noticeText: {
    flex: 1, fontSize: 12, color: AUTH_BLUE.textSub, lineHeight: 18,
  },

  pipelineBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: AUTH_BLUE.glowSoft,
    padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: AUTH_BLUE.pale,
    marginTop: 14,
  },
  pipelineText: { flex: 1, fontSize: 12, color: AUTH_BLUE.deep, fontWeight: '700' },

  doneBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E6F4EC',
    padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#BFE0CF',
    marginTop: 14,
  },
  doneText: { flex: 1, fontSize: 12, color: '#2A5A44', fontWeight: '700' },

  actionBar: {
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    paddingTop: 12,
    gap: 14,
  },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: AUTH_BLUE.primary,
    shadowColor: AUTH_BLUE.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30, shadowRadius: 14,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: {
    fontSize: 14, fontWeight: '800',
    color: AUTH_BLUE.white, letterSpacing: 0.3,
  },
  linkText: {
    fontSize: 12, fontWeight: '700',
    color: AUTH_BLUE.primary, textAlign: 'center',
  },
  linkTextMuted: {
    marginTop: 10, fontSize: 11, fontWeight: '600',
    color: AUTH_BLUE.textMuted, textAlign: 'center',
  },
});

export default SignUpBiometricScreen;
