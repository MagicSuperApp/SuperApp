// modules/work/screens/MatchScreen.tsx
// Khớp ứng viên cho 1 tin tuyển (Jem-Math). Hiện tier/score + cờ đạt/ sẵn sàng.

import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { formatVND } from '../data/mockData';
import { useMatch } from '../hooks/useMatch';
import { useCreateContract } from '../hooks/useContracts';
import StateView from '../../../components/state/StateView';
import type { MatchCandidate } from '../services/types';
import { showError } from '../../../utils/alert';

type RouteParams = { WorkMatch: { jobId: string } };

const TIER_COLOR: Record<string, string> = { A: '#2E7D46', B: '#3B6EA8', C: '#C7862E', D: '#8A8F98' };

const MatchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'WorkMatch'>>();
  const { jobId } = route.params;
  const { result, loading, errorKind, usingMock, reload } = useMatch(jobId);
  const { create, creating, errorCode } = useCreateContract();

  // Thuê ứng viên → tạo hợp đồng {jobId, candidateDid} → mở ContractDetail (vào vòng
  // đời pledge). Mock/lỗi → báo nhẹ, KHÔNG tạo hợp đồng giả.
  const handleHire = async (candidateDid: string) => {
    const contract = await create({ jobId, candidateDid });
    if (contract) {
      navigation.navigate('ContractDetail', { contractId: contract.id });
    } else {
      showError('Chưa thuê được',
        errorCode === 'BACKEND_DISABLED'
          ? 'Cần máy chủ AladinWork để tạo hợp đồng. Thử lại khi dịch vụ sống.'
          : errorCode === 'ALREADY'
          ? 'Đã có hợp đồng với ứng viên này cho tin việc.'
          : `Không tạo được hợp đồng${errorCode ? ` (${errorCode})` : ''}. Thử lại sau.`);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Ứng viên phù hợp</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;
  if (errorKind === 'network') return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;
  if (errorKind && errorKind !== 'client') return <View style={styles.root}>{header}<StateView status="error" onRetry={reload} /></View>;

  const candidates = result?.candidates ?? [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <FlatList
        data={candidates}
        keyExtractor={(c) => c.did}
        contentContainerStyle={candidates.length === 0 ? styles.empty : styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <StateView
            status="empty"
            title="Chưa có ứng viên đạt yêu cầu"
            message="Thử nới yêu cầu năng lực hoặc mở rộng khu vực để tăng số ứng viên khớp."
          />
        }
        renderItem={({ item }) => (
          <CandidateRow c={item} creating={creating} onHire={() => handleHire(item.did)} />
        )}
      />
    </View>
  );
};

const CandidateRow: React.FC<{ c: MatchCandidate; creating: boolean; onHire: () => void }> = ({ c, creating, onHire }) => {
  const tier = c.qualityTier ?? 'D';
  const tierColor = TIER_COLOR[tier] ?? '#8A8F98';
  const pct = typeof c.score === 'number' ? Math.round(c.score * 100) : null;
  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
          <Text style={styles.tierText}>{tier}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{c.name ?? c.did.slice(0, 24) + '…'}</Text>
          <View style={styles.flags}>
            <Flag ok={!!c.qualified} label={c.qualified ? 'Đạt năng lực' : 'Chưa đạt'} />
            <Flag ok={!!c.available} label={c.available ? 'Đang rảnh' : 'Bận'} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          {pct !== null && <Text style={styles.score}>{pct}%</Text>}
          {typeof c.priceVND === 'number' && <Text style={styles.price}>{formatVND(c.priceVND)}</Text>}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.hireBtn, (creating || !c.qualified) && styles.hireBtnOff]}
        onPress={onHire}
        disabled={creating || !c.qualified}
        activeOpacity={0.9}
      >
        {creating
          ? <ActivityIndicator color="#fff" size="small" />
          : (<>
              <Icon name="handshake-outline" size={15} color="#fff" />
              <Text style={styles.hireBtnText}>{c.qualified ? 'Thuê ứng viên này' : 'Chưa đủ điều kiện'}</Text>
            </>)}
      </TouchableOpacity>
    </View>
  );
};

const Flag: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <View style={styles.flag}>
    <Icon name={ok ? 'check-circle' : 'close-circle-outline'} size={12} color={ok ? '#2E7D46' : COLORS.textMuted} />
    <Text style={[styles.flagText, { color: ok ? COLORS.text : COLORS.textMuted }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WORK_THEME.primaryDeep, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  demoTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)' },
  demoText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  list: { padding: 12, gap: 10 },
  empty: { flexGrow: 1 },

  row: {
    gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  hireBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: WORK_THEME.primary, borderRadius: 10, paddingVertical: 10,
  },
  hireBtnOff: { opacity: 0.45 },
  hireBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  tierBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tierText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  flags: { flexDirection: 'row', gap: 12, marginTop: 5 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagText: { fontSize: 11, fontWeight: '600' },
  score: { fontSize: 15, fontWeight: '900', color: WORK_THEME.primary },
  price: { fontSize: 11, fontWeight: '700', color: COLORS.textSub },
});

export default MatchScreen;
