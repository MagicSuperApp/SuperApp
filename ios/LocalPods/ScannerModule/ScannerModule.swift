import Foundation
import UIKit
import React

extension Notification.Name {
    /// Posted from `ScannerViewController` when the modal is dismissed (X or swipe). Keeps `scannerVC` in sync.
    static let scannerViewControllerDismissed = Notification.Name("com.orilife.scanner.vc.dismissed")
}

/// ScannerModule — RCTBridgeModule entry point for React Native.
/// Matches Android ScannerModule.kt interface exactly.
/// JS calls: NativeModules.ScannerModule.initialize() / startScanning() / stopScanning() / release()
@objc(ScannerModule)
class ScannerModule: NSObject {

    // MARK: - Static

    @objc static func moduleName() -> String! {
        return "ScannerModule"
    }

    @objc static func requiresMainQueueSetup() -> Bool {
        return true
    }

    // MARK: - Properties

    private var scannerVC: ScannerViewController?
    private var isInitialized = false
    private var didRegisterDismissObserver = false

    private func ensureScannerDismissObserver() {
        guard !didRegisterDismissObserver else { return }
        didRegisterDismissObserver = true
        NotificationCenter.default.addObserver(
            forName: .scannerViewControllerDismissed,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self = self else { return }
            guard let dismissed = note.object as? ScannerViewController else { return }
            if self.scannerVC === dismissed {
                self.scannerVC = nil
                print("[ScannerModule] scannerVC cleared (modal dismissed)")
            }
        }
    }

    // MARK: - JS-callable Methods

    @objc(initialize:rejecter:)
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if isInitialized {
            resolve("Scanner already initialized")
            return
        }

