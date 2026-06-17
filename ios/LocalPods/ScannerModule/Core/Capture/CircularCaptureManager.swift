import Foundation

// MARK: - Sector

/// 15 equal sectors around a tree (default), configurable for different scan modes.
/// Matches Android `Sector` class.
struct Sector: Equatable, Hashable {
    let index: Int
    let referenceHeading: Float
    var isCaptured: Bool = false
    var isSkipped: Bool = false

    static var totalSectors = 15  // Default for tree scan
    static var sectorSizeDegrees: Float { 360.0 / Float(totalSectors) }
    static var sectorHalfAngle: Float { sectorSizeDegrees / 2.0 }
    static let boundaryTolerance: Float = 5.0

    /// Minimum sectors required to complete session (matches totalSectors)
    static var minimumCapturedSectors = 15  // Default for tree scan

    /// Configure sector count for different scan modes
    /// - Parameter sectors: Number of sectors (e.g., 15 for tree, 8 for fruit)
    static func configure(sectors: Int) {
        totalSectors = sectors
        minimumCapturedSectors = sectors
    }

    /// Center of this sector in absolute heading (0-360°).
    var centerDegrees: Float {
        let absolute = referenceHeading + Float(index) * Sector.sectorSizeDegrees
        return mod(absolute, 360.0)
    }

    /// Center of this sector in relative heading (0-360°).
    var relativeCenterDegrees: Float {
        return Float(index) * Sector.sectorSizeDegrees
    }

    /// Does the given absolute heading fall within this sector?
    func containsHeading(_ heading: Float) -> Bool {
        let relative = Sector.toRelativeHeading(heading, referenceHeading)
        return Sector.angularDistanceRelative(relative, relativeCenterDegrees)
            <= Sector.sectorHalfAngle + Sector.boundaryTolerance
    }

    /// Convert absolute heading to relative heading (0-360°).
    /// ref=90°, heading=135° → relative=45°
    static func toRelativeHeading(_ heading: Float, _ ref: Float) -> Float {
        let diff = heading - ref
        return mod(diff + 360.0, 360.0)
    }

    /// Shortest angular distance between two absolute headings (0-360°).
    static func angularDistance(_ a: Float, _ b: Float) -> Float {
        let diff = abs(a - b).truncatingRemainder(dividingBy: 360.0)
        return min(diff, 360.0 - diff)
    }

    private static func angularDistanceRelative(_ a: Float, _ b: Float) -> Float {
        let diff = abs(a - b).truncatingRemainder(dividingBy: 360.0)
        return min(diff, 360.0 - diff)
    }

    func markingCaptured() -> Sector {
        Sector(index: index, referenceHeading: referenceHeading, isCaptured: true, isSkipped: false)
    }
    func markingSkipped() -> Sector {
        Sector(index: index, referenceHeading: referenceHeading, isCaptured: false, isSkipped: true)
    }

    /// Create 15 relative sectors starting from the reference heading.
    static func createSessionSectors(referenceHeading: Float) -> [Sector] {
        (0..<totalSectors).map {
            Sector(index: $0, referenceHeading: referenceHeading)
        }
    }
}

fileprivate func mod(_ a: Float, _ n: Float) -> Float {
    let r = a.truncatingRemainder(dividingBy: n)
    return r < 0 ? r + n : r
}

// MARK: - Guidance

enum GuidanceDirection: String {
    case clockwise      // heading increases = user rotates left
    case counterClockwise
    case arrived
}

struct Guidance {
    let direction: GuidanceDirection
    let deltaDegrees: Float

    var instructionText: String {
        switch direction {
        case .clockwise:       return "Sang phải \(Int(deltaDegrees))°"
        case .counterClockwise: return "Sang trái \(Int(deltaDegrees))°"
        case .arrived:          return "Dừng lại, giữ yên"
        }
    }

    static let none = Guidance(direction: .arrived, deltaDegrees: 0)

