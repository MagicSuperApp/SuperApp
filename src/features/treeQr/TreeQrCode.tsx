/**
 * TreeQrCode — vẽ mã QR bằng CHẤM TRÒN, trên nền dấu của app đang dựng.
 *
 * ══ CÁCH ẢNH NỀN LỘ RA, VÀ VÌ SAO NÓ VẪN QUÉT ĐƯỢC ═══════════════════════
 * Thứ tự vẽ, dưới lên trên:
 *   1. nền trơn (trắng)
 *   2. LOGO phủ kín, hạ độ đục
 *   3. một chấm cho MỌI ô — ô tối màu đậm, ô sáng màu nền, cả hai ĐỤC
 *   4. ba tấm nền trơn ở góc + ô định vị vẽ VUÔNG
 *
 * Chấm tròn nội tiếp ô vuông thì chừa lại bốn góc nhỏ mỗi ô — logo lộ ra qua
 * đúng những khe đó, thành một lớp vân mờ chạy khắp mã. Mắt người đọc ra "có
 * hình bên dưới"; còn máy quét lấy mẫu ở TÂM ô, nơi luôn là màu đặc.
 *
 * Ba chốt giữ cho mã còn quét được, đừng gỡ cái nào:
 *   · **Ô sáng cũng phải vẽ.** Bỏ chúng thì logo lộ nguyên mảng và độ tương phản
 *     giữa ô sáng/ô tối biến mất — mã trông đẹp hơn và chết hẳn.
 *   · **Ba ô định vị vẽ vuông, trên nền trơn.** Máy quét tìm mã bằng tỉ lệ
 *     1:1:3:1:1 của ba ô đó; cho logo chạy qua hoặc bo tròn chúng là phá đúng
 *     cái mốc dùng để tìm mã.
 *   · **Mức sửa lỗi H** (xem `qrMatrix`) — bù cho phần đã mất vì chấm và vân.
 *
 * ══ VÌ SAO KHÔNG DÙNG SVG CỦA MÁY CHỦ ════════════════════════════════════
 * `GET /qr/{code}` trả một tấm SVG ĐÃ VẼ XONG: ô vuông đen, nền trắng, không có
 * chỗ chen vào. Muốn cái nhìn khác thì phải có LƯỚI chứ không phải có ẢNH — nên
 * app tự dựng lưới (`qrMatrix`). Chuỗi nhúng vào mã vẫn là URL công khai do
 * `publicTraceUrl` dựng, tức vẫn một nguồn sự thật với máy chủ.
 */

import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Rect } from 'react-native-svg';

import { DEFAULT_INSTANCE } from '../../config/instance.config';
import { buildQrMatrix, finderShields, layoutQr } from './qrMatrix';

// Nền tem lấy từ lời khai của app đang dựng. Tới 2026-09-10 đây là
// `assets/images/QR_BG.png` — mặt cười Aladin — dùng chung cho mọi app, nên
// nông dân CheckFarm in tem và dán dấu nhà khác lên nông sản của mình. Tem đã
// in ngoài đời không sửa được bằng một lần đẩy mã.
const LOGO = DEFAULT_INSTANCE.qrBackdrop;

/**
 * Độ đục của logo dưới lớp chấm.
 *
 * Cao hơn thì hình rõ hơn nhưng vân ở khe chấm đậm lên, và ở mã dày (phiên bản
 * lớn) đám vân đó bắt đầu trông như nhiễu. 0,55 là mức còn nhận ra logo mà không
 * biến nền thành hoa văn.
 */
export const LOGO_OPACITY = 1;

export interface TreeQrCodeHandle {
  /** Xuất PNG base64 (không kèm tiền tố `data:`). `null` khi chưa vẽ được. */
  toPngBase64: () => Promise<string | null>;
}

export interface TreeQrCodeProps {
  /** Chuỗi nhúng vào mã — ở đây là URL trang xuất xứ công khai. */
  value: string;
  /** Cạnh tấm, dp. */
  size?: number;
  color?: string;
  background?: string;
  /** Bật/tắt logo nền. Tắt khi cần một tấm sạch nhất có thể để in nhỏ. */
  withLogo?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TreeQrCode = forwardRef<TreeQrCodeHandle, TreeQrCodeProps>(function TreeQrCode(
  { value, size = 240, color = '#255938', background = '#FFFFFF', withLogo = true, style },
  ref,
) {
  const svgRef = useRef<Svg>(null);

  const layout = useMemo(() => layoutQr(buildQrMatrix(value), size, 0.7), [value, size]);
  const shields = useMemo(() => finderShields(layout), [layout]);

  useImperativeHandle(ref, () => ({
    toPngBase64: () =>
      new Promise((resolve) => {
        const node = svgRef.current;
        // `toDataURL` có trong khai báo kiểu của react-native-svg, nhưng vẫn phải
        // kiểm lúc chạy: ref chưa gắn (component chưa vẽ xong) thì nó là null.
        if (!node?.toDataURL || !layout) { resolve(null); return; }
        try {
          // Xuất ở ĐÚNG cạnh đang vẽ. Phóng to lúc xuất thì `react-native-svg`
          // vẽ lại theo tỉ lệ, nhưng chấm tròn phóng lên cũng chỉ mờ hơn — muốn
          // ảnh in nét thì dựng component ở cạnh lớn, đừng phóng ở đây.
          node.toDataURL((b64) => resolve(b64 || null));
        } catch {
          resolve(null);
        }
      }),
  }), [layout]);

  if (!layout) {
    // Không có mã để vẽ. Ô trống có viền, KHÔNG phải một ô trắng trơn — ô trắng
    // trơn trông y hệt một mã đang tải.
    return (
      <View
        style={[
          { width: size, height: size, backgroundColor: background, borderRadius: 12 },
          style,
        ]}
      />
    );
  }

  return (
    <View style={style}>
      <Svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill={background} />

        {withLogo && (
          <SvgImage
            x={0}
            y={0}
            width={size}
            height={size}
            href={LOGO}
            preserveAspectRatio="xMidYMid slice"
            opacity={LOGO_OPACITY}
          />
        )}

        {/* Một chấm cho MỌI ô — ô sáng cũng vẽ, xem chú thích đầu tệp. */}
        <G>
          {layout.dots.map((d, i) => (
            <Circle
              key={i}
              cx={d.cx}
              cy={d.cy}
              r={d.r}
              fill={d.dark ? color : background}
            />
          ))}
        </G>

        {/* Ba góc định vị: nền trơn trước, rồi ô vuông đặc. */}
        {shields.map((s, i) => (
          <Rect key={`s${i}`} x={s.x} y={s.y} width={s.size} height={s.size} fill={background} />
        ))}
        {layout.finders.map((f, i) => (
          <Rect key={`f${i}`} x={f.x} y={f.y} width={f.size} height={f.size} fill={color} />
        ))}
      </Svg>
    </View>
  );
});

export default TreeQrCode;
