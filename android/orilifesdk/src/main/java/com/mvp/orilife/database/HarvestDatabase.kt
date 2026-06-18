package com.mvp.orilife.database

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [HarvestRecord::class, PendingTreeDetection::class, SavedTree::class, FarmEntity::class],
    version = 16,
    exportSchema = false
)
@androidx.room.TypeConverters(Converters::class)
abstract class HarvestDatabase : RoomDatabase() {
    abstract fun harvestDao(): HarvestDao
    abstract fun treeDetectionDao(): TreeDetectionDao
    abstract fun savedTreeDao(): SavedTreeDao
    abstract fun farmDao(): FarmDao

    companion object {
        @Volatile
        private var INSTANCE: HarvestDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Create trees table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS trees (
                        tree_id TEXT PRIMARY KEY NOT NULL,
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        accuracy REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        deviceId TEXT NOT NULL,
                        isSynced INTEGER NOT NULL DEFAULT 0
                    )
                """.trimIndent())

                // Add new columns to harvest_records
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN detectionConfidence REAL NOT NULL DEFAULT 0.0")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN croppedImagePath TEXT NOT NULL DEFAULT ''")
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Drop trees table (no longer needed)
                database.execSQL("DROP TABLE IF EXISTS trees")
                
                // Create new harvest_records table without treeId
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS harvest_records_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        fruitVector TEXT NOT NULL,
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        signature TEXT NOT NULL,
                        detectionConfidence REAL NOT NULL DEFAULT 0.0,
                        croppedImagePath TEXT NOT NULL DEFAULT '',
                        videoPath TEXT NOT NULL DEFAULT '',
                        isSynced INTEGER NOT NULL DEFAULT 0
                    )
                """.trimIndent())
                
                // Copy data from old table (excluding treeId)
                database.execSQL("""
                    INSERT INTO harvest_records_new (id, fruitVector, latitude, longitude, timestamp, signature, detectionConfidence, croppedImagePath, isSynced)
                    SELECT id, fruitVector, latitude, longitude, timestamp, signature, detectionConfidence, croppedImagePath, isSynced
                    FROM harvest_records
                """.trimIndent())
                
                // Drop old table
                database.execSQL("DROP TABLE harvest_records")
                
