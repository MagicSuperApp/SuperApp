import Foundation
import SQLite

/// SQLite database manager for pending upload queue and saved trees.
/// Schema matches Android Room database (HarvestDatabase.kt).
/// Uses SQLite.swift library.
final class LocalDatabaseManager {

    // MARK: - Schema

    private var db: Connection?

    // Tables
    private let pendingDetections = Table("pending_detections")
    private let savedTrees = Table("saved_trees")
    private let treeImages = Table("tree_images")

    // Pending columns
    private let pdId = Expression<Int64>("id")
    private let pdTreeId = Expression<String>("tree_id")
    private let pdImagePath = Expression<String>("image_path")
    private let pdMetadata = Expression<String>("metadata")
    private let pdStatus = Expression<String>("status")
    private let pdCreatedAt = Expression<Date>("created_at")
    private let pdErrorCode = Expression<String?>("error_code")

    // Saved trees columns
    private let stTreeId = Expression<String>("tree_id")
    private let stTimestamp = Expression<Int64>("saved_timestamp")

    // Tree images columns
    private let tiId = Expression<Int64>("id")
    private let tiTreeId = Expression<String>("tree_id")
    private let tiSectorIndex = Expression<Int>("sector_index")
    private let tiImagePath = Expression<String>("image_path")
    private let tiHeading = Expression<Double?>("heading")
    private let tiPitch = Expression<Double?>("pitch")
    private let tiRoll = Expression<Double?>("roll")

    // MARK: - Singleton

    static let shared = LocalDatabaseManager()

    private init() {}

    // MARK: - Public API

    /// Initialize database in the app's Documents directory.
    func initialize() throws {
        let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dbPath = docsDir.appendingPathComponent("orilife_scanner.sqlite3").path

        db = try Connection(dbPath)
        try createTables()
        print("[LocalDatabaseManager] ✅ Initialized: \(dbPath)")
    }

    // MARK: - Pending Detections

    func insertPendingDetection(treeId: String, imagePath: String, metadata: String) throws -> Int64 {
        guard let db = db else { throw DatabaseError.notInitialized }

        let insert = pendingDetections.insert(
            pdTreeId <- treeId,
            pdImagePath <- imagePath,
            pdMetadata <- metadata,
            pdStatus <- "pending",
            pdCreatedAt <- Date(),
            pdErrorCode <- nil
        )

        return try db.run(insert)
    }

    func getPendingDetections() throws -> [(id: Int64, treeId: String, imagePath: String, metadata: String, status: String)] {
        guard let db = db else { throw DatabaseError.notInitialized }

        var results: [(Int64, String, String, String, String)] = []
        for row in try db.prepare(pendingDetections.filter(pdStatus == "pending").order(pdCreatedAt.asc)) {
            results.append((
                row[pdId],
                row[pdTreeId],
                row[pdImagePath],
                row[pdMetadata],
                row[pdStatus]
            ))
        }
        return results
    }

    func updateDetectionStatus(id: Int64, status: String, errorCode: String? = nil) throws {
        guard let db = db else { throw DatabaseError.notInitialized }

        let detection = pendingDetections.filter(pdId == id)
        try db.run(detection.update(
            pdStatus <- status,
            pdErrorCode <- errorCode
        ))
    }

    func updateDetectionTreeId(id: Int64, newTreeId: String) throws {
        guard let db = db else { throw DatabaseError.notInitialized }

        let detection = pendingDetections.filter(pdId == id)
        try db.run(detection.update(
            pdTreeId <- newTreeId
        ))
    }

    func deletePendingDetection(id: Int64) throws {
        guard let db = db else { throw DatabaseError.notInitialized }
        try db.run(pendingDetections.filter(pdId == id).delete())
    }

    func getPendingCount() throws -> Int {
        guard let db = db else { throw DatabaseError.notInitialized }
        return try db.scalar(pendingDetections.filter(pdStatus == "pending").count)
    }

    // MARK: - Saved Trees

    func insertSavedTree(treeId: String) throws {
        guard let db = db else { throw DatabaseError.notInitialized }

        try db.run(savedTrees.insert(or: .replace,
            stTreeId <- treeId,
            stTimestamp <- Int64(Date().timeIntervalSince1970 * 1000)
        ))
    }

    func getSavedTree(treeId: String) throws -> (treeId: String, timestamp: Int64)? {
        guard let db = db else { throw DatabaseError.notInitialized }

        let query = savedTrees.filter(stTreeId == treeId)
        guard let row = try db.pluck(query) else { return nil }
        return (row[stTreeId], row[stTimestamp])
    }

    func isTreeSaved(treeId: String) throws -> Bool {
        return try getSavedTree(treeId: treeId) != nil
    }

    // MARK: - Tree Images

    func insertTreeImage(treeId: String, sectorIndex: Int, imagePath: String,
                         heading: Double?, pitch: Double?, roll: Double?) throws -> Int64 {
        guard let db = db else { throw DatabaseError.notInitialized }

        return try db.run(treeImages.insert(
            tiTreeId <- treeId,
            tiSectorIndex <- sectorIndex,
            tiImagePath <- imagePath,
            tiHeading <- heading,
            tiPitch <- pitch,
            tiRoll <- roll
        ))
    }

    func getTreeImages(treeId: String) throws -> [(id: Int64, sectorIndex: Int, imagePath: String, heading: Double?, pitch: Double?, roll: Double?)] {
        guard let db = db else { throw DatabaseError.notInitialized }

        var results: [(Int64, Int, String, Double?, Double?, Double?)] = []
        for row in try db.prepare(treeImages.filter(tiTreeId == treeId).order(tiSectorIndex.asc)) {
            results.append((
                row[tiId],
                row[tiSectorIndex],
                row[tiImagePath],
                row[tiHeading],
                row[tiPitch],
                row[tiRoll]
            ))
        }
        return results
    }

    // MARK: - Private

    private func createTables() throws {
        guard let db = db else { throw DatabaseError.notInitialized }

        try db.run(pendingDetections.create(ifNotExists: true) { t in
            t.column(pdId, primaryKey: .autoincrement)
            t.column(pdTreeId)
            t.column(pdImagePath)
            t.column(pdMetadata)
            t.column(pdStatus, defaultValue: "pending")
            t.column(pdCreatedAt, defaultValue: Date())
            t.column(pdErrorCode)
        })

        try db.run(savedTrees.create(ifNotExists: true) { t in
            t.column(stTreeId, primaryKey: true)
            t.column(stTimestamp)
        })

        try db.run(treeImages.create(ifNotExists: true) { t in
            t.column(tiId, primaryKey: .autoincrement)
            t.column(tiTreeId)
            t.column(tiSectorIndex)
            t.column(tiImagePath)
            t.column(tiHeading)
            t.column(tiPitch)
            t.column(tiRoll)
        })

        print("[LocalDatabaseManager] ✅ Tables created")
    }
}

// MARK: - Errors

enum DatabaseError: Error, LocalizedError {
    case notInitialized

    var errorDescription: String? {
        switch self {
        case .notInitialized: return "Database not initialized"
        }
    }
}
