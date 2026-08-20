// modules/work/screens/TaskersScreen.tsx
// Danh bạ thợ (H-02, GET /taskers — công khai). Chỉ người đã chào năng lực lọt vào.
// Chạm 1 thợ → hồ sơ (WorkerProfile). Đơn-vị giá lấy từ offering minPriceVND.

import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { formatVND } from '../data/mockData';
import { useTaskers } from '../hooks/useTaskers';
import { useCreateContract } from '../hooks/useContracts';
import StateView from '../../../components/state/StateView';
import type { Tasker, TaskerOffering } from '../services/types';
import { showError } from '../../../utils/alert';

const TaskersScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [onlyAvailable, setOnlyAvailable] = React.useState(false);
  const { taskers, total, loading, errorKind, usingMock, reload } = useTaskers({
    availableOnly: onlyAvailable,
  });
  const { create, creating, errorCode } = useCreateContract();

  // Đặt 1 dịch vụ → tạo hợp đồng {offeringId} → mở ContractDetail (vào vòng đời pledge).
  const handleBook = async (offeringId: string) => {
    const contract = await create({ offeringId });
    if (contract) {
      navigation.navigate('ContractDetail', { contractId: contract.id });
    } else {
      showError('Chưa đặt được',
        errorCode === 'BACKEND_DISABLED'
          ? 'Cần máy chủ AladinWork để tạo hợp đồng. Thử lại khi dịch vụ sống.'
          : `Không tạo được hợp đồng${errorCode ? ` (${errorCode})` : ''}. Thử lại sau.`);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Danh bạ thợ{total ? ` · ${total}` : ''}</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
      <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('WorkCreateOffering')} style={styles.addBtn}>
        <Icon name="plus" size={18} color="#fff" />
        <Text style={styles.addText}>Chào dịch vụ</Text>
      </TouchableOpacity>
    </View>
  );

  const filterBar = (
    <View style={styles.filterBar}>
      <TouchableOpacity
        style={[styles.chip, onlyAvailable && styles.chipOn]}
        onPress={() => setOnlyAvailable(v => !v)}
        activeOpacity={0.85}
      >
        <Icon name={onlyAvailable ? 'check-circle' : 'circle-outline'} size={14}
          color={onlyAvailable ? '#fff' : COLORS.textSub} />
        <Text style={[styles.chipText, onlyAvailable && styles.chipTextOn]}>Chỉ đang rảnh</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;
  if (errorKind === 'network') return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;
  if (errorKind && errorKind !== 'client') return <View style={styles.root}>{header}<StateView status="error" onRetry={reload} /></View>;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      {filterBar}
      <FlatList
        data={taskers}
        keyExtractor={(t) => t.did}
        contentContainerStyle={taskers.length === 0 ? styles.empty : styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <StateView
            status="empty"
            title={usingMock ? 'Chưa kết nối máy chủ' : 'Chưa có thợ trong danh bạ'}
            message={usingMock
              ? 'Danh bạ thợ cần máy chủ AladinWork. Sẽ hiện khi dịch vụ sống.'
              : 'Chưa có ai chào năng lực (chứng chỉ / dịch vụ / lịch rảnh). Quay lại sau.'}
          />
        }
        renderItem={({ item }) => (
          <TaskerRow
            t={item}
            creating={creating}
            onPress={() => navigation.navigate('WorkerProfile', { workerId: item.did })}
            onBook={handleBook}
          />
        )}
      />
    </View>
  );
};

const TaskerRow: React.FC<{
  t: Tasker; creating: boolean; onPress: () => void; onBook: (offeringId: string) => void;
}> = ({ t, creating, onPress, onBook }) => {
  // Dịch vụ rẻ nhất (có id) để đặt trực-tiếp → createContract({offeringId}).
  const cheapestOffering = (t.offerings ?? []).reduce<TaskerOffering | null>((best, o) => {
    if (typeof o.minPriceVND !== 'number') return best;
    if (!best || typeof best.minPriceVND !== 'number') return o;
    return o.minPriceVND < best.minPriceVND ? o : best;
  }, null);
  const cheapest = cheapestOffering?.minPriceVND ?? null;
  const skills = (t.skills ?? []).slice(0, 3);
  return (
    <View style={styles.rowWrap}>
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{t.avatar ?? '👤'}</Text></View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>{t.name ?? t.did.slice(0, 20) + '…'}</Text>
          {!!t.verifiedCredentials && (
            <View style={styles.verBadge}>
              <Icon name="shield-check" size={11} color="#2E7D46" />
              <Text style={styles.verText}>{t.verifiedCredentials}</Text>
            </View>
          )}
        </View>
        {!!t.title && <Text style={styles.title} numberOfLines={1}>{t.title}</Text>}
        {skills.length > 0 && (
          <View style={styles.skills}>
            {skills.map(s => <View key={s} style={styles.skillChip}><Text style={styles.skillText}>{s}</Text></View>)}
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {/*
          `reputation` là uy tín HIỆU DỤNG r̂×D, thang 0..100 — KHÔNG phải số lượt
          đánh giá. Icon ngôi sao cạnh một con số trần là bẫy đọc: người thuê thấy
          "72" cạnh ngôi sao sẽ hiểu 72 lượt đánh giá, không phải 72/100 điểm. Ở chợ
          việc, đọc nhầm chỗ này là chọn nhầm người. Nên bỏ sao, ghi thẳng "/100".
        */}
        {typeof t.reputation === 'number' && (
          <View style={styles.repLine}>
            <Icon name="shield-check-outline" size={12} color={WORK_THEME.primary} />
            <Text style={styles.rep}>{t.reputation}<Text style={styles.repMax}>/100</Text></Text>
          </View>
        )}
        <Text style={[styles.avail, { color: t.available ? '#2E7D46' : COLORS.textMuted }]}>
          {t.available ? 'Đang rảnh' : 'Bận'}
        </Text>
        {cheapest !== null && <Text style={styles.price}>từ {formatVND(cheapest)}</Text>}
      </View>
    </TouchableOpacity>
    {cheapestOffering && (
      <TouchableOpacity
        style={[styles.bookBtn, creating && styles.bookBtnOff]}
        onPress={() => onBook(cheapestOffering.id)}
        disabled={creating}
        activeOpacity={0.9}
      >
        {creating
          ? <ActivityIndicator color="#fff" size="small" />
          : (<>
              <Icon name="handshake-outline" size={15} color="#fff" />
              <Text style={styles.bookText}>Đặt “{cheapestOffering.name}”</Text>
            </>)}
      </TouchableOpacity>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WORK_THEME.primaryDeep, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  demoTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)' },
  demoText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  addText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },
  chipTextOn: { color: '#fff' },

  list: { padding: 12, gap: 10 },
  empty: { flexGrow: 1 },

  rowWrap: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: WORK_THEME.primary, borderRadius: 10, paddingVertical: 10,
  },
  bookBtnOff: { opacity: 0.5 },
  bookText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  avatarText: { fontSize: 20 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  verBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(46,125,70,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  verText: { fontSize: 10, fontWeight: '800', color: '#2E7D46' },
  title: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  skillChip: { backgroundColor: COLORS.bg, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  skillText: { fontSize: 10, fontWeight: '600', color: COLORS.textSub },
  repLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rep: { fontSize: 14, fontWeight: '900', color: WORK_THEME.primary },
  repMax: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  avail: { fontSize: 11, fontWeight: '700' },
  price: { fontSize: 11, fontWeight: '700', color: COLORS.textSub },
});

export default TaskersScreen;
