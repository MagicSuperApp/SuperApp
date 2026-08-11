// modules/work/screens/EvidenceScreen.tsx
// Đăng BẰNG CHỨNG cho 1 hợp đồng (chỉ bên làm/Genie) TRƯỚC khi giao việc. Soạn danh
// sách mục (ghi chú / liên kết) → đăng lên (POST evidence/register). Hiện bằng chứng
// đã có + trạng thái neo. Demo (chưa host) → báo trung thực.

import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { useEvidence } from '../hooks/useEvidence';
import StateView from '../../../components/state/StateView';
import type { EvidenceItem } from '../services/workApi';

type RouteParams = { WorkEvidence: { contractId: string } };

const EvidenceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'WorkEvidence'>>();
  const { contractId } = route.params;
  const { items, status, loading, errorKind, usingMock, submitting, errorCode, reload, register } =
    useEvidence(contractId);

  const [type, setType] = React.useState<'note' | 'link'>('note');
  const [content, setContent] = React.useState('');
  const [drafts, setDrafts] = React.useState<EvidenceItem[]>([]);

  const addDraft = () => {
    const c = content.trim();
    if (!c) return;
    setDrafts(d => [...d, { type, content: c }]);
    setContent('');
  };
  const removeDraft = (i: number) => setDrafts(d => d.filter((_, idx) => idx !== i));

  const onSubmit = async () => {
    if (drafts.length === 0) { Alert.alert('Chưa có mục', 'Thêm ít nhất 1 mục bằng chứng.'); return; }
    const ok = await register(drafts);
    if (ok) {
      setDrafts([]);
      Alert.alert('Đã đăng', 'Bằng chứng đã lưu. Bạn có thể quay lại giao việc.');
    } else if (errorCode === 'BACKEND_DISABLED') {
      Alert.alert('Chưa kết nối máy chủ', 'Cần máy chủ AladinWork để đăng bằng chứng.');
    } else {
      Alert.alert('Không đăng được', errorCode === 'EVIDENCE_SHORT'
        ? 'Bằng chứng chưa đủ — thêm mô tả/liên kết cụ thể hơn.'
        : `Lỗi${errorCode ? ` (${errorCode})` : ''}. Thử lại sau.`);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Bằng chứng</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={3} /></View>;
  if (errorKind === 'network') return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Bằng chứng đã đăng */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Đã đăng {status ? `· ${status}` : ''}</Text>
            {items.map((it, i) => (
              <View key={`saved-${i}`} style={styles.savedRow}>
                <Icon name={it.type === 'link' ? 'link-variant' : 'note-text-outline'} size={16} color={WORK_THEME.primary} />
                <Text style={styles.savedText} numberOfLines={2}>{it.content}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Soạn mục mới */}
        <Text style={styles.label}>Thêm bằng chứng</Text>
        <View style={styles.segment}>
          {(['note', 'link'] as const).map(t => (
            <TouchableOpacity key={t}
              style={[styles.segItem, type === t && styles.segItemOn]}
              onPress={() => setType(t)} activeOpacity={0.85}>
              <Text style={[styles.segText, type === t && styles.segTextOn]}>
                {t === 'note' ? 'Ghi chú' : 'Liên kết'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={content}
            onChangeText={setContent}
            placeholder={type === 'link' ? 'https://… (đường dẫn ảnh hoặc clip)' : 'Mô tả việc đã làm'}
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addDraft} activeOpacity={0.85}>
            <Icon name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Danh sách nháp chờ đăng */}
        {drafts.map((d, i) => (
          <View key={`draft-${i}`} style={styles.draftRow}>
            <Icon name={d.type === 'link' ? 'link-variant' : 'note-text-outline'} size={15} color={COLORS.textSub} />
            <Text style={styles.draftText} numberOfLines={1}>{d.content}</Text>
            <TouchableOpacity onPress={() => removeDraft(i)} hitSlop={8}>
              <Icon name="close" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.submit, (submitting || drafts.length === 0) && styles.submitOff]}
          onPress={onSubmit} disabled={submitting || drafts.length === 0} activeOpacity={0.9}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Đăng {drafts.length > 0 ? `${drafts.length} mục` : 'bằng chứng'}</Text>}
        </TouchableOpacity>
      </ScrollView>
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

  body: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textSub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  savedText: { flex: 1, fontSize: 13, color: COLORS.text },

  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segItem: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  segItemOn: { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
  segText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  segTextOn: { color: '#fff' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: WORK_THEME.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  draftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: COLORS.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  draftText: { flex: 1, fontSize: 13, color: COLORS.textSub },

  submit: {
    marginTop: 24, backgroundColor: WORK_THEME.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', height: 52,
  },
  submitOff: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

export default EvidenceScreen;
