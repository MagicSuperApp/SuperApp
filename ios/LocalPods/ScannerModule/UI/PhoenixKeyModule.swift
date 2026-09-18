import Foundation
import LocalAuthentication
import Security
import React

@objc(PhoenixKeyModule)
final class PhoenixKeyModule: NSObject {
    @objc static func moduleName() -> String! {
        return "PhoenixKeyModule"
    }

    @objc static func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc(generateKeypair:requireBiometric:resolver:rejecter:)
    func generateKeypair(_ alias: String,
                         requireBiometric: Bool,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            if hasKeySync(alias: alias) {
                reject("E_KEY_EXISTS", "Keypair with alias '\(alias)' already exists", nil)
                return
            }

            guard let access = makeAccessControl(requireBiometric: requireBiometric) else {
                reject("E_KEYGEN_FAILED", "Failed to create key access control", nil)
                return
            }

            let tag = aliasTag(alias)
            var attrs: [String: Any] = [
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeySizeInBits as String: 256,
                kSecPrivateKeyAttrs as String: [
                    kSecAttrIsPermanent as String: true,
                    kSecAttrApplicationTag as String: tag,
                    kSecAttrAccessControl as String: access,
                ],
            ]

            // Secure Enclave chỉ có trên máy THẬT. Trên máy ảo, `SecKeyCreateRandomKey`
            // trả `errSecAuthFailed` (-25293) và app dừng ở bước lập danh tính — tức là
            // KHÔNG màn nào sau đăng nhập mở được để thử hay để chụp ảnh hồ sơ cửa hàng.
            //
            // Nhánh dưới đổi sang khoá phần mềm trong keychain, và CHỈ tồn tại ở lát
            // máy ảo: `#if targetEnvironment(simulator)` do trình biên dịch cắt, nên
            // lát `iphoneos` — thứ duy nhất ký được và nộp được lên cửa hàng — không
            // mang một byte nào của nhánh này. Đừng gỡ dấu khoanh để "cho gọn".
            //
            // Đánh đổi phải biết: khoá phần mềm KHÔNG được chip bảo vệ, nên bản máy ảo
            // yếu hơn bản máy thật đúng ở điểm mà lời hứa "khoá không rời thiết bị"
            // đang neo vào. Bản máy ảo vì thế chỉ dùng để thử và chụp ảnh, không phải
            // thứ đem đo mức an toàn.
            #if targetEnvironment(simulator)
            _ = access
            var simError: Unmanaged<CFError>?
            var simPrivateAttrs: [String: Any] = [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
            ]
            if let simAccess = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                requireBiometric ? [.biometryCurrentSet] : [],
                &simError
            ) {
                simPrivateAttrs[kSecAttrAccessControl as String] = simAccess
            }
            attrs[kSecPrivateKeyAttrs as String] = simPrivateAttrs
            #else
            attrs[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave
            #endif

            var error: Unmanaged<CFError>?
            guard let privateKey = SecKeyCreateRandomKey(attrs as CFDictionary, &error) else {
                let message = (error?.takeRetainedValue() as Error?)?.localizedDescription ?? "Keypair generation failed"
                reject("E_KEYGEN_FAILED", message, nil)
                return
            }

            guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
                reject("E_KEYGEN_FAILED", "Failed to get public key", nil)
                return
            }

            guard let publicKeyHex = exportUncompressedPublicKeyHex(publicKey) else {
                reject("E_KEYGEN_FAILED", "Failed to encode public key", nil)
                return
            }

