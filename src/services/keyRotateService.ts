/**
 * keyRotateService — XOAY KHOÁ owner DID (POST /keys/rotate).
 *
 * Keystore/Secure Enclave KHÔNG cho đổi tên khoá → xoay = sinh khoá dưới alias MỚI
 * (nextOwnerAlias) rồi trỏ con trỏ owner sang đó. Thứ tự AN TOÀN + rollback:
 *   1) sinh khoá MỚI (alias next) — KHÔNG đụng khoá cũ.
 *   2) ký "PHOENIXKEY_ROTATE:<newPubkey>:<nonce>" bằng khoá CŨ (biometric khoá cũ).
 *   3) POST /keys/rotate → backend publish updateDID on-chain.
 *   4) CHỈ KHI backend OK: trỏ con trỏ → khoá mới, rồi xoá khoá cũ.
 *   ✗ Lỗi bất kỳ → xoá khoá MỚI (rollback), GIỮ con trỏ ở khoá cũ (identity không đổi).
 *
 * ⚠️ PHẢI test trên MÁY THẬT: biometric prompt bằng khoá cũ + backend chấp nhận +
 * đăng nhập sau đó ký được bằng khoá mới. KHÔNG bao giờ xoá khoá cũ trước khi BE xác nhận.
 */

import taad from '../sdk/taadEnclave';
import {
  getOwnerAlias, setOwnerAlias, nextOwnerAlias, currentUserDid,
} from '../sdk/phoenixKey';
import {
  generateKeypair as nativeGenerateKeypair,
  sign as nativeSign,
  deleteKey as nativeDeleteKey,
} from './phoenixKey-native';
import { phoenixKeyApi } from './phoenixKey-api';

// Message rotate là ASCII (prefix + hex pubkey + hex nonce) → char-code sang hex.
const asciiToHex = (s: string): string =>
  Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

/**
 * Xoay khoá owner. Trả { newPublicKeyHex, txHash } khi thành công. Ném nếu thiếu DID,
 * user huỷ biometric, hoặc backend từ chối (đã rollback khoá mới).
 */
export async function rotateOwnerKey(): Promise<{ newPublicKeyHex: string; txHash: string }> {
  const userDid = await currentUserDid();
  if (!userDid) throw new Error('Chưa có danh tính (DID) để xoay khoá.');

  const cur = await getOwnerAlias();
  const next = nextOwnerAlias(cur);

  // 1) Sinh khoá MỚI dưới alias next (không đụng khoá cũ). Biometric enrol.
  const { publicKeyHex: newPublicKeyHex } = await nativeGenerateKeypair(next, true);

  try {
    // 2) nonce dùng-1-lần + ký challenge bằng khoá CŨ (chứng minh sở hữu khoá cũ).
    const nonce = await taad.generateSalt();
    const message = `PHOENIXKEY_ROTATE:${newPublicKeyHex}:${nonce}`;
    const oldKeySignature = await nativeSign(
      cur, asciiToHex(message), 'Xoay khoá bảo mật', 'Xác nhận bằng khoá hiện tại của bạn',
    );

    // 3) Backend verify chữ ký khoá cũ rồi build+submit updateDID → txHash.
    const { txHash } = await phoenixKeyApi.keys.rotate({
      userDid,
      newPublicKeyHex,
      keyOrigin: 'SECURE_ENCLAVE',
      nonce,
      oldKeySignature,
    });

    // 4) THÀNH CÔNG: chuyển con trỏ sang khoá mới TRƯỚC, rồi mới xoá khoá cũ.
    await setOwnerAlias(next);
    try { await nativeDeleteKey(cur); } catch { /* best-effort — khoá cũ dọn sau cũng được */ }

    return { newPublicKeyHex, txHash };
  } catch (e) {
    // Rollback: xoá khoá MỚI, giữ con trỏ ở khoá cũ. Identity nguyên vẹn.
    try { await nativeDeleteKey(next); } catch { /* ignore */ }
    throw e;
  }
}
