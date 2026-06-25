package com.aladincontract.company

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * RN bridge cho Rust core `taad_enclave_core` (PhoenixKey Enclave) — Android.
 *
 * Phase 1: 4 hàm seed/Master_KEK (BIP39 24 từ). Khớp iOS TaadEnclaveModule.swift.
 *   - generateMasterKek()        → 64-hex Master_KEK ngẫu nhiên
 *   - masterKekToMnemonic(kek)   → cụm 24 từ BIP39
 *   - mnemonicToMasterKek(words) → 64-hex KEK (reject nếu cụm từ sai)
 *
 * Native: .so build bởi rust/taad_enclave_core (cargo-ndk) → jniLibs/<abi>/.
 * Các `external fun native*` ánh xạ symbol JNI trong src/android_jni.rs.
 * native* trả null khi lỗi → bridge reject Promise.
 */
class TaadEnclaveModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TaadEnclaveModule"

    // ── JNI (src/android_jni.rs) ────────────────────────────────────────────
    private external fun nativeGenerateMasterKek(): String?
    private external fun nativeMasterKekToMnemonic(kekHex: String): String?
    private external fun nativeMnemonicToMasterKek(words: String): String?

    // ── RN methods ──────────────────────────────────────────────────────────

    @ReactMethod
    fun generateMasterKek(promise: Promise) {
        try {
            val kek = nativeGenerateMasterKek()
            if (kek.isNullOrEmpty()) {
                promise.reject("E_KEK_GEN", "nativeGenerateMasterKek trả null")
            } else {
                promise.resolve(kek)
            }
        } catch (e: Throwable) {
            promise.reject("E_KEK_GEN", e.message ?: "Sinh Master_KEK thất bại", e)
        }
    }

    @ReactMethod
    fun masterKekToMnemonic(kekHex: String, promise: Promise) {
        try {
            val phrase = nativeMasterKekToMnemonic(kekHex)
            if (phrase.isNullOrEmpty()) {
                promise.reject("E_KEK_TO_MNEMONIC", "Master_KEK không hợp lệ (cần 64-hex)")
            } else {
                promise.resolve(phrase)
            }
        } catch (e: Throwable) {
            promise.reject("E_KEK_TO_MNEMONIC", e.message ?: "Encode mnemonic thất bại", e)
        }
    }

    @ReactMethod
    fun mnemonicToMasterKek(words: String, promise: Promise) {
        try {
            val kek = nativeMnemonicToMasterKek(words)
            if (kek.isNullOrEmpty()) {
                promise.reject("E_MNEMONIC_INVALID", "Cụm từ khôi phục không hợp lệ")
            } else {
                promise.resolve(kek)
            }
        } catch (e: Throwable) {
            promise.reject("E_MNEMONIC_INVALID", e.message ?: "Decode mnemonic thất bại", e)
        }
    }

    companion object {
        init {
            System.loadLibrary("taad_enclave_core")
        }
    }
}
