// LocalPods/ScannerModule/Core/Network/TreeAPI.swift
//
// Tree API Client - Handles /trees endpoints (§5)

import Foundation

final class TreeAPI: BaseAPIClient {

    // MARK: - GET /trees (§5.1)

    func getTrees(
        farmId: String? = nil,
        regionCode: String? = nil,
        rowIdx: Int? = nil,
        colIdx: Int? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> TreeListData {
        var path = "/trees?limit=\(limit)&offset=\(offset)"

        if let farmId = farmId {
            path += "&farm_id=\(farmId)"
        }
        if let regionCode = regionCode {
            path += "&region_code=\(regionCode)"
        }
        if let rowIdx = rowIdx {
            path += "&row_idx=\(rowIdx)"
        }
        if let colIdx = colIdx {
            path += "&col_idx=\(colIdx)"
        }

        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: TreeListData.self)
    }

    // MARK: - POST /trees (§5.2)

    /// Create tree - MUST be called BEFORE /evidences/ingest
    func createTree(_ tree: TreeCreateRequest) async throws -> Tree {
        let encoder = JSONEncoder()
        let body = try encoder.encode(tree)

        let request = createRequest(path: "/trees", method: "POST", body: body)
        return try await execute(request: request, responseType: Tree.self)
    }

    // MARK: - GET /trees/{tree_id} (§5.3)

    func getTree(treeId: String) async throws -> Tree {
        let path = "/trees/\(treeId)"
        let request = createRequest(path: path, method: "GET")
        return try await execute(request: request, responseType: Tree.self)
    }

    // MARK: - PUT /trees/{tree_id} (§5.4)

    func updateTree(treeId: String, tree: TreeUpdateRequest) async throws -> Tree {
        let encoder = JSONEncoder()
        let body = try encoder.encode(tree)

        let path = "/trees/\(treeId)"
        let request = createRequest(path: path, method: "PUT", body: body)
        return try await execute(request: request, responseType: Tree.self)
    }

    // MARK: - PATCH /trees/{tree_id} (§5.5)

    func patchTree(treeId: String, patch: TreePatchRequest) async throws -> Tree {
        let encoder = JSONEncoder()
        let body = try encoder.encode(patch)

        let path = "/trees/\(treeId)"
        let request = createRequest(path: path, method: "PATCH", body: body)
        return try await execute(request: request, responseType: Tree.self)
    }

    // MARK: - DELETE /trees/{tree_id} (§5.6)

    func deleteTree(treeId: String) async throws {
        let path = "/trees/\(treeId)"
        let request = createRequest(path: path, method: "DELETE")

        // DELETE returns 202 with { "tree_id": "...", "deleted": true }
        struct DeleteResponse: Codable {
            let treeId: String
            let deleted: Bool

            enum CodingKeys: String, CodingKey {
                case treeId = "tree_id"
                case deleted
            }
        }

        let _: DeleteResponse = try await execute(request: request, responseType: DeleteResponse.self)
    }
}
