import Foundation
import React

/// Swift Package that registers ScannerModule and ScannerBridgeModule with React Native.
///
/// iOS modules are auto-discovered by React Native via:
///   - RCT_EXTERN_MODULE macros in ScannerModule.m
///   - No manual registration needed — RCT scans for @objc annotations at runtime
///
/// This file exists as an anchor and for future TurboModule (New Architecture) upgrade path.
@objc(ScannerModulePackage)
final class ScannerModulePackage: NSObject {

    @objc static func moduleName() -> String! {
        return "ScannerModulePackage"
    }

    /// Returns the Swift module classes to register.
    /// Used by RCTBridge during native module discovery.
    @objc func getModules() -> [String: Any] {
        return [
            "ScannerModule": ScannerModule(),
            "ScannerBridgeModule": ScannerBridgeModule.shared ?? ScannerBridgeModule(),
            "VoiceMemoModule": VoiceMemoModule(),
            "PhoenixKeyModule": PhoenixKeyModule(),
            "TreeReIDBridge": TreeReIDBridgeModule(),
            "TreeReIDCameraPreview": TreeReIDCameraPreviewManager()
        ]
    }
}
