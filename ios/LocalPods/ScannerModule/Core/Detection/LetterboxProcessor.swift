import Foundation
import CoreVideo
import CoreImage
import Accelerate

/// Swift equivalent of Android ImageProcessor.kt.
/// Handles letterboxing for YOLO input (640×640) and image preprocessing.
///
/// Letterbox = add padding to preserve aspect ratio, then resize.
/// Example: 1920×1080 image → letterbox to 640×640
///   ratio = 640/1920 = 0.333
///   scaledHeight = 1080 * 0.333 = 360
///   padTop = (640 - 360) / 2 = 140
///   Result: 640×360 content with 140px black padding top and bottom.
struct LetterboxInfo {
    let ratio: Float
    let padLeft: Float
    let padTop: Float
    let originalWidth: Int
    let originalHeight: Int
}

struct ProcessedImage {
    let bitmap: CGImage
    let originalWidth: Int
    let originalHeight: Int
    let rotationDegrees: Int
}

final class LetterboxProcessor {

    private let targetSize: Int

    init(targetSize: Int = ScannerConfig.modelInputSize) {
        self.targetSize = targetSize
    }

    // MARK: - Public API

    /// Process a CVPixelBuffer: apply orientation, create letterbox, return letterbox info.
    /// Returns: (letterboxImage, originalImage, letterboxInfo)
    func processPixelBuffer(_ pixelBuffer: CVPixelBuffer) -> (letterboxImage: CGImage, originalImage: CGImage?, letterbox: LetterboxInfo)? {
        let originalWidth = CVPixelBufferGetWidth(pixelBuffer)
        let originalHeight = CVPixelBufferGetHeight(pixelBuffer)

        // Get orientation metadata
        let orientation = getOrientation(from: pixelBuffer)
        let (rotatedWidth, rotatedHeight) = applyOrientation(originalWidth, originalHeight, orientation)

        // Create CIImage with orientation
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let oriented = ciImage.oriented(forExifOrientation: orientation)

        // Convert oriented image to CGImage (original full-size image)
        let context = CIContext(options: [.useSoftwareRenderer: true])
        let originalCGImage = context.createCGImage(oriented, from: oriented.extent)

        // Compute letterbox params
        let letterbox = computeLetterbox(rotatedWidth, rotatedHeight)

        // Scale + pad (letterbox)
        let letterboxed = letterboxImage(oriented, letterbox: letterbox)

        // Convert to CGImage: always rasterize the full targetSize×targetSize canvas.
        // Using `letterboxed.extent` alone can yield a minimal crop (e.g. 360×640), which later
        // confuses CGContext.draw during YOLO resize and has crashed on device.
        let renderRect = CGRect(x: 0, y: 0, width: CGFloat(targetSize), height: CGFloat(targetSize))
        guard let cgImage = context.createCGImage(letterboxed, from: renderRect) else {
            return nil
        }

        let info = LetterboxInfo(
            ratio: letterbox.ratio,
            padLeft: letterbox.padLeft,
            padTop: letterbox.padTop,
            originalWidth: rotatedWidth,
            originalHeight: rotatedHeight
        )

        return (cgImage, originalCGImage, info)
    }

    /// Process from CGImage (for captured photo frames).
    func processImage(_ image: CGImage) -> (image: CGImage, letterbox: LetterboxInfo)? {
        let originalWidth = image.width
        let originalHeight = image.height

        let letterbox = computeLetterbox(originalWidth, originalHeight)
        let letterboxed = letterboxImage(CIImage(cgImage: image), letterbox: letterbox)

        let renderRect = CGRect(x: 0, y: 0, width: CGFloat(targetSize), height: CGFloat(targetSize))
        let context = CIContext(options: [.useSoftwareRenderer: true])
        guard let cgImage = context.createCGImage(letterboxed, from: renderRect) else {
            return nil
        }

        let info = LetterboxInfo(
            ratio: letterbox.ratio,
            padLeft: letterbox.padLeft,
            padTop: letterbox.padTop,
            originalWidth: originalWidth,
            originalHeight: originalHeight
        )

        return (cgImage, info)
    }

    // MARK: - Letterbox Math

    /// Compute letterbox parameters for an image of given size → targetSize×targetSize.
    /// Returns: (ratio, padLeft, padTop) where letterbox = scale + add padding.
    func computeLetterbox(_ width: Int, _ height: Int) -> (ratio: Float, padLeft: Float, padTop: Float) {
        let scaleX = Float(targetSize) / Float(width)
        let scaleY = Float(targetSize) / Float(height)
        let ratio = min(scaleX, scaleY)

        let scaledWidth = Float(width) * ratio
        let scaledHeight = Float(height) * ratio

        let padLeft = (Float(targetSize) - scaledWidth) / 2.0
        let padTop  = (Float(targetSize) - scaledHeight) / 2.0

        return (ratio, padLeft, padTop)
    }

    // MARK: - Private

    private func letterboxImage(_ image: CIImage, letterbox: (ratio: Float, padLeft: Float, padTop: Float)) -> CIImage {
        // Scale to fit within targetSize preserving aspect ratio
        let scaleX = CGFloat(letterbox.ratio)
        let scaleY = CGFloat(letterbox.ratio)

        // Translate to center the image (with padding)
        let translateX = CGFloat(letterbox.padLeft)
        let translateY = CGFloat(letterbox.padTop)

        let scaled = image
            .transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
            .transformed(by: CGAffineTransform(translationX: translateX, y: translateY))

        return scaled
    }

    /// Infer EXIF orientation from camera device orientation.
    /// AVCaptureVideoDataOutput delivers .up orientation by default on front camera.
    private func getOrientation(from pixelBuffer: CVPixelBuffer) -> Int32 {
        // Most rear camera: kCVImageBuffer MitchellFixup orientation
        // For portrait mode: 6
        return 6 // Normalize to .right for portrait
    }

    private func applyOrientation(_ width: Int, _ height: Int, _ orientation: Int32) -> (Int, Int) {
        let isRotated = orientation == 6 || orientation == 8
        return isRotated ? (height, width) : (width, height)
    }
}
