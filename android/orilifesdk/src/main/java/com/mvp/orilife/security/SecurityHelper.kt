package com.mvp.orilife.security

import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.security.SecureRandom
import kotlin.random.Random

object SecurityHelper {
    private const val SALT_SIZE = 32 // bytes
    private const val NONCE_SIZE = 32 // bytes

    suspend fun generateNonce(deviceKey: String, timestamp: Long): Result<String> = withContext(Dispatchers.Default) {
        try {
            val salt = generateSalt()
            val random = Random(System.currentTimeMillis())

            val nonceInput = "$deviceKey:$timestamp:$salt:${random.nextInt()}"

            val nonceBytes = hashBytes(nonceInput.toByteArray(Charsets.UTF_8))
            val nonceBase64 = Base64.encodeToString(nonceBytes, Base64.NO_WRAP)

            Log.d("SecurityHelper", "✅ Nonce generated: ${nonceBase64.take(16)}...")
            Result.success(nonceBase64)

        } catch (e: Exception) {
            Log.e("SecurityHelper", "❌ Failed to generate nonce", e)
            Result.failure(e)
        }
    }

    suspend fun generateNonceWithTimestamp(deviceKey: String): Result<NonceWithTimestamp> = withContext(Dispatchers.Default) {
        try {
            val timestamp = System.currentTimeMillis()
            val nonceResult = generateNonce(deviceKey, timestamp)

            nonceResult.map { nonce ->
                NonceWithTimestamp(nonce, timestamp)
            }

        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun generateSalt(): ByteArray {
        val salt = ByteArray(SALT_SIZE)
        val random = SecureRandom()
        random.nextBytes(salt)
        return salt
    }

    fun hashData(data: String): String {
        return try {
            val hashBytes = hashBytes(data.toByteArray(Charsets.UTF_8))
            Base64.encodeToString(hashBytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e("SecurityHelper", "❌ Failed to hash data", e)
            ""
        }
    }

    fun hashData(data: ByteArray): String {
        return try {
            val hashBytes = hashBytes(data)
            Base64.encodeToString(hashBytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e("SecurityHelper", "❌ Failed to hash data", e)
            ""
        }
    }

    private fun hashBytes(data: ByteArray): ByteArray {
        return try {
            val messageDigest = MessageDigest.getInstance("SHA-256")
            messageDigest.digest(data)
        } catch (e: NoSuchAlgorithmException) {
            throw RuntimeException("SHA-256 algorithm not available", e)
        }
    }

    fun isTimestampValid(timestamp: Long, toleranceMs: Long = 5 * 60 * 1000L): Boolean {
        val currentTime = System.currentTimeMillis()
        val timeDiff = kotlin.math.abs(currentTime - timestamp)

        val isValid = timeDiff <= toleranceMs

        Log.d("SecurityHelper", "⏰ Timestamp validation: $timeDiff ms, valid=$isValid")

        return isValid
    }

    fun isNonceReused(nonce: String, usedNonces: MutableSet<String>): Boolean {
        return nonce in usedNonces
    }

    fun addNonceToCache(nonce: String, usedNonces: MutableSet<String>) {
        usedNonces.add(nonce)

        // Limit cache size to prevent memory issues
        if (usedNonces.size > 10000) {
            usedNonces.remove(usedNonces.first())
        }
    }

    fun generateFingerprint(): String {
        val random = Random(System.currentTimeMillis())
        val fingerprint = ByteArray(16)
        random.nextBytes(fingerprint)
        return Base64.encodeToString(fingerprint, Base64.NO_WRAP)
    }

    data class NonceWithTimestamp(
        val nonce: String,
        val timestamp: Long
    )

    // Legacy methods (kept for compatibility)
    private const val KEY_ALIAS = "OrilifeHarvestKey"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    fun getPrivateKey(): java.security.PrivateKey? {
        val keyStore = java.security.KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        val entry = keyStore.getEntry(KEY_ALIAS, null) as? java.security.KeyStore.PrivateKeyEntry
        return entry?.privateKey
    }

    fun signDataLegacy(data: String): String {
        val privateKey = getPrivateKey()
        val signature = java.security.Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey)
        signature.update(data.toByteArray())
        val signatureBytes = signature.sign()

        return Base64.encodeToString(signatureBytes, Base64.DEFAULT)
    }
}
