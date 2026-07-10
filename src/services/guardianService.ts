/**
 * Guardian (khôi-phục xã-hội) — dựng proof_signature + gọi API.md §6
 * `POST /guardians/add · /guardians/remove`.
 *
 * ⚠️ QUAN TRỌNG: API.md §6 CHỈ ghi body `{ user_did, guardian_did, nonce, proof_signature }`
 * mà KHÔNG mô-tả chuỗi challenge của proof_signature. Client dựng theo mẫu nhất-quán của
 * PhoenixKey ("PHOENIXKEY_<ACTION>:<fields>:<nonce>", như GENESIS/RECOVER/ROTATE) và ký
 * bằng khoá HW owner (DER ECDSA secp256r1 — cùng khoá owner ký genesis). Nếu backend
 * verify khác chuỗi/khoá → CHỈ cần sửa CHALLENGE_* dưới đây. Chờ anh Đức chốt hợp-đồng.
 */

import taad from '../sdk/taadEnclave';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyApi, GuardianMutateRequest } from './phoenixKey-api';

// Suy-luận (chưa có trong API.md) — sửa tại đây khi anh Đức xác nhận.
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
