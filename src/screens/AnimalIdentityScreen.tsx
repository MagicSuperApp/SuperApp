/**
 * AnimalIdentityScreen — Nhận diện cá thể vật nuôi từ 1 ảnh
 *
 * Props qua navigation.route.params: { species: string, farmId: string }
 *
 * Luồng:
 *  1. Chụp 1 ảnh (launchCamera — cả iOS lẫn Android)
 *  2. Hiện preview + nút "Nhận diện"
 *  3. Loading → gọi POST /api/animal/identify
 *  4. Hiện ResultBadge theo decision
 *     MATCH      → tên con, nút "Xem hồ sơ" + "Chụp lại"
 *     UNCERTAIN  → mở ReidConfirmDialog
 *     NO_MATCH / EMPTY_FARM → nút "Đăng ký cá thể mới"
 *     MOVED      → hiện khoảng cách + nút xem hồ sơ
 *  5. shoot_hint hiển thị bên dưới kết quả
 *
 * KHÔNG dùng NativeCameraPreview (chỉ dành cho tree native bridge).
 * Dùng launchCamera của react-native-image-picker cho cả 2 platform.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// react-native-image-picker — cài: npm install react-native-image-picker
// Khi chưa cài, handleCapture dùng Alert placeholder thay vì launchCamera thật.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

import { ORILIFE_BASE } from '../services/orilifeBase';
import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import ResultBadge from '../components/reid/ResultBadge';
import ReidConfirmDialog, { type ReidCandidate } from '../components/reid/ReidConfirmDialog';
import {
  identifyAnimal,
  type AnimalIdentifyResponse,
  type AnimalCandidate,
} from '../services/animalReIDService';
import { withPhotoSave } from '../services/mediaSavePermission';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { loadFarms } from '../modules/trace/store/farmSlice';
import { showError } from '../utils/alert';
import { t } from '../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL: string = ORILIFE_BASE;

// Nhãn tiếng Việt theo loài
const SPECIES_LABELS: Record<string, string> = {
  ga:   'Gà',
  lon:  'Lợn',
  de:   'Dê',
  bo:   'Bò',
  vit:  'Vịt',
  ngong: 'Ngỗng',
  cho:  'Chó',
  meo:  'Mèo',
};

function speciesLabel(s: string): string {
  return SPECIES_LABELS[s.toLowerCase()] ?? s;
}

// Thứ tự chip chọn loài khi màn được mở KHÔNG kèm loài (từ cổng xoè).
const SPECIES_KEYS = Object.keys(SPECIES_LABELS);

/**
 * AnimalCandidate (máy chủ) → ReidCandidate (hộp thoại chọn cá thể).
 *
 * XUẤT RA để test khoá được — chỗ này từng hỏng câm. Bản cũ ghi khoá `tree_id`
 * trong khi hộp thoại đọc `candidate.id` (ReidConfirmDialog.tsx:25 · :191 · :193),
 * lại bị `candidates={… as any}` che nên TypeScript không gác nổi. Hệ quả: bấm một
 * ứng viên thì `onSelect` nhận `undefined` → mở hồ sơ rỗng. Bản cũ cũng bỏ luôn
 * `sim` dù máy chủ có trả (animalReIDService.ts:21) → mất huy hiệu % giống.
 *
 * Chú kiểu trả về `ReidCandidate` chính là cái gác: đổi tên khoá là `tsc` đỏ ngay.
 */
export function toReidCandidates(list?: AnimalCandidate[]): ReidCandidate[] {
  return (list ?? []).map(
    (c): ReidCandidate => ({
      id: c.animal_did,
      name: c.name ?? '',
      sim: c.sim,
      species: c.species,
      code: c.species ? speciesLabel(c.species) : undefined,
      near_prev: c.near_prev,
      n_views: c.n_views,
    }),
  );
}

// Camera options (dùng khi react-native-image-picker đã cài)
const CAMERA_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.85,
  maxWidth: 1280,
  maxHeight: 1280,
  saveToPhotos: true,
  includeBase64: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigation types
// ─────────────────────────────────────────────────────────────────────────────

