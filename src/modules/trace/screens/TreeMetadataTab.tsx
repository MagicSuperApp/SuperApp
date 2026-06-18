// modules/trace/screens/TreeMetadataTab.tsx
//
// Build 49 — Tab "Thông tin" cho TreeDetailScreen.
// Farmer input: variety / age / health / last harvest / notes / voice memo.
// Spec: docs/build49/session-3-tree-metadata.md

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { COLORS } from '../../../constants';
import {
  Tree,
  TreeMetadata,
  TreeVariety,
  TreeHealthStatus,
} from '../types';
import { saveTreeMetadata } from '../store/farmSlice';
import VoiceMemoButton from '../components/VoiceMemoButton';

interface Props {
  tree: Tree;
}

const VARIETY_OPTIONS: { value: TreeVariety; label: string }[] = [
  { value: 'ri6',          label: 'Ri6' },
  { value: 'monthong',     label: 'Monthong' },
  { value: 'musang_king',  label: 'Musang King' },
  { value: 'other',        label: 'Khác' },
];

const HEALTH_OPTIONS: { value: TreeHealthStatus; label: string; icon: string; color: string }[] = [
  { value: 'healthy',               label: 'Khoẻ mạnh',     icon: 'leaf',                      color: '#3D7A5E' },
  { value: 'flowering',             label: 'Đang ra hoa',   icon: 'flower-outline',            color: '#C97FB8' },
  { value: 'fruiting',              label: 'Đang có quả',   icon: 'food-apple-outline',        color: '#B07D2F' },
  { value: 'pest_damage',           label: 'Sâu hại',       icon: 'bug-outline',               color: '#C0533A' },
  { value: 'nutrient_deficiency',   label: 'Thiếu dinh dưỡng', icon: 'water-percent',          color: '#7A8C80' },
  { value: 'diseased',              label: 'Bệnh',          icon: 'medical-bag',               color: '#A6432B' },
  { value: 'dry',                   label: 'Khô',           icon: 'fire',                      color: '#B07D2F' },
  { value: 'dead',                  label: 'Chết',          icon: 'tree-outline',              color: '#4D5A52' },
  { value: 'unknown',               label: 'Chưa rõ',       icon: 'help-circle-outline',       color: '#7A8C80' },
];

const NOTES_MAX = 500;
const AGE_MAX = 100;

function nowIso(): string {
  return new Date().toISOString();
}

