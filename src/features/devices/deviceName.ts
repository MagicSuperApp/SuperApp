/**
 * Luật đặt tên thiết bị — bản GƯƠNG của luật máy chủ.
 *
 * ── Vì sao lặp lại luật ở máy khách ──────────────────────────────────────────
 * Không phải để "đỡ gánh cho máy chủ" — máy chủ vẫn kiểm lại đủ, và nó mới là
 * bên có tiếng nói cuối. Lặp ở đây vì lỗi 3012 quay về là một mã số, không nói
 * được cho người dùng biết KÝ TỰ NÀO trong tên họ vừa gõ là thứ bị chặn. Kiểm
 * tại chỗ thì con trỏ còn ở ô nhập và ta chỉ được đúng chỗ hỏng.
 *
 * ── Điều kiện để bản gương này còn đúng ──────────────────────────────────────
 * Nguồn: `KeyServiceImpl.validateDeviceName` + `isLayoutBreaking`
 * (PhoenixKey-Database). Ba luật, theo đúng thứ tự máy chủ áp:
 *
 *   1. cắt hai đầu (`trim`) TRƯỚC mọi phép đo — nên "   " là rỗng, không phải 3
 *   2. rỗng sau khi cắt → chặn; dài quá 100 → chặn
 *   3. chứa ký tự phá bố cục → chặn, kèm vị trí
 *
 * Luật 3 mới là luật đáng chép, và cũng là luật dễ chép SAI nhất. Nó không phải
 * "cấm ký tự lạ" — đây là danh sách các ký tự VÔ HÌNH nhưng ĐỔI ĐƯỢC cách chuỗi
 * hiển thị: U+202A…U+202E và U+2066…U+2069 đảo/cách ly chiều đọc, nên một tên
 * gài chúng vào có thể hiện ra trên màn của người khác thành một chuỗi hoàn toàn
 * khác thứ đã lưu. Trong một danh sách mà người ta nhìn vào để quyết định "đá máy
 * nào ra", một cái tên nói dối được là một lỗ thật.
 *
 * Nếu máy chủ nới hay siết danh sách này, bản gương phải đi theo. Sai lệch chỉ
 * gây phiền chứ không gây thủng (máy chủ vẫn chặn) — nhưng là phiền câm: người
 * dùng bị từ chối một cái tên mà máy chủ sẵn sàng nhận, và không ai biết vì sao.
 */

/** Giới hạn của máy chủ (`DEVICE_NAME_MAX_LEN`, cũng là `@Size(max=100)`). */
export const DEVICE_NAME_MAX_LEN = 100;

/**
 * Ký tự vô hình / đổi chiều đọc mà máy chủ chặn.
 *
 * Cố ý viết bằng khoảng mã đúng như `isLayoutBreaking`, KHÔNG gộp thành một
 * khoảng lớn cho gọn — gộp lại thì lần đối chiếu sau với mã Java sẽ phải đọc
 * hiểu thay vì đọc so.
 */
const isLayoutBreaking = (c: string): boolean => {
  const u = c.codePointAt(0)!;
  // `Character.isISOControl`: C0 và C1.
  if (u <= 0x1f || (u >= 0x7f && u <= 0x9f)) return true;
  return (
    u === 0x00ad ||                    // gạch nối mềm
    (u >= 0x200b && u <= 0x200f) ||    // ZWSP…RLM
    u === 0x2028 || u === 0x2029 ||    // ngắt dòng / ngắt đoạn
    (u >= 0x202a && u <= 0x202e) ||    // đảo chiều đọc
    (u >= 0x2060 && u <= 0x2064) ||    // word-joiner + vô hình
    (u >= 0x2066 && u <= 0x2069) ||    // cách ly chiều đọc
    u === 0xfeff                       // BOM / ZWNBSP
  );
};

export type DeviceNameCheck =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * Cắt, đo, soi tên máy theo đúng thứ tự máy chủ làm.
 *
 * Trả về chuỗi ĐÃ CẮT khi hợp lệ — nơi gọi phải gửi đúng giá trị này đi, đừng
 * gửi lại chuỗi thô, để cái người dùng thấy được duyệt cũng là cái được lưu.
 */
export const checkDeviceName = (raw: string): DeviceNameCheck => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Tên máy không được để trống.' };
  }
  if (trimmed.length > DEVICE_NAME_MAX_LEN) {
    return {
      ok: false,
      message: `Tên máy dài quá ${DEVICE_NAME_MAX_LEN} ký tự (đang ${trimmed.length}).`,
    };
  }
  for (const c of trimmed) {
    if (isLayoutBreaking(c)) {
      return {
        ok: false,
        message: 'Tên máy chứa ký tự ẩn không hiển thị được. Hãy gõ lại bằng bàn phím thay vì dán.',
      };
    }
  }
  return { ok: true, value: trimmed };
};
