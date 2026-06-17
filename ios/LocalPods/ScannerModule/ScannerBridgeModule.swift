import Foundation
import React

/// RCTEventEmitter for scanner events — matches ScannerModule's event names
/// so ScannerSDK.ts can listen to them seamlessly.
@objc(ScannerBridgeModule)
class ScannerBridgeModule: RCTEventEmitter {

    // MARK: - Singleton

    static var shared: ScannerBridgeModule?

    override init() {
        super.init()
        ScannerBridgeModule.shared = self
    }

    // MARK: - RCTEventEmitter

    override static func moduleName() -> String! {
        return "ScannerBridgeModule"
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "onDetectionResult",
            "onBlurDetected",
            "onDetectionError",
            "onProcessingError",
            "onScannerStopped",
            "onCaptureComplete",
            "onUploadProgress",
            "onUploadComplete"
        ]
    }

    override func startObserving() {
        print("[ScannerBridgeModule] ✅ Started observing")
    }

    override func stopObserving() {
        print("[ScannerBridgeModule] 🛑 Stopped observing")
    }

    // MARK: - Public Emit API (called from ScannerModule)

    func emitDetectionResult(detections: [[String: Any]], imageWidth: Int, imageHeight: Int) {
        sendEvent(withName: "onDetectionResult", body: [
            "detections": detections,
            "imageWidth": imageWidth,
            "imageHeight": imageHeight
        ])
    }

    func emitBlurDetected(message: String) {
        sendEvent(withName: "onBlurDetected", body: ["message": message])
    }

    func emitDetectionError(error: String) {
        sendEvent(withName: "onDetectionError", body: ["error": error])
    }

    func emitProcessingError(error: String) {
        sendEvent(withName: "onProcessingError", body: ["error": error])
    }

    func emitScannerStopped() {
        sendEvent(withName: "onScannerStopped", body: [:])
    }

    func emitCaptureComplete(treeId: String, capturedCount: Int) {
        sendEvent(withName: "onCaptureComplete", body: [
            "treeId": treeId,
            "capturedCount": capturedCount
        ])
    }

    func emitUploadProgress(progress: Float) {
        sendEvent(withName: "onUploadProgress", body: ["progress": progress])
    }

    func emitUploadComplete(success: Bool, count: Int) {
        sendEvent(withName: "onUploadComplete", body: [
            "success": success,
            "count": count
        ])
    }
}
