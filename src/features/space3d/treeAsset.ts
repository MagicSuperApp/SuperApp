/**
 * space3d/treeAsset — TỰ nạp `assets/models/tree1.glb` (hình học + texture).
 *
 * ── Vì sao không dùng `useLoader(GLTFLoader, require('...glb'))` ──────────────
 * Cách trong tài liệu R3F dựa vào bản-vá-khỉ mà @react-three/fiber/native gắn vào
 * `THREE.LoaderUtils` + `THREE.FileLoader` để hiểu module-id dạng SỐ của
 * `require()`. Bản vá chỉ ăn khi R3F và GLTFLoader dùng CHUNG thể-hiện three —
 * đã nổ thật ("url.lastIndexOf is not a function" tại three.core.js).
 *
 * ── Vì sao còn phải TÁCH TEXTURE ra ──────────────────────────────────────────
 * tree1.glb nhúng sẵn PNG trong buffer. `GLTFLoader.parse()` nạp ảnh nhúng bằng
 * `const URL = self.URL || self.webkitURL` (GLTFLoader.js) — `self` là global của
 * TRÌNH DUYỆT, React Native không có → parse ném "self is not defined" và KHÔNG
 * cây nào hiện ra. Đã tái hiện y hệt bằng Node ngoài môi trường DOM.
 *
 * ── Cách làm ở đây ───────────────────────────────────────────────────────────
 *   1. Tách GLB thành chunk JSON + chunk BIN.
 *   2. Lôi PNG ra khỏi bufferView của ảnh.
 *   3. XOÁ images/textures/samplers khỏi JSON rồi ghép lại GLB → `parse()` chỉ
 *      còn hình học, không đụng tới đường nạp ảnh của trình duyệt.
 *   4. Ghi PNG ra cache, tự dựng THREE.Texture theo đúng dạng expo-gl cần
 *      (`image = { data: { localUri }, width, height }`), gắn vào material.
 * Bước 4 hỏng thì cây vẫn hiện (chỉ mất vân) — không kéo sập cảnh.
 */

import { Image } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { fromByteArray, toByteArray } from 'base64-js';
import { TREE_HEIGHT } from './treeFrame';
import { buildGlb, extractEmbeddedImage, splitGlb, stripTextures } from './glb';
import { isFileBacked, type TreeModelDef } from './treeModels';

/** Tệp cache riêng cho từng model → thêm model mới không giẫm lên nhau. */
const glbCachePath = (def: TreeModelDef) => `${FileSystem.cacheDirectory}space3d-${def.id}.glb`;
const texCachePath = (def: TreeModelDef) => `${FileSystem.cacheDirectory}space3d-${def.id}.png`;

/** Đường dẫn file ĐỌC ĐƯỢC của model, qua expo-asset. */
async function uriViaExpoAsset(def: TreeModelDef): Promise<string> {
  const asset = Asset.fromModule(def.source as number);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('expo-asset không trả về uri');
  // Android release: asset nằm trong APK, uri không có scheme → chép ra cache.
  if (!uri.includes(':')) {
    const dest = glbCachePath(def);
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  }
  return uri;
}

/**
 * Dự phòng bằng API LÕI của React Native.
 * expo-asset vốn trông cậy vào plugin metro riêng của Expo (`hashAssetFiles`) —
 * app này là bare RN dùng metro gốc nên không có. `Image.resolveAssetSource`
 * thì luôn hoạt động với mọi asset Metro đã đăng ký qua `assetExts`.
 */
async function uriViaResolveAssetSource(def: TreeModelDef): Promise<string> {
  const src = Image.resolveAssetSource(def.source as number);
  const uri = src?.uri;
  if (!uri) throw new Error('resolveAssetSource không trả về uri');
  const dest = glbCachePath(def);

  if (/^https?:/.test(uri)) {
    // Chế độ dev: model do metro phục vụ qua HTTP → tải về cache mới đọc được.
    const res = await FileSystem.downloadAsync(uri, dest);
    if (res.status !== 200) throw new Error(`Tải model từ metro lỗi HTTP ${res.status}`);
    return res.uri;
  }

  if (!uri.includes(':')) {
    // ── Bản RELEASE (APK/AAB) ────────────────────────────────────────────────
    // Metro nhét .glb vào `res/raw/`, và `resourceIdentifierWithoutScale()` của
    // RN trả về TÊN TÀI NGUYÊN TRẦN, không scheme: "assets_models_tree1".
    // KHÔNG được trả tên đó ra ngoài: `readAsStringAsync(..., base64)` đi qua
    // `getInputStream()` của expo-file-system, hàm này CHỈ nhận file:// · asset://
    // · SAF → scheme null là ném "Unsupported scheme for location".
    // Nhưng `copyAsync` CÓ nhánh riêng cho scheme null (`openResourceInputStream`
    // → `resources.openRawResource`) → chép ra cache trước rồi đọc file thật.
    // (Đường dev đi HTTP nên không lộ; bản release thì mọi model đều rơi về cây
    // dự phòng hình nón.)
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  }

  return uri;
}

/** Thử expo-asset trước, hỏng thì lùi về API lõi RN; báo GỘP cả 2 lý do nếu cùng hỏng. */
async function resolveAssetUri(def: TreeModelDef): Promise<string> {
  try {
    return await uriViaExpoAsset(def);
  } catch (first: any) {
    try {
      return await uriViaResolveAssetSource(def);
    } catch (second: any) {
      throw new Error(
        `expo-asset: ${first?.message ?? first} | resolveAssetSource: ${second?.message ?? second}`,
      );
    }
  }
}

