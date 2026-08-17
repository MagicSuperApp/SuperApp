/**
 * TreeRadar — ĐÃ VÀO TỚI VƯỜN: tìm cây quanh chỗ đứng.
 *
 * ── Vì sao đổi hẳn chế độ khi tới nơi ───────────────────────────────────────
 * Tới được vườn rồi thì kim chỉ đường hết việc: ở khoảng cách 0, góc phương-vị
 * chỉ còn là nhiễu GPS, kim quay vòng vòng và nói dối rằng nó biết hướng. Câu
 * hỏi cũng đã đổi — không còn "vườn ở đâu" mà là "cây nào đang ở quanh tôi".
 *
 * ── Không phải hình tròn, không có tia quét ─────────────────────────────────
 * Mặt phẳng phủ TOÀN MÀN, không cắt thành đĩa tròn: đĩa tròn cắt mất bốn góc màn
 * mà chẳng đổi lấy điều gì, trong khi cây ở góc màn vẫn là cây thật đang ở đó.
 *
 * KHÔNG có tia quét xoay vòng. Tia quét trong radar thật có nghĩa: nó là ăng-ten
 * đang quay, và chấm chỉ sáng khi tia đi qua. Ở đây không có gì quay cả — dữ liệu
 * có sẵn từ đầu. Vẽ một tia quét là bịa ra một cơ chế không tồn tại, để trang trí.
 *
 * ── Hướng máy quay lên ──────────────────────────────────────────────────────
 * Chấm bên trái màn nghĩa là cây bên trái NGƯỜI. Xoay người thì cả mặt phẳng xoay
 * theo. Xem `radar.ts` để biết vì sao không dùng Bắc-quay-lên.
 *
 * ── Vùng vườn ──────────────────────────────────────────────────────────────
 * Đa-giác nối các điểm ranh giới người dùng đã đi bộ ghi lại. Nó trả lời một câu
 * mà chấm cây không trả lời được: "tôi đang ĐỨNG TRONG vườn hay còn ngoài bờ?".
 * Giữa vườn sầu riêng, ranh giới không có hàng rào và mắt thường không thấy.
 *
 * Vẽ ĐỦ mọi đỉnh, kể cả đỉnh nằm ngoài tầm nhìn 20 m: đỉnh xa vẫn định hình cạnh
 * đi ngang qua tầm nhìn, bỏ nó là vẽ ra một mảnh vườn méo không có thật.
 *
 * ── Cụm cây bên dưới ────────────────────────────────────────────────────────
 * Chấm hợp để thấy "quanh đây có gì", nhưng dở khi cần chọn: hai cây cách nhau
 * một mét thì hai chấm chồng lên nhau. Nên bên dưới còn danh sách chia theo tầm
 * với — chạm vào một cây là chuyển sang chỉ đường tới đúng cây đó.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import Icon from '../../components/Icon';
import { tk } from '../../i18n/keys';
import {
  ELEVATION, GLASS, NATURE, ORGANIC_TILE, RADIUS, SPACE, TONE, TYPE,
} from '../../modules/trace/theme/depth';
import { projectBoundary, pxPerMeter, radarPoint, zoneOf, type Zone } from './radar';
import { formatDistanceVi, type LatLon } from './wayfind';

/** Bán kính hiển thị. 20 m là tầm mắt còn phân biệt được cây trong tán rậm. */
export const RADAR_RADIUS_M = 20;

const ZONES: { key: Zone; label: string; icon: string }[] = [
  { key: 'here', label: 'map.zone.here', icon: 'location-crosshairs' },
  { key: 'near', label: 'map.zone.near', icon: 'tree' },
  { key: 'far', label: 'map.zone.far', icon: 'person-walking' },
];

export interface RadarTree {
  id: string;
  name: string;
  pos: LatLon;
}

