/**
 * ScanRegionBox — MỘT vùng máy chủ nghi là quả, vẽ để người dùng chạm chọn.
 *
 * Hình: mảng xanh mờ + lưới chấm bi + một dải sóng quét chạy dọc.
 *
 * ══ VÌ SAO DỰNG BẰNG MỘT THẺ SVG, KHÔNG PHẢI MỘT ĐÁM VIEW ═════════════════
 * Lưới chấm bi dựng bằng View thì mỗi chấm là một node: một hộp cỡ 120×160 dp
 * với bước 12 dp là ~130 chấm, nhân năm hộp là ~650 node chỉ để trang trí. Dùng
 * `<Pattern>` của `react-native-svg` thì cả lưới là MỘT node, máy vẽ lại lo phần
 * lặp — và số hộp không còn ảnh hưởng tới số node nữa.
 *
 * ══ SÓNG QUÉT: MỘT giá trị Animated cho cả hộp ════════════════════════════
 * Cách hay gặp là cho từng chấm nhấp nháy lệch pha nhau. Đó là hàng trăm giá trị
 * Animated chạy song song trên một màn đang mở camera — máy yếu sẽ tụt khung
 * hình ở đúng lúc người ta đang ngắm.
 *
 * Ở đây chấm ĐỨNG YÊN, chỉ một dải mờ trượt dọc qua chúng. Một `Animated.Value`
 * cho mỗi hộp, chạy trên luồng JS vì `y` của `<Rect>` không phải thuộc tính native
 * driver hỗ trợ. Đổi lại là dải sáng đi qua đâu thì chấm ở đó sáng lên — mắt đọc
 * ra "đang quét", đúng thứ cần nói.
 *
 * ══ ID PHẢI DUY NHẤT TỪNG HỘP ════════════════════════════════════════════
 * `<Pattern id>` và `<LinearGradient id>` nằm chung một không gian tên trong bản
 * dựng native. Hai hộp cùng đặt `id="dots"` thì hộp sau đè định nghĩa của hộp
 * trước — thường vô hại vì hai định nghĩa giống nhau, nhưng ngày ai đó đổi màu
 * theo trạng thái thì cả hai hộp đổi theo cái cuối cùng. Nên id có `uid`.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, {
  Circle, Defs, LinearGradient, Pattern, Rect, Stop,
} from 'react-native-svg';

import type { Rect as BoxRect } from './previewBox';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Bước lưới chấm bi, dp. Nhỏ hơn thì thành vân, lớn hơn thì thành lỗ chỗ. */
const DOT_STEP = 11;
const DOT_R = 1.7;

/** Bề dày dải sóng, tính theo chiều cao hộp — dải quá mảnh thì mắt không bắt kịp. */
const BAND_RATIO = 0.42;
const BAND_MIN = 44;

/** Một vòng quét. Chậm hơn thì trông như treo, nhanh hơn thì thành nhấp nháy. */
const SWEEP_MS = 1700;

/** Cạnh của bốn góc nhọn, dp. */
const CORNER = 14;

export interface ScanRegionBoxProps {
  /** Hộp trên khung xem (dp). `null` = ô này đang trống. */
  rect: BoxRect | null;
  /** Khoá duy nhất — đi vào `id` của Pattern/Gradient, xem chú thích đầu tệp. */
  uid: string;
  color: string;
  /** Vùng đang được ngón tay nhắm tới: đậm hơn, sóng chạy nhanh hơn. */
  active?: boolean;
}

