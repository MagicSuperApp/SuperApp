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
import ReidConfirmDialog from '../components/reid/ReidConfirmDialog';
import {
  identifyAnimal,
  type AnimalIdentifyResponse,
  type AnimalCandidate,
} from '../services/animalReIDService';
import { withPhotoSave } from '../services/mediaSavePermission';

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

type AnimalIdentityRouteParams = {
  AnimalIdentity: {
    species: string;
    farmId: string;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const AnimalIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AnimalIdentityRouteParams, 'AnimalIdentity'>>();

  const species = route.params?.species ?? '';
  const farmId = route.params?.farmId ?? '';

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [result, setResult] = useState<AnimalIdentifyResponse | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Guard: params có thể thiếu khi deeplink hoặc caller lỗi — goBack sau mount
  useEffect(() => {
    if (!route.params?.species || !route.params?.farmId) {
      navigation.goBack();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Chụp ảnh ──────────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    // Xoá kết quả cũ khi chụp lại
    setResult(null);

    if (!imagePicker?.launchCamera) {
      // Fallback: react-native-image-picker chưa cài
      // npm install react-native-image-picker && npx pod-install
      Alert.alert(
        'Chưa mở được máy ảnh',
        'Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.',
      );
      return;
    }

    imagePicker.launchCamera(await withPhotoSave(CAMERA_OPTIONS), (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(
          'Lỗi camera',
          response.errorMessage ?? 'Không thể mở camera. Kiểm tra quyền trong Cài đặt.',
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
    if (!imageUri) return;
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
        Alert.alert('Lỗi', res.error?.detail ?? 'Nhận diện thất bại. Vui lòng thử lại.');
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

  // ── Adapter: AnimalCandidate → TreeCandidate shape cho ReidConfirmDialog ──
  const candidatesForDialog = (result?.candidates ?? []).map(c => ({
    tree_id: c.animal_did,
    name: c.name ?? null,
    code: c.species ? speciesLabel(c.species) : null,
    has3d: false,
    anchor: null,
    near_prev: false,
    n_views: c.n_views,
  }));

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
            Nhận diện {speciesLabel(species)}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
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
              Chụp ảnh {speciesLabel(species)}
            </Text>
            <Text style={styles.capturePlaceholderSub}>
              Lấy rõ mặt, đặc điểm nhận dạng — 1 ảnh đủ
            </Text>
          </TouchableOpacity>
        )}

        {/* Nút nhận diện */}
        {imageUri && !result && (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnFull, isIdentifying && styles.btnDisabled]}
            onPress={handleIdentify}
            disabled={isIdentifying}
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
        candidates={candidatesForDialog as any}
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
