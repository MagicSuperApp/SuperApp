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

/**
 * ── HAI PHÉP ĐO, BỐN TRẠNG THÁI — đừng gộp về hai ───────────────────────────
 *
 * Bản trước trả `did && hasKey ? 'yes' : 'no'`, tức nó nén BỐN tổ hợp của hai
 * phép đo độc lập xuống hai chữ. Ba tổ hợp khác nhau cùng ra `'no'`, và app
 * mời cả ba đi "đăng ký" — trong khi hai trong ba là người ĐÃ CÓ tài khoản.
 *
 * Tổ hợp đắt nhất là `!did && hasKey`, và nó KHÔNG hiếm: kho khoá của iOS/Android
 * sống qua lần gỡ app, còn AsyncStorage (nơi giữ DID) thì bị xoá sạch. Nên người
 * cài lại app trên chính máy cũ rơi vào đúng đây. Trước bản này họ được hỏi "bạn
 * là người mới à?" trong khi khoá của họ đang nằm trong chip ngay dưới tay — và
 * lối "tôi là người mới" dẫn tới `registerIdentity`, nơi máy chủ trả
 * `KEY_ALREADY_REGISTERED` (3005) vì khoá ấy đã đăng ký rồi.
 *
 * App KHÔNG phải hỏi câu đó: `POST /identity/lookup` đổi chính khoá trong chip
 * lấy DID, không cần tên đăng nhập, không cần 24 từ — xem `lookupDidByDeviceKey`
 * (`services/phoenixKeyAuthService.ts`), đường 1 của `recoverLocalIdentityFromKey`.
 *
 * Tổ hợp `did && !hasKey` thì NGƯỢC LẠI: ở đó app thật sự không biết. Khoá mất
 * có thể vì hệ điều hành huỷ khoá (người dùng vừa thêm/xoá vân tay), mà cũng có
 * thể vì đây là máy khác. Hai ca ấy cần hai lối, nên đúng chỗ này mới là chỗ
 * ĐƯỢC PHÉP hỏi.
 */
export type IdentityPresence =
  | 'unknown'
  /** Có DID đã lưu VÀ có khoá trong chip — mở khoá được ngay. */
  | 'yes'
  /** Khoá còn trong chip nhưng app không biết nó của ai — hỏi máy chủ, đừng hỏi người. */
  | 'key-without-did'
  /** App nhớ một DID nhưng khoá đã mất — ca duy nhất còn phải hỏi người dùng. */
  | 'did-without-key'
  /** Không có gì cả: máy này chưa từng lập danh tính, và cũng chưa từng có khoá. */
  | 'no';

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
  if (hasKey) return did ? 'yes' : 'key-without-did';
  return did ? 'did-without-key' : 'no';
}

/**
 * Đích điều hướng khi máy KHÔNG mở khoá được ngay — một nguồn cho cả hai màn
 * đăng nhập (`LoginScreen` và `LoginNetworkScreen`).
 *
 * `null` ở `'yes'` (không đi đâu cả, mở khoá tại chỗ) và ở `'unknown'` (chưa đo
 * xong thì chưa có đích — đoán một đích ở đây là đúng cái `primaryCta` từ chối
 * làm). Kiểu trả về ép nơi gọi phải xử hai ca ấy, thay vì nhận một đích trông
 * hợp lệ.
 *
 * Suy TỪ `primaryCta` chứ không dựng lại bảng rẽ: hai bảng cùng nghĩa hôm nay
 * sẽ trôi khỏi nhau ngày một trong hai bên được sửa, và triệu chứng là nhãn nói
 * một đằng nút đi một nẻo — đúng họ lỗi mà tệp này lập ra để chặn.
 */
export function routeForPresence(
  presence: IdentityPresence,
): 'RestoreIdentity' | 'SignUpBiometric' | 'IdentityEntryChoice' | null {
  switch (primaryCta(presence).action) {
    case 'restoreByDeviceKey':
      return 'RestoreIdentity';
    case 'signUpNew':
      return 'SignUpBiometric';
    case 'openEntryChoice':
      return 'IdentityEntryChoice';
    default:
      return null;
  }
}

/** Nút dưới đáy màn đăng nhập, dựng từ trạng thái của máy. */
export type PrimaryCta = {
  /** Khoá tra từ điển — cả năm đều có bản dịch ở `i18n/phrases/account.ts`. */
  labelKey:
    | 'Đăng nhập'
    | 'Đăng nhập bằng khoá đã có trên máy'
    | 'Khôi phục danh tính trên máy này'
    | 'Tạo danh tính mới trên máy này'
    | 'Đang kiểm tra máy này…';
  /** `null` ở trạng thái chưa biết: mũi tên hứa một đích mà ta chưa biết là đích nào. */
  icon: 'login-variant' | 'key-variant' | 'account-plus-outline' | 'arrow-right' | null;
  disabled: boolean;
  /**
   * `unlock` mở khoá bằng sinh trắc · `restoreByDeviceKey` sang màn Khôi phục,
   * nơi khoá trong chip được đổi lấy DID mà không hỏi người dùng thứ gì ·
   * `signUpNew` sang thẳng màn tạo mới · `openEntryChoice` sang màn HỎI.
   */
  action:
    | 'unlock'
    | 'restoreByDeviceKey'
    | 'signUpNew'
    | 'openEntryChoice'
    | 'none';
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
    // Máy CÓ khoá, app không biết khoá của ai. Câu hỏi "bạn là người mới à?"
    // không được đặt ở đây: máy chủ trả lời được, và nó trả lời bằng chính khoá
    // đang nằm trong chip. Hỏi người dùng ở đây là hỏi một câu mà chính họ cũng
    // không trả lời nổi — họ không biết app đã từng được cài trên máy này chưa.
    case 'key-without-did':
      return {
        labelKey: 'Đăng nhập bằng khoá đã có trên máy',
        icon: 'key-variant',
        disabled: false,
        action: 'restoreByDeviceKey',
      };
    // App nhớ một DID nhưng khoá đã mất. Đây là ca DUY NHẤT còn mơ hồ thật:
    // khoá có thể bị hệ điều hành huỷ (vừa thêm/xoá vân tay) hoặc đây là máy
    // khác. Hai ca đó cần hai lối, và không phép đo nào trên máy tách được
    // chúng — nên hỏi ở đây là đúng, không phải lười.
    case 'did-without-key':
      return {
        labelKey: 'Khôi phục danh tính trên máy này',
        icon: 'arrow-right',
        disabled: false,
        action: 'openEntryChoice',
      };
    // Không khoá, không DID. Đây là ca chủ nhân chốt 2026-09-16: đo được rồi
    // thì đừng hỏi nữa — lối chính là TẠO MỚI, đi thẳng.
    //
    // Lối "tôi đã có tài khoản ở máy khác" KHÔNG mất: nó nằm lại ở màn hỏi, mở
    // bằng một dòng chữ phụ dưới nút (`openEntryChoice`). Giữ nó là bắt buộc,
    // vì người đổi điện thoại cũng đo ra ĐÚNG trạng thái này — máy mới thì
    // trống trơn — và với riêng họ thì "tạo mới" là lối sinh ra một DID thứ
    // hai. Cái phải bỏ là bắt MỌI người đi qua câu hỏi để phục vụ một nhóm.
    case 'no':
      return {
        labelKey: 'Tạo danh tính mới trên máy này',
        icon: 'account-plus-outline',
        disabled: false,
        action: 'signUpNew',
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