        // Initialize database
        do {
            try LocalDatabaseManager.shared.initialize()
            isInitialized = true
            print("[ScannerModule] ✅ Initialized")
            resolve("Scanner initialized")
        } catch {
            print("[ScannerModule] ❌ Init failed: \(error)")
            reject("INIT_ERROR", error.localizedDescription, error)
        }
    }

    @objc(startScanning:resolve:rejecter:)
    func startScanning(_ options: [String: Any]?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let farmId = options?["farm_id"] as? String ?? "unknown-farm"
        let modeString = options?["scanMode"] as? String ?? "tree"
        let scanMode: DetectionCoordinator.ScanMode = (modeString == "fruit") ? .fruit : .tree

        ScannerRemoteLog.breadcrumb(phase: "startScanning_enter", detail: [
            "isInitialized": isInitialized,
            "farmId": farmId,
            "mode": modeString
        ])

        guard isInitialized else {
            ScannerRemoteLog.breadcrumb(phase: "startScanning_reject_not_init", detail: [:])
            reject("NOT_INITIALIZED", "Call initialize() first", nil)
            return
        }

        // Check camera permission before attempting to present the scanner.
        // Doing the check here (before any VC is created) avoids presenting a VC
        // that immediately needs to be dismissed because permission was denied.
        CameraSessionManager.requestAccess { [weak self] granted in
            guard let self = self else {
                ScannerRemoteLog.breadcrumb(phase: "startScanning_reject_module_released", detail: [:])
                reject("MODULE_RELEASED", "ScannerModule was released", nil)
                return
            }

            ScannerRemoteLog.breadcrumb(phase: "camera_permission_result", detail: ["granted": granted])

            guard granted else {
                reject("CAMERA_PERMISSION_DENIED", "Camera permission is required to scan trees. Please enable it in Settings.", nil)
                return
            }

            DispatchQueue.main.async {
                self.ensureScannerDismissObserver()

                if self.scannerVC != nil {
                    ScannerRemoteLog.breadcrumb(phase: "startScanning_reject_already_open", detail: [:])
                    reject("SCANNER_ALREADY_OPEN", "Scanner is already open. Close it first.", nil)
                    return
                }

                ScannerRemoteLog.breadcrumb(phase: "main_queue_present_begin", detail: [:])

                // Get the root view controller
                guard let rootVC = self.getRootViewController() else {
                    ScannerRemoteLog.breadcrumb(phase: "startScanning_reject_no_root_vc", detail: [:])
                    reject("NO_VIEW_CONTROLLER", "Cannot find root view controller", nil)
                    return
                }

                ScannerRemoteLog.breadcrumb(phase: "root_vc_found", detail: [
                    "vcType": String(describing: type(of: rootVC))
                ])

                // Create scanner view controller
                let vc = ScannerViewController()
                vc.farmId = farmId
                vc.scanMode = scanMode
                vc.modalPresentationStyle = .fullScreen
                vc.modalTransitionStyle = .crossDissolve

                // Wire up event emission via shared bridge module
                vc.onEventEmit = { eventName, body in
                    // RCTEventEmitter expects the main queue; frame pipeline can call back off-main.
                    if Thread.isMainThread {
                        ScannerBridgeModule.shared?.sendEvent(withName: eventName, body: body)
                    } else {
                        DispatchQueue.main.async {
                            ScannerBridgeModule.shared?.sendEvent(withName: eventName, body: body)
                        }
                    }
                }

                self.scannerVC = vc

                ScannerRemoteLog.breadcrumb(phase: "before_present_scanner_vc", detail: [:])

                // Present modally — camera permission already granted, no dialog needed inside VC
                rootVC.present(vc, animated: true) {
                    ScannerRemoteLog.breadcrumb(phase: "present_scanner_completion", detail: [:])
                    print("[ScannerModule] ✅ Scanner presented")
                    resolve("Scanner launched")
                }
            }
        }
    }

    @objc(stopScanning:rejecter:)
    func stopScanning(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if let vc = self.scannerVC {
                vc.dismiss(animated: true) {
                    self.scannerVC = nil
                    ScannerBridgeModule.shared?.emitScannerStopped()
                    print("[ScannerModule] 🛑 Scanner dismissed")
                    resolve("Scanning stopped")
                }
            } else {
                resolve("Scanning already stopped")
            }
        }
    }

    @objc(release:rejecter:)
    func release(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.scannerVC?.dismiss(animated: false)
            self?.scannerVC = nil
            self?.isInitialized = false
            print("[ScannerModule] 🧹 Scanner released")
            resolve("Scanner released")
        }
    }

    /// Sync log server URL from JS (`REMOTE_LOG_SERVER_URL`) so native HTTP breadcrumbs match remoteLogger.
    @objc(setLogEndpoint:)
    func setLogEndpoint(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let u = URL(string: trimmed), u.scheme == "https" || u.scheme == "http" else {
            print("[ScannerModule] ⚠️ setLogEndpoint ignored (invalid URL)")
            return
        }
        ScannerRemoteLog.endpoint = trimmed
        print("[ScannerModule] 🌐 Remote log endpoint set")
    }

    // MARK: - Private

    private func getRootViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }

        // After system permission sheets / brief transitions, the key scene may be `.foregroundInactive`
        // only — treating it as active avoids `nil` window and a failed `present`.
        let foregroundScenes = scenes.filter {
            $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive
        }
        let searchScenes = foregroundScenes.isEmpty ? scenes : foregroundScenes

        func pickWindow(from sceneList: [UIWindowScene]) -> UIWindow? {
            for scene in sceneList {
                if let w = scene.windows.first(where: { $0.isKeyWindow }) { return w }
                if let w = scene.windows.first(where: { $0.isHidden == false }) { return w }
            }
            return sceneList.flatMap(\.windows).first(where: { $0.isKeyWindow })
                ?? sceneList.flatMap(\.windows).first
        }

        var window = pickWindow(from: searchScenes)
        if window == nil {
            window = pickWindow(from: scenes)
        }
        // Legacy fallback (some RN setups during transitions)
        if window == nil {
            window = UIApplication.shared.windows.first(where: { $0.isKeyWindow })
                ?? UIApplication.shared.windows.first
        }

        guard let window = window else { return nil }

        var top = window.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
