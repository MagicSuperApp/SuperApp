/**
 * prepareImage — co tấm ảnh vừa chụp cho lọt trần 2MB của `/api/fruit/lookup`.
 *
 * ── Vì sao KHÔNG bỏ qua được bước này ───────────────────────────────────────
 * `react-native-camera-kit` chụp ở ĐỘ PHÂN GIẢI TỐI ĐA và không có tham số nào
 * hạ nó xuống: `ImageCapture.Builder()` chỉ đặt tỉ lệ khung, không đặt độ phân
 * giải (`CKCamera.kt:343-351`), và `capture()` phía JS không nhận tuỳ chọn
 * (`types.d.ts` — `capture: () => Promise<CaptureData>`). Máy 12MP cho ra tấm
 * JPEG 2,5–5MB. Tức là **phần lớn** máy sẽ vượt trần nếu gửi thẳng.
 *
 * ── Cách co, và vì sao là một cái THANG chứ không một lần ───────────────────
 * Ảnh cùng số điểm ảnh nhưng khác nội dung thì nặng khác nhau rất xa: một tán lá
 * rậm nén tệ hơn một quả trên nền trời tới vài lần. Nên không có một cặp
 * (cạnh, mức nén) nào đúng cho mọi tấm. Thang dưới thử từ nét nhất xuống, dừng
 * ngay khi lọt trần — tấm dễ nén giữ được độ nét cao, tấm khó nén vẫn qua được
 * cửa thay vì bị từ chối.
 *
 * Không hạ dưới bậc cuối: dưới đó thì chính cái ta đang gửi đi — vân vỏ quả —
 * bị nén nát, và một tấm ảnh lọt trần mà máy chủ không đọc nổi thì tệ hơn một
 * tấm bị từ chối, vì nó trả về "không tìm thấy quả nào" và người dùng tưởng quả
 * của mình chưa từng được đăng ký.
 *
 * ── CẮT VỀ Ô VUÔNG NGƯỜI DÙNG THẤY ─────────────────────────────────────────
 * Khung ngắm trên màn là ô VUÔNG, nhưng `capture()` trả về TRỌN khung máy ảnh —
 * 4:3. Tức tấm gửi đi rộng hơn hẳn thứ người dùng vừa ngắm: hai mép trái/phải là
 * phần họ KHÔNG nhìn thấy và không chọn.
 *
 * Hậu quả đo được ngoài thực địa: người mua cẩn thận đưa MỘT quả vào giữa khung,
 * nhưng tấm gửi lên có thêm mấy quả ở hai mép, và máy chủ trả `need_region`
 * ("trong khung có nhiều quả") — trách người dùng vì một chuyện họ đã làm đúng.
 *
 * Nên khi chụp từ khung ngắm, cắt về **ô vuông giữa ảnh** (cạnh = cạnh ngắn).
 * Với `resizeMode="cover"` trên một khung vuông, đó CHÍNH LÀ vùng đang hiện trên
 * màn — không hơn, không kém. Đây không phải nhận diện: không dò quả, không đoán
 * gì, chỉ là gửi đúng thứ người ta đã ngắm.
 *
 * Ảnh chọn từ THƯ VIỆN thì KHÔNG cắt: ở đó không có khung ngắm nào, cắt là tự ý
 * xén ảnh của người ta.
 *
 * ── Thiếu mô-đun thì sao ────────────────────────────────────────────────────
 * `expo-image-manipulator` là mô-đun NATIVE: máy chưa dựng lại sau khi thêm gói
 * thì `require` ném. Bắt lỗi đó và đi tiếp bằng tấm gốc — nếu tấm gốc tình cờ
 * dưới 2MB thì mọi thứ vẫn chạy, còn nếu không thì trả `too_large` kèm cờ
 * `noResizer` để màn hình nói đúng nguyên nhân ("cần cập nhật ứng dụng") thay vì
 * đổ cho người dùng chụp ảnh nặng.
 */

