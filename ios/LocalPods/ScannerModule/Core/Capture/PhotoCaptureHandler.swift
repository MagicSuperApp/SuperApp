import Foundation
import UIKit

/// Handles high-res photo capture when a sector is triggered.
/// Calls into CameraSessionManager.capturePhoto() and saves to disk.
final class PhotoCaptureHandler {

    // MARK: - Callbacks

    var onPhotoSaved: ((String, Int) -> Void)?   // (filePath, sectorIndex)
    var onCaptureError: ((Error) -> Void)?

    // MARK: - Properties

    private let fileManager = FileManager.default
    private var pendingSectors: [Int] = []
    private let captureQueue = DispatchQueue(label: "com.aladin.photocapture", qos: .userInitiated)

    // MARK: - Public API

    /// Request capture for a specific sector.
    func requestCapture(forSector sectorIndex: Int) {
        captureQueue.async { [weak self] in
            self?.pendingSectors.append(sectorIndex)
        }
    }

    /// Called when CameraSessionManager captures a photo.
    func handlePhotoData(_ imageData: Data, sectorIndex: Int) {
        captureQueue.async { [weak self] in
            guard let self = self else { return }
            do {
                let filePath = try self.savePhoto(imageData, sectorIndex: sectorIndex)
                print("[PhotoCaptureHandler] 📸 Saved: sector=\(sectorIndex), path=\(filePath)")
                DispatchQueue.main.async {
                    self.onPhotoSaved?(filePath, sectorIndex)
                }
            } catch {
                print("[PhotoCaptureHandler] ❌ Save failed: \(error)")
                DispatchQueue.main.async {
                    self.onCaptureError?(error)
                }
            }
        }
    }

    // MARK: - Private

    private func savePhoto(_ imageData: Data, sectorIndex: Int) throws -> String {
        let docsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let scannerDir = docsDir.appendingPathComponent("ScannerCaptures", isDirectory: true)

        if !fileManager.fileExists(atPath: scannerDir.path) {
            try fileManager.createDirectory(at: scannerDir, withIntermediateDirectories: true)
        }

        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let filename = "sector_\(sectorIndex)_\(timestamp).jpg"
        let filePath = scannerDir.appendingPathComponent(filename)

        try imageData.write(to: filePath)
        return filePath.path
    }

    /// Get all captured photo paths.
    func getCapturedPhotos() -> [String] {
        let docsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let scannerDir = docsDir.appendingPathComponent("ScannerCaptures", isDirectory: true)

        guard let files = try? fileManager.contentsOfDirectory(atPath: scannerDir.path) else {
            return []
        }

        return files
            .filter { $0.hasSuffix(".jpg") }
            .map { scannerDir.appendingPathComponent($0).path }
            .sorted()
    }

    /// Clear all captured photos.
    func clearCapturedPhotos() {
        let docsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let scannerDir = docsDir.appendingPathComponent("ScannerCaptures", isDirectory: true)

        try? fileManager.removeItem(at: scannerDir)
        print("[PhotoCaptureHandler] 🗑️ Cleared all captured photos")
    }
}