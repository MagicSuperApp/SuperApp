/**
 * Uỷ quyền một khoá thiết bị MỚI vào DID đang có — `POST /keys/authorize`.
 *
 * ══ Việc này giải cái gì ═════════════════════════════════════════════════════
 * Một người dùng cài app thứ hai của cùng hệ. Trước bản này họ chỉ có hai lối, cả
 * hai đều sai: hoặc sinh một danh tính MỚI (mất hết vườn, cây, ví của danh tính
 * cũ), hoặc khôi phục bằng 24 từ — mà lối khôi phục THU HỒI khoá owner của app
 * thứ nhất (`revokeOwnersByUserDid`), nên app cũ chết ngay khi app mới sống.
 *
 * Đường thứ ba đã có sẵn ở máy chủ từ lâu mà app chưa gọi: app A ký uỷ quyền cho
 * khoá của app B. Hai khoá cùng sống, không khoá nào bị thu hồi.
 *
 * ══ Vì sao đường này an toàn ═════════════════════════════════════════════════
 * Cửa `/keys/authorize` PUBLIC ở tầng Spring — không Bearer, ai gọi cũng được.
 * Điều đó nghe như một lỗ, và nó không phải, vì Zero-Trust nằm ở tầng service:
 * `KeyServiceImpl.authorize()` đòi DID phải sẵn có một owner-key ACTIVE rồi verify
 * `addedBySignature` bằng CHÍNH khoá đó trước khi ghi. Không ký được bằng khoá
 * owner thì không gắn được gì — máy B không tự thêm mình vào được.
 *
 * ══ Ba chỗ dựng sai thì chỉ hiện ra bằng một con 403 ═════════════════════════
 * Chữ ký hỏng không nói được nó hỏng ở đâu. Ba chỗ dưới đây là ba chỗ dễ sai
 * nhất, và cả ba đều cho ra cùng một con 403 không phân biệt được:
 *
 *   1. **Đóng khung theo độ dài, không nối `':'`.** Máy chủ dùng
 *      `CanonicalMessage.build` — tiền tố byte thô rồi mỗi field kèm 4 byte độ dài
 *      big-endian. Nối `':'` là khuôn CŨ, đã bị nhà PhoenixKey dựng va chạm thật.
 *   2. **Đúng năm field, đúng thứ tự** `userDid · publicKeyHex · keyRole · nonce ·
 *      opSeq`. `keyOrigin` nằm trong thân gửi nhưng KHÔNG nằm trong chuỗi ký —
 *      thêm nó vào là hỏng, mà nhìn thì rất hợp lý.
 *   3. **`opSeq` vào chuỗi ký dưới dạng CHUỖI THẬP PHÂN**
 *      (`String.valueOf(request.opSeq())`), không phải 8 byte số.
 *
 * ══ Vì sao đọc `opSeq` ngay tại đây, không nhận từ ngoài ════════════════════
 * Mốc phải là mốc SÁT lúc gửi. Nhận `opSeq` qua tham số thì nơi gọi có thể giữ lại
 * một giá trị đọc từ trước — và giữa hai lần đó có thể đã có một thao tác khác
 * trên cùng DID (thêm guardian, thu hồi khoá) nâng mốc lên. Lúc ấy máy chủ trả 409
 * `OP_SEQ_REPLAY`, một lỗi khó đọc cho việc mà người dùng nghĩ là "thêm máy".
 */

import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import taad from '../sdk/taadEnclave';
import { buildCanonicalHex } from './canonicalMessage';
import {
  phoenixKeyApi,
  PhoenixKeyApiError,
  type KeyOrigin,
  type KeyRole,
} from './phoenixKey-api';

/** Tiền tố miền — kèm dấu hai chấm, đúng như `KeyServiceImpl.AUTHORIZE_PREFIX`. */
export const AUTHORIZE_PREFIX = 'PHOENIXKEY_AUTHORIZE:';

/**
 * Dựng chuỗi ký uỷ quyền, trả **hex**.
 *
 * Tách riêng khỏi hàm gọi mạng để bài kiểm ghim được từng byte mà không phải giả
 * lập khoá phần cứng. Đây là thứ duy nhất trong tệp này sai được một cách IM LẶNG.
 */
export function buildAuthorizeMessageHex(args: {
  userDid: string;
  publicKeyHex: string;
  keyRole: KeyRole;
  nonce: string;
  opSeq: number;
}): string {
  return buildCanonicalHex(
    AUTHORIZE_PREFIX,
    args.userDid,
    args.publicKeyHex,
    args.keyRole,
    args.nonce,
    // Chuỗi thập phân, khớp `String.valueOf(long)` phía máy chủ.
    String(args.opSeq),
  );
}

