package com.mvp.orilife.image

import android.graphics.*
import android.util.Log
import androidx.camera.core.ImageProxy
import java.nio.ByteBuffer

data class ProcessedImage(
    val bitmap: Bitmap,
    val originalWidth: Int,
    val originalHeight: Int,
    val rotationDegrees: Int
)

data class LetterboxResult(
    val bitmap: Bitmap,
    val padLeft: Int,
    val padTop: Int,
    val ratio: Float,
    val scaledWidth: Int,
    val scaledHeight: Int
)

class ImageProcessor {

    // Reusable objects to avoid GC pressure
    private var cachedRgbBuffer: IntArray? = null
    private var cachedYBytes: ByteArray? = null
    private var cachedUBytes: ByteArray? = null
    private var cachedVBytes: ByteArray? = null
    private val letterboxPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val rotatePaint = Paint(Paint.FILTER_BITMAP_FLAG)

    fun processImageProxy(image: ImageProxy): ProcessedImage? {
        val rotationDegrees = image.imageInfo.rotationDegrees
        val rawBitmap = yuvToRgbBitmap(image) ?: return null

        // Rotate bitmap so YOLO sees the image in correct display orientation.
        // Sensor image is landscape (640x480), rotation=90 means rotate CW → portrait (480x640).
        // This way YOLO detects trees upright, and output boxes are in portrait coords
        // matching PreviewView display directly — no further rotation remap needed.
        val finalBitmap = if (rotationDegrees != 0) {
            val (_, _, rotated) = rotateBitmap(rawBitmap, rotationDegrees)
            rotated
        } else {
            rawBitmap
        }

        return ProcessedImage(
            bitmap = finalBitmap,
            originalWidth = finalBitmap.width,
            originalHeight = finalBitmap.height,
            rotationDegrees = 0  // Already rotated — no further rotation needed
        )
    }

    /**
     * Optimized YUV_420_888 → ARGB_8888 Bitmap conversion.
     * Bulk-copies Y/U/V planes to ByteArray first (avoids per-pixel ByteBuffer.get() overhead).
     * Reuses all buffers across frames to minimize GC pressure.
     */
    private fun yuvToRgbBitmap(image: ImageProxy): Bitmap? {
        try {
            val width = image.width
            val height = image.height

            val yPlane = image.planes[0]
            val uPlane = image.planes[1]
            val vPlane = image.planes[2]

            val yRowStride = yPlane.rowStride
            val uvRowStride = uPlane.rowStride
            val uvPixelStride = uPlane.pixelStride

            // Bulk copy planes to byte arrays (much faster than per-pixel ByteBuffer.get)
            val yBuffer = yPlane.buffer
            val uBuffer = uPlane.buffer
            val vBuffer = vPlane.buffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            if (cachedYBytes == null || cachedYBytes!!.size < ySize) cachedYBytes = ByteArray(ySize)
            if (cachedUBytes == null || cachedUBytes!!.size < uSize) cachedUBytes = ByteArray(uSize)
            if (cachedVBytes == null || cachedVBytes!!.size < vSize) cachedVBytes = ByteArray(vSize)

            val yBytes = cachedYBytes!!
            val uBytes = cachedUBytes!!
            val vBytes = cachedVBytes!!

            yBuffer.position(0); yBuffer.get(yBytes, 0, ySize)
            uBuffer.position(0); uBuffer.get(uBytes, 0, uSize)
            vBuffer.position(0); vBuffer.get(vBytes, 0, vSize)

            // Reuse RGB output buffer
            val totalPixels = width * height
            if (cachedRgbBuffer == null || cachedRgbBuffer!!.size < totalPixels) {
                cachedRgbBuffer = IntArray(totalPixels)
            }
            val rgbBuffer = cachedRgbBuffer!!

            // Convert YUV → RGB using byte arrays (no per-pixel ByteBuffer overhead)
            for (row in 0 until height) {
                val yRowOffset = row * yRowStride
                val uvRow = row shr 1
                val uvRowOffset = uvRow * uvRowStride

                for (col in 0 until width) {
                    val y = yBytes[yRowOffset + col].toInt() and 0xFF
                    val uvIndex = uvRowOffset + (col shr 1) * uvPixelStride
                    val u = (uBytes[uvIndex].toInt() and 0xFF) - 128
                    val v = (vBytes[uvIndex].toInt() and 0xFF) - 128

                    var r = y + (1.370705f * v).toInt()
                    var g = y - (0.337633f * u).toInt() - (0.698001f * v).toInt()
                    var b = y + (1.732446f * u).toInt()

                    if (r < 0) r = 0 else if (r > 255) r = 255
                    if (g < 0) g = 0 else if (g > 255) g = 255
                    if (b < 0) b = 0 else if (b > 255) b = 255

                    rgbBuffer[row * width + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                }
            }

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.setPixels(rgbBuffer, 0, width, 0, 0, width, height)
            return bitmap
        }catch (e: Exception) {
            Log.e("ImageProcessor", "YUV→RGB failed: ${e.message}")
            return null
        }
    }

    private fun rotateBitmap(bitmap: Bitmap, degrees: Int): Triple<Int, Int, Bitmap> {
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated != bitmap) {
            bitmap.recycle()
        }
        return Triple(rotated.width, rotated.height, rotated)
    }

    /**
     * Create letterbox image matching Python/YOLO exactly:
     *   r = min(640/w, 640/h)
     *   pad = (640 - new) / 2
     *   fill color = (114, 114, 114)
     */
    fun createLetterbox(
        source: Bitmap,
        targetWidth: Int,
        targetHeight: Int
    ): LetterboxResult {
        val sourceWidth = source.width.toFloat()
        val sourceHeight = source.height.toFloat()

        val ratio = minOf(targetWidth / sourceWidth, targetHeight / sourceHeight)

        val newWidth = (sourceWidth * ratio).toInt()
        val newHeight = (sourceHeight * ratio).toInt()

        val padLeft = (targetWidth - newWidth) / 2
        val padTop = (targetHeight - newHeight) / 2

        val letterbox = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(letterbox)
        canvas.drawColor(Color.rgb(114, 114, 114))

        val srcRect = Rect(0, 0, source.width, source.height)
        val dstRect = Rect(padLeft, padTop, padLeft + newWidth, padTop + newHeight)
        canvas.drawBitmap(source, srcRect, dstRect, letterboxPaint)

        return LetterboxResult(letterbox, padLeft, padTop, ratio, newWidth, newHeight)
    }

    fun calculateIoU(box1: RectF, box2: RectF): Float {
        val x1 = maxOf(box1.left, box2.left)
        val y1 = maxOf(box1.top, box2.top)
        val x2 = minOf(box1.right, box2.right)
        val y2 = minOf(box1.bottom, box2.bottom)
        val intersection = maxOf(0f, x2 - x1) * maxOf(0f, y2 - y1)
        val area1 = box1.width() * box1.height()
        val area2 = box2.width() * box2.height()
        val union = area1 + area2 - intersection
        return if (union > 0f) intersection / union else 0f
    }
}
