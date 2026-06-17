import UIKit
import AVFoundation
import CoreVideo
import CoreLocation
import Combine

/// Main full-screen camera scanner view controller.
/// Wires together DetectionCoordinator + CameraSessionManager + all UI overlays.
/// Mirrors Android ScannerActivity.kt.
final class ScannerViewController: UIViewController {

    // MARK: - UI Components

    private let cameraPreview = CameraPreviewView()
    private let overlayView = ScannerOverlayView()
    private let guidanceView = CircularGuidanceView()
    private let progressRing = ProgressRingView()
    private let feedbackLabel = FeedbackLabel()
    private let closeButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let loadingOverlay = UIView()
    private let loadingTitleLabel = UILabel()
    private let loadingSubtitleLabel = UILabel()

    // MARK: - Core Modules

    private let cameraManager = CameraSessionManager()
    private let networkMonitor = NetworkMonitor()
    private let locationHelper = LocationHelper()

    // YOLO + detection (owned by coordinator)
    private var yoloRunner: YOLOTFLiteRunner?
    private let blurChecker = BlurChecker()
    private let letterboxProcessor = LetterboxProcessor()
    private let motionManager = MotionManager()

    // Central orchestrator
    private var coordinator: DetectionCoordinator?

    // Combine
    private var cancellables = Set<AnyCancellable>()

    // Upload
    private var isUploadInProgress = false
    private var activeUploadTask: Task<Void, Never>?

    // ✅ Track captured count for feedback
    private var previousCapturedCount: Int = 0

    // ✅ Farm Context
    var farmId: String = "unknown-farm"

    // ✅ Scan Mode (tree or fruit)
    var scanMode: DetectionCoordinator.ScanMode = .tree

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_viewDidLoad_begin", detail: [:])
        setupUI()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupUI", detail: [:])
        setupLoadingOverlay()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupLoadingOverlay", detail: [:])
        // Camera + sensors + location first — keeps presentation light. YOLO + coordinator next tick
        // so UIKit can finish modal transition (avoids crashes during synchronous heavy native work).
        setupCamera()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupCamera", detail: [:])
        setupSensors()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupSensors", detail: [:])
        setupLocation()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupLocation", detail: [:])
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_viewDidLoad_sync_complete", detail: [:])

