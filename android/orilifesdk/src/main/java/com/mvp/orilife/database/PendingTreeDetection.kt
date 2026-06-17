package com.mvp.orilife.database

import android.graphics.Bitmap
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.mvp.orilife.detection.SegmentationDetection
import com.google.gson.Gson

@Entity(tableName = "pending_tree_detections")
data class PendingTreeDetection(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    val imagePath: String,
    val boxCoordinates: String,
    val label: String,
    val confidence: Float,
    val timestamp: Long,
    val latitude: Double?,
    val longitude: Double?,
    val heading: Double? = null,
    val pitch: Double? = null,
    val roll: Double? = null,
    val gpsAccuracy: Float? = null,
    // ✅ Payload fields: imageId + treeId (treeId là client/session tree id)
    val imageId: String? = null,
    val treeId: String? = null,
    // ✅ serverTreeId chỉ set khi server xác nhận upload thành công
    val serverTreeId: String? = null,

    // ✅ NEW: Farm & Tree metadata for backend API
    val farmId: String? = null,           // FK to farm (required for POST /trees)
    val regionCode: String? = null,       // e.g. "vn-south-01" (required for POST /trees)
    val geohash7: String? = null,         // Geohash precision 7 (required for POST /trees)
    val rowIdx: Int? = null,              // Grid row index (optional)
    val colIdx: Int? = null,              // Grid column index (optional)
    val treeMetadata: String? = null,     // JSON: {"species":"durian","cultivar":"Monthong","health":"good"}

    val retryCount: Int = 0,
    val lastAttemptAt: Long? = null,
    val errorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis()
) {
    val isPending: Boolean
        get() = serverTreeId == null

    val uploadStatus: UploadStatus
        get() = when {
            serverTreeId != null -> UploadStatus.SUCCESS
            errorMessage != null -> UploadStatus.FAILED
            retryCount > 0 -> UploadStatus.UPLOADING
            else -> UploadStatus.PENDING
        }

    fun markAsSuccess(serverTreeId: String): PendingTreeDetection {
        return this.copy(serverTreeId = serverTreeId)
    }

    fun markAsFailed(attemptTime: Long, error: String): PendingTreeDetection {
        return this.copy(
            retryCount = retryCount + 1,
            lastAttemptAt = attemptTime,
            errorMessage = error
        )
    }

    companion object {
        fun fromDetection(
            detection: SegmentationDetection,
            cropBitmap: Bitmap,
            label: String,
            latitude: Double?,
            longitude: Double?,
            gpsAccuracy: Float?
        ): PendingTreeDetection {
            val gson = Gson()

            val boxCoordinates = floatArrayOf(
                detection.boundingBox.left,
                detection.boundingBox.top,
                detection.boundingBox.width(),
                detection.boundingBox.height()
            )

            return PendingTreeDetection(
                imagePath = cropBitmap.toString(),
                boxCoordinates = gson.toJson(boxCoordinates),
                label = label,
                confidence = detection.confidence,
                timestamp = System.currentTimeMillis(),
                latitude = latitude,
                longitude = longitude,
                gpsAccuracy = gpsAccuracy
            )
        }
    }
}

enum class PendingDetectionStatus {
    PENDING,
    UPLOADING,
    RETRYING,
    FAILED,
    SUCCESS
}
