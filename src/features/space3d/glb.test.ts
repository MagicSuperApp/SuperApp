/// <reference types="node" />
// Test chạy trong jest (môi trường node) nên đọc thẳng tệp .glb THẬT của dự án —
// bắt được cả trường hợp ai đó thay model khác mà quên kiểm.
import fs from 'fs';
import path from 'path';
import {
  CHUNK_BIN, CHUNK_JSON, GLB_MAGIC,
  buildGlb, extractEmbeddedImage, splitGlb, stripTextures,
} from './glb';

const GLB_PATH = path.resolve(__dirname, '../../../assets/models/tree1.glb');

function readTreeGlb(): ArrayBuffer {
  const buf = fs.readFileSync(GLB_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('splitGlb với tree1.glb thật', () => {
  it('tách được JSON và BIN', () => {
    const { json, bin } = splitGlb(readTreeGlb());
    expect(json.asset?.version).toBe('2.0');
    expect(json.meshes?.length).toBeGreaterThan(0);
    expect(bin.length).toBeGreaterThan(0);
  });

  it('model có texture NHÚNG — đúng thứ làm GLTFLoader ném "self is not defined" trên RN', () => {
    const { json } = splitGlb(readTreeGlb());
    expect(json.images?.length).toBeGreaterThan(0);
    expect(json.images[0].bufferView).toBeDefined();
  });

  it('từ chối dữ-liệu không phải GLB', () => {
    expect(() => splitGlb(new ArrayBuffer(4))).toThrow(/quá ngắn/);
    const bad = new ArrayBuffer(16);
    new DataView(bad).setUint32(0, 0x12345678, true);
    expect(() => splitGlb(bad)).toThrow(/magic/);
  });

  it('không đọc lố khi chunk khai báo dài hơn tệp (tệp hỏng)', () => {
    const buf = new ArrayBuffer(24);
    const v = new DataView(buf);
    v.setUint32(0, GLB_MAGIC, true);
    v.setUint32(4, 2, true);
    v.setUint32(8, 24, true);
    v.setUint32(12, 9999, true); // độ dài chunk láo
    v.setUint32(16, CHUNK_JSON, true);
    expect(() => splitGlb(buf)).toThrow(/thiếu chunk JSON/);
  });
});

describe('extractEmbeddedImage', () => {
  it('lấy ra đúng PNG (kiểm bằng magic bytes)', () => {
    const parts = splitGlb(readTreeGlb());
    const png = extractEmbeddedImage(parts);
    expect(png).not.toBeNull();
    expect(png!.length).toBeGreaterThan(100);
    // \x89 P N G
    expect(Array.from(png!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('trả null khi không có ảnh nhúng', () => {
    expect(extractEmbeddedImage({ json: {}, bin: new Uint8Array(0) })).toBeNull();
    expect(extractEmbeddedImage({ json: { images: [{ uri: 'x.png' }] }, bin: new Uint8Array(0) })).toBeNull();
  });

  it('trả BẢN SAO — sửa kết quả không đụng vào bin gốc', () => {
    const parts = splitGlb(readTreeGlb());
    const png = extractEmbeddedImage(parts)!;
    const before = parts.bin[png.byteOffset ?? 0];
    png[0] = 0;
    expect(parts.bin[0]).toBe(before);
  });
});

describe('stripTextures', () => {
  it('xoá sạch mọi tham chiếu ảnh', () => {
    const { json } = splitGlb(readTreeGlb());
    expect(json.images).toBeDefined();
    stripTextures(json);
    expect(json.images).toBeUndefined();
    expect(json.textures).toBeUndefined();
    expect(json.samplers).toBeUndefined();
    for (const m of json.materials ?? []) {
      expect(m.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
      expect(m.normalTexture).toBeUndefined();
    }
  });

  it('GIỮ NGUYÊN hình học và màu gốc của vật liệu', () => {
    const { json } = splitGlb(readTreeGlb());
    const meshesBefore = JSON.stringify(json.meshes);
    const baseColor = json.materials[0].pbrMetallicRoughness.baseColorFactor;
    stripTextures(json);
    expect(JSON.stringify(json.meshes)).toBe(meshesBefore);
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual(baseColor);
  });

  it('không nổ với JSON không có materials', () => {
    expect(() => stripTextures({})).not.toThrow();
  });
});

describe('buildGlb', () => {
  it('đi vòng split → build → split giữ nguyên nội dung', () => {
    const parts = splitGlb(readTreeGlb());
    const again = splitGlb(buildGlb(parts.json, parts.bin));
    expect(again.json).toEqual(parts.json);
    expect(Array.from(again.bin)).toEqual(Array.from(parts.bin));
  });

  it('chunk luôn căn 4 byte và header khai đúng tổng độ dài', () => {
    const parts = splitGlb(readTreeGlb());
    stripTextures(parts.json);
    const out = buildGlb(parts.json, parts.bin);
    expect(out.byteLength % 4).toBe(0);
    const v = new DataView(out);
    expect(v.getUint32(0, true)).toBe(GLB_MAGIC);
    expect(v.getUint32(4, true)).toBe(2);
    expect(v.getUint32(8, true)).toBe(out.byteLength);
    expect(v.getUint32(16, true)).toBe(CHUNK_JSON);
    // chunk BIN nằm ngay sau chunk JSON
    const jsonLen = v.getUint32(12, true);
    expect(v.getUint32(20 + jsonLen + 4, true)).toBe(CHUNK_BIN);
  });

  it('GLB sau khi tách texture NHỎ HƠN bản gốc nhưng vẫn còn BIN', () => {
    const raw = readTreeGlb();
    const parts = splitGlb(raw);
    stripTextures(parts.json);
    const out = buildGlb(parts.json, parts.bin);
    expect(out.byteLength).toBeLessThan(raw.byteLength);
    expect(splitGlb(out).bin.length).toBe(parts.bin.length);
  });

  it('không có BIN thì chỉ ghi mỗi chunk JSON', () => {
    const out = buildGlb({ asset: { version: '2.0' } }, new Uint8Array(0));
    const back = splitGlb(out);
    expect(back.json.asset.version).toBe('2.0');
    expect(back.bin.length).toBe(0);
  });
});
