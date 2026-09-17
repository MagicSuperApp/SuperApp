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
 * Dùng khi không đọc được bản kê. Lấy từ cụm của CheckFarm (856×136) vì đó là
 * app duy nhất khai cụm tới hôm nay; nó chỉ là lưới an toàn, không phải lời khai
 * về ảnh của một app nào khác.
 */
const FALLBACK_ASPECT = 856 / 136;

const aspectOf = (src: ImageSourcePropType | null): number => {
  if (!src) return FALLBACK_ASPECT;
  try {
    const meta = Image.resolveAssetSource(src as never);
    if (meta && meta.width > 0 && meta.height > 0) return meta.width / meta.height;
  } catch {
    // Bản kê không đọc được — rơi về lưới an toàn. KHÔNG nuốt thành 0: một tỉ lệ
    // 0 làm `aspectRatio` sinh chiều cao 0 và cụm biến mất không dấu vết.
  }
  return FALLBACK_ASPECT;
};

/** Tỉ lệ rộng/cao của cụm nhận diện app hiện hành. */
export const BRAND_LOCKUP_ASPECT = aspectOf(DEFAULT_INSTANCE.brandLockupOnDark);
