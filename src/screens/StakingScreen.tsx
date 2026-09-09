/**
 * StakingScreen — Uỷ thác stake (SPO). ĐỌC trạng thái delegation + xem pool + UỶ THÁC.
 *
 * ⏳ Uỷ thác (write) cần: rebuild native (taad_kek_build_stake_delegation) + 2 proxy
 * endpoint UTXO/params của backend. Trước khi có, nút "Uỷ thác" báo lỗi rõ ràng.
 *
 * Dùng account 0 (ví CỐ ĐỊNH — cùng stake key mà standardWalletService đăng ký).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  TextInput, ActivityIndicator, 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { fmtAdaLabel } from '../utils/token';
import { getStoredMasterKek } from '../services/masterKekStore';
import {
  getUserDelegation, getPool, delegateToPool,
} from '../services/stakingService';
import type { DelegationStatus, PoolDetail } from '../services/phoenixKey-api';

const PRIMARY = '#0033AD'; // Cardano blue
import { CARDANO_NETWORK as NETWORK } from '../config/cardanoNetwork';
import { showError, showSuccess, showWarning } from '../utils/alert';
import { t, tf } from '../i18n';
const ACCOUNT = 0;         // ví cố định (stake key đã đăng ký)

// `fmtAda` bản riêng của màn này đã gỡ 2026-08-14: nó là bản thứ hai của một hàm
// đã có ở `utils/token.ts`, và hai bản cho hai kết quả khác nhau trên cùng một số
// (`1_234_567` → `1,23 ₳` ở đây, `1.234567` ở nguồn). Nguồn có bộ kiểm neo
// (`utils/token.test.ts`), bản này thì không. Dùng `fmtAdaLabel` — cùng dạng hiển
// thị, khác hai chỗ có chủ ý: nhóm chữ số `en-US` như `fmtLamp`/`fmtCarp`, và
// thiếu số thì trả `—` chứ không trả `0 ₳`.

const StakingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [kek, setKek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleg, setDeleg] = useState<DelegationStatus | null>(null);

  const [poolId, setPoolId] = useState('');
  const [poolDetail, setPoolDetail] = useState<PoolDetail | null>(null);
  const [checking, setChecking] = useState(false);
  const [delegating, setDelegating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const k = await getStoredMasterKek();
      setKek(k);
      if (!k) { setError('Chưa có ví trên máy này. Hãy tạo/khôi phục ví trước.'); return; }
      const d = await getUserDelegation(k, ACCOUNT, NETWORK);
      setDeleg(d);
    } catch (e: any) {
      setError(e?.message ?? 'Không tải được trạng thái uỷ thác.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCheckPool = useCallback(async () => {
    const id = poolId.trim();
    if (!id) return;
    setChecking(true); setPoolDetail(null);
    try {
      setPoolDetail(await getPool(id));
    } catch (e: any) {
      showError('Không tìm thấy pool', e?.message ?? 'Kiểm tra lại pool id (pool1...).');
    } finally { setChecking(false); }
  }, [poolId]);

  const handleDelegate = useCallback(async () => {
    if (!kek || !poolDetail) return;
    showWarning('Xác nhận uỷ thác', `Uỷ thác stake của ví vào pool ${poolDetail.ticker || poolDetail.poolId.slice(0, 12)}?`, {
        confirmText: 'Uỷ thác',
        cancelText: 'Huỷ',
        onConfirm: async () => {
            setDelegating(true);
            try {
              const { txHash } = await delegateToPool({
                kekHex: kek, account: ACCOUNT, poolBech32: poolDetail.poolId, network: NETWORK,
              });
              showSuccess(
                t('Đã gửi uỷ thác'),
                tf('Tx: {tx}…\nMất vài phút để lên chuỗi.', { tx: txHash.slice(0, 16) }),
              );
              load();
            } catch (e: any) {
              showError(t('Uỷ thác thất bại'), e?.message ?? t('Thử lại nơi sóng tốt.'));
            } finally { setDelegating(false); }
          },
    });
  }, [kek, poolDetail, load]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Uỷ thác Stake</Text>
      <TouchableOpacity onPress={load} hitSlop={8}>
        <Icon name="refresh" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return <View style={styles.root}>{header}<View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View></View>;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.card}>
            <Icon name="alert-circle-outline" size={22} color={COLORS.warning} />
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : (
          <>
            {/* Trạng thái hiện tại */}
            <Text style={styles.sectionLabel}>TRẠNG THÁI HIỆN TẠI</Text>
            <View style={styles.card}>
              {deleg?.active && deleg.poolId ? (
                <>
                  <View style={styles.row}>
                    <Icon name="check-decagram" size={18} color={COLORS.success} />
                    <Text style={styles.rowText}>Đang uỷ thác</Text>
                  </View>
                  <Text style={styles.mono} numberOfLines={1}>Pool: {deleg.poolId}</Text>
                  <Text style={styles.metaText}>Đang stake: {fmtAdaLabel(deleg.controlledAmount)}</Text>
                  <Text style={styles.metaText}>Reward chưa rút: {fmtAdaLabel(deleg.rewardsSum)}</Text>
                </>
              ) : (
                <View style={styles.row}>
                  <Icon name="information-outline" size={18} color={COLORS.textMuted} />
                  <Text style={styles.rowText}>Chưa uỷ thác pool nào.</Text>
                </View>
              )}
            </View>

            {/* Chọn pool */}
            <Text style={styles.sectionLabel}>UỶ THÁC VÀO POOL</Text>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Pool ID (pool1…)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="pool1..."
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  value={poolId}
                  onChangeText={setPoolId}
                />
                <TouchableOpacity style={styles.checkBtn} onPress={handleCheckPool} disabled={checking}>
                  {checking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.checkBtnText}>Xem</Text>}
                </TouchableOpacity>
              </View>

              {poolDetail && (
                <View style={styles.poolBox}>
                  <Text style={styles.poolName}>
                    {poolDetail.ticker ? `[${poolDetail.ticker}] ` : ''}{poolDetail.name || '(không tên)'}
                  </Text>
                  <Text style={styles.metaText}>Live stake: {fmtAdaLabel(poolDetail.liveStake)}</Text>
                  <Text style={styles.metaText}>Bão hoà: {(poolDetail.liveSaturation * 100).toFixed(1)}%</Text>
                  <Text style={styles.metaText}>Phí: {(poolDetail.marginCost * 100).toFixed(1)}% + {fmtAdaLabel(poolDetail.fixedCost)}/đợt</Text>

                  <TouchableOpacity
                    style={[styles.delegBtn, delegating && styles.delegBtnOff]}
                    onPress={handleDelegate}
                    disabled={delegating}
                  >
                    {delegating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Icon name="hand-coin-outline" size={18} color="#fff" />
                        <Text style={styles.delegBtnText}>Uỷ thác vào pool này</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.note}>
              Uỷ thác cần app đã cập nhật (khoá bảo mật) + máy chủ hỗ trợ. Nếu báo lỗi,
              hãy cập nhật app rồi thử lại.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PRIMARY, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 8 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: PRIMARY, letterSpacing: 1.5, marginTop: 12, marginBottom: 6 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  mono: { fontSize: 12, color: COLORS.textSub, fontFamily: 'monospace' },
  metaText: { fontSize: 13, color: COLORS.textSub },
  errText: { flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 18 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSub },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: COLORS.inputBg ?? COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text,
  },
  checkBtn: { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  checkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  poolBox: {
    marginTop: 8, backgroundColor: COLORS.bg, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  poolName: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  delegBtn: {
    marginTop: 10, backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  delegBtnOff: { opacity: 0.5 },
  delegBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  note: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 12, lineHeight: 16 },
});

export default StakingScreen;
