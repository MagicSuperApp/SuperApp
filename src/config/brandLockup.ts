/**
 * Hình dạng của cụm nhận diện — SINH từ chính tệp ảnh, không gõ tay.
 *
 * ── Vì sao có tệp này ────────────────────────────────────────────────────────
 * Bản đầu chép tỉ lệ nguồn (`856` / `136`) vào ba tệp màn, mỗi chỗ một dòng
 * `height: <W> * 136 / 856`. Phép thử của rule một-nguồn không có câu trả lời:
 * *"ảnh đổi tỉ lệ thì ai báo cho ba chỗ này?"* — không ai. Và cái sai không kêu:
 * `resizeMode: 'contain'` giữ mực KHÔNG méo, nó lồng mực vào trong khung, nên
 * một ảnh 600×136 thả vào hộp 244×38,8 sẽ vẽ mực rộng 171 trong khi mọi phép đo
 * và mọi thứ căn theo nó vẫn tin là 244.
 *
 * `Image.resolveAssetSource` đọc đúng hai số đó từ bản kê tài sản của Metro lúc
 * chạy, nên tỉ lệ ở đây LUÔN là tỉ lệ của tệp thật.
 *
 * ── Ngưỡng an toàn ───────────────────────────────────────────────────────────
 * `resolveAssetSource` trả `null` được (tài sản chưa nạp, bản kê bị mock trong
 * bài kiểm). Rơi vào đó thì dùng tỉ lệ khai ở dưới — một con số CÓ NHÃN và có
 * đúng một chỗ, khác hẳn với ba bản sao không nhãn.
 */
import { Image, type ImageSourcePropType } from 'react-native';
import { DEFAULT_INSTANCE } from './instance.config';

/**
 * Dùng khi không đọc được bản kê. Lấy từ hai mảnh của CheckFarm (dấu hiệu
 * 157×136, chữ hiệu 649×99) vì đó là app duy nhất khai cụm tới hôm nay; chúng
 * chỉ là lưới an toàn, không phải lời khai về ảnh của một app nào khác.
 */
const FALLBACK_MARK_ASPECT = 157 / 136;
const FALLBACK_WORDMARK_ASPECT = 649 / 99;

const aspectOf = (src: ImageSourcePropType | null, fallback: number): number => {
  if (!src) return fallback;
  try {
    const meta = Image.resolveAssetSource(src as never);
    if (meta && meta.width > 0 && meta.height > 0) return meta.width / meta.height;
  } catch {
    // Bản kê không đọc được — rơi về lưới an toàn. KHÔNG nuốt thành 0: một tỉ lệ
    // 0 làm `aspectRatio` sinh chiều cao 0 và cụm biến mất không dấu vết.
  }
  return fallback;
};

/** Tỉ lệ rộng/cao của DẤU HIỆU (chiếc lá) app hiện hành. */
export const BRAND_MARK_ASPECT = aspectOf(
  DEFAULT_INSTANCE.brandMarkOnDark,
  FALLBACK_MARK_ASPECT,
);

/** Tỉ lệ rộng/cao của CHỮ HIỆU (tên app vẽ sẵn) app hiện hành. */
export const BRAND_WORDMARK_ASPECT = aspectOf(
  DEFAULT_INSTANCE.brandWordmarkOnDark,
  FALLBACK_WORDMARK_ASPECT,
);

/**
 * ── TỈ LỆ BỐ CỤC — đơn vị là CẠNH VUÔNG NGOẠI TIẾP DẤU HIỆU ──────────────────
 *
 * Bốn ràng buộc chủ dự án đặt cho cụm nhận diện (2026-09-16), nguyên văn ở
 * `Logo/play-store/README.md` của kho CheckFarm — kho KHÁC kho này:
 *
 *   1. câu giới thiệu = `Truy xuất nguồn gốc - Nâng tầm nông sản`
 *   2. bề rộng câu ấy BẰNG bề rộng chữ `CheckFarm`, cùng phông
 *   3. tổng chiều cao hai hàng chữ BẰNG cạnh hình vuông NGOẠI TIẾP dấu hiệu
 *   4. trong khung CHỈ ba thứ: dấu hiệu · chữ hiệu · câu giới thiệu
 *
 * ⚠ Ràng buộc 3 neo vào **cạnh hình vuông**, tức chiều LỚN của dấu hiệu — với
 * chiếc lá CheckFarm thì đó là BỀ RỘNG (hộp mực 594×511, rộng > cao). Neo nhầm
 * vào chiều CAO là một lỗi vừa mắc và vừa sửa: nó nhỏ hơn đúng `136/158`, cụm
 * vẫn dựng ra, vẫn cân đối, chỉ sai tỉ lệ — không có gì kêu.
 *
 * Nên MỌI tỉ lệ dưới đây lấy đơn vị là **bề rộng dấu hiệu**, và chúng là ba số
 * bộ sinh đã giải ra: `99 + 22 + 37 = 158`.
 *
 * Ràng buộc 2 và 3 ghì nhau nên cạnh dấu hiệu KHÔNG phải một con số được chọn —
 * nó là ẩn số của một phương trình. Đừng chỉnh tay một tỉ lệ nào ở đây; đổi câu
 * giới thiệu thì chạy lại bộ sinh bên kho CheckFarm rồi chép số mới sang.
 */

/** Khe ngang giữa dấu hiệu và cột chữ. `207 − 157` trong ảnh gộp. */
export const MARK_TO_WORDMARK_GAP = 50 / 158;

/** Cao chữ hiệu / bề rộng dấu hiệu. */
export const WORDMARK_SHARE = 99 / 158;

/** Khe dọc giữa chữ hiệu và khẩu hiệu / bề rộng dấu hiệu. */
export const WORDMARK_TO_SLOGAN_GAP = 22 / 158;

/** Cao khẩu hiệu / bề rộng dấu hiệu. */
export const SLOGAN_SHARE = 37 / 158;
