import Foundation
import CoreGraphics
import Accelerate

// MARK: - SegmentationHelper

/// Helper class to reconstruct segmentation masks from YOLOv2.6 Seg model outputs.
///
/// Model output:
///   Output[0]: [1, 300, 38] → 300 detections × [x1, y1, x2, y2, conf, classId, 32 coeffs]
///   Output[1]: [1, 160, 160, 32] → 32 prototype masks, each 160×160
///
/// Mask reconstruction:
///   mask[y, x] = sigmoid( Σ( coeff[i] × proto_mask[i, y, x] ) )  for i = 0..31
///
/// Mirrors Android SegmentationHelper.kt exactly.
enum SegmentationHelper {

    // MARK: - Constants

    /// Prototype mask dimension (160×160).
    static let protoSize = 160

    /// Number of prototype masks (mask channels).
    static let numProtos = 32

    // MARK: - Mask Reconstruction

    /// Reconstruct a 2D mask from coefficients and prototype masks.
    ///
    /// - Parameters:
    ///   - coeffs: 32 mask coefficients from output[0][i][6:38]
    ///   - protos: 32 prototype masks [32][160][160] from output[1]
    /// - Returns: 2D FloatArray [160][160] with sigmoid values [0, 1]
    ///
    /// Formula: mask[y, x] = sigmoid( Σ( coeffs[i] × protos[i][y][x] ) )
    static func reconstructMask(coeffs: [Float], protos: [[Float]]) -> [[Float]] {
        let height = protoSize
        let width = protoSize

        // Validate inputs
        guard coeffs.count >= numProtos else {
            print("[SegmentationHelper] ❌ Invalid coeffs count: \(coeffs.count), expected \(numProtos)")
            return [[Float]](repeating: [Float](repeating: 0, count: width), count: height)
        }
        guard protos.count >= numProtos else {
            print("[SegmentationHelper] ❌ Invalid protos count: \(protos.count), expected \(numProtos)")
            return [[Float]](repeating: [Float](repeating: 0, count: width), count: height)
        }

        // Initialize empty mask
        var mask = [[Float]](repeating: [Float](repeating: 0, count: width), count: height)

        // Weighted sum: Σ( coeff[i] × proto[i] )
        for y in 0..<height {
            for x in 0..<width {
                var sum: Float = 0
                for i in 0..<numProtos {
                    // protos layout: protos[channel][height][width]
                    guard i < protos.count else { continue }
                    let protoChannel = protos[i]
                    let idx = y * width + x
                    guard idx < protoChannel.count else {
                        print("[SegmentationHelper] ❌ Proto channel[\(i)] size mismatch: \(protoChannel.count), expected \(width * height)")
                        continue
                    }
                    sum += coeffs[i] * protoChannel[idx]
                }
                // Sigmoid activation
                mask[y][x] = sigmoid(sum)
            }
        }

        #if DEBUG
        let minVal = mask.flatMap { $0 }.min() ?? 0
        let maxVal = mask.flatMap { $0 }.max() ?? 0
        print("[SegmentationHelper] ✅ Mask reconstructed: \(width)×\(height), range=[\(minVal), \(maxVal)]")
        #endif

        return mask
    }

