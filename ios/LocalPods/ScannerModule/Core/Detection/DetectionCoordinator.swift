import Foundation
import CoreVideo
import CoreMotion
import CoreLocation
import Combine
import UIKit
import ImageIO
import UniformTypeIdentifiers
import MobileCoreServices
import FirebaseAnalytics  // Firebase Analytics SDK

// MARK: - CoordinatorState

/// Overall coordinator state.
enum CoordinatorState: Equatable {
    case idle
    case scanning
    case detecting
    case processing
    case uploading
    case success(String)
    case error(String)
}

// MARK: - DetectionResult

/// Detection result for UI overlay rendering.
struct DetectionResult {
    let detections: [Detection]
    let croppedImage: CGImage?
    let imageWidth: Int
    let imageHeight: Int
    let rotationDegrees: Int

    init(detections: [Detection], croppedImage: CGImage?,
         imageWidth: Int, imageHeight: Int, rotationDegrees: Int = 0) {
        self.detections = detections
        self.croppedImage = croppedImage
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.rotationDegrees = rotationDegrees
    }

    init(from segDetections: [SegmentationDetection], croppedImage: CGImage?,
         imageWidth: Int, imageHeight: Int, rotationDegrees: Int = 0) {
        self.detections = segDetections.map { Detection(from: $0) }
        self.croppedImage = croppedImage
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.rotationDegrees = rotationDegrees
    }
}

// MARK: - CameraConfigData

/// Camera configuration data for frame processing.
struct CameraConfigData {
    let width: Int
    let height: Int
    let rotationDegrees: Int
}

// MARK: - StableDetection

/// A detection that has been confirmed stable over multiple frames.
struct StableDetection: Sendable {
    let id: String
    let detection: SegmentationDetection
    var stableFrames: Int = 0
    var isConfirmed: Bool = false
    var hasVirtualID: Bool = false
    var averageConfidence: Float = 0
    let boxes: [CGRect]
    let confidences: [Float]
    var smoothedBox: CGRect?
}

// MARK: - CaptureResult

/// Result of a capture operation.
enum CaptureResult {
    case success(sectorIndex: Int, imageId: String, treeId: String)
    case failure(sectorIndex: Int, error: String)
}

// MARK: - DetectionCoordinatorListener

/// Listener for DetectionCoordinator events.
protocol DetectionCoordinatorListener: AnyObject {
    func onCircularSessionComplete()
}

// MARK: - DetectionCoordinator

/// Central orchestrator for the detection pipeline.
///
/// Supports two scan modes:
///   - Tree: 15 sectors, yolov26seg.tflite, classes: trunk/branch
///   - Fruit: 8 sectors, durian-model.tflite, class: durian
///
/// Ties together:
///   - CameraSessionManager → real-time frame buffer
///   - YOLOTFLiteRunner → object detection
///   - BlurChecker → image sharpness gate
///   - TreeDetectionStateMachine → detection → capture trigger
///   - CircularCaptureManager → circular capture workflow
///   - ImageCropper / SegmentationHelper → crop + mask
///   - LocalDatabaseManager + UploadQueue → offline-first persistence
///   - LocationHelper → GPS coordinates for metadata
///
/// Mirrors Android DetectionCoordinator.kt exactly.
final class DetectionCoordinator: NSObject {

    // MARK: - Scan Mode

    enum ScanMode {
        case tree    // 15 sectors, tree model, classes: trunk/branch
        case fruit   // 8 sectors, durian model, class: durian

        var sectorCount: Int {
            switch self {
            case .tree: return 15
            case .fruit: return 8
            }
        }

        var modelType: YOLOTFLiteRunner.ModelType {
            switch self {
            case .tree: return .tree
            case .fruit: return .fruit
            }
        }
    }

    // MARK: - Dependencies

    private let yoloRunner: YOLOTFLiteRunner
    private let blurChecker: BlurChecker
    private let letterboxProcessor: LetterboxProcessor
    private let imageCropperType: ImageCropper.Type
    private let scanMode: ScanMode

    // State machines
    private let stateMachine: TreeDetectionStateMachine
    private let detectionTracker: DetectionTracker
    private let circularSM: CircularCaptureManager

    // Persistence
    private let dbManager: LocalDatabaseManager
    private let uploadQueue: EnhancedUploadQueue
    private let networkMonitor: NetworkMonitor
    private let farmId: String

    // Sensors
    private let motionManager: MotionManager
    private let sensorTriggerManager: SensorTriggerManager
    private let locationHelper: LocationHelper

    // Callbacks / Publishers
    weak var listener: DetectionCoordinatorListener?

    // MARK: - Published State

    private let _state = CurrentValueSubject<CoordinatorState, Never>(.idle)
    var statePublisher: AnyPublisher<CoordinatorState, Never> {
        _state.eraseToAnyPublisher()
    }

    private let _detectionResult = CurrentValueSubject<DetectionResult?, Never>(nil)
    var detectionResultPublisher: AnyPublisher<DetectionResult?, Never> {
        _detectionResult.eraseToAnyPublisher()
    }

    private let _circularSessionState = CurrentValueSubject<CircularSessionState, Never>(CircularSessionState())
    var circularSessionStatePublisher: AnyPublisher<CircularSessionState, Never> {
        _circularSessionState.eraseToAnyPublisher()
    }

    private let _stableDetections = CurrentValueSubject<[StableDetection], Never>([])
    var stableDetectionsPublisher: AnyPublisher<[StableDetection], Never> {
        _stableDetections.eraseToAnyPublisher()
    }

    private let _isStableForDetection = CurrentValueSubject<Bool, Never>(false)
    var isStableForDetectionPublisher: AnyPublisher<Bool, Never> {
        _isStableForDetection.eraseToAnyPublisher()
    }

    // Current state value
    var currentState: CoordinatorState { _state.value }
    var currentCircularSessionState: CircularSessionState { _circularSessionState.value }
    var currentStableDetections: [StableDetection] { _stableDetections.value }

    /// Number of sectors captured in current circular session
    var capturedSectorsCount: Int { circularSM.capturedCount }

    /// Tree ID of the current circular session (exposed for RN bridge)
    var currentTreeId: String { currentSessionTreeId }

    var candidateTreeId: String { candidateSessionTreeId }

    /// Latest GPS latitude recorded during this session (exposed for RN bridge)
    var currentTreeLatitude: Double { latestLocation?.coordinate.latitude ?? 0.0 }

    /// Latest GPS longitude recorded during this session (exposed for RN bridge)
    var currentTreeLongitude: Double { latestLocation?.coordinate.longitude ?? 0.0 }

    // MARK: - Internal State

    private var isProcessingPaused = false
    private var isOverlayPaused = false

    // Frame throttling
    private var lastProcessedTimeMs: Int64 = 0
    private var frameCount: Int = 0
    private let frameLock = NSLock()

    // Blur detection state
    private var consecutiveSharpFrames: Int = 0
    private var isWaitingForStableFocus: Bool = false
    private var lastAutoFocusTriggerMs: Int64 = 0

    // Overlay cache for circular capture
    private var overlayDetectionsCache: [Detection] = []
    private var overlayImageWidth: Int = 0
    private var overlayImageHeight: Int = 0
    private var overlayRotationDegrees: Int = 0
    private var overlayCacheTimestamp: Int64 = 0
    private let overlayCacheMaxAgeMs: Int64 = 500
    private var consecutiveCacheMissFrames: Int = 0
    private let overlayCacheMissFramesThreshold: Int = 8

    // Session tracking
    private var currentSessionId: String = ""
    private var currentSessionStartTimeMs: Int64 = 0
    private var currentSessionTreeId: String = ""
    private var candidateSessionTreeId: String = ""

    // Circular capture state
    private var isCircularCaptureActive: Bool = false
    private var isFirstCircularCapturePending: Bool = false
    private var isHandlingCapture: Bool = false
    private var isSessionPendingUpload: Bool = false
    private var pendingCircularCaptureSector: Int?
    private var lastSegDetForCapture: SegmentationDetection?

    // Latest crop results
    private var lastCropResults: [CropResult] = []

    // Location
    private var latestLocation: CLLocation?

    /// In-memory + UserDefaults-persisted cache: `tree_id` → (lat, lng).
    /// Trước khi gen tree_id mới, query: có cây nào trong bán kính 5m không?
    /// Có → reuse tree_id cũ (loại bỏ grid hash boundary issue khi GPS jitter).
    ///
    /// Persistence: lưu UserDefaults sau mỗi update để survive app kill/restart.
    /// Production sẽ migrate sang LocalDatabaseManager (thêm columns lat/lng vào saved_trees).
    private static let kTreeLocationsKey = "scanner.sessionTreeLocations.v1"

