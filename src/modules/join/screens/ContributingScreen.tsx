// modules/join/screens/ContributingScreen.tsx
// Màn "Đang đóng góp" (Kết đèn) — spec SG8·F8.4 §4.2.
//
// KHUNG UI + gọi API: trạng thái node (online, việc đang chạy), số việc đã verify,
// thưởng tích luỹ. Đọc song song /v1/node/stats + /v1/reward/epoch (spec §2 bước 7).
// Token-driven, zero hardcode màu. Đủ 4 trạng thái loading/empty/offline/error.
//
// CHỖ CHỜ:
//   - Endpoint LampNet dev sống → số liệu thật; nay bắt lỗi 3 lớp (JoinApiError).
//   - App-loop nền (FGS/BGTask) = bản sau (spec §6) — màn này chỉ HIỂN THỊ.
//   - µLAMP in-memory (spec §5: thử nghiệm, chưa MAGIC thật) — ghi rõ trên UI.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { LAMPNET_THEME } from '../theme/colors';
import StateView from '../../../components/state/StateView';
import {
  getNodeStats,
  getRewardEpoch,
  isLampNetBackendEnabled,
  JoinApiError,
  type NodeStats,
  type RewardEpoch,
} from '../joinService';

type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'error';

const ContributingScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [reward, setReward] = useState<RewardEpoch | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isLampNetBackendEnabled()) {
      setState('offline');
      return;
    }
    if (!isRefresh) setState('loading');
    try {
      // Đọc song song 2 endpoint (spec §2 bước 7).
      const [s, r] = await Promise.all([getNodeStats(), getRewardEpoch()]);
      setStats(s);
      setReward(r);
      // Empty = chưa join / node chưa có dữ liệu (không phải lỗi).
      const hasData = s?.online !== undefined || s?.verified_jobs !== undefined;
      setState(hasData ? 'ready' : 'empty');
    } catch (e) {
      if (e instanceof JoinApiError && e.kind === 'network') {
        setState('offline');
      } else {
        setState('error');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  // ── Trạng thái toàn màn (loading/offline/error/empty) ──
  if (state === 'loading') {
    return <ScreenShell><StateView status="loading" loadingLines={4} /></ScreenShell>;
  }
  if (state === 'offline') {
    return <ScreenShell><StateView status="offline" onRetry={() => load()} /></ScreenShell>;
  }
  if (state === 'error') {
    return (
      <ScreenShell>
        <StateView
          status="error"
          title="Chưa tải được trạng thái node"
          message="Daemon LampNet đang bận hoặc chưa phản hồi. Vui lòng thử lại."
          onRetry={() => load()}
        />
      </ScreenShell>
    );
  }
  if (state === 'empty') {
    return (
      <ScreenShell>
        <StateView
          status="empty"
          title="Chưa đóng góp"
          message="Máy bạn chưa tham gia mạng. Vào 'Kết đèn' để bắt đầu góp sức."
          actionLabel="Kết đèn"
          onAction={() => navigation.navigate('JoinHome')}
        />
      </ScreenShell>
    );
  }

  // ── Ready ──
  const online = stats?.online === true;
  const activeLeases = stats?.active_leases ?? 0;
  const verified = stats?.verified_jobs ?? 0;
  const accrued = reward?.accrued_micro_lamp;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={LAMPNET_THEME.primaryDeep} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Đang đóng góp</Text>
            <Text style={styles.headerSubtitle}>Máy bạn đang là một ngọn đèn của mạng</Text>
          </View>
          <View style={[styles.statusDotWrap, online ? styles.dotOnline : styles.dotOffline]}>
            <Icon
              name={online ? 'access-point' : 'access-point-off'}
              size={16}
              color={LAMPNET_THEME.onPrimary}
            />
            <Text style={styles.statusDotText}>{online ? 'Trực tuyến' : 'Tạm dừng'}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LAMPNET_THEME.primary} />
        }
      >
        {/* Node tạm dừng (offline nhưng không mất tiến độ) — spec §4 trạng thái đặc thù. */}
        {!online && (
          <View style={styles.pausedBanner}>
            <Icon name="pause-circle-outline" size={18} color={LAMPNET_THEME.primaryDeep} />
            <Text style={styles.pausedText}>
              Tạm dừng đóng góp (mất mạng). Tiến độ được giữ; nối lại mạng sẽ tự nhận việc tiếp.
            </Text>
          </View>
        )}

        {/* ── Chỉ số ── */}
        <View style={styles.statRow}>
          <StatCard icon="cog-play-outline" value={String(activeLeases)} label="Việc đang chạy" />
          <StatCard icon="check-decagram-outline" value={String(verified)} label="Việc đã kiểm chứng" />
        </View>

        {/* ── Thưởng tích luỹ ── */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardHeader}>
            <Icon name="gift-outline" size={20} color={LAMPNET_THEME.primary} />
            <Text style={styles.rewardTitle}>Thưởng tích luỹ</Text>
          </View>
          <Text style={styles.rewardValue}>
            {accrued != null ? String(accrued) : '—'}
            <Text style={styles.rewardUnit}> µLAMP</Text>
          </Text>
          {reward?.epoch != null && (
            <Text style={styles.rewardEpoch}>Epoch #{reward.epoch}</Text>
          )}
          <View style={styles.experimentalNote}>
            <Icon name="flask-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.experimentalText}>
              Thử nghiệm — µLAMP tạm tính trong bộ nhớ. MAGIC thật vào ví ở bản sau.
            </Text>
          </View>
        </View>

        {/* ── Minh bạch: máy đang chạy việc gì ── (spec §4.4) */}
        <View style={styles.transparencyCard}>
          <View style={styles.rewardHeader}>
            <Icon name="eye-outline" size={18} color={LAMPNET_THEME.primaryDeep} />
            <Text style={styles.transparencyTitle}>Máy bạn đang làm gì</Text>
          </View>
          <Text style={styles.transparencyBody}>
            {activeLeases > 0
              ? `Đang xử lý ${activeLeases} tác vụ tính toán do mạng giao, kết quả sẽ được kiểm chứng lại trước khi tính thưởng.`
              : 'Chưa có việc nào đang chạy. Mạng sẽ tự giao việc khi có nhu cầu.'}
          </Text>
          {/* Loại workload chi tiết — CHỖ CHỜ khi /v1/mobile/lease trả rõ loại (spec §6). */}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
};

