import Foundation

/// Tracks stable detections over time — matches Android DetectionTracker.kt.
final class DetectionTracker {

    struct StableDetection {
        let detection: YOLODetection
        let confirmCount: Int
        let frameIndex: Int
        let smoothedBox: CGRect  // Add smoothed box
    }

    // MARK: - Properties

    private var trackingMap: [String: (detection: YOLODetection, count: Int, frame: Int, smoothedBox: CGRect)] = [:]
    private var currentFrame = 0
    private let stableThreshold: Int
    private let trackingIOU: Float
    private let smoothingAlpha: Float  // Smoothing factor (0.3 = 30% new, 70% old)

    init(stableThreshold: Int = ScannerConfig.processingStabilityFrames,
         trackingIOU: Float = ScannerConfig.sameTreeIOUThreshold,
         smoothingAlpha: Float = ScannerConfig.boxSmoothingAlpha) {
        self.stableThreshold = stableThreshold
        self.trackingIOU = trackingIOU
        self.smoothingAlpha = smoothingAlpha
    }

    // MARK: - Public API

    /// Track new frame detections. Calls onConfirmed for detections that become stable.
    func track(_ detections: [YOLODetection], onConfirmed: (StableDetection) -> Void) {
        currentFrame += 1

        // Match each new detection to existing trackers
        var matched = Set<String>()

        for det in detections {
            if let existingKey = findMatchingTracker(det, existingKeys: matched) {
                // Update existing tracker with smoothing
                let entry = trackingMap[existingKey]!
                let newCount = entry.count + 1

                // Apply exponential moving average smoothing (matches Android)
                let smoothed = smoothBox(current: entry.smoothedBox, new: det.rect)

                // Create smoothed detection
                var smoothedDet = det
                smoothedDet.rect = smoothed

                trackingMap[existingKey] = (smoothedDet, newCount, currentFrame, smoothed)
                matched.insert(existingKey)

                // Check if just became stable
                if newCount == stableThreshold {
                    onConfirmed(StableDetection(
                        detection: smoothedDet,
                        confirmCount: newCount,
                        frameIndex: currentFrame,
                        smoothedBox: smoothed
                    ))
                }
            } else {
                // New tracker - initialize with current box
                let key = UUID().uuidString
                trackingMap[key] = (det, 1, currentFrame, det.rect)
                matched.insert(key)
            }
        }

        // Age out trackers that haven't been seen recently
        let staleThreshold = currentFrame - (stableThreshold * 3)
        trackingMap = trackingMap.filter { $0.value.frame >= staleThreshold }
    }

    /// Get all currently stable detections.
    func getAll() -> [StableDetection] {
        return trackingMap
            .filter { $0.value.count >= stableThreshold }
            .map { StableDetection(
                detection: $0.value.detection,
                confirmCount: $0.value.count,
                frameIndex: $0.value.frame,
                smoothedBox: $0.value.smoothedBox
            )}
    }

    /// Clear all trackers.
    func clear() {
        trackingMap.removeAll()
        currentFrame = 0
    }

    // MARK: - Private

    /// Apply exponential moving average smoothing to bounding box (matches Android).
    private func smoothBox(current: CGRect, new: CGRect) -> CGRect {
        let alpha = CGFloat(smoothingAlpha)
        return CGRect(
            x: current.origin.x * (1 - alpha) + new.origin.x * alpha,
            y: current.origin.y * (1 - alpha) + new.origin.y * alpha,
            width: current.size.width * (1 - alpha) + new.size.width * alpha,
            height: current.size.height * (1 - alpha) + new.size.height * alpha
        )
    }

    private func matchDetection(_ detection: YOLODetection) -> String {
        // Find a matching tracker via IoU — matches Kotlin's matchDetection()
        let nms = NMSHelper()
        for (key, entry) in trackingMap {
            let iou = nms.calculateIoU(entry.detection.rect, detection.rect)
            if iou > trackingIOU {
                return key
            }
        }
        return "" // no match — will be treated as new detection
    }

    private func findMatchingTracker(_ detection: YOLODetection, existingKeys: Set<String>) -> String? {
        // Find a matching tracker via IoU, excluding keys already matched this frame
        let nms = NMSHelper()
        for (key, entry) in trackingMap {
            if existingKeys.contains(key) { continue }
            let iou = nms.calculateIoU(entry.detection.rect, detection.rect)
            if iou > trackingIOU {
                return key
            }
        }
        return nil
    }
}
