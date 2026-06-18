package com.mvp.orilife.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Farm entity for local caching.
 * Syncs with backend /farms API.
 *
 * Backend schema reference (from API docs §4):
 * - farm_id: string ≤50, unique
 * - owner_did: string ≤100
 * - region_code: string ≤10
 * - farm_name: string ≤255, optional
 * - boundary: GeoJSON Polygon (WGS84)
 * - lon_origin, lat_origin, row_spacing, col_spacing: grid config (optional)
 */
@Entity(tableName = "farms")
data class FarmEntity(
    @PrimaryKey
    val farm_id: String,

    val owner_did: String,
    val region_code: String,
    val farm_name: String?,

    // GeoJSON Polygon serialized as JSON string
    // Format: {"type":"Polygon","coordinates":[[[lng,lat],[lng,lat],...]]}
    val boundary_json: String,

    // Grid configuration (optional)
    val lon_origin: Double?,
    val lat_origin: Double?,
    val row_spacing: Double?,  // meters
    val col_spacing: Double?,  // meters

    // Sync metadata
    val created_at: Long = System.currentTimeMillis(),
    val updated_at: Long = System.currentTimeMillis(),
    val synced_at: Long? = null  // null = not synced to server yet
)
