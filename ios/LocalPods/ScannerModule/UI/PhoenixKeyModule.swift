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
            let attrs: [String: Any] = [
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeySizeInBits as String: 256,
                kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
                kSecPrivateKeyAttrs as String: [
                    kSecAttrIsPermanent as String: true,
                    kSecAttrApplicationTag as String: tag,
                    kSecAttrAccessControl as String: access,
                ],
            ]

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
        guard let privateKey = loadPrivateKey(alias: alias) else {
            reject("E_NO_KEY", "No key under alias '\(alias)'", nil)
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

        guard let privateKey = loadPrivateKey(alias: alias, context: context, prompt: prompt) else {
            let laCode = context.evaluatedPolicyDomainState == nil ? contextErrorCode(context) : nil
            if laCode == LAError.userCancel.rawValue || laCode == LAError.appCancel.rawValue || laCode == LAError.systemCancel.rawValue || laCode == LAError.userFallback.rawValue {
                reject("E_USER_CANCELED", "Biometric authentication cancelled", nil)
                return
            }
            if laCode == LAError.biometryLockout.rawValue {
                reject("E_BIOMETRIC_LOCKOUT", "Biometric is locked out", nil)
                return
            }
            reject("E_NO_KEY", "No private key under alias '\(alias)'", nil)
            return
        }

        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            messageData as CFData,
            &signError
        ) as Data? else {
            let message = (signError?.takeRetainedValue() as Error?)?.localizedDescription ?? "Sign failed"
            reject("E_SIGN_AFTER_AUTH", message, nil)
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

    private func loadPrivateKey(alias: String,
                                context: LAContext? = nil,
                                prompt: String? = nil) -> SecKey? {
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
        guard status == errSecSuccess else { return nil }
        return (item as! SecKey)
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

    private func contextErrorCode(_ context: LAContext) -> Int? {
        // LAContext does not expose last NSError directly after keychain auth failures.
        // Keep nil fallback; caller maps generic error.
        return nil
    }
}
