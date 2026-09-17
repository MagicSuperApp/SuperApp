/**
 * MagicVaultBalanceScreen — ĐỌC-THÔI số dư MAGIC của một `owner_pkh` cấu hình sẵn,
 * qua `VaultReadAPI` (nhà MAGIC). Xem đầu `services/magicVaultService.ts` cho hợp
 * đồng đầy đủ; màn này chỉ lo hiển thị.
 *
 * v1 CHƯA đọc theo danh tính của người dùng đang đăng nhập — nhà MAGIC nói rõ trong
 * thư 2026-09-17: "Vault bên này mở là vault của ví bên này… Bên này sẽ gửi owner_pkh
 * kèm tx trong thư sau." App chưa có đường KÝ để tự mở vault của chính người dùng
 * (`VaultTxAPI` chưa lên HTTP) — màn này chỉ ĐỌC, đúng phạm vi cửa đang chạy.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { useTk } from '../i18n/keys';
import {
  fetchMagicVaultBalance,
  type MagicVaultBalance,
  type MagicVaultAPIError,
} from '../services/magicVaultService';
import { formatNanogicAsMagic, expiresAtEpochToVnMoment } from '../utils/magicVaultFormat';

const ACCENT = COLORS.accent;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; error: MagicVaultAPIError }
  | { kind: 'data'; data: MagicVaultBalance };

/** Loại lỗi → khoá i18n. Tách riêng để không lặp switch trong JSX. */
function errorKey(type: MagicVaultAPIError['type']): string {
  switch (type) {
    case 'network_error': return 'magicVault.errorNetwork';
    case 'timeout': return 'magicVault.errorTimeout';
    case 'bad_response': return 'magicVault.errorBadResponse';
    case 'unauthorized': return 'magicVault.errorUnauthorized';
    case 'server_error':
    default: return 'magicVault.errorServer';
  }
}

const MagicVaultBalanceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const tk = useTk();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await fetchMagicVaultBalance();
    setState(result.ok ? { kind: 'data', data: result.data } : { kind: 'error', error: result.error });
  }, []);

  useEffect(() => { load(); }, [load]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{tk('magicVault.title')}</Text>
      <TouchableOpacity onPress={load} hitSlop={8} disabled={state.kind === 'loading'}>
        <Icon name="refresh" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={ACCENT} />
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        {state.kind === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.metaText}>{tk('magicVault.loading')}</Text>
          </View>
        )}

        {/* "Chưa cấu hình" KHÔNG phải một lỗi cần Thử lại — cấu hình nướng lúc build,
            bấm lại không đổi gì. Trình bày điềm tĩnh hơn khối lỗi mạng bên dưới. */}
        {state.kind === 'error' && state.error.type === 'not_configured' && (
          <View style={styles.card}>
            <Icon name="cog-outline" size={22} color={COLORS.textMuted} />
            <Text style={styles.notConfiguredText}>{tk('magicVault.notConfigured')}</Text>
          </View>
        )}

        {state.kind === 'error' && state.error.type !== 'not_configured' && (
          <View style={styles.card}>
            <Icon name="alert-circle-outline" size={22} color={COLORS.error} />
            <Text style={styles.errText}>{tk(errorKey(state.error.type))}</Text>
            {state.error.error_code ? (
              <Text style={styles.codeText}>
                {tk('magicVault.errorCode', { code: state.error.error_code })}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>{tk('magicVault.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state.kind === 'data' && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{tk('magicVault.availableLabel')}</Text>
              <Text style={styles.availableValue}>
                {formatNanogicAsMagic(state.data.availableNanogic)}{' '}
                <Text style={styles.unit}>{tk('magicVault.unit')}</Text>
              </Text>
              <Text style={styles.metaText}>
                {tk('magicVault.accruedLabel')}: {formatNanogicAsMagic(state.data.accruedNanogic)} {tk('magicVault.unit')}
              </Text>
              <Text style={styles.metaText}>
                {tk('magicVault.expiredLabel')}: {formatNanogicAsMagic(state.data.expiredNanogic)} {tk('magicVault.unit')}
              </Text>
              <Text style={styles.metaText}>{tk('magicVault.vaultCount', { n: state.data.vaultCount })}</Text>
            </View>

            <Text style={styles.sectionLabel}>{tk('magicVault.batchesTitle')}</Text>
            {state.data.batches.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.metaText}>{tk('magicVault.noBatches')}</Text>
              </View>
            ) : (
              state.data.batches.map((b) => {
                const moment = expiresAtEpochToVnMoment(b.expiresAtEpoch);
                const isInstant = b.source === 'Instant';
                return (
                  <View key={b.batchId} style={styles.card}>
                    <View style={styles.row}>
                      <Icon
                        name={isInstant ? 'flash-outline' : 'calendar-clock-outline'}
                        size={18}
                        color={ACCENT}
                      />
                      <Text style={styles.rowText}>
                        {tk(isInstant ? 'magicVault.sourceInstant' : 'magicVault.sourceSchedule')}
                      </Text>
                      <View style={[styles.badge, b.live ? styles.badgeLive : styles.badgeExpired]}>
                        <Text style={styles.badgeText}>
                          {tk(b.live ? 'magicVault.batchLive' : 'magicVault.batchExpired')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.metaText}>
                      {tk(isInstant ? 'magicVault.sourceInstantHint' : 'magicVault.sourceScheduleHint')}
                    </Text>
                    <Text style={styles.mono}>
                      {formatNanogicAsMagic(b.currentAmountNanogic)} {tk('magicVault.unit')}
                    </Text>
                    <Text style={styles.metaText}>
                      {tk('magicVault.batchExpiry', {
                        hhmm: moment.hhmm,
                        day: moment.day,
                        month: moment.month,
                        year: moment.year,
                      })}
                    </Text>
                  </View>
                );
              })
            )}

            <View style={styles.noticeCard}>
              <Icon name="flask-outline" size={16} color={COLORS.warning} />
              <Text style={styles.noticeText}>{tk('magicVault.testnetNotice')}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: ACCENT,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 32 },
  center: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  availableValue: { color: COLORS.text, fontSize: 32, fontWeight: '800', marginVertical: 4 },
  unit: { fontSize: 16, fontWeight: '600', color: COLORS.textSub },
  metaText: { color: COLORS.textSub, fontSize: 13 },
  mono: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginTop: 4 },
  errText: { color: COLORS.error, fontSize: 14, marginTop: 4 },
  notConfiguredText: { color: COLORS.textMuted, fontSize: 14, marginTop: 4 },
  codeText: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  retryBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: ACCENT,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  badge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeLive: { backgroundColor: COLORS.success },
  badgeExpired: { backgroundColor: COLORS.textMuted },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  noticeText: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
});

export default MagicVaultBalanceScreen;
