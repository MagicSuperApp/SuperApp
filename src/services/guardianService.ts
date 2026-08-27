/**
 * Guardian (khôi-phục xã-hội) — dựng proof_signature + gọi API.md §6
 * `POST /guardians/add · /guardians/remove`.
 *
 * ⛔ CHƯA KIỂM LẠI — CHUỖI KÝ DƯỚI ĐÂY GẦN CHẮC KHÔNG CÒN VERIFY ĐƯỢC.
 *
 * Chú thích cũ ở đây ghi "✅ ĐÃ ĐỐI-CHIẾU backend GuardianServiceImpl.java
 * (2026-07-27) … KHỚP đúng cách dựng dưới đây". Nhãn đó ĐÚNG vào ngày viết và
 * SAI từ lúc máy chủ đổi, mà không có gì trong kho này bật lên khi nó hết đúng.
 *
 * Nhà PhoenixKey báo 2026-08-27 (thư `ma:pk-canon-len`), dẫn `GuardianServiceImpl
 * .java:84`, rằng máy chủ đã đổi từ **V30**:
 *
 *   CanonicalMessage.build(GUARDIAN_ADD_PREFIX, userDid, guardianDid, nonce,
 *                          String.valueOf(opSeq))
 *
 * Lệch HAI chỗ, không phải một:
 *   1. đóng khung theo độ dài (`canonicalMessage.ts`) thay cho nối `':'`;
 *   2. có thêm field THỨ TƯ `opSeq` — watermark chống phát lại.
 *
 * ══ Vì sao KHÔNG tự đổi một phía ngay tại đây ═════════════════════════════════
 * Phần (1) app dựng được rồi (`buildCanonicalHex`). Phần (2) thì KHÔNG: `opSeq`
 * không tồn tại ở bất cứ đâu trong kho này (`grep -rn "opSeq\|op_seq" src/` ⇒ 0),
 * và app cũng không có cửa nào ĐỌC ra nó — cụm `guardians` chỉ có `add`/`remove`,
 * không có đường đọc danh sách. Đổi nửa vời sang đóng khung mà thiếu field thứ tư
 * thì chữ ký vẫn không verify, nhưng mã lại TRÔNG như đã sửa xong — đắt hơn hẳn
 * so với để nguyên kèm lời khai này.
 *
 * ══ Mức chắc của chính lời khai này ══════════════════════════════════════════
 * Nhà này CHƯA tự chạy luồng guardian trên máy chủ thật lần nào. Bằng chứng ở đây
 * là trích dẫn mã nguồn của nhà PhoenixKey, không phải phép đo của nhà này. Chính
 * họ cũng viết: "Nếu bên đó đã chạy thật được luồng này thì nói lại, vì khi ấy
 * phép đo của bên này sai." Đã hỏi lại `opSeq` lấy ở đâu; chưa có đáp.
 *
 * Body { user_did, guardian_did, nonce, proof_signature }. Nonce TTL 5' (validateAndConsume).
 */

import taad from '../sdk/taadEnclave';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyApi, GuardianMutateRequest } from './phoenixKey-api';

// Tên tiền tố vẫn khớp GUARDIAN_ADD_PREFIX/REMOVE_PREFIX; cách GHÉP thì không — xem đầu tệp.
const CHALLENGE_ADD = 'PHOENIXKEY_GUARDIAN_ADD';
const CHALLENGE_REMOVE = 'PHOENIXKEY_GUARDIAN_REMOVE';

// message chỉ gồm DID (did:phoenix ASCII) + nonce (hex) + prefix → ASCII; vẫn xử-lý
// đa-byte cho chắc (không phụ-thuộc TextEncoder, khớp utf8ToHex bên authService).
const utf8ToHex = (s: string): string => {
  const push = (b: number) => b.toString(16).padStart(2, '0');
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const code = s.codePointAt(i)!;
    if (code < 0x80) {
      out += push(code);
    } else if (code < 0x800) {
      out += push(0xc0 | (code >> 6)) + push(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out += push(0xe0 | (code >> 12)) + push(0x80 | ((code >> 6) & 0x3f)) + push(0x80 | (code & 0x3f));
    } else {
      out += push(0xf0 | (code >> 18)) + push(0x80 | ((code >> 12) & 0x3f)) +
        push(0x80 | ((code >> 6) & 0x3f)) + push(0x80 | (code & 0x3f));
      i += 1; // surrogate pair
    }
  }
  return out;
};

async function buildProof(
  prefix: string,
  guardianDid: string,
): Promise<GuardianMutateRequest> {
  const userDid = await currentUserDid();
  if (!userDid) throw new Error('Chưa có danh tính để ký xác nhận người giám hộ.');
  const nonce = await taad.generateSalt();
  const message = `${prefix}:${userDid}:${guardianDid}:${nonce}`;
  const proofSignature = await signRaw(
    utf8ToHex(message),
    'Xác nhận guardian',
    'Ký bằng khoá phần cứng của bạn',
  );
  return { userDid, guardianDid, nonce, proofSignature };
}

/** Thêm guardian: ký proof rồi POST /guardians/add. */
export async function addGuardian(guardianDid: string): Promise<void> {
  await phoenixKeyApi.guardians.add(await buildProof(CHALLENGE_ADD, guardianDid));
}

/** Bớt guardian: ký proof rồi POST /guardians/remove. */
export async function removeGuardian(guardianDid: string): Promise<void> {
  await phoenixKeyApi.guardians.remove(await buildProof(CHALLENGE_REMOVE, guardianDid));
}
