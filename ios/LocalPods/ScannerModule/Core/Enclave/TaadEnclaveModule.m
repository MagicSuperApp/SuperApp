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

// ── OrgDID + mint LAMP (bản B) ──────────────────────────────────────

RCT_EXTERN_METHOD(constructDid:(nonnull NSNumber *)typeByte
                  creatorDid:(NSString *)creatorDid
                  slot:(nonnull NSNumber *)slot
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(anchorAssetName:(NSString *)did
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveTaadPublicKey:(NSString *)masterKekHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveWalletSeed:(NSString *)masterKekHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveCardanoAddress:(NSString *)walletSeedHex
                  network:(nonnull NSNumber *)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(buildCreateChildTaadUtxoTx:(NSString *)childDid
                  ownerDid:(NSString *)ownerDid
                  entityType:(nonnull NSNumber *)entityType
                  hwPubHex:(NSString *)hwPubHex
                  childTaadPubHex:(NSString *)childTaadPubHex
                  ownerMasterKekHex:(NSString *)ownerMasterKekHex
                  walletSeedHex:(NSString *)walletSeedHex
                  network:(nonnull NSNumber *)network
                  taadScriptCborHex:(NSString *)taadScriptCborHex
                  policyIdHex:(NSString *)policyIdHex
                  ownerUtxoJson:(NSString *)ownerUtxoJson
                  utxoInputsJson:(NSString *)utxoInputsJson
                  protocolParamsJson:(NSString *)protocolParamsJson
                  currentSlot:(nonnull NSNumber *)currentSlot
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

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
                  network:(nonnull NSNumber *)network
                  currentSlot:(nonnull NSNumber *)currentSlot
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
