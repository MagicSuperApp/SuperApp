// features/auth/screens/SignUpCompleteScreen.tsx
//
// BƯỚC 3/3 — Hoàn tất.
// Mô phỏng pipeline: sinh DID → mã hóa Recovery Blob → phân mảnh & phân tán
// lên các node mạng (≥ 12 node). KHÔNG có bản sao tập trung trên cloud nào.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Animated, Easing, Platform, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { AUTH_BLUE } from '../theme';
import StepIndicator from '../components/StepIndicator';
import { loginUser } from '../../../store/userSlice';

type StepStatus = 'pending' | 'processing' | 'done';

interface Step {
  icon: string;
  title: string;
  detail: string;
  durationMs: number;
}

const STEPS: Step[] = [
  {
    icon: 'shield-key-outline',
    title: 'Sinh khóa phần cứng',
    detail: 'Khóa riêng nằm trong chip bảo mật, không thể xuất',
    durationMs: 700,
  },
  {
    icon: 'identifier',
    title: 'Tạo định danh DID',
    detail: 'Public key được ghi vào danh sách khóa được phép',
    durationMs: 900,
  },
  {
    icon: 'lock-outline',
    title: 'Mã hoá dữ liệu khôi phục',
    detail: 'Mã hoá mạnh bằng khoá lấy từ thiết bị của bạn',
    durationMs: 800,
  },
  {
    icon: 'access-point-network',
    title: 'Chia nhỏ & lưu trên nhiều thiết bị',
    detail: 'Lưu trên ít nhất 12 thiết bị — không có bản sao tập trung',
    durationMs: 1200,
  },
];

const SignUpCompleteScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch();
  const recoveryLinked: boolean = route.params?.recoveryLinked ?? false;

  const [statuses, setStatuses] = useState<StepStatus[]>(
    STEPS.map(() => 'pending'),
  );
  const allDone = statuses.every(s => s === 'done');

  const checkScale = useRef(new Animated.Value(0)).current;
  const checkRotate = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // Run pipeline sequentially
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return;
        setStatuses(prev =>
          prev.map((s, idx) => (idx === i ? 'processing' : s)),
        );
        await delay(STEPS[i].durationMs);
        if (cancelled) return;
        setStatuses(prev =>
          prev.map((s, idx) => (idx === i ? 'done' : s)),
        );
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Big check animation when allDone
  useEffect(() => {
    if (!allDone) return;
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1, friction: 4, tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(checkRotate, {
        toValue: 1, duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1, duration: 500, useNativeDriver: true,
      }),
    ]).start();
  }, [allDone]);

  const enterApp = () => {
    const user = route.params?.user;
    if (user) {
      dispatch(loginUser(user as any) as any);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
  };

  const checkRotateDeg = checkRotate.interpolate({
    inputRange: [0, 1], outputRange: ['-30deg', '0deg'],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_BLUE.bgSoft} />

      <View style={styles.header}>
        <View style={styles.iconBtnPlaceholder} />
        <StepIndicator current={3} total={3} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Animated.View
            style={[
              styles.checkOuter,
              {
                opacity: allDone ? 1 : 0.4,
                transform: [
                  { scale: allDone ? checkScale : 0.9 },
                  { rotate: checkRotateDeg },
                ],
              },
            ]}
          >
            <View style={styles.checkInner}>
              <Icon
                name={allDone ? 'check-decagram' : 'progress-clock'}
                size={56}
                color={AUTH_BLUE.primary}
              />
            </View>
          </Animated.View>

          {allDone ? (
            <Animated.View style={{ opacity: successOpacity, alignItems: 'center' }}>
              <Text style={styles.heroTitle}>Tài khoản đã sẵn sàng</Text>
              <Text style={styles.heroSub}>
                Danh tính của bạn đã được tạo và bảo vệ. Khóa riêng không bao giờ rời thiết bị.
              </Text>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.heroTitle}>Đang khởi tạo tài khoản</Text>
              <Text style={styles.heroSub}>
                Vui lòng giữ ứng dụng mở cho tới khi hoàn tất.
              </Text>
            </>
          )}
        </View>

        {/* Pipeline checklist */}
        <View style={styles.list}>
          {STEPS.map((s, i) => (
            <StepRow
              key={i}
              icon={s.icon}
              title={s.title}
              detail={s.detail}
              status={statuses[i]}
              isLast={i === STEPS.length - 1}
            />
          ))}
        </View>

        {/* Recovery reminder if skipped */}
        {!recoveryLinked && allDone && (
          <View style={styles.reminderBox}>
            <Icon name="alert-outline" size={18} color="#B07D2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>Bạn chưa liên kết khôi phục</Text>
              <Text style={styles.reminderText}>
                Hãy thiết lập Người bảo hộ hoặc lưu Seed Phrase trong phần Tài khoản
                ngay khi có thể — đó là cách duy nhất để khôi phục nếu mất thiết bị.
              </Text>
            </View>
          </View>
        )}

        {/* Footnote */}
        <Text style={styles.footnote}>
          Tài khoản của bạn không phụ thuộc vào bất kỳ máy chủ trung tâm nào.
          Dữ liệu khôi phục được phân tán an toàn trên mạng — chỉ bạn có thể giải mã.
        </Text>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Action */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={enterApp}
          disabled={!allDone}
          style={[styles.btnPrimary, !allDone && styles.btnDisabled]}
        >
          <Icon name="arrow-right-circle-outline" size={18} color={AUTH_BLUE.white} />
          <Text style={styles.btnPrimaryText}>
            {allDone ? 'Vào ứng dụng' : 'Đang xử lý…'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Step row ────────────────────────────────────────────────────────────────
const StepRow: React.FC<{
  icon: string; title: string; detail: string;
  status: StepStatus; isLast: boolean;
}> = ({ icon, title, detail, status, isLast }) => {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status !== 'pending') {
      Animated.timing(fade, {
        toValue: 1, duration: 350, useNativeDriver: true,
      }).start();
    }
  }, [status]);

  const isProcessing = status === 'processing';
  const isDone = status === 'done';

  return (
    <Animated.View
      style={[
        styles.stepRow,
        !isLast && styles.stepRowBorder,
        { opacity: status === 'pending' ? 0.5 : fade },
      ]}
    >
      <View
        style={[
          styles.stepIcon,
          isDone && styles.stepIconDone,
          isProcessing && styles.stepIconProcessing,
        ]}
      >
        {isDone ? (
          <Icon name="check" size={16} color={AUTH_BLUE.white} />
        ) : isProcessing ? (
          <SpinningIcon name={icon} />
        ) : (
          <Icon name={icon} size={16} color={AUTH_BLUE.textMuted} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.stepTitle,
            isDone && { color: AUTH_BLUE.text },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.stepDetail}>{detail}</Text>
      </View>
      {isProcessing && <Text style={styles.processingText}>…</Text>}
    </Animated.View>
  );
};

