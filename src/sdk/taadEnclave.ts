/**
 * TaadEnclave — JS wrapper cho Rust core `taad_enclave_core` (PhoenixKey Enclave).
 *
 * Native module `TaadEnclaveModule` (iOS Swift + Android Kotlin) gọi vào Rust FFI:
 *   - iOS:     ios/LocalPods/ScannerModule/Core/Enclave/TaadEnclaveModule.swift
 *              → import taad_enclave_core (pod, libtaad_enclave_core.a + cbindgen .h)
 *   - Android: android/.../TaadEnclaveModule.kt → System.loadLibrary + JNI shim
 *              (rust/taad_enclave_core/src/android_jni.rs)
 *
 * Phase 1 — chỉ seed/Master_KEK (BIP39 24 từ):
 *   generateMasterKek()        → 64-hex Master_KEK ngẫu nhiên (256-bit entropy)
 *   masterKekToMnemonic(kek)   → cụm 24 từ BIP39 (= bản sao lưu KEK)
 *   mnemonicToMasterKek(words) → 64-hex KEK (ném nếu cụm từ sai checksum/wordlist)
 *
 * SECURITY: Master_KEK / 24 từ TƯƠNG ĐƯƠNG gốc-tin-cậy. KHÔNG log/persist thô;
 * chỉ hiển thị 1 lần cho người dùng tự lưu (xem SeedExportScreen).
 */

import { NativeModules, Platform } from 'react-native';

