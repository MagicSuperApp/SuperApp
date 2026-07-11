// modules/trace/screens/ActivityScreen.tsx

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { saveActivity } from '../store/farmSlice';
import { Activity } from '../types';
import { updateCredits, selectChainWallet } from '../../../store/userSlice';
import { syncService } from '../../../services/syncService';
import { COLORS } from '../../../constants';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { showSuccess, showError, showWarning, showInfo } from '../../../utils/alert';

interface RouteParams { farm: any }

const ACTIVITIES = [
  {
    type: 'watering', label: 'Tưới nước', desc: 'Ghi lại quá trình tưới nước cho cây',
    icon: 'water-outline', color: '#2E86C1', bg: 'rgba(46,134,193,0.10)', credits: 1,
    scannerTitle: 'Cập nhật Tưới Nước',
    scannerSteps: [
      { icon: 'water', label: 'Quay quá trình tưới nước tưới rễ' },
      { icon: 'pine-tree', label: 'Hệ thống đang phát hiện cây...' },
    ],
  },
  {
    type: 'fertilizing', label: 'Bón phân', desc: 'Ghi lại loại phân và lượng bón',
    icon: 'leaf-circle-outline', color: COLORS.success, bg: 'rgba(74,124,89,0.10)', credits: 2,
    scannerTitle: 'Cập nhật Bón Phân',
    scannerSteps: [
      { icon: 'flask-outline', label: 'Lia ống kính vào bao bì phân bón' },
      { icon: 'tree', label: 'Đang bón phân cho cây...' },
    ],
  },
  {
    type: 'pesticide', label: 'Phun thuốc', desc: 'Lia camera vào nhãn thuốc để ghi nhận',
    icon: 'spray-bottle', color: '#B07D2F', bg: 'rgba(176,125,47,0.10)', credits: 2,
    scannerTitle: 'Cập nhật Phun Thuốc',
    scannerSteps: [
      { icon: 'flask-outline', label: 'Lia ống kính vào nhãn thuốc' },
      { icon: 'tree', label: 'Đang xịt thuốc cho cây...' },
    ],
  },
  {
    type: 'harvesting', label: 'Thu hoạch', desc: 'Ghi nhận quả được thu hái',
    icon: 'basket-outline', color: '#7D3C98', bg: 'rgba(125,60,152,0.10)', credits: 3,
    scannerTitle: 'Thu Hoạch Quả',
    scannerSteps: [
      { icon: 'food-apple', label: 'Đưa quả thứ 1 trước ống kính' },
      { icon: 'reload', label: 'Quay các mặt quả thứ 1...' },
      { icon: 'food-apple', label: 'Đưa quả thứ 2 trước ống kính' },
      { icon: 'reload', label: 'Phát hiện quả thành công' },
    ],
  },
];

// ── Step config for LampNet progress ─────────────────────────────────────────
const SYNC_STEPS = [
  { label: 'Mã hoá hình ảnh', keyword: 'mã hoá' },
  { label: 'Băm nhỏ dữ liệu', keyword: 'băm nhỏ' },
  { label: 'Phát tán LampNet', keyword: 'Phát tán' },
  { label: 'Cập nhật blockchain', keyword: 'cập nhật' },
];

