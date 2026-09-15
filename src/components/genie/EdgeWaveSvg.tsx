// components/genie/EdgeWaveSvg.tsx
//
// Hiệu ứng viền — bản DỰ PHÒNG, khi expo-gl không nạp được.
//
// ── NÓI THẲNG: BẢN NÀY THÔ HƠN, VÀ THÔ VẪN HƠN HẲN MỘT MÀN TRỐNG ───────────
// Bốn chỗ kém hơn bản Canvas, cố ý, và không định vá:
//
//   1. MẢNG RỜI thay vì quầng sáng liên tục mỗi-điểm-ảnh. Nhìn kỹ thấy mối nối.
//   2. Chỉ lấy thành phần CHẬM của sóng. Thành phần nhanh bị bỏ vì với số mốc
//      nội suy hữu hạn nó sẽ nhiễu ảnh — nhấp nháy loạn, tệ hơn là không có.
//   3. LẶP LẠI mỗi vài giây. Bản Canvas tính liên tục nên chu kỳ dài hơn nhiều.
//   4. KHÔNG có dải sáng uốn lượn hai cạnh dọc. Dải là bài toán mỗi-điểm-ảnh có
//      quầng bloom; dựng gần đúng bằng SVG cho ra một sợi dây cứng, và một dải
//      sáng dựng dở trông tệ hơn là không có dải nào.
//
// Đổi lại: không cần native module nào ngoài `react-native-svg` vốn đã có, và
// chạy được trên máy mà expo-modules-core không lên.
//
// Một `Animated.Value` DUY NHẤT kéo cả bảng mảng qua `interpolate`. Không phải
// một vòng animation cho mỗi mảng: mỗi vòng là một hàng đợi riêng ở cầu JS, và
// trên máy yếu chúng trôi lệch nhau rồi sóng vỡ thành nhấp nháy ngẫu nhiên.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { EDGE_NAMES, edgeWaveAt, type EdgeName, type WaveStyle } from './edgeWaveMath';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Mảng mỗi cạnh. Đủ thấy từng vùng sáng khác nhau, chưa tới mức tốn. */
const PER_EDGE = 5;
/** Số mốc nội suy cho một vòng. Thưa hơn thì sóng gãy; dày hơn thì tốn mà không thấy. */
const STEPS = 32;
/** Chu kỳ lặp, giây. Mối nối rơi vào chỗ sóng gần phẳng nên mắt khó bắt. */
const PERIOD_S = 8;

const EdgeWaveSvg: React.FC<{ style: WaveStyle; color: string; ribbonColor?: string }> = ({
  style,
  color,
}) => {
  const { width: W, height: H } = useWindowDimensions();
  const drive = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(drive, {
        toValue: 1,
        duration: (PERIOD_S * 1000) / Math.max(0.05, style.speed),
        // `false` là BẮT BUỘC: `react-native-svg` đặt prop qua JS, driver native
        // không chạm tới được. Đây là một phần cái giá của bản dự phòng.
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drive, style.speed]);

  // Mốc nội suy tính SẴN từ `edgeWaveMath` — cùng một nguồn công thức với shader,
  // nên hai bản không thể lệch nhau về hình dạng sóng.
  const ranges = useMemo(() => {
    const inputRange = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
    const out: Record<string, { inputRange: number[]; outputRange: number[] }> = {};
    for (const edge of EDGE_NAMES) {
      for (let i = 0; i < PER_EDGE; i += 1) {
        const u = (i + 0.5) / PER_EDGE;
        out[`${edge}${i}`] = {
          inputRange,
          outputRange: inputRange.map((p) => {
            const a = edgeWaveAt(edge, u, p * PERIOD_S, style.level);
            const k = Math.max(0, Math.min(1, 0.5 + 0.5 * a));
            // Sàn 0.12: mảng tắt hẳn trông như một lỗ thủng trên viền, không như
            // một vùng sóng đang lặng.
            return 0.12 + 0.88 * k;
          }),
        };
      }
    }
    return out;
  }, [style.level]);

  const band = style.widthPx + style.spanPx * 0.6;

  const rect = (edge: EdgeName, i: number) => {
    const along = edge === 'top' || edge === 'bottom' ? W / PER_EDGE : H / PER_EDGE;
    const grad = edge === 'top' ? 'gT' : edge === 'bottom' ? 'gB' : edge === 'left' ? 'gL' : 'gR';
    const pos =
      edge === 'top' ? { x: i * along, y: 0, width: along, height: band }
        : edge === 'bottom' ? { x: i * along, y: H - band, width: along, height: band }
          : edge === 'left' ? { x: 0, y: i * along, width: band, height: along }
            : { x: W - band, y: i * along, width: band, height: along };

    return (
      <AnimatedRect
        key={`${edge}${i}`}
        {...pos}
        fill={`url(#${grad})`}
        opacity={drive.interpolate(ranges[`${edge}${i}`]) as unknown as number}
      />
    );
  };

  // Trả MẢNG, không trả Fragment: `LinearGradient` của react-native-svg khai
  // `children` là mảng phần tử, và một Fragment bọc ngoài làm nó không đọc ra
  // được các `Stop` bên trong — chuyển màu im lặng thành đặc một màu.
  const stops = () => [
    <Stop key="a" offset="0" stopColor={color} stopOpacity={String(style.alpha)} />,
    <Stop key="b" offset="1" stopColor={color} stopOpacity="0" />,
  ];

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width={W} height={H}>
      <Defs>
        {/* Bốn hướng chuyển màu: mỗi cạnh mờ dần VÀO GIỮA màn hình, nên ánh sáng
            đọc thành "phát ra từ mép" chứ không thành một cái khung. */}
        <LinearGradient id="gT" x1="0" y1="0" x2="0" y2="1">{stops()}</LinearGradient>
        <LinearGradient id="gB" x1="0" y1="1" x2="0" y2="0">{stops()}</LinearGradient>
        <LinearGradient id="gL" x1="0" y1="0" x2="1" y2="0">{stops()}</LinearGradient>
        <LinearGradient id="gR" x1="1" y1="0" x2="0" y2="0">{stops()}</LinearGradient>
      </Defs>
      {EDGE_NAMES.map((e) => Array.from({ length: PER_EDGE }, (_, i) => rect(e, i)))}
    </Svg>
  );
};

export default EdgeWaveSvg;
