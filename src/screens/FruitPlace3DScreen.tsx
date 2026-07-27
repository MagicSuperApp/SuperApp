/**
 * FruitPlace3DScreen — ĐẶT TOẠ-ĐỘ 3D CỦA QUẢ TRÊN CÂY.
 *
 * Thay cho việc chỉ chọn 1 trong 3 vùng (Gốc / Thân giữa / Tán): người dùng KÉO
 * biểu-tượng quả trên hình cây để đặt đúng chỗ. Màn hình chỉ có 2 chiều mà quả
 * cần 3, nên có 3 HƯỚNG CHIẾU, mỗi hướng khoá 1 trục:
 *
 *   Trước → kéo được X (trái/phải) và Y (cao/thấp)   · khoá Z
 *   Bên   → kéo được Z (trước/sau) và Y (cao/thấp)   · khoá X
 *   Trên  → kéo được X và Z (nhìn từ trên xuống)     · khoá Y
 *
 * Camera dùng ORTHOGRAPHIC nên px ⇄ mét là hằng số: icon quả vẽ bằng View của RN
 * đè lên canvas vẫn khớp chính xác với cây, và luôn kéo được (không cần raycast).
 *
 * Trả kết quả về màn trước bằng `navigate(..., { merge: true })` với tham số
 * `pickedFruitCoord`; nếu đã có `fruitId` thì lưu thẳng vào máy luôn.
 *
 * Route params: { treeId, treeName?, fruitId?, fruitName?, initial?, returnTo? }
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  LayoutChangeEvent, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Canvas, useThree } from '@react-three/fiber/native';
import type * as THREE from 'three';

import {
  DEFAULT_FRUIT_COORD, ZONE_LABEL, clampCoord, coordToZone,
  type FruitCoord,
} from '../features/space3d/treeFrame';
import {
  VIEW_DEFS, cameraPose, coordToScreenOffset, frustumHeightM,
  lockedAxis, metersPerPx, screenOffsetToCoord, LOOK_AT_M,
  type ViewDir,
} from '../features/space3d/projection';
import { SPACE_COLORS } from '../features/space3d/visuals';
import { saveFruitCoord } from '../features/space3d/positionStore';
import TreeModel from '../features/space3d/scene/TreeModel';
import { loadTreeModelId } from '../features/space3d/treeModelStore';
import { DEFAULT_TREE_MODEL_ID, type TreeModelId } from '../features/space3d/treeModels';

interface RouteParams {
  treeId: string;
  treeName?: string;
  fruitId?: string;
  fruitName?: string;
  initial?: FruitCoord;
  /** Màn cần quay lại kèm kết quả (mặc định: quay lui 1 bước). */
  returnTo?: string;
}

const DOT = 34;

/**
 * Ép camera đúng tư-thế của hướng chiếu.
 * KHÔNG dựa vào prop `camera` của <Canvas>: R3F tự gọi lookAt(0,0,0) cho camera
 * mặc định, mà tâm ngắm phải là GIỮA THÂN cây (0, H/2, 0) — lệch đi là toàn bộ
 * phép quy đổi px ⇄ mét bên projection.ts sai theo.
 */
const OrthoRig: React.FC<{ view: ViewDir; zoom: number }> = ({ view, zoom }) => {
  const { camera } = useThree();
  React.useEffect(() => {
    const p = cameraPose(view);
    camera.up.set(p.up[0], p.up[1], p.up[2]);
    camera.position.set(p.position[0], p.position[1], p.position[2]);
    camera.lookAt(LOOK_AT_M[0], LOOK_AT_M[1], LOOK_AT_M[2]);
    const ortho = camera as THREE.OrthographicCamera;
    if (zoom > 0) ortho.zoom = zoom;
    ortho.updateProjectionMatrix();
  }, [view, zoom, camera]);
  return null;
};

