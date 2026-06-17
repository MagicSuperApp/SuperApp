package com.mvp.orilife.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import android.view.Surface
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageProxy
import androidx.camera.core.MeteringPointFactory
import androidx.camera.core.Preview
import androidx.camera.core.AspectRatio
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.mvp.orilife.Config
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

sealed interface CameraState {
    object Idle : CameraState
    object Starting : CameraState
    object Running : CameraState
    object Stopped : CameraState
    data class Error(val message: String) : CameraState
}

data class CameraConfigData(
    val width: Int,
    val height: Int,
    val rotationDegrees: Int
)

class CameraManager(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner
) {
    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var imageCapture: ImageCapture? = null

    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    private val _state = MutableStateFlow<CameraState>(CameraState.Idle)
    val state: StateFlow<CameraState> = _state

    private val _configData = MutableStateFlow<CameraConfigData?>(null)
    val configData: StateFlow<CameraConfigData?> = _configData

    private var onImageFrameListener: ((ImageProxy) -> Unit)? = null
    private var previewView: PreviewView? = null
    private var camera: Camera? = null

    fun setPreviewView(view: PreviewView) {
        previewView = view
    }

    /**
     * Trigger auto-focus immediately.
     * Dùng khi blur detected → cần focus lại trước khi detection.
     * Sử dụng startFocusAndMetering() thay vì deprecated autoFocus().
     */
    fun triggerAutoFocus() {
        camera?.let { cam ->
            try {
                val previewView = previewView ?: return
                val factory = previewView.meteringPointFactory
                // Center point cho auto-focus
                val point = factory.createPoint(0.5f, 0.5f)
                val action = FocusMeteringAction.Builder(point)
                    .setAutoCancelDuration(3, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val future = cam.cameraControl.startFocusAndMetering(action)
                future.addListener({
                    Log.d("CameraManager", "🔍 Auto-focus triggered")
                }, ContextCompat.getMainExecutor(context))
            } catch (e: Exception) {
                Log.e("CameraManager", "❌ Auto-focus failed: ${e.message}")
            }
        }
    }

    fun setOnImageFrameListener(listener: (ImageProxy) -> Unit) {
        onImageFrameListener = listener
    }

    fun createPermissionLauncher(activity: AppCompatActivity): ActivityResultLauncher<Array<String>> {
        return activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            val cameraGranted = permissions[Manifest.permission.CAMERA] ?: false
            val locationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false

            if (cameraGranted) {
                startCamera()
            } else {
                _state.value = CameraState.Error("Camera permission required")
            }
        }
    }

    fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun startCamera() {
        _state.value = CameraState.Starting

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                bindCameraUseCases()
                _state.value = CameraState.Running
            } catch (e: Exception) {
                Log.e("CameraManager", "Failed to start camera", e)
                _state.value = CameraState.Error(e.message ?: "Unknown error")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun stopCamera() {
        try {
            cameraProvider?.unbindAll()
            _state.value = CameraState.Stopped
        } catch (e: Exception) {
            Log.e("CameraManager", "Failed to stop camera", e)
        }
    }

    /**
     * Pick the CameraX AspectRatio constant that best matches the PreviewView.
     * Portrait view (e.g. 720x1612) → tall → 16:9.
     * Squarish or 4:3 view → 4:3.
     */
    private fun bestAspectRatio(): Int {
        val view = previewView ?: return AspectRatio.RATIO_16_9
        val w = view.width.coerceAtLeast(1)
        val h = view.height.coerceAtLeast(1)
        // Always compare as landscape ratio (long / short)
        val ratio = maxOf(w, h).toFloat() / minOf(w, h)
        // Midpoint between 4:3 (1.333) and 16:9 (1.778) ≈ 1.556
        return if (ratio > 1.556f) AspectRatio.RATIO_16_9 else AspectRatio.RATIO_4_3
    }

    @OptIn(ExperimentalGetImage::class)
    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: return
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // Auto-detect aspect ratio from PreviewView size so it works on any screen.
        // Both Preview and ImageAnalysis MUST share the same ratio
        // so OverlayView fillCenter scaling matches PreviewView exactly.
        val ratio = bestAspectRatio()
        val ratioName = if (ratio == AspectRatio.RATIO_16_9) "16:9" else "4:3"
        Log.d("CameraManager", "📷 Auto aspect ratio: $ratioName (view=${previewView?.width}x${previewView?.height})")

        preview = Preview.Builder()
            .setTargetAspectRatio(ratio)
            .setTargetRotation(Surface.ROTATION_0)
            .build()

        imageAnalyzer = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .setTargetRotation(Surface.ROTATION_0)
            .setImageQueueDepth(Config.IMAGE_QUEUE_DEPTH)
            // Sử dụng resolution cao nhất của camera để có bark texture detail tốt nhất
            // CameraX sẽ tự chọn resolution gốc cao nhất phù hợp với aspect ratio
            // Thường là 1920x1080 (Full HD) hoặc 3840x2160 (4K) tùy device
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(
                        AspectRatioStrategy(
                            ratio,
                            AspectRatioStrategy.FALLBACK_RULE_AUTO
                        )
                    )
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            android.util.Size(3840, 2160),  // Prefer 4K nếu có
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                        )
                    )
                    .build()
            )
            .build()
            .also {
                it.setAnalyzer(cameraExecutor) { image ->
                    _configData.value = CameraConfigData(
                        width = image.width,
                        height = image.height,
                        rotationDegrees = image.imageInfo.rotationDegrees
                    )
                    Log.d("CameraManager", "📸 Actual resolution: ${image.width}x${image.height}")
                    onImageFrameListener?.invoke(image)
                }
            }

        imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()

        provider.unbindAll()

        val viewFinder = previewView ?: return
        camera = provider.bindToLifecycle(lifecycleOwner, cameraSelector, preview, imageAnalyzer, imageCapture)
        preview?.setSurfaceProvider(viewFinder.surfaceProvider)

        // Log actual resolutions to verify they match
        val previewRes = preview?.resolutionInfo?.resolution
        val analysisRes = imageAnalyzer?.resolutionInfo?.resolution
        Log.d("CameraManager", "📷 Preview: $previewRes, Analysis: $analysisRes")
        if (previewRes != null && analysisRes != null) {
            val previewAR = previewRes.width.toFloat() / previewRes.height
            val analysisAR = analysisRes.width.toFloat() / analysisRes.height
            if (kotlin.math.abs(previewAR - analysisAR) > 0.01f) {
                Log.w("CameraManager", "⚠️ Aspect ratio MISMATCH! Preview=$previewAR Analysis=$analysisAR")
            }
        }
    }

    fun release() {
        stopCamera()
        cameraExecutor.shutdown()
    }
}
