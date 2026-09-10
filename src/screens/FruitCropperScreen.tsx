/**
 * FruitCropperScreen — cropper KHUNG TRÒN/ELIP (native port của ccStart/ccLayout/ccApply…)
 *
 * Khung TRÒN (hoặc ELIP) CỐ-ĐỊNH ở giữa; ảnh zoom/pan/xoay phía dưới; vùng ngoài khung CHE MỜ.
 * Nông dân di chuyển/phóng ảnh để 1 quả nằm gọn trong khung → "Dùng vùng này" → map ngược
 * vùng khung về pixel ẢNH GỐC (bbox + points + shape + góc xoay) → gọi candidates / enroll / add_view.
 *
 *  KHÔNG vẽ-tay tự do (anh đã chốt bỏ vẽ-tay).
 *  KHÔNG dùng react-native-svg cho khung: khung = View borderRadius; mask = 4 panel nền tối
 *  quanh vùng khung; zoom/pan = PanResponder + Animated (built-in RN, KHÔNG cần native-link).
 *  Toán map-ngược (screen px → original px) port nguyên từ web ccRegionToOrig (giữ công thức elip xoay).
 *
 * ── Giao diện ────────────────────────────────────────────────────────────────
 * Bước KHOANH dựng theo lối máy ảnh: ảnh chiếm TRỌN màn, mọi nút nổi lên trên
 * ảnh chứ không xếp thành hàng bên dưới — vùng ngắm to hơn hẳn, và nút nằm đúng
 * tầm ngón cái. Hai bước sau (đối chiếu / đặt tên) là màn sáng, dạng thẻ.
 * Toàn bộ icon lấy từ `components/Icon`; không còn ký-tự hình trong chuỗi
 * (＋ − ↺ ◯ ✓ ➕ …) — thứ đó mỗi máy vẽ một kiểu và không đổi màu theo trạng thái.
 *
 * QUÉT rồi TỰ CĂN: vào màn (ảnh vừa chụp / vừa chọn) là chạy `detectFruit` ngay,
 * phủ lên màn khoanh một lớp CHẤM XANH thở thành sóng trong lúc chờ; xong thì
 * khung TỰ trượt vào ôm quả tìm được. Không còn nút "Tự căn khung quả" — máy đã
 * biết quả ở đâu thì bắt bấm thêm một nút để dùng kết quả đó là thừa.
 *
 * Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io). Cùng client fruitReIDService.
 *
 * Route params (RouteParams): treeId, treeName?, imageUri, imageW, imageH, zone? (đoán sẵn), fruitId?
 *   - fruitId có → THÊM GÓC cho quả đó (add_view); không có → luồng candidates → enroll/add_view.
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput, StatusBar,
  ActivityIndicator, ScrollView, PanResponder, LayoutChangeEvent,
  Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { launchCamera } from 'react-native-image-picker';

import { ORILIFE_BASE } from '../services/orilifeBase';
import { withPhotoSave } from '../services/mediaSavePermission';
import { buildCaptureMeta, serializeCaptureMeta } from '../services/captureMeta';
import { TreeReIDBridge } from '../services/treeReIDNativeBridge';
import { nextShotAsk } from '../features/fruitCapture/nextShot';

import { Icon } from '../components/Icon';
import { COLORS } from '../constants';
import { useTk } from '../i18n/keys';
import {
  ELEVATION as ORG_ELEV, ORGANIC_CARD, ORGANIC_TILE,
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, TYPE as ORG_TYPE,
} from '../modules/trace/theme/depth';
import {
  fruitCandidates, enrollFruit, addFruitView, detectFruit, outcomeOf,
  type FruitShape, type FruitCandidate, type FruitRegion, type Bbox, type TreeZone,
  type FruitViewType,
} from '../services/fruitReIDService';
import {
  getCapturePlan, suggestedFace,
  type CapturePlan,
} from '../services/capturePlanService';
import {
  DEFAULT_FRUIT_COORD, ZONE_LABEL, clampCoord, coordToServer, coordToZone, zoneToY,
  type FruitCoord,
} from '../features/space3d/treeFrame';
import { saveFruitCoord } from '../features/space3d/positionStore';
import RemoteImage from '../components/RemoteImage';
// `absUrl` ở nhờ màn danh sách quả (chỗ duy nhất từng có chốt URL tuyệt đối).
// Một chiều, không vòng: `FruitListScreen` không import màn nào.
import { absUrl } from './FruitListScreen';

const BASE_URL = ORILIFE_BASE;

const ROT_STEP = 0.2618; // 15° mỗi nhịp xoay (khớp web ccRotate(±0.2618))
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;
const ZONE_VI: Record<TreeZone, string> = { base: 'Gốc', mid: 'Thân giữa', canopy: 'Tán' };

/** Nền tối của bước khoanh — ảnh là nhân vật chính, mọi thứ khác lùi ra sau. */
const STAGE_BG = '#0E1512';
const ON_STAGE = '#F2F6F3';
const CHROME_BG = 'rgba(14, 21, 18, 0.72)';
const CHROME_BORDER = 'rgba(242, 246, 243, 0.16)';
const RING_COLOR = '#FFD166';
/**
 * Xanh lá RỰC cho lời mời "đã tìm thấy quả".
 * Không dùng `COLORS.success` (#3D7A5E): màu đó trầm, đặt trên ảnh chụp vườn —
 * vốn đã toàn lá xanh sẫm — thì chìm nghỉm, đúng thứ nút này không được phép.
 */
const DETECT_GREEN = '#22C55E';

/**
 * Tuỳ chọn máy ảnh cho vòng "chụp tiếp" — GIỮ ĐÚNG BẰNG `FruitScanScreen.tsx:64`
 * và đường đăng ký ở `FruitListScreen`.
 *
 * 1600 px không phải cỡ tối ưu (chưa ai đo 1600 với 4032). Nó là cỡ để hai đầu —
 * ảnh dựng bản mẫu và ảnh truy vấn — đi qua CÙNG một đường nén; lệch cỡ thì phần
 * chênh đo được không còn phân biệt "khác quả" với "khác đường nén" nữa. Đổi số ở
 * đây mà không đổi hai chỗ kia là làm hỏng chính phép so sánh.
 */
const PHOTO_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.9 as const,
  maxWidth: 1600,
  maxHeight: 1600,
  saveToPhotos: true,
};

interface RouteParams {
  treeId: string;
  treeName?: string;
  imageUri: string;
  imageW: number;
  imageH: number;
  zone?: TreeZone;
  fruitId?: string; // có → thêm góc cho quả này (bỏ qua bước candidates)
  fruitName?: string;
  /** Số quả cây này đã có → đặt sẵn tên "Quả {n+1}" cho quả mới. */
  fruitCount?: number;
  /**
   * Khối `capture` (JSON đã chuỗi-hoá) dựng ở màn chụp — xem `captureMeta.ts`.
   * Đọc tại thời điểm bấm máy nên phải đi kèm qua đây, không dựng lại ở đây
   * được: tới lúc này người ta đã xoay máy, heading/pitch không còn đúng nữa.
   */
  capture?: string;
}

type Step = 'crop' | 'candidates' | 'naming';

/**
 * Bốn mặt OriLife nhận. Nhãn viết theo lời nông dân nói, không theo tên trường:
 * `bottom` = đít quả (mặt hệ cần nhất và cũng là mặt bị chặn oan nhiều nhất).
 */
const VIEW_CHOICES: { key: FruitViewType; label: string }[] = [
  { key: 'side', label: 'Hông' },
  { key: 'bottom', label: 'Đít quả' },
  { key: 'stem', label: 'Cuống' },
  { key: 'context', label: 'Cả chùm' },
];

