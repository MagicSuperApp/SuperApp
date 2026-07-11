/**
 * Nút "Ký bằng Ví Phượng hoàng" + modal DUYỆT giao dịch.
 *
 * ADDITIVE — không phá luồng login/ví hiện có. Drop vào bất kỳ màn nào có tác-vụ
 * cần ký (chuyển LAMP/ADA, claim MAGIC, trả phí). Vòng đời 1 lần ký:
 *
 *   user bấm nút → dispatch buildWalletTx(intent) → backend trả TxPreview →
 *   modal HIỆN displayText (nguồn sự-thật) + mạng + phí → user duyệt →
 *   confirmAndSign → sinh-trắc ký → submit → hiện txHash.
 *
 * AN-TOÀN (chống ký-mù / sai-mạng / thay-tx):
 *   - KHÔNG ký gì cho tới khi user đọc displayText do BACKEND sinh và bấm duyệt.
 *   - Network-guard: mainnet bị chặn ở SDK (NetworkNotAllowedError) → hiện cảnh báo đỏ.
 *   - Khi cờ PHOENIX_WALLET_ENABLED tắt (backend Phase 2 chưa deploy) → nút
 *     `disabled`, phụ-đề "đang phát triển". KHÔNG gọi mạng.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  buildWalletTx,
  confirmAndSign,
  resetWalletSign,
  selectSignPhase,
  selectTxPreview,
  selectSignResult,
  selectSignError,
  type WalletActionIntent,
} from '../store/phoenixWalletSlice';
import { isPhoenixWalletEnabled } from '../config/phoenixWallet';
import { COLORS } from '../constants';

interface Props {
  intent: WalletActionIntent;
  /** Nhãn nút. Mặc định "Ký bằng Ví Phượng hoàng". */
  label?: string;
  /** Gọi khi submit thành công (txHash). */
  onSigned?: (txHash: string) => void;
  disabled?: boolean;
}

const networkLabel = (net: string): string => {
  if (net === 'mainnet') return 'Cardano Mainnet';
  if (net === 'preprod') return 'Cardano Preprod (Thử nghiệm)';
  if (net === 'preview') return 'Cardano Preview (Thử nghiệm)';
  return net;
};

export const PhoenixWalletSignButton: React.FC<Props> = ({
  intent,
  label = 'Ký bằng Ví Phượng hoàng',
  onSigned,
  disabled,
}) => {
  const dispatch = useAppDispatch();
  const phase = useAppSelector(selectSignPhase);
  const preview = useAppSelector(selectTxPreview);
  const result = useAppSelector(selectSignResult);
  const errorMessage = useAppSelector(selectSignError);

  const [open, setOpen] = useState(false);
  const walletEnabled = isPhoenixWalletEnabled();

  // Khi submit xong → báo caller (1 lần) rồi giữ modal ở trạng thái thành công.
  useEffect(() => {
    if (phase === 'submitted' && result) {
      onSigned?.(result.txHash);
    }
  }, [phase, result, onSigned]);

  const startSign = () => {
    setOpen(true);
    dispatch(buildWalletTx(intent));
  };

  const closeAndReset = () => {
    setOpen(false);
    dispatch(resetWalletSign());
  };

  const confirm = () => {
    if (preview) dispatch(confirmAndSign(preview));
  };

  const busy = phase === 'building' || phase === 'signing';
  const btnDisabled = disabled || !walletEnabled;

  return (
    <>
      <TouchableOpacity
        style={[styles.cta, btnDisabled && styles.ctaDisabled]}
        onPress={startSign}
        disabled={btnDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: btnDisabled }}
      >
        <Text style={[styles.ctaText, btnDisabled && styles.ctaTextDisabled]}>
          {label}
        </Text>
        {!walletEnabled && (
          <Text style={styles.ctaSub}>Đang phát triển — sắp ra mắt</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeAndReset}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {/* ── Đang build tx ── */}
            {phase === 'building' && (
              <View style={styles.center}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.muted}>Đang chuẩn bị giao dịch…</Text>
              </View>
            )}

            {/* ── Duyệt: HIỆN RÕ nội dung tx (chống ký-mù) ── */}
            {(phase === 'review' || phase === 'signing') && preview && (
              <>
                <Text style={styles.title}>Xác nhận giao dịch</Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Nội dung</Text>
                  <Text style={styles.displayText}>{preview.displayText}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.fieldLabel}>Mạng</Text>
                  <Text
                    style={[
                      styles.netValue,
                      preview.network === 'mainnet' && styles.netDanger,
                    ]}
                  >
                    {networkLabel(preview.network)}
                  </Text>
                </View>

                {preview.feeLovelace != null && (
                  <View style={styles.row}>
                    <Text style={styles.fieldLabel}>Phí ước tính</Text>
                    <Text style={styles.feeValue}>
                      {(preview.feeLovelace / 1_000_000).toFixed(6)} ADA
                    </Text>
                  </View>
                )}

                {errorMessage && (
                  <Text style={styles.error}>{errorMessage}</Text>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    onPress={closeAndReset}
                    disabled={phase === 'signing'}
                  >
                    <Text style={styles.btnGhostText}>Huỷ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={confirm}
                    disabled={phase === 'signing'}
                  >
                    {phase === 'signing' ? (
                      <ActivityIndicator color={COLORS.card} />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Ký xác nhận</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Thành công ── */}
            {phase === 'submitted' && result && (
              <View style={styles.center}>
                <Text style={styles.title}>Đã gửi giao dịch</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {result.txHash}
                </Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, styles.fullBtn]}
                  onPress={closeAndReset}
                >
                  <Text style={styles.btnPrimaryText}>Xong</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Lỗi build (mạng/disabled/keypair) ── */}
            {phase === 'error' && (
              <View style={styles.center}>
                <Text style={styles.title}>Không thể ký</Text>
                <Text style={styles.error}>
                  {errorMessage ?? 'Đã có lỗi xảy ra.'}
                </Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, styles.fullBtn]}
                  onPress={closeAndReset}
                >
                  <Text style={styles.btnGhostText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: COLORS.border },
  ctaText: { color: COLORS.card, fontSize: 15, fontWeight: '700' },
  ctaTextDisabled: { color: COLORS.textMuted },
  ctaSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
  },
  center: { alignItems: 'center', gap: 12 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  displayText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  netValue: { fontSize: 14, fontWeight: '600', color: COLORS.textSub },
  netDanger: { color: COLORS.error },
  feeValue: { fontSize: 14, color: COLORS.textSub },
  muted: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  error: { fontSize: 13, color: COLORS.error, marginTop: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  fullBtn: { alignSelf: 'stretch', marginTop: 8 },
  btnGhost: { backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.textSub, fontWeight: '600' },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnPrimaryText: { color: COLORS.card, fontWeight: '700' },
});

export default PhoenixWalletSignButton;
