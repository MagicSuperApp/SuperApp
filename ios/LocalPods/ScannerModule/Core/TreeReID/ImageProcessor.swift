import UIKit

/// Image processor for TreeReID - compress images before upload.
///
/// - Resize to max 1280px (preserve aspect ratio)
/// - Compress to JPEG with quality 0.85
/// - Handle EXIF rotation
final class ImageProcessor {

    // MARK: - Types

    enum ImageProcessorError: Error {
        case invalidImageData
        case resizeFailed
        case compressionFailed
    }

    struct ProcessedImage {
        let data: Data
        let width: Int
        let height: Int
        let originalWidth: Int
        let originalHeight: Int
    }

    // MARK: - Public API

    /// Compress image data to TreeReID specs (≤1280px, JPEG 0.85).
    ///
    /// - Parameters:
    ///   - data: Original image data (JPEG, PNG, HEIC, etc.)
    ///   - maxDimension: Maximum dimension in pixels (default: 1280)
    ///   - quality: JPEG compression quality (default: 0.85)
    /// - Returns: ProcessedImage with compressed data
    func compressImage(
        _ data: Data,
        maxDimension: Int = TreeReIDConfig.imageMaxDimension,
        quality: CGFloat = TreeReIDConfig.imageQuality
    ) -> Result<ProcessedImage, ImageProcessorError> {

        // Load image — UIImage(data:) returns nil for invalid/corrupted data
        guard let image = UIImage(data: data) else {
            return .failure(.invalidImageData)
        }

        let originalWidth = Int(image.size.width)
        let originalHeight = Int(image.size.height)

        // Handle EXIF orientation — wrapped in autoreleasepool for memory safety
        var orientedImage: UIImage = image
        autoreleasepool {
            orientedImage = fixOrientation(image)
        }

        // Resize if needed
        let resizedImage: UIImage
        if max(originalWidth, originalHeight) > maxDimension {
            guard let resized = resize(orientedImage, maxDimension: maxDimension) else {
                return .failure(.resizeFailed)
            }
            resizedImage = resized
        } else {
            resizedImage = orientedImage
        }

        // Compress to JPEG
        guard let compressedData = resizedImage.jpegData(compressionQuality: quality) else {
            return .failure(.compressionFailed)
        }

        print("[ImageProcessor] ✅ Compressed: \(originalWidth)x\(originalHeight) → \(Int(resizedImage.size.width))x\(Int(resizedImage.size.height)), \(compressedData.count / 1024)KB")

        return .success(ProcessedImage(
            data: compressedData,
            width: Int(resizedImage.size.width),
            height: Int(resizedImage.size.height),
            originalWidth: originalWidth,
            originalHeight: originalHeight
        ))
    }

    /// Compress and save to temp file.
    ///
    /// - Parameters:
    ///   - data: Original image data
    ///   - filename: Output filename (without extension)
    /// - Returns: URL to temp file, or nil on failure
    func compressAndSave(
        _ data: Data,
        filename: String = UUID().uuidString
    ) -> URL? {
        let result = compressImage(data)

        switch result {
        case .success(let processed):
            let tempDir = FileManager.default.temporaryDirectory
            let fileURL = tempDir.appendingPathComponent("\(filename).jpg")

            do {
                try processed.data.write(to: fileURL)
                print("[ImageProcessor] 💾 Saved to: \(fileURL.lastPathComponent)")
                return fileURL
            } catch {
                print("[ImageProcessor] ❌ Failed to write: \(error)")
                return nil
            }

        case .failure(let error):
            print("[ImageProcessor] ❌ Compression failed: \(error)")
            return nil
        }
    }

    /// Compress multiple images.
    ///
    /// - Parameters:
    ///   - images: Array of image data
    ///   - maxDimension: Maximum dimension
    ///   - quality: JPEG quality
    /// - Returns: Array of processed images in same order
    func compressImages(
        _ images: [Data],
        maxDimension: Int = TreeReIDConfig.imageMaxDimension,
        quality: CGFloat = TreeReIDConfig.imageQuality
    ) -> [Result<ProcessedImage, ImageProcessorError>] {

        return images.map { compressImage($0, maxDimension: maxDimension, quality: quality) }
    }

    // MARK: - Private Helpers

    /// Fix image orientation based on EXIF data.
    private func fixOrientation(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }

        var normalizedImage: UIImage?
        autoreleasepool {
            UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
            image.draw(in: CGRect(origin: .zero, size: image.size))
            normalizedImage = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
        }

        return normalizedImage ?? image
    }

    /// Resize image to fit within maxDimension while preserving aspect ratio.
    private func resize(_ image: UIImage, maxDimension: Int) -> UIImage? {
        let size = image.size
        let maxSide = max(size.width, size.height)

        guard maxSide > CGFloat(maxDimension) else { return image }

        let scale = CGFloat(maxDimension) / maxSide
        let newSize = CGSize(
            width: size.width * scale,
            height: size.height * scale
        )

        var resized: UIImage?
        autoreleasepool {
            UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
            image.draw(in: CGRect(origin: .zero, size: newSize))
            resized = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
        }

        return resized
    }
}

// MARK: - File Manager Extension

extension ImageProcessor {

    /// Save processed image data to app's temp directory.
    static func saveToTemp(_ data: Data, suffix: String = "jpg") -> URL? {
        let filename = "\(UUID().uuidString).\(suffix)"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        do {
            try data.write(to: tempURL)
            return tempURL
        } catch {
            print("[ImageProcessor] ❌ Failed to save temp file: \(error)")
            return nil
        }
    }

    /// Clean up temp files from previous sessions.
    static func cleanupTempFiles(olderThan interval: TimeInterval = 3600) {
        let tempDir = FileManager.default.temporaryDirectory

        guard let files = try? FileManager.default.contentsOfDirectory(
            at: tempDir,
            includingPropertiesForKeys: [.creationDateKey]
        ) else { return }

        let cutoff = Date().addingTimeInterval(-interval)

        for file in files {
            guard file.pathExtension == "jpg" || file.pathExtension == "jpeg" else { continue }

            if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
               let created = attrs[.creationDate] as? Date,
               created < cutoff {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }
}