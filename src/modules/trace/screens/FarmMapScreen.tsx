/**
 * FarmMapScreen — BẢN ĐỒ CỦA MỘT VƯỜN, và nó là một MÀN, không phải một popup.
 *
 * ── Cái gì vừa đổi, và vì sao ───────────────────────────────────────────────
 * Trước bản này "xem bản đồ vườn" là một lớp phủ dựng ngay trong
 * `FarmDetailScreen`: một thanh tiêu đề, một khung bản đồ, và hết. Nó có ba chỗ
 * hụt, cả ba đều đếm được:
 *
 *   1. **Không có cây.** Bản đồ chỉ vẽ ranh giới và các đỉnh ranh được đánh số.
 *      Nhưng thứ người ta mở bản đồ vườn để xem là CÂY nằm ở đâu — mảnh đất thì
 *      họ đã đi bộ vòng quanh rồi. Một bản đồ vườn không có cây trả lời đúng câu
 *      hỏi mà không ai hỏi.
 *   2. **Không có số liệu.** Diện tích, chu vi, số điểm ranh, số cây đã định vị
 *      — tất cả đều đã nằm sẵn trong bộ nhớ, và không con nào hiện ra.
 *   3. **Là popup nên nó không có chỗ.** Lớp phủ không có vùng an toàn, không
 *      vào được lịch sử điều hướng (nút Back của Android đóng cả màn vườn chứ
 *      không đóng bản đồ), và mọi thứ thêm vào nó đều phải chen với bản đồ.
 *
 * Nên nó tách ra thành màn riêng. Màn riêng lấy được: vùng an toàn thật, nút
 * Back của hệ điều hành, chỗ cho một bảng số liệu ở đáy, và — quan trọng nhất —
 * chỗ cho popup CHI TIẾT CÂY mà không phải chồng popup lên popup.
 *
 * ── Vì sao cây là `CircleLayer` chứ không phải `MarkerView` ─────────────────
 * `FarmsMap` (bản đồ NHIỀU VƯỜN) chọn `MarkerView` vì mỗi ghim ở đó phải mang
 * TÊN vườn, mà bản đồ dựng từ raster thuần thì không có nguồn glyph để
 * `SymbolLayer` vẽ chữ. Ở đây ngược lại: chấm cây KHÔNG mang chữ, và số lượng
 * thì khác hẳn — một vườn 128 cây là chuyện thường, 500 cây cũng không lạ.
 * 500 `MarkerView` là 500 View của React Native được đặt lại vị trí mỗi khung
 * hình khi người dùng kéo bản đồ; máy của nhà vườn sẽ giật đúng lúc họ đang tìm
 * cây. `CircleLayer` vẽ trên GPU, giá gần như không đổi theo số chấm, và
 * `ShapeSource` vẫn nhận `onPress` nên chạm vào chấm vẫn mở được popup.
 *
 * MỘT `MarkerView` duy nhất còn lại: nhãn tên của cây ĐANG CHỌN. Một cái thì
 * không tốn gì, mà nó trả lời ngay "mình vừa chạm trúng cây nào".
 *
 * ── Vì sao ba nguồn chấm thay vì một nguồn tô màu theo dữ liệu ──────────────
 * MapLibre có biểu thức kiểu `['get', 'mau']` để mỗi chấm tự mang màu của nó,
 * nhưng mức hỗ trợ biểu thức của lớp bọc React Native thay đổi theo phiên bản —
 * và khi nó không hiểu thì lớp KHÔNG báo lỗi, nó chỉ vẽ ra màu mặc định. Một
 * lỗi im lặng ở phần chú giải màu là một phần chú giải nói dối.
 *
 * Ba `ShapeSource` với ba màu HẰNG thì không có gì để hiểu sai. Giá phải trả là
 * ba lớp thay vì một — không đáng kể, vì chúng chia nhau đúng tập chấm đó.
 *
 * ── Đỉnh ranh giới KHÔNG còn được đánh số ───────────────────────────────────
 * Lớp phủ cũ đánh số từng đỉnh (1, 2, 3…). Số thứ tự đỉnh là thứ cần khi ĐANG
 * VẼ ranh (biết mình vừa đặt điểm thứ mấy, xoá điểm nào) — đó là việc của
 * `AddFarmMode`. Ở màn ĐỌC này chúng chỉ là tới 200 nhãn chữ đè lên nhau quanh
 * mép mảnh đất, che đúng phần bản đồ mà chúng đánh dấu.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import Icon, { type IconName } from '../../../components/Icon';
import type { RootState } from '../../../store';
import { STREET_TILES } from '../../../features/space3d/mapTiles';
import { useOpenWayfind, type WayfindTarget } from '../../../features/wayfind/WayfindButton';
import { isValidLatLon } from '../../../features/wayfind/wayfind';
import { formatTreeName, shortTreeCode } from '../../../utils/treeNameFormatter';
import { BOUNDARY_METHOD } from '../../../services/farmService';
import RingProgress from '../components/layered/RingProgress';
import { GradientFill, GroundBackdrop } from '../components/layered/Organic';
import {
  ELEVATION, NATURE, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../theme/depth';
import { farmAreaM2, formatFarmArea, MIN_SPAN_DEG } from '../utils/farmMapGeo';
import { viTriCay } from '../utils/farmShapeGeo';
import { formatDistance, perimeterMeters, type Coord } from '../utils/polygonGuards';

/** Ảnh vệ tinh — cùng nguồn với `mapTiles.MAP_SOURCES`, xem chú thích ở đó. */
const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/**
 * Cả hai nguồn ảnh chỉ CÓ ảnh tới z19 (`mapTiles.ts`). Thiếu khai báo này thì ở
 * z20 MapLibre đi xin ô không tồn tại và người dùng thấy ô TRẮNG — đúng cái
 * "phóng to thì lỗi bản đồ" đã gặp ngoài vườn. Khai 19 thì nó kéo giãn ảnh z19:
 * nền mờ đi, không mất.
 */
const TILE_MAX_ZOOM = 19;

type LopNen = 'street' | 'satellite';

