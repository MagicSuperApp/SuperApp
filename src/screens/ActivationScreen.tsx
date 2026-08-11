// screens/ActivationScreen.tsx

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectChainWallet } from '../store/userSlice';
import { COLORS } from '../constants';
import { fmtLamp, fmtCarp } from '../utils/token';

const { width, height } = Dimensions.get('window');

// ── QR Scanner Frame ──────────────────────────────────────────────────────────
const QRFrame = ({ scanning }: { scanning: boolean }) => {
  const scanAnim   = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const cornerSize = 22;

  useEffect(() => {
    if (scanning) {
      Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1, duration: 2000, useNativeDriver: true,
        })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
        ])
      ).start();
    } else {
      scanAnim.stopAnimation();
      glowAnim.stopAnimation();
    }
  }, [scanning]);

  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 180],
  });
  const borderCol = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  });

  const Corner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => {
    const borderStyle: any = {
      tl: { borderTopWidth: 3, borderLeftWidth: 3,  top: 0,    left: 0    },
      tr: { borderTopWidth: 3, borderRightWidth: 3, top: 0,    right: 0   },
      bl: { borderBottomWidth: 3, borderLeftWidth: 3,  bottom: 0, left: 0  },
      br: { borderBottomWidth: 3, borderRightWidth: 3, bottom: 0, right: 0 },
    }[pos];
    return (
      <View
        style={[
          {
            position: 'absolute',
            width: cornerSize, height: cornerSize,
            borderColor: COLORS.accent,
          },
          borderStyle,
        ]}
      />
    );
  };

  return (
    <Animated.View style={[styles.qrFrame, { borderColor: borderCol }]}>
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {scanning ? (
        <>
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]}
          />
          <View style={styles.qrPlaceholderGrid}>
            {Array.from({ length: 25 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.qrGridCell,
                  { opacity: Math.random() > 0.5 ? 0.12 : 0.05 },
                ]}
              />
            ))}
          </View>
        </>
      ) : (
        <View style={styles.qrWaitingWrap}>
          <Icon name="qrcode-scan" size={52} color={COLORS.accentLight} />
          <Text style={styles.qrWaitingText}>Đang chờ mã QR</Text>
        </View>
      )}
    </Animated.View>
  );
};

// ── Step indicator ────────────────────────────────────────────────────────────
const StepRow = ({ steps, current }: { steps: string[]; current: number }) => (
  <View style={styles.stepRow}>
    {steps.map((label, i) => (
      <React.Fragment key={i}>
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              i < current  && styles.stepDone,
              i === current && styles.stepActive,
            ]}
          >
            {i < current ? (
              <Icon name="check" size={12} color={COLORS.white} />
            ) : (
              <Text style={[styles.stepNum, i === current && { color: COLORS.white }]}>
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            style={[
              styles.stepLabel,
              i === current && { color: COLORS.accent, fontWeight: '700' },
              i < current   && { color: COLORS.success },
            ]}
          >
            {label}
          </Text>
        </View>
        {i < steps.length - 1 && (
          <View style={[styles.stepConnector, i < current && styles.stepConnectorDone]} />
        )}
      </React.Fragment>
    ))}
  </View>
);

