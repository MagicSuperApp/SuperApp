// LocalPods/ScannerModule/Core/Network/UploadQueueIntegration.swift
//
// Integration layer for UploadQueue to use new API (TreeAPI + EvidenceAPI)
// This wraps the existing UploadQueue without modifying it

import Foundation
import UIKit

/// Enhanced upload queue that integrates TreeAPI before uploading
final class EnhancedUploadQueue {

    private let originalQueue: UploadQueue

    init(originalQueue: UploadQueue) {
        self.originalQueue = originalQueue
    }

    /// Enqueue detection; tree creation is intentionally deferred until UploadQueue
    /// finishes verify and the user chooses old tree vs new tree.
    func enqueueWithTreeCreation(
        treeId: String,
        farmId: String,
        imagePath: String,
        metadata: [String: Any],
        latitude: Double?,
        longitude: Double?
    ) async throws -> Int64 {
        var enrichedMetadata = metadata
        enrichedMetadata["farmId"] = farmId
        if let latitude = latitude { enrichedMetadata["latitude"] = latitude }
        if let longitude = longitude { enrichedMetadata["longitude"] = longitude }

        let id = try await originalQueue.enqueue(
            treeId: treeId,
            imagePath: imagePath,
            metadata: enrichedMetadata
        )

        print("[EnhancedUploadQueue] ✅ Enqueued to upload queue: id=\(id)")
        return id
    }

    /// Enqueue a pending detection for upload (delegates to original queue).
    func enqueue(treeId: String, imagePath: String, metadata: [String: Any]) async throws -> Int64 {
        return try await originalQueue.enqueue(treeId: treeId, imagePath: imagePath, metadata: metadata)
    }

    /// Sync pending detections (delegates to original queue)
    func syncPendingDetections() async -> SyncResult {
        return await originalQueue.syncPendingDetections()
    }

    /// Set the sync callback handler.
    func setSyncCallback(_ callback: UploadSyncCallback?) {
        originalQueue.setSyncCallback(callback)
    }

    /// Get pending count (delegates to original queue)
    func getPendingCount() -> Int {
        return originalQueue.getPendingCount()
    }

    // MARK: - Helpers

    /// Encodes a latitude/longitude pair to a Geohash string (precision 7 = ~76m accuracy).
    /// Uses the standard Geohash base32 alphabet. No external dependencies required.
    private func calculateGeohash(latitude: Double?, longitude: Double?) -> String {
        guard let lat = latitude, let lng = longitude else {
            return "w3gvk9q"  // Fallback: centroid of vn-south-01 region (Mekong Delta)
        }
        return Self.encodeGeohash(lat: lat, lng: lng, precision: 7)
    }

    private static let geohashBase32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")

    /// Pure-Swift Geohash encoder. Standard algorithm — identical output to geohash.org.
    private static func encodeGeohash(lat: Double, lng: Double, precision: Int) -> String {
        var minLat = -90.0, maxLat = 90.0
        var minLng = -180.0, maxLng = 180.0
        var result = ""
        var bits = 0
        var bitsTotal = 0
        var hashValue = 0
        var isEven = true

        while result.count < precision {
            if isEven {
                let mid = (minLng + maxLng) / 2
                if lng >= mid {
                    hashValue = (hashValue << 1) | 1
                    minLng = mid
                } else {
                    hashValue = hashValue << 1
                    maxLng = mid
                }
            } else {
                let mid = (minLat + maxLat) / 2
                if lat >= mid {
                    hashValue = (hashValue << 1) | 1
                    minLat = mid
                } else {
                    hashValue = hashValue << 1
                    maxLat = mid
                }
            }
            isEven.toggle()
            bits += 1
            bitsTotal += 1
            if bits == 5 {
                result.append(geohashBase32[hashValue])
                bits = 0
                hashValue = 0
            }
        }
        return result
    }
}