const FruitPlace3DScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { treeId, treeName, fruitId, fruitName, initial, returnTo } = (route.params ?? {}) as RouteParams;

  // Dùng ĐÚNG model cây đó đang hiển thị ở sơ đồ 3D — đặt quả trên hình cây khác
  // với hình mình vẫn thấy thì toạ-độ nhìn sẽ lệch.
  const [modelId, setModelId] = useState<TreeModelId>(DEFAULT_TREE_MODEL_ID);
  useEffect(() => {
    let alive = true;
    if (treeId) loadTreeModelId(treeId).then((id) => { if (alive) setModelId(id); });
    return () => { alive = false; };
  }, [treeId]);

  const [view, setView] = useState<ViewDir>('front');
  const [coord, setCoord] = useState<FruitCoord>(() => clampCoord(initial ?? DEFAULT_FRUIT_COORD));
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);

  const mpp = useMemo(() => metersPerPx(view, canvas.h), [view, canvas.h]);

  const offset = useMemo(() => coordToScreenOffset(view, coord, mpp), [view, coord, mpp]);
  const dotLeft = canvas.w / 2 + offset.dx - DOT / 2;
  const dotTop = canvas.h / 2 + offset.dy - DOT / 2;

  const onCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  }, []);

  // Kéo icon quả: cộng dồn từ vị-trí lúc BẮT ĐẦU kéo (không phải từ toạ-độ hiện
  // tại mỗi khung) → không bị trôi tích luỹ sai số.
  const dragStart = useRef<{ dx: number; dy: number; coord: FruitCoord } | null>(null);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStart.current = { dx: offset.dx, dy: offset.dy, coord };
    },
    onPanResponderMove: (_e, g) => {
      const s = dragStart.current;
      if (!s || !(mpp > 0)) return;
      setCoord(screenOffsetToCoord(view, s.coord, s.dx + g.dx, s.dy + g.dy, mpp));
    },
    onPanResponderRelease: () => { dragStart.current = null; },
    onPanResponderTerminate: () => { dragStart.current = null; },
  }), [offset.dx, offset.dy, coord, mpp, view]);

  const done = useCallback(async () => {
    setSaving(true);
    // Có sẵn quả trên server → lưu toạ-độ đủ 3 chiều vào máy ngay.
    if (fruitId) await saveFruitCoord(fruitId, coord);
    setSaving(false);
    const target = returnTo;
    if (target) {
      navigation.navigate({ name: target, params: { pickedFruitCoord: coord }, merge: true } as any);
    } else {
      // Không biết tên màn trước → vẫn đẩy tham số bằng cách lui rồi set params.
      const parent = navigation.getState?.();
      const prev = parent?.routes?.[Math.max(0, (parent.index ?? 1) - 1)];
      if (prev?.name) {
        navigation.navigate({ name: prev.name, params: { pickedFruitCoord: coord }, merge: true } as any);
      } else {
        navigation.goBack();
      }
    }
  }, [coord, fruitId, navigation, returnTo]);

  const zone = coordToZone(coord);
  const locked = lockedAxis(view);
  const activeDef = VIEW_DEFS.find((v) => v.key === view)!;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={SPACE_COLORS.bg} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color={SPACE_COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ĐẶT VỊ TRÍ QUẢ TRÊN CÂY</Text>
          <Text style={styles.title} numberOfLines={1}>
            {fruitName || 'Quả mới'} · {treeName || 'Cây'}
          </Text>
        </View>
      </View>

      {/* 3 hướng chiếu */}
      <View style={styles.viewTabs}>
        {VIEW_DEFS.map((v) => {
          const on = v.key === view;
          return (
            <TouchableOpacity
              key={v.key}
              style={[styles.viewTab, on && styles.viewTabOn]}
              onPress={() => setView(v.key)}
              activeOpacity={0.85}
            >
              <Icon name={v.icon} size={16} color={on ? '#06120c' : SPACE_COLORS.text} />
              <Text style={[styles.viewTabTxt, on && styles.viewTabTxtOn]}>{v.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Khung 3D + icon quả kéo được */}
      <View style={styles.stage} onLayout={onCanvasLayout}>
        <Canvas
          style={StyleSheet.absoluteFill}
          orthographic
          camera={{ near: 0.1, far: 200 }}
        >
          <color attach="background" args={['#070d0b']} />
          {/* zoom = px/mét: khung nhìn cao đúng frustumHeightM mét theo chiều cao canvas. */}
          <OrthoRig view={view} zoom={canvas.h > 0 ? canvas.h / frustumHeightM(view) : 0} />
          <hemisphereLight args={['#a8e6c4', '#0a1410', 0.9]} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[8, 14, 10]} intensity={1.0} color="#e6fff0" />
          <TreeModel position={[0, 0, 0]} modelId={modelId} />
        </Canvas>

        {/* Vạch mốc tâm ngắm — giúp ước lượng độ cao */}
        <View pointerEvents="none" style={[styles.axisH, { top: canvas.h / 2 }]} />
        <View pointerEvents="none" style={[styles.axisV, { left: canvas.w / 2 }]} />

        {canvas.h > 0 && (
          <View
            style={[styles.dot, { left: dotLeft, top: dotTop }]}
            {...panResponder.panHandlers}
          >
            <View style={styles.dotGlow} />
            <View style={styles.dotCore} />
          </View>
        )}

        <View pointerEvents="none" style={styles.stageHint}>
          <Text style={styles.stageHintTxt}>{activeDef.hint} · khoá trục {locked}</Text>
        </View>
      </View>

      {/* Toạ độ + xác nhận */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.coordRow}>
          <CoordChip label="X" value={coord.x} hint="trái ⇄ phải" />
          <CoordChip label="Y" value={coord.y} hint="gốc → ngọn" />
          <CoordChip label="Z" value={coord.z} hint="trước ⇄ sau" />
          <View style={styles.zoneChip}>
            <Text style={styles.zoneChipTxt}>{ZONE_LABEL[zone]}</Text>
          </View>
        </View>

        <View style={styles.footerBtns}>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => setCoord(DEFAULT_FRUIT_COORD)}
          >
            <Icon name="restore" size={16} color={SPACE_COLORS.text} />
            <Text style={styles.resetTxt}>Đặt lại</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={done} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#06120c" />
              : (
                <>
                  <Icon name="check" size={18} color="#06120c" />
                  <Text style={styles.doneTxt}>Dùng vị trí này</Text>
                </>
              )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const CoordChip: React.FC<{ label: string; value: number; hint: string }> = ({ label, value, hint }) => (
  <View style={styles.coordChip}>
    <Text style={styles.coordLabel}>{label}</Text>
    <Text style={styles.coordVal}>{value.toFixed(2)}</Text>
    <Text style={styles.coordHint}>{hint}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_COLORS.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SPACE_COLORS.hudBg, borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 2.2, color: SPACE_COLORS.accent },
  title: { fontSize: 17, fontWeight: '800', color: SPACE_COLORS.text },

  viewTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  viewTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder, backgroundColor: SPACE_COLORS.hudBg,
  },
  viewTabOn: { backgroundColor: SPACE_COLORS.accent, borderColor: SPACE_COLORS.accent },
  viewTabTxt: { color: SPACE_COLORS.text, fontSize: 13, fontWeight: '700' },
  viewTabTxtOn: { color: '#06120c' },

  stage: {
    flex: 1, marginHorizontal: 12, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder, backgroundColor: '#070d0b',
  },
  axisH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(61,220,132,0.16)' },
  axisV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(61,220,132,0.16)' },

  dot: { position: 'absolute', width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dotGlow: {
    position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2,
    backgroundColor: 'rgba(74,222,128,0.28)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.6)',
  },
  dotCore: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#4ade80',
    borderWidth: 2, borderColor: '#dbffe9',
  },

  stageHint: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  stageHintTxt: { color: '#cfe9db', fontSize: 11, textAlign: 'center' },

  footer: { paddingHorizontal: 12, paddingTop: 12, gap: 12 },
  coordRow: { flexDirection: 'row', gap: 8 },
  coordChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
    backgroundColor: SPACE_COLORS.hudBg, borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  coordLabel: { color: SPACE_COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  coordVal: { color: SPACE_COLORS.text, fontSize: 15, fontWeight: '800', marginTop: 1 },
  coordHint: { color: SPACE_COLORS.textMuted, fontSize: 9, marginTop: 1 },
  zoneChip: {
    justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: 'rgba(61,220,132,0.16)', borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  zoneChipTxt: { color: SPACE_COLORS.accent, fontSize: 12, fontWeight: '800' },

  footerBtns: { flexDirection: 'row', gap: 10 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 13,
    borderWidth: 1, borderColor: SPACE_COLORS.hudBorder,
  },
  resetTxt: { color: SPACE_COLORS.text, fontSize: 14, fontWeight: '700' },
  doneBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 13, backgroundColor: SPACE_COLORS.accent,
  },
  doneTxt: { color: '#06120c', fontSize: 15, fontWeight: '800' },
});

export default FruitPlace3DScreen;
