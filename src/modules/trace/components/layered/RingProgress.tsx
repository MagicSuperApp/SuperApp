/**
 * RingProgress — mặt nút tròn, và VIỀN CỦA CHÍNH NÓ là thanh tiến độ.
 *
 * ── Vì sao đĩa và vòng phải là MỘT hình, không phải hai ─────────────────────
 * Bản đầu vẽ vòng bằng SVG rồi đặt một `View` bo tròn màu trắng lồng vào giữa.
 * Hai hình, hai mép — và hai mép đó không bao giờ khớp tuyệt đối: chúng lệch
 * nhau nửa nét vẽ, cộng thêm việc `View` bo tròn và `Circle` của SVG khử răng
 * cưa khác nhau. Kết quả là một đường chỉ mờ chạy giữa vòng và lòng nút, nên
 * cái vòng đọc ra "thứ đeo quanh nút" chứ không đọc ra "viền của nút".
 *
 * Nay CHỈ MỘT `<Circle>` mang cả `fill` lẫn `stroke`: lòng nút và viền là hai
 * thuộc tính của cùng một hình, nên chúng đồng tâm và khít nhau theo định nghĩa,
 * không phải theo may mắn.
 *
 * Cung tiến độ vẽ ĐÈ LÊN đúng đường viền ấy — cùng tâm, cùng bán kính, cùng bề
 * dày. Nên nó không phải một vòng thứ hai; nó là phần viền đã được tô.
 *
 * ── Vì sao cung vẽ bằng SVG chứ không xoay viền ─────────────────────────────
 * Cách quen thuộc trong React Native là dựng một `View` bo tròn, cho một cạnh
 * `transparent` rồi xoay đi một góc. Cách đó ĐÚNG ở đúng bốn mốc (0·25·50·75%)
 * và SAI ở mọi giá trị giữa: viền của một hình vuông bo tròn được chia theo BỐN
 * CẠNH chứ không theo góc quét, nên phần hiện ra không tỉ lệ với phần trăm.
 * `CircleProgress` trong `TreeDetailScreen` từng dùng đúng mẹo ấy — 30% và 45%
 * cho gần như cùng một hình. Nó đã bị gỡ; màn đó nay gọi chính thành phần này
 * (`HarvestRing` trong `TreeDetailScreen.tsx`), nên không còn bản vòng tròn thứ
 * hai trong module.
 *
 * Module đã có `react-native-svg`, nên `strokeDasharray` cho cung đúng ở mọi
 * phần trăm mà không tốn thêm gì.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { SURFACE, TONE } from '../../theme/depth';

export const RingProgress: React.FC<{
  /**
   * 0..100. Ngoài dải thì bị kẹp — không có vòng nào quét quá một vòng.
   *
   * `null` nghĩa là CHƯA BIẾT, và nó KHÁC `0`. Vòng lúc đó vẽ nét đứt, không
   * vẽ cung nào — người dùng đọc ra "chưa có số", chứ không đọc ra "đã thu 0%".
   *
   * Ràng buộc này không phải chuyện thẩm mỹ. Máy chủ hiện không trả trường
   * tiến độ cho danh sách cây, nên nơi dùng buộc phải điền một giá trị; điền
   * `0` là dựng một con số mang hình dạng số đo mà không ai đo. Người cầm máy
   * ngoài ruộng chép nó vào báo cáo, và tới lúc đó thì không còn cách nào phân
   * biệt "cây chưa thu quả nào" với "app không biết cây này thế nào".
   *
   * Giá trị không phải số hữu hạn (`NaN`, `Infinity`) cũng vào đường CHƯA BIẾT
   * chứ không bị quy về 0 — cùng một lý do.
   */
  pct: number | null;
  size: number;
  /**
   * Bề dày VIỀN. Mỏng quá thì ngoài nắng không thấy phần đã quét; dày quá thì
   * viền ăn vào chỗ của chữ bên trong.
   */
  stroke?: number;
  /** Màu lòng nút. Để trống thì trong suốt — dùng khi nút nằm trên nền có sẵn. */
  fill?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ pct, size, stroke = 5, fill = SURFACE.raised, children, style }) => {
  const chuaBiet = pct === null || !Number.isFinite(pct);
  const phanTram = Math.max(0, Math.min(100, chuaBiet ? 0 : (pct as number)));
  // Bán kính trừ NỬA nét: `stroke` của SVG mọc đều hai bên đường tròn, nên
  // thiếu phép trừ này thì nửa ngoài của viền bị khung cắt cụt.
  const r = (size - stroke) / 2;
  const chuVi = 2 * Math.PI * r;

  return (
    <View style={[{ width: size, height: size }, styles.wrap, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/*
          MỘT hình mang cả lòng lẫn viền. Viền ở đây đóng hai vai: nó là mép của
          nút, và nó là RÃNH của thanh tiến độ. Vẽ đủ vòng để nút có mép cả khi
          tiến độ bằng 0.

          CHƯA BIẾT thì rãnh vẽ NÉT ĐỨT. Đó là toàn bộ chỗ để mắt phân biệt hai
          trạng thái khác hẳn nhau mà lại cùng cho một vòng trống: "đã thu 0%"
          (nét liền, rỗng) và "không có số" (nét đứt).
        */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill={fill}
          stroke={TONE.border}
          strokeWidth={stroke}
          strokeDasharray={chuaBiet ? `${chuVi / 36} ${chuVi / 36}` : undefined}
        />
        {!chuaBiet && phanTram > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={TONE.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(chuVi * phanTram) / 100} ${chuVi}`}
            // Bắt đầu từ ĐỈNH, quét theo chiều kim đồng hồ. Không xoay thì cung
            // bắt đầu ở mép phải — đúng về toán, lạ về mắt.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {/*
        Lề trong tính theo BÁN KÍNH, không gõ số: chữ phải nằm gọn trong hình
        tròn, mà chỗ hẹp nhất của một hình tròn là hai bên. `size / 5` chừa đủ
        cho một dòng chữ hai hàng mà không chạm viền ở bất kỳ cỡ nút nào.
      */}
      <View style={[styles.giua, { paddingHorizontal: size / 5 }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  giua: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

export default RingProgress;
