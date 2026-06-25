import Foundation
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
}
