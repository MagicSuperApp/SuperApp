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
  getWithdrawalStatus,
  safeStateOf,
  type CareProduct,
  type CareLogResponse,
  type CareWithdrawalResponse,
} from '../services/careService';
import { withPhotoSave } from '../services/mediaSavePermission';
import { showError } from '../utils/alert';

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
  // Cờ an toàn KHÔNG nằm trong thân của `/api/care/log` — phải hỏi riêng
  // `/api/care/withdrawal`. `null` = chưa hỏi xong hoặc hỏi hỏng; hai ca đó đều
  // KHÔNG được hiện "an toàn" (xem `renderLogged`).
  const [wd, setWd] = useState<CareWithdrawalResponse | null>(null);

  const handleCapture = useCallback(async () => {
    setCandidates(null);
    setLogged(null);
    setWd(null);
    if (!imagePicker?.launchCamera) {
      showError('Chưa mở được máy ảnh', 'Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.');
      return;
    }
    imagePicker.launchCamera(await withPhotoSave(CAMERA_OPTIONS), (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        showError('Lỗi camera', response.errorMessage ?? 'Không thể mở camera. Kiểm tra quyền trong Cài đặt.');
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
        showError('Lỗi', res.error?.detail ?? 'Không nhận diện được nhãn. Thử chụp rõ hơn.');
      }
    } finally {
      setMatching(false);
    }
  }, [imageUri]);

  const handleLog = useCallback(async (product: CareProduct) => {
    // `'default'` KHÔNG phải mã vườn — nó là chuỗi cổng xoè tự điền khi người dùng
    // vào thẳng "Quét nhãn thuốc" mà chưa qua một vườn nào
    // (`src/navigation/resolveGateItems.ts:68`). Bản trước chỉ chặn `targetId` RỖNG,
    // mà `'default'` có nội dung nên lọt, rồi `logCare` POST thật lên máy chủ với
    // `target_id=default`. Nhật ký cách ly ghi dưới một mã không thuộc về ai: không
    // màn nào đọc lại được (mọi màn đọc theo `farm.id`/`tree.id` thật), tức là ghi
    // xong biến mất — cùng đúng một lớp lỗi với việc đồng áng ghi nhầm chỗ.
    // Cách ly là thứ chặn thu hoạch và chặn bán; ghi hụt ở đây đắt hơn nhiều so với
    // việc bắt người dùng chọn vườn trước.
    if (!targetId || targetId === 'default') {
      showError('Chưa chọn cây hoặc vườn',
        'Nhật ký thuốc phải gắn vào một cây hoặc một vườn cụ thể thì sau này mới tra '
        + 'lại được. Anh/chị mở đúng cây (hoặc vườn) rồi bấm "Quét nhãn thuốc" từ đó.');
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
        // Ghi xong mới hỏi được trạng thái cách ly, và phải hỏi ở cửa KHÁC: máy chủ
        // gộp MỌI lần ghi của đối tượng rồi lấy mốc xa nhất. `withdrawal_until` của
        // riêng lần ghi này không trả lời được câu "cây này bán được chưa" — một lần
        // ghi trước đó có thể còn xa hơn.
        const w = await getWithdrawalStatus(BASE_URL, targetType, targetId);
        setWd(w.ok && w.data ? w.data : null);
      } else {
        showError('Lỗi', res.error?.detail ?? 'Ghi nhật-ký thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLogging(false);
    }
  }, [targetType, targetId, farmId, imageUri]);

  const renderLogged = () => {
    if (!logged) return null;
    // `safe` có BA giá-trị. `null`/vắng-mặt = CHƯA XÁC ĐỊNH, KHÔNG phải an-toàn.
    // Bản cũ đọc `logged.safe` — mà `/api/care/log` KHÔNG trả trường đó
    // (`care_router.py:273-274`), nên mọi lượt đều rơi vào `'unknown'` và nhánh
    // `blocked` chưa từng chạy một lần nào. Nay đọc từ `/api/care/withdrawal`.
    // `wd === null` (hỏi hỏng/mất mạng) cũng vào `'unknown'`: khi không biết thì
    // nói là không biết, đừng nói an toàn.
    const safeState = safeStateOf(wd?.safe);
    // Trứng/sữa có mốc cách ly RIÊNG và có thể còn hạn trong khi thịt đã qua. Máy chủ
    // chỉ gửi khối này khi còn hạn (`care_router.py:315-318`), nên có mặt = còn cấm.
    const eggmilkBlocked = wd?.eggmilk != null;
    return (
      <View style={styles.resultSection}>
        <View style={styles.badgeRow}>
          <Icon name="check-circle" size={22} color={COLORS.success} />
          <Text style={[styles.badgeText, { color: COLORS.success }]}>Đã ghi nhật-ký</Text>
        </View>
        {safeState === 'blocked' ? (
          <View style={styles.warnBox}>
            <Icon name="alert-octagon" size={18} color={COLORS.error} />
            <Text style={styles.warnText}>
              Đang trong thời-gian CÁCH LY — chưa được thu-hoạch/bán
              {wd?.blocked_until ? ` đến ${wd.blocked_until}` : ''}
              {wd?.days_left != null ? ` (còn ${wd.days_left} ngày)` : ''}
              {wd?.by_product ? ` — do ${wd.by_product}` : ''}.
            </Text>
          </View>
        ) : safeState === 'unknown' ? (
          <View style={styles.unknownBox}>
            <Icon name="help-circle" size={18} color={COLORS.warning} />
            <Text style={styles.unknownText}>
              CHƯA khẳng-định được an-toàn — hệ chưa tra được thời-gian cách-ly của thuốc đã dùng.
              Xin xem nhãn thuốc trước khi thu-hoạch/bán.
            </Text>
          </View>
        ) : (
          <View style={styles.okBox}>
            <Icon name="shield-check" size={18} color={COLORS.success} />
            <Text style={styles.okText}>An-toàn — không trong thời-gian cách-ly.</Text>
          </View>
        )}
        {/* Cấm riêng trứng/sữa: hiện KỂ CẢ khi khối trên đã báo an-toàn, vì mốc thịt
            qua trước mốc trứng/sữa. Bỏ khối này là báo an toàn sai đúng khoảng chênh. */}
        {eggmilkBlocked && (
          <View style={styles.warnBox}>
            <Icon name="alert-octagon" size={18} color={COLORS.error} />
            <Text style={styles.warnText}>
              Riêng TRỨNG/SỮA còn trong thời-gian cách-ly — chưa được thu/bán
              {wd?.eggmilk?.blocked_until ? ` đến ${wd.eggmilk.blocked_until}` : ''}
              {wd?.eggmilk?.days_left != null ? ` (còn ${wd.eggmilk.days_left} ngày)` : ''}.
            </Text>
          </View>
        )}
        {!!wd?.advice?.length && wd.advice.map((a, i) => (
          <Text key={`advice-${i}`} style={styles.unknownText}>{a}</Text>
        ))}
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
              <Text style={styles.productName}>{p.trade_name ?? p.product_id}</Text>
              {(p.category || p.active_ingredients) && (
                <Text style={styles.productSub} numberOfLines={1}>
                  {[p.category, p.active_ingredients].filter(Boolean).join(' · ')}
                </Text>
              )}
              {p.withdrawal_period_days != null && (
                <Text style={styles.productSub}>
                  Cách ly: {p.withdrawal_period_days} ngày
                  {/* Máy chủ tự khai độ tin của con số này. `low`/`medium` là ƯỚC
                      TÍNH — in số trần mà giấu chữ "ước tính" là để nông dân tin
                      chắc hơn mức hệ thật sự biết. (`care_router.py:181`) */}
                  {(p.phi_confidence === 'low' || p.phi_confidence === 'medium') ? ' (ước tính)' : ''}
                </Text>
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
  unknownBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fdf5e6',
    padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  unknownText: { flex: 1, fontSize: 13, color: '#6b4a12', lineHeight: 18, fontWeight: '600' },
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