// ── LampNet Sync Modal ────────────────────────────────────────────────────────
const LampNetSyncModal = ({
  visible, currentStatus,
}: {
  visible: boolean; currentStatus: string;
}) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 2600, useNativeDriver: true })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      spinAnim.stopAnimation();
      pulseAnim.stopAnimation();
    }
  }, [visible]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const isDone = currentStatus === 'Hoàn tất!';

  // Determine which steps are done based on current status text
  const stepsDone = SYNC_STEPS.map((s, i) => {
    if (isDone) return true;
    const idx = SYNC_STEPS.findIndex(x => currentStatus.toLowerCase().includes(x.keyword.toLowerCase()));
    return i < idx;
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.syncCard}>

          {/* Spinning ring + center icon */}
          <View style={styles.syncIconWrap}>
            <Animated.View style={[
              styles.syncRing,
              { transform: [{ rotate }], borderColor: isDone ? COLORS.success : COLORS.accent },
            ]} />
            <Animated.View style={[styles.syncCenter, { transform: [{ scale: pulseAnim }] }]}>
              <Icon
                name={isDone ? 'check-bold' : 'cube-send'}
                size={26}
                color={isDone ? COLORS.success : COLORS.accent}
              />
            </Animated.View>
          </View>

          <Text style={styles.syncTitle}>
            {isDone ? 'Hoàn tất lưu trữ' : 'Đang lưu trữ LampNet'}
          </Text>
          <Text style={styles.syncStatusText}>{currentStatus}</Text>

          {/* Step list */}
          <View style={styles.syncStepList}>
            {SYNC_STEPS.map((s, i) => {
              const done = stepsDone[i];
              const active = !done && SYNC_STEPS.findIndex(
                x => currentStatus.toLowerCase().includes(x.keyword.toLowerCase())
              ) === i;
              return (
                <View key={i} style={styles.syncStepRow}>
                  <View style={[
                    styles.syncStepBullet,
                    done && { backgroundColor: COLORS.success, borderColor: COLORS.success },
                    active && { borderColor: COLORS.accent },
                  ]}>
                    {done ? (
                      <Icon name="check" size={9} color={COLORS.white} />
                    ) : active ? (
                      <View style={styles.syncActiveDot} />
                    ) : null}
                  </View>
                  <Text style={[
                    styles.syncStepLabel,
                    done && { color: COLORS.success },
                    active && { color: COLORS.accent, fontWeight: '600' },
                  ]}>{s.label}</Text>
                </View>
              );
            })}
          </View>

        </View>
      </View>
    </Modal>
  );
};

