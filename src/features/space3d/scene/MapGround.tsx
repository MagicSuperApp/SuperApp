/**
 * space3d/scene/MapGround — LỚP BẢN ĐỒ NỀN nằm ngay DƯỚI mặt đất của vườn.
 *
 * Mỗi ô bản đồ = 1 mặt phẳng riêng mang texture riêng, đặt đúng chỗ theo mét
 * (xem `mapTiles.ts`). Không ghép ảnh: React Native không có <canvas> để ghép,
 * mà trải nhiều mặt phẳng thì GPU lo, còn rẻ hơn.
 *
 * Hướng ảnh: `PlaneGeometry` nằm trong mặt XY, xoay −90° quanh trục X thì +Y cục
 * bộ (mép TRÊN của ảnh) quay về −Z, tức hướng BẮC — đúng quy ước ô bản đồ có mép
 * trên là Bắc. Nhờ vậy không phải sửa uv bằng tay.
 *
 * `meshBasicMaterial`: ảnh vệ tinh đã có sẵn ánh sáng mặt trời trong đó, cho đèn
 * của cảnh tác động vào nữa thì vườn sẽ tối đen một nửa theo hướng đèn.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LatLng, Vec2 } from '../geo';
import { getMapSource, planTiles, type TilePlacement } from '../mapTiles';
import { loadTileTexture } from '../mapTexture';

/** Đặt thấp hơn mặt đất vài cm: đủ để không tranh chấp độ sâu, mắt không thấy. */
export const MAP_Y = -0.06;

export interface MapGroundStatus {
  /** Số ô cần tải / đã tải xong / tải hỏng. */
  total: number;
  loaded: number;
  failed: number;
  /** Lý do hỏng đầu tiên — hiện lên HUD cho người dùng biết vì sao nền trống. */
  error?: string;
}

export interface MapGroundProps {
  ring: Vec2[];
  /** Gốc lat/lng của hệ vườn. null = vườn chưa có toạ-độ → không đặt được bản đồ. */
  origin: LatLng | null;
  sourceId: string;
  onStatus?: (s: MapGroundStatus) => void;
}

interface LoadedTile {
  placement: TilePlacement;
  texture: THREE.Texture;
}

export const MapGround: React.FC<MapGroundProps> = ({ ring, origin, sourceId, onStatus }) => {
  const source = useMemo(() => getMapSource(sourceId), [sourceId]);

  const plan = useMemo(
    () => (origin ? planTiles(ring, origin, { maxZoom: source.maxZoom }) : null),
    [ring, origin, source],
  );

  const [tiles, setTiles] = useState<LoadedTile[]>([]);

  // Texture dựng riêng cho ngữ-cảnh GL này → phải tự trả lại khi tháo lớp, nếu
  // không mỗi lần mở lại màn là thêm một lượt ảnh nằm lại trên GPU.
  const owned = useRef<THREE.Texture[]>([]);
  useEffect(() => () => {
    owned.current.forEach((t) => t.dispose());
    owned.current = [];
  }, []);

  useEffect(() => {
    setTiles([]);
    if (!plan) {
      onStatus?.({ total: 0, loaded: 0, failed: 0 });
      return;
    }

    let alive = true;
    let loaded = 0;
    let failed = 0;
    let firstError: string | undefined;

    // Hiện dần từng ô thay vì chờ đủ: mạng chậm vẫn thấy nền lấp đầy từ từ,
    // và một ô 404 không kéo theo cả lớp bản đồ biến mất.
    for (const placement of plan.tiles) {
      loadTileTexture(source, placement)
        .then((texture) => {
          // Tháo lớp trước khi ảnh về tới nơi → trả lại ngay, đừng để nó lạc.
          if (!alive) { texture.dispose(); return; }
          owned.current.push(texture);
          loaded++;
          setTiles((prev) => [...prev, { placement, texture }]);
        })
        .catch((err: any) => {
          if (!alive) return;
          failed++;
          firstError = firstError ?? (err?.message ?? String(err));
          console.warn('[space3d] không tải được ô bản đồ', placement.key, err?.message ?? err);
        })
        .finally(() => {
          if (!alive) return;
          onStatus?.({ total: plan.tiles.length, loaded, failed, error: firstError });
        });
    }

    return () => { alive = false; };
    // onStatus cố ý KHÔNG nằm trong deps: nơi gọi hay truyền hàm mới mỗi lần
    // render, đưa vào đây sẽ tải lại toàn bộ ô sau mỗi lần vẽ lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, source]);

  if (!plan) return null;

  return (
    <group position={[0, MAP_Y, 0]}>
      {tiles.map(({ placement, texture }) => (
        <mesh
          key={placement.key}
          position={[placement.cx, 0, placement.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[placement.width, placement.depth]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};

export default MapGround;
