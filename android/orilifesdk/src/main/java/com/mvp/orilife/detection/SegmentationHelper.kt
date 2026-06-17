package com.mvp.orilife.detection

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Log
import com.mvp.orilife.Config
import kotlin.math.exp

/**
 * Helper class để reconstruct mask từ YOLOv2.6 Seg model outputs.
 *
 * Model output:
 *   Output[0]: [1, 300, 38] → 300 detections × [cx, cy, w, h, conf, classId, 32 coeffs]
 *   Output[1]: [1, 160, 160, 32] → 32 prototype masks, mỗi 160×160
 *
 * Mask reconstruction:
 *   mask[y, x] = sigmoid( Σ( coeff[i] × proto_mask[i, y, x] ) )  với i = 0..31
 */
object SegmentationHelper {

    private const val TAG = "SegmentationHelper"

    // Kích thước prototype mask từ model
    const val PROTO_SIZE = 160

    // Số prototype masks (mask channels)
    const val NUM_PROTOS = 32

    /**
     * Reconstruct mask từ coefficients và prototype masks
     *
     * @param coeffs 32 mask coefficients từ output[0][i][6:38]
     * @param protos 32 prototype masks, mỗi 160×160 từ output[1]
     * @return 2D FloatArray [160][160] với giá trị sigmoid [0, 1]
     */
    fun reconstructMask(
        coeffs: FloatArray,
        protos: Array<Array<FloatArray>>
    ): Array<Array<Float>> {
        val height = PROTO_SIZE
        val width = PROTO_SIZE

        // Validate protos shape: should be [32][160][160] = [NUM_PROTOS][PROTO_SIZE][PROTO_SIZE]
        if (protos.size != NUM_PROTOS) {
            Log.e(TAG, "⚠️ Proto shape mismatch: expected ${NUM_PROTOS} protos, got ${protos.size}")
        }
        if (protos.isNotEmpty() && protos[0].size != PROTO_SIZE) {
            Log.e(TAG, "⚠️ Proto H mismatch: expected ${PROTO_SIZE}, got ${protos[0].size}")
        }
        if (protos.isNotEmpty() && protos[0].isNotEmpty() && protos[0][0].size != PROTO_SIZE) {
            Log.e(TAG, "⚠️ Proto W mismatch: expected ${PROTO_SIZE}, got ${protos[0][0].size}")
        }

        // Khởi tạo mask rỗng
        val mask = Array(height) { Array(width) { 0f } }

        // Tính tổng có trọng số: Σ( coeff[i] × proto[i] )
        var minVal = Float.MAX_VALUE
        var maxVal = Float.MIN_VALUE
        var sumVal = 0f
        for (y in 0 until height) {
            for (x in 0 until width) {
                var sum = 0f
                for (i in 0 until minOf(NUM_PROTOS, protos.size)) {
                    val protoH = protos[i].size
                    val protoW = if (protoH > 0) protos[i][0].size else 0
                    if (y < protoH && x < protoW) {
                        sum += coeffs[i] * protos[i][y][x]
                    }
                }
                mask[y][x] = sigmoid(sum)
                if (mask[y][x] < minVal) minVal = mask[y][x]
                if (mask[y][x] > maxVal) maxVal = mask[y][x]
                sumVal += mask[y][x]
            }
        }

        val meanVal = sumVal / (height * width)
        val coeffMax = coeffs.maxOrNull() ?: 0f
        Log.d(TAG, "✅ Mask reconstructed: ${width}x${height}, range=[${"%.4f".format(minVal)}, ${"%.4f".format(maxVal)}], mean=${"%.4f".format(meanVal)}, coeffMax=${"%.4f".format(coeffMax)}")
        return mask
    }

    /**
     * Sigmoid function với numerical stability
     */
    private fun sigmoid(x: Float): Float {
        return when {
            x >= 0 -> {
                val e = exp(-x.toDouble())
                (1.0 / (1.0 + e)).toFloat()
            }
            else -> {
                val e = exp(x.toDouble())
                (e / (1.0 + e)).toFloat()
            }
        }
    }

    /**
     * Resize mask 160×160 → kích thước của bounding box (trong ảnh crop)
     *
     * @param mask Mask gốc 160×160
     * @param boxWidth Chiều rộng box đích (pixels)
     * @param boxHeight Chiều cao box đích (pixels)
     * @return Mask đã resize
     */
    fun resizeMaskToBox(
        mask: Array<Array<Float>>,
        boxWidth: Int,
        boxHeight: Int
    ): Array<Array<Float>> {
        if (boxWidth <= 0 || boxHeight <= 0) return mask

        val srcHeight = mask.size
        val srcWidth = if (mask.isNotEmpty()) mask[0].size else 0

        val resized = Array(boxHeight) { y ->
            Array(boxWidth) { x ->
                // Bilinear interpolation
                val srcX = (x.toFloat() / boxWidth * (srcWidth - 1)).coerceIn(0f, (srcWidth - 1).toFloat())
                val srcY = (y.toFloat() / boxHeight * (srcHeight - 1)).coerceIn(0f, (srcHeight - 1).toFloat())

                val x0 = srcX.toInt().coerceIn(0, srcWidth - 2)
                val y0 = srcY.toInt().coerceIn(0, srcHeight - 2)
                val x1 = x0 + 1
                val y1 = y0 + 1

                val xFrac = srcX - x0
                val yFrac = srcY - y0

                // Bilinear interpolation
                val v00 = mask[y0][x0]
                val v01 = mask[y0][x1]
                val v10 = mask[y1][x0]
                val v11 = mask[y1][x1]

                (v00 * (1 - xFrac) * (1 - yFrac) +
                        v01 * xFrac * (1 - yFrac) +
                        v10 * (1 - xFrac) * yFrac +
                        v11 * xFrac * yFrac)
            }
        }

        Log.d(TAG, "📐 Mask resized: ${srcWidth}x${srcHeight} → ${boxWidth}x${boxHeight}")
        return resized
    }

