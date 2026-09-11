// features/auth/screens/SignUpCompleteScreen.tsx
//
// BƯỚC 3/3 — Hoàn tất.
//
// ⛔ ĐÍNH CHÍNH 2026-08-28 — màn này từng NÓI MỘT VIỆC KHÔNG XẢY RA.
//
// Chú thích cũ ở đây viết: "Mô phỏng pipeline: sinh DID → mã hóa Recovery Blob →
// phân mảnh & phân tán lên các node mạng (≥ 12 node)". Hai chữ "mô phỏng" là
// thật, phần còn lại thì không: bốn bước hiện ra là hoạt hình chạy bằng đồng hồ
// đếm (700/900/800/1200 ms). Trong tệp này có **0 lệnh mã hoá và 0 lời gọi
// mạng** — đo bằng grep `encrypt|fetch|axios|shamir|split`: 0 kết quả. Và cơ chế
// "12 node" không tồn tại ở bất kỳ đâu trong `src/`.
//
// Nặng nhất là hai câu từng nằm cách nhau mười hai dòng trên CÙNG màn hình:
//   · cảnh báo: "Bạn chưa liên kết khôi phục"
//   · chân trang: "Dữ liệu khôi phục được phân tán an toàn trên mạng"
// Người dùng đọc câu dưới rồi rời màn hình tin rằng đã có đường khôi phục. Họ
// CHƯA có. Mất máy là mất danh tính, và họ chỉ biết vào đúng lúc mất máy.
//
// Hai lối ra: làm thật việc màn hình đang diễn, hoặc sửa câu chữ cho khớp việc
// thật. Không có lối thứ ba là để nguyên. Chọn lối thứ hai — "12 node" là một hệ
// chưa ai xây, còn lời nói dối thì đang ở trên tay người dùng hôm nay.
//
// Nay màn chỉ nói hai việc CÓ THẬT (khoá sinh trong chip, danh tính đã tạo ở màn
// trước), rồi nói thẳng rằng chưa có đường khôi phục nào.

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
import { useBottomActionPadding } from '../../../hooks/useBottomActionPadding';
import { useTk } from '../../../i18n/keys';
import {
  markSeedBackupDeferred,
  clearSeedBackupDeferred,
} from '../../../services/seedBackupReminder';

type StepStatus = 'pending' | 'processing' | 'done';

interface Step {
  icon: string;
  title: string;
  detail: string;
  durationMs: number;
}

// Chỉ còn hai bước, và cả hai đều mô tả việc ĐÃ XẢY RA THẬT ở màn trước
// (`SignUpBiometricScreen` → `phoenixKeyAuthService`), không phải việc màn này
// làm. Nên lời của chúng ở thì hoàn thành, không phải thì đang diễn ra.
//
// ⛔ ĐỪNG thêm bước mới vào đây để màn "trông đầy đặn hơn". Mỗi dòng ở danh sách
//    này là một lời khẳng định với người dùng về thứ bảo vệ danh tính của họ.
//    Thêm một dòng thì phải chỉ ra được đoạn mã làm đúng việc dòng đó nói.
const STEPS: Step[] = [
  {
    icon: 'shield-key-outline',
    title: 'Khoá riêng nằm trong chip bảo mật',
    detail: 'Khoá không rời khỏi máy, và không xuất ra được',
    durationMs: 700,
  },
  {
    icon: 'identifier',
    title: 'Danh tính đã được tạo',
    detail: 'Khoá công khai đã ghi vào danh sách khoá được phép',
    durationMs: 900,
  },
];

