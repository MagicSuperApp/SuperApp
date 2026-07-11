package com.aladincontract.company.treereid

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

/**
 * Resize + nén ảnh cho TreeReID — khớp iOS ImageProcessor:
 * max 1280px (giữ tỉ lệ), JPEG quality 0.85, xử lý EXIF orientation.
 */
object TreeReIDImageUtil {

    private const val MAX_DIM = 1280
    private const val QUALITY = 85

    data class Processed(val file: File, val width: Int, val height: Int)

    /** Xử lý 1 file JPEG (từ CameraX) → resize/nén, lưu file mới trong [dstDir]. */
    fun processFile(src: File, dstDir: File): Processed {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(src.absolutePath, bounds)
        val sample = calcInSampleSize(bounds.outWidth, bounds.outHeight, MAX_DIM)

        val decoded = BitmapFactory.decodeFile(
            src.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: throw IOException("Không decode được ảnh: ${src.absolutePath}")

        val oriented = applyExifOrientation(src, decoded)
        val scaled = scaleToMax(oriented, MAX_DIM)
        return writeJpeg(scaled, dstDir)
    }

    /** Decode base64 (có/không prefix data URI) → resize/nén, lưu file mới. */
    fun processBase64(data: String, dstDir: File): Processed {
        val pure = data.substringAfter("base64,", data)
        val bytes = Base64.decode(pure, Base64.DEFAULT)
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw IOException("Không decode được base64 ảnh")
        val scaled = scaleToMax(decoded, MAX_DIM)
        return writeJpeg(scaled, dstDir)
    }

    private fun writeJpeg(bmp: Bitmap, dstDir: File): Processed {
        if (!dstDir.exists()) dstDir.mkdirs()
        val dst = File(dstDir, "treeid_${UUID.randomUUID()}.jpg")
        FileOutputStream(dst).use { out ->
            bmp.compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
        }
        return Processed(dst, bmp.width, bmp.height)
    }

    private fun calcInSampleSize(w: Int, h: Int, maxDim: Int): Int {
        var sample = 1
        var cw = w
        var ch = h
        // Downsample tới khi cạnh lớn nhất <= 2*maxDim (giữ chất lượng cho bước scale mịn sau).
        while ((cw / 2) >= maxDim && (ch / 2) >= maxDim) {
            cw /= 2
            ch /= 2
            sample *= 2
        }
        return sample
    }

    private fun scaleToMax(src: Bitmap, maxDim: Int): Bitmap {
        val w = src.width
        val h = src.height
        val longest = maxOf(w, h)
        if (longest <= maxDim) return src
        val ratio = maxDim.toFloat() / longest.toFloat()
        val nw = (w * ratio).toInt().coerceAtLeast(1)
        val nh = (h * ratio).toInt().coerceAtLeast(1)
        val scaled = Bitmap.createScaledBitmap(src, nw, nh, true)
        if (scaled != src) src.recycle()
        return scaled
    }

    private fun applyExifOrientation(src: File, bmp: Bitmap): Bitmap {
        val orientation = try {
            ExifInterface(src.absolutePath)
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
            else -> return bmp
        }
        val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        if (rotated != bmp) bmp.recycle()
        return rotated
    }
}
