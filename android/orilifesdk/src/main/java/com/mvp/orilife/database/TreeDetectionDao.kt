package com.mvp.orilife.database
import com.mvp.orilife.detection.SegmentationDetection

import android.graphics.Bitmap
import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TreeDetectionDao {

    @Query("SELECT * FROM pending_tree_detections WHERE serverTreeId IS NULL ORDER BY createdAt ASC")
    suspend fun getPendingDetections(): List<PendingTreeDetection>

    @Query("SELECT * FROM pending_tree_detections ORDER BY createdAt DESC")
    fun getAll(): Flow<List<PendingTreeDetection>>

    @Query("SELECT * FROM pending_tree_detections WHERE serverTreeId IS NULL ORDER BY createdAt ASC")
    fun getPendingDetectionsFlow(): Flow<List<PendingTreeDetection>>

    @Query("SELECT COUNT(*) FROM pending_tree_detections WHERE serverTreeId IS NULL")
    suspend fun getPendingCount(): Int

    @Query("SELECT COUNT(*) FROM pending_tree_detections WHERE serverTreeId IS NULL")
    fun getPendingCountFlow(): Flow<Int>

    @Query("SELECT * FROM pending_tree_detections WHERE id = :id")
    suspend fun getById(id: Long): PendingTreeDetection?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(detection: PendingTreeDetection): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(detections: List<PendingTreeDetection>)

    @Update
    suspend fun update(detection: PendingTreeDetection)

    @Delete
    suspend fun delete(detection: PendingTreeDetection)

    @Query("DELETE FROM pending_tree_detections WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM pending_tree_detections WHERE serverTreeId IS NOT NULL")
    suspend fun deleteSuccessful()

    @Query("DELETE FROM pending_tree_detections WHERE retryCount >= :maxRetries AND serverTreeId IS NULL")
    suspend fun deleteFailed(maxRetries: Int = 3)

    @Query("UPDATE pending_tree_detections SET serverTreeId = :serverTreeId WHERE id = :id")
    suspend fun markAsSuccess(id: Long, serverTreeId: String)

    @Query("UPDATE pending_tree_detections SET retryCount = retryCount + 1, lastAttemptAt = :attemptTime, errorMessage = :error WHERE id = :id")
    suspend fun markAsFailed(id: Long, attemptTime: Long, error: String)

    @Query("UPDATE pending_tree_detections SET retryCount = retryCount + 1, lastAttemptAt = :attemptTime WHERE id = :id")
    suspend fun incrementRetryCount(id: Long, attemptTime: Long)

    @Query("DELETE FROM pending_tree_detections WHERE serverTreeId IS NULL")
    suspend fun clearAll()

    @Query("SELECT * FROM pending_tree_detections WHERE serverTreeId IS NULL AND retryCount < :maxRetries ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getOldestPending(maxRetries: Int = 3, limit: Int = 10): List<PendingTreeDetection>
}

object PendingTreeDetectionFactory {
    fun markAsSuccess(detection: PendingTreeDetection, serverTreeId: String): PendingTreeDetection {
        return detection.copy(serverTreeId = serverTreeId)
    }

    fun markAsFailed(detection: PendingTreeDetection, attemptTime: Long, error: String): PendingTreeDetection {
        return detection.copy(
            retryCount = detection.retryCount + 1,
            lastAttemptAt = attemptTime,
            errorMessage = error
        )
    }

    fun create(
        detection: SegmentationDetection,
        cropBitmap: Bitmap,
        label: String,
        latitude: Double?,
        longitude: Double?,
        gpsAccuracy: Float?
    ): PendingTreeDetection {
        return PendingTreeDetection(
            imagePath = cropBitmap.toString(),
            boxCoordinates = floatArrayOf(
                detection.boundingBox.left,
                detection.boundingBox.top,
                detection.boundingBox.right,
                detection.boundingBox.bottom
            ).let { floatArray ->
                com.google.gson.Gson().toJson(floatArray)
            },
            label = label,
            confidence = detection.confidence,
            timestamp = System.currentTimeMillis(),
            latitude = latitude,
            longitude = longitude,
            gpsAccuracy = gpsAccuracy
        )
    }
}