import { imageBytes, LOOKUP_MAX_BYTES } from '../../services/fruitLookupService';

/** Một bậc của thang co: cạnh dài nhất (px) và mức nén JPEG. */
export interface ShrinkStep { maxEdge: number; compress: number }

/**
 * Thang co, từ nét nhất xuống.
 *
 * 1600 là cỡ chính repo này đang gửi ở luồng quả khác (`FruitListScreen`
 * `maxWidth/maxHeight: 1600`), nên bậc đầu KHÔNG phải con số mới bịa ra — nó là
 * cỡ máy chủ vẫn nhận hằng ngày.
 */
export const SHRINK_LADDER: readonly ShrinkStep[] = [
  { maxEdge: 1600, compress: 0.82 },
  { maxEdge: 1280, compress: 0.7 },
  { maxEdge: 1024, compress: 0.6 },
] as const;

export interface PreparedImage {
  uri: string;
  /** Kích thước THẬT của tấm gửi đi — `bbox` máy chủ trả về đo trên cỡ này. */
  width: number;
  height: number;
  /** `null` = không cân được (xem `imageBytes`). */
  bytes: number | null;
  /** Đã co hay dùng nguyên tấm gốc. */
  resized: boolean;
}

export type PrepareResult =
  | { kind: 'ok'; image: PreparedImage }
  /** Vượt trần và không co thêm được. `noResizer` = thiếu mô-đun native. */
  | { kind: 'too_large'; bytes: number | null; noResizer: boolean };

/**
 * Nạp `expo-image-manipulator` kiểu mềm.
 *
 * `require` trong `try` chứ không `import` ở đầu tệp: mô-đun native vắng mặt thì
 * `import` làm hỏng cả gói mã lúc nạp màn hình, còn `require` chỉ hỏng đúng lượt
 * gọi này và ta còn đường lùi.
 */
function loadManipulator(): any | null {
  try {
    return require('expo-image-manipulator');
  } catch {
    return null;
  }
}

export interface PrepareOptions {
  /**
   * Cắt về ô vuông GIỮA ảnh — đúng vùng khung ngắm vuông đang hiện trên màn.
   * Bật cho ảnh chụp từ khung ngắm; TẮT cho ảnh chọn từ thư viện.
   */
  square?: boolean;
  limitBytes?: number;
}

/**
 * Ô vuông giữa ảnh. `null` khi không cần cắt (ảnh đã vuông) hoặc không cắt được.
 *
 * Toạ độ làm tròn xuống: `expo-image-manipulator` nhận số thực nhưng tầng native
 * quy về pixel nguyên, và để nó tự làm tròn thì hai nền có thể lệch nhau một
 * pixel — đủ để một bài kiểm chạy xanh ở máy này, đỏ ở máy kia.
 */