export interface AuthorizeDeviceKeyResult {
  publicKeyHex: string;
  keyRole: KeyRole;
  opSeq: number;
}

/**
 * Uỷ quyền khoá `publicKeyHex` vào DID của người đang đăng nhập.
 *
 * Đòi khoá owner trên MÁY NÀY (`signRaw` ký bằng khoá phần cứng) — tức thao tác
 * này chỉ chạy được trên chính máy đang giữ danh tính, và có một lần xác thực
 * sinh trắc chen vào giữa. Đó là chủ ý: thêm một máy vào danh tính là việc đáng
 * để người dùng chạm vân tay một lần.
 *
 * `keyRole` cố định `'manager'`. `'owner'` bị máy chủ chặn (V36: tối đa một
 * owner-key active mỗi DID) nên không mở tham số ra để khỏi ai đó thử.
 */
export async function authorizeDeviceKey(
  publicKeyHex: string,
  opts: { keyOrigin?: KeyOrigin } = {},
): Promise<AuthorizeDeviceKeyResult> {
  const userDid = await currentUserDid();
  if (!userDid) {
    throw new Error('Chưa có danh tính trên máy này để uỷ quyền cho máy khác.');
  }

  const keyRole: KeyRole = 'manager';
  const nonce = await taad.generateSalt();

  // Đọc mốc SÁT lúc gửi — xem chú thích đầu tệp.
  const { nextOpSeq } = await phoenixKeyApi.identity.opSeq(userDid);

  const messageHex = buildAuthorizeMessageHex({
    userDid,
    publicKeyHex,
    keyRole,
    nonce,
    opSeq: nextOpSeq,
  });

  const addedBySignature = await signRaw(
    messageHex,
    'Thêm máy vào danh tính',
    'Ký bằng khoá phần cứng của bạn',
  );

  await phoenixKeyApi.keys.authorize({
    userDid,
    publicKeyHex,
    // Khoá của máy kia sinh trong Secure Enclave / Keystore — cùng loại khoá mà
    // `PhoenixKeyModule.generateKeypair` sinh ra ở cả hai nền.
    keyOrigin: opts.keyOrigin ?? 'SECURE_ENCLAVE',
    keyRole,
    nonce,
    opSeq: nextOpSeq,
    addedBySignature,
  });

  return { publicKeyHex, keyRole, opSeq: nextOpSeq };
}

/**
 * Đổi lỗi máy chủ thành câu người đọc được.
 *
 * Bốn mã dưới đây là bốn NGUYÊN NHÂN khác hẳn nhau mà người dùng chỉ thấy chung
 * một việc "thêm máy không được". Nói đúng nguyên nhân là khác biệt giữa "thử
 * lại" và "đi làm một việc khác trước".
 */
export function describeAuthorizeFailure(e: unknown): string {
  const code = e instanceof PhoenixKeyApiError ? e.code : undefined;
  const http = e instanceof PhoenixKeyApiError ? e.httpStatus : undefined;

  switch (code) {
    case 3009: // OP_SEQ_REPLAY — mốc đã bị nâng giữa lúc đọc và lúc gửi.
      return 'Có một thao tác khác vừa chạm vào danh tính của bạn. Thử lại một lần nữa.';
    case 3010: // OP_SEQ_TOO_FAR_AHEAD — mốc gửi vượt trần cho phép.
      return 'Mốc chống phát lại lệch quá xa. Thử lại; nếu vẫn vậy thì báo kỹ thuật.';
    case 3011: // OWNER_KEY_ALREADY_ACTIVE — chỉ xảy ra nếu ai đó gửi keyRole='owner'.
      return 'Danh tính này đã có một khoá chủ. Máy thêm vào chỉ nhận vai phụ, không nhận vai chủ.';
    case 3007: // KEY_FORMAT_INVALID
      return 'Mã khoá của máy kia không đúng định dạng. Hãy quét lại mã trên máy đó.';
    default:
      break;
  }
  if (http === 404) {
    return 'Danh tính này chưa có khoá chủ nào đang hoạt động, nên chưa uỷ quyền cho máy khác được.';
  }
  if (http === 403) {
    return 'Chữ ký uỷ quyền không được chấp nhận. Hãy chắc bạn đang làm việc này trên đúng máy đang giữ danh tính.';
  }
  if (http === 400) {
    return 'Mã khoá của máy kia không hợp lệ. Hãy quét lại mã trên máy đó.';
  }
  return e instanceof Error && e.message ? e.message : 'Không thêm được máy. Thử lại sau.';
}