// ── Sub-components ───────────────────────────────────────────────────
const ScreenShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={[styles.root, styles.shellCenter]}>
    <StatusBar barStyle="light-content" backgroundColor={LAMPNET_THEME.primaryDeep} />
    {children}
  </View>
);

const StatCard: React.FC<{ icon: string; value: string; label: string }> = ({ icon, value, label }) => (
  <View style={styles.statCard}>
    <View style={styles.statIconWrap}>
      <Icon name={icon} size={20} color={LAMPNET_THEME.primary} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ── Styles (token-driven, zero hardcode hex) ──
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LAMPNET_THEME.primaryLight },
  shellCenter: { justifyContent: 'center', paddingTop: 80 },

  header: {
    backgroundColor: LAMPNET_THEME.primaryDeep,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitleBox: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: LAMPNET_THEME.onPrimary, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 11, color: LAMPNET_THEME.onPrimary, opacity: 0.8, marginTop: 2 },
  statusDotWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  dotOnline: { backgroundColor: LAMPNET_THEME.primary },
  dotOffline: { backgroundColor: LAMPNET_THEME.primaryDeep, opacity: 0.7 },
  statusDotText: { fontSize: 11, fontWeight: '800', color: LAMPNET_THEME.onPrimary },

  scrollContent: { padding: 16, paddingBottom: 130 },

  pausedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12, marginBottom: 14,
    backgroundColor: LAMPNET_THEME.primaryGlow,
    borderWidth: 1, borderColor: LAMPNET_THEME.primary,
  },
  pausedText: { flex: 1, fontSize: 11, color: COLORS.textSub, lineHeight: 16 },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: COLORS.card,
    borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  statIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: LAMPNET_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  statValue: { fontSize: 24, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },

  rewardCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 18, marginBottom: 14,
    borderWidth: 1.5, borderColor: LAMPNET_THEME.primary,
  },
  rewardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rewardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  rewardValue: { fontSize: 30, fontWeight: '900', color: LAMPNET_THEME.primaryDeep },
  rewardUnit: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  rewardEpoch: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  experimentalNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  experimentalText: { flex: 1, fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' },

  transparencyCard: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  transparencyTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  transparencyBody: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },
});

export default ContributingScreen;
