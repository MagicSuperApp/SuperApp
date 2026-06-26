/**
 * SurfaceTestCaptureScreen — Thu dữ-liệu định-danh cá-thể qua BỀ MẶT (cây + quả).
 *
 * Dùng cho vòng test: anh + dev chụp xoài/mai/sứ/mít/ổi quanh nhà để đo recall/false-accept.
 * Tận dụng native ScannerSDK (đã hỗ trợ scanMode 'tree'|'fruit', mode 'circular'). Màn này
 * GẮN NHÃN mỗi phiên chụp bằng virtualId = `surftest|<loài>|<id>|<lượt>|<bề-mặt>` để backend
 * (Lợi) định-tuyến ảnh vào DATA_ROOT/<loài>/<id>/<lượt>/ rồi chạy harness đo.
 *
 * Ranh-giới: ảnh được native scanner chụp + đẩy lên qua hàng-đợi offline sẵn có. Việc backend
 * tách theo prefix `surftest|...` là của Lợi (xem docs/surface-id/SPEC-DATA-COLLECTION-APP.md).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { ScannerSDK, EVENTS } from '../scansdk';
import type { ScanCompleteData, ScanErrorData, UploadProgressData, ScannerOptions } from '../scansdk';

// Loài test + bề-mặt định-danh (quả → scanMode 'fruit'; thân/vỏ → 'tree')
const SPECIES: { key: string; label: string; surfaces: ('qua' | 'than')[] }[] = [
  { key: 'xoai', label: 'Xoài', surfaces: ['qua', 'than'] },
  { key: 'mai', label: 'Mai', surfaces: ['than'] },
  { key: 'su', label: 'Sứ', surfaces: ['than'] },
  { key: 'mit', label: 'Mít', surfaces: ['qua', 'than'] },
  { key: 'oi', label: 'Ổi', surfaces: ['qua', 'than'] },
  { key: 'khac', label: 'Khác', surfaces: ['than', 'qua'] },
];
const ROUNDS = [
  { key: 'day0', label: 'Lượt A (ngày 0)' },
  { key: 'day7', label: 'Lượt B (ngày sau)' },
];
const SURFACE_LABEL: Record<string, string> = { qua: 'Vỏ quả', than: 'Vỏ thân/cành' };

const PROGRESS_KEY = 'surftest:progress'; // map "loài/id/lượt" -> ISO time
const COUNTER_PREFIX = 'surftest:counter:'; // per-loài số cá-thể kế tiếp

type Status = 'idle' | 'launching' | 'scanning' | 'uploading' | 'complete' | 'error';

const Chip: React.FC<{ active: boolean; label: string; disabled?: boolean; onPress: () => void }> = ({
  active,
  label,
  disabled,
  onPress,
}) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} disabled={disabled}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const SurfaceTestCaptureScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [species, setSpecies] = useState<string>('xoai');
  const [surface, setSurface] = useState<'qua' | 'than'>('than');
  const [round, setRound] = useState<string>('day0');
  const [indivId, setIndivId] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upload, setUpload] = useState({ progress: 0, total: 0 });
  const [doneCount, setDoneCount] = useState<Record<string, number>>({});

  const speciesDef = SPECIES.find((s) => s.key === species) || SPECIES[0];

  // ── nạp tiến-độ + gợi-ý id kế-tiếp ──────────────────────────────────────────
  const loadProgress = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_KEY);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      const per: Record<string, number> = {};
      Object.keys(map).forEach((k) => {
        const sp = k.split('/')[0];
        per[sp] = (per[sp] || 0) + 1;
      });
      setDoneCount(per);
    } catch (e) {
      console.warn('[SurfaceTest] loadProgress', e);
    }
  }, []);

  const suggestNextId = useCallback(async (sp: string) => {
    try {
      const raw = await AsyncStorage.getItem(COUNTER_PREFIX + sp);
      const n = raw ? parseInt(raw, 10) : 0;
      const prefix = sp.slice(0, 2).toUpperCase();
      setIndivId(`${prefix}-${String(n + 1).padStart(3, '0')}`);
    } catch {
      setIndivId('');
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    // đổi loài → reset bề-mặt hợp-lệ + gợi-ý id
    if (!speciesDef.surfaces.includes(surface)) setSurface(speciesDef.surfaces[0]);
    suggestNextId(species);
  }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── quyền camera ────────────────────────────────────────────────────────────
  const ensurePermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      return false;
    }
  };

  // ── ghi tiến-độ sau khi chụp xong 1 cá-thể ──────────────────────────────────
  const markDone = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_KEY);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      map[`${species}/${indivId}/${round}`] = new Date().toISOString();
      await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
      const cRaw = await AsyncStorage.getItem(COUNTER_PREFIX + species);
      const cur = cRaw ? parseInt(cRaw, 10) : 0;
      const idNum = parseInt(indivId.split('-')[1] || '0', 10);
      if (idNum > cur) await AsyncStorage.setItem(COUNTER_PREFIX + species, String(idNum));
      await loadProgress();
    } catch (e) {
      console.warn('[SurfaceTest] markDone', e);
    }
  }, [species, indivId, round, loadProgress]);

  // ── bắt đầu chụp 1 cá-thể ────────────────────────────────────────────────────
  // Giữ 3 listener của lần chụp đang chạy để gỡ TRỌN VẸN — trước đây `upSub`
  // (UPLOAD_PROGRESS) không được gỡ ở path thành công + không có cleanup unmount
  // → mỗi lần "Bắt đầu chụp" cộng dồn listener, setState sau unmount (nóng/treo
  // máy yếu của nông dân).
  const captureSubsRef = useRef<Array<{ remove: () => void }>>([]);
  const clearCaptureSubs = useCallback(() => {
    captureSubsRef.current.forEach(s => s.remove());
    captureSubsRef.current = [];
  }, []);
  // Gỡ listener khi rời màn.
  useEffect(() => () => clearCaptureSubs(), [clearCaptureSubs]);

  const startCapture = useCallback(async () => {
    if (!indivId.trim()) {
      Alert.alert('Thiếu mã', 'Nhập mã cá-thể (vd XO-001) trước khi chụp.');
      return;
    }
    if (!(await ensurePermission())) {
      setStatus('error');
      setErrorMsg('Cần quyền Camera + Vị-trí để chụp.');
      return;
    }

    clearCaptureSubs();   // gỡ listener lần chụp trước (nếu còn) trước khi tạo mới

    const completeSub = ScannerSDK.addListener(EVENTS.SCAN_COMPLETE, (_d: ScanCompleteData) => {
      setStatus('complete');
      markDone();
      clearCaptureSubs();   // gỡ CẢ 3 listener (gồm upSub) ở path thành công
    });
    const errSub = ScannerSDK.addListener(EVENTS.SCAN_ERROR, (d: ScanErrorData) => {
      setStatus('error');
      setErrorMsg(d.error || 'Lỗi scanner.');
      clearCaptureSubs();
    });
    const upSub = ScannerSDK.addListener(EVENTS.UPLOAD_PROGRESS, (d: UploadProgressData) => {
      setUpload({ progress: d.progress, total: d.total });
      setStatus('uploading');
    });
    captureSubsRef.current = [completeSub, errSub, upSub];

    setStatus('scanning');
    setErrorMsg(null);
    // Android scanner hiện chạy tree-mode (chụp vòng đa-góc) — giống hệt luồng enroll cây
    // đang chạy live. Bề-mặt (vỏ quả/thân) lưu trong NHÃN virtualId để backend (Lợi) phân loại.
    // KHÔNG đặt scanMode='fruit' vì native Android chưa đọc cờ này (sẽ vô tác dụng + gây hiểu lầm).
    const opts: ScannerOptions = {
      mode: 'circular',
      virtualId: `surftest|${species}|${indivId.trim()}|${round}|${surface}`,
    };
    try {
      await ScannerSDK.startScanner(opts);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(`Không mở được scanner: ${err?.message || err}`);
      clearCaptureSubs();
    }
  }, [indivId, species, surface, round, markDone, clearCaptureSubs]);

  const nextIndividual = () => {
    setStatus('idle');
    setUpload({ progress: 0, total: 0 });
    suggestNextId(species);
  };

  // ── render ───────────────────────────────────────────────────────────────────
  const busy = status === 'scanning' || status === 'uploading' || status === 'launching';
  const chipsLocked = status === 'scanning' || status === 'uploading';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={24} color={COLORS.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Thu dữ-liệu bề-mặt (test)</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.hint}>
        Chọn loài + mã cá-thể + lượt, rồi chụp đa-góc (≥6 góc + cuống/chạc + đối-diện). Ảnh tự gắn
        nhãn để máy đo sau. Mỗi cá-thể chụp lại ở lượt sau để đo theo thời-gian.
      </Text>

      <Text style={styles.label}>Loài</Text>
      <View style={styles.row}>
        {SPECIES.map((s) => (
          <Chip
            key={s.key}
            active={species === s.key}
            label={s.label}
            disabled={chipsLocked}
            onPress={() => setSpecies(s.key)}
          />
        ))}
      </View>

      <Text style={styles.label}>Bề-mặt định-danh</Text>
      <View style={styles.row}>
        {speciesDef.surfaces.map((sf) => (
          <Chip
            key={sf}
            active={surface === sf}
            label={SURFACE_LABEL[sf]}
            disabled={chipsLocked}
            onPress={() => setSurface(sf)}
          />
        ))}
      </View>

      <Text style={styles.label}>Mã cá-thể</Text>
      <TextInput
        style={styles.input}
        value={indivId}
        onChangeText={setIndivId}
        placeholder="vd XO-001"
        placeholderTextColor="#9AA0A6"
        autoCapitalize="characters"
        editable={!busy}
      />

      <Text style={styles.label}>Lượt chụp</Text>
      <View style={styles.row}>
        {ROUNDS.map((r) => (
          <Chip
            key={r.key}
            active={round === r.key}
            label={r.label}
            disabled={chipsLocked}
            onPress={() => setRound(r.key)}
          />
        ))}
      </View>

      {/* trạng-thái */}
      {status === 'scanning' && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.statusText}>Scanner đang chạy — di chuyển quanh cây/quả chụp đủ góc.</Text>
        </View>
      )}
      {status === 'uploading' && (
        <View style={styles.statusBox}>
          <Icon name="cloud-upload" size={22} color="#FF9800" />
          <Text style={styles.statusText}>
            Đang gửi ảnh… {upload.progress}/{upload.total}
          </Text>
        </View>
      )}
      {status === 'complete' && (
        <View style={[styles.statusBox, styles.okBox]}>
          <Icon name="check-circle" size={22} color="#2E7D32" />
          <Text style={[styles.statusText, { color: '#2E7D32' }]}>
            Xong cá-thể {indivId} ({SURFACE_LABEL[surface]}, {round}).
          </Text>
        </View>
      )}
      {status === 'error' && (
        <View style={[styles.statusBox, styles.errBox]}>
          <Icon name="alert-circle" size={22} color="#C62828" />
          <Text style={[styles.statusText, { color: '#C62828' }]}>{errorMsg}</Text>
        </View>
      )}

      {/* nút hành-động */}
      {status === 'complete' ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={nextIndividual}>
          <Icon name="plus-circle" size={20} color={COLORS.white} />
          <Text style={styles.primaryText}>Cá-thể tiếp theo</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={startCapture} disabled={busy}>
          <Icon name="camera" size={20} color={COLORS.white} />
          <Text style={styles.primaryText}>Bắt đầu chụp</Text>
        </TouchableOpacity>
      )}

      {/* tiến-độ đã thu */}
      <Text style={[styles.label, { marginTop: 24 }]}>Đã thu (máy này)</Text>
      <View style={styles.progressBox}>
        {SPECIES.filter((s) => doneCount[s.key]).length === 0 ? (
          <Text style={styles.mutedText}>Chưa có cá-thể nào. Mục tiêu: ≥5 loài × ≥5 cá-thể × 2 lượt.</Text>
        ) : (
          SPECIES.filter((s) => doneCount[s.key]).map((s) => (
            <View key={s.key} style={styles.progressRow}>
              <Text style={styles.progressLabel}>{s.label}</Text>
              <Text style={styles.progressVal}>{doneCount[s.key]} lượt</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  hint: { fontSize: 13, color: '#5F6368', lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#202124', marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#F8F9FA',
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, color: '#3C4043', fontWeight: '500' },
  chipTextActive: { color: COLORS.white },
  input: {
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#202124',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F3F4',
    borderRadius: 10,
    padding: 12,
    marginTop: 18,
  },
  okBox: { backgroundColor: 'rgba(46,125,50,0.10)' },
  errBox: { backgroundColor: 'rgba(198,40,40,0.10)' },
  statusText: { flex: 1, fontSize: 13, color: '#3C4043', lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  progressBox: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  progressLabel: { fontSize: 14, color: '#3C4043' },
  progressVal: { fontSize: 14, color: COLORS.accent, fontWeight: '600' },
  mutedText: { fontSize: 13, color: '#80868B', lineHeight: 19 },
});

export default SurfaceTestCaptureScreen;
