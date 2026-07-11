package com.aladincontract.company.treereid

import kotlin.math.abs

/**
 * Logic capture-by-heading — port 1:1 từ iOS HeadingCaptureManager.swift.
 * Trigger khi |Δheading| ≥ 25° HOẶC |Δpitch| ≥ 18° so với lần chụp gần nhất.
 * Chuẩn hoá góc (wrap 360°). Không dùng YOLO/blur/sector.
 *
 * Chỉ tính toán delta + quyết định shouldCapture; việc chụp thật + đếm round do
 * TreeReIDBridgeModule thực hiện. Cập nhật lastCaptured NGAY khi shouldCapture=true
 * (giống iOS triggerCapture) để debounce — lần sau cần Δ mới đủ ngưỡng.
 */
class HeadingCaptureManager {

    companion object {
        const val MIN_HEADING_DELTA = 25.0
        const val MIN_PITCH_DELTA = 18.0

        // Stillness (Lỗi field #2): tốc-độ xoay tức-thời tối-đa (độ/frame) coi là "đứng yên",
        // và số frame đứng-yên liên-tiếp cần có. Khớp iOS TreeReIDConfig.steady*.
        // ⚠️ CẦN CALIBRATE máy thật: 1.5 = an-toàn (chỉ chặn lia nhanh); GIẢM dần (0.8) nếu
        // muốn siết ảnh trùng. Đặt quá thấp → khó chụp.
        const val STEADY_RATE_THRESHOLD = 1.5
        const val STEADY_FRAMES_REQUIRED = 3
    }

    data class SensorUpdate(
        val heading: Double,
        val pitch: Double,
        val roll: Double,
        val deltaHeading: Double?,
        val deltaPitch: Double?,
        val shouldCapture: Boolean,
        val timestamp: Double,
    )

    private var lastCapturedHeading: Double? = null
    private var lastCapturedPitch: Double? = null

    // Stillness (Lỗi field #2): mẫu frame trước + đếm frame đứng-yên liên-tiếp.
    private var prevSampleHeading: Double? = null
    private var prevSamplePitch: Double? = null
    private var steadyFrames = 0
    var lastEmittedHeading: Double? = null
        private set
    var lastEmittedRoll: Double = 0.0
        private set
    var lastEmittedPitch: Double? = null
        private set

    /** Xử lý 1 mẫu cảm biến → trả SensorUpdate (đã cập nhật lastCaptured nếu trigger). */
    fun process(heading: Double, pitch: Double, roll: Double): SensorUpdate {
        val timestamp = System.currentTimeMillis() / 1000.0

        // Khởi tạo mốc trên lần đọc đầu (như iOS checkCaptureTrigger).
        if (lastCapturedHeading == null) lastCapturedHeading = heading
        if (lastCapturedPitch == null) lastCapturedPitch = pitch

        val deltaHeading = lastCapturedHeading?.let { normalizeAngle(heading - it) }
        val deltaPitch = lastCapturedPitch?.let { pitch - it }

        // Stillness: tốc-độ xoay tức-thời (frame-to-frame) → đếm frame đứng-yên liên-tiếp.
        val instRate = if (prevSamplePitch != null) {
            abs(pitch - prevSamplePitch!!) +
                (prevSampleHeading?.let { abs(normalizeAngle(heading - it)) } ?: 0.0)
        } else {
            Double.MAX_VALUE
        }
        steadyFrames = if (instRate <= STEADY_RATE_THRESHOLD) steadyFrames + 1 else 0
        val isSteady = steadyFrames >= STEADY_FRAMES_REQUIRED
        prevSampleHeading = heading
        prevSamplePitch = pitch

        // Đủ GÓC?
        val angleMet =
            (deltaHeading != null && abs(deltaHeading) >= MIN_HEADING_DELTA) ||
                (deltaPitch != null && abs(deltaPitch) >= MIN_PITCH_DELTA)

        // Đủ góc VÀ đang đứng yên → chụp; đủ góc nhưng đang lia → hoãn (chống nhoè/trùng #2).
        val shouldCapture = angleMet && isSteady

        lastEmittedHeading = heading
        lastEmittedPitch = pitch
        lastEmittedRoll = roll

        if (shouldCapture) {
            lastCapturedHeading = heading
            lastCapturedPitch = pitch
        }

        return SensorUpdate(heading, pitch, roll, deltaHeading, deltaPitch, shouldCapture, timestamp)
    }

    /** Reset mốc capture (gọi khi bắt đầu session mới hoặc chuyển round). */
    fun reset() {
        lastCapturedHeading = null
        lastCapturedPitch = null
        prevSampleHeading = null
        prevSamplePitch = null
        steadyFrames = 0
    }

    /** Chuẩn hoá góc về [-180, 180]. */
    private fun normalizeAngle(angle: Double): Double {
        var n = angle % 360.0
        if (n > 180) n -= 360
        else if (n < -180) n += 360
        return n
    }
}
