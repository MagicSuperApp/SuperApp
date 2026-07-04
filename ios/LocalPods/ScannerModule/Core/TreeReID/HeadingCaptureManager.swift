import Foundation
import CoreMotion
import CoreLocation
import ScannerModule

/// Heading capture manager for TreeReID - tracks heading/pitch changes and triggers capture.
///
/// Based on MotionManager.swift but specialized for TreeReID capture-by-heading protocol:
/// - Only capture when |Δheading| ≥ 25° OR |Δpitch| ≥ 18°
/// - Normalize angle changes (handle 360° wrap-around)
/// - Emit events via ScannerBridgeModule for JS subscription
final class HeadingCaptureManager: NSObject {

    // MARK: - Types

    struct SensorUpdate {
        let heading: Double
        let pitch: Double
        let roll: Double
        let deltaHeading: Double?
        let deltaPitch: Double?
        let shouldCapture: Bool
        let timestamp: TimeInterval
    }

    // MARK: - Callbacks

    var onSensorUpdate: ((SensorUpdate) -> Void)?
    var onCaptureTriggered: ((Double, Double) -> Void)?  // heading, pitch at trigger time

    // MARK: - Properties

    private let motionManager = CMMotionManager()
    private let locationManager = CLLocationManager()

    private var lastCapturedHeading: Double?
    private var lastCapturedPitch: Double?
    private var lastEmittedHeading: Double?
    private var lastEmittedPitch: Double?

    // Chỉ true khi la-bàn đã cho hướng THẬT (didUpdateHeading). Trước đó KHÔNG tính
    // Δheading để tránh seed hướng tạm = 0 → khi hướng thật (vd 210°) nhảy vào bị coi
    // là "đã xoay 210°" và chụp oan ngay lúc bấm Bắt đầu (Lỗi field #1).
    private var hasRealHeading = false

    // Stillness (Lỗi field #2): mẫu frame trước để tính tốc-độ xoay tức-thời + đếm số
    // frame đứng-yên liên-tiếp. Chỉ cho chụp khi ĐỦ GÓC và đang đứng yên (tay đã dừng).
    private var prevSampleHeading: Double?
    private var prevSamplePitch: Double?
    private var steadyFrames = 0

    private(set) var isRunning = false

    // MARK: - Public API

    /// Start heading and pitch tracking.
    func start() {
        guard !isRunning else {
            ScannerRemoteLog.breadcrumb(phase: "heading_start_skipped_already_running", detail: [:])
            return
        }

        ScannerRemoteLog.breadcrumb(phase: "heading_start_enter", detail: [
            "isDeviceMotionAvailable": motionManager.isDeviceMotionAvailable
        ])
        startDeviceMotion()
        startLocationManager()
        isRunning = true
        ScannerRemoteLog.breadcrumb(phase: "heading_start_done", detail: [:])
        print("[HeadingCaptureManager] ✅ Started — capture-by-heading active")
    }

    /// Stop all tracking.
    func stop() {
        ScannerRemoteLog.breadcrumb(phase: "heading_stop", detail: ["wasRunning": isRunning])
        motionManager.stopDeviceMotionUpdates()
        locationManager.stopUpdatingHeading()
        isRunning = false
        print("[HeadingCaptureManager] 🛑 Stopped")
    }

    /// Reset capture state (call when starting new capture session).
    func reset() {
        ScannerRemoteLog.breadcrumb(phase: "heading_reset", detail: [
            "lastCapturedHeading": lastCapturedHeading as Any,
            "lastCapturedPitch": lastCapturedPitch as Any
        ])
        lastCapturedHeading = nil
        lastCapturedPitch = nil
        lastEmittedHeading = nil
        lastEmittedPitch = nil
        hasRealHeading = false
        prevSampleHeading = nil
        prevSamplePitch = nil
        steadyFrames = 0
        print("[HeadingCaptureManager] 🔄 Reset capture state")
    }

    /// Get current sensor values without triggering capture.
    func getCurrentValues() -> (heading: Double?, pitch: Double?) {
        return (lastEmittedHeading, lastEmittedPitch)
    }

    // MARK: - Private: Device Motion (Pitch/Roll)

