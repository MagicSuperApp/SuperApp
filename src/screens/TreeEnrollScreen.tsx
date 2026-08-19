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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  Alert,
  Linking,
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
  autoTreeRegions,
  candidateBoxes,
  mapBoxToImage,
  type YoloBox,
} from '../services/treeRegionAuto';
import {
  enrollTree,
  verifyAddTree,
  toCaptureOrientations,
  platformHeadingRef,
  enrollWarningMessages,
  getTrees,
  type EnrollResponse,
} from '../services/treeReIDService';
import {
  parseSpeciesSuggest,
  orderSpeciesForConfirm,
  type SpeciesSuggest,
} from '../services/speciesSuggest';
import { getSpeciesCatalog, setTreeSpecies } from '../services/fruitReIDService';
import { suggestTreeName } from '../utils/suggestTreeName';
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
// Phân loại 409 nằm ở tệp riêng để bài kiểm chạm được — xem treeEnrollConflict.ts.
import { classify409 } from '../services/treeEnrollConflict';
import { useBottomActionPadding } from '../hooks/useBottomActionPadding';
import { tk } from '../i18n/keys';
import { whenLabel } from '../utils/whenLabel';
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


// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TreeEnrollScreen: React.FC = () => {
  const bottomPad = useBottomActionPadding();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'TreeEnroll'>>();

  const dispatch = useAppDispatch();
  const captures = useAppSelector(selectCaptures);
  const gps = useAppSelector(selectGPS);

  // ── Local state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  /**
   * Người dùng (hoặc bản nháp khôi phục) đã đặt tên rồi → tên gợi ý KHÔNG được
   * ghi đè nữa. Cùng lối `faceTouched` ở `FruitCropperScreen`: máy chỉ điền vào
   * chỗ trống, không giành quyền với người đang đứng tại vườn.
   */
  const nameTouchedRef = useRef(false);
  const setNameByUser = useCallback((v: string) => {
    nameTouchedRef.current = true;
    setName(v);
  }, []);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<EnrollResponse | null>(null);

  // ── Xác nhận loài cây sau khi đăng ký ────────────────────────────────────
  // Máy chủ tự đoán loài ngay ở lượt đăng ký (`species_suggest`). Đây là màn
  // XÁC NHẬN, không phải màn chọn: đoán của máy đứng đầu và ghi rõ là máy đoán,
  // một chạm là xong. KHÔNG tích sẵn — máy chủ dùng chính cú chốt này làm nhãn,
  // nên ô đã tích sẵn thì lượt "đồng ý" không còn là bằng chứng độc lập.
  const [speciesSuggest, setSpeciesSuggest] = useState<SpeciesSuggest | null>(null);
  const [speciesNames, setSpeciesNames] = useState<Record<string, string>>({});
  const [speciesOrder, setSpeciesOrder] = useState<string[]>([]);
  const [speciesSaving, setSpeciesSaving] = useState(false);
  const [speciesChosen, setSpeciesChosen] = useState<string | null>(null);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  // Hộp thoại "Đăng ký thành công" bị hoãn lại cho tới khi chốt xong giống cây.
  const [pendingSuccess, setPendingSuccess] = useState<{ treeId: string; code: string } | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

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
      // Hộp thoại này canh một hành động BẤT KHẢ HỒI: bỏ nháp là mất cả vòng đi
      // quanh cây, chụp lại không lấy lại được. Bản cũ đặt nút phá ở VỊ TRÍ ĐẦU,
      // gọi nó bằng cái tên vô hại ("Bỏ bản nháp"), và không nói bản nháp đó là
      // CÂY NÀO — trong khi `draft.name`/`draft.savedAt` đều nằm sẵn trong tay.
      // Nay: nút giữ đứng trước, nút phá nói rõ nó xoá bao nhiêu ảnh, và thân hộp
      // gọi đúng tên cây để người dùng biết mình đang bỏ cái gì.
      Alert.alert(
        tk('trace.enroll.draftTitle'),
        draft.name
          ? tk('trace.enroll.draftBodyNamed', { name: draft.name, n: count, when: whenLabel(draft.savedAt) })
          : tk('trace.enroll.draftBody', { n: count, when: whenLabel(draft.savedAt) }),
        [
          {
            text: tk('trace.enroll.draftKeep'),
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
              if (draft.name) { nameTouchedRef.current = true; setName(draft.name); }
              if (draft.farmId) setSelectedFarmId(draft.farmId);
            },
          },
          {
            text: tk('trace.enroll.draftDrop', { n: count }),
            style: 'destructive',
            onPress: () => { clearTreeCaptureDraft(draftOwner); },
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

  // ── Tên gợi ý: "Cây {n}" — bỏ một lần gõ bàn phím cho mỗi cây ──────────────
  //
  // Tên là MỘT trong ba thứ chặn nút "Đăng ký", và là thứ duy nhất trong ba thứ
  // đó bắt mở bàn phím. Đường QUẢ đã điền sẵn "Quả {n+1}" từ lâu
  // (`FruitCropperScreen.tsx:270`); đường CÂY thì chưa, không vì lý do gì.
  //
  // Hỏng mạng thì KHÔNG đoán bừa một con số: không có danh sách cây thì không
  // biết số nào đang trống, mà đặt trùng tên hai cây trong một vườn là làm hỏng
  // đúng thứ hồ sơ truy xuất dùng để chỉ cây. Để trống còn hơn — ô tên vẫn hiện
  // và người dùng gõ như cũ.
  useEffect(() => {
    if (!farmValid || !farmId) return;
    if (nameTouchedRef.current || name.trim()) return;
    let alive = true;
    (async () => {
      const res = await getTrees(BASE_URL, farmId).catch(() => null);
      if (!alive || !res?.ok || !res.trees) return;
      // Đọc lại NGAY trước khi ghi: mạng chậm thì người dùng đã kịp gõ xong tên
      // trong lúc chờ, và ghi đè lên tên họ vừa gõ là lỗi tệ hơn hẳn việc không
      // gợi ý gì.
      if (nameTouchedRef.current) return;
      setName(suggestTreeName(res.trees.map((t) => t.name)));
    })();
    return () => { alive = false; };
    // `name` cố ý KHÔNG nằm trong deps: nó đổi mỗi lần gõ một chữ, và effect này
    // chỉ cần chạy khi ĐỔI VƯỜN. Chốt chặn thật là `nameTouchedRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, farmValid]);

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

  // VÙNG CÂY theo TỪNG ảnh — suy từ box YOLO máy ĐÃ tính cho mỗi khung và ĐÃ vẽ
  // lên preview lúc chụp. Nông dân không khoanh gì cả: bắt vẽ tay từng ảnh vừa
  // chậm vừa cho vùng lệch nhau mỗi ảnh một kiểu. Đường Android-không-native lấy
  // ảnh từ route params nên không có box → không gửi vùng, hành vi như cũ.
  //
  // Khi hai cây trong khung to ngang nhau thì máy KHÔNG được tự chọn — chọn sai là
  // gắn danh tính vào nhầm cây, mà sai kiểu đó không ai phát hiện ra. Đó là chỗ
  // DUY NHẤT hỏi nông dân, và chỉ hỏi cho ảnh đầu tiên: chọn xong thì `seed` dẫn
  // các ảnh sau bám theo cùng một cây.
  const [chosenBox, setChosenBox] = useState<YoloBox | null>(null);
  const [askSkipped, setAskSkipped] = useState(false);

  const { regions: treeRegions, ambiguousAt } = useMemo(
    () =>
      usingAndroidPaths
        ? { regions: [], ambiguousAt: [] }
        : autoTreeRegions(captures, { seed: chosenBox }),
    [usingAndroidPaths, captures, chosenBox],
  );

  // Ảnh cần hỏi = ảnh lưỡng lự đầu tiên. Bỏ qua rồi thì thôi, đừng hỏi lại.
  const askIndex = askSkipped ? null : ambiguousAt[0] ?? null;
  const askCapture = askIndex == null ? null : captures[askIndex] ?? null;

  // Box để vẽ đè lên ảnh — quy về TỈ LỆ của chính ảnh đang hiện, dùng lại đúng
  // phép quy hệ đã có test. Vẽ theo toạ độ preview là lệch, vì máy ảnh cắt giữa.
  const askChoices = useMemo(() => {
    if (!askCapture) return [] as Array<{ box: YoloBox; rect: [number, number, number, number] }>;
    const w = askCapture.width ?? 0;
    const h = askCapture.height ?? 0;
    if (w <= 0 || h <= 0) return [];
    return candidateBoxes(askCapture)
      .map(box => {
        const px = mapBoxToImage(box, askCapture.frameAspect, w, h);
        if (!px) return null;
        const rect: [number, number, number, number] = [px[0] / w, px[1] / h, px[2] / w, px[3] / h];
        return { box, rect };
      })
      .filter((v): v is { box: YoloBox; rect: [number, number, number, number] } => v != null);
  }, [askCapture]);

  // Số ảnh hiệu dụng để kiểm tra MIN_CAPTURES
  const effectiveCaptureCount = usingAndroidPaths
    ? androidImagePaths!.length
    : captures.length;

  // Bắt buộc vườn HỢP LỆ (còn tồn tại) mới cho đăng ký — tránh cây mồ côi gắn vào
  // vườn đã xoá / id nháp chết. Siết hơn bản #96 (`!!farmId`): nháp khôi phục có thể
  // hồi sinh id vườn đã xoá, khi đó farmId truthy mà vườn không còn.
  const canEnroll = !isEnrolling && effectiveCaptureCount >= MIN_CAPTURES
    && name.trim().length > 0 && farmValid;


  /**
   * Câu nói nút "Đăng ký" đang THIẾU gì — rỗng nghĩa là bấm được.
   *
   * Vì sao cần: `handleEnroll` có năm hộp thoại giải thích ("Thiếu tên", "Chưa có
   * vườn", "Chưa đủ ảnh"…), nhưng nó CHỈ được gọi từ chính cái nút đang bị
   * `disabled={!canEnroll}` — nên năm câu đó chưa từng hiện ra trước mặt ai. Người
   * dùng chỉ thấy một nút xám, bấm không có gì xảy ra, không một chữ. Chỗ này đưa
   * đúng nội dung ấy ra ngoài, không phải chờ bấm mới biết.
   * Thứ tự kiểm giống hệt `canEnroll` để hai chỗ không bao giờ nói khác nhau.
   */
  const missingHint = useMemo(() => {
    if (isEnrolling) return '';
    if (effectiveCaptureCount < MIN_CAPTURES) {
      return tk('trace.enroll.missingPhotos', { n: MIN_CAPTURES - effectiveCaptureCount });
    }
    if (!name.trim()) return tk('trace.enroll.missingName');
    if (!farmValid) return tk('trace.enroll.missingFarm');
    return '';
  }, [isEnrolling, effectiveCaptureCount, name, farmValid]);

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
  /**
   * Đăng ký xong ⇒ đọc `species_suggest`, và CHỈ khi có đoán mới nạp danh mục.
   *
   * Không đoán được thì không nạp gì: bày một hàng chip trống ngay dưới thẻ
   * "đã đăng ký thành công" là bắt người dùng làm một việc máy chưa hỏi. Đường
   * chọn giống cũ ở màn danh sách quả vẫn còn nguyên cho ca đó.
   */
  useEffect(() => {
    const suggest = parseSpeciesSuggest(enrollResult?.species_suggest);
    setSpeciesSuggest(suggest);
    setSpeciesChosen(null);
    setSpeciesError(null);
    setCatalogUnavailable(false);
    if (!suggest) { setSpeciesOrder([]); return; }

    let alive = true;
    (async () => {
      const r = await getSpeciesCatalog(ORILIFE_BASE);
      if (!alive) return;
      const list = r.ok && r.data?.species ? r.data.species : [];
      if (!list.length) {
        // Danh mục hỏng ⇒ không có tên tiếng Việt để bày. Im lặng bỏ khối này,
        // KHÔNG hiện mã trần `durio_zibethinus` cho nhà vườn đọc.
        setSpeciesOrder([]);
        // ...nhưng KHÔNG được nuốt luôn hộp thoại đã hoãn, không thì người dùng
        // đứng lại giữa màn không nút nào đi tiếp.
        setCatalogUnavailable(true);
        return;
      }
      const names: Record<string, string> = {};
      for (const sp of list) names[sp.id] = sp.name_vi;
      setSpeciesNames(names);
      setSpeciesOrder(orderSpeciesForConfirm(list.map((sp) => sp.id), suggest));
    })();
    return () => { alive = false; };
  }, [enrollResult]);

  /**
   * Người dùng chốt loài ⇒ GỌI `set_species`, kể cả khi trùng đoán của máy.
   *
   * Đây là chỗ DUY NHẤT sinh ra nhãn. Máy chủ ghép nó với sự kiện `species_guess`
   * thành cặp *(máy đoán, người chốt)* để tự đo mình. Bỏ lần gọi này vì "máy đoán
   * đúng rồi" là cắt đúng sợi dây làm bộ nhận loài khoẻ lên.
   */
  const confirmSpecies = useCallback(async (speciesId: string) => {
    const treeId = enrollResult?.tree_id;
    if (!treeId || speciesSaving) return;
    setSpeciesSaving(true);
    setSpeciesError(null);
    const r = await setTreeSpecies(ORILIFE_BASE, treeId, speciesId);
    setSpeciesSaving(false);
    // Hỏng thì phải NÓI. Im lặng ở đây là người dùng bấm, không thấy gì đổi, rồi
    // bấm tiếp — mỗi lần một lượt ghi hỏng nữa mà màn vẫn câm.
    if (!r.ok || r.data?.ok === false) {
      setSpeciesError(r.error?.detail ?? 'Chưa lưu được giống cây. Thử lại giúp.');
      return;
    }
    setSpeciesChosen(speciesId);
  }, [enrollResult, speciesSaving]);

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
            text: tk('trace.enroll.viewDetail'),
            onPress: () => {
              dispatch(clearAll());
              navigation.navigate('TreeDetail', { treeId, tree: justCreated } as any);
            },
          },
          {
            // Trước đây là 'OK' → `goBack()`, và màn nhận diện bên kia vẫn giữ
            // nguyên kết quả cũ ⇒ người dùng thấy lại "Cây chưa được đăng ký"
            // ngay sau khi vừa đăng ký thành công. Nay nói đúng việc nó làm:
            // dọn sạch rồi mở lượt ghi cây kế tiếp.
            text: tk('trace.enroll.nextTree'),
            onPress: () => {
              dispatch(clearAll());
              (navigation as any).navigate('TreeIdentity', { farmId, retake: Date.now() });
            },
          },
        ],
        { cancelable: false },
      );
    },
    [dispatch, navigation, draftOwner, name, farmId, gps],
  );

  /** Bật hộp thoại thành công đã hoãn (sau khi chốt giống, hoặc khi bỏ qua). */
  const finishAfterSpecies = useCallback(() => {
    setPendingSuccess((p) => {
      if (p) handleSuccess(p.treeId, p.code);
      return null;
    });
  }, [handleSuccess]);

  // Chốt giống xong ⇒ đi tiếp. Danh mục giống không tải được ⇒ cũng đi tiếp, vì
  // lúc đó không có gì để chốt và người dùng sẽ không có nút nào khác.
  useEffect(() => {
    if (!pendingSuccess) return;
    if (speciesChosen || catalogUnavailable) finishAfterSpecies();
  }, [pendingSuccess, speciesChosen, catalogUnavailable, finishAfterSpecies]);

  // ── Gộp vào cây cũ (verify_add) ──────────────────────────────────────────
  const handleMergeToExisting = useCallback(
    async (treeId: string) => {
      setIsEnrolling(true);
      try {
        const res = await verifyAddTree(BASE_URL, treeId, imagePaths, {
          farmId,
          lat: gps?.lat,
          lon: gps?.lng,
          acc: gps?.accuracy,
          // Vùng khoanh cây — `treeRegions` đã tính sẵn cùng scope và đã gửi cho
          // `enrollTree`, nhưng đường GỘP thì bỏ quên. Đúng ca mà việc khoanh cây
          // sinh ra để chặn: hai cây liền nhau trong khung. Đăng ký thì cắt đúng
          // cây, gộp thì nhồi cả khung vào cây cũ ⇒ chữ ký cây cũ nhiễm đặc trưng
          // cây bên cạnh, vĩnh viễn, và hỏng dần chứ không hỏng ngay nên không ai thấy.
          regions: treeRegions,
          captures: captureOrientations,
          headingRef: captureOrientations ? platformHeadingRef() : undefined,
        });

        // Máy chủ trả 200 kèm `{ok:false, added:false}` là "KHÔNG thêm được"
        // (`treeReIDService.ts:165-177`). Bản trước chỉ đọc `res.ok` rồi báo "Đã gộp
        // thành công" VÀ xoá nháp — ảnh mất, cây không nhận, không dấu vết.
        if (res.ok && res.data && res.data.ok !== false && res.data.added !== false) {
          // Tích luỹ ảnh vừa chụp vào cây đã có để màn chi tiết hiển thị lại được.
          await appendTreeImages(treeId, imagePaths);
          // Gộp xong cũng là kết thúc phiên chụp → xoá bản nháp.
          clearTreeCaptureDraft(draftOwner);
          Alert.alert(
            'Đã gộp thành công',
            res.data.n_added == null
              ? 'Đã thêm góc nhìn vào cây đã có.'
              : `Đã thêm ${res.data.n_added} góc nhìn vào cây đã có.`,
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
          Alert.alert(
            'Chưa gộp được',
            res.data?.reason ?? res.error?.detail ?? 'Không thể gộp. Thử lại.',
          );
        }
      } finally {
        setIsEnrolling(false);
      }
    },
    [imagePaths, captureOrientations, gps, dispatch, navigation, draftOwner, farmId],
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
        regions: treeRegions,
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
  }, [name, imagePaths, captureOrientations, treeRegions, gps, handleSuccess, farmId, farmValid, draftOwner]);

  // ── Main enroll ───────────────────────────────────────────────────────────

  /**
   * Về màn nhận diện Ở TRẠNG THÁI SẠCH.
   *
   * `navigation.goBack()` không đủ: màn kia giữ `identResult` trong state cục bộ,
   * nên quay về là thấy y nguyên bảng kết quả cũ kèm nút "Đăng ký cây mới" — dù
   * cây vừa đăng ký xong. Bấm tiếp thì sang đây với `captures` đã bị xoá, màn báo
   * "Chưa có ảnh nào", và người dùng ra chụp lại từ đầu → HAI bản ghi cho MỘT gốc
   * cây. Tham số `retake` mang mốc thời gian để màn kia biết đây là lượt mới.
   */
  const goRetake = useCallback(() => {
    (navigation as any).navigate('TreeIdentity', { farmId, retake: Date.now() });
  }, [navigation, farmId]);

  /**
   * Chốt chống bấm HAI LẦN.
   *
   * `disabled={!canEnroll}` không đủ: nó chỉ có hiệu lực sau khi React vẽ lại, mà
   * giữa hai nhịp chạm trên máy yếu (tay bẩn, màn ướt, app đang nén ảnh) có thể
   * chưa kịp vẽ. Hai lượt bấm thành HAI request độc lập bay đi gần như đồng thời —
   * không lượt nào là "gửi lại" nên cổng chống trùng phía máy chủ có cửa sổ đua
   * thật. Ref chặn ngay trong cùng một nhịp, không chờ render.
   */
  const enrollInFlight = useRef(false);

  const handleEnroll = async () => {
    if (enrollInFlight.current) return;
    enrollInFlight.current = true;
    try {
      await runEnroll();
    } finally {
      enrollInFlight.current = false;
    }
  };

  const runEnroll = async () => {
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
        regions: treeRegions,
      }, farmId);

      if (res.ok && res.data) {
        // Lưu ảnh local theo tree_id TRƯỚC clearAll để hiển thị lại ở màn chi tiết.
        await appendTreeImages(res.data.tree_id, imagePaths);
        setEnrollResult(res.data);
        const code = res.data.provenance?.code ?? res.data.tree_id;
        // Máy có đoán được giống cây thì HOÃN hộp thoại thành công lại.
        //
        // Hộp thoại này `cancelable: false` và cả hai nút đều rời màn, nên bật nó
        // ngay là đè mất hàng chip xác nhận giống ngay bên dưới — khối đó chưa
        // từng đứng trước mặt ai trong luồng bình thường, và `set_species` (chỗ
        // DUY NHẤT sinh nhãn) chưa từng được gọi. Nay: chốt giống trước, rồi mới
        // hiện hộp thoại đi tiếp — xem `finishAfterSpecies`.
        if (parseSpeciesSuggest(res.data.species_suggest)) {
          setPendingSuccess({ treeId: res.data.tree_id, code });
        } else {
          handleSuccess(res.data.tree_id, code);
        }
        return;
      }

      // ── Xử lý lỗi ─────────────────────────────────────────────────────
      const status = res.error?.http_status;
      const detail = res.error?.detail ?? 'Lỗi không xác định';

      if (status === 409) {
        const kind = classify409(detail, res.error?.error_code);

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
              // Nút gộp CHỈ hiện khi biết gộp vào cây nào. Bản cũ luôn hiện nút,
              // rồi khi `foundId` rỗng thì bật một hộp thoại thứ hai bảo "chụp lại
              // và thử nhận diện trước" — trong khi người dùng VỪA nhận diện xong,
              // đó chính là cách họ tới được đây. Mời một việc không làm nổi thì
              // thà không mời.
              ...(foundId
                ? [{
                  text: 'Gộp vào cây cũ',
                  onPress: () => handleMergeToExisting(foundId),
                }]
                : []),
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
              { text: tk('trace.enroll.retake'), onPress: goRetake },
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
              { text: tk('trace.enroll.retake'), onPress: goRetake },
            ],
          );
          return;
        }

        // 409 không phân loại được — VẪN PHẢI CÓ ĐƯỜNG RA.
        // Bản cũ ở đây là một hộp thoại một nút OK: bấm OK rồi bấm Đăng ký lại thì
        // gặp đúng 409 đó, mãi mãi. Bộ phân loại trên có thể trượt lần nữa (máy chủ
        // đổi một chữ trong câu là trượt), nên lối thoát KHÔNG được phụ thuộc vào
        // việc phân loại đúng. Nhánh này giờ mở thẳng nút "Tạo cây mới" — cùng
        // hành động mà nhánh 'duplicate' cho, chỉ khác là không dám đoán lý do.
        Alert.alert(
          'Máy chủ từ chối đăng ký',
          `${detail}\n\nNếu chắc đây là một cây KHÁC, chọn "Tạo cây mới".`,
          [
            { text: 'Huỷ', style: 'cancel' },
            { text: tk('trace.enroll.retake'), onPress: goRetake },
            { text: 'Tạo cây mới', style: 'destructive', onPress: handleForceEnroll },
          ],
        );
        return;
      }

      if (status === 400) {
        if (detail.toLowerCase().includes('gps') || detail.toLowerCase().includes('location')) {
          Alert.alert(
            'Cần bật GPS',
            'Đăng ký cây yêu cầu thông tin vị trí. Vui lòng bật GPS và thử lại.',
            [
              // "Thử lại" một mình là vòng lặp kín: không có gì bật được GPS nên
              // lần nào cũng về đúng hộp thoại này. Mẫu mở Cài đặt đã có ở
              // `TreeIdentityScreen` (quyền camera) — dùng lại đúng mẫu đó.
              { text: tk('trace.enroll.openSettings'), onPress: () => { Linking.openSettings(); } },
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
          {tk('trace.enroll.viewsN', { label, n: list.length })}
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
            onChangeText={setNameByUser}
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
            {tk('trace.enroll.picturesN', { n: effectiveCaptureCount })}
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

              {/* ── Xác nhận loài cây ─────────────────────────────────────────
                  Máy đã đoán. Việc còn lại của người dùng là gật hoặc sửa, một
                  chạm. Chip đầu tiên là đoán của máy và được ghi rõ như vậy —
                  không tích sẵn, vì chính cú chạm này là nhãn máy chủ học theo. */}
              {speciesChosen ? (
                <Text style={styles.successHint}>
                  Đã ghi giống: {speciesNames[speciesChosen] ?? speciesChosen}
                </Text>
              ) : speciesSuggest && speciesOrder.length > 0 ? (
                <View style={styles.speciesConfirm}>
                  <Text style={styles.speciesConfirmHint}>
                    Máy đoán cây này là{' '}
                    <Text style={styles.speciesConfirmGuess}>
                      {speciesNames[speciesSuggest.species] ?? speciesSuggest.species}
                    </Text>
                    {'. '}Chạm để xác nhận, hoặc chọn đúng giống nếu máy đoán sai.
                  </Text>
                  <View style={styles.speciesConfirmRow}>
                    {speciesOrder.map((id) => (
                      <Pressable
                        key={id}
                        disabled={speciesSaving}
                        style={({ pressed }) => [
                          styles.speciesConfirmBtn,
                          id === speciesSuggest.species && styles.speciesConfirmBtnGuess,
                          pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => confirmSpecies(id)}
                      >
                        <Text style={styles.speciesConfirmBtnTxt}>{speciesNames[id] ?? id}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {!!speciesError && (
                    <Text style={styles.successDupWarn}>⚠ {speciesError}</Text>
                  )}
                  {/* Lối ra. Không có nút này thì máy chủ ghi hỏng liên tục là
                      người dùng kẹt lại giữa màn: hộp thoại đi tiếp đang bị hoãn,
                      mà chip nào bấm cũng lỗi. */}
                  <Pressable onPress={finishAfterSpecies} disabled={speciesSaving}>
                    <Text style={styles.speciesConfirmSkip}>Để sau</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      {missingHint ? (
        <View style={styles.missingBar}>
          <Icon name="information-outline" size={15} color={NEUTRAL.textSub} />
          <Text style={styles.missingText}>{missingHint}</Text>
        </View>
      ) : null}
      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
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

      {/* Hỏi ĐÚNG MỘT LẦN khi trong khung có hai cây to ngang nhau */}
      <Modal
        visible={askCapture != null && askChoices.length >= 2}
        transparent
        animationType="fade"
        onRequestClose={() => setAskSkipped(true)}
        statusBarTranslucent
      >
        <View style={styles.askOverlay}>
          <View style={styles.askCard}>
            <Text style={styles.askTitle}>Cây nào là cây bác đang đăng ký?</Text>
            <Text style={styles.askHint}>
              Trong ảnh có hai cây to gần bằng nhau. Bác chạm vào đúng cây — chỉ hỏi
              một lần này thôi, các ảnh còn lại máy tự bám theo.
            </Text>

            {askCapture != null && (
              <View
                style={[
                  styles.askImageBox,
                  {
                    aspectRatio:
                      (askCapture.width ?? 1) / Math.max(1, askCapture.height ?? 1),
                  },
                ]}
              >
                <Image
                  source={{ uri: askCapture.fileURL }}
                  style={styles.askImage}
                  resizeMode="stretch"
                />
                {askChoices.map((c, i) => (
                  <TouchableOpacity
                    key={`${c.rect[0]}-${c.rect[1]}-${i}`}
                    activeOpacity={0.7}
                    onPress={() => setChosenBox(c.box)}
                    style={[
                      styles.askBox,
                      {
                        left: `${c.rect[0] * 100}%`,
                        top: `${c.rect[1] * 100}%`,
                        width: `${c.rect[2] * 100}%`,
                        height: `${c.rect[3] * 100}%`,
                      },
                    ]}
                  >
                    <View style={styles.askBoxTag}>
                      <Text style={styles.askBoxTagText}>{i + 1}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.askSkipBtn}
              activeOpacity={0.8}
              onPress={() => setAskSkipped(true)}
            >
              <Text style={styles.askSkipText}>Để máy tự chọn</Text>
            </TouchableOpacity>
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
  speciesConfirm: { marginTop: 10 },
  speciesConfirmHint: { fontSize: 12.5, color: NEUTRAL.textSub, lineHeight: 18 },
  speciesConfirmGuess: { fontWeight: '700', color: '#1b5e20' },
  speciesConfirmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  speciesConfirmBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: NEUTRAL.border, backgroundColor: '#fff',
  },
  // Chip của máy đoán: nổi hơn, nhưng KHÔNG phải trạng thái "đã chọn".
  speciesConfirmBtnGuess: { borderColor: '#1b5e20', backgroundColor: '#eef6ee' },
  speciesConfirmBtnTxt: { fontSize: 13, color: NEUTRAL.text, fontWeight: '600' },
  speciesConfirmSkip: {
    fontSize: 12.5,
    color: NEUTRAL.textSub,
    textDecorationLine: 'underline',
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  successHint: { fontSize: 12.5, color: '#1b5e20', fontWeight: '600', marginTop: 4, lineHeight: 18 },

  missingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: NEUTRAL.card,
  },
  missingText: { fontSize: 13, color: NEUTRAL.textSub, fontWeight: '600' },
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

  // ── Hỏi cây nào (chỉ hiện khi hai cây to ngang nhau) ───────────────────────
  askOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  askCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: NEUTRAL.card,
    borderRadius: 18,
    padding: 16,
  },
  askTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NEUTRAL.text,
    marginBottom: 6,
  },
  askHint: {
    fontSize: 14,
    lineHeight: 20,
    color: NEUTRAL.textSub,
    marginBottom: 14,
  },
  askImageBox: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: NEUTRAL.bgSoft,
  },
  askImage: {
    ...StyleSheet.absoluteFillObject,
  },
  // Viền dày + nhãn số: ngoài trời nắng, viền mảnh nhìn không ra.
  askBox: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: NEUTRAL.success,
    borderRadius: 6,
  },
  askBoxTag: {
    position: 'absolute',
    top: -2,
    left: -2,
    minWidth: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: NEUTRAL.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  askBoxTagText: {
    fontSize: 15,
    fontWeight: '700',
    color: NEUTRAL.white,
  },
  askSkipBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    alignItems: 'center',
  },
  askSkipText: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.textSub,
  },
});

export default TreeEnrollScreen;
