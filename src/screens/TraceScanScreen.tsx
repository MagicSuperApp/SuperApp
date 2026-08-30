/**
 * TraceScanScreen — MÀN QUÉT TRUY XUẤT, cho NGƯỜI MUA.
 *
 * Hai đường vào cùng một câu hỏi "quả này từ đâu ra":
 *   · **Mã QR** — mã in trên bao bì. Nhanh, chắc, nhưng phải có bao bì.
 *   · **Chụp quả** — NGƯỜI DÙNG bấm nút chụp, gửi `POST /api/fruit/lookup`, rồi
 *     bày tối đa 5 quả ứng viên để người mua TỰ đối chiếu.
 *
 * ══ ĐÃ BỎ: VÒNG TỰ CHỤP ═══════════════════════════════════════════════════
 * Bản trước tự bấm máy khi thấy điện thoại đứng yên đủ lâu. Bỏ, vì nó làm màn
 * hình khó hiểu và khó gỡ lỗi:
 *
 *   · **Không ai biết máy đang làm gì.** Ảnh tự gửi đi mà người dùng không bấm
 *     gì; câu dưới khung đổi liên tục (đang lấy nét → giữ yên → đang gửi → chưa
 *     tìm thấy → …). Nhìn vào chỉ thấy màn hình tự động nhấp nháy.
 *   · **Không tái hiện được lỗi.** Một lượt hỏng thì không biết tấm nào đã gửi,
 *     gửi lúc nào, vì cái gì. Bấm tay thì mỗi lỗi ứng với đúng một cú bấm.
 *   · **Chốt "đứng yên" là một phép đo YẾU.** Nó chỉ đo góc xoay của la bàn, và
 *     im lặng tắt hẳn trên máy thiếu từ kế hay trên iOS. Một cái chốt lúc có lúc
 *     không thì không phải cái chốt.
 *   · **Tốn mạng của người khác.** Vòng lặp gửi ảnh 3G mà người dùng không chủ
 *     động yêu cầu lượt nào.
 *
 * Nay: một cú bấm = một lượt gửi. Muốn thử lại thì bấm lại. Máy chủ vẫn giữ
 * quyền bảo chờ (429) và nút chụp tôn trọng lệnh đó.
 *
 * ══ NHẬN DIỆN QUẢ: TOÀN BỘ Ở MÁY CHỦ ══════════════════════════════════════
 * Màn này **gửi nguyên tấm ảnh** và không làm gì với nó ngoài việc co cho lọt
 * trần 2MB. Không dò quả, không khoanh vùng, không chấm điểm — tất cả nằm sau
 * `POST /api/fruit/lookup`, nơi có mô hình thật.
 *
 * ── Khoanh vùng: máy chủ chỉ, người dùng chọn ───────────────────────────────
 * Cửa `lookup` nhận `bbox` để chỉ đúng quả. Ảnh có nhiều quả thì máy chủ trả
 * `need_region` **kèm `regions`** — đó là mô hình nhận diện của chính nó nói
 * "tôi thấy quả ở những chỗ này, bạn hỏi quả nào?". Màn vẽ các vùng đó lên khung
 * xem, người dùng chạm một cái, app gửi lại **CÙNG tấm ảnh** kèm `bbox`.
 *
 * Một bản trước đã bỏ cụm này rồi khôi phục lại. Ghi lại vì sao khôi phục: bỏ nó
 * thì ca "nhiều quả trong khung" thành ngõ cụt — app chỉ còn biết bảo người ta
 * lại gần chụp lại, trong khi máy chủ ĐÃ chỉ ra sẵn từng quả. Vứt một câu trả
 * lời đã có để bắt người dùng chụp lại là đắt hơn hẳn việc học một cú chạm.
 *
 * Ba hệ toạ độ trong đường này (ảnh gửi đi ↔ khung xem ↔ tấm đã cắt vuông) nằm
 * gọn trong `previewBox`, có bài kiểm bám. Chúng là chỗ dễ sai, không phải chỗ
 * không làm được.
 *
 * Máy chủ vẫn có quyền trả `need_region` với danh sách RỖNG (không thấy quả nào).
 * Lúc đó không có gì để chạm, và app nói thẳng "lại gần, chụp riêng một quả".
 *
 * ── Phía máy cũng KHÔNG chấm điểm ảnh ──────────────────────────────────────
 * `react-native-camera-kit` không mở khung hình cho JS (không frame processor)
 * và không thư viện nào trong máy đọc được pixel của tấm JPEG vừa chụp, nên độ
 * nét và độ sáng không đo được. Máy chủ phán, và màn này nhắc lại đúng lời nó —
 * kể cả câu "ảnh chưa dùng được".
 *
 * ══ VÌ SAO KHÔNG GỬI VỊ TRÍ ═══════════════════════════════════════════════
 * `lookupFruit` không có tham số toạ độ, và màn này không xin quyền vị trí. Người
 * mua chụp quả trong bếp nhà mình; đính toạ độ bếp vào một yêu cầu không đăng
 * nhập là theo dõi, không phải truy xuất.
 *
 * ══ GIAO DIỆN ═════════════════════════════════════════════════════════════
 * Nền SÁNG (khác bản trước nền đen): người mua mở màn này giữa chợ hoặc trong
 * bếp — nền đen giữa ban ngày là nền chói nhất có thể chọn, và nó cũng không
 * giống bất kỳ màn nào khác của app. Khung xem là ô VUÔNG giữa màn: quả tròn,
 * khung vuông vừa khít, và ô vuông thì không thiên vị hướng cầm máy.
 *
 * Biểu tượng lấy từ bộ Iconify riêng của dự án (`components/Icon`), không dùng
 * `react-native-vector-icons` như bản trước — bộ kia là một phông chữ nạp rời,
 * và app đã có sổ đăng ký SVG dựng sẵn.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, Linking, Modal, PermissionsAndroid, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
// @ts-ignore — react-native-camera-kit không kèm types cho prop scanBarcode
import { Camera } from 'react-native-camera-kit';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { useTk } from '../i18n/keys';
import { parseTraceCode, parseTreeCode } from '../navigation/traceScan';
import { TRACE_RESULT_ROUTE_NAME } from './TraceResultScreen';
import { ORILIFE_BASE } from '../services/orilifeBase';
import {
  candidateImageUrl, isAnchored, lookupFruit, provenanceOf, safeExplorerUrl, safeHttpUrl,
  type LookupCandidate, type LookupRegion,
} from '../services/fruitLookupService';
import { prepareForLookup, type PreparedImage } from '../features/traceScan/prepareImage';
import {
  hitTest, imageBoxToPreview, matchSlots, padBbox, previewPointToImage,
  type PixelBbox, type Rect,
} from '../features/traceScan/previewBox';
import ScanRegionBox from '../features/traceScan/ScanRegionBox';
import CandidateDetailSheet from '../features/traceScan/CandidateDetailSheet';
import {
  NATURE, ORGANIC_CARD, RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../modules/trace/theme/depth';
import { withAlpha } from '../theme/tokens';

type Mode = 'qr' | 'fruit';

/**
 * Bao nhiêu vùng vẽ được cùng lúc. Bằng trần ứng viên của máy chủ.
 *
 * Ô vẽ SỐNG LÂU hơn từng lượt trả về — `matchSlots` gán hộp mới vào ô cũ gần nó
 * nhất, nhờ vậy khung trượt tới chỗ mới thay vì biến mất rồi hiện lại.
 */
