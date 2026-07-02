package com.aladincontract.company.treereid

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.Executor

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

    /** Tạo controller nếu chưa có (gọi trên main thread). */
    fun ensureController(context: Context): LifecycleCameraController {
        controller?.let { return it }
        val c = LifecycleCameraController(context.applicationContext).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
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
        controller?.unbind()
        controller = null
        previewRef = null
    }
}
