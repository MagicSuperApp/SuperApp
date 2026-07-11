import UIKit
import AVFoundation
import CoreMedia
import CoreVideo
import ScannerModule

/// AVFoundation camera session manager.
/// Handles capture session, video output for real-time frame processing,
/// and photo capture for high-quality still images.
final class CameraSessionManager: NSObject {

    // MARK: - Callbacks

    /// Called for every video frame (for real-time detection).
    var onFrameCaptured: ((CVPixelBuffer, CMTime) -> Void)?

    /// Called when a high-res photo is captured.
    var onPhotoCaptured: ((Data, CGSize) -> Void)?

    /// Called when an error occurs.
    var onError: ((Error) -> Void)?

    // MARK: - Properties

    private let captureSession = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.aladin.camera.session", qos: .userInteractive)
    private let videoOutputQueue = DispatchQueue(label: "com.aladin.camera.videoOutput", qos: .userInteractive)

    private var videoDeviceInput: AVCaptureDeviceInput?
    private var videoDataOutput: AVCaptureVideoDataOutput?
    private var photoOutput: AVCapturePhotoOutput?

    private(set) var isRunning = false
    private(set) var latestDeviceOrientation: UIDeviceOrientation = .portrait

    private var didLogFirstVideoFrame = false

    /// Expose capture session for preview layer connection.
    var session: AVCaptureSession { captureSession }

