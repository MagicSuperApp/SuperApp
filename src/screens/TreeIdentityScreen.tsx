/**
 * TreeIdentityScreen — Nhận diện cây bằng camera
 *
 * Platform guard bắt buộc:
 *   iOS  → NativeCameraPreview (requireNativeComponent) + TreeReIDBridge
 *   Android → react-native-geolocation-service + PermissionsAndroid + Alert "chụp thủ công"
 *
 * Flow 2 lượt:
 *   Lượt 1: Chụp thân cây đi vòng quanh (≥4 góc)
 *   Lượt 2: Chụp gốc/vỏ cận (≥2 góc, tuỳ chọn)
 *
 * Sau nhận diện:
 *   MATCH         → ResultBadge + FactorBreakdown + tên/code/similarity
 *   UNCERTAIN     → ReidConfirmDialog với candidates
 *   NO_MATCH /
 *   EMPTY_BUCKET  → nút "Đăng ký cây mới" → navigate TreeEnroll
 *                   (captures lưu qua redux, KHÔNG qua navigation params)
 *   MOVED         → hiện khoảng cách + nút "Cập nhật vị trí"
 */

import { t } from '../i18n';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  LIBRARY_PICK_OPTIONS,
  readLibraryPick,
} from './treeIdentifyFromLibrary';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
  requireNativeComponent,
  Modal,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';

