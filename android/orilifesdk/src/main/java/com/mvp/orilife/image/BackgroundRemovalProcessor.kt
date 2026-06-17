package com.mvp.orilife.image

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.RectF
import android.util.Log
import com.mvp.orilife.Config
import com.mvp.orilife.detection.SegmentationDetection
import com.mvp.orilife.detection.SegmentationHelper

/**
 * Xử lý background removal trên ảnh full frame (không crop).
 *
 * Luồng:
 *   1. Reconstruct mask 160×160 từ segDet.maskData (coeffs + protoMasks)
 *   2. Crop mask vùng bounding box (trong letterbox space)
 *   3. Scale mask → kích thước full frame
 *   4. Apply mask lên full frame (background → transparent)
 *   5. Lưu PNG → gửi server
 *
 * Server nhận ảnh transparent, chỉ cần composite lên nền.
 */
object BackgroundRemovalProcessor {

    private const val TAG = "BgRemovalProcessor"

    // Kích thước prototype mask từ YOLO model
    private const val PROTO_SIZE = 160

    /**
     * Apply mask lên full frame bitmap — xóa background, chỉ giữ vùng cây.
     *
     * @param fullFrame    Ảnh full resolution từ camera
     * @param segDet       SegmentationDetection từ YOLO (chứa maskData)
     * @param threshold     Ngưỡng sigmoid [0-1], mặc định từ Config
     * @return Bitmap đã xóa nền (ARGB_8888, background = transparent)
     */
    fun applyMaskToFullFrame(
        fullFrame: Bitmap,
        segDet: SegmentationDetection,
        threshold: Float = Config.MASK_THRESHOLD
    ): Bitmap {
        val frameWidth = fullFrame.width
        val frameHeight = fullFrame.height

        Log.d(TAG, "🎭 MASK_FULL: frame=${frameWidth}x${frameHeight}, conf=${"%.2f".format(segDet.confidence)}, label=${segDet.label}")

        // 1. Reconstruct mask 160×160 từ coefficients + prototype masks
        val maskData = segDet.maskData
        if (maskData == null) {
            Log.w(TAG, "⚠️ No maskData — returning original frame")
            return fullFrame.copy(Bitmap.Config.ARGB_8888, false)
        }

        val reconstructedMask = maskData.reconstructedMask
            ?: SegmentationHelper.reconstructMask(maskData.maskCoeffs, maskData.protoMasks)

        // 2. Box trong letterbox space [0,1] — dùng để crop proto mask 160×160
        //    boxLetterbox * 160 = pixel coords trong proto space
        val boxLetterbox = maskData.boxLetterbox

        // 3. Crop proto mask 160×160 vùng bounding box
        val boxLeftPx   = (boxLetterbox.left   * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE - 1)
        val boxTopPx    = (boxLetterbox.top    * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE - 1)
        val boxRightPx  = (boxLetterbox.right  * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE)
        val boxBottomPx = (boxLetterbox.bottom * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE)

        val boxMaskW = maxOf(1, boxRightPx - boxLeftPx)
        val boxMaskH = maxOf(1, boxBottomPx - boxTopPx)

        Log.d(TAG, "🎭 MASK_CROP: proto=[${boxLeftPx}:${boxRightPx}]x[${boxTopPx}:${boxBottomPx}] = ${boxMaskW}x${boxMaskH}, letterbox=[${"%.3f".format(boxLetterbox.left)},${"%.3f".format(boxLetterbox.top)},${"%.3f".format(boxLetterbox.right)},${"%.3f".format(boxLetterbox.bottom)}]")

        val croppedProtoMask = Array(boxMaskH) { row ->
            Array(boxMaskW) { col ->
                reconstructedMask[boxTopPx + row][boxLeftPx + col]
            }
        }

        // 4. Scale cropped mask → kích thước full frame
        val scaledMask = SegmentationHelper.resizeMaskToBox(croppedProtoMask, frameWidth, frameHeight)
        Log.d(TAG, "🎭 MASK_SCALED: ${boxMaskW}x${boxMaskH} → ${frameWidth}x${frameHeight}")

        // 5. Apply mask lên full frame
        val result = applyTransparentBackground(fullFrame, scaledMask, threshold)
        Log.d(TAG, "🎭 MASK_APPLIED: kept=${getKeptPercent(fullFrame, scaledMask, threshold)}%")

        return result
    }

