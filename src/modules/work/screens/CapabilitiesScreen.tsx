// modules/work/screens/CapabilitiesScreen.tsx
// Khai + xác-minh CHỨNG CHỈ NĂNG LỰC (H-02 điều kiện vào danh bạ thợ). Chọn mẫu việc
// → nhập chỉ-số (template.metrics[]) → tạo chứng chỉ (pending) → Xác minh (VeData) →
// hiện hạng (quality_tier). KHÔNG fake ở chế-độ demo (BACKEND_DISABLED).

import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { useTemplates } from '../hooks/useTemplates';
import { useCapabilities } from '../hooks/useCapabilities';
import StateView from '../../../components/state/StateView';
import type { JobType, Credential } from '../services/types';

const TIER_COLOR: Record<string, string> = { A: '#2E7D46', B: '#3B6EA8', C: '#C7862E', D: '#8A8F98' };

const CapabilitiesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { templates, loading, usingMock, errorKind, reload } = useTemplates();
  const { create, verify, submitting, errorCode } = useCapabilities();

  const [templateKey, setTemplateKey] = React.useState('');
  const [metric, setMetric] = React.useState<Record<string, string>>({});
  const [credential, setCredential] = React.useState<Credential | null>(null);

  const selected: JobType | undefined = templates.find(t => t.key === templateKey);
  const setM = (k: string, v: string) => setMetric(m => ({ ...m, [k]: v }));

  const onCreate = async () => {
    if (!templateKey) { Alert.alert('Thiếu mẫu', 'Chọn loại việc (mẫu năng lực) trước.'); return; }
    // Chỉ gửi metric số hợp lệ theo mẫu.
    const num: Record<string, number> = {};
    for (const mt of selected?.metrics ?? []) {
      const raw = metric[mt.key];
      if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) num[mt.key] = Number(raw);
    }
    const res = await create(templateKey, num);
    if (res) {
      setCredential(res);
    } else if (errorCode === 'BACKEND_DISABLED') {
      Alert.alert('Chưa kết nối máy chủ', 'Cần máy chủ AladinWork để khai năng lực.');
    } else {
      Alert.alert('Không tạo được', errorCode === 'BAD_INPUT'
        ? 'Chỉ số chưa hợp lệ theo mẫu — kiểm tra lại.'
        : `Lỗi máy chủ${errorCode ? ` (${errorCode})` : ''}.`);
    }
  };

  const onVerify = async () => {
    if (!credential) return;
    const res = await verify(credential.id, templateKey);
    if (res) {
      setCredential(res.credential);
      Alert.alert(
        res.verified ? 'Đã xác minh' : 'Chưa đạt',
        res.verified
          ? `Chứng chỉ được duyệt — hạng ${res.credential.quality_tier ?? '?'}.`
          : 'VeData chưa duyệt chứng chỉ này. Xem lại chỉ số/bằng chứng.',
      );
    } else if (errorCode === 'BACKEND_DISABLED') {
      Alert.alert('Chưa kết nối máy chủ', 'Cần máy chủ để xác minh.');
    } else {
      Alert.alert('Không xác minh được', `Lỗi${errorCode ? ` (${errorCode})` : ''}. Thử lại sau.`);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Khai năng lực</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Khai chứng chỉ năng lực để lọt danh bạ thợ. VeData xác minh → gắn hạng (A–D).
        </Text>

        <Text style={styles.label}>Loại việc <Text style={styles.req}>*</Text></Text>
        {templates.length === 0 ? (
          <StateView
            status={errorKind ? 'error' : 'empty'}
            title={usingMock ? 'Chưa kết nối máy chủ' : 'Chưa có mẫu việc'}
            message={usingMock ? 'Danh sách mẫu cần máy chủ AladinWork.' : 'Máy chủ chưa khai mẫu nào.'}
            onRetry={errorKind ? reload : undefined}
          />
        ) : (
          <View style={styles.chipsWrap}>
            {templates.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.chip, templateKey === t.key && styles.chipOn]}
                onPress={() => { setTemplateKey(t.key); setMetric({}); setCredential(null); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, templateKey === t.key && styles.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!!selected && (
          <>
            {(selected.metrics ?? []).map(mt => (
              <View key={mt.key} style={{ marginTop: 14 }}>
                <Text style={styles.label}>
                  {mt.label}{mt.unit ? ` (${mt.unit})` : ''}
                </Text>
                <TextInput
                  style={styles.input}
                  value={metric[mt.key] ?? ''}
                  onChangeText={v => setM(mt.key, v)}
                  keyboardType="number-pad"
                  placeholder={mt.reqLabel ?? '0'}
                  placeholderTextColor={COLORS.textMuted}
                  editable={!credential}
                />
              </View>
            ))}

            {!credential ? (
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.btnOff]}
                onPress={onCreate} disabled={submitting} activeOpacity={0.9}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Tạo chứng chỉ</Text>}
              </TouchableOpacity>
            ) : (
              <View style={styles.credCard}>
                <View style={styles.credTop}>
                  <View style={[styles.tierBadge, { backgroundColor: TIER_COLOR[credential.quality_tier ?? 'D'] ?? '#8A8F98' }]}>
                    <Text style={styles.tierText}>{credential.quality_tier ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.credTitle}>{credential.title ?? selected.label}</Text>
                    <Text style={[styles.credStatus, { color: credential.verified ? '#2E7D46' : COLORS.textMuted }]}>
                      {credential.verified ? '✓ Đã xác minh' : '⏳ Chờ xác minh'}
                    </Text>
                  </View>
                </View>
                {!credential.verified && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, submitting && styles.btnOff]}
                    onPress={onVerify} disabled={submitting} activeOpacity={0.9}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Xác minh (VeData)</Text>}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => { setCredential(null); setMetric({}); }} activeOpacity={0.85}>
                  <Text style={styles.secondaryText}>Khai chứng chỉ khác</Text>
                </TouchableOpacity>
              </View>
            )}
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
    backgroundColor: WORK_THEME.primaryDeep, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  demoTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)' },
  demoText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  body: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 12.5, color: COLORS.textSub, lineHeight: 18, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  req: { color: '#C7522E' },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  chipTextOn: { color: '#fff' },

  primaryBtn: {
    marginTop: 20, backgroundColor: WORK_THEME.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', height: 52,
  },
  btnOff: { opacity: 0.5 },
  primaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  secondaryBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  secondaryText: { fontSize: 13, fontWeight: '700', color: WORK_THEME.primary },

  credCard: {
    marginTop: 20, backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  credTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierBadge: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tierText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  credTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  credStatus: { fontSize: 12, fontWeight: '700', marginTop: 3 },
});

export default CapabilitiesScreen;