    /// Reconstruct mask with bounding box constraint in proto space (KEY FIX from Python).
    /// This improves mask quality by only computing sigmoid within the detection box region.
    /// Pixels outside the box are set to 0 (will be removed as background).
    ///
    /// - Parameters:
    ///   - coeffs: 32 mask coefficients
    ///   - protos: 32 prototype masks [32][160][160]
    ///   - boxNormalized: Bounding box in normalized coords [x1, y1, x2, y2] in range [0-1]
    ///   - modelSize: Model input size (default 640)
    /// - Returns: Mask [160][160] with sigmoid values [0, 1] inside box, 0 outside
    static func reconstructMaskWithBoxConstraint(
        coeffs: [Float],
        protos: [[Float]],
        boxNormalized: [Float],
        modelSize: Int = ScannerConfig.modelInputSize
    ) -> [[Float]] {
        let height = protoSize
        let width = protoSize

        guard coeffs.count >= numProtos, protos.count >= numProtos else {
            return [[Float]](repeating: [Float](repeating: 0, count: width), count: height)
        }

        // Convert normalized box [0-1] to model space [0-640]
        let x1_model = boxNormalized[0] * Float(modelSize)
        let y1_model = boxNormalized[1] * Float(modelSize)
        let x2_model = boxNormalized[2] * Float(modelSize)
        let y2_model = boxNormalized[3] * Float(modelSize)

        // Scale box from model space (640) to proto space (160)
        let scale = Float(protoSize) / Float(modelSize)
        let px1 = Int(max(0, min(Float(width), x1_model * scale)))
        let py1 = Int(max(0, min(Float(height), y1_model * scale)))
        let px2 = Int(max(0, min(Float(width), x2_model * scale)))
        let py2 = Int(max(0, min(Float(height), y2_model * scale)))

        // Initialize mask (all zeros - background will be removed)
        var mask = [[Float]](repeating: [Float](repeating: 0, count: width), count: height)

        // Compute mask ONLY within bounding box region in proto space
        // This matches Python: mask_cropped[py1:py2, px1:px2] = mask_low[py1:py2, px1:px2]
        for y in py1..<py2 {
            for x in px1..<px2 {
                var sum: Float = 0
                for i in 0..<numProtos {
                    guard i < protos.count else { continue }
                    let protoChannel = protos[i]
                    let idx = y * width + x
                    guard idx < protoChannel.count else { continue }
                    sum += coeffs[i] * protoChannel[idx]
                }
                // Apply sigmoid only within box region
                mask[y][x] = sigmoid(sum)
            }
        }

        #if DEBUG
        let boxArea = (px2 - px1) * (py2 - py1)
        print("[SegmentationHelper] ✅ Mask reconstructed with box constraint: proto_box=[\(px1),\(py1),\(px2),\(py2)], area=\(boxArea)")
        #endif

        return mask
    }

    /// Reconstruct mask from interleaved proto data (flat array [32 × 160 × 160]).
    /// Use this when protos come as a flat Float array from TFLite output.
    static func reconstructMask(coeffs: [Float], protoFlat: Data) -> [[Float]] {
        let height = protoSize
        let width = protoSize

        let floatCount = protoFlat.count / MemoryLayout<Float>.size
        guard let floatPtr = protoFlat.withUnsafeBytes({ $0.bindMemory(to: Float.self).baseAddress }) else {
            return [[Float]](repeating: [Float](repeating: 0, count: width), count: height)
        }

        var mask = [[Float]](repeating: [Float](repeating: 0, count: width), count: height)

        for y in 0..<height {
            for x in 0..<width {
                var sum: Float = 0
                for i in 0..<numProtos {
                    // protoFlat layout: [ch0_h0_w0, ch0_h0_w1, ..., ch0_h160_w159, ch1_h0_w0, ...]
                    let offset = i * protoSize * protoSize + y * protoSize + x
                    if offset < floatCount {
                        sum += coeffs[i] * floatPtr[offset]
                    }
                }
                mask[y][x] = sigmoid(sum)
            }
        }

        #if DEBUG
        let flat = mask.flatMap { $0 }
        let minVal = flat.min() ?? 0
        let maxVal = flat.max() ?? 0
        print("[SegmentationHelper] ✅ Mask reconstructed (flat): \(width)×\(height), range=[\(minVal), \(maxVal)]")
        #endif

        return mask
    }

    // MARK: - Mask Resizing

    /// Resize mask from 160×160 to the target dimensions using bilinear interpolation.
    ///
    /// - Parameters:
    ///   - mask: Source mask 160×160
    ///   - width: Target width (pixels)
    ///   - height: Target height (pixels)
    /// - Returns: Resized mask [height][width]
    static func resizeMaskToBox(_ mask: [[Float]], width: Int, height: Int) -> [[Float]] {
        guard width > 0, height > 0 else { return mask }

        let srcHeight = mask.count
        let srcWidth = mask.isEmpty ? 0 : mask[0].count
        guard srcWidth > 0, srcHeight > 0 else { return mask }

        var resized = [[Float]](repeating: [Float](repeating: 0, count: width), count: height)

        for y in 0..<height {
            for x in 0..<width {
                // Map to source coordinates
                let srcX = Float(x) / Float(width) * Float(srcWidth - 1)
                let srcY = Float(y) / Float(height) * Float(srcHeight - 1)

                let x0 = max(0, min(srcWidth - 2, Int(srcX)))
                let y0 = max(0, min(srcHeight - 2, Int(srcY)))
                let x1 = x0 + 1
                let y1 = y0 + 1

                let xFrac = srcX - Float(x0)
                let yFrac = srcY - Float(y0)

                // Bilinear interpolation
                let v00 = mask[y0][x0]
                let v01 = mask[y0][x1]
                let v10 = mask[y1][x0]
                let v11 = mask[y1][x1]

                let value = v00 * (1 - xFrac) * (1 - yFrac)
                          + v01 * xFrac       * (1 - yFrac)
                          + v10 * (1 - xFrac) * yFrac
                          + v11 * xFrac       * yFrac

                resized[y][x] = value
            }
        }

        #if DEBUG
        print("[SegmentationHelper] 📐 Mask resized: \(srcWidth)×\(srcHeight) → \(width)×\(height)")
        #endif

        return resized
    }

