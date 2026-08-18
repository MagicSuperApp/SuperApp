import Foundation
import React
import UIKit
import AVFoundation
import CoreLocation

/// TreeReID Bridge Module - React Native bridge for tree identification.
///
/// Provides:
/// - Heading-based capture trigger (|Δheading| ≥ 25° OR |Δpitch| ≥ 18°)
/// - 2-round capture flow (thân cây → cận gốc/vỏ)
/// - Image compression (≤1280px, JPEG 0.85)
/// - API integration for identify/enroll/verify_add
///
/// Extends RCTEventEmitter to emit events directly to JS.
@objc(TreeReIDBridge)
final class TreeReIDBridgeModule: RCTEventEmitter {

    // MARK: - Types

    struct CaptureSession {
        let sessionId: String
        let startedAt: Date
        var currentRound: CaptureRound
        var captures: [CapturedImage]
        var lastHeading: Double?
        var lastPitch: Double?
        var lastLocation: CLLocation?
    }

    struct CapturedImage {
        let id: String
        let fileURL: URL
        let heading: Double
        let pitch: Double
        let roll: Double
        let round: CaptureRound
        let capturedAt: Date
        let width: Int
        let height: Int
        /// Box YOLO của khung ngay TRƯỚC lúc bấm. Toạ độ CHUẨN HOÁ 0–1 theo frame
        /// PREVIEW, không phải theo ảnh đã lưu — hai cái có thể khác tỉ lệ. Kèm
        /// `frameAspect` (w/h của frame preview) để phía JS quy về hệ của ảnh.
        /// Rỗng = khung đó YOLO không thấy cây nào ⟹ ảnh này embed cả khung.
        let boxes: [TreeReIDYolo.Box]
        let frameAspect: Float
    }

    // MARK: - Properties

    private var session: CaptureSession?
    private let headingManager = HeadingCaptureManager()
    private let imageProcessor = ImageProcessor()
    private let locationHelper = LocationHelper()
    private let cameraManager = CameraSessionManager()
    private let yolo = TreeReIDYolo()   // Gate chất-lượng (Plan A) — lọc frame có cây.

    private var headingCallbacksSetup = false
    private var cameraCallbacksSetup = false

    static var sharedInstance: TreeReIDBridgeModule?

    /// Expose camera session for preview layer connection.
    @objc static var captureSession: AVCaptureSession {
        return sharedInstance?.cameraManager.session ?? AVCaptureSession()
    }

    /// Box YOLO gần nhất + tỉ-lệ frame (w/h) — cho overlay vẽ khung trên preview.
    func currentYoloBoxes() -> ([TreeReIDYolo.Box], Float) {
        return yolo.currentBoxes()
    }

    /// Box → payload cầu RN. Ép `Double` vì `Float` qua NSNumber hay lệch chữ số cuối.
    private static func boxesPayload(_ boxes: [TreeReIDYolo.Box]) -> [[String: Any]] {
        return boxes.map { b in
            [
                "x": Double(b.x), "y": Double(b.y),
                "w": Double(b.w), "h": Double(b.h),
                "conf": Double(b.conf)
            ]
        }
    }

