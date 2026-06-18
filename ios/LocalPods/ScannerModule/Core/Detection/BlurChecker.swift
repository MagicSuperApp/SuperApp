import Foundation
import Accelerate
import CoreVideo

/// Blur detection using Laplacian Variance.
/// Pure pixel math — no ML model needed. Identical algorithm to Android BlurChecker.kt.
///
/// Algorithm:
/// 1. Convert CVPixelBuffer → grayscale Float32 array
/// 2. Apply Laplacian kernel 3x3:
///      [ 0  1  0 ]
///      [ 1 -4  1 ]
///      [ 0  1  0 ]
/// 3. Compute variance of Laplacian response
///    → High variance = sharp image
///    → Low variance = blurry image
///
/// Threshold: 100.0 (configurable, matches Android Config.BLUR_VARIANCE_THRESHOLD)
final class BlurChecker {

    // MARK: - Public API

    /// Calculate Laplacian variance of a camera frame.
    /// - Parameters:
    ///   - pixelBuffer: Raw camera frame from AVCaptureVideoDataOutput
    /// - Returns: Laplacian variance. Higher = sharper.
    func calculateLaplacianVariance(_ pixelBuffer: CVPixelBuffer) -> Double {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        guard width >= 3, height >= 3 else { return 0.0 }

        // Convert to grayscale Float32 array
        guard let grayPixels = extractGrayscale(from: pixelBuffer) else {
            return 0.0
        }

        // Compute Laplacian: center * -4 + top + bottom + left + right
        let laplacianSize = (width - 2) * (height - 2)
        var laplacian = [Float](repeating: 0, count: laplacianSize)
        var idx = 0

        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let center = grayPixels[y * width + x]
                let top    = grayPixels[(y - 1) * width + x]
                let bottom = grayPixels[(y + 1) * width + x]
                let left   = grayPixels[y * width + (x - 1)]
                let right  = grayPixels[y * width + (x + 1)]

                laplacian[idx] = center * -4 + top + bottom + left + right
                idx += 1
            }
        }

        // Compute mean and variance using Accelerate vDSP
        var mean: Float = 0
        var variance: Float = 0

        // Mean
        vDSP_meanv(laplacian, 1, &mean, vDSP_Length(laplacianSize))

        // Variance = E[(x - mean)^2]
        var sumSq: Float = 0
        vDSP_svesq(laplacian, 1, &sumSq, vDSP_Length(laplacianSize))
        variance = (sumSq / Float(laplacianSize)) - (mean * mean)

        return Double(variance)
    }

    /// Quick blur check — returns true if image is blurry.
    /// - Parameters:
    ///   - pixelBuffer: Camera frame
    ///   - threshold: Laplacian variance threshold (default 100.0, matches Android)
    /// - Returns: true if blurry, false if sharp
    func isBlurry(_ pixelBuffer: CVPixelBuffer, threshold: Double = ScannerConfig.blurVarianceThreshold) -> Bool {
        let variance = calculateLaplacianVariance(pixelBuffer)
        let result = variance < threshold
        return result
    }

    /// Relative sharpness score (0.0 → 1.0+).
    /// 1.0 = exactly at threshold. >1.0 = sharp, <1.0 = blurry.
    func sharpnessScore(_ pixelBuffer: CVPixelBuffer) -> Double {
        let variance = calculateLaplacianVariance(pixelBuffer)
        return variance / ScannerConfig.blurVarianceThreshold
    }

    // MARK: - Private Helpers

    /// Extract grayscale pixel data from CVPixelBuffer as Float32 array.
    private func extractGrayscale(from pixelBuffer: CVPixelBuffer) -> [Float]? {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let totalPixels = width * height

        var grayPixels = [Float](repeating: 0, count: totalPixels)

        switch pixelFormat {
        case kCVPixelFormatType_32BGRA:
            guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }

            // BT.601 grayscale: Y = 0.299R + 0.587G + 0.114B
            // Fast approximation: (R*77 + G*150 + B*29) >> 8
            let buffer = baseAddress.assumingMemoryBound(to: UInt8.self)
            for i in 0..<totalPixels {
                let offset = i * 4
                let b = Float(buffer[offset])
                let g = Float(buffer[offset + 1])
                let r = Float(buffer[offset + 2])
                // Grayscale: ITU-R BT.601 coefficients
                grayPixels[i] = 0.299 * r + 0.587 * g + 0.114 * b
            }

        case kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
             kCVPixelFormatType_420YpCbCr8BiPlanarFullRange:
            // YUV NV12/NV21 — Y plane is at baseAddress
            guard let yBaseAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }
            let yBuffer = yBaseAddress.assumingMemoryBound(to: UInt8.self)
            for i in 0..<totalPixels {
                grayPixels[i] = Float(yBuffer[i])
            }

        default:
            // Fallback: try to convert with CIImage
            return nil
        }

        return grayPixels
    }
}