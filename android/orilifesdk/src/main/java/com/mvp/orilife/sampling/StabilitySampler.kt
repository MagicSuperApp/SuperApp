package com.mvp.orilife.sampling

import android.util.Log
import kotlin.math.sqrt


class StabilitySampler(
    private val windowSize: Int = 15,
    private val stableThreshold: Float = 50f  // variance threshold — có thể tune
) {
    // Buffer lưu N samples gần nhất, mỗi sample = magnitude của vector gia tốc
    private val magnitudeBuffer = ArrayDeque<Float>(windowSize)

    // Đếm số sample đã thu thập
    private var sampleCount = 0

    /**
     * Thêm 1 accelerometer sample.
     * Gọi mỗi khi TYPE_ACCELEROMETER callback fire.
     *
     * @param x X-axis acceleration (m/s²)
     * @param y Y-axis acceleration (m/s²)
     * @param z Z-axis acceleration (m/s²)
     */
    fun addSample(x: Float, y: Float, z: Float) {
        val magnitude = sqrt(x * x + y * y + z * z)
        addMagnitude(magnitude)
    }

    /**
     * Thêm magnitude đã tính sẵn.
     * Dùng khi không có đủ 3 trục (ví dụ chỉ có magnitude).
     */
    @Synchronized
    fun addMagnitude(magnitude: Float) {
        if (magnitudeBuffer.size >= windowSize) {
            magnitudeBuffer.removeFirst()
        }
        magnitudeBuffer.add(magnitude)
        sampleCount++
    }

    /**
     * Kiểm tra thiết bị có đang đứng yên không.
     *
     * @return true nếu đã thu đủ windowSize samples VÀ variance < threshold
     */
    @Synchronized
    fun isStable(): Boolean {
        if (magnitudeBuffer.size < windowSize) {
            return false
        }
        return calculateVariance() < stableThreshold
    }

    /**
     * Tính sharpness score — ratio giữa threshold và variance.
     * > 1 = rất ổn định, = 1 = ngay threshold, < 1 = rung.
     *
     * Dùng cho debug/hiển thị trạng thái ổn định.
     */
    @Synchronized
    fun getStabilityScore(): Float {
        if (magnitudeBuffer.size < windowSize) {
            return 0f
        }
        val variance = calculateVariance()
        // > 1.0 = rất ổn định, = 1.0 = ngay threshold, < 1.0 = rung
        return stableThreshold / variance.coerceAtLeast(1f)
    }

    /**
     * Variance của magnitude trong window.
     * Variance thấp = gia tốc không thay đổi nhiều = đứng yên.
     */
    @Synchronized
    private fun calculateVariance(): Float {
        if (magnitudeBuffer.size < 2) return Float.MAX_VALUE

        val n = magnitudeBuffer.size
        val mean = magnitudeBuffer.sum() / n

        var sumSquaredDiff = 0f
        for (m in magnitudeBuffer) {
            val diff = m - mean
            sumSquaredDiff += diff * diff
        }

        return sumSquaredDiff / n
    }

    /**
     * Reset buffer — gọi khi bắt đầu capture session mới.
     */
    @Synchronized
    fun reset() {
        magnitudeBuffer.clear()
        sampleCount = 0
    }

    /**
     * Số samples hiện có trong buffer.
     */
    @Synchronized
    fun bufferSize(): Int = magnitudeBuffer.size

    /**
     * Có đủ samples để đánh giá stability chưa.
     */
    @Synchronized
    fun hasEnoughSamples(): Boolean = magnitudeBuffer.size >= windowSize
}
