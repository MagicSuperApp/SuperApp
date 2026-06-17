// LocalPods/ScannerModule/Core/Network/UploadManager.swift
//
// Singleton managing upload state with UserDefaults persistence.
// Mirrors Android UploadManager.kt - survives app termination.

import Foundation

final class UploadManager {
    static let shared = UploadManager()

    enum UploadState: Equatable {
        case idle
        case running
        case success(count: Int)
        case failed(error: String)
        case partialSuccess(success: Int, failed: Int)
    }

    private let defaults = UserDefaults.standard
    private let stateKey = "upload_state"
    private let successCountKey = "upload_success_count"
    private let failedCountKey = "upload_failed_count"
    private let errorKey = "upload_error"

    private(set) var state: UploadState = .idle {
        didSet {
            persistState()
            NotificationCenter.default.post(name: .uploadStateChanged, object: state)
        }
    }

    private init() {
        self.state = loadState()
    }

    func setState(_ newState: UploadState) {
        state = newState
    }

    private func loadState() -> UploadState {
        guard let stateStr = defaults.string(forKey: stateKey) else { return .idle }
        switch stateStr {
        case "running": return .running
        case "success":
            let count = defaults.integer(forKey: successCountKey)
            return .success(count: count)
        case "failed":
            let error = defaults.string(forKey: errorKey) ?? "Unknown error"
            return .failed(error: error)
        case "partial":
            let success = defaults.integer(forKey: successCountKey)
            let failed = defaults.integer(forKey: failedCountKey)
            return .partialSuccess(success: success, failed: failed)
        default: return .idle
        }
    }

    private func persistState() {
        switch state {
        case .idle:
            defaults.set("idle", forKey: stateKey)
        case .running:
            defaults.set("running", forKey: stateKey)
        case .success(let count):
            defaults.set("success", forKey: stateKey)
            defaults.set(count, forKey: successCountKey)
        case .failed(let error):
            defaults.set("failed", forKey: stateKey)
            defaults.set(error, forKey: errorKey)
        case .partialSuccess(let success, let failed):
            defaults.set("partial", forKey: stateKey)
            defaults.set(success, forKey: successCountKey)
            defaults.set(failed, forKey: failedCountKey)
        }
    }
}

extension Notification.Name {
    static let uploadStateChanged = Notification.Name("uploadStateChanged")
}