                // Rename new table
                database.execSQL("ALTER TABLE harvest_records_new RENAME TO harvest_records")
            }
        }
        
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Remove videoPath column from harvest_records
                // SQLite doesn't support DROP COLUMN, so we recreate the table
                
                // Create new table without videoPath
                database.execSQL("""
                    CREATE TABLE harvest_records_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        fruitVector TEXT NOT NULL,
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        signature TEXT NOT NULL,
                        detectionConfidence REAL NOT NULL DEFAULT 0.0,
                        croppedImagePath TEXT NOT NULL DEFAULT '',
                        isSynced INTEGER NOT NULL DEFAULT 0
                    )
                """.trimIndent())
                
                // Copy data from old table (excluding videoPath)
                database.execSQL("""
                    INSERT INTO harvest_records_new (id, fruitVector, latitude, longitude, timestamp, signature, detectionConfidence, croppedImagePath, isSynced)
                    SELECT id, fruitVector, latitude, longitude, timestamp, signature, detectionConfidence, croppedImagePath, isSynced
                    FROM harvest_records
                """.trimIndent())
                
                // Drop old table
                database.execSQL("DROP TABLE harvest_records")
                
                // Rename new table
                database.execSQL("ALTER TABLE harvest_records_new RENAME TO harvest_records")
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN merkleRoot TEXT")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN frameCount INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN processingTime REAL NOT NULL DEFAULT 0.0")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN frameHashes TEXT")
            }
        }

        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS pending_tree_detections (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        imagePath TEXT NOT NULL,
                        boxCoordinates TEXT NOT NULL,
                        label TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        gpsAccuracy REAL,
                        retryCount INTEGER NOT NULL DEFAULT 0,
                        lastAttemptAt INTEGER,
                        errorMessage TEXT,
                        createdAt INTEGER NOT NULL,
                        treeId TEXT
                    )
                """.trimIndent())

                database.execSQL("CREATE INDEX IF NOT EXISTS index_pending_tree_detections_treeId ON pending_tree_detections(treeId)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_pending_tree_detections_createdAt ON pending_tree_detections(createdAt)")
            }
        }

        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN trustScore REAL NOT NULL DEFAULT 0.5")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN manualVerified INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE harvest_records ADD COLUMN virtualID TEXT")
            }
        }

        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Drop pending_uploads table (no longer needed)
                database.execSQL("DROP TABLE IF EXISTS pending_uploads")
            }
        }

        private val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Create saved_trees table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS saved_trees (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        treeId TEXT NOT NULL,
                        savedTimestamp INTEGER NOT NULL
                    )
                """.trimIndent())
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_saved_trees_treeId ON saved_trees(treeId)")
            }
        }

        private val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Thêm sensor orientation columns vào pending_tree_detections
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN heading REAL")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN pitch REAL")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN roll REAL")
            }
        }

        private val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Thêm các field mới: quality metrics, image hash, session tracking
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN gpsAccuracy REAL")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN yoloConfidence REAL")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN blurScore REAL")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN imageHash TEXT")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN imageIndex INTEGER")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN sessionId TEXT")
            }
        }

        // ✅ Migration 12→13: Replace 5 quality fields with 2 payload fields (imageId, treeId)
        // SQLite không hỗ trợ DROP COLUMN trực tiếp — cần recreate table
        private val MIGRATION_12_13 = object : Migration(12, 13) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Tạo bảng mới với schema mới (thay yoloConfidence→imageId, xóa các field cũ)
                database.execSQL("""
                    CREATE TABLE pending_tree_detections_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        imagePath TEXT NOT NULL,
                        boxCoordinates TEXT NOT NULL,
                        label TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        gpsAccuracy REAL,
                        heading REAL,
                        pitch REAL,
                        roll REAL,
                        imageId TEXT,
                        treeId TEXT,
                        retryCount INTEGER NOT NULL DEFAULT 0,
                        lastAttemptAt INTEGER,
                        errorMessage TEXT,
                        createdAt INTEGER NOT NULL
                    )
                """.trimIndent())

                // Copy dữ liệu từ bảng cũ
                database.execSQL("""
                    INSERT INTO pending_tree_detections_new
                        (id, imagePath, boxCoordinates, label, confidence, timestamp,
                         latitude, longitude, gpsAccuracy, heading, pitch, roll,
                         imageId, treeId, retryCount, lastAttemptAt, errorMessage, createdAt)
                    SELECT
                        id, imagePath, boxCoordinates, label, confidence, timestamp,
                        latitude, longitude, gpsAccuracy, heading, pitch, roll,
                        NULL as imageId, NULL as treeId,
                        retryCount, lastAttemptAt, errorMessage, createdAt
                    FROM pending_tree_detections
                """.trimIndent())

                // Xóa bảng cũ
                database.execSQL("DROP TABLE pending_tree_detections")

                // Đổi tên bảng mới
                database.execSQL("ALTER TABLE pending_tree_detections_new RENAME TO pending_tree_detections")
            }
        }

        // ✅ Migration 13→14: tách treeId(client session) và serverTreeId(upload success)
        private val MIGRATION_13_14 = object : Migration(13, 14) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN serverTreeId TEXT")
            }
        }

        // ✅ Migration 14→15: thêm status vào saved_trees
        private val MIGRATION_14_15 = object : Migration(14, 15) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Thêm status column với default CAPTURING (legacy records vẫn hiểu là CAPTURING)
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN status TEXT NOT NULL DEFAULT 'CAPTURING'")
                Log.d("HarvestDatabase", "✅ Migration 14→15: added status column to saved_trees")
            }
        }

        // ✅ Migration 15→16: thêm farm metadata vào saved_trees & pending_tree_detections, tạo farms table
        private val MIGRATION_15_16 = object : Migration(15, 16) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // 1. Add farm metadata columns to saved_trees
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN farmId TEXT")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN regionCode TEXT")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN geohash7 TEXT")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN latitude REAL")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN longitude REAL")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN rowIdx INTEGER")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN colIdx INTEGER")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN treeMetadata TEXT")
                database.execSQL("ALTER TABLE saved_trees ADD COLUMN serverSynced INTEGER NOT NULL DEFAULT 0")

                // 2. Add farm metadata columns to pending_tree_detections
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN farmId TEXT")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN regionCode TEXT")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN geohash7 TEXT")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN rowIdx INTEGER")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN colIdx INTEGER")
                database.execSQL("ALTER TABLE pending_tree_detections ADD COLUMN treeMetadata TEXT")

                // 3. Create farms table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS farms (
                        farm_id TEXT PRIMARY KEY NOT NULL,
                        owner_did TEXT NOT NULL,
                        region_code TEXT NOT NULL,
                        farm_name TEXT,
                        boundary_json TEXT NOT NULL,
                        lon_origin REAL,
                        lat_origin REAL,
                        row_spacing REAL,
                        col_spacing REAL,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL,
                        synced_at INTEGER
                    )
                """.trimIndent())

                database.execSQL("CREATE INDEX IF NOT EXISTS index_farms_owner_did ON farms(owner_did)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_farms_region_code ON farms(region_code)")

                Log.d("HarvestDatabase", "✅ Migration 15→16: added farm metadata & farms table")
            }
        }

        fun getDatabase(context: Context): HarvestDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    HarvestDatabase::class.java,
                    "measure_database"
                )
                .addMigrations(
                    MIGRATION_1_2, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6,
                    MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10,
                    MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13, MIGRATION_13_14,
                    MIGRATION_14_15, MIGRATION_15_16
                )
                .fallbackToDestructiveMigration() // For development only
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