// ═══════════════════════════════════════════════════════════════════════════
// Hình học — thuần tính, không chạm React
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ Đây từng là BẢN SAO THỨ BA của cùng một phép kiểm (`farmShapeGeo.hopLe`,
 *    `farmMapGeo._valid`, và chỗ này) — và mỗi bản thiếu một ràng buộc khác
 *    nhau, nên cùng một cái cây được màn này nhận và màn kia loại. Bản ở đây ép
 *    dải nhưng bỏ lọt `0/0`, tức đúng giá trị máy sinh ra khi chưa có GPS.
 *
 * Nay chỉ còn một luật, ở `features/wayfind/wayfind.ts`. Cây bị loại KHÔNG biến
 * mất im lặng: `soCayThieuToaDo` đếm chúng và màn nói ra con số.
 */
const hopLe = (p: { lat?: unknown; lng?: unknown } | null | undefined): p is Coord =>
  !!p && isValidLatLon({ lat: p.lat as number, lon: p.lng as number });

/**
 * Phần trăm đã thu của một cây. `null` = CHƯA BIẾT, và nó KHÁC `0`.
 *
 * ⛔ Bản trước trả `0` khi trường vắng. Đó là một con số BỊA mang hình dạng số
 *    đo: `harvestProgress` trong toàn bộ `src/` có bốn chỗ ĐỌC và KHÔNG chỗ nào
 *    GHI (`grep` xác nhận), nên mọi cây trên bản đồ đều rơi vào nhóm "Chưa thu"
 *    và hàng chú giải ở đáy khẳng định điều đó bằng một con số đếm.
 *
 *    Màn chi tiết vườn đã vá đúng chỗ này (`RingProgress` nhận `null`, vòng vẽ
 *    nét đứt, chữ "chưa đếm"). Hai màn nói hai chuyện khác nhau về cùng một cây
 *    thì cái sai không còn là một ô màu — nó là chuyện app tự mâu thuẫn.
 */
const tienDoThu = (cay: any): number | null => {
  const v = Number(cay?.harvestProgress);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
};

/** Bốn nhóm chấm cây. Xem `NHOM_CAY` cho nhãn và màu. */
type NhomCay = 'chuaBiet' | 'chuaThu' | 'dangThu' | 'daThu';

const nhomCua = (cay: any): NhomCay => {
  const p = tienDoThu(cay);
  if (p === null) return 'chuaBiet';
  if (p <= 0) return 'chuaThu';
  if (p >= 100) return 'daThu';
  return 'dangThu';
};

/**
 * Chú giải — MỘT nguồn cho cả chấm trên bản đồ lẫn hàng chú giải ở đáy.
 *
 * Tách thành hằng vì chú giải và chấm phải cùng màu theo ĐỊNH NGHĨA, không phải
 * theo việc người sửa có nhớ sửa cả hai chỗ hay không. Chú giải lệch màu với
 * thứ nó chú giải là loại lỗi không ai thấy lúc soát mã và ai cũng thấy ngoài
 * nắng.
 *
 * `rong` = chấm RỖNG (chỉ có viền, không có ruột). Đó là bản dịch sang ngôn ngữ
 * bản đồ của cái vòng NÉT ĐỨT mà `RingProgress` dùng cho "chưa biết": một hình
 * chưa được tô xong đọc ra "chưa có số", trong khi mọi hình đặc đều là một lời
 * khẳng định. Dùng thêm một MÀU thứ tư thì nó lọt vào thang màu thu hoạch và
 * người dùng sẽ đọc nó thành một trạng thái thu hoạch thứ tư.
 */
/**
 * XANH LIME của chấm "chưa có số liệu".
 *
 * ⛔ ĐÂY LÀ LƯỢT SỬA MỘT LỖI ĐO ĐƯỢC, đừng đổi lại về chấm rỗng.
 *
 * Bản trước vẽ nhóm này RỖNG — ruột trong suốt, viền `NATURE.bark` (#12262E,
 * gần như đen) — với lý do "một hình chưa tô xong đọc ra chưa có số". Lý do ấy
 * đúng về nguyên tắc và sai về hậu quả, vì chú thích ngay cạnh nó đã tự khai
 * mất rồi: *hôm nay MỌI cây rơi vào nhóm này*, do không đường nào trong app ghi
 * `harvestProgress`. Nên cả bản đồ là một rừng vòng tròn đen rỗng trên ảnh vệ
 * tinh — báo về từ thực địa: *"chỉ thấy border màu đen, nhìn xấu và không rõ"*.
 *
 * Một quy ước chỉ có nghĩa khi nó PHÂN BIỆT được hai thứ. Khi 100% số chấm rơi
 * vào một nhóm thì quy ước rỗng-hay-đặc không phân biệt gì cả — nó chỉ còn làm
 * mọi cây khó nhìn.
 *
 * Nay chấm TÔ ĐẶC. Điều nó khẳng định là "có một cây ở đây", và điều đó ĐÚNG.
 * Màu chọn nằm NGOÀI thang thu hoạch (xanh lá → cam → xám lam): vàng-lục rực
 * không lẫn được với ba màu kia, nên ngày máy chủ trả `harvestProgress` thì ba
 * nhóm dưới sáng lên mà lime vẫn đọc ra "chưa có số".
 *
 * Chọn lime còn vì nền: ảnh vệ tinh vườn cây là một mảng lục sẫm, và lime là
 * sắc hiếm khi có trong tự nhiên ở độ sáng đó.
 */
const LIME = '#C6F432';

const NHOM_CAY: Record<NhomCay, { mau: string; nhan: string; rong?: boolean }> = {
  // Chưa biết: chấm LIME tô đặc. Hôm nay MỌI cây rơi vào đây, vì không đường
  // nào trong app ghi `harvestProgress`. Ngày máy chủ trả trường đó thì ba nhóm
  // dưới tự sáng lên, không phải sửa dòng nào.
  chuaBiet: { mau: LIME, nhan: 'Chưa có số liệu' },
  // Xanh lá: cây đang nuôi quả, chưa động tới. Màu chủ đạo của module.
  chuaThu: { mau: TONE.primary, nhan: 'Chưa thu' },
  // Cam nắng: đang thu dở. Màu ấm = việc đang làm, cùng quy ước với số quả ở
  // màn chi tiết vườn.
  dangThu: { mau: TONE.sun, nhan: 'Đang thu' },
  // Xám lam: đã xong. Màu nguội = không còn việc ở cây này mùa này.
  daThu: { mau: NATURE.barkSoft, nhan: 'Đã thu xong' },
};

