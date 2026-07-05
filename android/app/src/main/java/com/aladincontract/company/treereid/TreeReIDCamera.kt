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
    private const val INFER_INTERVAL_MS = 150L
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var lastConf = -1f
    @Volatile private var lastConfAtMs = 0L
    private var lastInferMs = 0L

    /** (confidence gần nhất, tuổi ms). confidence < 0 = detector chưa sẵn sàng. */
    fun latestTargetConfidence(): Pair<Float, Long> =
        Pair(lastConf, System.currentTimeMillis() - lastConfAtMs)

    private val yoloAnalyzer = ImageAnalysis.Analyzer { image ->
        try {
            val now = System.currentTimeMillis()
            if (now - lastInferMs >= INFER_INTERVAL_MS && TreeReIDYolo.available) {
                lastInferMs = now
                val bmp = image.toBitmap()
                lastConf = TreeReIDYolo.detect(bmp)
                lastConfAtMs = now
                bmp.recycle()
            }
        } catch (_: Throwable) {
            // nuốt lỗi — không làm sập luồng analysis
        } finally {
            image.close()
        }
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
