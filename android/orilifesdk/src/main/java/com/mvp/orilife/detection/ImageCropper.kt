package com.mvp.orilife.detection

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.RectF
import android.util.Log

data class CropResult(
    val croppedBitmap: Bitmap,
    val relativeBoxCoordinates: FloatArray, // [x_offset, y_offset, width, height] in cropped image
    val normalizedBoxCoordinates: FloatArray, // [left, top, right, bottom] normalized 0-1 in cropped image
    val paddingRatio: Float,
    val segmentationDetection: SegmentationDetection? = null  // ✅ THÊM: lưu maskData cho upload
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as CropResult
        if (croppedBitmap != other.croppedBitmap) return false
        if (!relativeBoxCoordinates.contentEquals(other.relativeBoxCoordinates)) return false
        if (!normalizedBoxCoordinates.contentEquals(other.normalizedBoxCoordinates)) return false
        if (paddingRatio != other.paddingRatio) return false
        return true
    }

    override fun hashCode(): Int {
        var result = croppedBitmap.hashCode()
        result = 31 * result + relativeBoxCoordinates.contentHashCode()
        result = 31 * result + normalizedBoxCoordinates.contentHashCode()
        result = 31 * result + paddingRatio.hashCode()
        return result
    }
}

object ImageCropper {

    private const val DEFAULT_PADDING_PERCENT = 0.30f  // Tăng lên 30% để có nhiều context cho AI
    private const val MIN_PADDING = 30  // Tăng lên 30 pixels
    private const val MAX_PADDING = 120  // Tăng lên 120 pixels

    /**
     * Áp mask vào bitmap đã crop - biến vùng ngoài mask thành transparent.
     *
     * ✅ FIX: Mask 160×160 được reconstruct từ YOLO output, đại diện cho toàn bộ
     * ảnh 640×640 (letterboxed). Vùng cây chỉ chiếm 1 phần nhỏ trong 160×160.
     *
     * Nếu resize 160×160 → full crop rồi apply → mask bị kéo giãn → tree region
     * trở thành 1 pixel mỏng trên ảnh lớn → toàn transparent → ảnh toàn đen.
     *
     * ✅ FIX: Chỉ crop vùng Bounding Box từ 160×160 trước, rồi resize vùng đó
     * lên kích thước crop → mask đúng tỷ lệ với vùng cây trong ảnh.
     *
     * @param croppedBitmap Bitmap đã crop (từ cropDetection/cropAllDetections)
     * @param maskData MaskData từ SegmentationDetection
     * @param boxInCrop Tọa độ box TRONG ẢNH CROP (normalized 0-1).
     *                    Dùng để crop đúng vùng từ mask 160×160.
     * @param threshold Ngưỡng sigmoid [0-1], mặc định 0.5
     * @return Bitmap mới với background transparent, vùng mask giữ nguyên màu.
     *         Lưu dạng PNG để transparent được giữ.
     */
    fun applyMaskToCrop(
        croppedBitmap: Bitmap,
        maskData: MaskData,
        boxInCrop: RectF,
        threshold: Float = 0.5f
    ): Bitmap {
        val cropWidth = croppedBitmap.width
        val cropHeight = croppedBitmap.height

        Log.d("ImageCropper", "🔬 MASK: crop=${cropWidth}x${cropHeight}, boxInCrop=[${"%.3f".format(boxInCrop.left)},${"%.3f".format(boxInCrop.top)},${"%.3f".format(boxInCrop.right)},${"%.3f".format(boxInCrop.bottom)}]")

        // 1. Reconstruct mask 160×160 từ coefficients + prototype masks
        val reconstructedMask = maskData.reconstructedMask
            ?: SegmentationHelper.reconstructMask(maskData.maskCoeffs, maskData.protoMasks)

        val coeffsMean = maskData.maskCoeffs.let { arr -> arr.sum() / arr.size }
        Log.d("ImageCropper", "🔬 MASK: coeffsMean=${"%.4f".format(coeffsMean)}, protoSize=${reconstructedMask.size}x${reconstructedMask[0].size}")

        // 2. ✅ KEY FIX: Crop mask 160×160 theo vùng bounding box TRƯỚC khi resize
        // boxInCrop normalized trong crop space [0,1] → map sang 160×160 coords
        // boxInCrop.left=0, boxInCrop.top=0, boxInCrop.right=0.3, boxInCrop.bottom=0.4
        // → maskX = box.left * 160, maskY = box.top * 160, etc.
        val protoSize = 160
        val boxLeftPx   = (boxInCrop.left   * protoSize).toInt().coerceIn(0, protoSize - 1)
        val boxTopPx    = (boxInCrop.top    * protoSize).toInt().coerceIn(0, protoSize - 1)
        val boxRightPx  = (boxInCrop.right  * protoSize).toInt().coerceIn(0, protoSize)
        val boxBottomPx = (boxInCrop.bottom * protoSize).toInt().coerceIn(0, protoSize)

        val boxMaskW = maxOf(1, boxRightPx - boxLeftPx)
        val boxMaskH = maxOf(1, boxBottomPx - boxTopPx)
        Log.d("ImageCropper", "🔬 MASK: crop proto [${boxLeftPx}:${boxRightPx}]x[${boxTopPx}:${boxBottomPx}] = ${boxMaskW}x${boxMaskH}")

        // Crop mask 160×160 → vùng box (inner Array<Float> để tương thích với resizeMaskToBox)
        val croppedProtoMask = Array(boxMaskH) { row ->
            Array(boxMaskW) { col ->
                reconstructedMask[boxTopPx + row][boxLeftPx + col]
            }
        }

        // 3. Resize cropped proto mask → kích thước CROP (không phải full 160×160)
        val scaledMask = SegmentationHelper.resizeMaskToBox(croppedProtoMask, cropWidth, cropHeight)
        Log.d("ImageCropper", "🔬 MASK: scaled ${boxMaskW}x${boxMaskH} → ${cropWidth}x${cropHeight}")

        // 4. Áp mask: background → transparent, tree → giữ nguyên
        return SegmentationHelper.applyMaskToBitmap(croppedBitmap, scaledMask, threshold)
    }