    override static func moduleName() -> String! {
        return "TreeReIDBridge"
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            TreeReIDConfig.eventHeadingUpdate,
            TreeReIDConfig.eventCaptureTriggered,
            TreeReIDConfig.eventRoundComplete,
            TreeReIDConfig.eventSessionComplete,
            TreeReIDConfig.eventError
        ]
    }

    override init() {
        super.init()
        TreeReIDBridgeModule.sharedInstance = self
        ScannerRemoteLog.breadcrumb(phase: "treereid_module_init", detail: [
            "headingCallbacksSetup": headingCallbacksSetup,
            "cameraCallbacksSetup": cameraCallbacksSetup
        ])
        setupHeadingCallbacks()
        setupCameraCallbacks()
        ScannerRemoteLog.breadcrumb(phase: "treereid_module_init_callbacks_done", detail: [:])
    }

    // MARK: - Setup

    private func setupHeadingCallbacks() {
        headingManager.onSensorUpdate = { [weak self] update in
            DispatchQueue.main.async {
                self?.handleSensorUpdate(update)
            }
        }

        headingManager.onCaptureTriggered = { [weak self] heading, pitch in
            DispatchQueue.main.async {
                self?.handleCaptureTriggered(heading: heading, pitch: pitch)
            }
        }
    }

    // MARK: - Sensor Handling

    private func handleSensorUpdate(_ update: HeadingCaptureManager.SensorUpdate) {
        // Update session state
        session?.lastHeading = update.heading
        session?.lastPitch = update.pitch

        // Emit event to JS
        // NOTE: This is called from a DispatchQueue.main.async closure in setupHeadingCallbacks,
        // so we're already on the main thread. No additional dispatch needed.
        let body: [String: Any] = [
            "heading": update.heading,
            "pitch": update.pitch,
            "roll": update.roll,
            "deltaHeading": update.deltaHeading as Any,
            "deltaPitch": update.deltaPitch as Any,
            "shouldCapture": update.shouldCapture,
            "timestamp": update.timestamp
        ]
        sendEvent(withName: TreeReIDConfig.eventHeadingUpdate, body: body)
    }

    private func handleCaptureTriggered(heading: Double, pitch: Double) {
        guard session != nil else { return }

        // Gate YOLO (Plan A): chỉ chụp khi frame gần nhất CÓ cây. An toàn — không chặn
        // oan khi detector chưa nạp model / kết quả cũ (rơi về gate stillness như cũ).
        guard yolo.gatePass() else {
            print("[TreeReIDBridge] ⛔ YOLO gate: chưa thấy cây — bỏ nhịp chụp này")
            return
        }

        // Trigger camera capture (already async on sessionQueue via CameraSessionManager)
        capturePhoto(heading: heading, pitch: pitch)
    }

    // MARK: - Camera Capture

    private func capturePhoto(heading: Double, pitch: Double) {
        ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo", detail: [
            "heading": heading,
            "pitch": pitch,
            "round": session?.currentRound.rawValue ?? 0,
            "totalCaptures": session?.captures.count ?? 0
        ])

        // Use CameraSessionManager to capture high-res photo
        // This dispatches to sessionQueue asynchronously
        cameraManager.capturePhoto()
        ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_dispatched", detail: [:])

        let captureId = UUID().uuidString
        print("[TreeReIDBridge] 📸 Photo capture triggered: \(captureId)")

        // Emit capture event (will be updated when photo is actually captured)
        let body: [String: Any] = [
            "captureId": captureId,
            "heading": heading,
            "pitch": pitch,
            "round": session?.currentRound.rawValue ?? 1,
            "totalCaptures": session?.captures.count ?? 0
        ]

        DispatchQueue.main.async { [weak self] in
            self?.sendEvent(withName: TreeReIDConfig.eventCaptureTriggered, body: body)
        }
    }

    // MARK: - Setup Camera Callbacks

    private func setupCameraCallbacks() {
        cameraManager.onPhotoCaptured = { [weak self] data, size in
            DispatchQueue.main.async {
                self?.handlePhotoCaptured(data: data, size: size)
            }
        }

        // Frame preview → YOLO gate (Plan A). Chạy trên videoOutputQueue (nền), có
        // throttle bên trong; cập nhật confidence để handleCaptureTriggered đọc.
        cameraManager.onFrameCaptured = { [weak self] pixelBuffer, _ in
            self?.yolo.processFrame(pixelBuffer)
        }

        cameraManager.onError = { error in
            print("[TreeReIDBridge] ❌ Camera error: \(error)")
        }
    }

    private func handlePhotoCaptured(data: Data, size: CGSize) {
        ScannerRemoteLog.breadcrumb(phase: "treereid_photo_received", detail: [
            "dataSize": data.count,
            "width": size.width,
            "height": size.height
        ])

        guard var currentSession = session else {
            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_no_session", detail: [:])
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "treereid_photo_compressing", detail: [
            "dataSize": data.count
        ])

        // Compress image (can be done on background)
        let result = imageProcessor.compressImage(data)

        switch result {
        case .success(let processed):
            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_compressed", detail: [
                "processedSize": processed.data.count,
                "width": processed.width,
                "height": processed.height
            ])

            guard let fileURL = imageProcessor.compressAndSave(data, filename: UUID().uuidString) else {
                print("[TreeReIDBridge] ❌ Failed to save image")
                ScannerRemoteLog.breadcrumb(phase: "treereid_photo_save_failed", detail: [
                    "dataSize": data.count
                ])
                return
            }

            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_saved", detail: [
                "fileURL": fileURL.lastPathComponent
            ])

            // Box của khung vừa chạy qua gate — máy ĐÃ biết cây nằm đâu và đã vẽ
            // khung đó lên preview. Trước đây chỗ này vứt đi, nên nông dân phải tự
            // khoanh lại thứ máy vốn có sẵn.
            let (yBoxes, yAspect) = yolo.currentBoxes()

            let capture = CapturedImage(
                id: UUID().uuidString,
                fileURL: fileURL,
                heading: currentSession.lastHeading ?? 0,
                pitch: currentSession.lastPitch ?? 0,
                roll: 0,
                round: currentSession.currentRound,
                capturedAt: Date(),
                width: processed.width,
                height: processed.height,
                boxes: yBoxes,
                frameAspect: yAspect
            )

            currentSession.captures.append(capture)
            self.session = currentSession

            print("[TreeReIDBridge] ✅ Saved capture #\(currentSession.captures.count): \(fileURL.lastPathComponent)")

            // Emit capture complete event on MAIN THREAD (RCTEventEmitter requirement)
            DispatchQueue.main.async { [weak self] in
                self?.sendEvent(withName: TreeReIDConfig.eventCaptureTriggered, body: [
                    "captureId": capture.id,
                    "fileURL": fileURL.path,
                    "heading": capture.heading,
                    "pitch": capture.pitch,
                    "round": capture.round.rawValue,
                    "totalCaptures": currentSession.captures.count,
                    "width": capture.width,
                    "height": capture.height,
                    "boxes": TreeReIDBridgeModule.boxesPayload(capture.boxes),
                    "frameAspect": Double(capture.frameAspect)
                ])
            }

        case .failure(let error):
            print("[TreeReIDBridge] ❌ Failed to compress image: \(error)")
            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_compress_failed", detail: [
                "error": error.localizedDescription
            ])
        }
    }

    // MARK: - GPS

    private func getCurrentGPS() -> (lat: Double, lng: Double, accuracy: Double)? {
        guard let loc = locationHelper.latestLocation else { return nil }
        let acc = loc.horizontalAccuracy
        guard acc >= 0 else { return nil }
        return (lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                accuracy: acc)
    }

    // MARK: - RN Methods

    @objc(startCaptureSession:resolver:rejecter:)
    func startCaptureSession(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        ScannerRemoteLog.breadcrumb(phase: "treereid_start_capture_enter", detail: [
            "cameraStatus": "\(AVCaptureDevice.authorizationStatus(for: .video))"
        ])

        // Check camera permission
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)

        if cameraStatus == .denied || cameraStatus == .restricted {
            ScannerRemoteLog.error(phase: "treereid_camera_denied", message: "Camera permission denied")
            reject("E_PERMISSION", "Cần quyền truy cập camera để chụp ảnh cây", nil)
            return
        }

        if cameraStatus == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                ScannerRemoteLog.breadcrumb(phase: "treereid_camera_permission_result", detail: [
                    "granted": granted
                ])
                if granted {
                    self?.continueStartSession(options: options, resolve: resolve, reject: reject)
                } else {
                    reject("E_PERMISSION", "Cần quyền truy cập camera để chụp ảnh cây", nil)
                }
            }
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "treereid_camera_already_authorized", detail: [:])
        continueStartSession(options: options, resolve: resolve, reject: reject)
    }

    private func continueStartSession(
        options: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        ScannerRemoteLog.breadcrumb(phase: "treereid_continue_start_enter", detail: [
            "sessionExists": session != nil,
            "headingCallbacksSetup": headingCallbacksSetup,
            "cameraCallbacksSetup": cameraCallbacksSetup
        ])

        // Check if session already running
        if session != nil {
            ScannerRemoteLog.error(phase: "treereid_start_busy", message: "Session already running")
            reject("E_BUSY", "Đã có phiên chụp đang chạy. Hãy huỷ trước khi bắt đầu mới.", nil)
            return
        }

        do {
            // Setup callbacks BEFORE starting any sensor/camera managers.
            if !headingCallbacksSetup {
                ScannerRemoteLog.breadcrumb(phase: "treereid_setup_heading_callbacks", detail: [:])
                setupHeadingCallbacks()
                headingCallbacksSetup = true
            }
            if !cameraCallbacksSetup {
                ScannerRemoteLog.breadcrumb(phase: "treereid_setup_camera_callbacks", detail: [:])
                setupCameraCallbacks()
                cameraCallbacksSetup = true
            }
            ScannerRemoteLog.breadcrumb(phase: "treereid_callbacks_ready", detail: [:])

            // Start GPS (triggers location permission dialog on first call)
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_start", detail: [
                "isLocationRunning": locationHelper.isLocationRunning
            ])
            if !locationHelper.isLocationRunning {
                locationHelper.requestPermission()
                locationHelper.start()
            }
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_started", detail: [:])

            // Create new session FIRST — before starting managers that may emit callbacks
            let sessionId = UUID().uuidString
            self.session = CaptureSession(
                sessionId: sessionId,
                startedAt: Date(),
                currentRound: .round1Body,
                captures: [],
                lastHeading: nil,
                lastPitch: nil,
                lastLocation: locationHelper.latestLocation
            )
            ScannerRemoteLog.breadcrumb(phase: "treereid_session_created", detail: [
                "sessionId": sessionId,
                "hasLocation": locationHelper.latestLocation != nil
            ])

            // Start heading manager — first sensor callback fires immediately on main thread,
            // session must exist so handleSensorUpdate can update lastHeading/lastPitch
            ScannerRemoteLog.breadcrumb(phase: "treereid_heading_start", detail: [
                "isRunning": headingManager.isRunning
            ])
            headingManager.reset()
            headingManager.start()
            ScannerRemoteLog.breadcrumb(phase: "treereid_heading_started", detail: [:])

            // Nạp model YOLO (Plan A) cho gate chất-lượng. Thiếu model → tự tắt gate.
            yolo.reset()
            yolo.loadModel()

            // Start camera
            ScannerRemoteLog.breadcrumb(phase: "treereid_camera_start", detail: [:])
            cameraManager.start()
            ScannerRemoteLog.breadcrumb(phase: "treereid_camera_started", detail: [:])

            ScannerRemoteLog.breadcrumb(phase: "treereid_session_fully_started", detail: [
                "sessionId": sessionId,
                "round": CaptureRound.round1Body.rawValue
            ])

            resolve([
                "sessionId": sessionId,
                "round": CaptureRound.round1Body.rawValue,
                "roundName": CaptureRound.round1Body.displayName,
                "guidance": CaptureRound.round1Body.guidance
            ])
        } catch {
            print("[TreeReIDBridge] ❌ Failed to start session: \(error)")
            reject("E_FAILED", "Không thể bắt đầu phiên chụp: \(error.localizedDescription)", nil)
        }
    }

    @objc(stopCaptureSession:resolver:rejecter:)
    func stopCaptureSession(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let currentSession = session else {
            resolve(NSNull())
            return
        }

        // Stop sensors and camera
        headingManager.stop()
        cameraManager.stop()

        // Build result
        let captures = currentSession.captures.map { capture -> [String: Any] in
            return [
                "id": capture.id,
                "fileURL": capture.fileURL.path,
                "heading": capture.heading,
                "pitch": capture.pitch,
                "roll": capture.roll,
                "round": capture.round.rawValue,
                "capturedAt": capture.capturedAt.timeIntervalSince1970,
                "width": capture.width,
                "height": capture.height,
                "boxes": TreeReIDBridgeModule.boxesPayload(capture.boxes),
                "frameAspect": Double(capture.frameAspect)
            ]
        }

        let result: [String: Any] = [
            "sessionId": currentSession.sessionId,
            "totalCaptures": currentSession.captures.count,
            "captures": captures,
            "duration": Date().timeIntervalSince(currentSession.startedAt)
        ]

        // Clear session before emitting event
        self.session = nil

        // Emit session complete event on main thread
        DispatchQueue.main.async { [weak self] in
            self?.sendEvent(withName: TreeReIDConfig.eventSessionComplete, body: result)
        }

        print("[TreeReIDBridge] 🛑 Capture session stopped")

        resolve(result)
    }

    @objc(addCapturedImage:resolver:rejecter:)
    func addCapturedImage(
        _ imageData: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard var currentSession = session else {
            reject("E_NO_SESSION", "Không có phiên chụp đang chạy", nil)
            return
        }

        guard let dataBase64 = imageData["data"] as? String,
              let data = Data(base64Encoded: dataBase64) else {
            reject("E_INVALID_DATA", "Invalid image data", nil)
            return
        }

        let heading = imageData["heading"] as? Double ?? currentSession.lastHeading ?? 0
        let pitch = imageData["pitch"] as? Double ?? currentSession.lastPitch ?? 0
        let roll = imageData["roll"] as? Double ?? 0

        // Compress image
        let result = imageProcessor.compressImage(data)

        switch result {
        case .success(let processed):
            // Save to temp file
            guard let fileURL = imageProcessor.compressAndSave(data, filename: UUID().uuidString) else {
                reject("E_SAVE_FAILED", "Failed to save compressed image", nil)
                return
            }

            let (yBoxes, yAspect) = yolo.currentBoxes()

            let capture = CapturedImage(
                id: UUID().uuidString,
                fileURL: fileURL,
                heading: heading,
                pitch: pitch,
                roll: roll,
                round: currentSession.currentRound,
                capturedAt: Date(),
                width: processed.width,
                height: processed.height,
                boxes: yBoxes,
                frameAspect: yAspect
            )

            currentSession.captures.append(capture)
            self.session = currentSession

            print("[TreeReIDBridge] 📸 Added capture #\(currentSession.captures.count) to session")

            resolve([
                "captureId": capture.id,
                "fileURL": fileURL.path,
                "totalCaptures": currentSession.captures.count,
                "round": currentSession.currentRound.rawValue
            ])

        case .failure(let error):
            reject("E_COMPRESS_FAILED", "Failed to compress image: \(error)", nil)
        }
    }

    @objc(advanceToRound2:rejecter:)
    func advanceToRound2(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard var currentSession = session else {
            reject("E_NO_SESSION", "Không có phiên chụp đang chạy", nil)
            return
        }

        guard currentSession.currentRound == .round1Body else {
            reject("E_INVALID_STATE", "Already in round 2 or complete", nil)
            return
        }

        currentSession.currentRound = .round2Bark
        self.session = currentSession

        // Emit round complete event on main thread
        DispatchQueue.main.async { [weak self] in
            self?.sendEvent(withName: TreeReIDConfig.eventRoundComplete, body: [
                "round": CaptureRound.round1Body.rawValue,
                "captures": currentSession.captures.count,
                "nextRound": CaptureRound.round2Bark.rawValue,
                "nextRoundName": CaptureRound.round2Bark.displayName,
                "nextGuidance": CaptureRound.round2Bark.guidance
            ])
        }

        print("[TreeReIDBridge] 🔄 Advanced to Round 2")

        resolve([
            "round": CaptureRound.round2Bark.rawValue,
            "roundName": CaptureRound.round2Bark.displayName,
            "guidance": CaptureRound.round2Bark.guidance
        ])
    }

    @objc(getSessionState:rejecter:)
    func getSessionState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let currentSession = session else {
            resolve(NSNull())
            return
        }

        let gps = getCurrentGPS()

        resolve([
            "sessionId": currentSession.sessionId,
            "round": currentSession.currentRound.rawValue,
            "roundName": currentSession.currentRound.displayName,
            "totalCaptures": currentSession.captures.count,
            "capturesByRound": [
                currentSession.captures.filter { $0.round == .round1Body }.count,
                currentSession.captures.filter { $0.round == .round2Bark }.count
            ],
            "lastHeading": currentSession.lastHeading as Any,
            "lastPitch": currentSession.lastPitch as Any,
            "gps": gps.map { ["lat": $0.lat, "lng": $0.lng, "accuracy": $0.accuracy] } as Any
        ])
    }

    @objc(getCapturedImages:rejecter:)
    func getCapturedImages(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let currentSession = session else {
            resolve([Any]())
            return
        }

        let captures = currentSession.captures.map { capture -> [String: Any] in
            return [
                "id": capture.id,
                "fileURL": capture.fileURL.path,
                "heading": capture.heading,
                "pitch": capture.pitch,
                "roll": capture.roll,
                "round": capture.round.rawValue,
                "capturedAt": capture.capturedAt.timeIntervalSince1970,
                "width": capture.width,
                "height": capture.height,
                "boxes": TreeReIDBridgeModule.boxesPayload(capture.boxes),
                "frameAspect": Double(capture.frameAspect)
            ]
        }

        resolve(captures)
    }

    @objc(getCurrentHeading:rejecter:)
    func getCurrentHeading(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let values = headingManager.getCurrentValues()
        resolve([
            "heading": values.heading as Any,
            "pitch": values.pitch as Any
        ])
    }

    // MARK: - Cam controls (flash + lens 0.5x)

    @objc(getCameraCapabilities:rejecter:)
    func getCameraCapabilities(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let caps = cameraManager.cameraCapabilities()
        resolve(["hasTorch": caps.hasTorch, "supportsUltraWide": caps.supportsUltraWide])
    }

    @objc(setTorch:resolver:rejecter:)
    func setTorch(
        _ on: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(cameraManager.setTorch(on))
    }

    @objc(setUltraWide:resolver:rejecter:)
    func setUltraWide(
        _ on: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        cameraManager.setUltraWide(on) { applied in resolve(applied) }
    }
}