export function centerSquareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  if (width === height) return null;
  const side = Math.floor(Math.min(width, height));
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/** Cạnh dài nhất → cặp (w, h) đích, giữ nguyên tỉ lệ. `null` nếu đã đủ nhỏ. */
export function resizeTarget(
  src: { width: number; height: number },
  maxEdge: number,
): { width: number } | { height: number } | null {
  const longest = Math.max(src.width, src.height);
  if (!Number.isFinite(longest) || longest <= 0) return null;
  if (longest <= maxEdge) return null;
  // Chỉ đặt MỘT chiều và để thư viện suy chiều kia — đặt cả hai là ép tỉ lệ, và
  // quả méo thì vân vỏ cũng méo theo.
  return src.width >= src.height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * Chuẩn bị ảnh để gửi `POST /api/fruit/lookup`.
 *
 * KHÔNG ném — mọi hỏng hóc quy về `too_large` hoặc về việc dùng tấm gốc.
 */
export async function prepareForLookup(
  uri: string,
  srcWidth: number,
  srcHeight: number,
  opts: PrepareOptions = {},
): Promise<PrepareResult> {
  const limitBytes = opts.limitBytes ?? LOOKUP_MAX_BYTES;
  const originalBytes = await imageBytes(uri);
  const crop = opts.square ? centerSquareCrop(srcWidth, srcHeight) : null;

  // Đã lọt trần VÀ không phải cắt ⇒ gửi nguyên tấm. Co lại một tấm đã đủ nhỏ chỉ
  // làm mất chi tiết mà không đổi lại được gì.
  //
  // ⚠ Điều kiện `!crop` là bắt buộc: cần cắt thì phải chạy đường xử lý dù ảnh
  // nhẹ tới đâu — bỏ qua ở đây là gửi trọn khung 4:3 và để máy chủ nhìn thấy mấy
  // quả người dùng chưa từng thấy.
  if (!crop && originalBytes !== null && originalBytes <= limitBytes) {
    return {
      kind: 'ok',
      image: { uri, width: srcWidth, height: srcHeight, bytes: originalBytes, resized: false },
    };
  }

  const mod = loadManipulator();
  if (!mod?.manipulateAsync) {
    // Không cắt được, không co được. Vẫn gửi tấm gốc khi nó đủ nhẹ (hoặc không
    // cân được) — thà gửi một tấm rộng hơn khung ngắm còn hơn không tra được gì.
    if (originalBytes === null || originalBytes <= limitBytes) {
      return {
        kind: 'ok',
        image: { uri, width: srcWidth, height: srcHeight, bytes: originalBytes, resized: false },
      };
    }
    return { kind: 'too_large', bytes: originalBytes, noResizer: true };
  }

  const format = mod.SaveFormat?.JPEG ?? 'jpeg';
  let lastBytes = originalBytes;
  // Sau khi cắt thì cạnh đã khác — thang co phải tính trên cỡ ĐÃ CẮT, nếu không
  // một tấm 4032×3024 cắt còn 3024×3024 vẫn bị đo theo 4032 và co quá tay.
  const effective = crop
    ? { width: crop.width, height: crop.height }
    : { width: srcWidth, height: srcHeight };

  for (const step of SHRINK_LADDER) {
    try {
      const target = resizeTarget(effective, step.maxEdge);
      // Thứ tự CẮT trước, CO sau: `crop` đo bằng pixel của ảnh GỐC, nên co trước
      // là cắt vào một toạ độ không còn tồn tại.
      const actions: Record<string, unknown>[] = [];
      if (crop) actions.push({ crop });
      if (target) actions.push({ resize: target });
      const out = await mod.manipulateAsync(uri, actions, {
        compress: step.compress,
        format,
      });
      const outUri: string = out?.uri ?? uri;
      const bytes = await imageBytes(outUri);
      lastBytes = bytes;
      // Không cân được bậc này ⇒ vẫn nhận: đã co thì gần như chắc chắn nhẹ hơn
      // gốc, và để máy chủ nói không còn hơn đứng lại giữa đường.
      if (bytes === null || bytes <= limitBytes) {
        return {
          kind: 'ok',
          image: {
            uri: outUri,
            width: out?.width ?? effective.width,
            height: out?.height ?? effective.height,
            bytes,
            resized: true,
          },
        };
      }
    } catch {
      // Bậc này hỏng (hết bộ nhớ, tệp lạ…) → thử bậc nhỏ hơn. Hỏng hết thì rơi
      // xuống nhánh `too_large` bên dưới.
    }
  }

  // Cả thang hỏng (mô-đun ném ở mọi bậc: hết bộ nhớ, tệp lạ, bản native lỗi).
  // Tấm GỐC vẫn lọt trần thì gửi nó — mất phần cắt vuông, được phần tra cứu.
  // Ngược lại mới chịu thua.
  if (originalBytes === null || originalBytes <= limitBytes) {
    return {
      kind: 'ok',
      image: { uri, width: srcWidth, height: srcHeight, bytes: originalBytes, resized: false },
    };
  }
  return { kind: 'too_large', bytes: lastBytes, noResizer: false };
}
