import Foundation
import Security
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

    // MARK: - Câu lỗi của lõi (Issue #285)

    /// Lý do THẬT của lần gọi FFI vừa trả NULL, hoặc `fallback` nếu lõi im lặng.
    ///
    /// Lõi giữ ô lỗi theo LUỒNG và `taad_last_error` đọc một lần rồi xoá, nên
    /// chỉ được gọi NGAY sau khi thấy NULL, trên chính luồng đã gọi. Gọi lúc
    /// khác thì giá trị đọc được không nói về lần gọi nào cả.
    private func reason(or fallback: String) -> String {
        guard let e = taad_last_error() else { return fallback }
        defer { taad_free_string(e) }
        let msg = String(cString: e)
        return msg.isEmpty ? fallback : msg
    }

    // MARK: - Master_KEK + BIP39

    @objc(generateMasterKek:rejecter:)
    func generateMasterKek(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let ptr = taad_generate_master_kek() else {
            reject("E_KEK_GEN", reason(or: "taad_generate_master_kek trả NULL"), nil)
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
            reject("E_KEK_TO_MNEMONIC", reason(or: "Master_KEK không hợp lệ (cần 64-hex)"), nil)
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
            reject("E_MNEMONIC_INVALID", reason(or: "Cụm từ khôi phục không hợp lệ"), nil)
            return
        }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    // MARK: - Derive (composed) + wrapping primitives

    /// Gói: ptr C → String (free) hoặc reject nếu null.
    private func resolvePtr(_ ptr: UnsafeMutablePointer<CChar>?,
                            _ resolve: RCTPromiseResolveBlock,
                            _ reject: RCTPromiseRejectBlock,
                            _ code: String, _ msg: String) {
        // Lõi có câu lỗi thì đưa ĐÚNG câu đó lên; `msg` chỉ là phương án chót
        // khi lõi im lặng (Issue #285).
        guard let ptr = ptr else { reject(code, reason(or: msg), nil); return }
        defer { taad_free_string(ptr) }
        resolve(String(cString: ptr))
    }

    @objc(deriveTaadPubkey:resolver:rejecter:)
    func deriveTaadPubkey(_ kekHex: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { taad_kek_derive_taad_pubkey($0) }
        resolvePtr(out, resolve, reject, "E_DERIVE_TAAD", "Master_KEK không hợp lệ")
    }

    @objc(deriveWalletSeed:resolver:rejecter:)
    func deriveWalletSeed(_ kekHex: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { taad_kek_derive_wallet_seed($0) }
        resolvePtr(out, resolve, reject, "E_DERIVE_SEED", "Master_KEK không hợp lệ")
    }

    @objc(deriveWalletAddress:account:network:resolver:rejecter:)
    func deriveWalletAddress(_ kekHex: String,
                             account: Int,
                             network: Int,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString {
            taad_kek_derive_wallet_address($0, UInt32(account), UInt8(network))
        }
        resolvePtr(out, resolve, reject, "E_DERIVE_ADDR", "Không derive được địa chỉ Cardano")
    }

    /// Địa-chỉ STAKE (reward) — cùng CIP-1852 với ví, nhánh role 2 (m/1852'/1815'/acc'/2/0).
    /// Dùng cho /wallet/standard/register (stake_address) + staking sau này.
    @objc(deriveStakeAddress:account:network:resolver:rejecter:)
    func deriveStakeAddress(_ kekHex: String,
                            account: Int,
                            network: Int,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString {
            taad_kek_derive_stake_address($0, UInt32(account), UInt8(network))
        }
        resolvePtr(out, resolve, reject, "E_DERIVE_STAKE", "Không derive được địa chỉ stake Cardano")
    }

    /// Ký challenge proof-of-ownership /wallet/standard/register bằng payment key
    /// của account (Issue #47). Trả JSON {"paymentPublicKeyHex","signature"}.
    @objc(signWalletRegister:account:message:resolver:rejecter:)
    func signWalletRegister(_ kekHex: String,
                            account: Int,
                            message: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { k in
            message.withCString { m in
                taad_kek_sign_wallet_register(k, UInt32(account), m)
            }
        }
        resolvePtr(out, resolve, reject, "E_SIGN_WALLET_REG", "Không ký được proof-of-ownership ví Standard")
    }

    /// Dựng + ký tx Cardano (ADA/LAMP) — client build, backend relay (Issue #74).
    /// amount* là String (u64 vượt precision). Trả CBOR hex đã ký.
    @objc(buildSignedTransfer:account:toAddress:amountLovelace:lampAmount:lampPolicyHex:lampAssetNameHex:utxosJson:protocolParamsJson:network:resolver:rejecter:)
    func buildSignedTransfer(_ kekHex: String,
                             account: Int,
                             toAddress: String,
                             amountLovelace: String,
                             lampAmount: String,
                             lampPolicyHex: String,
                             lampAssetNameHex: String,
                             utxosJson: String,
                             protocolParamsJson: String,
                             network: Int,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { k in
            toAddress.withCString { to in
            amountLovelace.withCString { amt in
            lampAmount.withCString { lamp in
            lampPolicyHex.withCString { pol in
            lampAssetNameHex.withCString { nm in
            utxosJson.withCString { ux in
            protocolParamsJson.withCString { pp in
                taad_kek_build_signed_transfer(
                    k, UInt32(account), to, amt, lamp, pol, nm, ux, pp, UInt8(network))
            }}}}}}}
        }
        resolvePtr(out, resolve, reject, "E_BUILD_TX", "Không dựng được giao dịch Cardano")
    }

    /// Dựng + ký tx uỷ thác stake vào 1 pool — client build, backend relay.
    @objc(buildStakeDelegation:account:poolBech32:utxosJson:protocolParamsJson:network:resolver:rejecter:)
    func buildStakeDelegation(_ kekHex: String,
                              account: Int,
                              poolBech32: String,
                              utxosJson: String,
                              protocolParamsJson: String,
                              network: Int,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { k in
            poolBech32.withCString { pool in
            utxosJson.withCString { ux in
            protocolParamsJson.withCString { pp in
                taad_kek_build_stake_delegation(k, UInt32(account), pool, ux, pp, UInt8(network))
            }}}
        }
        resolvePtr(out, resolve, reject, "E_BUILD_DELEG", "Không dựng được giao dịch uỷ thác")
    }

    /// Witness (ký) tx CBOR đã dựng sẵn (GetLAMP) — client witness, backend submit.
    @objc(witnessUnsignedTx:account:unsignedTxCborHex:network:resolver:rejecter:)
    func witnessUnsignedTx(_ kekHex: String,
                           account: Int,
                           unsignedTxCborHex: String,
                           network: Int,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = kekHex.withCString { k in
            unsignedTxCborHex.withCString { cbor in
                taad_kek_witness_unsigned_tx(k, UInt32(account), cbor, UInt8(network))
            }
        }
        resolvePtr(out, resolve, reject, "E_WITNESS_TX", "Không ký được giao dịch")
    }

    /// 2FA DeviceKey opt-in: sinh Ed25519 ngẫu nhiên + ký canonical → JSON.
    @objc(deviceKeyOptin:nonce:resolver:rejecter:)
    func deviceKeyOptin(_ userDid: String,
                        nonce: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = userDid.withCString { d in
            nonce.withCString { n in
                taad_device_key_optin(d, n)
            }
        }
        resolvePtr(out, resolve, reject, "E_DEVICE_KEY", "Không sinh được khoá thiết bị 2FA")
    }

    @objc(generateSalt:rejecter:)
    func generateSalt(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolvePtr(taad_generate_salt(), resolve, reject, "E_SALT", "Không sinh được salt")
    }

    @objc(pbkdf2Derive:saltHex:resolver:rejecter:)
    func pbkdf2Derive(_ pin: String,
                      saltHex: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = pin.withCString { p in saltHex.withCString { s in taad_pbkdf2_derive(p, s) } }
        resolvePtr(out, resolve, reject, "E_PBKDF2", "PBKDF2 thất bại")
    }

    @objc(aesGcmEncrypt:plaintextHex:resolver:rejecter:)
    func aesGcmEncrypt(_ keyHex: String,
                       plaintextHex: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = keyHex.withCString { k in plaintextHex.withCString { p in taad_aes_gcm_encrypt(k, p) } }
        resolvePtr(out, resolve, reject, "E_AES_ENC", "Mã hoá AES-GCM thất bại")
    }

    @objc(aesGcmDecrypt:encryptedJson:resolver:rejecter:)
    func aesGcmDecrypt(_ keyHex: String,
                       encryptedJson: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = keyHex.withCString { k in encryptedJson.withCString { j in taad_aes_gcm_decrypt(k, j) } }
        resolvePtr(out, resolve, reject, "E_AES_DEC", "Giải mã AES-GCM thất bại (sai khoá?)")
    }

    @objc(signEd25519:message:resolver:rejecter:)
    func signEd25519(_ masterKekHex: String,
                     message: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        let out = masterKekHex.withCString { k in message.withCString { m in taad_sign_ed25519(k, m) } }
        resolvePtr(out, resolve, reject, "E_SIGN_ED25519", "Ký Ed25519 thất bại")
    }

    // MARK: - Secure storage (Keychain, WhenUnlockedThisDeviceOnly)

    private let secureService = "com.orilife.taad.secure"

    private func secureQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: secureService,
            kSecAttrAccount as String: key,
        ]
    }

    @objc(secureStore:value:resolver:rejecter:)
    func secureStore(_ key: String,
                     value: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        SecItemDelete(secureQuery(key) as CFDictionary) // ghi đè nếu đã có
        var add = secureQuery(key)
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess {
            resolve(true)
        } else {
            reject("E_SECURE_STORE", "Keychain add failed (\(status))", nil)
        }
    }

    @objc(secureLoad:resolver:rejecter:)
    func secureLoad(_ key: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        var query = secureQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data,
           let s = String(data: data, encoding: .utf8) {
            resolve(s)
        } else if status == errSecItemNotFound {
            resolve(nil)
        } else {
            reject("E_SECURE_LOAD", "Keychain read failed (\(status))", nil)
        }
    }

    @objc(secureDelete:resolver:rejecter:)
    func secureDelete(_ key: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = SecItemDelete(secureQuery(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            resolve(true)
        } else {
            reject("E_SECURE_DELETE", "Keychain delete failed (\(status))", nil)
        }
    }

    // MARK: - Mint LAMP bằng OrgDID (bản B — cổng Registry + SupplyState + A-DEST kho)

    /// Dựng + ký tx MINT LAMP theo cổng on-chain thật.
    ///
    /// Thứ tự tham số PHẢI khớp `taad_build_mint_lamp_via_did` trong lib.rs — đó là
    /// nơi duy nhất giải thích ý nghĩa từng cái. Lệch một chỗ thì tx vẫn dựng ra
    /// nhưng SAI, và Rust không có cách nào biết để báo.
    ///
    /// `authorityKeksJson` = JSON array các Master_KEK 64-hex. SinglePkh cần ĐÚNG 1;
    /// MultiSig cần đủ `threshold` khoá — nghĩa là **tất cả phải nằm trên cùng máy
    /// này**. Ký rải trên nhiều máy thì đường này KHÔNG dùng được (xem ghi chú ở
    /// `orgMintService.ts`).
    ///
    /// Trả hex CBOR tx đã ký. NULL từ Rust = hỏng ở đâu đó (parse / authority không
    /// khớp registry / quá cap / thiếu UTxO) — Rust không trả thông điệp qua FFI.
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
                             network: Int,
                             currentSlot: Double,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Slot âm hoặc không nguyên = TTL rác. Chặn ở đây, đừng để thành tx chết trên
        // chuỗi mà người dùng chỉ thấy "gửi thất bại".
        guard currentSlot >= 0, currentSlot.rounded() == currentSlot else {
            reject("E_MINT_SLOT", "current_slot không hợp lệ: \(currentSlot)", nil)
            return
        }

        // 11 chuỗi — lồng withCString 11 tầng thì trình biên dịch Swift đuối. Cấp phát
        // một lượt rồi giải phóng bằng defer: cùng vòng đời, ít chỗ sai hơn.
        let inputs = [authorityKeksJson, registryUtxoJson, tokenTagHex,
                      supplyStateUtxoJson, supplyStateScriptCbor, khoUtxoJson,
                      lampPolicyCborHex, mintJson, utxosJson,
                      protocolParamsJson, walletSeedHex]
        var cs: [UnsafeMutablePointer<CChar>?] = []
        cs.reserveCapacity(inputs.count)
        for v in inputs { cs.append(strdup(v)) }
        defer { for p in cs { free(p) } }
        guard !cs.contains(where: { $0 == nil }) else {
            reject("E_MINT_ALLOC", "Không cấp phát được vùng nhớ cho tham số mint", nil)
            return
        }

        let out = taad_build_mint_lamp_via_did(
            cs[0], cs[1], cs[2], cs[3], cs[4], cs[5], cs[6], cs[7], cs[8], cs[9], cs[10],
            UInt8(network), UInt64(currentSlot))
        resolvePtr(out, resolve, reject, "E_MINT_LAMP",
                   "Không dựng được giao dịch mint LAMP")
    }

    /// Mint token BẤT KỲ qua cổng Registry — bộ dựng tổng quát. Policy vào bằng
    /// `tokenPolicyCbor`, policy-id suy từ hash của chính nó, nên không hàm nào ở
    /// đây nhúng cứng một token cụ thể.
    ///
    /// Thứ tự tham số PHẢI khớp `taad_build_mint_via_registry` trong lib.rs.
    ///
    /// KHÔNG dùng cho LAMP: hàm này không dựng output KHO (A-DEST) mà nhánh
    /// DistributionVest của `lamp_mint` đòi. Mint LAMP dùng `buildMintLampViaDid`.
    ///
    /// `supplyStateUtxoJson` rỗng = token KHÔNG có cap (bỏ qua SupplyState).
    @objc(buildMintViaRegistry:registryUtxoJson:tokenPolicyCbor:mintJson:supplyStateUtxoJson:supplyStateScriptCbor:utxosJson:paramsJson:walletSeedHex:network:slot:resolver:rejecter:)
    func buildMintViaRegistry(_ authorityKeksJson: String,
                              registryUtxoJson: String,
                              tokenPolicyCbor: String,
                              mintJson: String,
                              supplyStateUtxoJson: String,
                              supplyStateScriptCbor: String,
                              utxosJson: String,
                              paramsJson: String,
                              walletSeedHex: String,
                              network: Int,
                              slot: Double,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard slot >= 0, slot.rounded() == slot else {
            reject("E_MINT_SLOT", "slot không hợp lệ: \(slot)", nil)
            return
        }

        // 9 chuỗi — cấp phát một lượt rồi giải phóng bằng defer, như đường mint LAMP.
        let inputs = [authorityKeksJson, registryUtxoJson, tokenPolicyCbor,
                      mintJson, supplyStateUtxoJson, supplyStateScriptCbor,
                      utxosJson, paramsJson, walletSeedHex]
        var cs: [UnsafeMutablePointer<CChar>?] = []
        cs.reserveCapacity(inputs.count)
        for v in inputs { cs.append(strdup(v)) }
        defer { for p in cs { free(p) } }
        guard !cs.contains(where: { $0 == nil }) else {
            reject("E_MINT_ALLOC", "Không cấp phát được vùng nhớ cho tham số mint", nil)
            return
        }

        let out = taad_build_mint_via_registry(
            cs[0], cs[1], cs[2], cs[3], cs[4], cs[5], cs[6], cs[7], cs[8],
            UInt8(network), UInt64(slot))
        resolvePtr(out, resolve, reject, "E_MINT_REGISTRY",
                   "Không dựng được giao dịch mint qua Registry")
    }
}
