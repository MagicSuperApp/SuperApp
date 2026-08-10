/**
 * deviceKeyService — bật 2-Factor DeviceKey (Issue #28).
 *
 * Luồng:
 *   1) native sinh Ed25519 NGẪU NHIÊN (per-device) + ký canonical opt-in.
 *   2) LƯU secret vào K_bio (secureStore, Keychain/Keystore) để cosign 2of2 sau.
 *   3) POST /identity/{did}/device-key { devicePublicKeyHex, signature, nonce }.
 *
 * Sau opt-in, IdentityHealth trả has_device_key=true + requires_device_cosign=true;
 * mobile hiển thị "cần sinh trắc" trước khi ký tx sinh spend (khi validator 2of2 deploy).
 */

import taad from '../sdk/taadEnclave';
import { currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyApi } from './phoenixKey-api';

/** Khoá secure-storage cho seed device key (Keychain iOS / Keystore-AES Android). */
export const DEVICE_KEY_SEED_STORAGE = 'phoenix_device_key_seed';

/**
 * Đã bật DeviceKey trên máy này chưa (có secret lưu K_bio). Không gọi mạng.
 * Best-effort — lỗi đọc secure storage → coi như chưa bật.
 */
export async function hasLocalDeviceKey(): Promise<boolean> {
  try {
    const v = await taad.secureLoad(DEVICE_KEY_SEED_STORAGE);
    return !!v;
  } catch {
    return false;
  }
}

/**
 * Bật 2FA DeviceKey. Trả về devicePublicKeyHex đã đăng ký. Ném lỗi nếu thiếu
 * native / DID / session, hoặc backend từ chối (vd chưa deploy — 404/501).
 */
export async function enableDeviceKey(): Promise<{ devicePublicKeyHex: string }> {
  if (!taad.isAvailable()) {
    throw new Error('Thiết bị chưa hỗ trợ khoá bảo mật.');
  }
  const userDid = await currentUserDid();
  if (!userDid) {
    throw new Error('Chưa có danh tính để bật xác thực hai lớp.');
  }

  // nonce dùng-1-lần (TTL 5' phía backend). generateSalt = 16 byte hex.
  const nonce = await taad.generateSalt();

  // 1) Native sinh khoá + ký canonical opt-in.
  const proof = await taad.deviceKeyOptin(userDid, nonce);

  // 2) Lưu secret vào K_bio TRƯỚC khi gọi backend — mất secret sau khi đăng ký thì
  //    không cosign được. Nếu lưu lỗi → dừng, không đăng ký nửa vời.
  await taad.secureStore(DEVICE_KEY_SEED_STORAGE, proof.secretHex);

  // 3) Đăng ký pubkey + proof lên backend.
  await phoenixKeyApi.identity.deviceKeyOptIn(userDid, {
    devicePublicKeyHex: proof.publicKeyHex,
    signature: proof.signature,
    nonce,
  });

  return { devicePublicKeyHex: proof.publicKeyHex };
}
