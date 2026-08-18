/**
 * saveQrImage — đưa tấm QR ra khỏi app dưới dạng ẢNH.
 *
 * ══ BẢN TRƯỚC HỎNG, VÀ HỎNG THEO KIỂU TỆ NHẤT ═════════════════════════════
 * Bản đầu gọi `Share.share({ url: dataUrl, message: code })` của React Native.
 * Trên Android, `Share` **vứt bỏ `url`** — nó chỉ dựng `{ title, message }` rồi
 * gửi đi (`react-native/Libraries/Share/Share.js:112-115`, đã đọc để xác nhận).
 * Kết quả: người dùng bấm "Tải ảnh mã QR" và nhận được **mã dạng chữ**.
 *
 * Đây là loại hỏng tệ nhất: nó KHÔNG báo lỗi. Một việc khác đã xảy ra và báo
 * thành công. Nên luật của tệp này bây giờ là: **không có đường lùi nào gửi chữ
 * thay cho ảnh.** Không xuất được ảnh thì nói không xuất được ảnh.
 *
 * ══ ĐƯỜNG ĐÚNG ════════════════════════════════════════════════════════════
 * `expo-sharing` chia sẻ được TỆP trên cả hai nền: trên Android nó tự dựng
 * `content://` qua FileProvider của chính nó — thứ mà `Share` của RN không làm
 * và app này cũng chưa khai FileProvider nào.
 *
 * Đường đi: PNG base64 → ghi tệp tạm → `Sharing.shareAsync(uri)`.
 *
 * Rơi về `Share` của RN CHỈ trên iOS, và chỉ với `url` là `file://` — ở iOS
 * nhánh đó có nhận `url` thật (cùng tệp `Share.js`, nhánh `ios`). Trên Android
 * không có đường lùi nào, và đó là câu trả lời đúng chứ không phải thiếu sót.
 *
 * ══ CÒN THIẾU, NÓI THẲNG ══════════════════════════════════════════════════
 * Không có nút LƯU THẲNG vào thư viện ảnh — cần `expo-media-library`. Bảng chia
 * sẻ có mục *Lưu ảnh* của hệ điều hành, và với một cái tem cần đem đi in thì
 * "gửi cho thợ in" còn hay dùng hơn.
 *
 * `expo-sharing` là mô-đun NATIVE: máy chưa dựng lại thì `require` ném. Bắt lỗi
 * đó và trả `unavailable` — màn hình nói "cần cập nhật ứng dụng", KHÔNG lặng lẽ
 * gửi thứ khác.
 */

import { Platform, Share } from 'react-native';

export type SaveQrResult =
  | { ok: true }
  /** Người dùng bấm huỷ ở bảng chia sẻ — KHÔNG phải lỗi, đừng báo đỏ. */
  | { ok: false; reason: 'dismissed' }
  /** Chưa vẽ xong mã nên không có gì để xuất. */
  | { ok: false; reason: 'no_image' }
  /** Máy chưa có mô-đun chia sẻ tệp (chưa dựng lại app sau khi thêm gói). */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed'; detail: string };

/** Bỏ ký tự không hợp lệ trong tên tệp. Mã `ORI-…` vốn đã sạch, đây là chốt chặn. */
export function fileNameFor(code: string): string {
  const safe = (code ?? '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return `${safe || 'ma-truy-xuat'}.png`;
}

/** Nạp `expo-sharing` kiểu mềm. `null` = máy chưa có mô-đun native. */
function loadSharing(): {
  isAvailableAsync?: () => Promise<boolean>;
  shareAsync?: (url: string, opts?: Record<string, unknown>) => Promise<void>;
} | null {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

/**
 * Ghi PNG ra tệp tạm rồi trả URI. `null` khi không ghi được.
 *
 * Bắt buộc phải có tệp: cả `expo-sharing` lẫn nhánh iOS của `Share` đều chia sẻ
 * TỆP, không chia sẻ chuỗi `data:`.
 */
async function writeTempPng(base64: string, fileName: string): Promise<string | null> {
  try {
    const FileSystem = require('expo-file-system/legacy');
    const dir: string | null = FileSystem.cacheDirectory ?? null;
    if (!dir) return null;
    const uri = `${dir}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    return uri;
  } catch {
    return null;
  }
}

/**
 * Mở bảng chia sẻ cho tấm QR. KHÔNG ném.
 *
 * @param base64  PNG đã mã hoá base64, KHÔNG kèm tiền tố `data:`
 * @param code    mã `ORI-…` — dùng đặt tên tệp
 */
export async function shareQrImage(
  base64: string | null,
  code: string,
): Promise<SaveQrResult> {
  if (!base64) return { ok: false, reason: 'no_image' };

  const fileName = fileNameFor(code);
  const uri = await writeTempPng(base64, fileName);
  // Không ghi được tệp thì không có gì để chia sẻ. Tuyệt đối KHÔNG lùi về gửi
  // chữ — xem đoạn đầu tệp.
  if (!uri) return { ok: false, reason: 'unavailable' };

  const sharing = loadSharing();
  if (sharing?.shareAsync) {
    try {
      const ready = sharing.isAvailableAsync ? await sharing.isAvailableAsync() : true;
      if (ready) {
        await sharing.shareAsync(uri, {
          mimeType: 'image/png',
          // `UTI` cho iOS, `dialogTitle` cho Android — khai cả hai, mỗi nền đọc
          // phần của mình.
          UTI: 'public.png',
          dialogTitle: fileName,
        });
        // `shareAsync` không cho biết người dùng có huỷ hay không. Coi như xong;
        // huỷ thì cũng chẳng có gì để dọn.
        return { ok: true };
      }
    } catch (err: unknown) {
      return { ok: false, reason: 'failed', detail: String(err) };
    }
  }

  // Đường lùi CHỈ cho iOS: ở đó `Share` của RN thật sự nhận `url` là `file://`.
  // Android không có đường lùi — `Share` bên đó vứt `url`, và gửi chữ thay ảnh
  // là đúng cái lỗi tệp này sinh ra để sửa.
  if (Platform.OS === 'ios') {
    try {
      const res = await Share.share({ url: uri, title: fileName }, { subject: code });
      return res.action === Share.dismissedAction
        ? { ok: false, reason: 'dismissed' }
        : { ok: true };
    } catch (err: unknown) {
      return { ok: false, reason: 'failed', detail: String(err) };
    }
  }

  return { ok: false, reason: 'unavailable' };
}
