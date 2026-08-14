// modules/trace/screens/ActivityScreen.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
// Icon: bộ Font Awesome Solid tải qua Iconify (assets/icons → icons.generated).
// Thêm icon mới: `node scripts/icons.js <tên-fa6-solid>`.
import Icon from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { saveActivity } from '../store/farmSlice';
import { Activity } from '../types';
import { updateCredits, selectChainWallet } from '../../../store/userSlice';
import { syncService } from '../../../services/syncService';
import { COLORS } from '../../../constants';
// Nen huu co dung chung cua module (tong dat/la) - xem theme/depth.ts
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_CARD, ORGANIC_TILE, ELEVATION as ORG_ELEV, TYPE as ORG_TYPE,
} from '../theme/depth';
import { GroundBackdrop } from '../components/layered/Organic';
import { useTk } from '../../../i18n/keys';
import { RootState } from '../../../store';
import { useAppDispatch } from '../../../store/hooks';
import { showSuccess, showError, showWarning, showInfo } from '../../../utils/alert';
import { withPhotoSave } from '../../../services/mediaSavePermission';

// image-picker nạp mềm (giống FruitVideo/CareScan) — máy chưa cài thì báo rõ, không crash.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

// Quay clip ngắn cho hoạt động — trả về đường dẫn file để bật nút "Lưu onnet".
const VIDEO_OPTIONS = {
  mediaType: 'video' as const,
  videoQuality: 'high' as const,
  durationLimit: 30,
  saveToPhotos: true,
};

// Nhận cả {farm} (caller cũ FarmDetail) lẫn {tree} (caller TreeDetail). Trước đây
// TreeDetail truyền {tree} nhưng màn chỉ đọc `farm` → farm undefined → handleSave
// thoát sớm, không lưu được hoạt động. Giờ suy ra farm từ tree.farmId.
interface RouteParams { farm?: any; tree?: any }

/**
 * Bon viec nha vuon ghi duoc. `labelKey`/`descKey` la KHOA chu, khong phai cau
 * tieng Viet — doi loi van khong dung toi ma.
 *
 * Ban cu con `scannerTitle` + `scannerSteps` cho ca bon muc: chu cho man quet
 * tung buoc. Khong noi nao doc chung — man quet do da bo tu Build 54. Da go.
 */
const ACTIVITIES = [
  {
    type: 'watering', labelKey: 'trace.activity.watering', descKey: 'trace.activity.wateringDesc',
    icon: 'droplet', color: ORG_TONE.rain, bg: ORG_TONE.rainSoft, credits: 1,
  },
  {
    type: 'fertilizing', labelKey: 'trace.activity.fertilizing', descKey: 'trace.activity.fertilizingDesc',
    icon: 'leaf', color: ORG_TONE.primary, bg: ORG_TONE.primarySoft, credits: 2,
  },
  {
    type: 'pesticide', labelKey: 'trace.activity.pesticide', descKey: 'trace.activity.pesticideDesc',
    icon: 'spray-can', color: ORG_TONE.sun, bg: ORG_TONE.sunSoft, credits: 2,
  },
  {
    type: 'harvesting', labelKey: 'trace.activity.harvesting', descKey: 'trace.activity.harvestingDesc',
    icon: 'basket-shopping', color: ORG_TONE.soil, bg: 'rgba(201,123,74,0.10)', credits: 3,
  },
];

// ── Step config for LampNet progress ─────────────────────────────────────────
/**
 * Bon buoc cat du lieu, hien tren vach tien do.
 *
 * Ban cu doi chieu bang CHUOI: moi buoc mang mot `keyword` tieng Viet, roi do
 * xem cau trang thai dang hien co chua tu do khong. Ma hai dau cua phep doi
 * chieu ay deu nam trong CHINH tep nay — chi can sua mot dau cau la vach tien
 * do dung yen suot qua trinh luu, ma khong bao loi gi. Nay dem so buoc thang.
 */
const SYNC_STEPS = ['trace.activity.step1', 'trace.activity.step2',
  'trace.activity.step3', 'trace.activity.step4'];

/** -1 = chua bat dau · 0..3 = dang o buoc do · 4 = xong. */
const STEP_DONE = SYNC_STEPS.length;

