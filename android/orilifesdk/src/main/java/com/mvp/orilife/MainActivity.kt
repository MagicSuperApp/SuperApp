package com.mvp.orilife

import com.mvp.orilife.camera.CameraStateManager
import com.mvp.orilife.coordinator.CircularState
import com.mvp.orilife.ui.CaptureGuidanceOverlay
import com.mvp.orilife.data.LocationHelper
import com.mvp.orilife.data.VirtualIDManager
import com.mvp.orilife.detection.YOLODetectionHelper
import com.mvp.orilife.network.NetworkMonitor
import com.mvp.orilife.network.TreeDetectionQueue
import com.mvp.orilife.network.UploadManager
import androidx.work.WorkInfo
import com.mvp.orilife.security.MonotonicCounter
import com.mvp.orilife.security.SecureSignature
import com.mvp.orilife.security.TrustScoreManager
import com.mvp.orilife.sensor.SensorTriggerManager

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import com.mvp.orilife.camera.CameraManager
import com.mvp.orilife.camera.CameraState
import com.mvp.orilife.coordinator.DetectionCoordinator
import com.mvp.orilife.database.HarvestDatabase
import com.mvp.orilife.ui.ProgressRingView
import com.mvp.orilife.ui.StatusType
import com.mvp.orilife.ui.UIController

class MainActivity : AppCompatActivity(), LocationHelper.LocationListener {

    override fun onLocationFound(location: Location) {
        detectionCoordinator.updateLocation(location)
    }

    override fun onLocationWait(currentAccuracy: Float) {}

    private lateinit var cameraManager: CameraManager
    private lateinit var uiController: UIController
    private lateinit var captureGuidanceOverlay: CaptureGuidanceOverlay
    private lateinit var progressRing: ProgressRingView
    private lateinit var detectionCoordinator: DetectionCoordinator
    private lateinit var locationHelper: LocationHelper
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var treeDetectionQueue: TreeDetectionQueue
    private lateinit var sensorTriggerManager: SensorTriggerManager
    private lateinit var cameraStateManager: CameraStateManager
    private lateinit var trustScoreManager: TrustScoreManager
    private lateinit var monotonicCounter: MonotonicCounter
    private lateinit var secureSignature: SecureSignature
    private lateinit var uploadManager: UploadManager
    
