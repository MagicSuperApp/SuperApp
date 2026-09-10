/**
 * FarmShape — vẽ CHÍNH mảnh vườn đó, từ toạ độ thật.
 *
 * ── Vì sao có tệp này ───────────────────────────────────────────────────────
 * Hai ô "Sơ đồ 3D" và "Ranh giới" trước đây là biểu tượng + một dòng chữ. Một
 * biểu tượng bánh răng xoay và chữ "Sơ đồ 3D" nói được đúng một điều: *bấm vào
 * đây sẽ mở một thứ tên là sơ đồ 3D*. Nó không nói vườn này có hình gì, đã vẽ
 * ranh giới chưa, có bao nhiêu cây và chúng nằm đâu — tức là không nói gì mà
 * người mở màn thật sự muốn biết.
 *
 * Ô nay HIỆN THỨ NÓ MỞ. Cùng một mảnh vườn, hai cách nhìn:
 *
 *   flat  nhìn từ trên xuống — đúng thứ màn "Ranh giới" mở ra.
 *   iso   nghiêng và dựng thành — đúng thứ màn "Sơ đồ 3D" mở ra.
 *
 * Không nhãn, không biểu tượng. Hình đã là nhãn.
 *
 * ── Đây KHÔNG phải bản đồ ───────────────────────────────────────────────────
 * Không có nền bản đồ, không tỉ lệ, không hướng bắc. Nó là một hình BÓNG của
 * mảnh đất, đủ để nhận ra "à, vườn nhà mình hình này". Vẽ bằng SVG từ mảng toạ
 * độ đã có sẵn trong bộ nhớ nên không tốn một lượt gọi mạng nào, không cần
 * chìa khoá bản đồ, và không đợi ô nào tải.
 *
 * ⚠ Phép chiếu ở đây coi kinh-vĩ độ như toạ độ phẳng. Sai số hình dạng theo vĩ
 * độ Việt Nam (~10-23°B) là cỡ vài phần trăm bề ngang — mắt không thấy trên một
 * ô rộng chưa tới nửa màn. Đừng mang hàm này đi đo đạc; nó để NHÌN.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Polygon, Path, G } from 'react-native-svg';

import { NATURE, TONE } from '../../theme/depth';
import {
  chuanHoa, nghieng, noiDiem, phang, viTriCay, vongRanh,
} from '../../utils/farmShapeGeo';

export const FarmShape: React.FC<{
  farm: any;
  trees?: readonly any[];
  mode: 'flat' | 'iso';
  style?: StyleProp<ViewStyle>;
}> = ({ farm, trees, mode, style }) => {
  const ring = vongRanh(farm?.coordinates);
  // Ba điểm mới thành một mảnh đất. Ít hơn thì không có hình để vẽ, và vẽ một
  // hình bịa ra ở đây là nói với người dùng rằng vườn đã có ranh giới.
  if (ring.length < 3) return null;

  const veVi = chuanHoa(ring);
  const chieu = mode === 'iso' ? nghieng : phang;
  const vien = ring.map((p) => chieu(veVi(p)));

  const cayTrong = (trees ?? [])
    .map(viTriCay)
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => chieu(veVi(p)))
    // Trần 60 chấm: một vườn 400 cây vẽ đủ thì ra một mảng đặc, vừa không đọc
    // được vừa tốn một cây SVG 400 nút cho một ô bằng bàn tay.
    .slice(0, 60);

  /** Thành đất dựng xuống — thứ làm hình thoi đọc ra KHỐI chứ không ra mảng phẳng. */
  const day = 13;
  const duongThanh =
    mode === 'iso'
      ? vien
          .map((p, i) => {
            const q = vien[(i + 1) % vien.length];
            // Chỉ dựng thành ở những cạnh NHÌN THẤY được — cạnh mặt trước, tức
            // cạnh đi về phía dưới màn. Dựng cả vòng thì thành che mất mặt trên.
            if (q.x < p.x) return null;
            return `M${p.x},${p.y} L${q.x},${q.y} L${q.x},${q.y + day} L${p.x},${p.y + day} Z`;
          })
          .filter(Boolean)
          .join(' ')
      : '';

  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        {mode === 'iso' && duongThanh ? (
          <Path d={duongThanh} fill={NATURE.leafDeep} opacity={0.5} />
        ) : null}
        <Polygon
          points={noiDiem(vien)}
          fill={mode === 'iso' ? NATURE.moss : TONE.primarySoft}
          fillOpacity={mode === 'iso' ? 0.9 : 1}
          stroke={TONE.primary}
          strokeWidth={mode === 'iso' ? 1.4 : 1.8}
          strokeLinejoin="round"
        />
        <G>
          {cayTrong.map((c, i) => (
            <Circle
              key={i}
              cx={c.x}
              cy={mode === 'iso' ? c.y - 3 : c.y}
              r={mode === 'iso' ? 2.4 : 1.8}
              fill={NATURE.leafDeep}
              opacity={0.85}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'stretch', justifyContent: 'center' },
});

export default FarmShape;
