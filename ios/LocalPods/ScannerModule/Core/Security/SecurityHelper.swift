import Foundation
import CommonCrypto
import Security

// MARK: - NonceWithTimestamp

/// A nonce paired with its generation timestamp.
struct NonceWithTimestamp: Equatable {
    let nonce: String
    let timestamp: Int64
}

// MARK: - SecurityHelper

/// Security utilities for the scanner SDK.
/// Handles nonce generation, SHA-256 hashing, timestamp validation, and fingerprinting.
/// Mirrors Android SecurityHelper.kt exactly.
enum SecurityHelper {

    // MARK: - Constants

    private static let saltSize = 32        // bytes
    private static let nonceSize = 32     // bytes
    private static let maxNonceCacheSize = 10_000

    // MARK: - Nonce Generation

    /// Generate a nonce from device key and timestamp.
    /// Result is Base64(SHA-256("$deviceKey:$timestamp:$salt:$randomInt")).
    /// Mirrors Android generateNonce().
    static func generateNonce(deviceKey: String, timestamp: Int64) -> String {
        let salt = generateSalt()
        let randomInt = Int.random(in: 0..<Int(Int32.max))

        let nonceInput = "\(deviceKey):\(timestamp):\(salt):\(randomInt)"
        let hash = sha256(nonceInput)
        return base64encode(hash)
    }

    /// Generate a nonce paired with its timestamp.
    /// Mirrors Android generateNonceWithTimestamp().
    static func generateNonceWithTimestamp(deviceKey: String) -> NonceWithTimestamp {
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let nonce = generateNonce(deviceKey: deviceKey, timestamp: timestamp)
        return NonceWithTimestamp(nonce: nonce, timestamp: timestamp)
    }

    // MARK: - Hashing

    /// Hash a string with SHA-256, return Base64-encoded result.
    /// Mirrors Android hashData(String).
    static func hashData(_ data: String) -> String {
        let hash = sha256(data)
        return base64encode(hash)
    }

    /// Hash raw data with SHA-256, return Base64-encoded result.
    /// Mirrors Android hashData(ByteArray).
    static func hashData(_ data: Data) -> String {
        let hash = sha256(data)
        return base64encode(hash)
    }

    /// Compute SHA-256 hash of a string → raw bytes.
    private static func sha256(_ string: String) -> Data {
        sha256(Data(string.utf8))
    }

    /// Compute SHA-256 hash of raw data → raw bytes.
    private static func sha256(_ data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { ptr in
            _ = CC_SHA256(ptr.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }

    // MARK: - Timestamp Validation

    /// Check if a timestamp is within the given tolerance of the current time.
    /// Default tolerance: 5 minutes.
    /// Mirrors Android isTimestampValid().
    static func isTimestampValid(_ timestamp: Int64, toleranceMs: Int64 = 5 * 60 * 1000) -> Bool {
        let currentTime = Int64(Date().timeIntervalSince1970 * 1000)
        let diff = abs(currentTime - timestamp)
        let isValid = diff <= toleranceMs
        print("[SecurityHelper] ⏰ Timestamp validation: diff=\(diff)ms, tolerance=\(toleranceMs)ms, valid=\(isValid)")
        return isValid
    }

    // MARK: - Nonce Replay Protection

    /// Check if a nonce has already been used.
    /// Mirrors Android isNonceReused().
    static func isNonceReused(_ nonce: String, usedNonces: Set<String>) -> Bool {
        return usedNonces.contains(nonce)
    }

    /// Add a nonce to the used-nonces cache.
    /// Automatically trims the cache if it exceeds the max size.
    /// Mirrors Android addNonceToCache().
    static func addNonceToCache(_ nonce: String, usedNonces: inout Set<String>) {
        usedNonces.insert(nonce)

        // Trim to prevent unbounded memory growth
        if usedNonces.count > maxNonceCacheSize {
            // Remove oldest entries (Set iteration order is undefined but deterministic)
            let overflow = usedNonces.count - maxNonceCacheSize
            if overflow > 0 {
                // Take a snapshot, remove excess entries
                let snapshot = Array(usedNonces)
                for i in 0..<overflow {
                    usedNonces.remove(snapshot[i])
                }
            }
        }
    }

    // MARK: - Fingerprinting

    /// Generate a random device fingerprint.
    /// Used for non-cryptographic identification purposes.
    /// Mirrors Android generateFingerprint().
    static func generateFingerprint() -> String {
        let data = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
        return base64encode(data)
    }

    // MARK: - Private Helpers

    /// Generate cryptographically random salt bytes.
    private static func generateSalt() -> Data {
        var salt = [UInt8](repeating: 0, count: saltSize)
        let status = SecRandomCopyBytes(kSecRandomDefault, saltSize, &salt)
        if status != errSecSuccess {
            print("[SecurityHelper] ⚠️ SecRandomCopyBytes failed, falling back to arc4random")
            return Data((0..<saltSize).map { _ in UInt8.random(in: 0...255) })
        }
        return Data(salt)
    }

    /// Base64-encode raw data (no wrapping).
    private static func base64encode(_ data: Data) -> String {
        data.base64EncodedString(options: [.endLineWithLineFeed])
    }
}