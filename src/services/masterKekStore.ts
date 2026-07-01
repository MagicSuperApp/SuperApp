/**
 * masterKekStore — Quản lý Master_KEK BỀN VỮNG của ví (PhoenixKey Enclave).
 *
 * Master_KEK (32 byte) = gốc của VÍ (Cardano/LAMP/MAGIC) + nguồn của cụm 24 từ.
 * KHÁC với khoá HW (Secure Enclave/Keystore) vốn là DID identity (did_auth) —
 * xem [[taad-enclave-rust-port]]. KEK được sinh MỘT LẦN rồi lưu an toàn để:
 *   - SeedExport hiện CÙNG 24 từ mỗi lần (backup nhất quán),
 *   - derive ra TAAD_Key (Ed25519) + địa chỉ Cardano ổn định.
 *
 * Lưu: taad.secureStore (iOS Keychain WhenUnlockedThisDeviceOnly / Android
 * Keystore-AES + SharedPreferences) — hardware-backed, device-bound. v1 lưu KEK
 * trực tiếp trong secure storage (đủ an toàn; 24 từ là đường khôi phục độc lập).
 * v2 có thể bọc thêm PBKDF2(PIN)+AES (đã phơi sẵn taad.pbkdf2Derive/aesGcm*).
 *
 * SECURITY: KEK/24 từ tương đương gốc-tin-cậy ví — KHÔNG log/đẩy server thô.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import taad from '../sdk/taadEnclave';

const KEK_KEY = 'taad_master_kek_v1';
// Index ví HOẠT ĐỘNG (không bí mật → AsyncStorage). account 0 = ví CỐ ĐỊNH (kho/
// định danh, bất biến); hoạt động bắt đầu ở 1, xoay tăng dần (off-chain, cùng KEK).
const ACTIVE_ACCOUNT_KEY = 'taad_active_account_v1';

/** Master_KEK đã lưu (64-hex) hoặc null nếu thiết bị chưa có ví. */
export async function getStoredMasterKek(): Promise<string | null> {
  if (!taad.isAvailable()) return null;
  return taad.secureLoad(KEK_KEY);
}

/** Thiết bị đã có Master_KEK ví chưa. */
export async function hasMasterKek(): Promise<boolean> {
  return (await getStoredMasterKek()) != null;
}

/**
 * Lấy KEK đã lưu; nếu CHƯA có thì sinh mới + lưu (khởi tạo ví lần đầu).
 * Trả KEK 64-hex. Ném nếu Rust core chưa sẵn sàng.
 */
export async function getOrCreateMasterKek(): Promise<string> {
  const existing = await taad.secureLoad(KEK_KEY);
  if (existing) return existing;
  const kek = await taad.generateMasterKek();
  await taad.secureStore(KEK_KEY, kek);
  return kek;
}

/**
 * Khôi phục ví từ cụm 24 từ: validate → Master_KEK → lưu (GHI ĐÈ KEK hiện có).
 * Trả KEK 64-hex. Ném nếu cụm từ không hợp lệ.
 */
export async function restoreMasterKekFromMnemonic(words: string): Promise<string> {
  const kek = await taad.mnemonicToMasterKek(words); // reject nếu checksum/wordlist sai
  await taad.secureStore(KEK_KEY, kek);
  return kek;
}

/** Xoá Master_KEK ví khỏi thiết bị (vd wipe). KHÔNG đụng khoá HW/DID. */
export async function clearMasterKek(): Promise<void> {
  await taad.secureDelete(KEK_KEY);
}

// ── Ví hoạt động (account index, off-chain) ───────────────────────────────────

/** Index ví hoạt động hiện tại (≥1). Mặc định 1 nếu chưa xoay lần nào. */
export async function getActiveAccountIndex(): Promise<number> {
  const s = await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
  const n = s ? parseInt(s, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Xoay ví hoạt động sang account kế (index+1). Trả index mới. account 0 (cố định)
 * KHÔNG đổi; cùng Master_KEK nên 24 từ vẫn khôi phục mọi ví đã xoay. */
export async function rotateActiveAccount(): Promise<number> {
  const next = (await getActiveAccountIndex()) + 1;
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, String(next));
  return next;
}
