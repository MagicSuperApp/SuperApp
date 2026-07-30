/**
 * Guardian (khôi-phục xã-hội) — dựng proof_signature + gọi API.md §6
 * `POST /guardians/add · /guardians/remove`.
 *
 * ✅ ĐÃ ĐỐI-CHIẾU backend GuardianServiceImpl.java (2026-07-27):
 *   message = "PHOENIXKEY_GUARDIAN_ADD:" + userDid + ":" + guardianDid + ":" + nonce
 *             (remove dùng "PHOENIXKEY_GUARDIAN_REMOVE:"), verify bằng owner-key ACTIVE
 *   qua verifyEcdsa (SHA256withECDSA secp256r1) — KHỚP đúng cách dựng dưới đây.
 * Body { user_did, guardian_did, nonce, proof_signature }. Nonce TTL 5' (validateAndConsume).
 */

import taad from '../sdk/taadEnclave';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyApi, GuardianMutateRequest } from './phoenixKey-api';

// Khớp GUARDIAN_ADD_PREFIX/REMOVE_PREFIX trong GuardianServiceImpl.java (đã đối-chiếu).
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
  if (!userDid) throw new Error('Chưa có danh tính (DID) để ký xác nhận guardian.');
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