// ── LampNet Sync Modal ────────────────────────────────────────────────────────
const LampNetSyncModal = ({
  visible, step,
}: {
  visible: boolean; step: number;
}) => {
  const tk = useTk();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      spinAnim.stopAnimation();
      pulseAnim.stopAnimation();
      return;
    }
    // Hộp thoại đồng bộ LampNet có thể bị gỡ trong lúc đang hiện (rời màn giữa
    // chừng). Khi đó nhánh `else` không chạy — chỉ hàm dọn chạy.
    const loops = [
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 2600, useNativeDriver: true })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [visible]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const isDone = step >= STEP_DONE;

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
                name={isDone ? 'check' : 'cube'}
                size={26}
                color={isDone ? COLORS.success : COLORS.accent}
              />
            </Animated.View>
          </View>

          <Text style={styles.syncTitle}>
            {tk(isDone ? 'trace.activity.syncDone' : 'trace.activity.syncTitle')}
          </Text>
          <Text style={styles.syncStatusText}>
            {step >= 0 && step < STEP_DONE ? tk(SYNC_STEPS[step]) : ''}
          </Text>

          {/* Step list */}
          <View style={styles.syncStepList}>
            {SYNC_STEPS.map((labelKey, i) => {
              const done = isDone || i < step;
              const active = !done && i === step;
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
                  ]}>{tk(labelKey)}</Text>
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
  const tk = useTk();
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: selected ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [selected]);

  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, activity.color] });
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [ORG_SURFACE.raised, activity.bg] });

  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.82}>
      <Animated.View style={[styles.actCard, { borderColor, backgroundColor: bgColor }]}>
        <View style={[styles.actIconWrap, { backgroundColor: activity.bg }]}>
          <Icon name={activity.icon} size={24} color={activity.color} />
        </View>

        <View style={styles.actBody}>
          <Text style={styles.actLabel}>{tk(activity.labelKey)}</Text>
          <Text style={styles.actDesc}>{tk(activity.descKey)}</Text>
          <View style={styles.actCreditRow}>
            <Icon name="bolt" size={11} color={COLORS.textMuted} />
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
          {selected && <Icon name="check" size={12} color={COLORS.white} />}
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
const ActivityScreen = () => {
  const navigation = useNavigation();
  const tk = useTk();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { farm: farmParam, tree } = (route.params ?? {}) as RouteParams;
  const farms = useSelector((state: RootState) => state.farm.farms);
  // farm hiệu dụng: ưu tiên param farm; nếu chỉ có tree thì tra vườn theo tree.farmId
  // (fallback object tối thiểu để vẫn ghi được farmId khi vườn chưa nạp vào store).
  const farm = farmParam
    ?? (tree
      ? farms.find((f: any) => f.id === tree.farmId) ?? { id: tree.farmId, name: tree.name ?? '—' }
      : undefined);
  const dispatch = useAppDispatch();
  const user = useSelector((state: RootState) => state.user.currentUser);
  // Chỉ tin số dư đến TỪ CHAIN (selector chung). null = chưa biết số dư thật → không chặn nhầm.
  const wallet = useSelector(selectChainWallet);
  const balanceKnown = !!wallet;
  const magicBalance = wallet?.magicBalance ?? 0;

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<string[]>([]);
  const [syncStep, setSyncStep] = useState(-1);
  const btnScale = useRef(new Animated.Value(1)).current;

  const selectedActivity = ACTIVITIES.find(a => a.type === selected);
  const hasFiles = scannedFiles.length > 0;
  const canSave = !!selected && !saving && hasFiles;

  // Mở CAMERA QUAY VIDEO ngay (OS camera) và nhận đường dẫn file trả về → set vào
  // scannedFiles để bật "Lưu onnet". Thay cho luồng cũ điều hướng sang TreeIdentity
  // (màn nhận diện cây) vốn KHÔNG trả file về nên nút Lưu không bao giờ bật.
  const handleRecord = useCallback(async () => {
    if (!imagePicker?.launchCamera) {
      showError(tk('trace.activity.noCamera'), tk('trace.activity.noCameraBody'));
      return;
    }
    imagePicker.launchCamera(await withPhotoSave(VIDEO_OPTIONS), (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        showError(tk('trace.activity.cameraErr'), response.errorMessage ?? tk('trace.activity.cameraErrBody'));
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) setScannedFiles([asset.uri]);
    });
  }, []);

  const handleSave = async () => {
    if (!selected || !farm || !user || !selectedActivity) return;
    // CHỈ chặn khi ĐÃ BIẾT số dư thật (từ chain) và thực sự không đủ. Ví chưa nạp
    // xong (balanceKnown=false) → KHÔNG chặn nhầm, để nông dân vẫn ghi việc đồng
    // (offline-first); backend là nơi đối soát phí cuối cùng.
    if (balanceKnown && magicBalance < selectedActivity.credits) {
      showError(tk('trace.activity.lowCredit'), tk('trace.activity.lowCreditBody', { n: selectedActivity.credits }));
      return;
    }

    setSaving(true);
    try {
      for (let i = 0; i < SYNC_STEPS.length; i++) {
        setSyncStep(i);
        await new Promise<void>(r => setTimeout(() => r(), 1100));
      }
      setSyncStep(STEP_DONE);
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
      // Đính kèm clip đã quay để sync/upload (trước đây truyền [] → mất bằng chứng media).
      await syncService.addSyncItem('activity', { activity: activityData, farmName: farm.name }, scannedFiles);

      showSuccess(tk('trace.activity.savedTitle'), tk('trace.activity.savedBody', { n: selectedActivity.credits }));
      navigation.goBack();
    } catch (_) {
      showError(tk('trace.activity.saveFail'), tk('trace.activity.saveFailBody'));
    } finally {
      setSaving(false);
      setSyncStep(-1);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <GroundBackdrop variant="detail" />

      <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? 56 : 40) + insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{tk('trace.activity.title')}</Text>
          <Text style={styles.title} numberOfLines={1}>{farm?.name ?? '—'}</Text>
        </View>
        <View style={styles.magicChip}>
          <Icon name="bolt" size={12} color={COLORS.accent} />
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
            <Icon name="circle-info" size={17} color={COLORS.accent} />
          </View>
          <Text style={styles.guideText}>{tk('trace.activity.guide')}</Text>
        </View>

        {/* Activity selection */}
        <View style={styles.sectionRow}>
          <View style={styles.dot} />
          <Text style={styles.sectionLabel}>{tk('trace.activity.pick')}</Text>
        </View>
        <View style={styles.actList}>
          {ACTIVITIES.map(act => (
            <ActivityCard
              key={act.type}
              activity={act}
              selected={selected === act.type}
              onSelect={() => {
                // Chọn 1 hoạt động → MỞ ỐNG KÍNH NGAY (bỏ bước bấm "Bắt đầu ghi hình").
                // Bấm lại chính nó = bỏ chọn. Chọn cái mới = mở camera quay luôn.
                if (selected === act.type) { setSelected(null); setScannedFiles([]); return; }
                setSelected(act.type);
                setScannedFiles([]);
                handleRecord();
              }}
            />
          ))}
        </View>

        {/* Camera section */}
        {selectedActivity && (
          <>
            <View style={[styles.sectionRow, { marginTop: 10 }]}>
              <View style={styles.dot} />
              <Text style={styles.sectionLabel}>{tk('trace.activity.record')}</Text>
            </View>

            {hasFiles ? (
              <View style={[styles.cameraCard, { borderColor: `${COLORS.success}44` }]}>
                <View style={[styles.cameraIcon, { backgroundColor: `${COLORS.success}12` }]}>
                  <Icon name="circle-check" size={26} color={COLORS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cameraTitle}>{tk('trace.activity.gotClip', { n: scannedFiles.length })}</Text>
                  <Text style={styles.cameraSub}>{tk('trace.activity.gotClipHint')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={handleRecord}
                >
                  <Icon name="arrows-rotate" size={14} color={COLORS.textSub} />
                  <Text style={styles.retakeText}>{tk('trace.activity.retake')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.cameraCard, { borderColor: `${selectedActivity.color}30` }]}
                onPress={handleRecord}
                activeOpacity={0.85}
              >
                <View style={[styles.cameraIcon, { backgroundColor: selectedActivity.bg }]}>
                  <Icon name="camera" size={24} color={selectedActivity.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cameraTitle}>{tk('trace.activity.startRecord')}</Text>
                  <Text style={styles.cameraSub}>{tk('trace.activity.startRecordHint')}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={COLORS.accentLight} />
              </TouchableOpacity>
            )}

            <View style={styles.creditNote}>
              <Icon name="bolt" size={13} color={COLORS.accent} />
              <Text style={styles.creditNoteText}>
                {tk('trace.activity.cost', { n: selectedActivity.credits })}
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
            <Text style={styles.bottomMetaLabel}>{tk('trace.activity.costLabel')}</Text>
            <View style={styles.creditChip}>
              <Icon name="bolt" size={11} color={COLORS.accent} />
              <Text style={styles.creditChipText}>{selectedActivity.credits} MAGIC</Text>
            </View>
            {!hasFiles && (
              <Text style={styles.bottomHint}>{tk('trace.activity.needClip')}</Text>
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
            <Icon name={saving ? 'spinner' : 'cloud-arrow-up'} size={20} color={COLORS.white} />
            <Text style={styles.saveBtnText}>
              {tk(saving ? 'trace.activity.saving' : 'trace.activity.save')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <LampNetSyncModal visible={saving} step={syncStep} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ORG_SURFACE.ground },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
    ...ORG_ELEV.card,
  },
  eyebrow: { fontSize: 14, fontWeight: '600', color: ORG_TONE.primary, marginBottom: 1 },
  title: { ...ORG_TYPE.title, fontSize: 23 },
  magicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: ORG_TONE.sunSoft,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  magicChipText: { fontSize: 14, fontWeight: '700', color: ORG_TONE.sun },

  scroll: { paddingHorizontal: 20, paddingTop: 18, flexGrow: 1 },

  guideCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: ORG_TONE.primarySoft,
    ...ORGANIC_CARD, padding: 14,
    marginBottom: 20,
  },
  guideIconWrap: {
    width: 34, height: 34, ...ORGANIC_TILE,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  guideText: { flex: 1, ...ORG_TYPE.body, fontSize: 15, lineHeight: 22 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORG_TONE.primary },
  sectionLabel: { ...ORG_TYPE.section },

  actList: { gap: 10, marginBottom: 4 },
  actCard: {
    ...ORGANIC_CARD, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center',
    minHeight: 76, padding: 14, gap: 12,
  },
  actIconWrap: { width: 52, height: 52, ...ORGANIC_TILE, alignItems: 'center', justifyContent: 'center' },
  actBody: { flex: 1 },
  actLabel: { fontSize: 17, fontWeight: '700', color: ORG_NATURE.bark, marginBottom: 2 },
  actDesc: { fontSize: 14, color: ORG_NATURE.barkSoft, lineHeight: 20, marginBottom: 5 },
  actCreditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actCreditText: { fontSize: 12.5, color: ORG_NATURE.barkSoft, fontWeight: '500' },
  actCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },

  cameraCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: ORG_SURFACE.raised,
    ...ORGANIC_CARD, padding: 16,
    borderWidth: 1.5, marginBottom: 10,
    ...ORG_ELEV.card,
  },
  cameraIcon: { width: 50, height: 50, ...ORGANIC_TILE, alignItems: 'center', justifyContent: 'center' },
  cameraTitle: { fontSize: 16, fontWeight: '700', color: ORG_NATURE.bark, marginBottom: 2 },
  cameraSub: { fontSize: 14, color: ORG_NATURE.barkSoft },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: ORG_SURFACE.sunken, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 999,
  },
  retakeText: { fontSize: 13, fontWeight: '600', color: ORG_NATURE.barkSoft },

  creditNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: ORG_TONE.sunSoft,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
  },
  creditNoteText: { fontSize: 14, color: ORG_NATURE.bark },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    backgroundColor: ORG_SURFACE.ground,
    borderTopWidth: 1, borderTopColor: ORG_TONE.border,
    gap: 10,
  },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottomMetaLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  creditChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accentGlow,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: ORG_TONE.border,
  },
  creditChipText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  bottomHint: { fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' as any },

  saveBtn: {
    backgroundColor: ORG_TONE.primary,
    ...ORGANIC_CARD, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, overflow: 'hidden',
    ...ORG_ELEV.cardStrong,
  },
  saveBtnOff: { opacity: 0.40 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: ORG_NATURE.paper },
  btnShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: ORG_SURFACE.scrim,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  syncCard: {
    backgroundColor: ORG_SURFACE.raised,
    borderTopLeftRadius: 34, borderTopRightRadius: 24,
    borderBottomRightRadius: 34, borderBottomLeftRadius: 24,
    padding: 28, width: '100%', alignItems: 'center',
    ...ORG_ELEV.modal,
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
    backgroundColor: ORG_TONE.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  syncTitle: { fontSize: 19, fontWeight: '700', color: ORG_NATURE.bark, marginBottom: 5, letterSpacing: -0.3 },
  syncStatusText: { fontSize: 14, color: ORG_NATURE.barkSoft, textAlign: 'center', marginBottom: 20, lineHeight: 21 },

  syncStepList: { width: '100%', gap: 11 },
  syncStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncStepBullet: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: ORG_TONE.border,
    backgroundColor: ORG_SURFACE.raised,
    alignItems: 'center', justifyContent: 'center',
  },
  syncActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  syncStepLabel: { fontSize: 14, color: ORG_NATURE.barkSoft, fontWeight: '500' },
});

export default ActivityScreen;