interface TaadEnclaveNativeBridge {
  generateMasterKek(): Promise<string>;
  masterKekToMnemonic(kekHex: string): Promise<string>;
  mnemonicToMasterKek(words: string): Promise<string>;
  // Derive (composed, khớp Enclave)
  deriveTaadPubkey(kekHex: string): Promise<string>;
  deriveWalletSeed(kekHex: string): Promise<string>;
  deriveWalletAddress(kekHex: string, account: number, network: number): Promise<string>;
  deriveStakeAddress(kekHex: string, account: number, network: number): Promise<string>;
  // Wrapping primitives
  generateSalt(): Promise<string>;
  pbkdf2Derive(pin: string, saltHex: string): Promise<string>;
  aesGcmEncrypt(keyHex: string, plaintextHex: string): Promise<string>;
  aesGcmDecrypt(keyHex: string, encryptedJson: string): Promise<string>;
  // Ký Ed25519 bằng TAAD_Key (từ Master_KEK) — recover-device, on-chain challenge.
  signEd25519(masterKekHex: string, message: string): Promise<string>;
  // Secure storage (Keychain iOS / Keystore-AES Android)
  secureStore(key: string, value: string): Promise<boolean>;
  secureLoad(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<boolean>;
}

const moduleNotAvailable = (): TaadEnclaveNativeBridge => {
  const reject = (method: string) =>
    Promise.reject(
      new Error(
        `TaadEnclave native module not available on ${Platform.OS}. ` +
          `Method '${method}' requires the Rust core (taad_enclave_core).`,
      ),
    );
  return {
    generateMasterKek: () => reject('generateMasterKek') as never,
    masterKekToMnemonic: () => reject('masterKekToMnemonic') as never,
    mnemonicToMasterKek: () => reject('mnemonicToMasterKek') as never,
    deriveTaadPubkey: () => reject('deriveTaadPubkey') as never,
    deriveWalletSeed: () => reject('deriveWalletSeed') as never,
    deriveWalletAddress: () => reject('deriveWalletAddress') as never,
    deriveStakeAddress: () => reject('deriveStakeAddress') as never,
    generateSalt: () => reject('generateSalt') as never,
    pbkdf2Derive: () => reject('pbkdf2Derive') as never,
    aesGcmEncrypt: () => reject('aesGcmEncrypt') as never,
    aesGcmDecrypt: () => reject('aesGcmDecrypt') as never,
    signEd25519: () => reject('signEd25519') as never,
    secureStore: () => reject('secureStore') as never,
    secureLoad: () => reject('secureLoad') as never,
    secureDelete: () => reject('secureDelete') as never,
  };
};

const bridge: TaadEnclaveNativeBridge =
  NativeModules.TaadEnclaveModule
    ? (NativeModules.TaadEnclaveModule as TaadEnclaveNativeBridge)
    : moduleNotAvailable();

/** True khi native bridge (Rust core) sẵn sàng trên nền-tảng hiện tại. */
export const isAvailable = (): boolean => !!NativeModules.TaadEnclaveModule;

/** Sinh Master_KEK 256-bit ngẫu nhiên → 64-hex. */
export const generateMasterKek = (): Promise<string> => bridge.generateMasterKek();

/** Master_KEK (64-hex) → cụm 24 từ BIP39. */
export const masterKekToMnemonic = (kekHex: string): Promise<string> =>
  bridge.masterKekToMnemonic(kekHex);

/** Cụm 24 từ BIP39 → Master_KEK (64-hex). Reject nếu cụm từ không hợp lệ. */
export const mnemonicToMasterKek = (words: string): Promise<string> =>
  bridge.mnemonicToMasterKek(words.trim().replace(/\s+/g, ' ').toLowerCase());

// ── Derive (composed, khớp Enclave) ───────────────────────────────────────────

/** TAAD_Key (Ed25519) pubkey hex từ Master_KEK. */
export const deriveTaadPubkey = (kekHex: string): Promise<string> =>
  bridge.deriveTaadPubkey(kekHex);

/** Wallet seed (32-byte hex) từ Master_KEK. */
export const deriveWalletSeed = (kekHex: string): Promise<string> =>
  bridge.deriveWalletSeed(kekHex);

/** Địa chỉ Cardano Shelley (Bech32). network: 0=preprod, 1=mainnet. account: 0=cố định, ≥1=hoạt động. */
export const deriveWalletAddress = (
  kekHex: string,
  account = 0,
  network = 0,
): Promise<string> => bridge.deriveWalletAddress(kekHex, account, network);

/**
 * Địa chỉ STAKE (reward) Cardano — bech32 `stake_test1…` (preprod) / `stake1…` (mainnet).
 * Cùng CIP-1852 với ví, chỉ khác nhánh role 2 (m/1852'/1815'/account'/2/0).
 * Dùng cho PhoenixKey `/wallet/standard/register` (field `stake_address`) + staking.
 * network: 0=preprod, 1=mainnet. account: 0=cố định, ≥1=hoạt động.
 */
export const deriveStakeAddress = (
  kekHex: string,
  account = 0,
  network = 0,
): Promise<string> => bridge.deriveStakeAddress(kekHex, account, network);

// ── Wrapping primitives (dùng để wrap/unwrap Master_KEK khi persist) ──────────

/** Sinh salt ngẫu nhiên (hex). */
export const generateSalt = (): Promise<string> => bridge.generateSalt();

/** Device_KEK 32-byte hex = PBKDF2-HMAC-SHA256(pin, salt). */
export const pbkdf2Derive = (pin: string, saltHex: string): Promise<string> =>
  bridge.pbkdf2Derive(pin, saltHex);

/** AES-256-GCM encrypt → JSON {"ciphertext","iv"}. */
export const aesGcmEncrypt = (keyHex: string, plaintextHex: string): Promise<string> =>
  bridge.aesGcmEncrypt(keyHex, plaintextHex);

/** AES-256-GCM decrypt (encryptedJson) → plaintext hex. Reject nếu sai khoá. */
export const aesGcmDecrypt = (keyHex: string, encryptedJson: string): Promise<string> =>
  bridge.aesGcmDecrypt(keyHex, encryptedJson);

/**
 * Ký Ed25519 bằng TAAD_Key phái sinh từ Master_KEK. Trả chữ-ký (hex).
 * Dùng cho recover-device (ký challenge khôi phục) + các thao-tác on-chain cần
 * chữ-ký khoá controller. `message` là chuỗi cần ký (UTF-8), khớp hợp-đồng backend.
 */
export const signEd25519 = (masterKekHex: string, message: string): Promise<string> =>
  bridge.signEd25519(masterKekHex, message);

// ── Secure storage (Keychain iOS / Keystore-AES Android) ──────────────────────

/** Lưu chuỗi an toàn (hardware-backed, device-bound). Ghi đè nếu key đã có. */
export const secureStore = (key: string, value: string): Promise<boolean> =>
  bridge.secureStore(key, value);

/** Đọc chuỗi đã lưu; null nếu chưa có. */
export const secureLoad = (key: string): Promise<string | null> =>
  bridge.secureLoad(key);

/** Xoá key khỏi secure storage. */
export const secureDelete = (key: string): Promise<boolean> =>
  bridge.secureDelete(key);

export default {
  isAvailable,
  generateMasterKek,
  masterKekToMnemonic,
  mnemonicToMasterKek,
  deriveTaadPubkey,
  deriveWalletSeed,
  deriveWalletAddress,
  deriveStakeAddress,
  generateSalt,
  pbkdf2Derive,
  aesGcmEncrypt,
  aesGcmDecrypt,
  signEd25519,
  secureStore,
  secureLoad,
  secureDelete,
};
