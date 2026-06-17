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

            // Use current heading (may be nil if location not ready)
            let heading = self.lastEmittedHeading ?? 0

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

    private func processSensorUpdate(heading: Double, pitch: Double, roll: Double) {
        let timestamp = Date().timeIntervalSince1970

        // Calculate delta from last captured position
        var deltaHeading: Double? = nil
        var deltaPitch: Double? = nil

        if let lastH = lastCapturedHeading {
            deltaHeading = normalizeAngle(heading - lastH)
        }
        if let lastP = lastCapturedPitch {
            deltaPitch = pitch - lastP
        }

        // Check if should capture
        let shouldCapture = checkCaptureTrigger(
            deltaHeading: deltaHeading,
            deltaPitch: deltaPitch,
            currentHeading: heading,
            currentPitch: pitch
        )

        // Emit update
        let update = SensorUpdate(
            heading: heading,
            pitch: pitch,
            roll: roll,
            deltaHeading: deltaHeading,
            deltaPitch: deltaPitch,
            shouldCapture: shouldCapture,
            timestamp: timestamp
        )

        onSensorUpdate?(update)

        // Update last emitted values
        lastEmittedHeading = heading
        lastEmittedPitch = pitch

        // If should capture, trigger and update last captured
        if shouldCapture {
            ScannerRemoteLog.breadcrumb(phase: "heading_capture_triggered", detail: [
                "heading": heading,
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
        currentHeading: Double,
        currentPitch: Double
    ) -> Bool {
        // Initialize on first valid reading (from both sensors)
        if lastCapturedHeading == nil {
            lastCapturedHeading = currentHeading
        }
        if lastCapturedPitch == nil {
            lastCapturedPitch = currentPitch
        }

        // Check heading delta (|Δheading| >= 25°)
        if let deltaH = deltaHeading, abs(deltaH) >= TreeReIDConfig.minHeadingDelta {
            return true
        }

        // Check pitch delta (|Δpitch| >= 18°)
        if let deltaP = deltaPitch, abs(deltaP) >= TreeReIDConfig.minPitchDelta {
            return true
        }

        return false
    }

    private func triggerCapture(heading: Double, pitch: Double) {
        print("[HeadingCaptureManager] 📸 Capture triggered — heading: \(Int(heading))°, pitch: \(Int(pitch))°")

        // Update last captured position
        lastCapturedHeading = heading
        lastCapturedPitch = pitch

        // Notify via callback
        onCaptureTriggered?(heading, pitch)
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
        // Prefer true heading, fall back to magnetic
        let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading

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

        if newHeading.headingAccuracy < 0 {
            print("[HeadingCaptureManager] ⚠️ Heading accuracy negative: \(newHeading.headingAccuracy)")
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        return true
    }
}