    /// Calculate guidance from current heading to target sector.
    static func fromHeadingToTarget(_ currentHeading: Float, _ targetSector: Sector) -> Guidance {
        guard currentHeading >= 0, currentHeading < 360 else { return .none }

        let currentRelative = Sector.toRelativeHeading(currentHeading, targetSector.referenceHeading)
        let targetRelative = targetSector.relativeCenterDegrees

        let clockwiseDelta = mod(targetRelative - currentRelative + 360.0, 360.0)
        let counterDelta   = mod(currentRelative - targetRelative + 360.0, 360.0)

        if clockwiseDelta < 5.0 || counterDelta < 5.0 {
            return Guidance(direction: .arrived, deltaDegrees: 0)
        }
        if clockwiseDelta <= counterDelta {
            return Guidance(direction: .clockwise, deltaDegrees: clockwiseDelta)
        } else {
            return Guidance(direction: .counterClockwise, deltaDegrees: counterDelta)
        }
    }
}

// MARK: - Condition Indicator

enum ConditionStatus {
    case pending, ready, unknown
}

struct ConditionIndicator {
    let label: String
    let status: ConditionStatus

    static func stable(_ s: ConditionStatus) -> ConditionIndicator {
        ConditionIndicator(label: "Ổn định", status: s)
    }
    static func yolo(_ s: ConditionStatus) -> ConditionIndicator {
        ConditionIndicator(label: "YOLO", status: s)
    }
    static func blur(_ s: ConditionStatus) -> ConditionIndicator {
        ConditionIndicator(label: "Rõ nét", status: s)
    }
}

// MARK: - State

enum CircularState: Equatable {
    case inactive
    case guidance
    case stationaryWait
    case captureTriggered
    case complete
}

// MARK: - Session State

struct CircularSessionState {
    var state: CircularState = .inactive
    var sectors: [Sector] = []
    var currentTargetSector: Sector?
    var currentHeading: Float?
    var guidance: Guidance?
    var indicators: [ConditionIndicator] = []

    var capturedCount: Int { sectors.filter { $0.isCaptured }.count }
    var remainingCount: Int { sectors.filter { !$0.isCaptured && !$0.isSkipped }.count }
    var isComplete: Bool { state == .complete }
}

// NOTE: CaptureResult is defined in DetectionCoordinator.swift
// Using a typealias to avoid duplication.
// If this file is used standalone, uncomment the enum below.
// enum CaptureResult {
//     case success(sectorIndex: Int, imageId: String, treeId: String)
//     case failure(sectorIndex: Int, error: String)
// }

// MARK: - Capture Manager

/// State machine for the 8-sector circular capture workflow.
/// Matches Android `CircularCaptureStateMachine.kt`.
/// - Sector 0 = referenceHeading (where the session started)
/// - Sector 1 = ref + 45°
/// - ...
/// - Sector 7 = ref + 315°
final class CircularCaptureManager {

    // MARK: - Callbacks

    var onCaptureTriggered: ((Int) -> Void)?
    var onSessionComplete: ((Int) -> Void)?

    // MARK: - Public Properties

    /// Number of sectors captured in current session
    var capturedCount: Int { sectors.filter { $0.isCaptured }.count }

    // MARK: - State

    private let lock = NSRecursiveLock()

    private var state: CircularState = .inactive
    private var sectors: [Sector] = []
    private var currentTargetSector: Sector?
    private var referenceHeading: Float?
    private var latestHeading: Float?

    private let stabilitySampler = StabilitySampler(stableFrameThreshold: 15, windowSize: 15, stableThreshold: 80.0)
    private var conditionStable = false
    private var conditionYolo = false
    private var isSharp = false

    private var isFirstCaptureDone = false
    private var capturedSectorIndex: Int?
    private var lastCaptureTimeMs: Int64 = 0
    private var onSkipSector: (() -> Void)?

    private let cooldownAfterCaptureMs: Int64 = 1500

