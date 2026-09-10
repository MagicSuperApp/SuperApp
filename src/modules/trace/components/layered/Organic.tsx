/**
 * Organic — NỀN của module Truy xuất: ảnh thật nếu có, mảng xanh vẽ sẵn nếu chưa.
 *
 * ── Hai đường, một chỗ khai báo ─────────────────────────────────────────────
 * `GroundBackdrop` tự chọn:
 *   · Có ảnh trong `theme/backdrops.ts` → dùng ẢNH THẬT, phủ mờ để chữ còn đọc được.
 *   · Chưa có → **mảng XANH NHẠT** vẽ bằng SVG (lá, vũng loang). Không ô trống,
 *     không khung vỡ — cắm ảnh vào sau lúc nào cũng được, không đụng màn nào.
 *
 * ── Vì sao ảnh nào cũng bị phủ mờ ───────────────────────────────────────────
 * Ảnh nền nằm DƯỚI chữ. Ảnh chụp vườn có chỗ sáng chói (nắng trên lá) và chỗ tối
 * gần đen (bóng tán) nằm sát nhau — chữ đen đè lên vùng tối là mất hẳn, nhất là
 * khi người ta đọc ngoài trời. Nên ảnh luôn bị hạ độ đục và phủ một lớp kem: nền
 * chỉ cần GỢI ra khu vườn, không cần nhìn rõ từng chiếc lá.
 *
 * Mọi lớp ở đây đều `pointerEvents="none"` — nền không bao giờ ăn mất cú chạm.
 */

import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Ellipse, Path, G, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

import { GRADIENT, NATURE, type GradientName } from '../../theme/depth';
import { BACKDROP_PHOTOS, PHOTO_OPACITY, type BackdropVariant } from '../../theme/backdrops';

/**
 * Lớp CHUYỂN SẮC lấp đầy khối cha. Đặt nó làm con đầu tiên của một `View` có
 * `overflow: 'hidden'` và bo góc; nó tự trải kín, và không bao giờ ăn cú chạm.
 *
 * ── Góc tính theo quy ước CSS ───────────────────────────────────────────────
 * `0` = chảy lên trên · `90` = sang phải · `180` = xuống dưới · `135` = xuống
 * góc dưới-phải. Chọn quy ước này thay vì tự đặt một quy ước riêng vì mọi người
 * đã quen nó từ `linear-gradient()` trên web — một quy ước riêng ở đây chỉ tạo
 * ra một thứ nữa phải tra.
 *
 * ⚠ Không chuẩn hoá độ dài đường chuyển sắc theo tỉ lệ khung như CSS làm. Với
 * hai chặng lệch nhau chưa tới một bậc sáng thì mắt không phân biệt được, và
 * phép chuẩn hoá đó đổi lại bằng một khối tính chạy mỗi lần vẽ lại.
 */
