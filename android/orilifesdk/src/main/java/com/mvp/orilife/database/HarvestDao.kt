package com.mvp.orilife.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface HarvestDao {
    @Query("SELECT * FROM harvest_records ORDER BY timestamp DESC")
    fun getAll(): Flow<List<HarvestRecord>>

    @Insert
    suspend fun insert(record: HarvestRecord)

    @Query("SELECT COUNT(*) FROM harvest_records")
    suspend fun getCount(): Int
}
