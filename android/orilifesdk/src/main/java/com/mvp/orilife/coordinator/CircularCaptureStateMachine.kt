package com.mvp.orilife.coordinator

import android.util.Log
import com.mvp.orilife.sampling.StabilitySampler

/**
 * State machine điều phối luồng chụp ảnh theo góc.
 *
 * ✅ KEY: Sectors là TƯƠNG ĐỐI từ heading bắt đầu (referenceHeading).
 * - Sector 0 = heading = referenceHeading
 * - Sector 1 = heading = referenceHeading + 45°
 * - Sector 2 = heading = referenceHeading + 90°
 * - ...
 * User chỉ cần xoay từ sector 0 → 1 → 2 → ... → 7 (tương đối),
 * không phụ thuộc heading tuyệt đối của la bàn.
 */
class CircularCaptureStateMachine(
    private val onCaptureTriggered: (sectorIndex: Int) -> Unit,
    private val onSessionComplete: (capturedCount: Int) -> Unit
) {
    private var internalSessionCompleteCallback: ((capturedCount: Int) -> Unit)? = null

    companion object {
        private const val TAG = "CircularCaptureSM"
        private const val COOLDOWN_AFTER_CAPTURE_MS = 1500L
        // ✅ Tối thiểu sector cần capture để hoàn thành session (không cần đủ 8)
        private const val MIN_SECTORS_TO_COMPLETE = 5
    }

    // ─── State ────────────────────────────────────────────────────────────────

    private var currentState: CircularState = CircularState.INACTIVE
    private val sectors = mutableListOf<Sector>()
    private var currentTargetSector: Sector? = null

    // ✅ Reference heading — heading tại thời điểm bắt đầu session
    // Tất cả sectors được tính TƯƠNG ĐỐI từ heading này
    private var referenceHeading: Float? = null

    // Input buffers
    private val stabilitySampler = StabilitySampler(windowSize = 15, stableThreshold = 50f)
    private var latestHeading: Float? = null
    private var isYoloDetecting: Boolean = false
    private var isBlurry: Boolean = true

    // 3 điều kiện cho STATIONARY_WAIT
    private var conditionStable: Boolean = false
    private var conditionYolo: Boolean = false
    private var conditionBlur: Boolean = false

    // Callbacks
    private var onSkipSector: (() -> Unit)? = null

    // Guards
    private var isFirstCaptureDone: Boolean = false
    private var capturedSectorIndex: Int? = null
    private var lastCaptureTimeMs: Long = 0L

    // ─── Session lifecycle ───────────────────────────────────────────────────

    /**
     * Bắt đầu session — reference heading = heading hiện tại (hoặc 0° fallback).
     */
    fun startSession(onComplete: ((capturedCount: Int) -> Unit)? = null) {
        val refHeading = latestHeading ?: 0f
        startSessionWithReferenceHeading(refHeading, onComplete)
    }

    /**
     * Kết thúc session (user cancel hoặc kết thúc).
     */
    fun endSession() {
        currentState = CircularState.INACTIVE
        currentTargetSector = null
        referenceHeading = null
        stabilitySampler.reset()
        Log.d(TAG, "🔴 Session ended.")
    }

    /**
     * Bắt đầu session với reference heading cố định.
     * ✅ Sector 0 = referenceHeading, Sector 1 = ref + 45°, ..., Sector 7 = ref + 315°.
     *
     * @param referenceHeading Heading tuyệt đối tại thời điểm bắt đầu (0-360°)
     */
    fun startSessionWithReferenceHeading(
        referenceHeading: Float?,
        onComplete: ((capturedCount: Int) -> Unit)? = null,
        onSkipSector: (() -> Unit)? = null
    ) {
        // ✅ Dùng heading hiện tại làm reference, fallback = 0°
        this.referenceHeading = referenceHeading ?: 0f
        val ref = this.referenceHeading!!

        Log.d(TAG, "🔔 startSessionWithReferenceHeading: refHeading=$ref°")

        // ✅ Tạo 8 sectors TƯƠNG ĐỐI từ referenceHeading
        sectors.clear()
        sectors.addAll(Sector.createSessionSectors(ref))

        // Reset flags
        isFirstCaptureDone = false
        currentTargetSector = null
        stabilitySampler.reset()
        isYoloDetecting = false
        isBlurry = true
        conditionStable = false
        conditionYolo = false
        conditionBlur = false
        capturedSectorIndex = null
        lastCaptureTimeMs = 0L

        internalSessionCompleteCallback = onComplete
        this.onSkipSector = onSkipSector

        // ✅ Sector đầu tiên (index 0) = reference heading → đánh dấu là "sẽ chụp ngay"
        // KHÔNG tự động mark captured ở đây — chờ DetectionCoordinator capture
        currentTargetSector = sectors.firstOrNull()

        Log.d(TAG, "🟢 SESSION STARTED: refHeading=${ref.toInt()}°")
        Log.d(TAG, "   Sectors: ${sectors.map { "s${it.index}@${it.centerDegrees.toInt()}°" }}")

        currentState = CircularState.GUIDANCE
        Log.d(TAG, "📍 Circular capture started — GUIDANCE mode")
    }

    // ─── Input feed ───────────────────────────────────────────────────────────

    fun onSensorUpdate(heading: Float?, accelX: Float, accelY: Float, accelZ: Float) {
        stabilitySampler.addSample(accelX, accelY, accelZ)
        conditionStable = stabilitySampler.isStable()
        latestHeading = heading

        Log.v(TAG, "📡 SENSOR: heading=$heading, stable=$conditionStable, state=$currentState")

        when (currentState) {
            CircularState.INACTIVE -> { /* ignore */ }
            CircularState.GUIDANCE -> onGuidanceState()
            CircularState.STATIONARY_WAIT -> onStationaryWaitState()
            CircularState.CAPTURE_TRIGGERED -> { /* ignore — đang chờ chụp */ }
            CircularState.COMPLETE -> { /* ignore */ }
        }
    }

    fun onYoloResult(hasDetection: Boolean) {
        isYoloDetecting = hasDetection
        if (hasDetection) conditionYolo = true

        if (currentState == CircularState.STATIONARY_WAIT) {
            checkAndTriggerCapture()
        }
    }

    fun onBlurResult(isBlurrySample: Boolean) {
        isBlurry = isBlurrySample
        conditionBlur = !isBlurrySample

        if (currentState == CircularState.STATIONARY_WAIT) {
            checkAndTriggerCapture()
        }
    }

    // ─── Callback từ DetectionCoordinator ──────────────────────────────────────

    /**
     * DetectionCoordinator gọi sau khi chụp xong.
     */
    fun onCaptureDone(result: CaptureResult) {
        when (result) {
            is CaptureResult.Success -> {
                // ✅ Sector index từ state machine (không phải sector của la bàn)
                val sectorIndex = result.sectorIndex

                // Đánh dấu sector đã chụp
                markSectorCaptured(sectorIndex)

                val captured = capturedCount()
                val skipped = sectors.count { it.isSkipped }
                val remaining = sectors.count { !it.isCaptured && !it.isSkipped }
                Log.d(TAG, "✅ Sector $sectorIndex CAPTURED. captured=$captured, skipped=$skipped, remaining=$remaining")

                capturedSectorIndex = sectorIndex

                // ✅ Check MIN ngay sau mỗi lần capture thành công
                // Nếu captured >= MIN → complete + upload ngay, không đợi hết 8 sector
                if (captured >= MIN_SECTORS_TO_COMPLETE) {
                    Log.d(TAG, "✅ MIN reached ($captured >= $MIN_SECTORS_TO_COMPLETE) — UPLOAD!")
                    transitionToComplete()
                } else {
                    // Chưa đủ → tiếp tục xoay sector tiếp theo
                    currentState = CircularState.GUIDANCE
                    advanceToNextSector()
                    resetConditions()
                }
            }

            is CaptureResult.Failure -> {
                Log.w(TAG, "❌ Capture FAILED for sector ${result.sectorIndex}: ${result.error}")
                currentState = CircularState.GUIDANCE
                resetConditions()
            }
        }
    }

    // ─── State transitions ───────────────────────────────────────────────────

    private fun onGuidanceState() {
        val heading = latestHeading ?: return
        val target = currentTargetSector ?: return

        // ✅ Chuyển heading tuyệt đối sang relative để so sánh
        if (target.containsHeading(heading)) {
            currentState = CircularState.STATIONARY_WAIT
            Log.d(TAG, "📍 Entered sector ${target.index} (ref=${target.referenceHeading.toInt()}°, abs=${heading.toInt()}°). Waiting...")
        }
        // KHÔNG update target ở đây — đã được lock trong onCaptureDone
    }

    private fun onStationaryWaitState() {
        checkAndTriggerCapture()
    }

    private fun checkAndTriggerCapture() {
        val target = currentTargetSector ?: return

        // ── Cooldown guard ──────────────────────────────────────────────────
        val now = System.currentTimeMillis()
        val justCapturedDifferent = capturedSectorIndex != null && capturedSectorIndex != target.index
        if (justCapturedDifferent && (now - lastCaptureTimeMs) < COOLDOWN_AFTER_CAPTURE_MS) {
            if (conditionYolo) {
                conditionYolo = false
                Log.v(TAG, "⏳ [s${target.index}] COOLDOWN: reset yolo")
            }
            return
        }
        if (capturedSectorIndex != null && capturedSectorIndex == target.index) {
            capturedSectorIndex = null
        }

        // ── 3 điều kiện ───────────────────────────────────────────────────
        if (!conditionStable) {
            Log.v(TAG, "⏳ [s${target.index}] BLOCKED: stable=$conditionStable")
            return
        }
        if (!conditionYolo) {
            Log.v(TAG, "⏳ [s${target.index}] BLOCKED: waiting YOLO (blur=$conditionBlur)")
            return
        }
        if (!conditionBlur) {
            Log.v(TAG, "⏳ [s${target.index}] BLOCKED: blur=$conditionBlur")
            return
        }

        // ✅ TRIGGER!
        lastCaptureTimeMs = System.currentTimeMillis()
        currentState = CircularState.CAPTURE_TRIGGERED
        Log.d(TAG, "🎯 [s${target.index}] CAPTURE TRIGGERED! (stable=Y, yolo=Y, blur=Y)")
        onCaptureTriggered(target.index)
    }

    private fun transitionToComplete() {
        currentState = CircularState.COMPLETE
        currentTargetSector = null
        Log.d(TAG, "🏁 TRANSITION_COMPLETE: ${capturedCount()} sectors captured")
        // ✅ FIX: Gọi onSessionComplete (chứ KHÔNG phải onCaptureTriggered)
        // - onCaptureTriggered = no-op (chỉ set pending sector)
        // - onSessionComplete = callback thực sự trigger upload trong MainActivity
        //internalSessionCompleteCallback được set qua startSessionWithReferenceHeading.onComplete
        //onSessionComplete được set qua setupCircularCallbacks
        val callback = internalSessionCompleteCallback ?: onSessionComplete
        Log.d(TAG, "🏁 TRANSITION_COMPLETE: invoking callback (${if (callback != null) "OK" else "NULL"})")
        callback?.invoke(capturedCount())
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Tiến sector hiện tại đến sector index tiếp theo (index + 1).
     * KHÔNG dùng heading để tìm sector — luôn đi theo thứ tự vòng tròn.
     *
     * ⚠️ Defensive guard: Nếu session đã COMPLETE hoặc INACTIVE,
     * KHÔNG làm gì để tránh duplicate transition (đã được handle trong onCaptureDone).
     */
    private fun advanceToNextSector() {
        // ✅ Defensive: không làm gì nếu session đã kết thúc
        if (currentState == CircularState.COMPLETE || currentState == CircularState.INACTIVE) {
            Log.d(TAG, "⚠️ advanceToNextSector: session already $currentState — skipping")
            return
        }

        val current = currentTargetSector?.index ?: -1
        val uncaptured = sectors.filter { !it.isCaptured && !it.isSkipped }

        if (uncaptured.isEmpty()) {
            // ⚠️ Fallback: tất cả sectors đã captured hoặc skipped
            // Check MIN — nếu đủ thì complete, không thì vẫn complete để tránh stuck
            if (currentState != CircularState.COMPLETE) {
                val totalCaptured = sectors.count { it.isCaptured }
                Log.d(TAG, "🏁 advanceToNextSector fallback: captured=$totalCaptured, MIN=$MIN_SECTORS_TO_COMPLETE")
                transitionToComplete()
            }
            return
        }

        // Ưu tiên sector có index = (current + 1) % 8
        val nextIndex = (current + 1) % Sector.TOTAL_SECTORS
        val nextSector = uncaptured.find { it.index == nextIndex }
            ?: uncaptured.firstOrNull()

        currentTargetSector = nextSector
        Log.d(TAG, "🎯 Next target: sector ${nextSector?.index} (was $current)")
    }

    private fun markSectorCaptured(index: Int) {
        val pos = sectors.indexOfFirst { it.index == index }
        if (pos >= 0) {
            sectors[pos] = sectors[pos].copyCaptured()
            Log.d(TAG, "🏷️ CAPTURED: $index | remaining=${sectors.count { !it.isCaptured && !it.isSkipped }}")
        } else {
            Log.e(TAG, "❌ SECTOR_MARK_FAILED: index=$index")
        }
    }

    private fun markSectorSkipped(index: Int) {
        val pos = sectors.indexOfFirst { it.index == index }
        if (pos >= 0) {
            sectors[pos] = sectors[pos].copySkipped()
        }
    }

    private fun capturedCount(): Int = sectors.count { it.isCaptured }

    internal fun resetConditions() {
        conditionStable = false
        conditionYolo = false
        conditionBlur = false
        stabilitySampler.reset()
    }

    fun skipCurrentSector() {
        val target = currentTargetSector ?: run {
            Log.w(TAG, "⚠️ skipCurrentSector: no current target")
            return
        }
        Log.d(TAG, "⏭️ SKIP sector ${target.index}")

        markSectorSkipped(target.index)

        val captured = sectors.count { it.isCaptured }
        val remaining = sectors.count { !it.isCaptured && !it.isSkipped }

        // ✅ Luôn cố gắng xoay hết 8 sector → rồi mới check MIN
        if (remaining == 0) {
            Log.d(TAG, "⏭️ All sectors processed (including skips). captured=$captured")
            if (captured >= MIN_SECTORS_TO_COMPLETE) {
                transitionToComplete()
            } else {
                Log.d(TAG, "⚠️ Only $captured captured < $MIN_SECTORS_TO_COMPLETE — complete anyway to avoid stuck")
                transitionToComplete()
            }
            return
        }

        currentState = CircularState.GUIDANCE
        advanceToNextSector()
        resetConditions()
    }

    // ─── UI Getters ──────────────────────────────────────────────────────────

    fun getSessionState(): CircularSessionState {
        val heading = latestHeading
        val target = currentTargetSector

        // ✅ Guidance dùng heading tuyệt đối + target Sector (tự chuyển relative bên trong)
        val guidance = if (currentState == CircularState.GUIDANCE && heading != null && target != null) {
            Guidance.fromHeadingToTarget(heading, target)
        } else null

        val indicators = if (currentState == CircularState.STATIONARY_WAIT) {
            listOf(
                ConditionIndicator.stable(
                    when {
                        conditionStable -> ConditionStatus.READY
                        heading != null -> ConditionStatus.PENDING
                        else -> ConditionStatus.UNKNOWN
                    }
                ),
                ConditionIndicator.yolo(
                    when {
                        conditionYolo -> ConditionStatus.READY
                        heading != null -> ConditionStatus.PENDING
                        else -> ConditionStatus.UNKNOWN
                    }
                ),
                ConditionIndicator.blur(
                    when {
                        conditionBlur -> ConditionStatus.READY
                        heading != null -> ConditionStatus.PENDING
                        else -> ConditionStatus.UNKNOWN
                    }
                )
            )
        } else emptyList()

        return CircularSessionState(
            state = currentState,
            sectors = sectors.toList(),
            currentTargetSector = target,
            currentHeading = heading,
            guidance = guidance,
            indicators = indicators
        )
    }
}
