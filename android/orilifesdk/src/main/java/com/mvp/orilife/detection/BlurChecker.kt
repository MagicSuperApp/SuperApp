package com.mvp.orilife.detection

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Log
import com.mvp.orilife.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs

/**
 * Blur detection sử dụng Laplacian Variance.
 *
 * Algorithm:
 * 1. Chuyển bitmap → grayscale pixel array
 * 2. Áp Laplacian kernel 3x3:
 *    [ 0  1  0 ]
 *    [ 1 -4  1 ]
 *    [ 0  1  0 ]
 * 3. Tính variance của Laplacian response
 *    → Variance cao = ảnh sắc nét
 *    → Variance thấp = ảnh mờ
 *
 * Threshold mặc định: 100.0 (configurable trong Config.kt)
 * - Cao hơn → chỉ chấp nhận ảnh rất sắc nét
 * - Thấp hơn → chấp nhận cả ảnh hơi mờ
 */
object BlurChecker {

    private const val TAG = "BlurChecker"

    /**
     * Tính Laplacian Variance của bitmap.
     *
     * @param bitmap Ảnh đầu vào (Bitmap bất kỳ kích thước)
     * @return Laplacian variance (Double). Giá trị càng cao → ảnh càng sắc nét.
     */
    fun calculateLaplacianVariance(bitmap: Bitmap): Double {
        if (bitmap.width < 3 || bitmap.height < 3) {
            return 0.0
        }

        val width = bitmap.width
        val height = bitmap.height

        // Chuyển sang grayscale để tính nhanh hơn
        val grayPixels = IntArray(width * height)
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        for (i in pixels.indices) {
            val r = (pixels[i] shr 16) and 0xFF
            val g = (pixels[i] shr 8) and 0xFF
            val b = pixels[i] and 0xFF
            // Grayscale (ITU-R BT.601)
            grayPixels[i] = ((0.299 * r + 0.587 * g + 0.114 * b).toInt()).coerceIn(0, 255)
        }

        // Laplacian kernel response
        val laplacianSize = (width - 2) * (height - 2)
        val laplacian = DoubleArray(laplacianSize)

        var idx = 0
        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val center = grayPixels[y * width + x]
                val top = grayPixels[(y - 1) * width + x]
                val bottom = grayPixels[(y + 1) * width + x]
                val left = grayPixels[y * width + (x - 1)]
                val right = grayPixels[y * width + (x + 1)]

                // Laplacian: center * -4 + top + bottom + left + right
                laplacian[idx++] = (center * -4 + top + bottom + left + right).toDouble()
            }
        }

        // Tính mean và variance
        val mean = laplacian.sum() / laplacian.size
        val variance = laplacian.map { (it - mean) * (it - mean) }.sum() / laplacian.size

        return variance
    }

    /**
     * Kiểm tra bitmap có bị mờ hay không.
     *
     * @param bitmap Ảnh đầu vào
     * @param threshold Ngưỡng variance. Mặc định từ Config.BLUR_VARIANCE_THRESHOLD
     * @return true nếu ảnh MỜ (blur), false nếu SẮC NÉT
     */
    fun isBlurry(bitmap: Bitmap, threshold: Double = Config.BLUR_VARIANCE_THRESHOLD): Boolean {
        val variance = calculateLaplacianVariance(bitmap)
        val result = variance < threshold
        Log.d(TAG, "🔍 Blur check: variance=${"%.2f".format(variance)}, threshold=$threshold, isBlurry=$result")
        return result
    }

    /**
     * Kiểm tra bitmap có bị mờ hay không (version với config).
     * Sử dụng threshold từ Config.
     */
    fun isBlurry(bitmap: Bitmap): Boolean {
        return isBlurry(bitmap, Config.BLUR_VARIANCE_THRESHOLD)
    }

    /**
     * Tính độ sắc nét tương đối (0.0 → 1.0+).
     * 1.0 = ngay tại threshold
     * > 1.0 = sắc nét hơn threshold
     * < 1.0 = mờ hơn threshold
     */
    fun getSharpnessScore(bitmap: Bitmap): Double {
        val variance = calculateLaplacianVariance(bitmap)
        return variance / Config.BLUR_VARIANCE_THRESHOLD
    }
}