    // ✅ Auto-skip timeout: skip sector if stuck for too long
    private var sectorStartTimeMs: Int64 = 0
    private let sectorTimeoutMs: Int64 = 40000 // 40 seconds (increased from 20s)

    // MARK: - Public API

    /// Start session with the current heading as reference (0° fallback).
    func startSession(onComplete: ((Int) -> Void)? = nil, onSkip: (() -> Void)? = nil) {
        lock.lock()
        let ref = latestHeading ?? 0
        lock.unlock()
        startSessionWithReferenceHeading(ref, onComplete: onComplete, onSkip: onSkip)
    }

    /// Start session with a specific reference heading.
    func startSessionWithReferenceHeading(
        _ refHeading: Float?,
        onComplete: ((Int) -> Void)? = nil,
        onSkip: (() -> Void)? = nil
    ) {
        lock.lock()
        defer { lock.unlock() }

        let ref = refHeading ?? 0
        self.referenceHeading = ref

        sectors = Sector.createSessionSectors(referenceHeading: ref)
        currentTargetSector = sectors.first
        stabilitySampler.reset()

        conditionStable = false
        conditionYolo = false
        isSharp = false
        capturedSectorIndex = nil
        lastCaptureTimeMs = 0
        isFirstCaptureDone = false

        // ✅ Init timeout timer
        sectorStartTimeMs = currentTimeMs()
        onSkipSector = onSkip

        if let complete = onComplete {
            onSessionComplete = complete
        }

        state = .guidance
        print("[CircularCaptureManager] 🟢 Session started: refHeading=\(Int(ref))°")
    }

    /// End the session (user cancel).
    func endSession() {
        lock.lock()
        defer { lock.unlock() }

        state = .inactive
        currentTargetSector = nil
        referenceHeading = nil
        stabilitySampler.reset()
        print("[CircularCaptureManager] 🔴 Session ended")
    }

    /// Feed sensor update (called every 100ms from sensor feed).
    func onSensorUpdate(heading: Float?, accelX: Float, accelY: Float, accelZ: Float) {
        var captureCallback: ((Int) -> Void)?
        var capturedSectorIdx: Int?

        lock.lock()
        _ = stabilitySampler.feed(accelX: Double(accelX), accelY: Double(accelY), accelZ: Double(accelZ))
        conditionStable = stabilitySampler.isStable
        latestHeading = heading

        // Log state for debugging
        ScannerRemoteLog.breadcrumb(phase: "circular_sensor_update", detail: [
            "state": String(describing: state),
            "targetSector": currentTargetSector?.index ?? -1,
            "conditionStable": conditionStable,
            "heading": heading.map { String(format: "%.1f", $0) } ?? "nil"
        ])

        switch state {
        case .inactive: break
        case .guidance:        onGuidanceState()
        case .stationaryWait:
            // ✅ Check timeout: auto-skip if stuck too long
            let now = currentTimeMs()
            if now - sectorStartTimeMs > sectorTimeoutMs {
                ScannerRemoteLog.breadcrumb(phase: "circular_sector_timeout_auto_skip", detail: [
                    "sectorIndex": currentTargetSector?.index ?? -1,
                    "elapsedMs": Int(now - sectorStartTimeMs)
                ])
                print("[CircularCaptureManager] ⏱️ Sector timeout - auto-skipping")
                // Mark as skipped and advance
                if let target = currentTargetSector {
                    markSectorSkipped(target.index)
                }
                let remaining = sectors.filter { !$0.isCaptured && !$0.isSkipped }.count
                let captured = capturedCount

                // ✅ HYBRID COMPLETE: Check if we have minimum sectors
                let canComplete = (remaining == 0) || (captured >= Sector.minimumCapturedSectors)

                if canComplete {
                    state = .complete
                    currentTargetSector = nil
                    ScannerRemoteLog.breadcrumb(phase: "circular_session_complete_after_timeout", detail: [
                        "capturedCount": captured,
                        "remaining": remaining
                    ])
                } else {
                    state = .guidance
                    advanceToNextSector()
                    resetConditions()
                }
                lock.unlock()
                return
            }

            // Check capture conditions; if triggered, copy callback info
            if let triggerResult = checkAndTriggerCaptureReturning() {
                captureCallback = onCaptureTriggered
                capturedSectorIdx = triggerResult
            }
        case .captureTriggered: break
        case .complete:        break
        }
        lock.unlock()

        // Fire callback OUTSIDE lock to prevent re-entrant deadlock
        if let sectorIdx = capturedSectorIdx {
            captureCallback?(sectorIdx)
        }
    }

