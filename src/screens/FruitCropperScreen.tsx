/**
 * FruitCropperScreen — cropper KHUNG TRÒN/ELIP (native port của ccStart/ccLayout/ccApply…)
 *
 * Khung TRÒN (hoặc ELIP) CỐ-ĐỊNH ở giữa; ảnh zoom/pan/xoay phía dưới; vùng ngoài khung CHE MỜ.
 * Nông dân di chuyển/phóng ảnh để 1 quả nằm gọn trong khung → "✓ Dùng vùng này" → map ngược
 * vùng khung về pixel ẢNH GỐC (bbox + points + shape + góc xoay) → gọi candidates / enroll / add_view.
 *
 *  KHÔNG vẽ-tay tự do (anh đã chốt bỏ vẽ-tay).
 *  KHÔNG dùng react-native-svg: khung = View borderRadius; mask = 4 panel nền tối quanh vùng khung;
 *  zoom/pan = PanResponder + Animated (built-in RN, KHÔNG cần native-link).
 *  Toán map-ngược (screen px → original px) port nguyên từ web ccRegionToOrig (giữ công thức elip xoay).
 *
 * Backend = field-reid (ORILIFE_API_BASE_URL = api.orilife.io). Cùng client fruitReIDService.
 *
 * Route params (RouteParams): treeId, treeName?, imageUri, imageW, imageH, zone? (đoán sẵn), fruitId?
 *   - fruitId có → THÊM GÓC cho quả đó (add_view); không có → luồng candidates → enroll/add_view.
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, PanResponder, LayoutChangeEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ORILIFE_BASE } from '../services/orilifeBase';

import { COLORS } from '../constants';
import {
  fruitCandidates, enrollFruit, addFruitView, detectFruit,
  type FruitShape, type FruitCandidate, type FruitRegion, type Bbox, type TreeZone,
} from '../services/fruitReIDService';
import {
  DEFAULT_FRUIT_COORD, ZONE_LABEL, clampCoord, coordToServer, coordToZone, zoneToY,
  type FruitCoord,
} from '../features/space3d/treeFrame';
import { saveFruitCoord } from '../features/space3d/positionStore';

const BASE_URL = ORILIFE_BASE;

const ROT_STEP = 0.2618; // 15° mỗi nhịp xoay (khớp web ccRotate(±0.2618))
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;
const ZONE_VI: Record<TreeZone, string> = { base: 'Gốc', mid: 'Thân giữa', canopy: 'Tán' };

interface RouteParams {
  treeId: string;
  treeName?: string;
  imageUri: string;
  imageW: number;
  imageH: number;
  zone?: TreeZone;
  fruitId?: string; // có → thêm góc cho quả này (bỏ qua bước candidates)
  fruitName?: string;
}

type Step = 'crop' | 'candidates' | 'naming';

/** Khoảng cách 2 ngón (pinch). */
function touchDist(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}
function touchMid(touches: { pageX: number; pageY: number }[]): { x: number; y: number } {
  const [a, b] = touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

const FruitCropperScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const {
    treeId, treeName, imageUri, imageW, imageH, zone: zoneParam, fruitId, fruitName,
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
  const [expanded, setExpanded] = useState(false);
  const [lastRegion, setLastRegion] = useState<FruitRegion | null>(null);
  const [nameInput, setNameInput] = useState('');

  // Toạ-độ 3D của quả trên cây (hệ riêng của cây). Thay cho việc chỉ chọn 1 trong
  // 3 vùng: người dùng kéo icon quả ở màn FruitPlace3D. zone gửi lên server được
  // SUY RA từ chiều cao y nên dữ-liệu cũ/sơ-đồ 2D vẫn đọc đúng.
  const [coord, setCoord] = useState<FruitCoord>(() =>
    zoneParam ? { ...DEFAULT_FRUIT_COORD, y: zoneToY(zoneParam) } : DEFAULT_FRUIT_COORD,
  );
  const zone: TreeZone = coordToZone(coord);

  // ── Gợi-ý PHÁT-HIỆN-NGAY: auto-detect quả trên ảnh vừa chụp (KHÔNG ép, chỉ gợi 1-chạm) ──
  // bbox ẢNH GỐC của quả tự-phát-hiện (lớn nhất / tự-tin nhất). null = chưa có / không phát hiện.
  const [detectBox, setDetectBox] = useState<Bbox | null>(null);
  const detectTried = useRef(false);

  // ── baseScale (cover) — phủ kín viewport để quả to, dễ canh ─────────────────
  const base = useMemo(() => {
    if (!vw || !vh) return 1;
    return Math.max(vw / NW, vh / NH);
  }, [vw, vh, NW, NH]);

  // ── Tâm + bán-kính vòng (px màn hình) — vòng CỐ-ĐỊNH giữa viewport ──────────
  const ring = useMemo(() => {
    const cx = vw / 2, cy = vh / 2;
    const r = Math.min(vw, vh) * 0.42;
    let rx = r, ry = r;
    if (shape === 'ellipse') { rx = Math.min(vw * 0.45, r * 1.25); ry = r * 0.78; }
    return { cx, cy, rx, ry };
  }, [vw, vh, shape]);

  // Refs cho PanResponder (đọc giá trị mới nhất trong closure mà không re-tạo responder).
  const txRef = useRef(tx); txRef.current = tx;
  const tyRef = useRef(ty); tyRef.current = ty;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const baseRef = useRef(base); baseRef.current = base;
  const ringRef = useRef(ring); ringRef.current = ring;
  // Mốc lúc bắt đầu cử-chỉ.
  const gStart = useRef<{ tx: number; ty: number; zoom: number; dist: number; cx: number; cy: number } | null>(null);

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

  // ── Nhảy khung tròn ÔM 1 bbox (px ẢNH GỐC) — đặt zoom/tx/ty để khung phủ trùng quả ──
  // Toán: screenX = tx + natX*sc. Chọn sc sao cho cạnh-lớn bbox ≈ đường-kính khung
  // (×1.35 để chừa lề, quả không sát viền), rồi dịch để tâm bbox về tâm khung.
  const jumpToBox = useCallback((b: Bbox) => {
    const r = ringRef.current;
    const diam = Math.min(r.rx, r.ry) * 2;        // đường kính khung (px màn hình)
    const longSide = Math.max(b[2], b[3], 1);     // cạnh lớn bbox (px ảnh gốc)
    const scWanted = diam / (longSide * 1.35);    // tỉ-lệ tổng cần (base*zoom)
    const b0 = baseRef.current || 1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scWanted / b0));
    const sc = b0 * z;
    const bcx = b[0] + b[2] / 2, bcy = b[1] + b[3] / 2; // tâm bbox (px gốc)
    setShape('circle'); setRot(0);
    setZoom(z);
    setTx(r.cx - bcx * sc);                        // tâm bbox → tâm khung
    setTy(r.cy - bcy * sc);
  }, []);

  // ── Auto-detect 1 LẦN khi đã đo viewport (chỉ luồng quả-mới, KHÔNG khi thêm-góc) ──
  // Chạy nền: tìm-thấy → hiện nút gợi-ý "🎯 Nhảy vào quả phát hiện". Lỗi/không-thấy → im lặng,
  // user tự canh khung như cũ (không chặn happy-path, không cảnh-báo thừa).
  useEffect(() => {
    if (fruitId || detectTried.current || !vw || !vh) return;
    detectTried.current = true;
    let alive = true;
    (async () => {
      const r = await detectFruit(BASE_URL, imageUri, treeId);
      if (!alive) return;
      const dets = r.ok && r.data?.ok ? (r.data.detections ?? []) : [];
      if (!dets.length) return;
      // Chọn quả TO nhất (diện-tích bbox lớn nhất) — thường là quả user muốn khoanh.
      const best = dets.reduce((m, d) => (d.bbox[2] * d.bbox[3] > m.bbox[2] * m.bbox[3] ? d : m), dets[0]);
      setDetectBox(best.bbox);
    })();
    return () => { alive = false; };
  }, [fruitId, vw, vh, imageUri, treeId]);

  // ── PanResponder: 1 ngón = PAN, 2 ngón = PINCH zoom (port ccBindGestures) ────
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const mid = touchMid(t);
        gStart.current = { tx: txRef.current, ty: tyRef.current, zoom: zoomRef.current, dist: touchDist(t) || 1, cx: mid.x, cy: mid.y };
      } else {
        gStart.current = { tx: txRef.current, ty: tyRef.current, zoom: zoomRef.current, dist: 0, cx: t[0].pageX, cy: t[0].pageY };
      }
    },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      const g = gStart.current;
      if (!g) return;
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
  }), []);

  // ── Đổi VÒNG ↔ ELIP (ccToggleShape) ────────────────────────────────────────
  const toggleShape = useCallback(() => {
    setShape(s => {
      const next = s === 'circle' ? 'ellipse' : 'circle';
      if (next === 'circle') setRot(0);
      return next;
    });
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
    navigation.setParams({ pickedFruitCoord: undefined });
  }, [pickedCoord, navigation]);

  const openPlacer = useCallback(() => {
    navigation.navigate('FruitPlace3D', {
      treeId,
      treeName,
      fruitName: nameInput.trim() || 'Quả mới',
      initial: coord,
      returnTo: 'FruitCropper',
    });
  }, [navigation, treeId, treeName, nameInput, coord]);

  // ── "✓ Dùng vùng này" → chốt vùng → candidates (hoặc add_view nếu có fruitId) ─
  const useRegion = useCallback(async () => {
    const reg = regionToOrig();
    if (reg.bbox[2] < 8 || reg.bbox[3] < 8) {
      setErrMsg('Vùng quá nhỏ — phóng to quả vào vòng rồi thử lại.');
      return;
    }
    setErrMsg(null);
    setLastRegion(reg);
    // Ước lượng SẴN toạ-độ từ chỗ quả nằm trong ảnh (ngang = x, cao = y) để người
    // dùng chỉ phải tinh chỉnh chứ không đặt từ đầu. Chiều sâu z vẫn phải tự đặt.
    const est = posFromBox(reg.bbox);
    setCoord((c) => clampCoord({ ...c, x: est.x * 2 - 1, y: est.h }));
    setBusy(true);

    // Có fruitId (đến từ "thêm góc cho quả này") → add_view thẳng, bỏ qua candidates.
    if (fruitId) {
      const p = posFromBox(reg.bbox);
      const r = await addFruitView(BASE_URL, fruitId, imageUri, reg, { zone, posX: p.x, posH: p.h });
      setBusy(false);
      if (r.ok) navigation.goBack();
      else setErrMsg(r.error?.detail ?? 'Không thêm được góc. Thử lại.');
      return;
    }

    const r = await fruitCandidates(BASE_URL, treeId, imageUri, reg);
    setBusy(false);
    if (r.ok && r.data) { setCands(r.data.candidates ?? []); }
    else { setCands([]); } // mạng yếu / lỗi → vẫn cho lưu quả mới
    setExpanded(false);
    setStep('candidates');
  }, [regionToOrig, fruitId, posFromBox, zone, imageUri, treeId, navigation]);

  // ── Chọn 1 quả-đã-có → THÊM GÓC (add_view) ─────────────────────────────────
  const pickCandidate = useCallback(async (cand: FruitCandidate) => {
    if (!lastRegion) return;
    setBusy(true);
    const p = posFromBox(lastRegion.bbox);
    const r = await addFruitView(BASE_URL, cand.fruit_id, imageUri, lastRegion, { zone, posX: p.x, posH: p.h });
    setBusy(false);
    if (r.ok) navigation.goBack();
    else setErrMsg(r.error?.detail ?? 'Không thêm được góc. Thử lại.');
  }, [lastRegion, posFromBox, zone, imageUri, navigation]);

  // ── Lưu quả MỚI (enroll) ───────────────────────────────────────────────────
  const saveNewFruit = useCallback(async () => {
    if (!lastRegion) return;
    const name = nameInput.trim();
    if (!name) { setErrMsg('Đặt tên cho quả trước khi lưu.'); return; }
    setErrMsg(null);
    setBusy(true);
    // zone/pos_x/pos_h SUY RA từ toạ-độ 3D → server và sơ-đồ 2D cũ vẫn hiểu đúng.
    const srv = coordToServer(coord);
    const r = await enrollFruit(BASE_URL, treeId, name, imageUri, lastRegion, {
      zone: srv.zone, posX: srv.posX, posH: srv.posH,
    });
    // Chiều sâu z không có chỗ trên server → lưu đủ 3 chiều tại máy theo fruit_id.
    if (r.ok && r.data?.fruit_id) await saveFruitCoord(r.data.fruit_id, coord);
    setBusy(false);
    if (r.ok) navigation.goBack();
    else setErrMsg(r.error?.detail ?? 'Không lưu được quả. Thử lại.');
  }, [lastRegion, nameInput, coord, treeId, imageUri, navigation]);

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

  const renderCrop = () => (
    <>
      <View style={styles.wrap} onLayout={onWrapLayout} {...panResponder.panHandlers}>
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

        {/* MASK: 4 panel nền tối quanh hộp-bao vòng (top/bottom/left/right) */}
        {vw > 0 && (
          <>
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, right: 0, top: 0, height: Math.max(0, holeT) }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, right: 0, top: holeT + holeS, bottom: 0 }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { left: 0, width: Math.max(0, holeL), top: holeT, height: holeS }]} />
            <View pointerEvents="none" style={[styles.maskPanel, { right: 0, left: holeL + holeS, top: holeT, height: holeS }]} />
          </>
        )}

        {/* VÒNG: View borderRadius (tròn = nửa cạnh; elip = scaleX/scaleY + xoay) */}
        {vw > 0 && (
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

        {/* Gợi-ý PHÁT-HIỆN-NGAY: 1-chạm nhảy khung vào quả tự-phát-hiện (không ép, ẩn nếu không thấy) */}
        {vw > 0 && detectBox && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.detectChip}
            onPress={() => { if (detectBox) jumpToBox(detectBox); }}
          >
            <Text style={styles.detectChipTxt}>🎯 Nhảy vào quả phát hiện</Text>
          </TouchableOpacity>
        )}

        <View pointerEvents="none" style={styles.hint}>
          <Text style={styles.hintTxt}>
            Kéo để di chuyển · chụm 2 ngón hoặc +/− để phóng — đưa <Text style={styles.hintB}>1 quả</Text> vào vòng
          </Text>
        </View>
      </View>

      {/* Thanh nút: zoom · đổi hình · xoay (elip) */}
      <View style={styles.btnRow}>
        <View style={styles.zoomGrp}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomAround(0.83)}><Text style={styles.zoomTxt}>−</Text></TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomAround(1.2)}><Text style={styles.zoomTxt}>＋</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.shapeBtn} onPress={toggleShape}>
          <Text style={styles.shapeTxt}>{shape === 'ellipse' ? '◯ Quả tròn' : '⬭ Quả dài (elip)'}</Text>
        </TouchableOpacity>
        {shape === 'ellipse' && (
          <View style={styles.zoomGrp}>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setRot(r => r - ROT_STEP)}><Text style={styles.zoomTxt}>↺</Text></TouchableOpacity>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setRot(r => r + ROT_STEP)}><Text style={styles.zoomTxt}>↻</Text></TouchableOpacity>
          </View>
        )}
      </View>

      {errMsg ? <Text style={styles.err}>{errMsg}</Text> : null}

      <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={useRegion}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryTxt}>{fruitId ? '✓ Thêm góc cho quả này' : '✓ Dùng vùng này'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghost} onPress={() => navigation.goBack()}>
        <Text style={styles.ghostTxt}>Xong — thoát chọn vùng</Text>
      </TouchableOpacity>
    </>
  );

  const top = cands.length ? cands[0] : null;
  const others = cands.slice(1);

  const candRow = (c: FruitCandidate, isTop: boolean) => (
    <TouchableOpacity key={c.fruit_id} style={[styles.candRow, isTop && styles.candTop]} disabled={busy} onPress={() => pickCandidate(c)}>
      <View style={styles.cThumb}>
        {c.thumbnail_url
          ? <Image source={{ uri: `${BASE_URL}${c.thumbnail_url}` }} style={styles.cThumbImg} resizeMode="cover" />
          : <Icon name="fruit-cherries" size={24} color={COLORS.textMuted} />}
      </View>
      <View style={styles.cBody}>
        <Text style={styles.cName} numberOfLines={1}>
          {isTop ? '⭐ ' : ''}{c.name || '(chưa đặt tên)'}
        </Text>
        <Text style={styles.cViews}>{c.n_views} góc{isTop ? ' · bấm nếu ĐÚNG quả này' : ''}</Text>
      </View>
      <Text style={styles.cGo}>✓ Đúng</Text>
    </TouchableOpacity>
  );

  const renderCandidates = () => (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.muted}>Vùng quả đã chốt — đây là quả nào?</Text>
      {top ? candRow(top, true) : null}
      <TouchableOpacity style={styles.candNew} disabled={busy} onPress={() => { setNameInput(''); setStep('naming'); }}>
        <Text style={styles.candNewTxt}>➕ Đây là quả MỚI</Text>
      </TouchableOpacity>

      {others.length > 0 && !expanded && (
        <TouchableOpacity style={styles.secBtn} onPress={() => setExpanded(true)}>
          <Text style={styles.secTxt}>▾ Không phải — chọn quả khác ({others.length})</Text>
        </TouchableOpacity>
      )}
      {others.length > 0 && expanded && (
        <>
          <Text style={[styles.muted, { marginTop: 8 }]}>Tất cả quả của cây (giống nhất trước):</Text>
          {others.map(c => candRow(c, false))}
          <TouchableOpacity style={styles.secBtn} onPress={() => setExpanded(false)}>
            <Text style={styles.secTxt}>▴ Thu gọn</Text>
          </TouchableOpacity>
        </>
      )}
      {!cands.length && (
        <Text style={[styles.muted, { paddingVertical: 6 }]}>Cây chưa có quả nào để đối chiếu — đặt tên lưu quả mới.</Text>
      )}

      {errMsg ? <Text style={styles.err}>{errMsg}</Text> : null}
      {busy ? <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 8 }} /> : null}

      <TouchableOpacity style={styles.secBtn} onPress={recrop}>
        <Text style={styles.secTxt}>↩︎ Khoanh lại vùng khác</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghost} onPress={() => navigation.goBack()}>
        <Text style={styles.ghostTxt}>Xong — thoát chọn vùng</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderNaming = () => (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.muted}>🆕 Lưu thành quả MỚI trên cây "{treeName || 'này'}":</Text>

      {/* Toạ-độ 3D của quả trên cây (thay cho việc chỉ chọn 1 trong 3 vùng) */}
      <Text style={styles.label}>📍 Quả nằm ở đâu trên cây?</Text>
      <TouchableOpacity style={styles.coordBox} onPress={openPlacer} activeOpacity={0.85}>
        <View style={styles.coordBoxTop}>
          <Icon name="axis-arrow" size={20} color={COLORS.accent} />
          <Text style={styles.coordBoxTitle}>Đặt vị trí trên cây (3D)</Text>
          <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
        </View>
        <View style={styles.coordVals}>
          <Text style={styles.coordVal}>X {coord.x.toFixed(2)}</Text>
          <Text style={styles.coordVal}>Y {coord.y.toFixed(2)}</Text>
          <Text style={styles.coordVal}>Z {coord.z.toFixed(2)}</Text>
          <Text style={styles.coordZone}>{ZONE_LABEL[zone]}</Text>
        </View>
        <Text style={styles.coordHint}>
          Kéo icon quả trên hình cây theo 3 hướng chiếu để đặt đúng chỗ.
        </Text>
      </TouchableOpacity>

      {/* Lối tắt chọn tầng thô — cho người chỉ cần nhanh, không muốn mở màn 3D. */}
      <View style={styles.zoneRow}>
        {(['base', 'mid', 'canopy'] as TreeZone[]).map(z => (
          <TouchableOpacity
            key={z}
            style={[styles.zoneBtn, zone === z && styles.zoneBtnOn]}
            onPress={() => setCoord(c => clampCoord({ ...c, y: zoneToY(z) }))}
          >
            <Text style={[styles.zoneTxt, zone === z && styles.zoneTxtOn]}>{ZONE_VI[z]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Tên quả (vd: ngọn phía mãng cầu)"
        placeholderTextColor={COLORS.textMuted}
        value={nameInput}
        onChangeText={setNameInput}
        autoFocus
      />

      {errMsg ? <Text style={styles.err}>{errMsg}</Text> : null}

      <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={saveNewFruit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>💾 Lưu quả MỚI</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secBtn} onPress={() => { setErrMsg(null); setStep('candidates'); }}>
        <Text style={styles.secTxt}>↩︎ Quay lại danh sách</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {fruitId ? `📷 Thêm góc · ${fruitName || 'quả'}` : `✏️ Khoanh quả · ${treeName || 'Cây'}`}
        </Text>
      </View>
      {step === 'crop' ? renderCrop() : step === 'candidates' ? renderCandidates() : renderNaming()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  // Cropper viewport
  wrap: { width: '100%', height: 340, borderRadius: 14, overflow: 'hidden', backgroundColor: '#10140f', marginHorizontal: 0, alignSelf: 'stretch' },
  img: { position: 'absolute', top: 0, left: 0 },
  maskPanel: { position: 'absolute', backgroundColor: 'rgba(16,20,15,0.55)' },
  ring: { position: 'absolute', borderWidth: 2.5, borderColor: '#ffe082', backgroundColor: 'transparent' },
  detectChip: { position: 'absolute', top: 8, alignSelf: 'center', backgroundColor: 'rgba(56,142,60,0.92)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  detectChipTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  hintTxt: { color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  hintB: { fontWeight: '800' },

  // Buttons row
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginVertical: 8 },
  zoomGrp: { flexDirection: 'row', gap: 6 },
  zoomBtn: { backgroundColor: COLORS.textSub, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, minWidth: 46, alignItems: 'center' },
  zoomTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  shapeBtn: { backgroundColor: '#455a64', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  shapeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  primary: { backgroundColor: COLORS.success, marginHorizontal: 12, marginTop: 4, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  ghost: { marginHorizontal: 12, marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.textMuted },
  ghostTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secBtn: { marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.textSub },
  secTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  err: { color: COLORS.error, fontSize: 14, paddingHorizontal: 12, paddingVertical: 6 },

  // Candidates
  scroll: { paddingHorizontal: 12, paddingBottom: 24 },
  muted: { color: COLORS.textMuted, fontSize: 14, marginVertical: 6 },
  candRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 9, marginTop: 7 },
  candTop: { borderWidth: 2, borderColor: COLORS.success, backgroundColor: '#f3fbf3' },
  cThumb: { width: 54, height: 54, borderRadius: 9, backgroundColor: '#eef2ee', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cThumbImg: { width: '100%', height: '100%' },
  cBody: { flex: 1, minWidth: 0 },
  cName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cViews: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  cGo: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  candNew: { backgroundColor: COLORS.success, marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  candNewTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Naming
  label: { fontSize: 13, color: COLORS.textSub, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  coordBox: {
    borderWidth: 1.5, borderColor: COLORS.accent, borderRadius: 12,
    backgroundColor: COLORS.accentGlow, padding: 12, gap: 8, marginBottom: 8,
  },
  coordBoxTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coordBoxTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.accent },
  coordVals: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  coordVal: {
    fontSize: 12, fontWeight: '700', color: COLORS.text,
    backgroundColor: '#ffffffaa', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
  },
  coordZone: { fontSize: 12, fontWeight: '800', color: COLORS.accent },
  coordHint: { fontSize: 11, color: COLORS.textMuted, lineHeight: 15 },
  zoneRow: { flexDirection: 'row', gap: 6 },
  zoneBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.inputBg, alignItems: 'center' },
  zoneBtnOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  zoneTxt: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  zoneTxtOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, marginTop: 12, color: COLORS.text, backgroundColor: COLORS.inputBg },
});

export default FruitCropperScreen;