const ScanRegionBox: React.FC<ScanRegionBoxProps> = ({ rect, uid, color, active }) => {
  const sweep = useRef(new Animated.Value(0)).current;

  const w = Math.max(1, Math.round(rect?.w ?? 0));
  const h = Math.max(1, Math.round(rect?.h ?? 0));
  const band = Math.max(BAND_MIN, h * BAND_RATIO);

  useEffect(() => {
    if (!rect) { sweep.stopAnimation(); return; }
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: active ? SWEEP_MS * 0.65 : SWEEP_MS,
        easing: Easing.inOut(Easing.ease),
        // `y` của <Rect> không chạy được trên luồng native — xem đầu tệp.
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
    // Chỉ chạy lại khi hộp ĐỔI KÍCH THƯỚC hoặc đổi trạng thái, không phải mỗi
    // lần cha vẽ lại: khởi động lại vòng lặp mỗi lượt vẽ thì dải sóng giật về
    // đầu liên tục và không bao giờ đi hết một vòng.
  }, [rect?.w, rect?.h, active, sweep, rect]);

  const bandY = useMemo(
    () => sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, h] }),
    [sweep, band, h],
  );

  if (!rect) return null;

  const dotsId = `dots-${uid}`;
  const bandId = `band-${uid}`;
  const stroke = active ? 2.5 : 1.5;

  return (
    <Svg
      pointerEvents="none"
      width={w}
      height={h}
      style={{ position: 'absolute', left: rect.x, top: rect.y }}
    >
      <Defs>
        {/* Lưới chấm bi — MỘT node cho cả lưới. */}
        <Pattern id={dotsId} width={DOT_STEP} height={DOT_STEP} patternUnits="userSpaceOnUse">
          <Circle cx={DOT_STEP / 2} cy={DOT_STEP / 2} r={DOT_R} fill={color} opacity={0.5} />
        </Pattern>

        {/* Dải sóng: mờ ở hai mép, đậm ở giữa — không có mép cắt thẳng nào. */}
        <LinearGradient id={bandId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0" />
          <Stop offset="0.5" stopColor={color} stopOpacity={active ? '0.5' : '0.34'} />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Mảng xanh mờ. */}
      <Rect
        x={0} y={0} width={w} height={h} rx={10}
        fill={color}
        opacity={active ? 0.22 : 0.14}
      />
      {/* Chấm bi phủ lên mảng. */}
      <Rect x={0} y={0} width={w} height={h} rx={10} fill={`url(#${dotsId})`} />
      {/* Sóng quét chạy dọc. */}
      <AnimatedRect x={0} y={bandY} width={w} height={band} fill={`url(#${bandId})`} />

      {/* Viền + bốn góc nhọn: viền mảnh cho biết ranh, góc đậm cho biết bấm được. */}
      <Rect
        x={stroke / 2} y={stroke / 2}
        width={Math.max(0, w - stroke)} height={Math.max(0, h - stroke)}
        rx={10}
        fill="none" stroke={color} strokeWidth={stroke} strokeOpacity={0.75}
      />
      {cornerPaths(w, h).map((d, i) => (
        <Rect
          key={i}
          x={d.x} y={d.y} width={d.w} height={d.h}
          fill={color} opacity={active ? 1 : 0.85}
          rx={1.5}
        />
      ))}
    </Svg>
  );
};

/**
 * Tám thanh nhỏ dựng thành bốn góc nhọn.
 *
 * Vẽ bằng `<Rect>` chứ không bằng `<Path>`: cùng một hình, mà `Rect` thì đọc ra
 * ngay là "thanh dài bao nhiêu, dày bao nhiêu", còn một chuỗi `M…L…` thì phải
 * dựng hình trong đầu mới sửa được.
 */
function cornerPaths(w: number, h: number): Array<{ x: number; y: number; w: number; h: number }> {
  const t = 3;                                   // độ dày thanh
  const a = Math.min(CORNER, w / 3, h / 3);      // chiều dài thanh, co lại ở hộp nhỏ
  return [
    { x: 0, y: 0, w: a, h: t }, { x: 0, y: 0, w: t, h: a },                 // trên-trái
    { x: w - a, y: 0, w: a, h: t }, { x: w - t, y: 0, w: t, h: a },         // trên-phải
    { x: 0, y: h - t, w: a, h: t }, { x: 0, y: h - a, w: t, h: a },         // dưới-trái
    { x: w - a, y: h - t, w: a, h: t }, { x: w - t, y: h - a, w: t, h: a }, // dưới-phải
  ];
}

export default ScanRegionBox;
