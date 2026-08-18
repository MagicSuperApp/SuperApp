// Obj-C bridge cho TaadEnclaveModule (Swift) — phơi Promise methods cho RN.
// Xem TaadEnclaveModule.swift cho hành vi. Rust FFI: rust/taad_enclave_core.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TaadEnclaveModule, NSObject)

RCT_EXTERN_METHOD(generateMasterKek:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(masterKekToMnemonic:(NSString *)kekHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(mnemonicToMasterKek:(NSString *)words
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveTaadPubkey:(NSString *)kekHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveWalletSeed:(NSString *)kekHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveWalletAddress:(NSString *)kekHex
                  account:(NSInteger)account
                  network:(NSInteger)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveStakeAddress:(NSString *)kekHex
                  account:(NSInteger)account
                  network:(NSInteger)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signWalletRegister:(NSString *)kekHex
                  account:(NSInteger)account
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(buildSignedTransfer:(NSString *)kekHex
                  account:(NSInteger)account
                  toAddress:(NSString *)toAddress
                  amountLovelace:(NSString *)amountLovelace
                  lampAmount:(NSString *)lampAmount
                  lampPolicyHex:(NSString *)lampPolicyHex
                  lampAssetNameHex:(NSString *)lampAssetNameHex
                  utxosJson:(NSString *)utxosJson
                  protocolParamsJson:(NSString *)protocolParamsJson
                  network:(NSInteger)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(buildStakeDelegation:(NSString *)kekHex
                  account:(NSInteger)account
                  poolBech32:(NSString *)poolBech32
                  utxosJson:(NSString *)utxosJson
                  protocolParamsJson:(NSString *)protocolParamsJson
                  network:(NSInteger)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(witnessUnsignedTx:(NSString *)kekHex
                  account:(NSInteger)account
                  unsignedTxCborHex:(NSString *)unsignedTxCborHex
                  network:(NSInteger)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deviceKeyOptin:(NSString *)userDid
                  nonce:(NSString *)nonce
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateSalt:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pbkdf2Derive:(NSString *)pin
                  saltHex:(NSString *)saltHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(aesGcmEncrypt:(NSString *)keyHex
                  plaintextHex:(NSString *)plaintextHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(aesGcmDecrypt:(NSString *)keyHex
                  encryptedJson:(NSString *)encryptedJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signEd25519:(NSString *)masterKekHex
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(secureStore:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(secureLoad:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(secureDelete:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Mint LAMP bằng OrgDID — thứ tự PHẢI khớp selector @objc bên Swift và
// `taad_build_mint_lamp_via_did` trong lib.rs. Đây là ba chỗ phải sửa cùng lúc.
RCT_EXTERN_METHOD(buildMintLampViaDid:(NSString *)authorityKeksJson
                  registryUtxoJson:(NSString *)registryUtxoJson
                  tokenTagHex:(NSString *)tokenTagHex
                  supplyStateUtxoJson:(NSString *)supplyStateUtxoJson
                  supplyStateScriptCbor:(NSString *)supplyStateScriptCbor
                  khoUtxoJson:(NSString *)khoUtxoJson
                  lampPolicyCborHex:(NSString *)lampPolicyCborHex
                  mintJson:(NSString *)mintJson
                  utxosJson:(NSString *)utxosJson
                  protocolParamsJson:(NSString *)protocolParamsJson
                  walletSeedHex:(NSString *)walletSeedHex
                  network:(NSInteger)network
                  currentSlot:(double)currentSlot
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Mint token qua Registry (bộ dựng tổng quát) — thứ tự PHẢI khớp selector @objc
// bên Swift và `taad_build_mint_via_registry` trong lib.rs. Ba chỗ sửa cùng lúc.
RCT_EXTERN_METHOD(buildMintViaRegistry:(NSString *)authorityKeksJson
                  registryUtxoJson:(NSString *)registryUtxoJson
                  tokenPolicyCbor:(NSString *)tokenPolicyCbor
                  mintJson:(NSString *)mintJson
                  supplyStateUtxoJson:(NSString *)supplyStateUtxoJson
                  supplyStateScriptCbor:(NSString *)supplyStateScriptCbor
                  utxosJson:(NSString *)utxosJson
                  paramsJson:(NSString *)paramsJson
                  walletSeedHex:(NSString *)walletSeedHex
                  network:(NSInteger)network
                  slot:(double)slot
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
