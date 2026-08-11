/// <reference types="node" />
// ^ CHỈ để lấy KHAI BÁO KIỂU của TextDecoder/TextEncoder (tsconfig dự án đặt
//   types: ["jest"] nên không có sẵn). Phần CHẠY THẬT do polyfill bên dưới lo:
//   Hermes KHÔNG có hai lớp này ("Property 'TextDecoder' doesn't exist").

import { installTextCodecPolyfill } from './textCodec';

// Cài NGAY khi nạp module: cả file này lẫn `GLTFLoader.parse()` của three đều gọi
// `new TextDecoder()`. Đặt ở đây (module thấp nhất trong chuỗi) để mọi nơi dùng
// glb/treeAsset đều đã có sẵn, không phụ thuộc thứ tự import của nơi gọi.
installTextCodecPolyfill();

/**
 * space3d/glb — thao tác NHỊ PHÂN trên tệp .glb (không phụ thuộc three/RN/expo).
 *
 * Mục đích: gỡ TEXTURE NHÚNG khỏi GLB trước khi đưa cho `GLTFLoader.parse()`.
 * Lý do: three nạp ảnh nhúng bằng `const URL = self.URL || self.webkitURL` —
 * `self` là global của TRÌNH DUYỆT, React Native không có → parse ném
 * "self is not defined" và không cây nào hiện. Tách ảnh ra, nạp texture bằng
 * đường của expo-gl (xem treeAsset.ts), hình học vẫn nguyên vẹn.
 *
 * Cấu trúc GLB (glTF 2.0 nhị phân):
 *   header 12B : magic 'glTF' | version | tổng độ dài
 *   chunk      : độ dài (4B) | loại (4B) | dữ liệu (đệm cho chẵn 4 byte)
 *                JSON đệm bằng dấu cách 0x20, BIN đệm bằng 0x00.
 *
 * File THUẦN TÍNH → test được bằng jest.
 */

export const GLB_MAGIC = 0x46546c67; // 'glTF'
export const CHUNK_JSON = 0x4e4f534a; // 'JSON'
export const CHUNK_BIN = 0x004e4942; // 'BIN\0'

export interface GlbParts {
  /** Phần mô tả cảnh (đã JSON.parse). */
  json: any;
  /** Phần dữ-liệu nhị phân (đỉnh, chỉ số, ảnh nhúng…). */
  bin: Uint8Array;
}

const pad4 = (n: number) => (4 - (n % 4)) % 4;

/** Tách GLB thành chunk JSON + chunk BIN. Ném lỗi nếu tệp không hợp lệ. */
export function splitGlb(buffer: ArrayBuffer): GlbParts {
  if (buffer.byteLength < 12) throw new Error('GLB quá ngắn');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Không phải tệp GLB (sai magic)');

  const total = Math.min(view.getUint32(8, true), buffer.byteLength);
  let offset = 12;
  let json: any = null;
  let bin = new Uint8Array(0);

  while (offset + 8 <= total) {
    const len = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + len > total) break; // chunk khai báo dài hơn tệp → bỏ, tránh đọc lố
    if (type === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    } else if (type === CHUNK_BIN) {
      bin = new Uint8Array(buffer, start, len);
    }
    offset = start + len + pad4(len);
  }

  if (!json) throw new Error('GLB thiếu chunk JSON');
  return { json, bin };
}

/** Ghép lại GLB từ JSON + BIN, đệm 4 byte đúng chuẩn. */
export function buildGlb(json: any, bin: Uint8Array): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = jsonBytes.length + pad4(jsonBytes.length);
  const hasBin = bin.length > 0;
  const binLen = bin.length + pad4(bin.length);
  const total = 12 + 8 + jsonLen + (hasBin ? 8 + binLen : 0);

  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  view.setUint32(12, jsonLen, true);
  view.setUint32(16, CHUNK_JSON, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen); // JSON đệm dấu cách

  if (hasBin) {
    const at = 20 + jsonLen;
    view.setUint32(at, binLen, true);
    view.setUint32(at + 4, CHUNK_BIN, true);
    bytes.set(bin, at + 8); // phần đệm vốn đã là 0
  }
  return out;
}

/** Ảnh nhúng đầu tiên (bản SAO, không giữ tham chiếu vào bin gốc). null nếu không có. */
export function extractEmbeddedImage(parts: GlbParts): Uint8Array | null {
  const img = parts.json.images?.[0];
  if (!img || img.bufferView == null) return null;
  const bv = parts.json.bufferViews?.[img.bufferView];
  if (!bv) return null;
  const start = bv.byteOffset ?? 0;
  return parts.bin.slice(start, start + bv.byteLength);
}

/** Xoá mọi tham chiếu ảnh khỏi JSON (sửa TẠI CHỖ). */
export function stripTextures(json: any): void {
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
  }
}