    private func startDeviceMotion() {
        guard motionManager.isDeviceMotionAvailable else {
            print("[HeadingCaptureManager] ⚠️ Device motion not available")
            return
        }

        // Update at 50Hz for smooth tracking
        motionManager.deviceMotionUpdateInterval = 1.0 / TreeReIDConfig.sensorUpdateHz

        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion else { return }

            // Get pitch and roll from attitude
            let pitch = motion.attitude.pitch * 180.0 / .pi
            let roll = motion.attitude.roll * 180.0 / .pi

            // Chỉ truyền heading khi ĐÃ có số la-bàn thật; chưa có thì nil (không seed 0 giả).
            let heading: Double? = self.hasRealHeading ? self.lastEmittedHeading : nil

            self.processSensorUpdate(heading: heading, pitch: pitch, roll: roll)
        }
    }

    // MARK: - Private: Location (Heading)

    private func startLocationManager() {
        locationManager.delegate = self
        locationManager.headingFilter = TreeReIDConfig.headingFilterDegrees
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingHeading()
    }

    // MARK: - Private: Sensor Processing

    private func processSensorUpdate(heading: Double?, pitch: Double, roll: Double) {
        let timestamp = Date().timeIntervalSince1970

        // Calculate delta from last captured position
        var deltaHeading: Double? = nil
        var deltaPitch: Double? = nil

        // Δheading chỉ tính khi CẢ mốc lẫn hướng hiện tại đều là số thật.
        if let lastH = lastCapturedHeading, let h = heading {
            deltaHeading = normalizeAngle(h - lastH)
        }
        if let lastP = lastCapturedPitch {
            deltaPitch = pitch - lastP
        }

        // Stillness (Lỗi field #2): tốc-độ xoay tức-thời (frame-to-frame). Đếm số frame
        // đứng-yên liên-tiếp — chỉ cho chụp khi tay đã DỪNG (ảnh nét, không trùng).
        var instRate = Double.greatestFiniteMagnitude
        if let pPitch = prevSamplePitch {
            var rate = abs(pitch - pPitch)
            if let h = heading, let pHeading = prevSampleHeading {
                rate += abs(normalizeAngle(h - pHeading))
            }
            instRate = rate
        }
        if instRate <= TreeReIDConfig.steadyRateThreshold {
            steadyFrames += 1
        } else {
            steadyFrames = 0
        }
        let isSteady = steadyFrames >= TreeReIDConfig.steadyFramesRequired
        prevSamplePitch = pitch
        if let h = heading { prevSampleHeading = h }

        // Check if should capture (phải đủ GÓC và đang ĐỨNG YÊN)
        let shouldCapture = checkCaptureTrigger(
            deltaHeading: deltaHeading,
            deltaPitch: deltaPitch,
            currentHeading: heading,
            currentPitch: pitch,
            isSteady: isSteady
        )

        // Emit update (heading hiển thị: dùng số thật gần nhất nếu chưa có)
        let update = SensorUpdate(
            heading: heading ?? lastEmittedHeading ?? 0,
            pitch: pitch,
            roll: roll,
            deltaHeading: deltaHeading,
            deltaPitch: deltaPitch,
            shouldCapture: shouldCapture,
            timestamp: timestamp
        )

        onSensorUpdate?(update)

        // lastEmittedHeading do didUpdateHeading (la-bàn thật) sở hữu — KHÔNG ghi đè ở đây.
        lastEmittedPitch = pitch

        // If should capture, trigger and update last captured
        if shouldCapture {
            ScannerRemoteLog.breadcrumb(phase: "heading_capture_triggered", detail: [
                "heading": heading as Any,
                "pitch": pitch,
                "deltaHeading": deltaHeading as Any,
                "deltaPitch": deltaPitch as Any
            ])
            triggerCapture(heading: heading, pitch: pitch)
        }
    }

    private func checkCaptureTrigger(
        deltaHeading: Double?,
        deltaPitch: Double?,
        currentHeading: Double?,
        currentPitch: Double,
        isSteady: Bool
    ) -> Bool {
        // Chỉ seed mốc heading khi CÓ hướng la-bàn thật (đừng seed 0 giả → tránh chụp oan).
        if lastCapturedHeading == nil, let h = currentHeading {
            lastCapturedHeading = h
        }
        if lastCapturedPitch == nil {
            lastCapturedPitch = currentPitch
        }

        // Đủ GÓC? (|Δheading| >= 25° HOẶC |Δpitch| >= 18°)
        let angleMet =
            (deltaHeading.map { abs($0) >= TreeReIDConfig.minHeadingDelta } ?? false) ||
            (deltaPitch.map { abs($0) >= TreeReIDConfig.minPitchDelta } ?? false)

        // Đủ góc nhưng đang lia máy → HOÃN chụp tới khi đứng yên (chống ảnh nhoè/trùng #2).
        if angleMet && !isSteady {
            ScannerRemoteLog.breadcrumb(phase: "capture_deferred_moving", detail: [
                "steadyFrames": steadyFrames
            ])
            return false
        }

        return angleMet && isSteady
    }

    private func triggerCapture(heading: Double?, pitch: Double) {
        let headingForCb = heading ?? lastEmittedHeading ?? 0
        print("[HeadingCaptureManager] 📸 Capture triggered — heading: \(Int(headingForCb))°, pitch: \(Int(pitch))°")

        // Cập nhật mốc: heading chỉ cập nhật khi là số thật (giữ nil nếu chưa có la-bàn).
        if let h = heading { lastCapturedHeading = h }
        lastCapturedPitch = pitch

        // Notify via callback
        onCaptureTriggered?(headingForCb, pitch)
    }

    /// Normalize angle to range [-180, 180]
    private func normalizeAngle(_ angle: Double) -> Double {
        var normalized = angle.truncatingRemainder(dividingBy: 360)
        if normalized > 180 {
            normalized -= 360
        } else if normalized < -180 {
            normalized += 360
        }
        return normalized
    }
}

// MARK: - CLLocationManagerDelegate

extension HeadingCaptureManager: CLLocationManagerDelegate {

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // Bỏ reading không đáng tin (accuracy < 0) — KHÔNG coi là có hướng thật.
        guard newHeading.headingAccuracy >= 0 else {
            print("[HeadingCaptureManager] ⚠️ Heading accuracy negative: \(newHeading.headingAccuracy)")
            return
        }

        // Prefer true heading, fall back to magnetic
        let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading

        // Từ đây đã có hướng la-bàn THẬT → cho phép tính Δheading (Lỗi field #1).
        hasRealHeading = true

        // Only emit if we have a significant change or first reading
        let shouldEmit = lastEmittedHeading == nil || abs(heading - (lastEmittedHeading ?? 0)) >= 1.0

        if shouldEmit {
            lastEmittedHeading = heading

            // If motion data is already running, it will pick up the new heading
            // Otherwise, process here
            if !motionManager.isDeviceMotionActive {
                // Process with current pitch/roll
                let pitch = lastEmittedPitch ?? 0
                let roll: Double = 0
                processSensorUpdate(heading: heading, pitch: pitch, roll: roll)
            }
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        return true
    }
}