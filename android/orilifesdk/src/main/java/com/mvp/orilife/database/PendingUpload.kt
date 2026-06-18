package com.mvp.orilife.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_uploads")
data class PendingUpload(
    @PrimaryKey(autoGenerate = true) 
    val id: Long = 0,
    
    val videoPath: String,          // Local file path to video
    val latitude: Double,            // GPS latitude
    val longitude: Double,           // GPS longitude
    val capturedAt: Long,            // Timestamp when video was captured (milliseconds)
    
    val uploadStatus: UploadStatus = UploadStatus.PENDING,
    val retryCount: Int = 0,
    val lastAttemptAt: Long? = null, // Last upload attempt timestamp
    val errorMessage: String? = null,
    
    val createdAt: Long = System.currentTimeMillis()
) {
    val isSynced: Boolean
        get() = uploadStatus == UploadStatus.SUCCESS
}

enum class UploadStatus {
    PENDING,    // Waiting to be uploaded
    UPLOADING,  // Currently uploading
    FAILED,     // Upload failed (will retry)
    SUCCESS     // Successfully uploaded
}
