/**
 * GHÉP MÁY — phần KHÔNG phải giao diện của luồng "một PhoenixKey dùng ở mọi app".
 *
 * ══ Hai nửa của cùng một việc ════════════════════════════════════════════════
 * Máy B (chưa có danh tính) hiện mã QR chứa KHOÁ CÔNG KHAI của nó. Máy A (đang
 * giữ owner-key) quét mã đó rồi ký uỷ quyền — phần ký nằm ở `keyAuthorizeService`,
 * tệp này chỉ lo hai đầu còn lại:
 *
 *   · phía B: có khoá để mà khoe (`thisDevicePublicKey`), và sau khi được duyệt
 *     thì đổi khoá đó lấy DID (`claimAuthorizedIdentity`);
 *   · cả hai phía: một khuôn chuỗi QR mà bên kia đọc lại đúng được.
 *
 * ══ Vì sao KHÔNG gọi `registerIdentity` ở phía B ═════════════════════════════
 * `registerIdentity('resume')` nhìn thì hợp: máy có khoá, nó tra DID theo khoá.
 * Nhưng khi tra không ra, nó ĐI TIẾP xuống đường 3 và **đăng ký một DID MỚI** cho
 * chính khoá ấy. Trên máy B đó là đúng cái tai nạn mà cửa vào danh tính dựng ra để
 * chặn: người dùng bấm "máy kia đã duyệt xong" sớm một nhịp và nhận về một danh
 * tính THỨ HAI, vườn cũ không hiện ra, mà không có gì báo là đã hỏng.
 *
 * Nên phía B chỉ được dùng đúng một bước — tra DID theo khoá — và dừng hẳn khi
 * không ra. `lookupDidByDeviceKey` là bước đó, tách ra từ đường 1 của
 * `recoverLocalIdentityFromKey` để hai nơi dùng CHUNG một chuỗi ký, không phải hai
 * bản sao của nó.
 *
 * ══ Khuôn chuỗi QR ══════════════════════════════════════════════════════════
 * `PHOENIXKEY_DEVICE_KEY:<hex>` — chữ thường, một dòng, không bọc JSON.
 *
 * Cố ý KHÁC khuôn của QR đăng nhập web (base64url của một JSON). Hai màn quét nằm
 * cạnh nhau trong cùng một app, nên hai khuôn phải phân biệt được bằng chính ký tự
 * đầu: dấu `:` không nằm trong bảng chữ base64url, nên bộ giải của màn đăng nhập
 * web trả `null` ngay khi gặp chuỗi này — không có ca "quét nhầm màn mà vẫn chạy".
 */

import { enrollKeypair, isKeypairEnrolled, ownerPublicKey, saveUserDid } from '../sdk/phoenixKey';
import { PhoenixKeyApiError } from './phoenixKey-api';
import { lookupDidByDeviceKey } from './phoenixKeyAuthService';

/** Tiền tố miền của mã QR ghép máy. Đổi nó là phá tương thích giữa hai bản app. */
export const PAIR_QR_PREFIX = 'PHOENIXKEY_DEVICE_KEY:';

/**
 * Khoảng độ dài chấp nhận cho khoá công khai dạng hex.
 *
 * Nới rộng CÓ CHỦ Ý. Khoá P-256 không nén là 130 ký tự (`04` + 128), dạng nén là
 * 66 — nhưng hai nền tảng có thể đổi cách xuất khoá, và phép kiểm ở đây sai theo
 * hai chiều rất khác nhau:
 *
 *   · chặt quá ⇒ app nói "mã này không phải mã ghép máy" cho một mã HỢP LỆ, và
 *     người dùng không có cách nào biết ai sai;
 *   · lỏng quá ⇒ chuỗi đi tới máy chủ và nhận `3007 KEY_FORMAT_INVALID`, một câu
 *     đã có sẵn bản dịch nói rõ phải quét lại.
 *
 * Chiều thứ hai hỏng ỒN ÀO và đúng chỗ, nên chọn nó.
 */
const HEX_KEY_RE = /^[0-9a-fA-F]{64,256}$/;

/** Dựng chuỗi nhúng vào mã QR của máy đang xin được duyệt. */
export function buildPairPayload(publicKeyHex: string): string {
  return `${PAIR_QR_PREFIX}${publicKeyHex.trim().toLowerCase()}`;
}

