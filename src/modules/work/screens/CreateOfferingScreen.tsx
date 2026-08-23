// modules/work/screens/CreateOfferingScreen.tsx
// Chào DỊCH VỤ (nửa CUNG, H-28) — POST /offerings. Chọn mẫu (JobType) → dựng biểu-mẫu
// ĐỘNG từ template.fields[] (enum → chip; số/chữ → ô nhập). `mode:'online'` ẩn bán-kính
// (server ép radiusKm=0). Submit qua useOfferingMutations (Idempotency-Key tự gắn).
// KHÔNG fake: chế-độ demo (chưa có host) trả BACKEND_DISABLED → báo trung thực.

import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { useTemplates } from '../hooks/useTemplates';
import { useOfferingMutations } from '../hooks/useOfferings';
import StateView from '../../../components/state/StateView';
import type { JobType, JobTypeField } from '../services/types';
import type { CreateOfferingBody } from '../services/workApi';
import { showError, showInfo, showSuccess } from '../../../utils/alert';

const MODES: Array<{ key: 'online' | 'offline' | 'ca-hai'; label: string }> = [
  { key: 'online', label: 'Trực tuyến' },
  { key: 'offline', label: 'Tại chỗ' },
  { key: 'ca-hai', label: 'Cả hai' },
];

const CreateOfferingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { templates, loading, usingMock, errorKind, reload } = useTemplates();
  const { create, submitting, errorCode } = useOfferingMutations();

  const [templateKey, setTemplateKey] = React.useState<string>('');
  const [name, setName] = React.useState('');
  const [minPrice, setMinPrice] = React.useState('');
  const [mode, setMode] = React.useState<'online' | 'offline' | 'ca-hai'>('offline');
  const [radiusKm, setRadiusKm] = React.useState('');
  const [schedule, setSchedule] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const selected: JobType | undefined = templates.find(t => t.key === templateKey);

  const setField = (k: string, v: string) => setFields(f => ({ ...f, [k]: v }));

  const canSubmit = !!templateKey && !submitting;

  const onSubmit = async () => {
    if (!templateKey) { showInfo('Thiếu mẫu', 'Chọn loại dịch vụ (mẫu việc) trước.'); return; }
    const body: CreateOfferingBody = {
      templateKey,
      name: name.trim() || undefined,
      minPriceVND: minPrice ? Number(minPrice) : undefined,
      mode,
      // online: server ép 0 — gửi 0 cho tường minh; khác: gửi số nếu có.
      radiusKm: mode === 'online' ? 0 : (radiusKm ? Number(radiusKm) : undefined),
      schedule: schedule.trim() || undefined,
      desc: desc.trim() || undefined,
      fields: Object.keys(fields).length ? fields : undefined,
    };
    const res = await create(body);
    if (res) {
      showSuccess('Đã chào dịch vụ', 'Dịch vụ của bạn đã lên chợ.', {
          confirmText: 'OK',
          hideCancel: true,
          onConfirm: () => navigation.goBack(),
      });
    } else if (errorCode === 'BACKEND_DISABLED') {
      showError('Chưa kết nối máy chủ', 'Cần máy chủ AladinWork để chào dịch vụ. Thử lại khi dịch vụ sống.');
    } else {
      showError('Không tạo được', errorCode === 'BAD_INPUT'
        ? 'Dữ liệu chưa hợp lệ — kiểm tra lại giá / các trường theo mẫu.'
        : `Lỗi máy chủ${errorCode ? ` (${errorCode})` : ''}. Thử lại sau.`);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Chào dịch vụ</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Chọn mẫu (bắt buộc) */}
        <Text style={styles.label}>Loại dịch vụ <Text style={styles.req}>*</Text></Text>
        {templates.length === 0 ? (
          <StateView
            status={errorKind ? 'error' : 'empty'}
            title={usingMock ? 'Chưa kết nối máy chủ' : 'Chưa có mẫu việc'}
            message={usingMock
              ? 'Danh sách mẫu dịch vụ cần máy chủ AladinWork.'
              : 'Máy chủ chưa khai mẫu việc nào.'}
            onRetry={errorKind ? reload : undefined}
          />
        ) : (
          <View style={styles.chipsWrap}>
            {templates.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.chip, templateKey === t.key && styles.chipOn]}
                onPress={() => { setTemplateKey(t.key); setFields({}); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, templateKey === t.key && styles.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!!selected && (
          <>
            <Field label="Tên dịch vụ">
              <TextInput style={styles.input} value={name} onChangeText={setName}
                placeholder={selected.label} placeholderTextColor={COLORS.textMuted} />
            </Field>

            <Field label="Giá tối thiểu (VND)">
              <TextInput style={styles.input} value={minPrice} onChangeText={setMinPrice}
                keyboardType="number-pad" placeholder="vd 90000" placeholderTextColor={COLORS.textMuted} />
            </Field>

            <Text style={styles.label}>Hình thức</Text>
            <View style={styles.segment}>
              {MODES.map(m => (
                <TouchableOpacity key={m.key}
                  style={[styles.segItem, mode === m.key && styles.segItemOn]}
                  onPress={() => setMode(m.key)} activeOpacity={0.85}>
                  <Text style={[styles.segText, mode === m.key && styles.segTextOn]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode !== 'online' && (
              <Field label="Bán kính phục vụ (km)">
                <TextInput style={styles.input} value={radiusKm} onChangeText={setRadiusKm}
                  keyboardType="number-pad" placeholder="vd 10" placeholderTextColor={COLORS.textMuted} />
              </Field>
            )}

            <Field label="Lịch làm việc">
              <TextInput style={styles.input} value={schedule} onChangeText={setSchedule}
                placeholder="vd T2–T6, 8h–17h" placeholderTextColor={COLORS.textMuted} />
            </Field>

            <Field label="Mô tả">
              <TextInput style={[styles.input, styles.multiline]} value={desc} onChangeText={setDesc}
                multiline placeholder="Giới thiệu ngắn về dịch vụ của bạn" placeholderTextColor={COLORS.textMuted} />
            </Field>

            {/* Trường ĐỘNG theo mẫu (template.fields[]) */}
            {(selected.fields ?? []).map((f: JobTypeField) => (
              <Field key={f.key} label={f.label}>
                {Array.isArray(f.options) && f.options.length > 0 ? (
                  <View style={styles.chipsWrap}>
                    {f.options.map(opt => (
                      <TouchableOpacity key={opt}
                        style={[styles.chipSm, fields[f.key] === opt && styles.chipOn]}
                        onPress={() => setField(f.key, opt)} activeOpacity={0.85}>
                        <Text style={[styles.chipTextSm, fields[f.key] === opt && styles.chipTextOn]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TextInput style={styles.input}
                    value={fields[f.key] ?? ''} onChangeText={v => setField(f.key, v)}
                    keyboardType={f.type === 'number' ? 'number-pad' : 'default'}
                    placeholder={f.default ?? ''} placeholderTextColor={COLORS.textMuted} />
                )}
              </Field>
            ))}

            <TouchableOpacity
              style={[styles.submit, !canSubmit && styles.submitOff]}
              onPress={onSubmit} disabled={!canSubmit} activeOpacity={0.9}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Chào dịch vụ lên chợ</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginTop: 14 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
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

  body: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  req: { color: '#C7522E' },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipSm: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  chipTextSm: { fontSize: 12, fontWeight: '600', color: COLORS.textSub },
  chipTextOn: { color: '#fff' },

  segment: { flexDirection: 'row', gap: 8 },
  segItem: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  segItemOn: { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
  segText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  segTextOn: { color: '#fff' },

  submit: {
    marginTop: 24, backgroundColor: WORK_THEME.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', height: 52,
  },
  submitOff: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

export default CreateOfferingScreen;
