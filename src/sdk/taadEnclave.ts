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

export default {
  isAvailable,
  generateMasterKek,
  masterKekToMnemonic,
  mnemonicToMasterKek,
};
