// Obj-C bridging header for ScannerModule — required by React Native
// to expose Swift classes as RCTNativeModule.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// ── ScannerModule ────────────────────────────────────────────────────────────

@interface RCT_EXTERN_MODULE(ScannerModule, NSObject)

RCT_EXTERN_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startScanning:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopScanning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(release:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setLogEndpoint:(NSString *)url)

@end

// ── ScannerBridgeModule (Event Emitter) ───────────────────────────────────────

@interface RCT_EXTERN_MODULE(ScannerBridgeModule, RCTEventEmitter)

@end
