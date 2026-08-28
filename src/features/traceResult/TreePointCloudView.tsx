/**
 * TreePointCloudView — ô xem KHÔNG GIAN BA CHIỀU của cây.
 *
 * Vuốt ngang để xoay quanh cây; buông tay thì nó tự quay chậm trở lại, đủ để
 * người xem hiểu đây là vật thể xoay được chứ không phải một tấm ảnh.
 *
 * ── Vì sao chỉ gắn khi người dùng MỞ ra ─────────────────────────────────────
 * Mỗi `<Canvas>` là một ngữ cảnh OpenGL riêng. Màn nguồn gốc còn có một bản đồ
 * MapLibre (cũng một bề mặt GL) nằm cùng trang. Giữ cả hai sống trong khi người
 * mua chỉ nhìn được một là làm máy yếu nóng lên ở đúng lúc họ đang xem kỹ. Vì
 * vậy khối 3D là một mục GẬP, và chỉ khi mở thì mới tải tệp và dựng Canvas.
 *
 * ── Vì sao có `advice` của máy chủ ở dưới ô ─────────────────────────────────
 * Model dựng từ ảnh người ta chụp được, nên nó THƯA và có mảng khuyết. Máy chủ
 * biết vì sao (`coverage.advice`: "Mới chụp ~60° (một phía cây)…") và câu ấy nói
 * đúng hơn bất cứ câu nào app tự soạn. Không có nó thì người mua nhìn một khối
 * lỗ chỗ rồi kết luận hồ sơ dối — trong khi sự thật chỉ là chưa chụp đủ vòng.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import Icon from '../../components/Icon';
import { tf } from '../../i18n';
import { pointCloudMeta } from './pointCloudMeta';
import { NATURE, RADIUS, SPACE, TYPE } from '../../modules/trace/theme/depth';
import {
  POINT_CLOUD_BACKDROP, disposePoints, loadPointCloud, type PointCloudResult,
} from './plyPointCloud';

const VIEW_HEIGHT = 260;

/**
 * Khối quay. Góc do ngón tay đặt, và tự trôi tiếp khi không ai chạm.
 *
 * `yawRef` là một ref chứ không phải state: mỗi khung hình đọc nó một lần, và
 * đẩy qua state thì React dựng lại cây component 60 lần mỗi giây cho một con số
 * mà chỉ `useFrame` cần.
 */
const Spinner: React.FC<{ object: THREE.Object3D; yawRef: React.MutableRefObject<number>; dragging: React.MutableRefObject<boolean> }> = ({
  object, yawRef, dragging,
}) => {
  const ref = useRef<THREE.Group>(null);

  const { distance, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(c);
    // Camera lùi theo kích thước THẬT của model → model dày hay thưa, cao hay
    // thấp, đều vừa ô mà không phải chỉnh tay từng cây.
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    return { distance: radius * 2.6, center: c };
  }, [object]);

  useFrame((state, delta) => {
    if (!dragging.current) yawRef.current += delta * 0.35;
    if (ref.current) ref.current.rotation.y = yawRef.current;
    const cam = state.camera;
    cam.position.set(0, center.y + distance * 0.25, distance);
    cam.lookAt(center.x, center.y, center.z);
  });

  return (
    <group ref={ref}>
      <primitive object={object} />
    </group>
  );
};

export interface TreePointCloudViewProps {
  /** URL tệp PLY. Chỗ gọi đã lọc định dạng (xem `model3dUrl`). */
  url: string;
  /** Câu của máy chủ về độ phủ. Hiện NGUYÊN VĂN, đừng soạn lại. */
  advice?: string | null;
  /** Số điểm máy chủ khai. Chỉ để đối chiếu với số đọc được từ tệp. */
  declaredPoints?: number | null;
  /**
   * `model3d.trust.low_confidence` của máy chủ. `undefined` = máy chủ bản cũ
   * không nói — KHÔNG suy ra "đáng tin". Xem `pointCloudMeta.ts`.
   */
  lowConfidence?: boolean | null;
}

