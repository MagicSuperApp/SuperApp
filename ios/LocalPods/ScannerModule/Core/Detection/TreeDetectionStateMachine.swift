import Foundation
import CoreGraphics

// MARK: - State

/// Tree detection state machine states.
/// Mirrors Android TreeDetectionStateMachine.kt States.
enum TreeDetectionState: Equatable {
    case searching
    case treeDetected
    case processing
    case sending
    case cooldown
}

// MARK: - Action

/// Actions emitted by the state machine when transitioning.
enum TreeDetectionAction {
    /// Trigger processing for a detected tree.
    case process(detection: SegmentationDetection)
    /// Enter cooldown for a given duration (milliseconds).
    case cooldown(durationMs: Int64)
    /// Resume searching after cooldown.
    case resumeSearching
}

// MARK: - Extensions on Array

/// Find the first valid detection that meets confidence threshold.
/// Accepts any class (tree: Trunk/Branch, fruit: Durian, etc.)
/// Mirrors Android findValidTreeDetection() extension.
private func findValidTreeDetection(
    from detections: [SegmentationDetection],
    threshold: Float
) -> SegmentationDetection? {
    for det in detections {
        // Accept any detection with sufficient confidence
        // (model-specific classes are already validated by YOLO runner)
        if det.confidence >= threshold {
            return det
        }
    }
    return nil
}

/// Check if the list contains a detection similar to the given one (same label + IoU > threshold).
/// Mirrors Android containsSimilarDetection() extension.
private func containsSimilarDetection(
    _ detections: [SegmentationDetection],
    to detection: SegmentationDetection,
    iouThreshold: Float
) -> Bool {
    for det in detections {
        guard det.label == detection.label else { continue }
        let iou = calculateIoU(det.boundingBox, detection.boundingBox)
        if iou > iouThreshold {
            return true
        }
    }
    return false
}

/// Compute Intersection over Union of two CGRect-like bounding boxes.
private func calculateIoU(_ a: CGRect, _ b: CGRect) -> Float {
    let interX = max(0, min(a.maxX, b.maxX) - max(a.minX, b.minX))
    let interY = max(0, min(a.maxY, b.maxY) - max(a.minY, b.minY))
    let interArea = interX * interY
    let unionArea = a.width * a.height + b.width * b.height - interArea
    guard unionArea > 0 else { return 0 }
    return Float(interArea / unionArea)
}

// MARK: - TreeDetectionStateMachine

/// State machine that manages the tree detection workflow.
///
/// State transitions:
/// ```
/// Searching ──(stable detection)──▶ TreeDetected
/// TreeDetected ──(still similar)──▶ Processing
/// Processing ───────────────────────▶ Sending
/// Sending ──────────────────────────▶ Cooldown
/// Cooldown ─────────────────────────▶ Searching
/// ```
///
/// When paused, the state machine ignores all detections (used when circular capture is active).
/// Mirrors Android TreeDetectionStateMachine.kt exactly.
final class TreeDetectionStateMachine {

    // MARK: - Properties

    private let confidenceThreshold: Float
    private let stabilityFrames: Int
    private let cooldownDurationMs: Int64

    private var currentState: TreeDetectionState = .searching
    private var consecutiveFrames: Int = 0
    private var lastDetection: SegmentationDetection?
    private var isPaused: Bool = false

    private let lock = NSLock()

    // MARK: - Callbacks

    /// Called whenever the state machine produces an action.
    var onAction: ((TreeDetectionAction) -> Void)?

    // MARK: - Init

    /// Create a state machine with the given thresholds.
    /// - Parameters:
    ///   - confidenceThreshold: Min confidence to consider a detection valid (default: 0.30)
    ///   - stabilityFrames: Number of consecutive frames with valid detection before triggering (default: 3)
    ///   - cooldownDurationMs: Cooldown duration after capture before resuming search (default: 3000ms)
    init(
        confidenceThreshold: Float = ScannerConfig.processingConfidenceThreshold,
        stabilityFrames: Int = ScannerConfig.processingStabilityFrames,
        cooldownDurationMs: Int64 = 3000
    ) {
        self.confidenceThreshold = confidenceThreshold
        self.stabilityFrames = stabilityFrames
        self.cooldownDurationMs = cooldownDurationMs
    }