    var previewLayer: AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: captureSession)
        layer.videoGravity = .resizeAspectFill
        return layer
    }

    // MARK: - Init

    override init() {
        super.init()
    }

    // MARK: - Public API

    /// Configure and start the capture session.
    func start() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            ScannerRemoteLog.breadcrumb(phase: "treereid_camera_session_start_enter", detail: [
                "inputsEmpty": self.captureSession.inputs.isEmpty,
                "wasRunning": self.captureSession.isRunning
            ])
            if self.captureSession.inputs.isEmpty {
                self.configureSession()
            }
            if !self.captureSession.isRunning {
                self.captureSession.startRunning()
            }
            self.isRunning = self.captureSession.isRunning
            ScannerRemoteLog.breadcrumb(phase: "treereid_camera_session_start_done", detail: [
                "inputCount": self.captureSession.inputs.count,
                "outputCount": self.captureSession.outputs.count,
                "isRunning": self.isRunning
            ])
        }
    }

    /// Stop the capture session.
    func stop() {
        sessionQueue.async { [weak self] in
            self?.captureSession.stopRunning()
            self?.isRunning = false
        }
    }

    /// Capture a high-res photo (called when a sector is triggered).
    /// Must dispatch to sessionQueue — AVCapturePhotoOutput.capturePhoto(with:delegate:)
    /// requires the same queue used to startRunning(); calling from any other queue crashes.
    func capturePhoto() {
        sessionQueue.async { [weak self] in
            guard let self = self else {
                ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_self_deallocated", detail: [:])
                return
            }

            ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_enter", detail: [:])

            guard let photoOutput = self.photoOutput else {
                ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_no_output", detail: [:])
                return
            }

            let settings = AVCapturePhotoSettings()
            settings.flashMode = .auto

            if photoOutput.availablePhotoCodecTypes.contains(.hevc) {
                settings.photoQualityPrioritization = .quality
            }

            ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_dispatching", detail: [:])
            photoOutput.capturePhoto(with: settings, delegate: self)
            ScannerRemoteLog.breadcrumb(phase: "treereid_capture_photo_after_capture", detail: [:])
        }
    }

    /// Request camera access (call before start).
    static func requestAccess(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    completion(granted)
                }
            }
        default:
            completion(false)
        }
    }

    // MARK: - Private

    private func configureSession() {
        ScannerRemoteLog.breadcrumb(phase: "camera_configure_begin", detail: [:])

        captureSession.beginConfiguration()

        // Quality: high for preview + photo, but keep 30fps for detection
        if captureSession.canSetSessionPreset(.high) {
            captureSession.sessionPreset = .high
        }

        // Add video device input
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            print("[CameraSessionManager] ❌ No back camera available")
            ScannerRemoteLog.breadcrumb(phase: "camera_configure_no_back_camera", detail: [:])
            captureSession.commitConfiguration()
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: videoDevice)
            if captureSession.canAddInput(input) {
                captureSession.addInput(input)
                videoDeviceInput = input
            }

            // Configure device for best detection performance
            try videoDevice.lockForConfiguration()
            if videoDevice.isFocusModeSupported(.continuousAutoFocus) {
                videoDevice.focusMode = .continuousAutoFocus
            }
            if videoDevice.isExposureModeSupported(.continuousAutoExposure) {
                videoDevice.exposureMode = .continuousAutoExposure
            }
            videoDevice.unlockForConfiguration()

        } catch {
            print("[CameraSessionManager] ❌ Failed to add video input: \(error)")
            ScannerRemoteLog.breadcrumb(phase: "camera_configure_input_error", detail: [
                "error": error.localizedDescription
            ])
            captureSession.commitConfiguration()
            return
        }

        // Add video data output (for real-time frame processing at ~30fps)
        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(self, queue: videoOutputQueue)

        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
            videoDataOutput = videoOutput

            // Set video orientation
            if let connection = videoOutput.connection(with: .video) {
                if #available(iOS 17.0, *) {
                    if connection.isVideoRotationAngleSupported(0) {
                        connection.videoRotationAngle = 0
                    }
                } else {
                    if connection.isVideoOrientationSupported {
                        connection.videoOrientation = .portrait
                    }
                }
                if connection.isVideoMirroringSupported {
                    connection.isVideoMirrored = false
                }
            }
        }

        // Add photo output (for high-res captures)
        let photo = AVCapturePhotoOutput()
        if #available(iOS 17.0, *) {
            // maxPhotoDimensions replaces the deprecated isHighResolutionCaptureEnabled
            // Leave at default (zero = use device native maximum)
        } else {
            photo.isHighResolutionCaptureEnabled = true
        }
        // CRITICAL: must raise maxPhotoQualityPrioritization to .quality BEFORE any
        // capture requests .quality. The default is .balanced; requesting a higher
        // priority in AVCapturePhotoSettings than this max throws NSInvalidArgumentException
        // synchronously inside capturePhoto(with:delegate:) → hard crash.
        photo.maxPhotoQualityPrioritization = .quality

        if captureSession.canAddOutput(photo) {
            captureSession.addOutput(photo)
            photoOutput = photo
        }

        captureSession.commitConfiguration()
        print("[CameraSessionManager] ✅ Session configured")
        ScannerRemoteLog.breadcrumb(phase: "camera_configure_committed", detail: [
            "inputCount": captureSession.inputs.count,
            "outputCount": captureSession.outputs.count
        ])
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension CameraSessionManager: AVCaptureVideoDataOutputSampleBufferDelegate {

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        if !didLogFirstVideoFrame {
            didLogFirstVideoFrame = true
            ScannerRemoteLog.breadcrumb(phase: "camera_first_frame_delivered", detail: [
                "pixelFormat": CVPixelBufferGetPixelFormatType(pixelBuffer)
            ])
        }

        // Notify frame for YOLO detection (async on videoOutputQueue)
        onFrameCaptured?(pixelBuffer, timestamp)
    }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension CameraSessionManager: AVCapturePhotoCaptureDelegate {

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        // This delegate callback fires on the sessionQueue (background).
        // Log immediately before doing any work.
        ScannerRemoteLog.breadcrumb(phase: "treereid_photo_output_callback", detail: [
            "hasError": error != nil,
            "errorMsg": error?.localizedDescription ?? "none"
        ])

        if let error = error {
            print("[CameraSessionManager] ❌ Photo capture error: \(error)")
            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_output_error", detail: [
                "error": error.localizedDescription
            ])
            // Invoke onError synchronously — caller handles thread safety if needed.
            // Keep it on the callback's original queue (sessionQueue) to avoid
            // synchronous dispatch back to main which can deadlock with Firebase Auth.
            self.onError?(error)
            return
        }

        guard let imageData = photo.fileDataRepresentation() else {
            print("[CameraSessionManager] ❌ Failed to get photo data")
            ScannerRemoteLog.breadcrumb(phase: "treereid_photo_output_no_data", detail: [:])
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "treereid_photo_output_data_ok", detail: [
            "dataSize": imageData.count
        ])

        let size = CGSize(
            width: CGFloat(photo.resolvedSettings.photoDimensions.width),
            height: CGFloat(photo.resolvedSettings.photoDimensions.height)
        )

        print("[CameraSessionManager] 📸 Photo captured: \(size.width)x\(size.height), \(imageData.count) bytes")
        // Invoke onPhotoCaptured synchronously on sessionQueue (background).
        // The caller (TreeReIDBridgeModule) dispatches to main for RCTEventEmitter.
        self.onPhotoCaptured?(imageData, size)
    }
}
