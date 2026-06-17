// LocalPods/ScannerModule/Core/Network/Models/TreeModels.swift
//
// Tree API models (§5)

import Foundation

// MARK: - Tree Response

struct Tree: Codable {
    let id: String
    let regionCode: String
    let farmId: String
    let geohash7: String
    let latitude: Double?
    let longitude: Double?
    let rowIdx: Int?
    let colIdx: Int?
    let codebookId: String?
    let metadata: [String: AnyCodable]?
    let capturedAt: String?
    let createdAt: String
    let updatedAt: String
    let representativeVector: [Double]?
    let binaryCode: String?
    let pqCode: String?

    enum CodingKeys: String, CodingKey {
        case id
        case regionCode = "region_code"
        case farmId = "farm_id"
        case geohash7 = "geohash_7"
        case latitude
        case longitude
        case rowIdx = "row_idx"
        case colIdx = "col_idx"
        case codebookId = "codebook_id"
        case metadata
        case capturedAt = "captured_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case representativeVector = "representative_vector"
        case binaryCode = "binary_code"
        case pqCode = "pq_code"
    }
}

// MARK: - Tree List Response

struct TreeListData: Codable {
    let items: [Tree]
    let limit: Int
    let offset: Int
}

// MARK: - Tree Create Request (§5.2)

struct TreeCreateRequest: Codable {
    let id: String
    let regionCode: String
    let farmId: String
    let geohash7: String
    let latitude: Double?
    let longitude: Double?
    let rowIdx: Int?
    let colIdx: Int?
    let codebookId: String?
    let representativeVector: [Double]?
    let binaryCode: String?
    let pqCode: String?
    let metadata: [String: AnyCodable]?
    let capturedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case regionCode = "region_code"
        case farmId = "farm_id"
        case geohash7 = "geohash_7"
        case latitude
        case longitude
        case rowIdx = "row_idx"
        case colIdx = "col_idx"
        case codebookId = "codebook_id"
        case representativeVector = "representative_vector"
        case binaryCode = "binary_code"
        case pqCode = "pq_code"
        case metadata
        case capturedAt = "captured_at"
    }
}

// MARK: - Tree Update Request (§5.4)

struct TreeUpdateRequest: Codable {
    let regionCode: String
    let farmId: String
    let geohash7: String
    let latitude: Double?
    let longitude: Double?
    let rowIdx: Int?
    let colIdx: Int?
    let codebookId: String?
    let representativeVector: [Double]?
    let binaryCode: String?
    let pqCode: String?
    let metadata: [String: AnyCodable]?
    let capturedAt: String?

    enum CodingKeys: String, CodingKey {
        case regionCode = "region_code"
        case farmId = "farm_id"
        case geohash7 = "geohash_7"
        case latitude
        case longitude
        case rowIdx = "row_idx"
        case colIdx = "col_idx"
        case codebookId = "codebook_id"
        case representativeVector = "representative_vector"
        case binaryCode = "binary_code"
        case pqCode = "pq_code"
        case metadata
        case capturedAt = "captured_at"
    }
}

// MARK: - Tree Patch Request (§5.5)

struct TreePatchRequest: Codable {
    let regionCode: String?
    let farmId: String?
    let geohash7: String?
    let latitude: Double?
    let longitude: Double?
    let rowIdx: Int?
    let colIdx: Int?
    let codebookId: String?
    let representativeVector: [Double]?
    let binaryCode: String?
    let pqCode: String?
    let metadata: [String: AnyCodable]?
    let capturedAt: String?

    enum CodingKeys: String, CodingKey {
        case regionCode = "region_code"
        case farmId = "farm_id"
        case geohash7 = "geohash_7"
        case latitude
        case longitude
        case rowIdx = "row_idx"
        case colIdx = "col_idx"
        case codebookId = "codebook_id"
        case representativeVector = "representative_vector"
        case binaryCode = "binary_code"
        case pqCode = "pq_code"
        case metadata
        case capturedAt = "captured_at"
    }
}

// MARK: - AnyCodable Helper

/// Helper to encode/decode free-form JSON
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported type"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let bool as Bool:
            try container.encode(bool)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Unsupported type"
                )
            )
        }
    }
}
