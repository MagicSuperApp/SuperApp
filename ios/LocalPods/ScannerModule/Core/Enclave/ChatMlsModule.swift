import Foundation
import React
import chat_mls

/// RN bridge cho Rust core `chat_mls` (ProofChat E2EE) — iOS.
///
/// FFI hợp đồng (rust/chat_mls/src/ffi.rs): hàm trả `*mut c_char` → caller PHẢI free
/// bằng `chat_mls_free_string`. Input là chuỗi UTF-8 null-terminated.
///
/// Handle danh tính là con trỏ 64-bit → giữ NỘI BỘ (1 danh tính hiện hành), không đẩy
/// qua JS. Hàm thao tác trả CHUỖI JSON `{"ok":bool,...}` — JS parse & throw nếu ok=false.
@objc(ChatMlsModule)
final class ChatMlsModule: NSObject {

    @objc static func moduleName() -> String! { "ChatMlsModule" }
    @objc static func requiresMainQueueSetup() -> Bool { false }

    private var handle: UInt64 = 0

    // MARK: - helpers

    /// ptr C (JSON) → String (free) hoặc reject nếu null.
    private func resolveJson(_ ptr: UnsafeMutablePointer<CChar>?,
                             _ resolve: RCTPromiseResolveBlock,
                             _ reject: RCTPromiseRejectBlock) {
        guard let ptr = ptr else { reject("E_CHAT_MLS", "native trả NULL", nil); return }
        defer { chat_mls_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    private func requireHandle(_ reject: RCTPromiseRejectBlock) -> UInt64? {
        if handle == 0 { reject("E_NO_IDENTITY", "Chưa có danh tính (gọi newIdentity/importState trước)", nil); return nil }
        return handle
    }

    // MARK: - vòng đời danh tính

    @objc(newIdentity:resolver:rejecter:)
    func newIdentity(_ stakeAddress: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        if handle != 0 { chat_mls_free(handle); handle = 0 }
        let h = stakeAddress.withCString { chat_mls_new($0) }
        if h == 0 { reject("E_IDENTITY", "Tạo danh tính thất bại", nil); return }
        handle = h
        resolve(true)
    }

    @objc(importState:resolver:rejecter:)
    func importState(_ stateB64: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        if handle != 0 { chat_mls_free(handle); handle = 0 }
        let h = stateB64.withCString { chat_mls_import_state($0) }
        if h == 0 { reject("E_IMPORT", "Khôi phục trạng thái thất bại", nil); return }
        handle = h
        resolve(true)
    }

    @objc(hasIdentity:rejecter:)
    func hasIdentity(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(handle != 0)
    }

    @objc(freeIdentity:rejecter:)
    func freeIdentity(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        if handle != 0 { chat_mls_free(handle); handle = 0 }
        resolve(true)
    }

    // MARK: - thao tác (trả JSON)

    @objc(exportState:rejecter:)
    func exportState(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        resolveJson(chat_mls_export_state(h), resolve, reject)
    }

    @objc(generateKeyPackage:rejecter:)
    func generateKeyPackage(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        resolveJson(chat_mls_generate_key_package(h), resolve, reject)
    }

    @objc(createGroup:memberKeyPackagesJson:resolver:rejecter:)
    func createGroup(_ conversationId: String,
                     memberKeyPackagesJson: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        let out = conversationId.withCString { c in
            memberKeyPackagesJson.withCString { m in chat_mls_create_group(h, c, m) }
        }
        resolveJson(out, resolve, reject)
    }

    @objc(joinFromWelcome:resolver:rejecter:)
    func joinFromWelcome(_ welcomeB64: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        let out = welcomeB64.withCString { chat_mls_join_from_welcome(h, $0) }
        resolveJson(out, resolve, reject)
    }

    @objc(processCommit:commitB64:resolver:rejecter:)
    func processCommit(_ conversationId: String,
                       commitB64: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        let out = conversationId.withCString { c in
            commitB64.withCString { m in chat_mls_process_commit(h, c, m) }
        }
        resolveJson(out, resolve, reject)
    }

    @objc(encrypt:plaintext:resolver:rejecter:)
    func encrypt(_ conversationId: String,
                 plaintext: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        let out = conversationId.withCString { c in
            plaintext.withCString { m in chat_mls_encrypt(h, c, m) }
        }
        resolveJson(out, resolve, reject)
    }

    @objc(decrypt:bodyB64:resolver:rejecter:)
    func decrypt(_ conversationId: String,
                 bodyB64: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let h = requireHandle(reject) else { return }
        let out = conversationId.withCString { c in
            bodyB64.withCString { m in chat_mls_decrypt(h, c, m) }
        }
        resolveJson(out, resolve, reject)
    }
}
