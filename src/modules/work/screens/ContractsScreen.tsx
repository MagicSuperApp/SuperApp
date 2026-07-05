// modules/work/screens/ContractsScreen.tsx
// Danh sách hợp đồng của tôi (Aladin hoặc Genie) — vào chi tiết để chạy Pledge.

import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { formatVND } from '../data/mockData';
import { useMyContracts } from '../hooks/useContracts';
import { STATE_META } from './contractState';
import StateView from '../../../components/state/StateView';
import type { WorkContract } from '../services/types';

const ContractsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { contracts, loading, errorKind, usingMock, reload } = useMyContracts();

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Hợp đồng của tôi</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) {
    return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;
  }
  if (errorKind === 'network') {
    return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;
  }
  if (errorKind && errorKind !== 'client') {
    return <View style={styles.root}>{header}<StateView status="error" onRetry={reload} /></View>;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <FlatList
        data={contracts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={contracts.length === 0 ? styles.empty : styles.list}
        showsVerticalScrollIndicator={false}
        onRefresh={reload}
        refreshing={loading}
        ListEmptyComponent={
          <StateView
            status="empty"
            title="Chưa có hợp đồng"
            message="Khi bạn thuê hoặc nhận việc, hợp đồng ký quỹ sẽ hiện ở đây."
          />
        }
        renderItem={({ item }) => (
          <ContractRow
            contract={item}
            onPress={() => navigation.navigate('ContractDetail', { contractId: item.id })}
          />
        )}
      />
    </View>
  );
};

const ContractRow: React.FC<{ contract: WorkContract; onPress: () => void }> = ({
  contract, onPress,
}) => {
  const meta = STATE_META[contract.state];
  const pledge = contract.parties[contract.myRole ?? 'aladin']?.pledgeLocked ?? 0;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.rowTop}>
        <Text style={styles.service} numberOfLines={1}>{contract.service}</Text>
        <View style={[styles.badge, { backgroundColor: meta.glow }]}>
          <View style={[styles.dot, { backgroundColor: meta.color }]} />
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <View style={styles.rowMeta}>
        <View style={styles.metaItem}>
          <Icon name="account-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{contract.otherName ?? '—'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name={contract.myRole === 'aladin' ? 'briefcase-outline' : 'account-hard-hat'} size={13} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{contract.myRole === 'aladin' ? 'Bạn thuê' : 'Bạn nhận'}</Text>
        </View>
      </View>
      <View style={styles.rowFoot}>
        <Text style={styles.pledge}>Cọc {pledge} MAGIC</Text>
        {typeof contract.serviceFeeVND === 'number' && (
          <Text style={styles.fee}>{formatVND(contract.serviceFeeVND)} VND</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  demoTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  demoText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  list: { padding: 12, gap: 10 },
  empty: { flexGrow: 1 },

  row: {
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    gap: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  service: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  rowMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },

  rowFoot: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10,
  },
  pledge: { fontSize: 12, fontWeight: '800', color: WORK_THEME.primary },
  fee: { fontSize: 12, fontWeight: '700', color: COLORS.text },
});

export default ContractsScreen;
