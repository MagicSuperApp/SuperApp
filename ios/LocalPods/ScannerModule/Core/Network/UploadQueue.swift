import Foundation
import UIKit
import FirebaseAnalytics  // ✅ THÊM DÒNG NÀY

// MARK: - SecureTreeDetectionRequest

/// Secure request payload for the detection API.
/// Mirrors Android SecureTreeDetectionRequest.
struct SecureTreeDetectionRequest: Codable {
    let imageId: String
    let treeId: String
    let nonce: String
    let signature: String
    let timestamp: Int64
    let deviceId: String
    let latitude: Double?
    let longitude: Double?
    let heading: Double?
    let pitch: Double?
    let roll: Double?
}

// MARK: - TreeDetectionResponse

/// API response from the detection server.
struct TreeDetectionResponse: Codable {
    let success: Bool
    let message: String
    let treeId: String?
    let confidence: Float?
    let processingTime: Int64?
}

struct UploadSuccessInfo {
    let finalTreeId: String
    let originalTreeId: String
    let matchedTreeId: String?
    let usedExistingTree: Bool
    let createdNewTree: Bool
}

// MARK: - Upload Result

enum UploadResult {
    case success(UploadSuccessInfo)
    case retry(String)        // error, should retry
    case failure(String, Bool) // (error, isRetryable)
}

// MARK: - Sync Result

struct SyncResult {
    let totalProcessed: Int
    let successCount: Int
    let failureCount: Int
    let retryCount: Int
    let syncedTreeIds: [String]
    let uploadedTrees: [UploadSuccessInfo]
}

// MARK: - UploadQueue

/// Offline-first upload queue with secure signing chain.
/// NOW USES: TreeAPI + EvidenceAPI (/evidences/ingest)
/// OLD: TreeDetectionAPI (/ingest) - DEPRECATED
///
/// Features:
///   - Enqueue → SQLite → sync when online
///   - Secure signing: nonce + signature + monotonic counter
///   - Retry up to 3 times per item
///   - Batch sync (5 items per batch)
///   - Orphan cleanup (delete DB record + image when file is missing)
///   - Auto-disable when Session.cancel() is called mid-sync
final class UploadQueue {

    // MARK: - Nested Actor for Thread-Safe Sync State

    /// Actor that serializes sync state access — no NSLock needed in async contexts.
    private actor SyncState {
        private(set) var isSyncing = false

        func begin() -> Bool {
            if isSyncing { return false }
            isSyncing = true
            return true
        }

        func end() {
            isSyncing = false
        }
    }

    // MARK: - Properties

    private let db: LocalDatabaseManager
    private let networkMonitor: NetworkMonitor
    private let maxRetries = 3
    private let batchSize = 5

    private let syncState = SyncState()

    // Secure signing components
    private var usedNonces: Set<String> = []
    private var monotonicCounter: MonotonicCounter?
    private var secureSignature: SecureSignature?

    // MARK: - Callbacks

    weak var syncCallback: UploadSyncCallback?

    var onSyncSuccess: ((String, UploadDetectionData?) -> Void)?
    var onSyncFailed: ((Int64, String) -> Void)?
    var onBatchSyncComplete: ((Int, [String]) -> Void)?

    /// ⭐️ NEW: Callback when verify finds existing tree
    /// Parameters: (originalTreeId, matchedTreeId, confidence, verifyResponse)
    /// Return: explicit old/new decision from the user
    var onTreeMatchFound: ((String, String, Double, VerifyResponse) async -> TreeMatchDecision)?

    // MARK: - Init

    init(db: LocalDatabaseManager = .shared,
         networkMonitor: NetworkMonitor) {
        self.db = db
        self.networkMonitor = networkMonitor

        self.monotonicCounter = MonotonicCounter()
        self.secureSignature = SecureSignature()
    }

    // MARK: - Public API

