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
 * Ô nay HIỆN THỨ NÓ MỞ. Cùng một mảnh vườn, ba cách nhìn:
 *
 *   flat   nhìn từ trên xuống — đúng thứ màn "Ranh giới" mở ra.
 *   iso    nghiêng và dựng thành, trên nền sáng.
 *   space  như `iso` nhưng xoay nhẹ, phát sáng, trong suốt, điểm nối hiện rõ —
 *          dành cho nền TỐI, đúng thứ màn "Sơ đồ 3D" mở ra.
 *
 * Không nhãn, không biểu tượng. Hình đã là nhãn.
 *
 * ⚠ `space` chỉ đúng trên nền tối. Đặt nó trên nền sáng thì vầng sáng biến mất
 * và hình tụt về một đa giác mờ — xem token `GRADIENT.space`.
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
import Svg, { Circle, Polygon, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';

import { NATURE, TONE } from '../../theme/depth';
import {
  chuanHoa, nghieng, noiDiem, phang, viTriCay, vongRanh, xoayNhe,
} from '../../utils/farmShapeGeo';

/** Góc xoay của "không gian" — nhẹ, chỉ để mảnh đất thôi thẳng hàng với mép ô. */
const GOC_XOAY = 14;

/**
 * Màu phát sáng của chế độ `space`.
 *
 * MỘT màu duy nhất cho cả viền, thành, điểm nối và cây — khác nhau chỉ ở độ
 * đục. Nền tối cộng nhiều màu sáng là chỗ mọi thứ bắt đầu trông như đèn nháy;
 * một màu ở nhiều độ đục thì vẫn đọc ra chiều sâu mà giữ được sự tĩnh.
 *
 * Xanh lam-lục sáng: nổi trên nền tối `#123A47` mà không chói, và cùng họ với
 * tông nước của cả module.
 */
const SANG = '#7FE7C4';

export const FarmShape: React.FC<{
  farm: any;
  trees?: readonly any[];
  mode: 'flat' | 'iso' | 'space';
  style?: StyleProp<ViewStyle>;
}> = ({ farm, trees, mode, style }) => {
  // ⚠ Hook phải đứng TRƯỚC mọi đường thoát sớm. Dưới đây có `return null` khi
  // vườn chưa đủ ba điểm; gọi hook sau nó là số hook đổi giữa hai lượt dựng —
  // React ném, và ném ở lượt vườn VỪA ĐỦ điểm chứ không phải lượt đang thiếu.
  const quangId = `bloom-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const ring = vongRanh(farm?.coordinates);
  // Ba điểm mới thành một mảnh đất. Ít hơn thì không có hình để vẽ, và vẽ một
  // hình bịa ra ở đây là nói với người dùng rằng vườn đã có ranh giới.
  if (ring.length < 3) return null;

  const veVi = chuanHoa(ring);
  const khoi = mode !== 'flat';
  const khongGian = mode === 'space';
  // `space` xoay nhẹ TRƯỚC khi nghiêng: xoay sau phép nghiêng thì hình thoi bị
  // vặn thành một hình không còn đọc ra mặt phẳng nằm ngang nữa.
  const xoay = mode === 'space' ? xoayNhe(GOC_XOAY) : (d: ReturnType<typeof veVi>) => d;
  const chieu = khoi ? nghieng : phang;
  const dat = (p: { lat: number; lng: number }) => chieu(xoay(veVi(p)));
  const vien = ring.map(dat);

  const cayTrong = (trees ?? [])
    .map(viTriCay)
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(dat)
    // Trần 60 chấm: một vườn 400 cây vẽ đủ thì ra một mảng đặc, vừa không đọc
    // được vừa tốn một cây SVG 400 nút cho một ô bằng bàn tay.
    .slice(0, 60);

  /** Thành đất dựng xuống — thứ làm hình thoi đọc ra KHỐI chứ không ra mảng phẳng. */
  const day = 13;
  const duongThanh =
    khoi
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
        {khongGian ? (
          <Defs>
            {/*
              Quầng BLOOM cho mỗi điểm nối. Vẽ bằng chuyển sắc TOẢ TRÒN từ sáng
              ra trong suốt — đó là cách duy nhất có được vầng sáng mềm trong
              SVG mà không cần bộ lọc làm mờ; `feGaussianBlur` tốn hơn nhiều và
              `react-native-svg` không dựng nó đều nhau giữa hai nền tảng.
            */}
            <RadialGradient id={quangId}>
              <Stop offset="0" stopColor={SANG} stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={SANG} stopOpacity={0.18} />
              <Stop offset="1" stopColor={SANG} stopOpacity={0} />
            </RadialGradient>
          </Defs>
        ) : null}

        {duongThanh ? (
          <Path
            d={duongThanh}
            fill={khongGian ? SANG : NATURE.leafDeep}
            // Thành đất TRONG SUỐT NHẸ ở chế độ không gian: nhìn xuyên được là
            // thứ làm khối đọc ra "không gian" chứ không ra "vật đặc".
            opacity={khongGian ? 0.16 : 0.5}
          />
        ) : null}

        <Polygon
          points={noiDiem(vien)}
          fill={khongGian ? SANG : khoi ? NATURE.moss : TONE.primarySoft}
          fillOpacity={khongGian ? 0.13 : khoi ? 0.9 : 1}
          stroke={khongGian ? SANG : TONE.primary}
          strokeOpacity={khongGian ? 0.9 : 1}
          strokeWidth={khongGian ? 1.1 : khoi ? 1.4 : 1.8}
          strokeLinejoin="round"
        />

        {/*
          ĐIỂM NỐI hiện rõ — chỉ ở chế độ không gian.

          Ở hai chế độ kia, đỉnh đa giác không mang nghĩa gì thêm ngoài hình
          dạng. Ở đây chúng là các mốc người dùng tự đi bộ ghi ngoài vườn, nên
          làm chúng thấy được là nói đúng cái vườn này được dựng bằng gì. Mỗi
          mốc hai lớp: quầng toả rộng, rồi một chấm đặc nhỏ ở tâm.
        */}
        {khongGian ? (
          <G>
            {vien.map((p, i) => (
              <Circle key={`q${i}`} cx={p.x} cy={p.y} r={6.5} fill={`url(#${quangId})`} />
            ))}
            {vien.map((p, i) => (
              <Circle key={`d${i}`} cx={p.x} cy={p.y} r={1.9} fill={SANG} opacity={0.95} />
            ))}
          </G>
        ) : null}

        <G>
          {cayTrong.map((c, i) => (
            <Circle
              key={i}
              cx={c.x}
              cy={khoi ? c.y - 3 : c.y}
              r={khoi ? 2.4 : 1.8}
              fill={khongGian ? SANG : NATURE.leafDeep}
              opacity={khongGian ? 0.5 : 0.85}
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
