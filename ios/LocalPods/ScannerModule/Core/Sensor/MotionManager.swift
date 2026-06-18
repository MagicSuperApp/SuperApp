import Foundation
import CoreMotion
import CoreLocation

/// Motion manager for tracking device heading and accelerometer data.
/// Matches Android SensorDataCollector.kt + SensorTriggerManager.kt.
///
/// Used by CircularCaptureManager to track camera rotation around a tree.
final class MotionManager: NSObject {

    // MARK: - Current Snapshot

    struct SensorSnapshot: Sendable {
        var heading: Double?           // Compass heading (0-360°)
        var pitch: Double?            // Device pitch (-180 to 180°)
        var roll: Double?            // Device roll (-180 to 180°)
        var accelX: Double?           // Accelerometer X
        var accelY: Double?           // Accelerometer Y
        var accelZ: Double?           // Accelerometer Z
        var timestamp: TimeInterval
    }

    // MARK: - Callbacks

    var onShakeDetected: ((Float) -> Void)?    // Called when device is shaken
    var onMovementStopped: (() -> Void)?
    var onHeadingUpdated: ((Double) -> Void)?

    // MARK: - Properties

    private let motionManager = CMMotionManager()
    private let locationManager = CLLocationManager()
    private var latestSnapshot = SensorSnapshot(timestamp: 0)
    private var lastSignificantMovement: TimeInterval = 0
    private var isMoving = false

    private(set) var isRunning = false

    // MARK: - Public API

    /// Start motion and location tracking.
    func start() {
        guard !isRunning else { return }

        startDeviceMotion()
        startLocationManager()

        isRunning = true
        print("[MotionManager] ✅ Started — heading + accel tracking active")
    }

    /// Stop all motion tracking.
    func stop() {
        motionManager.stopDeviceMotionUpdates()
        motionManager.stopAccelerometerUpdates()
        locationManager.stopUpdatingHeading()
        isRunning = false
        print("[MotionManager] 🛑 Stopped")
    }

    /// Get current sensor snapshot (read-only copy).
    func getSnapshot() -> SensorSnapshot {
        return latestSnapshot
    }

    // MARK: - Private: Device Motion

    private func startDeviceMotion() {
        guard motionManager.isDeviceMotionAvailable else {
            print("[MotionManager] ⚠️ Device motion not available")
            return
        }

        // Update at 50Hz — fast enough for circular capture tracking
        motionManager.deviceMotionUpdateInterval = 1.0 / 50.0

        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion else { return }

            let accelX = motion.gravity.x * 9.81
            let accelY = motion.gravity.y * 9.81
            let accelZ = motion.gravity.z * 9.81

            // Calculate magnitude of gravity-free acceleration
            let accelMag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)

            let pitch = motion.attitude.pitch * 180.0 / .pi
            let roll  = motion.attitude.roll  * 180.0 / .pi

            self.latestSnapshot = SensorSnapshot(
                heading: self.latestSnapshot.heading,
                pitch: pitch,
                roll: roll,
                accelX: accelX,
                accelY: accelY,
                accelZ: accelZ,
                timestamp: Date().timeIntervalSince1970
            )

            // Shake detection
            if accelMag > Double(ScannerConfig.sensorShakeThreshold) {
                self.onShakeDetected?(Float(accelMag))
            }

            // Movement stopped detection
            let now = Date().timeIntervalSince1970
            if accelMag > Double(ScannerConfig.sensorMovementThreshold) {
                self.lastSignificantMovement = now
                if !self.isMoving {
                    self.isMoving = true
                }
            } else if self.isMoving && (now - self.lastSignificantMovement) > 3.0 {
                self.isMoving = false
                self.onMovementStopped?()
            }
        }
    }

    // MARK: - Private: Location (Heading)

    private func startLocationManager() {
        locationManager.delegate = self
        locationManager.headingFilter = 1.0  // Update every 1° change
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingHeading()
    }
}

// MARK: - CLLocationManagerDelegate

extension MotionManager: CLLocationManagerDelegate {

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading

        latestSnapshot.heading = heading
        onHeadingUpdated?(heading)

        if newHeading.headingAccuracy < 0 {
            print("[MotionManager] ⚠️ Heading accuracy negative: \(newHeading.headingAccuracy)")
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        return true
    }
}