/**
 * space3d/mapTexture — tải 1 ô bản đồ về máy và dựng thành THREE.Texture.
 *
 * Dùng lại đúng đường đã kiểm chứng ở `treeAsset.ts`: React Native KHÔNG có DOM
 * `Image`/`canvas` nên `TextureLoader` của three vô dụng. expo-gl nạp ảnh native
 * khi texture mang hình dạng `image = { data: { localUri }, width, height }` kèm
 * cờ `isDataTexture` — three sẽ gọi `texImage2D(..., image.data)` và phía C++ của
 * expo-gl tự giải mã tệp ảnh đó.
 *
 * `flipY = true` (mặc định của three, KHÁC đường glTF ở treeAsset để `false`):
 * ô bản đồ có gốc ảnh ở góc TRÊN-TRÁI, còn PlaneGeometry của three lấy uv(0,1) ở
 * mép trên → phải lật để hướng Bắc của ảnh trùng hướng Bắc của cảnh. Đã kiểm
 * trong mã nguồn expo-gl: nhánh nạp ảnh theo localUri có tôn trọng
 * UNPACK_FLIP_Y_WEBGL (EXWebGLMethodsTextures.cpp — `flipPixels` sau `loadImage`).
 *
 * KHÔNG bật mipmap: đường texture này chỉ upload xong ở lô lệnh kế tiếp, mà
 * `glGenerateMipmap` trên texture chưa hoàn chỉnh sẽ cho ra ô ĐEN — hỏng nặng
 * hơn hẳn cái giá phải trả là hơi rung khi nhìn chếch. Giữ đúng cấu hình lọc mà
 * treeAsset đã chạy thật.
 */

import { Image } from 'react-native';
import * as THREE from 'three';
import * as FileSystem from 'expo-file-system/legacy';
import { tileUrl, type MapSource, type TilePlacement } from './mapTiles';

/** Tên tệp cache — chỉ giữ ký tự an toàn cho mọi hệ tệp. */
const cachePath = (sourceId: string, t: { z: number; x: number; y: number }) =>
  `${FileSystem.cacheDirectory}space3d-map-${sourceId.replace(/[^a-z0-9]/gi, '')}-${t.z}-${t.x}-${t.y}`;

/** Ảnh ô đã nằm sẵn trên máy, kèm kích thước — phần ĐẮT của việc nạp. */
interface TileImage { uri: string; width: number; height: number }

/**
 * Cache theo URL, ở mức module. CHỈ nhớ TỆP + kích thước, KHÔNG nhớ `THREE.Texture`.
 *
 * Lý do: texture gắn với MỘT ngữ-cảnh GL. Màn 3D tháo `<Canvas>` mỗi khi mất tiêu
 * điểm (xem Space3DScreen), nên lần quay lại là một ngữ-cảnh KHÁC — đưa lại đúng
 * thể-hiện texture cũ là trò may rủi. Dựng `THREE.Texture` gần như miễn phí, còn
 * cái đáng tiếc là lượt tải mạng thì vẫn được giữ.
 */
const cache = new Map<string, Promise<TileImage>>();

async function fetchTileImage(src: MapSource, t: TilePlacement): Promise<TileImage> {
  const url = tileUrl(src, t);
  const dest = cachePath(src.id, t);

  // Đã có trong cache đĩa (phiên trước) thì khỏi tải lại.
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists || !(info as any).size) {
    const res = await FileSystem.downloadAsync(url, dest);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  }

  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => Image.getSize(dest, (w, h) => resolve({ width: w, height: h }), reject),
  );
  return { uri: dest, width, height };
}

/** Ảnh trên máy → texture MỚI, dùng cho đúng ngữ-cảnh GL đang mở. */
function makeTexture(img: TileImage): THREE.Texture {
  const tex = new THREE.Texture();
  (tex as any).image = { data: { localUri: img.uri }, width: img.width, height: img.height };
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Ô nào cũng chỉ vẽ đúng phần ảnh của nó → kẹp mép, tuyệt đối không lặp
  // (lặp sẽ kéo pixel mép này sang ô bên cạnh thành viền lạ).
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  (tex as any).isDataTexture = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Texture của 1 ô — luôn là thể-hiện MỚI (xem ghi chú ở `cache`).
 * Hỏng thì ném; nơi gọi bỏ qua ô đó, các ô khác vẫn hiện.
 * Nơi gọi CHỊU TRÁCH NHIỆM `dispose()` khi tháo lớp bản đồ.
 */
export function loadTileTexture(src: MapSource, t: TilePlacement): Promise<THREE.Texture> {
  const url = tileUrl(src, t);
  let task = cache.get(url);
  if (!task) {
    task = fetchTileImage(src, t).catch((err) => {
      cache.delete(url); // cho phép thử lại lần sau (mất mạng tạm thời)
      throw err;
    });
    cache.set(url, task);
  }
  return task.then(makeTexture);
}