    // MARK: - Mask Application

    /// Apply a mask to a cropped image — background becomes black/transparent.
    ///
    /// - Parameters:
    ///   - image: Source image (from crop)
    ///   - mask: Resized mask matching image dimensions, values [0-1]
    ///   - threshold: Sigmoid threshold [0-1]. Default 0.5.
    ///     pixels with mask > threshold → kept; else → transparent/black.
    /// - Returns: New CGImage with masked background.
    static func applyMaskToBitmap(_ image: CGImage, mask: [[Float]], threshold: Float = ScannerConfig.maskThreshold) -> CGImage? {
        let width = image.width
        let height = image.height

        let maskHeight = mask.count
        let maskWidth = mask.isEmpty ? 0 : mask[0].count

        guard maskWidth > 0, maskHeight > 0 else { return image }

        // Read source pixels
        guard let sourceData = image.dataProvider?.data,
              let sourcePtr = CFDataGetBytePtr(sourceData) else {
            print("[SegmentationHelper] ❌ Failed to get image data")
            return nil
        }

        let bytesPerPixel = image.bitsPerPixel / 8
        let bytesPerRow = image.bytesPerRow

        // Create output buffer (ARGB)
        var outputPixels = [UInt8](repeating: 0, count: width * height * 4)

        for y in 0..<height {
            for x in 0..<width {
                let pixelOffset = y * bytesPerRow + x * bytesPerPixel

                // Map to mask coordinates
                let maskX = max(0, min(maskWidth - 1, x * maskWidth / max(width, 1)))
                let maskY = max(0, min(maskHeight - 1, y * maskHeight / max(height, 1)))

                let maskValue = mask[maskY][maskX]

                let outOffset = (y * width + x) * 4
                if maskValue > threshold {
                    // Keep the original pixel (RGBA)
                    outputPixels[outOffset + 0] = sourcePtr[pixelOffset + 0]
                    outputPixels[outOffset + 1] = sourcePtr[pixelOffset + 1]
                    outputPixels[outOffset + 2] = sourcePtr[pixelOffset + 2]
                    outputPixels[outOffset + 3] = 255 // Force opaque
                } else {
                    // Solid black background (to match Python script and avoid JPEG alpha-to-white issue)
                    outputPixels[outOffset + 0] = 0
                    outputPixels[outOffset + 1] = 0
                    outputPixels[outOffset + 2] = 0
                    outputPixels[outOffset + 3] = 255
                }
            }
        }

        return createCGImage(from: outputPixels, width: width, height: height)
    }