import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import {
  TreeReIDBridge,
  subscribeHeadingUpdate,
  subscribeCaptureTriggered,
  subscribeRoundComplete,
  type HeadingUpdate,
  type CaptureTriggered,
  type RoundComplete,
  type CapturedImage,
} from '../services/treeReIDNativeBridge';
import {
  partitionCaptures,
  missingParts,
  MIN_TRUNK,
  MIN_BASE,
  type CaptureAngle,
  type TreePart,
} from './treeCaptureParts';
import TreePartReviewStrip from './TreePartReviewStrip';
import { autoTreeRegions } from '../services/treeRegionAuto';
import { getCapturePlan, captureHint } from '../services/capturePlanService';
import {
  toCaptureOrientations,
  platformHeadingRef,
  type TreeRegion,
  type CaptureOrientation,
  identifyTree,
  verifyAddTree,
  submitIdentifyVerdict,
  getTrees,
  fieldErrorMessage,
  type IdentifyResponse,
  type ConfidenceBand,
  type IdentifyVerdict,
  type ShellMatcher,
  type TreeInfo,
} from '../services/treeReIDService';
import ResultBadge from '../components/reid/ResultBadge';
import FactorBreakdown, { type FactorScores } from '../components/reid/FactorBreakdown';
import ReidConfirmDialog, { type ReidCandidate } from '../components/reid/ReidConfirmDialog';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { loadFarms } from '../modules/trace/store/farmSlice';
import {
  ensureOrilifeToken,
  clearOrilifeToken,
  clearOrilifeLoginCooldown,
} from '../services/orilifeDidAuth';
import { clearSessionMintCooldown } from '../services/phoenixKey-api';
import { BiometricKind, biometricKindFromType, phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';
import ReactNativeBiometrics from 'react-native-biometrics';
import rLog from '../services/remoteLogger';
import { withPhotoSave } from '../services/mediaSavePermission';
import {
  addCapture,
  setCapturing,
  setCurrentRound,
  setIdentificationResult,
  clearAll,
  selectCaptures,
  selectIdentificationResult,
  selectIsIdentifying,
  selectGPS,
  setGPS,
} from '../store/treeReIDSlice';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Dùng @env (react-native-dotenv) — biến phải khai báo trong .env
// Nếu chưa có → fallback staging
import { ORILIFE_BASE } from '../services/orilifeBase';
import { tk } from '../i18n/keys';
import { showError, showSuccess, showWarning } from '../utils/alert';
const BASE_URL: string =
  ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Native component (iOS only)
// ---------------------------------------------------------------------------

// NativeCameraPreview tồn tại trên cả iOS lẫn Android (ViewManager cùng tên
// "TreeReIDCameraPreview"). Máy Android chưa cập nhật (thiếu view) sẽ không render
// — nhưng guard isCaptureActive + isAvailable() ở dưới đảm bảo chỉ dùng khi có native.
//
// ⛔ `requireNativeComponent` ĐĂNG KÝ tên view, nó không phải một phép tra cứu.
// Gọi lần thứ hai với cùng một tên là `Invariant Violation: Tried to register two
// views with the same name` — lỗi FATAL, hộp đỏ, và bấm Dismiss thì app dựng lại
// từ màn đầu.
//
// Lần gọi thứ hai đến từ đâu, vì chỗ này đã ở tầm mô-đun: **Fast Refresh**. Tệp
// này nhập `tk` từ `i18n/keys` (dòng 112), nên sửa BẤT KỲ tệp nào trong chuỗi phụ
// thuộc đó là mô-đun này được nạp lại, và dòng này chạy lại. Đo 19/09/2026 trên
// máy ảo: sửa `i18n/keys/onboarding.ts` ⟹ hai lượt `js_global_error` `isFatal:true`
// cách nhau 13 giây, không đụng gì tới tệp này.
//
// Vì sao nó sống lâu mà không ai thấy: bản PHÁT HÀNH nạp mô-đun đúng một lần, nên
// lỗi này KHÔNG có trong bản đóng gói. Nó chỉ đánh vào người đang sửa mã — tức
// đúng nhóm người sẽ cho rằng "máy mình lỗi" chứ không mở issue.
//
// Nhớ qua các lần nạp lại bằng `globalThis`: nó sống theo TIẾN TRÌNH, còn phạm vi
// mô-đun chỉ sống tới lần nạp lại kế tiếp. Dùng `in` chứ không kiểm giá trị, vì
// `null` (nền không có view) là một kết quả hợp lệ đã ghi nhớ, không phải "chưa hỏi".
type CameraPreviewProps = { style?: object };
const KHOA_VIEW = '__superapp_treeReIDCameraPreview';
const boNho = globalThis as Record<string, unknown>;
if (!(KHOA_VIEW in boNho)) {
  boNho[KHOA_VIEW] =
    Platform.OS === 'ios' || Platform.OS === 'android'
      ? (requireNativeComponent('TreeReIDCameraPreview') as React.ComponentType<CameraPreviewProps>)
      : null;
}
const NativeCameraPreview = boNho[KHOA_VIEW] as React.ComponentType<CameraPreviewProps> | null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Ngưỡng lấy từ `treeCaptureParts` — MỘT nguồn, không gõ lại.
 *
 * Trước đây màn này giữ bản riêng (`MIN_ROUND1`/`MIN_ROUND2`). Hai bản cùng một
 * con số nằm ở hai tệp là thứ trôi khỏi nhau mà không gì báo (`Forall §Một nguồn`).
 */
const MIN_ROUND1 = MIN_TRUNK;
const MIN_ROUND2 = MIN_BASE;

/**
 * Câu dẫn — KHÔNG còn nhắc "lượt" nào.
 *
 * Chủ sở hữu bác lối hai lượt 2026-09-19: *"Đừng bắt nông dân phải dừng lại
 * chuyển nút bấm giữa chừng."* Câu `sufficient` cũ (*"Bấm Lượt 2: Cận gốc để
 * tăng độ chính xác"*) là câu dẫn người ta tới đúng cái nút vừa bị bỏ, nên nó đi
 * theo cái nút. Nay câu dẫn nói THIẾU GÌ và CHĨA MÁY ĐI ĐÂU — người dùng không
 * cần biết trong máy có khái niệm "lượt" nào cả.
 */
const GUIDANCE = {
  start: 'Đi vòng quanh cây, lia chậm để lấy đủ góc.',
  needMore: 'Xoay thêm một chút nữa để lấy góc mới.',
  captured: 'Đã lấy một góc — tiếp tục lia.',
  needBase: 'Còn thiếu góc gốc — chĩa ống kính xuống phía gốc cây rồi giữ yên một nhịp.',
  needTrunk: 'Còn thiếu góc thân — ngẩng ống kính lên ngang thân rồi lia tiếp.',
  sufficient: 'Đủ rồi. Lia thêm vài góc nữa thì càng chắc.',
  android: 'Bấm "Chụp ảnh" để thêm góc nhìn (tối thiểu 4 ảnh).',
} as const;

// ---------------------------------------------------------------------------
// VƯỜN của màn này — và cổng chặn ở đường GHI
// ---------------------------------------------------------------------------

/**
 * Vườn mà mọi thứ ghi từ màn này sẽ gắn vào. BỐN trạng thái, không phải hai.
 *
 * ⛔ Lỗi đã đo: màn này từng lấy vườn bằng đúng một dòng `route.params?.farmId`,
 * không có đường lùi. BỐN lối vào không truyền tham số đó —
 * `TreeManagementScreen` (nút "+" và nút "Đăng ký cây đầu tiên"),
 * `navigation/resolveGateItems.ts` (hành động nhanh "Quét cây"), và
 * `config/quickActions.ts` (nút "Quét cây" màn chính). Đi bằng bốn đường đó thì
 * `farmId === undefined` mà `verifyAddTree` VẪN gửi: máy chủ gán `farm_id = null`,
 * cây rơi khỏi bộ lọc `/api/trees?farm_id=X`, nông dân tưởng mất cây rồi đăng ký
 * lại ⇒ hai bản ghi cho một gốc cây. Còn app thì báo "Đã xác nhận".
 *
 * `loading` tách khỏi `no-farms` là CỐ Ý: "chưa nạp xong" và "chưa có vườn nào"
 * là hai chuyện khác nhau, và nói nhầm câu thứ hai là bảo người đang có vườn đi
 * tạo vườn mới.
 */
export type FarmContext =
  | { status: 'ready'; farmId: string }
  | { status: 'loading' }
  | { status: 'needs-choice' }
  | { status: 'no-farms' };

/**
 * Chọn vườn theo ĐÚNG mẫu `TreeEnrollScreen` đang dùng (`TreeEnrollScreen.tsx`
 * quanh dòng 234–262) — không đẻ mẫu thứ hai:
 *   · có mã vườn từ lối vào và vườn đó CÒN THẬT → dùng luôn;
 *   · mã trỏ vườn đã xoá → bỏ (id chết cũng làm cây mồ côi y như thiếu id);
 *   · đúng MỘT vườn → tự chọn, không thêm ma sát cho người chỉ có một vườn;
 *   · nhiều vườn → HỎI, không đoán;
 *   · chưa có vườn nào → dẫn đi tạo vườn.
 */
export function resolveFarmContext(input: {
  routeFarmId?: string;
  farms: { id: string }[];
  loading: boolean;
}): FarmContext {
  const wanted = (input.routeFarmId ?? '').trim();
  const farms = input.farms ?? [];

  if (wanted && farms.some(f => f.id === wanted)) {
    return { status: 'ready', farmId: wanted };
  }
  // Danh sách chưa về thì chưa kết luận được gì — kể cả khi có mã từ lối vào,
  // vì chưa biết vườn đó còn hay đã xoá.
  if (farms.length === 0 && input.loading) return { status: 'loading' };
  if (farms.length === 1) return { status: 'ready', farmId: farms[0].id };
  if (farms.length === 0) return { status: 'no-farms' };
  return { status: 'needs-choice' };
}

/** Tuỳ chọn của `verifyAddTree`, lấy TỪ chính chữ ký nó — không chép lại hình dạng. */
type VerifyAddOptions = NonNullable<Parameters<typeof verifyAddTree>[3]>;

/**
 * Bổ sung góc nhìn cho một cây ĐÃ CÓ — cổng duy nhất của màn này ra `verifyAddTree`.
 *
 * Cổng đặt ở ĐƯỜNG GHI chứ không ở đầu màn, có chủ ý: màn này còn một đường ĐỌC
 * hợp lệ không cần vườn (chụp rồi soi xem đây là cây nào, kể cả cây không phải
 * của mình). Chặn ở đầu màn là khoá luôn việc soi. Chỗ hỏng nằm ở đường ghi.
 *
 * Vườn chưa rõ ⟹ KHÔNG một byte nào rời khỏi máy, và trả về lý do để màn nói
 * đúng chuyện — chứ không phải gửi `undefined` rồi hiện "Đã xác nhận".
 */
export async function addViewsToTree(args: {
  baseUrl: string;
  treeId: string;
  imagePaths: string[];
  farm: FarmContext;
  gps?: { lat: number; lng: number; accuracy?: number } | null;
  regions?: VerifyAddOptions['regions'];
  captures?: VerifyAddOptions['captures'];
  headingRef?: VerifyAddOptions['headingRef'];
}): Promise<Awaited<ReturnType<typeof verifyAddTree>> & { blocked?: 'farm-required' }> {
  if (args.farm.status !== 'ready') {
    return { ok: false, blocked: 'farm-required' };
  }
  return verifyAddTree(args.baseUrl, args.treeId, args.imagePaths, {
    // `farm_id` BẮT BUỘC — xem khối chú thích của `FarmContext`.
    farmId: args.farm.farmId,
    lat: args.gps?.lat,
    lon: args.gps?.lng,
    acc: args.gps?.accuracy,
    regions: args.regions,
    captures: args.captures,
    headingRef: args.headingRef,
  });
}

/** Câu nói cho từng lý do vườn chưa rõ. Ba ca ba câu — gộp là nói sai một ca. */
export function farmBlockedMessage(farm: FarmContext): string {
  switch (farm.status) {
    case 'loading':
      return 'Đang tải danh sách vườn. Chờ một chút rồi bấm lại.';
    case 'no-farms':
      return 'Chưa có vườn nào. Tạo vườn trước — cây phải thuộc một vườn thì mới hiện trong trang trại.';
    default:
      return 'Chọn vườn trước khi lưu. Cây không thuộc vườn nào sẽ không hiện trong trang trại.';
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type TreeIdentityRouteParams = {
  TreeIdentity: {
    /** Vườn hiện-hành — truyền tiếp xuống TreeEnroll để gắn cây vào vườn. */
    farmId?: string;
    /**
     * Mốc thời gian của một lượt CHỤP LẠI do màn đăng ký yêu cầu.
     *
     * Màn này giữ `identResult` trong state cục bộ, nên `goBack()` từ màn đăng ký
     * để lại y nguyên bảng kết quả cũ kèm nút "Đăng ký cây mới" — kể cả sau khi
     * cây đã đăng ký xong. Người dùng bấm tiếp thì sang màn đăng ký với `captures`
     * rỗng, không hiểu, ra chụp lại từ đầu, và thành HAI bản ghi cho MỘT gốc cây.
     * Dùng mốc thời gian chứ không phải cờ boolean: hai lượt chụp lại liên tiếp
     * phải là hai giá trị khác nhau thì effect mới chạy lần thứ hai.
     */
    retake?: number;
  };
};

const TreeIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TreeIdentityRouteParams, 'TreeIdentity'>>();
  const dispatch = useAppDispatch();
  // Giữ tên hiển-thị khi phải đăng-ký-lại (DID mới nhưng tên cũ).
  const currentUser = useAppSelector(s => s.user.currentUser);

  // ── Vườn của màn này ──────────────────────────────────────────────────────
  // Trước đây chỉ có đúng dòng `route.params?.farmId` và KHÔNG có đường lùi — xem
  // khối chú thích của `FarmContext` ở đầu tệp. Nay dùng lại mẫu chọn vườn của
  // `TreeEnrollScreen`: nạp danh sách, đúng một vườn thì tự chọn, nhiều vườn thì
  // để người dùng chọn, chưa có vườn thì dẫn đi tạo.
  const farms = useAppSelector((s: RootState) => s.farm.farms);
  const farmsLoading = useAppSelector((s: RootState) => s.farm.isLoading);
  const [pickedFarmId, setPickedFarmId] = useState<string | undefined>(route.params?.farmId);

  useEffect(() => {
    if (currentUser?.id && farms.length === 0) dispatch(loadFarms(currentUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Vườn đang chọn không còn trong danh sách (bị xoá, hoặc mã cũ từ lối vào) → bỏ
  // chọn để bộ chọn buộc chọn lại, khỏi gửi một id chết.
  useEffect(() => {
    if (pickedFarmId && farms.length > 0 && !farms.some(f => f.id === pickedFarmId)) {
      setPickedFarmId(undefined);
    }
  }, [farms, pickedFarmId]);

  const farmContext = useMemo(
    () => resolveFarmContext({ routeFarmId: pickedFarmId, farms, loading: farmsLoading }),
    [pickedFarmId, farms, farmsLoading],
  );
  /** Mã vườn ĐÃ XÁC MINH, hoặc `undefined`. Đừng đọc `route.params.farmId` nữa. */
  const farmId = farmContext.status === 'ready' ? farmContext.farmId : undefined;

  useEffect(() => {
    rLog.treeIdentity.screenMount({ farmId: route.params?.farmId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Redux state ───────────────────────────────────────────────────────────
  const capturesRedux = useAppSelector(selectCaptures);
  const identResultRedux = useAppSelector(selectIdentificationResult);
  const isIdentifyingRedux = useAppSelector(selectIsIdentifying);
  const gpsRedux = useAppSelector(selectGPS);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [currentRoundLocal, setCurrentRoundLocal] = useState<1 | 2>(1);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [shouldCapture, setShouldCapture] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isIdentifyingLocal, setIsIdentifyingLocal] = useState(false);
  const [identResult, setIdentResult] = useState<IdentifyResponse | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFactors, setShowFactors] = useState(false);

  // ── PoC-Tree §4: verdict + matcher (ADDITIVE, ẩn nội-tạng) ────────────────
  // query_id của lần identify hiện-tại (Lợi PR #46) — GIỮ để gửi verdict.
  const [queryId, setQueryId] = useState<string | null>(null);
  // Phán-quyết đã gửi (null = chưa gửi) → khoá nút sau 1 chạm.
  const [verdictSent, setVerdictSent] = useState<IdentifyVerdict | null>(null);
  const [isSendingVerdict, setIsSendingVerdict] = useState(false);
  // Bộ chọn "cây khác" (verdict='other' cần correct_tid từ /api/trees).
  const [showTreePicker, setShowTreePicker] = useState(false);
  const [pickerTrees, setPickerTrees] = useState<TreeInfo[]>([]);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // ── M4: matcher toggle ẩn (tester) — long-press tiêu-đề mở chọn ───────────
  // null = mặc-định (không gửi ?matcher=, backend dùng ENV).
  const [matcher, setMatcher] = useState<ShellMatcher | null>(null);
  const [showMatcherPicker, setShowMatcherPicker] = useState(false);

  // Android: captures tự quản lý cục bộ bằng mảng uri ảnh
  const [androidImageUris, setAndroidImageUris] = useState<string[]>([]);

  /**
   * Ảnh mà lượt nhận diện VỪA RỒI thật sự đã gửi đi.
   *
   * Vì sao cần: mọi việc làm TIẾP sau một lượt nhận diện (cập nhật vị trí, xác
   * nhận một cây ứng viên) phải gửi ĐÚNG những tấm ảnh máy chủ vừa đối chiếu.
   * Trước đợt này các chỗ đó tự dựng lại danh sách bằng
   * `TreeReIDBridge.isAvailable() ? capturesRedux : androidImageUris` — tức suy
   * lại từ TRẠNG THÁI MÁY thay vì đọc cái đã xảy ra. Hai vế trùng nhau chừng nào
   * còn đúng hai lối vào; thêm lối thứ ba (ảnh thư viện) là chúng tách ra, và
   * chúng tách ra **im lặng**: máy chủ vẫn nhận một mảng ảnh hợp lệ, vẫn trả 200,
   * chỉ là nó đối chiếu nhầm bộ ảnh.
   *
   * `regions`/`captures` đi kèm trong cùng một ô vì chúng khớp với mảng ảnh
   * THEO CHỈ SỐ. Tách chúng ra hai chỗ là mở đúng cái cửa lệch chỉ số đó.
   */
  const lastIdentifyInput = useRef<{
    images: string[];
    orientations?: CaptureOrientation[];
    regions?: Array<TreeRegion | null>;
  } | null>(null);

  // ── Cam controls: flash (mặc-định TẮT) + lens 0.5x ────────────────────────
  const [camCaps, setCamCaps] = useState({ hasTorch: false, supportsUltraWide: false });
  const [torchOn, setTorchOn] = useState(false);
  const [ultraWideOn, setUltraWideOn] = useState(false);

  // iOS: đếm capture từ native event (capturesRedux chỉ được điền SAU stop).
  const [iosCaptureCount, setIosCaptureCount] = useState(0);

  /**
   * Góc chụp của TỪNG ảnh, gom ngay lúc chụp.
   *
   * Vì sao phải giữ riêng thay vì đọc `capturesRedux`: redux chỉ được điền SAU
   * khi dừng phiên, nên trong suốt lúc người dùng đang lia máy, màn hình không có
   * pitch của ảnh nào cả — chỉ có mỗi TỔNG SỐ. Mà thanh tiến độ phải nói được
   * "còn thiếu góc gốc" NGAY LÚC ĐÓ, chứ nói sau khi đã chụp xong thì vô dụng.
   * Sự kiện `CaptureTriggered` chở sẵn `{captureId, heading, pitch}`, nên chỉ cần
   * nhặt lại — không phải sửa gì bên native.
   */
  const [captureAngles, setCaptureAngles] = useState<CaptureAngle[]>([]);

  /**
   * Nhãn người dùng tự đặt lại cho một ảnh. Rỗng là chuyện bình thường, không
   * phải trạng thái thiếu: mặc định KHÔNG ai phải chạm gì.
   */
  const [manualParts, setManualParts] = useState<Record<string, TreePart>>({});

  /**
   * Loạt ảnh đang chờ người dùng liếc qua, sau khi đã dừng chụp.
   *
   * `null` = chưa dừng chụp (hoặc đã nhận diện xong) ⟹ không hiện dải xem lại.
   * Phải giữ nguyên `CapturedImage` chứ không rút gọn: lượt nhận diện còn cần
   * `heading`/`roll` (`toCaptureOrientations`) và khung máy đã khoanh
   * (`autoTreeRegions`), hai thứ không nằm trong thứ dải ảnh vẽ ra.
   */
  const [reviewCaptures, setReviewCaptures] = useState<CapturedImage[] | null>(null);
  // Snapshot tổng-số-capture tại thời điểm advance sang lượt 2 → tính per-round.

  const geoWatchRef = useRef<number | null>(null);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const startGPS = useCallback(() => {
    if (geoWatchRef.current !== null) return;

    const requestAndWatch = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Quyền Vị trí',
            message: t('{brand} cần GPS để nhận diện cây gần bạn.'),
            buttonPositive: 'Cho phép',
            buttonNegative: 'Từ chối',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      const applyPos = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => {
        dispatch(
          setGPS({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        );
      };

      // 1) FIX NHANH ngay lập tức: cho phép độ chính xác thô + dùng vị trí cache
      //    (Wi-Fi/cell) để có toạ độ trong vài giây thay vì đợi chip GPS cold-start
      //    vài phút (field-test Đức 26/07 mục 2: tránh enroll cây mới kẹt 400 need_gps).
      Geolocation.getCurrentPosition(
        applyPos,
        _err => { /* chưa có fix nhanh — watch bên dưới sẽ bù */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );

      // 2) TINH CHỈNH liên tục bằng chip GPS. distanceFilter:0 để vẫn cập nhật
      //    khi đứng yên (fix đầu thô sẽ được thay bằng toạ độ chính xác hơn).
      geoWatchRef.current = Geolocation.watchPosition(
        applyPos,
        _err => {
          // GPS không sẵn — tiếp tục không có toạ độ
        },
        { enableHighAccuracy: true, distanceFilter: 0 },
      );
    };

    requestAndWatch();
  }, [dispatch]);

  const stopGPS = useCallback(() => {
    if (geoWatchRef.current !== null) {
      Geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
  }, []);

  // ── Permissions (camera Android) ─────────────────────────────────────────
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền Camera',
        message: t('{brand} cần Camera để chụp ảnh cây.'),
        buttonPositive: 'Cho phép',
        buttonNegative: 'Từ chối',
      },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      showWarning('Cần quyền Camera', 'Vui lòng bật Camera trong Cài đặt.', {
          confirmText: 'Mở Cài đặt',
          cancelText: 'Huỷ',
          onConfirm: () => Linking.openSettings(),
      });
      return false;
    }
    return true;
  };

  // ── Native event subscriptions (iOS + Android khi có native) ─────────────
  useEffect(() => {
    if (!TreeReIDBridge.isAvailable()) return;

    const unsubHeading = subscribeHeadingUpdate((e: HeadingUpdate) => {
      setHeading(e.heading);
      setPitch(e.pitch);
      setRoll(e.roll);
      setShouldCapture(e.shouldCapture);
    });

    const unsubCapture = subscribeCaptureTriggered((e: CaptureTriggered) => {
      // Nhặt góc chụp của ảnh này để chia thân/gốc ngay trong lúc còn đang lia.
      // LỌC TRÙNG theo `captureId`: native bắn sự kiện HAI LẦN cho cùng một ảnh
      // (trước và sau khi ghi tệp) — chính lý do dòng dưới phải lấy `max`. Không
      // lọc thì mỗi ảnh vào bảng hai lần, và bảng chia sẽ đếm gấp đôi trong khi
      // con số "N ảnh" bên cạnh nó vẫn đúng — hai con số lệch nhau ngay trên cùng
      // một màn, không có gì báo cái nào sai.
      setCaptureAngles(prev =>
        prev.some(a => a.id === e.captureId)
          ? prev
          : [...prev, { id: e.captureId, pitch: typeof e.pitch === 'number' ? e.pitch : null }],
      );

      // Native gửi 2 lần: lần đầu (trước save) totalCaptures=N-1, lần sau (sau save) totalCaptures=N.
      // Lấy max để counter chỉ tăng, không lùi.
      if (e.totalCaptures > 0) {
        setIosCaptureCount(prev => {
          const next = Math.max(prev, e.totalCaptures);
          rLog.treeIdentity.captureTriggered(next, currentRoundLocal);
          return next;
        });
      }
    });

    const unsubRound = subscribeRoundComplete((e: RoundComplete) => {
      const nextRound = (e.nextRound as 1 | 2) ?? 2;
      rLog.nativeBridge.roundComplete(nextRound, iosCaptureCount);
      setCurrentRoundLocal(nextRound);
      dispatch(setCurrentRound(nextRound));
    });

    return () => {
      unsubHeading();
      unsubCapture();
      unsubRound();
    };
  }, [dispatch]);

  // ── GPS watch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    startGPS();
    return () => stopGPS();
  }, [startGPS, stopGPS]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Không clearAll vì TreeEnrollScreen cần dùng captures từ redux.
      // Dừng session native để giải phóng camera nếu user rời màn giữa chừng
      // (không bấm "Nhận diện"). Best-effort — không có session thì native resolve null.
      if (TreeReIDBridge.isAvailable()) {
        TreeReIDBridge.stopCaptureSession().catch(() => { });
      }
    };
  }, []);

  // ── Chia thân/gốc bằng SỐ ĐO, không bằng nút bấm ──────────────────────────
  //
  // Lý do đầy đủ + ba số đo đứng sau ở đầu tệp `treeCaptureParts.ts`. Tóm tắt:
  // nhãn "lượt" chưa bao giờ được gửi lên máy chủ, và tầng native vốn đã tự chụp
  // ảnh gốc khi người dùng chĩa máy xuống — cái nút chỉ dán nhãn.
  //
  // Hết phiên thì `capturesRedux` mới có, còn trong lúc đang lia thì chỉ có
  // `captureAngles` gom từ sự kiện. Ưu tiên nguồn nào ĐANG có số thật.
  //
  // Đã dừng chụp ⟹ `reviewCaptures` là nguồn ĐÚNG NHẤT và phải thắng: nó là
  // chính loạt ảnh sắp được gửi đi, còn `captureAngles` chỉ là những gì sự kiện
  // native kịp bắn. Hai con số lệch nhau thì dải ảnh vẽ một đằng, thanh tiến độ
  // đếm một nẻo — và người dùng không có cách nào biết bên nào đúng.
  const angles: CaptureAngle[] = reviewCaptures
    ? reviewCaptures.map(c => ({
      id: c.id,
      pitch: typeof c.pitch === 'number' ? c.pitch : null,
    }))
    : captureAngles.length > 0
      ? captureAngles
      : capturesRedux.map(c => ({
        id: c.id,
        pitch: typeof c.pitch === 'number' ? c.pitch : null,
      }));
  const partition = partitionCaptures(angles, manualParts);
  const missing = missingParts(partition);

  const totalCaptures =
    TreeReIDBridge.isAvailable() ? iosCaptureCount : androidImageUris.length;

  /**
   * Đủ để bấm Nhận diện chưa.
   *
   * Máy KHÔNG trả pitch (Android chưa có native) ⟹ không chia được, và lúc đó
   * luật phải LÙI VỀ đếm tổng số ảnh như cũ. Nếu để nguyên luật thân/gốc thì
   * `missing.enough` vĩnh viễn `false` và nút Nhận diện không bao giờ sáng trên
   * máy đó — một cổng luôn đóng, không ai biết vì sao.
   */
  const doChiaDuoc = partition.trunk + partition.base > 0;
  const readyToIdentify = doChiaDuoc
    ? missing.enough
    : totalCaptures >= MIN_ROUND1;

  // ── Guidance text ─────────────────────────────────────────────────────────
  const getGuidance = (): string => {
    if (identResult) return '';
    // Android KHÔNG có native → guidance chụp tay.
    if (Platform.OS === 'android' && !TreeReIDBridge.isAvailable()) return GUIDANCE.android;
    if (!isCaptureActive) return tk('trace.identify.idleHint');
    if (totalCaptures === 0) return GUIDANCE.start;
    // Nói THIẾU GÌ trước khi nói gì khác — đó là thứ duy nhất người đang cầm máy
    // hành động được. Thiếu cả hai thì nhắc phần khó nhớ hơn (gốc).
    if (doChiaDuoc && missing.base > 0) return GUIDANCE.needBase;
    if (doChiaDuoc && missing.trunk > 0) return GUIDANCE.needTrunk;
    if (shouldCapture) return GUIDANCE.needMore;
    if (readyToIdentify) return GUIDANCE.sufficient;
    return GUIDANCE.captured;
  };

  // ── Start capture session (iOS + Android native) ──────────────────────────
  const handleStartCapture = async () => {
    if (!TreeReIDBridge.isAvailable()) {
      showError('Lỗi', 'Native module chưa sẵn sàng. Vui lòng cập nhật app.');
      return;
    }
    // Android: xin quyền Camera trước (iOS module tự xin trong startCaptureSession).
    if (Platform.OS === 'android') {
      const ok = await requestCameraPermission();
      if (!ok) return;
    }

    try {
      setIsLoading(true);
      rLog.treeIdentity.startCapture();
      dispatch(clearAll());
      setIosCaptureCount(0);
      setCaptureAngles([]);
      setManualParts({});
      const result = await TreeReIDBridge.startCaptureSession();
      setIsCaptureActive(true);
      setCurrentRoundLocal(result.round as 1 | 2);
      dispatch(setCapturing(true));
      dispatch(setCurrentRound(result.round as 1 | 2));
      setIdentResult(null);
    } catch (e: any) {
      rLog.nativeBridge.bridgeError('startCaptureSession', e?.message ?? String(e));
      showError('Lỗi', 'Không thể bắt đầu chụp. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Cam controls: nạp khả-năng khi bật camera; reset khi tắt ──────────────
  // cameraInfo/device chỉ sẵn SAU khi preview bind → thử lại 1 lần nếu lần đầu rỗng.
  useEffect(() => {
    if (!isCaptureActive || !TreeReIDBridge.isAvailable()) {
      setCamCaps({ hasTorch: false, supportsUltraWide: false });
      setTorchOn(false);
      setUltraWideOn(false);
      return;
    }
    let alive = true;
    let tries = 0;
    const probe = async () => {
      const caps = await TreeReIDBridge.getCameraCapabilities();
      if (!alive) return;
      if ((caps.hasTorch || caps.supportsUltraWide) || tries >= 3) {
        setCamCaps(caps);
      } else {
        tries += 1;
        setTimeout(probe, 400); // camera chưa bind xong → thử lại
      }
    };
    probe();
    return () => { alive = false; };
  }, [isCaptureActive]);

  const toggleTorch = async () => {
    const next = !torchOn;
    const applied = await TreeReIDBridge.setTorch(next);
    setTorchOn(applied);
  };

  const toggleUltraWide = async () => {
    const next = !ultraWideOn;
    const applied = await TreeReIDBridge.setUltraWide(next);
    setUltraWideOn(applied);
    // Đổi lens reset đèn (iOS) → áp lại nếu user đang bật đèn.
    if (torchOn) {
      const t = await TreeReIDBridge.setTorch(true);
      setTorchOn(t);
    }
  };

  // ⚠ ĐÃ GỠ 2026-09-19 — `handleAdvanceToRound2` và `iosRound1Snapshot`.
  // Chúng chỉ phục vụ nút "Lượt 2: Cận gốc" đã bỏ. Cửa native `advanceToRound2()`
  // vẫn còn bên `TreeReIDBridge` và KHÔNG gỡ ở đợt này — màn đăng ký
  // (`TreeEnrollScreen`) còn gửi `round` lên máy chủ, nên đường đó phải bàn với
  // nhà OriLife trước. Ở màn NHẬN DIỆN thì không nơi nào gọi nữa.

  // ── iOS: Stop capture + identify ─────────────────────────────────────────
  const handleStopAndIdentify = async () => {
    try {
      setIsLoading(true);
      rLog.treeIdentity.stopAndIdentifyStart(iosCaptureCount);
      const stopResult = await TreeReIDBridge.stopCaptureSession();
      setIsCaptureActive(false);
      dispatch(setCapturing(false));

      const captureCount = stopResult?.captures.length ?? 0;
      rLog.treeIdentity.stopSessionResult(captureCount >= MIN_ROUND1, captureCount);

      if (!stopResult || captureCount < MIN_ROUND1) {
        showError('Chưa đủ góc',
          `Cần ít nhất ${MIN_ROUND1} góc chụp. Hiện có ${captureCount} góc.`);
        return;
      }

      // Lưu captures vào redux
      for (const cap of stopResult.captures) {
        dispatch(addCapture(cap));
      }

      // Dừng ở đây, KHÔNG nhận diện ngay. Ảnh chỉ có đường về tầng JS sau lượt
      // `stopCaptureSession()` này (`CaptureTriggered` lúc đang chụp không mang
      // `fileURL`), nên đây là khoảnh khắc DUY NHẤT trình được dải xem lại trước
      // khi gửi đi. Người không muốn xem thì bấm thẳng nút Nhận diện bên dưới —
      // dải này không chặn ai, theo đúng chốt *"cho sửa lại được nhưng k bắt buộc"*.
      setReviewCaptures(stopResult.captures);
    } catch (e: any) {
      rLog.nativeBridge.bridgeError('stopCaptureSession', e?.message ?? String(e));
      showError('Lỗi', 'Không thể dừng chụp. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Gửi loạt ảnh đã xem lại đi nhận diện.
   *
   * Tách khỏi `handleStopAndIdentify` vì hai lượt này nay là hai việc rời nhau:
   * dừng chụp thì luôn xảy ra, còn gửi đi thì người dùng quyết — và giữa hai lượt
   * họ có thể đã sửa vài nhãn. Nhãn sửa KHÔNG đi lên máy chủ (`identifyTree`
   * không có trường nào chở nó); nó chỉ quyết định màn hình có báo "đủ góc" hay
   * không. Đừng viết chú thích nói nó được gửi lên — nó không được gửi.
   */
  const handleConfirmIdentify = async () => {
    const caps = reviewCaptures;
    if (!caps || caps.length === 0) return;
    setReviewCaptures(null);
    await runIdentify(
      caps.map(c => `file://${c.fileURL}`),
      toCaptureOrientations(caps),
      autoTreeRegions(caps).regions,
    );
  };

  // ── Android: Thêm ảnh từ camera (react-native-image-picker) ───────────────
  const handleAndroidAddPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const res = await launchCamera(await withPhotoSave({
        mediaType: 'photo' as const,
        quality: 0.8 as const,
        maxWidth: 1280,
        maxHeight: 1280,
        saveToPhotos: true,
      }));
      if (res.didCancel) return;
      if (res.errorCode) {
        showError('Lỗi camera', res.errorMessage || 'Không mở được camera.');
        return;
      }
      const uri = res.assets?.[0]?.uri;
      if (uri) {
        setAndroidImageUris(prev => [...prev, uri]);
      }
    } catch (e: any) {
      showError('Lỗi', e?.message || 'Không chụp được ảnh.');
    }
  };

  /**
   * Chọn ảnh CÓ SẴN trong thư viện rồi nhận diện luôn.
   *
   * Lối này có mặt trên MỌI máy, kể cả máy có tầng chụp native — vì việc nó phục
   * vụ không phải "máy không chụp được" mà là "cây không còn ở trước mặt": ảnh
   * chụp hôm qua, ảnh người khác gửi, ảnh của mảnh vườn cách đó vài cây số.
   *
   * KHÔNG gửi `regions`/`captures`. Ảnh thư viện không có hai thứ đó, và gửi một
   * mảng dựng từ phiên chụp hiện tại là lệch chỉ số — xem chú thích ở
   * `lastIdentifyInput`.
   *
   * Quyền riêng tư: `LIBRARY_PICK_OPTIONS` giữ `quality < 1` + `maxWidth/Height`,
   * và đó là điều kiện DUY NHẤT làm bộ chọn dựng lại tệp và đánh rơi EXIF. Lý do
   * đo được nằm ở đầu `treeIdentifyFromLibrary.ts`; đừng nới hai số đó để "ảnh
   * nét hơn cho máy đối chiếu" mà không đọc chỗ ấy trước.
   */
  // Hàm thường, KHÔNG `useCallback`: `runIdentify` khai bằng `const` ở dưới, nên
  // một mảng phụ thuộc `[runIdentify]` chạy lúc dựng màn sẽ chạm vào nó khi nó
  // còn trong vùng chết và ném ReferenceError. `handleAndroidIdentify` ngay dưới
  // cũng là hàm thường vì đúng lý do này.
  const handlePickFromLibrary = async () => {
    const res = await launchImageLibrary(LIBRARY_PICK_OPTIONS);
    const picked = readLibraryPick(res as any, MIN_ROUND1);

    // Huỷ là hành động bình thường — không chữ đỏ nào.
    if (picked.blocked === 'cancelled') return;
    if (picked.blocked === 'failed') {
      showError('Không mở được thư viện ảnh',
        (res as any)?.errorMessage || 'Kiểm tra quyền truy cập ảnh của ứng dụng.');
      return;
    }
    if (picked.blocked === 'too-few') {
      showError('Chưa đủ ảnh',
        `Cần ít nhất ${MIN_ROUND1} ảnh của cùng một cây. Đã chọn ${picked.images.length} — còn thiếu ${picked.missing}.`);
      return;
    }
    await runIdentify(picked.images);
  };

  // ── Android: Identify với ảnh picker ──────────────────────────────────────
  const handleAndroidIdentify = async () => {
    if (androidImageUris.length < MIN_ROUND1) {
      showError('Chưa đủ ảnh',
        `Cần ít nhất ${MIN_ROUND1} ảnh. Hiện có ${androidImageUris.length} ảnh.`);
      return;
    }
    await runIdentify(androidImageUris);
  };

  // ── Đăng-ký-lại danh-tính (DID mồ côi) rồi nhận-diện tiếp ─────────────────
  // Keypair cũ còn nên registerIdentity sẽ recover DID cũ → reRegisterIdentity WIPE
  // trước để sinh DID MỚI + ghi genesis mới lên PhoenixKey. Xong tự thử identify lại.
  const reRegisterThenIdentify = async (imagePaths: string[]) => {
    setIsIdentifyingLocal(true);
    try {
      // Xác-định loại sinh-trắc để đặt đúng nhãn khoá (không đổi hành-vi ký).
      let kind: BiometricKind = 'strong';
      try {
        const { biometryType } = await new ReactNativeBiometrics().isSensorAvailable();
        kind = biometricKindFromType(biometryType);
      } catch { /* mặc-định 'strong' */ }

      const prevName = currentUser?.name;
      const { user } = await phoenixKeyAuth.reRegisterIdentity(kind);
      await clearOrilifeToken(); // token cũ (nếu có) gắn DID cũ → bỏ để login lại bằng DID mới
      // DID vừa ĐỔI, nên đồng hồ nghỉ sinh trắc của DID cũ không còn nói gì về DID
      // mới. Không mở van ở đây thì người vừa lập lại danh tính phải chờ một phút
      // mới vào được vườn, và không màn nào giải thích vì sao.
      clearOrilifeLoginCooldown();
      // Van thứ HAI. `reRegisterIdentity` đổi DID, nên đồng hồ nghỉ của đường đúc
      // thẻ PhoenixKey cũng hết nghĩa — mở cả hai, không thì người vừa lập lại
      // danh tính vào được vườn mà không dùng được ví trong một phút.
      clearSessionMintCooldown();
      // `.unwrap()` để lần đăng nhập trượt rơi vào `catch` dưới — xem `store/userSlice.ts`.
      await (dispatch(loginUser({ ...user, name: prevName } as any) as any) as any).unwrap();
      // Đăng-ký xong → thử nhận-diện lại luôn (ensureOrilifeToken sẽ ký bằng DID mới).
      await runIdentify(imagePaths);
    } catch (e: any) {
      setIsIdentifyingLocal(false);
      showError('Đăng ký lại thất bại', e?.message || 'Vui lòng thử lại.');
    }
  };

  // ── Core: Gọi API identify ────────────────────────────────────────────────
  const runIdentify = async (
    imagePaths: string[],
    orientations?: CaptureOrientation[],
    // Vùng cây theo TỪNG ảnh, suy từ box YOLO máy đã tính sẵn cho mỗi khung.
    // Bỏ trống ⟹ không gửi trường nào, máy chủ embed cả khung như trước.
    regions?: Array<TreeRegion | null>,
  ) => {
    lastIdentifyInput.current = { images: imagePaths, orientations, regions };
    setIsIdentifyingLocal(true);
    // Mỗi lần identify mới → xoá phán-quyết cũ.
    setQueryId(null);
    setVerdictSent(null);
    rLog.treeIdentity.apiStart(imagePaths.length, gpsRedux?.lat, gpsRedux?.lng);

    // Đảm bảo có token field-reid. Chưa có → đăng nhập DID bằng khoá PhoenixKey
    // (ký challenge bằng Secure Enclave/Keystore → server cấp token). Token TTL 12h
    // nên thường chỉ phải ký 1 lần/phiên.
    const tokenOk = await ensureOrilifeToken(BASE_URL);
    if (!tokenOk) {
      rLog.treeIdentity.apiError('did_login_failed', imagePaths.length);
      setIsIdentifyingLocal(false);
      // Phân-biệt DID MỒ CÔI (server PhoenixKey đã reset → DID local không còn trên
      // directory → OriLife trả 503) với lỗi tạm (mạng/server bận). Chỉ mời đăng-ký-lại
      // khi probe trả 404 chắc-chắn — tránh bắt user đăng-ký oan khi chỉ mất mạng.
      const registered = await phoenixKeyAuth.isIdentityRegisteredOnServer();
      if (registered === false) {
        showWarning('Danh tính chưa có trên máy chủ', 'Máy chủ nhận diện đã được làm mới nên danh tính cũ trên máy không còn hiệu lực. ' +
            'Đăng ký lại danh tính để tiếp tục nhận diện?', {
            confirmText: 'Đăng ký lại',
            cancelText: 'Huỷ',
            onConfirm: () => reRegisterThenIdentify(imagePaths),
        });
      } else {
        showError('Chưa nhận diện được',
          'Máy chủ nhận diện đang bận hoặc mạng chập chờn. Vui lòng thử lại sau ít phút.');
      }
      return;
    }

    const callIdentify = () =>
      identifyTree(BASE_URL, imagePaths, {
        lat: gpsRedux?.lat,
        lon: gpsRedux?.lng,
        // Sai số GPS. Đường đăng ký gửi (`TreeEnrollScreen.tsx:592`), đường soi thì
        // không — mà soi mới là chỗ toạ độ quyết định nhiều nhất (`EMPTY_BUCKET`,
        // `MOVED`, `moved_distance_m`). Máy chủ biết toạ độ mà không biết sai số
        // ±50m dưới tán thì không nới nổi bán kính, rồi báo "cây đã di chuyển"
        // hoặc mời đăng ký mới cho một cây đã có.
        acc: gpsRedux?.accuracy,
        heading: heading ?? undefined,
        pitch: pitch ?? undefined,
        // Hướng theo TỪNG ảnh — trước đây chỉ gửi một con số hiện-tại cho cả loạt,
        // tức mọi ảnh trông như chụp từ cùng một chỗ.
        captures: orientations,
        regions,
        headingRef: platformHeadingRef(),
        // M4: chỉ gửi khi tester đã bật toggle.
        matcher: matcher ?? undefined,
      });

    try {
      let result = await callIdentify();

      // Token hết hạn/không hợp lệ (401) → DID login lại 1 lần rồi thử lại.
      if (!result.ok && result.error?.type === 'auth_error') {
        const relog = await ensureOrilifeToken(BASE_URL, { force: true });
        if (relog) result = await callIdentify();
      }

      if (result.ok && result.data) {
        const data = result.data;
        rLog.treeIdentity.apiResult(
          data.decision,
          data.confidence ?? null,
          data.tree_id ?? null,
          data.query_id ?? null,
          data.s_top1 ?? null,
        );
        setIdentResult(data);
        dispatch(setIdentificationResult(data));
        // M2/M3: giữ query_id để gửi verdict (chỉ khi backend mới trả).
        setQueryId(data.query_id ?? null);

        if (data.decision === 'UNCERTAIN') {
          setShowConfirm(true);
        }
        // Các decision khác xử lý ở render / handleDecisionAction
      } else {
        rLog.treeIdentity.apiError(result.error?.detail ?? 'unknown', imagePaths.length);
        // Hiện câu gợi ý rõ ràng (flat/heterogeneous/need_gps...) thay vì "lỗi" chung (Lỗi field #3).
        showError('Chưa tạo được cây', fieldErrorMessage(result.error));
      }
    } catch (e: any) {
      rLog.treeIdentity.apiError(e?.message ?? String(e), imagePaths.length);
      showError('Lỗi nhận diện', 'Lỗi kết nối. Thử lại.');
    } finally {
      setIsIdentifyingLocal(false);
    }
  };

  /**
   * "Bồi ảnh xong rồi thì còn thiếu gì" — `GET /api/capture/plan` nhánh CÂY.
   *
   * Máy chủ có sẵn nhánh cây từ lâu (`shoot_around` · `shoot_bark` · `rotate`,
   * `capturePlanService.ts`), nhưng màn này chưa từng gọi. Nên sau khi thêm góc,
   * câu duy nhất người chụp đọc được là "Đã thêm: 3 góc" — một con số không nói
   * được là đủ hay chưa, và họ đứng ngay cạnh gốc cây lúc đó.
   *
   * `null` = im lặng: mạng hỏng, hoặc máy chủ nói đủ rồi. KHÔNG tự viết câu thay.
   */
  const treeCaptureHint = async (id: string): Promise<string | null> => {
    const r = await getCapturePlan(BASE_URL, 'tree', id).catch(() => null);
    return r?.ok ? captureHint(r.data) : null;
  };

  /** Ghép câu báo của app với câu hướng dẫn của máy chủ — bỏ vế nào không có. */
  const withHint = (body: string, hint: string | null): string =>
    hint ? `${body}\n\n${hint}` : body;

  // ── MATCH: cập nhật vị trí MOVED ──────────────────────────────────────────
  const handleUpdateLocation = async () => {
    if (!identResult?.tree_id || !gpsRedux) {
      showError('Lỗi', 'Không có GPS hoặc mã cây để cập nhật vị trí.');
      return;
    }
    try {
      setIsLoading(true);
      // Gọi verify_add với ĐÚNG bộ ảnh lượt nhận diện vừa gửi — không suy lại từ
      // trạng thái máy (xem `lastIdentifyInput`). Chưa có lượt nào thì nút này
      // không tới được, nhưng vế lùi vẫn giữ để không dựng một đường cụt.
      const sent = lastIdentifyInput.current;
      const imgs =
        sent?.images ??
        (TreeReIDBridge.isAvailable()
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris);

      // `farm_id` BẮT BUỘC. Thiếu nó máy chủ gán null và cây rơi khỏi bộ lọc
      // `/api/trees?farm_id=X` (`treeReIDService.ts:795-797`) — bổ sung ảnh xong
      // là cây biến mất khỏi vườn, người ta tưởng mất cây rồi đăng ký lại, sinh
      // cây trùng. Cổng nằm trong `addViewsToTree`: vườn chưa rõ thì KHÔNG gửi.
      const res = await addViewsToTree({
        baseUrl: BASE_URL,
        treeId: identResult.tree_id,
        imagePaths: imgs,
        farm: farmContext,
        gps: gpsRedux,
        // Hai trường này khớp `imagePaths` THEO CHỈ SỐ. Lượt ảnh thư viện không
        // có chúng, và `undefined` là câu trả lời đúng — hợp đồng đã ghi "bỏ
        // trống ⟹ không gửi trường nào". Dựng chúng từ `capturesRedux` cho một
        // mảng ảnh KHÁC là lệch chỉ số, và máy chủ vẫn trả 200.
        regions: sent
          ? sent.regions
          : TreeReIDBridge.isAvailable() ? autoTreeRegions(capturesRedux).regions : undefined,
        captures: sent
          ? sent.orientations
          : TreeReIDBridge.isAvailable() ? toCaptureOrientations(capturesRedux) : undefined,
        headingRef: platformHeadingRef(),
      });

      if (res.blocked === 'farm-required') {
        showWarning('Chưa lưu được vị trí', farmBlockedMessage(farmContext));
        return;
      }

      // ĐỌC CỜ, ĐỪNG ĐỌC MỖI TẦNG VẬN CHUYỂN. `res.ok` chỉ nói HTTP 200. Máy chủ
      // vẫn trả 200 kèm `{ok:false, added:false, reason:"ảnh không khớp cây này"}`
      // (`treeReIDService.ts:165-177`). Bản trước báo "Vị trí mới đã được lưu"
      // trong khi máy chủ chưa lưu gì — luật này chính file dịch vụ đã viết sẵn
      // cho một cửa khác ở `:938-941`, chỗ này chưa áp.
      if (res.ok && res.data?.ok !== false && res.data?.added !== false) {
        const hint = await treeCaptureHint(identResult.tree_id);
        showSuccess('Đã cập nhật', withHint('Vị trí mới của cây đã được lưu.', hint));
      } else {
        showError('Chưa cập nhật được',
          res.data?.reason ?? fieldErrorMessage(res.error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── UNCERTAIN: chọn candidate ─────────────────────────────────────────────
  const handleSelectCandidate = async (id: string | 'new') => {
    setShowConfirm(false);
    if (id === 'new') {
      navigation.navigate('TreeEnroll', {
        androidImagePaths:
          Platform.OS === 'android' && !TreeReIDBridge.isAvailable() ? androidImageUris : undefined,
        farmId,
      });
      return;
    }
    // Xác nhận candidate → thêm góc nhìn vào cây đó
    try {
      setIsLoading(true);
      // Cùng lý do như ở `handleUpdateLocation`: đọc bộ ảnh lượt nhận diện ĐÃ
      // gửi, đừng suy lại từ trạng thái máy.
      const sent = lastIdentifyInput.current;
      const imgs =
        sent?.images ??
        (TreeReIDBridge.isAvailable()
          ? capturesRedux.map(c => `file://${c.fileURL}`)
          : androidImageUris);

      const res = await addViewsToTree({
        baseUrl: BASE_URL,
        treeId: id,
        imagePaths: imgs,
        farm: farmContext,
        gps: gpsRedux,
        regions: sent
          ? sent.regions
          : TreeReIDBridge.isAvailable() ? autoTreeRegions(capturesRedux).regions : undefined,
        captures: sent
          ? sent.orientations
          : TreeReIDBridge.isAvailable() ? toCaptureOrientations(capturesRedux) : undefined,
        headingRef: platformHeadingRef(),
      });

      if (res.blocked === 'farm-required') {
        showWarning('Chưa thêm được góc', farmBlockedMessage(farmContext));
        return;
      }

      if (res.ok && res.data?.ok !== false && res.data?.added !== false) {
        // `n_added` là trường TUỲ CHỌN. `?? 0` biến "máy chủ không khai" thành
        // "đã lưu 0 góc" — nông dân đi vòng quanh cây chụp xong đọc "0 góc đã lưu"
        // thì tưởng công đổ sông đổ biển và chụp lại từ đầu.
        const n = res.data?.n_added;
        const hint = await treeCaptureHint(id);
        showSuccess('Đã xác nhận',
          withHint(
            n == null
              ? 'Góc nhìn mới đã thêm vào cây.'
              : `Góc nhìn mới đã thêm vào cây.\nĐã thêm: ${n} góc.`,
            hint,
          ));
      } else {
        showError('Chưa thêm được góc',
          res.data?.reason ?? fieldErrorMessage(res.error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Đăng ký cây mới (NO_MATCH / EMPTY_BUCKET) ────────────────────────────
  const handleRegisterNew = () => {
    navigation.navigate('TreeEnroll', {
      androidImagePaths: Platform.OS === 'android' ? androidImageUris : undefined,
      farmId,
    });
  };

  // ── "Không phải cây này — đây là CÂY MỚI" (từ luồng MATCH sai) ────────────
  // Field (Giang 13/07): server khớp NHẦM cây đã có (ngưỡng same-species chưa
  // calibrate) → user biết là cây khác NHƯNG bộ chọn "Cây khác" chỉ liệt kê cây
  // ĐÃ CÓ → KẸT, không tạo được cây mới nào nữa. Mở lối đăng-ký-mới ngay tại đây
  // để field không phải chờ server chỉnh ngưỡng.
  const handleRegisterNewFromMatch = () => {
    setShowTreePicker(false);
    // Phản hồi top-1 SAI (giúp server hiệu-chỉnh ngưỡng). Best-effort, không chặn UI.
    if (queryId && !verdictSent && !isSendingVerdict) {
      void sendVerdict('wrong');
    }
    handleRegisterNew();
  };

  // ── Reset về trạng thái ban đầu ───────────────────────────────────────────
  const handleReset = () => {
    rLog.treeIdentity.reset();
    setIdentResult(null);
    setShowFactors(false);
    setAndroidImageUris([]);
    setIosCaptureCount(0);
    // Cả góc chụp lẫn nhãn đặt tay phải sạch theo — giữ lại nhãn của loạt trước
    // thì cây sau thừa hưởng một quyết định của cây trước, và không gì báo.
    setCaptureAngles([]);
    setManualParts({});
    setCurrentRoundLocal(1);
    setIsCaptureActive(false);
    setQueryId(null);
    setVerdictSent(null);
    setShowTreePicker(false);
    dispatch(clearAll());
  };

  // Màn đăng ký gọi "Chụp lại"/"Ghi cây tiếp" → về đây SẠCH, không còn bảng kết quả cũ.
  const retake = route.params?.retake;
  useEffect(() => {
    if (!retake) return;
    handleReset();
    (navigation as any).setParams({ retake: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retake]);

  // ── M3: gửi phán-quyết (Đúng / Sai / Là-cây-khác) ─────────────────────────
  const sendVerdict = async (verdict: IdentifyVerdict, correctTid?: string) => {
    if (!queryId || verdictSent || isSendingVerdict) return;
    setIsSendingVerdict(true);
    rLog.treeIdentity.verdictSend(verdict, queryId, correctTid);
    try {
      const res = await submitIdentifyVerdict(BASE_URL, {
        queryId,
        verdict,
        correctTid,
      });
      if (res.ok) {
        rLog.treeIdentity.verdictResult(true);
        setVerdictSent(verdict);
      } else {
        rLog.treeIdentity.verdictResult(false, res.error?.detail ?? 'unknown');
        showError('Lỗi', res.error?.detail ?? 'Không gửi được phản hồi. Thử lại.');
      }
    } finally {
      setIsSendingVerdict(false);
    }
  };

  // ── M3: "Là cây khác" → nạp /api/trees rồi chọn correct_tid ───────────────
  const handleOpenTreePicker = async () => {
    if (verdictSent || isSendingVerdict) return;
    setShowTreePicker(true);
    setIsLoadingPicker(true);
    setPickerError(null);
    try {
      const res = await getTrees(BASE_URL, farmId);
      if (res.ok && res.trees) {
        setPickerTrees(res.trees);
      } else {
        setPickerError(res.error?.detail ?? 'Không tải được danh sách cây.');
      }
    } catch {
      setPickerError('Không tải được danh sách cây.');
    } finally {
      setIsLoadingPicker(false);
    }
  };

  const handlePickCorrectTree = async (treeId: string) => {
    setShowTreePicker(false);
    await sendVerdict('other', treeId);
  };

  // ── Render result panel ───────────────────────────────────────────────────
  const renderResultPanel = () => {
    if (!identResult) return null;
    const { decision, name, code, s_top1, margin, factors, moved_distance_m, confidence, suggest } =
      identResult as IdentifyResponse & {
        s_top1?: number;
        margin?: number;
        factors?: FactorScores;
      };
    // `margin` chỉ có nghĩa khi có TỪ HAI ứng viên: bucket một ứng viên trả margin
    // GIẢ bằng chính `s_top1` vì chưa so với ai (`server.py:3893-3896`). In nó ra ở
    // ca đó là bịa một khoảng cách với một cây không tồn tại.
    const marginTrustworthy = (identResult.candidates?.length ?? 0) >= 2;
    // owner_review: backend thiếu cờ = cho tạo mới (giữ hành-vi cũ).
    const allowEnrollNew = identResult.allow_enroll_new !== false;

    return (
      <ScrollView
        style={styles.resultPanel}
        contentContainerStyle={styles.resultPanelContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Badge */}
        <ResultBadge
          decision={decision}
          context="tree"
          extra={
            decision === 'MATCH'
              ? `${name ?? 'Không tên'} · ${code ?? 'N/A'}`
              : decision === 'MOVED'
                ? `Di chuyển ~${moved_distance_m?.toFixed(0) ?? '?'} m`
                : undefined
          }
        />

        {/* M2: băng tin-cậy THÔ (cao/vừa/thấp) — KHÔNG hiện điểm số */}
        {confidence && <ConfidenceBandView band={confidence} />}

        {/* Gợi ý hành-động từ server (suggest) — vd "đi vòng chụp thêm góc".
            Backend đôi khi trả OBJECT {message, channel, n_candidates} thay vì string
            → phải coerce, KHÔNG render thẳng object (crash "not valid React child"). */}
        {(() => {
          const suggestStr =
            typeof suggest === 'string'
              ? suggest
              : (suggest && typeof suggest === 'object'
                  ? String((suggest as { message?: unknown }).message ?? '')
                  : '');
          return suggestStr ? (
            <View style={styles.suggestBox}>
              <Icon name="lightbulb-on-outline" size={16} color={NEUTRAL.warning} />
              <Text style={styles.suggestText}>{suggestStr}</Text>
            </View>
          ) : null;
        })()}

        {/* Cảnh báo của máy chủ — trước đây bị bỏ HẾT. Đây là chỗ máy chủ giải thích
            vì sao nó vừa khó tính lên: cây thiếu toạ độ bị siết ngưỡng
            (`visual_reid.py:1879`), vùng khoanh quá nhỏ nên đã embed cả khung
            (`server.py:3909`), một vùng dùng chung nhiều ảnh… Không hiện ra thì nông
            dân chỉ thấy máy từ chối mà không biết vì sao, rồi chụp lại mãi. Câu đã
            có sẵn tiếng Việt, app không phải dịch. */}
        {(identResult.warnings ?? []).map((w, i) => (
          <View key={`warn-${i}`} style={styles.suggestBox}>
            <Icon name="alert-outline" size={16} color={NEUTRAL.warning} />
            <Text style={styles.suggestText}>{w}</Text>
          </View>
        ))}

        {/* TRẠNG THÁI THỨ BA: cây được chọn chưa có toạ độ. Không phải "trong bán
            kính", cũng không phải "ngoài bán kính" (#309, `server.py:3905`). Cách gỡ
            đúng là bổ sung vị trí, không phải chụp lại cả lô ảnh — nhưng cửa
            `POST /api/update_location` app CHƯA nối, nên ở đây chỉ nói thật là
            thiếu gì, không hứa một nút chưa có. */}
        {identResult.needs_location_update && (
          <View style={styles.suggestBox}>
            <Icon name="map-marker-alert-outline" size={16} color={NEUTRAL.warning} />
            <Text style={styles.suggestText}>
              Cây này chưa có toạ độ nên máy phải xét khắt khe hơn. Lần tới hãy đứng
              cạnh cây và bật định vị khi chụp.
            </Text>
          </View>
        )}

        {/* Bộ chọn vườn — chỉ hiện khi vườn CHƯA rõ.
            Vào màn này từ nút "Quét cây" (màn chính · hành động nhanh) hoặc từ màn
            "Quản lý cây" thì không có ngữ cảnh vườn nào cả. Nếu người dùng chỉ có
            MỘT vườn thì `resolveFarmContext` đã tự chọn, khối này không hiện —
            không thêm ma sát cho ca phổ biến nhất. */}
        {farmContext.status !== 'ready' && (
          <View style={styles.farmSection}>
            <Text style={styles.farmSectionTitle}>Vườn *</Text>
            {farmContext.status === 'loading' ? (
              <Text style={styles.farmWarnText}>Đang tải danh sách vườn...</Text>
            ) : (
              <>
                <View style={styles.farmChips}>
                  {farms.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.farmChip, pickedFarmId === f.id && styles.farmChipActive]}
                      onPress={() => setPickedFarmId(f.id)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Chọn vườn ${f.name}`}
                    >
                      <Icon
                        name={pickedFarmId === f.id ? 'check-circle' : 'sprout-outline'}
                        size={14}
                        color={pickedFarmId === f.id ? '#1b5e20' : NEUTRAL.textMuted}
                      />
                      <Text
                        style={[
                          styles.farmChipText,
                          pickedFarmId === f.id && styles.farmChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {f.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.farmChip}
                    onPress={() => (navigation as any).navigate('FarmDetail', { farm_id: null })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Tạo vườn mới"
                  >
                    <Icon name="plus" size={14} color="#1b5e20" />
                    <Text style={[styles.farmChipText, { color: '#1b5e20' }]}>Tạo vườn mới</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.farmWarnText}>{farmBlockedMessage(farmContext)}</Text>
              </>
            )}
          </View>
        )}

        {/* M3: phán-quyết người dùng — chỉ hiện khi backend trả query_id */}
        {queryId && (
          <View style={styles.verdictBox}>
            <Text style={styles.verdictTitle}>Kết quả này có đúng không?</Text>
            {verdictSent ? (
              <View style={styles.verdictDone}>
                <Icon name="check-circle" size={18} color="#1b5e20" />
                <Text style={styles.verdictDoneText}>
                  Đã ghi nhận phản hồi. Cảm ơn bạn.
                </Text>
              </View>
            ) : (
              <View style={styles.verdictRow}>
                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictCorrect]}
                  onPress={() => sendVerdict('correct')}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Kết quả đúng"
                >
                  <Icon name="thumb-up" size={16} color="#1b5e20" />
                  <Text style={[styles.verdictBtnText, { color: '#1b5e20' }]}>Đúng</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictWrong]}
                  onPress={() => sendVerdict('wrong')}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Kết quả sai"
                >
                  <Icon name="thumb-down" size={16} color="#c62828" />
                  <Text style={[styles.verdictBtnText, { color: '#c62828' }]}>Sai</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.verdictBtn, styles.verdictOther]}
                  onPress={handleOpenTreePicker}
                  disabled={isSendingVerdict}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Là cây khác"
                >
                  {/* `#3949ab` (Indigo 600) thay `#5c6bc0` (Indigo 400), đo
                      2026-09-11 bằng công thức tương phản WCAG 2.x trên chính
                      nền của nút (`verdictOther.backgroundColor = #e8eaf6`):

                        #5c6bc0 / #e8eaf6  = 4,06  ← TRƯỢT ngưỡng AA 4,5
                        #3949ab / #e8eaf6  = 6,46

                      Và nó lệch với hai nút ANH EM ngay cạnh, vốn đều đạt:
                      "Đúng cây" 7,00 · "Sai cây" 4,92. Chữ 13px đậm vẫn tính
                      theo ngưỡng chữ THƯỜNG (ngưỡng 3:1 chỉ áp từ 14pt đậm). */}
                  <Icon name="swap-horizontal" size={16} color="#3949ab" />
                  <Text style={[styles.verdictBtnText, { color: '#3949ab' }]}>Cây khác</Text>
                </TouchableOpacity>
              </View>
            )}
            {isSendingVerdict && (
              <View style={styles.verdictSending}>
                <ActivityIndicator size="small" color={NEUTRAL.textSub} />
                <Text style={styles.verdictSendingText}>Đang gửi...</Text>
              </View>
            )}
          </View>
        )}

        {/* MATCH: chi tiết */}
        {decision === 'MATCH' && (
          <View style={styles.matchDetail}>
            <View style={styles.matchRow}>
              <Icon name="tree" size={16} color="#1b5e20" />
              <Text style={styles.matchLabel}>Tên cây</Text>
              <Text style={styles.matchValue}>{name ?? '—'}</Text>
            </View>
            <View style={styles.matchRow}>
              <Icon name="barcode" size={16} color="#1b5e20" />
              <Text style={styles.matchLabel}>Mã</Text>
              <Text style={styles.matchValue}>{code ?? '—'}</Text>
            </View>
            {typeof s_top1 === 'number' && (
              <View style={styles.matchRow}>
                <Icon name="percent" size={16} color="#1b5e20" />
                <Text style={styles.matchLabel}>Độ giống</Text>
                <Text style={styles.matchValue}>
                  {Math.round(s_top1 * 100)}%
                  {typeof margin === 'number' && marginTrustworthy
                    ? ` (+${Math.round(margin * 100)}% so với cây tiếp theo)`
                    : ''}
                </Text>
              </View>
            )}

            {/* Toggle factor breakdown */}
            <TouchableOpacity
              style={styles.factorToggle}
              onPress={() => setShowFactors(v => !v)}
              activeOpacity={0.7}
            >
              <Icon
                name={showFactors ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={NEUTRAL.textSub}
              />
              <Text style={styles.factorToggleText}>
                {showFactors ? 'Ẩn chi tiết' : 'Xem chi tiết 4 tín hiệu'}
              </Text>
            </TouchableOpacity>

            {factors && (
              <FactorBreakdown
                factors={factors}
                visible={showFactors}
              />
            )}
          </View>
        )}

        {/* MATCH nhưng SAI cây → lối thoát đăng-ký cây mới.
            Server có thể khớp NHẦM cây cùng-loài (ngưỡng chưa calibrate). Không có
            lối này thì user KẸT: "Cây khác" chỉ chọn được cây đã có (field Giang 13/07). */}
        {decision === 'MATCH' && allowEnrollNew && (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.btnOutlineGreen]}
              onPress={handleRegisterNewFromMatch}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Không phải cây này, đăng ký cây mới"
            >
              <Icon name="plus-circle-outline" size={18} color="#1b5e20" />
              <Text style={[styles.decisionBtnText, { color: '#1b5e20' }]}>
                Không phải cây này — Đăng ký cây mới
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* MOVED: nút cập nhật vị trí */}
        {decision === 'MOVED' && (
          <View style={styles.actionGroup}>
            <Text style={styles.movedHint}>
              Vị trí GPS hiện tại cách vị trí đã lưu{' '}
              <Text style={styles.movedDist}>
                ~{moved_distance_m?.toFixed(0) ?? '?'} m
              </Text>
              . Nếu cây đã được chuyển đến đây, bấm cập nhật.
            </Text>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.btnBlue]}
              onPress={handleUpdateLocation}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={NEUTRAL.white} />
              ) : (
                <>
                  <Icon name="map-marker-right" size={18} color={NEUTRAL.white} />
                  <Text style={styles.decisionBtnText}>Cập nhật vị trí</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* NO_MATCH / EMPTY_BUCKET: đăng ký mới (chỉ khi server CHO PHÉP) */}
        {(decision === 'NO_MATCH' || decision === 'EMPTY_BUCKET') && (
          <View style={styles.actionGroup}>
            <Text style={styles.noMatchHint}>
              {decision === 'EMPTY_BUCKET'
                ? 'Chưa có cây nào gần vị trí này.'
                : 'Cây chưa được đăng ký trong hệ thống.'}
            </Text>
            {allowEnrollNew ? (
              <TouchableOpacity
                style={[styles.decisionBtn, styles.btnGreen]}
                onPress={handleRegisterNew}
                activeOpacity={0.8}
              >
                <Icon name="plus-circle" size={18} color={NEUTRAL.white} />
                <Text style={styles.decisionBtnText}>Đăng ký cây mới</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noMatchHint}>
                Kết quả chưa chắc chắn — hãy chụp thêm góc khác hoặc nhờ chủ vườn xác nhận. Tạm chưa thể đăng ký cây mới ở đây.
              </Text>
            )}
          </View>
        )}

        {/* Nút nhận diện lại */}
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Icon name="refresh" size={16} color={NEUTRAL.textSub} />
          <Text style={styles.retryBtnText}>Nhận diện lại</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Render bottom controls ─────────────────────────────────────────────────
  const renderControls = () => {
    if (identResult) return null;

    // Android KHÔNG có native → controls chụp tay (picker). Có native → dùng chung controls
    // guided với iOS bên dưới (Bắt đầu / Lượt 2 / Nhận diện).
    if (Platform.OS === 'android' && !TreeReIDBridge.isAvailable()) {
      return (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnSecondary]}
            onPress={handleAndroidAddPhoto}
            activeOpacity={0.8}
          >
            <Icon name="camera-plus" size={22} color={CAM} />
            <Text style={styles.ctrlBtnSecText}>
              Chụp ảnh ({androidImageUris.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="tree-identify-from-library"
            style={[styles.ctrlBtn, styles.ctrlBtnSecondary]}
            onPress={handlePickFromLibrary}
            disabled={isIdentifyingLocal}
            activeOpacity={0.8}
          >
            <Icon name="image-multiple" size={22} color={CAM} />
            <Text style={styles.ctrlBtnSecText}>Chọn ảnh có sẵn</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ctrlBtn,
              styles.ctrlBtnPrimary,
              (isIdentifyingLocal || androidImageUris.length < MIN_ROUND1) &&
              styles.ctrlBtnDisabled,
            ]}
            onPress={handleAndroidIdentify}
            disabled={isIdentifyingLocal || androidImageUris.length < MIN_ROUND1}
            activeOpacity={0.8}
          >
            {isIdentifyingLocal ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Icon name="magnify" size={22} color="#000000" />
                <Text style={styles.ctrlBtnText}>{tk('trace.identify.doIdentifyShort')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // iOS
    if (!isCaptureActive) {
      return (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnPrimary]}
            onPress={handleStartCapture}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Icon name="camera-enhance" size={22} color="#000000" />
                <Text style={styles.ctrlBtnText}>Bắt đầu</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Lối ảnh có sẵn — đứng cạnh lối chụp, KHÔNG thay nó.
              Nó phục vụ ca "cây không còn ở trước mặt", không phải ca "máy không
              chụp được": ảnh chụp hôm qua, ảnh người khác gửi. Nút phụ chứ không
              phải nút chính, vì lối chụp dẫn vẫn cho kết quả tốt hơn — nó gửi kèm
              vùng cây và hướng máy, còn ảnh thư viện thì không có gì cả. */}
          <TouchableOpacity
            testID="tree-identify-from-library"
            style={[styles.ctrlBtn, styles.ctrlBtnSecondary]}
            onPress={handlePickFromLibrary}
            disabled={isLoading || isIdentifyingLocal}
            activeOpacity={0.8}
          >
            <Icon name="image-multiple" size={22} color={CAM} />
            <Text style={styles.ctrlBtnSecText}>Chọn ảnh có sẵn</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.controls}>
        {/* ⚠ ĐÃ GỠ 2026-09-19 — nút "Lượt 2: Cận gốc".
            Chủ sở hữu bác lối hai lượt: *"Đừng bắt nông dân phải dừng lại chuyển
            nút bấm giữa chừng."* Gỡ được mà không mất gì, vì ba số đo ở đầu
            `treeCaptureParts.ts`: nhãn lượt không bao giờ được gửi lên máy chủ,
            tầng native vốn đã tự chụp khi máy chúc xuống (`|Δpitch| ≥ 18°`), và
            trần 12 ảnh mỗi lượt là mã chết.
            ĐỪNG dựng lại nút này. Thứ nó từng làm — cho máy biết đâu là ảnh gốc —
            nay do `partitionCaptures` làm, và làm cho CẢ những ảnh chụp trước lúc
            người dùng kịp bấm. */}

        {/* Dải xem lại chỉ có mặt SAU khi dừng chụp — trước đó tầng JS chưa có
            đường dẫn ảnh nào để vẽ. Nó không chặn nút bên dưới. */}
        {reviewCaptures && reviewCaptures.length > 0 && (
          <TreePartReviewStrip
            shots={reviewCaptures.map(c => ({
              id: c.id,
              uri: c.fileURL.startsWith('file://') ? c.fileURL : `file://${c.fileURL}`,
              pitch: typeof c.pitch === 'number' ? c.pitch : null,
            }))}
            manualParts={manualParts}
            onChangeManualParts={setManualParts}
          />
        )}

        <TouchableOpacity
          style={[
            styles.ctrlBtn,
            styles.ctrlBtnPrimary,
            (isLoading || isIdentifyingLocal || !readyToIdentify) &&
            styles.ctrlBtnDisabled,
          ]}
          onPress={reviewCaptures ? handleConfirmIdentify : handleStopAndIdentify}
          disabled={isLoading || isIdentifyingLocal || !readyToIdentify}
          activeOpacity={0.8}
        >
          {isLoading || isIdentifyingLocal ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <Icon name="check-circle" size={22} color="#000000" />
              <Text style={styles.ctrlBtnText}>
                {tk('trace.identify.doIdentify', { n: totalCaptures })}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Nút mờ phải NÓI VÌ SAO nó mờ.
            Đo trên máy ảo iPhone 17 ngày 14/09/2026: bấm `Nhận diện (0 góc)` khi chưa
            có góc nào — không có gì xảy ra, không một chữ nào. Người dùng không phân
            biệt được "nút hỏng" với "mình chưa làm đủ", và cách duy nhất để biết là
            đoán ra nghĩa của con số trong ngoặc.
            Màn `ActivityScreen` ở cùng kho đã làm đúng: nút `Lưu vào sổ` mờ thì bên
            cạnh có chữ "Cần quay trước đã". Dòng dưới đây mang cùng vai, và nói thêm
            phần `ActivityScreen` không cần nói: CÒN THIẾU BAO NHIÊU. */}
        {!isLoading && !isIdentifyingLocal && !readyToIdentify && (
          <Text style={styles.ctrlHintText}>
            {doChiaDuoc
              ? getGuidance()
              : tk('trace.identify.needMoreAngles', {
                n: Math.max(0, MIN_ROUND1 - totalCaptures),
                min: MIN_ROUND1,
              })}
          </Text>
        )}
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  const nativeHudActive = TreeReIDBridge.isAvailable() && isCaptureActive && !identResult;

  return (
    <View style={styles.container}>
      {/* Header (vùng đen) */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={1}
          // M4 (ẩn): giữ tiêu-đề ~1s để mở chọn matcher vỏ-thân (tester).
          onLongPress={() => setShowMatcherPicker(true)}
          delayLongPress={900}
        >
          <Text style={styles.headerTitle}>Nhận diện cây</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {matcher && (
            <View style={styles.matcherChip} accessibilityLabel={`Matcher ${matcher}`}>
              <Text style={styles.matcherChipText}>{matcher}</Text>
            </View>
          )}
        </View>
      </View>

      {identResult ? (
        /* Result panel (nền đục, đọc rõ) */
        renderResultPanel()
      ) : (
        <>
          {/* ══ VÙNG GIỮA: CAMERA ══ */}
          <View style={styles.cameraZone}>
            {TreeReIDBridge.isAvailable() && isCaptureActive && NativeCameraPreview ? (
              <NativeCameraPreview style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Icon
                  name={
                    Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                      ? 'camera-outline'
                      : 'camera-enhance-outline'
                  }
                  size={64}
                  color="rgba(255,255,255,0.35)"
                />
                <Text style={styles.previewPlaceholderText}>
                  {Platform.OS === 'android' && !TreeReIDBridge.isAvailable()
                    ? 'Bấm "Chụp ảnh" bên dưới'
                    : 'Bấm "Bắt đầu" để mở camera'}
                </Text>
              </View>
            )}
            {/* Nháy "chụp" dịu — chỉ trong khung camera */}
            {nativeHudActive && <CaptureFlash count={totalCaptures} />}

            {/* Điều-khiển cam: đèn (mặc-định TẮT) + lens 0.5x. Chỉ hiện khi máy hỗ-trợ. */}
            {TreeReIDBridge.isAvailable() && isCaptureActive && (
              <View style={styles.camControls}>
                {camCaps.hasTorch && (
                  <TouchableOpacity
                    style={[styles.camCtrlBtn, torchOn && styles.camCtrlBtnOn]}
                    onPress={toggleTorch}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name={torchOn ? 'flash' : 'flash-off'}
                      size={20}
                      color={torchOn ? '#1a1a1a' : NEUTRAL.white}
                    />
                  </TouchableOpacity>
                )}
                {camCaps.supportsUltraWide && (
                  <TouchableOpacity
                    style={[styles.camCtrlBtn, ultraWideOn && styles.camCtrlBtnOn]}
                    onPress={toggleUltraWide}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.camCtrlText, ultraWideOn && styles.camCtrlTextOn]}>
                      {ultraWideOn ? '0.5x' : '1x'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {nativeHudActive && (
            <View style={styles.topZone}>
              <CompassHologram heading={heading} />
              <View style={styles.zoneDivider} />
              <TiltZone pitch={pitch} roll={roll} yaw={heading} />
            </View>
          )}
          {/* ══ VÙNG DƯỚI (đen): LƯỢT + SỐ ẢNH + hướng dẫn ══ */}
          <View style={styles.bottomZone}>
            {nativeHudActive && (
              <View style={styles.bottomRow}>
                {/* Hai ô này nay là THANH TIẾN ĐỘ, không phải hai chế độ.
                    Không còn ô nào "đang bật" — người dùng không ở trong lượt
                    nào cả, họ chỉ đang lia máy. Ô nào ĐỦ thì sáng lên; đó là
                    thông tin duy nhất họ cần đọc từ đây. */}
                <View style={styles.roundGroup}>
                  <View
                    style={[
                      styles.roundChip,
                      missing.trunk === 0 && styles.roundChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundChipText,
                        missing.trunk === 0 && styles.roundChipTextActive,
                      ]}
                    >
                      Thân
                    </Text>
                    <Text
                      style={[
                        styles.roundChipCount,
                        missing.trunk === 0 && styles.roundChipCountActive,
                      ]}
                    >
                      {partition.trunk}/{MIN_ROUND1}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.roundChip,
                      missing.base === 0 && styles.roundChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundChipText,
                        missing.base === 0 && styles.roundChipTextActive,
                      ]}
                    >
                      Gốc
                    </Text>
                    <Text
                      style={[
                        styles.roundChipCount,
                        missing.base === 0 && styles.roundChipCountActive,
                      ]}
                    >
                      {partition.base}/{MIN_ROUND2}
                    </Text>
                  </View>
                </View>

                <PhotoCount count={totalCaptures} shouldCapture={shouldCapture} />
              </View>
            )}

            {/* Hướng dẫn */}
            <View style={styles.guidanceRow}>
              <Icon name="information-outline" size={16} color={CAM} />
              <Text style={styles.guidanceText}>{getGuidance()}</Text>
            </View>
          </View>

          {/* Controls */}
          {renderControls()}
        </>
      )}

      {/* Loading overlay khi đang identify */}
      {(isIdentifyingLocal || isIdentifyingRedux) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.overlayText}>Đang nhận diện cây...</Text>
        </View>
      )}

      {/* UNCERTAIN dialog — map TreeCandidate → ReidCandidate */}
      <ReidConfirmDialog
        visible={showConfirm}
        context="tree"
        candidates={
          (identResult?.candidates ?? []).map(
            (c): ReidCandidate => ({
              id: c.tree_id,
              name: c.name ?? '',
              code: c.code ?? undefined,
              sim: c.score,
              near_prev: c.near_prev,
              has3d: c.has3d,
              anchor: c.anchor ?? undefined,
            }),
          )
        }
        onSelect={handleSelectCandidate}
        onDismiss={() => setShowConfirm(false)}
        allowNew={identResult?.allow_enroll_new !== false}
        suggestText={identResult?.suggest}
      />

      {/* M3: bộ chọn "cây khác" (correct_tid từ /api/trees) */}
      <Modal
        visible={showTreePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTreePicker(false)}
        statusBarTranslucent
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Chọn cây đúng</Text>
              <TouchableOpacity
                onPress={() => setShowTreePicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Đóng"
                accessibilityRole="button"
              >
                <Icon name="close" size={20} color={NEUTRAL.textMuted} />
              </TouchableOpacity>
            </View>

            {isLoadingPicker ? (
              <View style={styles.pickerCenter}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.pickerHint}>Đang tải danh sách cây...</Text>
              </View>
            ) : pickerError ? (
              <View style={styles.pickerCenter}>
                <Icon name="alert-circle-outline" size={36} color={NEUTRAL.textMuted} />
                <Text style={styles.pickerHint}>{pickerError}</Text>
                <TouchableOpacity
                  style={styles.pickerRetry}
                  onPress={handleOpenTreePicker}
                  activeOpacity={0.7}
                >
                  <Icon name="refresh" size={15} color={COLORS.accent} />
                  <Text style={styles.pickerRetryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : pickerTrees.length === 0 ? (
              <View style={styles.pickerCenter}>
                <Icon name="tree-outline" size={36} color={NEUTRAL.textMuted} />
                <Text style={styles.pickerHint}>Chưa có cây nào trong vườn.</Text>
              </View>
            ) : (
              <FlatList
                data={pickerTrees}
                keyExtractor={t => t.tree_id}
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => handlePickCorrectTree(item.tree_id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn cây ${item.name || 'Không tên'}`}
                  >
                    <Icon name="tree" size={20} color="#1b5e20" />
                    <View style={styles.pickerRowBody}>
                      <Text style={styles.pickerRowName} numberOfLines={1}>
                        {item.name || 'Không tên'}
                      </Text>
                      {(item.code ?? null) && (
                        <Text style={styles.pickerRowSub} numberOfLines={1}>
                          Mã: {item.code}
                        </Text>
                      )}
                    </View>
                    <Icon name="chevron-right" size={20} color={NEUTRAL.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}

            {/* LỐI THOÁT: không cây nào trong danh sách là đúng → ĐÂY LÀ CÂY MỚI.
                Thiếu lối này thì khi server khớp NHẦM, user KẸT không tạo được cây
                mới nào nữa (field Giang 13/07). */}
            {!isLoadingPicker && !pickerError && (
              <TouchableOpacity
                style={styles.pickerNewBtn}
                onPress={handleRegisterNewFromMatch}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Đây là cây mới, đăng ký cây mới"
              >
                <Icon name="plus-circle" size={20} color="#1b5e20" />
                <View style={styles.pickerRowBody}>
                  <Text style={styles.pickerNewTitle}>Đây là cây mới</Text>
                  <Text style={styles.pickerRowSub}>
                    Không phải cây nào ở trên — đăng ký thành cây mới
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color="#1b5e20" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* M4 (ẩn): chọn matcher vỏ-thân — tester */}
      <Modal
        visible={showMatcherPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMatcherPicker(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.matcherOverlay}
          activeOpacity={1}
          onPress={() => setShowMatcherPicker(false)}
        >
          <View style={styles.matcherSheet}>
            <Text style={styles.matcherTitle}>Matcher vỏ-thân (tester)</Text>
            <Text style={styles.matcherSub}>
              Ép thuật-toán khớp cho lần nhận diện sau. Mặc-định dùng cấu-hình máy chủ.
            </Text>
            {(['sift', 'xfeat', 'loftr'] as ShellMatcher[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.matcherOption, matcher === m && styles.matcherOptionActive]}
                onPress={() => {
                  setMatcher(m);
                  setShowMatcherPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.matcherOptionText,
                    matcher === m && styles.matcherOptionTextActive,
                  ]}
                >
                  {m}
                </Text>
                {matcher === m && <Icon name="check" size={16} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.matcherOption, matcher === null && styles.matcherOptionActive]}
              onPress={() => {
                setMatcher(null);
                setShowMatcherPicker(false);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.matcherOptionText,
                  matcher === null && styles.matcherOptionTextActive,
                ]}
              >
                Mặc-định (máy chủ)
              </Text>
              {matcher === null && <Icon name="check" size={16} color={COLORS.accent} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ConfidenceBandView — băng tin-cậy THÔ (M2): cao/vừa/thấp, KHÔNG điểm số
// ---------------------------------------------------------------------------

const BAND_META: Record<ConfidenceBand, { label: string; color: string; bg: string; icon: string }> = {
  cao: { label: 'Tin cậy cao', color: '#1b5e20', bg: '#e8f5e9', icon: 'shield-check' },
  'vừa': { label: 'Tin cậy vừa', color: '#e65100', bg: '#fff3e0', icon: 'shield-half-full' },
  'thấp': { label: 'Tin cậy thấp', color: '#c62828', bg: '#ffebee', icon: 'shield-alert' },
};

const ConfidenceBandView: React.FC<{ band: ConfidenceBand }> = ({ band }) => {
  const m = BAND_META[band];
  return (
    <View
      style={[styles.bandBox, { backgroundColor: m.bg }]}
      accessible
      accessibilityLabel={m.label}
    >
      <Icon name={m.icon} size={18} color={m.color} />
      <Text style={[styles.bandText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// HUD — hologram tokens dùng chung cho compass / tilt / capture
// ---------------------------------------------------------------------------

// Palette CHỤP ẢNH: CAM / ĐEN / TRẮNG — tương phản cao, gọn gàng.
const CAM = "#4d8bdc";                       // cam nhấn (điểm nhìn chính)
const CAM_DIM = 'rgba(0, 174, 255, 0.46)';
const HUD_BORDER = 'rgba(255,255,255,0.16)'; // viền trắng mờ, gọn
const PANEL_BG = '#0B0D0C';                  // nền 3 VÙNG đen (đồng đều)

const CARDINALS_FULL = [
  'Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc',
] as const;

// La bàn (kiểu iPhone): mặt phẳng, bán kính nhỏ (đường kính = chiều cao zone góc).
// Vạch chia 6°/vạch, BỎ vạch ở 4 điểm B/Đ/N/T (chỉ ghi chữ để không đè). Mũi trỏ
// cam cố định ở đỉnh.
const DIAL_SIZE = 95;
const DIAL_C = DIAL_SIZE / 2;
const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => i * 6).filter(a => a % 90 !== 0);
const WIND_R = 35; // bán kính đặt chữ hướng
const WIND_DEFS = [
  { t: 'B', a: 0 }, { t: 'Đ', a: 90 }, { t: 'N', a: 180 }, { t: 'T', a: 270 },
];
const WINDS = WIND_DEFS.map(w => {
  const rad = (w.a * Math.PI) / 180;
  return {
    ...w,
    x: DIAL_C + WIND_R * Math.sin(rad) - 9, // box rộng 18 → lệch nửa
    y: DIAL_C - WIND_R * Math.cos(rad) - 8, // box cao 16 → lệch nửa
  };
});

// ---------------------------------------------------------------------------
// CompassHologram — la bàn kiểu iPhone: mặt đĩa phẳng nhiều lớp (có chiều sâu),
// VÀNH XOAY ngược theo heading + mũi trỏ đỏ cố định ở đỉnh; thông số hướng gom
// vào 1 zone (giống zone độ nghiêng). Thuần Animated + transform.
// ---------------------------------------------------------------------------

const CompassHologram: React.FC<{ heading: number | null }> = ({ heading }) => {
  const rot = useRef(new Animated.Value(0)).current;   // góc vành liên-tục (unwrap)
  const contRef = useRef(0);
  const prevRef = useRef<number | null>(null);

  // Vành xoay NGƯỢC heading (−heading) để hướng thực nằm dưới mũi trỏ đỉnh.
  // Đi theo đường ngắn nhất để không giật khi qua mốc 0°/360°.
  useEffect(() => {
    if (heading == null) return;
    const target = (((-heading % 360) + 360) % 360);
    const prev = prevRef.current;
    if (prev == null) {
      contRef.current = target;
      rot.setValue(target);
      prevRef.current = target;
      return;
    }
    let d = target - prev;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    contRef.current += d;
    prevRef.current = target;
    Animated.timing(rot, {
      toValue: contRef.current,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heading, rot]);

  const dialSpin = rot.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const deg = heading == null ? null : (((Math.round(heading) % 360) + 360) % 360);
  const idx = deg == null ? 0 : Math.round(deg / 45) % 8;
  const fullName = deg == null ? '--' : CARDINALS_FULL[idx];

  return (
    <View style={styles.compassBlock} pointerEvents="none">
      {/* ── Đĩa la bàn ── */}
      <View style={styles.dial}>
        {/* Lớp nền tạo chiều sâu */}
        <View style={styles.dialFace} />
        <View style={styles.dialRingOuter} />

        {/* Vành xoay: vạch chia (bỏ ở B/Đ/N/T) + chữ hướng */}
        <Animated.View style={[styles.dialRotor, { transform: [{ rotate: dialSpin }] }]}>
          {DIAL_TICKS.map(a => (
            <View
              key={a}
              style={[styles.dTickSlot, { transform: [{ rotate: `${a}deg` }] }]}
            >
              <View style={[styles.dTick, a % 30 === 0 && styles.dTickMajor]} />
            </View>
          ))}
          {WINDS.map(w => (
            <Text
              key={w.t}
              style={[styles.windLabel, { left: w.x, top: w.y }, w.a === 0 && styles.windLabelN]}
            >
              {w.t}
            </Text>
          ))}
        </Animated.View>

        {/* Mũi trỏ cam cố định ở đỉnh */}
        <View style={styles.dialPointer} />

        {/* Số độ ở tâm (cố định, không xoay) */}
        <View style={styles.dialCenter}>
          <Text style={styles.dialDeg}>{deg == null ? '--' : `${deg}°`}</Text>
        </View>
      </View>

      <Text style={styles.compassCaption} numberOfLines={1}>{fullName}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// TiltZone — đo độ nghiêng kiểu iPhone: bọt nước (Roll↔X, Pitch↕Y) + 3 chỉ số
// Pitch (ngửa/cúi) · Roll (nghiêng T/P) · Yaw (xoay trục đứng ≈ heading).
// ---------------------------------------------------------------------------

const LEVEL_EPS = 3;         // ngưỡng coi như "cân bằng" (±3°)
const BUBBLE_TRAVEL = 34;    // px bọt di chuyển tối đa

const tiltHint = (v: number | null, pos: string, neg: string): string => {
  if (v == null) return '';
  if (Math.abs(v) < LEVEL_EPS) return 'Cân';
  return v > 0 ? pos : neg;
};

const TiltRow: React.FC<{
  label: string;
  value: number | null;
  hint: string;
}> = ({ label, value, hint }) => (
  <View style={styles.tiltRow}>
    <Text style={styles.tiltRowLabel}>{label}</Text>
    <Text style={styles.tiltRowVal}>{value == null ? '--' : `${Math.round(value)}°`}</Text>
    {!!hint && <Text style={styles.tiltRowHint}>{hint}</Text>}
  </View>
);

const TiltZone: React.FC<{
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
}> = ({ pitch, roll, yaw }) => {
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const clamp = (v: number) => Math.max(-BUBBLE_TRAVEL, Math.min(BUBBLE_TRAVEL, v));
    const nx = roll == null ? 0 : clamp((roll / 45) * BUBBLE_TRAVEL);
    const ny = pitch == null ? 0 : clamp((pitch / 45) * BUBBLE_TRAVEL);
    Animated.spring(tx, { toValue: nx, useNativeDriver: true, friction: 6, tension: 55 }).start();
    Animated.spring(ty, { toValue: ny, useNativeDriver: true, friction: 6, tension: 55 }).start();
  }, [pitch, roll, tx, ty]);

  const level =
    pitch != null &&
    roll != null &&
    Math.abs(pitch) < LEVEL_EPS &&
    Math.abs(roll) < LEVEL_EPS;

  return (
    <View style={styles.tiltWrap} pointerEvents="none">
      <View style={[styles.tiltCircle, level && styles.tiltCircleLevel]}>
        <View style={styles.crossH} />
        <View style={styles.crossV} />
        <View style={[styles.tiltTarget, level && styles.tiltTargetLevel]} />
        <Animated.View
          style={[
            styles.bubble,
            level && styles.bubbleLevel,
            { transform: [{ translateX: tx }, { translateY: ty }] },
          ]}
        />
      </View>
      <View style={styles.tiltReadouts}>
        <TiltRow label="Ngẩng" value={pitch} hint={tiltHint(pitch, 'Cúi', 'Ngửa')} />
        <TiltRow label="Nghiêng" value={roll} hint={tiltHint(roll, 'Phải', 'Trái')} />
        <TiltRow label="Xoay" value={yaw} hint="" />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// CaptureFlash — nháy màn "chụp" dịu, chỉ phủ trong khung camera (auto-capture)
// ---------------------------------------------------------------------------

const CaptureFlash: React.FC<{ count: number }> = ({ count }) => {
  const flash = useRef(new Animated.Value(0)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.26, duration: 90, useNativeDriver: true }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, flash]);

  return (
    <Animated.View pointerEvents="none" style={[styles.captureFlash, { opacity: flash }]} />
  );
};

// ---------------------------------------------------------------------------
// PhotoCount — bộ đếm số ảnh (nảy nhẹ mỗi lần chụp), đặt ở vùng dưới
// ---------------------------------------------------------------------------

const PhotoCount: React.FC<{ count: number; shouldCapture: boolean }> = ({
  count,
  shouldCapture,
}) => {
  const pop = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.28, useNativeDriver: true, friction: 4, tension: 140 }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, pop]);

  return (
    <Animated.View
      style={[
        styles.counterPill,
        shouldCapture && styles.counterPillHot,
        { transform: [{ scale: pop }] },
      ]}
    >
      <Icon name="camera-iris" size={18} color={CAM} />
      <Text style={styles.counterNum}>{count}</Text>
      <Text style={styles.counterLabel}>ảnh</Text>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#1b5e20';   // brand xanh module cây (đồng bộ ResultBadge MATCH — panel kết quả)

// Đổ bóng nhẹ — chiều sâu hiện đại, đồng bộ token shadow.
const cardShadow = {
  shadowColor: '#0F1614',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PANEL_BG },

  // ── 3 VÙNG chính (đồng đều): trên đen · camera · dưới đen ──────────────────
  topZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  zoneDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cameraZone: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 10,
    alignItems: 'center',
  },
  camCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camCtrlBtnOn: {
    backgroundColor: '#FFD34E',
    borderColor: '#FFD34E',
  },
  camCtrlText: { color: NEUTRAL.white, fontSize: 13, fontWeight: '800' },
  camCtrlTextOn: { color: '#1a1a1a' },
  bottomZone: {
    backgroundColor: PANEL_BG,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roundGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PANEL_BG,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    color: NEUTRAL.white,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: { width: 40, alignItems: 'flex-end' },

  previewPlaceholder: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  previewPlaceholderText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },

  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  roundChipActive: {
    backgroundColor: CAM,
    borderColor: CAM,
  },
  roundChipText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  roundChipTextActive: { color: '#000000', fontWeight: '700' },
  roundChipCount: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
  roundChipCountActive: { color: '#000000' },

  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guidanceText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 18 },

  // Result panel — nền đục để đọc rõ trên nền camera tối
  resultPanel: {
    flex: 1,
    backgroundColor: NEUTRAL.bgSoft,
  },
  resultPanelContent: {
    padding: 16,
    gap: 12,
  },
  matchDetail: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 8,
    ...cardShadow,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchLabel: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    width: 72,
  },
  matchValue: {
    fontSize: 13,
    fontWeight: '600',
    color: NEUTRAL.text,
    flex: 1,
  },
  factorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
  },
  factorToggleText: {
    fontSize: 13,
    color: NEUTRAL.textSub,
  },

  actionGroup: { gap: 8 },
  movedHint: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    lineHeight: 18,
  },
  movedDist: {
    fontWeight: '700',
    color: '#1565c0',
  },
  noMatchHint: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    lineHeight: 18,
  },
  suggestBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bgWarm,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  suggestText: {
    flex: 1,
    fontSize: 13,
    color: NEUTRAL.text,
    lineHeight: 18,
  },
  // Bộ chọn vườn — cùng ngôn ngữ hình với bộ chọn ở `TreeEnrollScreen`.
  farmSection: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bgWarm,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  farmSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: NEUTRAL.text,
    marginBottom: 8,
  },
  farmChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  farmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    backgroundColor: NEUTRAL.white,
    maxWidth: '100%',
  },
  farmChipActive: {
    borderColor: '#1b5e20',
    backgroundColor: '#e8f5e9',
  },
  farmChipText: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    flexShrink: 1,
  },
  farmChipTextActive: {
    color: '#1b5e20',
    fontWeight: '600',
  },
  farmWarnText: {
    marginTop: 8,
    fontSize: 12,
    color: NEUTRAL.warning,
    lineHeight: 17,
  },
  decisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnGreen: { backgroundColor: HEADER_BG },
  btnBlue: { backgroundColor: '#1565c0' },
  // Viền xanh (phụ) — lối thoát "không phải cây này" ở luồng MATCH: rõ nhưng KHÔNG
  // tranh vai với hành-động chính, tránh user bấm nhầm tạo cây trùng.
  btnOutlineGreen: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#1b5e20',
  },
  decisionBtnText: {
    color: NEUTRAL.white,
    fontSize: 15,
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryBtnText: {
    fontSize: 13,
    color: NEUTRAL.textSub,
  },

  // Controls — thanh dưới đen mờ, nút chính CAM, nút phụ viền CAM (đồng bộ chụp)
  controls: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: PANEL_BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctrlBtnPrimary: { backgroundColor: CAM },
  ctrlBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: CAM,
  },
  ctrlBtnDisabled: { opacity: 0.4 },
  // Cố ý KHÔNG mờ như chính cái nút: dòng này là thứ giải thích nút mờ, nên nó phải
  // đọc được rõ hơn nút. Mờ cả hai thì lời giải thích biến mất cùng thứ nó giải thích.
  ctrlHintText: {
    color: NEUTRAL.white,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.9,
  },
  ctrlBtnText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  ctrlBtnSecText: { color: CAM, fontSize: 15, fontWeight: '700' },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  overlayText: {
    marginTop: 14,
    color: NEUTRAL.white,
    fontSize: 15,
    fontWeight: '500',
  },

  // ── M4 matcher chip (header) ──────────────────────────────────────────────
  matcherChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  matcherChipText: {
    color: NEUTRAL.white,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // ── M2 confidence band ────────────────────────────────────────────────────
  bandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bandText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── M3 verdict ────────────────────────────────────────────────────────────
  verdictBox: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 10,
    ...cardShadow,
  },
  verdictTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  verdictRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verdictBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  verdictCorrect: { borderColor: '#1b5e20', backgroundColor: '#e8f5e9' },
  verdictWrong: { borderColor: '#c62828', backgroundColor: '#ffebee' },
  verdictOther: { borderColor: '#3949ab', backgroundColor: '#e8eaf6' },
  verdictBtnText: { fontSize: 13, fontWeight: '700' },
  verdictDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  verdictDoneText: {
    fontSize: 13,
    color: '#1b5e20',
    fontWeight: '600',
    flex: 1,
  },
  verdictSending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verdictSendingText: {
    fontSize: 12,
    color: NEUTRAL.textSub,
  },

  // ── M3 tree picker (correct_tid) ──────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  pickerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  pickerHint: {
    fontSize: 14,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  pickerRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pickerRetryText: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '600',
  },
  pickerList: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  pickerRowBody: { flex: 1 },
  pickerRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  pickerRowSub: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
    marginTop: 1,
  },
  // Lối thoát "Đây là cây mới" — nổi bật, tách khỏi danh sách cây đã có.
  pickerNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1b5e20',
    backgroundColor: '#e8f5e9',
  },
  pickerNewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1b5e20',
  },

  // ── M4 matcher picker ─────────────────────────────────────────────────────
  matcherOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  matcherSheet: {
    width: '100%',
    backgroundColor: NEUTRAL.bg,
    borderRadius: 16,
    padding: 18,
    gap: 4,
  },
  matcherTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  matcherSub: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    lineHeight: 17,
    marginBottom: 8,
  },
  matcherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginTop: 6,
  },
  matcherOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(59,110,168,0.08)',
  },
  matcherOptionText: {
    fontSize: 15,
    color: NEUTRAL.text,
    fontWeight: '600',
  },
  matcherOptionTextActive: {
    color: COLORS.accent,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Compass (kiểu iPhone) — đĩa phẳng nhiều lớp, đặt trong VÙNG TRÊN
  // ═══════════════════════════════════════════════════════════════════════════
  compassBlock: {
    alignItems: 'center',
    gap: 4,
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lớp nền tối tạo cảm giác "lõm sâu" của mặt la bàn.
  dialFace: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_C,
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dialRingOuter: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_C,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  dialRotor: {
    position: 'absolute',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
  },
  dTickSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
  },
  dTick: {
    width: StyleSheet.hairlineWidth,
    height: 3.5,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dTickMajor: {
    width: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  windLabel: {
    position: 'absolute',
    width: 18,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  windLabelN: {
    color: CAM,
    fontWeight: '700',
  },
  // Số độ ở tâm (cố định, không xoay)
  dialCenter: {
    position: 'absolute',
    top: DIAL_C - 11,
    left: DIAL_C - 22,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialDeg: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  // Mũi trỏ cam cố định ở đỉnh (tam giác trỏ xuống)
  dialPointer: {
    position: 'absolute',
    top: -1,
    left: DIAL_C - 5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: CAM,
  },
  compassCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    maxWidth: DIAL_SIZE + 20,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Capture: nháy trong khung camera + bộ đếm số ảnh (vùng dưới)
  // ═══════════════════════════════════════════════════════════════════════════
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: HUD_BORDER,
  },
  counterPillHot: {
    borderColor: CAM_DIM,
    backgroundColor: 'rgba(255,122,0,0.12)',
  },
  counterNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tilt (iPhone-level) — bọt nước + Pitch/Roll/Yaw, đặt trong VÙNG TRÊN
  // ═══════════════════════════════════════════════════════════════════════════
  tiltWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tiltCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tiltCircleLevel: {
    borderColor: CAM,
    shadowColor: CAM,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  crossH: {
    position: 'absolute',
    width: 76,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: 76,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tiltTarget: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  tiltTargetLevel: {
    borderColor: CAM,
  },
  bubble: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(255,255,255,0.6)',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleLevel: {
    backgroundColor: CAM,
    shadowColor: CAM,
  },
  tiltReadouts: {
    gap: 3,
  },
  tiltRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 104,
  },
  tiltRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CAM,
    width: 34,
  },
  tiltRowVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
  },
  tiltRowHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});

export default TreeIdentityScreen;