    /// Feed YOLO detection result.
    func onYoloResult(hasDetection: Bool) {
        var captureCallback: ((Int) -> Void)?
        var capturedSectorIdx: Int?

        lock.lock()
        isFirstCaptureDone = true
        if hasDetection { conditionYolo = true }

        ScannerRemoteLog.breadcrumb(phase: "circular_yolo_result", detail: [
            "hasDetection": hasDetection,
            "conditionYolo": conditionYolo,
            "state": String(describing: state),
            "targetSector": currentTargetSector?.index ?? -1
        ])

        if state == .stationaryWait {
            if let triggerResult = checkAndTriggerCaptureReturning() {
                captureCallback = onCaptureTriggered
                capturedSectorIdx = triggerResult
            }
        }
        lock.unlock()

        // Fire callback OUTSIDE lock
        if let sectorIdx = capturedSectorIdx {
            ScannerRemoteLog.breadcrumb(phase: "circular_yolo_trigger_capture", detail: ["sectorIndex": sectorIdx])
            captureCallback?(sectorIdx)
        }
    }

    /// Feed blur detection result.
    func onBlurResult(isBlurry: Bool) {
        var captureCallback: ((Int) -> Void)?
        var capturedSectorIdx: Int?

        lock.lock()
        isSharp = !isBlurry
        if state == .stationaryWait {
            if let triggerResult = checkAndTriggerCaptureReturning() {
                captureCallback = onCaptureTriggered
                capturedSectorIdx = triggerResult
            }
        }
        lock.unlock()

        // Fire callback OUTSIDE lock
        if let sectorIdx = capturedSectorIdx {
            captureCallback?(sectorIdx)
        }
    }

    /// Report capture completion (called after photo is saved).
    func onCaptureDone(result: CaptureResult) {
        var completeCallback: ((Int) -> Void)?
        var completedCount: Int = 0

        lock.lock()
        switch result {
        case .success(let sectorIndex, _, _):
            ScannerRemoteLog.breadcrumb(phase: "circular_capture_done_success", detail: ["sectorIndex": sectorIndex])
            markSectorCaptured(sectorIndex)
            let remaining = sectors.filter { !$0.isCaptured && !$0.isSkipped }.count
            let captured = capturedCount
            capturedSectorIndex = sectorIndex
            lastCaptureTimeMs = currentTimeMs()

            ScannerRemoteLog.breadcrumb(phase: "circular_capture_done_check_complete", detail: [
                "remaining": remaining,
                "captured": captured
            ])

            // ✅ HYBRID COMPLETE: Require all 15/15 sectors for completion
            let canComplete = captured >= Sector.minimumCapturedSectors

            if canComplete {
                // Transition to complete but fire callback outside lock
                state = .complete
                currentTargetSector = nil
                completedCount = captured
                completeCallback = onSessionComplete
                ScannerRemoteLog.breadcrumb(phase: "circular_session_complete", detail: [
                    "capturedCount": completedCount,
                    "isPartialComplete": remaining > 0
                ])
                print("[CircularCaptureManager] 🏁 COMPLETE: \(completedCount)/\(Sector.totalSectors) sectors captured")
            } else {
                state = .guidance
                ScannerRemoteLog.breadcrumb(phase: "circular_advance_to_next", detail: [
                    "fromSector": sectorIndex,
                    "remaining": remaining,
                    "captured": captured
                ])
                advanceToNextSector()
                resetConditions()
            }

        case .failure(let sectorIndex, let error):
            ScannerRemoteLog.error(phase: "circular_capture_done_failure", message: error, detail: ["sectorIndex": sectorIndex])
            state = .guidance
            resetConditions()
        }
        lock.unlock()

        // Fire completion callback OUTSIDE lock
        if let callback = completeCallback {
            callback(completedCount)
        }
    }

