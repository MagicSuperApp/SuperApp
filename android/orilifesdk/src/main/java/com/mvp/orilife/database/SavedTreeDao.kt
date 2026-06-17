package com.mvp.orilife.database

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SavedTreeDao {

    @Insert
    suspend fun insert(tree: SavedTree): Long

    @Update
    suspend fun update(tree: SavedTree)

    @Delete
    suspend fun delete(tree: SavedTree)

    /**
     * Lấy tất cả trees, order by thời gian giảm dần.
     */
    @Query("SELECT * FROM saved_trees ORDER BY savedTimestamp DESC")
    fun getAllSavedTrees(): Flow<List<SavedTree>>

    /**
     * Lấy tree theo treeId.
     */
    @Query("SELECT * FROM saved_trees WHERE treeId = :treeId LIMIT 1")
    suspend fun getTreeById(treeId: String): SavedTree?

    /**
     * Lấy tree theo treeId (Flow, observe realtime).
     */
    @Query("SELECT * FROM saved_trees WHERE treeId = :treeId LIMIT 1")
    fun getTreeByIdFlow(treeId: String): Flow<SavedTree?>

    /**
     * Cập nhật trạng thái tree.
     */
    @Query("UPDATE saved_trees SET status = :status WHERE treeId = :treeId")
    suspend fun updateStatus(treeId: String, status: TreeStatus)

    /**
     * Lấy tất cả trees theo trạng thái.
     */
    @Query("SELECT * FROM saved_trees WHERE status = :status ORDER BY savedTimestamp DESC")
    fun getTreesByStatus(status: TreeStatus): Flow<List<SavedTree>>

    /**
     * Lấy tất cả trees KHÔNG phải cancelled (dùng cho dashboard).
     */
    @Query("SELECT * FROM saved_trees WHERE status != :excludedStatus ORDER BY savedTimestamp DESC")
    fun getAllExceptStatus(excludedStatus: TreeStatus): Flow<List<SavedTree>>

    /**
     * Xóa tree theo treeId.
     */
    @Query("DELETE FROM saved_trees WHERE treeId = :treeId")
    suspend fun deleteByTreeId(treeId: String)

    /**
     * Xóa tất cả trees theo trạng thái (dùng cho cleanup).
     */
    @Query("DELETE FROM saved_trees WHERE status = :status")
    suspend fun deleteByStatus(status: TreeStatus)

    /**
     * Xóa tất cả trees đang ở trạng thái CANCELLED (dọn rác định kỳ).
     */
    @Query("DELETE FROM saved_trees WHERE status = 'CANCELLED'")
    suspend fun deleteCancelledTrees()

    /**
     * Đếm số trees theo trạng thái.
     */
    @Query("SELECT COUNT(*) FROM saved_trees WHERE status = :status")
    suspend fun countByStatus(status: TreeStatus): Int

    /**
     * ✅ NEW: Cập nhật serverSynced flag khi tree đã được tạo trên server.
     */
    @Query("UPDATE saved_trees SET serverSynced = :synced WHERE treeId = :treeId")
    suspend fun updateServerSynced(treeId: String, synced: Boolean)

    /**
     * ✅ NEW: Lấy tất cả trees chưa sync lên server.
     */
    @Query("SELECT * FROM saved_trees WHERE serverSynced = 0 ORDER BY savedTimestamp ASC")
    suspend fun getUnsyncedTrees(): List<SavedTree>

    /**
     * ✅ NEW: Cập nhật farm metadata cho tree.
     */
    @Query("UPDATE saved_trees SET farmId = :farmId, regionCode = :regionCode, geohash7 = :geohash7, latitude = :latitude, longitude = :longitude WHERE treeId = :treeId")
    suspend fun updateFarmMetadata(treeId: String, farmId: String?, regionCode: String?, geohash7: String?, latitude: Double?, longitude: Double?)
}
