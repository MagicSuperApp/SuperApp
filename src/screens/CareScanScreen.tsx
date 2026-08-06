/**
 * CareScanScreen — Ghi thuốc/phân bằng cách chụp nhãn bao-bì
 *
 * Props qua navigation.route.params: { targetType: string, targetId: string, treeName?: string, farmId?: string }
 *   targetType: 'tree' | 'fruit' | 'farm'
 *
 * Luồng: chụp ảnh nhãn (launchCamera) → POST /api/care/match → chọn sản-phẩm →
 *        POST /api/care/log → hiện cảnh-báo CÁCH LY (blocked_until) nếu có.
 *
 * Cảnh-báo cách-ly là then-chốt: chặn thu-hoạch/bán khi chưa hết thời-gian an-toàn.
 * Dùng launchCamera — chạy cả iOS lẫn Android, không cần native SDK.
 */

import React, { useState, useCallback } from 'react';
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

import { ORILIFE_BASE } from '../services/orilifeBase';
import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import {
  matchCareLabel,
  logCare,
  type CareProduct,
  type CareLogResponse,
} from '../services/careService';

const BASE_URL: string = ORILIFE_BASE;
const HEADER_BG = '#2F7D6B'; // xanh y-tế — thuốc/chăm-sóc

const CAMERA_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.85,
  maxWidth: 1280,
  maxHeight: 1280,
  saveToPhotos: true,
  includeBase64: false,
};

type CareScanRouteParams = {
  CareScan: { targetType: string; targetId: string; treeName?: string; farmId?: string };
};

const CareScanScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<CareScanRouteParams, 'CareScan'>>();
  const { targetType, targetId, treeName, farmId } = route.params ?? { targetType: 'tree', targetId: '' };

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [logging, setLogging] = useState(false);
  const [candidates, setCandidates] = useState<CareProduct[] | null>(null);
  const [logged, setLogged] = useState<CareLogResponse | null>(null);

  const handleCapture = useCallback(() => {
    setCandidates(null);
    setLogged(null);
    if (!imagePicker?.launchCamera) {
      Alert.alert('Chưa cài camera picker', 'Cần cài react-native-image-picker.');
      return;
    }
    imagePicker.launchCamera(CAMERA_OPTIONS, (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert('Lỗi camera', response.errorMessage ?? 'Không thể mở camera. Kiểm tra quyền trong Cài đặt.');
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) setImageUri(asset.uri);
    });
  }, []);

  const handleMatch = useCallback(async () => {
    if (!imageUri) return;
    setMatching(true);
    setCandidates(null);
    try {
      const res = await matchCareLabel(BASE_URL, imageUri);
      if (res.ok && res.data) {
        setCandidates(res.data.candidates ?? []);
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Không nhận diện được nhãn. Thử chụp rõ hơn.');
      }
    } finally {
      setMatching(false);
    }
  }, [imageUri]);

  const handleLog = useCallback(async (product: CareProduct) => {
    if (!targetId) {
      Alert.alert('Thiếu đối-tượng', 'Không xác định được cây/vườn để ghi.');
      return;
    }
    setLogging(true);
    try {
      const res = await logCare(BASE_URL, {
        targetType,
        targetId,
        productId: product.product_id,
        farmId,
        recognitionMethod: 'label_scan',
        imagePath: imageUri ?? undefined,
      });
      if (res.ok && res.data) {
        setLogged(res.data);
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Ghi nhật-ký thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLogging(false);
    }
  }, [targetType, targetId, farmId, imageUri]);

  const renderLogged = () => {
    if (!logged) return null;
    const blocked = !logged.safe && !!logged.blocked_until;
    return (
      <View style={styles.resultSection}>
        <View style={styles.badgeRow}>
          <Icon name="check-circle" size={22} color={COLORS.success} />
          <Text style={[styles.badgeText, { color: COLORS.success }]}>Đã ghi nhật-ký</Text>
        </View>
        {blocked ? (
          <View style={styles.warnBox}>
            <Icon name="alert-octagon" size={18} color={COLORS.error} />
            <Text style={styles.warnText}>
              Đang trong thời-gian CÁCH LY — chưa được thu-hoạch/bán đến {logged.blocked_until}.
            </Text>
          </View>
        ) : (
          <View style={styles.okBox}>
            <Icon name="shield-check" size={18} color={COLORS.success} />
            <Text style={styles.okText}>An-toàn — không trong thời-gian cách-ly.</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnFull]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Icon name="check" size={18} color={NEUTRAL.white} />
          <Text style={styles.btnPrimaryText}>Xong</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCandidates = () => {
    if (!candidates || logged) return null;
    if (candidates.length === 0) {
      return (
        <View style={styles.resultSection}>
          <Text style={styles.emptyText}>Chưa nhận ra sản-phẩm. Chụp rõ nhãn hơn hoặc thử lại.</Text>
        </View>
      );
    }
    return (
      <View style={styles.resultSection}>
        <Text style={styles.sectionTitle}>Chọn sản-phẩm đã dùng:</Text>
        {candidates.map((p) => (
          <TouchableOpacity
            key={p.product_id}
            style={styles.productRow}
            onPress={() => handleLog(p)}
            disabled={logging}
            activeOpacity={0.8}
          >
            <Icon name="bottle-tonic" size={20} color={HEADER_BG} />
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{p.name ?? p.product_id}</Text>
              {(p.category || p.active_ingredient) && (
                <Text style={styles.productSub} numberOfLines={1}>
                  {[p.category, p.active_ingredient].filter(Boolean).join(' · ')}
                </Text>
              )}
              {p.withdrawal_days != null && (
                <Text style={styles.productSub}>Cách ly: {p.withdrawal_days} ngày</Text>
              )}
            </View>
            {logging ? <ActivityIndicator size="small" color={HEADER_BG} /> : <Icon name="chevron-right" size={20} color={NEUTRAL.textMuted} />}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Icon name="spray-bottle" size={20} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>{treeName ? `Ghi thuốc — ${treeName}` : 'Ghi thuốc / phân'}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {imageUri ? (
          <TouchableOpacity style={styles.previewWrap} onPress={handleCapture} activeOpacity={0.85}>
            <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="cover" />
            <View style={styles.previewOverlay}>
              <Icon name="camera-retake" size={28} color={NEUTRAL.white} />
              <Text style={styles.previewOverlayText}>Chụp lại</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.capturePlaceholder} onPress={handleCapture} activeOpacity={0.8}>
            <Icon name="camera-plus" size={56} color={NEUTRAL.textMuted} />
            <Text style={styles.capturePlaceholderText}>Chụp nhãn bao-bì thuốc/phân</Text>
            <Text style={styles.capturePlaceholderSub}>Lấy rõ tên + hoạt-chất trên bao bì</Text>
          </TouchableOpacity>
        )}

        {imageUri && !candidates && !logged && (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnFull, matching && styles.btnDisabled]}
            onPress={handleMatch}
            disabled={matching}
            activeOpacity={0.85}
          >
            {matching ? (
              <>
                <ActivityIndicator color={NEUTRAL.white} size="small" />
                <Text style={styles.btnPrimaryText}>Đang nhận diện nhãn...</Text>
              </>
            ) : (
              <>
                <Icon name="magnify-scan" size={20} color={NEUTRAL.white} />
                <Text style={styles.btnPrimaryText}>Nhận diện nhãn</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {renderCandidates()}
        {renderLogged()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: HEADER_BG, paddingTop: Platform.OS === 'ios' ? 52 : 38, paddingBottom: 14, paddingHorizontal: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 16 },
  previewWrap: { width: '100%', height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  previewImg: { width: '100%', height: '100%' },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'flex-end',
    padding: 12, flexDirection: 'row', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)',
  },
  previewOverlayText: { color: NEUTRAL.white, fontSize: 13, fontWeight: '600' },
  capturePlaceholder: {
    width: '100%', height: 220, borderRadius: 16, borderWidth: 2, borderColor: NEUTRAL.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: NEUTRAL.card,
  },
  capturePlaceholderText: { fontSize: 16, fontWeight: '600', color: NEUTRAL.text },
  capturePlaceholderSub: { fontSize: 13, color: NEUTRAL.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  resultSection: { backgroundColor: NEUTRAL.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: NEUTRAL.border, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: NEUTRAL.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeText: { fontSize: 16, fontWeight: '700' },
  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: NEUTRAL.border,
  },
  productName: { fontSize: 15, fontWeight: '600', color: NEUTRAL.text },
  productSub: { fontSize: 12, color: NEUTRAL.textMuted },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fdecea',
    padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.error,
  },
  warnText: { flex: 1, fontSize: 13, color: '#8a2c1c', lineHeight: 18, fontWeight: '600' },
  okBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eaf6f0',
    padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.success,
  },
  okText: { flex: 1, fontSize: 13, color: '#1f5c45', lineHeight: 18 },
  emptyText: { fontSize: 14, color: NEUTRAL.textMuted, textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12 },
  btnFull: { width: '100%' },
  btnDisabled: { opacity: 0.55 },
  btnPrimary: { backgroundColor: HEADER_BG },
  btnPrimaryText: { color: NEUTRAL.white, fontSize: 15, fontWeight: '600' },
});

export default CareScanScreen;