    /// Skip the current sector.
    func skipCurrentSector() {
        var completeCallback: ((Int) -> Void)?
        var completedCount: Int = 0

        lock.lock()
        guard let target = currentTargetSector else {
            lock.unlock()
            return
        }
        markSectorSkipped(target.index)

        let remaining = sectors.filter { !$0.isCaptured && !$0.isSkipped }.count
        let captured = capturedCount
        let canComplete = captured >= Sector.minimumCapturedSectors

        if canComplete {
            state = .complete
            currentTargetSector = nil
            completedCount = captured
            completeCallback = onSessionComplete
            print("[CircularCaptureManager] 🏁 COMPLETE (skip): \(completedCount) sectors captured")
        } else {
            state = .guidance
            advanceToNextSector()
            resetConditions()
        }
        lock.unlock()

        // Fire completion callback OUTSIDE lock
        if let callback = completeCallback {
            callback(completedCount)
        }
    }

    /// Get current UI state.
    func getSessionState() -> CircularSessionState {
        lock.lock()
        defer { lock.unlock() }

        let heading = latestHeading
        let target = currentTargetSector

        let guidance: Guidance?
        if state == .guidance, let h = heading, let t = target {
            guidance = Guidance.fromHeadingToTarget(h, t)
        } else {
            guidance = nil
        }

        let indicators: [ConditionIndicator]
        if state == .stationaryWait {
            indicators = [
                .stable(heading != nil ? (conditionStable ? .ready : .pending) : .unknown),
                .yolo(conditionYolo ? .ready : (heading != nil ? .pending : .unknown)),
                .blur(isSharp ? .ready : (heading != nil ? .pending : .unknown))
            ]
        } else {
            indicators = []
        }

        return CircularSessionState(
            state: state,
            sectors: sectors,
            currentTargetSector: target,
            currentHeading: heading,
            guidance: guidance,
            indicators: indicators
        )
    }