const THU_TU_NHOM: NhomCay[] = ['chuaBiet', 'chuaThu', 'dangThu', 'daThu'];

interface DiemCay {
  cay: any;
  lat: number;
  lng: number;
  nhom: NhomCay;
}

/** Cây CÓ toạ độ, kèm nhóm màu. Cây chưa định vị bị bỏ ra — xem `soCayThieuToaDo`. */
function diemCay(trees: readonly any[]): DiemCay[] {
  const out: DiemCay[] = [];
  for (const t of trees ?? []) {
    const p = viTriCay(t);
    if (!p || !hopLe(p)) continue;
    out.push({ cay: t, lat: p.lat, lng: p.lng, nhom: nhomCua(t) });
  }
  return out;
}

/**
 * Bộ feature cho MỘT nhóm màu. Thuộc tính chỉ mang `tree_id`: chạm xong thì tra
 * ngược ra cây trong danh sách vốn đã nằm sẵn trong bộ nhớ. Nhồi cả bản ghi cây
 * vào đây là nhân bản dữ liệu vào một chỗ không ai nghĩ tới khi sửa.
 */
function boFeature(diem: readonly DiemCay[], nhom: NhomCay) {
  const features = diem
    .filter((d) => d.nhom === nhom)
    .map((d) => ({
      type: 'Feature' as const,
      id: String(d.cay?.id ?? `${d.lat},${d.lng}`),
      properties: { tree_id: String(d.cay?.id ?? '') },
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] as [number, number] },
    }));
  return { type: 'FeatureCollection' as const, features };
}

export interface HopBao { ne: [number, number]; sw: [number, number] }

/**
 * Hộp bao ôm CẢ ranh giới LẪN cây.
 *
 * Ôm mỗi ranh giới thì cây trồng ngoài ranh (chuyện thường: ranh đi vội, cây ở
 * mép) bị cắt khỏi khung nhìn và người dùng tưởng cây biến mất. Hộp luôn được
 * nới tối thiểu `MIN_SPAN_DEG` vì một vườn một điểm cho ra hộp bề rộng 0, và
 * camera nhận hộp đó sẽ phóng tới mức lớn nhất — màn hình toàn ảnh vỡ hạt.
 */
function hopBaoVuon(ring: readonly Coord[], diem: readonly DiemCay[]): HopBao | null {
  const pts: Coord[] = [
    ...ring.filter(hopLe),
    ...diem.map((d) => ({ lat: d.lat, lng: d.lng })),
  ];
  if (pts.length === 0) return null;

  let minLat = pts[0].lat, maxLat = pts[0].lat;
  let minLng = pts[0].lng, maxLng = pts[0].lng;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const noi = (lo: number, hi: number): [number, number] => {
    if (hi - lo >= MIN_SPAN_DEG) return [lo, hi];
    const giua = (hi + lo) / 2;
    return [giua - MIN_SPAN_DEG / 2, giua + MIN_SPAN_DEG / 2];
  };
  const [y0, y1] = noi(minLat, maxLat);
  const [x0, x1] = noi(minLng, maxLng);

  return { ne: [x1, y1], sw: [x0, y0] };
}

/** Nhãn tiếng Việt cho cách lấy ranh. Nhãn lạ thì trả về chính nó — đừng nuốt. */
function nhanCachLayRanh(method: string | null | undefined): string | null {
  if (!method) return null;
  if (method === BOUNDARY_METHOD.gpsWalk) return 'Đi bộ quanh vườn';
  if (method === BOUNDARY_METHOD.mapDraw) return 'Vẽ trên bản đồ';
  if (method === BOUNDARY_METHOD.mixed) return 'GPS + chỉnh tay';
  return method;
}

/** Toạ độ cho người đọc. 5 chữ số thập phân ≈ 1 m — đủ, và không giả vờ hơn thế. */
const toaDoChu = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

// ═══════════════════════════════════════════════════════════════════════════
// Mảnh giao diện
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một ô số liệu ở bảng đáy. Thiếu dữ liệu thì hiện "—", KHÔNG hiện 0.
 *
 * Cùng luật với `FarmsMap`: "0 cây" là một KHẲNG ĐỊNH, và nó sai ở ca hay gặp
 * nhất — vườn đọc từ cache lúc mất mạng không mang theo số đếm của máy chủ.
 * "—" nói đúng sự thật: chưa biết.
 */
const OSo: React.FC<{ icon: IconName; mau: string; tri: string | null; nhan: string }> = ({
  icon, mau, tri, nhan,
}) => (
  <View style={styles.oSo}>
    <Icon name={icon} size={14} color={mau} />
    <Text style={styles.oSoTri} numberOfLines={1}>{tri ?? '—'}</Text>
    <Text style={styles.oSoNhan} numberOfLines={1}>{nhan}</Text>
  </View>
);

/** Nút tròn nổi trên bản đồ. Cạnh 44 — chạm được bằng ngón tay bẩn, tay ướt. */
const NutTron: React.FC<{
  icon: IconName;
  nhan: string;
  onPress: () => void;
  bat?: boolean;
}> = ({ icon, nhan, onPress, bat }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={nhan}
    style={({ pressed }) => [styles.nutTron, bat && styles.nutTronBat, pressed && styles.nhan]}
  >
    <Icon name={icon} size={17} color={bat ? SURFACE.raised : NATURE.bark} />
  </Pressable>
);

/**
 * POPUP CHI TIẾT CÂY.
 *
 * Cố ý GIỮ NGUYÊN khuôn của popup cây ở `FarmDetailScreen` (vòng tiến độ, tên,
 * bảng bốn dòng, nút "Xem chi tiết"): chạm một cây ở lưới và chạm một cây trên
 * bản đồ phải cho ra CÙNG một thứ, nếu không thì người dùng phải học hai lần.
 *
 * Nó có THÊM hai thứ mà chỉ bản đồ mới có nghĩa: dòng toạ độ, và nút chỉ đường.
 * Đứng trên bản đồ mà không đi tới được cây là hụt đúng việc người ta mở bản đồ
 * để làm.
 */
