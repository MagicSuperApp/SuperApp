package com.aladincontract.company

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

class PhoenixKeyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PhoenixKeyModule"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val SIGN_ALGORITHM = "SHA256withECDSA"
        private const val EC_CURVE = "secp256r1"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun generateKeypair(alias: String, requireBiometric: Boolean, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(alias)) {
                promise.reject("E_KEY_EXISTS", "Keypair with alias '$alias' already exists")
                return
            }

            val specBuilder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec(EC_CURVE))
                .setDigests(KeyProperties.DIGEST_SHA256)

            if (requireBiometric) {
                specBuilder.setUserAuthenticationRequired(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    specBuilder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    specBuilder.setUserAuthenticationValidityDurationSeconds(-1)
                }
                specBuilder.setInvalidatedByBiometricEnrollment(true)
            }

            val generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE
            )
            generator.initialize(specBuilder.build())
            val keyPair = generator.generateKeyPair()

            val publicKeyHex = encodeUncompressedHex(keyPair.public as ECPublicKey)
            val result = Arguments.createMap().apply {
                putString("alias", alias)
                putString("publicKeyHex", publicKeyHex)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("E_KEYGEN_FAILED", e.message ?: "Keypair generation failed", e)
        }
    }

    @ReactMethod
    fun getPublicKeyHex(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val publicKey = keyStore.getCertificate(alias)?.publicKey
                ?: throw IllegalStateException("No key under alias '$alias'")
            promise.resolve(encodeUncompressedHex(publicKey as ECPublicKey))
        } catch (e: Exception) {
            promise.reject("E_NO_KEY", e.message ?: "Failed to read public key", e)
        }
    }

    @ReactMethod
    fun hasKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            promise.resolve(keyStore.containsAlias(alias))
        } catch (e: Exception) {
            promise.reject("E_KEYSTORE", e.message ?: "Failed to query keystore", e)
        }
    }

    @ReactMethod
    fun deleteKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            keyStore.deleteEntry(alias)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_DELETE_FAILED", e.message ?: "Failed to delete key", e)
        }
    }

    @ReactMethod
    fun sign(
        alias: String,
        dataHex: String,
        promptTitle: String,
        promptSubtitle: String?,
        promise: Promise,
    ) {
        val activity = reactContext.currentActivity as? FragmentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Sign requires a FragmentActivity on screen")
            return
        }

        val signature: Signature
        val data: ByteArray
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val privateKey = keyStore.getKey(alias, null) as? PrivateKey
                ?: throw IllegalStateException("No private key under alias '$alias'")
            signature = Signature.getInstance(SIGN_ALGORITHM).apply { initSign(privateKey) }
            data = hexToBytes(dataHex)
        } catch (e: Exception) {
            promise.reject("E_SIGN_INIT", e.message ?: "Failed to init signing", e)
            return
        }

        activity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(activity)
            val prompt = BiometricPrompt(
                activity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        try {
                            val authenticatedSig = result.cryptoObject?.signature
                                ?: throw IllegalStateException("CryptoObject signature missing")
                            authenticatedSig.update(data)
                            promise.resolve(bytesToHex(authenticatedSig.sign()))
                        } catch (e: Exception) {
                            promise.reject("E_SIGN_AFTER_AUTH", e.message ?: "Sign failed", e)
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        val tag = when (errorCode) {
                            BiometricPrompt.ERROR_USER_CANCELED,
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                            BiometricPrompt.ERROR_CANCELED -> "E_USER_CANCELED"
                            BiometricPrompt.ERROR_LOCKOUT,
                            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "E_BIOMETRIC_LOCKOUT"
                            else -> "E_BIOMETRIC_ERROR_$errorCode"
                        }
                        promise.reject(tag, errString.toString())
                    }
                }
            )

            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(promptTitle)
                .apply { if (!promptSubtitle.isNullOrBlank()) setSubtitle(promptSubtitle) }
                .setNegativeButtonText("Huỷ")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setConfirmationRequired(false)
                .build()

            prompt.authenticate(info, BiometricPrompt.CryptoObject(signature))
        }
    }

    private fun encodeUncompressedHex(publicKey: ECPublicKey): String {
        val point = publicKey.w
        val x = bigIntTo32Bytes(point.affineX)
        val y = bigIntTo32Bytes(point.affineY)
        return "04" + bytesToHex(x) + bytesToHex(y)
    }

    private fun bigIntTo32Bytes(value: java.math.BigInteger): ByteArray {
        val raw = value.toByteArray()
        return when {
            raw.size == 32 -> raw
            raw.size == 33 && raw[0] == 0.toByte() -> raw.copyOfRange(1, 33)
            raw.size < 32 -> ByteArray(32 - raw.size) + raw
            else -> throw IllegalStateException("EC coordinate ${raw.size} bytes, expected ≤33")
        }
    }

    private fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = if (hex.startsWith("0x")) hex.substring(2) else hex
        require(clean.length % 2 == 0) { "Hex string must be even length, got ${clean.length}" }
        return ByteArray(clean.length / 2) {
            clean.substring(it * 2, it * 2 + 2).toInt(16).toByte()
        }
    }
}
