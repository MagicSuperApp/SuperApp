/**
 * TreeEnrollScreen — Đăng ký cây mới
 *
 * Nhận captures từ redux store (treeReIDSlice) — KHÔNG qua navigation params.
 *
 * Xử lý đầy đủ error cases:
 *  409 duplicate (type='duplicate', code='duplicate_tree')
 *    → Alert 3 nút: Huỷ / Gộp vào cây cũ (verify_add) / Tạo cây mới (force=true)
 *  409 heterogeneous (code='heterogeneous')
 *    → Alert "Nhiều cây trong ảnh" + nút Chụp lại
 *  409 flat (code='flat')
 *    → Alert "Ảnh phẳng/lặp, cần góc đa dạng hơn" + nút Chụp lại
 *  400 need_gps
 *    → Alert "Cần bật GPS"
 *  400 other / 422
 *    → Alert thông báo lỗi chung
 *
 * Sau enroll thành công:
 *    navigate TreeDetail nếu route có tham số targetTreeId,
 *    hoặc goBack().
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import {
  enrollTree,
  verifyAddTree,
  type EnrollResponse,
} from '../services/treeReIDService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  selectCaptures,
  selectGPS,
  clearAll,
} from '../store/treeReIDSlice';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { ORILIFE_API_BASE_URL } from '@env';
const BASE_URL: string =
  (ORILIFE_API_BASE_URL as string | undefined) ?? 'https://test.orilife.io';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_CAPTURES = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteParams = {
  TreeEnroll: {
    /** ID cây đích nếu cần navigate thẳng sau enroll */
    targetTreeId?: string;
    /**
     * Android: danh sách URI ảnh do TreeIdentityScreen truyền qua params.
     * iOS dùng Redux captures; Android dispatch addCapture không hoạt động qua
     * luồng native camera nên cần truyền trực tiếp.
     */
    androidImagePaths?: string[];
  };
};

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Phân loại 409 theo error.code hoặc detail text.
 * Backend trả: { detail: '...', code: 'duplicate_tree' | 'heterogeneous' | 'flat' }
 */
