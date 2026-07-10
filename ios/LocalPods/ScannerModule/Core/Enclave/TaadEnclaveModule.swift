import Foundation
import React
import taad_enclave_core

/// RN bridge cho Rust core `taad_enclave_core` (PhoenixKey Enclave).
///
/// Phase 1 — chỉ phơi 4 hàm seed/Master_KEK (BIP39 24 từ):
///   - generateMasterKek()           → 64-hex Master_KEK ngẫu nhiên
///   - masterKekToMnemonic(kekHex)    → cụm 24 từ BIP39
///   - mnemonicToMasterKek(words)     → 64-hex KEK (reject nếu cụm từ sai)
///
/// FFI hợp đồng (lib.rs): hàm trả `*mut c_char` → caller PHẢI free bằng
/// `taad_free_string`. Input là chuỗi UTF-8 null-terminated. NULL = lỗi.
///
/// Các hàm Cardano/tx/lampnet trong crate sẽ phơi dần ở các phase sau.
@objc(TaadEnclaveModule)
final class TaadEnclaveModule: NSObject {

    @objc static func moduleName() -> String! { "TaadEnclaveModule" }
    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Master_KEK + BIP39

    @objc(generateMasterKek:rejecter:)
    func generateMasterKek(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let ptr = taad_generate_master_kek() else {
            reject("E_KEK_GEN", "taad_generate_master_kek trả NULL", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(masterKekToMnemonic:resolver:rejecter:)
    func masterKekToMnemonic(_ kekHex: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = kekHex.withCString { cstr in
            taad_master_kek_to_mnemonic(cstr)
        }
        guard let ptr = out else {
            reject("E_KEK_TO_MNEMONIC", "Master_KEK không hợp lệ (cần 64-hex)", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(mnemonicToMasterKek:resolver:rejecter:)
    func mnemonicToMasterKek(_ words: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = words.withCString { cstr in
            taad_mnemonic_to_master_kek(cstr)
        }
        guard let ptr = out else {
            reject("E_MNEMONIC_INVALID", "Cụm từ khôi phục không hợp lệ", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    // MARK: - OrgDID + mint LAMP (bản B) — helpers

    /// Gọi 1 hàm C nhận N con trỏ C-string bằng cách giữ sống TOÀN BỘ chuỗi qua
    /// đệ quy `withCString` (tránh pyramid lồng tay cho hàm >5 tham số string).
    /// Con trỏ trong `body` chỉ hợp lệ TRONG PHẠM VI closure — an toàn vì hàm C
    /// được gọi ngay bên trong `body`, không giữ con trỏ lại sau khi return.
    private func withCStrings<R>(_ strings: [String], _ body: ([UnsafePointer<CChar>?]) -> R) -> R {
        func helper(_ idx: Int, _ acc: [UnsafePointer<CChar>?]) -> R {
            if idx == strings.count { return body(acc) }
            return strings[idx].withCString { cstr in
                helper(idx + 1, acc + [cstr])
            }
        }
        return helper(0, [])
    }

    /// Dựng chuỗi DID (`did:phoenix:...`). `typeByte`: 1=Org..9=Character (xem
    /// `taad_construct_did` — 0 = root Person, dùng cho identity thường).
    @objc(constructDid:creatorDid:slot:resolver:rejecter:)
    func constructDid(_ typeByte: NSNumber,
                      creatorDid: String,
                      slot: NSNumber,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = creatorDid.withCString { cstr in
            taad_construct_did(UInt8(truncating: typeByte), cstr, UInt64(truncating: slot))
        }
        guard let ptr = out else {
            reject("E_CONSTRUCT_DID", "Không dựng được chuỗi DID", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// Asset-name (hex, blake2b_256(did)) — dùng để tra Registry-NFT/anchor NFT
    /// qua Blockfrost trước khi build tx.
    @objc(anchorAssetName:resolver:rejecter:)
    func anchorAssetName(_ did: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = did.withCString { cstr in
            taad_anchor_asset_name(cstr)
        }
        guard let ptr = out else {
            reject("E_ANCHOR_ASSET_NAME", "DID rỗng hoặc không hợp lệ", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// TAAD_Key (controller) Ed25519 pubkey hex, suy từ Master_KEK qua CÙNG
    /// `derive_taad_seed` mà genesis/rotate/mint dùng.
    @objc(deriveTaadPublicKey:resolver:rejecter:)
    func deriveTaadPublicKey(_ masterKekHex: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = masterKekHex.withCString { cstr in
            taad_derive_taad_public_key(cstr)
        }
        guard let ptr = out else {
            reject("E_DERIVE_TAAD_PUBKEY", "Master_KEK không hợp lệ (cần 64-hex)", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// Ví seed (32-byte entropy CIP-1852, hex) suy từ Master_KEK — input bắt
    /// buộc của MỌI builder tx (`walletSeedHex`) + `deriveCardanoAddress`.
    @objc(deriveWalletSeed:resolver:rejecter:)
    func deriveWalletSeed(_ masterKekHex: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = masterKekHex.withCString { cstr in
            taad_derive_wallet_seed(cstr)
        }
        guard let ptr = out else {
            reject("E_DERIVE_WALLET_SEED", "Master_KEK không hợp lệ (cần 64-hex)", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// Địa chỉ ví account-0 (ví cố định phí+collateral+change) từ ví seed.
    /// `network`: 0=preprod/preview (testnet id), 1=mainnet.
    @objc(deriveCardanoAddress:network:resolver:rejecter:)
    func deriveCardanoAddress(_ walletSeedHex: String,
                              network: NSNumber,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out: UnsafeMutablePointer<CChar>? = walletSeedHex.withCString { cstr in
            taad_derive_cardano_address(cstr, UInt8(truncating: network))
        }
        guard let ptr = out else {
            reject("E_DERIVE_ADDRESS", "Ví seed không hợp lệ (cần 64-hex)", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// Tạo CHILD DID (OrgDID) on-chain qua cổng `GenesisChild` — owner ký,
    /// child KHÔNG ký genesis. Xem `taad_build_create_child_taad_utxo_tx` (Rust,
    /// lib.rs) cho ý nghĩa từng tham số — thứ tự dưới đây PHẢI khớp.
    @objc(buildCreateChildTaadUtxoTx:ownerDid:entityType:hwPubHex:childTaadPubHex:ownerMasterKekHex:walletSeedHex:network:taadScriptCborHex:policyIdHex:ownerUtxoJson:utxoInputsJson:protocolParamsJson:currentSlot:resolver:rejecter:)
    func buildCreateChildTaadUtxoTx(_ childDid: String,
                                    ownerDid: String,
                                    entityType: NSNumber,
                                    hwPubHex: String,
                                    childTaadPubHex: String,
                                    ownerMasterKekHex: String,
                                    walletSeedHex: String,
                                    network: NSNumber,
                                    taadScriptCborHex: String,
                                    policyIdHex: String,
                                    ownerUtxoJson: String,
                                    utxoInputsJson: String,
                                    protocolParamsJson: String,
                                    currentSlot: NSNumber,
                                    resolver resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        let strs = [childDid, ownerDid, hwPubHex, childTaadPubHex, ownerMasterKekHex,
                    walletSeedHex, taadScriptCborHex, policyIdHex, ownerUtxoJson,
                    utxoInputsJson, protocolParamsJson]
        let out: UnsafeMutablePointer<CChar>? = withCStrings(strs) { p in
            taad_build_create_child_taad_utxo_tx(
                p[0], p[1], UInt8(truncating: entityType), p[2], p[3], p[4], p[5],
                UInt8(truncating: network), p[6], p[7], p[8], p[9], p[10],
                UInt64(truncating: currentSlot)
            )
        }
        guard let ptr = out else {
            reject("E_CREATE_CHILD_TAAD", "Không ráp được tx tạo OrgDID — kiểm tra UTxO owner/ví, entity_type (1..9), policy/script CBOR", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    /// Ký tx MINT LAMP (bản B — Registry-gate + SupplyState + A-DEST kho). Xem
    /// `taad_build_mint_lamp_via_did` (Rust, lib.rs) — thứ tự tham số PHẢI khớp.
    @objc(buildMintLampViaDid:registryUtxoJson:tokenTagHex:supplyStateUtxoJson:supplyStateScriptCbor:khoUtxoJson:lampPolicyCborHex:mintJson:utxosJson:protocolParamsJson:walletSeedHex:network:currentSlot:resolver:rejecter:)
    func buildMintLampViaDid(_ authorityKeksJson: String,
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
                             network: NSNumber,
                             currentSlot: NSNumber,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let strs = [authorityKeksJson, registryUtxoJson, tokenTagHex, supplyStateUtxoJson,
                    supplyStateScriptCbor, khoUtxoJson, lampPolicyCborHex, mintJson,
                    utxosJson, protocolParamsJson, walletSeedHex]
        let out: UnsafeMutablePointer<CChar>? = withCStrings(strs) { p in
            taad_build_mint_lamp_via_did(
                p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10],
                UInt8(truncating: network), UInt64(truncating: currentSlot)
            )
        }
        guard let ptr = out else {
            reject("E_MINT_LAMP", "Không ráp được tx mint LAMP — kiểm tra UTxO ví/Registry/SupplyState/KHO, authority KEK khớp entry registry, chưa vượt cap", nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }
}
