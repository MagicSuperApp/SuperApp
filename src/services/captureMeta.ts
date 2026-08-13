/**
 * captureMeta — khối siêu dữ liệu đi kèm ẢNH QUẢ, trường form `capture`.
 *
 * VÌ SAO CÓ TỆP NÀY. Ảnh quả hiện gửi lên trần trụi: không EXIF, và đã bị co về
 * tối đa 1600 px trước khi rời máy (`FruitListScreen.tsx:134`). Với một tấm ảnh
 * như thế, kích thước thật của quả KHÔNG khôi phục được — không phải khó, là
 * không có thông tin. OriLife đo trên kho đang chạy (51 quả · 112 góc · 20 cây):
 * bán trục lớn theo pixel của CÙNG MỘT QUẢ lệch trung vị 1,33×, tệ nhất 2,12×
 * ⇒ coi pixel là kích thước thật thì khối lượng lệch tới 9× giữa hai lần chụp.
 *
 * Mọi khâu khác trong đường đo khối lượng đều làm lại được ở đợt sau — thuật
 * toán, hiệu chuẩn cân, mô hình phân đoạn. Riêng ảnh chụp thiếu thông số ống
 * kính thì VĨNH VIỄN là ảnh không đo được. Nên khối này phải đi cùng ảnh ngay
 * lúc chụp, không phải "thêm sau".
 *
 * ⚠ APP HÔM NAY CHƯA LẤY ĐƯỢC VẾ QUAN TRỌNG NHẤT. OriLife xếp `focal_px` (hoặc
 * `focal_mm` + `sensor_w_mm`) là ưu tiên 1 — "không có cái này thì mọi thứ còn
 * lại vô nghĩa". Đo trên bộ chọn ảnh đang dùng:
 *
 *   node_modules/react-native-image-picker/lib/typescript/types.d.ts:23-35
 *   interface Asset { base64 uri width height originalPath fileSize type
 *                     fileName duration bitrate timestamp id }
 *
 * KHÔNG có `exif`, không tiêu cự, không tên ống kính, không mức thu-phóng. Nên
 * `focal_*`, `sensor_w_mm`, `lens_id`, `zoom`, `depth_*` bỏ trống ở đây là
 * ĐÚNG HIỆN TRẠNG, không phải quên nối. Muốn có chúng phải đọc EXIF từ
 * `originalPath` bằng một gói native — việc đó không dựng-và-kiểm kịp trong
 * một tối, và OriLife đã cảnh báo đừng đụng luồng chụp ngay trước đợt thực địa.
 *
 * Vế cứu được: `device_model` + `orig_w/orig_h` cho phép tra ngược tiêu cự theo
 * bảng hiệu chuẩn từng dòng máy SAU này — với điều kiện đợt chụp dùng ống kính
 * mặc định ở mức thu-phóng 1×. Máy tự đổi sang ống góc rộng khi lại gần dưới
 * ~20 cm mà app không được hỏi ý kiến, nên điều kiện đó phải do người cầm máy
 * giữ, app không kiểm được.
 *
 * QUY TẮC: thiếu trường nào thì BỎ TRỐNG trường đó. Không đoán, không điền mặc
 * định. Máy chủ ghi thiếu thì ghi thiếu; một số bịa đi vào kho đo lường thì
 * không ai tách ra được nữa.
 */

import { Image, Platform } from 'react-native';
import { getModel, getSystemVersion } from 'react-native-device-info';

/** Khối `capture` — mọi trường tuỳ chọn, đúng hợp đồng OriLife 13/08. */
export interface CaptureMeta {
  /** Kích thước tấm ảnh THẬT SỰ gửi lên (sau khi co). */
  image_w?: number;
  image_h?: number;
  /** Trước khi co — để biết tỉ lệ co. */
  orig_w?: number;
  orig_h?: number;
  heading?: number;
  pitch?: number;
  device_model?: string;
  os_version?: string;
}

/** Nguồn ảnh do bộ chọn trả về (phần tệp này cần). */
export interface CaptureAssetLike {
  width?: number;
  height?: number;
  /** Đường dẫn tệp GỐC, trước khi co. Bộ chọn có trả, luồng cũ chưa dùng tới. */
  originalPath?: string;
}

/** Cầu đọc la-bàn của luồng chụp CÂY — dùng lại, không dựng cái thứ hai. */
export interface HeadingSource {
  getCurrentHeading(): Promise<{ heading: number | null; pitch: number | null }>;
}

const isFinitePositive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Đọc kích thước GỐC từ `originalPath`. Trả `undefined` khi không đọc được —
 * không rơi về `image_w/h`, vì hai số bằng nhau sẽ bị đọc thành "ảnh không bị
 * co", tức một khẳng định sai về tỉ lệ co.
 */
export async function readOriginalSize(
  originalPath?: string,
): Promise<{ w: number; h: number } | undefined> {
  if (!originalPath) return undefined;
  const uri = /^[a-z]+:\/\//i.test(originalPath) ? originalPath : `file://${originalPath}`;
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve(isFinitePositive(w) && isFinitePositive(h) ? { w, h } : undefined),
      () => resolve(undefined),
    );
  });
}

/**
 * Dựng khối `capture` NGAY LÚC CHỤP.
 *
 * Gọi ở màn chụp chứ không ở lúc tải lên: `heading`/`pitch` là số đo tại thời
 * điểm bấm máy: đọc lúc tải lên thì người ta đã xoay máy đi rồi, và một góc sai
 * còn tệ hơn không có góc — không có thì biết là không có.
 */
export async function buildCaptureMeta(
  asset: CaptureAssetLike,
  headingSource?: HeadingSource,
): Promise<CaptureMeta> {
  const meta: CaptureMeta = {};

  if (isFinitePositive(asset.width)) meta.image_w = asset.width;
  if (isFinitePositive(asset.height)) meta.image_h = asset.height;

  const orig = await readOriginalSize(asset.originalPath);
  if (orig) {
    meta.orig_w = orig.w;
    meta.orig_h = orig.h;
  }

  if (headingSource) {
    try {
      const h = await headingSource.getCurrentHeading();
      if (typeof h?.heading === 'number' && Number.isFinite(h.heading)) meta.heading = h.heading;
      if (typeof h?.pitch === 'number' && Number.isFinite(h.pitch)) meta.pitch = h.pitch;
    } catch {
      // Cầu la-bàn vắng hoặc từ chối — bỏ trống, đúng quy tắc "không đoán".
    }
  }

  try {
    const model = getModel();
    if (model && model !== 'unknown') meta.device_model = model;
    const os = getSystemVersion();
    if (os && os !== 'unknown') meta.os_version = `${Platform.OS} ${os}`;
  } catch {
    // device-info vắng ở môi trường kiểm — bỏ trống.
  }

  return meta;
}

/**
 * Chuỗi hoá để nhét vào form. Khối RỖNG trả `undefined` — gửi `"{}"` lên là
 * dựng một bản ghi trông như đã đo mà không có số nào trong đó.
 */
export function serializeCaptureMeta(meta: CaptureMeta): string | undefined {
  const keys = Object.keys(meta) as (keyof CaptureMeta)[];
  if (keys.every((k) => meta[k] === undefined)) return undefined;
  return JSON.stringify(meta);
}
