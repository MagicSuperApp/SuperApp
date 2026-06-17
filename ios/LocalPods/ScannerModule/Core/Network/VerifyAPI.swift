// LocalPods/ScannerModule/Core/Network/VerifyAPI.swift
//
// Verify API Client
// Handles POST /evidences/verify (§6.4) and POST /evidences/verify-transparent (§6.5)

import Foundation
import UIKit

/// Verify API Client for tree verification
final class VerifyAPI: BaseAPIClient {

    /// POST /evidences/verify (§6.4)
    /// Verify if an image matches an existing tree in the database
    func verify(
        image: UIImage,
        timeSeries: TimeSeriesData,
        metadata: MetadataData,
        radius: Double = 30.0,
        knownTreeId: String? = nil
    ) async throws -> VerifyResponse {
        // Convert image to JPEG data (same compression as ingest)
        guard let imageData = image.jpegData(compressionQuality: 0.6) else {
            throw ApiError.invalidResponse
        }

        // Build payload JSON
        var payload: [String: Any] = [
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

        // Add optional fields
        if let knownTreeId = knownTreeId {
            payload["known_tree_id"] = knownTreeId
        }

        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        guard let payloadString = String(data: payloadData, encoding: .utf8) else {
            throw ApiError.invalidResponse
        }

        // Create multipart request
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = createRequest(path: "/evidences/verify", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        // ⭐️ Disable cache to prevent stale verify results
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")

        var body = Data()

        // Add payload field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"payload\"\r\n\r\n".data(using: .utf8)!)
        body.append(payloadString.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add radius field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"radius\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(radius)".data(using: .utf8)!)
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
        return try await execute(request: request, responseType: VerifyResponse.self)
    }

    /// POST /evidences/verify-transparent (§6.5)
    /// Verify with client-supplied mask (transparent PNG/WebP)
    func verifyTransparent(
        image: UIImage,
        timeSeries: TimeSeriesData,
        metadata: MetadataData,
        radius: Double = 30.0,
        knownTreeId: String? = nil
    ) async throws -> VerifyResponse {
        // Convert image to PNG data (preserve alpha channel)
        guard let imageData = image.pngData() else {
            throw ApiError.invalidResponse
        }

        // Build payload JSON
        var payload: [String: Any] = [
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

        if let knownTreeId = knownTreeId {
            payload["known_tree_id"] = knownTreeId
        }

        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        guard let payloadString = String(data: payloadData, encoding: .utf8) else {
            throw ApiError.invalidResponse
        }

        // Create multipart request
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = createRequest(path: "/evidences/verify-transparent", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        // ⭐️ Disable cache to prevent stale verify results
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")

        var body = Data()

        // Add payload field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"payload\"\r\n\r\n".data(using: .utf8)!)
        body.append(payloadString.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add radius field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"radius\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(radius)".data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add image field (PNG with alpha)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)

        // End boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        // Execute request
        return try await execute(request: request, responseType: VerifyResponse.self)
    }
}

// MARK: - Models

/// Verify response (§6.4)
struct VerifyResponse: Codable {
    let status: String          // "matched" | "no_match" | "probable_match" | "possible_match" | "error"
    let decision: String        // "MATCH" | "PROBABLE_MATCH" | "POSSIBLE_MATCH" | "NO_MATCH" | "ERROR"
    let confidence: Double
    let matchedTreeId: String?
    let reason: String
    let source: String?         // "transparent" for verify-transparent
    let bestMatch: BestMatch?

    enum CodingKeys: String, CodingKey {
        case status
        case decision
        case confidence
        case matchedTreeId = "matched_tree_id"
        case reason
        case source
        case bestMatch = "best_match"
    }

    /// Check if verification found a match
    var isMatched: Bool {
        return status == "matched"
    }

    /// Check if verification returned a candidate that requires user choice.
    var hasMatchCandidate: Bool {
        let normalizedStatus = status.lowercased()
        let normalizedDecision = decision.uppercased()
        guard matchedTreeId != nil else { return false }
        guard normalizedStatus != "no_match", normalizedStatus != "error" else { return false }
        guard normalizedDecision != "NO_MATCH", normalizedDecision != "ERROR" else { return false }
        return true
    }
}

/// Best match details (§6.4)
struct BestMatch: Codable {
    let queryId: String
    let candidateId: String
    let treeId: String
    let dinoSimilarity: Double
    let superpointMatches: Int
    let superpointInliers: Int
    let superpointMatchRatio: Double
    let ransacInlierRatio: Double
    let barkTextureSimilarity: Double?
    let homography: [[Double]]?
    let fundamental: [[Double]]?
    let reprojectionError: Double?
    let finalScore: Double
    let confidence: Double
    let capturedAt: Int64?
    let timing: VerifyTiming?

    enum CodingKeys: String, CodingKey {
        case queryId = "query_id"
        case candidateId = "candidate_id"
        case treeId = "tree_id"
        case dinoSimilarity = "dino_similarity"
        case superpointMatches = "superpoint_matches"
        case superpointInliers = "superpoint_inliers"
        case superpointMatchRatio = "superpoint_match_ratio"
        case ransacInlierRatio = "ransac_inlier_ratio"
        case barkTextureSimilarity = "bark_texture_similarity"
        case homography
        case fundamental
        case reprojectionError = "reprojection_error"
        case finalScore = "final_score"
        case confidence
        case capturedAt = "captured_at"
        case timing
    }
}

/// Verify timing breakdown (§6.4)
struct VerifyTiming: Codable {
    let dinoSearch: Double
    let superpointMatch: Double
    let geometricVerify: Double
    let textureMatch: Double
    let total: Double

    enum CodingKeys: String, CodingKey {
        case dinoSearch = "dino_search"
        case superpointMatch = "superpoint_match"
        case geometricVerify = "geometric_verify"
        case textureMatch = "texture_match"
        case total
    }
}
