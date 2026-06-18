package com.mvp.orilife.database

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface FarmDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(farm: FarmEntity): Long

    @Update
    suspend fun update(farm: FarmEntity)

    @Delete
    suspend fun delete(farm: FarmEntity)

    /**
     * Get all farms, ordered by creation time descending.
     */
    @Query("SELECT * FROM farms ORDER BY created_at DESC")
    fun getAllFarms(): Flow<List<FarmEntity>>

    /**
     * Get all farms (non-Flow, for sync operations).
     */
    @Query("SELECT * FROM farms ORDER BY created_at DESC")
    suspend fun getAllFarmsSync(): List<FarmEntity>

    /**
     * Get farm by ID.
     */
    @Query("SELECT * FROM farms WHERE farm_id = :farmId LIMIT 1")
    suspend fun getFarmById(farmId: String): FarmEntity?

    /**
     * Get farm by ID (Flow, observe realtime).
     */
    @Query("SELECT * FROM farms WHERE farm_id = :farmId LIMIT 1")
    fun getFarmByIdFlow(farmId: String): Flow<FarmEntity?>

    /**
     * Get farms by owner DID.
     */
    @Query("SELECT * FROM farms WHERE owner_did = :ownerDid ORDER BY created_at DESC")
    fun getFarmsByOwner(ownerDid: String): Flow<List<FarmEntity>>

    /**
     * Get farms by region code.
     */
    @Query("SELECT * FROM farms WHERE region_code = :regionCode ORDER BY created_at DESC")
    fun getFarmsByRegion(regionCode: String): Flow<List<FarmEntity>>

    /**
     * Delete farm by ID.
     */
    @Query("DELETE FROM farms WHERE farm_id = :farmId")
    suspend fun deleteByFarmId(farmId: String)

    /**
     * Update synced_at timestamp when farm is synced to server.
     */
    @Query("UPDATE farms SET synced_at = :syncedAt WHERE farm_id = :farmId")
    suspend fun updateSyncedAt(farmId: String, syncedAt: Long)

    /**
     * Get unsynced farms (synced_at is null).
     */
    @Query("SELECT * FROM farms WHERE synced_at IS NULL ORDER BY created_at ASC")
    suspend fun getUnsyncedFarms(): List<FarmEntity>

    /**
     * Update grid config for a farm.
     */
    @Query("UPDATE farms SET lon_origin = :lonOrigin, lat_origin = :latOrigin, row_spacing = :rowSpacing, col_spacing = :colSpacing, updated_at = :updatedAt WHERE farm_id = :farmId")
    suspend fun updateGridConfig(farmId: String, lonOrigin: Double?, latOrigin: Double?, rowSpacing: Double?, colSpacing: Double?, updatedAt: Long)

    /**
     * Count total farms.
     */
    @Query("SELECT COUNT(*) FROM farms")
    suspend fun countFarms(): Int
}
