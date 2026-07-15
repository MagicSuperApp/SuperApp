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

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
