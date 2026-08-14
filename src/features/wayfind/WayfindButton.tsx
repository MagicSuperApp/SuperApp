/**
 * WayfindButton — CỬA DUY NHẤT để mở màn Dẫn đường.
 *
 * ── Vì sao gom lại ──────────────────────────────────────────────────────────
 * Trước bản này có bốn chỗ tự dựng lấy đường vào màn Dẫn đường: thẻ vườn, chi
 * tiết vườn, danh sách cây, và chính màn Dẫn đường (nhảy sang cây khác). Mỗi chỗ
 * tự lấy toạ độ, tự đặt tên nhãn, tự viết bộ tham số. Bốn bản sao của cùng một
 * việc là bốn chỗ để lệch nhau, và chúng ĐÃ lệch:
 *
 *   · thẻ vườn ghi `farmId` nhưng chi tiết vườn thì không → mở từ chỗ này có
 *     danh sách "cây quanh đây", mở từ chỗ kia thì không, mà không ai cố ý.
 *   · tên cây khi trống được đặt lại ở hai nơi bằng hai cách viết khác nhau.
 *   · chỉ hai trong bốn chỗ chịu ẨN nút khi chưa có toạ độ; hai chỗ còn lại vẫn
 *     hiện rồi dẫn vào một màn không chỉ được gì.
 *
 * Nay bộ tham số dựng ở ĐÂY, một lần. Ai muốn thêm nút dẫn đường ở màn mới thì
 * dùng `<WayfindButton />`, hoặc `useOpenWayfind()` nếu cần tự vẽ nút.
 *
 * ── Chưa có toạ độ thì KHÔNG có nút ─────────────────────────────────────────
 * `forFarm`/`forTree` trả `null` khi chưa có toạ độ, và component trả `null`
 * theo. Hiện một nút rồi để người ta bấm vào mới biết là không đi được thì tệ
 * hơn hẳn việc không hiện gì — nhất là giữa vườn, lúc người ta đang cần đường.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import Icon from '../../components/Icon';
import { tk } from '../../i18n/keys';
import { ELEVATION, ORGANIC_TILE, SURFACE, TONE } from '../../modules/trace/theme/depth';
import { fromGpsPair, isValidLatLon, polygonCenter } from './wayfind';

/** Bộ tham số màn Dẫn đường nhận. Giữ khớp `RouteParams` trong `WayfindScreen`. */
export interface WayfindTarget {
  lat: number;
  lon: number;
  label: string;
  kind: 'farm' | 'tree';
  treeId?: string;
  farmId?: string;
}

/**
 * Đích là một VƯỜN. Toạ độ lấy ở TRỌNG TÂM ranh giới đã vẽ — không phải một đỉnh
 * nào đó, cũng không phải điểm đầu tiên: dẫn người ta tới góc vườn rồi bỏ đó thì
 * chẳng khác gì không dẫn.
 */
export function forFarm(farm: any): WayfindTarget | null {
  const c = polygonCenter(farm?.coordinates);
  if (!c) return null;
  return {
    lat: c.lat,
    lon: c.lng,
    kind: 'farm',
    label: farm?.name || tk('map.target.farmCap'),
    farmId: farm?.id,
  };
}

/**
 * Đích là một CÂY. Nhận cả hai hình dạng đang tồn tại trong app: bản ghi của
 * field-reid (`tree_id` + `gps`) và bản ghi trong máy (`id` + `lat`/`lon`).
 */
export function forTree(tree: any, farmId?: string): WayfindTarget | null {
  const fromGps = fromGpsPair(tree?.gps);
  const direct = { lat: Number(tree?.lat), lon: Number(tree?.lon ?? tree?.lng) };
  const pos = fromGps ?? (isValidLatLon(direct) ? direct : null);
  if (!pos) return null;

  const id: string | undefined = tree?.tree_id ?? tree?.id;
  return {
    lat: pos.lat,
    lon: pos.lon,
    kind: 'tree',
    label: tree?.name || tk('map.nearby.unnamed', { code: String(id ?? '').slice(0, 6) }),
    treeId: id,
    farmId: farmId ?? tree?.farmId ?? tree?.farm_id,
  };
}

/**
 * Mở màn Dẫn đường. Dùng khi màn cần tự vẽ nút thay vì lấy nút mặc định.
 *
 * `push` là bắt buộc khi gọi TỪ CHÍNH màn Dẫn đường (nhảy sang cây khác):
 * `navigate` tới cùng một tên route thì React Navigation dùng lại màn đang mở và
 * chỉ gộp tham số — không có màn mới, và nút quay lại đưa thẳng ra ngoài thay vì
 * về cây vừa xem.
 */
export function useOpenWayfind(): (
  target: WayfindTarget | null,
  opts?: { push?: boolean },
) => void {
  const navigation = useNavigation<any>();
  return useCallback((target: WayfindTarget | null, opts?: { push?: boolean }) => {
    if (!target) return;
    if (opts?.push) navigation.push('Wayfind', target);
    else navigation.navigate('Wayfind', target);
  }, [navigation]);
}

/**
 * Nút dẫn đường dùng chung. `target` là `null` (chưa có toạ độ) thì KHÔNG dựng gì.
 *
 * `size` để hai cỡ vì hai chỗ dùng khác nhau: trong thẻ danh sách thì nút phải
 * nhường chỗ cho tên và chip trạng thái, còn trên đầu màn chi tiết thì nó đứng
 * ngang hàng với các nút khác.
 */
const WayfindButton: React.FC<{
  target: WayfindTarget | null;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}> = ({ target, size = 'md', style }) => {
  const open = useOpenWayfind();
  if (!target) return null;

  const box = size === 'sm' ? styles.sm : styles.md;
  return (
    <Pressable
      style={({ pressed }) => [styles.base, box, pressed && styles.pressed, style]}
      onPress={() => open(target)}
      accessibilityRole="button"
      accessibilityLabel={tk('trace.farmList.wayfind', { name: target.label })}
      hitSlop={10}
    >
      <Icon name="map-location-dot" size={size === 'sm' ? 19 : 20} color={TONE.primary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    ...ORGANIC_TILE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { width: 40, height: 40, backgroundColor: TONE.primarySoft },
  md: { width: 44, height: 44, backgroundColor: SURFACE.raised, ...ELEVATION.card },
  pressed: { opacity: 0.85 },
});

export default WayfindButton;