const TreePointCloudView: React.FC<TreePointCloudViewProps> = ({
  url, advice, declaredPoints, lowConfidence,
}) => {
  const [result, setResult] = useState<PointCloudResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const yawRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let built: THREE.Points | null = null;
    setResult(null);
    loadPointCloud(url).then((r) => {
      if (!alive) {
        // Màn đã tháo trong lúc tải: model vừa dựng xong không ai xem, và nó
        // đang giữ bộ đệm GPU. Dọn ngay chứ không chờ bộ thu gom.
        if (r.kind === 'ok') disposePoints(r.object);
        return;
      }
      if (r.kind === 'ok') built = r.object;
      setResult(r);
    });
    return () => { alive = false; disposePoints(built); };
  }, [url, attempt]);

  // Vuốt để xoay. `onStartShouldSetPanResponder` trả false để một cú CHẠM đơn
  // không cướp cử chỉ khỏi trang cuộn; chỉ khi ngón đã đi ngang đủ xa mới nhận.
  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { draggingRef.current = true; },
      onPanResponderMove: (_e, g) => { yawRef.current += g.dx * 0.0009; },
      onPanResponderRelease: () => { draggingRef.current = false; },
      onPanResponderTerminate: () => { draggingRef.current = false; },
    }),
    [],
  );

  const body = (() => {
    if (result === null) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={NATURE.leafSoft} />
          <Text style={styles.dimOnDark}>Đang tải khối 3D…</Text>
        </View>
      );
    }
    if (result.kind === 'ok') {
      return (
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
          <Canvas
            style={StyleSheet.absoluteFill}
            camera={{ fov: 45, near: 0.05, far: 500 }}
            gl={{ antialias: false }}
          >
            <color attach="background" args={[POINT_CLOUD_BACKDROP]} />
            <ambientLight intensity={1} />
            <Spinner object={result.object} yawRef={yawRef} dragging={draggingRef} />
          </Canvas>
          <View style={styles.hint} pointerEvents="none">
            <Icon name="hand-pointer" size={12} color={NATURE.paper} />
            <Text style={styles.hintTxt}>Vuốt ngang để xoay</Text>
          </View>
        </View>
      );
    }

    // Năm nhánh hỏng, năm câu khác nhau — và chỉ MỘT ca là đáng thử lại.
    //
    // `gone` là ca mới, và nó là ca phải cẩn thận nhất về câu chữ. Cổng nội dung
    // trả `200` kèm trang giao diện thay cho tệp, nghĩa là tệp không còn được
    // phục vụ. Nhà LampNet đo và báo: với nhóm này, tổng mảnh trên TOÀN mạng đã
    // dưới ngưỡng ghép lại được — nối lại mạng cũng không cứu. Nên ở đây tuyệt
    // đối KHÔNG bày nút "Thử lại": mời người ta bấm một việc đã hỏng vĩnh viễn
    // là để họ đứng giữa vườn bấm mãi rồi tự kết luận app hỏng.
    //
    // Cũng KHÔNG viết "mất ảnh của bạn": app chưa đối chiếu được cây này có bản
    // gốc trong máy hay không, mà đó mới là đường cứu duy nhất còn lại. Câu ở
    // đây chỉ nói đúng phần đã đo: khối 3D không mở được, và vì sao vô ích khi
    // thử lại.
    const retryable = result.kind === 'error';
    const msg =
      result.kind === 'not_found' ? 'Máy chủ chưa dựng xong khối 3D cho cây này.'
        : result.kind === 'too_large' ? 'Tệp model quá lớn để mở trên điện thoại.'
          : result.kind === 'gone' ? 'Kho lưu trữ không còn phục vụ tệp khối 3D của cây này. Thử lại cũng không đổi kết quả — ảnh chụp gốc trong máy vẫn là bản còn dùng được.'
            : result.kind === 'unreadable' ? `Không đọc được tệp model. ${result.detail}`
              : `Chưa tải được model. ${result.detail}`;

    return (
      <View style={styles.center}>
        <Icon name="cube" size={22} color={NATURE.leafSoft} />
        <Text style={styles.dimOnDark}>{msg}</Text>
        {retryable ? (
          <Pressable onPress={() => setAttempt((n) => n + 1)} style={styles.retry} hitSlop={8}>
            <Icon name="arrows-rotate" size={12} color={NATURE.paper} />
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        ) : null}
      </View>
    );
  })();

  // Dòng chữ dưới ô: xem `pointCloudMeta.ts`. Luật gọn lại một câu — chỉ khi ĐỌC
  // ĐƯỢC tệp app mới được nói "dựng từ ảnh chụp thật"; chưa đọc được thì con số
  // của máy chủ vẫn hiện nhưng mang nhãn KHAI.
  const meta = pointCloudMeta({
    state: result === null ? 'loading' : result.kind === 'ok' ? 'ok' : 'failed',
    readCount: result?.kind === 'ok' ? result.count : null,
    declared: declaredPoints,
    advice,
    lowConfidence,
  });

  return (
    <View>
      <View style={styles.box}>{body}</View>
      {meta.measuredPoints !== null ? (
        <Text style={[TYPE.caption, styles.meta]}>
          {tf('{n} điểm dựng từ ảnh chụp thật', {
            n: meta.measuredPoints.toLocaleString('vi-VN'),
          })}
        </Text>
      ) : null}
      {meta.declaredPoints !== null ? (
        <Text style={[TYPE.caption, styles.meta]}>
          {tf('Máy chủ khai {n} điểm — app chưa đọc được tệp để đối chiếu.', {
            n: meta.declaredPoints.toLocaleString('vi-VN'),
          })}
        </Text>
      ) : null}
      {meta.lowConfidence ? (
        <Text style={[TYPE.caption, styles.meta]}>
          Máy chủ tự khai đám mây điểm này thưa — hình dựng ra có thể chưa giống cây thật.
        </Text>
      ) : null}
      {meta.advice ? <Text style={[TYPE.caption, styles.meta]}>{meta.advice}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    height: VIEW_HEIGHT,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    backgroundColor: POINT_CLOUD_BACKDROP,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, padding: SPACE.lg,
  },
  dimOnDark: { fontSize: 13, lineHeight: 20, color: NATURE.leafSoft, textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.xs },
  retryTxt: { fontSize: 13, fontWeight: '600', color: NATURE.paper },
  hint: {
    position: 'absolute', left: SPACE.sm, bottom: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: RADIUS.chip, paddingHorizontal: 10, paddingVertical: 5,
  },
  hintTxt: { fontSize: 11, color: NATURE.paper },
  meta: { marginTop: SPACE.sm },
});

export default TreePointCloudView;