    /**
     * Áp mask với feathered edges (đẹp hơn cho visual).
     * Cùng logic crop-mask-theo-box như applyMaskToCrop.
     */
    fun applyMaskToCropWithFeather(
        croppedBitmap: Bitmap,
        maskData: MaskData,
        boxInCrop: RectF,
        innerThreshold: Float = 0.6f,
        outerThreshold: Float = 0.3f
    ): Bitmap {
        val cropWidth = croppedBitmap.width
        val cropHeight = croppedBitmap.height

        val reconstructedMask = maskData.reconstructedMask
            ?: SegmentationHelper.reconstructMask(maskData.maskCoeffs, maskData.protoMasks)

        // ✅ Same box-based crop như applyMaskToCrop
        val protoSize = 160
        val boxLeftPx   = (boxInCrop.left   * protoSize).toInt().coerceIn(0, protoSize - 1)
        val boxTopPx    = (boxInCrop.top    * protoSize).toInt().coerceIn(0, protoSize - 1)
        val boxRightPx  = (boxInCrop.right  * protoSize).toInt().coerceIn(0, protoSize)
        val boxBottomPx = (boxInCrop.bottom * protoSize).toInt().coerceIn(0, protoSize)
        val boxMaskW = maxOf(1, boxRightPx - boxLeftPx)
        val boxMaskH = maxOf(1, boxBottomPx - boxTopPx)

        val croppedProtoMask = Array(boxMaskH) { row ->
            Array(boxMaskW) { col ->
                reconstructedMask[boxTopPx + row][boxLeftPx + col]
            }
        }

        val scaledMask = SegmentationHelper.resizeMaskToBox(croppedProtoMask, cropWidth, cropHeight)
        Log.d("ImageCropper", "🔬 MASK_FEATHER: ${boxMaskW}x${boxMaskH} → ${cropWidth}x${cropHeight}")

        return SegmentationHelper.applyMaskWithFeather(croppedBitmap, scaledMask, innerThreshold, outerThreshold)
    }

    fun cropDetection(originalBitmap: Bitmap, boundingBox: RectF, paddingPercent: Float = DEFAULT_PADDING_PERCENT): CropResult? {
        return cropWithPadding(originalBitmap, boundingBox, paddingPercent)
    }

    fun cropWithPadding(originalBitmap: Bitmap, boundingBox: RectF, paddingPercent: Float = DEFAULT_PADDING_PERCENT): CropResult? {
        try {
            val iw = originalBitmap.width; val ih = originalBitmap.height
            val bL = boundingBox.left.toInt().coerceIn(0, iw); val bT = boundingBox.top.toInt().coerceIn(0, ih)
            val bR = boundingBox.right.toInt().coerceIn(0, iw); val bB = boundingBox.bottom.toInt().coerceIn(0, ih)
            val bw = bR - bL; val bh = bB - bT
            if (bw <= 0 || bh <= 0) return null
            val px = (bw * paddingPercent).toInt().coerceIn(MIN_PADDING, MAX_PADDING)
            val py = (bh * paddingPercent).toInt().coerceIn(MIN_PADDING, MAX_PADDING)
            val l = (bL - px).coerceAtLeast(0); val t = (bT - py).coerceAtLeast(0)
            val r = (bR + px).coerceAtMost(iw); val b = (bB + py).coerceAtMost(ih)
            val cw = r - l; val ch = b - t
            if (cw <= 0 || ch <= 0) return null
            
            // Relative coordinates in cropped image (pixels)
            val relX = (bL - l).toFloat()
            val relY = (bT - t).toFloat()
            val relW = bw.toFloat()
            val relH = bh.toFloat()
            
            // Normalized coordinates in cropped image (0-1)
            val normLeft = relX / cw
            val normTop = relY / ch
            val normRight = (relX + relW) / cw
            val normBottom = (relY + relH) / ch
            
            return CropResult(
                createHighQualityCrop(originalBitmap, l, t, cw, ch),
                floatArrayOf(relX, relY, relW, relH),
                floatArrayOf(normLeft, normTop, normRight, normBottom),
                paddingPercent
            )
        } catch (e: Exception) { Log.e("ImageCropper", "Crop failed: ${e.message}"); return null }
    }

