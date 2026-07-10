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

    // ── JNI — OrgDID + mint LAMP (bản B) ────────────────────────────────────
    private external fun nativeConstructDid(typeByte: Int, creatorDid: String, slot: Long): String?
    private external fun nativeAnchorAssetName(did: String): String?
    private external fun nativeDeriveTaadPublicKey(masterKekHex: String): String?
    private external fun nativeDeriveWalletSeed(masterKekHex: String): String?
    private external fun nativeDeriveCardanoAddress(walletSeedHex: String, network: Int): String?
    private external fun nativeBuildCreateChildTaadUtxoTx(
        childDid: String,
        ownerDid: String,
        entityType: Int,
        hwPubHex: String,
        childTaadPubHex: String,
        ownerMasterKekHex: String,
        walletSeedHex: String,
        network: Int,
        taadScriptCborHex: String,
        policyIdHex: String,
        ownerUtxoJson: String,
        utxoInputsJson: String,
        protocolParamsJson: String,
        currentSlot: Long,
    ): String?
    private external fun nativeBuildMintLampViaDid(
        authorityKeksJson: String,
        registryUtxoJson: String,
        tokenTagHex: String,
        supplyStateUtxoJson: String,
        supplyStateScriptCbor: String,
        khoUtxoJson: String,
        lampPolicyCborHex: String,
        mintJson: String,
        utxosJson: String,
        protocolParamsJson: String,
        walletSeedHex: String,
        network: Int,
        currentSlot: Long,
    ): String?

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

    // ── OrgDID + mint LAMP (bản B) ──────────────────────────────────────────

    @ReactMethod
    fun constructDid(typeByte: Double, creatorDid: String, slot: Double, promise: Promise) {
        try {
            val did = nativeConstructDid(typeByte.toInt(), creatorDid, slot.toLong())
            if (did.isNullOrEmpty()) {
                promise.reject("E_CONSTRUCT_DID", "Không dựng được chuỗi DID")
            } else {
                promise.resolve(did)
            }
        } catch (e: Throwable) {
            promise.reject("E_CONSTRUCT_DID", e.message ?: "Dựng DID thất bại", e)
        }
    }

    @ReactMethod
    fun anchorAssetName(did: String, promise: Promise) {
        try {
            val hex = nativeAnchorAssetName(did)
            if (hex.isNullOrEmpty()) {
                promise.reject("E_ANCHOR_ASSET_NAME", "DID rỗng hoặc không hợp lệ")
            } else {
                promise.resolve(hex)
            }
        } catch (e: Throwable) {
            promise.reject("E_ANCHOR_ASSET_NAME", e.message ?: "Tính asset-name thất bại", e)
        }
    }

    @ReactMethod
    fun deriveTaadPublicKey(masterKekHex: String, promise: Promise) {
        try {
            val pubkey = nativeDeriveTaadPublicKey(masterKekHex)
            if (pubkey.isNullOrEmpty()) {
                promise.reject("E_DERIVE_TAAD_PUBKEY", "Master_KEK không hợp lệ (cần 64-hex)")
            } else {
                promise.resolve(pubkey)
            }
        } catch (e: Throwable) {
            promise.reject("E_DERIVE_TAAD_PUBKEY", e.message ?: "Suy TAAD pubkey thất bại", e)
        }
    }

    @ReactMethod
    fun deriveWalletSeed(masterKekHex: String, promise: Promise) {
        try {
            val seed = nativeDeriveWalletSeed(masterKekHex)
            if (seed.isNullOrEmpty()) {
                promise.reject("E_DERIVE_WALLET_SEED", "Master_KEK không hợp lệ (cần 64-hex)")
            } else {
                promise.resolve(seed)
            }
        } catch (e: Throwable) {
            promise.reject("E_DERIVE_WALLET_SEED", e.message ?: "Suy ví seed thất bại", e)
        }
    }

    @ReactMethod
    fun deriveCardanoAddress(walletSeedHex: String, network: Double, promise: Promise) {
        try {
            val addr = nativeDeriveCardanoAddress(walletSeedHex, network.toInt())
            if (addr.isNullOrEmpty()) {
                promise.reject("E_DERIVE_ADDRESS", "Ví seed không hợp lệ (cần 64-hex)")
            } else {
                promise.resolve(addr)
            }
        } catch (e: Throwable) {
            promise.reject("E_DERIVE_ADDRESS", e.message ?: "Suy địa chỉ ví thất bại", e)
        }
    }

    @ReactMethod
    fun buildCreateChildTaadUtxoTx(
        childDid: String,
        ownerDid: String,
        entityType: Double,
        hwPubHex: String,
        childTaadPubHex: String,
        ownerMasterKekHex: String,
        walletSeedHex: String,
        network: Double,
        taadScriptCborHex: String,
        policyIdHex: String,
        ownerUtxoJson: String,
        utxoInputsJson: String,
        protocolParamsJson: String,
        currentSlot: Double,
        promise: Promise,
    ) {
        try {
            val txHex = nativeBuildCreateChildTaadUtxoTx(
                childDid, ownerDid, entityType.toInt(), hwPubHex, childTaadPubHex,
                ownerMasterKekHex, walletSeedHex, network.toInt(), taadScriptCborHex,
                policyIdHex, ownerUtxoJson, utxoInputsJson, protocolParamsJson, currentSlot.toLong(),
            )
            if (txHex.isNullOrEmpty()) {
                promise.reject(
                    "E_CREATE_CHILD_TAAD",
                    "Không ráp được tx tạo OrgDID — kiểm tra UTxO owner/ví, entity_type (1..9), policy/script CBOR",
                )
            } else {
                promise.resolve(txHex)
            }
        } catch (e: Throwable) {
            promise.reject("E_CREATE_CHILD_TAAD", e.message ?: "Ráp tx tạo OrgDID thất bại", e)
        }
    }

    @ReactMethod
    fun buildMintLampViaDid(
        authorityKeksJson: String,
        registryUtxoJson: String,
        tokenTagHex: String,
        supplyStateUtxoJson: String,
        supplyStateScriptCbor: String,
        khoUtxoJson: String,
        lampPolicyCborHex: String,
        mintJson: String,
        utxosJson: String,
        protocolParamsJson: String,
        walletSeedHex: String,
        network: Double,
        currentSlot: Double,
        promise: Promise,
    ) {
        try {
            val txHex = nativeBuildMintLampViaDid(
                authorityKeksJson, registryUtxoJson, tokenTagHex, supplyStateUtxoJson,
                supplyStateScriptCbor, khoUtxoJson, lampPolicyCborHex, mintJson, utxosJson,
                protocolParamsJson, walletSeedHex, network.toInt(), currentSlot.toLong(),
            )
            if (txHex.isNullOrEmpty()) {
                promise.reject(
                    "E_MINT_LAMP",
                    "Không ráp được tx mint LAMP — kiểm tra UTxO ví/Registry/SupplyState/KHO, authority KEK khớp entry registry, chưa vượt cap",
                )
            } else {
                promise.resolve(txHex)
            }
        } catch (e: Throwable) {
            promise.reject("E_MINT_LAMP", e.message ?: "Ráp tx mint LAMP thất bại", e)
        }
    }

    companion object {
        init {
            System.loadLibrary("taad_enclave_core")
        }
    }
}