/**
 * Đọc khoá công khai ra khỏi một chuỗi vừa quét.
 *
 * Trả `null` cho MỌI chuỗi không đúng khuôn — kể cả chuỗi đúng tiền tố mà phần
 * khoá rỗng hay không phải hex. Nơi gọi hiện câu "không phải mã ghép máy" rồi tiếp
 * tục quét; không có nhánh nào đoán tiếp.
 */
export function parsePairPayload(raw: string): string | null {
  const s = raw?.trim();
  if (!s || !s.startsWith(PAIR_QR_PREFIX)) return null;
  const hex = s.slice(PAIR_QR_PREFIX.length).trim();
  if (!HEX_KEY_RE.test(hex)) return null;
  return hex.toLowerCase();
}

/**
 * Khoá công khai của MÁY NÀY, sinh mới nếu máy chưa có khoá nào.
 *
 * ⚠ GIỮ `isKeypairEnrolled()` Ở ĐÂY — nhưng KHÔNG phải vì lý do khối này từng ghi.
 *
 * Câu cũ ở đây nói `enrollKeypair()` XOÁ khoá cũ trước khi ghi khoá mới. Mã nói
 * ngược: cả hai cầu native TỪ CHỐI khi nhãn đã có khoá và trả `E_KEY_EXISTS`
 * (`android/.../PhoenixKeyModule.kt` nhánh `keyStore.containsAlias`,
 * `ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift` nhánh `hasKeySync`).
 * Hành vi thật AN TOÀN HƠN mô tả — không có ca mất-danh-tính ở đây.
 *
 * Lý do đúng để giữ phép hỏi, và nó vẫn đủ để giữ: bỏ đi thì hàm này NÉM
 * `E_KEY_EXISTS` cho đúng cái máy đã đăng nhập — tức lối ghép máy chết ở bước đầu
 * với một mã lỗi native, trong khi việc phải làm chỉ là dùng lại khoá đang có.
 * Hỏi trước, sinh sau, thì máy đã có khoá đi thẳng vào nhánh `ownerPublicKey()`.
 *
 * Nói cách khác: phép hỏi này đổi từ một CỔNG CHỐNG MẤT DỮ LIỆU (nó chưa bao giờ
 * là thế) thành một cổng chống một câu lỗi câm. Vẫn phải giữ, chỉ là đừng ai đọc
 * khối này rồi tin rằng chip cho ghi đè.
 */
export async function thisDevicePublicKey(): Promise<string> {
  if (await isKeypairEnrolled()) return (await ownerPublicKey()).toLowerCase();
  const { publicKeyHex } = await enrollKeypair();
  return publicKeyHex.toLowerCase();
}

/** Lỗi riêng cho ca "máy kia chưa duyệt xong" — nơi gọi cần phân biệt để nói đúng câu. */
export class NotAuthorizedYetError extends Error {
  readonly code = 'DEVICE_NOT_AUTHORIZED_YET';
  constructor() {
    super('Khoá của máy này chưa được danh tính nào nhận.');
    this.name = 'NotAuthorizedYetError';
  }
}

/**
 * Sau khi máy kia đã duyệt: đổi khoá của máy này lấy DID, rồi lưu DID đó.
 *
 * Máy chủ CỐ Ý trả 404 giống hệt nhau cho ba ca (chữ ký sai · khoá chưa đăng ký ·
 * khoá đã thu hồi) nên ở đây KHÔNG được dịch 404 thành một nguyên nhân cụ thể. Câu
 * duy nhất nói được là "máy chủ chưa thấy khoá này thuộc về danh tính nào" — đúng
 * bằng những gì đo được, và nó cũng là câu hữu ích nhất ở đúng thời điểm này.
 */
export async function claimAuthorizedIdentity(): Promise<string> {
  let did: string;
  try {
    did = await lookupDidByDeviceKey(
      'Ghép máy vào danh tính',
      'Xác thực để nhận danh tính vừa được duyệt',
    );
  } catch (e) {
    if (e instanceof PhoenixKeyApiError && e.httpStatus === 404) {
      throw new NotAuthorizedYetError();
    }
    throw e; // mất sóng, 5xx, người dùng huỷ sinh trắc — để nguyên, đừng đội lốt.
  }
  await saveUserDid(did);
  return did;
}
