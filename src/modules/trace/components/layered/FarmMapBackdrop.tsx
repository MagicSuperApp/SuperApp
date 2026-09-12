// modules/trace/components/layered/FarmMapBackdrop.tsx
/**
 * FarmMapBackdrop — ẢNH BẢN ĐỒ THẬT nằm dưới hình bóng mảnh vườn.
 *
 * ── Vì sao có tệp này ───────────────────────────────────────────────────────
 * Ô "ranh giới" ở màn chi tiết vườn vẽ hình bóng mảnh đất trên nền TRẮNG. Hình
 * bóng nói được vườn có dạng gì, nhưng không nói nó nằm ở đâu — mà "ở đâu" là
 * nửa còn lại của câu mà một ô bản đồ phải trả lời. Nền trắng cũng làm ô đó
 * trông y hệt mọi ô khác trên trang, trong khi nó là thứ duy nhất mở ra một bản
 * đồ.
 *
 * ── Nền và hình phải nói về CÙNG một mảnh đất ───────────────────────────────
 * Đây là chỗ dễ sai nhất, và sai theo kiểu trông rất hợp lý: dán một ảnh bản đồ
 * bất kỳ xuống dưới thì ô vẫn đẹp, nhưng mảnh vườn nằm trật khỏi thửa đất bên
 * dưới nó — người dùng đọc ra một vị trí KHÔNG PHẢI vườn của họ.
 *
 * Nên hộp toạ độ ở đây lấy từ CHÍNH `hopVe` mà `FarmShape` dùng để chuẩn hoá
 * hình (`utils/farmShapeGeo.ts`), không tính lại. Một phép tính, hai nơi đọc.
 *
 * ⚠ HỘP VUÔNG THEO ĐỘ, ảnh ô bản đồ thì theo Web-Mercator. Hai hệ này chỉ khác
 *   nhau vài phần trăm trên một mảnh vườn rộng vài chục mét — cùng cỡ sai số mà
 *   `FarmShape` đã khai từ đầu, và nhỏ hơn bề dày nét vẽ ở cỡ ô này. Đừng mang
 *   cách xếp ảnh ở đây đi làm một bản đồ thật; màn bản đồ có `MapLibre` lo việc
 *   đó cho đúng.
 *
 * ── Hỏng thì BIẾN MẤT, không để lại vết ─────────────────────────────────────
 * Ảnh ô bản đồ là một lượt gọi mạng. Ngoài vườn thì mạng chập chờn là chuyện
 * thường, nên mọi lượt tải hỏng đều rơi về nền cũ của ô (`onError` ẩn ảnh đó).
 * Không hộp xám, không biểu tượng "ảnh hỏng": ô này vẫn phải mở được bản đồ khi
 * chạm, và một ô báo lỗi ở đây chỉ làm người dùng ngại chạm.
 */

import React, { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  getMapSource, latToTileY, lngToTileX, tileUrl, tileXToLng, tileYToLat,
} from '../../../../features/space3d/mapTiles';
import { hopVe, vongRanh } from '../../utils/farmShapeGeo';

/**
 * Mức phóng chọn sao cho hộp vườn phủ khoảng NỬA một ô bản đồ trở lên.
 *
 * Không lấy mức nét nhất có thể: ô xem trước chỉ rộng cỡ bàn tay, mà mỗi mức
 * phóng thêm là số ảnh phải tải nhân bốn. Trần 4 ảnh (lưới 2×2) là chỗ đổi
 * được nhiều độ nét nhất cho mỗi lượt gọi mạng.
 */
const O_MOI_CANH = 2;
const MUC_TOI_DA = 19;
const MUC_TOI_THIEU = 3;

/** Chọn mức phóng lớn nhất mà hộp vườn còn nằm gọn trong lưới `O_MOI_CANH`. */
export function chonMucPhong(canhDo: number, latGiua: number): number {
  for (let z = MUC_TOI_DA; z > MUC_TOI_THIEU; z--) {
    const rongO = 360 / Math.pow(2, z);
    // Ô bản đồ vuông theo Mercator: bề cao theo ĐỘ VĨ hẹp hơn bề rộng theo độ
    // kinh đúng bằng cos(vĩ độ). Đo theo cạnh hẹp thì không bao giờ thiếu ô.
    const caoO = rongO * Math.cos((latGiua * Math.PI) / 180);
    if (canhDo <= Math.min(rongO, caoO) * (O_MOI_CANH - 1)) return z;
  }
  return MUC_TOI_THIEU;
}

