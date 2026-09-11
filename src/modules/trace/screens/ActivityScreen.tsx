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
  TextInput,
} from 'react-native';
// Icon: bộ Font Awesome Solid tải qua Iconify (assets/icons → icons.generated).
// Thêm icon mới: `node scripts/icons.js <tên-fa6-solid>`.
import Icon from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { saveActivity } from '../store/farmSlice';
import { Activity } from '../types';
import { selectChainWallet } from '../../../store/userSlice';
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
import { showError, showSuccess } from '../../../utils/alert';
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

/**
 * Hai việc mà lời mô tả trên thẻ đã HỨA là sẽ ghi vật tư.
 *
 * `fertilizingDesc` viết "Ghi loại phân và lượng bón", `pesticideDesc` viết tương
 * tự cho thuốc — trong khi `handleSave` gửi `materials: []` cứng. Đường dây đã
 * xong ở CẢ HAI ĐẦU từ trước: `syncDispatch.ts:209` gửi `materials` lên máy chủ,
 * `timelineView.materialNames` đọc ngược ra để vẽ trên dòng thời gian. Thiếu đúng
 * ô nhập. Nên đây không phải tính năng mới — là nối một sợi dây đứt ở giữa, và
 * trong lúc nó đứt thì lời hứa trên thẻ là một câu không có gì đỡ.
 *
 * `watering`/`harvesting` KHÔNG hỏi: tưới nước và thu hoạch không có vật tư, bắt
 * điền một ô rỗng chỉ dạy người ta gõ bừa cho nút sáng lên.
 */
const MATERIAL_ACTIVITIES = new Set(['fertilizing', 'pesticide']);

/** Một dòng vật tư người dùng đang gõ. Ba ô đều là chuỗi — chưa chuẩn hoá gì. */
interface MaterialRow { name: string; amount: string; unit: string }

const EMPTY_MATERIAL_ROW: MaterialRow = { name: '', amount: '', unit: '' };

/**
 * Lọc các dòng gõ dở thành thứ gửi đi được.
 *
 * Quy tắc: **TÊN là bắt buộc, lượng và đơn vị thì không.** Một dòng chỉ có "NPK
 * 16-16-8" vẫn là thông tin thật và người mua quả đọc được; một dòng chỉ có "5"
 * mà không có tên thì không nói được gì, nên bỏ hẳn thay vì gửi lên một mẩu rác
 * mà về sau không ai gỡ ra được.
 *
 * Trường rỗng bị BỎ khỏi object chứ không gửi chuỗi rỗng — `''` đi qua mạng rồi
 * nằm trong sổ trông y hệt "người ta đã điền một giá trị", và ở lớp hiển thị thì
 * nó không còn tự khai được là thiếu (Forall §Cái vỏ im lặng, gạch 3).
 */
export function cleanMaterialRows(rows: MaterialRow[]): Array<{ name: string; amount?: string; unit?: string }> {
  const out: Array<{ name: string; amount?: string; unit?: string }> = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const amount = r.amount.trim();
    const unit = r.unit.trim();
    out.push({
      name,
      ...(amount ? { amount } : {}),
      // Đơn vị không đi một mình: "kg" mà không có số thì không đọc được thành gì.
      ...(amount && unit ? { unit } : {}),
    });
  }
  return out;
}

// ── Step config for LampNet progress ─────────────────────────────────────────
/**
 * Các bước THẬT của việc lưu, hiện trên vạch tiến độ.
 *
 * Bản trước có bốn bước — "Khoá hình ảnh · Chia nhỏ dữ liệu · Cất nhiều bản sao
 * · Ghi vào sổ chung" — chạy bằng bốn lần `setTimeout(1100)` rồi thêm 500ms
 * nữa. Không có mã hoá, không có chia mảnh, không có bản sao, không có lần ghi
 * sổ nào; 4,9 giây đó là màn kịch, và nó nói với nông dân rằng bằng chứng của
 * họ đã lên sổ chung trong khi tệp còn nằm nguyên trong máy.
 *
 * Hai bước dưới đây neo vào việc thật, và `setSyncStep` chỉ nhích khi việc đó
 * xong: (0) ghi vào máy, (1) xếp vào hàng gửi máy chủ. Việc gửi lên
 * `POST /api/farm/{id}/event` chạy nền theo hàng đợi — có thể vài giây, có thể
 * ngày mai mới có sóng — nên màn KHÔNG hứa nó đã lên tới nơi.
 */
const SYNC_STEPS = ['trace.activity.stepSave', 'trace.activity.stepQueue'];

