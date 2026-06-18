import Foundation

/// Accelerometer stability sampler.
/// Matches Android StabilitySampler.kt — waits for camera to be stable
/// before triggering a capture.
final class StabilitySampler {

    // MARK: - Properties

    private var magnitudeBuffer: [Float] = []
    private let windowSize: Int
    private let stableThreshold: Float
    private var consecutiveStableFrames = 0
    private var lastCheckTime: TimeInterval = 0
    private let stableFrameThreshold: Int

    var isStable: Bool {
        guard magnitudeBuffer.count >= windowSize else { return false }
        return calculateVariance() < stableThreshold && consecutiveStableFrames >= stableFrameThreshold
    }

    // MARK: - Init

    init(stableFrameThreshold: Int = ScannerConfig.blurStableFrames,
         windowSize: Int = 15,
         stableThreshold: Float = 50.0) {
        self.stableFrameThreshold = stableFrameThreshold
        self.windowSize = windowSize
        self.stableThreshold = stableThreshold
    }

    // MARK: - Public API

    /// Feed a new accelerometer sample. Returns true when stable.
    func feed(accelX: Double, accelY: Double, accelZ: Double) -> Bool {
        let magnitude = Float(sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ))

        // Add to buffer
        if magnitudeBuffer.count >= windowSize {
            magnitudeBuffer.removeFirst()
        }
        magnitudeBuffer.append(magnitude)

        // Check stability using variance
        let variance = calculateVariance()
        let stable = magnitudeBuffer.count >= windowSize && variance < stableThreshold

        if stable {
            consecutiveStableFrames += 1
        } else {
            consecutiveStableFrames = 0
        }

        // Log for debugging
        if magnitudeBuffer.count >= windowSize {
            ScannerRemoteLog.breadcrumb(phase: "stability_sampler_check", detail: [
                "variance": String(format: "%.2f", variance),
                "threshold": String(format: "%.2f", stableThreshold),
                "bufferSize": magnitudeBuffer.count,
                "consecutiveStable": consecutiveStableFrames,
                "isStable": isStable,
                "magnitude": String(format: "%.3f", magnitude)
            ])
        }

        lastCheckTime = Date().timeIntervalSince1970
        return isStable
    }

    /// Reset stability counter.
    func reset() {
        consecutiveStableFrames = 0
        magnitudeBuffer.removeAll()
    }

    /// Check if device has been stable for a specific duration (in seconds).
    func hasBeenStable(since duration: TimeInterval) -> Bool {
        guard isStable else { return false }
        return (Date().timeIntervalSince1970 - lastCheckTime) >= duration
    }

    // MARK: - Private

    /// Calculate variance of magnitude in window.
    /// Low variance = acceleration doesn't change much = stable.
    private func calculateVariance() -> Float {
        guard magnitudeBuffer.count >= 2 else { return Float.greatestFiniteMagnitude }

        let n = Float(magnitudeBuffer.count)
        let mean = magnitudeBuffer.reduce(0, +) / n

        var sumSquaredDiff: Float = 0
        for m in magnitudeBuffer {
            let diff = m - mean
            sumSquaredDiff += diff * diff
        }

        return sumSquaredDiff / n
    }
}