    /// Apply mask with feathered (soft) edges.
    ///
    /// - Parameters:
    ///   - image: Source cropped image
    ///   - mask: Resized mask matching image dimensions
    ///   - innerThreshold: Inner threshold (vùng chắc chắn giữ lại, default 0.6)
    ///   - outerThreshold: Outer threshold (vùng chắc chắn bỏ, default 0.3)
    /// - Returns: CGImage with feathered mask edges.
    static func applyMaskWithFeather(
        _ image: CGImage,
        mask: [[Float]],
        innerThreshold: Float = ScannerConfig.maskInnerThreshold,
        outerThreshold: Float = ScannerConfig.maskOuterThreshold
    ) -> CGImage? {
        let width = image.width
        let height = image.height

        let maskHeight = mask.count
        let maskWidth = mask.isEmpty ? 0 : mask[0].count

        guard maskWidth > 0, maskHeight > 0 else { return image }

        guard let sourceData = image.dataProvider?.data,
              let sourcePtr = CFDataGetBytePtr(sourceData) else {
            return nil
        }

        let bytesPerPixel = image.bitsPerPixel / 8
        let bytesPerRow = image.bytesPerRow

        var outputPixels = [UInt8](repeating: 0, count: width * height * 4)

        for y in 0..<height {
            for x in 0..<width {
                let pixelOffset = y * bytesPerRow + x * bytesPerPixel

                let maskX = max(0, min(maskWidth - 1, x * maskWidth / max(width, 1)))
                let maskY = max(0, min(maskHeight - 1, y * maskHeight / max(height, 1)))
                let maskValue = mask[maskY][maskX]

                let r = sourcePtr[pixelOffset + 0]
                let g = sourcePtr[pixelOffset + 1]
                let b = sourcePtr[pixelOffset + 2]
                let a = sourcePtr[pixelOffset + 3]

                let outOffset = (y * width + x) * 4

                switch maskValue {
                case _ where maskValue >= innerThreshold:
                    // Inner: keep full pixel
                    outputPixels[outOffset + 0] = r
                    outputPixels[outOffset + 1] = g
                    outputPixels[outOffset + 2] = b
                    outputPixels[outOffset + 3] = a

                case _ where maskValue <= outerThreshold:
                    // Outer: Solid Black (Opaque)
                    // We must set alpha = 255, otherwise JPEG compression evaluates alpha=0 as pure White!
                    outputPixels[outOffset + 0] = 0   // R
                    outputPixels[outOffset + 1] = 0   // G
                    outputPixels[outOffset + 2] = 0   // B
                    outputPixels[outOffset + 3] = 255 // A

                default:
                    // Transition zone: blend alpha
                    let alpha = (maskValue - outerThreshold) / (innerThreshold - outerThreshold)
                    let clampedAlpha = max(0, min(1, alpha))
                    let newAlpha = UInt8(clampedAlpha * 255)

                    outputPixels[outOffset + 0] = r
                    outputPixels[outOffset + 1] = g
                    outputPixels[outOffset + 2] = b
                    outputPixels[outOffset + 3] = newAlpha
                }
            }
        }

        #if DEBUG
        print("[SegmentationHelper] 🎭 Feathered mask applied: \(width)×\(height)")
        #endif

        return createCGImage(from: outputPixels, width: width, height: height)
    }

    // MARK: - Mask Validation

    /// Check if a mask is valid (not all-zero and no NaN/Inf values).
    static func isValidMask(_ mask: [[Float]]) -> Bool {
        guard !mask.isEmpty, !mask[0].isEmpty else { return false }

        var sum: Float = 0
        var count = 0

        for row in mask {
            for v in row {
                if v.isNaN || v.isInfinite { return false }
                sum += v
                count += 1
            }
        }

        // Mean must be > 0.01 for a valid mask
        return count > 0 && (sum / Float(count)) > 0.01
    }

    // MARK: - Debug

    /// Print mask statistics for debugging.
    static func debugMask(_ mask: [[Float]]) {
        guard !mask.isEmpty else {
            print("[SegmentationHelper] 📊 Mask: empty")
            return
        }

        let flat = mask.flatMap { $0 }
        let minVal = flat.min() ?? 0
        let maxVal = flat.max() ?? 0
        let sum = flat.reduce(0, +)
        let mean = sum / Float(flat.count)

        print("[SegmentationHelper] 📊 Mask stats: \(mask[0].count)×\(mask.count), min=\(minVal), max=\(maxVal), mean=\(mean)")
    }

    // MARK: - Private Helpers

    /// Sigmoid activation with numerical stability.
    /// Mirrors Android sigmoid() function.
    private static func sigmoid(_ x: Float) -> Float {
        if x >= 0 {
            let e = exp(-Double(x))
            return Float(1.0 / (1.0 + e))
        } else {
            let e = exp(Double(x))
            return Float(e / (1.0 + e))
        }
    }

    /// Create a CGImage from raw pixel data.
    private static func createCGImage(from pixels: [UInt8], width: Int, height: Int) -> CGImage? {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

        guard let provider = CGDataProvider(data: Data(pixels) as CFData) else {
            return nil
        }

        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo,
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }
}