// Parse DD/MM/YYYY → ISO YYYY-MM-DD (or '' nếu invalid).
function partsToIso(d: string, m: string, y: string): string {
  const dd = parseInt(d, 10);
  const mm = parseInt(m, 10);
  const yy = parseInt(y, 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) return '';
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 1900 || yy > 2100) return '';
  const iso = `${yy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
  // Validate real date (e.g. 31/02 should fail)
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return iso;
}

function isoToParts(iso?: string): { d: string; m: string; y: string } {
  if (!iso) return { d: '', m: '', y: '' };
  const [y, m, d] = iso.split('-');
  return { d: d ?? '', m: m ?? '', y: y ?? '' };
}

const TreeMetadataTab: React.FC<Props> = ({ tree }) => {
  const dispatch = useAppDispatch();
  const savingTree = useSelector((state: RootState) =>
    state.farm.trees.find(t => t.id === tree.id)
  );
  // Prefer freshest metadata from Redux (after save) but fall back to prop.
  const current = savingTree?.metadata ?? tree.metadata;

  const initialParts = isoToParts(current?.last_harvest_date);

  const [variety,        setVariety]        = useState<TreeVariety | undefined>(current?.variety);
  const [varietyOther,   setVarietyOther]   = useState<string>(current?.variety_other ?? '');
  const [ageYears,       setAgeYears]       = useState<string>(
    current?.age_years != null ? String(current.age_years) : ''
  );
  const [healthStatus,   setHealthStatus]   = useState<TreeHealthStatus | undefined>(current?.health_status);
  const [dateDay,        setDateDay]        = useState<string>(initialParts.d);
  const [dateMonth,      setDateMonth]      = useState<string>(initialParts.m);
  const [dateYear,       setDateYear]       = useState<string>(initialParts.y);
  const [notes,          setNotes]          = useState<string>(current?.notes ?? '');
  const [voiceMemoPath,  setVoiceMemoPath]  = useState<string | undefined>(current?.voice_memo_path);
  const [voiceMemoDuration, setVoiceMemoDuration] = useState<number | undefined>(current?.voice_memo_duration_s);
  const [voiceMemoRecordedAt, setVoiceMemoRecordedAt] = useState<string | undefined>(current?.voice_memo_recorded_at);

  const [varietyModalOpen, setVarietyModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);

  // Mark dirty whenever any field changes.
  useEffect(() => {
    if (!current) {
      const anyFilled =
        variety || ageYears || healthStatus || dateDay || dateMonth || dateYear || notes || voiceMemoPath;
      setDirty(Boolean(anyFilled));
      return;
    }
    const dateIso = partsToIso(dateDay, dateMonth, dateYear);
    const changed =
      variety !== current.variety ||
      varietyOther !== (current.variety_other ?? '') ||
      ageYears !== (current.age_years != null ? String(current.age_years) : '') ||
      healthStatus !== current.health_status ||
      dateIso !== (current.last_harvest_date ?? '') ||
      notes !== (current.notes ?? '') ||
      voiceMemoPath !== current.voice_memo_path;
    setDirty(changed);
  }, [variety, varietyOther, ageYears, healthStatus, dateDay, dateMonth, dateYear, notes, voiceMemoPath, current]);

  const varietyLabel = useMemo(() => {
    if (!variety) return 'Chọn giống cây';
    return VARIETY_OPTIONS.find(o => o.value === variety)?.label ?? 'Chọn giống cây';
  }, [variety]);

  const ageError = useMemo(() => {
    if (!ageYears) return null;
    const n = Number(ageYears);
    if (!Number.isInteger(n) || n < 0 || n > AGE_MAX) return `0–${AGE_MAX}`;
    return null;
  }, [ageYears]);

  const dateError = useMemo(() => {
    if (!dateDay && !dateMonth && !dateYear) return null;
    if (!dateDay || !dateMonth || !dateYear) return 'Nhập đủ DD/MM/YYYY';
    if (!partsToIso(dateDay, dateMonth, dateYear)) return 'Ngày không hợp lệ';
    return null;
  }, [dateDay, dateMonth, dateYear]);

  const notesOver = notes.length > NOTES_MAX;
  const canSave = !ageError && !dateError && !notesOver && dirty && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const metadata: TreeMetadata = {
        ...(variety        ? { variety } : {}),
        ...(variety === 'other' && varietyOther.trim() ? { variety_other: varietyOther.trim() } : {}),
        ...(ageYears       ? { age_years: Number(ageYears) } : {}),
        ...(healthStatus   ? { health_status: healthStatus } : {}),
        ...(dateDay && dateMonth && dateYear
          ? { last_harvest_date: partsToIso(dateDay, dateMonth, dateYear) }
          : {}),
        ...(notes.trim()   ? { notes: notes.trim() } : {}),
        ...(voiceMemoPath  ? {
              voice_memo_path: voiceMemoPath,
              voice_memo_duration_s: voiceMemoDuration,
              voice_memo_recorded_at: voiceMemoRecordedAt,
            } : {}),
        updated_at: nowIso(),
        schema_version: 'tree_metadata/1.0',
      };

      await dispatch(saveTreeMetadata({ treeId: tree.id, metadata })).unwrap();
      setDirty(false);
      Alert.alert('Đã lưu', 'Thông tin cây đã được cập nhật.');
    } catch (e: any) {
      Alert.alert('Lưu thất bại', e?.message ?? 'Không thể lưu thông tin.');
    } finally {
      setSaving(false);
    }
  };

  const onVoiceRecorded = (path: string, durationS: number) => {
    setVoiceMemoPath(path);
    setVoiceMemoDuration(durationS);
    setVoiceMemoRecordedAt(nowIso());
  };

  const onVoiceDeleted = () => {
    setVoiceMemoPath(undefined);
    setVoiceMemoDuration(undefined);
    setVoiceMemoRecordedAt(undefined);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>THÔNG TIN SINH HỌC</Text>
          </View>

          {/* Variety dropdown */}
          <Text style={styles.fieldLabel}>Giống cây</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setVarietyModalOpen(true)}
            activeOpacity={0.85}
          >
            <Icon name="sprout-outline" size={18} color={COLORS.accent} />
            <Text style={[styles.dropdownText, !variety && styles.dropdownPlaceholder]}>
              {varietyLabel}
            </Text>
            <Icon name="chevron-down" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {variety === 'other' && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Tên giống khác..."
              placeholderTextColor={COLORS.textMuted}
              value={varietyOther}
              onChangeText={setVarietyOther}
              maxLength={64}
            />
          )}

          {/* Age */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Tuổi cây (năm)</Text>
          <TextInput
            style={[styles.input, ageError && styles.inputError]}
            placeholder="Vd: 12"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            value={ageYears}
            onChangeText={(v) => setAgeYears(v.replace(/[^0-9]/g, ''))}
            maxLength={3}
          />
          {ageError && <Text style={styles.errorText}>Tuổi phải từ {ageError}</Text>}

          {/* Health status */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Tình trạng</Text>
          <View style={styles.chipGrid}>
            {HEALTH_OPTIONS.map((opt) => {
              const active = opt.value === healthStatus;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    active && { backgroundColor: opt.color + '22', borderColor: opt.color },
                  ]}
                  onPress={() => setHealthStatus(active ? undefined : opt.value)}
                  activeOpacity={0.85}
                >
                  <Icon name={opt.icon} size={14} color={active ? opt.color : COLORS.textMuted} />
                  <Text style={[
                    styles.chipText,
                    active && { color: opt.color, fontWeight: '700' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Last harvest date */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Lần thu hoạch gần nhất</Text>
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.dateInput, dateError && styles.inputError]}
              placeholder="DD"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={dateDay}
              onChangeText={(v) => setDateDay(v.replace(/[^0-9]/g, '').slice(0, 2))}
              maxLength={2}
            />
            <Text style={styles.dateSep}>/</Text>
            <TextInput
              style={[styles.dateInput, dateError && styles.inputError]}
              placeholder="MM"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={dateMonth}
              onChangeText={(v) => setDateMonth(v.replace(/[^0-9]/g, '').slice(0, 2))}
              maxLength={2}
            />
            <Text style={styles.dateSep}>/</Text>
            <TextInput
              style={[styles.dateInput, { flex: 1.3 }, dateError && styles.inputError]}
              placeholder="YYYY"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={dateYear}
              onChangeText={(v) => setDateYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
              maxLength={4}
            />
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => {
                const now = new Date();
                setDateDay(String(now.getDate()).padStart(2, '0'));
                setDateMonth(String(now.getMonth() + 1).padStart(2, '0'));
                setDateYear(String(now.getFullYear()));
              }}
            >
              <Text style={styles.todayBtnText}>Hôm nay</Text>
            </TouchableOpacity>
          </View>
          {dateError && <Text style={styles.errorText}>{dateError}</Text>}
        </View>

        {/* Notes section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>GHI CHÚ</Text>
          </View>

          <TextInput
            style={[styles.textarea, notesOver && styles.inputError]}
            placeholder="Vd: Cây ven bờ ao, lá xanh tốt, sai quả..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            value={notes}
            onChangeText={setNotes}
            maxLength={NOTES_MAX + 50}  // soft cap for warning
            textAlignVertical="top"
          />
          <View style={styles.counterRow}>
            <Text style={[styles.counterText, notesOver && { color: COLORS.error }]}>
              {notes.length}/{NOTES_MAX}
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Ghi âm</Text>
          <VoiceMemoButton
            treeId={tree.id}
            existingPath={voiceMemoPath}
            existingDurationS={voiceMemoDuration}
            maxSeconds={30}
            onRecorded={onVoiceRecorded}
            onDeleted={onVoiceDeleted}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Save button — sticky bottom */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.88}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Icon name="content-save-outline" size={19} color={COLORS.white} />
              <Text style={styles.saveBtnText}>
                {dirty ? 'Lưu thông tin' : 'Đã lưu'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Variety modal */}
      <Modal
        visible={varietyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVarietyModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVarietyModalOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chọn giống cây</Text>
            {VARIETY_OPTIONS.map((opt) => {
              const active = opt.value === variety;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modalOption, active && styles.modalOptionSelected]}
                  onPress={() => {
                    setVariety(opt.value);
                    if (opt.value !== 'other') setVarietyOther('');
                    setVarietyModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, active && styles.modalOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {active && <Icon name="check" size={20} color={COLORS.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },

  section: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSub, marginBottom: 6 },

  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.error },
  errorText: { fontSize: 11, color: COLORS.error, marginTop: 4 },

  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  dropdownPlaceholder: { color: COLORS.textMuted, fontWeight: '400' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, color: COLORS.textSub, fontWeight: '500' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateInput: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: COLORS.text,
    textAlign: 'center',
  },
  dateSep: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  todayBtn: {
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginLeft: 4,
  },
  todayBtnText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },

  textarea: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 100,
  },
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, marginBottom: 4 },
  counterText: { fontSize: 11, color: COLORS.textMuted },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  saveBtnDisabled: { backgroundColor: COLORS.textMuted, shadowOpacity: 0 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalOptionSelected: { backgroundColor: COLORS.accentGlow },
  modalOptionText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  modalOptionTextSelected: { color: COLORS.accent, fontWeight: '600' },
});

export default TreeMetadataTab;
