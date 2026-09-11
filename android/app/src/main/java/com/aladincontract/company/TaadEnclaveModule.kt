package com.aladincontract.company

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

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
    private external fun nativeDeriveTaadPubkey(kekHex: String): String?
    private external fun nativeDeriveWalletSeed(kekHex: String): String?
    private external fun nativeDeriveWalletAddress(kekHex: String, account: Int, network: Int): String?
    /** Địa-chỉ STAKE (reward) — cùng CIP-1852 với ví, nhánh role 2 (m/1852'/1815'/acc'/2/0). */
    private external fun nativeDeriveStakeAddress(kekHex: String, account: Int, network: Int): String?
    private external fun nativeSignWalletRegister(kekHex: String, account: Int, message: String): String?
    /** Dựng + ký tx Cardano (ADA/LAMP). amount* là String (u64 vượt precision bridge). */
    private external fun nativeBuildSignedTransfer(
        kekHex: String, account: Int, toAddress: String,
        amountLovelace: String, lampAmount: String,
        lampPolicyHex: String, lampAssetNameHex: String,
        utxosJson: String, protocolParamsJson: String, network: Int,
    ): String?
    /** Dựng + ký tx uỷ thác stake vào 1 pool. */
    private external fun nativeBuildStakeDelegation(
        kekHex: String, account: Int, poolBech32: String,
        utxosJson: String, protocolParamsJson: String, network: Int,
    ): String?
    /** Witness (ký) tx CBOR đã dựng sẵn (GetLAMP). */
    private external fun nativeWitnessUnsignedTx(
        kekHex: String, account: Int, unsignedTxCborHex: String, network: Int,
    ): String?
    private external fun nativeGenerateSalt(): String?
    private external fun nativePbkdf2Derive(pin: String, saltHex: String): String?
    private external fun nativeAesGcmEncrypt(keyHex: String, plaintextHex: String): String?
    private external fun nativeAesGcmDecrypt(keyHex: String, encryptedJson: String): String?
    private external fun nativeSignEd25519(masterKekHex: String, message: String): String?
    /** 2FA DeviceKey opt-in: sinh Ed25519 ngẫu nhiên + ký canonical → JSON. */
    private external fun nativeDeviceKeyOptin(userDid: String, nonce: String): String?
    /**
     * Mint LAMP bằng OrgDID (bản B — cổng Registry + SupplyState + A-DEST kho).
     * Thứ tự tham số PHẢI khớp `android_jni.rs::…nativeBuildMintLampViaDid` và
     * `lib.rs::taad_build_mint_lamp_via_did` (nơi duy nhất giải thích từng cái).
     * currentSlot là Long vì JNI nhận jlong; cầu RN chỉ đưa được Double nên chỗ
     * gọi phải đổi kiểu — xem `buildMintLampViaDid` dưới.
     */
    private external fun nativeBuildMintLampViaDid(
        authorityKeksJson: String, registryUtxoJson: String, tokenTagHex: String,
        supplyStateUtxoJson: String, supplyStateScriptCbor: String, khoUtxoJson: String,
        lampPolicyCborHex: String, mintJson: String, utxosJson: String,
        protocolParamsJson: String, walletSeedHex: String,
        network: Int, currentSlot: Long,
    ): String?

    /**
     * Mint token BẤT KỲ qua cổng Registry (bộ dựng tổng quát).
     * Thứ tự tham số PHẢI khớp `android_jni.rs::…nativeBuildMintViaRegistry` và
     * `lib.rs::taad_build_mint_via_registry`.
     *
     * KHÔNG dùng cho LAMP: hàm này không dựng output KHO (A-DEST) mà nhánh
     * DistributionVest của `lamp_mint` đòi — truyền policy LAMP vào đây sẽ ra tx
     * bị chuỗi bác ở phase-2. Mint LAMP dùng `nativeBuildMintLampViaDid`.
     */
    private external fun nativeBuildMintViaRegistry(
        authorityKeksJson: String, registryUtxoJson: String, tokenPolicyCbor: String,
        mintJson: String, supplyStateUtxoJson: String, supplyStateScriptCbor: String,
        utxosJson: String, paramsJson: String, walletSeedHex: String,
        network: Int, slot: Long,
    ): String?

    /**
     * Câu lỗi của lần gọi native GẦN NHẤT trên luồng này (Issue #285).
     * Lõi Rust giữ ô lỗi theo luồng; JNI chạy đồng bộ trên đúng luồng Java đã
     * gọi, nên đọc ngay sau khi thấy null là đọc đúng lý do của lần gọi đó.
     * Đọc một lần rồi ô lỗi trống.
     */
    private external fun nativeLastError(): String?

    // ── RN methods ──────────────────────────────────────────────────────────

    /**
     * Lý do THẬT của lần gọi vừa hỏng, hoặc `fallback` nếu lõi không nói gì.
     * Không bao giờ ném — đường đọc lý do lỗi mà tự hỏng thì mất luôn lý do.
     */
    private fun reasonOr(fallback: String): String =
        try {
            nativeLastError()?.takeIf { it.isNotBlank() } ?: fallback
        } catch (_: Throwable) {
            fallback
        }

    /** Gói chung: chạy native fn, reject nếu null/rỗng hoặc throw. */
    private inline fun run(promise: Promise, code: String, errMsg: String, block: () -> String?) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "Rust core .so chưa nạp được (ABI này thiếu lib)"); return }
        try {
            val out = block()
            // Lõi có câu lỗi thì đưa ĐÚNG câu đó lên; `errMsg` chỉ là phương án
            // chót khi lõi im lặng (Issue #285).
            if (out.isNullOrEmpty()) promise.reject(code, reasonOr(errMsg)) else promise.resolve(out)
        } catch (e: Throwable) {
            promise.reject(code, e.message ?: errMsg, e)
        }
    }

    @ReactMethod
    fun generateMasterKek(promise: Promise) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "Rust core .so chưa nạp được (ABI này thiếu lib)"); return }
        try {
            val kek = nativeGenerateMasterKek()
            if (kek.isNullOrEmpty()) {
                promise.reject("E_KEK_GEN", reasonOr("nativeGenerateMasterKek trả null"))
            } else {
                promise.resolve(kek)
            }
        } catch (e: Throwable) {
            promise.reject("E_KEK_GEN", e.message ?: "Sinh Master_KEK thất bại", e)
        }
    }

    @ReactMethod
    fun masterKekToMnemonic(kekHex: String, promise: Promise) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "Rust core .so chưa nạp được (ABI này thiếu lib)"); return }
        try {
            val phrase = nativeMasterKekToMnemonic(kekHex)
            if (phrase.isNullOrEmpty()) {
                promise.reject("E_KEK_TO_MNEMONIC", reasonOr("Master_KEK không hợp lệ (cần 64-hex)"))
            } else {
                promise.resolve(phrase)
            }
        } catch (e: Throwable) {
            promise.reject("E_KEK_TO_MNEMONIC", e.message ?: "Encode mnemonic thất bại", e)
        }
    }

    @ReactMethod
    fun mnemonicToMasterKek(words: String, promise: Promise) {
        if (!libLoaded) { promise.reject("E_NATIVE_UNAVAILABLE", "Rust core .so chưa nạp được (ABI này thiếu lib)"); return }
        try {
            val kek = nativeMnemonicToMasterKek(words)
            if (kek.isNullOrEmpty()) {
                promise.reject("E_MNEMONIC_INVALID", reasonOr("Cụm từ khôi phục không hợp lệ"))
            } else {
                promise.resolve(kek)
            }
        } catch (e: Throwable) {
            promise.reject("E_MNEMONIC_INVALID", e.message ?: "Decode mnemonic thất bại", e)
        }
    }

    // ── Derive (composed) + wrapping primitives ──────────────────────────────

    @ReactMethod
    fun deriveTaadPubkey(kekHex: String, promise: Promise) =
        run(promise, "E_DERIVE_TAAD", "Master_KEK không hợp lệ") { nativeDeriveTaadPubkey(kekHex) }

    @ReactMethod
    fun deriveWalletSeed(kekHex: String, promise: Promise) =
        run(promise, "E_DERIVE_SEED", "Master_KEK không hợp lệ") { nativeDeriveWalletSeed(kekHex) }

    @ReactMethod
    fun deriveWalletAddress(kekHex: String, account: Int, network: Int, promise: Promise) =
        run(promise, "E_DERIVE_ADDR", "Không derive được địa chỉ Cardano") {
            nativeDeriveWalletAddress(kekHex, account, network)
        }

    @ReactMethod
    fun deriveStakeAddress(kekHex: String, account: Int, network: Int, promise: Promise) =
        run(promise, "E_DERIVE_STAKE", "Không derive được địa chỉ stake Cardano") {
            nativeDeriveStakeAddress(kekHex, account, network)
        }

    @ReactMethod
    fun signWalletRegister(kekHex: String, account: Int, message: String, promise: Promise) =
        run(promise, "E_SIGN_WALLET_REG", "Không ký được proof-of-ownership ví Standard") {
            nativeSignWalletRegister(kekHex, account, message)
        }

    /** Dựng + ký tx Cardano (ADA/LAMP) — client build, backend relay (Issue #74). */
    @ReactMethod
    fun buildSignedTransfer(
        kekHex: String, account: Int, toAddress: String,
        amountLovelace: String, lampAmount: String,
        lampPolicyHex: String, lampAssetNameHex: String,
        utxosJson: String, protocolParamsJson: String, network: Int,
        promise: Promise,
    ) = run(promise, "E_BUILD_TX", "Không dựng được giao dịch Cardano") {
        nativeBuildSignedTransfer(
            kekHex, account, toAddress, amountLovelace, lampAmount,
            lampPolicyHex, lampAssetNameHex, utxosJson, protocolParamsJson, network,
        )
    }

    /** Dựng + ký tx uỷ thác stake vào 1 pool — client build, backend relay. */
    @ReactMethod
    fun buildStakeDelegation(
        kekHex: String, account: Int, poolBech32: String,
        utxosJson: String, protocolParamsJson: String, network: Int,
        promise: Promise,
    ) = run(promise, "E_BUILD_DELEG", "Không dựng được giao dịch uỷ thác") {
        nativeBuildStakeDelegation(kekHex, account, poolBech32, utxosJson, protocolParamsJson, network)
    }

    /** Witness (ký) tx CBOR đã dựng sẵn (GetLAMP) — client witness, backend submit. */
    @ReactMethod
    fun witnessUnsignedTx(
        kekHex: String, account: Int, unsignedTxCborHex: String, network: Int, promise: Promise,
    ) = run(promise, "E_WITNESS_TX", "Không ký được giao dịch") {
        nativeWitnessUnsignedTx(kekHex, account, unsignedTxCborHex, network)
    }

    /** 2FA DeviceKey opt-in: sinh Ed25519 ngẫu nhiên + ký canonical → JSON. */
    @ReactMethod
    fun deviceKeyOptin(userDid: String, nonce: String, promise: Promise) =
        run(promise, "E_DEVICE_KEY", "Không sinh được khoá thiết bị 2FA") {
            nativeDeviceKeyOptin(userDid, nonce)
        }

    /**
     * Dựng + ký tx MINT LAMP bằng OrgDID.
     *
     * `authorityKeksJson` = JSON array Master_KEK 64-hex. SinglePkh cần ĐÚNG 1;
     * MultiSig cần đủ threshold khoá — tức là **tất cả phải nằm trên máy này**.
     * Ký rải trên nhiều máy thì đường này không dùng được.
     */
    @ReactMethod
    fun buildMintLampViaDid(
        authorityKeksJson: String, registryUtxoJson: String, tokenTagHex: String,
        supplyStateUtxoJson: String, supplyStateScriptCbor: String, khoUtxoJson: String,
        lampPolicyCborHex: String, mintJson: String, utxosJson: String,
        protocolParamsJson: String, walletSeedHex: String,
        network: Int, currentSlot: Double,
        promise: Promise,
    ) {
        // Slot âm hoặc không nguyên = TTL rác. Chặn tại đây, đừng để thành tx chết
        // trên chuỗi mà người dùng chỉ thấy "gửi thất bại".
        if (currentSlot < 0 || currentSlot != Math.floor(currentSlot)) {
            promise.reject("E_MINT_SLOT", "current_slot không hợp lệ: $currentSlot")
            return
        }
        run(promise, "E_MINT_LAMP", "Không dựng được giao dịch mint LAMP") {
            nativeBuildMintLampViaDid(
                authorityKeksJson, registryUtxoJson, tokenTagHex,
                supplyStateUtxoJson, supplyStateScriptCbor, khoUtxoJson,
                lampPolicyCborHex, mintJson, utxosJson,
                protocolParamsJson, walletSeedHex,
                network, currentSlot.toLong(),
            )
        }
    }

    /**
     * Mint token qua Registry — bộ dựng tổng quát, dùng được cho token bất kỳ có
     * cổng Registry. Policy vào bằng `tokenPolicyCbor`, policy-id suy từ hash của
     * chính nó, nên không nhúng cứng token nào.
     *
     * `supplyStateUtxoJson` rỗng = token KHÔNG có cap (bỏ qua SupplyState).
     *
     * Cảnh báo: hàm này KHÔNG đối chiếu authority với RegistryDatum trước khi
     * dựng (khác `buildMintLampViaDid`). Khoá sai thì tx vẫn dựng ra, chuỗi mới
     * bác — mất phí và có thể mất collateral.
     */
    @ReactMethod
    fun buildMintViaRegistry(
        authorityKeksJson: String, registryUtxoJson: String, tokenPolicyCbor: String,
        mintJson: String, supplyStateUtxoJson: String, supplyStateScriptCbor: String,
        utxosJson: String, paramsJson: String, walletSeedHex: String,
        network: Int, slot: Double,
        promise: Promise,
    ) {
        // Slot âm hoặc không nguyên = TTL rác. Chặn tại đây.
        if (slot < 0 || slot != Math.floor(slot)) {
            promise.reject("E_MINT_SLOT", "slot không hợp lệ: $slot")
            return
        }
        run(promise, "E_MINT_REGISTRY", "Không dựng được giao dịch mint qua Registry") {
            nativeBuildMintViaRegistry(
                authorityKeksJson, registryUtxoJson, tokenPolicyCbor,
                mintJson, supplyStateUtxoJson, supplyStateScriptCbor,
                utxosJson, paramsJson, walletSeedHex,
                network, slot.toLong(),
            )
        }
    }

    @ReactMethod
    fun generateSalt(promise: Promise) =
        run(promise, "E_SALT", "Không sinh được salt") { nativeGenerateSalt() }

    @ReactMethod
    fun pbkdf2Derive(pin: String, saltHex: String, promise: Promise) =
        run(promise, "E_PBKDF2", "PBKDF2 thất bại") { nativePbkdf2Derive(pin, saltHex) }

    @ReactMethod
    fun aesGcmEncrypt(keyHex: String, plaintextHex: String, promise: Promise) =
        run(promise, "E_AES_ENC", "Mã hoá AES-GCM thất bại") { nativeAesGcmEncrypt(keyHex, plaintextHex) }

    @ReactMethod
    fun aesGcmDecrypt(keyHex: String, encryptedJson: String, promise: Promise) =
        run(promise, "E_AES_DEC", "Giải mã AES-GCM thất bại (sai khoá?)") {
            nativeAesGcmDecrypt(keyHex, encryptedJson)
        }

    @ReactMethod
    fun signEd25519(masterKekHex: String, message: String, promise: Promise) =
        run(promise, "E_SIGN_ED25519", "Ký Ed25519 thất bại") {
            nativeSignEd25519(masterKekHex, message)
        }

    // ── Secure storage (Keystore AES-GCM + SharedPreferences) ────────────────
    // Khoá AES nằm trong Android Keystore (non-exportable, device-bound); giá-trị
    // mã-hoá lưu SharedPreferences. Dùng để cất Wrapped_KEK / Master_KEK an toàn.

    private fun prefs() =
        reactApplicationContext.getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE)

    private fun secureAesKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getEntry(SECURE_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        kg.init(
            KeyGenParameterSpec.Builder(
                SECURE_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return kg.generateKey()
    }

    @ReactMethod
    fun secureStore(key: String, value: String, promise: Promise) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secureAesKey())
            val iv = cipher.iv
            val ct = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            val blob = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" +
                Base64.encodeToString(ct, Base64.NO_WRAP)
            prefs().edit().putString(key, blob).apply()
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_SECURE_STORE", e.message ?: "Lưu an toàn thất bại", e)
        }
    }

    @ReactMethod
    fun secureLoad(key: String, promise: Promise) {
        try {
            val blob = prefs().getString(key, null)
            if (blob == null) { promise.resolve(null); return }
            val parts = blob.split(":")
            if (parts.size != 2) { promise.resolve(null); return }
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val ct = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secureAesKey(), GCMParameterSpec(128, iv))
            promise.resolve(String(cipher.doFinal(ct), Charsets.UTF_8))
        } catch (e: Throwable) {
            promise.reject("E_SECURE_LOAD", e.message ?: "Đọc an toàn thất bại", e)
        }
    }

    @ReactMethod
    fun secureDelete(key: String, promise: Promise) {
        try {
            prefs().edit().remove(key).apply()
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("E_SECURE_DELETE", e.message ?: "Xoá an toàn thất bại", e)
        }
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val SECURE_KEY_ALIAS = "taad_secure_aes"
        private const val SECURE_PREFS = "taad_secure_store"

        // Phòng thủ: AAB có thể gồm ABI mà .so chưa build (vd x86). Nếu loadLibrary
        // ném thì giữ libLoaded=false → các method reject thay vì crash app lúc mở.
        private var libLoaded = false
        init {
            try {
                System.loadLibrary("taad_enclave_core")
                libLoaded = true
            } catch (e: Throwable) {
                // .so vắng cho ABI hiện tại — module báo không khả dụng, KHÔNG sập app.
            }
        }
    }
}