const BOX_SLOTS = 5;

/** Ảnh lấy từ thư viện: co ngay lúc chọn, khỏi phải co lần nữa. */
const LIBRARY_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
  selectionLimit: 1,
};

/** Kết quả một lượt tra, ở dạng màn hình cần. */
type Outcome =
  | { s: 'scanning' }
  /**
   * Máy chủ thấy nhiều quả và hỏi lại. Giữ CHÍNH tấm ảnh đã gửi, vì lượt sau
   * phải gửi lại đúng tấm đó kèm `bbox` — chụp tấm mới thì quả đã xê dịch và hộp
   * người dùng vừa chạm trỏ vào chỗ khác.
   */
  | { s: 'pick_region'; image: PreparedImage; regions: LookupRegion[] }
  | { s: 'candidates'; list: LookupCandidate[]; note?: string }
  /**
   * `text` là câu CỦA MÁY CHỦ (hoặc câu lỗi thật). Nó thắng `key`.
   *
   * Bản trước gộp mọi nhánh lỗi vào một câu "Có trục trặc khi tra" và ném đi
   * `error.detail` — tức ném đi đúng thứ nói được chuyện gì đã xảy ra. Người
   * dùng nhận một câu vô nghĩa, còn người sửa lỗi thì không có gì để bám.
   */
  | { s: 'message'; key: string; text?: string; retry: boolean; vars?: Record<string, number> }
  | { s: 'unknown_code'; code: string };