const SpinningIcon: React.FC<{ name: string }> = ({ name }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: 1400, useNativeDriver: true,
      }),
    ).start();
  }, []);
  const rot = spin.interpolate({
    inputRange: [0, 1], outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View style={{ transform: [{ rotate: rot }] }}>
      <Icon name={name} size={16} color={AUTH_BLUE.primary} />
    </Animated.View>
  );
};

// ── helpers ─────────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise<void>(r => setTimeout(() => r(), ms));

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_BLUE.bgSoft },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 10,
  },
  iconBtnPlaceholder: { width: 36, height: 36 },

  scroll: { paddingHorizontal: 22, paddingTop: 12 },

  hero: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  checkOuter: {
    width: 120, height: 120, borderRadius: 36,
    backgroundColor: AUTH_BLUE.glowSoft,
    borderWidth: 2, borderColor: AUTH_BLUE.pale,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    shadowColor: AUTH_BLUE.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20, shadowRadius: 18,
    elevation: 6,
  },
  checkInner: {
    width: 100, height: 100, borderRadius: 30,
    backgroundColor: AUTH_BLUE.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 24, fontWeight: '800',
    color: AUTH_BLUE.text, letterSpacing: -0.4,
    marginBottom: 8, textAlign: 'center',
  },
  heroSub: {
    fontSize: 13, color: AUTH_BLUE.textSub,
    lineHeight: 19, textAlign: 'center',
    paddingHorizontal: 8,
  },

  list: {
    backgroundColor: AUTH_BLUE.white,
    borderRadius: 16,
    borderWidth: 1, borderColor: AUTH_BLUE.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  stepRowBorder: {
    borderBottomWidth: 1, borderBottomColor: AUTH_BLUE.border,
  },
  stepIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: AUTH_BLUE.bgSoft,
    borderWidth: 1, borderColor: AUTH_BLUE.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: AUTH_BLUE.primary,
    borderColor: AUTH_BLUE.primary,
  },
  stepIconProcessing: {
    backgroundColor: AUTH_BLUE.glowSoft,
    borderColor: AUTH_BLUE.pale,
  },
  stepTitle: {
    fontSize: 13, fontWeight: '700',
    color: AUTH_BLUE.textSub, letterSpacing: -0.1,
    marginBottom: 3,
  },
  stepDetail: { fontSize: 11, color: AUTH_BLUE.textMuted, lineHeight: 15 },
  processingText: {
    fontSize: 16, color: AUTH_BLUE.primary, fontWeight: '800',
  },

  reminderBox: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#FFF6E6',
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#F0DBB5',
    marginBottom: 14,
  },
  reminderTitle: {
    fontSize: 12, fontWeight: '800',
    color: '#8E5D26', marginBottom: 4,
  },
  reminderText: { fontSize: 11, color: '#6F4720', lineHeight: 16 },

  footnote: {
    fontSize: 11, color: AUTH_BLUE.textMuted, textAlign: 'center',
    lineHeight: 17, marginTop: 4,
  },

  actionBar: {
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    paddingTop: 12,
    backgroundColor: AUTH_BLUE.bgSoft,
    borderTopWidth: 1, borderTopColor: AUTH_BLUE.border,
  },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: AUTH_BLUE.primary,
    shadowColor: AUTH_BLUE.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30, shadowRadius: 14,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  btnPrimaryText: {
    fontSize: 14, fontWeight: '800',
    color: AUTH_BLUE.white, letterSpacing: 0.3,
  },
});

export default SignUpCompleteScreen;