export const GradientFill: React.FC<{ name: GradientName }> = ({ name }) => {
  const g = GRADIENT[name];
  const rad = (g.angle * Math.PI) / 180;
  // Hướng chảy trong hệ toạ độ màn hình (trục y hướng XUỐNG).
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  /**
   * ⛔ ĐÂY LÀ CHỖ ĐÃ HỎNG THẬT, đừng rút gọn lại.
   *
   * Bản trước đặt `id = 'grad-' + name`, tức MỘT id cho MỘT token. Chú thích khi
   * ấy đã viết đúng lý do ("hai lớp trùng id thì lớp sau lấy nhầm màu của lớp
   * trước") rồi vẫn làm sai — vì một màn có nhiều ô cùng `tone`, và
   * `react-native-svg` giữ sổ id CHUNG cho cả ứng dụng chứ không theo từng thẻ
   * `<Svg>`. Lớp nào gắn sau ghi đè lớp trước, nên `url(#grad-action)` của nút
   * này đi lấy toạ độ/chặng màu của một ô khác.
   *
   * Triệu chứng thực địa: nút "Cập nhật hoạt động" nửa trên xanh lá nửa dưới
   * xanh dương, và "Chỉ đường tới vườn" có một mảng xanh dương nhạt ở đỉnh —
   * đúng hình dạng của hai chuyển sắc chồng lệch nhau, không phải một chuyển
   * sắc chảy đều.
   *
   * `useId()` cho mỗi LƯỢT DỰNG một id riêng. Bỏ ký tự lạ vì `useId` trả về
   * dạng `:r3:`, mà dấu hai chấm trong `url(#…)` là cú pháp khác.
   */
  const rieng = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `grad-${name}-${rieng}`;
  return (
    /*
      `viewBox="0 0 1 1"` + `preserveAspectRatio="none"`: hệ toạ độ của SVG thành
      đúng một ô vuông đơn vị bị kéo giãn cho khớp khối cha, nên `<Rect>` bên
      dưới phủ KÍN bằng hai con số cố định, không phụ thuộc vào việc thư viện
      diễn giải chuỗi phần trăm thế nào.

      Bản trước để `<Rect width="100%" height="100%">` trong một SVG không có
      `viewBox`. Phần trăm ở đó phải quy về kích thước bố cục lúc chạy — và khi
      nó quy trượt thì lớp chuyển sắc phủ THIẾU, để lộ `backgroundColor` của
      khối cha ở phần còn lại. Nền ấy là `COLORS.accent`, mà ở lớp token mặc
      định `COLORS.accent` là XANH DƯƠNG `#3B6EA8`. Đó chính là "nửa trên xanh
      lá, nửa dưới xanh dương".
    */
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      <Defs>
        {/*
          ⛔ SỐ THẬP PHÂN, KHÔNG PHẢI CHUỖI PHẦN TRĂM. Đây là chỗ đã hỏng thật.

          `gradientUnits` mặc định là `objectBoundingBox`, tức x1/y1/x2/y2 là
          PHÂN SỐ 0..1 của hộp bao hình được tô. Bản trước truyền chuỗi
          `"14.6%"`; `react-native-svg` không quy chuỗi phần trăm về phân số ở hệ
          toạ độ này mà đọc nó thành 14,6 ĐƠN VỊ NGƯỜI DÙNG — gấp hơn mười bốn
          lần hộp bao.

          Hệ quả đúng như báo về từ thực địa: cả đoạn chuyển màu bị nén vào một
          dải mỏng ở mép, phần còn lại phẳng lì một màu. Nhìn ra thành "nút có
          hai mảng màu", không phải một chuyển sắc chảy đều.

          Lượt vá trước đổ cho `id` trùng và sửa bằng `useId` — sửa đúng một lỗi
          CÓ THẬT nhưng không phải lỗi này, nên triệu chứng còn nguyên. Giữ cả
          hai bản vá: chúng chặn hai chỗ hỏng khác nhau.
        */}
        <LinearGradient
          id={id}
          x1={0.5 - dx / 2}
          y1={0.5 - dy / 2}
          x2={0.5 + dx / 2}
          y2={0.5 + dy / 2}
        >
          <Stop offset="0" stopColor={g.from} />
          <Stop offset="1" stopColor={g.to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
    </Svg>
  );
};

/**
 * Mảng loang. Dựng từ các cung có bán kính LỆCH nhau — tròn đều thì ra hình do
 * máy vẽ, còn lệch thì mắt đọc thành hòn cuội / vũng nước.
 */
export const Blob: React.FC<{
  size: number;
  color: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ size, color, opacity = 0.1, style }) => (
  <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path
        d="M43,-62C57,-53,71,-43,77,-29C83,-15,81,3,74,18C67,33,55,45,41,55C27,65,11,73,-6,79C-23,85,-41,89,-56,81C-71,73,-83,53,-87,33C-91,13,-87,-8,-79,-26C-71,-44,-59,-59,-44,-68C-29,-77,-11,-80,4,-84C19,-88,29,-71,43,-62Z"
        transform="translate(100 100)"
        fill={color}
        opacity={opacity}
      />
    </Svg>
  </View>
);

/** Một chiếc lá có gân giữa — hoạ tiết nhỏ, không phải hình minh hoạ chính. */
export const Leaf: React.FC<{
  size: number;
  color: string;
  opacity?: number;
  rotate?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ size, color, opacity = 0.12, rotate = 0, style }) => (
  <View
    pointerEvents="none"
    style={[{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }, style]}
  >
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G opacity={opacity}>
        {/* Phiến lá — hai cung đối xứng gặp nhau ở hai đầu nhọn. */}
        <Path d="M50 6 C78 26, 86 60, 50 94 C14 60, 22 26, 50 6 Z" fill={color} />
        {/* Gân giữa — nhạt hơn phiến để lá không thành một vệt đặc. */}
        <Path d="M50 12 L50 88" stroke={NATURE.paper} strokeWidth={2.5} opacity={0.5} />
      </G>
    </Svg>
  </View>
);

/**
 * Đường CHƯA CÓ ẢNH: một vùng xanh nhạt trải phía trên màn, thêm vài hình lá.
 * Đây là thứ hiện ra cho tới khi ai đó cắm ảnh vào `theme/backdrops.ts`.
 */
