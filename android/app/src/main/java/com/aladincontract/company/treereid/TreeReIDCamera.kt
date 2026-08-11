package com.aladincontract.company.treereid

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageProxy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Holder singleton cho CameraX LifecycleCameraController — tương đương shared
 * AVCaptureSession bên iOS (TreeReIDBridgeModule.sharedInstance).
 *
 * PreviewView (do TreeReIDCameraPreviewManager tạo) và TreeReIDBridgeModule cùng
 * tham chiếu 1 controller: module tạo/bind controller khi start session, PreviewView
 * gắn controller để hiển thị. Xử lý cả 2 thứ tự tạo (view trước/sau session).
 *
 * MỌI thao tác camera phải chạy trên main thread.
 */
object TreeReIDCamera {

    private var controller: LifecycleCameraController? = null
    private var previewRef: WeakReference<PreviewView>? = null

    // ── YOLO gate (Plan A) — phân-tích frame preview để lọc "có cây" ─────────
    // NHIỆT (field Giang 13/07: máy nóng): 150ms = 6.7 lần/giây là THỪA cho một cái gate
    // "trong khung có cây không" — người quét không vung máy 7 lần/giây. Hạ 400ms (2.5/giây)
    // cắt ~62% tải YOLO trên CPU mà KHÔNG đổi trải nghiệm gate.
    private const val INFER_INTERVAL_MS = 400L
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var lastConf = -1f
    @Volatile private var lastConfAtMs = 0L
    private var lastInferMs = 0L

    /** Callback box realtime cho overlay: (boxes chuẩn-hoá theo portrait, tỉ-lệ frame w/h). */
    @Volatile var onBoxes: ((List<TreeReIDYolo.Box>, Float) -> Unit)? = null

    /** (confidence gần nhất, tuổi ms). confidence < 0 = detector chưa sẵn sàng. */
    fun latestTargetConfidence(): Pair<Float, Long> =
        Pair(lastConf, System.currentTimeMillis() - lastConfAtMs)

    private val yoloAnalyzer = ImageAnalysis.Analyzer { image ->
        try {
            val now = System.currentTimeMillis()
            if (now - lastInferMs >= INFER_INTERVAL_MS && TreeReIDYolo.available) {
                lastInferMs = now
                // Xoay bitmap về đúng hướng hiển thị (portrait) trước khi detect → box
                // chuẩn-hoá theo frame portrait, khớp preview (FILL_CENTER).
                val raw = image.toBitmap()
                val rot = image.imageInfo.rotationDegrees
                val bmp = if (rot != 0) rotate(raw, rot).also { raw.recycle() } else raw
                lastConf = TreeReIDYolo.detect(bmp)
                lastConfAtMs = now
                onBoxes?.invoke(TreeReIDYolo.latestBoxes, bmp.width.toFloat() / bmp.height.toFloat())
                bmp.recycle()
            }
        } catch (_: Throwable) {
            // nuốt lỗi — không làm sập luồng analysis
        } finally {
            image.close()
        }
    }

    private fun rotate(src: Bitmap, degrees: Int): Bitmap {
        val m = android.graphics.Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    /** ImageProxy (RGBA_8888) → Bitmap. Giữ padding cột (resize 640 ở detector lo). */
    private fun ImageProxy.toBitmap(): Bitmap {
        val plane = planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width
        val bmp = Bitmap.createBitmap(
            width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888,
        )
        buffer.rewind()
        bmp.copyPixelsFromBuffer(buffer)
        return bmp
    }

    /** Tạo controller nếu chưa có (gọi trên main thread). */
    fun ensureController(context: Context): LifecycleCameraController {
        controller?.let { return it }
        val c = LifecycleCameraController(context.applicationContext).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            // Thêm IMAGE_ANALYSIS để chạy gate YOLO song song với IMAGE_CAPTURE.
            setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.IMAGE_ANALYSIS)
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
            // RGBA để đổi ImageProxy → Bitmap gọn (khỏi giải YUV).
            imageAnalysisOutputImageFormat = ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888
            setImageAnalysisAnalyzer(analysisExecutor, yoloAnalyzer)
        }
        controller = c
        attachToPreviewIfReady()
        return c
    }

    /** Bind vào lifecycle của Activity (main thread). */
    fun bind(owner: LifecycleOwner) {
        controller?.bindToLifecycle(owner)
    }

    /** PreviewView đăng ký để nhận controller (main thread, gọi từ ViewManager). */
    fun attachPreview(view: PreviewView) {
        previewRef = WeakReference(view)
        attachToPreviewIfReady()
    }

    private fun attachToPreviewIfReady() {
        val view = previewRef?.get() ?: return
        val c = controller ?: return
        view.controller = c
    }

    /** Chụp 1 ảnh ra file tạm. Callback chạy trên [executor]. */
    fun takePicture(
        outFile: File,
        executor: Executor,
        onSaved: (File) -> Unit,
        onError: (Exception) -> Unit,
    ) {
        val c = controller
        if (c == null) {
            onError(IllegalStateException("Camera controller chưa sẵn sàng"))
            return
        }
        val opts = ImageCapture.OutputFileOptions.Builder(outFile).build()
        c.takePicture(
            opts,
            executor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                    onSaved(outFile)
                }

                override fun onError(exception: androidx.camera.core.ImageCaptureException) {
                    onError(exception)
                }
            },
        )
    }

    fun mainExecutor(context: Context): Executor = ContextCompat.getMainExecutor(context)

    // ── Cam controls: flash (torch) + lens 0.5x (ultra-wide qua zoom) ─────────
    // cameraInfo/cameraControl chỉ sẵn sau bindToLifecycle → null-safe, trả false
    // khi chưa sẵn / không hỗ-trợ (JS ẩn nút tương-ứng).

    /** (có đèn, có lens 0.5x). Ultra-wide suy từ minZoomRatio ≤ 0.6 (máy 1 cam = 1.0). */
    fun capabilities(): Pair<Boolean, Boolean> {
        val info = controller?.cameraInfo ?: return Pair(false, false)
        val hasTorch = info.hasFlashUnit()
        val minZoom = info.zoomState.value?.minZoomRatio ?: 1f
        return Pair(hasTorch, minZoom <= 0.6f)
    }

    /** Bật/tắt đèn. Trả trạng-thái THỰC (false nếu máy không có đèn / chưa sẵn). */
    fun setTorch(on: Boolean): Boolean {
        val info = controller?.cameraInfo ?: return false
        if (!info.hasFlashUnit()) return false
        controller?.enableTorch(on)
        return on
    }

    /** 0.5x (on → zoom về min của máy) ↔ 1x (off). Trả true nếu đang ở 0.5x. */
    fun setUltraWide(on: Boolean): Boolean {
        val info = controller?.cameraInfo ?: return false
        val minZoom = info.zoomState.value?.minZoomRatio ?: 1f
        if (on) {
            if (minZoom > 0.6f) return false // máy không có ultra-wide
            controller?.setZoomRatio(minZoom)
            return true
        }
        controller?.setZoomRatio(1.0f)
        return false
    }

    /** Gỡ preview + unbind camera + RESET controller (main thread).
     *  Reset để session sau tạo controller MỚI — tránh lỗi bind lại controller cũ. */
    fun release() {
        previewRef?.get()?.controller = null
        controller?.clearImageAnalysisAnalyzer()
        controller?.unbind()
        controller = null
        previewRef = null
        lastConf = -1f
        lastConfAtMs = 0L
    }
}
