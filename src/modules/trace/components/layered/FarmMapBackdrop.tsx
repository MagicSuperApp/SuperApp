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
 * ── Nền PHỦ KÍN nút, hình vườn thì không ────────────────────────────────────
 * Nền trải hết bề mặt nút, tràn ra ngoài hộp vườn — vì nó là NỀN, và một cái nền
 * chừa lề thì đọc ra "một tấm ảnh dán vào giữa", không đọc ra "chỗ này nằm ở
 * đây". Hình bóng mảnh vườn vẫn nằm trong dải 8..92% như cũ.
 *
 * Để tràn mà KHÔNG lệch, nền phải đi qua đúng phép chiếu của `FarmShape` rồi
 * kéo dài ra hai đầu — xem khối "PHÉP CHIẾU" trong thân hàm. Bề mặt nút đo bằng
 * `onLayout` chứ không đoán: khung 100×100 của SVG đặt vừa vào ô theo cạnh NGẮN,
 * nên không biết ô rộng-cao bao nhiêu thì không biết hình nằm ở đâu trong đó.
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
 * Trần số ảnh ô tải cho MỘT ô xem trước.
 *
 * Mỗi mức phóng thêm là số ảnh nhân bốn. Ô này rộng cỡ bàn tay, nên đổi thêm độ
 * nét lấy thêm lượt gọi mạng rất nhanh mất giá — 9 ảnh (lưới 3×3) là chỗ dừng.
 */
const TRAN_O = 9;
const MUC_TOI_DA = 19;
const MUC_TOI_THIEU = 3;

/**
 * Mức phóng lớn nhất mà CỬA SỔ cần vẽ còn nằm trong trần số ô.
 *
 * Đo bằng số ô theo mỗi cạnh chứ không bằng "hộp vườn có lọt một ô không": cửa
 * sổ nay là cả bề mặt nút, rộng hơn hộp vườn, và nó là thứ thật sự phải phủ.
 */
export function chonMucPhong(
  tayDo: number, dongDo: number, namDo: number, bacDo: number,
): number {
  for (let z = MUC_TOI_DA; z > MUC_TOI_THIEU; z--) {
    const soNgang = Math.floor(lngToTileX(dongDo, z)) - Math.floor(lngToTileX(tayDo, z)) + 1;
    const soDoc = Math.floor(latToTileY(namDo, z)) - Math.floor(latToTileY(bacDo, z)) + 1;
    if (soNgang * soDoc <= TRAN_O) return z;
  }
  return MUC_TOI_THIEU;
}