const SignUpCompleteScreen: React.FC = () => {
  const bottomPad = useBottomActionPadding();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch();
  const tk = useTk();
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

  /**
   * ── Bước sao lưu: KHÔNG ép, nhưng KHÔNG giấu ─────────────────────────────
   * Trước bản này luồng đăng ký không đi qua `SeedExport` một lần nào, nên phần
   * lớn người dùng chưa từng nhìn thấy cụm 24 từ của mình — đường khôi phục có
   * tồn tại mà họ không có vé vào.
   *
   * ⛔ ĐỪNG thêm lại ô đánh dấu "tôi đã ghi lại đủ 24 từ" rồi chặn nút. Bản
   *    trước có đúng thứ đó và đã bị GỠ CÓ CHỦ Ý — xem khối chú thích đầu
   *    `screens/SeedExportScreen.tsx`: cụm 24 từ là bản sao KHÔNG THU HỒI ĐƯỢC
   *    của toàn bộ ví, nên buộc người dùng khai đã làm một việc nguy hiểm thì
   *    mới thoát ra được là đẩy họ vào đúng chỗ nguy hiểm đó.
   *
   * `SeedExport` nằm sau cổng sinh trắc (`navigation/authGate.tsx`), và tới màn
   * này thì phiên đã có: `SignUpBiometricScreen` dispatch `loginUser` TRƯỚC khi
   * điều hướng sang đây.
   */
  const openBackup = () => {
    void clearSeedBackupDeferred();
    navigation.navigate('SeedExport');
  };

  const deferBackup = () => {
    // Ghi mốc rồi vào app. `void` có chủ ý: người dùng không phải chờ một lượt
    // ghi đĩa để bấm được nút, và lần ghi hỏng KHÔNG được chặn đường vào app.
    void markSeedBackupDeferred();
    enterApp();
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
                Khoá riêng không bao giờ rời thiết bị này.
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
                Hãy lưu cụm 24 từ trong phần Tài khoản ngay khi có thể — hôm nay đó là
                cách duy nhất khôi phục được nếu mất thiết bị.
              </Text>
            </View>
          </View>
        )}

        {/* Chân trang — chỉ nói việc đã xảy ra. Câu cũ ở đây ("Dữ liệu khôi
            phục được phân tán an toàn trên mạng") mâu thuẫn thẳng với ô cảnh báo
            ngay bên trên, và nó là câu người dùng tin rồi bỏ qua bước lưu. */}
        <Text style={styles.footnote}>
          Tài khoản của bạn không phụ thuộc vào bất kỳ máy chủ trung tâm nào — nên
          cũng không có máy chủ nào khôi phục hộ bạn được. Đường khôi phục duy nhất
          là thứ chính bạn lưu lại.
        </Text>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Action — hai nút, và cả hai đều VÀO ĐƯỢC app. Không nút nào bị chặn sau
          một lời khai, xem chú thích ở `openBackup`. */}
      <View style={[styles.actionBar, { paddingBottom: bottomPad }]}>
        {allDone ? (
          <>
            <Text style={styles.backupTitle}>{tk('identity.backup.title')}</Text>
            <Text style={styles.backupBody}>{tk('identity.backup.body')}</Text>
            <TouchableOpacity
              testID="signup-backup-now"
              activeOpacity={0.85}
              onPress={openBackup}
              style={styles.btnPrimary}
            >
              <Icon name="shield-key-outline" size={18} color={AUTH_BLUE.white} />
              <Text style={styles.btnPrimaryText}>{tk('identity.backup.now')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="signup-backup-later"
              activeOpacity={0.7}
              onPress={deferBackup}
              style={styles.btnGhost}
            >
              <Text style={styles.btnGhostText}>{tk('identity.backup.later')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled
            style={[styles.btnPrimary, styles.btnDisabled]}
          >
            <Icon name="arrow-right-circle-outline" size={18} color={AUTH_BLUE.white} />
            <Text style={styles.btnPrimaryText}>Đang xử lý…</Text>
          </TouchableOpacity>
        )}
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
    // Icon này chỉ hiện lúc đang chạy một bước, rồi bị gỡ khỏi cây. Không dừng vòng
    // lặp thì mỗi lần hiện lại để lại một vòng quay mãi.
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: 1400, useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
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

  // ── Bước sao lưu ──────────────────────────────────────────────────────────
  backupTitle: {
    fontSize: 14, fontWeight: '800',
    color: AUTH_BLUE.text, letterSpacing: -0.2,
    lineHeight: 20, marginBottom: 6,
  },
  backupBody: {
    fontSize: 12, color: AUTH_BLUE.textSub,
    lineHeight: 18, marginBottom: 14,
  },
  // Nút thứ hai KHÔNG bị làm mờ đi: "để sau" là một lựa chọn hợp lệ, không phải
  // một lựa chọn kém. Làm nó nhạt hơn là ép bằng thị giác thứ mà màn này cố ý
  // không ép bằng luật.
  btnGhost: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 8,
  },
  btnGhostText: {
    fontSize: 13, fontWeight: '700', color: AUTH_BLUE.textSub,
  },
});

export default SignUpCompleteScreen;