    func isInCircularCapture() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state != .inactive && state != .complete
    }

    func isSessionPendingUpload() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state == .complete
    }

    // MARK: - Private

    private func onGuidanceState() {
        guard let heading = latestHeading, let target = currentTargetSector else {
            ScannerRemoteLog.breadcrumb(phase: "circular_guidance_no_data", detail: [
                "hasHeading": latestHeading != nil,
                "hasTarget": currentTargetSector != nil
            ])
            return
        }

        let inSector = target.containsHeading(heading)
        ScannerRemoteLog.breadcrumb(phase: "circular_guidance_check", detail: [
            "heading": Int(heading),
            "targetSector": target.index,
            "targetCenter": Int(target.centerDegrees),
            "inSector": inSector
        ])

        if inSector {
            state = .stationaryWait
            // ✅ Reset timeout timer when entering sector
            sectorStartTimeMs = currentTimeMs()
            ScannerRemoteLog.breadcrumb(phase: "circular_entered_sector", detail: ["sectorIndex": target.index])
            print("[CircularCaptureManager] 📍 Entered sector \(target.index)")
        }
    }

    /// Check conditions and trigger capture. Returns the sector index if triggered, nil otherwise.
    /// IMPORTANT: Must be called while lock is held. Does NOT fire callbacks — caller fires them after unlock.
    private func checkAndTriggerCaptureReturning() -> Int? {
        guard let target = currentTargetSector else {
            ScannerRemoteLog.breadcrumb(phase: "circular_check_no_target", detail: [:])
            return nil
        }

        // Cooldown guard
        let now = currentTimeMs()
        if let lastIdx = capturedSectorIndex, lastIdx != target.index {
            if now - lastCaptureTimeMs < cooldownAfterCaptureMs {
                ScannerRemoteLog.breadcrumb(phase: "circular_check_cooldown", detail: [
                    "targetSector": target.index,
                    "lastCaptured": lastIdx,
                    "elapsed": Int(now - lastCaptureTimeMs)
                ])
                if conditionYolo { conditionYolo = false }
                return nil
            }
        }
        if capturedSectorIndex == target.index {
            capturedSectorIndex = nil
        }

        // 3 conditions must all be true
        ScannerRemoteLog.breadcrumb(phase: "circular_check_conditions", detail: [
            "targetSector": target.index,
            "conditionStable": conditionStable,
            "conditionYolo": conditionYolo,
            "isSharp": isSharp
        ])

        guard conditionStable else {
            ScannerRemoteLog.breadcrumb(phase: "circular_check_blocked_stable", detail: ["targetSector": target.index])
            return nil
        }
        guard conditionYolo else {
            ScannerRemoteLog.breadcrumb(phase: "circular_check_blocked_yolo", detail: ["targetSector": target.index])
            return nil
        }
        guard isSharp else {
            ScannerRemoteLog.breadcrumb(phase: "circular_check_blocked_blur", detail: ["targetSector": target.index])
            return nil
        }

        lastCaptureTimeMs = currentTimeMs()
        state = .captureTriggered
        ScannerRemoteLog.breadcrumb(phase: "circular_capture_triggered", detail: ["sectorIndex": target.index])
        print("[CircularCaptureManager] 🎯 CAPTURE TRIGGERED: sector \(target.index)")
        return target.index
    }

    /// NOTE: transitionToComplete is no longer used — completion logic is inlined in
    /// onCaptureDone/skipCurrentSector with callback fired outside lock.
    /// Kept as documentation reference only.
    // private func transitionToComplete() { ... }

    private func advanceToNextSector() {
        guard state != .complete, state != .inactive else {
            ScannerRemoteLog.breadcrumb(phase: "circular_advance_blocked", detail: ["state": String(describing: state)])
            return
        }

        let uncaptured = sectors.filter { !$0.isCaptured && !$0.isSkipped }
        guard !uncaptured.isEmpty else {
            // All sectors done - transition to complete
            if state != .complete {
                state = .complete
                currentTargetSector = nil
            }
            ScannerRemoteLog.breadcrumb(phase: "circular_advance_all_done", detail: [:])
            return
        }

        let currentIndex = currentTargetSector?.index ?? -1
        let nextIndex = (currentIndex + 1) % Sector.totalSectors
        let nextSector = uncaptured.first { $0.index == nextIndex } ?? uncaptured.first
        currentTargetSector = nextSector

        // ✅ Reset timeout timer when advancing to new sector
        sectorStartTimeMs = currentTimeMs()

        ScannerRemoteLog.breadcrumb(phase: "circular_advance_next_sector", detail: [
            "fromSector": currentIndex,
            "toSector": nextSector?.index ?? -1,
            "uncapturedCount": uncaptured.count
        ])

        print("[CircularCaptureManager] 🎯 Next target: sector \(nextSector?.index ?? -1) (was \(currentIndex))")
    }

    private func markSectorCaptured(_ index: Int) {
        if let pos = sectors.firstIndex(where: { $0.index == index }) {
            sectors[pos] = sectors[pos].markingCaptured()
        }
    }

    private func markSectorSkipped(_ index: Int) {
        if let pos = sectors.firstIndex(where: { $0.index == index }) {
            sectors[pos] = sectors[pos].markingSkipped()
        }
    }

    private func resetConditions() {
        conditionStable = false
        conditionYolo = false
        isSharp = false
        stabilitySampler.reset()
        ScannerRemoteLog.breadcrumb(phase: "circular_reset_conditions", detail: [
            "resetStabilitySampler": true
        ])
    }

    private func currentTimeMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}
