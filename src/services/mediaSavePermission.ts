// services/mediaSavePermission.ts
//
// `saveToPhotos: true` KHÔNG miễn phí trên Android cũ — nó có thể CHẶN camera mở.
//
// react-native-image-picker (8.2.1) làm thế này trước khi mở camera
// (`ImagePickerModuleImpl.java`):
//
//   if (options.saveToPhotos && Build.VERSION.SDK_INT <= P && !hasPermission(activity)) {
//       callback.invoke(getErrorMap(errPermission, null));
//       return;                       // camera KHÔNG mở
//   }
//
// và `hasPermission` chỉ nhìn `WRITE_EXTERNAL_STORAGE` **đã được cấp lúc chạy** —
// khai trong manifest là chưa đủ. `minSdkVersion = 26` nên máy API 26/27/28
// (Android 8/8.1/9 — đúng phân khúc máy rẻ của đội thực địa) là máy hợp lệ.
// Nếu không xin quyền đó, mọi đường thu bằng chứng đều chết với thông báo
// "Không mở được camera. Kiểm tra quyền." mà vào Cài đặt cũng không có mục nào
// để bật, vì app chưa từng xin.
//
// Từ Android 10 (API 29) trở lên MediaStore không cần quyền này nữa → không hỏi.
//
// NGUYÊN TẮC: thiếu quyền thì HẠ XUỐNG `saveToPhotos: false` (vẫn quay được, vẫn
// gửi được) — TUYỆT ĐỐI không để mất luôn cả đường quay. Mất bản trong cuộn ảnh là
// mất một lớp đỡ; mất camera là mất cả buổi đi vườn.
import { PermissionsAndroid, Platform } from 'react-native';

/** API cuối cùng mà picker còn đòi WRITE_EXTERNAL_STORAGE cho `saveToPhotos`. */
const LAST_LEGACY_WRITE_API = 28;

/**
 * Xin quyền ghi thư viện (chỉ Android ≤ 28). Trả về có được lưu vào cuộn ảnh không.
 * Không ném: mọi lỗi đều quy về `false` để nơi gọi hạ cấp chứ không chết.
 */
export async function canSaveToPhotos(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version > LAST_LEGACY_WRITE_API) return true;
  try {
    const perm = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
    if (await PermissionsAndroid.check(perm)) return true;
    const res = await PermissionsAndroid.request(perm, {
      title: 'Giữ bản gốc trong máy',
      message:
        'Cho phép lưu clip/ảnh vừa quay vào thư viện của máy, để bạn còn một bản ' +
        'sau khi đã gửi lên hệ thống.',
      buttonPositive: 'Cho phép',
      buttonNegative: 'Để sau',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Trả về bản sao tuỳ-chọn picker với `saveToPhotos` đã CHỐT theo quyền thật.
 * Dùng ngay trước mỗi `launchCamera`:
 *
 *   imagePicker.launchCamera(await withPhotoSave(VIDEO_OPTIONS), cb)
 */
export async function withPhotoSave<T extends { saveToPhotos?: boolean }>(opts: T): Promise<T> {
  if (!opts.saveToPhotos) return opts;
  return { ...opts, saveToPhotos: await canSaveToPhotos() };
}