    /// Enqueue a pending detection for upload.
    func enqueue(treeId: String, imagePath: String, metadata: [String: Any]) async throws -> Int64 {
        let metadataJSON = try JSONSerialization.data(withJSONObject: metadata)
        let metadataStr = String(data: metadataJSON, encoding: .utf8) ?? "{}"
        let id = try db.insertPendingDetection(treeId: treeId, imagePath: imagePath, metadata: metadataStr)
        print("[UploadQueue] ✅ Enqueued detection #\(id): treeId=\(treeId), path=\(imagePath)")
        return id
    }

    /// Enqueue with masked image (full feature parity with Android enqueueDetectionWithMaskedImage).
    func enqueueWithMaskedImage(
        treeId: String,
        maskedImagePath: String,
        metadata: [String: Any]
    ) async throws -> Int64 {
        return try await enqueue(treeId: treeId, imagePath: maskedImagePath, metadata: metadata)
    }

    /// Save a cropped CGImage to disk.
    /// Mirrors Android TreeDetectionQueue.saveCroppedImage().
    func saveCroppedImage(_ image: CGImage, treeId: String) throws -> String? {
        let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docsDir.appendingPathComponent("tree_detections", isDirectory: true)

        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let filename = "crop_\(timestamp).jpg"
        let fileURL = dir.appendingPathComponent(filename)

        guard let destination = CGImageDestinationCreateWithURL(fileURL as CFURL, "public.jpeg" as CFString, 1, nil) else {
            print("[UploadQueue] ❌ Failed to create image destination")
            return nil
        }

        CGImageDestinationAddImage(
            destination,
            image,
            [kCGImageDestinationLossyCompressionQuality: 0.98] as CFDictionary
        )

        guard CGImageDestinationFinalize(destination) else {
            print("[UploadQueue] ❌ Failed to write JPEG")
            return nil
        }

        let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path)
        let size = attrs?[.size] as? Int ?? 0
        print("[UploadQueue] 💾 IMAGE_SAVED: \(fileURL.path), size=\(size)bytes")

