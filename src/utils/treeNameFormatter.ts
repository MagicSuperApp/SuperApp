// utils/treeNameFormatter.ts
//
// Build 52 § A7 — Tree name farmer-friendly.
//
// Vấn đề: nông dân thấy UUID như "TREE-TREE_28A" → không hiểu. Phải hiển thị
// dạng tên thân thiện: "Cây #3", "Cây góc Đông", hoặc fallback short hash.
//
// Ưu tiên (priority order):
//   1. tree.farmer_name        — nông dân tự đặt (highest signal)
//   2. tree.display_index      — per-farm sequential ("Cây #3")
//   3. Bearing từ GPS centroid — "Cây góc Đông" (8 hướng)
//   4. Short hash fallback     — "Cây 872" (4-char tail of UUID/code)
//
// Note: utility pure, không phụ thuộc React. Caller truyền tree + farm (optional).

import type { Tree, Farm } from '../modules/trace/types';

const DIRECTIONS_VI = [
  'Bắc', 'Đông Bắc', 'Đông', 'Đông Nam',
  'Nam', 'Tây Nam', 'Tây', 'Tây Bắc',
];

/**
 * Format tree display name farmer-friendly.
 */
export function formatTreeName(tree: Tree, farm?: Farm | null): string {
  if (tree.farmer_name) return tree.farmer_name;

  if (tree.display_index !== undefined && tree.display_index > 0) {
    return `Cây #${tree.display_index}`;
  }

  const treeLoc = resolveTreeLocation(tree);
  if (treeLoc && farm?.coordinates && farm.coordinates.length >= 3) {
    const direction = computeRelativeDirection(treeLoc, farm.coordinates);
    return `Cây ${direction}`;
  }

  const raw = tree.id || tree.code || '';
  const tail = raw.split(/[-_]/).pop() || '';
  const shortId = tail.slice(-4) || '?';
  return `Cây ${shortId.toUpperCase()}`;
}

/**
 * Short ID for dev/debug display (subtitle below main name).
 * "TREE-TREE_28A47B91" → "28A47B" (6-char tail).
 */
export function shortTreeCode(tree: Tree): string {
  const raw = tree.id || tree.code || '';
  const tail = raw.split(/[-_]/).pop() || '';
  return tail.slice(-6).toUpperCase();
}

// ── Internals ────────────────────────────────────────────────────────────────

function resolveTreeLocation(tree: Tree): { lat: number; lng: number } | null {
  if (tree.location && typeof tree.location.lat === 'number' && typeof tree.location.lng === 'number') {
    return tree.location;
  }
  if (typeof tree.latitude === 'number' && typeof tree.longitude === 'number') {
    return { lat: tree.latitude, lng: tree.longitude };
  }
  return null;
}

function computeRelativeDirection(
  point: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>,
): string {
  // Centroid (mean lat/lng). Đủ cho ≤ vài trăm m radius farm.
  const cLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const cLng = polygon.reduce((s, p) => s + p.lng, 0) / polygon.length;

  // Bearing compass: 0° = Bắc, theo kim đồng hồ.
  const dy = point.lat - cLat;
  const dx = point.lng - cLng;

  if (Math.abs(dy) < 1e-9 && Math.abs(dx) < 1e-9) {
    // Cây trùng centroid → fallback hash
    return 'giữa vườn';
  }

  let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;

  // 8 wedges 45°. Center N = 0° → offset +22.5° để N nằm trong wedge index 0.
  const offset = (bearing + 22.5) % 360;
  const index = Math.floor(offset / 45) % 8;
  return `góc ${DIRECTIONS_VI[index]}`;
}