/**
 * Dựng THREE.Texture từ PNG đã tách.
 * `image = { data: { localUri } }` + `isDataTexture` là dạng expo-gl nạp ảnh native
 * (không qua DOM Image). flipY=false + SRGB cho đúng quy ước glTF.
 */
async function buildTexture(def: TreeModelDef, png: Uint8Array): Promise<THREE.Texture> {
  const uri = texCachePath(def);
  await FileSystem.writeAsStringAsync(uri, fromByteArray(png), { encoding: 'base64' });

  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject),
  );

  const tex = new THREE.Texture();
  (tex as any).image = { data: { localUri: uri }, width, height };
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Ảnh có thể không phải luỹ thừa 2 → tắt mipmap cho chắc, lọc Linear là đủ nét.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  (tex as any).isDataTexture = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Chuẩn-hoá: thu về đúng chiều cao mong muốn, tâm ngang về trục, gốc chạm đất.
 * Đo bằng hộp bao LÚC CHẠY nên model nào cũng đúng tỉ lệ, bất kể tệp gốc dựng ở
 * đơn-vị nào (bộ hiện có trải từ 0.9 đến 509 đơn-vị chiều cao).
 * `heightScale` cho phép cây bụi / chậu cảnh thấp hơn cây thân gỗ.
 * Nhiều model có `minY < 0` (gốc chìm dưới tâm) → phải kéo theo `box.min.y` chứ
 * không theo tâm, nếu không cây sẽ lơ lửng hoặc lún xuống dưới mặt đất.
 */
function normalize(scene: THREE.Object3D, def: TreeModelDef): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const target = TREE_HEIGHT * (def.heightScale ?? 1);
  const scale = size.y > 0 ? target / size.y : 1;

  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(scene);
  inner.scale.setScalar(scale);
  inner.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  holder.add(inner);
  return holder;
}

/** Màu dự phòng khi chưa/không gắn được vân — xanh lá đủ nổi trên nền tối. */
const FALLBACK_TREE_COLOR = 0x4f8f4a;

export interface TreeTemplate {
  object: THREE.Object3D;
  /** Đã gắn được vân từ PNG nhúng chưa. */
  textured: boolean;
  /** Cảnh báo không chí mạng (vd gắn vân hỏng) — để hiện lên HUD. */
  warning?: string;
}

/** Cache theo id model → mở thêm model mới không đụng gì tới cái đang có. */
const cache = new Map<string, Promise<TreeTemplate>>();

/**
 * Model cây đã chuẩn-hoá, mỗi model nạp 1 lần dùng chung. Mỗi cây chỉ cần `clone()`.
 * Ném lỗi nếu KHÔNG dựng nổi hình học; còn vân hỏng thì vẫn trả về cây (màu trơn).
 */
export function loadTreeTemplate(def: TreeModelDef): Promise<TreeTemplate> {
  if (!isFileBacked(def)) {
    return Promise.reject(new Error(`Model "${def.id}" không có tệp để nạp`));
  }
  const hit = cache.get(def.id);
  if (!hit) {
    const task = (async (): Promise<TreeTemplate> => {
      const uri = await resolveAssetUri(def);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const bytes = toByteArray(base64);
      const raw = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;

      const parts = splitGlb(raw);
      const png = extractEmbeddedImage(parts);

      // Ghi lại vật liệu NÀO đang dùng ảnh, TRƯỚC khi xoá — chỉ những vật liệu đó
      // mới bị mất nguồn màu và cần ta bù lại. Model không có ảnh (vd chậu cây có
      // sẵn màu chậu/đất/lá riêng) phải GIỮ NGUYÊN màu tác giả đặt.
      const allMats: any[] = parts.json.materials ?? [];
      const texturedNames = new Set<string>();
      allMats.forEach((m: any, i: number) => {
        if (m?.pbrMetallicRoughness?.baseColorTexture) texturedNames.add(m.name ?? `__mat${i}`);
      });
      // Vật liệu không đặt tên thì không khớp được theo tên → nếu TẤT CẢ đều dùng
      // ảnh (trường hợp phổ biến nhất) thì áp cho tất, khỏi cần khớp tên.
      const applyToAll = allMats.length > 0 && texturedNames.size === allMats.length;
      const lostTexture = (m: any) => applyToAll || texturedNames.has(m?.name);

      stripTextures(parts.json);
      const stripped = buildGlb(parts.json, parts.bin);

      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
        new GLTFLoader().parse(stripped, '', resolve as never, reject);
      });

      const materials: any[] = [];
      gltf.scene.traverse((o: any) => {
        if (!o.isMesh || !o.material) return;
        materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
      });

      // Màu nền cho vật liệu vừa mất ảnh: nếu vân không nạp/không upload được thì
      // cây vẫn ra màu lá, chứ không thành khối đen tàng hình trên nền tối.
      for (const m of materials) {
        if (lostTexture(m) && m.color) {
          m.color.setHex(FALLBACK_TREE_COLOR);
          m.needsUpdate = true;
        }
      }

      let textured = false;
      let warning: string | undefined;
      if (png) {
        try {
          const tex = await buildTexture(def, png);
          for (const m of materials) {
            if (!lostTexture(m)) continue;
            m.map = tex;
            // map nhân với color → phải trả color về trắng, nếu không vân bị ám xanh.
            if (m.color) m.color.setHex(0xffffff);
            m.needsUpdate = true;
          }
          textured = true;
        } catch (err: any) {
          warning = `Không gắn được vân: ${err?.message ?? err}`;
          console.warn('[space3d]', warning);
        }
      }

      return { object: normalize(gltf.scene, def), textured, warning };
    })().catch((err) => {
      cache.delete(def.id); // cho phép thử lại lần render sau
      throw err;
    });
    cache.set(def.id, task);
    return task;
  }
  return hit;
}
