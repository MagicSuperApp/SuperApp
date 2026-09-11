// modules/chat/shared/components/Fluent.tsx
//
// Ba khối dựng hình của ngôn-ngữ Fluent trong module Trò chuyện. Bảng màu và
// lý-do-kỹ-thuật nằm ở `theme/fluent.ts` — file này chỉ vẽ.
//
//   <MicaBackdrop/>    nền màn: hai vệt loang màu thương-hiệu, đặt sau mọi thứ
//   <Acrylic/>         tấm bán trong: nền + sắc phủ + viền tóc, có bo góc
//   <Divider/>         đường kẻ tóc theo đúng độ đậm của bộ token
//
// Lưu ý khi dùng Acrylic: đặt nó TRÊN MicaBackdrop thì mới thấy được độ trong.
// Nếu bọc trong một View có `backgroundColor` đặc thì nó chỉ còn là thẻ trắng.

import React from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ACRYLIC, ELEVATION, MICA, RADIUS, STROKE } from '../../theme/fluent';

// ── Mica ────────────────────────────────────────────────────────────────────

interface MicaProps {
  /** Đậm hơn cho màn danh sách, nhạt hơn cho màn đọc tin. Mặc định 1. */
  intensity?: number;
}

/**
 * Nền Mica. Đặt là con ĐẦU TIÊN của màn, sau đó mọi thứ khác vẽ đè lên.
 * Không nhận sự-kiện chạm (`pointerEvents="none"`).
 */
export const MicaBackdrop: React.FC<MicaProps> = ({ intensity = 1 }) => {
  /**
   * `id` RIÊNG theo từng lượt dựng, không phải hằng `"micaA"`/`"micaB"`.
   *
   * ⛔ `react-native-svg` giữ sổ `id` CHUNG cho cả ứng dụng, không theo từng thẻ
   *    `<Svg>` — lỗi này đã được ghi và vá ở `trace/components/layered/Organic`.
   *    Ở đây nó KHÔNG phải giả định: `ChatScreen` dựng hai `MicaBackdrop` trong
   *    cùng một cây (dòng 251 và 265), nên hai lớp cùng khai `id="micaA"` và
   *    lớp gắn sau ghi đè hình học của lớp trước.
   */
  const rieng = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const idA = `mica-a-${rieng}`;
  const idB = `mica-b-${rieng}`;

  /**
   * Số đo THẬT của màn, bằng pixel bố cục.
   *
   * ⛔ Cùng một lỗi, cùng một cách vá với `GradientFill` bên module Truy xuất —
   *    đọc khối chú thích ở đó cho đủ lý do. Tóm tắt: `<Svg width="100%">` kèm
   *    `<Rect width="100%">` phải quy phần trăm lúc chạy, và khi nó quy trượt
   *    thì lớp phủ ra một mảng neo ở gốc toạ độ, nhỏ hơn khối cha. Đo rồi truyền
   *    hai con số thì không còn phép quy nào để mà trượt.
   */
  const [co, setCo] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const w = Math.ceil(width);
        const h = Math.ceil(height);
        setCo((truoc) => (truoc.w === w && truoc.h === h ? truoc : { w, h }));
      }}
    >
      {/* Nền đặc — lớp này KHÔNG phụ thuộc SVG, nên màn không bao giờ trong suốt
          dù hai vệt loang phía trên có hỏng. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: MICA.base }]} />
      {co.w > 0 && co.h > 0 ? (
        <Svg width={co.w} height={co.h}>
          <Defs>
            {/*
              ⛔ PHÂN SỐ, KHÔNG PHẢI CHUỖI PHẦN TRĂM. `gradientUnits` mặc định là
              `objectBoundingBox`, tức cx/cy/rx/ry là phân số 0..1 của hộp bao.
              `react-native-svg` KHÔNG quy chuỗi phần trăm về phân số ở hệ toạ độ
              này — nó đọc `"88%"` thành 88 ĐƠN VỊ NGƯỜI DÙNG, tức tâm vệt loang
              rơi ra ngoài màn 88 lần chiều rộng hộp bao.

              Lỗi này đã tốn hai lượt vá ở module Truy xuất trước khi ai đó nhìn
              ra. Cùng một thư viện, cùng một cái bẫy, nên chép sang cả lời giải
              thích.
            */}
            <RadialGradient id={idA} cx={0.88} cy={0.04} rx={0.82} ry={0.46}>
              <Stop offset="0" stopColor={MICA.washPrimary} stopOpacity={intensity} />
              <Stop offset="1" stopColor={MICA.washFade} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={idB} cx={0.06} cy={0} rx={0.7} ry={0.34}>
              <Stop offset="0" stopColor={MICA.washAccent} stopOpacity={intensity} />
              <Stop offset="1" stopColor={MICA.washFade} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={co.w} height={co.h} fill={`url(#${idA})`} />
          <Rect x={0} y={0} width={co.w} height={co.h} fill={`url(#${idB})`} />
        </Svg>
      ) : null}
    </View>
  );
};

// ── Acrylic ─────────────────────────────────────────────────────────────────

type AcrylicKind = 'base' | 'thin' | 'thick';
type AcrylicElevation = 'none' | 'rest' | 'raised' | 'dialog';

interface AcrylicProps {
  children?: React.ReactNode;
  /** Độ dày vật-liệu. base = thanh/ô nhập · thin = pill · thick = hộp thoại. */
  kind?: AcrylicKind;
  radius?: number;
  elevation?: AcrylicElevation;
  /** Viền tóc quanh tấm. Mặc định có. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tấm acrylic. Ba lớp chồng nhau đúng thứ-tự Fluent:
 *   1. `fill`  — nền trắng bán trong (thay cho lớp blur)
 *   2. `tint`  — sắc phủ màu thương-hiệu, rất nhạt
 *   3. viền tóc sáng ở mép
 */
export const Acrylic: React.FC<AcrylicProps> = ({
  children,
  kind = 'base',
  radius = RADIUS.lg,
  elevation = 'none',
  bordered = true,
  style,
}) => {
  const material = ACRYLIC[kind];
  return (
    <View
      style={[
        styles.clip,
        { borderRadius: radius, backgroundColor: material.fill },
        bordered && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: STROKE.base,
        },
        elevation !== 'none' && ELEVATION[elevation],
        style,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: material.tint },
        ]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
};

// ── Divider ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export const Divider: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => (
  <View
    style={[
      { height: StyleSheet.hairlineWidth, backgroundColor: STROKE.divider },
      style,
    ]}
  />
);

export default { MicaBackdrop, Acrylic, Divider };
