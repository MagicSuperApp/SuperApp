// LocalPods/ScannerModule/Core/Network/EvidenceAPI.swift
//
// Evidence API Client
// Handles /evidences endpoints (§6, §7, §8)

import Foundation
import UIKit

/// Evidence API Client for multipart uploads
final class EvidenceAPI: BaseAPIClient {

    /// POST /evidences/ingest (§6.2)
    /// Multipart upload with image + metadata
    func ingest(
        treeId: String,
        imageId: String,
        image: UIImage,
        timeSeries: TimeSeriesData,
        metadata: MetadataData
    ) async throws -> IngestResponse {
        // Convert image to JPEG data.
        // Power-aware (field test 2026-05-15): 0.8 → 0.6 — file giảm ~40%,
        // upload time giảm tương ứng, radio bật ngắn hơn → mát máy hơn.
        // Visual quality vẫn đủ cho AI training (yolov26seg detect chính xác trên 0.6).
        guard let imageData = image.jpegData(compressionQuality: 0.6) else {
            throw ApiError.invalidResponse
        }

        // Build payload JSON
        let payload: [String: Any] = [
            "image_id": imageId,
            "tree_id": treeId,
            "time_series": [
                "latitude": timeSeries.latitude,
                "longitude": timeSeries.longitude,
                "timestamp": timeSeries.timestamp,
                "heading": timeSeries.heading,
                "pitch": timeSeries.pitch,
                "roll": timeSeries.roll
            ],
            "metadata": [
                "device_id": metadata.deviceId,
                "nonce": metadata.nonce,
                "signature": metadata.signature
            ]
        ]

        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        guard let payloadString = String(data: payloadData, encoding: .utf8) else {
            throw ApiError.invalidResponse
        }

        // Create multipart request
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = createRequest(path: "/evidences/ingest", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Add payload field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"payload\"\r\n\r\n".data(using: .utf8)!)
        body.append(payloadString.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add image field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)

        // End boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        // Execute request
        return try await execute(request: request, responseType: IngestResponse.self)
    }
}

// MARK: - Models

/// Time series data (§6.1 TimeSeriesForm)
struct TimeSeriesData {
    let latitude: Double
    let longitude: Double
    let timestamp: Int64  // Unix epoch MILLISECONDS
    let heading: Double
    let pitch: Double
    let roll: Double
}

/// Metadata for device signature (§6.1 MetadataForm)
struct MetadataData {
    let deviceId: String
    let nonce: String
    let signature: String
}

/// Ingest response (§6.2)
struct IngestResponse: Codable {
    let success: Bool
    let imageId: String
    let treeId: String
    let featuresExtracted: FeaturesExtracted?
    let storageKeys: StorageKeys?
    let message: String

    enum CodingKeys: String, CodingKey {
        case success
        case imageId = "image_id"
        case treeId = "tree_id"
        case featuresExtracted = "features_extracted"
        case storageKeys = "storage_keys"
        case message
    }
}

struct FeaturesExtracted: Codable {
    let globalDim: Int
    let localKeypoints: Int
    let localDim: Int

    enum CodingKeys: String, CodingKey {
        case globalDim = "global_dim"
        case localKeypoints = "local_keypoints"
        case localDim = "local_dim"
    }
}

struct StorageKeys: Codable {
    let globalFeatures: String?
    let localFeatures: String?
    let image: String?

    enum CodingKeys: String, CodingKey {
        case globalFeatures = "global_features"
        case localFeatures = "local_features"
        case image
    }
}
