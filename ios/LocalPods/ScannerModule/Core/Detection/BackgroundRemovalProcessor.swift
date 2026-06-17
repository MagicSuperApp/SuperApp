// LocalPods/ScannerModule/Core/Detection/BackgroundRemovalProcessor.swift
//
// Background removal using segmentation mask.
// Mirrors Android BackgroundRemovalProcessor.kt

import UIKit
import CoreImage

final class BackgroundRemovalProcessor {

    static func removeBackground(from image: UIImage, mask: UIImage) -> UIImage? {
        guard let inputCG = image.cgImage,
              let maskCG = mask.cgImage else { return nil }

        let width = inputCG.width
        let height = inputCG.height

        guard let inputData = inputCG.dataProvider?.data,
              let maskData = maskCG.dataProvider?.data else { return nil }

        let inputBytes = CFDataGetBytePtr(inputData)
        let maskBytes = CFDataGetBytePtr(maskData)

        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let totalBytes = height * bytesPerRow

        var outputBytes = [UInt8](repeating: 0, count: totalBytes)

        for y in 0..<height {
            for x in 0..<width {
                let offset = y * bytesPerRow + x * bytesPerPixel
                let maskOffset = y * maskCG.bytesPerRow + x

                let maskValue = maskBytes?[maskOffset] ?? 0
                let alpha = maskValue > 128 ? UInt8(255) : UInt8(0)

                outputBytes[offset] = inputBytes?[offset] ?? 0     // R
                outputBytes[offset + 1] = inputBytes?[offset + 1] ?? 0 // G
                outputBytes[offset + 2] = inputBytes?[offset + 2] ?? 0 // B
                outputBytes[offset + 3] = alpha                    // A
            }
        }

        guard let provider = CGDataProvider(data: Data(outputBytes) as CFData),
              let cgImage = CGImage(width: width, height: height,
                                   bitsPerComponent: 8, bitsPerPixel: 32,
                                   bytesPerRow: bytesPerRow,
                                   space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                                   provider: provider, decode: nil, shouldInterpolate: false,
                                   intent: .defaultIntent) else { return nil }

        return UIImage(cgImage: cgImage)
    }
}