const TreeRadar: React.FC<{
  origin: LatLon;
  headingDeg: number | null;
  trees: RadarTree[];
  /** Các điểm ranh giới vườn (`{lat, lng}` hoặc `{lat, lon}`). Rỗng → không vẽ. */
  boundary?: unknown[];
  onPickTree: (tree: RadarTree) => void;
  /** Chừa chỗ cho đầu màn và thanh dưới — chấm không chui xuống dưới chúng. */
  insetTop: number;
  insetBottom: number;
}> = ({ origin, headingDeg, trees, boundary, onPickTree, insetTop, insetBottom }) => {
  const { width, height } = useWindowDimensions();
  const [listOpen, setListOpen] = useState(true);

  /** Vùng vẽ chấm — phần màn còn lại sau khi trừ đầu màn và danh sách. */
  const fieldH = Math.max(200, height - insetTop - insetBottom - (listOpen ? 232 : 96));
  const center = { x: width / 2, y: insetTop + fieldH / 2 };
  const pxPerM = pxPerMeter(width, fieldH, RADAR_RADIUS_M);

  const points = useMemo(
    () => trees.map(t => ({
      tree: t,
      ...radarPoint(origin, t.pos, { headingDeg, pxPerM, center, radiusM: RADAR_RADIUS_M }),
    })),
    // `center`/`pxPerM` dựng lại mỗi lần vẽ nên đưa từng số vào, không đưa cả object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trees, origin.lat, origin.lon, headingDeg, pxPerM, center.x, center.y],
  );

  /**
   * Toạ độ đa-giác trong hệ của LỚP VẼ (gốc ở mép trên lớp), nên phải trừ đi
   * `insetTop` đúng như chấm cây — hai thứ nằm chồng nhau thì phải cùng gốc.
   */
  const boundaryPts = useMemo(() => {
    if (!boundary || boundary.length < 3) return '';
    const pts = projectBoundary(origin, boundary, {
      headingDeg, pxPerM, center, radiusM: RADAR_RADIUS_M,
    });
    // Dưới 3 đỉnh hợp lệ thì không thành hình — vẽ ra chỉ là một vệt vô nghĩa.
    if (pts.length < 3) return '';
    return pts.map(p => `${p.x},${p.y - insetTop}`).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary, origin.lat, origin.lon, headingDeg, pxPerM, center.x, center.y, insetTop]);

  const grouped = useMemo(() => {
    const by: Record<Zone, typeof points> = { here: [], near: [], far: [] };
    for (const p of [...points].sort((a, b) => a.distanceM - b.distanceM)) {
      by[zoneOf(p.distanceM)].push(p);
    }
    return by;
  }, [points]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* ── Mặt phẳng chấm ── */}
      <View style={[styles.field, { height: fieldH, marginTop: insetTop }]} pointerEvents="box-none">
        {/* Vùng vườn nằm DƯỚI cùng — nó là mặt đất, không phải thứ để chạm. */}
        {boundaryPts ? (
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polygon
              points={boundaryPts}
              fill={TONE.primary}
              fillOpacity={0.12}
              stroke={TONE.primaryDeep}
              strokeOpacity={0.5}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}

        {/* Vòng cữ khoảng cách — không phải khung của radar, chỉ là thước đo.
            Vẽ mờ để mắt ước lượng được "cây kia cách chừng nào" mà không bị
            chúng tranh chỗ với chấm cây. */}
        {[RADAR_RADIUS_M / 2, RADAR_RADIUS_M].map(r => (
          <View
            key={r}
            pointerEvents="none"
            style={[styles.ring, {
              width: r * pxPerM * 2,
              height: r * pxPerM * 2,
              borderRadius: r * pxPerM,
              left: center.x - r * pxPerM,
              top: center.y - insetTop - r * pxPerM,
            }]}
          />
        ))}

        {/* Chỗ người đứng — luôn ở giữa, luôn nhìn lên. */}
        <View pointerEvents="none" style={[styles.me, { left: center.x - 13, top: center.y - insetTop - 13 }]}>
          <View style={styles.meDot} />
        </View>

        {points.filter(p => p.inRange).map(p => (
          <Pressable
            key={p.tree.id}
            style={[styles.dotHit, { left: p.x - 34, top: p.y - insetTop - 34 }]}
            onPress={() => onPickTree(p.tree)}
            hitSlop={6}
          >
            <View style={styles.dot} />
            <Text style={styles.dotLabel} numberOfLines={1}>{p.tree.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Cụm cây ── */}
      <View style={[styles.sheet, { paddingBottom: insetBottom + SPACE.md }]}>
        <Pressable style={styles.sheetGrab} onPress={() => setListOpen(v => !v)} hitSlop={10}>
          <View style={styles.grabBar} />
          <Text style={styles.sheetTitle}>
            {tk('map.zone.title', { n: trees.length })}
          </Text>
          <Icon name={listOpen ? 'chevron-down' : 'chevron-up'} size={16} color={NATURE.barkSoft} />
        </Pressable>

        {listOpen ? (
          <ScrollView style={styles.zoneScroll} showsVerticalScrollIndicator={false}>
            {ZONES.map(z => {
              const items = grouped[z.key];
              if (items.length === 0) return null;
              return (
                <View key={z.key} style={styles.zone}>
                  <View style={styles.zoneHead}>
                    <Icon name={z.icon} size={13} color={NATURE.barkSoft} />
                    <Text style={styles.zoneLabel}>{tk(z.label)}</Text>
                    <Text style={styles.zoneCount}>{items.length}</Text>
                  </View>
                  <View style={styles.chipWrap}>
                    {items.map(p => (
                      <Pressable
                        key={p.tree.id}
                        style={({ pressed }) => [styles.treeChip, pressed && styles.pressed]}
                        onPress={() => onPickTree(p.tree)}
                      >
                        <View style={styles.chipDot} />
                        <Text style={styles.chipName} numberOfLines={1}>{p.tree.name}</Text>
                        <Text style={styles.chipDist}>{formatDistanceVi(p.distanceM)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
            {trees.length === 0 ? (
              <Text style={styles.empty}>{tk('map.zone.empty')}</Text>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  pressed: { opacity: 0.85 },

  field: { width: '100%' },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: TONE.border,
    opacity: 0.55,
  },
  me: {
    position: 'absolute', width: 26, height: 26, borderRadius: 13,
    backgroundColor: GLASS.film, alignItems: 'center', justifyContent: 'center',
  },
  meDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: NATURE.bark },

  dotHit: { position: 'absolute', width: 68, alignItems: 'center', gap: 3, paddingTop: 24 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: TONE.primary,
    borderWidth: 2.5, borderColor: NATURE.paper,
  },
  dotLabel: {
    fontSize: 11.5, fontWeight: '600', color: NATURE.bark,
    backgroundColor: GLASS.film, borderRadius: RADIUS.chip,
    paddingHorizontal: 6, paddingVertical: 2, maxWidth: 68,
  },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: GLASS.film,
    borderTopLeftRadius: 30, borderTopRightRadius: 22,
    paddingHorizontal: SPACE.page, ...ELEVATION.sheet,
  },
  sheetGrab: { alignItems: 'center', paddingVertical: SPACE.md, gap: 6 },
  grabBar: { width: 44, height: 4, borderRadius: 2, backgroundColor: TONE.border },
  sheetTitle: { ...TYPE.cardTitle, fontSize: 16 },
  zoneScroll: { maxHeight: 172 },

  zone: { marginBottom: SPACE.md },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.sm },
  zoneLabel: { fontSize: 13, fontWeight: '600', color: NATURE.barkSoft },
  zoneCount: { fontSize: 12, color: NATURE.barkSoft },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  treeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: NATURE.paper, ...ORGANIC_TILE, ...ELEVATION.card,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  chipDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: TONE.primary },
  chipName: { fontSize: 14.5, fontWeight: '600', color: NATURE.bark, maxWidth: 128 },
  chipDist: { fontSize: 12.5, color: NATURE.barkSoft },

  empty: { ...TYPE.caption, textAlign: 'center', paddingVertical: SPACE.lg },
});

export default TreeRadar;
