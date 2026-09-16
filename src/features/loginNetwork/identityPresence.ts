// features/loginNetwork/identityPresence.ts
//
// Máy này đã có danh tính chưa — và nút dưới đáy màn đăng nhập phải nói gì.
//
// ── Vì sao tách khỏi màn hình ───────────────────────────────────────────────
// `LoginNetworkScreen` nạp `expo-gl` + three.js ngay ở tầng module, nên một bài
// kiểm chỉ muốn hỏi "máy chưa có danh tính thì nút ghi chữ gì" sẽ phải dựng cả
// một mặt vẽ OpenGL để hỏi được câu đó. Bài kiểm đắt là bài kiểm không được
// viết, và phần logic này là phần DUY NHẤT ở đây sai được một cách im lặng.
//
// ── Ba trạng thái, và trạng thái thứ ba không được đội lốt trạng thái thứ hai ─
// Phép kiểm là một lượt đọc bất đồng bộ (kho khoá + AsyncStorage), nên luôn có
// một quãng app CHƯA BIẾT. In "Đăng ký danh tính" trong quãng đó là phát một
// khẳng định — *máy này chưa có khoá* — đúng vào lúc chưa đo được gì.
//
// Màn này đã chọn đúng chiều ấy cho cảm biến sinh trắc (`sensorAvailable === null`
// = chưa dò xong, phân biệt hẳn với `false`); chỗ danh tính thì chưa, và đó là
// chỗ hỏng bản này vá.

import { currentUserDid, isKeypairEnrolled } from '../../sdk/phoenixKey';

export type IdentityPresence = 'unknown' | 'yes' | 'no';

/**
 * MỘT nguồn cho cả NHÃN lẫn HÀNH VI của nút.
 *
 * `LoginNetworkScreen.runBiometric` rẽ theo đúng biểu thức `!did || !hasKey`.
 * Nút dưới đáy phải đọc CÙNG hàm này, không được tự dựng lại điều kiện: hai
 * biểu thức cùng nghĩa hôm nay sẽ trôi khỏi nhau ngày một trong hai bên được
 * sửa, và triệu chứng là nhãn nói một đằng nút làm một nẻo.
 *
 * Không phải lo xa. `screens/LoginScreen.tsx` đã phải vá đúng họ lỗi này hai lần
 * trong một ngày (15/09/2026): lời chào và nút đổi tài khoản đọc một cái NHÃN,
 * trong khi đường mở khoá đọc `currentUserDid()` — màn chào tên B rồi mở phiên
 * của A, và mọi thứ ghi tiếp đi vào tài khoản A dưới cái tên B.
 *
 * KHÔNG bắt lỗi ở đây: nơi gọi phải phân biệt được "đọc xong, máy chưa có" với
 * "đọc hỏng, chưa biết gì". Nuốt lỗi rồi trả `'no'` là biến một lần đọc hỏng
 * thành một khẳng định, đúng cái hàm này sinh ra để chặn.
 */
export async function readIdentityPresence(): Promise<IdentityPresence> {
  const [did, hasKey] = await Promise.all([currentUserDid(), isKeypairEnrolled()]);
  return did && hasKey ? 'yes' : 'no';
}

/** Nút dưới đáy màn đăng nhập, dựng từ trạng thái của máy. */
export type PrimaryCta = {
  /** Khoá tra từ điển — cả ba đều có bản dịch ở `i18n/phrases/account.ts`. */
  labelKey: 'Đăng nhập' | 'Đăng ký danh tính' | 'Đang kiểm tra máy này…';
  /** `null` ở trạng thái chưa biết: mũi tên hứa một đích mà ta chưa biết là đích nào. */
  icon: 'login-variant' | 'arrow-right' | null;
  disabled: boolean;
  /**
   * `unlock` mở khoá bằng sinh trắc; `openEntryChoice` sang màn HỎI
   * (`IdentityEntryChoice`), không sang thẳng màn tạo mới.
   */
  action: 'unlock' | 'openEntryChoice' | 'none';
};

/**
 * Trạng thái máy ⟹ nút.
 *
 * `'unknown'` KHÔNG bấm được. Chưa biết máy có gì thì cả hai đích đều là đoán,
 * và một trong hai đích — màn hỏi rồi rất dễ sang màn tạo mới — sinh ra một DID
 * THỨ HAI cho cùng một người. Lúc đó `farmService` lấy `owner_did` từ phiên nên
 * danh sách vườn hiện RỖNG, mà rỗng thì trùng khớp với "tôi chưa ghi gì": cái
 * sai không kêu lên, và bước kế tiếp rất dễ là nhập lại toàn bộ vườn dưới DID
 * thứ hai. Dữ liệu chia đôi vĩnh viễn.
 *
 * Nên chiều hỏng ở đây là ĐỨNG IM một nhịp, không phải đoán một đích.
 */
export function primaryCta(presence: IdentityPresence): PrimaryCta {
  switch (presence) {
    case 'yes':
      return {
        labelKey: 'Đăng nhập',
        icon: 'login-variant',
        disabled: false,
        action: 'unlock',
      };
    case 'no':
      return {
        labelKey: 'Đăng ký danh tính',
        icon: 'arrow-right',
        disabled: false,
        action: 'openEntryChoice',
      };
    default:
      return {
        labelKey: 'Đang kiểm tra máy này…',
        icon: null,
        disabled: true,
        action: 'none',
      };
  }
}