    // MARK: - Public API

    /// Current state (read-only).
    var state: TreeDetectionState {
        lock.lock()
        defer { lock.unlock() }
        return currentState
    }

    /// Process a new frame of detections. Returns an action if the state machine
    /// wants to trigger something (capture, cooldown, etc.).
    /// Returns nil if no action is needed this frame.
    func process(detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        lock.lock()
        defer { lock.unlock() }

        // Circular capture is active → ignore all detections
        if isPaused {
            return nil
        }

        switch currentState {
        case .searching:
            return handleSearching(detections)
        case .treeDetected:
            return handleTreeDetected(detections)
        case .processing:
            return handleProcessing(detections)
        case .sending:
            return handleSending(detections)
        case .cooldown:
            return handleCooldown(detections)
        }
    }

    /// Explicitly set the current state (used by DetectionCoordinator).
    func setState(_ newState: TreeDetectionState) {
        lock.lock()
        currentState = newState
        lock.unlock()
    }

    /// Pause the state machine. Used when circular capture is running so that
    /// the main state machine doesn't interfere.
    func pause() {
        lock.lock()
        isPaused = true
        lock.unlock()
        print("[TreeDetectionSM] ⏸️ Paused")
    }

    /// Resume the state machine after circular capture ends.
    func resume() {
        lock.lock()
        isPaused = false
        lock.unlock()
        print("[TreeDetectionSM] ▶️ Resumed")
    }

    /// Reset to Searching state. Called when the scanner is reset.
    func reset() {
        lock.lock()
        currentState = .searching
        consecutiveFrames = 0
        lastDetection = nil
        lock.unlock()
        print("[TreeDetectionSM] 🔄 Reset to Searching")
    }

    // MARK: - Private: State Handlers

    /// Searching state: wait for N consecutive stable detections.
    private func handleSearching(_ detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        guard let valid = findValidTreeDetection(from: detections ?? [], threshold: confidenceThreshold) else {
            consecutiveFrames = 0
            print("[TreeDetectionSM] 📡 Searching: no valid tree, counter reset")
            return nil
        }

        print("[TreeDetectionSM] 📡 Searching: conf=\(valid.confidence), threshold=\(confidenceThreshold)")

        consecutiveFrames += 1
        print("[TreeDetectionSM] 📡 Searching: consecutiveFrames=\(consecutiveFrames)/\(stabilityFrames)")

        if consecutiveFrames >= stabilityFrames {
            currentState = .treeDetected
            lastDetection = valid
            consecutiveFrames = 0
            print("[TreeDetectionSM] 🎯 Tree detected — transitioning to TreeDetected")
            return .process(detection: valid)
        }

        return nil
    }

    /// TreeDetected state: confirm detection is still present before processing.
    private func handleTreeDetected(_ detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        guard let last = lastDetection else {
            currentState = .searching
            return nil
        }

        let hasSimilar = containsSimilarDetection(
            detections ?? [],
            to: last,
            iouThreshold: ScannerConfig.sameTreeIOUThreshold
        )

        if hasSimilar {
            // Transition to Processing to avoid repeated captures
            currentState = .processing
            return .process(detection: last)
        } else {
            currentState = .searching
            return nil
        }
    }

    /// Processing state: transition to Sending immediately.
    private func handleProcessing(_ detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        currentState = .sending
        print("[TreeDetectionSM] 🔄 Processing → Sending")
        return nil
    }

    /// Sending state: transition to Cooldown and start cooldown timer.
    private func handleSending(_ detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        currentState = .cooldown
        print("[TreeDetectionSM] 🔄 Sending → Cooldown (\(cooldownDurationMs)ms)")
        return .cooldown(durationMs: cooldownDurationMs)
    }

    /// Cooldown state: reset to Searching so the scanner is ready for the next tree.
    private func handleCooldown(_ detections: [SegmentationDetection]?) -> TreeDetectionAction? {
        currentState = .searching
        consecutiveFrames = 0
        lastDetection = nil
        print("[TreeDetectionSM] 🔄 Cooldown → Searching")
        return .resumeSearching
    }
}