    /**
     * Áp mask vào bitmap đã crop - biến vùng ngoài mask thành đen
     *
     * @param croppedBitmap Bitmap đã crop (từ ImageCropper)
     * @param mask Mask đã resize theo kích thước crop
     * @param threshold Ngưỡng sigmoid [0-1], mặc định 0.5
     * @return Bitmap mới với background đen, chỉ vùng mask giữ nguyên
     */
    fun applyMaskToBitmap(
        croppedBitmap: Bitmap,
        mask: Array<Array<Float>>,
        threshold: Float = Config.MASK_THRESHOLD
    ): Bitmap {
        val width = croppedBitmap.width
        val height = croppedBitmap.height

        // Tạo bitmap mới để không modify bitmap gốc
        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        val maskHeight = mask.size
        val maskWidth = if (mask.isNotEmpty()) mask[0].size else 0

        val pixels = IntArray(width * height)
        croppedBitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val resultPixels = IntArray(width * height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val idx = y * width + x
                val pixel = pixels[idx]

                // Map sang mask coordinates
                val maskX = (x.toFloat() / width * maskWidth).toInt().coerceIn(0, maskWidth - 1)
                val maskY = (y.toFloat() / height * maskHeight).toInt().coerceIn(0, maskHeight - 1)

                val maskValue = mask[maskY][maskX]

                if (maskValue > threshold) {
                    // Giữ nguyên pixel
                    resultPixels[idx] = pixel
                } else {
                    // Background → trong suốt (transparent)
                    resultPixels[idx] = Color.TRANSPARENT
                }
            }
        }

        result.setPixels(resultPixels, 0, width, 0, 0, width, height)

        // Tính % vùng giữ lại
        val keptPixels = resultPixels.count { it != Color.BLACK }
        val keptPercent = keptPixels * 100 / (width * height)
        Log.d(TAG, "🎭 Mask applied: ${width}x${height}, kept=$keptPercent% (threshold=$threshold)")

        return result
    }

    /**
     * Áp mask với độ mềm ở edges ( feathered mask )
     * Edge pixels sẽ có alpha transition thay vì hard cutoff
     *
     * @param croppedBitmap Bitmap đã crop
     * @param mask Mask đã resize
     * @param innerThreshold Ngưỡng trong (vùng chắc chắn giữ lại)
     * @param outerThreshold Ngưỡng ngoài (vùng chắc chắn bỏ)
     * @return Bitmap mới
     */
    fun applyMaskWithFeather(
        croppedBitmap: Bitmap,
        mask: Array<Array<Float>>,
        innerThreshold: Float = 0.6f,
        outerThreshold: Float = 0.3f
    ): Bitmap {
        val width = croppedBitmap.width
        val height = croppedBitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        val maskHeight = mask.size
        val maskWidth = if (mask.isNotEmpty()) mask[0].size else 0

        val pixels = IntArray(width * height)
        croppedBitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val resultPixels = IntArray(width * height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val idx = y * width + x
                val pixel = pixels[idx]
                val r = (pixel shr 16) and 0xFF
                val g = (pixel shr 8) and 0xFF
                val b = pixel and 0xFF

                val maskX = (x.toFloat() / width * maskWidth).toInt().coerceIn(0, maskWidth - 1)
                val maskY = (y.toFloat() / height * maskHeight).toInt().coerceIn(0, maskHeight - 1)

                val maskValue = mask[maskY][maskX]

                when {
                    maskValue >= innerThreshold -> {
                        // Vùng trong - giữ nguyên
                        resultPixels[idx] = pixel
                    }
                    maskValue <= outerThreshold -> {
                        // Vùng ngoài - transparent
                        resultPixels[idx] = Color.TRANSPARENT
                    }
                    else -> {
                        // Vùng transition - blend với transparent (giảm alpha)
                        val alpha = ((maskValue - outerThreshold) / (innerThreshold - outerThreshold)).coerceIn(0f, 1f)
                        val newAlpha = (alpha * 255).toInt().coerceIn(0, 255)
                        resultPixels[idx] = (newAlpha shl 24) or (r shl 16) or (g shl 8) or b
                    }
                }
            }
        }

        result.setPixels(resultPixels, 0, width, 0, 0, width, height)
        Log.d(TAG, "🎭 Feathered mask applied: ${width}x${height}")
        return result
    }

    /**
     * Kiểm tra mask có valid không (không phải toàn zero hoặc NaN)
     */
    fun isValidMask(mask: Array<Array<Float>>): Boolean {
        if (mask.isEmpty() || mask[0].isEmpty()) return false

        var sum = 0f
        var count = 0
        for (row in mask) {
            for (v in row) {
                if (v.isNaN() || v.isInfinite()) return false
                sum += v
                count++
            }
        }

        // Trung bình phải > 0.01 mới là mask có nghĩa
        return count > 0 && (sum / count) > 0.01f
    }

    /**
     * Debug: in mask stats
     */
    fun debugMask(mask: Array<Array<Float>>) {
        val height = mask.size
        val width = if (mask.isNotEmpty()) mask[0].size else 0

        var sum = 0f
        var min = Float.MAX_VALUE
        var max = Float.MIN_VALUE

        for (row in mask) {
            for (v in row) {
                sum += v
                if (v < min) min = v
                if (v > max) max = v
            }
        }

        val count = width * height
        Log.d(TAG, "📊 Mask stats: ${width}x${height}, min=${"%.4f".format(min)}, max=${"%.4f".format(max)}, mean=${"%.4f".format(sum / count)}")
    }
}