const FarmMapBackdrop: React.FC<{
  farm: any;
  /** `satellite` (mặc định) cho ô xem trước: tán cây thật đọc ra ngay là vườn. */
  sourceId?: string;
  /** Làm nhạt ảnh để hình bóng vườn vẽ đè lên còn đọc được. */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ farm, sourceId = 'satellite', opacity = 0.85, style }) => {
  const [hong, setHong] = useState<Record<string, boolean>>({});

  const ring = vongRanh(farm?.coordinates);
  // Dưới ba điểm thì `FarmShape` cũng trả `null` — không có mảnh đất nào để
  // đặt nền dưới. Vẽ một vùng bản đồ ở đây lúc đó là bịa ra một vị trí.
  if (ring.length < 3) return null;

  const { minLng, minLat, buX, buY, canh } = hopVe(ring);
  const tayDo = minLng - buX;
  const namDo = minLat - buY;
  const latGiua = namDo + canh / 2;
  const z = chonMucPhong(canh, latGiua);

  // Bốn mép hộp trong hệ ô bản đồ (số thực, chưa làm tròn).
  const xTay = lngToTileX(tayDo, z);
  const xDong = lngToTileX(tayDo + canh, z);
  const yBac = latToTileY(namDo + canh, z);
  const yNam = latToTileY(namDo, z);

  const x0 = Math.floor(xTay);
  const x1 = Math.floor(xDong);
  const y0 = Math.floor(yBac);
  const y1 = Math.floor(yNam);

  const src = getMapSource(sourceId);
  const o: React.ReactNode[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const key = `${z}/${x}/${y}`;
      if (hong[key]) continue;
      // Vị trí của ô ẢNH trong hộp vườn, theo phần trăm cạnh hộp. Mép trái của
      // ô là kinh độ `tileXToLng(x)`, mép phải là `tileXToLng(x + 1)`.
      const traiDo = tileXToLng(x, z);
      const phaiDo = tileXToLng(x + 1, z);
      const trenDo = tileYToLat(y, z);
      const duoiDo = tileYToLat(y + 1, z);
      o.push(
        <Image
          key={key}
          source={{ uri: tileUrl(src, { z, x, y }) }}
          style={[
            styles.o,
            {
              left: `${((traiDo - tayDo) / canh) * 100}%`,
              width: `${((phaiDo - traiDo) / canh) * 100}%`,
              // Vĩ độ lớn là về phía BẮC, trục y của màn hình hướng XUỐNG.
              top: `${((namDo + canh - trenDo) / canh) * 100}%`,
              height: `${((trenDo - duoiDo) / canh) * 100}%`,
            },
          ]}
          resizeMode="cover"
          fadeDuration={0}
          onError={() => setHong((truoc) => ({ ...truoc, [key]: true }))}
        />,
      );
    }
  }

  return (
    /*
      Hai lớp bọc, và cả hai đều cần thiết:

      NGOÀI canh giữa một hình VUÔNG trong ô chữ nhật — vì `FarmShape` vẽ bằng
      `viewBox="0 0 100 100"` với `preserveAspectRatio` mặc định, tức hình của nó
      cũng nằm trong đúng hình vuông ấy. Lệch một trong hai là nền trượt khỏi hình.

      TRONG thu hộp về đúng 8..92% mỗi cạnh — dải mà `phang()` trải hộp vườn vào
      (`8 + d.x * 84`). Không thu thì nền rộng hơn hình đúng 16%.
    */
    <View pointerEvents="none" style={[styles.boc, style]}>
      <View style={styles.vuong}>
        <View style={[styles.hop, { opacity }]}>{o}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  boc: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  /** Hình vuông lớn nhất nằm gọn trong ô — cùng hình vuông mà SVG của `FarmShape` dùng. */
  vuong: { height: '100%', aspectRatio: 1, maxWidth: '100%' },
  /** 8..92% — khớp `phang()` trong `farmShapeGeo`. */
  hop: {
    position: 'absolute',
    left: '8%', top: '8%', width: '84%', height: '84%',
    overflow: 'hidden',
  },
  o: { position: 'absolute' },
});

export default FarmMapBackdrop;
