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
// Icon: bo Font Awesome Solid tai qua Iconify (assets/icons -> icons.generated).
// Them icon moi: `node scripts/icons.js <ten-fa6-solid>`.
import Icon from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { COLORS } from '../../../constants';
// Nen huu co dung chung cua module (tong dat/la) - xem theme/depth.ts
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_CARD, ELEVATION as ORG_ELEV, TYPE as ORG_TYPE, RADIUS as ORG_RADIUS,
} from '../theme/depth';
import { useTk } from '../../../i18n/keys';
import {
  Tree,
  TreeMetadata,
  TreeVariety,
  TreeHealthStatus,
} from '../types';
import { saveTreeMetadata } from '../store/farmSlice';
import VoiceMemoButton from '../components/VoiceMemoButton';
// Bật công khai + mã/QR truy xuất. Xem đầu tệp component về vì sao hai việc đó
// nằm chung một thẻ: mã chỉ có nghĩa khi cây đã công khai.
import TreePublicCard from '../components/TreePublicCard';
import { showSuccess, showWarning } from '../../../utils/alert';

interface Props {
  tree: Tree;
}

/** Ten giong la ten RIENG — khong dich; chi muc "Khac" moi la chu thuong. */
const VARIETY_OPTIONS: { value: TreeVariety; label?: string; labelKey?: string }[] = [
  { value: 'ri6', label: 'Ri6' },
  { value: 'monthong', label: 'Monthong' },
  { value: 'musang_king', label: 'Musang King' },
  { value: 'other', labelKey: 'trace.meta.other' },
];

