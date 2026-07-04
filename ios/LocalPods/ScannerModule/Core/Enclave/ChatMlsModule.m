// Obj-C bridge cho ChatMlsModule (Swift) — phơi Promise methods cho RN.
// Xem ChatMlsModule.swift cho hành vi. Rust FFI: rust/chat_mls.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ChatMlsModule, NSObject)

RCT_EXTERN_METHOD(newIdentity:(NSString *)stakeAddress
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(importState:(NSString *)stateB64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hasIdentity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(freeIdentity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(exportState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateKeyPackage:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createGroup:(NSString *)conversationId
                  memberKeyPackagesJson:(NSString *)memberKeyPackagesJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(joinFromWelcome:(NSString *)welcomeB64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(processCommit:(NSString *)conversationId
                  commitB64:(NSString *)commitB64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(encrypt:(NSString *)conversationId
                  plaintext:(NSString *)plaintext
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(decrypt:(NSString *)conversationId
                  bodyB64:(NSString *)bodyB64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createMerkleLeaf:(NSString *)conversationId
                  senderId:(NSString *)senderId
                  timestampMs:(NSString *)timestampMs
                  plaintext:(NSString *)plaintext
                  saltHex:(NSString *)saltHex
                  sessionSeedHex:(NSString *)sessionSeedHex
                  delegationCert:(NSString *)delegationCert
                  walletCoseKey:(NSString *)walletCoseKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(verifyMerkleLeaf:(NSString *)leafJson
                  conversationId:(NSString *)conversationId
                  senderId:(NSString *)senderId
                  timestampMs:(NSString *)timestampMs
                  plaintext:(NSString *)plaintext
                  saltHex:(NSString *)saltHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(newSessionEd25519:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
