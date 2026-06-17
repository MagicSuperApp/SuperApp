// LocalPods/ScannerModule/Core/Network/FarmAPI.swift
//
// Farm API Client - Handles /farms endpoints (§4)

import Foundation

final class FarmAPI: BaseAPIClient {

    // MARK: - GET /farms (§4.1)

    func getFarms(
        regionCode: String? = nil,
        ownerDid: String? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> FarmListData {
        var path = "/farms?limit=\(limit)&offset=\(offset)"
        if let regionCode = regionCode {
            path += "&region_code=\(regionCode)"
        }
        if let ownerDid = ownerDid {
            path += "&owner_did=\(ownerDid)"
        }

        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: FarmListData.self)
    }

    // MARK: - POST /farms (§4.2)

    func createFarm(_ farm: FarmCreateRequest) async throws -> Farm {
        let encoder = JSONEncoder()
        let body = try encoder.encode(farm)

        let request = createRequest(path: "/farms", method: "POST", body: body)
        return try await execute(request: request, responseType: Farm.self)
    }

    // MARK: - GET /farms/{farm_id} (§4.3)

    func getFarm(farmId: String) async throws -> Farm {
        let path = "/farms/\(farmId)"
        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: Farm.self)
    }

    // MARK: - PUT /farms/{farm_id} (§4.4)

    func updateFarm(farmId: String, farm: FarmUpdateRequest) async throws -> Farm {
        let encoder = JSONEncoder()
        let body = try encoder.encode(farm)

        let path = "/farms/\(farmId)"
        let request = createRequest(path: path, method: "PUT", body: body)
        return try await execute(request: request, responseType: Farm.self)
    }

    // MARK: - PATCH /farms/{farm_id} (§4.5)

    func patchFarm(farmId: String, patch: FarmPatchRequest) async throws -> Farm {
        let encoder = JSONEncoder()
        let body = try encoder.encode(patch)

        let path = "/farms/\(farmId)"
        let request = createRequest(path: path, method: "PATCH", body: body)
        return try await execute(request: request, responseType: Farm.self)
    }

    // MARK: - DELETE /farms/{farm_id} (§4.6)

    func deleteFarm(farmId: String) async throws {
        let path = "/farms/\(farmId)"
        let request = createRequest(path: path, method: "DELETE")

        // DELETE returns 202 with { "farm_id": "...", "deleted": true }
        struct DeleteResponse: Codable {
            let farmId: String
            let deleted: Bool

            enum CodingKeys: String, CodingKey {
                case farmId = "farm_id"
                case deleted
            }
        }

        let _: DeleteResponse = try await execute(request: request, responseType: DeleteResponse.self)
    }

    // MARK: - GET /farms/{farm_id}/trees (§4.7)

    func getFarmTrees(
        farmId: String,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> FarmTreeListData {
        let path = "/farms/\(farmId)/trees?limit=\(limit)&offset=\(offset)"
        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: FarmTreeListData.self)
    }

    // MARK: - GET /farms/{farm_id}/grid-config (§4.8)

    func getGridConfig(farmId: String) async throws -> FarmGridConfig {
        let path = "/farms/\(farmId)/grid-config"
        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: FarmGridConfig.self)
    }

    // MARK: - POST /farms/{farm_id}/grid-config (§4.9)

    func setGridConfig(
        farmId: String,
        config: FarmGridConfigRequest
    ) async throws -> FarmGridConfig {
        let encoder = JSONEncoder()
        let body = try encoder.encode(config)

        let path = "/farms/\(farmId)/grid-config"
        let request = createRequest(path: path, method: "POST", body: body)
        return try await execute(request: request, responseType: FarmGridConfig.self)
    }
}
