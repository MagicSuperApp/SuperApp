import Foundation
import Security
import React
import taad_enclave_core

/// RN bridge cho Rust core `taad_enclave_core` (PhoenixKey Enclave).
///
/// Phase 1 — chỉ phơi 4 hàm seed/Master_KEK (BIP39 24 từ):
///   - generateMasterKek()           → 64-hex Master_KEK ngẫu nhiên
///   - masterKekToMnemonic(kekHex)    → cụm 24 từ BIP39
///   - mnemonicToMasterKek(words)     → 64-hex KEK (reject nếu cụm từ sai)
///
/// FFI hợp đồng (lib.rs): hàm trả `*mut c_char` → caller PHẢI free bằng
/// `taad_free_string`. Input là chuỗi UTF-8 null-terminated. NULL = lỗi.
///
/// Các hàm Cardano/tx/lampnet trong crate sẽ phơi dần ở các phase sau.
@objc(TaadEnclaveModule)
final class TaadEnclaveModule: NSObject {

    @objc static func moduleName() -> String! { "TaadEnclaveModule" }
    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Master_KEK + BIP39

    @objc(generateMasterKek:rejecter:)
    func generateMasterKek(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let ptr = taad_generate_master_kek() else {
            reject("E_KEK_GEN", "taad_generate_master_kek trả NULL", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(masterKekToMnemonic:resolver:rejecter:)
    func masterKekToMnemonic(_ kekHex: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = kekHex.withCString { cstr in
            taad_master_kek_to_mnemonic(cstr)
        }
        guard let ptr = out else {
            reject("E_KEK_TO_MNEMONIC", "Master_KEK không hợp lệ (cần 64-hex)", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(mnemonicToMasterKek:resolver:rejecter:)
    func mnemonicToMasterKek(_ words: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = words.withCString { cstr in
            taad_mnemonic_to_master_kek(cstr)
        }
        guard let ptr = out else {
            reject("E_MNEMONIC_INVALID", "Cụm từ khôi phục không hợp lệ", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    // MARK: - Derive (composed) + wrapping primitives

    /// Gói: ptr C → String (free) hoặc reject nếu null.
    private func resolvePtr(_ ptr: UnsafeMutablePointer<CChar>?,
                            _ resolve: RCTPromiseResolveBlock,
                            _ reject: RCTPromiseRejectBlock,
                            _ code: String, _ msg: String) {
        guard let ptr = ptr else { reject(code, msg, nil); return }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(deriveTaadPubkey:resolver:rejecter:)
    func deriveTaadPubkey(_ kekHex: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { taad_kek_derive_taad_pubkey($0) }
        resolvePtr(out, resolve, reject, "E_DERIVE_TAAD", "Master_KEK không hợp lệ")
    }

    @objc(deriveWalletSeed:resolver:rejecter:)
    func deriveWalletSeed(_ kekHex: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { taad_kek_derive_wallet_seed($0) }
        resolvePtr(out, resolve, reject, "E_DERIVE_SEED", "Master_KEK không hợp lệ")
    }

    @objc(deriveWalletAddress:account:network:resolver:rejecter:)
    func deriveWalletAddress(_ kekHex: String,
                             account: Int,
                             network: Int,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString {
            taad_kek_derive_wallet_address($0, UInt32(account), UInt8(network))
        }
        resolvePtr(out, resolve, reject, "E_DERIVE_ADDR", "Không derive được địa chỉ Cardano")
    }

    @objc(generateSalt:rejecter:)
    func generateSalt(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolvePtr(taad_generate_salt(), resolve, reject, "E_SALT", "Không sinh được salt")
    }

    @objc(pbkdf2Derive:saltHex:resolver:rejecter:)
    func pbkdf2Derive(_ pin: String,
                      saltHex: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = pin.withCString { p in saltHex.withCString { s in taad_pbkdf2_derive(p, s) } }
        resolvePtr(out, resolve, reject, "E_PBKDF2", "PBKDF2 thất bại")
    }

    @objc(aesGcmEncrypt:plaintextHex:resolver:rejecter:)
    func aesGcmEncrypt(_ keyHex: String,
                       plaintextHex: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = keyHex.withCString { k in plaintextHex.withCString { p in taad_aes_gcm_encrypt(k, p) } }
        resolvePtr(out, resolve, reject, "E_AES_ENC", "Mã hoá AES-GCM thất bại")
    }

    @objc(aesGcmDecrypt:encryptedJson:resolver:rejecter:)
    func aesGcmDecrypt(_ keyHex: String,
                       encryptedJson: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = keyHex.withCString { k in encryptedJson.withCString { j in taad_aes_gcm_decrypt(k, j) } }
        resolvePtr(out, resolve, reject, "E_AES_DEC", "Giải mã AES-GCM thất bại (sai khoá?)")
    }

    // MARK: - Secure storage (Keychain, WhenUnlockedThisDeviceOnly)

    private let secureService = "com.orilife.taad.secure"

    private func secureQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: secureService,
            kSecAttrAccount as String: key,
        ]
    }

    @objc(secureStore:value:resolver:rejecter:)
    func secureStore(_ key: String,
                     value: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        SecItemDelete(secureQuery(key) as CFDictionary) // ghi đè nếu đã có
        var add = secureQuery(key)
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess {
            resolve(true)
        } else {
            reject("E_SECURE_STORE", "Keychain add failed (\(status))", nil)
        }
    }

    @objc(secureLoad:resolver:rejecter:)
    func secureLoad(_ key: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        var query = secureQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data,
           let s = String(data: data, encoding: .utf8) {
            resolve(s)
        } else if status == errSecItemNotFound {
            resolve(nil)
        } else {
            reject("E_SECURE_LOAD", "Keychain read failed (\(status))", nil)
        }
    }

    @objc(secureDelete:resolver:rejecter:)
    func secureDelete(_ key: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = SecItemDelete(secureQuery(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            resolve(true)
        } else {
            reject("E_SECURE_DELETE", "Keychain delete failed (\(status))", nil)
        }
    }
}
