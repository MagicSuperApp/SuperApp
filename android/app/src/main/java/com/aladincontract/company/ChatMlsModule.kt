package com.aladincontract.company

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * RN bridge cho Rust core `chat_mls` (ProofChat E2EE) — Android.
 *
 * Native: .so build bởi rust/chat_mls (cargo-ndk) → jniLibs/<abi>/libchat_mls.so.
 * `external fun native*` ánh xạ symbol JNI trong rust/chat_mls/src/android_jni.rs
 * (class Kotlin PHẢI đúng `com.aladincontract.company.ChatMlsModule`).
 *
 * Handle danh tính là con trỏ 64-bit → KHÔNG đẩy qua JS (double mất chính xác).
 * Module giữ handle nội bộ (1 danh tính hiện hành: user đăng nhập). JS gọi
 * `newIdentity`/`importState` để khởi tạo, rồi các thao tác dùng handle đó.
 *
 * Các hàm thao tác trả CHUỖI JSON `{"ok":bool, ...}` — JS (src/sdk/chatMls.ts) parse
 * và throw nếu ok=false. Chỉ reject Promise khi lib chưa nạp / chưa có identity.
 */
class ChatMlsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ChatMlsModule"

    // ── JNI (rust/chat_mls/src/android_jni.rs) ───────────────────────────────
    private external fun nativeNew(stakeAddress: String): Long
    private external fun nativeImportState(stateB64: String): Long
    private external fun nativeFree(handle: Long)
    private external fun nativeExportState(handle: Long): String
    private external fun nativeGenerateKeyPackage(handle: Long): String
    private external fun nativeCreateGroup(handle: Long, conv: String, membersJson: String): String
    private external fun nativeJoinFromWelcome(handle: Long, welcomeB64: String): String
    private external fun nativeProcessCommit(handle: Long, conv: String, commitB64: String): String
    private external fun nativeEncrypt(handle: Long, conv: String, plaintext: String): String
    private external fun nativeDecrypt(handle: Long, conv: String, bodyB64: String): String

    /** Con trỏ MlsIdentity hiện hành (0 = chưa có). */
    @Volatile private var handle: Long = 0

    // ── vòng đời danh tính ───────────────────────────────────────────────────

    @ReactMethod
    fun newIdentity(stakeAddress: String, promise: Promise) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "libchat_mls.so chưa nạp được"); return }
        try {
            if (handle != 0L) { nativeFree(handle); handle = 0 }
            val h = nativeNew(stakeAddress)
            if (h == 0L) { promise.reject("E_IDENTITY", "Tạo danh tính thất bại"); return }
            handle = h
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_IDENTITY", e.message ?: "Tạo danh tính thất bại", e)
        }
    }

    @ReactMethod
    fun importState(stateB64: String, promise: Promise) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "libchat_mls.so chưa nạp được"); return }
        try {
            if (handle != 0L) { nativeFree(handle); handle = 0 }
            val h = nativeImportState(stateB64)
            if (h == 0L) { promise.reject("E_IMPORT", "Khôi phục trạng thái thất bại"); return }
            handle = h
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_IMPORT", e.message ?: "Khôi phục thất bại", e)
        }
    }

    @ReactMethod
    fun hasIdentity(promise: Promise) = promise.resolve(handle != 0L)

    @ReactMethod
    fun freeIdentity(promise: Promise) {
        try {
            if (handle != 0L) { nativeFree(handle); handle = 0 }
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_FREE", e.message ?: "Giải phóng thất bại", e)
        }
    }

    // ── thao tác (trả JSON) ──────────────────────────────────────────────────

    private inline fun withHandle(promise: Promise, block: (Long) -> String) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "libchat_mls.so chưa nạp được"); return }
        val h = handle
        if (h == 0L) { promise.reject("E_NO_IDENTITY", "Chưa có danh tính (gọi newIdentity/importState trước)"); return }
        try { promise.resolve(block(h)) } catch (e: Throwable) {
            promise.reject("E_CHAT_MLS", e.message ?: "Lỗi native", e)
        }
    }

    @ReactMethod
    fun exportState(promise: Promise) = withHandle(promise) { nativeExportState(it) }

    @ReactMethod
    fun generateKeyPackage(promise: Promise) = withHandle(promise) { nativeGenerateKeyPackage(it) }

    @ReactMethod
    fun createGroup(conversationId: String, memberKeyPackagesJson: String, promise: Promise) =
        withHandle(promise) { nativeCreateGroup(it, conversationId, memberKeyPackagesJson) }

    @ReactMethod
    fun joinFromWelcome(welcomeB64: String, promise: Promise) =
        withHandle(promise) { nativeJoinFromWelcome(it, welcomeB64) }

    @ReactMethod
    fun processCommit(conversationId: String, commitB64: String, promise: Promise) =
        withHandle(promise) { nativeProcessCommit(it, conversationId, commitB64) }

    @ReactMethod
    fun encrypt(conversationId: String, plaintext: String, promise: Promise) =
        withHandle(promise) { nativeEncrypt(it, conversationId, plaintext) }

    @ReactMethod
    fun decrypt(conversationId: String, bodyB64: String, promise: Promise) =
        withHandle(promise) { nativeDecrypt(it, conversationId, bodyB64) }

    companion object {
        // Phòng thủ giống TaadEnclaveModule: AAB có thể gồm ABI thiếu .so → không sập app.
        private var libLoaded = false
        init {
            try {
                System.loadLibrary("chat_mls")
                libLoaded = true
            } catch (e: Throwable) {
                // .so vắng cho ABI hiện tại — module báo không khả dụng.
            }
        }
    }
}
