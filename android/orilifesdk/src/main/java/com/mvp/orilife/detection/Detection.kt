package com.mvp.orilife.detection

import android.graphics.RectF

data class Detection(
    val boundingBox: RectF,
    val categories: List<Category>
) {
    val confidence: Float get() = categories.firstOrNull()?.score ?: 0f
    val label: String get() = categories.firstOrNull()?.label ?: ""

    companion object {
        fun create(boundingBox: RectF, categories: List<Category>) = Detection(boundingBox, categories)
    }
}

data class Category(
    val label: String,
    val score: Float
)

/**
 * Dữ liệu mask từ YOLOv2.6 Seg model
 *
 * Mask được reconstruct từ:
 *   - 32 mask coefficients từ output[0][i][6:38]
 *   - 32 prototype masks từ output[1][1][160][160][32]
 *
 * LƯU Ý QUAN TRỌNG về tọa độ:
 *   boxLetterbox = bounding box trong LETTERBOX 640×640 space, normalized [0,1]
 *   → boxLetterbox * 160 = proto mask crop coords (để crop mask 160×160)
 *
 *   KHÔNG dùng original image coords vì mask 160×160 được crop từ proto space,
 *   và proto space tương ứng với letterbox 640×640, không phải ảnh gốc.
 */
data class MaskData(
    val maskCoeffs: FloatArray,                    // 32 coefficients
    val protoMasks: Array<Array<FloatArray>>,      // [32][160][160] prototype masks (NHWC)
    val reconstructedMask: Array<Array<Float>>? = null, // sau khi reconstruct
    /**
     * Bounding box trong LETTERBOX 640×640 space, normalized [0,1].
     * Khi crop proto mask: cropCoords = (boxLetterbox * 160).toInt()
     *
     * Để convert về original image coords (cho display/overlay):
     *   origX1 = boxLetterbox.left * 640 * IMG_SIZE / originalWidth  (sau khi unletterbox)
     *   Nhưng cho background removal: dùng trực tiếp boxLetterbox * 160 để crop proto mask
     */
    val boxLetterbox: RectF
) {
    val confidence: Float get() = maskCoeffs.maxOrNull() ?: 0f

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as MaskData
        if (!maskCoeffs.contentEquals(other.maskCoeffs)) return false
        return true
    }

    override fun hashCode(): Int = maskCoeffs.contentHashCode()
}

data class SegmentationDetection(
    val boundingBox: RectF,
    val categories: List<Category>,
    val maskData: MaskData? = null    // ✅ THAY: mask → maskData
) {
    val confidence: Float get() = categories.firstOrNull()?.score ?: 0f
    val label: String get() = categories.firstOrNull()?.label ?: ""

    companion object {
        fun create(boundingBox: RectF, categories: List<Category>) =
            SegmentationDetection(boundingBox, categories, null)

        fun create(boundingBox: RectF, categories: List<Category>, maskData: MaskData?) =
            SegmentationDetection(boundingBox, categories, maskData)
    }
}

/**
 * Kết quả crop - mở rộng để lưu maskData
 *
 * @param segmentationDetection SegmentationDetection với maskData (cho upload masked image)
 */
