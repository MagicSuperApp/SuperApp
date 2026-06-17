import Foundation
import Security
import UIKit

/// Secure device signature and trust scoring.
/// Matches Android SecureSignature.kt + TrustScoreManager.kt.
final class SecureSignature {

    private let deviceId: String
    private var isInitialized = false

    // MARK: - Init

    init() {
        self.deviceId = Self.getOrCreateDeviceId()
    }

    convenience init?(context: Any?) {
        self.init()
    }

    // MARK: - Public API

    /// Get the stable device identifier.
    func getDeviceId() -> String {
        return deviceId
    }

    /// Generate a secure signature for a payload.
    func sign(payload: String) -> String? {
        guard let key = getOrCreateKey() else { return nil }
        guard let data = payload.data(using: .utf8) else { return nil }

        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            key,
            .ecdsaSignatureMessageX962SHA256,
            data as CFData,
            &error
        ) else {
            print("[SecureSignature] ❌ Sign failed: \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
            return nil
        }

        return (signature as Data).base64EncodedString()
    }

    /// Sign a detection request payload.
    func signDetectionRequest(nonce: String, counter: Int64, timestamp: Int64, imageHash: String) -> String? {
        let payload = "\(deviceId):\(nonce):\(counter):\(timestamp):\(imageHash)"
        return sign(payload: payload)
    }

    /// Verify a signature against a payload.
    func verify(payload: String, signature: String) -> Bool {
        guard let key = getPublicKey(),
              let payloadData = payload.data(using: .utf8),
              let sigData = Data(base64Encoded: signature) else { return false }

        var error: Unmanaged<CFError>?
        let result = SecKeyVerifySignature(
            key,
            .ecdsaSignatureMessageX962SHA256,
            payloadData as CFData,
            sigData as CFData,
            &error
        )

        return result
    }

    // MARK: - Keychain

    private static let keyTag = "com.aladin.scansdk.signing.key"

    private func getOrCreateKey() -> SecKey? {
        // Try to load existing key
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Self.keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecSuccess {
            return (item as! SecKey)
        }

        // Generate new key
        guard let newKey = generateKey() else { return nil }
        return newKey
    }

    private func getPublicKey() -> SecKey? {
        guard let privateKey = getOrCreateKey() else { return nil }
        return SecKeyCopyPublicKey(privateKey)
    }

    private func generateKey() -> SecKey? {
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrApplicationTag as String: Self.keyTag,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
            ]
        ]

        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            print("[SecureSignature] ❌ Key generation failed: \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
            return nil
        }

        print("[SecureSignature] ✅ New key generated")
        return privateKey
    }

    // MARK: - Device ID

    private static let deviceIdKey = "com.aladin.device.id"

    private static func getOrCreateDeviceId() -> String {
        // Try keychain first
        let keychainQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceIdKey,
            kSecReturnData as String: true
        ]

        var item: CFTypeRef?
        if SecItemCopyMatching(keychainQuery as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data,
           let id = String(data: data, encoding: .utf8) {
            return id
        }

        // Generate new ID
        let newId = UUID().uuidString

        guard let idData = newId.data(using: .utf8) else {
            print("[SecureSignature] ⚠️ Failed to encode device ID as UTF-8")
            return newId
        }
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceIdKey,
            kSecValueData as String: idData,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        SecItemAdd(addQuery as CFDictionary, nil)
        return newId
    }
}