const FarmMapBackdrop: React.FC<{
  farm: any;
  /**
   * `street` (mặc định) — BẢN ĐỒ THƯỜNG, không phải ảnh vệ tinh.
   *
   * Ô này rộng cỡ bàn tay. Ảnh vệ tinh ở cỡ đó là một mảng lục sẫm lốm đốm:
   * đúng về địa lý, nhưng không đọc ra thứ gì giúp người dùng biết vườn nằm đâu.
   * Bản đồ đường phố thì có đường, có tên, có bờ nước — những nét vẽ CỐ Ý để
   * nhận ra ở cỡ nhỏ.
   */
  sourceId?: string;
  /** Làm nhạt ảnh để hình bóng vườn vẽ đè lên còn đọc được. */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ farm, sourceId = 'street', opacity = 0.9, style }) => {
  const [hong, setHong] = useState<Record<string, boolean>>({});
  /** Bề mặt THẬT của nút, đo bằng `onLayout` — xem phép chiếu bên dưới. */
  const [co, setCo] = useState<{ w: number; h: number } | null>(null);

  const ring = vongRanh(farm?.coordinates);
  // Dưới ba điểm thì `FarmShape` cũng trả `null` — không có mảnh đất nào để
  // đặt nền dưới. Vẽ một vùng bản đồ ở đây lúc đó là bịa ra một vị trí.
  const duQuyDinh = ring.length >= 3;

  let o: React.ReactNode[] = [];
  if (duQuyDinh && co && co.w > 0 && co.h > 0) {
    const { minLng, minLat, buX, buY, canh } = hopVe(ring);
    const tayHop = minLng - buX;
    const namHop = minLat - buY;

    /*
      PHÉP CHIẾU — phải khớp TỪNG ĐIỂM với `FarmShape`, nếu không mảnh vườn nằm
      trật khỏi thửa đất bên dưới nó.

      `FarmShape` vẽ bằng `<Svg viewBox="0 0 100 100">` với `preserveAspectRatio`
      mặc định, tức khung 100×100 được đặt vừa vào ô theo cạnh NGẮN và canh giữa
      theo cạnh còn lại. Trong khung đó, `phang()` trải hộp vườn vào dải 8..92.

      Nối hai phép lại: một điểm ở toạ độ chuẩn hoá `u` ∈ 0..1 rơi vào
      `lech + (8 + u * 84) * canhVe / 100` pixel trên màn.
    */
    const canhVe = Math.min(co.w, co.h);
    const lechX = (co.w - canhVe) / 2;
    const lechY = (co.h - canhVe) / 2;
    const pxX = (u: number) => lechX + ((8 + u * 84) * canhVe) / 100;
    const pxY = (v: number) => lechY + ((8 + v * 84) * canhVe) / 100;

    // Nghịch đảo: mép nút ứng với toạ độ chuẩn hoá nào. Đây là chỗ nền TRÀN
    // RA KHỎI hộp vườn để phủ kín nút — `u` ngoài dải 0..1 là chuyện bình thường.
    const uTai = (px: number) => (((px - lechX) * 100) / canhVe - 8) / 84;
    const uTay = uTai(0);
    const uDong = uTai(co.w);
    const vBac = (((0 - lechY) * 100) / canhVe - 8) / 84;
    const vNam = (((co.h - lechY) * 100) / canhVe - 8) / 84;

    const lngTay = tayHop + uTay * canh;
    const lngDong = tayHop + uDong * canh;
    // `v` chạy theo trục màn hình (xuống dưới), vĩ độ chạy ngược lại.
    const latBac = namHop + (1 - vBac) * canh;
    const latNam = namHop + (1 - vNam) * canh;

    const z = chonMucPhong(lngTay, lngDong, latNam, latBac);
    const x0 = Math.floor(lngToTileX(lngTay, z));
    const x1 = Math.floor(lngToTileX(lngDong, z));
    const y0 = Math.floor(latToTileY(latBac, z));
    const y1 = Math.floor(latToTileY(latNam, z));

    const src = getMapSource(sourceId);
    const ds: React.ReactNode[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${z}/${x}/${y}`;
        if (hong[key]) continue;
        const trai = pxX((tileXToLng(x, z) - tayHop) / canh);
        const phai = pxX((tileXToLng(x + 1, z) - tayHop) / canh);
        const tren = pxY(1 - (tileYToLat(y, z) - namHop) / canh);
        const duoi = pxY(1 - (tileYToLat(y + 1, z) - namHop) / canh);
        ds.push(
          <Image
            key={key}
            source={{ uri: tileUrl(src, { z, x, y }) }}
            style={[
              styles.o,
              { left: trai, top: tren, width: phai - trai, height: duoi - tren },
            ]}
            resizeMode="cover"
            fadeDuration={0}
            onError={() => setHong((truoc) => ({ ...truoc, [key]: true }))}
          />,
        );
      }
    }
    o = ds;
  }

  if (!duQuyDinh) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.boc, { opacity }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCo((truoc) =>
          truoc && Math.abs(truoc.w - width) < 1 && Math.abs(truoc.h - height) < 1
            ? truoc
            : { w: width, h: height },
        );
      }}
    >
      {o}
    </View>
  );
};

const styles = StyleSheet.create({
  /** Phủ KÍN nút. `overflow: hidden` để ảnh tràn ra ngoài bị cắt theo góc bo. */
  boc: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  o: { position: 'absolute' },
});

export default FarmMapBackdrop;