    private lazy var sessionTreeLocations: [String: (lat: Double, lng: Double)] = {
        guard let raw = UserDefaults.standard.dictionary(forKey: Self.kTreeLocationsKey) else { return [:] }
        var out: [String: (lat: Double, lng: Double)] = [:]
        for (key, value) in raw {
            if let arr = value as? [Double], arr.count == 2 {
                out[key] = (arr[0], arr[1])
            }
        }
        ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_locations_loaded", detail: [
            "count": out.count,
        ])
        return out
    }()

    /// Persist sang UserDefaults. Gọi sau mỗi lần thêm entry mới.
    private func persistTreeLocations() {
        let serializable = sessionTreeLocations.mapValues { [$0.lat, $0.lng] }
        UserDefaults.standard.set(serializable, forKey: Self.kTreeLocationsKey)
    }

    /// Tìm tree_id đã có trong bán kính `radiusMeters` (Haversine).
    /// Dùng để dedup khi GPS jitter qua grid boundary hoặc giữa các session.
    ///
    /// Default 8m (was 5m): field test 25/5 cho thấy GPS dưới tán sầu riêng
    /// jitter 5-15m, không phải 3-5m. Sầu riêng trồng cách nhau ≥6m nên 8m
    /// vẫn an toàn (rất hiếm 2 cây thật cùng cell).
    private func findNearbyTreeId(latitude: Double, longitude: Double, radiusMeters: Double = 8.0) -> String? {
        for (treeId, loc) in sessionTreeLocations {
            let d = haversineMeters(lat1: loc.lat, lng1: loc.lng, lat2: latitude, lng2: longitude)
            if d <= radiusMeters {
                ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_proximity_reuse", detail: [
                    "treeId": String(treeId.prefix(12)),
                    "distance_m": String(format: "%.1f", d),
                ])
                return treeId
            }
        }
        return nil
    }

    private func haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double) -> Double {
        let R = 6_371_000.0
        let toRad = { (d: Double) -> Double in d * .pi / 180.0 }
        let dLat = toRad(lat2 - lat1)
        let dLng = toRad(lng2 - lng1)
        let a = sin(dLat / 2) * sin(dLat / 2)
              + cos(toRad(lat1)) * cos(toRad(lat2)) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * R * asin(sqrt(a))
    }

    // Processing queue
    private let processingQueue = DispatchQueue(label: "com.aladin.detection.coordinator", qos: .userInteractive)
    private var sensorFeedTimer: Timer?
    private let captureTimeoutMs: Int64 = 10_000

    // Letterbox info cache
    private var lastLetterboxInfo: LetterboxInfo?

    /// One-shot remote breadcrumbs (crash triage: last phase before exit).
    private var loggedFirstLetterboxOk = false

    // MARK: - Init

    init(scanMode: ScanMode = .tree,
         yoloRunner: YOLOTFLiteRunner,
         blurChecker: BlurChecker,
         letterboxProcessor: LetterboxProcessor,
         dbManager: LocalDatabaseManager,
         uploadQueue: EnhancedUploadQueue,
         networkMonitor: NetworkMonitor,
         motionManager: MotionManager,
         farmId: String) {

        self.scanMode = scanMode
        self.yoloRunner = yoloRunner
        self.blurChecker = blurChecker
        self.letterboxProcessor = letterboxProcessor
        self.imageCropperType = ImageCropper.self
        self.dbManager = dbManager
        self.uploadQueue = uploadQueue
        self.networkMonitor = networkMonitor
        self.motionManager = motionManager
        self.farmId = farmId

        // Configure sectors based on scan mode
        Sector.configure(sectors: scanMode.sectorCount)

        self.stateMachine = TreeDetectionStateMachine()
        self.detectionTracker = DetectionTracker()
        self.circularSM = CircularCaptureManager()
        self.sensorTriggerManager = SensorTriggerManager()
        self.locationHelper = LocationHelper()

        super.init()

        ScannerRemoteLog.breadcrumb(phase: "coordinator_init", detail: [
            "scanMode": scanMode == .tree ? "tree" : "fruit",
            "sectors": scanMode.sectorCount
        ])

        setupStateMachine()
        setupCircularCapture()
        setupSensorTriggerManager()
        setupLocationHelper()
        setupUploadQueue()
    }

    // MARK: - Setup

    private func setupStateMachine() {
        stateMachine.onAction = { [weak self] action in
            self?.handleStateMachineAction(action)
        }
    }

    private func setupCircularCapture() {
        circularSM.onCaptureTriggered = { [weak self] sectorIndex in
            self?.pendingCircularCaptureSector = sectorIndex
            print("[DetectionCoordinator] 🎯 CIRCULAR CAPTURE TRIGGERED for sector \(sectorIndex)")
        }

        circularSM.onSessionComplete = { [weak self] capturedCount in
            guard let self = self else { return }
            self.isSessionPendingUpload = true
            print("[DetectionCoordinator] 🏁 [FLOW-C] onSessionComplete FIRED! captured=\(capturedCount)")
            DispatchQueue.main.async {
                self._state.send(.success("Đã chụp đủ \(capturedCount) góc!"))
                self.listener?.onCircularSessionComplete()
            }
        }
    }

    private func setupSensorTriggerManager() {
        sensorTriggerManager.setListener(self)
        sensorTriggerManager.start()
    }

    private func setupLocationHelper() {
        locationHelper.listener = self
    }

    private func setupUploadQueue() {
        uploadQueue.setSyncCallback(self)
    }

    // MARK: - Public API: Frame Processing

    /// Process a camera frame. Call this for every video output frame.
    /// This is the main entry point for the detection pipeline.
    func processFrame(_ pixelBuffer: CVPixelBuffer, cameraConfig: CameraConfigData?) {
        guard !isProcessingPaused else { return }

        processingQueue.async { [weak self] in
            self?.processFrameInternal(pixelBuffer, cameraConfig: cameraConfig)
        }
    }

    // MARK: - Frame Processing Internal

    private func processFrameInternal(_ pixelBuffer: CVPixelBuffer, cameraConfig: CameraConfigData?) {
        frameLock.lock()

        // Frame rate throttle — adaptive based on thermal state.
        // Field test 25/5 báo "nóng máy nhanh hơn lần trước" — root cause là
        // YOLO + ARKit + camera 30fps + GPS + sensor + upload chạy đồng thời
        // không có thermal throttle. Adaptive throttle ở đây giảm YOLO rate
        // khi device chạm .serious/.critical, giữ pipeline vẫn responsive
        // nhưng giảm tải đáng kể.
        let baseInterval = ScannerConfig.minFrameIntervalMS
        let thermalState = ProcessInfo.processInfo.thermalState
        let throttleInterval: Int64
        switch thermalState {
        case .nominal, .fair:
            throttleInterval = baseInterval
        case .serious:
            throttleInterval = baseInterval * 2  // ~5fps thay vì 10fps
        case .critical:
            throttleInterval = baseInterval * 4  // ~2.5fps
        @unknown default:
            throttleInterval = baseInterval
        }

        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if now - lastProcessedTimeMs < throttleInterval {
            frameLock.unlock()
            return
        }

        // Frame skip
        frameCount += 1
        if ScannerConfig.enableFrameSkip && frameCount % (ScannerConfig.skipFrames + 1) != 0 {
            frameLock.unlock()
            return
        }

        frameLock.unlock()

        // Do not call `_state.send(.scanning)` on every processed frame — it flooded Combine
        // + main-thread UI (`handleCoordinatorState`) and RN events (~10–20/s), and it reset
        // `.error` (blur hint) every frame so state flipped scanning↔error continuously.
        if case .idle = _state.value {
            DispatchQueue.main.async { [weak self] in self?._state.send(.scanning) }
        }

        // ── 1. Blur Check ──────────────────────────────────────────────────────
        var isBlurry = false
        let variance = blurChecker.calculateLaplacianVariance(pixelBuffer)
        isBlurry = variance < ScannerConfig.blurVarianceThreshold

        if ScannerConfig.blurCheckEnabled {
            if isBlurry {
                if !isCircularCaptureActive {
                    consecutiveSharpFrames = 0
                    if case .error = _state.value {} else {
                        DispatchQueue.main.async { [weak self] in self?._state.send(.error(ScannerConfig.blurStabilityHintMessage)) }
                    }
                }
                // Trigger auto-focus if needed
                if now - lastAutoFocusTriggerMs >= ScannerConfig.autoFocusCooldownMS {
                    lastAutoFocusTriggerMs = now
                    isWaitingForStableFocus = true
                    print("[DetectionCoordinator] 🔍 BLUR detected — auto-focus triggered")
                }
                return
            } else {
                if isWaitingForStableFocus {
                    let focusElapsed = now - lastAutoFocusTriggerMs
                    if focusElapsed < ScannerConfig.autoFocusSettleMS {
                        DispatchQueue.main.async { [weak self] in self?._isStableForDetection.send(false) }
                        return
                    }
                    isWaitingForStableFocus = false
                }

                if !isCircularCaptureActive {
                    consecutiveSharpFrames += 1
                    if consecutiveSharpFrames >= ScannerConfig.blurStableFrames {
                        DispatchQueue.main.async { [weak self] in self?._isStableForDetection.send(true) }
                    } else {
                        DispatchQueue.main.async { [weak self] in self?._isStableForDetection.send(false) }
                    }
                }
            }
        } else {
            DispatchQueue.main.async { [weak self] in self?._isStableForDetection.send(true) }
        }

        // Blur hint uses `.error`; real failures (upload, IO) must not be cleared here.
        if case .error(let msg) = _state.value, msg == ScannerConfig.blurStabilityHintMessage {
            DispatchQueue.main.async { [weak self] in self?._state.send(.scanning) }
        }

        if frameCount <= 3 {
            print("[DetectionCoordinator] 📊 Blur score: \(variance) (threshold=\(ScannerConfig.blurVarianceThreshold))")
        }

        // Feed blur into circular state machine if active
        if isCircularCaptureActive {
            circularSM.onBlurResult(isBlurry: isBlurry)
        }

        // ── 2. Letterbox + YOLO ────────────────────────────────────────────────
        guard let (letterboxImage, originalImage, letterboxInfo) = letterboxProcessor.processPixelBuffer(pixelBuffer) else {
            ScannerRemoteLog.error(
                phase: "pipeline_letterbox_failed",
                message: "letterboxProcessor.processPixelBuffer returned nil",
                detail: ["frameCount": frameCount]
            )
            return
        }
        lastLetterboxInfo = letterboxInfo

        if !loggedFirstLetterboxOk {
            loggedFirstLetterboxOk = true
            ScannerRemoteLog.breadcrumb(phase: "pipeline_first_letterbox_ok", detail: [
                "originalW": letterboxInfo.originalWidth,
                "originalH": letterboxInfo.originalHeight,
                "hasOriginalImage": originalImage != nil
            ])
        }

        let segDetections = yoloRunner.detect(
            letterboxImage: letterboxImage,
            letterboxInfo: letterboxInfo,
            originalWidth: letterboxInfo.originalWidth,
            originalHeight: letterboxInfo.originalHeight
        ).map { SegmentationDetection(from: $0) }

        if frameCount <= 3 || !segDetections.isEmpty {
            let sectorIdx = circularSM.getSessionState().currentTargetSector?.index ?? -1
            print("[DetectionCoordinator] 🌲 YOLO_FRAME: \(segDetections.count) detection(s), sector=\(sectorIdx)")
        }

        // ── 3. Crop detections ────────────────────────────────────────────────
        // IMPORTANT: letterboxImage is 640×640 letterbox space.
        // boundingBox is in ORIGINAL image pixel space (e.g. 1920×1080).
        // We must convert detection boundingBoxes to letterbox space before cropping.
        let letterboxRect: (CGRect) -> CGRect = { box in
            let ratio = CGFloat(letterboxInfo.ratio)
            let padL  = CGFloat(letterboxInfo.padLeft)
            let padT  = CGFloat(letterboxInfo.padTop)
            return CGRect(
                x: box.minX * ratio + padL,
                y: box.minY * ratio + padT,
                width:  box.width  * ratio,
                height: box.height * ratio
            )
        }
        let allLetterboxBoxes = segDetections.map { letterboxRect($0.boundingBox) }

        if !segDetections.isEmpty {
            let firstBox = segDetections[0].boundingBox
            let firstNorm = segDetections[0].normalizedBox
            let firstLB = allLetterboxBoxes[0]
            ScannerRemoteLog.breadcrumb(phase: "coordinator_crop_begin", detail: [
                "detectionCount": segDetections.count,
                "firstBox_x": Int(firstBox.minX),
                "firstBox_y": Int(firstBox.minY),
                "firstBox_w": Int(firstBox.width),
                "firstBox_h": Int(firstBox.height),
                "firstNorm_x": String(format: "%.3f", firstNorm.minX),
                "firstNorm_w": String(format: "%.3f", firstNorm.width),
                "firstLB_x": Int(firstLB.minX),
                "firstLB_w": Int(firstLB.width),
                "lbImageW": letterboxImage.width,
                "lbImageH": letterboxImage.height,
                "originalW": letterboxInfo.originalWidth,
                "originalH": letterboxInfo.originalHeight,
                "ratio": String(format: "%.3f", letterboxInfo.ratio),
                "frameCount": frameCount
            ])
        }

        let cropResults: [CropResult] = {
            guard !segDetections.isEmpty else { return [] }
            // Crop one large image in letterbox space (640×640)
            guard let largeCrop = ImageCropper.cropAllDetections(
                image: letterboxImage,
                rects: allLetterboxBoxes,
                padding: 0.15
            ) else {
                ScannerRemoteLog.error(phase: "coordinator_crop_failed", message: "cropAllDetections returned nil", detail: [
                    "detectionCount": segDetections.count,
                    "firstLBBox_x": allLetterboxBoxes.first.map { Int($0.minX) } ?? -1
                ])
                return []
            }
            ScannerRemoteLog.breadcrumb(phase: "coordinator_crop_ok", detail: [
                "cropW": largeCrop.croppedImage.width,
                "cropH": largeCrop.croppedImage.height
            ])
            // Create CropResults for each detection
            return segDetections.map { segDet in
                CropResult(
                    croppedImage: largeCrop.croppedImage,
                    originalImage: originalImage,  // ← Pass original full-size image
                    relativeBoxCoordinates: largeCrop.relativeBoxCoordinates,
                    normalizedBoxCoordinates: largeCrop.normalizedBoxCoordinates,
                    paddingRatio: largeCrop.paddingRatio,
                    segmentationDetection: segDet
                )
            }
        }()
        lastCropResults = cropResults

        // ── 4. Update overlay cache ──────────────────────────────────────────
        // In circular mode: cache is updated from stable tracker detections (see processStableDetections)
        // In normal mode: cache raw detections for immediate feedback
        if !segDetections.isEmpty && !isCircularCaptureActive {
            // Filter by overlay confidence threshold for stable display
            let highConfDetections = segDetections.filter { $0.confidence >= ScannerConfig.arOverlayConfidenceThreshold }

            let detectionObjs = highConfDetections.map { Detection(from: $0) }
            // Validate normalized boxes before caching — bad values crash the overlay layer.
            let valid = detectionObjs.filter { d in
                d.normalizedBox.minX.isFinite && d.normalizedBox.minY.isFinite &&
                d.normalizedBox.width.isFinite && d.normalizedBox.height.isFinite &&
                d.normalizedBox.width > 0 && d.normalizedBox.height > 0 &&
                d.normalizedBox.minX >= 0 && d.normalizedBox.minY >= 0 &&
                d.normalizedBox.maxX <= 1.01 && d.normalizedBox.maxY <= 1.01
            }
            if valid.count != detectionObjs.count {
                ScannerRemoteLog.error(phase: "coordinator_overlay_invalid_boxes", message: "Some normalized boxes are out of [0,1]", detail: [
                    "total": detectionObjs.count,
                    "valid": valid.count,
                    "sample_nx": String(format: "%.4f", detectionObjs.first?.normalizedBox.minX ?? -1),
                    "sample_nw": String(format: "%.4f", detectionObjs.first?.normalizedBox.width ?? -1)
                ])
            }
            overlayDetectionsCache = valid
            overlayImageWidth = letterboxInfo.originalWidth
            overlayImageHeight = letterboxInfo.originalHeight
            overlayRotationDegrees = 0
            overlayCacheTimestamp = now
            consecutiveCacheMissFrames = 0
        } else if isCircularCaptureActive {
            let cacheAge = now - overlayCacheTimestamp
            consecutiveCacheMissFrames += 1
            if consecutiveCacheMissFrames >= overlayCacheMissFramesThreshold && cacheAge > overlayCacheMaxAgeMs {
                print("[DetectionCoordinator] 📹 CACHE CLEARED: \(consecutiveCacheMissFrames) misses, age=\(cacheAge)ms")
                overlayDetectionsCache = []
                consecutiveCacheMissFrames = 0
            }
        }

        // ── 5. Update overlay ────────────────────────────────────────────────
        ScannerRemoteLog.breadcrumb(phase: "coordinator_before_overlay_send", detail: [
            "isCircularActive": isCircularCaptureActive,
            "isOverlayPaused": isOverlayPaused,
            "cacheCount": overlayDetectionsCache.count,
            "segCount": segDetections.count,
            "frameCount": frameCount
        ])
        // IMPORTANT: always send on main thread — CurrentValueSubject.send() delivers
        // synchronously on the calling thread before .receive(on:.main) can re-dispatch,
        // causing UIKit access (overlay update) from bg thread → crash.
        if isCircularCaptureActive && !isOverlayPaused {
            if !overlayDetectionsCache.isEmpty {
                let payload = DetectionResult(
                    detections: overlayDetectionsCache,
                    croppedImage: cropResults.first?.croppedImage,
                    imageWidth: overlayImageWidth,
                    imageHeight: overlayImageHeight,
                    rotationDegrees: overlayRotationDegrees
                )
                DispatchQueue.main.async { [weak self] in
                    self?._detectionResult.send(payload)
                }
            }
        } else if !segDetections.isEmpty {
            let payload = DetectionResult(
                from: segDetections,
                croppedImage: cropResults.first?.croppedImage,
                imageWidth: letterboxInfo.originalWidth,
                imageHeight: letterboxInfo.originalHeight
            )
            DispatchQueue.main.async { [weak self] in
                self?._detectionResult.send(payload)
            }
        }

        // ── 6. Stable detection tracking ──────────────────────────────────────
        ScannerRemoteLog.breadcrumb(phase: "coordinator_before_stable_tracking", detail: ["frameCount": frameCount, "segCount": segDetections.count])
        processStableDetections(segDetections)

        // ── 7. Process state machine ──────────────────────────────────────────
        ScannerRemoteLog.breadcrumb(phase: "coordinator_before_state_machine", detail: [:])
        processStateMachine(segDetections)
        ScannerRemoteLog.breadcrumb(phase: "coordinator_sm_returned", detail: [:])
        ScannerRemoteLog.breadcrumb(phase: "coordinator_after_state_machine", detail: [:])

        // ── 8. Feed YOLO result to circular SM ────────────────────────────────
        if isCircularCaptureActive {
            let hasDetection = !segDetections.isEmpty
            ScannerRemoteLog.breadcrumb(phase: "coordinator_feed_yolo_to_circular", detail: [
                "hasDetection": hasDetection,
                "detectionCount": segDetections.count,
                "targetSector": circularSM.getSessionState().currentTargetSector?.index ?? -1
            ])
            circularSM.onYoloResult(hasDetection: hasDetection)

            // ✅ CRITICAL FIX: Feed sensor update in SAME frame as YOLO
            // This ensures conditionStable is updated BEFORE checking conditions
            // Race condition: timer-based sensor feed may not run before next frame check
            let snapshot = motionManager.getSnapshot()
            circularSM.onSensorUpdate(
                heading: snapshot.heading.map { Float($0) },
                accelX: Float(snapshot.accelX ?? 0),
                accelY: Float(snapshot.accelY ?? 0),
                accelZ: Float(snapshot.accelZ ?? 0)
            )

            // Save last detection for capture
            if !segDetections.isEmpty {
                lastSegDetForCapture = segDetections.first
            }

            // ✅ CRITICAL FIX: Check if capture was triggered and handle it
            // This was missing in Swift - Android does this at line 462
            if let sectorToCapture = pendingCircularCaptureSector {
                ScannerRemoteLog.breadcrumb(phase: "coordinator_sm_after_pending_check", detail: [
                    "sectorToCapture": sectorToCapture,
                    "hasDetection": !segDetections.isEmpty
                ])
                pendingCircularCaptureActive(
                    sectorToCapture: sectorToCapture,
                    segDetections: segDetections,
                    cropResults: lastCropResults
                )
            }

            // Update UI state after feeding sensor
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self._circularSessionState.send(self.circularSM.getSessionState())
            }
        }

        // ── 9. Feed sensor updates to circular SM ───────────────────────────
        // REMOVED: Sensor feed is handled by dedicated timer (startSensorFeed)
        // to avoid race condition with timer-based updates.
        // Feeding from both processFrame() and timer caused double-trigger crashes.

        frameLock.lock()
        lastProcessedTimeMs = now
        frameLock.unlock()
    }

    // MARK: - Sensor Feed (100ms timer)

    /// Start the sensor feed timer (called when circular capture starts).
    private func startSensorFeed() {
        stopSensorFeed()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Guard against timer duplication
            guard self.sensorFeedTimer == nil else { return }
            self.sensorFeedTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                guard let self = self, self.isCircularCaptureActive else { return }

                let snapshot = self.motionManager.getSnapshot()

                // Log sensor data every 10 ticks (1 second)
                let shouldLog = Int(Date().timeIntervalSince1970 * 10) % 10 == 0
                if shouldLog {
                    ScannerRemoteLog.breadcrumb(phase: "sensor_feed_tick", detail: [
                        "heading": snapshot.heading.map { String(format: "%.1f", $0) } ?? "nil",
                        "accelX": String(format: "%.3f", snapshot.accelX ?? 0),
                        "accelY": String(format: "%.3f", snapshot.accelY ?? 0),
                        "accelZ": String(format: "%.3f", snapshot.accelZ ?? 0),
                        "targetSector": self.circularSM.getSessionState().currentTargetSector?.index ?? -1
                    ])
                }

                self.circularSM.onSensorUpdate(
                    heading: snapshot.heading.map { Float($0) },
                    accelX: Float(snapshot.accelX ?? 0),
                    accelY: Float(snapshot.accelY ?? 0),
                    accelZ: Float(snapshot.accelZ ?? 0)
                )
                // Send state update on main thread (timer already runs on main)
                let state = self.circularSM.getSessionState()
                self._circularSessionState.send(state)
            }
        }
    }

    private func stopSensorFeed() {
        // Timer MUST be invalidated on the thread it was created (main thread)
        if Thread.isMainThread {
            sensorFeedTimer?.invalidate()
            sensorFeedTimer = nil
        } else {
            DispatchQueue.main.sync {
                sensorFeedTimer?.invalidate()
                sensorFeedTimer = nil
            }
        }
    }

    // MARK: - Stable Detection

    private func processStableDetections(_ detections: [SegmentationDetection]) {
        ScannerRemoteLog.breadcrumb(phase: "stable_track_begin", detail: ["count": detections.count])

        // Filter detections before tracking (matches Android DetectionFilter)
        let filtered = detections.filter { det -> Bool in
            let box = det.boundingBox
            let w = box.width
            let h = box.height

            // Filter invalid boxes
            guard w > 0, h > 0 else { return false }

            // Filter by confidence (AR_OVERLAY_CONFIDENCE_THRESHOLD)
            guard det.confidence >= ScannerConfig.arOverlayConfidenceThreshold else { return false }

            // Filter by aspect ratio (0.1 - 10.0)
            let aspectRatio = w / h
            guard aspectRatio >= 0.1 && aspectRatio <= 10.0 else { return false }

            return true
        }

        ScannerRemoteLog.breadcrumb(phase: "stable_track_filtered", detail: [
            "original": detections.count,
            "filtered": filtered.count
        ])

        let yoloDetections = filtered.map { det -> YOLODetection in
            // Use normalizedBox (0–1) for IOU tracking — pixel coords vary too much
            // frame-to-frame (camera jitter) causing IOU < 0.5 and never reaching stableThreshold.
            let trackingRect = det.normalizedBox.width > 0 ? det.normalizedBox : det.boundingBox
            return YOLODetection(
                rect: trackingRect,
                confidence: det.confidence,
                classId: det.classId,
                maskCoeffs: det.maskData?.maskCoeffs ?? [],
                normalizedRect: det.normalizedBox
            )
        }
        ScannerRemoteLog.breadcrumb(phase: "stable_track_mapped", detail: ["yoloCount": yoloDetections.count])
        detectionTracker.track(yoloDetections) { [weak self] confirmed in
            self?.handleConfirmedDetection(confirmed)
        }
        ScannerRemoteLog.breadcrumb(phase: "stable_track_done", detail: [:])

        let stableList = detectionTracker.getAll()
        ScannerRemoteLog.breadcrumb(phase: "stable_get_all_done", detail: ["stableCount": stableList.count])

        // Update overlay cache with smoothed boxes for circular capture mode
        // Only show detections that have been stable for >= arOverlayStabilityFrames
        if isCircularCaptureActive && !stableList.isEmpty {
            let smoothedDetections = stableList.compactMap { trackerStable -> Detection? in
                // Filter by overlay stability frames (5 frames minimum)
                guard trackerStable.confirmCount >= ScannerConfig.arOverlayStabilityFrames else {
                    return nil
                }

                // Convert smoothed normalized box back to Detection for overlay
                let smoothedBox = trackerStable.smoothedBox
                guard smoothedBox.width > 0, smoothedBox.height > 0,
                      smoothedBox.minX >= 0, smoothedBox.minY >= 0,
                      smoothedBox.maxX <= 1.01, smoothedBox.maxY <= 1.01 else {
                    return nil
                }

                let segDet = trackerStable.detection.toSegmentation()
                // Use Detection(from:) initializer
                var detection = Detection(from: segDet)
                // Override with smoothed normalized box
                detection = Detection(
                    boundingBox: segDet.boundingBox,
                    normalizedBox: smoothedBox,
                    categories: [Detection.Category(label: segDet.label, score: trackerStable.detection.confidence)]
                )
                return detection
            }
            // Sort by confidence and limit to maxResults (5 boxes max, like Android)
            .sorted { $0.confidence > $1.confidence }
            .prefix(ScannerConfig.maxResults)

            if !smoothedDetections.isEmpty {
                overlayDetectionsCache = Array(smoothedDetections)
                overlayCacheTimestamp = Int64(Date().timeIntervalSince1970 * 1000)
                consecutiveCacheMissFrames = 0
                ScannerRemoteLog.breadcrumb(phase: "overlay_cache_updated", detail: [
                    "count": smoothedDetections.count,
                    "stableTotal": stableList.count
                ])
            }
        }

        let stablePayload: [StableDetection] = stableList.map { trackerStable in
            // Use smoothedBox for display, not raw detection.rect
            StableDetection(
                id: UUID().uuidString,
                detection: trackerStable.detection.toSegmentation(),
                stableFrames: trackerStable.confirmCount,
                isConfirmed: true,
                hasVirtualID: false,
                averageConfidence: trackerStable.detection.confidence,
                boxes: [trackerStable.smoothedBox],  // Use smoothed box
                confidences: [trackerStable.detection.confidence],
                smoothedBox: trackerStable.smoothedBox  // Use smoothed box from tracker
            )
        }
        // IMPORTANT: send on main thread — CurrentValueSubject.send() can deliver
        // synchronously to subscribers on the calling (bg) thread before
        // receive(on: .main) re-dispatches, causing UIKit access on bg thread.
        DispatchQueue.main.async { [weak self] in
            self?._stableDetections.send(stablePayload)
        }
        ScannerRemoteLog.breadcrumb(phase: "stable_send_dispatched", detail: [:])
    }

    private func handleConfirmedDetection(_ stableDet: DetectionTracker.StableDetection) {
        let virtualID = IDGenerator.generateVirtualId(label: stableDet.detection.label)
        print("[DetectionCoordinator] Virtual ID assigned: \(virtualID)")
    }

    // MARK: - State Machine Processing

    private func handleStateMachineAction(_ action: TreeDetectionAction?) {
        ScannerRemoteLog.breadcrumb(phase: "coordinator_handle_action_entry", detail: [:])

        guard let action = action else {
            ScannerRemoteLog.breadcrumb(phase: "coordinator_handle_action_nil", detail: [:])
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "coordinator_handle_action_begin", detail: [:])

        switch action {
        case .process(let detection):
            ScannerRemoteLog.breadcrumb(phase: "coordinator_action_process", detail: [:])
            DispatchQueue.main.async { [weak self] in self?._state.send(.processing) }
            ScannerRemoteLog.breadcrumb(phase: "coordinator_action_process_before_handle", detail: [:])
            handleProcessAction(detection)
            ScannerRemoteLog.breadcrumb(phase: "coordinator_action_process_after_handle", detail: [:])

        case .cooldown(let durationMs):
            ScannerRemoteLog.breadcrumb(phase: "coordinator_action_cooldown", detail: ["durationMs": Int(durationMs)])
            DispatchQueue.main.async { [weak self] in self?._state.send(.uploading) }
            handleCooldownAction(durationMs: durationMs)

        case .resumeSearching:
            ScannerRemoteLog.breadcrumb(phase: "coordinator_action_resume_searching", detail: [:])
            DispatchQueue.main.async { [weak self] in self?._state.send(.scanning) }
        }

        ScannerRemoteLog.breadcrumb(phase: "coordinator_handle_action_complete", detail: [:])
    }

    private func processStateMachine(_ detections: [SegmentationDetection]) {
        ScannerRemoteLog.breadcrumb(phase: "coordinator_sm_entry", detail: [:])

        // Block if session is pending upload
        if isSessionPendingUpload {
            ScannerRemoteLog.breadcrumb(phase: "coordinator_sm_blocked_pending_upload", detail: [:])
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "coordinator_sm_after_pending_check", detail: [:])

        // Set flag on first detection (triggers circular capture start)
        // Only set when there are actual detections to avoid premature trigger.
        if !isCircularCaptureActive && !isFirstCircularCapturePending && !detections.isEmpty {
            isFirstCircularCapturePending = true
            ScannerRemoteLog.breadcrumb(phase: "coordinator_first_circular_pending_set", detail: ["frameCount": frameCount])
            print("[DetectionCoordinator] 🔵 isFirstCircularCapturePending SET to true")
        }

        ScannerRemoteLog.breadcrumb(phase: "coordinator_before_sm_process", detail: [
            "detectionCount": detections.count,
            "isCircularActive": isCircularCaptureActive
        ])

        let action = stateMachine.process(detections: detections)

        ScannerRemoteLog.breadcrumb(phase: "coordinator_after_sm_process", detail: [
            "hasAction": action != nil
        ])

        ScannerRemoteLog.breadcrumb(phase: "coordinator_before_handle_action_call", detail: [:])
        handleStateMachineAction(action)
        ScannerRemoteLog.breadcrumb(phase: "coordinator_after_handle_action_call", detail: [:])
    }

    private func handleProcessAction(_ detection: SegmentationDetection) {
        // Auto-start circular capture on first successful detection.
        // Guard: isCircularCaptureActive prevents double-activation if stateMachine
        // fires another .process action before stateMachine.pause() takes effect
        // (stateMachine.pause() is now dispatched async so there's a window).
        if isFirstCircularCapturePending && !isCircularCaptureActive {
            activateFirstCircularCapture()
            return
        }

        // Already in circular session — ignore redundant .process actions
        // (stateMachine is paused, but there can be one extra action in flight)
        if isCircularCaptureActive {
            ScannerRemoteLog.breadcrumb(phase: "coordinator_process_action_skipped_circular_active", detail: ["frameCount": frameCount])
            return
        }

        // Non-circular single detection
        handleSingleDetection(detection)
    }

    private func handleCooldownAction(durationMs: Int64) {
        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(Int(durationMs))) { [weak self] in
            self?.stateMachine.setState(.searching)
            DispatchQueue.main.async { self?._state.send(.scanning) }
        }
    }

    private func activateFirstCircularCapture() {
        isCircularCaptureActive = true
        isFirstCircularCapturePending = false
        stateMachine.pause()
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_session_starting", detail: ["frameCount": frameCount])
        print("[DetectionCoordinator] 🎉 CIRCULAR SESSION STARTING!")

        // ✅ Track Analytics: Circular capture started
        Analytics.logEvent("circular_capture_started", parameters: [
            "farm_id": farmId ?? "unknown"
        ])

        // Create session
        if currentSessionId.isEmpty {
            currentSessionStartTimeMs = Int64(Date().timeIntervalSince1970 * 1000)
            currentSessionId = "sess_\(currentSessionStartTimeMs)_\(Int.random(in: 1000...9999))"

            ScannerRemoteLog.breadcrumb(phase: "coordinator_creating_device_id", detail: [:])
            let deviceId = SecureSignature().getDeviceId()
            ScannerRemoteLog.breadcrumb(phase: "coordinator_device_id_ok", detail: ["deviceIdLen": deviceId.count])

            // ⭐️ Generate tree ID immediately (don't wait for verify)
            // Verify will update tree ID if match found
            ScannerRemoteLog.breadcrumb(phase: "coordinator_generating_tree_id", detail: [
                "sessionId": currentSessionId
            ])

            // Generate fallback tree ID first
            if let loc = latestLocation, !farmId.isEmpty {
                let lat = loc.coordinate.latitude
                let lng = loc.coordinate.longitude

                if let existingId = findNearbyTreeId(latitude: lat, longitude: lng) {
                    currentSessionTreeId = existingId
                } else if let gpsId = IDGenerator.generateTreeIdByLocation(
                    farmId: farmId, latitude: lat, longitude: lng
                ) {
                    currentSessionTreeId = gpsId
                    sessionTreeLocations[currentSessionTreeId] = (lat, lng)
                    persistTreeLocations()
                    ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_by_location", detail: [
                        "treeId": String(currentSessionTreeId.prefix(12)),
                        "lat": String(format: "%.5f", lat),
                        "lng": String(format: "%.5f", lng),
                    ])
                } else {
                    // GPS hỏng (Null Island hoặc out-of-range) — fallback timestamp ID.
                    // Sẽ không dedup được cây cũ, nhưng tránh được mass-merge tệ hơn.
                    currentSessionTreeId = IDGenerator.generateTreeId(
                        deviceId: deviceId,
                        sessionId: currentSessionId,
                        timestamp: currentSessionStartTimeMs
                    )
                    ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_fallback_bad_gps", detail: [
                        "treeId": String(currentSessionTreeId.prefix(12)),
                        "lat": String(format: "%.5f", lat),
                        "lng": String(format: "%.5f", lng),
                    ])
                }
            } else {
                currentSessionTreeId = IDGenerator.generateTreeId(
                    deviceId: deviceId,
                    sessionId: currentSessionId,
                    timestamp: currentSessionStartTimeMs
                )
                ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_fallback_timestamp", detail: [
                    "treeId": String(currentSessionTreeId.prefix(12)),
                    "reason": latestLocation == nil ? "no_gps" : "empty_farm_id",
                ])
            }

            candidateSessionTreeId = currentSessionTreeId

            if let firstCrop = lastCropResults.first {
                ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_deferred_to_upload", detail: [
                    "hasFirstCrop": true,
                    "treeId": currentSessionTreeId
                ])
            } else {
                ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_deferred_no_first_crop", detail: [
                    "treeId": currentSessionTreeId
                ])
            }
        }

        // Start circular state machine with current heading
        let snapshot = motionManager.getSnapshot()
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_sm_start_begin", detail: [
            "heading": snapshot.heading.map { String(format: "%.1f", $0) } ?? "nil"
        ])
        circularSM.startSessionWithReferenceHeading(
            snapshot.heading.map { Float($0) },
            onComplete: { [weak self] capturedCount in
                self?.isSessionPendingUpload = true
                print("[DetectionCoordinator] 🏁 [FLOW-C] onComplete callback fired! captured=\(capturedCount)")

                // ✅ Track Analytics: Circular capture completed
                let duration = Int64(Date().timeIntervalSince1970 * 1000) - (self?.currentSessionStartTimeMs ?? 0)
                Analytics.logEvent("circular_capture_completed", parameters: [
                    "sectors_captured": capturedCount,
                    "duration_ms": duration
                ])

                DispatchQueue.main.async {
                    self?._state.send(.success("Đã chụp đủ \(capturedCount) góc!"))
                    self?.listener?.onCircularSessionComplete()
                }
            },
            onSkip: { [weak self] in
                print("[DetectionCoordinator] ⏭️ Sector skipped by user")
                DispatchQueue.main.async {
                    self?._circularSessionState.send(self?.circularSM.getSessionState() ?? CircularSessionState())
                }
            }
        )
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_sm_start_ok", detail: [:])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self._circularSessionState.send(self.circularSM.getSessionState())
        }
        ScannerRemoteLog.breadcrumb(phase: "coordinator_start_sensor_feed_begin", detail: [:])
        startSensorFeed()
        ScannerRemoteLog.breadcrumb(phase: "coordinator_start_sensor_feed_dispatched", detail: [:])

        // Capture first sector (sector 0) immediately
        if let firstCrop = lastCropResults.first {
            let segDet = firstCrop.segmentationDetection ?? lastSegDetForCapture
            if let segDet = segDet {
                let sectorIndex = circularSM.getSessionState().currentTargetSector?.index ?? 0
                ScannerRemoteLog.breadcrumb(phase: "coordinator_first_sector_capture_queued", detail: ["sectorIndex": sectorIndex])
                processingQueue.async { [weak self] in
                    self?.handleCircularCapture(
                        segDet: segDet,
                        cropResult: firstCrop,
                        sectorIndex: sectorIndex
                    )
                }
            }
        }
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_session_fully_started", detail: [:])
    }

    // MARK: - Single Detection (Non-Circular)

    private func handleSingleDetection(_ detection: SegmentationDetection) {
        print("[DetectionCoordinator] Processing single tree detection: \(detection.label)")

        let isOnline = networkMonitor.isOnline

        if isOnline {
            DispatchQueue.main.async { [weak self] in self?._state.send(.uploading) }
        }

        processingQueue.async { [weak self] in
            guard let self = self else { return }

            let cropResult = self.lastCropResults.first
            let sensorSnapshot = self.motionManager.getSnapshot()
            let imgId = IDGenerator.generateImageId()
            let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
            let deviceId = SecureSignature().getDeviceId()

            // ⭐️ Field test fix v2 2026-05-15: proximity lookup TRƯỚC, grid hash SAU.
            let treeId: String
            if let loc = self.latestLocation, !self.farmId.isEmpty {
                let lat = loc.coordinate.latitude
                let lng = loc.coordinate.longitude
                if let existingId = self.findNearbyTreeId(latitude: lat, longitude: lng) {
                    treeId = existingId
                } else if let gpsId = IDGenerator.generateTreeIdByLocation(
                    farmId: self.farmId, latitude: lat, longitude: lng
                ) {
                    treeId = gpsId
                    self.sessionTreeLocations[treeId] = (lat, lng)
                    self.persistTreeLocations()
                } else {
                    // GPS hỏng → fallback timestamp (no dedup possible)
                    treeId = IDGenerator.generateTreeId(
                        deviceId: deviceId,
                        sessionId: self.currentSessionId,
                        timestamp: timestamp
                    )
                }
            } else {
                treeId = IDGenerator.generateTreeId(
                    deviceId: deviceId,
                    sessionId: "single_\(timestamp)",
                    timestamp: timestamp
                )
            }

            self.enqueueSingleCapture(
                segDet: detection,
                cropResult: cropResult,
                imageId: imgId,
                treeId: treeId,
                sensorSnapshot: sensorSnapshot,
                isOnline: isOnline
            )
        }
    }

    private func enqueueSingleCapture(
        segDet: SegmentationDetection,
        cropResult: CropResult?,
        imageId: String,
        treeId: String,
        sensorSnapshot: MotionManager.SensorSnapshot,
        isOnline: Bool
    ) {
        guard let cropImage = cropResult?.croppedImage else {
            DispatchQueue.main.async { [weak self] in self?._state.send(.error("No bitmap")) }
            return
        }

        // ✅ CHANGED: Send full original image without mask (single capture mode)
        // Background removal is now handled server-side for better flexibility
        let finalImage: CGImage

        // Use original full-size image (not letterbox, not masked)
        guard let originalFullImage = cropResult?.originalImage else {
            ScannerRemoteLog.breadcrumb(phase: "enqueue_single_no_original_image", detail: [:])
            DispatchQueue.main.async { [weak self] in self?._state.send(.error("No original image")) }
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "enqueue_single_using_full_image", detail: [
            "size": "\(originalFullImage.width)x\(originalFullImage.height)"
        ])

        // Use full image directly without mask processing
        finalImage = originalFullImage

        // Save image
        do {
            let filePath = try saveImage(finalImage, treeId: treeId, imageId: imageId)
            guard let path = filePath else {
                DispatchQueue.main.async { [weak self] in self?._state.send(.error("Failed to save image")) }
                return
            }

            // Enqueue
            let metadata: [String: Any] = [
                "imageId": imageId,
                "treeId": treeId,
                "farmId": farmId,
                "latitude": latestLocation?.coordinate.latitude as Any,
                "longitude": latestLocation?.coordinate.longitude as Any,
                "heading": sensorSnapshot.heading ?? 0,
                "pitch": sensorSnapshot.pitch ?? 0,
                "roll": sensorSnapshot.roll ?? 0,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]

            Task {
                do {
                    // Enqueue evidence; UploadQueue will verify, create the tree only if needed, then ingest.
                    let id = try await uploadQueue.enqueue(
                        treeId: treeId,
                        imagePath: path,
                        metadata: metadata
                    )
                    print("[DetectionCoordinator] ✅ Single detection #\(id) enqueued")

                    if isOnline {
                        DispatchQueue.main.async { [weak self] in self?._state.send(.uploading) }
                        let result = await uploadQueue.syncPendingDetections()
                        await MainActor.run {
                            if result.successCount > 0 {
                                _state.send(.success("Đã gửi thành công \(result.successCount) ảnh!"))
                            } else {
                                _state.send(.error("Upload failed"))
                            }
                        }
                    } else {
                        await MainActor.run {
                            _state.send(.success("Đã lưu cây, sẽ gửi khi có mạng"))
                        }
                    }
                } catch {
                    await MainActor.run {
                        _state.send(.error(error.localizedDescription))
                    }
                }
            }

        } catch {
            DispatchQueue.main.async { [weak self] in
                self?._state.send(.error("Failed to save image: \(error.localizedDescription)"))
            }
        }
    }

    // MARK: - Circular Capture Handling

    private func pendingCircularCaptureActive(
        sectorToCapture: Int,
        segDetections: [SegmentationDetection],
        cropResults: [CropResult]
    ) {
        pendingCircularCaptureSector = nil

        ScannerRemoteLog.breadcrumb(phase: "pending_circular_capture_active", detail: [
            "sector": sectorToCapture,
            "detectionsCount": segDetections.count,
            "cropResultsCount": cropResults.count
        ])

        guard let segDet = segDetections.first else {
            ScannerRemoteLog.breadcrumb(phase: "capture_triggered_without_detection", detail: ["sector": sectorToCapture])
            circularSM.onCaptureDone(result: CaptureResult.failure(sectorIndex: sectorToCapture, error: "No detection at trigger"))
            let st = circularSM.getSessionState()
            DispatchQueue.main.async { [weak self] in self?._circularSessionState.send(st) }
            return
        }

        DispatchQueue.main.async { [weak self] in self?._state.send(.uploading) }

        let crop = cropResults.first

        ScannerRemoteLog.breadcrumb(phase: "pending_circular_capture_before_handle", detail: [
            "hasCrop": crop != nil,
            "cropImageSize": crop.map { "\($0.croppedImage.width)x\($0.croppedImage.height)" } ?? "nil"
        ])

        processingQueue.async { [weak self] in
            self?.handleCircularCapture(segDet: segDet, cropResult: crop, sectorIndex: sectorToCapture)
        }
    }

    private func handleCircularCapture(
        segDet: SegmentationDetection,
        cropResult: CropResult?,
        sectorIndex: Int
    ) {
        guard !isHandlingCapture else {
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_already_running", detail: ["sectorIndex": sectorIndex])
            print("[DetectionCoordinator] ⚠️ handleCircularCapture already running, skipping sector \(sectorIndex)")
            return
        }
        isHandlingCapture = true

        defer { isHandlingCapture = false }

        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_entry", detail: [
            "sectorIndex": sectorIndex,
            "label": segDet.label,
            "confidence": String(format: "%.2f", segDet.confidence)
        ])

        // Session should already be initialized in activateFirstCircularCapture()
        // If not, this is a fallback (should not happen in normal flow)
        if currentSessionId.isEmpty || currentSessionTreeId.isEmpty {
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_fallback_init", detail: [:])
            print("[DetectionCoordinator] ⚠️ Session not initialized - this should not happen")
            circularSM.onCaptureDone(result: CaptureResult.failure(sectorIndex: sectorIndex, error: "Session not initialized"))
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_start", detail: [
            "sectorIndex": sectorIndex,
            "label": segDet.label,
            "confidence": String(format: "%.2f", segDet.confidence)
        ])

        // ✅ CHANGED: Send full original image without mask
        // Background removal is now handled server-side for better flexibility
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_using_full_image", detail: [:])

        // Use original full-size image (not letterbox, not masked)
        guard let originalFullImage = cropResult?.originalImage else {
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_no_original_image", detail: [:])
            let st = circularSM.getSessionState()
            DispatchQueue.main.async { [weak self] in self?._circularSessionState.send(st) }
            circularSM.onCaptureDone(result: CaptureResult.failure(sectorIndex: sectorIndex, error: "No original image available"))
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_full_image_ready", detail: [
            "size": "\(originalFullImage.width)x\(originalFullImage.height)"
        ])

        // Use full image directly without mask processing
        let finalImage = originalFullImage

        // Save image
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_before_save", detail: [:])
        let imgId = IDGenerator.generateImageId()
        guard let filePath = saveImageSync(finalImage, treeId: currentSessionTreeId, imageId: imgId) else {
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_save_failed", detail: [:])
            circularSM.onCaptureDone(result: CaptureResult.failure(sectorIndex: sectorIndex, error: "Failed to save image"))
            let st = circularSM.getSessionState()
            DispatchQueue.main.async { [weak self] in self?._circularSessionState.send(st) }
            return
        }
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_save_ok", detail: ["filePath": filePath])

        // Get sensor snapshot
        let snapshot = motionManager.getSnapshot()

        // Save to database
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_before_db", detail: [:])
        do {
            _ = try dbManager.insertTreeImage(
                treeId: currentSessionTreeId,
                sectorIndex: sectorIndex,
                imagePath: filePath,
                heading: snapshot.heading,
                pitch: snapshot.pitch,
                roll: snapshot.roll
            )
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_db_ok", detail: [:])
        } catch {
            ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_db_failed", detail: ["error": error.localizedDescription])
            print("[DetectionCoordinator] ⚠️ DB insert failed: \(error)")
        }

        // Enqueue for upload
        let metadata: [String: Any] = [
            "sectorIndex": sectorIndex,
            "imageId": imgId,
            "treeId": currentSessionTreeId,
            "farmId": farmId,
            "heading": snapshot.heading ?? 0,
            "pitch": snapshot.pitch ?? 0,
            "roll": snapshot.roll ?? 0,
            "latitude": latestLocation?.coordinate.latitude as Any,
            "longitude": latestLocation?.coordinate.longitude as Any,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]

        let capturedTreeId = currentSessionTreeId
        let capturedWidth = self.overlayImageWidth
        let capturedHeight = self.overlayImageHeight
        let capturedRotation = self.overlayRotationDegrees

        // Call onCaptureDone synchronously on the current (processing) queue
        // to avoid cross-thread contention. The callback fires outside the lock
        // in CircularCaptureManager, so this is safe.
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_before_done_callback", detail: [
            "sectorIndex": sectorIndex,
            "imageId": imgId,
            "treeId": String(capturedTreeId.prefix(12))
        ])
        circularSM.onCaptureDone(result: CaptureResult.success(sectorIndex: sectorIndex, imageId: imgId, treeId: capturedTreeId))
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_done_callback_ok", detail: [
            "nextState": String(describing: circularSM.getSessionState().state),
            "nextSector": circularSM.getSessionState().currentTargetSector?.index ?? -1
        ])
        print("[DetectionCoordinator] ✅ CAPTURE_DONE_SUCCESS: sector=\(sectorIndex), imageId=\(imgId)")

        // ✅ CRITICAL FIX: Clear overlay cache after capture (match Android behavior)
        // This prevents old box from "sticking" when moving to next sector
        ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_clear_overlay", detail: [
            "sectorIndex": sectorIndex,
            "nextSector": circularSM.getSessionState().currentTargetSector?.index ?? -1
        ])
        overlayDetectionsCache = []
        overlayCacheTimestamp = 0

        // Capture completion updates — always on main thread
        let capturedCircularState = self.circularSM.getSessionState()
        let capturedIsComplete = capturedCircularState.state == .complete

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Send empty detection result to clear box on UI
            self._detectionResult.send(DetectionResult(
                detections: [],
                croppedImage: nil,
                imageWidth: capturedWidth,
                imageHeight: capturedHeight,
                rotationDegrees: capturedRotation
            ))

            if capturedIsComplete {
                self.isCircularCaptureActive = false
                self.isSessionPendingUpload = true
                self.stopSensorFeed()
                print("[DetectionCoordinator] 🏁 Session complete — sensor feed stopped")
            }

            // Send state update ONCE (timer will handle subsequent updates)
            let finalState = self.circularSM.getSessionState()
            self._circularSessionState.send(finalState)

            self._detectionResult.send(DetectionResult(
                detections: [],
                croppedImage: nil,
                imageWidth: capturedWidth,
                imageHeight: capturedHeight,
                rotationDegrees: capturedRotation
            ))
            self._state.send(finalState.state == .complete ? .uploading : .scanning)
        }

        // Enqueue upload asynchronously — doesn't affect capture state
        Task {
            do {
                ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_before_enqueue", detail: ["sectorIndex": sectorIndex])
                // Tree already created in activateFirstCircularCapture() - just enqueue evidence
                let queueId = try await uploadQueue.enqueue(
                    treeId: capturedTreeId,
                    imagePath: filePath,
                    metadata: metadata
                )
                ScannerRemoteLog.breadcrumb(phase: "handle_circular_capture_enqueue_ok", detail: [
                    "sectorIndex": sectorIndex,
                    "queueId": Int(queueId)
                ])
            } catch {
                ScannerRemoteLog.error(phase: "handle_circular_capture_enqueue_failed", message: error.localizedDescription, detail: ["sectorIndex": sectorIndex])
                print("[DetectionCoordinator] ⚠️ Upload enqueue failed: \(error)")
            }
        }
    }

    // MARK: - Image Saving

    private func saveImage(_ image: CGImage, treeId: String, imageId: String) throws -> String? {
        let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docsDir.appendingPathComponent("tree_detections", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let filename = "crop_\(timestamp).jpg"
        let fileURL = dir.appendingPathComponent(filename)

        let jpegUTType: CFString
        if #available(iOS 14.0, *) {
            jpegUTType = UTType.jpeg.identifier as CFString
        } else {
            jpegUTType = kUTTypeJPEG
        }
        guard let destination = CGImageDestinationCreateWithURL(fileURL as CFURL, jpegUTType, 1, nil) else {
            return nil
        }

        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality as CFString: 0.98] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }

        print("[DetectionCoordinator] 💾 IMAGE_SAVED: \(fileURL.path)")
        return fileURL.path
    }

    private func saveImageSync(_ image: CGImage, treeId: String, imageId: String) -> String? {
        try? saveImage(image, treeId: treeId, imageId: imageId)
    }

    /// Creates a CGImage from a segmentation detection for fallback capture.
    private func segImageForCapture(_ segDet: SegmentationDetection) -> CGImage? {
        // Fallback: return the bounding box crop from the last letterbox image.
        // The actual implementation would need access to the source pixel buffer.
        nil
    }

    // MARK: - Circular Capture Control

    /// Start circular capture mode manually.
    func startCircularCapture(onComplete: @escaping () -> Void) {
        // ✅ CRITICAL FIX: Clear pending upload flag when starting new session
        // Without this, previous session's pending upload blocks new session
        isSessionPendingUpload = false
        ScannerRemoteLog.breadcrumb(phase: "coordinator_start_circular_clear_pending_flag")

        isCircularCaptureActive = true
        currentSessionId = ""
        currentSessionStartTimeMs = 0
        currentSessionTreeId = ""
        candidateSessionTreeId = ""
        circularSM.startSession { [weak self] _ in
            onComplete()
            DispatchQueue.main.async {
                self?._circularSessionState.send(self?.circularSM.getSessionState() ?? CircularSessionState())
                self?._state.send(.scanning)
            }
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self._circularSessionState.send(self.circularSM.getSessionState())
            self._state.send(.scanning)
        }
    }

    /// Stop circular capture.
    func stopCircularCapture() {
        // 1. Stop timer first (synchronously on main thread to ensure cleanup)
        stopSensorFeed()

        // 2. Set flag to prevent new timer fires
        isCircularCaptureActive = false
        isSessionPendingUpload = false
        isFirstCircularCapturePending = false
        pendingCircularCaptureSector = nil

        // 3. End session after timer is guaranteed stopped
        circularSM.endSession()
        DispatchQueue.main.async { [weak self] in self?._circularSessionState.send(CircularSessionState()) }
    }

    /// Skip current sector.
    func skipCurrentSector() {
        guard isCircularCaptureActive else { return }
        circularSM.skipCurrentSector()
        let st = circularSM.getSessionState()
        DispatchQueue.main.async { [weak self] in self?._circularSessionState.send(st) }
    }

    /// Check if circular capture is active.
    func isInCircularCapture() -> Bool { isCircularCaptureActive }

    // MARK: - Pause / Resume

    func pauseDetection() {
        isProcessingPaused = true
        print("[DetectionCoordinator] ⏸️ Detection PAUSED")
    }

    func resumeDetection() {
        isProcessingPaused = false
        print("[DetectionCoordinator] ▶️ Detection RESUMED")
    }

    func pauseOverlay() {
        isOverlayPaused = true
        print("[DetectionCoordinator] ⏸️ Overlay PAUSED")
    }

    func resumeOverlay() {
        isOverlayPaused = false
        print("[DetectionCoordinator] ▶️ Overlay RESUMED")
    }

    // MARK: - Location

    func updateLocation(_ location: CLLocation?) {
        latestLocation = location
    }

    // MARK: - Reset

    func resetTracking() {
        print("[DetectionCoordinator] 🔄 resetTracking CALLED")
        detectionTracker.clear()
        DispatchQueue.main.async { [weak self] in
            self?._stableDetections.send([])
            self?._state.send(.scanning)
        }
        stateMachine.resume()
        stateMachine.reset()

        if isCircularCaptureActive {
            stopCircularCapture()
        }

        lastCropResults = []
        isSessionPendingUpload = false
        lastSegDetForCapture = nil
        currentSessionId = ""
        currentSessionStartTimeMs = 0
        currentSessionTreeId = ""
        candidateSessionTreeId = ""
        isWaitingForStableFocus = false
        lastAutoFocusTriggerMs = 0
        isHandlingCapture = false
    }

    // MARK: - Helpers

    func getLetterboxParams() -> LetterboxInfo? { lastLetterboxInfo }

    /// Sync all pending detections. Called by ScannerViewController.
    func syncPending() async -> SyncResult {
        await uploadQueue.syncPendingDetections()
    }

    /// Verify and update tree ID if match found (background task)
    /// Returns true if verify succeeded (either matched or no_match), false if verify failed.
    @discardableResult
    private func verifyAndCreateTree(verifyImage: UIImage, deviceId: String) async -> Bool {
        do {
            // Build verify request
            let verifyAPI = ScannerConfig.createVerifyAPI()
            let snapshot = motionManager.getSnapshot()

            let timeSeries = TimeSeriesData(
                latitude: latestLocation?.coordinate.latitude ?? 0,
                longitude: latestLocation?.coordinate.longitude ?? 0,
                timestamp: Int64(Date().timeIntervalSince1970 * 1000),
                heading: snapshot.heading ?? 0,
                pitch: snapshot.pitch ?? 0,
                roll: snapshot.roll ?? 0
            )

            let metadata = MetadataData(
                deviceId: deviceId,
                nonce: UUID().uuidString,
                signature: ""  // TODO: Implement signature
            )

            ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_call_begin", detail: [
                "lat": String(format: "%.5f", timeSeries.latitude),
                "lng": String(format: "%.5f", timeSeries.longitude)
            ])

            // Call verify API
            let verifyResponse = try await verifyAPI.verify(
                image: verifyImage,
                timeSeries: timeSeries,
                metadata: metadata,
                radius: 30.0,
                knownTreeId: nil
            )

            ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_response", detail: [
                "status": verifyResponse.status,
                "confidence": String(format: "%.2f", verifyResponse.confidence),
                "matchedTreeId": verifyResponse.matchedTreeId ?? "nil"
            ])

            // Handle verify response - only update tree ID if confident match
            if verifyResponse.status == "error" || verifyResponse.decision == "ERROR" {
                ScannerRemoteLog.error(
                    phase: "coordinator_verify_backend_error",
                    message: verifyResponse.reason,
                    detail: ["treeId": currentSessionTreeId]
                )
                return false
            }

            if verifyResponse.hasMatchCandidate, let matchedId = verifyResponse.matchedTreeId {
                let presentingVC = await MainActor.run { () -> UIViewController? in
                    guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                          let window = windowScene.windows.first,
                          let rootVC = window.rootViewController else {
                        return nil
                    }
                    var topVC = rootVC
                    while let presented = topVC.presentedViewController {
                        topVC = presented
                    }
                    return topVC
                }

                let decision = await TreeMatchHandler.showConfirmation(
                    originalTreeId: currentSessionTreeId,
                    matchedTreeId: matchedId,
                    confidence: verifyResponse.confidence,
                    verifyResponse: verifyResponse,
                    presentingViewController: presentingVC
                )

                guard decision == .useExisting else {
                    ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_user_selected_new", detail: [
                        "keptTreeId": String(currentSessionTreeId.prefix(12))
                    ])
                    print("[DetectionCoordinator] ⚠️ User selected new tree, keeping original tree ID")
                    return true
                }

                let oldTreeId = currentSessionTreeId
                currentSessionTreeId = matchedId
                ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_match_update", detail: [
                    "oldTreeId": String(oldTreeId.prefix(12)),
                    "newTreeId": String(matchedId.prefix(12)),
                    "confidence": String(format: "%.2f", verifyResponse.confidence),
                    "status": verifyResponse.status
                ])
                print("[DetectionCoordinator] ✅ Verify matched, updated tree ID: \(oldTreeId) → \(matchedId)")
                return true
            }

            if verifyResponse.status == "no_match" || verifyResponse.decision == "NO_MATCH" {
                ScannerRemoteLog.breadcrumb(phase: "coordinator_verify_no_match_create_allowed", detail: [
                    "confidence": String(format: "%.2f", verifyResponse.confidence),
                    "treeId": String(currentSessionTreeId.prefix(12))
                ])
                print("[DetectionCoordinator] ℹ️ Verify no_match, creating new tree ID")
                return true
            }

            ScannerRemoteLog.error(
                phase: "coordinator_verify_unsafe_decision",
                message: "Unsafe verify decision: \(verifyResponse.status)/\(verifyResponse.decision)",
                detail: ["treeId": currentSessionTreeId]
            )
            return false

        } catch {
            ScannerRemoteLog.error(
                phase: "coordinator_verify_failed",
                message: error.localizedDescription,
                detail: [:]
            )
            print("[DetectionCoordinator] ⚠️ Verify failed, blocking tree creation: \(error)")
            return false
        }
    }

    /// Fallback to proximity lookup when verify fails or returns no_match
    private func fallbackToProximityLookup(deviceId: String) async {
        if let loc = latestLocation, !farmId.isEmpty {
            let lat = loc.coordinate.latitude
            let lng = loc.coordinate.longitude

            if let existingId = findNearbyTreeId(latitude: lat, longitude: lng) {
                currentSessionTreeId = existingId
            } else if let gpsId = IDGenerator.generateTreeIdByLocation(
                farmId: farmId, latitude: lat, longitude: lng
            ) {
                currentSessionTreeId = gpsId
                sessionTreeLocations[currentSessionTreeId] = (lat, lng)
                persistTreeLocations()
                ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_by_location", detail: [
                    "treeId": String(currentSessionTreeId.prefix(12)),
                    "lat": String(format: "%.5f", lat),
                    "lng": String(format: "%.5f", lng),
                ])
            } else {
                currentSessionTreeId = IDGenerator.generateTreeId(
                    deviceId: deviceId,
                    sessionId: currentSessionId,
                    timestamp: currentSessionStartTimeMs
                )
                ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_fallback_bad_gps", detail: [
                    "treeId": String(currentSessionTreeId.prefix(12)),
                    "lat": String(format: "%.5f", lat),
                    "lng": String(format: "%.5f", lng),
                ])
            }
        } else {
            currentSessionTreeId = IDGenerator.generateTreeId(
                deviceId: deviceId,
                sessionId: currentSessionId,
                timestamp: currentSessionStartTimeMs
            )
            ScannerRemoteLog.breadcrumb(phase: "coordinator_tree_id_fallback_timestamp", detail: [
                "treeId": String(currentSessionTreeId.prefix(12)),
                "reason": latestLocation == nil ? "no_gps" : "empty_farm_id",
            ])
        }
    }

    /// Start circular capture after verify workflow completes.
    /// Extracted to avoid code duplication and ensure tree is created before capture.
    @MainActor
    private func startCircularCaptureAfterVerify() {
        // Start circular state machine with current heading
        let snapshot = motionManager.getSnapshot()
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_sm_start_after_verify", detail: [
            "heading": snapshot.heading.map { String(format: "%.1f", $0) } ?? "nil",
            "treeId": String(currentSessionTreeId.prefix(12))
        ])

        circularSM.startSessionWithReferenceHeading(
            snapshot.heading.map { Float($0) },
            onComplete: { [weak self] capturedCount in
                self?.isSessionPendingUpload = true
                print("[DetectionCoordinator] 🏁 [FLOW-C] onComplete callback fired! captured=\(capturedCount)")

                // ✅ Track Analytics: Circular capture completed
                let duration = Int64(Date().timeIntervalSince1970 * 1000) - (self?.currentSessionStartTimeMs ?? 0)
                Analytics.logEvent("circular_capture_completed", parameters: [
                    "sectors_captured": capturedCount,
                    "duration_ms": duration
                ])

                DispatchQueue.main.async {
                    self?._state.send(.success("Đã chụp đủ \(capturedCount) góc!"))
                    self?.listener?.onCircularSessionComplete()
                }
            },
            onSkip: { [weak self] in
                print("[DetectionCoordinator] ⏭️ Sector skipped by user")
                DispatchQueue.main.async {
                    self?._circularSessionState.send(self?.circularSM.getSessionState() ?? CircularSessionState())
                }
            }
        )

        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_sm_start_ok", detail: [:])

        self._circularSessionState.send(self.circularSM.getSessionState())

        ScannerRemoteLog.breadcrumb(phase: "coordinator_start_sensor_feed_begin", detail: [:])
        startSensorFeed()
        ScannerRemoteLog.breadcrumb(phase: "coordinator_start_sensor_feed_dispatched", detail: [:])

        // Capture first sector (sector 0) immediately
        if let firstCrop = lastCropResults.first {
            let segDet = firstCrop.segmentationDetection ?? lastSegDetForCapture
            if let segDet = segDet {
                let sectorIndex = circularSM.getSessionState().currentTargetSector?.index ?? 0
                ScannerRemoteLog.breadcrumb(phase: "coordinator_first_sector_capture_queued", detail: ["sectorIndex": sectorIndex])
                processingQueue.async { [weak self] in
                    self?.handleCircularCapture(
                        segDet: segDet,
                        cropResult: firstCrop,
                        sectorIndex: sectorIndex
                    )
                }
            }
        }
        ScannerRemoteLog.breadcrumb(phase: "coordinator_circular_session_fully_started", detail: [:])
    }

    /// Create tree on server once for the current session
    private func createSessionTree() async {
        guard !currentSessionTreeId.isEmpty else {
            print("[DetectionCoordinator] ⚠️ Cannot create tree: sessionTreeId is empty")
            return
        }

        print("[DetectionCoordinator] 🌳 Creating session tree on server: \(currentSessionTreeId)")
        ScannerRemoteLog.breadcrumb(phase: "create_session_tree_start", detail: ["treeId": currentSessionTreeId])

        let treeAPI = ScannerConfig.createTreeAPI()
        let treeRequest = TreeCreateRequest(
            id: currentSessionTreeId,
            regionCode: ScannerConfig.regionCode,
            farmId: farmId,
            geohash7: calculateGeohash(latitude: latestLocation?.coordinate.latitude, longitude: latestLocation?.coordinate.longitude),
            latitude: latestLocation?.coordinate.latitude,
            longitude: latestLocation?.coordinate.longitude,
            rowIdx: nil,
            colIdx: nil,
            codebookId: nil,
            representativeVector: nil,
            binaryCode: nil,
            pqCode: nil,
            metadata: nil,
            capturedAt: nil
        )

        do {
            let tree = try await treeAPI.createTree(treeRequest)
            print("[DetectionCoordinator] ✅ Session tree created on server: \(tree.id)")
            ScannerRemoteLog.breadcrumb(phase: "create_session_tree_success", detail: ["treeId": tree.id])
        } catch {
            // Check if 409 Conflict (tree already exists)
            if let apiError = error as? ApiError, case .conflict = apiError {
                print("[DetectionCoordinator] ℹ️ Session tree already exists on server")
                ScannerRemoteLog.breadcrumb(phase: "create_session_tree_already_exists", detail: ["treeId": currentSessionTreeId])
            } else {
                print("[DetectionCoordinator] ❌ Failed to create session tree: \(error)")
                ScannerRemoteLog.error(phase: "create_session_tree_failed", message: error.localizedDescription, detail: ["treeId": currentSessionTreeId])
            }
        }
    }

    /// Calculate geohash from coordinates
    private func calculateGeohash(latitude: Double?, longitude: Double?) -> String {
        guard let lat = latitude, let lng = longitude else {
            return "w3gvk9q"  // Fallback: centroid of vn-south-01 region
        }
        return Self.encodeGeohash(lat: lat, lng: lng, precision: 7)
    }

    private static let geohashBase32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")

    private static func encodeGeohash(lat: Double, lng: Double, precision: Int) -> String {
        var minLat = -90.0, maxLat = 90.0
        var minLng = -180.0, maxLng = 180.0
        var result = ""
        var bits = 0
        var hashValue = 0
        var isEven = true

        while result.count < precision {
            if isEven {
                let mid = (minLng + maxLng) / 2
                if lng >= mid {
                    hashValue = (hashValue << 1) | 1
                    minLng = mid
                } else {
                    hashValue = hashValue << 1
                    maxLng = mid
                }
            } else {
                let mid = (minLat + maxLat) / 2
                if lat >= mid {
                    hashValue = (hashValue << 1) | 1
                    minLat = mid
                } else {
                    hashValue = hashValue << 1
                    maxLat = mid
                }
            }
            isEven.toggle()
            bits += 1
            if bits == 5 {
                result.append(geohashBase32[hashValue])
                bits = 0
                hashValue = 0
            }
        }
        return result
    }
}

