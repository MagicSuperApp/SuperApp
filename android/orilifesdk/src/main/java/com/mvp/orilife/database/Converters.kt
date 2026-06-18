package com.mvp.orilife.database

import androidx.room.TypeConverter

/**
 * TypeConverter để Room có thể lưu enum vào SQLite.
 * Lưu enum dưới dạng String.
 */
class Converters {

    @TypeConverter
    fun fromTreeStatus(status: TreeStatus): String {
        return status.name
    }

    @TypeConverter
    fun toTreeStatus(value: String): TreeStatus {
        return try {
            TreeStatus.valueOf(value)
        } catch (e: IllegalArgumentException) {
            // Legacy data không có status → default CAPTURING
            TreeStatus.CAPTURING
        }
    }
}
