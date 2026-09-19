/**
 * Chọn ảnh CÓ SẴN trong thư viện để nhận diện cây.
 *
 * Vì sao tách khỏi màn: hai thứ ở đây là ràng buộc, không phải chi tiết dựng màn,
 * và cả hai đều thuộc loại hỏng-mà-không-kêu nếu để lẫn trong JSX.
 *
 * ── 1. Tuỳ chọn ảnh là một CỔNG QUYỀN RIÊNG TƯ, không phải một mức nén ─────────
 *
 * Đo trong `node_modules/react-native-image-picker` hôm nay:
 *
 *   · Android — `Utils.java:218` gọi `shouldResizeImage(...)`. Hàm đó
 *     (`Utils.java:305-315`) trả `false` **chỉ khi `quality == 100`**; trả `false`
 *     thì `Utils.java:223` `return uri` — tệp GỐC đi thẳng ra, nguyên EXIF.
 *     Trả `true` thì ảnh bị `BitmapFactory.decodeStream` rồi ghi lại, và chú thích
 *     ngay trên đó nói đúng điều đang xảy ra: *"When decoding a jpg to bitmap all
 *     exif meta data will be lost"* (`Utils.java:210`). Chỉ TAG_ORIENTATION được
 *     chép lại.
 *   · iOS — `ImagePickerManager.mm:168-178`: nhánh co ảnh dựng lại tệp bằng
 *     `UIImageJPEGRepresentation(newImage, quality)`. `UIImage` không mang EXIF,
 *     nên tệp ghi ra không có GPS, không có mốc giờ, không có tên máy. Nhánh
 *     KHÔNG co thì `data` là `NSData` đọc nguyên từ tệp gốc (`:460`) — đủ EXIF.
 *
 * Nghĩa là: **hôm nay không ảnh nào của app mang GPS ra ngoài, nhưng đó là hệ quả
 * phụ của một con số nén, không phải một cái cổng.** Đặt `quality: 1` và bỏ
 * `maxWidth`/`maxHeight` là toạ độ chính xác tới mét của vườn nhà người ta đi
 * theo tấm ảnh, và không phép kiểm nào đỏ.
 *
 * Một tấm ảnh THƯ VIỆN nguy hiểm hơn một tấm vừa chụp ở đúng chỗ này: nó có thể
 * chụp ở đâu, lúc nào cũng được — người gửi không còn ở hiện trường để mà biết
 * mình đang gửi toạ độ nào đi.
 *
 * Nên tuỳ chọn nằm ở đây, có tên, và có bài kiểm canh — `LIBRARY_PICK_OPTIONS`.
 *
 * ── 2. Ảnh thư viện KHÔNG có siêu dữ liệu chụp, và đó là điều phải NÓI ra ──────
 *
 * Lối chụp dẫn trên máy có tầng native gửi kèm `regions` (vùng cây mỗi khung) và
 * `captures` (hướng máy lúc bấm). Ảnh thư viện không có hai thứ đó. Hợp đồng đã
 * lo sẵn ca này — `runIdentify` ghi *"Bỏ trống ⟹ không gửi trường nào, máy chủ
 * embed cả khung như trước"* — nên đường đúng là **không gửi gì cả**, KHÔNG phải
 * gửi một mảng nửa vời khớp sai theo chỉ số.
 */

import type { ImageLibraryOptions } from 'react-native-image-picker';

/**
 * Tuỳ chọn cho lượt chọn ảnh thư viện.
 *
 * `quality` phải < 1 và `maxWidth`/`maxHeight` phải khác 0 — xem khối trên. Số
 * 1600 lấy bằng với `FruitListScreen.tsx:210` để hai đường không cho ra hai cỡ
 * ảnh khác nhau trên cùng một máy chủ.
 *
 * `selectionLimit: 0` = không giới hạn: một lượt nhận diện cần nhiều góc, và bắt
 * người ta mở lại bộ chọn từng tấm là chỗ người ta bỏ cuộc.
 */
export const LIBRARY_PICK_OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 1600,
  maxHeight: 1600,
  selectionLimit: 0,
};

/**
 * Tuỳ chọn có thật sự làm bộ chọn dựng lại tệp không.
 *
 * Đây là phép đo của điều kiện ở `Utils.java:305-315`, viết lại bằng TypeScript
 * để ghim được. Trả `false` nghĩa là tệp gốc đi thẳng ra — nguyên EXIF.
 */
export const reEncodesAwayMetadata = (o: {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}): boolean => {
  const q = o.quality ?? 1;
  // Bộ chọn nhận `quality` 0..1 rồi nhân 100 xuống tầng native.
  if (q < 1) return true;
  return (o.maxWidth ?? 0) > 0 && (o.maxHeight ?? 0) > 0;
};

export interface PickedAsset {
  uri?: string | null;
}

export interface LibraryPickOutcome {
  /** Đường dẫn ảnh dùng được, đã lọc phần tử không có `uri`. */
  images: string[];
  /**
   * Vì sao KHÔNG chạy nhận diện được. `null` = chạy được.
   *
   * Ba trạng thái tách riêng vì chúng dẫn người dùng đi ba đường khác nhau, và
   * gộp chúng thành một câu chung là đúng thứ `Forall §Cái vỏ im lặng` cấm:
   * người bấm Huỷ không cần thấy chữ đỏ nào, còn người chọn thiếu ảnh cần biết
   * còn thiếu MẤY tấm.
   */
  blocked: null | 'cancelled' | 'failed' | 'too-few';
  /** Còn thiếu mấy tấm — chỉ có nghĩa khi `blocked === 'too-few'`. */
  missing?: number;
}

/**
 * Đọc kết quả bộ chọn thành một quyết định.
 *
 * Tách ra vì nhánh `didCancel` và nhánh `errorCode` KHÔNG được gộp: huỷ là một
 * hành động bình thường của người dùng, lỗi là một sự cố. Bản trước ở các màn
 * khác gộp chúng lại và hiện chữ đỏ cho người vừa bấm Huỷ.
 */
export const readLibraryPick = (
  res: {
    didCancel?: boolean;
    errorCode?: string;
    assets?: PickedAsset[] | null;
  },
  minimum: number,
): LibraryPickOutcome => {
  if (res.didCancel) return { images: [], blocked: 'cancelled' };
  if (res.errorCode) return { images: [], blocked: 'failed' };

  const images = (res.assets ?? [])
    .map(a => a?.uri)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  if (images.length < minimum) {
    return { images, blocked: 'too-few', missing: minimum - images.length };
  }
  return { images, blocked: null };
};