const HEALTH_OPTIONS: { value: TreeHealthStatus; labelKey: string; icon: string; color: string }[] = [
  { value: 'healthy', labelKey: 'trace.health.healthy', icon: 'leaf', color: ORG_TONE.primary },
  { value: 'flowering', labelKey: 'trace.health.flowering', icon: 'spa', color: '#C97FB8' },
  { value: 'fruiting', labelKey: 'trace.health.fruiting', icon: 'apple-whole', color: ORG_TONE.sun },
  { value: 'pest_damage', labelKey: 'trace.health.pest', icon: 'bug', color: ORG_TONE.danger },
  { value: 'nutrient_deficiency', labelKey: 'trace.health.nutrient', icon: 'droplet', color: ORG_NATURE.barkSoft },
  { value: 'diseased', labelKey: 'trace.health.diseased', icon: 'briefcase-medical', color: '#A6432B' },
  { value: 'dry', labelKey: 'trace.health.dry', icon: 'fire', color: ORG_NATURE.clay },
  { value: 'dead', labelKey: 'trace.health.dead', icon: 'tree', color: '#4D5A52' },
  { value: 'unknown', labelKey: 'trace.health.unknown', icon: 'circle-question', color: ORG_NATURE.barkSoft },
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
  const tk = useTk();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
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

  /** Ten giong (Ri6, Monthong...) la ten rieng nen giu nguyen; rieng "Khac" thi dich. */
  const varietyLabel = useMemo(() => {
    const opt = variety ? VARIETY_OPTIONS.find(o => o.value === variety) : undefined;
    if (!opt) return tk('trace.meta.varietyPick');
    return opt.labelKey ? tk(opt.labelKey) : opt.label!;
  }, [variety, tk]);

  const ageError = useMemo(() => {
    if (!ageYears) return null;
    const n = Number(ageYears);
    if (!Number.isInteger(n) || n < 0 || n > AGE_MAX) return `0–${AGE_MAX}`;
    return null;
  }, [ageYears]);

  const dateError = useMemo(() => {
    if (!dateDay && !dateMonth && !dateYear) return null;
    if (!dateDay || !dateMonth || !dateYear) return tk('trace.meta.dateIncomplete');
    if (!partsToIso(dateDay, dateMonth, dateYear)) return tk('trace.meta.dateInvalid');
    return null;
  }, [dateDay, dateMonth, dateYear, tk]);

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

      const saved = await dispatch(saveTreeMetadata({ treeId: tree.id, metadata })).unwrap();
      setDirty(false);
      // Máy chủ CÓ câu thì hiện câu của máy chủ. `voice_memo.reason` là câu tiếng
      // Việt viết cho người dùng, nói rõ phần ghi âm chưa có đường lên máy chủ —
      // thay nó bằng câu của app là bỏ đi phần duy nhất nói được cái gì đã vào và
      // cái gì chưa.
      const voiceMemoReason =
        saved.voiceMemo && saved.voiceMemo.accepted === false
          ? (saved.voiceMemo.reason ?? tk('trace.meta.savedVoiceLocal'))
          : null;
      showSuccess(
        tk('trace.meta.saved'),
        voiceMemoReason
          ? `${tk('trace.meta.savedBody')}\n\n${voiceMemoReason}`
          : tk('trace.meta.savedBody'),
      );
    } catch (e: any) {
      showWarning(tk('trace.meta.saveFail'), e?.message ?? tk('trace.meta.saveFailBody'));
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
        {/* Công khai & mã truy xuất — đặt TRÊN CÙNG có chủ ý: đây là điều kiện để
            quả của cây lọt vào tầm tra cứu của người mua, mà trước bản này app
            không có chỗ nào bấm được. Chôn nó xuống cuối trang là giữ nguyên
            tình trạng "0/139 cây công khai" đo được trên kho sản xuất. */}
        {!!tree?.id && (
          <View style={styles.section}>
            <TreePublicCard treeId={tree.id} />
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>{tk('trace.meta.bio')}</Text>
          </View>

          {/* Variety dropdown */}
          <Text style={styles.fieldLabel}>{tk('trace.meta.variety')}</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setVarietyModalOpen(true)}
            activeOpacity={0.85}
          >
            <Icon name="seedling" size={18} color={COLORS.accent} />
            <Text style={[styles.dropdownText, !variety && styles.dropdownPlaceholder]}>
              {varietyLabel}
            </Text>
            <Icon name="chevron-down" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {variety === 'other' && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder={tk('trace.meta.varietyOther')}
              placeholderTextColor={COLORS.textMuted}
              value={varietyOther}
              onChangeText={setVarietyOther}
              maxLength={64}
            />
          )}

          {/* Age */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{tk('trace.meta.age')}</Text>
          <TextInput
            style={[styles.input, ageError && styles.inputError]}
            placeholder={tk('trace.meta.ageHint')}
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            value={ageYears}
            onChangeText={(v) => setAgeYears(v.replace(/[^0-9]/g, ''))}
            maxLength={3}
          />
          {ageError && <Text style={styles.errorText}>{tk('trace.meta.ageError', { range: ageError })}</Text>}

          {/* Health status */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{tk('trace.meta.health')}</Text>
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
                    {tk(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Last harvest date */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{tk('trace.meta.lastHarvest')}</Text>
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
            <Text style={styles.sectionTitle}>{tk('trace.meta.notes')}</Text>
          </View>

          <TextInput
            style={[styles.textarea, notesOver && styles.inputError]}
            placeholder={tk('trace.meta.notesHint')}
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

          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>{tk('trace.meta.voice')}</Text>
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

      {/* Save button — sticky bottom (nhấc lên khỏi mép bằng safe-area insets) */}
      <View style={[styles.bottomBar, { paddingBottom: 10 + insets.bottom }]}>
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
              <Icon name="floppy-disk" size={19} color={COLORS.white} />
              <Text style={styles.saveBtnText}>
                {tk(dirty ? 'trace.meta.save' : 'trace.meta.saved')}
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
            <Text style={styles.modalTitle}>{tk('trace.meta.varietyPick')}</Text>
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
                    {opt.labelKey ? tk(opt.labelKey) : opt.label}
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
  root: { flex: 1, backgroundColor: ORG_SURFACE.ground },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },

  section: {
    backgroundColor: ORG_SURFACE.raised,
    ...ORGANIC_CARD,
    padding: 18,
    marginBottom: 14,
    ...ORG_ELEV.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORG_TONE.primary },
  sectionTitle: { ...ORG_TYPE.section },

  fieldLabel: { fontSize: 15, fontWeight: '600', color: ORG_NATURE.bark, marginBottom: 7 },

  input: {
    backgroundColor: ORG_SURFACE.sunken,
    borderRadius: ORG_RADIUS.field,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: ORG_NATURE.bark,
  },
  inputError: { borderColor: COLORS.error },
  errorText: { fontSize: 11, color: COLORS.error, marginTop: 4 },

  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
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
    borderColor: ORG_TONE.border,
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
    borderColor: ORG_TONE.border,
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
    borderColor: ORG_TONE.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginLeft: 4,
  },
  todayBtnText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },

  textarea: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: ORG_TONE.border,
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
    // paddingBottom động = 10 + insets.bottom (áp inline). Nút gọn hơn, không sát mép.
    paddingTop: 10,
    backgroundColor: ORG_SURFACE.ground,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: ORG_TONE.primary,
    ...ORGANIC_CARD,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...ORG_ELEV.cardStrong,
  },
  saveBtnDisabled: { backgroundColor: ORG_NATURE.barkSoft, shadowOpacity: 0, elevation: 0 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: ORG_NATURE.paper },

  modalOverlay: {
    flex: 1,
    backgroundColor: ORG_SURFACE.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: ORG_TONE.border,
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
