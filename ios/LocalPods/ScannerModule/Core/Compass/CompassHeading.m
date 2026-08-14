// Cầu Obj-C cho CompassHeadingModule.swift — đưa lớp Swift vào sổ đăng ký module
// của React Native. Tên method phải khớp đúng phần `@objc(...)` bên Swift.
//
// Hợp đồng giữ NGUYÊN như bản Android (android/.../compass/CompassHeadingModule.kt):
// phía JS chỉ có một nhánh cho cả hai hệ.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(CompassHeading, RCTEventEmitter)

RCT_EXTERN_METHOD(start:(nonnull NSNumber *)minDeltaDeg)

RCT_EXTERN_METHOD(stop)

RCT_EXTERN_METHOD(hasCompass:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