const PopupCay: React.FC<{
  cay: any;
  farm: any;
  lat: number;
  lng: number;
  onDong: () => void;
  onMoChiTiet: () => void;
  onChiDuong: () => void;
}> = ({ cay, farm, lat, lng, onDong, onMoChiTiet, onChiDuong }) => {
  const pct = tienDoThu(cay);
  const nhom = NHOM_CAY[nhomCua(cay)];
  const ma = shortTreeCode(cay);

  const dong: Array<{ nhan: string; gt: string; uoc?: boolean }> = [
    // Cùng chữ với popup cây ở màn chi tiết vườn — hai màn phải nói cùng một
    // câu về cùng một cây, kể cả khi câu đó là "chưa biết".
    { nhan: 'Quả trên cây', gt: String(cay?.fruitCount ?? 'chưa đếm') },
    { nhan: 'Quả dự kiến', gt: String(cay?.estimatedFruits ?? 'chưa ghi'), uoc: cay?.estimatedFruits != null },
    { nhan: 'Giống', gt: cay?.species || 'chưa ghi' },
    { nhan: 'Năm trồng', gt: cay?.plantedYear ? String(cay.plantedYear) : 'chưa ghi' },
    { nhan: 'Toạ độ', gt: toaDoChu(lat, lng) },
  ];

  return (
    <View style={styles.popup}>
      <GradientFill name="tile" />

      <View style={styles.popupDau}>
        {/* `null` → vòng NÉT ĐỨT và dấu gạch, không phải "0%". Xem `tienDoThu`. */}
        <RingProgress pct={pct} size={62} stroke={5}>
          <Text style={styles.popupPct}>{pct === null ? '—' : `${pct}%`}</Text>
        </RingProgress>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.popupTen} numberOfLines={2}>{formatTreeName(cay, farm)}</Text>
          <View style={styles.popupChipHang}>
            <View style={[styles.popupChip, { backgroundColor: nhom.mau }]}>
              <Text style={styles.popupChipTxt}>{nhom.nhan}</Text>
            </View>
            {ma ? <Text style={styles.popupMa}>#{ma}</Text> : null}
          </View>
        </View>
        <Pressable onPress={onDong} hitSlop={12} accessibilityRole="button" accessibilityLabel="Đóng">
          <Icon name="xmark" size={18} color={NATURE.barkSoft} />
        </Pressable>
      </View>

      <View style={styles.popupBang}>
        {dong.map((d) => (
          <View key={d.nhan} style={styles.popupHang}>
            <Text style={styles.popupNhan}>{d.nhan}</Text>
            <Text style={styles.popupGt} numberOfLines={1}>
              {d.gt}
              {d.uoc ? <Text style={styles.popupUoc}> (ước tính)</Text> : null}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.popupNutHang}>
        <Pressable
          style={({ pressed }) => [styles.nutPhu, pressed && styles.nhan]}
          onPress={onChiDuong}
          accessibilityRole="button"
        >
          <Icon name="map-location-dot" size={16} color={TONE.primary} />
          <Text style={styles.nutPhuTxt}>Chỉ đường</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.nutChinh, pressed && styles.nhan]}
          onPress={onMoChiTiet}
          accessibilityRole="button"
        >
          <GradientFill name="action" />
          <Text style={styles.nutChinhTxt}>Xem chi tiết</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Màn hình
// ═══════════════════════════════════════════════════════════════════════════

const FarmMapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const moDuong = useOpenWayfind();

  const params = (route.params ?? {}) as { farm?: any; farmId?: string; trees?: any[] };
  const farm = params.farm ?? null;
  const farmId = String(params.farmId ?? farm?.id ?? '');

  /**
   * Cây lấy từ Redux TRƯỚC, tham số điều hướng là đường lùi.
   *
   * Redux là nơi `FarmDetailScreen` đổ cây về sau mỗi lượt đồng bộ, nên nó tươi
   * hơn bản chụp lúc mở màn này. Nhưng nó KHÔNG được là nguồn duy nhất: màn này
   * mở được từ chỗ khác, và một danh sách rỗng sẽ cho ra một bản đồ không cây —
   * đúng cái lỗi mà cả màn này sinh ra để vá.
   */
  const treesRedux = useSelector((s: RootState) => (s as any).farm?.trees ?? []);
  const trees: any[] = useMemo(() => {
    const nguon: any[] = (treesRedux?.length ? treesRedux : params.trees) ?? [];
    if (!farmId) return nguon;
    // Lọc DÈ CHỪNG: chỉ loại cây nào TỰ KHAI thuộc vườn khác. Cây không mang mã
    // vườn thì giữ lại — bản ghi cũ trong SQLite thiếu trường đó, và loại chúng
    // đi là làm bản đồ trống ở đúng những vườn lâu năm nhất.
    return nguon.filter((t) => {
      const cua = t?.farmId ?? t?.farm_id;
      return !cua || String(cua) === farmId;
    });
  }, [treesRedux, params.trees, farmId]);

  const [mapModule, setMapModule] = useState<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [lop, setLop] = useState<LopNen>('satellite');
  const [hienCay, setHienCay] = useState(true);
  const [chonId, setChonId] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const daNgamRef = useRef(false);

  const napBanDo = useCallback(async () => {
    try {
      const mod: any = await import('@maplibre/maplibre-react-native');
      // Gói phát hành cả `export default` lẫn named export — chuẩn hoá MỘT lần,
      // đúng chỗ mà `FarmsMap` và `TreeLocationMap` đã vấp trước.
      const M = mod?.MapView ? mod : mod?.default;
      if (M?.setAccessToken) {
        try { M.setAccessToken(null); } catch { /* không có token cũng chạy */ }
      }
      setMapError(null);
      setMapModule(M ?? null);
    } catch (err: any) {
      setMapError(err?.message ?? String(err));
    }
  }, []);

  useEffect(() => { napBanDo(); }, [napBanDo]);

  const ring: Coord[] = useMemo(
    () => ((farm?.coordinates ?? []) as any[]).filter(hopLe),
    [farm],
  );
  const diem = useMemo(() => diemCay(trees), [trees]);
  const bounds = useMemo(() => hopBaoVuon(ring, diem), [ring, diem]);
  const soCayThieuToaDo = trees.length - diem.length;

  const chon = useMemo(
    () => diem.find((d) => String(d.cay?.id ?? '') === chonId) ?? null,
    [diem, chonId],
  );

  /** Vòng ranh ĐÓNG KÍN cho GeoJSON. Máy chủ lưu vòng MỞ — xem `polygonFeatures`. */
  const vongDong = useMemo(() => {
    if (ring.length < 3) return null;
    const c: [number, number][] = ring.map((p) => [p.lng, p.lat]);
    const dau = c[0];
    const cuoi = c[c.length - 1];
    if (dau[0] !== cuoi[0] || dau[1] !== cuoi[1]) c.push([dau[0], dau[1]]);
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [c] },
    };
  }, [ring]);

  const dinhRanh = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: ring.map((p, i) => ({
      type: 'Feature' as const,
      id: `dinh-${i}`,
      properties: { i },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
    })),
  }), [ring]);

  const ngamHet = useCallback(() => {
    if (!bounds) return;
    try {
      cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [90, 48, 220, 48], 600);
    } catch { /* camera chưa gắn */ }
  }, [bounds]);

  /**
   * Ngắm cả vườn ĐÚNG MỘT LẦN, khi bản đồ đã dựng xong.
   *
   * Không chạy lại mỗi lượt `trees` đổi: Redux đẩy danh sách mới về sau mỗi lượt
   * đồng bộ, và bay camera về giữa lúc người dùng đang kéo bản đồ là giật thứ họ
   * đang cầm khỏi tay. Cùng lý do, cùng cách làm với `FarmsMap`.
   */
  useEffect(() => {
    if (daNgamRef.current || !bounds || !mapModule) return;
    daNgamRef.current = true;
    const t = setTimeout(ngamHet, 350);
    return () => clearTimeout(t);
  }, [bounds, mapModule, ngamHet]);

  const dichCay = useCallback((d: DiemCay): WayfindTarget => ({
    lat: d.lat,
    lon: d.lng,
    kind: 'tree',
    label: formatTreeName(d.cay, farm),
    treeId: String(d.cay?.id ?? ''),
    farmId: farmId || undefined,
  }), [farm, farmId]);

  // ── Số liệu bảng đáy ──────────────────────────────────────────────────────
  // Số của MÁY CHỦ trước, phép tính phía app chỉ là đường lùi khi vườn đọc từ
  // cache (cache không giữ `area_sqm`/`perimeter_m`). Cùng một vòng ranh mà hai
  // bên ra hai con số thì không ai biết tin cái nào.
  const dienTich = formatFarmArea(
    farm?.areaM2 ?? farm?.areaSqm ?? farm?.area_sqm ?? farmAreaM2(farm),
  );
  const chuVi = (() => {
    const m = Number(farm?.perimeterM ?? farm?.perimeter_m);
    if (Number.isFinite(m) && m > 0) return formatDistance(m);
    return ring.length >= 3 ? formatDistance(perimeterMeters(ring)) : null;
  })();
  const cachLayRanh = nhanCachLayRanh(farm?.boundaryMethod ?? farm?.boundary_method);
  const saiSo = Number(farm?.boundaryAccM ?? farm?.boundary_acc_m);

  // ── Các trạng thái KHÔNG có bản đồ ────────────────────────────────────────
  const khungTrong = (noiDung: React.ReactNode) => (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
      {/* Nền chung của module. Khi bản đồ dựng được thì NỀN CHÍNH LÀ BẢN ĐỒ —
          phủ thêm một lớp nào lên đó là che mất thứ màn này bày ra. Nhưng ba
          trạng thái không-có-bản-đồ dưới đây là trang trắng thật, và trang
          trắng của module trace thì đi qua `GroundBackdrop` như mọi màn khác. */}
      <GroundBackdrop variant="detail" />
      <View style={[styles.thanhDau, { paddingTop: insets.top + SPACE.sm }]}>
        <NutTron icon="arrow-left" nhan="Quay lại" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.dauPhu}>Bản đồ vườn</Text>
          <Text style={styles.dauTen} numberOfLines={1}>{farm?.name ?? '—'}</Text>
        </View>
      </View>
      <View style={styles.giua}>{noiDung}</View>
    </View>
  );

  if (mapError) {
    return khungTrong(
      <>
        <Icon name="triangle-exclamation" size={26} color={TONE.sun} />
        <Text style={[TYPE.cardTitle, styles.giuaTieuDe]}>Không tải được bản đồ</Text>
        <Text style={[TYPE.caption, styles.giuaThan]} numberOfLines={3}>{mapError}</Text>
        <Pressable
          style={({ pressed }) => [styles.nutThu, pressed && styles.nhan]}
          onPress={() => { setMapError(null); setMapModule(null); napBanDo(); }}
        >
          <Text style={styles.nutThuTxt}>Thử lại</Text>
        </Pressable>
      </>,
    );
  }

  if (!mapModule) {
    return khungTrong(
      <>
        <ActivityIndicator color={TONE.primary} />
        <Text style={[TYPE.caption, styles.giuaThan]}>Đang tải bản đồ…</Text>
      </>,
    );
  }

  const MapLib = mapModule;
  if (!MapLib?.MapView) {
    return khungTrong(
      <>
        <Icon name="map" size={26} color={NATURE.barkSoft} />
        <Text style={[TYPE.caption, styles.giuaThan]}>
          Bản đồ không khả dụng trên thiết bị này.
        </Text>
      </>,
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapLib.MapView
        style={StyleSheet.absoluteFillObject}
        logoEnabled={false}
        attributionEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        // Chạm ra chỗ trống = đóng popup cây. Đây là cách thoát ai cũng thử
        // trước tiên, và nó phải chạy kể cả khi nút ✕ bị ngón tay che.
        onPress={() => setChonId(null)}
      >
        <MapLib.Camera
          ref={cameraRef}
          defaultSettings={
            bounds
              ? {
                bounds: {
                  ne: bounds.ne,
                  sw: bounds.sw,
                  paddingTop: 90,
                  paddingBottom: 220,
                  paddingLeft: 48,
                  paddingRight: 48,
                },
              }
              : { centerCoordinate: [106.660172, 10.762622], zoomLevel: 14 }
          }
          minZoomLevel={3}
          maxZoomLevel={20}
        />

        {/* Nền: LUÔN mount cả hai nguồn, đổi bằng `rasterOpacity` chứ không tháo
            lắp — maplibre-rn hay giữ lại layer cũ nên bấm đổi lớp mà tháo layer
            kia thì không ăn (đã gặp ở `FarmDetailScreen`). Lớp vệ tinh khai SAU
            nên nằm TRÊN; ở mức phóng Esri thiếu ảnh, lớp đường phố bên dưới lộ
            ra làm nền dự phòng. */}
        <MapLib.RasterSource
          id="fmap-osm"
          tileUrlTemplates={[STREET_TILES]}
          tileSize={256}
          maxZoomLevel={TILE_MAX_ZOOM}
        >
          <MapLib.RasterLayer id="fmap-osm-layer" sourceID="fmap-osm" />
        </MapLib.RasterSource>

        <MapLib.RasterSource
          id="fmap-sat"
          tileUrlTemplates={[SAT_TILES]}
          tileSize={256}
          maxZoomLevel={TILE_MAX_ZOOM}
        >
          <MapLib.RasterLayer
            id="fmap-sat-layer"
            sourceID="fmap-sat"
            style={{ rasterOpacity: lop === 'satellite' ? 1 : 0 }}
          />
        </MapLib.RasterSource>

        {/* VÙNG vườn. Tô nhạt để ảnh vệ tinh bên dưới còn đọc được — người ta
            nhìn ảnh vệ tinh để thấy tán cây thật, phủ một lớp xanh đặc lên là
            lấy mất đúng thứ đó. */}
        {vongDong ? (
          <MapLib.ShapeSource id="fmap-vung" shape={vongDong as any}>
            <MapLib.FillLayer
              id="fmap-vung-fill"
              style={{ fillColor: 'rgba(22, 110, 67, 0.18)' }}
            />
            <MapLib.LineLayer
              id="fmap-vung-line"
              style={{ lineColor: TONE.primary, lineWidth: 2.5 }}
            />
          </MapLib.ShapeSource>
        ) : null}

        {/* ĐỈNH RANH — chấm trắng viền xanh, KHÔNG đánh số (xem đầu tệp). Nhỏ hơn
            chấm cây vì chúng nói về mảnh đất, còn cây mới là thứ màn này bày. */}
        {dinhRanh.features.length > 0 ? (
          <MapLib.ShapeSource id="fmap-dinh" shape={dinhRanh as any}>
            <MapLib.CircleLayer
              id="fmap-dinh-layer"
              style={{
                circleRadius: 4,
                circleColor: SURFACE.raised,
                circleStrokeWidth: 2,
                circleStrokeColor: TONE.primary,
              }}
            />
          </MapLib.ShapeSource>
        ) : null}

        {/* CHẤM CÂY — ba lớp, ba màu hằng. Xem đầu tệp về việc vì sao không dùng
            một lớp tô màu theo dữ liệu. */}
        {hienCay
          ? THU_TU_NHOM.map((nhom) => {
            const bo = boFeature(diem, nhom);
            if (bo.features.length === 0) return null;
            return (
              <MapLib.ShapeSource
                key={nhom}
                id={`fmap-cay-${nhom}`}
                shape={bo as any}
                /* KHÔNG khai `hitbox`. Mặc định của `ShapeSource` đã là 44×44 px
                   (xem `ShapeSource.tsx`), tức rộng hơn chấm bán kính 7 rất
                   nhiều — đúng thứ cần cho ngón tay. Khai một con số "cho chắc"
                   ở đây chỉ có thể làm vùng chạm HẸP đi. */
                onPress={(e: any) => {
                  const id = e?.features?.[0]?.properties?.tree_id;
                  if (typeof id === 'string' && id) setChonId(id);
                }}
              >
                <MapLib.CircleLayer
                  id={`fmap-cay-${nhom}-layer`}
                  style={{
                    circleRadius: 7,
                    // Nhóm "chưa biết" vẽ RỖNG: ruột trong suốt, chỉ còn viền.
                    // Một hình chưa tô xong đọc ra "chưa có số"; mọi hình đặc
                    // đều là một lời khẳng định.
                    circleColor: NHOM_CAY[nhom].rong ? 'rgba(0, 0, 0, 0)' : NHOM_CAY[nhom].mau,
                    // Viền: chấm màu trên ảnh vệ tinh (cũng nhiều màu) sẽ biến
                    // mất nếu không có một đường tách nó khỏi nền.
                    //
                    // Lime thì viền SẪM chứ không viền trắng: lime đã sáng gần
                    // bằng trắng (tương phản 1,3:1), nên viền trắng không tách
                    // được gì — nó chỉ làm chấm loe ra thành một vệt nhạt.
                    circleStrokeWidth: 2,
                    circleStrokeColor: NHOM_CAY[nhom].rong
                      ? NHOM_CAY[nhom].mau
                      : NHOM_CAY[nhom].mau === LIME
                        ? 'rgba(18, 38, 46, 0.85)'
                        : 'rgba(255, 255, 255, 0.92)',
                  }}
                />
              </MapLib.ShapeSource>
            );
          })
          : null}

        {/* Cây ĐANG CHỌN: một vòng sáng, vẽ SAU nên nằm trên mọi chấm khác. */}
        {hienCay && chon ? (
          <MapLib.ShapeSource
            id="fmap-cay-chon"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [chon.lng, chon.lat] },
            } as any}
          >
            <MapLib.CircleLayer
              id="fmap-cay-chon-layer"
              style={{
                circleRadius: 13,
                circleColor: 'rgba(255, 255, 255, 0)',
                circleStrokeWidth: 3,
                circleStrokeColor: TONE.sun,
              }}
            />
          </MapLib.ShapeSource>
        ) : null}

        {/* Nhãn TÊN của đúng một cây — cây đang chọn. Xem đầu tệp: đây là chỗ
            `MarkerView` còn đáng giá, vì nó chỉ có MỘT. */}
        {hienCay && chon ? (
          <MapLib.MarkerView
            coordinate={[chon.lng, chon.lat]}
            /* `anchor` chỉ nhận [0,1]×[0,1] (khai rõ ở `MarkerView.tsx`), nên
               không đẩy nhãn lên được bằng một con số > 1. Cách đúng: neo ĐÁY
               của khối vào toạ độ, rồi chừa chỗ cho chấm bằng một khoảng đệm
               dưới ngay trong khối. */
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <View style={styles.nhanCayBoc} pointerEvents="none">
              <View style={styles.nhanCay}>
                <Text style={styles.nhanCayTxt} numberOfLines={1}>
                  {formatTreeName(chon.cay, farm)}
                </Text>
              </View>
            </View>
          </MapLib.MarkerView>
        ) : null}
      </MapLib.MapView>

      {/* ── Thanh đầu: quay lại + tên vườn ──────────────────────────────── */}
      <View
        style={[styles.thanhDau, styles.thanhDauNoi, { paddingTop: insets.top + SPACE.sm }]}
        pointerEvents="box-none"
      >
        <NutTron icon="arrow-left" nhan="Quay lại" onPress={() => navigation.goBack()} />
        <View style={styles.tenBoc}>
          <Text style={styles.dauPhu}>Bản đồ vườn</Text>
          <Text style={styles.dauTen} numberOfLines={1}>{farm?.name ?? '—'}</Text>
        </View>
      </View>

      {/* ── Cột nút bên phải ────────────────────────────────────────────────
          Dọc bên phải chứ không ngang trên đầu: hàng ngang phải chen với tên
          vườn, mà tên vườn dài thì nó là thứ bị cắt. Cột phải nằm ở chỗ ngón
          cái với tới được khi cầm máy một tay. */}
      <View style={[styles.cotNut, { top: insets.top + 74 }]} pointerEvents="box-none">
        <NutTron
          icon={lop === 'street' ? 'satellite' : 'map'}
          nhan={lop === 'street' ? 'Xem ảnh vệ tinh' : 'Xem bản đồ đường'}
          onPress={() => setLop((l) => (l === 'street' ? 'satellite' : 'street'))}
        />
        <NutTron
          icon={hienCay ? 'eye' : 'eye-slash'}
          nhan={hienCay ? 'Ẩn chấm cây' : 'Hiện chấm cây'}
          bat={hienCay}
          onPress={() => {
            setHienCay((v) => {
              // Ẩn cây thì đóng luôn popup: một popup đang mở về một chấm vừa
              // biến mất là một popup không còn chỗ nào để quay về.
              if (v) setChonId(null);
              return !v;
            });
          }}
        />
        {bounds ? (
          <NutTron icon="location-crosshairs" nhan="Ngắm cả vườn" onPress={ngamHet} />
        ) : null}
      </View>

      {/* ── Mép dưới: popup cây HOẶC bảng số liệu, rồi dòng ghi nguồn ───────
          MỘT cột xếp chồng, không phải mấy lớp cùng neo vào đáy. Neo riêng thì
          popup đè lên dòng ghi nguồn OpenStreetMap — mà dòng đó là nghĩa vụ
          giấy phép, không phải trang trí bỏ được. */}
      <View
        style={[styles.chongDay, { paddingBottom: insets.bottom + SPACE.sm }]}
        pointerEvents="box-none"
      >
        {chon ? (
          <PopupCay
            cay={chon.cay}
            farm={farm}
            lat={chon.lat}
            lng={chon.lng}
            onDong={() => setChonId(null)}
            onMoChiTiet={() => {
              const cay = chon.cay;
              setChonId(null);
              navigation.navigate('TreeDetail', { tree: cay });
            }}
            onChiDuong={() => moDuong(dichCay(chon))}
          />
        ) : (
          <View style={styles.bang}>
            <GradientFill name="tile" />

            <View style={styles.bangSo}>
              <OSo icon="draw-polygon" mau={TONE.primary} tri={dienTich} nhan="diện tích" />
              <View style={styles.vach} />
              <OSo icon="circle-nodes" mau={TONE.rain} tri={chuVi} nhan="chu vi" />
              <View style={styles.vach} />
              <OSo
                icon="map-location-dot"
                mau={NATURE.barkSoft}
                tri={ring.length > 0 ? String(ring.length) : null}
                nhan="điểm ranh"
              />
              <View style={styles.vach} />
              <OSo
                icon="seedling"
                mau={TONE.sun}
                tri={trees.length > 0 ? `${diem.length}/${trees.length}` : null}
                nhan="cây trên bản đồ"
              />
            </View>

            {/* Chú giải màu — chỉ hiện khi có cây để chú giải. Một bảng chú giải
                cho một bản đồ trống là chữ thừa che mất bản đồ. */}
            {diem.length > 0 ? (
              <View style={styles.chuGiai}>
                {THU_TU_NHOM.map((nhom) => {
                  const n = diem.filter((d) => d.nhom === nhom).length;
                  if (n === 0) return null;
                  return (
                    <View key={nhom} style={styles.chuGiaiMuc}>
                      <View
                        style={[
                          styles.chuGiaiCham,
                          NHOM_CAY[nhom].rong
                            ? { backgroundColor: 'transparent', borderColor: NHOM_CAY[nhom].mau }
                            : { backgroundColor: NHOM_CAY[nhom].mau },
                        ]}
                      />
                      <Text style={styles.chuGiaiTxt}>{NHOM_CAY[nhom].nhan} · {n}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Dòng NGUỒN GỐC của ranh giới. Một mảnh đất vẽ tay trên bản đồ và
                một mảnh đất đi bộ đo bằng GPS trông y hệt nhau trên màn hình,
                nhưng chúng KHÔNG đáng tin như nhau — nên màn phải nói ra. */}
            {cachLayRanh ? (
              <Text style={styles.dongRanh} numberOfLines={1}>
                Ranh giới: {cachLayRanh}
                {Number.isFinite(saiSo) && saiSo > 0 ? ` · sai số ±${Math.round(saiSo)} m` : ''}
              </Text>
            ) : null}

            {/* Lời mời có VIỆC để làm, không phải một lời than. Cây chưa định vị
                thì bản đồ này thiếu đúng bấy nhiêu chấm, và người dùng cần biết
                con số đó trước khi kết luận "vườn mình chỉ có ngần này cây". */}
            {soCayThieuToaDo > 0 ? (
              <Text style={styles.dongThieu} numberOfLines={2}>
                {soCayThieuToaDo} cây chưa có toạ độ nên chưa lên được bản đồ.
              </Text>
            ) : null}

            {ring.length === 0 ? (
              <Text style={styles.dongThieu} numberOfLines={2}>
                Vườn chưa vẽ ranh giới — bản đồ chỉ hiện các cây đã định vị.
              </Text>
            ) : null}
          </View>
        )}

        {/* Giấy phép ODbL của OpenStreetMap đòi ghi nguồn ở nơi nhìn thấy được.
            `attributionEnabled={false}` ở trên chỉ tắt nút mặc định của thư viện
            (nó chiếm chỗ và mở một hộp thoại lạc lõng), KHÔNG miễn nghĩa vụ ghi
            nguồn — nên dòng này không được bỏ. */}
        <Text style={styles.ghiNguon}>
          {lop === 'satellite' ? '© Esri · Maxar' : '© Esri · OpenStreetMap'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  nhan: { opacity: 0.7 },

  // ── Trạng thái không có bản đồ ─────────────────────────────────────────────
  giua: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl, gap: SPACE.sm },
  giuaTieuDe: { marginTop: SPACE.xs },
  giuaThan: { textAlign: 'center' },
  nutThu: {
    marginTop: SPACE.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.chip,
    backgroundColor: TONE.primary,
  },
  nutThuTxt: { color: SURFACE.raised, fontSize: 15, fontWeight: '600' },

  // ── Thanh đầu ─────────────────────────────────────────────────────────────
  thanhDau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.page,
    paddingBottom: SPACE.sm,
  },
  thanhDauNoi: { position: 'absolute', left: 0, right: 0, top: 0 },
  tenBoc: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.card,
    // Nền kính mờ dưới chữ: tên vườn nằm TRÊN ảnh vệ tinh, mà ảnh vệ tinh có chỗ
    // sáng chỗ tối — chữ tối không viền sẽ mất hẳn trên một mái tôn trắng.
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    ...ELEVATION.cardStrong,
  },
  dauPhu: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: NATURE.barkSoft, textTransform: 'uppercase' },
  dauTen: { fontSize: 17, fontWeight: '700', color: NATURE.bark },

  // ── Nút tròn ──────────────────────────────────────────────────────────────
  nutTron: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TONE.border,
    ...ELEVATION.cardStrong,
  },
  nutTronBat: { backgroundColor: TONE.primary, borderColor: TONE.primary },
  cotNut: { position: 'absolute', right: SPACE.page, gap: SPACE.sm },

  // ── Nhãn cây đang chọn ────────────────────────────────────────────────────
  // Đệm dưới = chỗ cho vòng sáng bán kính 13 của chấm đang chọn.
  nhanCayBoc: { alignItems: 'center', paddingBottom: 18 },
  nhanCay: {
    maxWidth: 190,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.chip,
    backgroundColor: NATURE.bark,
  },
  nhanCayTxt: { color: SURFACE.raised, fontSize: 12, fontWeight: '700' },

  // ── Mép dưới ──────────────────────────────────────────────────────────────
  chongDay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACE.page,
    gap: SPACE.xs,
  },
  ghiNguon: { fontSize: 10, color: NATURE.bark, opacity: 0.65, alignSelf: 'flex-end' },

  // ── Bảng số liệu ──────────────────────────────────────────────────────────
  bang: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    gap: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TONE.border,
    ...ELEVATION.modal,
  },
  bangSo: { flexDirection: 'row', alignItems: 'stretch' },
  vach: { width: StyleSheet.hairlineWidth, backgroundColor: TONE.border, marginVertical: 2 },
  oSo: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  oSoTri: { fontSize: 15, fontWeight: '700', color: NATURE.bark },
  oSoNhan: { fontSize: 10, color: NATURE.barkSoft },

  chuGiai: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, justifyContent: 'center' },
  chuGiaiMuc: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chuGiaiCham: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  chuGiaiTxt: { fontSize: 11, color: NATURE.barkSoft, fontWeight: '600' },

  dongRanh: { fontSize: 11, color: NATURE.barkSoft, textAlign: 'center' },
  dongThieu: { fontSize: 11, color: TONE.sun, fontWeight: '600', textAlign: 'center' },

  // ── Popup cây ─────────────────────────────────────────────────────────────
  popup: {
    borderRadius: RADIUS.modal,
    overflow: 'hidden',
    padding: SPACE.lg,
    gap: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TONE.border,
    ...ELEVATION.modal,
  },
  popupDau: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  popupPct: { fontSize: 15, fontWeight: '700', color: NATURE.bark },
  popupTen: { fontSize: 18, fontWeight: '700', color: NATURE.bark },
  popupChipHang: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: 4 },
  popupChip: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: RADIUS.chip },
  popupChipTxt: { fontSize: 11, fontWeight: '700', color: SURFACE.raised },
  popupMa: { fontSize: 11, color: NATURE.barkSoft, fontWeight: '600' },

  popupBang: { gap: 6 },
  popupHang: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  popupNhan: { fontSize: 13, color: NATURE.barkSoft },
  popupGt: { fontSize: 14, fontWeight: '600', color: NATURE.bark, flexShrink: 1, textAlign: 'right' },
  popupUoc: { fontSize: 11, fontWeight: '400', color: NATURE.barkSoft },

  popupNutHang: { flexDirection: 'row', gap: SPACE.sm },
  nutPhu: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    borderColor: TONE.primary,
  },
  nutPhuTxt: { fontSize: 14, fontWeight: '700', color: TONE.primary },
  nutChinh: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.chip,
    overflow: 'hidden',
  },
  nutChinhTxt: { fontSize: 15, fontWeight: '700', color: SURFACE.raised },
});

export default FarmMapScreen;