/** -1 = chưa bắt đầu · 0..1 = đang ở bước đó · 2 = xong. */
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

  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([{ ...EMPTY_MATERIAL_ROW }]);

  const selectedActivity = ACTIVITIES.find(a => a.type === selected);
  const hasFiles = scannedFiles.length > 0;

  // Việc này có hỏi vật tư không, và đã đủ để gửi chưa.
  const needsMaterials = !!selected && MATERIAL_ACTIVITIES.has(selected);
  const cleanMaterials = cleanMaterialRows(materialRows);
  const materialsReady = !needsMaterials || cleanMaterials.length > 0;

  // ── NÚT PHẢI HỎI CÙNG MỘT CÂU MÀ `handleSave` HỎI ─────────────────────────
  // `handleSave` thoát ngay ở dòng đầu nếu thiếu `farm` hoặc `user`, và thoát KHÔNG
  // một câu nào. `canSave` cũ không hỏi hai thứ đó ⟹ nút sáng, bấm được, bấm xong
  // không có gì xảy ra: không quay vòng, không lỗi, không màn mới. Người ghi việc
  // ngoài vườn đọc đó là "đã lưu rồi" và đi sang cây kế tiếp.
  //
  // Hai thứ này KHÔNG phải thứ người dùng nhập sai — `farm` suy từ tham số điều
  // hướng hoặc từ kho vườn, `user` là phiên đăng nhập. Nên chúng vắng mặt là trạng
  // thái của APP, và câu nói ra phải nói đúng thế, đừng bắt người ta đoán.
  const contextReady = !!farm && !!user;
  // `materialsReady` nằm ở đây vì cùng một luật: nút chỉ được sáng khi `handleSave`
  // thật sự làm được đủ việc mà thẻ đã hứa. Bón phân mà gửi `materials` rỗng thì
  // lần ghi đó vẫn "thành công" và dòng thời gian im lặng thiếu mất phần người mua
  // quả cần đọc — không ai biết cho tới lúc đi tra ngược, khi đó thì đã muộn.
  const canSave = !!selected && !saving && hasFiles && contextReady && materialsReady;

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
      const activityData = {
        id: `activity_${Date.now()}`,
        type: selected,
        farmId: farm.id,
        // Kèm cây khi người dùng vào màn này TỪ một cây. `syncDispatch` dùng nó để
        // ghi sự kiện vào dòng thời gian của CÂY — chỗ duy nhất app có màn hình vẽ
        // ra được (`TreeDetailScreen`). Thiếu trường này thì việc tưới/xịt vẫn ghi
        // thành công nhưng nằm ở dòng của vườn, và người ghi mở cây ra không thấy gì.
        treeId: tree?.id,
        // Dùng bản ĐÃ LỌC, không dùng `materialRows` thô: dòng gõ dở (chỉ có lượng,
        // chưa có tên) không được đi lên máy chủ. Việc không hỏi vật tư thì đây là
        // mảng rỗng — đúng như cũ.
        materials: needsMaterials ? cleanMaterials : [],
        thumbnailPath: scannedFiles[0] ?? '',
        timestamp: new Date().toISOString(),
        creditsUsed: selectedActivity.credits,
      };

      // activityData is the persistence/sync shape (string timestamp, materials,
      // thumbnailPath) which intentionally diverges from the in-memory Activity type.
      setSyncStep(0);
      await dispatch(saveActivity(activityData as unknown as Activity));

      // KHÔNG trừ MAGIC tại máy. Bản trước gọi
      //   dispatch(updateCredits({ magic: -selectedActivity.credits, ... }))
      // mà `updateCredits` (`store/userSlice.ts:312-323`) ghi thẳng vào
      // `state.wallet.magicBalance` — đúng con số mà dòng :257 ngay trên đây
      // tuyên bố "Chỉ tin số dư đến TỪ CHAIN". Kết quả: số dư trên màn tụt sau
      // mỗi lần ghi việc, rồi nhảy về nguyên giá trị cũ ở lần đồng bộ sau, vì
      // chẳng có nơi nào trừ thật. Phí (nếu thu) là việc của máy chủ; app gửi
      // kèm `quoted_magic` trong sự kiện và ĐỌC lại số dư từ chain.
      // Đính kèm clip đã quay để sync/upload (trước đây truyền [] → mất bằng chứng media).
      setSyncStep(1);
      await syncService.addSyncItem('activity', { activity: activityData, farmName: farm.name }, scannedFiles);
      setSyncStep(STEP_DONE);

      showSuccess(tk('trace.activity.savedTitle'), tk('trace.activity.savedBody'));
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

            {/* ── Phân/thuốc đã dùng ─────────────────────────────────────────
                Chỉ hiện với hai việc CÓ vật tư. Đặt SAU khối quay clip vì clip là
                bằng chứng, còn đây là lời khai đi kèm bằng chứng đó. */}
            {needsMaterials && (
              <>
                <View style={[styles.sectionRow, { marginTop: 16 }]}>
                  <View style={styles.dot} />
                  <Text style={styles.sectionLabel}>{tk('trace.activity.materials')}</Text>
                </View>
                <Text style={styles.matHint}>
                  {tk(selected === 'pesticide'
                    ? 'trace.activity.materialsHintPest'
                    : 'trace.activity.materialsHintFert')}
                </Text>

                {materialRows.map((row, i) => (
                  <View key={i} style={styles.matCard}>
                    <TextInput
                      style={styles.matName}
                      value={row.name}
                      onChangeText={t => setMaterialRows(rows =>
                        rows.map((r, j) => (j === i ? { ...r, name: t } : r)))}
                      placeholder={tk('trace.activity.materialName')}
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <View style={styles.matRow}>
                      <TextInput
                        style={[styles.matSmall, { flex: 1.2 }]}
                        value={row.amount}
                        onChangeText={t => setMaterialRows(rows =>
                          rows.map((r, j) => (j === i ? { ...r, amount: t } : r)))}
                        placeholder={tk('trace.activity.materialAmount')}
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={[styles.matSmall, { flex: 1 }]}
                        value={row.unit}
                        onChangeText={t => setMaterialRows(rows =>
                          rows.map((r, j) => (j === i ? { ...r, unit: t } : r)))}
                        placeholder={tk('trace.activity.materialUnit')}
                        placeholderTextColor={COLORS.textMuted}
                      />
                      {/* Nút bỏ dòng chỉ hiện khi CÓ dòng thứ hai — bỏ dòng cuối
                          cùng thì màn trống trơn và không còn chỗ nào để gõ. */}
                      {materialRows.length > 1 && (
                        <TouchableOpacity
                          style={styles.matDelBtn}
                          onPress={() => setMaterialRows(rows => rows.filter((_, j) => j !== i))}
                          accessibilityLabel={tk('trace.activity.removeMaterial')}
                        >
                          <Icon name="xmark" size={14} color={COLORS.textSub} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.matAddBtn}
                  onPress={() => setMaterialRows(rows => [...rows, { ...EMPTY_MATERIAL_ROW }])}
                >
                  <Icon name="plus" size={13} color={ORG_TONE.primary} />
                  <Text style={styles.matAddText}>{tk('trace.activity.addMaterial')}</Text>
                </TouchableOpacity>
              </>
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
            {/* Nói ra lý do thứ ba. Thiếu clip đã có dòng trên; thiếu tên vật tư thì
                trước đây nút vẫn sáng (và gửi rỗng), nay nút tắt — nên phải có câu
                nói vì sao, không thì nó thành một nút tắt không ai hiểu. */}
            {hasFiles && !materialsReady && (
              <Text style={styles.bottomHint}>{tk('trace.activity.needMaterial')}</Text>
            )}
            {/* Nói ra LÝ DO nút tắt khi lý do KHÔNG nằm ở tay người dùng. Thiếu clip
                thì đã có dòng trên; thiếu vườn hoặc phiên đăng nhập thì trước đây
                không dòng nào nói, mà đó lại là hai thứ người dùng không tự thấy. */}
            {!contextReady && (
              <Text style={styles.bottomHint}>
                {!user
                  ? tk('trace.activity.needLogin')
                  : tk('trace.activity.needFarm')}
              </Text>
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
  // ── Phân/thuốc đã dùng ─────────────────────────────────────────────────────
  matHint: { fontSize: 13, color: ORG_NATURE.barkSoft, marginBottom: 10, lineHeight: 18 },
  matCard: {
    ...ORGANIC_TILE,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  matName: {
    fontSize: 15,
    fontWeight: '600',
    color: ORG_NATURE.bark,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: ORG_SURFACE.sunken,
  },
  matRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matSmall: {
    fontSize: 14,
    color: ORG_NATURE.bark,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: ORG_SURFACE.sunken,
  },
  matDelBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_SURFACE.sunken,
  },
  matAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4,
  },
  matAddText: { fontSize: 14, fontWeight: '600', color: ORG_TONE.primary },

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