    fun cropAllDetections(originalBitmap: Bitmap, boundingBoxes: List<RectF>, paddingPercent: Float = DEFAULT_PADDING_PERCENT): CropResult? {
        if (boundingBoxes.isEmpty()) return null
        try {
            val iw = originalBitmap.width; val ih = originalBitmap.height
            val mL = boundingBoxes.minOf { it.left }.toInt().coerceIn(0, iw)
            val mT = boundingBoxes.minOf { it.top }.toInt().coerceIn(0, ih)
            val mR = boundingBoxes.maxOf { it.right }.toInt().coerceIn(0, iw)
            val mB = boundingBoxes.maxOf { it.bottom }.toInt().coerceIn(0, ih)
            val uw = mR - mL; val uh = mB - mT
            if (uw <= 0 || uh <= 0) return null
            val px = (uw * paddingPercent).toInt().coerceIn(MIN_PADDING, MAX_PADDING)
            val py = (uh * paddingPercent).toInt().coerceIn(MIN_PADDING, MAX_PADDING)
            val l = (mL - px).coerceAtLeast(0); val t = (mT - py).coerceAtLeast(0)
            val r = (mR + px).coerceAtMost(iw); val b = (mB + py).coerceAtMost(ih)
            val cw = r - l; val ch = b - t
            if (cw <= 0 || ch <= 0) return null
            
            // Relative coordinates in cropped image (pixels)
            val relX = (mL - l).toFloat()
            val relY = (mT - t).toFloat()
            val relW = uw.toFloat()
            val relH = uh.toFloat()
            
            // Normalized coordinates in cropped image (0-1)
            val normLeft = relX / cw
            val normTop = relY / ch
            val normRight = (relX + relW) / cw
            val normBottom = (relY + relH) / ch
            
            Log.d("ImageCropper", "📦 Crop ALL detections:")
            Log.d("ImageCropper", "   Original: ${iw}x${ih}")
            Log.d("ImageCropper", "   Cropped: ${cw}x${ch}")
            Log.d("ImageCropper", "   Relative box: [${relX}, ${relY}, ${relW}, ${relH}]")
            Log.d("ImageCropper", "   Normalized box: [${normLeft}, ${normTop}, ${normRight}, ${normBottom}]")
            
            return CropResult(
                createHighQualityCrop(originalBitmap, l, t, cw, ch),
                floatArrayOf(relX, relY, relW, relH),
                floatArrayOf(normLeft, normTop, normRight, normBottom),
                paddingPercent
            )
        } catch (e: Exception) { Log.e("ImageCropper", "CropAll failed: ${e.message}"); return null }
    }
    
    /**
     * Tạo crop chất lượng cao với bilinear filtering
     * Tránh ảnh bị mờ/pixelated khi gửi lên server
     * Tối ưu cho bark texture identification (SAM + DINO + SuperPoint)
     */
    private fun createHighQualityCrop(source: Bitmap, x: Int, y: Int, width: Int, height: Int): Bitmap {
        // Tạo bitmap mới với config ARGB_8888 (chất lượng cao nhất)
        val cropped = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(cropped)
        
        // Sử dụng Paint với FILTER_BITMAP_FLAG để có bilinear filtering
        val paint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG or android.graphics.Paint.ANTI_ALIAS_FLAG)
        paint.isFilterBitmap = true
        paint.isDither = false  // Tắt dithering để giữ nguyên texture detail
        
        // Vẽ phần crop từ source bitmap
        val srcRect = android.graphics.Rect(x, y, x + width, y + height)
        val dstRect = android.graphics.Rect(0, 0, width, height)
        canvas.drawBitmap(source, srcRect, dstRect, paint)
        
        // Tắt sharpening - JPEG quality 98% đã đủ tốt
        // Over-sharpening gây nhiễu và artifacts
        
        Log.d("ImageCropper", "🎨 High-quality crop: ${width}x${height}from source ${source.width}x${source.height}")
        
        return cropped
    }
    
}