// Params TUỲ CHỌN: cổng xoè (resolveGateItems) mở màn này mà KHÔNG biết vườn nào —
// nó chỉ có số đếm vườn/cây, không có mã vườn. Trước đây thiếu params là màn tự
// goBack() ⇒ lối vào nào cũng chết. Nay màn tự hỏi loài + tự chọn vườn.
type AnimalIdentityRouteParams = {
  AnimalIdentity: {
    species?: string;
    farmId?: string;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const AnimalIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AnimalIdentityRouteParams, 'AnimalIdentity'>>();

  const [species, setSpecies] = useState<string>(route.params?.species ?? '');
  const [farmId, setFarmId] = useState<string>(route.params?.farmId ?? '');

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [result, setResult] = useState<AnimalIdentifyResponse | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Chọn vườn (mẫu của TreeEnrollScreen:186-215) ──────────────────────────
  // Vật nuôi PHẢI thuộc một vườn thật: máy chủ nhận `farm_id` và mọi màn đọc lại
  // đều lọc theo mã vườn thật. KHÔNG BAO GIỜ gửi rỗng hay chuỗi bịa `'default'` —
  // ghi dưới mã không thuộc về ai là ghi xong biến mất.
  const dispatch = useAppDispatch();
  const farms = useAppSelector((s: RootState) => s.farm.farms);
  const currentUser = useAppSelector((s: RootState) => s.user.currentUser);

  useEffect(() => {
    if (currentUser?.id && farms.length === 0) dispatch(loadFarms(currentUser.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Mã vườn đang giữ không nằm trong danh sách đã tải (vườn bị xoá, hoặc chuỗi bịa
  // lọt từ một cổng cũ) → bỏ chọn để buộc chọn lại, khỏi gửi mã chết lên máy chủ.
  useEffect(() => {
    if (farmId && farms.length > 0 && !farms.some(f => f.id === farmId)) {
      setFarmId('');
    }
  }, [farms, farmId]);

  // Đúng 1 vườn → tự chọn (không thêm ma sát). Nhiều vườn → để người dùng chọn.
  useEffect(() => {
    if (!farmId && farms.length === 1) setFarmId(farms[0].id);
  }, [farms, farmId]);

  const needsSetup = !species || !farmId;

  // ── Chụp ảnh ──────────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    // Xoá kết quả cũ khi chụp lại
    setResult(null);

    if (!imagePicker?.launchCamera) {
      // Fallback: react-native-image-picker chưa cài
      // npm install react-native-image-picker && npx pod-install
      showError('Chưa mở được máy ảnh',
        'Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.');
      return;
    }

    imagePicker.launchCamera(await withPhotoSave(CAMERA_OPTIONS), (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(
          t('Lỗi camera'),
          response.errorMessage ?? t('Không thể mở camera. Kiểm tra quyền trong Cài đặt.'),
          [{ text: 'OK' }],
        );
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) {
        setImageUri(asset.uri);
      }
    });
  }, []);

  // ── Gọi API nhận diện ─────────────────────────────────────────────────────
  const handleIdentify = useCallback(async () => {
    // Thiếu loài hoặc vườn thì KHÔNG gọi: máy chủ nhận cả hai trong form
    // (animalReIDService.ts:168-172), gửi rỗng là ghi vào chỗ không ai đọc lại được.
    if (!imageUri || !species || !farmId) return;
    setIsIdentifying(true);
    setResult(null);

    try {
      const res = await identifyAnimal(BASE_URL, species, farmId, imageUri);
      if (res.ok && res.data) {
        setResult(res.data);
        if (res.data.decision === 'UNCERTAIN') {
          setShowConfirm(true);
        }
      } else {
        showError('Lỗi', res.error?.detail ?? 'Nhận diện thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsIdentifying(false);
    }
  }, [imageUri, species, farmId]);

  // ── Xử lý chọn từ dialog UNCERTAIN ───────────────────────────────────────
  const handleConfirmSelect = useCallback(
    (id: string | 'new') => {
      setShowConfirm(false);
      if (id === 'new') {
        navigation.navigate('AnimalEnroll', { species, farmId });
      } else {
        // id ở đây là animal_did (đã map từ tree_id trong adapter bên dưới)
        navigation.navigate('AnimalDetail', { animalDid: id });
      }
    },
    [navigation, species, farmId],
  );

  // ── Adapter: AnimalCandidate → ReidCandidate cho ReidConfirmDialog ────────
  const candidatesForDialog = toReidCandidates(result?.candidates);

  // ── Render kết quả ────────────────────────────────────────────────────────
  const renderResult = () => {
    if (!result) return null;
    const { decision, name, animal_did, shoot_hint, moved_distance_m } = result;

    return (
      <View style={styles.resultSection}>
        {/* Badge */}
        <ResultBadge
          decision={decision}
          context="animal"
          extra={
            decision === 'MATCH'
              ? (name ?? undefined)
              : decision === 'MOVED'
              ? moved_distance_m != null
                ? `Khoảng cách: ${moved_distance_m.toFixed(0)} m`
                : undefined
              : undefined
          }
        />

        {/* Hành động theo decision */}
        <View style={styles.resultActions}>
          {decision === 'MATCH' && (
            <>
              {name && (
                <View style={styles.matchInfo}>
                  <Icon name="paw" size={16} color={COLORS.success} />
                  <Text style={styles.matchName}>{name}</Text>
                </View>
              )}
              {animal_did && (
                <Text style={styles.matchDid} numberOfLines={1}>
                  Mã định danh: {animal_did}
                </Text>
              )}
              <View style={styles.actionRow}>
                {animal_did && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => navigation.navigate('AnimalDetail', { animalDid: animal_did })}
                    activeOpacity={0.8}
                  >
                    <Icon name="file-account" size={18} color={NEUTRAL.white} />
                    <Text style={styles.btnPrimaryText}>Xem hồ sơ</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={handleCapture}
                  activeOpacity={0.8}
                >
                  <Icon name="camera-retake" size={18} color={COLORS.accent} />
                  <Text style={styles.btnSecondaryText}>Chụp lại</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {(decision === 'NO_MATCH' || decision === 'EMPTY_FARM') && (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.btnFull]}
              onPress={() => navigation.navigate('AnimalEnroll', { species, farmId })}
              activeOpacity={0.8}
            >
              <Icon name="plus-circle" size={18} color={NEUTRAL.white} />
              <Text style={styles.btnPrimaryText}>Đăng ký cá thể mới</Text>
            </TouchableOpacity>
          )}

          {/* UNCERTAIN — trước đây KHÔNG có nhánh nào ở đây: đóng hộp thoại là kẹt
              cứng (nút "Nhận diện" bị `!result` chặn, lối ra duy nhất là chạm ảnh
              mà không nhãn nào nói vậy). Nay có đường mở lại danh sách. */}
          {decision === 'UNCERTAIN' && (
            <View style={styles.actionRow}>
              {(result.candidates?.length ?? 0) > 0 && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => setShowConfirm(true)}
                  activeOpacity={0.8}
                >
                  <Icon name="format-list-checks" size={18} color={NEUTRAL.white} />
                  <Text style={styles.btnPrimaryText}>Chọn lại từ danh sách</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={handleCapture}
                activeOpacity={0.8}
              >
                <Icon name="camera-retake" size={18} color={COLORS.accent} />
                <Text style={styles.btnSecondaryText}>Chụp lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {decision === 'MOVED' && animal_did && (
            <TouchableOpacity
              style={[styles.btn, styles.btnInfo, styles.btnFull]}
              onPress={() => navigation.navigate('AnimalDetail', { animalDid: animal_did })}
              activeOpacity={0.8}
            >
              <Icon name="file-account" size={18} color={NEUTRAL.white} />
              <Text style={styles.btnPrimaryText}>Xem hồ sơ cá thể</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Gợi ý góc chụp */}
        {!!shoot_hint && (
          <View style={styles.hintBox}>
            <Icon name="lightbulb-on" size={16} color="#b07d2f" />
            <Text style={styles.hintText}>{shoot_hint}</Text>
          </View>
        )}
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Icon name="paw" size={20} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>
            {species ? `Nhận diện ${speciesLabel(species)}` : 'Nhận diện vật nuôi'}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Bước chuẩn bị: loài + vườn ──────────────────────────────────────
            Chỉ hiện khi còn thiếu. Vào từ trong một vườn (đã có đủ params) thì
            khối này không xuất hiện, luồng y như cũ. */}
        {needsSetup && (
          <View style={styles.setupBox}>
            <Text style={styles.setupTitle}>Trước khi chụp, cho biết:</Text>

            {/* Loài */}
            <Text style={styles.setupLabel}>Con gì?</Text>
            <View style={styles.chipRow}>
              {SPECIES_KEYS.map(k => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, species === k && styles.chipActive]}
                  onPress={() => setSpecies(k)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, species === k && styles.chipTextActive]}>
                    {SPECIES_LABELS[k]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vườn — chỉ hỏi khi có từ 2 vườn trở lên (1 vườn đã tự chọn) */}
            <Text style={styles.setupLabel}>Ở vườn nào?</Text>
            {farms.length === 0 ? (
              <View>
                <Text style={styles.setupHint}>
                  Chưa có vườn nào. Vật nuôi phải thuộc một vườn thật thì hồ sơ mới
                  tra lại được — tạo vườn trước rồi quay lại đây.
                </Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, styles.btnFull]}
                  onPress={() => navigation.navigate('Farms')}
                  activeOpacity={0.8}
                >
                  <Icon name="warehouse" size={18} color={COLORS.accent} />
                  <Text style={styles.btnSecondaryText}>Mở trang trại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.chipRow}>
                {farms.map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.chip, farmId === f.id && styles.chipActive]}
                    onPress={() => setFarmId(f.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, farmId === f.id && styles.chipTextActive]}>
                      {f.name || f.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Preview ảnh hoặc placeholder chụp */}
        {imageUri ? (
          <TouchableOpacity
            style={styles.previewWrap}
            onPress={handleCapture}
            activeOpacity={0.85}
          >
            <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="cover" />
            <View style={styles.previewOverlay}>
              <Icon name="camera-retake" size={28} color={NEUTRAL.white} />
              <Text style={styles.previewOverlayText}>Chụp lại</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.capturePlaceholder}
            onPress={handleCapture}
            activeOpacity={0.8}
          >
            <Icon name="camera-plus" size={56} color={NEUTRAL.textMuted} />
            <Text style={styles.capturePlaceholderText}>
              {species ? `Chụp ảnh ${speciesLabel(species)}` : 'Chụp ảnh con vật'}
            </Text>
            <Text style={styles.capturePlaceholderSub}>
              Lấy rõ mặt, đặc điểm nhận dạng — 1 ảnh đủ
            </Text>
          </TouchableOpacity>
        )}

        {/* Nút nhận diện */}
        {imageUri && !result && (
          <TouchableOpacity
            style={[
              styles.btn, styles.btnPrimary, styles.btnFull,
              (isIdentifying || needsSetup) && styles.btnDisabled,
            ]}
            onPress={handleIdentify}
            disabled={isIdentifying || needsSetup}
            activeOpacity={0.85}
          >
            {isIdentifying ? (
              <>
                <ActivityIndicator color={NEUTRAL.white} size="small" />
                <Text style={styles.btnPrimaryText}>Đang nhận diện...</Text>
              </>
            ) : (
              <>
                <Icon name="magnify-scan" size={20} color={NEUTRAL.white} />
                <Text style={styles.btnPrimaryText}>Nhận diện</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Kết quả */}
        {renderResult()}
      </ScrollView>

      {/* Dialog UNCERTAIN */}
      <ReidConfirmDialog
        visible={showConfirm}
        context="animal"
        candidates={candidatesForDialog}
        onSelect={handleConfirmSelect}
        onDismiss={() => setShowConfirm(false)}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const HEADER_BG = '#5d4037'; // coklat untuk animal

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bgSoft },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 16 },

  // ── Preview / Placeholder ──
  previewWrap: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  previewImg: { width: '100%', height: '100%' },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 12,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  previewOverlayText: { color: NEUTRAL.white, fontSize: 13, fontWeight: '600' },

  capturePlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: NEUTRAL.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: NEUTRAL.card,
  },
  capturePlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  capturePlaceholderSub: {
    fontSize: 13,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // ── Bước chuẩn bị (loài + vườn) ──
  setupBox: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 8,
  },
  setupTitle: { fontSize: 15, fontWeight: '700', color: NEUTRAL.text },
  setupLabel: { fontSize: 13, color: NEUTRAL.textSub, marginTop: 4 },
  setupHint: { fontSize: 13, color: NEUTRAL.textMuted, lineHeight: 19, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    backgroundColor: NEUTRAL.bgSoft,
  },
  chipActive: { backgroundColor: HEADER_BG, borderColor: HEADER_BG },
  chipText: { fontSize: 13, color: NEUTRAL.textSub, fontWeight: '600' },
  chipTextActive: { color: NEUTRAL.white },

  // ── Kết quả ──
  resultSection: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 12,
  },
  resultActions: { gap: 10 },
  matchInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchName: { fontSize: 16, fontWeight: '700', color: NEUTRAL.text },
  matchDid: { fontSize: 11, color: NEUTRAL.textMuted },
  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  // ── Hint ──
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff8e1',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f9a825',
  },
  hintText: { flex: 1, fontSize: 13, color: '#7a5c00', lineHeight: 18 },

  // ── Nút ──
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnFull: { width: '100%' },
  btnDisabled: { opacity: 0.55 },
  btnPrimary: { backgroundColor: HEADER_BG },
  btnPrimaryText: { color: NEUTRAL.white, fontSize: 15, fontWeight: '600' },
  btnSecondary: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  btnSecondaryText: { color: COLORS.accent, fontSize: 15, fontWeight: '600' },
  btnInfo: { backgroundColor: COLORS.info },
});

export default AnimalIdentityScreen;
