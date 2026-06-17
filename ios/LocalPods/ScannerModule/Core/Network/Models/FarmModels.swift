// LocalPods/ScannerModule/Core/Network/Models/FarmModels.swift
//
// Farm API models (§4)

import Foundation

// MARK: - Farm Response

struct Farm: Codable {
    let farmId: String
    let ownerDid: String
    let regionCode: String
    let farmName: String?
    let boundary: GeoJSONPolygon
    let lonOrigin: Double?
    let latOrigin: Double?
    let rowSpacing: Double?
    let colSpacing: Double?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case farmId = "farm_id"
        case ownerDid = "owner_did"
        case regionCode = "region_code"
        case farmName = "farm_name"
        case boundary
        case lonOrigin = "lon_origin"
        case latOrigin = "lat_origin"
        case rowSpacing = "row_spacing"
        case colSpacing = "col_spacing"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - GeoJSON Polygon

struct GeoJSONPolygon: Codable {
    let type: String
    let coordinates: [[[Double]]] // [[[lon, lat]]]

    init(coordinates: [[[Double]]]) {
        self.type = "Polygon"
        self.coordinates = coordinates
    }
}

// MARK: - Farm List Response

struct FarmListData: Codable {
    let items: [Farm]
    let limit: Int
    let offset: Int
}

// MARK: - Farm Create Request (§4.2)

struct FarmCreateRequest: Codable {
    let farmId: String
    let ownerDid: String
    let regionCode: String
    let farmName: String?
    let boundary: GeoJSONPolygon

    enum CodingKeys: String, CodingKey {
        case farmId = "farm_id"
        case ownerDid = "owner_did"
        case regionCode = "region_code"
        case farmName = "farm_name"
        case boundary
    }
}

// MARK: - Farm Update Request (§4.4)

struct FarmUpdateRequest: Codable {
    let ownerDid: String
    let regionCode: String
    let farmName: String?
    let boundary: GeoJSONPolygon

    enum CodingKeys: String, CodingKey {
        case ownerDid = "owner_did"
        case regionCode = "region_code"
        case farmName = "farm_name"
        case boundary
    }
}

// MARK: - Farm Patch Request (§4.5)

struct FarmPatchRequest: Codable {
    let ownerDid: String?
    let regionCode: String?
    let farmName: String?
    let boundary: GeoJSONPolygon?

    enum CodingKeys: String, CodingKey {
        case ownerDid = "owner_did"
        case regionCode = "region_code"
        case farmName = "farm_name"
        case boundary
    }
}

// MARK: - Farm Grid Config (§4.8, §4.9)

struct FarmGridConfig: Codable {
    let farmId: String
    let totalTrees: Int
    let rowMin: Int?
    let rowMax: Int?
    let colMin: Int?
    let colMax: Int?
    let lonOrigin: Double?
    let latOrigin: Double?
    let rowSpacing: Double?
    let colSpacing: Double?

    enum CodingKeys: String, CodingKey {
        case farmId = "farm_id"
        case totalTrees = "total_trees"
        case rowMin = "row_min"
        case rowMax = "row_max"
        case colMin = "col_min"
        case colMax = "col_max"
        case lonOrigin = "lon_origin"
        case latOrigin = "lat_origin"
        case rowSpacing = "row_spacing"
        case colSpacing = "col_spacing"
    }
}

struct FarmGridConfigRequest: Codable {
    let lonOrigin: Double
    let latOrigin: Double
    let rowSpacing: Double
    let colSpacing: Double

    enum CodingKeys: String, CodingKey {
        case lonOrigin = "lon_origin"
        case latOrigin = "lat_origin"
        case rowSpacing = "row_spacing"
        case colSpacing = "col_spacing"
    }
}

// MARK: - Farm Tree List (§4.7)

struct FarmTreeListData: Codable {
    let items: [Tree]
    let total: Int
    let limit: Int
    let offset: Int
}