        return fileURL.path
    }

    /// Sync all pending detections to the server.
    /// Only one sync runs at a time (mutex-protected).
    /// Retries up to 3 times per item before marking as failed.
    func syncPendingDetections() async -> SyncResult {
        // Actor serializes sync — no NSLock in async context
        guard await syncState.begin() else {
            print("[UploadQueue] ⏳ Sync already in progress — waiting")
            ScannerRemoteLog.breadcrumb(phase: "upload_sync_already_in_progress")
            return SyncResult(totalProcessed: 0, successCount: 0, failureCount: 0, retryCount: 0, syncedTreeIds: [], uploadedTrees: [])
        }

        defer { Task { await syncState.end() } }

        guard networkMonitor.isOnline else {
            print("[UploadQueue] 📴 Offline — skipping sync")
            ScannerRemoteLog.breadcrumb(phase: "upload_sync_offline_skip")
            return SyncResult(totalProcessed: 0, successCount: 0, failureCount: 0, retryCount: 0, syncedTreeIds: [], uploadedTrees: [])
        }

        ScannerRemoteLog.breadcrumb(phase: "upload_sync_start", detail: ["isOnline": true])

        var totalProcessed = 0
        var successCount = 0
        var failureCount = 0
        var retryCount = 0
        var syncedTreeIds: [String] = []
        var uploadedTrees: [UploadSuccessInfo] = []

        do {
            // Get oldest pending items, batch at a time
            let pending = try db.getPendingDetections()

            print("[UploadQueue] 🔍 syncPendingDetections: found \(pending.count) pending items")
            ScannerRemoteLog.breadcrumb(phase: "upload_pending_items_found", detail: [
                "count": pending.count,
                "batchSize": batchSize
            ])

            for item in pending.prefix(batchSize) {
                print("[UploadQueue]   → Pending: id=\(item.id), treeId=\(item.treeId), path=\(item.imagePath)")

                let result = await uploadDetection(item)

                totalProcessed += 1

                switch result {
                case .success(let uploadInfo):
                    try? db.updateDetectionStatus(id: item.id, status: "uploaded")
                    successCount += 1
                    syncedTreeIds.append(uploadInfo.finalTreeId)
                    uploadedTrees.append(uploadInfo)

                    // ⭐️ If tree_id changed (matched existing tree), update local DB
                    if uploadInfo.finalTreeId != item.treeId {
                        try? db.updateDetectionTreeId(id: item.id, newTreeId: uploadInfo.finalTreeId)
                        print("[UploadQueue] 🔄 Updated local DB: \(item.treeId) → \(uploadInfo.finalTreeId)")
                    }

                    // ✅ Track Analytics: Upload success
                    Analytics.logEvent("evidence_upload_success", parameters: [
                        "tree_id": uploadInfo.finalTreeId.hashValue
                    ])

                    ScannerRemoteLog.breadcrumb(phase: "upload_item_success", detail: [
                        "itemId": item.id,
                        "treeId": uploadInfo.finalTreeId,
                        "originalTreeId": uploadInfo.originalTreeId,
                        "matchedTreeId": uploadInfo.matchedTreeId ?? "nil",
                        "usedExistingTree": uploadInfo.usedExistingTree
                    ])

                    // Callback
                    let detectionData = parseDetectionData(from: item.metadata)
                    onSyncSuccess?(uploadInfo.finalTreeId, detectionData)
                    syncCallback?.onSyncSuccess(treeId: uploadInfo.finalTreeId, detectionData: detectionData ?? UploadDetectionData(
                        label: "Unknown", confidence: 0,
                        latitude: nil, longitude: nil,
                        timestamp: 0, boxCoordinates: []
                    ))

                case .retry(let error):
                    try? db.updateDetectionStatus(id: item.id, status: "pending", errorCode: error)
                    retryCount += 1
                    failureCount += 1

                    // ✅ Track Analytics: Upload retry
                    Analytics.logEvent("evidence_upload_failed", parameters: [
                        "error_type": "retry",
                        "error_message": error
                    ])

                    ScannerRemoteLog.error(phase: "upload_item_retry", message: error, detail: [
                        "itemId": item.id
                    ])

                    onSyncFailed?(item.id, error)
                    syncCallback?.onSyncFailed(detectionId: item.id, error: error)

                case .failure(let error, _):
                    print("[UploadQueue] ❌ UPLOAD_FAILURE: id=\(item.id), error=\(error)")

                    // ✅ Track Analytics: Upload failure
                    Analytics.logEvent("evidence_upload_failed", parameters: [
                        "error_type": "failure",
                        "error_message": error
                    ])

                    ScannerRemoteLog.error(phase: "upload_item_failure", message: error, detail: [
                        "itemId": item.id,
                        "imagePath": item.imagePath
                    ])

                    try? db.updateDetectionStatus(id: item.id, status: "failed", errorCode: error)

                    // Orphan cleanup: if image file is gone, delete DB record
                    if !FileManager.default.fileExists(atPath: item.imagePath) {
                        try? db.deletePendingDetection(id: item.id)
                        print("[UploadQueue] 🗑️ Image file missing — deleted orphan record #\(item.id)")
                    }

                    failureCount += 1
                    onSyncFailed?(item.id, error)
                    syncCallback?.onSyncFailed(detectionId: item.id, error: error)
                }
            }

            onBatchSyncComplete?(successCount, syncedTreeIds)
            syncCallback?.onBatchSyncComplete(successCount: successCount, treeIds: syncedTreeIds)

            print("[UploadQueue] ✅ Sync completed: total=\(totalProcessed), success=\(successCount), fail=\(failureCount), retry=\(retryCount)")
            ScannerRemoteLog.breadcrumb(phase: "upload_sync_complete", detail: [
                "totalProcessed": totalProcessed,
                "successCount": successCount,
                "failureCount": failureCount,
                "retryCount": retryCount
            ])

        } catch {
            print("[UploadQueue] ❌ Sync error: \(error)")
            ScannerRemoteLog.error(phase: "upload_sync_error", message: error.localizedDescription)
        }

        return SyncResult(
            totalProcessed: totalProcessed,
            successCount: successCount,
            failureCount: failureCount,
            retryCount: retryCount,
            syncedTreeIds: syncedTreeIds,
            uploadedTrees: uploadedTrees
        )
    }

    /// Get the count of pending detections.
    func getPendingCount() -> Int {
        (try? db.getPendingCount()) ?? 0
    }

    /// Set the sync callback handler.
    func setSyncCallback(_ callback: UploadSyncCallback?) {
        self.syncCallback = callback
    }

    // MARK: - Private: Upload Single Detection

    /// Upload a single pending detection using NEW EvidenceAPI.
    /// ⭐️ NEW: Verify first to check if tree already exists, then ingest.
    private func uploadDetection(_ item: PendingItem) async -> UploadResult {
        // ── Validate file ──────────────────────────────────────────────────
        let fileURL = URL(fileURLWithPath: item.imagePath)
        guard FileManager.default.fileExists(atPath: item.imagePath) else {
            print("[UploadQueue] 📤 UPLOAD_ATTEMPT: id=\(item.id), path=\(item.imagePath) — FILE NOT FOUND")
            return .failure("Image file not found: \(item.imagePath)", false)
        }

        guard let imageData = try? Data(contentsOf: fileURL),
              let image = UIImage(data: imageData) else {
            print("[UploadQueue] ❌ Cannot read image: \(item.imagePath)")
            return .failure("Cannot read image: \(item.imagePath)", true)
        }

        print("[UploadQueue] 📤 UPLOAD_ATTEMPT: id=\(item.id), treeId=\(item.treeId), imageSize=\(imageData.count)bytes")

        // ── Parse metadata ───────────────────────────────────────────────────
        var metadata: [String: Any] = [:]
        if let jsonData = item.metadata.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
            metadata = parsed
        }

        let imageId = metadata["imageId"] as? String ?? IDGenerator.generateImageId()
        let heading = metadata["heading"] as? Double ?? 0.0
        let pitch = metadata["pitch"] as? Double ?? 0.0
        let roll = metadata["roll"] as? Double ?? 0.0
        let latitude = metadata["latitude"] as? Double ?? 0.0
        let longitude = metadata["longitude"] as? Double ?? 0.0
        let farmId = metadata["farmId"] as? String ?? metadata["farm_id"] as? String ?? ""

        // ── Build secure request ───────────────────────────────────────────
        let deviceId = secureSignature?.getDeviceId() ?? ""
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)

        // Generate nonce
        let nonceWithTimestamp = SecurityHelper.generateNonceWithTimestamp(deviceKey: deviceId)
        let nonce = nonceWithTimestamp.nonce

        // Check nonce reuse
        if SecurityHelper.isNonceReused(nonce, usedNonces: usedNonces) {
            return .retry("Nonce reused — retry with new nonce")
        }

        // Increment counter
        guard let counter = monotonicCounter?.next() else {
            return .failure("Failed to increment monotonic counter", true)
        }

        // Hash image
        let imageHash = imageData.hashValue
        let imageHashStr = String(imageHash, radix: 16)

        // Sign request
        let signatureData = secureSignature?.signDetectionRequest(
            nonce: nonce,
            counter: counter,
            timestamp: timestamp,
            imageHash: imageHashStr
        )

        guard let signature = signatureData else {
            return .failure("Failed to sign request", true)
        }

        let timeSeriesData = TimeSeriesData(
            latitude: latitude,
            longitude: longitude,
            timestamp: timestamp,
            heading: heading,
            pitch: pitch,
            roll: roll
        )

        let metadataData = MetadataData(
            deviceId: deviceId,
            nonce: nonce,
            signature: signature
        )

        // ── ⭐️ STEP 1: VERIFY to check if tree already exists ──────────────
        var finalTreeId = item.treeId
        var matchedTreeId: String?
        var usedExistingTree = false
        var createdNewTree = false
        do {
            let verifyAPI = APISecrets.createVerifyAPI()

            print("[UploadQueue] 🔍 VERIFY_START: id=\(item.id), treeId=\(item.treeId)")
            let verifyResponse = try await verifyAPI.verify(
                image: image,
                timeSeries: timeSeriesData,
                metadata: metadataData,
                radius: 30.0  // 30m search radius
            )

            // Backend "ERROR" KHÁC "no match" — đừng treat ERROR như enroll-new.
            // Trước đây: backend ERROR (vd: SuperPoint empty keypoints,
            // model crash) → mobile fallback finalTreeId = item.treeId (grid
            // hash mới) → mỗi lần quét lại ra mã khác → trùng ID. Bug field
            // test 25/5.
            //
            // Sau backend fix (PR orilife-core#26): empty DB trả NO_MATCH
            // thay vì ERROR. Vẫn còn ERROR thật khi: image quá nhỏ (HTTP
            // 400), model crash, network 5xx. Lúc đó KHÔNG nên tạo tree
            // mới — defer & retry.
            if verifyResponse.status == "error" || verifyResponse.decision == "ERROR" {
                print("[UploadQueue] ⚠️ VERIFY_ERROR (will retry, NOT create new): id=\(item.id), reason=\(verifyResponse.reason)")
                Analytics.logEvent("tree_verify_backend_error", parameters: [
                    "tree_id": item.treeId.hashValue,
                    "reason": verifyResponse.reason
                ])
                // Throw để retry sau (UploadQueue retry policy sẽ pick up)
                throw ApiError.httpError(
                    statusCode: 503,
                    message: "Verify backend error: \(verifyResponse.reason)"
                )
            }

            // Check if we found a server-side match candidate.
            if verifyResponse.hasMatchCandidate, let matchedId = verifyResponse.matchedTreeId {
                print("[UploadQueue] ✅ VERIFY_MATCH_CANDIDATE: id=\(item.id), existingTreeId=\(matchedId), confidence=\(verifyResponse.confidence), status=\(verifyResponse.status)")
                print("[UploadQueue]    Reason: \(verifyResponse.reason)")

                let decision: TreeMatchDecision
                if let callback = onTreeMatchFound {
                    decision = await callback(item.treeId, matchedId, verifyResponse.confidence, verifyResponse)
                } else {
                    print("[UploadQueue] ⚠️ Missing tree match callback - keeping new tree")
                    decision = .createNew
                }

                switch decision {
                case .useExisting:
                    finalTreeId = matchedId
                    matchedTreeId = matchedId
                    usedExistingTree = true
                    print("[UploadQueue] ✅ USER_CONFIRMED: Using matched tree \(matchedId)")

                    Analytics.logEvent("tree_dedup_success", parameters: [
                        "original_tree_id": item.treeId.hashValue,
                        "matched_tree_id": matchedId.hashValue,
                        "confidence": verifyResponse.confidence,
                        "user_confirmed": true
                    ])
                case .createNew:
                    finalTreeId = item.treeId
                    print("[UploadQueue] 🆕 USER_SELECTED_NEW_TREE: Creating new tree \(item.treeId)")

                    Analytics.logEvent("tree_dedup_rejected", parameters: [
                        "original_tree_id": item.treeId.hashValue,
                        "matched_tree_id": matchedId.hashValue,
                        "confidence": verifyResponse.confidence
                    ])
                }
            } else if verifyResponse.status == "no_match" || verifyResponse.decision == "NO_MATCH" {
                // 🆕 New tree → use original tree_id
                finalTreeId = item.treeId
                print("[UploadQueue] 🆕 VERIFY_NO_MATCH: id=\(item.id), newTreeId=\(item.treeId)")
                print("[UploadQueue]    Reason: \(verifyResponse.reason)")

                Analytics.logEvent("tree_new_detected", parameters: [
                    "tree_id": item.treeId.hashValue,
                    "confidence": verifyResponse.confidence
                ])
            } else {
                let message = "Verify returned unsafe decision: status=\(verifyResponse.status), decision=\(verifyResponse.decision), matchedTreeId=\(verifyResponse.matchedTreeId ?? "nil")"
                print("[UploadQueue] ⚠️ \(message)")
                return .retry(message)
            }
        } catch let apiError as ApiError {
            print("[UploadQueue] ⚠️ VERIFY_FAILED_RETRY: id=\(item.id), error=\(apiError.localizedDescription)")

            Analytics.logEvent("tree_verify_failed", parameters: [
                "error_type": "api_error",
                "error_message": apiError.localizedDescription
            ])
            return .retry("Verify failed: \(apiError.localizedDescription)")
        } catch {
            print("[UploadQueue] ⚠️ VERIFY_ERROR_RETRY: id=\(item.id), error=\(error.localizedDescription)")

            Analytics.logEvent("tree_verify_failed", parameters: [
                "error_type": "network_error",
                "error_message": error.localizedDescription
            ])
            return .retry("Verify failed: \(error.localizedDescription)")
        }

        // ── STEP 2: CREATE NEW TREE ONLY AFTER VERIFY DECISION ──────────────
        if !usedExistingTree {
            do {
                try await createTreeIfNeeded(
                    treeId: finalTreeId,
                    farmId: farmId,
                    latitude: latitude,
                    longitude: longitude
                )
                createdNewTree = true
            } catch let apiError as ApiError {
                print("[UploadQueue] ❌ TREE_CREATE_API_ERROR: id=\(item.id), error=\(apiError)")
                return .retry("Create tree failed: \(apiError.localizedDescription)")
            } catch {
                print("[UploadQueue] ❌ TREE_CREATE_ERROR: id=\(item.id), error=\(error.localizedDescription)")
                return .retry("Create tree failed: \(error.localizedDescription)")
            }
        }

        // ── STEP 3: INGEST with correct tree_id ────────────────────────────
        do {
            let evidenceAPI = APISecrets.createEvidenceAPI()

            let response = try await evidenceAPI.ingest(
                treeId: finalTreeId,  // ⭐️ Use verified tree_id
                imageId: imageId,
                image: image,
                timeSeries: timeSeriesData,
                metadata: metadataData
            )

            // Mark nonce as used
            SecurityHelper.addNonceToCache(nonce, usedNonces: &usedNonces)

            if response.success {
                print("[UploadQueue] ✅ INGEST_SUCCESS: id=\(item.id) → finalTreeId=\(finalTreeId)")
                print("[UploadQueue] 📊 Features: \(response.featuresExtracted?.globalDim ?? 0)D global, \(response.featuresExtracted?.localKeypoints ?? 0) keypoints")

                // If tree_id changed (matched existing tree), notify caller
                if finalTreeId != item.treeId {
                    print("[UploadQueue] 🔄 TREE_ID_CHANGED: \(item.treeId) → \(finalTreeId)")
                }

                return .success(UploadSuccessInfo(
                    finalTreeId: finalTreeId,
                    originalTreeId: item.treeId,
                    matchedTreeId: matchedTreeId,
                    usedExistingTree: usedExistingTree,
                    createdNewTree: createdNewTree
                ))
            } else {
                let message = response.message
                print("[UploadQueue] ❌ INGEST_REJECTED: id=\(item.id), message=\(message)")
                return response.message.contains("retry") ? .retry(message) : .failure(message, false)
            }
        } catch let apiError as ApiError {
            print("[UploadQueue] ❌ INGEST_API_ERROR: id=\(item.id), error=\(apiError)")
            switch apiError {
            case .notFound(let msg), .validationError(let msg), .conflict(let msg):
                return .failure("Server rejected request: \(msg)", false)
            case .httpError(let code, let msg) where code >= 400 && code < 500:
                return .failure("Server rejected request (HTTP \(code)): \(msg)", false)
            default:
                return .retry(apiError.localizedDescription)
            }
        } catch {
            print("[UploadQueue] ❌ INGEST_HTTP_ERROR: id=\(item.id), error=\(error.localizedDescription)")
            return .retry(error.localizedDescription)
        }
    }

    // DEPRECATED: Old endpoint removed - now using EvidenceAPI.ingest()
    // Kept for reference only - not called anymore

    private func createTreeIfNeeded(treeId: String, farmId: String, latitude: Double, longitude: Double) async throws {
        let treeAPI = APISecrets.createTreeAPI()
        let request = TreeCreateRequest(
            id: treeId,
            regionCode: APISecrets.regionCode,
            farmId: farmId.isEmpty ? "unknown" : farmId,
            geohash7: calculateGeohash(latitude: latitude, longitude: longitude),
            latitude: latitude,
            longitude: longitude,
            rowIdx: nil,
            colIdx: nil,
            codebookId: nil,
            representativeVector: nil,
            binaryCode: nil,
            pqCode: nil,
            metadata: nil,
            capturedAt: nil
        )

        do {
            let tree = try await treeAPI.createTree(request)
            print("[UploadQueue] ✅ Tree created after verify: \(tree.id)")
        } catch let apiError as ApiError {
            if case .conflict = apiError {
                print("[UploadQueue] ℹ️ Tree already exists after verify: \(treeId)")
                return
            }
            throw apiError
        }
    }

    private func calculateGeohash(latitude: Double?, longitude: Double?) -> String {
        guard let lat = latitude, let lng = longitude else {
            return "w3gvk9q"
        }
        return Self.encodeGeohash(lat: lat, lng: lng, precision: 7)
    }

    private static let geohashBase32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")

    private static func encodeGeohash(lat: Double, lng: Double, precision: Int) -> String {
        var minLat = -90.0, maxLat = 90.0
        var minLng = -180.0, maxLng = 180.0
        var result = ""
        var bits = 0
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
            if bits == 5 {
                result.append(Self.geohashBase32[hashValue])
                bits = 0
                hashValue = 0
            }
        }
        return result
    }

    // MARK: - Private Helpers

    /// Parse detection data from metadata JSON string.
    private func parseDetectionData(from metadataStr: String) -> UploadDetectionData? {
        guard let data = metadataStr.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        let label = json["label"] as? String ?? "Unknown"
        let confidence = json["confidence"] as? Float ?? 0
        let latitude = json["latitude"] as? Double
        let longitude = json["longitude"] as? Double
        let timestamp = json["timestamp"] as? TimeInterval ?? 0
        let boxCoords = json["boxCoordinates"] as? [Float] ?? []

        return UploadDetectionData(
            label: label,
            confidence: confidence,
            latitude: latitude,
            longitude: longitude,
            timestamp: timestamp,
            boxCoordinates: boxCoords
        )
    }
}

// MARK: - PendingItem

typealias PendingItem = (id: Int64, treeId: String, imagePath: String, metadata: String, status: String)

// MARK: - UploadDetectionData

/// Detection data for sync callbacks.
struct UploadDetectionData {
    let label: String
    let confidence: Float
    let latitude: Double?
    let longitude: Double?
    let timestamp: TimeInterval
    let boxCoordinates: [Float]
}

// MARK: - UploadResult Extension

extension UploadResult {
    var isRetryable: Bool {
        switch self {
        case .success: return false
        case .retry: return true
        case .failure: return false
        }
    }

    var errorMessage: String {
        switch self {
        case .success: return ""
        case .retry(let msg): return msg
        case .failure(let msg, _): return msg
        }
    }
}

// MARK: - UploadSyncCallback

/// Callback interface for sync events.
protocol UploadSyncCallback: AnyObject {
    func onSyncSuccess(treeId: String, detectionData: UploadDetectionData)
    func onSyncFailed(detectionId: Int64, error: String)
    func onBatchSyncComplete(successCount: Int, treeIds: [String])
}