// ── Token Badge ───────────────────────────────────────────────────────────────
const TokenBadge = ({
  icon, value, label, color,
}: { icon: string; value: any; label: string; color: string }) => (
  <View style={[styles.tokenBadge, { borderColor: `${color}30` }]}>
    <View style={[styles.tokenIconWrap, { backgroundColor: `${color}12` }]}>
      <Icon name={icon} size={16} color={color} />
    </View>
    <View>
      <Text style={[styles.tokenValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.tokenLabel}>{label}</Text>
    </View>
  </View>
);

// ── Main Screen ───────────────────────────────────────────────────────────────
const ActivationScreen = () => {
  const navigation   = useNavigation();
  const user         = useSelector((state: RootState) => state.user.currentUser);
  // Số dư THẬT từ chuỗi (không bịa). Chưa nạp → '—'. KHÔNG đọc user.*Tokens (faker).
  const wallet       = useSelector(selectChainWallet);
  const [step, setStep]       = useState(0); // 0=scan, 1=processing, 2=done
  const [scanning, setScanning] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleScan = () => {
    setScanning(true);
    setStep(1);
    // Mock: simulate processing then done
    setTimeout(() => {
      setStep(2);
      setScanning(false);
      Animated.spring(checkAnim, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    }, 3000);
  };

  const handleSkip = () => navigation.navigate('Main' as never);
  const handleContinue = () => navigation.navigate('Main' as never);

  const STEPS = ['Quét mã', 'Xử lý', 'Hoàn tất'];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Top strip */}
      <View style={styles.topStrip}>
        <View style={styles.topStripAccent} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.textSub} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>ALADIN</Text>
            <Text style={styles.headerTitle}>Kích hoạt</Text>
          </View>
        </Animated.View>

        {/* Step indicator */}
        <Animated.View
          style={[styles.stepCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <StepRow steps={STEPS} current={step} />
        </Animated.View>

        {/* Main content */}
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {step < 2 ? (
            // ── Scan / Processing ──
            <View style={styles.scanSection}>
              <View style={styles.scanDescCard}>
                <View style={styles.scanDescIcon}>
                  <Icon name="account-check-outline" size={24} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanDescTitle}>Liên hệ người hỗ trợ</Text>
                  <Text style={styles.scanDescBody}>
                    Quét mã QR từ người hỗ trợ đã được xác minh để thanh toán và nhận tài sản blockchain.
                  </Text>
                </View>
              </View>

              {/* QR Frame */}
              <QRFrame scanning={scanning} />

              {/* Processing status */}
              {step === 1 && (
                <View style={styles.processingCard}>
                  <View style={styles.processingDot} />
                  <Text style={styles.processingText}>
                    Đang xử lý giao dịch blockchain...
                  </Text>
                </View>
              )}

              {/* What you'll receive */}
              <View style={styles.receiveCard}>
                <Text style={styles.receiveTitle}>Bạn sẽ nhận được</Text>
                <View style={styles.receiveRow}>
                  {[
                    // ADA không user-facing (Integration-Standard §10.4) — chỉ phí chain,
                    // KHÔNG hiện như tài sản "nhận được". Kích hoạt cấp LAMP (sinh MAGIC).
                    { icon: 'lightning-bolt',   val: '1,001',label: 'LAMP', color: COLORS.accent, desc: 'Sinh MAGIC' },
                  ].map((t, i) => (
                    <View key={i} style={styles.receiveItem}>
                      <View style={[styles.receiveItemIcon, { backgroundColor: `${t.color}12` }]}>
                        <Icon name={t.icon} size={22} color={t.color} />
                      </View>
                      <Text style={[styles.receiveVal, { color: t.color }]}>{t.val}</Text>
                      <Text style={styles.receiveItemLabel}>{t.label}</Text>
                      <Text style={styles.receiveDesc}>{t.desc}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            // ── Done ──
            <View style={styles.doneSection}>
              <Animated.View
                style={[
                  styles.doneCheckWrap,
                  { transform: [{ scale: checkAnim }] },
                ]}
              >
                <View style={styles.doneCheckRing} />
                <View style={styles.doneCheckInner}>
                  <Icon name="check-bold" size={36} color={COLORS.white} />
                </View>
              </Animated.View>

              <Text style={styles.doneTitle}>Kích hoạt thành công!</Text>
              <Text style={styles.doneBody}>
                Tài sản đã được chuyển vào ví Cardano của bạn.{'\n'}
                Bạn có thể bắt đầu sử dụng Aladin ngay bây giờ.
              </Text>

              {/* Token balances */}
              <View style={styles.tokenRow}>
                {/* 3 token user-facing: MAGIC · LAMP · CARP (Integration-Standard §10.4).
                    ADA KHÔNG hiện ở đây — chỉ phí chain, xem mục "Tài sản khác" ở màn Ví.
                    CARP: brand tạm, số dư chờ API Phoenix. */}
                <TokenBadge icon="star-four-points-outline" value={wallet?.magicBalance ?? '—'} label="MAGIC" color="#B07D2F" />
                <TokenBadge icon="lightning-bolt"  value={fmtLamp(wallet?.lampBalance)} label="LAMP" color={COLORS.accent} />
                <TokenBadge icon="fish" value={fmtCarp(wallet?.carpBalance)} label="CARP" color="#2F8F8F" />
              </View>

              {/* Info note */}
              <View style={styles.infoNote}>
                <Icon name="information-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.infoNoteText}>
                  LAMP sẽ tự động sinh MAGIC mỗi 5 ngày theo tỷ lệ giao thức
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        {step === 0 && (
          <>
            <Animated.View style={{ transform: [{ scale: btnScale }], flex: 1 }}>
              <TouchableOpacity
                style={styles.scanBtn}
                onPress={handleScan}
                onPressIn={() => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
                activeOpacity={1}
              >
                <View style={styles.btnShine} />
                <Icon name="qrcode-scan" size={20} color={COLORS.white} />
                <Text style={styles.scanBtnText}>Quét mã QR</Text>
              </TouchableOpacity>
            </Animated.View>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Bỏ qua</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 1 && (
          <View style={styles.waitingBar}>
            <ProcessingDots />
            <Text style={styles.waitingText}>Đang chờ xác nhận từ người hỗ trợ...</Text>
          </View>
        )}

        {step === 2 && (
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.88}>
            <View style={styles.btnShine} />
            <Icon name="sprout-outline" size={20} color={COLORS.white} />
            <Text style={styles.continueBtnText}>Bắt đầu sử dụng Aladin</Text>
            <Icon name="arrow-right" size={18} color={COLORS.white} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Processing dots animation ─────────────────────────────────────────────────
const ProcessingDots = () => {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(d, { toValue: 1,   duration: 400, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 5, marginRight: 10 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 3.5,
            backgroundColor: COLORS.accent, opacity: d,
          }}
        />
      ))}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  topStrip: { height: 3, backgroundColor: COLORS.bgWarm, flexDirection: 'row' },
  topStripAccent: { width: '40%', height: '100%', backgroundColor: COLORS.accent },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 140,
  },

  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 2.5, marginBottom: 1,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6,
  },

  // Step card
  stepCard: {
    marginHorizontal: 20, marginBottom: 20,
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10,
    elevation: 2,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  stepItem: { alignItems: 'center', gap: 5 },
  stepCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.bgWarm,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  stepDone:   { backgroundColor: COLORS.success, borderColor: COLORS.success },
  stepNum: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  stepLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '500' },
  stepConnector: {
    flex: 1, height: 1.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 6,
    marginBottom: 18,
  },
  stepConnectorDone: { backgroundColor: COLORS.success },

  // Scan section
  scanSection: { paddingHorizontal: 20, gap: 14 },
  scanDescCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'flex-start',
  },
  scanDescIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  scanDescTitle: {
    fontSize: 14, fontWeight: '700', color: COLORS.text,
    marginBottom: 4,
  },
  scanDescBody: {
    fontSize: 13, color: COLORS.textSub, lineHeight: 20,
  },

  // QR frame
  qrFrame: {
    height: 210,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16,
    elevation: 3,
  },
  scanLine: {
    position: 'absolute', top: 16,
    left: 20, right: 20,
    height: 2,
    backgroundColor: COLORS.accent,
    opacity: 0.7,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
    elevation: 2,
  },
  qrPlaceholderGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  qrGridCell: {
    width: width / 5 - 4,
    height: 38,
    backgroundColor: COLORS.accent,
    margin: 1,
    borderRadius: 2,
  },
  qrWaitingWrap: { alignItems: 'center', gap: 10 },
  qrWaitingText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },

  // Processing
  processingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(74,124,89,0.08)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(74,124,89,0.2)',
  },
  processingDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  processingText: { fontSize: 13, color: COLORS.success, fontWeight: '500' },

  // Receive card
  receiveCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  receiveTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 1.5, marginBottom: 14,
  },
  receiveRow: { flexDirection: 'row', gap: 12 },
  receiveItem: {
    flex: 1, alignItems: 'center', gap: 5,
    backgroundColor: COLORS.bgWarm,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  receiveItemIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  receiveVal: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  receiveItemLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },
  receiveDesc: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },

  // Done section
  doneSection: {
    paddingHorizontal: 20, alignItems: 'center', paddingTop: 8, gap: 14,
  },
  doneCheckWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  doneCheckRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 1.5, borderColor: COLORS.accent, opacity: 0.2,
  },
  doneCheckInner: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16,
    elevation: 8,
  },
  doneTitle: {
    fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5,
  },
  doneBody: {
    fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 22,
  },
  tokenRow: {
    flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
    width: '100%',
  },
  tokenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 12,
    borderWidth: 1.5,
    minWidth: (width - 60) / 3,
    flex: 1,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 1,
  },
  tokenIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  tokenValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  tokenLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.5 },

  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.bgWarm,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
    width: '100%',
  },
  infoNoteText: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18, flex: 1 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 14,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  scanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
    borderRadius: 14, backgroundColor: COLORS.accent,
    overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14,
    elevation: 6,
  },
  scanBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },
  skipBtn: {
    paddingHorizontal: 18, paddingVertical: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    justifyContent: 'center',
  },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  waitingBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accentGlow,
    borderRadius: 14, paddingVertical: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  waitingText: { fontSize: 13, color: COLORS.accent, fontWeight: '500' },
  continueBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 14, backgroundColor: COLORS.accent,
    overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14,
    elevation: 6,
  },
  continueBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },

  btnShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
  },
});

export default ActivationScreen;