    /**
     * Apply transparent background — background pixels trở thành Color.TRANSPARENT.
     *
     * @param bitmap   Full frame bitmap
     * @param mask     2D FloatArray [height][width], giá trị [0, 1]
     * @param threshold Ngưỡng sigmoid
     * @return Bitmap mới với background transparent
     */
    private fun applyTransparentBackground(
        bitmap: Bitmap,
        mask: Array<Array<Float>>,
        threshold: Float
    ): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        val maskHeight = mask.size
        val maskWidth = if (mask.isNotEmpty()) mask[0].size else 0

        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val resultPixels = IntArray(width * height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val idx = y * width + x
                val pixel = pixels[idx]

                // Map từ frame coords → mask coords
                val maskX = (x.toFloat() / width * maskWidth).toInt().coerceIn(0, maskWidth - 1)
                val maskY = (y.toFloat() / height * maskHeight).toInt().coerceIn(0, maskHeight - 1)

                val maskValue = mask[maskY][maskX]

                if (maskValue > threshold) {
                    // Vùng cây — giữ nguyên pixel
                    resultPixels[idx] = pixel
                } else {
                    // Background → transparent
                    resultPixels[idx] = Color.TRANSPARENT
                }
            }
        }

        result.setPixels(resultPixels, 0, width, 0, 0, width, height)
        return result
    }

    /**
     * Tính % pixels được giữ lại (vùng cây).
     */
    private fun getKeptPercent(
        bitmap: Bitmap,
        mask: Array<Array<Float>>,
        threshold: Float
    ): Int {
        val width = bitmap.width
        val height = bitmap.height
        val maskHeight = mask.size
        val maskWidth = if (mask.isNotEmpty()) mask[0].size else 0

        var kept = 0
        for (y in 0 until height) {
            for (x in 0 until width) {
                val maskX = (x.toFloat() / width * maskWidth).toInt().coerceIn(0, maskWidth - 1)
                val maskY = (y.toFloat() / height * maskHeight).toInt().coerceIn(0, maskHeight - 1)
                if (mask[maskY][maskX] > threshold) kept++
            }
        }
        return kept * 100 / (width * height)
    }

    /**
     * Apply mask với feathered edges — edges mượt hơn, không có hard cutoff.
     *
     * @param innerThreshold Vùng chắc chắn giữ lại (mặc định 0.6)
     * @param outerThreshold Vùng chắc chắn bỏ (mặc định 0.3)
     */
    fun applyMaskToFullFrameWithFeather(
        fullFrame: Bitmap,
        segDet: SegmentationDetection,
        innerThreshold: Float = Config.MASK_INNER_THRESHOLD,
        outerThreshold: Float = Config.MASK_OUTER_THRESHOLD
    ): Bitmap {
        val frameWidth = fullFrame.width
        val frameHeight = fullFrame.height

        val maskData = segDet.maskData
        if (maskData == null) {
            Log.w(TAG, "⚠️ No maskData — returning original frame")
            return fullFrame.copy(Bitmap.Config.ARGB_8888, false)
        }

        val reconstructedMask = maskData.reconstructedMask
            ?: SegmentationHelper.reconstructMask(maskData.maskCoeffs, maskData.protoMasks)

        val boxLetterbox = maskData.boxLetterbox
        val boxLeftPx   = (boxLetterbox.left   * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE - 1)
        val boxTopPx    = (boxLetterbox.top    * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE - 1)
        val boxRightPx  = (boxLetterbox.right  * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE)
        val boxBottomPx = (boxLetterbox.bottom * PROTO_SIZE).toInt().coerceIn(0, PROTO_SIZE)

        val boxMaskW = maxOf(1, boxRightPx - boxLeftPx)
        val boxMaskH = maxOf(1, boxBottomPx - boxTopPx)

        val croppedProtoMask = Array(boxMaskH) { row ->
            Array(boxMaskW) { col ->
                reconstructedMask[boxTopPx + row][boxLeftPx + col]
            }
        }

        val scaledMask = SegmentationHelper.resizeMaskToBox(croppedProtoMask, frameWidth, frameHeight)

        return applyFeatheredBackground(fullFrame, scaledMask, innerThreshold, outerThreshold)
    }

    /**
     * Apply feathered transparent background — edges có alpha transition mượt.
     */
    private fun applyFeatheredBackground(
        bitmap: Bitmap,
        mask: Array<Array<Float>>,
        innerThreshold: Float,
        outerThreshold: Float
    ): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        val maskHeight = mask.size
        val maskWidth = if (mask.isNotEmpty()) mask[0].size else 0

        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

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

                val newAlpha = when {
                    maskValue >= innerThreshold -> 255
                    maskValue <= outerThreshold -> 0
                    else -> {
                        val alpha = ((maskValue - outerThreshold) / (innerThreshold - outerThreshold)).coerceIn(0f, 1f)
                        (alpha * 255).toInt().coerceIn(0, 255)
                    }
                }

                resultPixels[idx] = (newAlpha shl 24) or (r shl 16) or (g shl 8) or b
            }
        }

        result.setPixels(resultPixels, 0, width, 0, 0, width, height)
        Log.d(TAG, "🎭 FEATHERED mask applied: ${width}x${height}")
        return result
    }
}
