// modules/work/screens/AvailabilityScreen.tsx
// Khai lịch sẵn sàng nhận việc (Genie). Preset nhanh 7/30 ngày (tránh phụ thuộc
// date-picker); khai = epoch MS. Chưa khai → trạng thái an toàn "không nhận việc".

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { useAvailability, isAvailable } from '../hooks/useAvailability';
import StateView from '../../../components/state/StateView';
import { showError, showSuccess, showWarning } from '../../../utils/alert';

const DAY = 86_400_000;
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('vi-VN');

const AvailabilityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { data, loading, errorKind, usingMock, saving, reload, save, clear } = useAvailability();

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Lịch sẵn sàng</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={3} /></View>;
  if (errorKind === 'network') return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;
  if (errorKind && errorKind !== 'client') return <View style={styles.root}>{header}<StateView status="error" onRetry={reload} /></View>;

  const available = isAvailable(data);

  const onSet = (days: number) => {
    const from = Date.now();
    save({ availableFrom: from, availableUntil: from + days * DAY })
      .then(() => showSuccess('Đã khai', `Bạn nhận việc trong ${days} ngày tới.`))
      .catch(() => showError('Lỗi', 'Không lưu được lịch, thử lại.'));
  };

  const onClear = () => {
    showWarning('Ngừng nhận việc', 'Bạn sẽ không hiện trong danh sách ứng viên rảnh cho tới khi khai lại.', {
        confirmText: 'Ngừng',
        cancelText: 'Huỷ',
        onConfirm: () => clear(),
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {/* Trạng thái hiện tại */}
        <View style={[styles.card, available ? styles.cardOn : styles.cardOff]}>
          <View style={styles.statusRow}>
            <Icon
              name={available ? 'check-circle' : 'moon-waning-crescent'}
              size={22}
              color={available ? '#2E7D46' : COLORS.textMuted}
            />
            <Text style={[styles.statusText, { color: available ? '#2E7D46' : COLORS.textSub }]}>
              {available ? 'Đang nhận việc' : 'Chưa khai — không nhận việc'}
            </Text>
          </View>
          {available && data && 'availableFrom' in data && (
            <View style={styles.windowBox}>
              <Text style={styles.windowText}>
                {fmtDate(data.availableFrom)} → {fmtDate(data.availableUntil)}
              </Text>
              {!!data.note && <Text style={styles.noteText}>{data.note}</Text>}
              {!!data.skills?.length && (
                <View style={styles.skillRow}>
                  {data.skills.map((s) => (
                    <View key={s} style={styles.skillTag}><Text style={styles.skillText}>{s}</Text></View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Khai nhanh */}
        <Text style={styles.sectionLabel}>Khai nhận việc</Text>
        <View style={styles.presetRow}>
          <PresetBtn label="7 ngày" onPress={() => onSet(7)} disabled={saving} />
          <PresetBtn label="30 ngày" onPress={() => onSet(30)} disabled={saving} />
        </View>

        {available && (
          <TouchableOpacity style={styles.clearBtn} onPress={onClear} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#C0533A" /> : (
              <>
                <Icon name="close-circle-outline" size={16} color="#C0533A" />
                <Text style={styles.clearText}>Ngừng nhận việc</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.hint}>
          <Icon name="information-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.hintText}>
            Khai sẵn sàng giúp bạn xuất hiện trong khớp ứng viên. Mặc định an toàn: chưa khai thì không nhận việc.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const PresetBtn: React.FC<{ label: string; onPress: () => void; disabled: boolean }> = ({
  label, onPress, disabled,
}) => (
  <TouchableOpacity style={styles.preset} onPress={onPress} disabled={disabled} activeOpacity={0.85}>
    <Icon name="calendar-check-outline" size={16} color="#fff" />
    <Text style={styles.presetText}>{label}</Text>
  </TouchableOpacity>
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

  card: { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 16 },
  cardOn: { backgroundColor: 'rgba(46,125,70,0.06)', borderColor: 'rgba(46,125,70,0.25)' },
  cardOff: { backgroundColor: COLORS.card, borderColor: COLORS.border },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 15, fontWeight: '800' },
  windowBox: { marginTop: 12, gap: 8 },
  windowText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  noteText: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: WORK_THEME.primaryGlow },
  skillText: { fontSize: 11, fontWeight: '700', color: WORK_THEME.primary },

  sectionLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.4, marginBottom: 10, textTransform: 'uppercase' },
  presetRow: { flexDirection: 'row', gap: 10 },
  preset: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, backgroundColor: WORK_THEME.primary, borderRadius: 12,
  },
  presetText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, marginTop: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#C0533A', backgroundColor: COLORS.card,
  },
  clearText: { fontSize: 14, fontWeight: '800', color: '#C0533A' },

  hint: { flexDirection: 'row', gap: 8, marginTop: 20, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
});

export default AvailabilityScreen;