/** Khoảng cách 2 ngón (pinch). */
function touchDist(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}
function touchMid(touches: { pageX: number; pageY: number }[]): { x: number; y: number } {
  const [a, b] = touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

/** Một vòng sóng chạy hết màn mất bằng này (ms). */
const WAVE_PERIOD = 2400;
/** Độ trễ pha giữa hai hàng chấm — càng lớn thì sóng càng dốc, chạy càng "rõ". */
const WAVE_ROW_LAG = 0.075;
/** Số mốc lấy mẫu để dựng đường cong cosin bằng interpolate (24 mốc là đủ mượt). */
const WAVE_SAMPLES = 24;
/** Khoảng cách mong muốn giữa hai chấm (px) — lưới tự chia lại cho vừa màn. */
const DOT_GAP = 54;
const DOT_SIZE = 5;

/**
 * Lớp phủ ĐANG QUÉT — chạy ngay khi vào màn (ảnh vừa chụp / vừa chọn từ máy).
 *
 * Vì sao bỏ nút "Tự căn khung quả": máy đã tự tìm quả sẵn rồi, bắt người dùng
 * bấm thêm một nút để dùng kết quả đó là thừa một bước — và ai không hiểu nút
 * làm gì thì vẫn è cổ kéo-phóng bằng tay. Nay quét xong là khung TỰ căn vào quả.
 *
 * Hoạt-ảnh: một LƯỚI CHẤM XANH mờ phủ kín màn, mỗi chấm phồng lên rồi xẹp
 * xuống nhẹ nhàng; hàng dưới trễ pha hơn hàng trên nên cả lưới gợn thành SÓNG
 * chạy từ trên xuống. Không khung ngắm, không vạch quét — mấy thứ đó mượn hình
 * máy quét QR, mà đây không phải quét QR; chấm sóng vừa êm vừa không vẽ lên
 * ảnh một cái hộp giả chỗ quả sẽ nằm.
 *
 * Một Animated.Value duy nhất chạy tuyến-tính 0→1 rồi lặp; hình sin của từng
 * hàng dựng sẵn bằng `interpolate` (lấy mẫu cosin đã dịch pha) — nhờ vậy cả
 * trăm chấm chỉ tốn một driver và chạy trọn trên luồng native.
 *
 * Luôn có lối thoát "Tự canh bằng tay": hạn chờ của API là 45 s, không được để
 * người dùng kẹt trong lớp phủ khi mạng chết.
 */
const ScanOverlay: React.FC<{
  w: number; h: number; bottomInset: number; onSkip: () => void;
}> = ({ w, h, bottomInset, onSkip }) => {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: WAVE_PERIOD, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => { loop.stop(); t.setValue(0); };
  }, [t]);

  // Lưới chấm + đường cong riêng của từng hàng. Cosin liền mạch tại mốc 0 và 1
  // nên vòng lặp nối lại không giật.
  const rows = useMemo(() => {
    if (!w || !h) return [];
    const nCols = Math.max(4, Math.round(w / DOT_GAP));
    const nRows = Math.max(4, Math.round(h / DOT_GAP));
    const gapX = w / nCols, gapY = h / nRows;
    const input = Array.from({ length: WAVE_SAMPLES + 1 }, (_, i) => i / WAVE_SAMPLES);
    const xs = Array.from({ length: nCols }, (_, c) => gapX * (c + 0.5) - DOT_SIZE / 2);
    return Array.from({ length: nRows }, (_, r) => {
      // wave ∈ [0,1]: 0 = chấm nhỏ & mờ nhất, 1 = chấm to & rõ nhất.
      const wave = input.map(u => 0.5 - 0.5 * Math.cos(2 * Math.PI * (u + r * WAVE_ROW_LAG)));
      return {
        key: r,
        top: gapY * (r + 0.5) - DOT_SIZE / 2,
        xs,
        scale: t.interpolate({ inputRange: input, outputRange: wave.map(v => 0.55 + v * 0.6) }),
        opacity: t.interpolate({ inputRange: input, outputRange: wave.map(v => 0.14 + v * 0.34) }),
      };
    });
  }, [w, h, t]);

  return (
    <View style={styles.scanOverlay}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rows.map(row => row.xs.map((x, c) => (
          <Animated.View
            key={`${row.key}-${c}`}
            style={[styles.scanDot, {
              left: x, top: row.top,
              opacity: row.opacity,
              transform: [{ scale: row.scale }],
            }]}
          />
        )))}
      </View>

      <View style={[styles.scanFoot, { paddingBottom: Math.max(bottomInset, 10) + 18 }]}>
        <View style={styles.scanCard}>
          <ActivityIndicator size="small" color={DETECT_GREEN} />
          <View style={styles.scanCardBody}>
            <Text style={styles.scanTitle}>Đang quét ảnh để tìm quả…</Text>
            <Text style={styles.scanSub}>Xong là khung tự căn vào quả</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.scanSkip} onPress={onSkip} activeOpacity={0.75} hitSlop={8}>
          <Text style={styles.scanSkipTxt}>Tự canh bằng tay</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const FruitCropperScreen: React.FC = () => {
  const tk = useTk();
  const route = useRoute();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {
    treeId, treeName, imageUri, imageW, imageH, zone: zoneParam, fruitId, fruitName,
    fruitCount, capture,
  } = (route.params ?? {}) as RouteParams;
  // Kết quả trả về từ màn đặt toạ-độ 3D (FruitPlace3D điều hướng ngược có merge).
  const pickedCoord = (route.params as any)?.pickedFruitCoord as FruitCoord | undefined;

  // Kích thước ẢNH GỐC (ccNW/ccNH). Phải > 0 để map-ngược đúng.
  const NW = imageW || 1;
  const NH = imageH || 1;

  // ── State khung-nhìn (viewport) đo từ onLayout ──────────────────────────────
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  // ── State biến-đổi ảnh (ccTx/ccTy/ccZoom/ccBase/ccShape/ccRot) ──────────────
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [shape, setShape] = useState<FruitShape>('circle');
  const [rot, setRot] = useState(0); // radian, chỉ cho elip

  // ── Luồng ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('crop');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [cands, setCands] = useState<FruitCandidate[]>([]);

  /**
   * Lượt đối chiếu VỪA RỒI có soi được không.
   *
   * "Không có quả nào giống" và "chưa hỏi được máy chủ" là hai chuyện khác hẳn,
   * mà danh sách rỗng thì trông y như nhau. Bản cũ gộp chúng lại nên mất mạng
   * cũng ra câu "Cây chưa có quả nào để đối chiếu — đặt tên để lưu quả mới":
   * nông dân đặt tên mới cho một quả kho đã có, và không ai gộp hai hồ sơ lại
   * được nữa. `true` ở đây thì màn KHÔNG mời tạo quả mới, chỉ mời thử lại.
   */
  const [candFailed, setCandFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastRegion, setLastRegion] = useState<FruitRegion | null>(null);

  /**
   * TẤM ẢNH NÀY ĐÃ GỬI ĐI RỒI HAY CHƯA — `null` là chưa, chuỗi là khoá của tấm đã gửi.
   *
   * Vì sao cần một ô riêng chứ `busy` là chưa đủ: cả `saveNewFruit` lẫn `runAddView`
   * khi lưu THÀNH CÔNG mà máy chủ còn đòi thêm mặt thì dựng lời mời "Chụp tiếp" rồi
   * `return` — KHÔNG `goBack()`. Màn ở nguyên bước cũ, `busy` đã về `false`, nút xanh
   * to nằm ngay dưới lời mời, và không gì trên màn nói rằng tấm này đã lưu xong. Bấm
   * lần hai là gửi LẠI ĐÚNG tấm ảnh đó, đúng vùng đó.
   *
   * Hậu quả không phải một bản ghi thừa vô hại: `fruitReIDService.ts` cố ý để `enroll`
   * và `add_view` NGOÀI danh sách gửi-lại-được, với lý do viết thẳng trong tệp — thêm
   * một bản ghi thừa là làm hỏng chính chữ ký dùng để phân biệt các quả với nhau. Cổng
   * đó dựng ở tầng mạng; ngón tay thì bấm ở tầng giao diện.
   *
   * Khoá gồm cả VÙNG: khoanh vùng khác trên cùng tấm ảnh là một lần gửi hợp lệ khác.
   */
  const [sentShotKey, setSentShotKey] = useState<string | null>(null);
  const shotKey = useMemo(() => {
    const b = lastRegion?.bbox;
    return `${imageUri}|${b ? b.join(',') : 'chua-khoanh'}`;
  }, [imageUri, lastRegion]);
  const shotAlreadySent = sentShotKey !== null && sentShotKey === shotKey;
  const [nameInput, setNameInput] = useState(
    () => (fruitCount === undefined ? '' : `Quả ${fruitCount + 1}`),
  );

  /**
   * Máy chủ TỪ CHỐI nhưng vẫn trả HTTP 200. Khi đó `data.ok === false` kèm câu
   * `message` tiếng Việt và một cờ (`warn` hoặc `duplicate`). Ô này giữ câu đó
   * cùng nút "vẫn làm" — vì người đứng tại vườn đúng nhiều hơn máy.
   */
  const [serverAsk, setServerAsk] = useState<{
    message: string;
    yesLabel: string;
    onYes: () => void;
    /** Chữ trên nút TỪ CHỐI. Vắng → 'Để xem lại' (ca hỏi-lại của máy chủ). */
    noLabel?: string;
    /** Việc khi từ chối. Vắng → chỉ đóng hộp. */
    onNo?: () => void;
  } | null>(null);

  /**
   * MẶT nào của quả đang chụp. Máy chủ cần trường này để thôi đem mặt đáy so với
   * góc hông — thiếu nó là gốc của việc bồi góc bị chặn oan 30/32 lượt.
   *
   * Giá trị khởi tạo `side` là chỗ ĐỖ TẠM, không phải câu trả lời: nó chỉ đúng
   * cho tới khi `/api/capture/plan` trả về mặt máy chủ đang thiếu. Người dùng
   * chạm tay vào bộ chọn thì kế hoạch KHÔNG được ghi đè nữa (`faceTouched`) —
   * người đứng tại vườn thấy quả, máy chủ chỉ thấy ảnh cũ.
   */
  const [viewType, setViewType] = useState<FruitViewType>('side');
  const faceTouched = useRef(false);
  const pickFace = useCallback((v: FruitViewType) => {
    faceTouched.current = true;
    setViewType(v);
  }, []);

  /**
   * "Còn thiếu gì, chụp gì tiếp" — `GET /api/capture/plan`.
   *
   * `null` = CHƯA CÓ kế hoạch (chưa gọi, hoặc gọi hỏng). Màn không được vẽ gì
   * thay cho nó: một thanh tiến độ dựng từ chỗ trống trông y hệt thanh dựng từ
   * số 0, và người chụp không có cách nào biết mình đang nhìn số thật hay số bịa.
   */
  const [plan, setPlan] = useState<CapturePlan | null>(null);

  // Toạ-độ 3D của quả trên cây (hệ riêng của cây). Thay cho việc chỉ chọn 1 trong
  // 3 vùng: người dùng kéo icon quả ở màn FruitPlace3D. zone gửi lên server được
  // SUY RA từ chiều cao y nên dữ-liệu cũ/sơ-đồ 2D vẫn đọc đúng.
  const [coord, setCoord] = useState<FruitCoord>(() =>
    zoneParam ? { ...DEFAULT_FRUIT_COORD, y: zoneToY(zoneParam) } : DEFAULT_FRUIT_COORD,
  );
  const zone: TreeZone = coordToZone(coord);

  // Người dùng đã THẬT SỰ đặt độ sâu chưa (tức có đi qua màn FruitPlace3D lần này).
  // Chưa đặt thì KHÔNG gửi pos_z: `coord.z` lúc đó chỉ là giá-trị mặc định 0, gửi
  // lên là đóng dấu "đã đặt ở giữa tán" cho một quả chưa ai đặt — và với add_view
  // thì còn ghi đè mất độ sâu đã đặt từ lần trước.
  const [zPlaced, setZPlaced] = useState(false);

  // ── QUÉT-NGAY: vừa vào màn là tự tìm quả rồi TỰ CĂN KHUNG vào quả tìm được ──
  // bbox ẢNH GỐC của quả tự-phát-hiện (lớn nhất / tự-tin nhất). null = chưa có / không phát hiện.
  const [detectBox, setDetectBox] = useState<Bbox | null>(null);
  const detectTried = useRef(false);
  /** Đang chờ kết quả quét → hiện lớp phủ hoạt-ảnh. Luồng thêm-góc không quét. */
  const [scanning, setScanning] = useState(!fruitId);
  /** Người dùng đã bấm "tự canh bằng tay" → kệ kết quả quét về sau, đừng giật khung. */
  const scanSkipped = useRef(false);
  /** Câu báo ngắn sau khi quét xong, tự tắt sau ~3 s. */
  const [scanNote, setScanNote] = useState<{ ok: boolean; text: string } | null>(null);

  // ── baseScale (cover) — phủ kín viewport để quả to, dễ canh ─────────────────
  const base = useMemo(() => {
    if (!vw || !vh) return 1;
    return Math.max(vw / NW, vh / NH);
  }, [vw, vh, NW, NH]);

  // ── Tâm + bán-kính vòng (px màn hình) — vòng CỐ-ĐỊNH giữa viewport ──────────
  // Tâm nhích LÊN một chút: thanh nút dưới che mất phần đáy, để giữa hình học thì
  // vòng ngắm bị lệch xuống dưới vùng nhìn thật.
  const ring = useMemo(() => {
    const cx = vw / 2, cy = vh * 0.44;
    const r = Math.min(vw, vh) * 0.34;
    let rx = r, ry = r;
    if (shape === 'ellipse') { rx = Math.min(vw * 0.42, r * 1.25); ry = r * 0.78; }
    return { cx, cy, rx, ry };
  }, [vw, vh, shape]);

  // Refs cho PanResponder (đọc giá trị mới nhất trong closure mà không re-tạo responder).
  const txRef = useRef(tx); txRef.current = tx;
  const tyRef = useRef(ty); tyRef.current = ty;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const baseRef = useRef(base); baseRef.current = base;
  const ringRef = useRef(ring); ringRef.current = ring;
  const vwRef = useRef(vw); vwRef.current = vw;
  const vhRef = useRef(vh); vhRef.current = vh;
  // Mốc lúc bắt đầu cử-chỉ. `n` = số ngón lúc lấy mốc — đổi số ngón là phải lấy MỐC MỚI.
  const gStart = useRef<{ tx: number; ty: number; zoom: number; dist: number; cx: number; cy: number; n: 1 | 2 } | null>(null);

  // ── Đặt ảnh CĂN GIỮA viewport khi lần đầu đo được kích thước (ccFit) ─────────
  const fitDone = useRef(false);
  const onWrapLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setVw(width); setVh(height);
    if (!fitDone.current && width && height) {
      const b = Math.max(width / NW, height / NH);
      const dw = NW * b, dh = NH * b;
      setTx((width - dw) / 2);
      setTy((height - dh) / 2);
      fitDone.current = true;
    }
  }, [NW, NH]);

  // ── Zoom quanh TÂM vòng (giữ điểm dưới tâm cố-định) — nút +/− (ccDoZoom) ─────
  const zoomAround = useCallback((factor: number) => {
    const r = ringRef.current;
    const sc0 = baseRef.current * zoomRef.current;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor));
    const sc1 = baseRef.current * z;
    setTx(r.cx - (r.cx - txRef.current) * (sc1 / sc0));
    setTy(r.cy - (r.cy - tyRef.current) * (sc1 / sc0));
    setZoom(z);
  }, []);

  // ── Trượt MƯỢT tới một tư-thế ảnh (thay vì nhảy cóc) ───────────────────────
  // Khung tự căn mà đổi phắt một cái thì người dùng mất dấu: không biết ảnh vừa
  // bị phóng hay bị đổi chỗ. Trượt ~0,5 s cho mắt bám theo được quả.
  // Người chạm vào ảnh là DỪNG ngay — tay người luôn thắng hoạt-ảnh.
  const glideRef = useRef<number | null>(null);
  const stopGlide = useCallback(() => {
    if (glideRef.current != null) { cancelAnimationFrame(glideRef.current); glideRef.current = null; }
  }, []);
  const glideTo = useCallback((to: { tx: number; ty: number; zoom: number }, ms = 520) => {
    stopGlide();
    const from = { tx: txRef.current, ty: tyRef.current, zoom: zoomRef.current };
    let t0 = -1;
    const tick = (now: number) => {
      if (t0 < 0) t0 = now;
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      setTx(from.tx + (to.tx - from.tx) * e);
      setTy(from.ty + (to.ty - from.ty) * e);
      setZoom(from.zoom + (to.zoom - from.zoom) * e);
      glideRef.current = k < 1 ? requestAnimationFrame(tick) : null;
    };
    glideRef.current = requestAnimationFrame(tick);
  }, [stopGlide]);
  useEffect(() => stopGlide, [stopGlide]);

  // ── Căn khung tròn ÔM 1 bbox (px ẢNH GỐC) — đặt zoom/tx/ty để khung phủ trùng quả ──
  // Toán: screenX = tx + natX*sc. Chọn sc sao cho cạnh-lớn bbox ≈ đường-kính khung
  // (×1.35 để chừa lề, quả không sát viền), rồi dịch để tâm bbox về tâm khung.
  // Tính theo vòng TRÒN (không lấy ringRef): hàm này ép shape về 'circle', mà ring
  // của khung elip đang mở có rx/ry khác — lấy nhầm thì căn lệch.
  const jumpToBox = useCallback((b: Bbox, animate = true) => {
    const cx = vwRef.current / 2, cy = vhRef.current * 0.44;
    const rr = Math.min(vwRef.current, vhRef.current) * 0.34;
    const longSide = Math.max(b[2], b[3], 1);     // cạnh lớn bbox (px ảnh gốc)
    const scWanted = (rr * 2) / (longSide * 1.35); // tỉ-lệ tổng cần (base*zoom)
    const b0 = baseRef.current || 1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scWanted / b0));
    const sc = b0 * z;
    const bcx = b[0] + b[2] / 2, bcy = b[1] + b[3] / 2; // tâm bbox (px gốc)
    setShape('circle'); setRot(0);
    const to = { tx: cx - bcx * sc, ty: cy - bcy * sc, zoom: z }; // tâm bbox → tâm khung
    if (animate) glideTo(to);
    else { stopGlide(); setZoom(to.zoom); setTx(to.tx); setTy(to.ty); }
  }, [glideTo, stopGlide]);

  // ── QUÉT 1 LẦN khi đã đo viewport (chỉ luồng quả-mới, KHÔNG khi thêm-góc) ────
  // Tìm thấy → TỰ căn khung vào quả luôn (không hỏi, không bắt bấm thêm nút).
  // Không thấy / lỗi mạng → tắt lớp phủ, báo một câu rồi để người dùng tự canh:
  // không chặn happy-path, cũng không im lặng làm người ta tưởng máy treo.
  useEffect(() => {
    if (fruitId || detectTried.current || !vw || !vh) return;
    detectTried.current = true;
    let alive = true;
    (async () => {
      // Mạng chết / server lỗi cũng phải TẮT được lớp phủ — kẹt trong màn "đang
      // quét" mà không có đường ra là hỏng nặng hơn hẳn việc không tìm ra quả.
      const r = await detectFruit(BASE_URL, imageUri, treeId).catch(() => null);
      if (!alive) return;
      const dets = r?.ok && r.data?.ok ? (r.data.detections ?? []) : [];
      setScanning(false);
      if (!dets.length) {
        if (!scanSkipped.current) {
          setScanNote({ ok: false, text: 'Chưa nhận ra quả — kéo và phóng để đưa quả vào vòng' });
        }
        return;
      }
      // Chọn quả TO nhất (diện-tích bbox lớn nhất) — thường là quả user muốn khoanh.
      const best = dets.reduce((m, d) => (d.bbox[2] * d.bbox[3] > m.bbox[2] * m.bbox[3] ? d : m), dets[0]);
      setDetectBox(best.bbox);
      // Đã bấm "tự canh bằng tay" thì thôi — giật khung lúc người ta đang kéo là tệ nhất.
      if (scanSkipped.current) return;
      jumpToBox(best.bbox);
      setScanNote({ ok: true, text: 'Đã căn khung vào quả tìm thấy — chỉnh thêm nếu cần' });
    })();
    return () => { alive = false; };
  }, [fruitId, vw, vh, imageUri, treeId, jumpToBox]);

  /**
   * KẾ HOẠCH CHỤP — hỏi máy chủ "quả này còn thiếu mặt nào" ngay khi mở màn.
   *
   * Chỉ chạy ở luồng THÊM GÓC (`fruitId` có): luồng quả mới chưa có đối tượng nào
   * trên máy chủ để lập kế hoạch, gọi vào là 404 chắc chắn.
   *
   * Lấy được mặt máy chủ đang thiếu thì đặt luôn cho bộ chọn — trước đây chỗ này
   * viết cứng `'side'`, tức mọi lượt bồi góc đều khai cùng một mặt bất kể quả
   * thiếu mặt nào. Hỏng thì KHÔNG làm gì: giữ nguyên `side` và không hiện dòng
   * hướng dẫn nào, thay vì bịa ra một câu nghe như của máy chủ.
   */
  // TRẢ VỀ kế hoạch vừa lấy, không chỉ đặt vào state: chỗ gọi ngay sau khi lưu
  // xong một góc cần đọc kế hoạch MỚI để quyết "mời chụp tiếp hay thoát", mà
  // `setPlan` thì phải chờ render kế tiếp mới thấy.
  // NHẬN mã quả làm tham số chứ không đọc `fruitId` của route: quả VỪA ĐĂNG KÝ
  // xong có mã máy chủ mới cấp, mã đó chưa nằm trong route params nào cả. Bản
  // trước chỉ đọc route nên quả mới — đúng lúc thiếu 8/9 tấm — là ca DUY NHẤT
  // không nhận được câu hướng dẫn nào.
  const fetchPlanFor = useCallback(async (
    targetId: string,
    afterReject?: null,
  ): Promise<CapturePlan | null> => {
    const r = await getCapturePlan(BASE_URL, 'fruit', targetId, { afterReject: afterReject ?? null })
      .catch(() => null);
    if (!r?.ok || !r.data?.ok) return null;
    setPlan(r.data);
    // Người dùng đã tự chọn mặt thì thôi — họ đang cầm quả trên tay.
    const face = suggestedFace(r.data);
    if (face && !faceTouched.current) setViewType(face);
    return r.data;
  }, []);

  const loadPlan = useCallback(async (afterReject?: null): Promise<CapturePlan | null> => {
    if (!fruitId) return null;
    return fetchPlanFor(fruitId, afterReject);
  }, [fruitId, fetchPlanFor]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  // Câu báo sau khi quét tự tắt — để lại thì nó thành một dòng chữ chết trên màn.
  useEffect(() => {
    if (!scanNote) return;
    const t = setTimeout(() => setScanNote(null), 3200);
    return () => clearTimeout(t);
  }, [scanNote]);

  // ── PanResponder: 1 ngón = PAN, 2 ngón = PINCH zoom (port ccBindGestures) ────
  //
  // ⚠️ LẤY MỐC LẠI MỖI KHI ĐỔI SỐ NGÓN. `onPanResponderGrant` chỉ chạy MỘT lần —
  // lúc ngón ĐẦU chạm xuống. Đặt ngón thứ hai sau đó KHÔNG sinh grant mới, nên
  // nếu cứ dùng mốc cũ thì `dist` mốc vẫn là của cử-chỉ 1 ngón (0 → ép về 1),
  // trong khi `touchDist` thật cỡ vài trăm px → tỉ-lệ vọt lên hàng trăm lần và
  // ảnh nhảy thẳng tới ZOOM_MAX ngay nhịp pinch đầu tiên. Rời bớt một ngón (2→1)
  // cũng vậy: mốc cũ là tâm 2 ngón, ảnh sẽ giật một phát.
  const rebase = useCallback((t: ReadonlyArray<{ pageX: number; pageY: number }>) => {
    const common = { tx: txRef.current, ty: tyRef.current, zoom: zoomRef.current };
    if (t.length >= 2) {
      const mid = touchMid(t as { pageX: number; pageY: number }[]);
      gStart.current = { ...common, dist: touchDist(t as { pageX: number; pageY: number }[]) || 1, cx: mid.x, cy: mid.y, n: 2 };
    } else {
      gStart.current = { ...common, dist: 0, cx: t[0].pageX, cy: t[0].pageY, n: 1 };
    }
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      stopGlide(); // tay người thắng hoạt-ảnh tự-căn
      rebase(e.nativeEvent.touches);
    },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      if (!t.length) return;
      const g = gStart.current;
      // Chưa có mốc, hoặc số ngón vừa đổi → lấy mốc mới rồi để nhịp sau xử lý.
      if (!g || g.n !== (t.length >= 2 ? 2 : 1)) { rebase(t); return; }
      if (t.length >= 2) {
        // PINCH: phóng quanh tâm 2 ngón lúc bắt đầu (port _ccDoPinch).
        const mid = touchMid(t);
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.zoom * (touchDist(t) / g.dist)));
        const sc0 = baseRef.current * g.zoom, sc1 = baseRef.current * z;
        // Giữ điểm-ảnh tại tâm 2-ngón lúc bắt đầu đứng yên, rồi theo cả dịch tâm ngón (port _ccDoPinch).
        setTx(mid.x - (g.cx - g.tx) * (sc1 / sc0));
        setTy(mid.y - (g.cy - g.ty) * (sc1 / sc0));
        setZoom(z);
      } else {
        // PAN: theo dịch chuyển 1 ngón.
        setTx(g.tx + (t[0].pageX - g.cx));
        setTy(g.ty + (t[0].pageY - g.cy));
      }
    },
    onPanResponderRelease: () => { gStart.current = null; },
    onPanResponderTerminate: () => { gStart.current = null; },
  }), [stopGlide, rebase]);

  // ── Đổi VÒNG ↔ ELIP (ccToggleShape) ────────────────────────────────────────
  const pickShape = useCallback((next: FruitShape) => {
    setShape(next);
    if (next === 'circle') setRot(0);
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // TOÁN MAP NGƯỢC: vòng (px màn hình) → bbox + points PIXEL ẢNH GỐC.
  // Port nguyên ccRegionToOrig: screenX = tx + natX*sc → natX = (screenX - tx)/sc.
  // ════════════════════════════════════════════════════════════════════════
  const regionToOrig = useCallback((): FruitRegion => {
    const sc = base * zoom;
    const { cx, cy, rx, ry } = ring;
    const cosr = Math.cos(rot), sinr = Math.sin(rot);
    // Hộp bao (px màn hình) của elip CÓ THỂ XOAY.
    const hw = Math.sqrt((rx * cosr) * (rx * cosr) + (ry * sinr) * (ry * sinr));
    const hh = Math.sqrt((rx * sinr) * (rx * sinr) + (ry * cosr) * (ry * cosr));
    const sx0 = cx - hw, sy0 = cy - hh, sx1 = cx + hw, sy1 = cy + hh;
    let nx0 = (sx0 - tx) / sc, ny0 = (sy0 - ty) / sc, nx1 = (sx1 - tx) / sc, ny1 = (sy1 - ty) / sc;
    nx0 = Math.max(0, Math.min(NW, nx0)); nx1 = Math.max(0, Math.min(NW, nx1));
    ny0 = Math.max(0, Math.min(NH, ny0)); ny1 = Math.max(0, Math.min(NH, ny1));
    const bx = Math.round(nx0), by = Math.round(ny0);
    const bw = Math.max(1, Math.round(nx1 - nx0)), bh = Math.max(1, Math.round(ny1 - ny0));
    // 8 điểm trên biên elip ĐÃ XOAY → px gốc (cho đa-góc/3D sau).
    const points: Array<[number, number]> = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      const sxp = cx + ex * cosr - ey * sinr, syp = cy + ex * sinr + ey * cosr;
      let px = (sxp - tx) / sc, py = (syp - ty) / sc;
      px = Math.max(0, Math.min(NW, px)); py = Math.max(0, Math.min(NH, py));
      points.push([Math.round(px), Math.round(py)]);
    }
    return { bbox: [bx, by, bw, bh] as Bbox, shape, points };
  }, [base, zoom, ring, rot, tx, ty, NW, NH, shape]);

  // ── pos_x / pos_h từ tâm bbox (ccPosFromBox) → gửi kèm enroll/add_view ──────
  const posFromBox = useCallback((bbox: Bbox): { x: number; h: number } => {
    const cx = bbox[0] + bbox[2] / 2, cy = bbox[1] + bbox[3] / 2;
    let x = cx / NW, h = 1 - cy / NH;
    x = Math.max(0, Math.min(1, x)); h = Math.max(0, Math.min(1, h));
    return { x: +x.toFixed(4), h: +h.toFixed(4) };
  }, [NW, NH]);

  // Quay lại từ màn đặt toạ-độ 3D → nhận toạ-độ mới rồi XOÁ tham số, để lần sau
  // mở lại màn này không bị dội lại giá trị cũ.
  useEffect(() => {
    if (!pickedCoord) return;
    setCoord(clampCoord(pickedCoord));
    setZPlaced(true);
    navigation.setParams({ pickedFruitCoord: undefined });
  }, [pickedCoord, navigation]);

  /**
   * Thêm GÓC cho một quả đã có, xử đúng ba tầng phản hồi.
   *
   * Chỗ hỏng của bản cũ: `if (r.ok) navigation.goBack()`. `r.ok` là cờ tầng VẬN
   * CHUYỂN — mọi HTTP 200 đều `ok: true`. Nhưng khi cổng bồi góc từ chối, máy chủ
   * trả **HTTP 200 kèm `{ok: false, warn, message}`**. Nên app đóng màn như đã
   * lưu, trong khi góc ảnh KHÔNG hề được thêm, và không một chữ nào báo.
   *
   * Ba tầng, xét theo đúng thứ tự:
   *   1. `!r.ok`              → hỏng mạng/máy chủ. Câu lỗi kỹ-thuật.
   *   2. `r.ok && !r.data.ok` → máy chủ TỪ CHỐI có lý do. Hiện `message` của họ
   *                             (đừng tự dịch) + nút ép thêm `allow_mismatch`.
   *   3. còn lại              → thật sự xong.
   */
  /**
   * Chụp NGAY tấm kế tiếp cho ĐÚNG quả này, không thoát ra màn quét.
   *
   * `replace` chứ không `navigate`: mỗi tấm thêm một màn khoanh vào ngăn xếp thì
   * chụp đủ 9 tấm là 9 màn chồng lên nhau, và nút Quay lại của người dùng phải
   * bấm 9 lần mới ra khỏi. Thay tại chỗ giữ ngăn xếp đúng một tầng.
   *
   * Mang theo `fruitId` nên vòng sau vào thẳng đường THÊM GÓC — bỏ hẳn bước dò
   * ứng viên và bước chọn đúng quả trong danh sách, hai bước tốn nhiều thao tác
   * nhất mà lại chỉ để trả lời một câu app đã biết sẵn.
   */
  const shootNext = useCallback(async (targetFruitId: string, nameOverride?: string) => {
    launchCamera(await withPhotoSave(PHOTO_OPTIONS), async (resp: any) => {
      if (resp.didCancel) return;
      if (resp.errorCode) {
        setErrMsg(resp.errorMessage ?? 'Không mở được máy ảnh. Kiểm tra quyền.');
        return;
      }
      const asset = resp.assets?.[0];
      if (!asset?.uri) return;
      if (!asset.width || !asset.height) {
        // Thiếu kích thước thì map-ngược vùng khoanh về pixel gốc sai — nói ra tại
        // đây, đừng để một bbox rác lặng lẽ vào kho.
        setErrMsg('Máy không trả kích thước ảnh. Anh chụp lại giúp.');
        return;
      }
      // Dựng NGAY lúc bấm máy: heading/pitch là số đo tại thời điểm đó, sang màn
      // sau người ta đã xoay máy và không dựng lại được.
      let cap: string | undefined;
      try {
        cap = serializeCaptureMeta(await buildCaptureMeta(asset, TreeReIDBridge));
      } catch { cap = undefined; }
      navigation.replace('FruitCropper', {
        treeId,
        treeName,
        imageUri: asset.uri,
        imageW: asset.width,
        imageH: asset.height,
        capture: cap,
        fruitId: targetFruitId,
        // Quả vừa đăng ký chưa có tên trong route — lấy tên người dùng vừa gõ,
        // không thì thanh tiêu-đề vòng sau chỉ ghi trống trơn "Quả".
        fruitName: nameOverride ?? fruitName,
        zone: zoneParam,
      });
    });
  }, [navigation, treeId, treeName, fruitName, zoneParam]);

  const runAddView = useCallback(async (
    targetFruitId: string,
    region: FruitRegion,
    p: { x: number; h: number },
    allowMismatch = false,
  ) => {
    setServerAsk(null);
    setErrMsg(null);
    setBusy(true);
    const r = await addFruitView(BASE_URL, targetFruitId, imageUri, region, {
      zone, posX: p.x, posH: p.h, viewType, allowMismatch: allowMismatch || undefined, capture,
      // CHỈ gửi posZ khi người dùng thật sự đặt độ sâu lần này. Máy chủ chỉ cập
      // nhật trường nào nhận được — gửi bừa là GHI ĐÈ mất độ sâu đặt lần trước.
      posZ: zPlaced ? coordToServer(coord).posZ : undefined,
    });
    setBusy(false);

    const outcome = outcomeOf(r);
    if (outcome === 'failed') { setErrMsg(r.error?.detail ?? 'Không thêm được góc. Thử lại.'); return; }

    if (outcome === 'needs_confirm') {
      const other = r.data?.best_other?.name;   // ĐỐI TƯỢNG, không phải chuỗi
      setServerAsk({
        message: r.data?.message
          ?? (other
            ? `Máy thấy ảnh này giống quả «${other}» hơn.`
            : 'Máy chưa chắc đây là đúng quả đó.'),
        yesLabel: 'Vẫn là quả này',
        onYes: () => { void runAddView(targetFruitId, region, p, true); },
      });
      // Câu từ chối nói VÌ SAO; kế hoạch nói LÀM GÌ TIẾP. Lấy lại kế hoạch để dòng
      // dưới nút cập nhật theo tình trạng vừa đổi.
      //
      // ⛔ KHÔNG gửi `after_reject` ở đường quả. `/api/fruit/add_view` từ chối bằng
      // HTTP 200 + `warn` ∈ {better_other, low_self}, và hai mã đó CHƯA có trong
      // bảng dịch `_REJECT_TO_ACTION` của máy chủ (nhà OriLife xác nhận 16/08).
      // Gửi lên hôm nay thì cửa trả kế hoạch THƯỜNG, im lặng, không báo lỗi — app
      // sẽ tưởng mình đang hiện câu gỡ đúng cái vừa chặn trong khi không phải.
      // Trường `message` máy chủ đã trả sẵn là câu tiếng Việt hoàn chỉnh, dùng nó.
      void loadPlan();
      return;
    }

    // ── Lưu xong MỘT tấm. Còn thiếu thì mời chụp tiếp ngay tại đây ───────────
    // Máy chủ đòi 3 mặt × 3 tấm cho một quả. Thoát ra sau mỗi tấm nghĩa là bắt
    // đi trọn vòng "về màn quét → mở máy ảnh → dò → chọn đúng quả trong danh
    // sách" chín lần cho một quả. Kế hoạch máy chủ đã nói sẵn còn thiếu mặt nào
    // và mấy tấm; dùng chính câu đó làm lời mời.
    //
    // Không lấy được kế hoạch → thoát như cũ. Không biết còn thiếu gì thì không
    // được dựng một lời mời nghe như của máy chủ (`nextShot.ts`).
    const fresh = await loadPlan();
    const ask = nextShotAsk(fresh);
    if (ask) {
      // Tấm này đã lên máy chủ. Ghim lại TRƯỚC khi dựng lời mời, vì từ lúc lời mời
      // hiện ra là nút "Thêm góc cho quả này" lại bấm được.
      setSentShotKey(shotKey);
      setServerAsk({
        message: ask.message,
        yesLabel: ask.yesLabel,
        onYes: () => { setServerAsk(null); void shootNext(targetFruitId); },
        noLabel: 'Xong quả này',
        onNo: () => { setServerAsk(null); navigation.goBack(); },
      });
      return;
    }

    navigation.goBack();
  }, [imageUri, zone, viewType, coord, zPlaced, capture, navigation, loadPlan, shootNext]);

  const openPlacer = useCallback(() => {
    navigation.navigate('FruitPlace3D', {
      treeId,
      treeName,
      fruitName: nameInput.trim() || 'Quả mới',
      initial: coord,
      returnTo: 'FruitCropper',
    });
  }, [navigation, treeId, treeName, nameInput, coord]);

  /**
   * Hỏi máy chủ "cây này đã có quả nào giống vùng vừa khoanh chưa".
   *
   * Tách riêng khỏi `useRegion` để nút "Thử lại" ở bước đối chiếu gọi lại được
   * đúng lượt hỏi đó mà không bắt người dùng khoanh lại từ đầu.
   *
   * Đọc kết cục bằng `outcomeOf`, KHÔNG bằng `r.ok`: `r.ok` là tầng vận chuyển,
   * mọi HTTP 200 đều xanh, kể cả lượt máy chủ trả `{ok:false}`.
   */
  const runCandidates = useCallback(async (reg: FruitRegion) => {
    setBusy(true);
    const r = await fruitCandidates(BASE_URL, treeId, imageUri, reg);
    setBusy(false);
    const failed = outcomeOf(r) !== 'ok';
    setCandFailed(failed);
    setCands(failed ? [] : (r.data?.candidates ?? []));
    setExpanded(false);
    setStep('candidates');
  }, [treeId, imageUri]);

  /**
   * "Dùng vùng này" → chốt vùng → candidates (hoặc add_view nếu có fruitId).
   *
   * ⚠️ `runAddView` PHẢI nằm trong danh sách phụ-thuộc. Nó được dựng lại mỗi khi
   * `viewType` đổi; thiếu nó ở đây là hàm này ôm mãi bản `runAddView` của lần
   * render đầu, tức mặt quả gửi lên luôn là `'side'` — giá trị đỗ tạm — dù người
   * dùng đã chọn "Đít quả", hoặc `/api/capture/plan` đã bảo chụp mặt khác.
   *
   * Lỗi đó chỉ nổ THEO THỨ TỰ THAO TÁC: chọn mặt rồi bấm ngay là sai; chọn mặt
   * rồi kéo/phóng ảnh (đổi `regionToOrig`) rồi mới bấm thì lại đúng. Nên có test
   * khoá lại ở `FruitCropperScreen.viewType.test.tsx` — đừng gỡ dep này ra.
   */
  const useRegion = useCallback(async () => {
    const reg = regionToOrig();
    if (reg.bbox[2] < 8 || reg.bbox[3] < 8) {
      setErrMsg('Vùng quá nhỏ — phóng to quả vào vòng rồi thử lại.');
      return;
    }
    setErrMsg(null);
    setLastRegion(reg);
    // Ước lượng SẴN toạ-độ từ chỗ quả nằm trong ảnh (ngang = x, cao = y) để người
    // dùng chỉ phải tinh chỉnh chứ không đặt từ đầu. Chiều sâu z KHÔNG suy ra được
    // từ ảnh phẳng → vẫn phải tự đặt ở màn 3D, không đặt thì để trống chứ không đoán.
    const est = posFromBox(reg.bbox);
    setCoord((c) => clampCoord({ ...c, x: est.x * 2 - 1, y: est.h }));
    setBusy(true);

    // Có fruitId (đến từ "thêm góc cho quả này") → add_view thẳng, bỏ qua candidates.
    if (fruitId) {
      const p = posFromBox(reg.bbox);
      await runAddView(fruitId, reg, p);
      return;
    }

    await runCandidates(reg);
  }, [regionToOrig, fruitId, posFromBox, runAddView, runCandidates]);

  // ── Chọn 1 quả-đã-có → THÊM GÓC (add_view) ─────────────────────────────────
  const pickCandidate = useCallback(async (cand: FruitCandidate) => {
    if (!lastRegion) return;
    await runAddView(cand.fruit_id, lastRegion, posFromBox(lastRegion.bbox));
  }, [lastRegion, posFromBox, runAddView]);

  // ── Lưu quả MỚI (enroll) ───────────────────────────────────────────────────
  /**
   * Lưu quả MỚI.
   *
   * Cùng bệnh với `runAddView`, và ở đây còn nặng hơn: `_apiCall` cố ý chuyển
   * HTTP 409 (trùng quả) thành `{ok: true, data}` để caller đọc cờ `duplicate`
   * — nhưng caller cũ không đọc. Nên `if (r.ok) goBack()` đóng màn như đã lưu
   * trong khi KHÔNG có quả nào được tạo, và nhánh `r.data?.fruit_id` cũng rơi
   * nên toạ-độ 3D không được ghi.
   *
   * Đây không phải ca hiếm: ngưỡng trùng dùng chung `ACCEPT_SIM = 0.72`, mà ở
   * mức đó **73,0% (412/564) cặp khác-quả-cùng-cây bị coi là khớp**. Nông dân
   * nhập tới quả thứ năm, thứ sáu trên cùng một cây là chạm liên tục.
   */
  const saveNewFruit = useCallback(async (allowDup = false) => {
    if (!lastRegion) return;
    const name = nameInput.trim();
    if (!name) { setErrMsg('Đặt tên cho quả trước khi lưu.'); return; }
    setServerAsk(null);
    setErrMsg(null);
    setBusy(true);
    // zone/pos_x/pos_h/pos_z SUY RA từ toạ-độ 3D → server và sơ-đồ 2D cũ vẫn hiểu đúng.
    // pos_z chỉ gửi khi người dùng đã thật sự đặt độ sâu (xem `zPlaced`).
    const srv = coordToServer(coord);
    const r = await enrollFruit(BASE_URL, treeId, name, imageUri, lastRegion, {
      zone: srv.zone, posX: srv.posX, posH: srv.posH, viewType, capture,
      posZ: zPlaced ? srv.posZ : undefined,
      allowDup: allowDup || undefined,
    });
    setBusy(false);

    const outcome = outcomeOf(r);
    if (outcome === 'failed') { setErrMsg(r.error?.detail ?? 'Không lưu được quả. Thử lại.'); return; }

    if (outcome === 'needs_confirm') {
      const similar = r.data?.similar?.name;
      setServerAsk({
        message: r.data?.message
          ?? (similar
            ? `Máy nghĩ đây là quả «${similar}» đã có. Anh/chị đang cầm một quả khác?`
            : 'Máy nghĩ quả này đã có trong kho.'),
        yesLabel: 'Đây là quả khác',
        onYes: () => { void saveNewFruit(true); },
      });
      return;
    }

    // Máy chủ đã giữ đủ 3 chiều; bản cục bộ chỉ còn là bộ nhớ đệm cho máy này
    // (và là chỗ duy nhất giữ được chỉnh-sửa từ FruitPlace3D — xem màn đó).
    const newFruitId = r.data?.fruit_id;
    if (newFruitId) await saveFruitCoord(newFruitId, coord);

    // ── Quả MỚI = quả thiếu nhiều ảnh nhất, đừng thả người ta ra ở đây ───────
    // Đăng ký xong mới có một tấm; máy chủ đòi 3 mặt × 3 tấm. Bản trước thoát
    // thẳng, nên đúng cái quả trống nhất lại là quả DUY NHẤT không được mời chụp
    // tiếp — đường bồi góc thì có, đường đăng ký thì không.
    //
    // Hỏi kế hoạch bằng mã máy chủ VỪA cấp. Không lấy được (mạng hỏng, máy chủ
    // chưa kịp lập chỉ mục) → thoát như cũ, không bịa lời mời.
    if (newFruitId) {
      const fresh = await fetchPlanFor(newFruitId);
      const ask = nextShotAsk(fresh);
      if (ask) {
        // Quả đã đăng ký xong trên máy chủ. Ghim TRƯỚC khi dựng lời mời — xem
        // `sentShotKey`. Bấm "Lưu quả" lần nữa ở đây là đăng ký một quả THỨ HAI
        // từ đúng tấm ảnh vừa dùng.
        setSentShotKey(shotKey);
        setServerAsk({
          message: ask.message,
          yesLabel: ask.yesLabel,
          onYes: () => { setServerAsk(null); void shootNext(newFruitId, name); },
          noLabel: 'Xong quả này',
          onNo: () => { setServerAsk(null); navigation.goBack(); },
        });
        return;
      }
    }

    navigation.goBack();
  }, [lastRegion, nameInput, coord, zPlaced, treeId, imageUri, viewType, capture, navigation, fetchPlanFor, shootNext]);

  // ── Quay lại bước crop để khoanh vùng khác ─────────────────────────────────
  const recrop = useCallback(() => { setErrMsg(null); setStep('crop'); }, []);

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  const sc = base * zoom;
  const dimW = NW * sc, dimH = NH * sc;

  // Mask 4 panel nền tối quanh hộp-bao vòng (che mờ ngoài khung — KHÔNG cần SVG).
  // Hộp-bao theo bán-kính LỚN HƠN (elip xoay vẫn bao trọn) để khung không bị cắt.
  const maxR = Math.max(ring.rx, ring.ry);
  const holeL = ring.cx - maxR, holeT = ring.cy - maxR, holeS = maxR * 2;

  // ── Bước 1: KHOANH — ảnh chiếm trọn màn, nút nổi lên trên ──────────────────
  const renderCrop = () => (
    <View style={styles.stageRoot}>
      <StatusBar barStyle="light-content" backgroundColor={STAGE_BG} />

      <View style={StyleSheet.absoluteFill} onLayout={onWrapLayout} {...panResponder.panHandlers}>
        {vw > 0 && (
          <Image
            source={{ uri: imageUri }}
            style={[styles.img, {
              width: dimW, height: dimH,
              transform: [{ translateX: tx }, { translateY: ty }],
            }]}
            resizeMode="stretch"
          />
        )}

        {/* MASK: 4 panel nền tối quanh hộp-bao vòng (top/bottom/left/right).
            Trong lúc quét thì GIẤU cả mask lẫn vòng: lúc đó ảnh còn chưa căn,
            khoe sẵn một cái vòng trống giữa màn chỉ tổ rối — quét xong, khung
            hiện ra ĐÚNG lúc nó đã ôm vào quả. */}
        {vw > 0 && !scanning && (
          <>
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, right: 0, top: 0, height: Math.max(0, holeT) }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, right: 0, top: holeT + holeS, bottom: 0 }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, width: Math.max(0, holeL), top: holeT, height: holeS }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { right: 0, left: holeL + holeS, top: holeT, height: holeS }]} />
          </>
        )}

        {/* VÒNG: View borderRadius (tròn = nửa cạnh; elip = rộng/cao khác nhau + xoay) */}
        {vw > 0 && !scanning && (
          <View
            pointerEvents="none"
            style={[styles.ring, {
              left: ring.cx - ring.rx,
              top: ring.cy - ring.ry,
              width: ring.rx * 2,
              height: ring.ry * 2,
              borderRadius: Math.max(ring.rx, ring.ry),
              transform: [{ rotate: `${rot}rad` }],
            }]}
          />
        )}
      </View>

      {/* ── Lớp phủ ĐANG QUÉT — nằm trên ảnh, dưới thanh tiêu-đề (vẫn thoát ra được) ── */}
      {scanning && vw > 0 ? (
        <ScanOverlay
          w={vw}
          h={vh}
          bottomInset={insets.bottom}
          onSkip={() => { scanSkipped.current = true; setScanning(false); }}
        />
      ) : null}

      {/* ── Thanh trên (nổi) ──────────────────────────────────────────────── */}
      <View style={[styles.stageTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.chromeBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="chevron-left" size={17} color={ON_STAGE} />
        </TouchableOpacity>
        <View style={styles.stageTitleWrap} pointerEvents="none">
          <Text style={styles.stageEyebrow}>{fruitId ? 'THÊM GÓC ẢNH' : 'KHOANH QUẢ'}</Text>
          <Text style={styles.stageTitle} numberOfLines={1}>
            {fruitId ? (fruitName || 'Quả') : (treeName || 'Cây')}
          </Text>
        </View>
        <View style={styles.chromeBtnGhost} />
      </View>

      {/* ── Cột nút bên phải: căn lại / phóng / thu / xoay ─────────────────── */}
      <View style={[styles.stageSide, scanning && styles.hidden]} pointerEvents={scanning ? 'none' : 'box-none'}>
        {/* Căn lại vào quả máy đã tìm — không phải nút mời gọi như trước (khung đã
            tự căn rồi), chỉ là đường về sau khi người dùng kéo lệch mất quả. */}
        {detectBox ? (
          <TouchableOpacity
            style={[styles.chromeBtn, styles.chromeBtnDetect]}
            onPress={() => jumpToBox(detectBox)}
            activeOpacity={0.8}
          >
            <Icon name="bullseye" size={17} color={DETECT_GREEN} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.chromeBtn} onPress={() => zoomAround(1.2)} activeOpacity={0.8}>
          <Icon name="magnifying-glass-plus" size={17} color={ON_STAGE} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.chromeBtn} onPress={() => zoomAround(0.83)} activeOpacity={0.8}>
          <Icon name="magnifying-glass-minus" size={17} color={ON_STAGE} />
        </TouchableOpacity>
        {shape === 'ellipse' ? (
          <>
            <TouchableOpacity style={styles.chromeBtn} onPress={() => setRot(r => r - ROT_STEP)} activeOpacity={0.8}>
              <Icon name="rotate-left" size={17} color={ON_STAGE} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chromeBtn} onPress={() => setRot(r => r + ROT_STEP)} activeOpacity={0.8}>
              <Icon name="rotate-right" size={17} color={ON_STAGE} />
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {/* ── Thanh dưới (nổi): hình khung · gợi ý · nút chính ──────────────── */}
      <View
        style={[styles.stageBottom, { paddingBottom: Math.max(insets.bottom, 10) + 8 }, scanning && styles.hidden]}
        pointerEvents={scanning ? 'none' : 'box-none'}
      >
        {/* Kết quả quét: một câu rồi tự tắt. Không phải nút — khung đã tự căn xong,
            người dùng chỉ cần biết VÌ SAO ảnh vừa tự dịch chuyển. */}
        {scanNote ? (
          <View style={[styles.notePill, scanNote.ok && styles.notePillOk]}>
            <Icon
              name={scanNote.ok ? 'check' : 'arrows-up-down-left-right'}
              size={12}
              color={scanNote.ok ? DETECT_GREEN : ON_STAGE}
            />
            <Text style={styles.noteTxt} numberOfLines={2}>{scanNote.text}</Text>
          </View>
        ) : null}

        <View style={styles.shapeSeg}>
          <ShapeOption label="Quả tròn" on={shape === 'circle'} wide={false} onPress={() => pickShape('circle')} />
          <ShapeOption label="Quả dài" on={shape === 'ellipse'} wide onPress={() => pickShape('ellipse')} />
        </View>

        {/*
          MẶT nào của quả. Máy chủ cần biết để thôi đem mặt đáy so với góc hông:
          54/54 góc đã lưu trước nay đều thiếu trường này, và đó là gốc của việc
          cổng bồi góc chặn oan 30 trên 32 lượt. Đặt ở bước khoanh vì cả hai
          đường (thêm góc thẳng, và qua bước đối chiếu) đều đi qua đây.
        */}
        {/*
          Việc-phải-làm tiếp, do MÁY CHỦ đặt câu (`next.text_vi`) — không hiện gì
          khi chưa có kế hoạch. `why_vi` là dòng phụ, chữ nhỏ.
        */}
        {plan?.next?.text_vi ? (
          <View style={styles.planBox}>
            <Icon name="lightbulb" size={12} color={DETECT_GREEN} />
            <View style={styles.planTxtWrap}>
              <Text style={styles.planTxt} numberOfLines={2}>{plan.next.text_vi}</Text>
              {plan.why_vi ? (
                <Text style={styles.planWhy} numberOfLines={2}>{plan.why_vi}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={styles.viewLbl}>ĐANG CHỤP MẶT NÀO</Text>
        <View style={styles.viewSeg}>
          {VIEW_CHOICES.map(v => (
            <TouchableOpacity
              key={v.key}
              style={[styles.viewOpt, viewType === v.key && styles.viewOptOn]}
              onPress={() => pickFace(v.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: viewType === v.key }}
            >
              <Text style={[styles.viewOptTxt, viewType === v.key && styles.viewOptTxtOn]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.stageHint}>
          <Icon name="arrows-up-down-left-right" size={12} color={ON_STAGE} opacity={0.7} />
          <Text style={styles.stageHintTxt} numberOfLines={2}>
            Kéo để di chuyển, chụm hai ngón để phóng — đưa một quả vào vòng
          </Text>
        </View>

        {errMsg ? (
          <View style={styles.stageErr}>
            <Icon name="triangle-exclamation" size={13} color={RING_COLOR} />
            <Text style={styles.stageErrTxt} numberOfLines={2}>{errMsg}</Text>
          </View>
        ) : null}

        <ServerAsk ask={serverAsk} busy={busy} onDismiss={() => setServerAsk(null)} />

        <TouchableOpacity
          testID="crop-use-region"
          style={[styles.stagePrimary, (busy || shotAlreadySent) && styles.disabled]}
          disabled={busy || shotAlreadySent}
          onPress={useRegion}
          activeOpacity={0.88}
        >
          {busy ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Icon name={shotAlreadySent ? 'circle-check' : 'check'} size={15} color={COLORS.white} />
              <Text style={styles.stagePrimaryTxt}>
                {shotAlreadySent
                  ? 'Đã lưu tấm này'
                  : fruitId ? 'Thêm góc cho quả này' : 'Dùng vùng này'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const top = cands.length ? cands[0] : null;
  const others = cands.slice(1);

  const candRow = (c: FruitCandidate, isTop: boolean) => (
    <TouchableOpacity
      key={c.fruit_id}
      style={[styles.candRow, isTop && styles.candTop]}
      disabled={busy}
      onPress={() => pickCandidate(c)}
      activeOpacity={0.8}
    >
      {/* Ảnh ứng viên ở màn NHẬN DIỆN: đây không phải trang trí, người dùng nhìn ảnh
          để chọn "đây là quả nào". Ảnh hỏng mà không rơi về icon thì họ phải chọn mù
          theo mỗi cái tên "(chưa đặt tên)". */}
      <View style={styles.cThumb}>
        <RemoteImage
          uri={absUrl(c.thumbnail_url)}
          style={styles.cThumbImg}
          containerStyle={styles.cThumbImg}
          resizeMode="cover"
          placeholder={<Icon name="apple-whole" size={22} color={COLORS.textMuted} />}
        />
      </View>
      <View style={styles.cBody}>
        <View style={styles.cNameRow}>
          {isTop ? <Icon name="star" size={11} color={COLORS.warning} /> : null}
          <Text style={styles.cName} numberOfLines={1}>{c.name || 'Chưa đặt tên'}</Text>
        </View>
        <Text style={styles.cViews} numberOfLines={1}>
          {c.n_views} góc{isTop ? ' · giống nhất, bấm nếu đúng quả này' : ''}
        </Text>
      </View>
      <View style={styles.cPick}>
        <Icon name="check" size={13} color={COLORS.success} />
      </View>
    </TouchableOpacity>
  );

  // ── Bước 2: ĐỐI CHIẾU ──────────────────────────────────────────────────────
  const renderCandidates = () => (
    <View style={styles.container}>
      <SheetHeader
        eyebrow={tk('trace.crop.step', { i: 2, n: 3 })}
        title={tk('trace.crop.whichFruit')}
        onBack={recrop}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.muted}>{tk('trace.crop.whichFruitHint')}</Text>

        {top ? candRow(top, true) : null}

        {/* Chưa soi được thì KHÔNG mời tạo quả mới: lúc này app không biết cây đã
            có quả này chưa, mà tạo trùng là hỏng hồ sơ vĩnh viễn. Chỉ mời thử lại. */}
        {candFailed ? null : (
          <TouchableOpacity
            style={styles.candNew}
            disabled={busy}
            onPress={() => setStep('naming')}
            activeOpacity={0.85}
          >
            <Icon name="circle-plus" size={15} color={COLORS.white} />
            <Text style={styles.candNewTxt}>{tk('trace.crop.isNew')}</Text>
          </TouchableOpacity>
        )}

        {others.length > 0 && !expanded ? (
          <TouchableOpacity style={styles.linkBtn} onPress={() => setExpanded(true)} activeOpacity={0.7}>
            <Icon name="chevron-down" size={12} color={COLORS.accent} />
            <Text style={styles.linkTxt}>{tk('trace.crop.seeOthers', { n: others.length })}</Text>
          </TouchableOpacity>
        ) : null}

        {others.length > 0 && expanded ? (
          <>
            <Text style={styles.sectionLbl}>{tk('trace.crop.allFruits')}</Text>
            {others.map(c => candRow(c, false))}
            <TouchableOpacity style={styles.linkBtn} onPress={() => setExpanded(false)} activeOpacity={0.7}>
              <Icon name="chevron-up" size={12} color={COLORS.accent} />
              <Text style={styles.linkTxt}>{tk('trace.crop.collapse')}</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {candFailed ? (
          <>
            <Text style={styles.muted}>{tk('trace.crop.matchFailed')}</Text>
            <TouchableOpacity
              style={styles.candNew}
              disabled={busy || !lastRegion}
              onPress={() => { if (lastRegion) void runCandidates(lastRegion); }}
              activeOpacity={0.85}
            >
              <Icon name="arrow-rotate-left" size={15} color={COLORS.white} />
              <Text style={styles.candNewTxt}>{tk('trace.crop.matchRetry')}</Text>
            </TouchableOpacity>
          </>
        ) : !cands.length ? (
          <Text style={styles.muted}>{tk('trace.crop.nothingToMatch')}</Text>
        ) : null}

        {errMsg ? <ErrLine text={errMsg} /> : null}
        <ServerAsk ask={serverAsk} busy={busy} onDismiss={() => setServerAsk(null)} />
        {busy ? <ActivityIndicator color={COLORS.accent} style={styles.inlineLoader} /> : null}

        <TouchableOpacity style={styles.ghost} onPress={recrop} activeOpacity={0.8}>
          <Icon name="arrow-rotate-left" size={14} color={COLORS.textSub} />
          <Text style={styles.ghostTxt}>{tk('trace.crop.recrop')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ── Bước 3: ĐẶT TÊN + VỊ TRÍ ───────────────────────────────────────────────
  const renderNaming = () => (
    <View style={styles.container}>
      <SheetHeader
        eyebrow={tk('trace.crop.step', { i: 3, n: 3 })}
        title={tk('trace.crop.newFruit')}
        onBack={() => { setErrMsg(null); setStep('candidates'); }}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          {tk('trace.crop.saveOnTree', { name: treeName || tk('trace.crop.thisTree') })}
        </Text>

        <Text style={styles.sectionLbl}>{tk('trace.crop.fruitName')}</Text>
        <View style={styles.inputWrap}>
          <Icon name="tag" size={14} color={COLORS.textMuted} />
          <TextInput
            style={styles.input}
            placeholder={tk('trace.crop.fruitNameHint')}
            placeholderTextColor={COLORS.textMuted}
            value={nameInput}
            onChangeText={setNameInput}
            autoFocus
            returnKeyType="done"
          />
        </View>

        <Text style={styles.sectionLbl}>{tk('trace.crop.whereOnTree')}</Text>
        <TouchableOpacity style={styles.coordBox} onPress={openPlacer} activeOpacity={0.8}>
          <View style={styles.coordIcon}><Icon name="location-dot" size={15} color={COLORS.accent} /></View>
          <View style={styles.coordBody}>
            <Text style={styles.coordTitle}>{tk('trace.crop.place3d')}</Text>
            <Text style={styles.coordHint}>{tk('trace.crop.place3dHint')}</Text>
          </View>
          <Icon name="chevron-right" size={13} color={COLORS.accentLight} />
        </TouchableOpacity>

        <View style={styles.coordVals}>
          <CoordVal axis="X" v={coord.x} />
          <CoordVal axis="Y" v={coord.y} />
          <CoordVal axis="Z" v={coord.z} />
          <View style={styles.coordZone}><Text style={styles.coordZoneTxt}>{ZONE_LABEL[zone]}</Text></View>
        </View>

        {/* Lối tắt chọn tầng thô — cho người chỉ cần nhanh, không muốn mở màn 3D. */}
        <View style={styles.zoneRow}>
          {(['base', 'mid', 'canopy'] as TreeZone[]).map(z => (
            <TouchableOpacity
              key={z}
              style={[styles.zoneBtn, zone === z && styles.zoneBtnOn]}
              onPress={() => setCoord(c => clampCoord({ ...c, y: zoneToY(z) }))}
              activeOpacity={0.8}
            >
              <Text style={[styles.zoneTxt, zone === z && styles.zoneTxtOn]}>{ZONE_VI[z]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {errMsg ? <ErrLine text={errMsg} /> : null}
        <ServerAsk ask={serverAsk} busy={busy} onDismiss={() => setServerAsk(null)} />

        <TouchableOpacity
          testID="crop-save-fruit"
          style={[styles.primary, (busy || shotAlreadySent) && styles.disabled]}
          disabled={busy || shotAlreadySent}
          // KHÔNG truyền thẳng `saveNewFruit`: onPress đưa vào một
          // GestureResponderEvent, nó sẽ rơi đúng chỗ tham số `allowDup` và luôn
          // truthy ⟹ mọi lần lưu đều ép qua cổng trùng.
          onPress={() => { void saveNewFruit(); }}
          activeOpacity={0.88}
        >
          {busy ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Icon name={shotAlreadySent ? 'circle-check' : 'floppy-disk'} size={15} color={COLORS.white} />
              <Text style={styles.primaryTxt}>
                {shotAlreadySent ? 'Đã lưu quả này' : tk('trace.crop.save')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return step === 'crop' ? renderCrop() : step === 'candidates' ? renderCandidates() : renderNaming();
};

// ── Mảnh nhỏ ────────────────────────────────────────────────────────────────

/** Ô chọn hình khung. Hình tròn/elip vẽ bằng CHÍNH icon `circle` kéo giãn ngang. */
const ShapeOption: React.FC<{ label: string; on: boolean; wide: boolean; onPress: () => void }> = ({
  label, on, wide, onPress,
}) => (
  <TouchableOpacity style={[styles.shapeOpt, on && styles.shapeOptOn]} onPress={onPress} activeOpacity={0.8}>
    <View style={wide ? styles.shapeGlyphWide : undefined}>
      <Icon name="circle" size={13} color={on ? '#0E1512' : ON_STAGE} variant="outline" strokeWidth={44} />
    </View>
    <Text style={[styles.shapeTxt, on && styles.shapeTxtOn]}>{label}</Text>
  </TouchableOpacity>
);

const SheetHeader: React.FC<{ eyebrow: string; title: string; onBack: () => void }> = ({
  eyebrow, title, onBack,
}) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.headerBtn} onPress={onBack} hitSlop={8}>
      <Icon name="chevron-left" size={17} color={COLORS.text} />
    </TouchableOpacity>
    <View style={styles.headerTitles}>
      <Text style={styles.headerEyebrow}>{eyebrow}</Text>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  </View>
);

const CoordVal: React.FC<{ axis: string; v: number }> = ({ axis, v }) => (
  <View style={styles.coordVal}>
    <Text style={styles.coordAxis}>{axis}</Text>
    <Text style={styles.coordNum}>{v.toFixed(2)}</Text>
  </View>
);

const ErrLine: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.errLine}>
    <Icon name="triangle-exclamation" size={13} color={COLORS.error} />
    <Text style={styles.errTxt}>{text}</Text>
  </View>
);

/**
 * Máy chủ từ chối NHƯNG vẫn trả HTTP 200. Trước đây màn tự đóng lại như đã lưu.
 *
 * Câu chữ lấy nguyên của máy chủ (`data.message`), KHÔNG dịch lại ở app: OriLife
 * đặt câu theo dữ-liệu họ có (tên quả nào giống hơn, đã đủ mấy góc), app dịch lại
 * là làm hỏng thông tin đó.
 *
 * Luôn có nút "vẫn làm". OriLife nói thẳng: người đứng tại vườn đúng nhiều hơn
 * máy — cổng bồi góc từng chặn oan 30 trên 32 lượt, có quả bị chặn 14 lần liền
 * mà chỉ gom nổi 2 góc.
 */
const ServerAsk: React.FC<{
  ask: {
    message: string; yesLabel: string; onYes: () => void;
    noLabel?: string; onNo?: () => void;
  } | null;
  busy: boolean;
  onDismiss: () => void;
}> = ({ ask, busy, onDismiss }) => {
  if (!ask) return null;
  return (
    <View style={styles.askBox}>
      <View style={styles.askHead}>
        <Icon name="circle-question" size={14} color={COLORS.warning} />
        <Text style={styles.askTxt}>{ask.message}</Text>
      </View>
      <View style={styles.askRow}>
        <TouchableOpacity
          style={[styles.askGhost, busy && styles.disabled]}
          disabled={busy}
          onPress={ask.onNo ?? onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.askGhostTxt}>{ask.noLabel ?? 'Để xem lại'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.askYes, busy && styles.disabled]}
          disabled={busy}
          onPress={ask.onYes}
          activeOpacity={0.85}
        >
          <Text style={styles.askYesTxt}>{ask.yesLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // ── Bước KHOANH (nền tối, nút nổi trên ảnh) ───────────────────────────────
  stageRoot: { flex: 1, backgroundColor: STAGE_BG },
  img: { position: 'absolute', top: 0, left: 0 },
  maskPanel: { position: 'absolute', backgroundColor: 'rgba(14,21,18,0.66)' },
  ring: { position: 'absolute', borderWidth: 2.5, borderColor: RING_COLOR, backgroundColor: 'transparent' },

  stageTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingBottom: 10,
  },
  stageTitleWrap: { flex: 1, minWidth: 0 },
  stageEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.8, color: RING_COLOR },
  stageTitle: { fontSize: 17, fontWeight: '800', color: ON_STAGE, letterSpacing: -0.3 },

  chromeBtn: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHROME_BG, borderWidth: 1, borderColor: CHROME_BORDER,
  },
  chromeBtnGhost: { width: 40, height: 40 },
  chromeBtnDetect: { borderColor: 'rgba(34,197,94,0.55)', backgroundColor: 'rgba(34,197,94,0.16)' },
  hidden: { opacity: 0 },

  stageSide: { position: 'absolute', right: 14, top: '30%', gap: 10 },

  // ── Lớp phủ ĐANG QUÉT ─────────────────────────────────────────────────────
  scanOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,21,18,0.58)' },
  scanDot: {
    position: 'absolute',
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
    backgroundColor: DETECT_GREEN,
  },

  scanFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, gap: 6 },
  scanCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CHROME_BG, borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  scanCardBody: { flex: 1, minWidth: 0, gap: 2 },
  scanTitle: { color: ON_STAGE, fontSize: 14.5, fontWeight: '800' },
  scanSub: { color: ON_STAGE, opacity: 0.66, fontSize: 12, lineHeight: 17 },
  scanSkip: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  scanSkipTxt: { color: ON_STAGE, opacity: 0.7, fontSize: 13, fontWeight: '700' },

  // ── Câu báo sau khi quét ──────────────────────────────────────────────────
  notePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: CHROME_BG, borderWidth: 1, borderColor: CHROME_BORDER,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
  },
  notePillOk: { borderColor: 'rgba(34,197,94,0.45)' },
  noteTxt: { flexShrink: 1, color: ON_STAGE, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },

  stageBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingTop: 14, gap: 10,
  },
  shapeSeg: {
    flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 4, borderRadius: 16,
    backgroundColor: CHROME_BG, borderWidth: 1, borderColor: CHROME_BORDER,
  },
  shapeOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  shapeOptOn: { backgroundColor: RING_COLOR },
  shapeGlyphWide: { transform: [{ scaleX: 1.5 }] },
  shapeTxt: { fontSize: 13, fontWeight: '700', color: ON_STAGE },
  shapeTxtOn: { color: '#0E1512' },

  stageHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  stageHintTxt: { color: ON_STAGE, opacity: 0.72, fontSize: 12, lineHeight: 17 },

  stageErr: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CHROME_BG, borderWidth: 1, borderColor: CHROME_BORDER,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
  },
  stageErrTxt: { flex: 1, color: ON_STAGE, fontSize: 12, lineHeight: 17 },

  stagePrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 16,
  },
  stagePrimaryTxt: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },

  // ── Header hai bước sau ───────────────────────────────────────────────────
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, gap: 12 },
  headerBtn: {
    width: 44, height: 44, ...ORGANIC_TILE, ...ORG_ELEV.card,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_SURFACE.raised,
  },
  headerTitles: { flex: 1, minWidth: 0 },
  // Nhãn bước để nhỏ và NHẠT, không in hoa giãn chữ: nó là số thứ tự, không phải
  // tiêu đề. Tiêu đề mới là câu người dùng cần đọc.
  headerEyebrow: { fontSize: 13, fontWeight: '600', color: ORG_TONE.primary },
  headerTitle: { ...ORG_TYPE.title, fontSize: 23, marginTop: 1 },

  scroll: { paddingHorizontal: 18, paddingBottom: 32 },
  muted: { ...ORG_TYPE.caption, fontSize: 14.5, marginBottom: 12 },
  sectionLbl: { ...ORG_TYPE.section, fontSize: 17, marginTop: 20, marginBottom: 8 },
  inlineLoader: { marginVertical: 10 },

  // Đối chiếu
  candRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: ORG_SURFACE.raised, ...ORGANIC_CARD, ...ORG_ELEV.card,
    padding: 12, marginBottom: 8,
  },
  candTop: { borderColor: ORG_TONE.primary, borderWidth: 1.5 },
  cThumb: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.inputBg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cThumbImg: { width: '100%', height: '100%' },
  cBody: { flex: 1, minWidth: 0, gap: 3 },
  cNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cName: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  cViews: { fontSize: 12, color: COLORS.textMuted },
  cPick: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentGlow,
  },
  candNew: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.success, paddingVertical: 14, borderRadius: 16, marginTop: 4,
  },
  candNewTxt: { color: COLORS.white, fontSize: 15, fontWeight: '700' },

  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  linkTxt: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },

  ghost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16, marginTop: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.inputBg,
  },
  ghostTxt: { color: COLORS.textSub, fontSize: 14, fontWeight: '700' },

  // Đặt tên
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    backgroundColor: COLORS.inputBg, paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.text },

  coordBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 16,
    backgroundColor: COLORS.card, padding: 12,
  },
  coordIcon: {
    width: 38, height: 38, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentGlow,
  },
  coordBody: { flex: 1, minWidth: 0, gap: 2 },
  coordTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  coordHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },

  coordVals: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  coordVal: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10,
  },
  coordAxis: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  coordNum: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  coordZone: {
    marginLeft: 'auto', backgroundColor: COLORS.accentGlow,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  coordZoneTxt: { fontSize: 12, fontWeight: '800', color: COLORS.accent },

  zoneRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  zoneBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.inputBg,
  },
  zoneBtnOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  zoneTxt: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  zoneTxtOn: { color: COLORS.white },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 16, marginTop: 22,
  },
  primaryTxt: { color: COLORS.white, fontSize: 16, fontWeight: '800' },

  errLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  errTxt: { flex: 1, color: COLORS.error, fontSize: 13, lineHeight: 18 },

  // Chọn MẶT quả (bước khoanh, nền tối)
  planBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12,
    paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(94,197,138,0.35)',
  },
  planTxtWrap: { flex: 1 },
  planTxt: { color: ON_STAGE, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  planWhy: { color: ON_STAGE, opacity: 0.62, fontSize: 11, lineHeight: 15, marginTop: 2 },
  viewLbl: { color: ON_STAGE, opacity: 0.65, fontSize: 10, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  viewSeg: { flexDirection: 'row', gap: 6 },
  viewOpt: {
    flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  viewOptOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  viewOptTxt: { color: ON_STAGE, fontSize: 12, fontWeight: '600' },
  viewOptTxtOn: { color: COLORS.white },

  // Hộp máy chủ hỏi lại (từ chối kèm lý do + nút vẫn làm)
  askBox: {
    marginTop: 14, padding: 12, borderRadius: 11,
    backgroundColor: '#fdf5e6', borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  askHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  askTxt: { flex: 1, color: '#6b4a12', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  askRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  askGhost: {
    flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(107,74,18,0.3)',
  },
  askGhostTxt: { color: '#6b4a12', fontSize: 13, fontWeight: '600' },
  askYes: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: COLORS.accent },
  askYesTxt: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
});

export default FruitCropperScreen;
