// screens/OrgMintScreen.tsx
//
// Mint LAMP bằng OrgDID — 2 BƯỚC TÁCH RÕ (ràng buộc sống còn):
//
//   BƯỚC 1 — MINT VÀO KHO: chọn org → nhập số lượng → gọi mint-lamp (tạo intent
//     LAMP_MINT) → chờ SSE "signed" (m-of-n gom đủ m chữ ký; single=1) → native
//     dựng+ký CBOR (Thư) → submit-tx. Kết quả: LAMP nằm trong KHO Distribution,
//     CHƯA về ví. Hiển thị RÕ điều này — KHÔNG được nói "mint về ví".
//
//   BƯỚC 2 — CLAIM-RELEASE VỀ VÍ: đưa LAMP từ kho về ví user. Endpoint PhoenixKey
//     CHƯA cấp → nút DISABLED + ghi "chờ endpoint release". KHÔNG bịa path.
//
// Cap/authority + m-of-n để CHỖ (chờ LAMP). Phần dựng+ký CBOR = Enclave native
// (Thư) — màn nhận buildAndSignTx qua service; hiện để STUB rõ ràng, ném lỗi tới
// khi native ráp. Đủ 4 trạng-thái. Màu token-driven (COLORS), snake_case ở wire.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';
import {
  mintLampStep1,
  waitMintSigned,
  submitMintTx,
  claimReleaseToWallet,
  isOrgMintReady,
  OrgMintDisabledError,
  OrgReleaseNotAvailableError,
  type BuildAndSignMintTx,
  type WaitSignedHandle,
} from '../services/orgMintService';
import { PhoenixKeyApiError } from '../services/phoenixKey-api';

// Tham số điều-hướng từ màn OrgDID.
type OrgMintRoute = RouteProp<
  { OrgMint: { orgDid: string; orgName?: string } },
  'OrgMint'
>;

// Pha của bước 1 (để hiện tiến-trình + đúng trạng-thái loading/error).
type MintPhase = 'idle' | 'requesting' | 'waiting_sign' | 'submitting' | 'done' | 'error';

// ── STUB Enclave native (Thư) ─────────────────────────────────────────────────
// TODO(Thư): thay bằng hàm dựng+ký CBOR thật từ module Enclave. Nhận {orgDid,
// requestId}, trả {signedTxCbor}. m-of-n: gom đủ m chữ ký trước khi trả (single=1).
// Hiện ném lỗi để KHÔNG giả-lập submit khi native chưa sẵn.
const buildAndSignTxStub: BuildAndSignMintTx = async () => {
  throw new Error(
    'Tính năng ký giao dịch sẽ mở ở bản sau.',
  );
};

const OrgMintScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<OrgMintRoute>();
  const { orgDid, orgName } = route.params ?? { orgDid: '', orgName: undefined };

  const enabled = isOrgMintReady();

  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<MintPhase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null);

  const signHandleRef = useRef<WaitSignedHandle | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    // Dọn SSE khi rời màn.
    return () => {
      signHandleRef.current?.abort();
    };
  }, [fadeAnim]);

  const trimmedAmount = amount.trim();
  const amountValid = useMemo(
    () => /^\d+$/.test(trimmedAmount) && Number(trimmedAmount) > 0,
    [trimmedAmount],
  );
  const busy = phase === 'requesting' || phase === 'waiting_sign' || phase === 'submitting';
  const canMint = enabled && amountValid && !busy && !!orgDid;

  const phaseLabel: Record<MintPhase, string> = {
    idle: '',
    requesting: 'Đang tạo yêu cầu mint…',
    waiting_sign: 'Đang chờ ký (sinh trắc)…',
    submitting: 'Đang gửi giao dịch lên chuỗi…',
    done: 'Đã mint vào kho.',
    error: 'Có lỗi xảy ra.',
  };

  // ── BƯỚC 1: mint vào KHO ──────────────────────────────────────────────────
  const handleMintToVault = async () => {
    if (!canMint) return;
    setErrorMsg(null);
    setTxHash(null);

    try {
      // 1a. Tạo intent LAMP_MINT.
      setPhase('requesting');
      const intent = await mintLampStep1({ orgDid, amount: trimmedAmount });

      // 1b. Chờ SSE "signed" (m-of-n gom đủ m chữ ký; single = 1).
      setPhase('waiting_sign');
      const { signed, handle } = waitMintSigned(intent.requestId);
      signHandleRef.current = handle;
      await signed;

      // 1c. Native dựng + ký CBOR (Thư) → submit-tx.
      setPhase('submitting');
      const result = await submitMintTx({
        orgDid,
        requestId: intent.requestId,
        buildAndSignTx: buildAndSignTxStub, // TODO(Thư): thay bằng hàm native thật
      });

      setTxHash(result.txHash);
      setPhase('done');
    } catch (err) {
      const msg =
        err instanceof OrgMintDisabledError
          ? err.message
          : err instanceof PhoenixKeyApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Không mint được. Vui lòng thử lại.';
      setErrorMsg(msg);
      setPhase('error');
    }
  };

  // ── BƯỚC 2: claim-release về ví (CHƯA CÓ ENDPOINT) ────────────────────────
  const handleClaimRelease = async () => {
    try {
      await claimReleaseToWallet({ orgDid, recipientAddress: '', amount: trimmedAmount });
    } catch (err) {
      if (err instanceof OrgReleaseNotAvailableError) {
        setReleaseNotice(err.message);
      } else {
        setReleaseNotice('Chưa thể đưa LAMP về ví — vui lòng thử lại sau.');
      }
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mint LAMP</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 24 },
          ]}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Org đã chọn */}
            <View style={styles.orgHeaderCard}>
              <View style={styles.orgIconWrap}>
                <Icon name="office-building" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgName} numberOfLines={1}>
                  {orgName || 'Tổ chức'}
                </Text>
                <Text style={styles.orgDid} numberOfLines={1}>
                  {orgDid || '—'}
                </Text>
              </View>
            </View>

            {!enabled && (
              <View style={styles.noticeCard}>
                <Icon name="information-outline" size={18} color={COLORS.warning} />
                <Text style={styles.noticeText}>
                  Chế độ xem trước — phát hành LAMP chưa chạy thật, sẽ mở ở
                  bản sau.
                </Text>
              </View>
            )}

            {/* ── BƯỚC 1 — MINT VÀO KHO ── */}
            <View style={styles.stepWrap}>
              <View style={styles.stepHeadRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <Text style={styles.stepTitle}>Mint vào kho Distribution</Text>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.fieldLabel}>Số lượng LAMP</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="VD: 1000"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  editable={enabled && !busy}
                />

                {/* Cảnh báo model: mint KHÔNG ra ví */}
                <View style={styles.vaultNote}>
                  <Icon name="bank-outline" size={16} color={COLORS.accent} />
                  <Text style={styles.vaultNoteText}>
                    LAMP mint xong sẽ nằm trong KHO Distribution, CHƯA về ví của bạn.
                    Muốn nhận về ví phải làm Bước 2 (claim-release) sau.
                  </Text>
                </View>

                {/* Chỗ để cap/authority + m-of-n (chờ LAMP) */}
                <View style={styles.pendingRow}>
                  <Icon name="lock-clock" size={14} color={COLORS.textMuted} />
                  <Text style={styles.pendingText}>
                    Hạn mức (cap) và quyền phát hành (authority) chờ LAMP chốt · ngưỡng
                    ký m-of-n sẽ hiện khi PR #40 xong.
                  </Text>
                </View>

                {/* Tiến trình pha */}
                {busy && (
                  <View style={styles.progressRow}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={styles.progressText}>{phaseLabel[phase]}</Text>
                  </View>
                )}

                {/* Lỗi */}
                {phase === 'error' && errorMsg && (
                  <View style={styles.errorRow}>
                    <Icon name="alert-circle-outline" size={16} color={COLORS.error} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                {/* Thành công bước 1 */}
                {phase === 'done' && (
                  <View style={styles.successRow}>
                    <Icon name="check-circle-outline" size={16} color={COLORS.success} />
                    <Text style={styles.successText}>
                      Đã mint vào KHO Distribution. LAMP CHƯA về ví — dùng Bước 2 để
                      claim-release khi mở.
                      {txHash ? `\nTx: ${txHash}` : ''}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, !canMint && styles.primaryBtnDisabled]}
                  onPress={handleMintToVault}
                  disabled={!canMint}
                  activeOpacity={0.85}
                >
                  <Icon name="bank-plus" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Mint vào kho</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── BƯỚC 2 — CLAIM-RELEASE VỀ VÍ (CHƯA MỞ) ── */}
            <View style={styles.stepWrap}>
              <View style={styles.stepHeadRow}>
                <View style={[styles.stepBadge, styles.stepBadgeMuted]}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Claim-release về ví</Text>
              </View>

              <View style={[styles.sectionCard, styles.sectionCardMuted]}>
                <Text style={styles.mutedBody}>
                  Đưa LAMP từ kho về ví của bạn. Bước này CHƯA mở — sẽ có ở
                  bản sau.
                </Text>

                {releaseNotice && (
                  <View style={styles.errorRow}>
                    <Icon name="clock-alert-outline" size={16} color={COLORS.warning} />
                    <Text style={[styles.errorText, { color: COLORS.warning }]}>
                      {releaseNotice}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, styles.primaryBtnDisabled]}
                  onPress={handleClaimRelease}
                  disabled
                  activeOpacity={1}
                >
                  <Icon name="wallet-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Nhận về ví (sắp có)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerPlaceholder: { width: 36 },

  scrollContent: { paddingTop: 18, paddingHorizontal: 20 },

  orgHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  orgIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.accent}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  orgDid: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },

  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: `${COLORS.warning}12`,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${COLORS.warning}40`,
    padding: 14,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },

  stepWrap: { marginBottom: 22 },
  stepHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeMuted: { backgroundColor: COLORS.textMuted },
  stepBadgeText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionCardMuted: { backgroundColor: COLORS.bgWarm, opacity: 0.92 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bgWarm,
  },

  vaultNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${COLORS.accent}0D`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${COLORS.accent}25`,
    padding: 12,
    marginTop: 12,
  },
  vaultNoteText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },

  pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  pendingText: { flex: 1, fontSize: 11.5, color: COLORS.textMuted, lineHeight: 16 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  progressText: { fontSize: 13, color: COLORS.textSub, fontWeight: '500' },

  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.error, lineHeight: 18 },

  successRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    backgroundColor: `${COLORS.success}0D`,
    borderRadius: 12,
    padding: 12,
  },
  successText: { flex: 1, fontSize: 12.5, color: COLORS.success, lineHeight: 18 },

  mutedBody: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, marginBottom: 4 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  primaryBtnDisabled: { backgroundColor: COLORS.textMuted, opacity: 0.55 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

export default OrgMintScreen;
