package com.mvp.orilife.detection

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import android.util.Log
import com.mvp.orilife.Config
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import org.tensorflow.lite.nnapi.NnApiDelegate
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.ops.ResizeOp
import org.tensorflow.lite.support.common.ops.NormalizeOp
import org.tensorflow.lite.support.image.TensorImage
import java.nio.ByteBuffer
import kotlin.math.abs

data class LetterboxInfo(
    val ratio: Float,
    val padWidth: Float,
    val padHeight: Float
)

// ========== Constants cho YOLOv2.6 Seg model ==========
private object YOLOSegConst {
    const val NUM_DETECTIONS = 300
    const val NUM_BOX_VALUES = 6        // cx, cy, w, h, conf, classId
    const val NUM_MASK_COEFFS = 32      // 32 mask coefficients per detection
    const val TOTAL_VALUES = 38         // 6 box + 32 mask coeffs
    const val PROTO_SIZE = 160          // prototype mask size (160×160)
    const val NUM_PROTOS = 32           // 32 prototype masks
}

class YOLODetectionHelper(
    var threshold: Float = Config.YOLO_CONFIDENCE_THRESHOLD,
    var numThreads: Int = Config.NUM_THREADS,
    var maxResults: Int = Config.MAX_RESULTS,
    val context: Context,
    val listener: DetectionListener?
) {
    interface DetectionListener {
        fun onError(error: String)
        fun onResults(
            results: List<Detection>?,
            inferenceTime: Long,
            imageHeight: Int,
            imageWidth: Int,
            croppedImage: Bitmap?,
            imageFilePath: String?
        )
    }

    private var interpreter: Interpreter? = null
    private var isInitialized = false
    private val inputSize = 640
    private var gpuDelegate: GpuDelegate? = null
    private var nnApiDelegate: NnApiDelegate? = null
    private var inferenceCount = 0
    private var lastDetailedLog = 0L
    private var hasLoggedOutputFormat = false

    init { setupInterpreter() }

    private fun setupInterpreter() {
        try {
            val modelBuffer = FileUtil.loadMappedFile(context, "yolov26seg.tflite")
            val tempInterpreter = Interpreter(modelBuffer)

            Log.d(TAG, "📦 Model: yolov26seg.tflite")
            for (i in 0 until tempInterpreter.inputTensorCount) {
                Log.d(TAG, "   Input[$i] shape: ${tempInterpreter.getInputTensor(i).shape().contentToString()}, dtype: ${tempInterpreter.getInputTensor(i).dataType()}")
            }
            for (i in 0 until tempInterpreter.outputTensorCount) {
                Log.d(TAG, "   Output[$i] shape: ${tempInterpreter.getOutputTensor(i).shape().contentToString()}, dtype: ${tempInterpreter.getOutputTensor(i).dataType()}")
            }
            tempInterpreter.close()

            val options = Interpreter.Options().apply { setNumThreads(numThreads) }

            if (Config.ENABLE_GPU_DELEGATE) {
                try {
                    gpuDelegate = GpuDelegate()
                    options.addDelegate(gpuDelegate)
                } catch (e: Exception) {
                    gpuDelegate?.close(); gpuDelegate = null
                    if (Config.ENABLE_NNAPI_DELEGATE) {
                        try { nnApiDelegate = NnApiDelegate(); options.addDelegate(nnApiDelegate) }
                        catch (e2: Exception) { nnApiDelegate?.close(); nnApiDelegate = null }
                    }
                }
            }

            interpreter = Interpreter(modelBuffer, options)
            isInitialized = true
            inferenceCount = 0
            Log.d(TAG, "✅ YOLOv2.6 Seg model loaded successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize YOLOv2.6 Seg model", e)
            listener?.onError("Init failed: ${e.message}")
            isInitialized = false
        }
    }

    private fun preprocessImage(bitmap: Bitmap): TensorImage {
        // Match Python: img.astype(np.float32) / 255.0
        // TensorImage.load(bitmap) keeps pixel values [0, 255] — must normalize to [0, 1]
        val proc = ImageProcessor.Builder()
            .add(ResizeOp(inputSize, inputSize, ResizeOp.ResizeMethod.BILINEAR))
            .add(NormalizeOp(0f, 255f))  // [0,255] → [0,1]
            .build()
        val img = TensorImage(DataType.FLOAT32)
        img.load(bitmap)
        return proc.process(img)
    }

    fun detect(letterboxImage: Bitmap, originalWidth: Int, originalHeight: Int, letterboxInfo: LetterboxInfo): Pair<Bitmap?, Detection?> {
        // Chuyển SegmentationDetection → Detection (bỏ maskData vì chỉ cần box)
        val segDet = detectAll(letterboxImage, originalWidth, originalHeight, letterboxInfo).firstOrNull()
        val detection = segDet?.let { Detection.create(it.boundingBox, it.categories) }
        return Pair(null, detection)
    }

    /**
     * Detect all objects - TRẢ VỀ SegmentationDetection (có mask data)
     */
    fun detectAll(letterboxImage: Bitmap, originalWidth: Int, originalHeight: Int, letterboxInfo: LetterboxInfo): List<SegmentationDetection> {
        if (interpreter == null) return emptyList()

        inferenceCount++
        val shouldLog = inferenceCount <= 3 || (System.currentTimeMillis() - lastDetailedLog > Config.DETAILED_LOG_INTERVAL_MS)

        val imageBuffer = preprocessImage(letterboxImage)

        // ✅ THAY ĐỔI: Tạo 2 output buffers đúng shape
        // Output[0]: [1, 300, 38] = 300 detections × 38 values (box + 32 mask coeffs)
        val outputBoxes = Array(1) { Array(YOLOSegConst.NUM_DETECTIONS) { FloatArray(YOLOSegConst.TOTAL_VALUES) } }

        // Output[1]: TFLite thực tế output [1, 160, 160, 32] = [batch, height, width, channels]
        // Cần dùng ByteBuffer thay vì Array để TFLite tự xử lý shape
        val outputProtosBuffer = ByteBuffer.allocateDirect(
            1 * YOLOSegConst.PROTO_SIZE * YOLOSegConst.PROTO_SIZE * YOLOSegConst.NUM_PROTOS * 4
        )
        outputProtosBuffer.order(java.nio.ByteOrder.LITTLE_ENDIAN)
        outputProtosBuffer.rewind()

        val startTime = System.currentTimeMillis()

        // ✅ Chạy inference với 2 outputs
        val outputs = mapOf(
            0 to outputBoxes,
            1 to outputProtosBuffer
        )
        interpreter?.runForMultipleInputsOutputs(arrayOf(imageBuffer.buffer), outputs)

        outputProtosBuffer.rewind()

        val flatSize = YOLOSegConst.NUM_PROTOS * YOLOSegConst.PROTO_SIZE * YOLOSegConst.PROTO_SIZE
        val flatProto = FloatArray(flatSize) { outputProtosBuffer.float }

        // ✅ FIX: Auto-detect proto mask layout [1,160,160,32] NHWC vs NCHW
        // Thử NHWC: flat[i] = proto[c][h][w] với i = c*160*160 + h*160 + w
        // Thử NCHW: flat[i] = proto[c][h][w] với i = h*160*32 + w*32 + c
        // Chọn layout nào cho mean khác 0 (layout đúng có giá trị)
        val nhwcProto = Array(YOLOSegConst.NUM_PROTOS) { c ->
            Array(YOLOSegConst.PROTO_SIZE) { h ->
                FloatArray(YOLOSegConst.PROTO_SIZE) { w ->
                    flatProto[c * YOLOSegConst.PROTO_SIZE * YOLOSegConst.PROTO_SIZE
                            + h * YOLOSegConst.PROTO_SIZE
                            + w]
                }
            }
        }
        val nchwProto = Array(YOLOSegConst.NUM_PROTOS) { c ->
            Array(YOLOSegConst.PROTO_SIZE) { h ->
                FloatArray(YOLOSegConst.PROTO_SIZE) { w ->
                    flatProto[h * YOLOSegConst.PROTO_SIZE * YOLOSegConst.NUM_PROTOS
                            + w * YOLOSegConst.NUM_PROTOS
                            + c]
                }
            }
        }

        // Compare means — layout đúng sẽ có mean != 0
        var nhwcMean = 0f
        var nchwMean = 0f
        for (c in 0 until YOLOSegConst.NUM_PROTOS) {
            for (h in 0 until YOLOSegConst.PROTO_SIZE) {
                for (w in 0 until YOLOSegConst.PROTO_SIZE) {
                    nhwcMean += kotlin.math.abs(nhwcProto[c][h][w])
                    nchwMean += kotlin.math.abs(nchwProto[c][h][w])
                }
            }
        }
        nhwcMean /= flatSize
        nchwMean /= flatSize

        val outputProtos: Array<Array<FloatArray>>
        if (nhwcMean > nchwMean) {
            outputProtos = nhwcProto
            if (shouldLog) Log.d(TAG, "📦 Proto layout: NHWC ✅ (mean=${"%.4f".format(nhwcMean)} vs NCHW=${"%.4f".format(nchwMean)})")
        } else {
            outputProtos = nchwProto
            if (shouldLog) Log.d(TAG, "📦 Proto layout: NCHW ✅ (mean=${"%.4f".format(nchwMean)} vs NHWC=${"%.4f".format(nhwcMean)})")
        }

        if (shouldLog) {
            Log.d(TAG, "📦 Proto[0][80][80] = ${"%.6f".format(outputProtos[0][80][80])}")
        }

        val inferenceTime = System.currentTimeMillis() - startTime

        if (shouldLog) {
            Log.d(TAG, "🔍 #$inferenceCount inference=${inferenceTime}ms orig=${originalWidth}x${originalHeight}")
            lastDetailedLog = System.currentTimeMillis()
        }

        return parseYOLOOutput(outputBoxes[0], outputProtos, originalWidth, originalHeight, letterboxInfo, shouldLog) ?: emptyList()
    }

    /**
     * Backward-compatible: detectAll trả về List<Detection> (không có mask)
     * Dùng cho camera overlay (chỉ cần box)
     */
    fun detectAllAsDetections(letterboxImage: Bitmap, originalWidth: Int, originalHeight: Int, letterboxInfo: LetterboxInfo): List<Detection> {
        return detectAll(letterboxImage, originalWidth, originalHeight, letterboxInfo).map { segDet ->
            Detection.create(segDet.boundingBox, segDet.categories)
        }
    }

    /**
     * Parse YOLOv2.6 Seg output - trích xuất box + mask coefficients
     *
     * @param outputArray Output[0]: [300][38]
     * @param protoMasks Output[1]: [32][160][160] prototype masks
     */
    private fun parseYOLOOutput(
        outputArray: Array<FloatArray>,
        protoMasks: Array<Array<FloatArray>>,
        originalWidth: Int,
        originalHeight: Int,
        letterboxInfo: LetterboxInfo,
        shouldLog: Boolean = false
    ): List<SegmentationDetection>? {
        // Check output format
        if (outputArray.isEmpty() || outputArray[0].size != YOLOSegConst.TOTAL_VALUES) {
            Log.e(TAG, "❌ Unexpected output format: expected ${YOLOSegConst.TOTAL_VALUES} values, got ${outputArray.getOrNull(0)?.size}")
            return null
        }

        // ✅ DEBUG: Log first 5 detections với cả 2 format để so sánh
        if (!hasLoggedOutputFormat) {
            Log.w(TAG, "🔍 === BOX FORMAT DEBUG ===")
            Log.w(TAG, "🔍 Input: ${originalWidth}x${originalHeight}, Letterbox: ratio=${letterboxInfo.ratio}, pad=(${letterboxInfo.padWidth}, ${letterboxInfo.padHeight})")

            var debugCount = 0
            for (i in 0 until minOf(10, outputArray.size)) {
                val det = outputArray[i]
                val conf = det[4]
                if (conf < 0.1f) continue
                debugCount++

                val v0 = det[0]; val v1 = det[1]; val v2 = det[2]; val v3 = det[3]

                // Format 1: [x1, y1, x2, y2]
                val x1_f1 = ((v0 * inputSize - letterboxInfo.padWidth) / letterboxInfo.ratio)
                val y1_f1 = ((v1 * inputSize - letterboxInfo.padHeight) / letterboxInfo.ratio)
                val x2_f1 = ((v2 * inputSize - letterboxInfo.padWidth) / letterboxInfo.ratio)
                val y2_f1 = ((v3 * inputSize - letterboxInfo.padHeight) / letterboxInfo.ratio)

                // Format 2: [cx, cy, w, h]
                val cx = v0 * inputSize; val cy = v1 * inputSize
                val w = v2 * inputSize; val h = v3 * inputSize
                val x1_f2 = (cx - w/2 - letterboxInfo.padWidth) / letterboxInfo.ratio
                val y1_f2 = (cy - h/2 - letterboxInfo.padHeight) / letterboxInfo.ratio
                val x2_f2 = (cx + w/2 - letterboxInfo.padWidth) / letterboxInfo.ratio
                val y2_f2 = (cy + h/2 - letterboxInfo.padHeight) / letterboxInfo.ratio

                Log.w(TAG, "🔍 [$i] conf=${"%.2f".format(conf)} class=${det[5].toInt()}")
                Log.w(TAG, "     Raw[0-3]: ${"%.4f".format(v0)}, ${"%.4f".format(v1)}, ${"%.4f".format(v2)}, ${"%.4f".format(v3)}")
                Log.w(TAG, "     📌 F1[x1,y1,x2,y2]: [${x1_f1.toInt()}, ${y1_f1.toInt()}, ${x2_f1.toInt()}, ${y2_f1.toInt()}] → ${(x2_f1-x1_f1).toInt()}x${(y2_f1-y1_f1).toInt()}")
                Log.w(TAG, "     📌 F2[cx,cy,w,h]:  cx=${cx.toInt()} cy=${cy.toInt()} w=${w.toInt()} h=${h.toInt()} → [${x1_f2.toInt()}, ${y1_f2.toInt()}, ${x2_f2.toInt()}, ${y2_f2.toInt()}]")

                if (debugCount >= 5) break
            }
            Log.w(TAG, "🔍 =============================")
            hasLoggedOutputFormat = true
        }

        val rawDetections = mutableListOf<SegmentationDetection>()
        val ratio = letterboxInfo.ratio
        val padLeft = letterboxInfo.padWidth
        val padTop = letterboxInfo.padHeight
        val minW = originalWidth * Config.MIN_DETECTION_WIDTH_PERCENT
        val minH = originalHeight * Config.MIN_DETECTION_HEIGHT_PERCENT
        val minArea = (originalWidth * originalHeight) * Config.MIN_DETECTION_AREA_PERCENT
        val marginX = originalWidth * 0.01f
        val marginY = originalHeight * 0.01f

        for (i in 0 until YOLOSegConst.NUM_DETECTIONS) {
            val det = outputArray[i]
            val confidence = det[4]

            if (confidence < threshold) continue

            // ✅ THAY ĐỔI: Dùng Format 1: [x1, y1, x2, y2] như nano model
            // Nếu box vẫn rộng → thử Format 2: [cx, cy, w, h]
            val rawX1 = det[0]
            val rawY1 = det[1]
            val rawX2 = det[2]
            val rawY2 = det[3]

            // Format 1: [x1, y1, x2, y2] normalized → pixel coords
            val x1 = ((rawX1 * inputSize - padLeft) / ratio).coerceIn(0f, originalWidth.toFloat())
            val y1 = ((rawY1 * inputSize - padTop) / ratio).coerceIn(0f, originalHeight.toFloat())
            val x2 = ((rawX2 * inputSize - padLeft) / ratio).coerceIn(0f, originalWidth.toFloat())
            val y2 = ((rawY2 * inputSize - padTop) / ratio).coerceIn(0f, originalHeight.toFloat())

            if (x2 <= x1 || y2 <= y1) continue

            val bw = x2 - x1
            val bh = y2 - y1

            // Filter by size
            if (bw < minW || bh < minH || bw * bh < minArea) continue

            // Filter by aspect ratio
            val ar = bw / bh
            if (ar < Config.MIN_ASPECT_RATIO || ar > Config.MAX_ASPECT_RATIO) continue

            // Filter by edge margin
            if (x2 < marginX || y2 < marginY || x1 > originalWidth - marginX || y1 > originalHeight - marginY) continue

            // ✅ Extract 32 mask coefficients [6..37]
            val maskCoeffs = det.copyOfRange(YOLOSegConst.NUM_BOX_VALUES, YOLOSegConst.TOTAL_VALUES)

            // ✅ VALIDATE mask trước khi thêm detection
            // Filter detections với mask coefficients không hợp lệ (toàn 0 hoặc NaN)
            val coeffMean = maskCoeffs.sum() / maskCoeffs.size
            val coeffMax = maskCoeffs.maxOrNull() ?: 0f
            val coeffMin = maskCoeffs.minOrNull() ?: 0f
            if (shouldLog) {
                Log.d(TAG, "🎭 [$i] maskCoeffs: mean=${"%.4f".format(coeffMean)}, max=${"%.4f".format(coeffMax)}, min=${"%.4f".format(coeffMin)}, conf=$confidence")
            }
            // Bỏ detection nếu mask coefficients gần như bằng 0 (không có mask)
            if (abs(coeffMax) < 0.01f) {
                if (shouldLog) Log.d(TAG, "❌ [$i] SKIP: maskCoeffs all near-zero (max=${"%.4f".format(coeffMax)})")
                continue
            }

            /**
             * Box trong LETTERBOX 640×640 space, normalized [0,1].
             *
             * Xử lý: boxes = boxes * 640 → coords trong [0,640] letterbox space
             *        boxes / 640 → normalized [0,1] trong letterbox space
             *
             * ⚠️ KHÔNG dùng originalWidth/originalHeight vì mask 160×160 được crop
             *    trong proto space, tương ứng với letterbox 640×640.
             *
             * boxLetterbox * 160 = proto mask crop coords ✅ (đúng như Python)
             * boxOriginal  * 160 = sai ~6x (vì originalImage >> 640)
             */
            val boxLetterbox = RectF(
                x1 / inputSize,    // = (rawX1 * 640 - padLeft) / ratio / 640
                y1 / inputSize,    // → normalized trong letterbox space [0,1]
                x2 / inputSize,
                y2 / inputSize
            )

            if (shouldLog) {
                Log.d(TAG, "🎭 [$i] boxLetterbox=[${"%.3f".format(boxLetterbox.left)},${"%.3f".format(boxLetterbox.top)},${"%.3f".format(boxLetterbox.right)},${"%.3f".format(boxLetterbox.bottom)}]")
                Log.d(TAG, "🎭 [$i] protoCrop→[${(boxLetterbox.left*160).toInt()}:${(boxLetterbox.right*160).toInt()}]x[${(boxLetterbox.top*160).toInt()}:${(boxLetterbox.bottom*160).toInt()}]")
            }

            val classId = det[5].toInt()
            val label = if (classId == 0) "Branch" else "Trunk"

            // Tạo MaskData (chưa reconstruct mask, chỉ lưu coefficients + protos)
            val maskData = MaskData(
                maskCoeffs = maskCoeffs,
                protoMasks = protoMasks,
                reconstructedMask = null,
                boxLetterbox = boxLetterbox
            )

            if (shouldLog) Log.d(TAG, "✅ [$i] ADDED: label=$label, conf=$confidence, box=${bw.toInt()}x${bh.toInt()}, coeffMean=${"%.4f".format(coeffMean)}")

            rawDetections.add(SegmentationDetection.create(
                boundingBox = RectF(x1, y1, x2, y2),
                categories = listOf(Category(label = label, score = confidence)),
                maskData = maskData
            ))
        }

        val nmsResult = applyNMS(rawDetections, Config.NMS_IOU_THRESHOLD)
        if (shouldLog) Log.d(TAG, "✅ Seg detections: pass=${rawDetections.size}, nms=${nmsResult.size}")
        return nmsResult.take(maxResults)
    }

    private fun applyNMS(detections: List<SegmentationDetection>, iouThreshold: Float): List<SegmentationDetection> {
        if (detections.isEmpty()) return emptyList()
        val sorted = detections.sortedByDescending { it.confidence }
        val keep = mutableListOf<SegmentationDetection>()
        val suppressed = BooleanArray(sorted.size)
        for (i in sorted.indices) {
            if (suppressed[i]) continue
            keep.add(sorted[i])
            for (j in (i + 1) until sorted.size) {
                if (!suppressed[j] && calculateIoU(sorted[i].boundingBox, sorted[j].boundingBox) > iouThreshold)
                    suppressed[j] = true
            }
        }
        return keep
    }

    private fun calculateIoU(a: RectF, b: RectF): Float {
        val ix = maxOf(0f, minOf(a.right, b.right) - maxOf(a.left, b.left))
        val iy = maxOf(0f, minOf(a.bottom, b.bottom) - maxOf(a.top, b.top))
        val inter = ix * iy
        val union = a.width() * a.height() + b.width() * b.height() - inter
        return if (union > 0f) inter / union else 0f
    }

    fun warmupModel(): Boolean {
        if (!isInitialized) return false
        return try {
            val dummy = Bitmap.createBitmap(inputSize, inputSize, Bitmap.Config.ARGB_8888)
            dummy.eraseColor(android.graphics.Color.BLACK)
            detect(dummy, inputSize, inputSize, LetterboxInfo(1.0f, 0f, 0f))
            dummy.recycle()
            true
        } catch (e: Exception) { Log.e(TAG, "Warmup failed: ${e.message}"); false }
    }

    fun clear() {
        gpuDelegate?.close(); gpuDelegate = null
        nnApiDelegate?.close(); nnApiDelegate = null
        interpreter?.close(); interpreter = null
        isInitialized = false
    }

    companion object { private const val TAG = "YOLO26Detect" }
}
