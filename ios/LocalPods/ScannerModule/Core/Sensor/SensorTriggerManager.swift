import Foundation

/// Listener callbacks for sensor trigger events.
/// Mirrors Android SensorTriggerManager.TriggerListener.
protocol SensorTriggerListener: AnyObject {
    /// Called when the device is shaken.
    /// - Parameter intensity: The acceleration magnitude in m/s².
    func onShakeDetected(intensity: Float)
    /// Called when a cutting action pattern is detected.
    func onCuttingActionDetected()
    /// Called when device movement has stopped (2+ seconds of stillness).
    func onMovementStopped()
}

/// Manages accelerometer-based trigger detection:
///   - Shake detection with history buffer
///   - Cutting pattern detection (rapid oscillation detection)
///   - Movement-stopped detection
///
/// This class is separate from MotionManager to keep concerns isolated.
/// MotionManager provides heading/sensor fusion; this class analyses
/// raw accelerometer for trigger events.
/// Mirrors Android SensorTriggerManager.kt exactly.
final class SensorTriggerManager {

    // MARK: - Properties

    private var listener: SensorTriggerListener?

    // Shake detection
    private var shakeHistory: [Float] = []
    private let maxShakeHistory = 5
    private var lastShakeTimeMs: Int64 = 0
    private let shakeCooldownMs: Int64 = 500

    // Cutting pattern detection
    private var cuttingPatternBuffer: [Float] = []
    private let maxCuttingBuffer = 10
    private var isDetectingCutting = false

    // Movement stopped detection
    private var lastSignificantMovementMs: Int64 = 0
    private let movementStoppedThresholdMs: Int64 = 2000

    // Enable/disable
    private var isEnabled = false

    // MARK: - Init

    init(listener: SensorTriggerListener? = nil) {
        self.listener = listener
    }

    // MARK: - Public API

    /// Set the listener for trigger events.
    func setListener(_ listener: SensorTriggerListener?) {
        self.listener = listener
    }

    /// Start listening for accelerometer events.
    func start() {
        guard !isEnabled else { return }
        isEnabled = true
        print("[SensorTriggerManager] ✅ Started")
    }

    /// Stop listening for accelerometer events.
    func stop() {
        guard isEnabled else { return }
        isEnabled = false
        shakeHistory.removeAll()
        cuttingPatternBuffer.removeAll()
        print("[SensorTriggerManager] 🛑 Stopped")
    }

    /// Feed a new accelerometer sample.
    /// Call this from the motion update loop (e.g. from MotionManager or directly).
    /// - Parameters:
    ///   - x: X-axis acceleration (m/s²)
    ///   - y: Y-axis acceleration (m/s²)
    ///   - z: Z-axis acceleration (m/s²)
    func feed(x: Float, y: Float, z: Float) {
        guard isEnabled else { return }

        let delta = accelerationDelta(x: x, y: y, z: z)

        // Movement tracking
        if delta > ScannerConfig.sensorMovementThreshold {
            lastSignificantMovementMs = currentTimeMs()
        }

        // Shake detection
        if delta > ScannerConfig.sensorShakeThreshold {
            detectShake(delta: delta)
        }

        // Cutting pattern detection
        detectCuttingPattern(delta: delta)

        // Movement stopped check
        checkMovementStopped()
    }

    /// Convenience: feed a single accelerometer magnitude.
    /// Use when only magnitude is available (not all 3 axes).
    func feedMagnitude(_ magnitude: Float) {
        guard isEnabled else { return }

        if magnitude > ScannerConfig.sensorMovementThreshold {
            lastSignificantMovementMs = currentTimeMs()
        }

        if magnitude > ScannerConfig.sensorShakeThreshold {
            detectShake(delta: magnitude)
        }

        detectCuttingPattern(delta: magnitude)
        checkMovementStopped()
    }

    // MARK: - Private: Shake Detection

    /// Detect device shake.
    /// Uses a history buffer and cooldown to avoid triggering too frequently.
    private func detectShake(delta: Float) {
        let now = currentTimeMs()

        // Cooldown: don't trigger more than once per 500ms
        if now - lastShakeTimeMs < shakeCooldownMs {
            return
        }

        lastShakeTimeMs = now

        // Keep history of last N shake intensities
        shakeHistory.append(delta)
        if shakeHistory.count > maxShakeHistory {
            shakeHistory.removeFirst()
        }

        print("[SensorTriggerManager] ⚡ Shake detected: intensity=\(delta)")
        listener?.onShakeDetected(intensity: delta)
    }

    // MARK: - Private: Cutting Pattern Detection

    /// Detect rapid cutting action pattern.
    /// Pattern: 8+ samples where the average of the first 4 vs last 4
    /// differs by > 50% (indicates a cutting motion).
    private func detectCuttingPattern(delta: Float) {
        guard delta > ScannerConfig.sensorCuttingPatternThreshold else {
            // Reset buffer if there's no significant movement for a while
            if !cuttingPatternBuffer.isEmpty && delta < ScannerConfig.sensorMovementThreshold * 0.5 {
                // Don't clear — let buffer grow and compare
            }
            return
        }

        cuttingPatternBuffer.append(delta)

        // Keep buffer bounded
        if cuttingPatternBuffer.count > maxCuttingBuffer {
            cuttingPatternBuffer.removeFirst()
        }

        // Need at least 8 samples to evaluate pattern
        guard cuttingPatternBuffer.count >= 8, !isDetectingCutting else { return }

        isDetectingCutting = true

        // Split into first 4 and last 4
        let first4 = Array(cuttingPatternBuffer.prefix(4))
        let last4 = Array(cuttingPatternBuffer.suffix(4))

        let firstAvg = first4.reduce(0, +) / Float(first4.count)
        let lastAvg = last4.reduce(0, +) / Float(last4.count)

        let ratio = abs(firstAvg - lastAvg) / ((firstAvg + lastAvg) / 2)

        print("[SensorTriggerManager] 🔪 Cutting pattern: first4=\(firstAvg), last4=\(lastAvg), ratio=\(ratio)")

        if ratio > 0.5 {
            print("[SensorTriggerManager] 🔪 Cutting action DETECTED")
            cuttingPatternBuffer.removeAll()
            isDetectingCutting = false
            listener?.onCuttingActionDetected()
            return
        }

        isDetectingCutting = false
    }

    // MARK: - Private: Movement Stopped

    /// Check if device has been still for the threshold duration.
    private func checkMovementStopped() {
        let elapsed = currentTimeMs() - lastSignificantMovementMs

        // Fire exactly once in the 2000-2499ms window after stillness began
        if elapsed >= 2000 && elapsed < 2500 {
            listener?.onMovementStopped()
        }
    }

    // MARK: - Private Helpers

    /// Compute acceleration delta (magnitude of change) from last sample.
    private var lastX: Float = 0
    private var lastY: Float = 0
    private var lastZ: Float = 0

    private func accelerationDelta(x: Float, y: Float, z: Float) -> Float {
        let dx = abs(x - lastX)
        let dy = abs(y - lastY)
        let dz = abs(z - lastZ)

        lastX = x; lastY = y; lastZ = z

        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    private func currentTimeMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}