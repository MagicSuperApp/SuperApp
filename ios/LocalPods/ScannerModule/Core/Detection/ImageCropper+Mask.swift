// LocalPods/ScannerModule/Core/Detection/ImageCropper+Mask.swift
//
// Mask integration for ImageCropper.
// Applies segmentation mask to cropped images.

import UIKit
import CoreGraphics

extension ImageCropper {

    /// Apply mask to cropped bitmap - make background transparent.
    /// - Parameters:
    ///   - croppedImage: Cropped image from cropDetection
    ///   - maskCoeffs: 32 mask coefficients from YOLO
    ///   - protoMasks: 32 prototype masks [32][160*160]
    ///   - boxInCrop: Bounding box in crop space (normalized 0-1)
    ///   - threshold: Sigmoid threshold [0-1], default 0.5
    /// - Returns: UIImage with transparent background
    static func applyMaskToCrop(
        croppedImage: CGImage,
        maskCoeffs: [Float],
        protoMasks: [[Float]],
        boxInCrop: CGRect,
        threshold: Float = 0.5
    ) -> UIImage? {
        let cropWidth = croppedImage.width
        let cropHeight = croppedImage.height

        // 1. Reconstruct mask 160×160
        let reconstructedMask = SegmentationHelper.reconstructMask(coeffs: maskCoeffs, protos: protoMasks)

        // 2. Crop mask 160×160 to bounding box region
        let protoSize = 160
        let boxLeftPx = Int(boxInCrop.minX * CGFloat(protoSize)).clamped(to: 0...(protoSize - 1))
        let boxTopPx = Int(boxInCrop.minY * CGFloat(protoSize)).clamped(to: 0...(protoSize - 1))
        let boxRightPx = Int(boxInCrop.maxX * CGFloat(protoSize)).clamped(to: 0...protoSize)
        let boxBottomPx = Int(boxInCrop.maxY * CGFloat(protoSize)).clamped(to: 0...protoSize)

        let boxMaskW = max(1, boxRightPx - boxLeftPx)
        let boxMaskH = max(1, boxBottomPx - boxTopPx)

        var croppedProtoMask = [[Float]](repeating: [Float](repeating: 0, count: boxMaskW), count: boxMaskH)
        for row in 0..<boxMaskH {
            for col in 0..<boxMaskW {
                croppedProtoMask[row][col] = reconstructedMask[boxTopPx + row][boxLeftPx + col]
            }
        }

        // 3. Resize cropped mask to crop dimensions
        let scaledMask = SegmentationHelper.resizeMaskToBox(croppedProtoMask, width: cropWidth, height: cropHeight)

        // 4. Apply mask to image
        guard let context = CGContext(
            data: nil,
            width: cropWidth,
            height: cropHeight,
            bitsPerComponent: 8,
            bytesPerRow: cropWidth * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        context.draw(croppedImage, in: CGRect(x: 0, y: 0, width: cropWidth, height: cropHeight))

        guard let data = context.data else { return nil }
        let pixels = data.bindMemory(to: UInt8.self, capacity: cropWidth * cropHeight * 4)

        for y in 0..<cropHeight {
            for x in 0..<cropWidth {
                let maskValue = scaledMask[y][x]
                let alpha = maskValue > threshold ? UInt8(255) : UInt8(0)
                let offset = (y * cropWidth + x) * 4
                pixels[offset + 3] = alpha
            }
        }

        guard let outputImage = context.makeImage() else { return nil }
        return UIImage(cgImage: outputImage)
    }
}

private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        return Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
