package com.mvp.orilife.security

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import javax.crypto.Cipher
import javax.security.auth.x500.X500Principal

class MonotonicCounter(private val context: Context) {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "com.orilife.monotonic_counter"
        private const val PREFS_NAME = "monotonic_counter_prefs"
        private const val PREFS_COUNTER = "counter_value"
        private const val COUNTER_KEY_SIZE = 256 // ECDSA P-256
    }

    private val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var isHardwareBacked: Boolean? = null

    @SuppressLint("NewApi")
    suspend fun initialize(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)

            if (!keyStore.containsAlias(KEY_ALIAS)) {
                Log.d("MonotonicCounter", "🔐 Generating new key for monotonic counter")

                val keyPairGenerator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    KEYSTORE_PROVIDER
                )

                val spec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(
                        java.security.spec.ECGenParameterSpec("P-256")
                    )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()

                // Try to generate key, fallback to software if StrongBox not available
                try {
                    keyPairGenerator.initialize(spec)
                    keyPairGenerator.generateKeyPair()
                    Log.d("MonotonicCounter", "✅ Key generated successfully")
                } catch (e: android.security.keystore.StrongBoxUnavailableException) {
                    Log.w("MonotonicCounter", "⚠️ StrongBox not available, using software keystore")
                    // Retry with software keystore
                    val softwareSpec = KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                    )
                        .setAlgorithmParameterSpec(
                            java.security.spec.ECGenParameterSpec("P-256")
                        )
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(false)
                        .build()

                    keyPairGenerator.initialize(softwareSpec)
                    keyPairGenerator.generateKeyPair()
                    Log.d("MonotonicCounter", "✅ Key generated successfully (software)")
                }
            } else {
                Log.d("MonotonicCounter", "✅ Key already exists")
            }

            isHardwareBacked = checkHardwareBacking()

            // Initialize counter if not exists
            if (!prefs.contains(PREFS_COUNTER)) {
                prefs.edit().putLong(PREFS_COUNTER, 0L).apply()
                Log.d("MonotonicCounter", "🔢 Counter initialized to 0")
            }

            Result.success(Unit)

        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to initialize", e)
            Result.failure(e)
        }
    }

    suspend fun incrementAndGet(): Result<Long> = withContext(Dispatchers.IO) {
        try {
            val currentCounter = getCurrentCounter()
            val newCounter = currentCounter + 1

            if (newCounter < currentCounter) {
                return@withContext Result.failure(Exception("Counter overflow"))
            }

            // Update in SharedPreferences (counter needs to persist even if key is lost)
            prefs.edit().putLong(PREFS_COUNTER, newCounter).apply()

            Log.d("MonotonicCounter", "🔢 Counter incremented: $currentCounter → $newCounter")

            Result.success(newCounter)

        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to increment counter", e)
            Result.failure(e)
        }
    }

    suspend fun getCurrent(): Result<Long> = withContext(Dispatchers.IO) {
        try {
            val counter = getCurrentCounter()
            Result.success(counter)
        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to get current counter", e)
            Result.failure(e)
        }
    }

    suspend fun reset(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            // Only allow reset if key is regenerated
            keyStore.load(null)

            if (!keyStore.containsAlias(KEY_ALIAS)) {
                prefs.edit().putLong(PREFS_COUNTER, 0L).apply()
                Log.d("MonotonicCounter", "🔄 Counter reset to 0")
                Result.success(Unit)
            } else {
                Result.failure(Exception("Cannot reset counter: key still exists"))
            }

        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to reset counter", e)
            Result.failure(e)
        }
    }

    suspend fun signCounter(counter: Long): Result<String> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)

            val privateKey = keyStore.getKey(KEY_ALIAS, null) as java.security.PrivateKey
            val signature = Signature.getInstance("SHA256withECDSA")
            signature.initSign(privateKey)
            signature.update(counter.toString().toByteArray())

            val signedBytes = signature.sign()
            val signatureBase64 = Base64.encodeToString(signedBytes, Base64.NO_WRAP)

            Log.d("MonotonicCounter", "✅ Counter signed: $counter")
            Result.success(signatureBase64)

        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to sign counter", e)
            Result.failure(e)
        }
    }

    fun getPublicKey(): String? {
        return try {
            keyStore.load(null)
            val certificate = keyStore.getCertificate(KEY_ALIAS)
            val publicKeyBytes = certificate.publicKey.encoded
            Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to get public key", e)
            null
        }
    }

    fun getDeviceId(): String {
        // Generate device ID from public key fingerprint
        val publicKey = getPublicKey() ?: "unknown"
        val fingerprint = publicKey.takeLast(16)
        return "device_${fingerprint}"
    }

    fun isHardwareBacked(): Boolean {
        return isHardwareBacked ?: checkHardwareBacking()
    }

    private fun getCurrentCounter(): Long {
        return prefs.getLong(PREFS_COUNTER, 0L)
    }

    private fun checkHardwareBacking(): Boolean {
        return try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                keyStore.load(null)
                val key = keyStore.getKey(KEY_ALIAS, null) as java.security.PrivateKey
                val factory = java.security.KeyFactory.getInstance(key.algorithm, KEYSTORE_PROVIDER)
                val keyInfo = factory.getKeySpec(key, android.security.keystore.KeyInfo::class.java)
                keyInfo.isInsideSecureHardware
            } else {
                false
            }
        } catch (e: Exception) {
            Log.w("MonotonicCounter", "Could not check hardware backing", e)
            false
        }
    }

    suspend fun deleteKey(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)
            keyStore.deleteEntry(KEY_ALIAS)
            prefs.edit().clear().apply()
            Log.d("MonotonicCounter", "🗑️ Key and counter deleted")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e("MonotonicCounter", "❌ Failed to delete key", e)
            Result.failure(e)
        }
    }
}
