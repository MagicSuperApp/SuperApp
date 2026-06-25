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

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