const GreenWash: React.FC<{ variant: BackdropVariant }> = ({ variant }) => (
  <>
    {/* Vùng xanh nhạt ở đỉnh màn — hai lớp ellipse chồng nhau để mép tan dần,
        không có đường cắt ngang. */}
    <Svg width="100%" height={340} style={styles.wash}>
      <Ellipse cx="50%" cy="40" rx="150%" ry="230" fill={NATURE.leafSoft} />
      <Ellipse cx="50%" cy="0" rx="120%" ry="170" fill={NATURE.moss} opacity={0.12} />
    </Svg>

    {variant === 'home' ? (
      <>
        <Blob size={300} color={NATURE.moss} opacity={0.1} style={styles.homeBlobA} />
        <Blob size={230} color={NATURE.sun} opacity={0.08} style={styles.homeBlobB} />
        <Leaf size={92} color={NATURE.leaf} opacity={0.09} rotate={-24} style={styles.homeLeafA} />
        <Leaf size={64} color={NATURE.moss} opacity={0.08} rotate={38} style={styles.homeLeafB} />
      </>
    ) : variant === 'list' ? (
      <>
        <Blob size={260} color={NATURE.moss} opacity={0.09} style={styles.listBlob} />
        <Leaf size={78} color={NATURE.leaf} opacity={0.08} rotate={16} style={styles.listLeaf} />
      </>
    ) : (
      <>
        <Blob size={240} color={NATURE.leaf} opacity={0.08} style={styles.detailBlob} />
        <Leaf size={70} color={NATURE.moss} opacity={0.07} rotate={-40} style={styles.detailLeaf} />
      </>
    )}
  </>
);

/**
 * Đường CÓ ẢNH: ảnh phủ đỉnh màn, hạ độ đục, rồi hai lớp kem chồng lên cho mép
 * dưới tan hẳn vào nền trang — không để lộ đường cắt ngang giữa ảnh và nền.
 */
const PhotoWash: React.FC<{ source: NonNullable<(typeof BACKDROP_PHOTOS)[BackdropVariant]> }> = ({
  source,
}) => (
  <>
    <Image
      source={source}
      style={[styles.photo, { opacity: PHOTO_OPACITY }]}
      resizeMode="cover"
      // Ảnh nền chỉ để gợi khung cảnh — máy đọc màn hình không cần đọc nó.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
    <Svg width="100%" height={200} style={styles.photoFade}>
      <Ellipse cx="50%" cy="200" rx="150%" ry="150" fill={NATURE.soil} opacity={0.9} />
    </Svg>
  </>
);

/**
 * Nền của một màn. `variant` chỉ đổi cách sắp hình, không đổi ngôn ngữ hình.
 *
 * ── Vì sao chuyển sắc cắm Ở ĐÂY ─────────────────────────────────────────────
 * Mọi màn trong module đều đi qua lớp này — hoặc trực tiếp, hoặc qua `<Ground>`.
 * Nên một dòng ở đây cho cả module cùng một tông, mà KHÔNG màn nào phải sửa bố
 * cục. Cắm ở từng màn thì màn thêm sau lại là một dịp quên, và module sẽ có hai
 * loại nền cùng lúc mà không ai bật lên được điều đó.
 *
 * Nằm DƯỚI mọi lớp khác: chuyển sắc là mặt đất, mảng loang và lá nằm trên nó.
 */
export const GroundBackdrop: React.FC<{ variant?: BackdropVariant }> = ({ variant = 'home' }) => {
  const photo = BACKDROP_PHOTOS[variant];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GradientFill name="ground" />
      {photo ? <PhotoWash source={photo} /> : <GreenWash variant={variant} />}
    </View>
  );
};

const styles = StyleSheet.create({
  wash: { position: 'absolute', top: -140, left: 0, right: 0 },

  photo: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  photoFade: { position: 'absolute', top: 260, left: 0, right: 0 },

  homeBlobA: { position: 'absolute', top: -70, right: -110 },
  homeBlobB: { position: 'absolute', top: 300, left: -120 },
  homeLeafA: { position: 'absolute', top: 96, right: 22 },
  homeLeafB: { position: 'absolute', top: 420, right: 40 },

  listBlob: { position: 'absolute', top: -80, right: -90 },
  listLeaf: { position: 'absolute', top: 120, left: -16 },

  detailBlob: { position: 'absolute', top: -60, left: -100 },
  detailLeaf: { position: 'absolute', top: 180, right: -10 },
});