    // Farm data passed from React Native - stored and returned when scan completes
    private var farmId: String? = null
    private var regionCode: String? = null

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        handlePermissionResult(permissions)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        setupWindowFlags()
        logDeviceInformation()
        setupUI()
        initializeComponents()
        setupPermissions()
    }

    private fun setupWindowFlags() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.apply {
                hide(android.view.WindowInsets.Type.statusBars())
                systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }

    private fun logDeviceInformation() {
        val metrics = resources.displayMetrics
        val (displayWidth, displayHeight) = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            val bounds = windowManager.currentWindowMetrics.bounds
            Pair(bounds.width(), bounds.height())
        } else {
            val size = android.graphics.Point()
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getSize(size)
            Pair(size.x, size.y)
        }

        Log.d("MainActivity", "═══════════════════════════════════════")
        Log.d("MainActivity", "📱 DEVICE: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
        Log.d("MainActivity", "   Android: ${android.os.Build.VERSION.RELEASE}(API ${android.os.Build.VERSION.SDK_INT})")
        Log.d("MainActivity", "📐 DISPLAY: ${metrics.widthPixels}x${metrics.heightPixels} / $displayWidth x $displayHeight")
        Log.d("MainActivity", "═══════════════════════════════════════")
    }

    private fun initializeComponents() {
        farmId = intent.getStringExtra("farm_id") ?: ""
        regionCode = intent.getStringExtra("region_code") ?: ""

        initializeDatabase()
        initializeManagers()
        initializeSecurity()
        initializeCamera()
        initializeLocation()
        initializeNetwork()
        initializeSensors()
        initializeDetection()
    }

    private fun initializeDatabase() {
        HarvestDatabase.getDatabase(this)
    }

    private fun initializeManagers() {
        VirtualIDManager.initialize(this)
        trustScoreManager = TrustScoreManager(this)
        cameraStateManager = CameraStateManager.getInstance().apply {
            setAutoPowerOffDelay(30 * 60 * 1000L)  // Tăng từ 5 phút → 30 phút để test
        }
    }

    private fun initializeSecurity() {
        monotonicCounter = MonotonicCounter(this)
        secureSignature = SecureSignature(this)

        lifecycleScope.launch {
            monotonicCounter.initialize().onFailure {
                Log.e("MainActivity", "Failed to initialize MonotonicCounter", it)
            }

            secureSignature.initialize().onFailure {
                Log.e("MainActivity", "Failed to initialize SecureSignature", it)
            }.onSuccess {
                Log.d("MainActivity", "Device ID: ${secureSignature.getDeviceId()}")
            }
        }
    }

    private fun initializeCamera() {
        val previewView = findViewById<PreviewView>(R.id.view_finder)
        cameraManager = CameraManager(this, this).apply {
            setPreviewView(previewView)
            setOnImageFrameListener { image ->
                handleCameraFrame(image)
            }
        }

        observeCameraState()
    }

    private fun initializeDetection() {
        val yoloHelper = YOLODetectionHelper(
            threshold = Config.YOLO_CONFIDENCE_THRESHOLD,
            numThreads = Config.NUM_THREADS,
            maxResults = Config.MAX_RESULTS,
            context = this,
            listener = null
        )

        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Default) {
            yoloHelper.warmupModel()
        }

        detectionCoordinator = DetectionCoordinator(
            yoloHelper,
            trustScoreManager,
            lifecycleScope,
            this,
            cameraManager,
            farmId,
            regionCode
        )

        // ✅ GÁN LISTENER — callback này FIRE KHI session complete hoặc partial complete
        detectionCoordinator.onCircularSessionComplete = {
            onCircularSessionComplete()
        }

        // ✅ SETUP state machine callbacks sau khi onCircularSessionComplete đã được gán.
        // Đặt ở đây thay vì constructor để đảm bảo callback chain không bị null.
        detectionCoordinator.setupCircularCallbacks(
            onCaptureTriggered = { sectorIndex ->
                Log.d("MainActivity", "🎯 [CALLBACK] onCaptureTriggered sector=$sectorIndex")
                detectionCoordinator.setPendingCircularCaptureSector(sectorIndex)
            },
            onSessionComplete = { capturedCount ->
                Log.w("MainActivity", "🏁 [CALLBACK] onSessionComplete FIRED! captured=$capturedCount")
                onCircularSessionComplete()
            }
        )

        observeDetectionState()
        observeCoordinatorState()
    }

    private fun initializeLocation() {
        locationHelper = LocationHelper(this, this)
    }

    private fun initializeNetwork() {
        networkMonitor = NetworkMonitor(this)
        treeDetectionQueue = TreeDetectionQueue.getInstance(this)
        // ✅ UploadManager — singleton, survive process death qua WorkManager
        uploadManager = UploadManager.getInstance(this)

        treeDetectionQueue.setSyncCallback(object : TreeDetectionQueue.SyncCallback {
            private var lastDetectionData: TreeDetectionQueue.DetectionData? = null

            override fun onSyncSuccess(treeId: String, detectionData: TreeDetectionQueue.DetectionData) {
                // Store last detection data for dialog
                lastDetectionData = detectionData
                Log.d("MainActivity", "✅ Tree synced: $treeId")
            }

            override fun onSyncFailed(detectionId: Long, error: String) {
                Log.e("MainActivity", "Sync failed for #$detectionId: $error")
            }

            override fun onBatchSyncComplete(successCount: Int, treeIds: List<String>) {
                // Show dialog only when all detections in batch are complete
                handleBatchSyncSuccess(successCount, treeIds, lastDetectionData)
            }
        })

        // ✅ Chỉ gửi ảnh khi user nhấn "Tải lên" trong dialog hoàn thành.
        // KHÔNG auto-sync trước khi đủ 8 sector.
        // Auto-sync bị tắt — ảnh chỉ được gửi qua uploadCircularSession().
        treeDetectionQueue.disableAutoSync()

        // ✅ Bắt đầu observe network state — auto-retry upload khi có mạng
        observeNetworkState()
    }

    private fun initializeSensors() {
        sensorTriggerManager = SensorTriggerManager(this, object : SensorTriggerManager.TriggerListener {
            override fun onShakeDetected(intensity: Float) {
                cameraStateManager.recordActivity()
            }

            override fun onCuttingActionDetected() {
                cameraStateManager.recordActivity()
                uiController.updateStatus("Phát hiện chuyển động — đang quét", StatusType.SCANNING)
            }

            override fun onMovementStopped() {
                cameraStateManager.enterLowPowerMode()
            }
        })

        setupCameraStateListener()
    }

    private fun setupUI() {
        uiController = UIController(findViewById(android.R.id.content), this)

        // Init circular capture overlay
        captureGuidanceOverlay = findViewById(R.id.captureGuidanceOverlay)

        // Init progress ring (top-right, hiển thị số sector đã chụp)
        progressRing = findViewById(R.id.progressRing)

        findViewById<android.view.View>(R.id.btnClose)?.setOnClickListener {
            finish()
        }

    }

    private fun setupPermissions() {
        if (hasRequiredPermissions()) {
            startApp()
        } else {
            requestPermissions()
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestPermissions() {
        requestPermissionLauncher.launch(arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION
        ))
    }

    private fun handlePermissionResult(permissions: Map<String, Boolean>) {
        val cameraGranted = permissions[Manifest.permission.CAMERA] ?: false
        val locationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false

        if (cameraGranted && locationGranted) {
            startApp()
        }else {
            Toast.makeText(this, "Camera and Location permissions required", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    // === EDGE CASE FIX #2: Orphaned pending data ===
    // If app was force-quit after capture but before upload, SQLite still has pending rows.
    // These belong to a PREVIOUS tree session — they should be kept and uploaded!
    // DO NOT clear them — clearPending() would also wipe the CURRENT session's images.
    private fun checkOrphanedPendingData() {
        // Không hiện thông báo — ảnh cũ tự động upload khi đủ 8 sector
        lifecycleScope.launch {
            val count = treeDetectionQueue.getPendingCount()
            if (count > 0) {
                Log.d("MainActivity", "📦 $count pending detections from previous session — will upload with next session")
            }
        }
    }

    private fun startApp() {
        cameraManager.startCamera()
        locationHelper.startLocationUpdates()
        sensorTriggerManager.start()
        checkOrphanedPendingData()
        uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
    }

    private fun observeCameraState() {
        lifecycleScope.launch {
            cameraManager.state.collect { state ->
                when (state) {
                    is CameraState.Running -> uiController.updateStatus("Camera đã sẵn sàng", StatusType.CAMERA_ON)
                    is CameraState.Stopped -> uiController.updateStatus("Camera đã tắt", StatusType.CAMERA_OFF)
                    is CameraState.Error -> uiController.updateStatus(state.message, StatusType.ERROR)
                    else -> {}
                }
            }
        }
    }
    
    private fun observeCoordinatorState() {
        // Observe coordinator state for upload status
        lifecycleScope.launch {
            detectionCoordinator.state.collect { state ->
                when (state) {
                    is com.mvp.orilife.coordinator.CoordinatorState.Scanning -> {
                        uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
                        uiController.hideLoading()
                        // ✅ Bug A fix: Resume overlay when leaving Uploading state
                        detectionCoordinator.resumeOverlay()
                    }
                    is com.mvp.orilife.coordinator.CoordinatorState.Uploading -> {
                        // ✅ Bug A fix: Pause overlay UI nhưng state machine VẪN CHẠY
                        // Để blur/yolo check tiếp tục → capture không bị kẹt khi đang upload
                        detectionCoordinator.pauseOverlay()
                        uiController.clearOverlay()
                        uiController.showLoading("Đang gửi lên server", "Vui lòng chờ trong giây lát")
                        uiController.updateStatus("Đang gửi lên server", StatusType.UPLOADING)
                    }
                    is com.mvp.orilife.coordinator.CoordinatorState.Success -> {
                        // Check if it's offline success message
                        if (state.message.contains("sẽ gửi khi có mạng")) {
                            // OFFLINE: Show toast and continue
                            Toast.makeText(this@MainActivity, state.message, Toast.LENGTH_LONG).show()
                            uiController.updateStatus(state.message, StatusType.OFFLINE)
                        } else {
                            uiController.updateStatus("Đã gửi thành công", StatusType.SUCCESS)
                        }
                    }
                    is com.mvp.orilife.coordinator.CoordinatorState.Error -> {
                        uiController.hideLoading()
                        uiController.updateStatus("Đã có lỗi: ${state.message}", StatusType.ERROR)
                        Toast.makeText(this@MainActivity, "Lỗi: ${state.message}", Toast.LENGTH_SHORT).show()
                        // Resume detection on error
                        detectionCoordinator.resumeDetection()
                    }
                    else -> {}
                }
            }
        }
    }

    private fun observeDetectionState() {
        lifecycleScope.launch {
            detectionCoordinator.detectionResult.collect { result ->
                if (result == null) {
                    Log.v("MainActivity", "📹 DR received: NULL — clearing overlay")
                    uiController.updateOverlay(emptyList(), 0, 0, 0)
                } else {
                    val circularActive = detectionCoordinator.isInCircularCapture()
                    val sector = detectionCoordinator.circularSessionState.value.currentTargetSector?.index
                    Log.d("MainActivity", "📹 DR: ${result.detections.size} boxes, circular=$circularActive, sector=$sector, bitmap=${result.croppedImage != null}")
                    uiController.updateOverlay(result.detections, result.imageWidth, result.imageHeight, result.rotationDegrees)
                }
            }
        }

        lifecycleScope.launch {
            detectionCoordinator.stableDetections.collect { detections ->
                val confirmed = detections.filter { it.isConfirmed }
                if (confirmed.isNotEmpty()) {
                    val currentState = detectionCoordinator.state.value
                    if (!detectionCoordinator.isInCircularCapture() &&
                        currentState !is com.mvp.orilife.coordinator.CoordinatorState.Uploading &&
                        currentState !is com.mvp.orilife.coordinator.CoordinatorState.Success) {
                        uiController.updateStatus("Đã phát hiện ${confirmed.size} cây", StatusType.DETECTED)
                    }
                }
            }
        }

        lifecycleScope.launch {
            detectionCoordinator.isStableForDetection.collect { isStable ->
                if (!isStable && Config.BLUR_CHECK_ENABLED) {
                    uiController.updateStatus("Đang lấy nét — giữ camera ổn định", StatusType.FOCUSING)
                }
            }
        }

        // ✅ Observer circular session state — auto hiển thị overlay khi capture bắt đầu
        lifecycleScope.launch {
            detectionCoordinator.circularSessionState.collect { state ->
                Log.d("MainActivity", "🔔 Circular state received: ${state.state}, sectors=${state.capturedCount}")
                captureGuidanceOverlay.bindState(state)

                // Đồng bộ count với progress ring (match iOS)
                progressRing.setCapturedCount(state.capturedCount)

                // Tự động show/hide overlay + progress ring theo state
                val isActive = state.state != CircularState.INACTIVE && state.state != CircularState.COMPLETE
                captureGuidanceOverlay.visibility = if (isActive) View.VISIBLE else View.GONE
                progressRing.visibility = if (isActive) View.VISIBLE else View.GONE
            }
        }

        // ✅ Bind skip button → gọi state machine skip
        captureGuidanceOverlay.onSkipClicked = {
            Log.d("MainActivity", "👆 Skip button clicked")
            detectionCoordinator.skipCurrentSector()
        }
    }

    private fun observeNetworkState() {
        networkMonitor.isOnline.observe(this) { isOnline ->
            if (!isOnline) {
                if (!isDestroyed) {
                    uiController.updateStatus("Mất mạng — ảnh được lưu cục bộ", StatusType.OFFLINE)
                }
            } else {
                Log.d("MainActivity", "📶 Network online → enqueue upload via WorkManager")
                // ✅ WorkManager sẽ tự động retry khi network phục hồi
                // (Constraint networkAvailable = true)
                uploadManager.enqueueUpload()
            }
        }
    }

    private fun setupCameraStateListener() {
        cameraStateManager.setCameraStateListener(object : CameraStateManager.CameraStateListener {
            override fun onCameraTurnedOn() {
                uiController.updateStatus("Camera đã bật — đang quét", StatusType.CAMERA_ON)
            }

            override fun onCameraTurnedOff() {
                uiController.updateStatus("Camera đã tắt", StatusType.CAMERA_OFF)
            }

            override fun onLowPowerMode() {
                uiController.updateStatus("Đang ở chế độ tiết kiệm pin", StatusType.LOW_POWER)
            }

            override fun onAutoPowerOff() {
                Toast.makeText(this@MainActivity, "Camera tự động tắt", Toast.LENGTH_LONG).show()
            }
        })
    }

    private fun handleCameraFrame(image: androidx.camera.core.ImageProxy) {
        lifecycleScope.launch {
            val cameraConfig = cameraManager.configData.value
            detectionCoordinator.processCameraFrame(image, cameraConfig)
        }
    }

    // ─── Circular Capture ──────────────────────────────────────────────────
    // Circular capture tự động bắt đầu khi detection đầu tiên thành công.
    // State được observe trong observeDetectionState() — tự hiển thị overlay.
    //
    // onCircularSessionComplete() được gọi từ DetectionCoordinator qua callback.

    private fun onCircularSessionComplete() {
        Log.d("MainActivity", "🔔 [FLOW-C] onCircularSessionComplete FIRED")

        if (isFinishing || isDestroyed) {
            Log.w("MainActivity", "⚠️ [FLOW-C] Activity finishing/destroyed — skip")
            return
        }

        if (isUploadInProgress) {
            Log.w("MainActivity", "⚠️ [FLOW-C] Upload already in progress — skipping duplicate callback")
            return
        }

        val treeId = detectionCoordinator.getCurrentTreeId()
        val sessionState = detectionCoordinator.circularSessionState.value
        val capturedCount = sessionState.capturedCount

        Log.d("MainActivity", "=== FLOW-C treeId=${treeId.takeLast(8)} captured=$capturedCount ===")

        isUploadInProgress = true

        // 1. Lưu treeId vào local DB (đồng bộ, timeout 2s tránh ANR)
        try {
            kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO) {
                kotlinx.coroutines.withTimeoutOrNull(2000L) {
                    saveTreeIdOnly(treeId)
                }
            }
            Log.d("MainActivity", "💾 [FLOW-C] Tree saved to local DB: ${treeId.takeLast(8)}")
        } catch (e: Exception) {
            Log.w("MainActivity", "⚠️ [FLOW-C] Tree save failed (non-critical): ${e.message}")
        }

        // 2. Fire broadcast NGAY → JS (FarmDetailScreen) sẽ saveTree + reload trees.
        //    Không đợi upload xong — tree đã có trong local DB, ảnh upload background.
        if (treeId.isNotEmpty()) {
            fireScanCompleteBroadcast(arrayListOf(treeId))
            Log.d("MainActivity", "📡 [FLOW-C] Broadcast fired for treeId=${treeId.takeLast(8)}")
        } else {
            Log.w("MainActivity", "⚠️ [FLOW-C] treeId empty — skip broadcast")
        }

        // 3. Enqueue upload vào WorkManager — chạy background, survive activity finish
        try {
            uploadManager.enqueueUpload(treeId)
            Log.d("MainActivity", "🚀 [FLOW-C] Upload enqueued (background)")
        } catch (e: Exception) {
            Log.e("MainActivity", "❌ [FLOW-C] Failed to enqueue upload: ${e.message}", e)
        }

        // 4. Toast + finish ngay → user quay lại FarmDetail và thấy cây mới
        try {
            Toast.makeText(this, "Đã thêm cây vào trang trại", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e("MainActivity", "Toast failed: ${e.message}")
        }

        Handler(Looper.getMainLooper()).postDelayed({
            try {
                if (this.isFinishing || this.isDestroyed) {
                    isUploadInProgress = false
                    return@postDelayed
                }
                resetCircularSession()
                isUploadInProgress = false
                finish()
                Log.d("MainActivity", "🏁 [FLOW-C] Activity finished, returning to RN")
            } catch (e: Exception) {
                Log.e("MainActivity", "❌ finish failed: ${e.message}")
                isUploadInProgress = false
                try { finish() } catch (_: Exception) {}
            }
        }, 300)
    }

    private var isUploadInProgress = false

    // ✅ FIX: isFinishing/isDestroyed — dùng trong guards để tránh upload khi Activity dying
    private var isFinishing = false
    private var isDestroyed = false

    // ✅ Track work ID của session upload hiện tại — observer chỉ react cho work này.
    //    Tránh stale SUCCEEDED của session cũ làm popup tự đóng.
    private var currentUploadWorkId: java.util.UUID? = null
    // De-dupe: terminal state (SUCCEEDED/FAILED) chỉ xử lý 1 lần / session.
    private var hasProcessedTerminalState = false

    private fun uploadCircularSession(@Suppress("UNUSED_PARAMETER") treeId: String) {
        // 📍 FLOW D BOUNDARY: upload started automatically after COMPLETE
        // ✅ Dùng WorkManager (UploadManager) — survive process death, no Activity leak
        Log.d("MainActivity", "🚀 [FLOW-D] uploadCircularSession ENTRY: isUploadInProgress=$isUploadInProgress")

        if (isDestroyed) {
            // Activity đã destroy → chỉ enqueue work, không cập nhật UI
            Log.w("MainActivity", "⚠️ [FLOW-D] Activity destroyed — enqueue work only")
            uploadManager.enqueueUpload(treeId)
            return
        }

        // Show loading trước khi enqueue
        try {
            uiController.showLoading("Đang gửi lên server", "Vui lòng chờ trong giây lát")
            Log.d("MainActivity", "[FLOW-D] showLoading succeeded")
        } catch (e: Throwable) {
            Log.e("MainActivity", "[FLOW-D] showLoading CRASHED: ${e.message}", e)
        }

        // ✅ Reset terminal-state guard cho session mới TRƯỚC KHI enqueue
        hasProcessedTerminalState = false

        // ✅ Enqueue upload vào WorkManager — WorkManager quản lý lifecycle
        // Work sẽ chạy kể cả khi Activity destroy. Capture workId để observer
        // chỉ react cho work này (tránh stale state từ session cũ).
        currentUploadWorkId = uploadManager.enqueueUpload(treeId)

        // KHÔNG launch FarmDetailActivity ở đây — RN side đã mount FarmDetailScreen ở task trước.
        // finish() sẽ được gọi trong showUploadResult() sau khi user thấy "Đã gửi thành công".

        // Observe WorkManager state cho ĐÚNG work vừa enqueue
        observeUploadStateForCurrentWork()

        Log.d("MainActivity", "✅ [FLOW-D] Work enqueued via UploadManager")
    }

    // ✅ Observe WorkInfo cho ĐÚNG work của session hiện tại (theo UUID).
    // Tránh nhận stale SUCCEEDED từ work cũ → popup KHÔNG còn tự đóng ngay khi attach.
    private fun observeUploadStateForCurrentWork() {
        val workId = currentUploadWorkId ?: run {
            Log.w("MainActivity", "observeUploadStateForCurrentWork: currentUploadWorkId null")
            return
        }
        Log.d("MainActivity", "Observing workId=$workId")

        uploadManager.observeWorkById(workId).observe(this) { workInfo ->
            if (isDestroyed) return@observe
            if (workInfo == null) return@observe
            // Defensive: nếu user đã đóng activity rồi, một work khác đến → bỏ qua
            if (currentUploadWorkId != workId) return@observe
            // De-dupe: state cuối (SUCCEEDED/FAILED/CANCELLED) chỉ xử lý 1 lần
            if (hasProcessedTerminalState) return@observe

            Log.d("MainActivity", "WorkInfo[$workId]: state=${workInfo.state}")

            when (workInfo.state) {
                androidx.work.WorkInfo.State.ENQUEUED,
                androidx.work.WorkInfo.State.BLOCKED -> {
                    // Đợi network/constraint → giữ loading
                }
                androidx.work.WorkInfo.State.RUNNING -> {
                    try {
                        uiController.showLoading("Đang gửi ảnh lên server", "Vui lòng chờ")
                    } catch (e: Throwable) {
                        Log.e("MainActivity", "showLoading failed: ${e.message}")
                    }
                }
                androidx.work.WorkInfo.State.SUCCEEDED -> {
                    hasProcessedTerminalState = true
                    Log.d("MainActivity", "WorkInfo: SUCCEEDED — handling result")
                    try {
                        uiController.hideLoading()
                    } catch (e: Throwable) {
                        Log.e("MainActivity", "hideLoading failed: ${e.message}")
                    }
                    val successCount = workInfo.outputData.getInt("success_count", 0)
                    // ✅ Toast được show 1 lần duy nhất trong showUploadResult — tránh trùng.
                    showUploadResult(successCount, 0, 0)
                }
                androidx.work.WorkInfo.State.FAILED -> {
                    hasProcessedTerminalState = true
                    Log.d("MainActivity", "WorkInfo: FAILED")
                    try {
                        uiController.hideLoading()
                    } catch (e: Throwable) {
                        Log.e("MainActivity", "hideLoading failed: ${e.message}")
                    }
                    val errorMsg = workInfo.outputData.getString("error") ?: "Lỗi tải lên"
                    Toast.makeText(this, "Lỗi tải lên: $errorMsg", Toast.LENGTH_LONG).show()
                    isUploadInProgress = false
                    detectionCoordinator.setSessionPendingUpload(false)
                    resetCircularSession()
                    // Vẫn finish để user về FarmDetail (ảnh được giữ cục bộ, sẽ retry sau)
                    Handler(Looper.getMainLooper()).postDelayed({
                        if (!isDestroyed && !isFinishing) finish()
                    }, 1500)
                }
                androidx.work.WorkInfo.State.CANCELLED -> {
                    hasProcessedTerminalState = true
                    Log.d("MainActivity", "WorkInfo: CANCELLED")
                    try {
                        uiController.hideLoading()
                    } catch (e: Throwable) {}
                    isUploadInProgress = false
                    detectionCoordinator.setSessionPendingUpload(false)
                }
                else -> {}
            }
        }
    }

    private fun showUploadResult(totalSuccess: Int, totalFailure: Int, totalRetry: Int) {
        // 📍 FLOW D BOUNDARY: upload hoàn thành (thành công hoặc thất bại)
        Log.d("MainActivity", "📊 [FLOW-D] showUploadResult: success=$totalSuccess, fail=$totalFailure, retry=$totalRetry, isUploadInProgress=$isUploadInProgress")

        if (isFinishing || isDestroyed) {
            Log.w("MainActivity", "⚠️ [FLOW-D] Activity destroyed — reset session state only")
            isUploadInProgress = false
            // ✅ FIX: Vẫn reset session để capture tiếp theo không bị block
            // _isSessionPendingUpload = true trong coordinator sẽ được reset bởi resetTracking()
            try {
                detectionCoordinator.setSessionPendingUpload(false)
                detectionCoordinator.stopCircularCapture()
            } catch (e: Exception) {
                Log.e("MainActivity", "⚠️ reset session failed: ${e.message}")
            }
            return
        }

        try {
            uiController.hideLoading()
        } catch (e: Exception) {
            Log.e("MainActivity", "⚠️ hideLoading failed (activity stopped): ${e.message}")
            isUploadInProgress = false
            return
        }

        val toastMsg = when {
            totalSuccess > 0 -> "Đã thêm cây vào trang trại"
            totalFailure > 0 || totalRetry > 0 -> "Chưa gửi xong. Ảnh được lưu cục bộ và sẽ gửi lại khi có mạng."
            else -> "Không có ảnh nào để gửi"
        }
        Toast.makeText(this@MainActivity, toastMsg, Toast.LENGTH_SHORT).show()
        Log.d("MainActivity", "[FLOW-D] Toast shown: $toastMsg")

        // ✅ Fire broadcast NGAY để JS save tree + reload trees TRƯỚC khi finish()
        // RN nhận event → dispatch saveTree → user thấy cây mới khi activity đóng.
        if (totalSuccess > 0) {
            val treeId = detectionCoordinator.getCurrentTreeId()
            if (treeId.isNotEmpty()) {
                fireScanCompleteBroadcast(arrayListOf(treeId))
            }
        }

        // ✅ Reset + finish ngay (200ms) để user quay về FarmDetail không bị
        //    nhìn thấy popup "thoáng qua" trên màn hình scan.
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                if (isFinishing || isDestroyed) {
                    isUploadInProgress = false
                    return@postDelayed
                }
                resetCircularSession()
                isUploadInProgress = false
                finish()
            } catch (e: Exception) {
                isUploadInProgress = false
                Log.e("MainActivity", "resetCircularSession failed (activity stopped): ${e.message}")
                finish()
            }
        }, 200)
    }

    private fun resetCircularSession() {
        // 📍 FLOW E / D BOUNDARY: session reset — called from dialog dismiss, upload complete, or cancel
        Log.d("MainActivity", "🧹 [FLOW-E/D] resetCircularSession CALLED")
        try {
            detectionCoordinator.stopCircularCapture()
        } catch (e: Exception) {
            Log.e("MainActivity", "⚠️ stopCircularCapture failed: ${e.message}")
        }
        try {
            if (captureGuidanceOverlay != null) {
                captureGuidanceOverlay.visibility = View.GONE
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "⚠️ overlay visibility failed: ${e.message}")
        }
        try {
            detectionCoordinator.resetTracking()
            Log.d("MainActivity", "🧹 [FLOW-E/D] resetTracking invoked")
        } catch (e: Exception) {
            Log.e("MainActivity", "⚠️ resetTracking failed: ${e.message}")
        }
        Log.d("MainActivity", "🧹 [FLOW-E/D] resetCircularSession DONE")
    }

    // ─── Batch Sync ────────────────────────────────────────────────────────

    private fun handleBatchSyncSuccess(successCount: Int, treeIds: List<String>, detectionData: TreeDetectionQueue.DetectionData?) {
        Log.d("MainActivity", "✅ Batch sync completed: $successCount trees")

        // ✅ Circular capture flow đã có observeUploadStateForCurrentWork() lo phần
        //    UI + broadcast + finish(). KHÔNG show dialog ở đây nữa — dialog cũ
        //    của single-tree flow gây "popup tự tắt ngay" khi activity finish 700ms sau.
        if (isUploadInProgress) {
            Log.d("MainActivity", "🔕 Skip TreeIdentifiedDialog — circular capture flow đang chạy")
            return
        }

        runOnUiThread {
            // Hide loading overlay
            uiController.hideLoading()

            // Reset coordinator state immediately when sync succeeds
            detectionCoordinator.resetTracking()
            detectionCoordinator.resumeDetection()
            uiController.updateStatus("Đang quét cây", StatusType.SCANNING)

            // Show success dialog with tree ID (chỉ cho legacy single-tree flow)
            val treeId = treeIds.firstOrNull() ?: "Unknown"
            val dialog = com.mvp.orilife.ui.TreeIdentifiedDialog(this, treeId, detectionData)
            dialog.setOnSaveClickListener {
                saveTreeId(treeId)
            }
            dialog.setOnDismissListener {
                lifecycleScope.launch(Dispatchers.Main) {
                    val pendingCount = treeDetectionQueue.getPendingCount()
                    if (pendingCount > 0) {
                        uploadManager.enqueueUpload()
                    }
                }
            }
            dialog.show()
        }
    }
    
    private fun handleSyncSuccess(treeId: String, detectionData: TreeDetectionQueue.DetectionData) {
        Log.d("MainActivity", "Tree synced successfully: $treeId")

        runOnUiThread {
            // Hide loading overlay
            uiController.hideLoading()

            // Show success dialog
            val dialog = com.mvp.orilife.ui.TreeIdentifiedDialog(this, treeId, detectionData)
            dialog.setOnSaveClickListener {
                saveTreeId(treeId)
            }
            dialog.setOnDismissListener {
                // Resume detection when dialog is dismissed
                detectionCoordinator.resetTracking()
                detectionCoordinator.resumeDetection()
                uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
            }
            dialog.show()
        }
    }
    
    private fun saveTreeId(treeId: String) {
        Log.d("MainActivity", "💾 saveTreeId called for: $treeId")
        Log.d("MainActivity", "💾 State before save: ${detectionCoordinator.state.value}")

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val db = HarvestDatabase.getDatabase(this@MainActivity)

                // Check if already saved
                val existing = db.savedTreeDao().getTreeById(treeId)
                if (existing != null) {
                    Log.d("MainActivity", "⚠️ Tree already saved: $treeId")
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Cây này đã được lưu", Toast.LENGTH_SHORT).show()
                        // Reset state even if already saved
                        Log.d("MainActivity", "🔄 Resetting state (already saved)...")
                        detectionCoordinator.resetTracking()
                        detectionCoordinator.resumeDetection()
                        uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
                        Log.d("MainActivity", "💾 State after reset (already saved): ${detectionCoordinator.state.value}")
                    }
                    return@launch
                }

                // Save new tree
                val savedTree = com.mvp.orilife.database.SavedTree(
                    treeId = treeId,
                    savedTimestamp = System.currentTimeMillis()
                )
                db.savedTreeDao().insert(savedTree)
                Log.d("MainActivity", "✅ Tree saved successfully: $treeId")

                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Đã lưu cây $treeId", Toast.LENGTH_SHORT).show()

                    // Reset coordinator state and resume detection
                    Log.d("MainActivity", "🔄 Resetting state after save...")
                    detectionCoordinator.resetTracking()
                    detectionCoordinator.resumeDetection()
                    uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
                    Log.d("MainActivity", "💾 State after reset (save success): ${detectionCoordinator.state.value}")
                }
            }catch (e: Exception) {
                android.util.Log.e("MainActivity", "❌ Error saving tree", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Lỗi khi lưu cây", Toast.LENGTH_SHORT).show()
                    // Reset state even on error
                    Log.d("MainActivity", "🔄 Resetting state after error...")
                    detectionCoordinator.resetTracking()
                    detectionCoordinator.resumeDetection()
                    uiController.updateStatus("Đang quét cây", StatusType.SCANNING)
                    Log.d("MainActivity", "💾 State after reset (error): ${detectionCoordinator.state.value}")
                }
            }
        }
    }

    /**
     * Chỉ insert treeId vào saved_trees — không có Toast, không reset state.
     * Dùng trong circular capture flow: lưu trước, hỏi user sau qua dialog.
     */
    private suspend fun saveTreeIdOnly(treeId: String) {
        withContext(Dispatchers.IO) {
            val db = HarvestDatabase.getDatabase(this@MainActivity)
            val existing = db.savedTreeDao().getTreeById(treeId)
            if (existing == null) {
                db.savedTreeDao().insert(
                    com.mvp.orilife.database.SavedTree(
                        treeId = treeId,
                        savedTimestamp = System.currentTimeMillis()
                    )
                )
                Log.d("MainActivity", "💾 Tree saved (silent): $treeId")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        cameraStateManager.recordActivity()
        sensorTriggerManager.start()
        com.mvp.orilife.sensor.SensorDataCollector.start(this)

        // ✅ Check upload result từ lần trước (khi Activity bị destroy giữa upload)
        // Đọc trực tiếp từ SharedPreferences qua LiveData state
        val uploadState = uploadManager.uploadState.value
        if (uploadState is UploadManager.UploadState.Success) {
            Log.d("MainActivity", "[onResume] Found upload SUCCESS from previous session — ${uploadState.count} items")
            uiController.hideLoading()
            Toast.makeText(this, "Đã gửi thành công ${uploadState.count} ảnh", Toast.LENGTH_LONG).show()
            resetCircularSession()
            uploadManager.reset()
        } else if (uploadState is UploadManager.UploadState.Failed) {
            Log.d("MainActivity", "[onResume] Found upload FAILED from previous session")
            uiController.hideLoading()
            Toast.makeText(this, "Lỗi tải lên: ${uploadState.error}", Toast.LENGTH_LONG).show()
            resetCircularSession()
            uploadManager.reset()
        } else if (uploadState is UploadManager.UploadState.PartialSuccess) {
            Log.d("MainActivity", "[onResume] Found partial success: ${uploadState.success} OK, ${uploadState.failed} failed")
            uiController.hideLoading()
            resetCircularSession()
            uploadManager.reset()
        }
    }

    override fun onPause() {
        super.onPause()
        sensorTriggerManager.stop()
        if (isUploadInProgress) {
            Log.d("MainActivity", "🔒 onPause: upload in progress — skipping reset")
            return
        }
        val sessionState = detectionCoordinator.circularSessionState.value.state
        if (sessionState == CircularState.INACTIVE) {
            resetCircularSession()
        } else {
            Log.d("MainActivity", "🔒 onPause: session still active ($sessionState) — skipping reset")
        }
    }

    override fun onStop() {
        super.onStop()
        // ✅ onStop fire cả khi user background app (multitask)
        // Upload đã chạy qua WorkManager — không cần set flags ở đây
        Log.d("MainActivity", "🔒 onStop: lifecycleState=STOPPING")
    }

    override fun onDestroy() {
        super.onDestroy()
        // ✅ FIX: Set dying flags TRƯỚC KHI cleanup
        // Các coroutine/handler callbacks kiểm tra flags này để không crash
        isFinishing = true
        isDestroyed = true
        locationHelper.stopLocationUpdates()
        treeDetectionQueue.disableAutoSync()
        sensorTriggerManager.stop()
        com.mvp.orilife.sensor.SensorDataCollector.stop()
        cameraStateManager.release()
        cameraManager.release()
    }

    // ── React Native Bridge ──────────────────────────────────────────────────
    // Fire broadcast intents so OriLifeModule (in app/) can receive and emit JS events.

    companion object {
        const val ACTION_SCAN_RESULT = "com.mvp.orilife.SCAN_RESULT"
        const val ACTION_SCAN_ERROR = "com.mvp.orilife.SCAN_ERROR"
        const val EXTRA_TREE_IDS = "tree_ids"
        const val EXTRA_ERROR_MESSAGE = "error_message"
    }

    private fun fireScanCompleteBroadcast(treeIds: ArrayList<String>) {
        try {
            val intent = Intent(ACTION_SCAN_RESULT).apply {
                putStringArrayListExtra(EXTRA_TREE_IDS, treeIds)
                setPackage(packageName) // scoped to app
            }
            sendBroadcast(intent)
            Log.d("MainActivity", "📡 Broadcast sent: ACTION_SCAN_RESULT, treeIds=$treeIds")
        } catch (e: Exception) {
            Log.e("MainActivity", "❌ Failed to fire broadcast: ${e.message}")
        }
    }
}