// MARK: - SensorTriggerListener

extension DetectionCoordinator: SensorTriggerListener {
    func onShakeDetected(intensity: Float) {
        print("[DetectionCoordinator] ⚡ Shake detected: \(intensity)")
    }

    func onCuttingActionDetected() {
        print("[DetectionCoordinator] 🔪 Cutting action detected")
    }

    func onMovementStopped() {
        print("[DetectionCoordinator] ⏸️ Movement stopped")
    }
}

// MARK: - LocationListener

extension DetectionCoordinator: LocationListener {
    func onLocationFound(location: CLLocation) {
        latestLocation = location
    }

    func onLocationWait(currentAccuracy: Float) {
        print("[DetectionCoordinator] 📍 Location accuracy: \(currentAccuracy)m")
    }
}

// MARK: - UploadSyncCallback

extension DetectionCoordinator: UploadSyncCallback {
    func onSyncSuccess(treeId: String, detectionData: UploadDetectionData) {
        print("[DetectionCoordinator] ✅ Sync success: \(treeId)")
    }

    func onSyncFailed(detectionId: Int64, error: String) {
        print("[DetectionCoordinator] ❌ Sync failed #\(detectionId): \(error)")
    }

    func onBatchSyncComplete(successCount: Int, treeIds: [String]) {
        print("[DetectionCoordinator] ✅ Batch sync complete: \(successCount) trees")
    }
}
