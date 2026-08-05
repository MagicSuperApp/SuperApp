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

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Modal,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { NEUTRAL } from '../shared/theme';
import {
  enrollTree,
  verifyAddTree,
  toCaptureOrientations,
  platformHeadingRef,
  enrollWarningMessages,
  type EnrollResponse,
} from '../services/treeReIDService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { loadFarms } from '../modules/trace/store/farmSlice';
import {
  selectCaptures,
  selectGPS,
  clearAll,
  restoreCaptureSession,
  setGPS,
} from '../store/treeReIDSlice';
import { appendTreeImages } from '../services/treeImageStore';
import {
  saveTreeCaptureDraft,
  clearTreeCaptureDraft,
  restoreTreeCaptureDraft,
  draftHasContent,
} from '../services/treeDraftStore';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { ORILIFE_BASE } from '../services/orilifeBase';
const BASE_URL: string =
  ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_CAPTURES = 4;

const GRID_GAP = 8;
const GRID_COLS = 3;
// scrollContent padding 16*2 = 32; (GRID_COLS - 1) khoảng cách giữa các ô
const TILE_SIZE =
  (Dimensions.get('window').width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/** Đổi độ (0–360) sang hướng la bàn tiếng Việt: B/ĐB/Đ/ĐN/N/TN/T/TB. */
function headingToCompass(deg: number): string {
  const dirs = ['B', 'ĐB', 'Đ', 'ĐN', 'N', 'TN', 'T', 'TB'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

/** timestamp (ms) → HH:MM. */
function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Ảnh chuẩn-hoá cho lưới hiển thị (gộp cả iOS Redux captures lẫn Android paths).
type GridPhoto = {
  key: string;
  uri: string;
  heading?: number;
  pitch?: number;
  roll?: number;
  round?: number;
  capturedAt?: number;
};

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
    /**
     * Vườn hiện-hành — gắn cây enroll vào vườn này (form farm_id).
     * Thiếu farmId → cây không thuộc vườn nào, bị /api/trees?farm_id lọc bỏ.
     */
    farmId?: string;
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

  // Ảnh đang xem chi tiết (modal)
  const [selectedPhoto, setSelectedPhoto] = useState<GridPhoto | null>(null);

  // ── H-17: khôi phục bản nháp sau khi app bị ngắt ─────────────────────────
  // Android khôi phục lấy URI từ bản nháp (route params đã mất khi app khởi động
  // lại). iOS khôi phục qua Redux (restoreCaptureSession).
  const [restoredAndroidPaths, setRestoredAndroidPaths] = useState<string[] | undefined>();
  const didCheckDraftRef = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────────

  // Bộ chọn vườn — cây PHẢI thuộc một vườn mới hiện trong trang trại. Mặc định vườn
  // mở từ ngữ-cảnh (route.farmId); không có thì cho chọn vườn đã có / tạo mới.
  // KHÔNG BAO GIỜ đăng ký cây với farm_id rỗng/'default' — cây mồ côi bị
  // /api/trees?farm_id lọc bỏ, hỏng dữ liệu vườn. Đây là ràng buộc CỨNG:
  //  - vào từ Home ("Quét cây") không kèm farmId → tự chọn nếu chỉ có 1 vườn,
  //    bắt chọn nếu nhiều vườn, dẫn tạo vườn nếu chưa có vườn nào.
  const farms = useAppSelector((s: RootState) => s.farm.farms);
  const farmsLoading = useAppSelector((s: RootState) => s.farm.isLoading);
  const currentUser = useAppSelector((s: RootState) => s.user.currentUser);
  // Namespace nháp theo người dùng hiện tại (chống rò xuyên user trên tablet chung).
  const draftOwner = currentUser?.did ?? currentUser?.id ?? '';
  const [selectedFarmId, setSelectedFarmId] = useState<string | undefined>(
    route.params?.farmId,
  );
  const farmId = selectedFarmId;
  // farmId chỉ truthy là CHƯA đủ: nháp khôi phục có thể set lại farmId của vườn ĐÃ XOÁ
  // → cây mồ côi (không hiện trong trang trại nào). Chỉ coi hợp lệ khi vườn còn tồn tại.
  const farmValid = !!farmId && farms.some(f => f.id === farmId);
  useEffect(() => {
    if (currentUser?.id && farms.length === 0) dispatch(loadFarms(currentUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);
  // Đã tải danh sách vườn nhưng farmId đang chọn KHÔNG thuộc danh sách (vườn bị xoá,
  // hoặc nháp cũ trỏ vườn không còn) → bỏ chọn để UI buộc chọn lại, khỏi gửi id chết.
  useEffect(() => {
    if (selectedFarmId && farms.length > 0 && !farms.some(f => f.id === selectedFarmId)) {
      setSelectedFarmId(undefined);
    }
  }, [farms, selectedFarmId]);

  // Đúng 1 vườn → tự chọn, không thêm ma sát. Nhiều vườn → để user chọn (không tự
  // đoán). Chỉ tự chọn khi chưa có lựa chọn (giữ ngữ-cảnh route.farmId nếu có).
  useEffect(() => {
    if (!selectedFarmId && farms.length === 1) {
      setSelectedFarmId(farms[0].id);
    }
  }, [farms, selectedFarmId]);

  // Trạng thái vườn để dựng thông báo: đang nạp vs thật sự chưa có vườn nào.
  const noFarms = !farmsLoading && farms.length === 0;

  // Ref soi captures / paths MỚI NHẤT — chống đua khôi-phục-vs-phiên-mới (hộp thoại
  // mở lâu, người dùng đã chụp mới trong lúc đó thì KHÔNG ghi đè bằng ảnh nháp).
  const capturesRef = useRef(captures);
  capturesRef.current = captures;
  const restoredAndroidRef = useRef(restoredAndroidPaths);
  restoredAndroidRef.current = restoredAndroidPaths;

  // ── H-17: hỏi khôi phục bản nháp chụp dở khi mở màn ──────────────────────
  // Chỉ hỏi khi màn mở KHÔNG có ảnh nào (app bị ngắt giữa chừng buổi trước). Vào màn
  // với ảnh sẵn (luồng bình thường) thì bản nháp sẽ được GHI ĐÈ bởi effect lưu — không hỏi.
  useEffect(() => {
    if (didCheckDraftRef.current) return;
    didCheckDraftRef.current = true;

    const hasLive =
      (route.params?.androidImagePaths?.length ?? 0) > 0 || captures.length > 0;
    if (hasLive) return;

    (async () => {
      const draft = await restoreTreeCaptureDraft(draftOwner);
      if (!draft || !draftHasContent(draft)) return;
      const count = draft.captures.length || draft.androidImagePaths?.length || 0;
      Alert.alert(
        'Khôi phục bản chụp dở?',
        `Có ${count} ảnh đã chụp buổi trước nhưng chưa đăng ký. Khôi phục để tiếp tục?`,
        [
          {
            text: 'Bỏ bản nháp',
            style: 'destructive',
            onPress: () => { clearTreeCaptureDraft(draftOwner); },
          },
          {
            text: 'Khôi phục',
            onPress: () => {
              // RE-CHECK: người dùng có thể đã chụp ảnh mới trong lúc hộp thoại mở →
              // KHÔNG ghi đè phiên mới (chống video/ảnh gắn nhầm tree, hỏng provenance).
              const liveNow =
                (route.params?.androidImagePaths?.length ?? 0) > 0
                || capturesRef.current.length > 0
                || (restoredAndroidRef.current?.length ?? 0) > 0;
              if (liveNow) return;
              if (draft.captures.length > 0) {
                dispatch(restoreCaptureSession(draft.captures));
              }
              if (draft.androidImagePaths?.length) {
                setRestoredAndroidPaths(draft.androidImagePaths);
              }
              if (draft.gps) dispatch(setGPS(draft.gps));
              if (draft.name) setName(draft.name);
              if (draft.farmId) setSelectedFarmId(draft.farmId);
            },
          },
        ],
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── H-17: lưu bản nháp NGAY khi ảnh/tên/vườn/GPS đổi ─────────────────────
  // Best-effort, fire-and-forget — chụp xong là bền, app bị kill vẫn khôi phục được.
  useEffect(() => {
    const paths = route.params?.androidImagePaths ?? restoredAndroidPaths;
    const hasContent = captures.length > 0 || (paths?.length ?? 0) > 0;
    if (!hasContent) return;
    saveTreeCaptureDraft(draftOwner, {
      v: 1,
      savedAt: Date.now(),
      captures,
      androidImagePaths: paths,
      gps: gps ?? null,
      name: name.trim() || undefined,
      farmId,
    });
  }, [draftOwner, captures, restoredAndroidPaths, gps, name, farmId, route.params?.androidImagePaths]);

  // Android không dispatch vào Redux captures — lấy paths từ route params (hoặc nháp
  // khôi phục sau khi app khởi động lại). iOS dùng Redux captures như bình thường.
  const androidImagePaths = route.params?.androidImagePaths ?? restoredAndroidPaths;
  const usingAndroidPaths =
    Platform.OS === 'android' && !!androidImagePaths && androidImagePaths.length > 0;
  const imagePaths = usingAndroidPaths
    ? androidImagePaths!
    : captures.map(c => `file://${c.fileURL}`);

  // Hướng máy THEO TỪNG ẢNH — song song `imagePaths`. Native đã đo sẵn
  // (`treeReIDNativeBridge.ts:22-24`); trước đây enroll không gửi gì, tức là ném
  // đi dữ liệu quý nhất cho MCR + dựng 3D. Đường Android lấy ảnh từ route params
  // nên KHÔNG có hướng → để undefined, không bịa.
  const captureOrientations = usingAndroidPaths
    ? undefined
    : toCaptureOrientations(captures);

  // Số ảnh hiệu dụng để kiểm tra MIN_CAPTURES
  const effectiveCaptureCount = usingAndroidPaths
    ? androidImagePaths!.length
    : captures.length;

  // Bắt buộc vườn HỢP LỆ (còn tồn tại) mới cho đăng ký — tránh cây mồ côi gắn vào
  // vườn đã xoá / id nháp chết. Siết hơn bản #96 (`!!farmId`): nháp khôi phục có thể
  // hồi sinh id vườn đã xoá, khi đó farmId truthy mà vườn không còn.
  const canEnroll = !isEnrolling && effectiveCaptureCount >= MIN_CAPTURES
    && name.trim().length > 0 && farmValid;

  // Ảnh chuẩn-hoá cho lưới — Android chỉ có URI, iOS có đầy-đủ metadata.
  const photos: GridPhoto[] = usingAndroidPaths
    ? androidImagePaths!.map((uri, i) => ({
        key: `android-${i}`,
        uri: uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`,
      }))
    : captures.map(c => ({
        key: c.id,
        uri: `file://${c.fileURL}`,
        heading: c.heading,
        pitch: c.pitch,
        roll: c.roll,
        round: c.round,
        capturedAt: c.capturedAt,
      }));

  // ── #5a: gán nhãn theo HƯỚNG ỐNG KÍNH THỰC (pitch), không theo nút "Lượt 2" ──
  // Vấn đề cũ: sau khi bấm "Lượt 2: Cận gốc", mọi ảnh (kể cả lia ngang lấy toàn
  // cảnh) đều bị gán round=2="Gốc". Sửa: dùng pitch cảm biến để phân biệt.
  //
  // Quy ước pitch tuyệt đối phụ thuộc cách cầm máy → KHÔNG hardcode ngưỡng tuyệt
  // đối. Thay vào đó lấy pitch trung bình của Lượt 1 (chụp ngang thân) làm MỐC:
  //  - ảnh có pitch GẦN mốc (lia ngang) = "Toàn cảnh/thân"
  //  - ảnh có pitch LỆCH XA mốc (chĩa lên/xuống, cận gốc) = "Gốc/vỏ"
  // Thiếu dữ liệu pitch (Android không native) → fallback nhãn theo round như cũ.
  const PITCH_BASE_DELTA = 22; // độ; ~ trùng ngưỡng trigger 18° của native, nới nhẹ

  const round1WithPitch = photos.filter(p => p.round === 1 && typeof p.pitch === 'number');
  const refPitch = round1WithPitch.length > 0
    ? round1WithPitch.reduce((s, p) => s + (p.pitch as number), 0) / round1WithPitch.length
    : null;

  const kindOf = (p: GridPhoto): 'trunk' | 'base' | 'unknown' => {
    // Lượt 1 luôn là thân (ngang). Ảnh không có round → chưa nhóm.
    if (p.round === 1) return 'trunk';
    if (p.round !== 2) return 'unknown';
    // Lượt 2: quyết định bằng pitch thực. Không có pitch hoặc chưa có mốc → giữ "base".
    if (refPitch == null || typeof p.pitch !== 'number') return 'base';
    return Math.abs(p.pitch - refPitch) <= PITCH_BASE_DELTA ? 'trunk' : 'base';
  };

  const trunkPhotos = photos.filter(p => kindOf(p) === 'trunk');
  const basePhotos = photos.filter(p => kindOf(p) === 'base');
  const ungroupedPhotos = photos.filter(p => kindOf(p) === 'unknown');

  // ── Navigate sau thành công ───────────────────────────────────────────────
  const handleSuccess = useCallback(
    (treeId: string, code: string) => {
      // Đăng ký xong → bản nháp hết vai trò, xoá để lần sau không hỏi khôi phục.
      clearTreeCaptureDraft(draftOwner);
      // Dựng object cây TỐI THIỂU để truyền THẲNG sang TreeDetail. Nếu chỉ gửi `treeId`,
      // TreeDetail phải tra trong store — mà cây VỪA tạo CHƯA có trong store → nó goBack
      // (bật ngược ngay). Đây là lỗi "đăng ký xong không xem được cây" ngoài thực địa.
      // Shape khớp mapTreeInfoToUI (treeReIDService). Dựng TRƯỚC clearAll() để giữ gps/name.
      const justCreated = {
        id: treeId,
        tree_id: treeId,
        code,
        name: name.trim(),
        farmer_name: name.trim(),
        farmId,
        farm_id: farmId,
        species: undefined,
        latitude: gps?.lat,
        longitude: gps?.lng,
        images: [] as string[],
        estimatedFruits: 0,
        fruitCount: 0,
        has_3d: false,
        anchor: null,
        n_views: 0,
      };
      Alert.alert(
        'Đăng ký thành công',
        `Mã cây: ${code}`,
        [
          {
            text: 'Xem chi tiết',
            onPress: () => {
              dispatch(clearAll());
              navigation.navigate('TreeDetail', { treeId, tree: justCreated } as any);
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
    [dispatch, navigation, draftOwner, name, farmId, gps],
  );

  // ── Gộp vào cây cũ (verify_add) ──────────────────────────────────────────
  const handleMergeToExisting = useCallback(
    async (treeId: string) => {
      setIsEnrolling(true);
      try {
        const res = await verifyAddTree(BASE_URL, treeId, imagePaths, {
          lat: gps?.lat,
          lon: gps?.lng,
          acc: gps?.accuracy,
          captures: captureOrientations,
          headingRef: captureOrientations ? platformHeadingRef() : undefined,
        });

        if (res.ok && res.data) {
          // Tích luỹ ảnh vừa chụp vào cây đã có để màn chi tiết hiển thị lại được.
          await appendTreeImages(treeId, imagePaths);
          // Gộp xong cũng là kết thúc phiên chụp → xoá bản nháp.
          clearTreeCaptureDraft(draftOwner);
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
      }
    },
    [imagePaths, captureOrientations, gps, dispatch, navigation, draftOwner],
  );

  // ── Force enroll (tạo cây mới bất kể trùng) ──────────────────────────────
  const handleForceEnroll = useCallback(async () => {
    if (!name.trim()) return;
    // Vườn phải HỢP LỆ (còn tồn tại) — nhánh "Tạo cây mới" cũng không được tạo cây
    // mồ côi gắn vào vườn đã xoá / id nháp chết.
    if (!farmValid) {
      Alert.alert('Chọn vườn', 'Hãy chọn một vườn còn hiệu lực trước khi tạo cây mới.');
      return;
    }
    setIsEnrolling(true);
    try {
      const res = await enrollTree(BASE_URL, name.trim(), imagePaths, {
        lat: gps?.lat,
        lon: gps?.lng,
        acc: gps?.accuracy,
        captures: captureOrientations,
        headingRef: captureOrientations ? platformHeadingRef() : undefined,
        force: true,
      }, farmId);

      if (res.ok && res.data) {
        // Lưu ảnh local theo tree_id TRƯỚC clearAll để hiển thị lại ở màn chi tiết.
        await appendTreeImages(res.data.tree_id, imagePaths);
        // Nhánh 409 → "Tạo cây mới" cũng kết thúc phiên chụp → xoá nháp (khỏi cây nhân đôi).
        clearTreeCaptureDraft(draftOwner);
        setEnrollResult(res.data);
        handleSuccess(res.data.tree_id, res.data.provenance?.code ?? res.data.tree_id);
      } else {
        Alert.alert('Lỗi', res.error?.detail ?? 'Tạo cây mới thất bại.');
      }
    } finally {
      setIsEnrolling(false);
    }
  }, [name, imagePaths, captureOrientations, gps, handleSuccess, farmId, farmValid, draftOwner]);

  // ── Main enroll ───────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu tên', 'Vui lòng nhập tên cây trước khi đăng ký.');
      return;
    }

    // Chặn cây mồ côi — không cho đăng ký khi chưa gắn vào vườn nào.
    if (!farmId) {
      if (noFarms) {
        Alert.alert(
          'Chưa có vườn',
          'Cây phải thuộc một vườn. Hãy tạo vườn trước rồi đăng ký cây.',
          [
            { text: 'Huỷ', style: 'cancel' },
            {
              text: 'Tạo vườn',
              onPress: () =>
                (navigation as any).navigate('FarmDetail', { farm_id: null }),
            },
          ],
        );
      } else {
        Alert.alert('Chọn vườn', 'Vui lòng chọn vườn để gắn cây trước khi đăng ký.');
      }
      return;
    }

    if (effectiveCaptureCount < MIN_CAPTURES) {
      Alert.alert(
        'Chưa đủ ảnh',
        `Cần ít nhất ${MIN_CAPTURES} góc chụp. Hiện có ${effectiveCaptureCount} góc.\nQuay lại và chụp thêm.`,
      );
      return;
    }

    if (!farmValid) {
      Alert.alert('Chọn vườn', 'Hãy chọn một vườn còn hiệu lực để cây hiện đúng trong trang trại.');
      return;
    }

    setIsEnrolling(true);
    try {
      const res = await enrollTree(BASE_URL, name.trim(), imagePaths, {
        lat: gps?.lat,
        lon: gps?.lng,
        acc: gps?.accuracy,
        captures: captureOrientations,
        headingRef: captureOrientations ? platformHeadingRef() : undefined,
      }, farmId);

      if (res.ok && res.data) {
        // Lưu ảnh local theo tree_id TRƯỚC clearAll để hiển thị lại ở màn chi tiết.
        await appendTreeImages(res.data.tree_id, imagePaths);
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

  // ── Render lưới ảnh (dùng chung iOS/Android) ──────────────────────────────
  const renderPhotoGrid = (list: GridPhoto[], label: string) => {
    if (list.length === 0) return null;
    return (
      <View style={styles.captureSection}>
        <Text style={styles.captureSectionLabel}>
          {label} · {list.length} góc
        </Text>
        <View style={styles.captureGrid}>
          {list.map((photo, idx) => (
            <TouchableOpacity
              key={photo.key}
              style={styles.captureTile}
              activeOpacity={0.85}
              onPress={() => setSelectedPhoto(photo)}
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.captureImage}
                resizeMode="cover"
              />
              {/* Badge số thứ tự */}
              <View style={styles.captureBadge}>
                <Text style={styles.captureBadgeText}>{idx + 1}</Text>
              </View>
              {/* Chip hướng la bàn — mờ, chỉ khi có heading */}
              {photo.heading != null && (
                <View style={styles.tileMetaBar}>
                  <Icon name="compass-outline" size={11} color={NEUTRAL.white} />
                  <Text style={styles.tileMetaText}>
                    {headingToCompass(photo.heading)} · {Math.round(photo.heading)}°
                  </Text>
                </View>
              )}
            </TouchableOpacity>
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

        {/* Chọn trang trại — cây PHẢI gắn vào vườn mới hiện trong trang trại. */}
        <View style={styles.farmSection}>
          <Text style={styles.inputLabel}>Trang trại {farmValid ? '' : '*'}</Text>
          <View style={styles.farmChips}>
            {farms.map(f => {
              const on = farmId === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.farmChip, on && styles.farmChipActive]}
                  onPress={() => setSelectedFarmId(f.id)}
                  activeOpacity={0.8}
                >
                  <Icon
                    name={on ? 'check-circle' : 'sprout-outline'}
                    size={14}
                    color={on ? '#1b5e20' : NEUTRAL.textMuted}
                  />
                  <Text
                    style={[styles.farmChipText, on && styles.farmChipTextActive]}
                    numberOfLines={1}
                  >
                    {f.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.farmChipNew}
              onPress={() =>
                (navigation as any).navigate('FarmDetail', { farm_id: null })
              }
              activeOpacity={0.8}
            >
              <Icon name="plus" size={14} color="#1b5e20" />
              <Text style={styles.farmChipNewText}>Tạo vườn mới</Text>
            </TouchableOpacity>
          </View>
          {!farmValid && (
            <Text style={styles.farmWarnText}>
              {noFarms
                ? 'Chưa có vườn nào. Tạo vườn trước — cây phải thuộc một vườn mới đăng ký được.'
                : 'Chọn vườn để đăng ký. Cây phải thuộc một vườn.'}
            </Text>
          )}
        </View>

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
              {ungroupedPhotos.length > 0 &&
                renderPhotoGrid(ungroupedPhotos, 'Ảnh đã chụp')}
              {renderPhotoGrid(trunkPhotos, 'Thân / toàn cảnh')}
              {basePhotos.length > 0 &&
                renderPhotoGrid(basePhotos, 'Gốc / vỏ (cận cảnh)')}

              <Text style={styles.gridHint}>Chạm vào ảnh để xem chi tiết</Text>

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
              {/* Kênh MCR vỏ-thân thấy một cây rất giống nhưng vẫn tách được → cho
                  đăng ký, kèm cảnh-báo NHẸ để chủ vườn tự đối chiếu. Trước đây
                  backend gửi `dup_suspect` mà app không hiện gì. */}
              {!!enrollResult.dup_suspect?.message_vi && (
                <Text style={styles.successDupWarn}>
                  ⚠ {enrollResult.dup_suspect.message_vi}
                </Text>
              )}
              {/* Máy chủ đã tính sẵn 4 câu dưới đây (server.py:1900-1927) mà app
                  bỏ phí. Đây là chỗ nông dân biết mình còn phải đi vòng phía nào —
                  không có nó thì họ chụp mò rồi bị loại ảnh mà không hiểu vì sao. */}
              {enrollResult.views_dropped_dup != null && enrollResult.views_dropped_dup > 0 && (
                <Text style={styles.successNote}>
                  {enrollResult.views_dropped_dup} góc trùng với góc đã có nên không lưu thêm.
                </Text>
              )}
              {!!enrollResult.coverage_hint_vi && (
                <Text style={styles.successHint}>{enrollResult.coverage_hint_vi}</Text>
              )}
              {/* Hai trường này khác shape nhau — rút qua một hàm CÓ TEST canh, đừng
                  đọc tay tại chỗ (đọc nhầm là cảnh báo biến mất im lặng). */}
              {enrollWarningMessages(enrollResult).quality.map((m, i) => (
                <Text key={`q${i}`} style={styles.successDupWarn}>⚠ {m}</Text>
              ))}
              {enrollWarningMessages(enrollResult).region.map((m, i) => (
                <Text key={`r${i}`} style={styles.successDupWarn}>⚠ {m}</Text>
              ))}
              {enrollResult.farm_dropped === true && (
                <Text style={styles.successDupWarn}>
                  ⚠ Cây đã đăng ký nhưng CHƯA gắn được vào vườn đang chọn. Hãy mở
                  danh sách cây của vườn để kiểm lại, đừng đăng ký lại lần nữa.
                </Text>
              )}
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

      {/* Modal xem chi tiết ảnh */}
      <Modal
        visible={selectedPhoto != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedPhoto(null)}
          />
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelectedPhoto(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={NEUTRAL.white} />
            </TouchableOpacity>

            {selectedPhoto && (
              <>
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <View style={styles.modalMeta}>
                  <View style={styles.chipRow}>
                    {selectedPhoto.heading != null && (
                      <View style={styles.chip}>
                        <Icon name="compass-outline" size={13} color="#1b5e20" />
                        <Text style={styles.chipText}>
                          {headingToCompass(selectedPhoto.heading)} · {Math.round(selectedPhoto.heading)}°
                        </Text>
                      </View>
                    )}
                    {selectedPhoto.pitch != null && (
                      <View style={styles.chip}>
                        <Icon name="angle-acute" size={13} color="#1b5e20" />
                        <Text style={styles.chipText}>Ngẩng {Math.round(selectedPhoto.pitch)}°</Text>
                      </View>
                    )}
                    {selectedPhoto.roll != null && (
                      <View style={styles.chip}>
                        <Icon name="rotate-3d-variant" size={13} color="#1b5e20" />
                        <Text style={styles.chipText}>Xoay {Math.round(selectedPhoto.roll)}°</Text>
                      </View>
                    )}
                    {selectedPhoto.round != null && (
                      <View style={styles.chip}>
                        <Icon name="camera-outline" size={13} color="#1b5e20" />
                        <Text style={styles.chipText}>Lượt {selectedPhoto.round}</Text>
                      </View>
                    )}
                    {selectedPhoto.capturedAt != null && (
                      <View style={styles.chip}>
                        <Icon name="clock-outline" size={13} color="#1b5e20" />
                        <Text style={styles.chipText}>{formatTime(selectedPhoto.capturedAt)}</Text>
                      </View>
                    )}
                  </View>
                  {selectedPhoto.heading == null && (
                    <Text style={styles.modalNoMeta}>
                      Ảnh này không kèm dữ liệu hướng/góc.
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: NEUTRAL.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    overflow: 'hidden',
  },
  captureImage: {
    width: '100%',
    height: '100%',
  },
  captureBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  captureBadgeText: {
    fontSize: 11,
    color: NEUTRAL.white,
    fontWeight: '700',
  },
  tileMetaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  tileMetaText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  gridHint: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  captureTileBadge: {
    position: 'absolute',
    left: 3,
    bottom: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  captureTileBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },

  farmSection: { marginBottom: 16 },
  farmChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  farmChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: NEUTRAL.bgSoft, borderWidth: 1, borderColor: NEUTRAL.border,
    maxWidth: 190,
  },
  farmChipActive: { backgroundColor: '#e8f5e9', borderColor: '#1b5e20' },
  farmChipText: { fontSize: 12, fontWeight: '600', color: NEUTRAL.textMuted },
  farmChipTextActive: { color: '#1b5e20' },
  farmChipNew: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#1b5e20', borderStyle: 'dashed',
  },
  farmChipNewText: { fontSize: 12, fontWeight: '700', color: '#1b5e20' },
  farmWarnText: { fontSize: 11, color: NEUTRAL.warning, marginTop: 8, fontWeight: '600' },

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
  // Cảnh-báo NHẸ (cam, không đỏ): cây vẫn đăng ký được, chỉ nhắc đối chiếu.
  successDupWarn: { fontSize: 12, color: '#e65100', marginTop: 4, lineHeight: 17 },
  successNote: { fontSize: 12, color: NEUTRAL.textSub, marginTop: 4, lineHeight: 17 },
  successHint: { fontSize: 12.5, color: '#1b5e20', fontWeight: '600', marginTop: 4, lineHeight: 18 },

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

  // ── Modal xem chi tiết ảnh ────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: NEUTRAL.card,
    borderRadius: 18,
    overflow: 'hidden',
  },
  modalClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: Dimensions.get('window').width * 0.9,
    maxHeight: 420,
    backgroundColor: '#000',
  },
  modalMeta: {
    padding: 14,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipText: {
    fontSize: 12.5,
    color: '#1b5e20',
    fontWeight: '600',
  },
  modalNoMeta: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    fontStyle: 'italic',
  },
});

export default TreeEnrollScreen;
