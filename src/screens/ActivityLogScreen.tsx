// screens/ActivityLogScreen.tsx
// Nhật-ký hoạt-động (ký / xoay khoá / export…). GET /activity-logs.
// Shape ĐÃ đối-chiếu ActivityLogPage.java: cursor pagination, item { id, userId,
// action, metadata, createdAt }. nextCursor=null → hết data.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { phoenixKeyApi, type ActivityLogItem } from '../services/phoenixKey-api';
import StateView from '../components/state/StateView';

const PRIMARY = '#4A55C7';
const PAGE = 30;

type LogItem = ActivityLogItem;

/** Icon theo loại hoạt-động (đoán theo field type/action, phòng-thủ). */
const iconFor = (t: string): string => {
  const s = t.toLowerCase();
  if (s.includes('sign')) return 'draw-pen';
  if (s.includes('rotate') || s.includes('key')) return 'key-change';
  if (s.includes('export')) return 'export-variant';
  if (s.includes('recover')) return 'cellphone-key';
  if (s.includes('guardian')) return 'account-supervisor-outline';
  return 'history';
};

const fmtTime = (v: unknown): string => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(n)) return '';
  return new Date(n).toLocaleString('vi-VN');
};

const ActivityLogScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Tải trang đầu (reset). onRefresh cũng gọi cái này.
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await phoenixKeyApi.activityLogs.list({ limit: PAGE });
      setItems(res.logs);
      setCursor(res.nextCursor);
    } catch {
      setError(true); setItems([]); setCursor(null);
    } finally { setLoading(false); }
  }, []);

  // Tải thêm theo cursor (append). Dừng khi nextCursor=null.
  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const res = await phoenixKeyApi.activityLogs.list({ limit: PAGE, cursor });
      setItems(prev => [...prev, ...res.logs]);
      setCursor(res.nextCursor);
    } catch {
      /* giữ nguyên list, cho phép thử lại lần cuộn sau */
    } finally { setLoadingMore(false); }
  }, [cursor, loadingMore]);

  useEffect(() => { load(); }, [load]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Nhật ký hoạt động</Text>
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={5} /></View>;
  if (error) return <View style={styles.root}>{header}<StateView status="error" onRetry={load} /></View>;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      {header}
      <FlatList
        data={items}
        keyExtractor={(it, i) => String(it.id ?? i)}
        contentContainerStyle={items.length === 0 ? styles.empty : styles.list}
        onRefresh={load}
        refreshing={loading}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} color={PRIMARY} /> : null
        }
        ListEmptyComponent={
          <StateView status="empty" title="Chưa có hoạt động" message="Các thao tác ký, xoay khoá, khôi phục sẽ hiện ở đây." />
        }
        renderItem={({ item }) => {
          const type = String(item.action ?? 'Hoạt động');
          // metadata Zero-PII (vd { guardian_did, ip_hash }) → dòng mô-tả gọn.
          const desc = item.metadata
            ? Object.entries(item.metadata)
                .filter(([k]) => k !== 'ip_hash')
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(' · ')
            : '';
          const time = fmtTime(item.createdAt);
          return (
            <View style={styles.row}>
              <View style={styles.iconWrap}><Icon name={iconFor(type)} size={18} color={PRIMARY} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>{type}</Text>
                {!!desc && <Text style={styles.desc} numberOfLines={2}>{desc}</Text>}
                {!!time && <Text style={styles.time}>{time}</Text>}
              </View>
            </View>
          );
        }}
      />
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

  list: { padding: 12, gap: 8 },
  empty: { flexGrow: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,85,199,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  type: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  desc: { fontSize: 12, color: COLORS.textSub, marginTop: 2, lineHeight: 16 },
  time: { fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontWeight: '600' },
});

export default ActivityLogScreen;
