package com.mvp.orilife.network
import com.mvp.orilife.Config
import com.mvp.orilife.security.SecurityHelper
import com.mvp.orilife.security.MonotonicCounter
import com.mvp.orilife.security.SecureSignature
import com.mvp.orilife.security.IdGenerator

import com.mvp.orilife.detection.CropResult
import com.mvp.orilife.detection.SegmentationDetection

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.mvp.orilife.database.HarvestDatabase
import com.mvp.orilife.database.PendingTreeDetection
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.analytics.ktx.logEvent
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class TreeDetectionQueue private constructor(context: Context) {

    private val appContext = context.applicationContext
    private val database = HarvestDatabase.getDatabase(appContext)
    private val treeDetectionDao = database.treeDetectionDao()
    // Use EvidenceAPI for /evidences/ingest endpoint
    private val evidenceApi = EvidenceAPI(Config.BASE_API_URL, Config.API_KEY)

    private val _pendingCount = MutableStateFlow(0)
    val pendingCount: Flow<Int> = _pendingCount.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: Flow<Boolean> = _isSyncing.asStateFlow()
    private val _syncMutex = Mutex()

    private var isAutoSyncEnabled = true
    private val MAX_RETRIES = 3
    private val SYNC_BATCH_SIZE = 5

    interface SyncCallback {
        fun onSyncSuccess(treeId: String, detectionData: DetectionData)
        fun onSyncFailed(detectionId: Long, error: String)
        fun onBatchSyncComplete(successCount: Int, treeIds: List<String>)
    }

    private var syncCallback: SyncCallback? = null

    fun setSyncCallback(callback: SyncCallback?) {
        syncCallback = callback
    }

    data class DetectionData(
        val label: String,
        val confidence: Float,
        val latitude: Double?,
        val longitude: Double?,
        val timestamp: Long,
        val boxCoordinates: FloatArray
    )

    init {
        observePendingCount()
    }

    suspend fun enqueueDetection(
        detection: SegmentationDetection,
        cropResult: CropResult,
        latitude: Double?,
        longitude: Double?,
        gpsAccuracy: Float?
    ): Result<Long> {
        return withContext(Dispatchers.IO) {
            try {
                val tempFile = saveCroppedImage(cropResult.croppedBitmap)
                if (tempFile == null) {
                    return@withContext Result.failure(Exception("Failed to save cropped image"))
                }

                val pendingDetection = PendingTreeDetection(
                    imagePath = tempFile.absolutePath,
                    boxCoordinates = com.google.gson.Gson().toJson(cropResult.normalizedBoxCoordinates), // Use normalized
                    label = detection.label,
                    confidence = detection.confidence,
                    timestamp = System.currentTimeMillis(),
                    latitude = latitude,
                    longitude = longitude,
                    gpsAccuracy = gpsAccuracy
                )

                val id = treeDetectionDao.insert(pendingDetection)
                Log.d("TreeDetectionQueue", "✅ Enqueued detection #$id: ${detection.label}")
                Log.d("TreeDetectionQueue", "   Image: ${tempFile.name} (${cropResult.croppedBitmap.width}x${cropResult.croppedBitmap.height})")
                Log.d("TreeDetectionQueue", "   Normalized box: [${cropResult.normalizedBoxCoordinates.joinToString(", ")}]")

                Result.success(id)

            }catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error enqueueing detection", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Enqueue detection with shared image path (for multiple detections in same large image)
     */
    suspend fun enqueueDetectionWithSharedImage(
        detection: SegmentationDetection,
        sharedImagePath: String,
        boxCoordinates: FloatArray,
        latitude: Double?,
        longitude: Double?,
        gpsAccuracy: Float?
    ): Result<Long> {
        return withContext(Dispatchers.IO) {
            try {
                val pendingDetection = PendingTreeDetection(
                    imagePath = sharedImagePath,
                    boxCoordinates = com.google.gson.Gson().toJson(boxCoordinates),
                    label = detection.label,
                    confidence = detection.confidence,
                    timestamp = System.currentTimeMillis(),
                    latitude = latitude,
                    longitude = longitude,
                    gpsAccuracy = gpsAccuracy
                )

                val id = treeDetectionDao.insert(pendingDetection)
                Log.d("TreeDetectionQueue", "✅ Enqueued detection #$id: ${detection.label}(shared image)")
                Log.d("TreeDetectionQueue", "   Normalized box: [${boxCoordinates.joinToString(", ")}]")

                Result.success(id)

            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error enqueueing detection", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Enqueue detection với ảnh đã masked sẵn (RIÊNG cho từng detection)
     * Mỗi detection trong cùng frame → ảnh riêng đã apply mask đúng vùng cây
     */
    suspend fun enqueueDetectionWithMaskedImage(
        detection: SegmentationDetection,
        maskedImagePath: String,
        boxCoordinates: FloatArray,
        latitude: Double?,
        longitude: Double?,
        gpsAccuracy: Float?,
        heading: Double? = null,
        pitch: Double? = null,
        roll: Double? = null,
        // ✅ Payload fields
        imageId: String? = null,
        treeId: String? = null,
        // ✅ NEW: Farm & Tree metadata
        farmId: String? = null,
        regionCode: String? = null,
        rowIdx: Int? = null,
        colIdx: Int? = null,
        treeMetadata: String? = null  // JSON: {"species":"durian","cultivar":"Monthong"}
    ): Result<Long> {
        return withContext(Dispatchers.IO) {
            try {
                // ✅ Auto-calculate geohash7 if lat/lng available
                val geohash7 = if (latitude != null && longitude != null) {
                    com.mvp.orilife.utils.GeohashHelper.encode(latitude, longitude, 7)
                } else null

                val pendingDetection = PendingTreeDetection(
                    imagePath = maskedImagePath,
                    boxCoordinates = com.google.gson.Gson().toJson(boxCoordinates),
                    label = detection.label,
                    confidence = detection.confidence,
                    timestamp = System.currentTimeMillis(),
                    latitude = latitude,
                    longitude = longitude,
                    gpsAccuracy = gpsAccuracy,
                    heading = heading,
                    pitch = pitch,
                    roll = roll,
                    imageId = imageId,
                    treeId = treeId,
                    // ✅ NEW: Farm metadata
                    farmId = farmId,
                    regionCode = regionCode,
                    geohash7 = geohash7,
                    rowIdx = rowIdx,
                    colIdx = colIdx,
                    treeMetadata = treeMetadata
                )

                val id = treeDetectionDao.insert(pendingDetection)
                Log.d("TreeDetectionQueue", "✅ Enqueued masked detection #$id: ${detection.label}")
                Log.d("TreeDetectionQueue", "   Image: $maskedImagePath")
                Log.d("TreeDetectionQueue", "   imageId=$imageId, treeId=$treeId")
                Log.d("TreeDetectionQueue", "   farmId=$farmId, regionCode=$regionCode, geohash7=$geohash7")
                Log.d("TreeDetectionQueue", "   Normalized box: [${boxCoordinates.joinToString(", ")}]")
                if (heading != null) {
                    Log.d("TreeDetectionQueue", "   Sensor: heading=${"%.1f".format(heading)}°, pitch=${"%.1f".format(pitch ?: 0.0)}°, roll=${"%.1f".format(roll ?: 0.0)}°")
                }

                Result.success(id)

            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error enqueueing masked detection", e)
                Result.failure(e)
            }
        }
    }

    suspend fun enqueueDetection(request: TreeDetectionRequest): Result<Long> {
        return withContext(Dispatchers.IO) {
            try {
                val tempFile = saveCroppedImageFromRequest(request)
                if (tempFile == null) {
                    return@withContext Result.failure(Exception("Failed to save cropped image"))
                }

                val pendingDetection = PendingTreeDetection(
                    imagePath = tempFile.absolutePath,
                    boxCoordinates = com.google.gson.Gson().toJson(request.boxCoordinates),
                    label = request.label,
                    confidence = 0.8f,
                    timestamp = request.timestamp,
                    latitude = null,
                    longitude = null,
                    gpsAccuracy = null
                )

                val id = treeDetectionDao.insert(pendingDetection)
                Log.d("TreeDetectionQueue", "✅ Enqueued detection from request #$id: ${request.label}")

                Result.success(id)

            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error enqueueing detection from request", e)
                Result.failure(e)
            }
        }
    }

    suspend fun syncPendingDetections(): SyncResult {
        // Mutex đảm bảo chỉ 1 coroutine sync tại 1 thời điểm.
        // Nếu có coroutine khác đang giữ lock → chờ (không return 0, không break).
        // repeat(3) trong uploadCircularSession sẽ chờ đến khi lock được giải phóng.
        return _syncMutex.withLock {
            withContext(Dispatchers.Default) {
                _isSyncing.value = true

                try {
                    // Lấy batch pending detections để upload đồng loạt theo lượt
                    val pendingDetections = treeDetectionDao.getOldestPending(MAX_RETRIES, SYNC_BATCH_SIZE)

                    Log.d("TreeDetectionQueue", "🔍 syncPendingDetections: found ${pendingDetections.size} pending items")

                    if (pendingDetections.isEmpty()) {
                        Log.d("TreeDetectionQueue", "✅ No pending detections to sync")
                        return@withContext SyncResult(0, 0, 0)
                    }

                    for (det in pendingDetections) {
                        Log.d("TreeDetectionQueue", "   → Pending: id=${det.id}, treeId=${det.treeId}, imagePath=${det.imagePath}")
                    }

                    Log.d("TreeDetectionQueue", "🔄 Syncing ${pendingDetections.size} pending detections...")

                    var successCount = 0
                    var failureCount = 0
                    var retryCount = 0
                    val successfulTreeIds = mutableListOf<String>()

                    for (detection in pendingDetections) {
                        when (val result = uploadDetection(detection)) {
                            is UploadResult.Success -> {
                                treeDetectionDao.markAsSuccess(detection.id, result.treeId)

                                // Only delete image if no other pending detections use the same image
                                val otherDetectionsWithSameImage = treeDetectionDao.getPendingDetections()
                                    .filter { it.imagePath == detection.imagePath && it.id != detection.id }
                                if (otherDetectionsWithSameImage.isEmpty()) {
                                    deleteImageFile(detection.imagePath)
                                    Log.d("TreeDetectionQueue", "🗑️ No more detections using this image, deleted: ${detection.imagePath}")
                                } else {
                                    Log.d("TreeDetectionQueue", "⏳ ${otherDetectionsWithSameImage.size} detections still using this image, keeping: ${detection.imagePath}")
                                }

                                val detectionData = DetectionData(
                                    label = detection.label,
                                    confidence = detection.confidence,
                                    latitude = detection.latitude,
                                    longitude = detection.longitude,
                                    timestamp = detection.timestamp,
                                    boxCoordinates = parseBoxCoordinates(detection.boxCoordinates)
                                )

                                withContext(Dispatchers.Main) {
                                    syncCallback?.onSyncSuccess(result.treeId, detectionData)
                                }
                                successfulTreeIds.add(result.treeId)
                                successCount++
                            }
                            is UploadResult.Retry -> {
                                treeDetectionDao.markAsFailed(detection.id, System.currentTimeMillis(), result.error)
                                withContext(Dispatchers.Main) {
                                    syncCallback?.onSyncFailed(detection.id, result.error)
                                }
                                retryCount++
                            }
                            is UploadResult.Failure -> {
                                Log.e("TreeDetectionQueue", "❌ UPLOAD_FAILURE: id=${detection.id}, error=${result.error}, fileExists=${File(detection.imagePath).exists()}")
                                // ✅ FIX Bug 2: luôn increment retryCount để đảm bảo
                                // record bị xóa sau MAX_RETRIES lần thất bại
                                treeDetectionDao.markAsFailed(detection.id, System.currentTimeMillis(), result.error)

                                if (detection.retryCount >= MAX_RETRIES) {
                                    // Đã hết retry → xóa cả record lẫn ảnh (nếu còn)
                                    deleteImageFile(detection.imagePath)
                                    treeDetectionDao.deleteById(detection.id)
                                    Log.w("TreeDetectionQueue", "🗑️ Max retries reached, deleted orphan record #${detection.id}")
                                } else if (!File(detection.imagePath).exists()) {
                                    // File gốc không tồn tại → xóa orphan record ngay (không retry)
                                    treeDetectionDao.deleteById(detection.id)
                                    Log.w("TreeDetectionQueue", "🗑️ Image file missing, deleted orphan record #${detection.id}")
                                }
                                withContext(Dispatchers.Main) {
                                    syncCallback?.onSyncFailed(detection.id, result.error)
                                }
                                failureCount++
                            }
                        }
                    }

                    treeDetectionDao.deleteFailed(MAX_RETRIES)

                    val syncResult = SyncResult(successCount, failureCount, retryCount)
                    Log.d("TreeDetectionQueue", "✅ Sync completed: $syncResult")

                    syncResult

                } catch (e: Exception) {
                    Log.e("TreeDetectionQueue", "❌ Error syncing pending detections", e)
                    SyncResult(0, 0, 0)
                } finally {
                    _isSyncing.value = false
                }
            }
        }
    }

    suspend fun startAutoSync(intervalMs: Long = 60000) {
        coroutineScope {
            while (isActive) {
                if (isAutoSyncEnabled) {
                    syncPendingDetections()
                }
                delay(intervalMs)
            }
        }
    }

    fun enableAutoSync() {
        isAutoSyncEnabled = true
        Log.d("TreeDetectionQueue", "✅ Auto-sync enabled")
    }

    fun disableAutoSync() {
        isAutoSyncEnabled = false
        Log.d("TreeDetectionQueue", "⏸️ Auto-sync disabled")
    }

    /**
     * Clear pending detections for a specific session (treeId).
     * Called when a session is cancelled/stopped mid-way.
     * Prevents orphaned images from being sent with a new session.
     */
    suspend fun clearPendingByTreeId(treeId: String) {
        withContext(Dispatchers.IO) {
            val pending = treeDetectionDao.getPendingDetections()
                .filter { it.treeId == treeId }
            pending.forEach { deleteImageFile(it.imagePath) }
            pending.forEach { treeDetectionDao.deleteById(it.id) }
            Log.d("TreeDetectionQueue", "🗑️ Cleared ${pending.size} pending detections for treeId=$treeId")
        }
    }

    suspend fun getPendingCount(): Int {
        return treeDetectionDao.getPendingCount()
    }

    /**
     * Đếm số pending detections của một session cụ thể.
     * Dùng để hiển thị đúng số ảnh trong dialog hoàn thành circular capture.
     */
    suspend fun getPendingCountBySession(sessionId: String): Int {
        // Đếm ảnh theo treeId — dùng sessionId parameter để tương thích interface
        // treeId là identifier thực sự của session (1 session = 1 treeId)
        return withContext(Dispatchers.IO) {
            treeDetectionDao.getPendingDetections()
                .count { it.treeId == sessionId }
        }
    }

    private fun observePendingCount() {
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            treeDetectionDao.getPendingCountFlow().collect { count ->
                _pendingCount.value = count
            }
        }
    }

    private suspend fun uploadDetection(detection: PendingTreeDetection): UploadResult {
        // Dùng Dispatchers.Default với higher priority để tránh bị throttle khi app active
        return withContext(Dispatchers.Default) {
            try {
                val imageFile = File(detection.imagePath)
                val isPng = detection.imagePath.lowercase().endsWith(".png")
                Log.d("TreeDetectionQueue", "📤 UPLOAD_ATTEMPT: treeId=${detection.treeId}, imageId=${detection.imageId}, path=${detection.imagePath}, exists=${imageFile.exists()}, size=${imageFile.length()}bytes, isPng=$isPng")

                if (!imageFile.exists()) {
                    return@withContext UploadResult.Failure("Image file not found")
                }

                // Tree already created in DetectionCoordinator.createSessionTree() - just upload evidence

                val secureSignature = SecureSignature(appContext)
                val signatureResult = secureSignature.initialize()
                if (!signatureResult.isSuccess) {
                    return@withContext UploadResult.Failure("Failed to initialize signature")
                }

                val monotonicCounter = MonotonicCounter(appContext)
                val counterResult = monotonicCounter.incrementAndGet()
                if (!counterResult.isSuccess) {
                    return@withContext UploadResult.Failure("Failed to increment counter")
                }

                val nonceResult = SecurityHelper.generateNonceWithTimestamp(secureSignature.getDeviceId())
                if (!nonceResult.isSuccess) {
                    return@withContext UploadResult.Failure("Failed to generate nonce")
                }

                val nonceData = nonceResult.getOrNull()
                val imageId = detection.imageId ?: IdGenerator.generateImageId()
                val treeId = detection.treeId ?: ""
                val timestamp = nonceData?.timestamp ?: System.currentTimeMillis()

                // ✅ NEW API: Build IngestRequest for EvidenceAPI
                val imageHash = if (isPng) {
                    // PNG: hash bytes directly
                    val pngBytes = imageFile.readBytes()
                    secureSignature.hashData(pngBytes)
                } else {
                    // JPEG: decode and hash bitmap
                    val bitmap = BitmapFactory.decodeFile(imageFile.absolutePath)
                    if (bitmap == null) {
                        return@withContext UploadResult.Failure("Failed to decode image")
                    }
                    secureSignature.hashBitmap(bitmap)
                }

                val signatureData = secureSignature.signDetectionRequest(
                    nonceData?.nonce ?: "",
                    counterResult.getOrNull() ?: 0L,
                    timestamp,
                    imageHash.toByteArray()
                )
                if (!signatureData.isSuccess) {
                    return@withContext UploadResult.Failure("Failed to sign request")
                }

                // ✅ Build IngestRequest for new EvidenceAPI
                val ingestRequest = IngestRequest(
                    treeId = treeId,
                    imageId = imageId,
                    imageFile = imageFile,
                    timeSeries = TimeSeriesData(
                        latitude = detection.latitude,
                        longitude = detection.longitude,
                        timestamp = timestamp,
                        heading = detection.heading,
                        pitch = detection.pitch,
                        roll = detection.roll
                    ),
                    metadata = MetadataData(
                        deviceId = secureSignature.getDeviceId(),
                        nonce = nonceData?.nonce ?: "",
                        signature = signatureData.getOrNull() ?: ""
                    )
                )

                // ✅ Call new EvidenceAPI
                val result = evidenceApi.ingest(ingestRequest)
                Log.d("TreeDetectionQueue", "📤 API_RESPONSE: treeId=$treeId, isSuccess=${result.isSuccess}, ex=${result.exceptionOrNull()?.message}")

                when {
                    result.isSuccess -> {
                        val response = result.getOrNull()
                        val serverAccepted = response?.success == true
                        val serverTreeId = response?.treeId
                        Log.d("TreeDetectionQueue", "📤 SERVER: accepted=$serverAccepted, treeId=${response?.treeId}, message=${response?.message}")
                        if (serverAccepted && !serverTreeId.isNullOrBlank()) {
                            Log.d("TreeDetectionQueue", "✅ UPLOAD_SUCCESS: localId=${detection.id}, treeId=${detection.treeId} → serverTreeId=$serverTreeId")

                            // ✅ Track Analytics: Upload success
                            Firebase.analytics.logEvent("evidence_upload_success") {
                                param("tree_id", serverTreeId.hashCode().toLong())
                            }

                            UploadResult.Success(serverTreeId)
                            UploadResult.Success(serverTreeId)
                        } else {
                            val serverMessage = response?.message ?: "Server rejected request"
                            Log.e("TreeDetectionQueue", "❌ SERVER_REJECTED: treeId=${detection.treeId}, message=$serverMessage")
                            val shouldRetry = detection.retryCount < MAX_RETRIES
                            if (shouldRetry) {
                                // ✅ Track Analytics: Upload retry
                                Firebase.analytics.logEvent("evidence_upload_failed") {
                                    param("error_type", "retry")
                                    param("error_message", serverMessage)
                                }
                                UploadResult.Retry(serverMessage)
                            } else {
                                // ✅ Track Analytics: Upload permanent failure
                                Firebase.analytics.logEvent("evidence_upload_failed") {
                                    param("error_type", "permanent")
                                    param("error_message", serverMessage)
                                }
                                UploadResult.Failure(serverMessage)
                            }
                        }
                    }
                    else -> {
                        Log.e("TreeDetectionQueue", "❌ API_FAILED: treeId=${detection.treeId}, ex=${result.exceptionOrNull()?.message}, retry=${detection.retryCount < MAX_RETRIES}")
                        val errorMessage = result.exceptionOrNull()?.message ?: "Unknown error"
                        val shouldRetry = detection.retryCount < MAX_RETRIES
                        if (shouldRetry) {
                            // ✅ Track Analytics: Upload retry (network error)
                            Firebase.analytics.logEvent("evidence_upload_failed") {
                                param("error_type", "retry")
                                param("error_message", errorMessage)
                            }
                            UploadResult.Retry(errorMessage)
                        } else {
                            // ✅ Track Analytics: Upload permanent failure (network error)
                            Firebase.analytics.logEvent("evidence_upload_failed") {
                                param("error_type", "permanent")
                                param("error_message", "Max retries exceeded: $errorMessage")
                            }
                            UploadResult.Failure("Max retries exceeded")
                        }
                    }
                }

            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error uploading detection #${detection.id}", e)
                UploadResult.Failure(e.message ?: "Unknown error")
            }
        }
    }

    fun saveCroppedImage(bitmap: Bitmap): File? {
        return try {
            val timestamp = System.currentTimeMillis()
            val fileName = "crop_${timestamp}.png"
            // ✅ FIX Bug 1a: Dùng filesDir thay vì cacheDir
            // cacheDir có thể bị Android xóa bất cứ lúc nào (low storage, restart)
            // filesDir chỉ bị xóa khi app uninstall hoặc user clear data
            val tempDir = File(appContext.filesDir, "tree_detections")
            tempDir.mkdirs()

            val tempFile = File(tempDir, fileName)
            val outputStream = FileOutputStream(tempFile)
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
            outputStream.flush()
            outputStream.close()

            // ✅ DEBUG: verify saved file is valid
            val savedBytes = tempFile.length()
            Log.d("TreeDetectionQueue", "💾 IMAGE_SAVED: path=${tempFile.absolutePath}, size=${savedBytes}bytes, bitmap=${bitmap.width}x${bitmap.height}")
            if (savedBytes == 0L) {
                Log.e("TreeDetectionQueue", "❌ IMAGE ZERO BYTES! bitmap=${bitmap.width}x${bitmap.height}")
            }

            tempFile
        } catch (e: Exception) {
            Log.e("TreeDetectionQueue", "❌ Error saving cropped image", e)
            null
        }
    }

    private fun saveCroppedImageFromRequest(request: TreeDetectionRequest): File? {
        return try {
            val fileName = "crop_${request.timestamp}.jpg"
            // ✅ FIX Bug 1a: Dùng filesDir thay vì cacheDir (same fix)
            val tempDir = File(appContext.filesDir, "tree_detections")
            tempDir.mkdirs()

            val tempFile = File(tempDir, fileName)
            request.imageBlob.copyTo(tempFile, overwrite = true)
            tempFile
        } catch (e: Exception) {
            Log.e("TreeDetectionQueue", "❌ Error saving cropped image from request", e)
            null
        }
    }

    private fun deleteImageFile(imagePath: String) {
        try {
            val file = File(imagePath)
            if (file.exists()) {
                file.delete()
                Log.d("TreeDetectionQueue", "🗑️ Deleted image: $imagePath")
            }
        } catch (e: Exception) {
            Log.e("TreeDetectionQueue", "❌ Error deleting image: $imagePath", e)
        }
    }

    private fun parseBoxCoordinates(json: String): FloatArray {
        return try {
            com.google.gson.Gson().fromJson(json, FloatArray::class.java)
        } catch (e: Exception) {
            Log.e("TreeDetectionQueue", "❌ Error parsing box coordinates: $json", e)
            floatArrayOf(0f, 0f, 0f, 0f)
        }
    }

    /**
     * ✅ NEW: Ensure tree exists on server before ingest.
     * Checks SavedTree.serverSynced flag, creates tree via POST /trees if needed.
     */
    private suspend fun ensureTreeExistsOnServer(detection: PendingTreeDetection): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val treeId = detection.treeId ?: return@withContext Result.failure(Exception("Tree ID is null"))

                // Check if tree already synced
                val savedTreeDao = database.savedTreeDao()
                val savedTree = savedTreeDao.getTreeById(treeId)

                if (savedTree?.serverSynced == true) {
                    Log.d("TreeDetectionQueue", "✅ Tree already synced: $treeId")
                    return@withContext Result.success(Unit)
                }

                // Tree not synced yet - create on server
                Log.d("TreeDetectionQueue", "🌳 Creating tree on server: $treeId")

                // Prepare tree metadata
                val regionCode = detection.regionCode ?: com.mvp.orilife.Config.DEFAULT_REGION_CODE
                val farmId = detection.farmId ?: getDefaultFarmId()
                val geohash7 = detection.geohash7 ?: com.mvp.orilife.utils.GeohashHelper.encode(
                    detection.latitude ?: 0.0,
                    detection.longitude ?: 0.0,
                    7
                )

                // Parse tree metadata JSON
                val metadata = try {
                    detection.treeMetadata?.let {
                        com.google.gson.Gson().fromJson(it, Map::class.java) as? Map<String, Any>
                    }
                } catch (e: Exception) {
                    Log.w("TreeDetectionQueue", "Failed to parse tree metadata: ${e.message}")
                    null
                }

                // Create tree request
                val treeRequest = com.mvp.orilife.network.models.TreeCreateRequest(
                    id = treeId,
                    regionCode = regionCode,
                    farmId = farmId,
                    geohash7 = geohash7,
                    latitude = detection.latitude,
                    longitude = detection.longitude,
                    rowIdx = detection.rowIdx,
                    colIdx = detection.colIdx,
                    codebookId = "codebook_v1",
                    metadata = metadata,
                    capturedAt = null
                )

                // Call TreeAPI
                val treeApi = com.mvp.orilife.network.TreeAPI(
                    com.mvp.orilife.Config.BASE_API_URL,
                    com.mvp.orilife.Config.API_KEY
                )

                val result = treeApi.createTree(treeRequest)

                if (result.isSuccess) {
                    // Mark tree as synced
                    savedTreeDao.updateServerSynced(treeId, true)
                    Log.d("TreeDetectionQueue", "✅ Tree created on server: $treeId")
                    Result.success(Unit)
                } else {
                    val error = result.exceptionOrNull()
                    // ✅ 409 Conflict = tree already exists on server → treat as success
                    if (error is ApiException && error.isConflict) {
                        Log.d("TreeDetectionQueue", "✅ Tree already exists on server (409), marking synced: $treeId")
                        savedTreeDao.updateServerSynced(treeId, true)
                        Result.success(Unit)
                    } else {
                        Log.e("TreeDetectionQueue", "❌ Failed to create tree: ${error?.message}")
                        Result.failure(error ?: Exception("Unknown error creating tree"))
                    }
                }

            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error ensuring tree exists: ${e.message}", e)
                Result.failure(e)
            }
        }
    }

    /**
     * ✅ NEW: Get default farm ID (fallback if detection doesn't have farmId).
     * In production, this should be set during onboarding.
     */
    private suspend fun getDefaultFarmId(): String {
        return withContext(Dispatchers.IO) {
            try {
                val farmDao = database.farmDao()
                val farms = farmDao.getAllFarmsSync()
                if (farms.isNotEmpty()) {
                    farms.first().farm_id
                } else {
                    // No farm exists - return placeholder
                    // In production, should trigger farm creation flow
                    Log.w("TreeDetectionQueue", "⚠️ No farm found, using placeholder")
                    "farm-default-${System.currentTimeMillis()}"
                }
            } catch (e: Exception) {
                Log.e("TreeDetectionQueue", "❌ Error getting default farm: ${e.message}")
                "farm-default-${System.currentTimeMillis()}"
            }
        }
    }

    data class SyncResult(
        val successCount: Int,
        val failureCount: Int,
        val retryCount: Int
    ) {
        val totalProcessed: Int
            get() = successCount + failureCount + retryCount
    }

    sealed class UploadResult {
        data class Success(val treeId: String) : UploadResult()
        data class Retry(val error: String) : UploadResult()
        data class Failure(val error: String) : UploadResult()
    }

    companion object {
        @Volatile
        private var INSTANCE: TreeDetectionQueue? = null

        fun getInstance(context: Context): TreeDetectionQueue {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TreeDetectionQueue(context).also { INSTANCE = it }
            }
        }
    }
}