        DispatchQueue.main.async { [weak self] in
            self?.finishHeavyInitialization()
        }
    }

    /// TensorFlow Lite + DetectionCoordinator + Combine bindings — deferred off the first viewDidLoad stack.
    /// `loadModel()` + `allocateTensors()` run on a **background** queue so the main thread stays responsive
    /// during modal presentation (blocking main here has caused watchdog / UIKit issues on device).
    private func finishHeavyInitialization() {
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_deferred_init_start", detail: [:])

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            let runner = YOLOTFLiteRunner(modelType: self.scanMode.modelType)
            do {
                try runner.loadModel()
                DispatchQueue.main.async { [weak self] in
                    self?.attachYoloAndBuildCoordinator(runner: runner, loadError: nil)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.attachYoloAndBuildCoordinator(runner: runner, loadError: error)
                }
            }
        }
    }

    /// Always called on the main queue after background `loadModel` attempt.
    private func attachYoloAndBuildCoordinator(runner: YOLOTFLiteRunner, loadError: Error?) {
        if let error = loadError {
            yoloRunner = runner
            ScannerRemoteLog.breadcrumb(phase: "yolo_load_failed", detail: [
                "error": String(describing: error)
            ])
            print("[ScannerVC] ❌ YOLO load failed: \(error)")
        } else {
            yoloRunner = runner
            print("[ScannerVC] ✅ YOLO weights loaded (off main thread)")
        }

        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_initializeYOLO", detail: [
            "yoloReady": yoloRunner?.isInitialized ?? false
        ])
        initializeCoordinator()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_initializeCoordinator", detail: [
            "hasCoordinator": coordinator != nil
        ])
        setupCoordinatorBindings()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupCoordinatorBindings", detail: [:])
        setupNetworkMonitor()
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_after_setupNetworkMonitor", detail: [:])
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_viewDidLoad_complete", detail: [
            "hasCoordinator": coordinator != nil
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_viewDidAppear", detail: [:])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_viewWillAppear", detail: [:])
        setImmersiveMode()
        motionManager.start()
        locationHelper.start()
        cameraManager.start()
        networkMonitor.start()
        coordinator?.resumeDetection()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        motionManager.stop()
        locationHelper.stop()
        cameraManager.stop()
        networkMonitor.stop()
        coordinator?.pauseDetection()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed {
            NotificationCenter.default.post(name: .scannerViewControllerDismissed, object: self)
        }
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        ScannerRemoteLog.error(
            phase: "scanner_vc_memory_warning",
            message: "UIKit didReceiveMemoryWarning while scanner visible",
            detail: [:]
        )
    }

    // MARK: - Init Helpers

    private func initializeCoordinator() {
        guard let yoloRunner = yoloRunner else {
            print("[ScannerVC] ❌ Cannot create coordinator — YOLO runner missing")
            return
        }

        let db = LocalDatabaseManager.shared
        let oldQueue = UploadQueue(db: db, networkMonitor: networkMonitor)

        // Wire up tree match confirmation callback
        oldQueue.onTreeMatchFound = { [weak self] originalTreeId, matchedTreeId, confidence, verifyResponse in
            await TreeMatchHandler.showConfirmation(
                originalTreeId: originalTreeId,
                matchedTreeId: matchedTreeId,
                confidence: confidence,
                verifyResponse: verifyResponse,
                presentingViewController: self
            )
        }

        let queue = EnhancedUploadQueue(originalQueue: oldQueue)

        let coord = DetectionCoordinator(
            scanMode: self.scanMode,
            yoloRunner: yoloRunner,
            blurChecker: blurChecker,
            letterboxProcessor: letterboxProcessor,
            dbManager: db,
            uploadQueue: queue,
            networkMonitor: networkMonitor,
            motionManager: motionManager,
            farmId: self.farmId
        )
        coord.listener = self
        coordinator = coord
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = .black

        // Camera preview
        cameraPreview.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cameraPreview)

        // Overlay: bounding boxes
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlayView)

        // Guidance: circular guide (8 or 15 sectors based on scan mode)
        guidanceView.translatesAutoresizingMaskIntoConstraints = false
        guidanceView.isHidden = true
        view.addSubview(guidanceView)

        // Progress ring (top right) - configure total sectors based on scan mode
        progressRing.translatesAutoresizingMaskIntoConstraints = false
        progressRing.totalSectors = scanMode.sectorCount
        view.addSubview(progressRing)

        // Feedback label (top left, below close button)
        feedbackLabel.translatesAutoresizingMaskIntoConstraints = false
        feedbackLabel.isHidden = true
        view.addSubview(feedbackLabel)

        // Close button
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        closeButton.layer.cornerRadius = 20
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)

        // Skip sector — use Configuration only (mixing setTitle + configuration can assert / misbehave on iOS 15+).
        var skipCfg = UIButton.Configuration.filled()
        skipCfg.title = "Bỏ qua sector"
        skipCfg.baseForegroundColor = .white
        skipCfg.baseBackgroundColor = UIColor(red: 0.72, green: 0.59, blue: 0.35, alpha: 0.8)
        skipCfg.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16)
        skipCfg.cornerStyle = .medium
        skipCfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = .systemFont(ofSize: 13, weight: .semibold)
            return out
        }
        skipButton.configuration = skipCfg
        skipButton.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        skipButton.translatesAutoresizingMaskIntoConstraints = false
        skipButton.isHidden = true
        view.addSubview(skipButton)

        NSLayoutConstraint.activate([
            cameraPreview.topAnchor.constraint(equalTo: view.topAnchor),
            cameraPreview.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cameraPreview.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cameraPreview.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            overlayView.topAnchor.constraint(equalTo: view.topAnchor),
            overlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            guidanceView.topAnchor.constraint(equalTo: view.topAnchor),
            guidanceView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            guidanceView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            guidanceView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            progressRing.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            progressRing.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            progressRing.widthAnchor.constraint(equalToConstant: 70),
            progressRing.heightAnchor.constraint(equalToConstant: 70),

            feedbackLabel.topAnchor.constraint(equalTo: closeButton.bottomAnchor, constant: 12),
            feedbackLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            feedbackLabel.trailingAnchor.constraint(lessThanOrEqualTo: progressRing.leadingAnchor, constant: -16),

            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            closeButton.widthAnchor.constraint(equalToConstant: 40),
            closeButton.heightAnchor.constraint(equalToConstant: 40),

            skipButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            skipButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    private func setupLoadingOverlay() {
        loadingOverlay.backgroundColor = UIColor.black.withAlphaComponent(0.75)
        loadingOverlay.translatesAutoresizingMaskIntoConstraints = false
        loadingOverlay.isHidden = true
        view.addSubview(loadingOverlay)

        loadingTitleLabel.textColor = .white
        loadingTitleLabel.font = .systemFont(ofSize: 16, weight: .medium)
        loadingTitleLabel.textAlignment = .center
        loadingTitleLabel.numberOfLines = 0
        loadingTitleLabel.translatesAutoresizingMaskIntoConstraints = false

        loadingSubtitleLabel.textColor = UIColor.white.withAlphaComponent(0.7)
        loadingSubtitleLabel.font = .systemFont(ofSize: 13, weight: .regular)
        loadingSubtitleLabel.textAlignment = .center
        loadingSubtitleLabel.numberOfLines = 0
        loadingSubtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [loadingTitleLabel, loadingSubtitleLabel])
        stack.axis = .vertical
        stack.spacing = 8
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        loadingOverlay.addSubview(stack)

        NSLayoutConstraint.activate([
            loadingOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            loadingOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            loadingOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            stack.centerXAnchor.constraint(equalTo: loadingOverlay.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: loadingOverlay.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: loadingOverlay.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: loadingOverlay.trailingAnchor, constant: -32),
        ])
    }

    // MARK: - Camera Setup

    private func setupCamera() {
        // Permission is already verified by ScannerModule.startScanning() before this VC
        // is created, so we can connect the preview directly.
        // CameraPreviewView owns its AVCaptureVideoPreviewLayer; do NOT add a second one.
        cameraPreview.connect(to: cameraManager.session)

        cameraManager.onFrameCaptured = { [weak self] pixelBuffer, _ in
            self?.coordinator?.processFrame(pixelBuffer, cameraConfig: nil)
        }

        cameraManager.onError = { [weak self] error in
            DispatchQueue.main.async {
                self?.showFeedback("Lỗi camera: \(error.localizedDescription)", color: .systemRed)
            }
        }
    }

    // MARK: - Sensors Setup

    private func setupSensors() {
        motionManager.onHeadingUpdated = { _ in
            // Heading fed into coordinator via its own sensor feed
        }
        motionManager.onShakeDetected = { intensity in
            print("[ScannerVC] ⚡ Shake: \(intensity)")
        }
        motionManager.onMovementStopped = { [weak self] in
            self?.showFeedback("Device ổn định", color: .systemGreen)
        }
    }

    // MARK: - Location Setup

    private func setupLocation() {
        locationHelper.listener = self
        locationHelper.requestPermission()
        locationHelper.start()
    }

    // MARK: - Coordinator Bindings

    private func setupCoordinatorBindings() {
        guard let coordinator = coordinator else {
            print("[ScannerVC] ⚠️ Coordinator not available — skipping bindings")
            return
        }

        // Coordinator state → UI
        coordinator.statePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.handleCoordinatorState(state)
            }
            .store(in: &cancellables)

        // Detection result → overlay + RN event
        coordinator.detectionResultPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                guard let self = self, let result = result else { return }
                self.overlayView.updateDetections(result.detections, imageHeight: result.imageHeight, imageWidth: result.imageWidth)

                // Emit to React Native (finite doubles only — NaN/Inf breaks JSON / Hermes)
                let detectionsPayload: [[String: Any]] = result.detections.map { det in
                    [
                        "x": Self.bridgeFinite(det.boundingBox.origin.x),
                        "y": Self.bridgeFinite(det.boundingBox.origin.y),
                        "width": Self.bridgeFinite(det.boundingBox.width),
                        "height": Self.bridgeFinite(det.boundingBox.height),
                        "label": det.label,
                        "confidence": Self.bridgeFinite(CGFloat(det.confidence))
                    ]
                }
                self.emitEvent("onDetectionResult", body: [
                    "detections": detectionsPayload,
                    "imageWidth": result.imageWidth,
                    "imageHeight": result.imageHeight
                ])
            }
            .store(in: &cancellables)

        // Circular session state → guidance + progress + skip
        coordinator.circularSessionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.updateUIForSessionState(state)

                // ✅ Show feedback when capture count increases
                if let previousCount = self?.previousCapturedCount,
                   state.capturedCount > previousCount {
                    let remaining = 15 - state.capturedCount
                    self?.showFeedback("✓ Đã chụp! Còn \(remaining) sector", color: .systemGreen)
                    ScannerRemoteLog.breadcrumb(phase: "scanner_vc_capture_feedback", detail: [
                        "capturedCount": state.capturedCount,
                        "remaining": remaining
                    ])
                }
                self?.previousCapturedCount = state.capturedCount
            }
            .store(in: &cancellables)

        // Stable detections → status message
        coordinator.stableDetectionsPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] detections in
                let confirmed = detections.filter { $0.isConfirmed }
                if !confirmed.isEmpty {
                    self?.showFeedback("Đã phát hiện \(confirmed.count) cây!", color: .systemGreen)
                }
            }
            .store(in: &cancellables)

        print("[ScannerVC] ✅ Coordinator bindings ready")
    }

    // MARK: - Network Monitor

    private func setupNetworkMonitor() {
        networkMonitor.onConnectivityChange = { [weak self] isOnline in
            if isOnline {
                self?.retryPendingUpload()
            } else {
                self?.showFeedback("Mất mạng — ảnh sẽ lưu local", color: .systemYellow)
            }
        }
    }

    // MARK: - Coordinator State → UI

    private func handleCoordinatorState(_ state: CoordinatorState) {
        switch state {
        case .idle:
            break

        case .scanning:
            hideLoading()
            coordinator?.resumeOverlay()
            showFeedback("Đang quét cây...", color: .white)

        case .detecting:
            break

        case .processing:
            break

        case .uploading:
            showLoading(title: "Đang gửi lên server...", subtitle: "Vui lòng chờ")
            coordinator?.pauseOverlay()
            emitEvent("onUploadProgress", body: ["progress": 0.0])

        case .success(let message):
            hideLoading()
            showFeedback(message, color: .systemGreen)

        case .error(let message):
            hideLoading()
            coordinator?.resumeDetection()
            if message == ScannerConfig.blurStabilityHintMessage {
                showFeedback(message, color: .systemYellow)
                emitEvent("onBlurDetected", body: ["message": message])
            } else {
                showFeedback("Lỗi: \(message)", color: .systemRed)
                emitEvent("onDetectionError", body: ["error": message])
            }
        }
    }

    // MARK: - Session State → UI

    private func updateUIForSessionState(_ state: CircularSessionState) {
        // Ensure we're on main thread
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.updateUIForSessionState(state)
            }
            return
        }

        // Bind state first (this updates internal state but doesn't trigger layout yet)
        guidanceView.bindState(state)

        let isActive = state.state == .guidance || state.state == .stationaryWait

        // Update visibility
        guidanceView.isHidden = !isActive
        skipButton.isHidden = !isActive

        progressRing.capturedCount = state.capturedCount

        if state.state == .complete {
            overlayView.clearDetections()
        }
    }

    // MARK: - Circular Session Complete

    private func handleCircularSessionComplete() {
        print("[ScannerVC] 🏁 Circular session complete")
        isUploadInProgress = true

        let capturedCount = coordinator?.currentCircularSessionState.capturedCount ?? 0
        let isPartialComplete = capturedCount < 15

        ScannerRemoteLog.circularSession("complete", detail: [
            "treeId": coordinator?.currentTreeId ?? "",
            "capturedCount": capturedCount,
            "isPartialComplete": isPartialComplete
        ])

        // ✅ Show feedback for partial complete
        if isPartialComplete {
            showFeedback("Đã chụp \(capturedCount)/15 ảnh. Đang xử lý...", color: .systemOrange)
        }

        // ✅ CRITICAL FIX: Stop camera preview to show React Native UI
        // Without this, camera view blocks the "Save onnet" screen
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_session_complete_camera_stop", detail: [
            "reason": "circular_session_complete",
            "willShowReactNativeUI": true,
            "capturedCount": capturedCount
        ])
        cameraManager.stop()
        print("[ScannerVC] 📷 Camera stopped - React Native UI now visible")
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_camera_stopped_success", detail: [
            "reactNativeUIVisible": true
        ])

        showLoading(title: "Đang gửi lên server...", subtitle: "Đang upload...")

        let treeId = coordinator?.currentTreeId ?? ""
        if !treeId.isEmpty {
            try? LocalDatabaseManager.shared.insertSavedTree(treeId: treeId)
        }

        emitEvent("onCaptureComplete", body: [
            "treeId": treeId,
            "capturedCount": coordinator?.currentCircularSessionState.capturedCount ?? 0
        ])

        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_check_network", detail: [
            "isOnline": networkMonitor.isOnline
        ])

        if networkMonitor.isOnline {
            ScannerRemoteLog.breadcrumb(phase: "scanner_vc_start_upload_begin")
            startUpload()
        } else {
            ScannerRemoteLog.breadcrumb(phase: "scanner_vc_offline_skip_upload")
            showFeedback("Sẽ gửi khi có mạng", color: .systemYellow)
            isUploadInProgress = false
            hideLoading()

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.closeTapped()
            }
        }
    }

    private func startUpload() {
        ScannerRemoteLog.breadcrumb(phase: "scanner_vc_start_upload_task_begin")

        activeUploadTask = Task { [weak self] in
            ScannerRemoteLog.breadcrumb(phase: "scanner_vc_upload_task_running")

            let result = await self?.coordinator?.syncPending()

            ScannerRemoteLog.breadcrumb(phase: "scanner_vc_upload_task_complete", detail: [
                "successCount": result?.successCount ?? 0,
                "failureCount": result?.failureCount ?? 0
            ])

            await MainActor.run {
                self?.isUploadInProgress = false
                self?.hideLoading()

                let successCount = result?.successCount ?? 0
                let failCount = result?.failureCount ?? 0

                let originalTreeId = self?.coordinator?.candidateTreeId ?? self?.coordinator?.currentTreeId ?? ""
                let uploadInfo = result?.uploadedTrees.first
                let finalTreeId = uploadInfo?.finalTreeId ?? result?.syncedTreeIds.first ?? ""
                let eventTreeId = finalTreeId.isEmpty ? originalTreeId : finalTreeId
                let lat = self?.coordinator?.currentTreeLatitude ?? 0.0
                let lng = self?.coordinator?.currentTreeLongitude ?? 0.0

                if successCount > 0, !eventTreeId.isEmpty {
                    self?.showFeedback("Đã gửi thành công \(successCount) ảnh!", color: .systemGreen)
                    self?.emitEvent("onUploadComplete", body: [
                        "success": true,
                        "count": successCount,
                        "treeId": eventTreeId,
                        "finalTreeId": eventTreeId,
                        "originalTreeId": uploadInfo?.originalTreeId ?? originalTreeId,
                        "matchedTreeId": uploadInfo?.matchedTreeId ?? NSNull(),
                        "usedExistingTree": uploadInfo?.usedExistingTree ?? false,
                        "createdNewTree": uploadInfo?.createdNewTree ?? false,
                        "latitude": lat,
                        "longitude": lng
                    ])
                } else if failCount > 0 {
                    self?.showFeedback("Chưa xác minh được cây. Ảnh vẫn lưu local.", color: .systemYellow)
                    self?.emitEvent("onUploadComplete", body: [
                        "success": false,
                        "count": 0,
                        "treeId": originalTreeId,
                        "originalTreeId": originalTreeId
                    ])
                } else {
                    // No items to upload
                    ScannerRemoteLog.breadcrumb(phase: "scanner_vc_upload_no_items")
                    self?.emitEvent("onUploadComplete", body: [
                        "success": false,
                        "count": 0,
                        "treeId": originalTreeId,
                        "originalTreeId": originalTreeId
                    ])
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                    self?.closeTapped()
                }
            }
        }
    }

    private func retryPendingUpload() {
        guard !isUploadInProgress else { return }
        Task { [weak self] in
            _ = await self?.coordinator?.syncPending()
        }
    }

    // MARK: - Loading

    private func showLoading(title: String, subtitle: String?) {
        loadingTitleLabel.text = title
        loadingSubtitleLabel.text = subtitle
        loadingOverlay.isHidden = false
    }

    private func hideLoading() {
        loadingOverlay.isHidden = true
    }

    // MARK: - Feedback

    private func showFeedback(_ message: String, color: UIColor) {
        feedbackLabel.show(message, color: color)

        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.feedbackLabel.hide()
        }
    }

    // MARK: - Actions

    @objc private func closeTapped() {
        // ✅ Check minimum threshold before closing
        let capturedCount = coordinator?.capturedSectorsCount ?? 0

        if capturedCount < Sector.minimumCapturedSectors {
            let remaining = Sector.minimumCapturedSectors - capturedCount
            let alert = UIAlertController(
                title: "Chưa đủ ảnh",
                message: "Cần chụp thêm \(remaining) sector nữa để lưu kết quả. Bạn có muốn thoát không?",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "Tiếp tục chụp", style: .default))
            alert.addAction(UIAlertAction(title: "Thoát luôn", style: .destructive) { [weak self] _ in
                self?.forceClose()
            })
            present(alert, animated: true)
            return
        }

        // ✅ Enough sectors - close normally
        forceClose()
    }

    private func forceClose() {
        coordinator?.stopCircularCapture()
        coordinator?.resetTracking()
        emitEvent("onScannerStopped", body: [:])
        dismiss(animated: true)
    }

    @objc private func skipTapped() {
        coordinator?.skipCurrentSector()
        showFeedback("Đã bỏ qua sector", color: .systemYellow)
    }

    // MARK: - Immersive

    private func setImmersiveMode() {
        setNeedsStatusBarAppearanceUpdate()
        setNeedsUpdateOfHomeIndicatorAutoHidden()
    }

    // MARK: - Event Emitter

    var onEventEmit: ((String, [String: Any]) -> Void)?

    private func emitEvent(_ name: String, body: [String: Any]) {
        onEventEmit?(name, body)
    }

    /// Values that are not finite can crash or corrupt the RN event bridge.
    private static func bridgeFinite(_ value: CGFloat) -> Double {
        let d = Double(value)
        return d.isFinite ? d : 0
    }
}

// MARK: - DetectionCoordinatorListener

extension ScannerViewController: DetectionCoordinatorListener {
    func onCircularSessionComplete() {
        handleCircularSessionComplete()
    }
}

// MARK: - LocationListener

extension ScannerViewController: LocationListener {
    func onLocationFound(location: CLLocation) {
        coordinator?.updateLocation(location)
    }

    func onLocationWait(currentAccuracy: Float) {
        print("[ScannerVC] 📍 Location accuracy: \(currentAccuracy)m")
    }
}
