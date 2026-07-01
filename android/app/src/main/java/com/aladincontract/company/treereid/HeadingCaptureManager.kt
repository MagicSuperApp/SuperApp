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

        val shouldCapture =
            (deltaHeading != null && abs(deltaHeading) >= MIN_HEADING_DELTA) ||
                (deltaPitch != null && abs(deltaPitch) >= MIN_PITCH_DELTA)

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
    }

    /** Chuẩn hoá góc về [-180, 180]. */
    private fun normalizeAngle(angle: Double): Double {
        var n = angle % 360.0
        if (n > 180) n -= 360
        else if (n < -180) n += 360
        return n
    }
}