function classify409(detail: string): 'duplicate' | 'heterogeneous' | 'flat' | 'unknown' {
  const d = detail.toLowerCase();
  if (d.includes('heterogeneous') || d.includes('nhiều cây') || d.includes('multiple trees')) {
    return 'heterogeneous';
  }
  if (d.includes('flat') || d.includes('phẳng') || d.includes('lặp')) {
    return 'flat';
  }
  if (d.includes('duplicate') || d.includes('trùng') || d.includes('already exists')) {
    return 'duplicate';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TreeEnrollScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'TreeEnroll'>>();

  const dispatch = useAppDispatch();
  const captures = useAppSelector(selectCaptures);
  const gps = useAppSelector(selectGPS);

  // ── Local state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<EnrollResponse | null>(null);

  // Duplicate state — lưu tạm tree_id cây trùng để gộp
  const [duplicateTreeId, setDuplicateTreeId] = useState<string | null>(null);

  // ── Derived values ────────────────────────────────────────────────────────
  const round1Captures = captures.filter(c => c.round === 1);
  const round2Captures = captures.filter(c => c.round === 2);

  // Android không dispatch vào Redux captures — lấy paths từ route params.
  // iOS dùng Redux captures như bình thường.
  const androidImagePaths = route.params?.androidImagePaths;
  const imagePaths =
    Platform.OS === 'android' && androidImagePaths && androidImagePaths.length > 0
      ? androidImagePaths
      : captures.map(c => `file://${c.fileURL}`);

  // Số ảnh hiệu dụng để kiểm tra MIN_CAPTURES
  const effectiveCaptureCount =
    Platform.OS === 'android' && androidImagePaths && androidImagePaths.length > 0
      ? androidImagePaths.length
      : captures.length;

  const canEnroll = !isEnrolling && effectiveCaptureCount >= MIN_CAPTURES && name.trim().length > 0;

  // ── Navigate sau thành công ───────────────────────────────────────────────
  const handleSuccess = useCallback(
    (treeId: string, code: string) => {
      Alert.alert(
        'Đăng ký thành công',
        `Mã cây: ${code}`,
        [
          {
            text: 'Xem chi tiết',
            onPress: () => {
              dispatch(clearAll());
              navigation.navigate('TreeDetail', { treeId });
            },
          },
          {
            text: 'OK',
            onPress: () => {
              dispatch(clearAll());
              navigation.goBack();
            },
          },
        ],
        { cancelable: false },
      );
    },
    [dispatch, navigation],
  );

  // ── Gộp vào cây cũ (verify_add) ──────────────────────────────────────────
  const handleMergeToExisting = useCallback(
    async (treeId: string) => {
      setIsEnrolling(true);
      try {
        const res = await verifyAddTree(BASE_URL, treeId, imagePaths);

        if (res.ok && res.data) {
          Alert.alert(
            'Đã gộp thành công',
            `Đã thêm ${res.data.n_added ?? 0} góc nhìn vào cây đã có.`,
            [
              {
                text: 'OK',
                onPress: () => {
                  dispatch(clearAll());
                  navigation.navigate('TreeDetail', { treeId });
                },
              },
            ],
          );
        } else {
          Alert.alert('Lỗi gộp cây', res.error?.detail ?? 'Không thể gộp. Thử lại.');
        }
      } finally {
        setIsEnrolling(false);
        setDuplicateTreeId(null);
      }
    },
    [imagePaths, gps, dispatch, navigation],
  );

  // ── Force enroll (tạo cây mới bất kể trùng) ──────────────────────────────
  const handleForceEnroll = useCallback(async () => {
    if (!name.trim()) return;
    setIsEnrolling(true);
    try {
      const res = await enrollTree(BASE_URL, name.trim(), imagePaths, {
        lat: gps?.lat,
        lon: gps?.lng,
        acc: gps?.accuracy,
        force: true,
      });

      if (res.ok && res.data) {
        setEnrollResult(res.data);
        handleSuccess(res.data.tree_id, res.data.provenance?.code ?? res.data.tree_id);
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Tạo cây mới thất bại.');
      }
    } finally {
      setIsEnrolling(false);
    }
  }, [name, imagePaths, gps, handleSuccess]);

  // ── Main enroll ───────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu tên', 'Vui lòng nhập tên cây trước khi đăng ký.');
      return;
    }

    if (effectiveCaptureCount < MIN_CAPTURES) {
      Alert.alert(
        'Chưa đủ ảnh',
        `Cần ít nhất ${MIN_CAPTURES} góc chụp. Hiện có ${effectiveCaptureCount} góc.\nQuay lại và chụp thêm.`,
      );
      return;
    }

    setIsEnrolling(true);
    try {
      const res = await enrollTree(BASE_URL, name.trim(), imagePaths, {
        lat: gps?.lat,
        lon: gps?.lng,
        acc: gps?.accuracy,
      });

      if (res.ok && res.data) {
        setEnrollResult(res.data);
        handleSuccess(res.data.tree_id, res.data.provenance?.code ?? res.data.tree_id);
        return;
      }

      // ── Xử lý lỗi ─────────────────────────────────────────────────────
      const status = res.error?.http_status;
      const detail = res.error?.detail ?? 'Lỗi không xác định';

      if (status === 409) {
        const kind = classify409(detail);

        if (kind === 'duplicate') {
          // Ưu tiên existing_tree_id từ body 409; fallback: trích từ detail text (capture group [1])
          const fromBody = res.error?.existing_tree_id ?? null;
          const regexMatch = detail.match(/tree[-_]?([0-9a-f-]{8,})/i);
          const foundId = fromBody ?? (regexMatch ? regexMatch[1] : null);
          setDuplicateTreeId(foundId);

          Alert.alert(
            'Trùng cây đã có',
            `${detail}\n\nBạn muốn làm gì?`,
            [
              { text: 'Huỷ', style: 'cancel' },
              {
                text: 'Gộp vào cây cũ',
                onPress: () => {
                  if (foundId) {
                    handleMergeToExisting(foundId);
                  } else {
                    Alert.alert('Không xác định được cây trùng', 'Vui lòng chụp lại và thử nhận diện trước.');
                  }
                },
              },
              {
                text: 'Tạo cây mới',
                style: 'destructive',
                onPress: handleForceEnroll,
              },
            ],
          );
          return;
        }

        if (kind === 'heterogeneous') {
          Alert.alert(
            'Nhiều cây trong ảnh',
            'Hệ thống phát hiện ảnh chứa nhiều cây khác nhau. '
              + 'Vui lòng chỉ chụp một cây duy nhất trong khung hình.',
            [
              { text: 'Huỷ', style: 'cancel' },
              { text: 'Chụp lại', onPress: () => navigation.goBack() },
            ],
          );
          return;
        }

        if (kind === 'flat') {
          Alert.alert(
            'Ảnh phẳng hoặc lặp góc',
            'Các ảnh quá giống nhau hoặc chỉ nhìn từ một góc. '
              + 'Hãy đi vòng quanh cây và chụp từ nhiều hướng đa dạng hơn.',
            [
              { text: 'Huỷ', style: 'cancel' },
              { text: 'Chụp lại', onPress: () => navigation.goBack() },
            ],
          );
          return;
        }

        // 409 không phân loại được
        Alert.alert('Xung đột', detail);
        return;
      }

      if (status === 400) {
        if (detail.toLowerCase().includes('gps') || detail.toLowerCase().includes('location')) {
          Alert.alert(
            'Cần bật GPS',
            'Đăng ký cây yêu cầu thông tin vị trí. Vui lòng bật GPS và thử lại.',
            [
              { text: 'Thử lại', onPress: handleEnroll },
              { text: 'Huỷ', style: 'cancel' },
            ],
          );
          return;
        }
        Alert.alert('Lỗi', detail);
        return;
      }

      Alert.alert('Lỗi đăng ký', detail);
    } finally {
      setIsEnrolling(false);
    }
  };

  // ── Render capture thumbnails ─────────────────────────────────────────────
  const renderCaptureGrid = (
    list: typeof captures,
    label: string,
  ) => {
    if (list.length === 0) return null;
    return (
      <View style={styles.captureSection}>
        <Text style={styles.captureSectionLabel}>
          {label} — {list.length} góc
        </Text>
        <View style={styles.captureGrid}>
          {list.map((cap, idx) => (
            <View key={cap.id} style={styles.captureTile}>
              <Icon name="image-outline" size={22} color={NEUTRAL.textMuted} />
              <Text style={styles.captureTileIndex}>#{idx + 1}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
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
          <Icon name="tree" size={19} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Đăng ký cây mới</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* GPS info */}
        {gps ? (
          <View style={styles.gpsCard}>
            <Icon name="map-marker-check" size={18} color="#1b5e20" />
            <Text style={styles.gpsText}>
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              {gps.accuracy <= 15 ? '' : ` (±${Math.round(gps.accuracy)}m)`}
            </Text>
          </View>
        ) : (
          <View style={[styles.gpsCard, styles.gpsCardWarn]}>
            <Icon name="map-marker-off" size={18} color={NEUTRAL.warning} />
            <Text style={[styles.gpsText, { color: NEUTRAL.warning }]}>
              GPS chưa sẵn sàng — tọa độ sẽ không được lưu
            </Text>
          </View>
        )}

        {/* Tên cây */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Tên cây *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ví dụ: Mít số 3, Xoài đầu vườn..."
            placeholderTextColor={NEUTRAL.textMuted}
            returnKeyType="done"
            maxLength={80}
            editable={!isEnrolling && !enrollResult}
          />
          <Text style={styles.charCount}>{name.length}/80</Text>
        </View>

        {/* Captures */}
        <View style={styles.capturesSection}>
          <Text style={styles.sectionTitle}>
            Ảnh đã chụp ({effectiveCaptureCount} góc)
          </Text>

          {effectiveCaptureCount === 0 ? (
            <View style={styles.warningBox}>
              <Icon name="alert-circle-outline" size={18} color={NEUTRAL.warning} />
              <Text style={styles.warningText}>
                Chưa có ảnh nào. Quay lại màn hình nhận diện để chụp (cần ít nhất {MIN_CAPTURES} góc).
              </Text>
            </View>
          ) : (
            <>
              {renderCaptureGrid(round1Captures, 'Lượt 1 — Thân cây')}
              {round2Captures.length > 0 &&
                renderCaptureGrid(round2Captures, 'Lượt 2 — Gốc/vỏ')}

              {effectiveCaptureCount < MIN_CAPTURES && (
                <View style={styles.warningBox}>
                  <Icon name="alert-circle-outline" size={18} color={NEUTRAL.warning} />
                  <Text style={styles.warningText}>
                    Cần thêm {MIN_CAPTURES - effectiveCaptureCount} góc nữa để đăng ký.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Kết quả sau khi đăng ký thành công */}
        {enrollResult && (
          <View style={styles.successCard}>
            <Icon name="check-circle" size={24} color={NEUTRAL.success} />
            <View style={styles.successInfo}>
              <Text style={styles.successTitle}>Đã đăng ký thành công</Text>
              <Text style={styles.successCode}>
                Mã: {enrollResult.provenance?.code ?? enrollResult.tree_id}
              </Text>
              <Text style={styles.successViews}>
                {enrollResult.n_views_added ?? 0} góc đã lưu
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
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

const HEADER_BG = '#1b5e20';

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

  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    padding: 10,
    borderRadius: 10,
  },
  gpsCardWarn: { backgroundColor: '#fff8e1' },
  gpsText: { fontSize: 13, color: '#1b5e20', flex: 1 },

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

  capturesSection: { gap: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  captureSection: { gap: 6 },
  captureSectionLabel: {
    fontSize: 12,
    color: NEUTRAL.textSub,
    fontWeight: '500',
  },
  captureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  captureTile: {
    width: 66,
    height: 66,
    backgroundColor: NEUTRAL.bgSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTileIndex: {
    fontSize: 10,
    color: NEUTRAL.textMuted,
    marginTop: 3,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff8e1',
    borderRadius: 10,
    padding: 12,
  },
  warningText: {
    fontSize: 13,
    color: NEUTRAL.warning,
    flex: 1,
    lineHeight: 18,
  },

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
    color: NEUTRAL.success,
  },
  successCode: { fontSize: 13, color: '#388e3c', marginTop: 2 },
  successViews: { fontSize: 12, color: '#388e3c', marginTop: 1 },

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

export default TreeEnrollScreen;