            resolve([
                "alias": alias,
                "publicKeyHex": publicKeyHex,
            ])
        } catch {
            reject("E_KEYGEN_FAILED", error.localizedDescription, error)
        }
    }

    @objc(getPublicKeyHex:resolver:rejecter:)
    func getPublicKeyHex(_ alias: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        let loaded = loadPrivateKey(alias: alias)
        guard case let .ok(privateKey) = loaded else {
            guard case let .failed(status) = loaded else { return }
            let (code, message) = describeKeyLoadFailure(status, alias: alias)
            reject(code, message, nil)
            return
        }
        guard let publicKey = SecKeyCopyPublicKey(privateKey),
              let publicKeyHex = exportUncompressedPublicKeyHex(publicKey) else {
            reject("E_NO_KEY", "Failed to read public key", nil)
            return
        }
        resolve(publicKeyHex)
    }

    @objc(hasKey:resolver:rejecter:)
    func hasKey(_ alias: String,
                resolver resolve: @escaping RCTPromiseResolveBlock,
                rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(hasKeySync(alias: alias))
    }

    @objc(deleteKey:resolver:rejecter:)
    func deleteKey(_ alias: String,
                   resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: aliasTag(alias),
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            resolve(true)
            return
        }
        reject("E_DELETE_FAILED", "Failed to delete key (status: \(status))", nil)
    }

    @objc(sign:dataHex:promptTitle:promptSubtitle:resolver:rejecter:)
    func sign(_ alias: String,
              dataHex: String,
              promptTitle: String,
              promptSubtitle: String?,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let messageData = dataFromHex(dataHex) else {
            reject("E_SIGN_INIT", "Invalid hex payload", nil)
            return
        }

        let context = LAContext()
        context.localizedCancelTitle = "Huỷ"

        let prompt: String = {
            if let subtitle = promptSubtitle, !subtitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "\(promptTitle)\n\(subtitle)"
            }
            return promptTitle
        }()

        let loaded = loadPrivateKey(alias: alias, context: context, prompt: prompt)
        guard case let .ok(privateKey) = loaded else {
            guard case let .failed(status) = loaded else { return }

            // BỎ HẲN nhánh hỏi `contextErrorCode`. Hàm đó trả `nil` vô điều kiện — chú
            // thích của chính nó khai thế — nên ba nhánh phân loại dựng trên nó CHƯA TỪNG
            // chạy một lần nào, và mọi lần hỏng đều rơi xuống dòng cuối để nhận nhãn
            // "không có khoá riêng". Ba nhánh chết mang tên đúng của thứ chúng định bắt là
            // dạng hỏng tệ nhất: đọc mã thì thấy ca đã được xử, chạy mã thì không.
            //
            // OSStatus thì là phép đo có thật, và nó PHÂN BIỆT ĐƯỢC đúng những ca kia:
            // `errSecUserCanceled` (-128) là người dùng huỷ, `errSecAuthFailed` (-25293)
            // là sinh trắc trượt hoặc khoá đã bị vô hiệu hoá. Đọc thứ tồn tại.
            let (code, message) = describeKeyLoadFailure(status, alias: alias)
            reject(code, message, nil)
            return
        }

        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            messageData as CFData,
            &signError
        ) as Data? else {
            // ĐÂY mới là chỗ hộp sinh trắc thật sự bật lên với khoá Secure Enclave: lấy
            // tham chiếu khoá ở trên KHÔNG đòi xác thực, chỉ lúc ký mới đòi. Nên ca "người
            // dùng thấy hộp Face ID rồi vẫn hỏng" rơi đúng vào đây, không rơi vào nhánh
            // nạp khoá — và bản trước gộp cả nhánh này vào một câu không mang số nào.
            let signNsError = signError?.takeRetainedValue() as Error? as NSError?
            // `code` của NSError là `Int`, còn `errSec…` là `OSStatus` (`Int32`) — Swift
            // không so hai kiểu đó, và cũng không so thẳng `Int?` với `Int`. Mở bọc một
            // lần rồi ép kiểu một lần, ở đây, thay vì rải `Int(...)` xuống từng dòng.
            let signCode: Int = signNsError?.code ?? 0
            if signCode == Int(errSecUserCanceled) || signCode == LAError.userCancel.rawValue {
                reject("E_USER_CANCELED", "Biometric authentication cancelled (code=\(signCode))", nil)
                return
            }
            if signCode == LAError.biometryLockout.rawValue {
                reject("E_BIOMETRIC_LOCKOUT", "Biometric is locked out (code=\(signCode))", nil)
                return
            }
            if signCode == Int(errSecAuthFailed) {
                reject("E_KEY_INVALIDATED",
                       "Key exists but refused to sign — invalidated by biometric enrollment change, or authentication failed (code=\(signCode))",
                       nil)
                return
            }
            let detail = signNsError?.localizedDescription ?? "Sign failed"
            reject("E_SIGN_AFTER_AUTH", "\(detail) (code=\(signCode))", nil)
            return
        }

        resolve(hexString(signature))
    }

    // MARK: - Helpers

    private func makeAccessControl(requireBiometric: Bool) -> SecAccessControl? {
        var error: Unmanaged<CFError>?
        let flags: SecAccessControlCreateFlags = requireBiometric
            ? [.privateKeyUsage, .biometryCurrentSet]
            : [.privateKeyUsage]
        return SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            flags,
            &error
        )
    }

    private func aliasTag(_ alias: String) -> Data {
        return "com.orilife.phoenixkey.\(alias)".data(using: .utf8) ?? Data(alias.utf8)
    }

    private func baseQuery(alias: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: aliasTag(alias),
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
    }

    private func hasKeySync(alias: String) -> Bool {
        var query = baseQuery(alias: alias)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        return status == errSecSuccess
    }

    /// Kết quả nạp khoá — GIỮ mã trạng thái của hệ điều hành khi hỏng.
    ///
    /// Bản trước trả `SecKey?` và viết `guard status == errSecSuccess else { return nil }`:
    /// bốn nguyên nhân rất khác nhau rời khỏi hàm dưới CÙNG một hình dạng `nil`, rồi nơi gọi
    /// phải đoán, và nó đoán bằng cách gán cho tất cả nhãn "không có khoá riêng". Nhãn đó
    /// mâu thuẫn với phép đo ngay cạnh: màn hình chỉ dựng nút gọi hàm này khi `hasKey` đã
    /// trả CÓ. Người dùng đọc "máy không có khoá" trên đúng cái máy vừa được báo là còn khoá.
    private enum LoadKeyResult {
        case ok(SecKey)
        case failed(OSStatus)
    }

    private func loadPrivateKey(alias: String,
                                context: LAContext? = nil,
                                prompt: String? = nil) -> LoadKeyResult {
        var query = baseQuery(alias: alias)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        if let context {
            query[kSecUseAuthenticationContext as String] = context
        }
        if let prompt {
            query[kSecUseOperationPrompt as String] = prompt
        }

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let item else { return .failed(status) }
        return .ok(item as! SecKey)
    }

    private func exportUncompressedPublicKeyHex(_ publicKey: SecKey) -> String? {
        var error: Unmanaged<CFError>?
        guard let raw = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }

        if raw.count == 65, raw.first == 0x04 {
            return hexString(raw)
        }

        // Fallback: strip ASN.1 prefix to raw 65-byte key if needed.
        if let uncompressed = extractUncompressedPoint(from: raw) {
            return hexString(uncompressed)
        }
        return nil
    }

    private func extractUncompressedPoint(from derOrRaw: Data) -> Data? {
        guard !derOrRaw.isEmpty else { return nil }
        if derOrRaw.count == 65, derOrRaw.first == 0x04 { return derOrRaw }

        // Find last uncompressed point marker 0x04 followed by 64 bytes
        if derOrRaw.count >= 65 {
            let bytes = [UInt8](derOrRaw)
            for i in stride(from: derOrRaw.count - 65, through: 0, by: -1) {
                if bytes[i] == 0x04 {
                    let tail = derOrRaw.subdata(in: i..<(i + 65))
                    return tail
                }
            }
        }
        return nil
    }

    private func dataFromHex(_ hex: String) -> Data? {
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        guard clean.count % 2 == 0 else { return nil }

        var data = Data(capacity: clean.count / 2)
        var index = clean.startIndex
        while index < clean.endIndex {
            let next = clean.index(index, offsetBy: 2)
            guard let byte = UInt8(clean[index..<next], radix: 16) else { return nil }
            data.append(byte)
            index = next
        }
        return data
    }

    private func hexString(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    /// OSStatus của kho khoá → (mã lỗi cho JS, câu mang theo SỐ ĐO).
    ///
    /// Mỗi câu trả về ĐỀU kèm `status=<số>`. Đó là phần không được bỏ: tầng JS chỉ phân loại
    /// được các ca nó đã biết tên, còn ca chưa biết thì người dùng là đường duy nhất mang số
    /// đo về — và họ chỉ mang về được thứ hiện ra trên màn hình.
    ///
    /// `errSecAuthFailed` ở ĐÂY gần như luôn là khoá đã bị vô hiệu hoá, không phải quẹt sai:
    /// khoá sinh ra với `.biometryCurrentSet` (xem `makeAccessControl`) nên nó chết vĩnh viễn
    /// ngay khi người dùng thêm/đăng ký lại vân tay hoặc khuôn mặt. Khoá vẫn NẰM trong kho —
    /// `hasKeySync` vẫn trả `true`, vì lấy tham chiếu không cần xác thực — nên màn hình vẫn
    /// mời người dùng bấm vào một lối đã chết. Phân biệt được ca này là phân biệt được
    /// "thử lại đi" với "thử bao nhiêu lần cũng thế, phải dùng 24 từ".
    private func describeKeyLoadFailure(_ status: OSStatus, alias: String) -> (String, String) {
        switch status {
        case errSecUserCanceled:
            return ("E_USER_CANCELED", "Biometric authentication cancelled (status=\(status))")
        case errSecAuthFailed:
            return ("E_KEY_INVALIDATED",
                    "Key exists but cannot be used — invalidated by biometric enrollment change, or authentication failed (status=\(status))")
        case errSecItemNotFound:
            return ("E_NO_KEY", "No key under alias '\(alias)' (status=\(status))")
        case errSecInteractionNotAllowed:
            return ("E_KEY_LOCKED", "Keychain not unlocked or interaction not allowed (status=\(status))")
        default:
            return ("E_KEYSTORE", "Keychain refused the key for alias '\(alias)' (status=\(status))")
        }
    }
}