const TraceScanScreen: React.FC = () => {
  const tk = useTk();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: winW, height: winH } = useWindowDimensions();

  const cameraRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('qr');
  const [torch, setTorch] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ s: 'scanning' });
  const [busy, setBusy] = useState(false);
  const [qrLocked, setQrLocked] = useState(false);
  /** Năm ô vẽ vùng nhận diện. Ô sống lâu hơn từng lượt trả về — xem `BOX_SLOTS`. */
  const [slots, setSlots] = useState<(Rect | null)[]>(() => new Array(BOX_SLOTS).fill(null));
  /**
   * Ứng viên đang mở hồ sơ. `null` = chưa chọn ai.
   *
   * Tách khỏi `outcome` vì hai thứ này chồng lên nhau chứ không thay nhau: hồ sơ
   * mở ĐÈ lên danh sách năm quả, đóng lại là danh sách còn nguyên phía dưới. Nhét
   * nó thành một nhánh của `outcome` thì đóng hồ sơ là mất luôn danh sách, và
   * người mua phải chụp lại từ đầu chỉ vì bấm nhầm một hàng.
   */
  const [detail, setDetail] = useState<LookupCandidate | null>(null);
  /**
   * Mốc máy chủ bảo chờ tới (429 `retry_after`). `null` = không bị chặn.
   *
   * STATE chứ không ref: nút chụp tay bị khoá theo nó, và một `ref` hết hạn thì
   * không có gì bắt màn vẽ lại — nút sẽ nằm im cho tới khi có việc khác làm màn
   * vẽ lại, tức người dùng thấy nút chết lâu hơn thời gian máy chủ thật sự xin.
   */
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);

  const busyRef = useRef(false);
  const handledCode = useRef(false);
  const alive = useRef(true);

  // Ô vuông giữa màn. Chặn theo cả bề ngang lẫn chiều cao để máy nhỏ không bị
  // khung đẩy mất hàng nút bên dưới.
  const frame = Math.round(Math.min(winW - SPACE.xl * 2, winH * 0.44));
  const frameSize = useMemo(() => ({ w: frame, h: frame }), [frame]);

  useEffect(() => () => { alive.current = false; }, []);

  /**
   * Lệnh chờ của máy chủ TỰ hết hạn.
   *
   * Phải hẹn giờ tường minh: trước đây vòng tự chụp vẽ lại màn mỗi 350ms nên nút
   * sống lại "tình cờ" đúng lúc. Bỏ vòng rồi mà không hẹn giờ thì `blockedUntil`
   * qua hạn vẫn nằm đó, và nút chụp chết cho tới khi có việc khác làm màn vẽ lại
   * — người dùng chịu phạt lâu hơn thời gian máy chủ thật sự xin.
   */
  useEffect(() => {
    if (blockedUntil === null) return;
    const ms = blockedUntil - Date.now();
    if (ms <= 0) { setBlockedUntil(null); return; }
    const id = setTimeout(() => setBlockedUntil(null), ms);
    return () => clearTimeout(id);
  }, [blockedUntil]);

  // ── Quyền máy ảnh ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'android') { if (!cancelled) setGranted(true); return; }
      try {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!cancelled) setGranted(res === PermissionsAndroid.RESULTS.GRANTED);
      } catch {
        if (!cancelled) setGranted(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const safeBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  // ── Một lượt tra ──────────────────────────────────────────────────────────
  /** Xoá hết vùng đang vẽ. */
  const clearBoxes = useCallback(() => {
    setSlots(new Array(BOX_SLOTS).fill(null));
  }, []);

  /**
   * Quy `regions` của máy chủ về khung xem rồi gán vào ô.
   *
   * Gán qua `matchSlots` để mỗi khung trượt tới vùng GẦN NÓ NHẤT — máy chủ không
   * hứa giữ thứ tự, và gán theo chỉ số thì hai khung bay chéo qua nhau giữa màn.
   */
  const showRegions = useCallback((regions: LookupRegion[], image: PreparedImage) => {
    const rects = regions
      .map((d) => imageBoxToPreview(d.bbox, { w: image.width, h: image.height }, frameSize))
      .filter((r): r is Rect => r !== null);
    setSlots((prev) => matchSlots(prev, rects, BOX_SLOTS));
  }, [frameSize]);

  /**
   * Gửi một tấm ảnh đi tra. `region` chỉ có khi người dùng vừa chạm chọn một vùng.
   *
   * KHÔNG ném. Mọi nhánh kết thúc bằng một `Outcome` — một màn quét đứng im
   * không nói gì là màn quét mà người ta tắt đi.
   */
  const runLookup = useCallback(async (
    image: PreparedImage,
    region?: { bbox: PixelBbox },
  ) => {
    const r = await lookupFruit(ORILIFE_BASE, image.uri, region);
    if (!alive.current) return;

    if (r.kind === 'candidates') {
      clearBoxes();
      // Câu của máy chủ (`verdict_label`, `message`, `warning_messages`) nói rõ
      // hơn bất cứ câu nào app tự soạn — nó biết vì sao nó xếp ra danh sách này.
      const note = [r.verdictLabel, r.message, ...r.warnings].filter(Boolean).join(' · ') || undefined;
      setOutcome({ s: 'candidates', list: r.candidates, note });
      return;
    }
    if (r.kind === 'need_region') {
      // Có vùng để chạm ⇒ vẽ ra và mời chọn. KHÔNG có vùng nào (máy chủ không
      // thấy quả nào) ⇒ không có gì để chạm, nói thẳng là chụp lại gần hơn.
      //
      // Ở nhánh CÓ vùng thì câu của máy chủ ("mời chỉ đúng quả rồi gửi lại") lại
      // đúng với app, nên chuyển tiếp nguyên văn.
      if (r.regions.length === 0) {
        clearBoxes();
        setOutcome({ s: 'message', key: 'scan.state.oneFruit', retry: true });
        return;
      }
      showRegions(r.regions, image);
      setOutcome({ s: 'pick_region', image, regions: r.regions });
      return;
    }
    if (r.kind === 'empty_scope') {
      clearBoxes();
      setOutcome({ s: 'message', key: 'scan.state.noMatch', text: r.message, retry: true });
      return;
    }
    if (r.kind === 'image_unusable') {
      clearBoxes();
      setOutcome({ s: 'message', key: 'scan.state.imageUnusable', text: r.message, retry: true });
      return;
    }
    if (r.kind === 'rate_limited') {
      clearBoxes();
      // Máy chủ đang tự bảo vệ. Khoá nút chụp tới hạn nó đưa — bấm lại ngay là
      // dập đúng cái cửa vừa xin mình chờ.
      setBlockedUntil(Date.now() + r.retryAfterSec * 1000);
      setOutcome({
        s: 'message',
        key: 'scan.state.rateLimited',
        vars: { n: r.retryAfterSec },
        text: r.message,
        retry: true,
      });
      return;
    }
    if (r.kind === 'too_large') {
      clearBoxes();
      setOutcome({ s: 'message', key: 'scan.state.tooLarge', retry: true });
      return;
    }
    clearBoxes();
    // Nhánh cuối: HIỆN câu lỗi thật (`error.detail`) chứ không nuốt nó. Câu ấy
    // phân biệt được "mất mạng" với "máy chủ chưa bật cửa này" với "ảnh sai định
    // dạng" — ba chuyện dẫn tới ba hành động khác nhau.
    setOutcome({ s: 'message', key: 'scan.error.generic', text: r.error.detail, retry: true });
  }, [clearBoxes, showRegions]);

  /**
   * Chụp một tấm từ khung xem rồi tra. Đường DUY NHẤT tạo ra một lượt gửi ảnh —
   * và nó chỉ chạy khi người dùng bấm nút.
   */
  const shoot = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setOutcome({ s: 'scanning' });
    try {
      const cap = await cameraRef.current?.capture?.();
      if (!cap?.uri) throw new Error('no capture');
      // `square: true` — cắt về đúng ô vuông người dùng vừa ngắm. Máy ảnh trả
      // TRỌN khung 4:3, rộng hơn khung ngắm; gửi cả hai mép thừa là gửi những quả
      // họ chưa từng nhìn thấy, rồi bị máy chủ trả "ảnh có nhiều quả".
      const prepared = await prepareForLookup(cap.uri, cap.width, cap.height, { square: true });
      if (!alive.current) return;
      if (prepared.kind === 'too_large') {
        setOutcome({
          s: 'message',
          key: prepared.noResizer ? 'scan.state.tooLargeNoResizer' : 'scan.state.tooLarge',
          retry: true,
        });
        return;
      }
      await runLookup(prepared.image);
    } catch {
      if (alive.current) setOutcome({ s: 'message', key: 'scan.error.generic', retry: true });
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }, [runLookup]);

  /**
   * Đổi chế độ = bắt đầu lại từ đầu. NHƯNG không xoá `blockedUntil`: lệnh chờ là
   * của MÁY CHỦ, và bấm "quét lại" không huỷ được nó — huỷ ở đây thì người dùng
   * bấm hai cái là quay lại dập đúng cửa vừa xin mình chờ.
   */
  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    handledCode.current = false;
    setQrLocked(false);
    setOutcome({ s: 'scanning' });
    clearBoxes();
  }, [clearBoxes]);

  const rescan = useCallback(() => switchMode(mode), [switchMode, mode]);

  // ── Mã QR ─────────────────────────────────────────────────────────────────
  const onReadCode = useCallback((event: any) => {
    if (mode !== 'qr' || handledCode.current) return;
    const raw = event?.nativeEvent?.codeStringValue;
    if (!raw) return;
    handledCode.current = true;
    setQrLocked(true);

    // Khoá khung một nhịp rồi mới chuyển màn: mã đọc xong mà màn nhảy ngay thì
    // người dùng không kịp thấy máy đã đọc được gì — họ chỉ thấy màn hình đổi.
    setTimeout(() => {
      if (!alive.current) return;
      const target = parseTraceCode(raw);
      if (target) { navigation.replace(target.route, target.params); return; }
      const code = parseTreeCode(raw);
      if (code) { navigation.replace(TRACE_RESULT_ROUTE_NAME, { code }); return; }
      setQrLocked(false);
      setOutcome({ s: 'unknown_code', code: raw });
    }, 280);
  }, [mode, navigation]);

  // ── Chạm chọn vùng khi máy chủ hỏi `need_region` ──────────────────────────
  /**
   * Ngón tay chạm lên khung xem → chọn một vùng → gửi lại CÙNG tấm ảnh kèm `bbox`.
   *
   * Hai đường tìm vùng, và đường thứ hai mới là đường hay dùng:
   *   1. chạm TRÚNG một khung đang vẽ (`hitTest`, khung nhỏ nhất thắng);
   *   2. chạm TRƯỢT ra ngoài khung — quy điểm chạm về pixel ảnh rồi tìm vùng nào
   *      chứa nó. Ngón tay to hơn khung nhiều, và bắt người ta chạm lại cho trúng
   *      là bắt họ chơi trò bấm nút.
   */
  const onFrameTap = useCallback((e: GestureResponderEvent) => {
    if (outcome.s !== 'pick_region') return;
    const { locationX, locationY } = e.nativeEvent;
    const image = outcome.image;
    const imgSize = { w: image.width, h: image.height };

    let bbox: PixelBbox | null = null;
    const idx = hitTest(slots, { x: locationX, y: locationY });
    if (idx >= 0 && outcome.regions[idx]) {
      bbox = outcome.regions[idx].bbox;
    } else {
      const pt = previewPointToImage({ x: locationX, y: locationY }, imgSize, frameSize);
      if (pt) {
        const hit = outcome.regions.find(
          (d: LookupRegion) => pt.x >= d.bbox[0] && pt.x <= d.bbox[0] + d.bbox[2]
            && pt.y >= d.bbox[1] && pt.y <= d.bbox[1] + d.bbox[3],
        );
        bbox = hit?.bbox ?? null;
      }
    }
    // Chạm vào chỗ không có vùng nào: KHÔNG làm gì. Gửi bừa một vùng gần đó là
    // trả lời một câu người dùng không hỏi.
    if (!bbox) return;

    setBusy(true);
    busyRef.current = true;
    setOutcome({ s: 'scanning' });
    clearBoxes();
    runLookup(image, { bbox: padBbox(bbox, imgSize) })
      .finally(() => {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      });
  }, [outcome, slots, frameSize, runLookup, clearBoxes]);

  // ── Ảnh có sẵn ────────────────────────────────────────────────────────────
  const pickFromLibrary = useCallback(() => {
    launchImageLibrary(LIBRARY_OPTIONS, async (resp: any) => {
      const asset = resp?.assets?.[0];
      if (!asset?.uri || !alive.current) return;
      setMode('fruit');
      setBusy(true);
      busyRef.current = true;
      setOutcome({ s: 'scanning' });
      clearBoxes();
      try {
        // KHÔNG `square` ở đây: ảnh thư viện không đi qua khung ngắm nào, cắt là
        // tự ý xén ảnh của người ta.
        const prepared = await prepareForLookup(asset.uri, asset.width ?? 0, asset.height ?? 0);
        if (!alive.current) return;
        if (prepared.kind === 'too_large') {
          setOutcome({
            s: 'message',
            key: prepared.noResizer ? 'scan.state.tooLargeNoResizer' : 'scan.state.tooLarge',
            retry: true,
          });
          return;
        }
        await runLookup(prepared.image);
      } catch {
        if (alive.current) setOutcome({ s: 'message', key: 'scan.error.generic', retry: true });
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    });
  }, [runLookup, clearBoxes]);

  // ── Chọn một ứng viên ─────────────────────────────────────────────────────
  /**
   * Chạm vào một ứng viên → MỞ HỒ SƠ của nó, không nhảy màn.
   *
   * Bản trước `navigation.replace` thẳng sang trang xuất xứ bằng `tree.code`.
   * Hai chỗ hỏng: `code` có thể VẮNG (máy chủ không hứa nó luôn có giá trị) và
   * lúc đó chạm vào một hàng thì **không có gì xảy ra**; còn những trường máy chủ
   * ĐÃ trả — tên cây, ngày đăng ký, số góc ảnh, trạng thái neo — thì xin về rồi
   * vứt đi, không hiện ở đâu.
   *
   * Nay hồ sơ bày hết những gì đã có, và đi tiếp sang trang xuất xứ là một NÚT
   * trong đó. Thiếu `code` thì thiếu đúng cái nút ấy, phần còn lại vẫn đọc được.
   */
  const openCandidate = useCallback((c: LookupCandidate) => {
    setDetail(c);
  }, []);

  /** Từ hồ sơ đi tiếp sang trang xuất xứ công khai. */
  const openTrace = useCallback((code: string) => {
    setDetail(null);
    navigation.replace(TRACE_RESULT_ROUTE_NAME, { code });
  }, [navigation]);

  // ── Câu hiện dưới khung ───────────────────────────────────────────────────
  const serverBlocked = blockedUntil !== null && Date.now() < blockedUntil;

  /**
   * Câu của MÁY CHỦ thắng câu của app.
   *
   * Máy chủ gửi kèm `message` tiếng Việt ở hầu hết các nhánh, và nó biết chuyện
   * gì vừa xảy ra rõ hơn app. App chỉ soạn câu khi máy chủ im.
   */
  const statusText = outcome.s === 'message' ? outcome.text : undefined;
  const statusKey = (() => {
    if (qrLocked) return 'scan.state.qrLocked';
    if (busy) return 'scan.state.sending';
    if (outcome.s === 'pick_region') return 'scan.state.pickFruit';
    if (outcome.s === 'message') return outcome.key;
    if (mode === 'qr') return 'scan.hint.qr';
    return 'scan.hint.fruit';
  })();
  const statusVars = outcome.s === 'message' ? outcome.vars : undefined;

  // ── Không có quyền ────────────────────────────────────────────────────────
  if (granted === false) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
        <Header onBack={safeBack} title={tk('scan.title')} />
        <View style={styles.centerPad}>
          <Icon name="camera" size={30} color={NATURE.barkSoft} />
          <Text style={[TYPE.cardTitle, styles.centerTxt]}>{tk('scan.perm.title')}</Text>
          <Text style={[TYPE.caption, styles.centerTxt]}>{tk('scan.perm.body')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.primaryBtnTxt}>{tk('scan.perm.open')}</Text>
          </Pressable>
          <Pressable onPress={safeBack} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>{tk('scan.btn.close')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /**
   * Sheet đang PHỦ KÍN camera ⟹ THÁO hẳn `<Camera>`, đừng chỉ để nó chạy sau lưng.
   *
   * Đo ở thực địa 19/08: iOS lag rõ ở màn này còn Android thì không. Lý do là phía
   * sau sheet vẫn có một `AVCaptureSession` chạy đủ tốc độ, mà sheet lại `transparent`
   * nên hệ phải hợp thành từng khung hình ĐÈ LÊN lớp camera sống. Android nhẹ hơn vì
   * Modal chỉ là View trong cùng cây, không có hai tầng hợp thành như vậy.
   *
   * CHỈ hai trạng thái này che kín: `candidates` và `unknown_code` (hai `<Modal>` ở
   * cuối tệp). `message` là chữ vẽ THẲNG trên màn và `pick_region` thì người dùng
   * đang chạm vào chính khung xem — tháo camera ở hai ca đó là làm hỏng màn.
   *
   * Đánh đổi đã chấp nhận: đóng sheet thì camera dựng lại, mất chừng 200–400 ms. Người
   * đang đọc kết quả không nhìn camera, còn pin giữa chợ thì đáng giá hơn khoảng đó.
   */
  const sheetCoversCamera = outcome.s === 'candidates' || outcome.s === 'unknown_code';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
      <Header onBack={safeBack} title={tk('scan.title')} />

      {/* ── Hai chế độ ────────────────────────────────────────────────────── */}
      <View style={styles.tabs}>
        <ModeTab
          icon="qrcode"
          label={tk('scan.mode.qr')}
          active={mode === 'qr'}
          onPress={() => switchMode('qr')}
        />
        <ModeTab
          icon="apple-whole"
          label={tk('scan.mode.fruit')}
          active={mode === 'fruit'}
          onPress={() => switchMode('fruit')}
        />
      </View>

      {/* ── Khung xem VUÔNG giữa màn ──────────────────────────────────────── */}
      <View style={styles.stage}>
        {/* Khung xem chỉ NHẬN CHẠM khi máy chủ đang hỏi chọn vùng. Ngoài lúc đó
            thì để nguyên — một vùng nuốt cú chạm rồi không làm gì là một vùng
            làm người ta tưởng app đơ. */}
        <Pressable
          style={[styles.frame, { width: frame, height: frame }]}
          onPress={onFrameTap}
          disabled={outcome.s !== 'pick_region'}
        >
          {granted === null || sheetCoversCamera ? (
            <View style={styles.frameFill}>
              {granted === null ? <ActivityIndicator color={TONE.primary} /> : null}
            </View>
          ) : (
            <Camera
              ref={cameraRef}
              style={styles.frameFill}
              resizeMode="cover"
              torchMode={torch ? 'on' : 'off'}
              focusMode="on"
              // Chỉ đọc mã ở chế độ QR: bật cả lúc đang chụp quả là mời một mã lạ
              // trong nền cướp mất màn hình giữa chừng.
              scanBarcode={mode === 'qr'}
              showFrame={false}
              onReadCode={onReadCode}
            />
          )}

          {/* Bốn góc của khung xem — mốc để người dùng đặt quả/mã vào giữa. */}
          <FrameCorners
            color={qrLocked ? TONE.primary : withAlpha(NATURE.paper, 0.95)}
            thick={qrLocked ? 4 : 3}
            locked={qrLocked}
          />

          {/* VÙNG NHẬN DIỆN — mảng xanh mờ, chấm bi, sóng quét chạy dọc.
              Vẽ SAU bốn góc khung nên nằm trên; `pointerEvents="none"` bên trong
              từng hộp nên cú chạm rơi xuống `Pressable` bọc ngoài, không bị hộp
              nuốt mất. */}
          {slots.map((rect, i) => (
            <ScanRegionBox
              key={i}
              uid={`r${i}`}
              rect={rect}
              color={TONE.primary}
              active={outcome.s === 'pick_region'}
            />
          ))}

          {busy ? (
            <View style={styles.busyVeil} pointerEvents="none">
              <ActivityIndicator color={NATURE.paper} />
            </View>
          ) : null}
        </Pressable>

        <Text style={styles.status} numberOfLines={3}>
          {statusText || tk(statusKey, statusVars)}
        </Text>

        {outcome.s === 'message' && outcome.retry ? (
          <Pressable style={styles.retryBtn} onPress={rescan}>
            <Icon name="arrows-rotate" size={14} color={TONE.primaryDeep} />
            <Text style={styles.retryTxt}>{tk('scan.btn.retry')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Hàng nút ──────────────────────────────────────────────────────── */}
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
        <RoundBtn
          icon="images"
          label={tk('scan.btn.gallery')}
          onPress={pickFromLibrary}
        />
        <Pressable
          style={({ pressed }) => [
            styles.shutter, pressed && styles.pressed, (busy || serverBlocked) && styles.shutterOff,
          ]}
          onPress={() => { setMode('fruit'); shoot(); }}
          // Nút chịu lệnh chờ của máy chủ (429): người sốt ruột sẽ bấm liên tục,
          // và đó đúng là thứ máy chủ vừa xin đừng làm.
          disabled={busy || serverBlocked}
          accessibilityRole="button"
          accessibilityLabel={tk('scan.btn.shutter')}
        >
          <View style={styles.shutterCore} />
        </Pressable>
        <RoundBtn
          icon="lightbulb"
          label={tk('scan.btn.torch')}
          active={torch}
          onPress={() => setTorch((t) => !t)}
        />
      </View>

      {/* ── Mã lạ ─────────────────────────────────────────────────────────── */}
      <Modal visible={outcome.s === 'unknown_code'} transparent animationType="fade" onRequestClose={rescan}>
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <Text style={TYPE.section}>{tk('scan.unknown.title')}</Text>
            <Text style={[TYPE.caption, styles.sheetBody]}>{tk('scan.unknown.body')}</Text>
            {outcome.s === 'unknown_code' && outcome.code ? (
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>{tk('scan.unknown.label')}</Text>
                <Text style={styles.codeVal} numberOfLines={2}>{outcome.code}</Text>
              </View>
            ) : null}
            <Pressable style={styles.primaryBtn} onPress={rescan}>
              <Text style={styles.primaryBtnTxt}>{tk('scan.btn.retry')}</Text>
            </Pressable>
            <Pressable onPress={() => switchMode('fruit')} style={styles.linkBtn}>
              <Text style={styles.linkTxt}>{tk('scan.mode.fruit')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Năm quả ứng viên ──────────────────────────────────────────────── */}
      <Modal
        visible={outcome.s === 'candidates'}
        transparent
        animationType="slide"
        onRequestClose={rescan}
      >
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <Text style={TYPE.section}>{tk('scan.result.title')}</Text>
            {/* KHÔNG có dấu tích xanh cho quả điểm cao nhất, và câu này nói rõ vì
                sao: máy soi quả nhận nhầm 73% cặp quả khác nhau cùng một cây (đo
                trên prod, xem `fruitLookupService`). Mắt người mới là trọng tài. */}
            <Text style={[TYPE.caption, styles.sheetBody]}>
              {(outcome.s === 'candidates' && outcome.note) || tk('scan.result.sub')}
            </Text>
            <ScrollView style={styles.candList} showsVerticalScrollIndicator={false}>
              {outcome.s === 'candidates' ? outcome.list.map((c) => (
                <CandidateRow key={c.pick} c={c} onPress={() => openCandidate(c)} tk={tk} />
              )) : null}
            </ScrollView>
            <Pressable style={styles.primaryBtn} onPress={rescan}>
              <Text style={styles.primaryBtnTxt}>{tk('scan.btn.retry')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Hồ sơ một ứng viên — mở ĐÈ lên danh sách, đóng lại là danh sách còn đó.
            PHẢI nằm TRONG Modal này, không được đưa ra ngoài làm Modal anh em: trên
            iOS, Modal là view controller trình bày thật nên cái thứ hai KHÔNG present
            được khi cái thứ nhất đang present — bấm một dòng quả sẽ không ra gì, âm
            thầm, không lỗi. Android thì Modal chỉ là View nên chạy tốt, và đó là lý
            do lỗi này chỉ lộ trên iOS. `CandidateDetailSheet` nay là lớp phủ tuyệt
            đối, không còn Modal riêng. */}
        <CandidateDetailSheet
          candidate={detail}
          onClose={() => setDetail(null)}
          onOpenTrace={openTrace}
        />
      </Modal>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Mảnh nhỏ
// ═══════════════════════════════════════════════════════════════════════════

const Header: React.FC<{ onBack: () => void; title: string }> = ({ onBack, title }) => (
  <View style={styles.header}>
    <Pressable onPress={onBack} hitSlop={12} style={styles.headerBtn} accessibilityRole="button">
      <Icon name="chevron-left" size={20} color={NATURE.bark} />
    </Pressable>
    <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    <View style={styles.headerBtn} />
  </View>
);

const ModeTab: React.FC<{
  icon: string; label: string; active: boolean; onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.tab, active && styles.tabOn, pressed && styles.pressed]}
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
  >
    <Icon name={icon} size={14} color={active ? NATURE.paper : NATURE.barkSoft} />
    <Text style={[styles.tabTxt, active && styles.tabTxtOn]}>{label}</Text>
  </Pressable>
);

/**
 * Bốn góc của khung xem. Viền kín che mất chính thứ đang soi, bốn góc thì không.
 *
 * `locked` = vừa đọc được mã QR: bốn góc THÍT VÀO và đổi sang màu chính, mượt.
 *
 * ⚠ Đây CỐ Ý là hoạt ảnh của KHUNG, không phải một hộp quanh mã.
 * `react-native-camera-kit` chỉ trả về chuỗi mã, KHÔNG trả toạ độ
 * (`CameraProps.d.ts` — `OnReadCodeData = { codeStringValue, codeFormat }`). Vẽ
 * một hộp "quanh mã QR" ở đây là vẽ một vị trí ta không đo được — nó sẽ đúng
 * chừng nào người dùng đặt mã vào giữa, và sai lặng lẽ mọi lúc khác. Thít khung
 * lại thì nói đúng điều đã biết: "đọc được rồi", không nói sai điều chưa biết:
 * "mã nằm ở đây". Khung quanh QUẢ thì khác — hộp đó do máy chủ trả về thật.
 */
const FrameCorners: React.FC<{ color: string; thick: number; locked: boolean }> = ({
  color, thick, locked,
}) => {
  const inset = useRef(new Animated.Value(FRAME_INSET)).current;
  useEffect(() => {
    Animated.spring(inset, {
      toValue: locked ? FRAME_INSET_LOCKED : FRAME_INSET,
      damping: 18, stiffness: 160, mass: 0.7,
      useNativeDriver: false,
    }).start();
  }, [locked, inset]);

  const corner = (pos: object, extra: object) => (
    <Animated.View style={[styles.fc, pos, extra, { borderColor: color }]} />
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {corner({ left: inset, top: inset, borderTopLeftRadius: 14 }, { borderTopWidth: thick, borderLeftWidth: thick })}
      {corner({ right: inset, top: inset, borderTopRightRadius: 14 }, { borderTopWidth: thick, borderRightWidth: thick })}
      {corner({ left: inset, bottom: inset, borderBottomLeftRadius: 14 }, { borderBottomWidth: thick, borderLeftWidth: thick })}
      {corner({ right: inset, bottom: inset, borderBottomRightRadius: 14 }, { borderBottomWidth: thick, borderRightWidth: thick })}
    </View>
  );
};

const RoundBtn: React.FC<{
  icon: string; label: string; active?: boolean; onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.roundBtn, active && styles.roundBtnOn, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon name={icon} size={18} color={active ? NATURE.paper : NATURE.bark} />
  </Pressable>
);

const CandidateRow: React.FC<{
  c: LookupCandidate;
  onPress: () => void;
  tk: (k: string) => string;
}> = ({ c, onPress, tk }) => {
  const img = candidateImageUrl(c);
  // Bằng chứng nằm trong `tree`, không ở gốc thẻ — xem hợp đồng ở đầu
  // `fruitLookupService`.
  const prov = provenanceOf(c);
  const anchored = isAnchored(prov);
  // Ba trạng thái, không hai: máy chủ không nói thì hiện "chưa rõ", đừng hiện
  // "chưa lên chuỗi" — đó là một khẳng định không ai đo được.
  const anchorKey =
    anchored === true ? 'scan.result.anchored'
      : anchored === false ? 'scan.result.notAnchored'
        : 'scan.result.unknownAnchor';
  const sub = [c.tree?.name, c.status].filter(Boolean).join(' · ');
  const goKey = (c.tree?.code || safeHttpUrl(c.tree?.public_url))
    ? 'scan.result.view'
    : safeExplorerUrl(prov)
      ? 'scan.result.explorer'
      : 'scan.result.noTree';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cand, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {img ? (
        <Image source={{ uri: img }} style={styles.candImg} />
      ) : (
        <View style={[styles.candImg, styles.candImgEmpty]}>
          <Icon name="apple-whole" size={18} color={TONE.primary} />
        </View>
      )}
      <View style={styles.candText}>
        <Text style={styles.candName} numberOfLines={1}>
          {c.name?.trim() || c.pick}
        </Text>
        {sub ? <Text style={styles.candSub} numberOfLines={1}>{sub}</Text> : null}
        <View style={styles.candBadgeRow}>
          <Icon
            name={anchored === true ? 'circle-check' : 'circle-info'}
            size={11}
            color={anchored === true ? TONE.primary : NATURE.barkSoft}
          />
          {/* `provenance.label` là câu tiếng Việt máy chủ đặt sẵn cho đúng trạng
              thái này — dùng nó thì app không phải đoán, và câu đổi theo máy chủ
              chứ không kẹt ở bản dịch cũ của app. */}
          <Text style={styles.candBadge}>{prov?.label?.trim() || tk(anchorKey)}</Text>
          {/* Nói TRƯỚC hàng này sẽ đưa đi đâu. Quả có cây công khai thì mở hồ sơ
              xuất xứ; không có thì chỉ còn bằng chứng trên chuỗi — hai đích khác
              hẳn nhau, và biết trước thì không ai bấm nhầm rồi quay lại. */}
          <Text style={styles.candGo} numberOfLines={1}>
            {`· ${tk(goKey)}`}
          </Text>
        </View>
      </View>
      <Icon name="chevron-right" size={13} color={NATURE.barkSoft} />
    </Pressable>
  );
};

export default TraceScanScreen;

const CORNER = 26;

/** Bốn góc cách mép khung bao nhiêu — và thít vào bao nhiêu khi khoá được mã. */
const FRAME_INSET = 10;
const FRAME_INSET_LOCKED = 26;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: NATURE.bark },

  tabs: {
    flexDirection: 'row', gap: SPACE.sm,
    paddingHorizontal: SPACE.page, marginBottom: SPACE.md,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 40, borderRadius: RADIUS.chip,
    backgroundColor: SURFACE.raised, borderWidth: 1, borderColor: TONE.border,
  },
  tabOn: { backgroundColor: TONE.primary, borderColor: TONE.primaryDeep },
  tabTxt: { fontSize: 14.5, fontWeight: '700', color: NATURE.barkSoft },
  tabTxtOn: { color: NATURE.paper },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md },
  frame: {
    borderRadius: RADIUS.sheet,
    overflow: 'hidden',
    backgroundColor: NATURE.bark,
  },
  frameFill: { ...StyleSheet.absoluteFillObject },

  fc: { position: 'absolute', width: CORNER, height: CORNER },

  busyVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(NATURE.bark, 0.28),
  },

  status: {
    fontSize: 15, lineHeight: 21, color: NATURE.barkSoft,
    textAlign: 'center', paddingHorizontal: SPACE.xl,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.chip, backgroundColor: TONE.primarySoft,
  },
  retryTxt: { fontSize: 14, fontWeight: '700', color: TONE.primaryDeep },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    paddingTop: SPACE.md, paddingHorizontal: SPACE.page,
  },
  roundBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.raised, borderWidth: 1, borderColor: TONE.border,
  },
  roundBtnOn: { backgroundColor: TONE.sun, borderColor: TONE.sun },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: TONE.primary, backgroundColor: SURFACE.raised,
  },
  shutterOff: { opacity: 0.5 },
  shutterCore: { width: 52, height: 52, borderRadius: 26, backgroundColor: TONE.primary },
  pressed: { opacity: 0.9 },

  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md, padding: SPACE.xl },
  centerTxt: { textAlign: 'center' },

  primaryBtn: {
    minHeight: TOUCH_MIN, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACE.xl, marginTop: SPACE.md,
    ...ORGANIC_CARD, backgroundColor: TONE.primary,
  },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: NATURE.paper },
  linkBtn: { alignSelf: 'center', paddingVertical: SPACE.md },
  linkTxt: { fontSize: 15, fontWeight: '600', color: TONE.primaryDeep },

  sheetScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: SURFACE.scrim },
  sheet: {
    backgroundColor: SURFACE.raised,
    borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: SPACE.xl, paddingBottom: SPACE.xxl,
    maxHeight: '84%',
  },
  sheetBody: { marginTop: SPACE.xs },

  codeCard: {
    marginTop: SPACE.md, padding: SPACE.md,
    borderRadius: RADIUS.field, backgroundColor: SURFACE.sunken,
  },
  codeLabel: { fontSize: 11, letterSpacing: 1, color: NATURE.barkSoft },
  codeVal: { fontSize: 13, fontWeight: '600', color: NATURE.bark, marginTop: 2 },

  candList: { marginTop: SPACE.md, marginBottom: SPACE.xs },
  cand: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1, borderBottomColor: TONE.border,
  },
  candImg: { width: 56, height: 56, borderRadius: RADIUS.field, backgroundColor: SURFACE.sunken },
  candImgEmpty: { alignItems: 'center', justifyContent: 'center' },
  candText: { flex: 1, minWidth: 0 },
  candName: { fontSize: 15.5, fontWeight: '700', color: NATURE.bark },
  candSub: { fontSize: 13, color: NATURE.barkSoft, marginTop: 1 },
  candBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  candBadge: { fontSize: 12, color: NATURE.barkSoft },
  candGo: { flex: 1, fontSize: 12, color: TONE.primaryDeep },
});