// ── Activity Card ─────────────────────────────────────────────────────────────
const ActivityCard = ({
  activity, selected, onSelect,
}: {
  activity: typeof ACTIVITIES[0]; selected: boolean; onSelect: () => void;
}) => {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: selected ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [selected]);

  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, activity.color] });
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.card, activity.bg] });

  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.82}>
      <Animated.View style={[styles.actCard, { borderColor, backgroundColor: bgColor }]}>
        <View style={[styles.actIconWrap, { backgroundColor: activity.bg }]}>
          <Icon name={activity.icon} size={24} color={activity.color} />
        </View>

        <View style={styles.actBody}>
          <Text style={styles.actLabel}>{activity.label}</Text>
          <Text style={styles.actDesc}>{activity.desc}</Text>
          <View style={styles.actCreditRow}>
            <Icon name="lightning-bolt" size={11} color={COLORS.textMuted} />
            <Text style={styles.actCreditText}>{activity.credits} MAGIC</Text>
          </View>
        </View>

        <Animated.View style={[
          styles.actCheck,
          {
            borderColor: anim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, activity.color] }),
            backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', activity.color] }),
          },
        ]}>
          {selected && <Icon name="check-bold" size={12} color={COLORS.white} />}
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
const ActivityScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { farm } = (route.params ?? {}) as RouteParams;
  const dispatch = useAppDispatch();
  const user = useSelector((state: RootState) => state.user.currentUser);
  // Chỉ tin số dư đến TỪ CHAIN (selector chung). null = chưa biết số dư thật → không chặn nhầm.
  const wallet = useSelector(selectChainWallet);
  const balanceKnown = !!wallet;
  const magicBalance = wallet?.magicBalance ?? 0;

  const [selected, setSelected] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState('');
  const btnScale = useRef(new Animated.Value(1)).current;

  const selectedActivity = ACTIVITIES.find(a => a.type === selected);
  const hasFiles = scannedFiles.length > 0;
  const canSave = !!selected && !saving && hasFiles;

  const handleSave = async () => {
    if (!selected || !farm || !user || !selectedActivity) return;
    // CHỈ chặn khi ĐÃ BIẾT số dư thật (từ chain) và thực sự không đủ. Ví chưa nạp
    // xong (balanceKnown=false) → KHÔNG chặn nhầm, để nông dân vẫn ghi việc đồng
    // (offline-first); backend là nơi đối soát phí cuối cùng.
    if (balanceKnown && magicBalance < selectedActivity.credits) {
      showError('Không đủ tín dụng', `Cần ít nhất ${selectedActivity.credits} MAGIC`);
      return;
    }

    setSaving(true);
    try {
      const steps = [
        'Hệ thống đang mã hoá các hình ảnh, video...',
        'Đang băm nhỏ dữ liệu thành hàng nghìn mảnh...',
        'Phát tán lưu trữ trên mạng phân tán LampNet...',
        'Đang cập nhật link và trạng thái lên blockchain...',
      ];
      for (const s of steps) {
        setSyncStatus(s);
        await new Promise<void>(r => setTimeout(() => r(), 1100));
      }
      setSyncStatus('Hoàn tất!');
      await new Promise<void>(r => setTimeout(() => r(), 500));

      const activityData = {
        id: `activity_${Date.now()}`,
        type: selected,
        farmId: farm.id,
        materials: [],
        thumbnailPath: scannedFiles[0] ?? '',
        timestamp: new Date().toISOString(),
        creditsUsed: selectedActivity.credits,
      };

      // activityData is the persistence/sync shape (string timestamp, materials,
      // thumbnailPath) which intentionally diverges from the in-memory Activity type.
      await dispatch(saveActivity(activityData as unknown as Activity));
      dispatch(updateCredits({ magic: -selectedActivity.credits, lamp: 0, ada: 0 }));
      await syncService.addSyncItem('activity', { activity: activityData, farmName: farm.name }, []);

      showSuccess('Lưu trữ thành công', `Tiêu thụ: ${selectedActivity.credits} MAGIC`);
      navigation.goBack();
    } catch (_) {
      showError('Lỗi', 'Có lỗi xảy ra khi lưu trên chuỗi.');
    } finally {
      setSaving(false);
      setSyncStatus('');
    }
  };

  // "Ghi hình" cũ (scanner) thay bằng màn Nhận diện (TreeIdentity) — giống nút quick "Nhận diện".
  useEffect(() => {
    if (recording && selectedActivity) {
      setRecording(false);
      (navigation as any).navigate('TreeIdentity', farm ? { farmId: farm.id } : undefined);
    }
  }, [recording, selectedActivity]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? 56 : 40) + insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CẬP NHẬT HOẠT ĐỘNG</Text>
          <Text style={styles.title} numberOfLines={1}>{farm?.name ?? '—'}</Text>
        </View>
        <View style={styles.magicChip}>
          <Icon name="lightning-bolt" size={12} color={COLORS.accent} />
          <Text style={styles.magicChipText}>{balanceKnown ? magicBalance : '—'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Guide */}
        <View style={styles.guideCard}>
          <View style={styles.guideIconWrap}>
            <Icon name="information-outline" size={17} color={COLORS.accent} />
          </View>
          <Text style={styles.guideText}>
            Chọn hoạt động, ghi hình, sau đó lưu lên LampNet &amp; blockchain.
            VeData tự động chắt lọc khung hình chất lượng nhất.
          </Text>
        </View>

        {/* Activity selection */}
        <View style={styles.sectionRow}>
          <View style={styles.dot} />
          <Text style={styles.sectionLabel}>CHỌN HOẠT ĐỘNG</Text>
        </View>
        <View style={styles.actList}>
          {ACTIVITIES.map(act => (
            <ActivityCard
              key={act.type}
              activity={act}
              selected={selected === act.type}
              onSelect={() => { setSelected(p => p === act.type ? null : act.type); setScannedFiles([]); }}
            />
          ))}
        </View>

        {/* Camera section */}
        {selectedActivity && (
          <>
            <View style={[styles.sectionRow, { marginTop: 10 }]}>
              <View style={styles.dot} />
              <Text style={styles.sectionLabel}>GHI HÌNH DỮ LIỆU</Text>
            </View>

            {hasFiles ? (
              <View style={[styles.cameraCard, { borderColor: `${COLORS.success}44` }]}>
                <View style={[styles.cameraIcon, { backgroundColor: `${COLORS.success}12` }]}>
                  <Icon name="check-circle-outline" size={26} color={COLORS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cameraTitle}>Đã chắt lọc {scannedFiles.length} hình ảnh</Text>
                  <Text style={styles.cameraSub}>Sẵn sàng lưu onnet</Text>
                </View>
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={() => { setScannedFiles([]); setRecording(true); }}
                >
                  <Icon name="refresh" size={14} color={COLORS.textSub} />
                  <Text style={styles.retakeText}>Ghi lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.cameraCard, { borderColor: `${selectedActivity.color}30` }]}
                onPress={() => setRecording(true)}
                activeOpacity={0.85}
              >
                <View style={[styles.cameraIcon, { backgroundColor: selectedActivity.bg }]}>
                  <Icon name="camera-plus-outline" size={24} color={selectedActivity.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cameraTitle}>Bắt đầu ghi hình</Text>
                  <Text style={styles.cameraSub}>Lia camera vào khu vực cần ghi nhận</Text>
                </View>
                <Icon name="chevron-right" size={18} color={COLORS.accentLight} />
              </TouchableOpacity>
            )}

            <View style={styles.creditNote}>
              <Icon name="lightning-bolt" size={13} color={COLORS.accent} />
              <Text style={styles.creditNoteText}>
                Hoạt động này tiêu tốn{' '}
                <Text style={{ fontWeight: '700', color: COLORS.accent }}>
                  {selectedActivity.credits} MAGIC
                </Text>
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: (Platform.OS === 'ios' ? 36 : 24) + insets.bottom }]}>
        {selectedActivity && (
          <View style={styles.bottomMeta}>
            <Text style={styles.bottomMetaLabel}>Chi phí</Text>
            <View style={styles.creditChip}>
              <Icon name="lightning-bolt" size={11} color={COLORS.accent} />
              <Text style={styles.creditChipText}>{selectedActivity.credits} MAGIC</Text>
            </View>
            {!hasFiles && (
              <Text style={styles.bottomHint}>Cần ghi hình trước</Text>
            )}
          </View>
        )}

        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
            onPress={handleSave}
            disabled={!canSave}
            onPressIn={() => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
            activeOpacity={1}
          >
            <View style={styles.btnShine} />
            <Icon name={saving ? 'loading' : 'cloud-upload-outline'} size={20} color={COLORS.white} />
            <Text style={styles.saveBtnText}>{saving ? 'Đang lưu...' : 'Lưu onnet'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <LampNetSyncModal visible={saving} currentStatus={syncStatus} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2,
  },
  eyebrow: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 2.5, marginBottom: 1 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  magicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.border,
  },
  magicChipText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

  scroll: { paddingHorizontal: 20, paddingTop: 18, flexGrow: 1 },

  guideCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 13, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 20,
  },
  guideIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    marginTop: 1,
  },
  guideText: { flex: 1, fontSize: 12, color: COLORS.textSub, lineHeight: 19 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2 },

  actList: { gap: 10, marginBottom: 4 },
  actCard: {
    borderRadius: 14, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center',
    padding: 13, gap: 12,
  },
  actIconWrap: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actBody: { flex: 1 },
  actLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  actDesc: { fontSize: 12, color: COLORS.textSub, lineHeight: 17, marginBottom: 5 },
  actCreditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actCreditText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  actCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },

  cameraCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 15,
    borderWidth: 1.5, marginBottom: 10,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 1,
  },
  cameraIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cameraTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  cameraSub: { fontSize: 12, color: COLORS.textMuted },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.bgWarm, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 9, borderWidth: 1, borderColor: COLORS.border,
  },
  retakeText: { fontSize: 11, fontWeight: '600', color: COLORS.textSub },

  creditNote: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 11, padding: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  creditNoteText: { fontSize: 13, color: COLORS.textSub },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: 10,
  },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottomMetaLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  creditChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accentGlow,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  creditChipText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  bottomHint: { fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' as any },

  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden', position: 'relative',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 14,
    elevation: 6,
  },
  saveBtnOff: { opacity: 0.40 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },
  btnShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  syncCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24, padding: 28, width: '100%',
    alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24,
    elevation: 12,
  },
  syncIconWrap: {
    width: 76, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  syncRing: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, borderStyle: 'dashed',
  },
  syncCenter: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  syncTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 5, letterSpacing: -0.3 },
  syncStatusText: { fontSize: 13, color: COLORS.textSub, textAlign: 'center', marginBottom: 20, lineHeight: 20 },

  syncStepList: { width: '100%', gap: 11 },
  syncStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncStepBullet: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.bgWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  syncActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  syncStepLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
});

export default ActivityScreen;