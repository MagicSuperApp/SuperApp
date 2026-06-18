package com.mvp.orilife.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "harvest_records")
data class HarvestRecord(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val fruitVector: String = "", // JSON string of float array or empty string
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val signature: String,
    val detectionConfidence: Float = 0f,
    val croppedImagePath: String = "",
    val isSynced: Boolean = false,
    val merkleRoot: String = "",
    val frameCount: Int = 0,
    val processingTime: Float = 0f,
    val frameHashes: String = "",
    val trustScore: Float = 0.5f,
    val manualVerified: Boolean = false,
    val virtualID: String = ""
)
