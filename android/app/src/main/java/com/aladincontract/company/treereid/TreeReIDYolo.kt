package com.aladincontract.company.treereid

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.common.ops.NormalizeOp
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Gate chất-lượng chụp bằng YOLO (yolov26seg.tflite) — Plan A (khôi phục theo ý anh).
 *
 * MỤC ĐÍCH DUY NHẤT: lọc frame CÓ / KHÔNG có cây trước khi cho phép chụp, để không
 * đẩy rác lên server. KHÔNG dùng segmentation/mask — chỉ lấy MAX confidence các box
 * (rẻ, đủ để gate). Chạy trên frame ImageAnalysis của cam preview hiện tại.
 *
 * Model: android/app/src/main/assets/yolov26seg.tflite (tự bỏ vào — cùng tên cũ).
 * Nếu THIẾU model / nạp lỗi → available=false → gate KHÔNG chặn (fallback stillness),
 * để build/test vẫn chạy khi chưa có file model.
 *
 * I/O (khớp model cũ YOLOv2.6 Seg): input [1,640,640,3] FLOAT32 [0,1];
 * output[0]=[1,300,38] (cx,cy,w,h,conf,cls + 32 mask coeff), output[1]=proto (bỏ qua).
 */
object TreeReIDYolo {
    private const val TAG = "TreeReIDYolo"
    private const val MODEL = "yolov26seg.tflite"
    private const val INPUT = 640
    private const val NUM_DET = 300
    private const val VALUES = 38     // 6 box + 32 mask coeff
    private const val CONF_IDX = 4    // cx,cy,w,h,[conf],cls
    private const val PROTO = 160
    private const val PROTOS = 32

    /** Ngưỡng coi là "có cây trong khung". Hạ 0.25 để KHÔNG chặn oan khi thân/vỏ bị
     *  lá che một phần (cây rậm) — ReID chỉ cần thấy phần thân/vỏ. Chỉnh theo thực địa. */
    const val CONF_THRESHOLD = 0.25f

    /** 1 box đã phát hiện — toạ độ chuẩn-hoá [0,1] theo frame (đã xoay về portrait). */
    data class Box(val x: Float, val y: Float, val w: Float, val h: Float, val conf: Float)

    /** Box gần nhất (cho overlay). Rỗng khi không có/không sẵn. */
    @Volatile
    var latestBoxes: List<Box> = emptyList()
        private set

    @Volatile
    private var interpreter: Interpreter? = null

    /** True khi model đã nạp — gate hoạt động. False → gate bỏ qua (fallback). */
    @Volatile
    var available = false
        private set

    private val preproc = ImageProcessor.Builder()
        .add(ResizeOp(INPUT, INPUT, ResizeOp.ResizeMethod.BILINEAR))
        .add(NormalizeOp(0f, 255f))   // [0,255] → [0,1] (khớp Python /255)
        .build()

    /** Nạp model (idempotent). Gọi khi bắt đầu phiên chụp. */
    @Synchronized
    fun ensureLoaded(context: Context) {
        if (interpreter != null) return
        try {
            val buf = FileUtil.loadMappedFile(context.applicationContext, MODEL)
            interpreter = Interpreter(buf, Interpreter.Options().apply { setNumThreads(2) })
            available = true
            Log.d(TAG, "✅ $MODEL đã nạp — gate YOLO BẬT")
        } catch (e: Throwable) {
            interpreter = null
            available = false
            Log.w(TAG, "⚠️ $MODEL chưa có/nạp lỗi — gate YOLO TẮT (fallback stillness): ${e.message}")
        }
    }

    /**
     * Trả MAX confidence các box trong frame. `-1f` nếu detector chưa sẵn sàng
     * (caller coi như PASS — không chặn). Chạy trên executor phân-tích (nền).
     */
    fun detect(bitmap: Bitmap): Float {
        val itp = interpreter ?: return -1f
        return try {
            val img = TensorImage(DataType.FLOAT32).apply { load(bitmap) }
            val input = preproc.process(img).buffer
            val outBoxes = Array(1) { Array(NUM_DET) { FloatArray(VALUES) } }
            // Model có 2 output; phải cấp buffer output[1] dù không dùng.
            val outProto = ByteBuffer
                .allocateDirect(1 * PROTO * PROTO * PROTOS * 4)
                .order(ByteOrder.LITTLE_ENDIAN)
            itp.runForMultipleInputsOutputs(
                arrayOf(input),
                mapOf(0 to outBoxes, 1 to outProto),
            )
            // Output[0] = [x1,y1,x2,y2 (norm 640=norm frame), conf, cls, +32 mask].
            var max = 0f
            val boxes = ArrayList<Box>(8)
            for (d in outBoxes[0]) {
                val c = d[CONF_IDX]
                if (c > max) max = c
                if (c >= CONF_THRESHOLD) {
                    val x1 = d[0].coerceIn(0f, 1f)
                    val y1 = d[1].coerceIn(0f, 1f)
                    val x2 = d[2].coerceIn(0f, 1f)
                    val y2 = d[3].coerceIn(0f, 1f)
                    if (x2 > x1 && y2 > y1) boxes.add(Box(x1, y1, x2 - x1, y2 - y1, c))
                }
            }
            latestBoxes = boxes
            max
        } catch (e: Throwable) {
            // Sai shape/model → tắt gate để không chặn oan (log để chỉnh).
            Log.w(TAG, "detect lỗi (tắt gate): ${e.message}")
            available = false
            latestBoxes = emptyList()
            -1f
        }
    }

    /** true nếu frame đạt ngưỡng (có cây). Detector tắt → luôn true (không chặn). */
    fun hasTarget(bitmap: Bitmap): Boolean {
        val c = detect(bitmap)
        return c < 0f || c >= CONF_THRESHOLD
    }

    @Synchronized
    fun close() {
        try { interpreter?.close() } catch (_: Throwable) {}
        interpreter = null
        available = false
    }
}
