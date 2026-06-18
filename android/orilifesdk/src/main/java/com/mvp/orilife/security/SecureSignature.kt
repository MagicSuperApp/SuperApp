package com.mvp.orilife.security

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec

class SecureSignature(private val context: Context) {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "com.orilife.device_key"
        private const val KEY_SIZE = 256 // ECDSA P-256
    }

    private val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)

    private var publicKey: PublicKey? = null
    private var isHardwareBacked: Boolean? = null

    @SuppressLint("NewApi")
    suspend fun initialize(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)

            if (!keyStore.containsAlias(KEY_ALIAS)) {
                Log.d("SecureSignature", "🔐 Generating new device key pair")

                val keyPairGenerator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    KEYSTORE_PROVIDER
                )

                val spec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_SIGN
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("P-256"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()

                // Try to generate key, fallback to software if StrongBox not available
                try {
                    keyPairGenerator.initialize(spec)
                    val keyPair = keyPairGenerator.generateKeyPair()
                    publicKey = keyPair.public

                    Log.d("SecureSignature", "✅ Device key generated successfully")
                } catch (e: android.security.keystore.StrongBoxUnavailableException) {
                    Log.w("SecureSignature", "⚠️ StrongBox not available, using software keystore")
                    // Retry with software keystore
                    val softwareSpec = KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN
                    )
                        .setAlgorithmParameterSpec(ECGenParameterSpec("P-256"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(false)
                        .build()

                    keyPairGenerator.initialize(softwareSpec)
                    val keyPair = keyPairGenerator.generateKeyPair()
                    publicKey = keyPair.public

                    Log.d("SecureSignature", "✅ Device key generated successfully (software)")
                }
            } else {
                val privateKey = keyStore.getKey(KEY_ALIAS, null) as PrivateKey
                val certificate = keyStore.getCertificate(KEY_ALIAS)
                publicKey = certificate.publicKey

                Log.d("SecureSignature", "✅ Device key already exists")
            }

            isHardwareBacked = checkHardwareBacking()

            Result.success(Unit)

        } catch (e: Exception) {
            Log.e("SecureSignature", "❌ Failed to initialize", e)
            Result.failure(e)
        }
    }

    suspend fun signData(data: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)

            val privateKey = keyStore.getKey(KEY_ALIAS, null) as PrivateKey
            val signature = Signature.getInstance("SHA256withECDSA")
            signature.initSign(privateKey)
            signature.update(data.toByteArray(Charsets.UTF_8))

            val signedBytes = signature.sign()
            val signatureBase64 = Base64.encodeToString(signedBytes, Base64.NO_WRAP)

            Log.d("SecureSignature", "✅ Data signed successfully (${data.length} bytes)")
            Result.success(signatureBase64)

        } catch (e: Exception) {
            Log.e("SecureSignature", "❌ Failed to sign data", e)
            Result.failure(e)
        }
    }

    suspend fun signRequest(request: SecureRequestData): Result<String> = withContext(Dispatchers.IO) {
        try {
            val dataToSign = request.toString()
            signData(dataToSign)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun signDetectionRequest(
        nonce: String,
        counter: Long,
        timestamp: Long,
        imageData: ByteArray
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val request = SecureRequestData(
                nonce = nonce,
                counter = counter,
                timestamp = timestamp,
                dataHash = hashData(imageData)
            )

            signRequest(request)
        } catch (e: Exception) {
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
            Log.e("SecureSignature", "❌ Failed to get public key", e)
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

    fun hashData(data: ByteArray): String {
        return try {
            val messageDigest = java.security.MessageDigest.getInstance("SHA-256")
            val hash = messageDigest.digest(data)
            Base64.encodeToString(hash, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e("SecureSignature", "❌ Failed to hash data", e)
            ""
        }
    }

    fun hashData(data: String): String {
        return hashData(data.toByteArray(Charsets.UTF_8))
    }

    fun hashBitmap(bitmap: android.graphics.Bitmap): String {
        return try {
            val stream = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, stream)
            val bitmapBytes = stream.toByteArray()
            hashData(bitmapBytes)
        } catch (e: Exception) {
            Log.e("SecureSignature", "❌ Failed to hash bitmap", e)
            ""
        }
    }

    suspend fun deleteKey(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            keyStore.load(null)
            keyStore.deleteEntry(KEY_ALIAS)
            publicKey = null
            Log.d("SecureSignature", "🗑️ Device key deleted")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e("SecureSignature", "❌ Failed to delete key", e)
            Result.failure(e)
        }
    }

    private fun checkHardwareBacking(): Boolean {
        return try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                keyStore.load(null)
                val key = keyStore.getKey(KEY_ALIAS, null) as PrivateKey
                val factory = java.security.KeyFactory.getInstance(key.algorithm, KEYSTORE_PROVIDER)
                val keyInfo = factory.getKeySpec(key, android.security.keystore.KeyInfo::class.java)
                keyInfo.isInsideSecureHardware
            } else {
                false
            }
        } catch (e: Exception) {
            Log.w("SecureSignature", "Could not check hardware backing", e)
            false
        }
    }

    data class SecureRequestData(
        val nonce: String,
        val counter: Long,
        val timestamp: Long,
        val dataHash: String
    ) {
        override fun toString(): String {
            return "nonce=$nonce|counter=$counter|timestamp=$timestamp|hash=$dataHash"
        }
    }
}
