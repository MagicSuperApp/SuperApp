package com.mvp.orilife.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Trạng thái tree trong local DB.
 *
 * capturing  → Tree vừa được tạo, đang trong quá trình capture 8 sectors.
 * pending    → Capture xong 8 sectors, đang chờ upload.
 * uploaded   → Upload thành công.
 * failed     → Upload thất bại sau nhiều lần retry.
 * cancelled  → User cancel giữa chừng, sẽ bị xóa sau.
 */
enum class TreeStatus {
    CAPTURING,   // Đang capture
    PENDING,     // Chờ upload
    UPLOADED,   // Upload thành công
    FAILED,     // Upload thất bại
    CANCELLED   // User cancel
}

@Entity(tableName = "saved_trees")
data class SavedTree(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val treeId: String,
    val savedTimestamp: Long = System.currentTimeMillis(),
    val status: TreeStatus = TreeStatus.CAPTURING,

    // ✅ NEW: Farm & Tree metadata for backend sync
    val farmId: String? = null,           // FK to farm
    val regionCode: String? = null,       // e.g. "vn-south-01"
    val geohash7: String? = null,         // Geohash precision 7
    val latitude: Double? = null,         // GPS coordinates
    val longitude: Double? = null,
    val rowIdx: Int? = null,              // Grid position
    val colIdx: Int? = null,
    val treeMetadata: String? = null,     // JSON: {"species":"durian","cultivar":"Monthong"}
    val serverSynced: Boolean = false     // Has tree been created on server via POST /trees?
)
