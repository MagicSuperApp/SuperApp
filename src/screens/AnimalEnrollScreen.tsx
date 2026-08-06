/**
 * AnimalEnrollScreen — Đăng ký cá thể vật nuôi mới
 *
 * Nhận params { species, farmId } qua route.
 *
 * Luồng:
 *  1. Người dùng chụp 3–10 ảnh (launchCamera — react-native-image-picker)
 *  2. Hiện đếm ảnh realtime + preview lưới nhỏ
 *  3. Nhập tên cá thể (tuỳ chọn)
 *  4. Bấm "Đăng ký" → gọi enrollAnimal()
 *  5. Xử lý lỗi:
 *     409 duplicate → Alert "Cá thể trùng", nút Huỷ + Đăng ký mới
 *     400 / 422    → Alert thông báo lỗi
 *     lỗi mạng     → Alert retry
 *  6. Thành công → navigate AnimalDetail (hoặc goBack)
 *
 * KHÔNG dùng Redux cho danh sách ảnh (khác tree dùng treeReIDSlice).
 * Ảnh quản lý hoàn toàn bằng local state.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { ORILIFE_BASE } from '../services/orilifeBase';
import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import {
  enrollAnimal,
  type AnimalEnrollResponse,
} from '../services/animalReIDService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL: string =
  ORILIFE_BASE;

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;

// Camera options
const CAMERA_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.85,
  maxWidth: 1280,
  maxHeight: 1280,
  saveToPhotos: true,
  includeBase64: false,
};

// Nhãn tiếng Việt theo loài
const SPECIES_LABELS: Record<string, string> = {
  ga:    'Gà',
  lon:   'Lợn',
  de:    'Dê',
  bo:    'Bò',
  vit:   'Vịt',
  ngong: 'Ngỗng',
  cho:   'Chó',
  meo:   'Mèo',
};

function speciesLabel(s: string): string {
  return SPECIES_LABELS[s.toLowerCase()] ?? s;
}

// ---------------------------------------------------------------------------
// image-picker lazy load (như AnimalIdentityScreen)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteParams = {
  AnimalEnroll: {
    species: string;
    farmId: string;
  };
};

interface CapturedPhoto {
  uri: string;
  fileName?: string;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const AnimalEnrollScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'AnimalEnroll'>>();
  const { species, farmId } = route.params;

  // ── Local state ───────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [name, setName] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<AnimalEnrollResponse | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const canAddMore = photos.length < MAX_PHOTOS && !isEnrolling && !enrollResult;
  const canEnroll = !isEnrolling && !enrollResult && photos.length >= MIN_PHOTOS;

  // ── Chụp ảnh ──────────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    if (!canAddMore) return;

    if (!imagePicker?.launchCamera) {
      Alert.alert(
        'Chưa cài camera picker',
        'Cần cài react-native-image-picker.\nnpm install react-native-image-picker',
      );
      return;
    }

    imagePicker.launchCamera(CAMERA_OPTIONS, (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(
          'Lỗi camera',
          response.errorMessage ?? 'Không thể mở camera. Kiểm tra quyền trong Cài đặt.',
        );
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) {
        setPhotos(prev => [...prev, { uri: asset.uri, fileName: asset.fileName }]);
      }
    });
  }, [canAddMore]);

  // ── Xoá ảnh ───────────────────────────────────────────────────────────────
  const handleRemovePhoto = useCallback((index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── Navigate sau thành công ───────────────────────────────────────────────
  const handleSuccess = useCallback(
    (animalDid: string) => {
      Alert.alert(
        'Đăng ký thành công',
        `Đã đăng ký ${speciesLabel(species)} vào hệ thống.`,
        [
          {
            text: 'Xem hồ sơ',
            onPress: () => navigation.navigate('AnimalDetail', { animalDid }),
          },
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
        { cancelable: false },
      );
    },
    [navigation, species],
  );

  // ── Gọi API đăng ký ───────────────────────────────────────────────────────
  const doEnroll = useCallback(
    async () => {
      setIsEnrolling(true);
      try {
        const imagePaths = photos.map(p => p.uri);
        const res = await enrollAnimal(
          BASE_URL,
          species,
          farmId,
          name.trim(),
          imagePaths,
        );

        if (res.ok && res.data) {
          setEnrollResult(res.data);
          handleSuccess(res.data.animal_did);
          return;
        }

        // ── Xử lý lỗi ───────────────────────────────────────────────────────
        const status = res.error?.http_status ?? 0;
        const detail = res.error?.detail ?? 'Lỗi không xác định';

        if (status === 409) {
          Alert.alert(
            'Cá thể có thể đã tồn tại',
            `${detail}\n\nBạn có muốn đăng ký mới không?`,
            [
              { text: 'Huỷ', style: 'cancel' },
              {
                text: 'Đăng ký mới',
                style: 'destructive',
                onPress: () => doEnroll(),
              },
            ],
          );
          return;
        }

        if (status === 400) {
          Alert.alert('Dữ liệu không hợp lệ', detail);
          return;
        }

        if (status === 422) {
          Alert.alert('Lỗi định dạng', detail);
          return;
        }

        if (status === 0) {
          // Lỗi mạng
          Alert.alert(
            'Mất kết nối',
            detail,
            [
              { text: 'Thử lại', onPress: () => doEnroll() },
              { text: 'Huỷ', style: 'cancel' },
            ],
          );
          return;
        }

        Alert.alert('Lỗi đăng ký', detail);
      } finally {
        setIsEnrolling(false);
      }
    },
    [photos, species, farmId, name, handleSuccess],
  );

  const handleEnroll = useCallback(() => {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert(
        'Chưa đủ ảnh',
        `Cần ít nhất ${MIN_PHOTOS} ảnh. Hiện có ${photos.length} ảnh.\nChụp thêm rồi thử lại.`,
      );
      return;
    }
    doEnroll();
  }, [photos.length, doEnroll]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          disabled={isEnrolling}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Icon name="paw" size={19} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>
            Đăng ký {speciesLabel(species)} mới
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Đếm ảnh */}
        <View style={styles.photoCountCard}>
          <Icon
            name={photos.length >= MIN_PHOTOS ? 'check-circle' : 'camera-plus'}
            size={20}
            color={photos.length >= MIN_PHOTOS ? COLORS.success : COLORS.accent}
          />
          <Text style={[
            styles.photoCountText,
            photos.length >= MIN_PHOTOS && styles.photoCountTextOk,
          ]}>
            {photos.length} / {MAX_PHOTOS} ảnh
            {photos.length < MIN_PHOTOS
              ? ` — cần thêm ${MIN_PHOTOS - photos.length} ảnh`
              : ' — đủ để đăng ký'}
          </Text>
        </View>

        {/* Lưới ảnh */}
        {photos.length > 0 && (
          <View style={styles.photoGrid}>
            {photos.map((photo, idx) => (
              <View key={`${photo.uri}-${idx}`} style={styles.photoTile}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photoTileImg}
                  resizeMode="cover"
                />
                {!isEnrolling && !enrollResult && (
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={() => handleRemovePhoto(idx)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Icon name="close" size={14} color={NEUTRAL.white} />
                  </TouchableOpacity>
                )}
                <Text style={styles.photoTileIndex}>#{idx + 1}</Text>
              </View>
            ))}

            {/* Ô chụp thêm */}
            {canAddMore && (
              <TouchableOpacity
                style={styles.photoAddTile}
                onPress={handleCapture}
                activeOpacity={0.7}
              >
                <Icon name="camera-plus" size={26} color={COLORS.accent} />
                <Text style={styles.photoAddText}>Thêm ảnh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Placeholder khi chưa có ảnh nào */}
        {photos.length === 0 && (
          <TouchableOpacity
            style={styles.capturePlaceholder}
            onPress={handleCapture}
            activeOpacity={0.8}
          >
            <Icon name="camera-plus" size={52} color={NEUTRAL.textMuted} />
            <Text style={styles.capturePlaceholderText}>
              Chụp ảnh {speciesLabel(species)}
            </Text>
            <Text style={styles.capturePlaceholderSub}>
              Cần {MIN_PHOTOS}–{MAX_PHOTOS} góc đa dạng (mặt, thân, đặc điểm)
            </Text>
          </TouchableOpacity>
        )}

        {/* Nút chụp thêm khi chưa đủ ảnh */}
        {photos.length > 0 && canAddMore && photos.length < MIN_PHOTOS && (
          <TouchableOpacity
            style={[styles.btnOutline, styles.btnFull]}
            onPress={handleCapture}
            activeOpacity={0.8}
          >
            <Icon name="camera-plus" size={18} color={COLORS.accent} />
            <Text style={styles.btnOutlineText}>Chụp thêm ảnh</Text>
          </TouchableOpacity>
        )}

        {/* Tên cá thể (tuỳ chọn) */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Tên cá thể (tuỳ chọn)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={`Ví dụ: ${speciesLabel(species)} số 3, cái hoa...`}
            placeholderTextColor={NEUTRAL.textMuted}
            returnKeyType="done"
            maxLength={60}
            editable={!isEnrolling && !enrollResult}
          />
          <Text style={styles.charCount}>{name.length}/60</Text>
        </View>

        {/* Thông tin loài + trang trại */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon name="paw" size={15} color={NEUTRAL.textSub} />
            <Text style={styles.infoText}>Loài: {speciesLabel(species)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="barn" size={15} color={NEUTRAL.textSub} />
            <Text style={styles.infoText}>Trang trại: {farmId}</Text>
          </View>
        </View>

        {/* Kết quả sau đăng ký thành công */}
        {enrollResult && (
          <View style={styles.successCard}>
            <Icon name="check-circle" size={24} color={COLORS.success} />
            <View style={styles.successInfo}>
              <Text style={styles.successTitle}>Đã đăng ký thành công</Text>
              <Text style={styles.successDid} numberOfLines={2}>
                {enrollResult.animal_did}
              </Text>
              {enrollResult.n_images_added != null && (
                <Text style={styles.successImages}>
                  {enrollResult.n_images_added} ảnh đã lưu
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnCancel]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          disabled={isEnrolling}
        >
          <Text style={styles.footerBtnCancelText}>Huỷ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.footerBtn,
            styles.footerBtnSubmit,
            !canEnroll && styles.footerBtnDisabled,
          ]}
          onPress={handleEnroll}
          disabled={!canEnroll}
          activeOpacity={0.8}
        >
          {isEnrolling ? (
            <ActivityIndicator color={NEUTRAL.white} />
          ) : (
            <>
              <Icon name="check" size={20} color={NEUTRAL.white} />
              <Text style={styles.footerBtnSubmitText}>Đăng ký</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#5d4037'; // nâu — đồng bộ AnimalIdentityScreen

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  headerRight: { width: 38 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },

  // ── Đếm ảnh ──
  photoCountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderRadius: 12,
    padding: 12,
  },
  photoCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: NEUTRAL.textSub,
    flex: 1,
  },
  photoCountTextOk: { color: COLORS.success },

  // ── Lưới ảnh ──
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoTile: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  photoTileImg: { width: '100%', height: '100%' },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTileIndex: {
    position: 'absolute',
    bottom: 3,
    left: 5,
    fontSize: 10,
    color: NEUTRAL.white,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  photoAddTile: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: NEUTRAL.card,
  },
  photoAddText: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '600',
  },

  // ── Placeholder ──
  capturePlaceholder: {
    width: '100%',
    minHeight: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: NEUTRAL.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: NEUTRAL.card,
    paddingVertical: 32,
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
    lineHeight: 18,
  },

  // ── Nút outline ──
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: NEUTRAL.card,
  },
  btnOutlineText: {
    fontSize: 15,
    color: COLORS.accent,
    fontWeight: '600',
  },
  btnFull: { width: '100%' },

  // ── Input tên ──
  inputSection: { gap: 6 },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  input: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: NEUTRAL.text,
  },
  charCount: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
    textAlign: 'right',
  },

  // ── Info card ──
  infoCard: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, color: NEUTRAL.textSub, flex: 1 },

  // ── Kết quả thành công ──
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  successInfo: { flex: 1 },
  successTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.success,
  },
  successDid: {
    fontSize: 11,
    color: '#388e3c',
    marginTop: 3,
  },
  successImages: {
    fontSize: 12,
    color: '#388e3c',
    marginTop: 1,
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: NEUTRAL.card,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.border,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 12,
  },
  footerBtnCancel: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1.5,
    borderColor: NEUTRAL.border,
  },
  footerBtnCancelText: {
    fontSize: 15,
    color: NEUTRAL.textSub,
    fontWeight: '600',
  },
  footerBtnSubmit: { backgroundColor: HEADER_BG },
  footerBtnSubmitText: {
    color: NEUTRAL.white,
    fontSize: 15,
    fontWeight: '600',
  },
  footerBtnDisabled: { opacity: 0.45 },
});

export default AnimalEnrollScreen;
