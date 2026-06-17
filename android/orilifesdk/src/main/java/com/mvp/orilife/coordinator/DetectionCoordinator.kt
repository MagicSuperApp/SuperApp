package com.mvp.orilife.coordinator

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import android.location.Location
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mvp.orilife.Config
import com.mvp.orilife.camera.CameraConfigData
import com.mvp.orilife.data.VirtualIDManager
import com.mvp.orilife.detection.*
import com.mvp.orilife.database.HarvestDatabase
import com.mvp.orilife.database.SavedTree
import com.mvp.orilife.database.TreeStatus
import com.mvp.orilife.image.BackgroundRemovalProcessor
import com.mvp.orilife.image.ImageProcessor
import com.mvp.orilife.image.LetterboxResult
import com.mvp.orilife.image.ProcessedImage
import com.mvp.orilife.network.NetworkMonitor
import com.mvp.orilife.network.TreeDetectionQueue
import com.mvp.orilife.sensor.SensorDataCollector
import com.mvp.orilife.sensor.SensorSnapshot
import com.mvp.orilife.security.SecureSignature
import com.mvp.orilife.security.TrustScoreManager
import com.mvp.orilife.security.IdGenerator
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.analytics.ktx.logEvent
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.*
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

sealed interface CoordinatorState {
    object Idle : CoordinatorState
    object Scanning : CoordinatorState
    object Detecting : CoordinatorState
    object Processing : CoordinatorState
    object Uploading : CoordinatorState
    data class Success(val message: String = "") : CoordinatorState
    data class Error(val message: String) : CoordinatorState
}

data class DetectionResult(
    val detections: List<Detection>,
    val croppedImage: Bitmap?,
    val imageWidth: Int,
    val imageHeight: Int,
    val rotationDegrees: Int = 0
)

