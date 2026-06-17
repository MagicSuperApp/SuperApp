// LocalPods/ScannerModule/Core/Network/Models/ApiResponse.swift
//
// ApiEnvelope wrapper for all API responses (§1.2)

import Foundation

/// API Envelope - wraps all responses
struct ApiEnvelope<T: Codable>: Codable {
    let statusCode: Int
    let message: String
    let error: String?
    let data: T?

    enum CodingKeys: String, CodingKey {
        case statusCode = "status_code"
        case message
        case error
        case data
    }
}

/// Error response detail
struct ApiErrorDetail: Codable {
    let type: String
    let detail: String
}

/// Error envelope (for error responses without data field)
private struct ErrorEnvelope: Codable {
    let statusCode: Int
    let message: String
    let error: String?

    enum CodingKeys: String, CodingKey {
        case statusCode = "status_code"
        case message
        case error
    }
}

/// Base API error
enum ApiError: Error, LocalizedError {
    case networkError(Error)
    case invalidResponse
    case httpError(statusCode: Int, message: String)
    case decodingError(Error)
    case missingData
    case unauthorized
    case notFound(String)
    case conflict(String)
    case validationError(String)

    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code, let message):
            return "HTTP \(code): \(message)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .missingData:
            return "Response data is missing"
        case .unauthorized:
            return "Unauthorized - check API key"
        case .notFound(let resource):
            return "Not found: \(resource)"
        case .conflict(let message):
            return "Conflict: \(message)"
        case .validationError(let message):
            return "Validation error: \(message)"
        }
    }
}

/// Base API client with common functionality
class BaseAPIClient {
    let baseUrl: String
    let apiKey: String
    let session: URLSession

    init(baseUrl: String, apiKey: String) {
        self.baseUrl = baseUrl
        self.apiKey = apiKey

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60

        // ⭐️ Disable cache for verify API to prevent stale results
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.urlCache = nil

        self.session = URLSession(configuration: config)
    }

    /// Create URLRequest with common headers
    func createRequest(
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) -> URLRequest {
        let url = URL(string: "\(baseUrl)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return request
    }

    /// Execute request and decode response
    func execute<T: Codable>(
        request: URLRequest,
        responseType: T.Type
    ) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ApiError.invalidResponse
            }

            // Handle HTTP errors
            if httpResponse.statusCode >= 400 {
                return try handleErrorResponse(data: data, statusCode: httpResponse.statusCode)
            }

            // Decode envelope
            let envelope = try JSONDecoder().decode(ApiEnvelope<T>.self, from: data)

            guard let data = envelope.data else {
                throw ApiError.missingData
            }

            return data

        } catch let error as ApiError {
            throw error
        } catch let error as DecodingError {
            throw ApiError.decodingError(error)
        } catch {
            throw ApiError.networkError(error)
        }
    }

    private func handleErrorResponse<T>(data: Data, statusCode: Int) throws -> T {
        // Try to decode error envelope (without data field)
        let message: String
        if let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data) {
            message = envelope.message
        } else {
            message = "Unknown error"
        }

        switch statusCode {
        case 401:
            throw ApiError.unauthorized
        case 404:
            throw ApiError.notFound(message)
        case 409:
            throw ApiError.conflict(message)
        case 422:
            throw ApiError.validationError(message)
        default:
            throw ApiError.httpError(statusCode: statusCode, message: message)
        }
    }
}
