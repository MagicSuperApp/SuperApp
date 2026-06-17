// LocalPods/ScannerModule/Core/Network/TreeMatchHandler.swift
//
// Handler for tree match confirmation UI

import Foundation
import UIKit
import SwiftUI

/// User decision when verify finds an existing tree candidate.
enum TreeMatchDecision {
    case useExisting
    case createNew
}

/// Tree match handler - shows confirmation UI when verify finds existing tree
final class TreeMatchHandler {

    /// Show tree match confirmation dialog.
    /// Returns `.useExisting` only after explicit user confirmation.
    @MainActor
    static func showConfirmation(
        originalTreeId: String,
        matchedTreeId: String,
        confidence: Double,
        verifyResponse: VerifyResponse,
        presentingViewController: UIViewController?
    ) async -> TreeMatchDecision {
        guard let presentingVC = presentingViewController else {
            print("[TreeMatchHandler] No presenting VC - keeping new tree")
            return .createNew
        }

        // Fetch matched tree image (optional)
        let matchedImage = await fetchTreeImage(
            treeId: matchedTreeId,
            verifyResponse: verifyResponse
        )

        // Parse location and time from bestMatch
        let location: (lat: Double, lng: Double)?
        let capturedAt: Date?

        if let bestMatch = verifyResponse.bestMatch {
            // Location from verify response (if available)
            location = nil // TODO: Add location to BestMatch model if needed

            // Time from capturedAt (epoch milliseconds)
            if let timestamp = bestMatch.capturedAt {
                capturedAt = Date(timeIntervalSince1970: Double(timestamp) / 1000.0)
            } else {
                capturedAt = nil
            }
        } else {
            location = nil
            capturedAt = nil
        }

        let matchData = TreeMatchData(
            originalTreeId: originalTreeId,
            matchedTreeId: matchedTreeId,
            confidence: confidence,
            matchedTreeImage: matchedImage,
            location: location,
            capturedAt: capturedAt,
            reason: verifyResponse.reason
        )

        // Show confirmation dialog
        return await withCheckedContinuation { continuation in
            let confirmationView = TreeMatchConfirmationView(
                matchData: matchData,
                onConfirm: {
                    continuation.resume(returning: .useExisting)
                },
                onReject: {
                    continuation.resume(returning: .createNew)
                }
            )

            let hostingController = UIHostingController(rootView: confirmationView)
            hostingController.modalPresentationStyle = .pageSheet

            // Configure sheet
            if let sheet = hostingController.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
            }

            presentingVC.present(hostingController, animated: true)
        }
    }

    /// Fetch tree image from server
    /// Uses candidateId from bestMatch to construct storage URL for the matched evidence image
    private static func fetchTreeImage(
        treeId: String,
        verifyResponse: VerifyResponse
    ) async -> UIImage? {
        let baseUrl = ScannerConfig.baseApiUrl
        let apiKey = ScannerConfig.apiKey

        // Get candidateId from bestMatch (this is the evidence image_id that was matched)
        guard let bestMatch = verifyResponse.bestMatch else {
            print("[TreeMatchHandler] No bestMatch in verify response")
            return nil
        }

        let candidateId = bestMatch.candidateId

        // Construct storage URL: {baseUrl}/storage/evidences/{tree_id}/{image_id}.jpg
        let imageUrlString = "\(baseUrl)/storage/evidences/\(treeId)/\(candidateId).jpg"

        guard let imageUrl = URL(string: imageUrlString) else {
            print("[TreeMatchHandler] Invalid image URL: \(imageUrlString)")
            return nil
        }

        do {
            print("[TreeMatchHandler] Fetching image from: \(imageUrlString)")

            // Create request with API key
            var request = URLRequest(url: imageUrl)
            request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
            request.timeoutInterval = 10

            // Download image
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("[TreeMatchHandler] Invalid HTTP response")
                return nil
            }

            if httpResponse.statusCode == 200, let image = UIImage(data: data) {
                print("[TreeMatchHandler] Successfully loaded tree image")
                return image
            } else {
                print("[TreeMatchHandler] Failed to load image - HTTP \(httpResponse.statusCode)")
                return nil
            }

        } catch {
            print("[TreeMatchHandler] Failed to fetch tree image: \(error)")
            return nil
        }
    }
}