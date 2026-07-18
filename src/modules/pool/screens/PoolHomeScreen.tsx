// modules/pool/screens/PoolHomeScreen.tsx
// Màn "Pool" — danh sách stake pool (SPO) để user chọn uỷ quyền + trạng thái uỷ quyền.
//
// KHUNG UI + gọi API: nội dung THẬT thuộc backend PhoenixKey (api.phoenixkey.io) —
// đã inbox Phoenix agent xin contract. Nay UI trỏ sẵn poolService; 4 trạng thái qua
// StateView; uỷ quyền chờ nối ví ký client-side (non-custodial).
//
// CHỖ CHỜ:
//   - Endpoint Pool thật (path/shape) — Phoenix chốt → cập nhật poolService (1 chỗ).
//   - Uỷ quyền: dựng+ký tx delegation client-side (poolService.delegateToPool).
//   - Thiết kế/tinh UI: Tùng (issue frontend).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../../../constants';
import StateView, { type StateStatus } from '../../../components/state/StateView';
import {
  listPools,
  getDelegationStatus,
  delegateToPool,
  PoolApiError,
  type PoolSummary,
  type DelegationStatus,
} from '../poolService';

const PoolHomeScreen: React.FC = () => {
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [delegation, setDelegation] = useState<DelegationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errStatus, setErrStatus] = useState<StateStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrStatus(null);
    try {
      const [poolRes, delRes] = await Promise.all([
        listPools(),
        getDelegationStatus().catch(() => null), // trạng thái uỷ quyền best-effort
      ]);
      setPools(poolRes.pools ?? []);
      setDelegation(delRes);
    } catch (e) {
      // network → offline; auth/server → error (thông điệp thân thiện, không lộ kỹ thuật).
      const kind = e instanceof PoolApiError ? e.kind : 'server';
      setErrStatus(kind === 'network' ? 'offline' : 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onDelegate = useCallback(async (poolId: string) => {
    try {
      await delegateToPool(poolId);
    } catch (e) {
      const msg = e instanceof PoolApiError ? e.message : 'Chưa uỷ quyền được.';
      Alert.alert('Uỷ quyền', msg);
    }
  }, []);

  const renderPool = useCallback(
    ({ item }: { item: PoolSummary }) => {
      const active = delegation?.delegated_pool_id === item.pool_id;
      return (
        <View style={[styles.card, active && styles.cardActive]}>
          <View style={styles.cardRow}>
            <View style={styles.tickerBox}>
              <Text style={styles.ticker}>{item.ticker ?? '—'}</Text>
            </View>
            <View style={styles.grow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name ?? item.pool_id}
              </Text>
              {!!item.description && (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
            </View>
            {active && (
              <Icon name="check-decagram" size={22} color={COLORS.accent} />
            )}
          </View>

          <View style={styles.metrics}>
            <Metric label="Lợi suất" value={item.roa != null ? `${item.roa}%` : '—'} />
            <Metric
              label="Bão hoà"
              value={item.saturation != null ? `${Math.round(item.saturation * 100)}%` : '—'}
            />
            <Metric label="Phí" value={item.margin != null ? `${item.margin}%` : '—'} />
          </View>

          <TouchableOpacity
            style={[styles.delegateBtn, active && styles.delegateBtnActive]}
            onPress={() => onDelegate(item.pool_id)}
            disabled={active}
          >
            <Text style={styles.delegateTxt}>
              {active ? 'Đang uỷ quyền' : 'Uỷ quyền'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [delegation, onDelegate],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>Pool</Text>
        <Text style={styles.subtitle}>Chọn pool để uỷ quyền stake</Text>
      </View>

      {delegation?.delegated_pool_id ? (
        <View style={styles.banner}>
          <Icon name="lightning-bolt" size={18} color={COLORS.accent} />
          <Text style={styles.bannerTxt}>
            Đang uỷ quyền · Thưởng khả dụng: {delegation.available_rewards ?? '0'}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <StateView status="loading" loadingLines={4} />
      ) : errStatus ? (
        <StateView status={errStatus} onRetry={load} />
      ) : (
        <FlatList
          data={pools}
          keyExtractor={(p) => p.pool_id}
          renderItem={renderPool}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <StateView status="empty" message="Chưa có pool nào để hiển thị." />
          }
        />
      )}
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSub, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  bannerTxt: { color: COLORS.text, fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardActive: { borderColor: COLORS.accent },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticker: { fontWeight: '700', color: COLORS.accent, fontSize: 12 },
  grow: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  desc: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1 },
  metricValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  metricLabel: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
  delegateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  delegateBtnActive: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.accent },
  delegateTxt: { color: COLORS.white, fontWeight: '600' },
});

export default PoolHomeScreen;