class DetectionCoordinator(
    private val yoloHelper: YOLODetectionHelper,
    private val trustScoreManager: TrustScoreManager,
    private val lifecycleScope: CoroutineScope,
    private val context: Context? = null,
    private val cameraManager: com.mvp.orilife.camera.CameraManager? = null,
    private val farmId: String? = null,
    private val regionCode: String? = null
) {
    private val imageProcessor = ImageProcessor()
    private val detectionFilter = DetectionFilter()
    private val detectionTracker = DetectionTracker()
    private val stateMachine = TreeDetectionStateMachine()

    
    private var _circularSessionState = MutableStateFlow(CircularSessionState())
    val circularSessionState: StateFlow<CircularSessionState> = _circularSessionState

    private var circularSM = CircularCaptureStateMachine(
        onCaptureTriggered = { _ ->
            // NOTE: onCaptureTriggered is set in initializeDetection()
            // after onCircularSessionComplete is assigned.
            // We do NOT use this constructor callback — see initializeDetection().
        },
        onSessionComplete = { capturedCount ->
            // Fallback only — normally onCaptureTriggered path handles completion
            Log.w("DetectionCoordinator", "🏁 [FALLBACK] onSessionComplete FIRED! captured=$capturedCount")
        }
    )
    private var pendingCircularCaptureSector: Int? = null
    // ✅ Atomic flag: SET khi detection đầu tiên thành công, RESET ngay khi bắt đầu xử lý
    private val isFirstCircularCapturePending = AtomicBoolean(false)
    // isCircularCaptureActive chỉ được set = true SAU KHI handleCircularCapture bắt đầu
    private var isCircularCaptureActive = false
    // ✅ Bug 1 fix: Atomic guard — ngăn race condition khi nhiều frame trigger cùng lúc
    private val isHandlingCapture = AtomicBoolean(false)
    // ✅ Bug fix: chặn processStateMachine sau COMPLETE — tránh isFirstCircularCapturePending bị reset
    private var _isSessionPendingUpload = false
    val isSessionPendingUpload: Boolean get() = _isSessionPendingUpload
    fun setSessionPendingUpload(value: Boolean) { _isSessionPendingUpload = value }
    private var sensorFeedJob: Job? = null
    private var lastSegDetForCapture: SegmentationDetection? = null
    private var _onCircularSessionComplete: (() -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Callback được gọi khi circular session hoàn thành (≥5 sectors).
     * Set bởi MainActivity sau khi tạo DetectionCoordinator.
     */
    var onCircularSessionComplete: (() -> Unit)?
        get() = _onCircularSessionComplete
        set(value) { _onCircularSessionComplete = value }

    /**
     * Setup circular state machine callbacks sau khi onCircularSessionComplete đã được gán.
     * Gọi từ MainActivity.initializeDetection() — đảm bảo callback chain không bị null.
     */
    fun setupCircularCallbacks(
        onCaptureTriggered: (sectorIndex: Int) -> Unit,
        onSessionComplete: (capturedCount: Int) -> Unit
    ) {
        circularSM = CircularCaptureStateMachine(
            onCaptureTriggered = onCaptureTriggered,
            onSessionComplete = onSessionComplete
        )
        Log.d("DetectionCoordinator", "✅ Circular callbacks SETUP: pendingSector=${pendingCircularCaptureSector}, isActive=$isCircularCaptureActive")
        // Nếu session đang active → rebind state
        if (isCircularCaptureActive) {
            _circularSessionState.value = circularSM.getSessionState()
        }
    }

    /**
     * Set pending sector index cho capture (gọi từ MainActivity callback).
     */
    fun setPendingCircularCaptureSector(sectorIndex: Int) {
        pendingCircularCaptureSector = sectorIndex
        Log.d("DetectionCoordinator", "🎯 setPendingSector=$sectorIndex, isHandling=${isHandlingCapture.get()}")
    }

    private val _state = MutableStateFlow<CoordinatorState>(CoordinatorState.Idle)
    val state: StateFlow<CoordinatorState> = _state

    private val _detectionResult = MutableStateFlow<DetectionResult?>(null)
    val detectionResult: StateFlow<DetectionResult?> = _detectionResult

    private var overlayDetectionsCache: List<Detection> = emptyList()
    private var overlayImageWidth: Int = 0
    private var overlayImageHeight: Int = 0
    private var overlayRotationDegrees: Int = 0

    private var overlayCacheTimestamp: Long = 0L
    private val OVERLAY_CACHE_MAX_AGE_MS = 500L  // 500ms = ~15 frames @ 30fps

    private var consecutiveCacheMissFrames = 0
    private val OVERLAY_CACHE_MISS_FRAMES_THRESHOLD = 8

    private val _stableDetections = MutableStateFlow<List<StableDetection>>(emptyList())
    val stableDetections: StateFlow<List<StableDetection>> = _stableDetections

    private val processingMutex = Mutex()
    private var lastLetterboxResult: LetterboxResult? = null
    private var lastProcessedImage: ProcessedImage? = null
    private var lastCropResult: CropResult? = null
    private var lastCropResults: List<CropResult> = emptyList()
    private var latestLocation: Location? = null

    // ✅ Session tracking — mỗi lần capture tạo 1 sessionId duy nhất
    private var currentSessionId: String = ""
    private var currentSessionStartTime: Long = 0L
    private var currentSessionTreeId: String = ""

    // ✅ Blur score tại thời điểm capture thành công
    private var lastBlurScore: Float? = null
    
    // Detection pause control — TÁCH thành 2 concerns RIÊNG BIỆT
    // Bug A fix: pauseDetection() chỉ pause YOLO + state machine (app background)
    // pauseOverlay() chỉ pause overlay UI (Uploading state) — state machine VẪN CHẠY
    private var isProcessingPaused = false   // Pause YOLO + blur check + state machine
    private var isOverlayPaused = false      // Pause overlay UI update

    // Blur detection state
    private var consecutiveSharpFrames = 0
    private var isWaitingForStableFocus = false
    private var lastAutoFocusTriggerAt = 0L
    private val _isStableForDetection = MutableStateFlow(false)
    val isStableForDetection: StateFlow<Boolean> = _isStableForDetection

    // Frame rate control - prevent queue buildup
    private val isProcessing = AtomicBoolean(false)
    private var lastProcessedTime = 0L
    private var frameCount = 0
    private var previousProcessedBitmap: Bitmap? = null
    private var previousCroppedBitmap: Bitmap? = null
    // ✅ Raw bitmap snapshot tại thời điểm capture trigger — tránh bị recycle trước khi coroutine chạy
    private var rawBitmapForCapture: Bitmap? = null
    private val treeDetectionQueue: TreeDetectionQueue? by lazy {
        context?.let { TreeDetectionQueue.getInstance(it) }
    }

    // ✅ SavedTree DAO — dùng để tạo/cập nhật tree trong DB khi session start/upload
    private val savedTreeDao by lazy {
        context?.let { com.mvp.orilife.database.HarvestDatabase.getDatabase(it).savedTreeDao() }
    }

    suspend fun processCameraFrame(
        imageProxy: androidx.camera.core.ImageProxy,
        cameraConfig: CameraConfigData?
    ): ProcessedImage? {
        // Skip processing if paused (app background)
        if (isProcessingPaused) {
            imageProxy.close()
            return null
        }
        
        // Drop frame if still processing previous one (non-blocking)
        if (!isProcessing.compareAndSet(false, true)) {
            imageProxy.close()
            return null
        }

        // Frame rate throttle
        val now = System.currentTimeMillis()
        if (now - lastProcessedTime < Config.MIN_FRAME_INTERVAL_MS) {
            imageProxy.close()
            isProcessing.set(false)
            return null
        }

        // Frame skip (process every Nth frame)
        frameCount++
        if (Config.ENABLE_FRAME_SKIP && frameCount % (Config.SKIP_FRAMES + 1) != 0) {
            imageProxy.close()
            isProcessing.set(false)
            return null
        }

        var letterboxBitmap: Bitmap? = null
        return withContext(Dispatchers.Default) {
            try {
                _state.value = CoordinatorState.Scanning

                val processed = imageProcessor.processImageProxy(imageProxy) ?: run {
                    imageProxy.close()
                    return@withContext null
                }
                lastProcessedImage = processed
                lastCropResults = emptyList()  // ✅ Reset — không còn dùng crop results nữa

                // ── Blur check ──────────────────────────────────────────────────
                var isBlurry = false
                val variance: Double

                if (Config.BLUR_CHECK_ENABLED) {
                    variance = BlurChecker.calculateLaplacianVariance(processed.bitmap)
                    isBlurry = BlurChecker.isBlurry(processed.bitmap)

                    // Feed blur result vào circular state machine TRƯỚC khi return
                    if (isCircularCaptureActive) {
                        val blurVariance = if (Config.BLUR_CHECK_ENABLED) variance.toFloat() else Float.MAX_VALUE
                        Log.d("DetectionCoordinator", "🔍 FEED_BLUR: isBlurry=$isBlurry, variance=${"%.1f".format(blurVariance)}, threshold=${Config.BLUR_VARIANCE_THRESHOLD}")
                        circularSM.onBlurResult(isBlurry)
                    }

                    if (isBlurry) {
                        // Trong circular capture: vẫn chạy tiếp nhưng không trigger capture
                        if (!isCircularCaptureActive) {
                            consecutiveSharpFrames = 0
                            if (!_state.value.toString().contains("BLUR")) {
                                Log.d("DetectionCoordinator", "⚠️ BLUR detected — skipping detection, waiting for stable focus")
                                _state.value = CoordinatorState.Error("Hãy giữ camera ổn định")
                            }
                            val nowFocus = System.currentTimeMillis()
                            if (nowFocus - lastAutoFocusTriggerAt >= Config.AUTO_FOCUS_COOLDOWN_MS) {
                                cameraManager?.triggerAutoFocus()
                                lastAutoFocusTriggerAt = nowFocus
                                isWaitingForStableFocus = true
                                Log.d("DetectionCoordinator", "🔍 BLUR detected — auto-focus triggered")
                            }
                            return@withContext null
                        }
                        // ✅ Circular capture: trigger auto-focus để lấy nét lại (có cooldown)
                        val nowFocus = System.currentTimeMillis()
                        if (nowFocus - lastAutoFocusTriggerAt >= Config.AUTO_FOCUS_COOLDOWN_MS) {
                            cameraManager?.triggerAutoFocus()
                            lastAutoFocusTriggerAt = nowFocus
                            isWaitingForStableFocus = true
                            Log.d("DetectionCoordinator", "🔍 BLUR detected in circular — triggering auto-focus")
                        }
                    } else {
                        if (isWaitingForStableFocus) {
                            val waitElapsed = System.currentTimeMillis() - lastAutoFocusTriggerAt
                            if (waitElapsed < Config.AUTO_FOCUS_SETTLE_MS) {
                                _isStableForDetection.value = false
                                return@withContext null
                            }
                            isWaitingForStableFocus = false
                        }

                        // Frame sắc nét
                        if (!isCircularCaptureActive) {
                            consecutiveSharpFrames++
                            if (consecutiveSharpFrames >= Config.BLUR_STABLE_FRAMES) {
                                if (_isStableForDetection.value != true) {
                                    Log.d("DetectionCoordinator", "✅ Camera ổn định — bắt đầu detection")
                                    _isStableForDetection.value = true
                                }
                            } else {
                                val framesLeft = Config.BLUR_STABLE_FRAMES - consecutiveSharpFrames
                                Log.d("DetectionCoordinator", "🔍 Đang chờ ổn định... ($framesLeft frames còn lại)")
                                _isStableForDetection.value = false
                            }
                        }
                    }
                } else {
                    _isStableForDetection.value = true
                    variance = 0.0
                }

                lastBlurScore = variance.toFloat()
                if (frameCount <= 3) {
                    Log.d("DetectionCoordinator", "📊 Blur score: ${"%.2f".format(variance)} (threshold=${Config.BLUR_VARIANCE_THRESHOLD})")
                }

                // Log pipeline info once for debugging
                if (frameCount <= 2) {
                    Log.d("DetectionCoordinator", "📐 PIPELINE: sensor=${processed.originalWidth}x${processed.originalHeight} rotation=${processed.rotationDegrees}")
                }

                // Recycle previous frame's bitmap to prevent memory leak (~1.2MB/frame)
                previousProcessedBitmap?.let {
                    if (!it.isRecycled) it.recycle()
                }
                previousProcessedBitmap = processed.bitmap

                // Recycle previous cropped bitmap
                previousCroppedBitmap?.let {
                    if (!it.isRecycled) it.recycle()
                }

                val letterboxResult = imageProcessor.createLetterbox(processed.bitmap, 640, 640)
                lastLetterboxResult = letterboxResult
                letterboxBitmap = letterboxResult.bitmap

                val letterboxInfo = LetterboxInfo(
                    letterboxResult.ratio,
                    letterboxResult.padLeft.toFloat(),
                    letterboxResult.padTop.toFloat()
                )

                // ✅ THAY ĐỔI: Nhận SegmentationDetection (có maskData)
                val allSegDetections = yoloHelper.detectAll(
                    letterboxResult.bitmap,
                    processed.originalWidth,
                    processed.originalHeight,
                    letterboxInfo
                )

                // ✅ LOG: theo dõi YOLO detect ở mỗi sector
                Log.d("DetectionCoordinator", "🌲 YOLO_FRAME: ${allSegDetections.size} detection(s), conf=${allSegDetections.firstOrNull()?.let { "%.2f".format(it.confidence) } ?: "none"}, sector=${circularSM.getSessionState().currentTargetSector?.index}")

                // ✅ CHOR: Trích xuất box coords cho crop (dùng cùng logic)
                val allBoundingBoxes = allSegDetections.map { it.boundingBox }

                // Camera overlay: chỉ cần box, không cần mask
                val allDetections = allSegDetections.map { segDet ->
                    Detection.create(segDet.boundingBox, segDet.categories)
                }

                // Crop ONE large image containing ALL detections
                // Then store individual box coordinates + maskData for each detection
                val cropResults = if (allSegDetections.isNotEmpty()) {
                    // Crop one large image containing all detections
                    val largeCropResult = ImageCropper.cropAllDetections(
                        processed.bitmap,
                        allBoundingBoxes,
                        0.15f
                    )

                    // Create individual CropResults with same large image but different box + mask
                    if (largeCropResult != null) {
                        allSegDetections.mapIndexed { index, segDet ->
                            val originalBitmap = processed.bitmap
                            val bbox = segDet.boundingBox

                            CropResult(
                                croppedBitmap = largeCropResult.croppedBitmap,
                                relativeBoxCoordinates = floatArrayOf(
                                    bbox.left, bbox.top,
                                    bbox.width(), bbox.height()
                                ),
                                normalizedBoxCoordinates = floatArrayOf(
                                    bbox.left / originalBitmap.width,
                                    bbox.top / originalBitmap.height,
                                    bbox.right / originalBitmap.width,
                                    bbox.bottom / originalBitmap.height
                                ),
                                paddingRatio = 0.15f,
                                segmentationDetection = segDet  // ✅ THÊM: lưu maskData
                            )
                        }
                    } else emptyList()
                } else emptyList()

                // Store crop results for later use (keep first one for display)
                lastCropResult = cropResults.firstOrNull()
                lastCropResults = cropResults
                
                // Cleanup previous cropped bitmap (shared bitmap from last detection)
                previousCroppedBitmap?.let {
                    if (!it.isRecycled) {
                        it.recycle()
                        Log.d("DetectionCoordinator", "♻️ Recycled previous cropped bitmap")
                    }
                }
                
                // Store reference for cleanup (all cropResults share the same bitmap)
                previousCroppedBitmap = cropResults.firstOrNull()?.croppedBitmap

            
                if (allDetections.isNotEmpty()) {
                    overlayDetectionsCache = allDetections
                    overlayImageWidth = processed.originalWidth
                    overlayImageHeight = processed.originalHeight
                    overlayRotationDegrees = processed.rotationDegrees
                    overlayCacheTimestamp = System.currentTimeMillis()
                    // Reset miss counter when YOLO detects
                    consecutiveCacheMissFrames = 0
                } else if (isCircularCaptureActive) {
                    val cacheAge = System.currentTimeMillis() - overlayCacheTimestamp
                    // ✅ Hysteresis: đếm miss frames, chỉ clear khi miss >= threshold
                    if (allSegDetections.isEmpty()) {
                        consecutiveCacheMissFrames++
                        if (consecutiveCacheMissFrames >= OVERLAY_CACHE_MISS_FRAMES_THRESHOLD && cacheAge > OVERLAY_CACHE_MAX_AGE_MS) {
                            Log.w("DetectionCoordinator", "📹 CACHE CLEARED (${consecutiveCacheMissFrames} misses): age=${cacheAge}ms > ${OVERLAY_CACHE_MAX_AGE_MS}ms, sector=${_circularSessionState.value.currentTargetSector?.index}")
                            overlayDetectionsCache = emptyList()
                            consecutiveCacheMissFrames = 0
                        } else if (frameCount <= 5 || consecutiveCacheMissFrames % 10 == 0) {
                            Log.v("DetectionCoordinator", "🔲 BOX_GONE_PENDING: sector=${_circularSessionState.value.currentTargetSector?.index}, consecutiveMisses=${consecutiveCacheMissFrames}/${OVERLAY_CACHE_MISS_FRAMES_THRESHOLD}, cacheAge=${cacheAge}ms")
                        }
                    } else {
                        // YOLO detect → reset counter
                        if (consecutiveCacheMissFrames > 0) {
                            consecutiveCacheMissFrames = 0
                            Log.d("DetectionCoordinator", "📹 CACHE MISS RESET: YOLO back, misses cleared")
                        }
                    }
                }

                // ✅ Update overlay MỖI FRAME trong circular mode — dùng cached detections
                // ✅ Bug A fix: Vẫn feed blur/yolo vào state machine kể cả overlay bị pause
                if (isCircularCaptureActive && !isOverlayPaused) {
                    val cacheAge = System.currentTimeMillis() - overlayCacheTimestamp
                    _detectionResult.value = DetectionResult(
                        overlayDetectionsCache,
                        cropResults.firstOrNull()?.croppedBitmap,
                        overlayImageWidth,
                        overlayImageHeight,
                        overlayRotationDegrees
                    )
                } else if (allDetections.isNotEmpty()) {
                    // Non-circular: chỉ update khi có detection
                    _detectionResult.value = DetectionResult(
                        allDetections,
                        cropResults.firstOrNull()?.croppedBitmap,
                        processed.originalWidth,
                        processed.originalHeight,
                        processed.rotationDegrees
                    )
                }

                processStableDetections(allSegDetections)

                if (allSegDetections.isNotEmpty()) {
                    Log.d("DetectionCoordinator", "🌲 YOLO: ${allSegDetections.size} detection(s), first=${allSegDetections.first().label} conf=${"%.2f".format(allSegDetections.first().confidence)}")
                }

                processStateMachine(allSegDetections, processed)

                if (isCircularCaptureActive) {
                    circularSM.onSensorUpdate(
                        heading = SensorDataCollector.snapshot.heading?.toFloat(),
                        accelX = SensorDataCollector.accelX,
                        accelY = SensorDataCollector.accelY,
                        accelZ = SensorDataCollector.accelZ
                    )

                    val hasDetection = allSegDetections.isNotEmpty()
                    if (frameCount <= 10 || hasDetection) {
                        Log.d("DetectionCoordinator", "🔍 FEED_YOLO: hasDetection=$hasDetection, count=${allSegDetections.size}, sector=${circularSM.getSessionState().currentTargetSector?.index}, state=${circularSM.getSessionState().state}")
                    }
                    circularSM.onYoloResult(hasDetection = hasDetection)

                    val smStateAfterYolo = circularSM.getSessionState()
                    if (smStateAfterYolo.state == CircularState.CAPTURE_TRIGGERED && isHandlingCapture.get()) {
                        Log.v("DetectionCoordinator", "⏳ CAPTURE_IN_FLIGHT: sector=${smStateAfterYolo.currentTargetSector?.index}, waiting worker completion")
                    }
                    _circularSessionState.value = smStateAfterYolo

                    if (allSegDetections.isNotEmpty()) {
                        lastSegDetForCapture = allSegDetections.first()
                    }

                    // Check trigger — nếu state machine đã set pending sector
                    val sectorToCapture = pendingCircularCaptureSector
                    if (sectorToCapture != null) {
                        pendingCircularCaptureSector = null
                        val segDetForCapture = allSegDetections.firstOrNull()
                        // ✅ Copy raw bitmap NGAY tại thời điểm trigger — tránh bị recycle trước khi coroutine chạy
                        val bitmapSnapshot = processed.bitmap.copy(Bitmap.Config.ARGB_8888, false)
                        if (segDetForCapture != null && bitmapSnapshot != null) {
                            _state.value = CoordinatorState.Uploading
                            lifecycleScope.launch {
                                Log.d("DetectionCoordinator", "🎬 CAPTURE_WORKER_START: sector=$sectorToCapture")
                                try {
                                    withContext(Dispatchers.Default) {
                                        withTimeout(10000L) {
                                            handleCircularCapture(bitmapSnapshot, segDetForCapture, sectorToCapture)
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e("DetectionCoordinator", "❌ CAPTURE_WORKER_FAIL/TIMEOUT: sector=$sectorToCapture, reason=${e.message}", e)
                                    circularSM.onCaptureDone(CaptureResult.Failure(sectorToCapture, e.message ?: "Capture timeout"))
                                    _circularSessionState.value = circularSM.getSessionState()
                                    _state.value = CoordinatorState.Scanning
                                } finally {
                                    Log.d("DetectionCoordinator", "🏁 CAPTURE_WORKER_END: sector=$sectorToCapture, state=${circularSM.getSessionState().state}")
                                }
                            }
                        } else {
                            val reason = if (bitmapSnapshot == null) "bitmap copy failed" else "No detection at trigger"
                            Log.e("DetectionCoordinator", "❌ CAPTURE_TRIGGERED_INVALID: sector=$sectorToCapture, reason=$reason")
                            circularSM.onCaptureDone(CaptureResult.Failure(sectorToCapture, reason))
                            _circularSessionState.value = circularSM.getSessionState()
                            _state.value = CoordinatorState.Scanning
                        }
                    }
                }

                lastProcessedTime = System.currentTimeMillis()
                processed
            } finally {
                letterboxBitmap?.recycle()
                imageProxy.close()
                isProcessing.set(false)
            }
        }
    }

    private suspend fun processStableDetections(detections: List<SegmentationDetection>) {
        val filtered = detections.filter { detectionFilter.shouldInclude(it) == null }

        detectionTracker.track(filtered) { confirmed ->
            lifecycleScope.launch {
                handleConfirmedDetection(confirmed)
            }
        }

        _stableDetections.value = detectionTracker.getAll()
    }

    private fun handleConfirmedDetection(detection: StableDetection) {
        val virtualID = VirtualIDManager.generateVirtualID(detection.detection.label)
        Log.d("DetectionCoordinator", "Virtual ID assigned: $virtualID")

        lifecycleScope.launch {
            trustScoreManager.updateTrustScore(
                virtualID,
                TrustScoreManager.TrustEvent.AI_DETECTION,
                detection.detection
            )
        }
    }

    private suspend fun processStateMachine(detections: List<SegmentationDetection>?, processed: ProcessedImage) {
        // ✅ Concern 2 fix: Chặn hoàn toàn nếu session đã complete
        // Tránh processStateMachine tiếp tục reset isFirstCircularCapturePending sau COMPLETE
        if (_isSessionPendingUpload) {
            // 📍 FLOW C+D BOUNDARY: processStateMachine BLOCKED while waiting for dialog/upload/reset
            Log.v("DetectionCoordinator", "🚫 [FLOW-C/D] processStateMachine BLOCKED: _isSessionPendingUpload=true, returning early")
            return
        }

        // ✅ ĐẶT FLAG TRƯỚC — khi Process action fire lần đầu tiên
        if (!isCircularCaptureActive && !isFirstCircularCapturePending.get()) {
            isFirstCircularCapturePending.set(true)
            Log.d("DetectionCoordinator", "🔵 isFirstCircularCapturePending SET to true")
        }

        val action = stateMachine.process(detections)
        Log.d("DetectionCoordinator", "🔍 SM action: $action, flag=${isFirstCircularCapturePending.get()}, active=$isCircularCaptureActive")

        when (action) {
            is TreeDetectionAction.Process -> {
                _state.value = CoordinatorState.Processing

                // ✅ Auto-start circular capture on first successful detection
                val wasPending = isFirstCircularCapturePending.compareAndSet(true, false)
                Log.d("DetectionCoordinator", "🎯 Process action — wasPending=$wasPending")
                if (wasPending) {
                    isCircularCaptureActive = true
                    stateMachine.pause()  // ✅ Tạm dừng SM — circular tự quản lý detection
                    Log.d("DetectionCoordinator", "🎉 CIRCULAR SESSION STARTING!")

                    // ✅ Track Analytics: Circular capture started
                    Firebase.analytics.logEvent("circular_capture_started") {
                        param("farm_id", farmId ?: "unknown")
                    }

                    // Tạo session — chỉ 1 lần đầu tiên
                    if (currentSessionId.isEmpty()) {
                        // ✅ FIX Bug 2: KHÔNG xóa pending items từ session cũ
                        // Ảnh từ session cũ cần được giữ lại để upload cùng session mới
                        // (hoặc upload riêng qua syncPendingDetections)
                        Log.d("DetectionCoordinator", "🆕 [FLOW-A] New session starting — previous pending images preserved")

                        currentSessionStartTime = System.currentTimeMillis()
                        currentSessionId = "sess_${currentSessionStartTime}_${kotlin.random.Random.nextInt(1000, 9999)}"
                        val deviceId = SecureSignature(context!!).getDeviceId()
                        currentSessionTreeId = IdGenerator.generateTreeId(deviceId, currentSessionId, currentSessionStartTime)

                        // Create tree on server once for this session
                        createSessionTree()
                    }

                    // Start circular state machine với heading hiện tại
                    // 📍 FLOW A BOUNDARY: auto-start circular session
                    Log.d("DetectionCoordinator", "🚀 [FLOW-A] startSessionWithReferenceHeading CALLED, referenceHeading=${SensorDataCollector.snapshot.heading}")
                    circularSM.startSessionWithReferenceHeading(
                        referenceHeading = SensorDataCollector.snapshot.heading?.toFloat(),
                        onComplete = { capturedCount ->
                            // 📍 FLOW C BOUNDARY: session complete callback (ACTUAL callback)
                            // ✅ Dùng this@DetectionCoordinator để resolve onCircularSessionComplete
                            // tại THỜI ĐIỂM INVOKE (khi session complete), không phải lúc tạo lambda.
                            // Nếu dùng plain capture thì onCircularSessionComplete bị null vì
                            // lambda được tạo TRƯỚC KHI initializeDetection() gán callback.
                            Log.d("DetectionCoordinator", "🏁 [FLOW-C] startSessionWithReferenceHeading.onComplete FIRED! captured=$capturedCount")
                            this@DetectionCoordinator._isSessionPendingUpload = true
                            Log.d("DetectionCoordinator", "🏁 [FLOW-C] onComplete callback set _isSessionPendingUpload=true")

                            // ✅ Track Analytics: Circular capture completed
                            val duration = System.currentTimeMillis() - this@DetectionCoordinator.currentSessionStartTime
                            Firebase.analytics.logEvent("circular_capture_completed") {
                                param("sectors_captured", capturedCount.toLong())
                                param("duration_ms", duration)
                            }

                            // ✅ Cập nhật SavedTree status → PENDING (capture xong, đang chờ upload)
                            this@DetectionCoordinator.savedTreeDao?.let { dao ->
                                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                                    try {
                                        dao.updateStatus(this@DetectionCoordinator.currentSessionTreeId, TreeStatus.PENDING)
                                        Log.d("DetectionCoordinator", "💾 [FLOW-C] SavedTree status → PENDING: ${this@DetectionCoordinator.currentSessionTreeId.takeLast(8)}")
                                    } catch (e: Exception) {
                                        Log.e("DetectionCoordinator", "❌ [FLOW-C] Failed to update SavedTree status PENDING: ${e.message}")
                                    }
                                }
                            }

                            mainHandler.post {
                                try {
                                    _state.value = CoordinatorState.Success("Đã chụp đủ 8 góc!")
                                    Log.d("DetectionCoordinator", "🏁 [FLOW-C] onComplete → invoking onCircularSessionComplete (MainActivity)")
                                    this@DetectionCoordinator.onCircularSessionComplete?.invoke()
                                    Log.d("DetectionCoordinator", "✅ [FLOW-C] onCircularSessionComplete completed successfully")
                                } catch (e: Throwable) {
                                    Log.e("DetectionCoordinator", "❌ [FLOW-C] onCircularSessionComplete CRASHED: ${e.message}", e)
                                }
                            }
                        },
                        onSkipSector = {
                            Log.d("DetectionCoordinator", "⏭️ Sector skipped by user")
                        }
                    )
                    _circularSessionState.value = circularSM.getSessionState()
                    startSensorFeed() // ✅ Sensor feed riêng, 100ms update
                    Log.d("DetectionCoordinator", "📤 Circular state published: ${_circularSessionState.value.state}, sectors=${_circularSessionState.value.capturedCount}")

                    // ✅ Capture sector 0: dùng raw bitmap TẠI FRAME NÀY + YOLO detection TẠI FRAME NÀY
                    // KHÔNG dùng lastCropResults vì đó là frame TRƯỚC đó
                    val segDet0 = detections?.firstOrNull()
                    if (segDet0 != null) {
                        val pendingSector = circularSM.getSessionState().currentTargetSector?.index ?: 0
                        lifecycleScope.launch {
                            withContext(Dispatchers.Default) {
                                handleCircularCapture(processed.bitmap, segDet0, pendingSector)
                            }
                            _circularSessionState.value = circularSM.getSessionState()
                        }
                    }

                    return
                }

                handleTreeDetection(action.detection, processed)
            }
            is TreeDetectionAction.Cooldown -> {
                lifecycleScope.launch {
                    delay(action.duration)
                    stateMachine.setState(TreeDetectionStateMachine.State.Searching)
                    _state.value = CoordinatorState.Scanning
                }
            }
            is TreeDetectionAction.ResumeSearching -> {
                _state.value = CoordinatorState.Scanning
            }
            null -> {}
        }
    }

    private suspend fun handleTreeDetection(
        detection: SegmentationDetection,
        processed: ProcessedImage
    ) {
        val rawBitmap = processed.bitmap
        Log.d("DetectionCoordinator", "Processing tree detection: ${detection.label}")

        val queue = treeDetectionQueue
        val ctx = context
        if (queue == null || ctx == null) {
            Log.e("DetectionCoordinator", "❌ Queue or context not initialized")
            return
        }

        if (isCircularCaptureActive) {
            if (isWaitingForStableFocus) {
                Log.d("DetectionCoordinator", "⏳ Waiting focus settle, skip circular capture trigger")
                return
            }
            val targetSector = circularSM.getSessionState().currentTargetSector
            val sectorIndex = targetSector?.index ?: 0
            withContext(Dispatchers.Default) {
                handleCircularCapture(rawBitmap, detection, sectorIndex)
            }
            return
        }

        if (isWaitingForStableFocus) {
            Log.d("DetectionCoordinator", "⏳ Waiting focus settle, skip single capture trigger")
            return
        }

        // ✅ NON-CIRCULAR: chỉ capture detection đầu tiên — raw bitmap, không crop
        Log.d("DetectionCoordinator", "📤 Non-circular: enqueueing single detection")

        val networkMonitor = NetworkMonitor(ctx)
        val isOnline = networkMonitor.isOnline.value ?: false

        if (isOnline) {
            _state.value = CoordinatorState.Uploading
        } else {
            Log.d("DetectionCoordinator", "📴 Offline mode - enqueueing for later sync")
        }

        lifecycleScope.launch(Dispatchers.Default) {
            val sensorSnapshot = SensorDataCollector.snapshot
            val imgId = IdGenerator.generateImageId()
            val timestamp = System.currentTimeMillis()
            val deviceId = SecureSignature(ctx).getDeviceId()
            val treeId = IdGenerator.generateTreeId(deviceId, "single_$timestamp", timestamp)

            handleSingleCapture(
                rawBitmap = rawBitmap,
                segDet = detection,
                imageId = imgId,
                treeId = treeId,
                sensorSnapshot = sensorSnapshot,
                isOnline = isOnline
            )
        }
    }

    /**
     * Xử lý capture đơn (non-circular mode).
     * KHÔNG crop, KHÔNG mask — gửi raw bitmap + YOLO box coords.
     */
    private suspend fun handleSingleCapture(
        rawBitmap: Bitmap,
        segDet: SegmentationDetection,
        imageId: String,
        treeId: String,
        sensorSnapshot: SensorSnapshot,
        isOnline: Boolean
    ) {
        val queue = treeDetectionQueue ?: return

        // ✅ Save raw bitmap — không crop, không mask
        val imagePath = queue.saveCroppedImage(rawBitmap)
        if (imagePath == null) {
            _state.value = CoordinatorState.Error("Failed to save image")
            return
        }
        Log.d("DetectionCoordinator", "💾 SINGLE_RAW: ${rawBitmap.width}x${rawBitmap.height}, path=${imagePath.absolutePath}")

        // ✅ YOLO box coords để server biết vùng cây
        val boxCoords = floatArrayOf(
            segDet.boundingBox.left / rawBitmap.width,
            segDet.boundingBox.top / rawBitmap.height,
            segDet.boundingBox.right / rawBitmap.width,
            segDet.boundingBox.bottom / rawBitmap.height
        )

        val enqueueResult = queue.enqueueDetectionWithMaskedImage(
            detection = segDet,
            maskedImagePath = imagePath.absolutePath,
            boxCoordinates = boxCoords,
            latitude = latestLocation?.latitude,
            longitude = latestLocation?.longitude,
            gpsAccuracy = latestLocation?.accuracy,
            heading = sensorSnapshot.heading,
            pitch = sensorSnapshot.pitch,
            roll = sensorSnapshot.roll,
            imageId = imageId,
            treeId = treeId,
            farmId = farmId,
            regionCode = regionCode
        )

        withContext(Dispatchers.Main) {
            enqueueResult.fold(
                onSuccess = { id ->
                    Log.d("DetectionCoordinator", "✅ Non-circular detection #$id enqueued")
                    stateMachine.setState(TreeDetectionStateMachine.State.Sending)

                    if (isOnline) {
                        lifecycleScope.launch(Dispatchers.Default) {
                            val syncResult = queue.syncPendingDetections()
                            withContext(Dispatchers.Main) {
                                handleUploadResult(syncResult, id)
                            }
                        }
                    } else {
                        _state.value = CoordinatorState.Success("Đã lưu cây, sẽ gửi khi có mạng")
                        kotlinx.coroutines.delay(2000)
                        stateMachine.reset()
                        _state.value = CoordinatorState.Scanning
                    }
                },
                onFailure = { error ->
                    Log.e("DetectionCoordinator", "❌ Non-circular enqueue failed: ${error.message}")
                    _state.value = CoordinatorState.Error(error.message ?: "Unknown error")
                    stateMachine.reset()
                }
            )
        }
    }

    /**
     * Xử lý kết quả upload cho non-circular mode.
     */
    private fun handleUploadResult(syncResult: TreeDetectionQueue.SyncResult, detectionId: Long) {
        Log.d("DetectionCoordinator", "🔍 handleUploadResult: success=${syncResult.successCount}, fail=${syncResult.failureCount}, isCircularActive=$isCircularCaptureActive")
        if (syncResult.successCount > 0) {
            Log.d("DetectionCoordinator", "✅ Non-circular upload completed: ${syncResult.successCount} success")
            // ✅ Hiện Toast cho user khi non-circular upload thành công
            kotlinx.coroutines.GlobalScope.launch(Dispatchers.Main) {
                android.widget.Toast.makeText(
                    context,
                    "Upload thành công ${syncResult.successCount} ảnh!",
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
        } else {
            Log.e("DetectionCoordinator", "❌ Non-circular upload failed: ${syncResult.failureCount} failures")
            if (_state.value !is CoordinatorState.Scanning) {
                _state.value = CoordinatorState.Error("Upload failed")
                kotlinx.coroutines.GlobalScope.launch(Dispatchers.Main) {
                    kotlinx.coroutines.delay(2000)
                    if (_state.value is CoordinatorState.Error) {
                        stateMachine.reset()
                        _state.value = CoordinatorState.Scanning
                    }
                }
            }
        }
    }

    // ─── Circular Capture lifecycle ─────────────────────────────────────────

    /**
     * Bắt đầu circular capture session.
     * Gọi từ MainActivity khi user nhấn "Bắt đầu chụp vòng quanh".
     */
    /**
     * @deprecated Không còn được gọi từ UI nữa.
     * Circular capture tự động start khi detection đầu tiên thành công
     * trong processStateMachine() via isFirstCircularCapturePending flag.
     * Giữ lại method này cho backward compatibility nếu cần.
     */
    @Deprecated(
        message = "Circular capture tự động start. Không cần gọi tay.",
        replaceWith = ReplaceWith(""),
        level = DeprecationLevel.WARNING
    )
    fun startCircularCapture(onComplete: () -> Unit) {
        isCircularCaptureActive = true
        onCircularSessionComplete = onComplete
        currentSessionId = ""
        currentSessionStartTime = 0L
        currentSessionTreeId = ""
        // StabilitySampler nằm trong CircularCaptureStateMachine — không cần reset ở đây
        circularSM.startSession { _ -> onComplete() }
        _circularSessionState.value = circularSM.getSessionState()
        _state.value = CoordinatorState.Scanning
        Log.d("DetectionCoordinator", "🔄 Circular capture started (deprecated)")
    }

    /**
     * Dừng circular capture (user cancel).
     */
    fun stopCircularCapture() {
        // 📍 FLOW E BOUNDARY: session cancelled/stopped
        Log.d("DetectionCoordinator", "🛑 [FLOW-E] stopCircularCapture CALLED: isCircularActive=$isCircularCaptureActive, pendingSector=$pendingCircularCaptureSector, isSessionPending=$_isSessionPendingUpload")
        isCircularCaptureActive = false
        _isSessionPendingUpload = false  // ✅ Reset guard flag
        stopSensorFeed() // ✅ Dừng sensor feed khi cancel
        isFirstCircularCapturePending.set(false)
        onCircularSessionComplete = null
        pendingCircularCaptureSector = null
        circularSM.endSession()
        _circularSessionState.value = CircularSessionState()

        // ✅ KHÔNG xóa pending detections khi stop/stopCircularCapture
        // Ảnh đã được lưu vào SQLite + filesDir — KHÔNG xóa ở đây
        // pending_tree_detections chỉ bị xóa khi:
        //   1. Upload thành công (UploadResult.Success → deleteImageFile)
        //   2. Quá MAX_RETRIES lần thất bại (orphan record cleanup)
        // SavedTree được mark CANCELLED để dashboard filter ra
        val treeIdCleared = currentSessionTreeId
        currentSessionId = ""
        currentSessionStartTime = 0L
        currentSessionTreeId = ""

        // ✅ Cleanup SavedTree: nếu user cancel → mark CANCELLED
        // Ảnh (pending_tree_detections) vẫn giữ lại — sẽ bị xóa khi upload fail quá MAX_RETRIES
        if (treeIdCleared.isNotEmpty()) {
            savedTreeDao?.let { dao ->
                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                    try {
                        dao.updateStatus(treeIdCleared, TreeStatus.CANCELLED)
                        Log.d("DetectionCoordinator", "🛑 [FLOW-E] SavedTree status → CANCELLED: ${treeIdCleared.takeLast(8)}")
                    } catch (e: Exception) {
                        Log.e("DetectionCoordinator", "❌ [FLOW-E] Failed to update SavedTree CANCELLED: ${e.message}")
                    }
                }
            }
        }

        Log.d("DetectionCoordinator", "🛑 [FLOW-E] Circular capture stopped — session state cleared, images preserved")
    }

    /**
     * Đang ở chế độ circular capture không.
     */
    fun isInCircularCapture(): Boolean = isCircularCaptureActive

    /**
     * User nhấn "Bỏ qua sector" — advance sang sector tiếp theo mà không capture.
     */
    fun skipCurrentSector() {
        if (!isCircularCaptureActive) {
            Log.w("DetectionCoordinator", "⚠️ skipCurrentSector: not in circular capture")
            return
        }
        Log.d("DetectionCoordinator", "⏭️ skipCurrentSector called")
        circularSM.skipCurrentSector()
        _circularSessionState.value = circularSM.getSessionState()
    }

    /**
     * Lấy treeId của session hiện tại.
     * Dùng khi session complete để lưu vào saved_trees.
     */
    fun getCurrentTreeId(): String = currentSessionTreeId

    /**
     * Lấy sessionId của session hiện tại.
     * Dùng để đếm ảnh của session này trong dialog.
     */
    fun getCurrentSessionId(): String = currentSessionId

    /**
     * Xử lý capture trigger từ CircularCaptureStateMachine.
     */
    /**
     * Capture raw camera frame tại thời điểm trigger.
     * KHÔNG crop, KHÔNG mask — server tự xử lý.
     * YOLO chỉ dùng để: (1) detect box để guidance, (2) xác nhận có cây mới trigger.
     *
     * @param rawBitmap  Raw bitmap từ camera (full resolution)
     * @param segDet     YOLO detection — dùng để lấy box coords gửi server
     * @param sectorIndex Sector index tại thời điểm trigger
     */
    private suspend fun handleCircularCapture(
        rawBitmap: Bitmap,
        segDet: SegmentationDetection,
        sectorIndex: Int
    ) {
        // ✅ Bug 1 fix: Atomic compareAndSet — ngăn frame tiếp theo trigger lại trong khi đang xử lý
        if (!isHandlingCapture.compareAndSet(false, true)) {
            Log.w("DetectionCoordinator", "⚠️ handleCircularCapture already running, skipping sector $sectorIndex")
            return
        }
        try {
            fun failCapture(reason: String) {
                Log.e("DetectionCoordinator", "❌ CAPTURE_FAIL: sector=$sectorIndex, reason=$reason")
                circularSM.onCaptureDone(CaptureResult.Failure(sectorIndex, reason))
                _circularSessionState.value = circularSM.getSessionState()
                _state.value = CoordinatorState.Scanning
            }

            val queue = treeDetectionQueue
            if (queue == null) {
                failCapture("Queue not ready")
                return
            }
            val ctx = context
            if (ctx == null) {
                failCapture("Context not ready")
                return
            }

            Log.d("DetectionCoordinator", "📸 CAPTURE: sector=$sectorIndex, bitmap=${rawBitmap.width}x${rawBitmap.height}, label=${segDet.label}, conf=${"%.2f".format(segDet.confidence)}")

            // Session should already be initialized in processStateMachine()
            // If not, this is a fallback (should not happen in normal flow)
            if (currentSessionId.isEmpty() || currentSessionTreeId.isEmpty()) {
                Log.w("DetectionCoordinator", "⚠️ Session not initialized - this should not happen")
                failCapture("Session not initialized")
                return
            }

            // ✅ Gửi ảnh FULL — không xóa background
            val capturedBitmap = rawBitmap.copy(Bitmap.Config.ARGB_8888, false)

            // Save full image
            val imagePath = queue.saveCroppedImage(capturedBitmap)
            if (imagePath == null) {
                failCapture("Failed to save image")
                return
            }
            Log.d("DetectionCoordinator", "💾 RAW_IMAGE: ${rawBitmap.width}x${rawBitmap.height}, path=${imagePath.absolutePath}")

            // Sensor data tại thời điểm chụp
            val sensorSnapshot = SensorDataCollector.snapshot
            val imgId = IdGenerator.generateImageId()

            // ✅ Box coords vẫn gửi — để server biết vùng tree trong ảnh (nếu cần)
            // boundingBox đã trong original image coords (parse từ letterbox → un-letterbox)
            val boxCoords = floatArrayOf(
                segDet.boundingBox.left / rawBitmap.width,
                segDet.boundingBox.top / rawBitmap.height,
                segDet.boundingBox.right / rawBitmap.width,
                segDet.boundingBox.bottom / rawBitmap.height
            )
            // Log thêm mask info để debug
            segDet.maskData?.let { md ->
                Log.d("DetectionCoordinator", "📦 BOX_ORIG: [${"%.4f".format(boxCoords[0])},${"%.4f".format(boxCoords[1])},${"%.4f".format(boxCoords[2])},${"%.4f".format(boxCoords[3])}], letterboxCrop=[${(md.boxLetterbox.left*160).toInt()}:${(md.boxLetterbox.right*160).toInt()}]x[${(md.boxLetterbox.top*160).toInt()}:${(md.boxLetterbox.bottom*160).toInt()}]")
            } ?: Log.d("DetectionCoordinator", "📦 BOX_ORIG: [${"%.4f".format(boxCoords[0])},${"%.4f".format(boxCoords[1])},${"%.4f".format(boxCoords[2])},${"%.4f".format(boxCoords[3])}]")

            // Enqueue với masked image
            val enqueueResult = queue.enqueueDetectionWithMaskedImage(
                detection = segDet,
                maskedImagePath = imagePath.absolutePath,
                boxCoordinates = boxCoords,
                latitude = latestLocation?.latitude,
                longitude = latestLocation?.longitude,
                gpsAccuracy = latestLocation?.accuracy,
                heading = sensorSnapshot.heading,
                pitch = sensorSnapshot.pitch,
                roll = sensorSnapshot.roll,
                imageId = imgId,
                treeId = currentSessionTreeId,
                farmId = farmId,
                regionCode = regionCode
            )

            val result = enqueueResult.fold(
                onSuccess = { id ->
                    Log.d("DetectionCoordinator", "✅ CAPTURE_DONE: detectionId=$id, sector=$sectorIndex")
                    CaptureResult.Success(sectorIndex, CropResult(rawBitmap, floatArrayOf(0f,0f,0f,0f), boxCoords, 0f, segDet), imgId, currentSessionTreeId)
                },
                onFailure = { error ->
                    Log.e("DetectionCoordinator", "❌ CAPTURE_FAIL: sector=$sectorIndex, reason=${error.message}")
                    CaptureResult.Failure(sectorIndex, error.message ?: "Unknown error")
                }
            )

        // Báo lại cho state machine
        circularSM.onCaptureDone(result)

        Log.d("DetectionCoordinator", "🧹 PRE-CLEAR: cache=${overlayDetectionsCache.size}, state=${circularSM.getSessionState().state}")
        overlayDetectionsCache = emptyList()
        overlayCacheTimestamp = 0L
        circularSM.resetConditions()

        _detectionResult.value = DetectionResult(
            emptyList(),
            null,
            overlayImageWidth,
            overlayImageHeight,
            overlayRotationDegrees
        )
        Log.d("DetectionCoordinator", "🧹 POST-CLEAR: cache=0, nextSector=${circularSM.getSessionState().currentTargetSector?.index}, state=${circularSM.getSessionState().state}, DR_EMITTED=empty")

        if (circularSM.getSessionState().state == CircularState.COMPLETE) {
            isCircularCaptureActive = false
            // ✅ FIX: Đã được set trong onComplete callback của startSessionWithReferenceHeading (Path 1)
            // KHÔNG set lại ở đây để tránh confusion
            stopSensorFeed()
            Log.d("DetectionCoordinator", "🏁 [FLOW-C] Session complete — upload already triggered via Path 1")
        }

        _circularSessionState.value = circularSM.getSessionState()
        Log.d("DetectionCoordinator", "📤 Circular state after capture: ${_circularSessionState.value.state}, sectors=${_circularSessionState.value.capturedCount}")

        // Nếu còn chưa complete → quay lại Scanning
        if (circularSM.getSessionState().state != CircularState.COMPLETE) {
            _state.value = CoordinatorState.Scanning
        }
        } catch (e: Exception) {
            val reason = e.message ?: "Unknown error"
            Log.e("DetectionCoordinator", "❌ CAPTURE_EXCEPTION: sector=$sectorIndex, reason=$reason", e)
            circularSM.onCaptureDone(CaptureResult.Failure(sectorIndex, reason))
            _circularSessionState.value = circularSM.getSessionState()
            _state.value = CoordinatorState.Scanning
        } finally {
            // ✅ Bug 1 fix: Luôn reset atomic flag khi kết thúc (dù success hay failure)
            isHandlingCapture.set(false)
            Log.d("DetectionCoordinator", "🏁 handleCircularCapture FINALLY: isHandlingCapture=false, sector=$sectorIndex")
        }
    }

    // ─── Location ───────────────────────────────────────────────────────────

    fun updateLocation(location: Location?) {
        latestLocation = location
    }
    
    fun pauseDetection() {
        isProcessingPaused = true
        Log.d("DetectionCoordinator", "⏸️ Detection PAUSED (YOLO + state machine)")
    }

    fun resumeDetection() {
        isProcessingPaused = false
        Log.d("DetectionCoordinator", "▶️ Detection RESUMED")
    }

    fun pauseOverlay() {
        isOverlayPaused = true
        Log.d("DetectionCoordinator", "⏸️ Overlay PAUSED (UI only)")
    }

    fun resumeOverlay() {
        isOverlayPaused = false
        Log.d("DetectionCoordinator", "▶️ Overlay RESUMED")
    }

    /**  Sensor feed riêng — update heading 100ms/lần, không phụ thuộc frame rate camera */
    private fun startSensorFeed() {
        sensorFeedJob?.cancel()
        sensorFeedJob = CoroutineScope(Dispatchers.Default).launch {
            while (isActive && isCircularCaptureActive) {
                circularSM.onSensorUpdate(
                    heading = SensorDataCollector.snapshot.heading?.toFloat(),
                    accelX = SensorDataCollector.accelX,
                    accelY = SensorDataCollector.accelY,
                    accelZ = SensorDataCollector.accelZ
                )
                _circularSessionState.value = circularSM.getSessionState()
                delay(100) 
            }
        }
    }

    private fun stopSensorFeed() {
        sensorFeedJob?.cancel()
        sensorFeedJob = null
    }

    fun resetTracking() {
        lifecycleScope.launch(Dispatchers.Main.immediate) {
            Log.d("DetectionCoordinator", "🔄 [RESET] resetTracking CALLED: isCircularActive=$isCircularCaptureActive, isPending=$_isSessionPendingUpload, isHandling=$isHandlingCapture, treeId=${currentSessionTreeId.takeLast(8)}")
            detectionTracker.clear()
            _stableDetections.value = emptyList()
            stateMachine.resume()
            stateMachine.reset()
            _state.value = CoordinatorState.Scanning

            if (isCircularCaptureActive) {
                stopCircularCapture()
            }

            lastCropResults = emptyList()
            lastCropResult = null

            // ✅ Session ID reset: CHỈ khi KHÔNG còn pending upload
            // Nếu đang có upload chạy (Activity destroy giữa upload) → giữ treeId
            // để WorkManager upload đúng session. Reset khi upload hoàn tất.
            if (!_isSessionPendingUpload) {
                currentSessionId = ""
                currentSessionStartTime = 0L
                currentSessionTreeId = ""
            }
            _isSessionPendingUpload = false
            lastBlurScore = null
            isWaitingForStableFocus = false
            lastAutoFocusTriggerAt = 0L
            isHandlingCapture.set(false)

            Log.d("DetectionCoordinator", "🔄 [RESET] Tracking reset DONE — ready for new detection")
        }
    }

    fun getLetterboxParams(): LetterboxResult? = lastLetterboxResult
    fun getProcessedImage(): ProcessedImage? = lastProcessedImage

    /**
     * Create tree on server once for the current session
     * Called after generating currentSessionTreeId
     */
    private fun createSessionTree() {
        if (currentSessionTreeId.isEmpty()) {
            Log.w("DetectionCoordinator", "⚠️ Cannot create tree: sessionTreeId is empty")
            return
        }

        Log.d("DetectionCoordinator", "🌳 Creating session tree on server: $currentSessionTreeId")

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val treeApi = com.mvp.orilife.network.TreeAPI(
                    com.mvp.orilife.Config.BASE_API_URL,
                    com.mvp.orilife.Config.API_KEY
                )

                val geohash7 = calculateGeohash(latestLocation?.latitude, latestLocation?.longitude)

                val treeRequest = com.mvp.orilife.network.models.TreeCreateRequest(
                    id = currentSessionTreeId,
                    regionCode = regionCode ?: com.mvp.orilife.Config.DEFAULT_REGION_CODE,
                    farmId = farmId ?: "",
                    geohash7 = geohash7,
                    latitude = latestLocation?.latitude,
                    longitude = latestLocation?.longitude,
                    rowIdx = null,
                    colIdx = null,
                    codebookId = "codebook_v1",
                    metadata = null,
                    capturedAt = null
                )

                val result = treeApi.createTree(treeRequest)

                if (result.isSuccess) {
                    Log.d("DetectionCoordinator", "✅ Session tree created on server: $currentSessionTreeId")
                } else {
                    val error = result.exceptionOrNull()
                    if (error is com.mvp.orilife.network.ApiException && error.isConflict) {
                        Log.d("DetectionCoordinator", "ℹ️ Session tree already exists on server")
                    } else {
                        Log.e("DetectionCoordinator", "❌ Failed to create session tree: ${error?.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e("DetectionCoordinator", "❌ Exception creating session tree: ${e.message}", e)
            }
        }
    }

    /**
     * Calculate geohash from coordinates
     */
    private fun calculateGeohash(latitude: Double?, longitude: Double?): String {
        if (latitude == null || longitude == null) {
            return "w3gvk9q"  // Fallback: centroid of vn-south-01 region
        }
        return encodeGeohash(latitude, longitude, 7)
    }

    private fun encodeGeohash(lat: Double, lng: Double, precision: Int): String {
        val base32 = "0123456789bcdefghjkmnpqrstuvwxyz"
        var minLat = -90.0
        var maxLat = 90.0
        var minLng = -180.0
        var maxLng = 180.0
        var result = ""
        var bits = 0
        var hashValue = 0
        var isEven = true

        while (result.length < precision) {
            if (isEven) {
                val mid = (minLng + maxLng) / 2
                if (lng >= mid) {
                    hashValue = (hashValue shl 1) or 1
                    minLng = mid
                } else {
                    hashValue = hashValue shl 1
                    maxLng = mid
                }
            } else {
                val mid = (minLat + maxLat) / 2
                if (lat >= mid) {
                    hashValue = (hashValue shl 1) or 1
                    minLat = mid
                } else {
                    hashValue = hashValue shl 1
                    maxLat = mid
                }
            }
            isEven = !isEven
            bits++
            if (bits == 5) {
                result += base32[hashValue]
                bits = 0
                hashValue = 0
            }
        }
        return result
    }
}
