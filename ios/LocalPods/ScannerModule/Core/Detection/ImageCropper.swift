import Foundation
import CoreGraphics

// MARK: - CropResult

/// Result of cropping a detection from an image.
/// Contains the cropped image and bounding box coordinates.
struct CropResult {
    /// The cropped image.
    let croppedImage: CGImage
    /// The original full-size image (before letterbox/crop).
    let originalImage: CGImage?
    /// Bounding box relative to the cropped image in pixels: [x_offset, y_offset, width, height].
    let relativeBoxCoordinates: [Float]
    /// Bounding box normalized [0-1] relative to the cropped image: [left, top, right, bottom].
    let normalizedBoxCoordinates: [Float]
    /// Padding ratio used for cropping.
    let paddingRatio: Float
    /// The original segmentation detection (if available) containing mask coefficients.
    let segmentationDetection: SegmentationDetection?

    init(croppedImage: CGImage,
         originalImage: CGImage? = nil,
         relativeBoxCoordinates: [Float],
         normalizedBoxCoordinates: [Float],
         paddingRatio: Float,
         segmentationDetection: SegmentationDetection? = nil) {
        self.croppedImage = croppedImage
        self.originalImage = originalImage
        self.relativeBoxCoordinates = relativeBoxCoordinates
        self.normalizedBoxCoordinates = normalizedBoxCoordinates
        self.paddingRatio = paddingRatio
        self.segmentationDetection = segmentationDetection
    }
}

// MARK: - ImageCropper

/// High-quality image cropper for tree detection.
/// Handles cropping from bounding boxes, applying padding, and mask overlay.
/// Mirrors Android ImageCropper.kt exactly.
enum ImageCropper {

    // MARK: - Constants

    /// Default padding as a fraction of bounding box dimensions (30%).
    private static let defaultPaddingPercent: Float = 0.30
    /// Minimum padding in pixels.
    private static let minPadding: Int = 30
    /// Maximum padding in pixels.
    private static let maxPadding: Int = 120

    // MARK: - Crop Detection (Single)

    /// Crop a single detection from an image with padding.
    /// - Parameters:
    ///   - image: Source image
    ///   - rect: Bounding box in image coordinates
    ///   - padding: Padding ratio (default 0.30 = 30%)
    /// - Returns: CropResult with cropped image and coordinates, or nil if crop fails.
    static func cropDetection(image: CGImage, rect: CGRect, padding: Float = defaultPaddingPercent) -> CropResult? {
        return cropWithPadding(image: image, rect: rect, padding: padding)
    }

    /// Internal crop with explicit padding.
    private static func cropWithPadding(image: CGImage, rect: CGRect, padding: Float) -> CropResult? {
        let imageWidth = image.width
        let imageHeight = image.height

        // Clamp bounding box to image bounds
        let boxLeft = max(0, min(imageWidth, Int(rect.minX)))
        let boxTop  = max(0, min(imageHeight, Int(rect.minY)))
        let boxRight  = max(0, min(imageWidth, Int(rect.maxX)))
        let boxBottom = max(0, min(imageHeight, Int(rect.maxY)))

        let boxWidth  = boxRight - boxLeft
        let boxHeight = boxBottom - boxTop

        guard boxWidth > 0, boxHeight > 0 else {
            print("[ImageCropper] ❌ Invalid bounding box: \(boxWidth)×\(boxHeight)")
            return nil
        }

        // Compute padding in pixels
        let padX = max(minPadding, min(maxPadding, Int(Float(boxWidth) * padding)))
        let padY = max(minPadding, min(maxPadding, Int(Float(boxHeight) * padding)))

        // Apply padding to crop region
        let cropLeft   = max(0, boxLeft - padX)
        let cropTop    = max(0, boxTop  - padY)
        let cropRight  = min(imageWidth, boxRight + padX)
        let cropBottom = min(imageHeight, boxBottom + padY)

        let cropWidth  = cropRight - cropLeft
        let cropHeight = cropBottom - cropTop

        guard cropWidth > 0, cropHeight > 0 else {
            print("[ImageCropper] ❌ Invalid crop region: \(cropWidth)×\(cropHeight)")
            return nil
        }

        // Relative box coordinates within the cropped image (pixels)
        let relX = Float(boxLeft - cropLeft)
        let relY = Float(boxTop  - cropTop)
        let relW = Float(boxWidth)
        let relH = Float(boxHeight)

        // Normalized box coordinates within the cropped image (0-1)
        let normLeft   = relX / Float(cropWidth)
        let normTop    = relY / Float(cropHeight)
        let normRight  = (relX + relW) / Float(cropWidth)
        let normBottom = (relY + relH) / Float(cropHeight)

        // High-quality crop
        guard let cropped = createHighQualityCrop(
            source: image,
            x: cropLeft, y: cropTop,
            width: cropWidth, height: cropHeight
        ) else {
            print("[ImageCropper] ❌ High-quality crop failed")
            return nil
        }

        #if DEBUG
        print("[ImageCropper] 📦 Cropped: \(cropWidth)×\(cropHeight) from \(imageWidth)×\(imageHeight)")
        print("         Relative box: [\(relX), \(relY), \(relW), \(relH)]")
        print("         Normalized box: [\(normLeft), \(normTop), \(normRight), \(normBottom)]")
        #endif

        return CropResult(
            croppedImage: cropped,
            relativeBoxCoordinates: [relX, relY, relW, relH],
            normalizedBoxCoordinates: [normLeft, normTop, normRight, normBottom],
            paddingRatio: padding
        )
    }

    // MARK: - Crop All Detections

    /// Crop a region that encompasses all bounding boxes with padding.
    /// More efficient than cropping each detection individually.
    ///
    /// - Parameters:
    ///   - image: Source image
    ///   - rects: Array of bounding boxes in image coordinates
    ///   - padding: Padding ratio (default 0.30 = 30%)
    /// - Returns: CropResult with cropped image and coordinates, or nil if crop fails.
    static func cropAllDetections(
        image: CGImage,
        rects: [CGRect],
        padding: Float = ScannerConfig.cropPadding
    ) -> CropResult? {
        // BUGFIX/FEATURE: The user explicitly requested NOT to crop the images to the bounding box.
        // Instead, they want the FULL camera frame captured on each sector, with the background mask applied over it.
        // Therefore, we bypass the spatial cropping entirely and just return the full `image`.

        let cropWidth = image.width
        let cropHeight = image.height

        guard cropWidth > 0, cropHeight > 0 else { return nil }
        guard !rects.isEmpty else { return nil }

        // Calculate union of all detection boxes (for mask application)
        var minX = CGFloat.greatestFiniteMagnitude
        var minY = CGFloat.greatestFiniteMagnitude
        var maxX = CGFloat.leastNormalMagnitude
        var maxY = CGFloat.leastNormalMagnitude

        for rect in rects {
            minX = min(minX, rect.minX)
            minY = min(minY, rect.minY)
            maxX = max(maxX, rect.maxX)
            maxY = max(maxY, rect.maxY)
        }

        // Normalize detection box coordinates to [0-1] range relative to full frame
        // This is needed for mask reconstruction in proto space
        let normLeft = Float(minX) / Float(cropWidth)
        let normTop = Float(minY) / Float(cropHeight)
        let normRight = Float(maxX) / Float(cropWidth)
        let normBottom = Float(maxY) / Float(cropHeight)

        #if DEBUG
        print("[ImageCropper] Full frame returned: \(cropWidth)x\(cropHeight), detection_box_norm=[\(normLeft), \(normTop), \(normRight), \(normBottom)]")
        #endif

        return CropResult(
            croppedImage: image, // Use full image directly
            relativeBoxCoordinates: [Float(minX), Float(minY), Float(maxX - minX), Float(maxY - minY)],
            normalizedBoxCoordinates: [normLeft, normTop, normRight, normBottom], // Detection box for mask
            paddingRatio: padding
        )
    }

    // MARK: - Apply Mask to Crop

    /// Apply segmentation mask to a cropped image — background becomes transparent/black.
    ///
    /// - Parameters:
    ///   - image: Cropped source image
    ///   - maskData: MaskData from SegmentationDetection containing coefficients + proto masks
    ///   - boxInCrop: Bounding box normalized [0-1] inside the crop (from CropResult.normalizedBoxCoordinates)
    ///   - threshold: Sigmoid threshold [0-1], default 0.5
    /// - Returns: New CGImage with masked background, or nil on failure.
    static func applyMaskToCrop(
        image: CGImage,
        maskData: MaskData,
        boxInCrop: [Float],
        threshold: Float = ScannerConfig.maskThreshold
    ) -> CGImage? {
        // Step 1: Reconstruct mask with box constraint in proto space (KEY FIX from Python)
        // Only compute sigmoid within detection box, outside = 0 (background removed)
        let mask = SegmentationHelper.reconstructMaskWithBoxConstraint(
            coeffs: maskData.maskCoeffs,
            protos: maskData.protoMasks,
            boxNormalized: boxInCrop
        )

        #if DEBUG
        print("[ImageCropper] 🔬 Mask step 1: reconstructed with box constraint in proto space")
        #endif

        // Step 2: Resize mask to full image dimensions
        let fullMask = SegmentationHelper.resizeMaskToBox(mask, width: image.width, height: image.height)

        #if DEBUG
        print("[ImageCropper] 🔬 Mask step 2: resized to full image \(image.width)×\(image.height)")
        #endif

        // Step 3: Apply mask - pixels outside mask become black/transparent (background removed)
        let maskedImage = SegmentationHelper.applyMaskToBitmap(image, mask: fullMask, threshold: threshold)

        #if DEBUG
        if let masked = maskedImage {
            print("[ImageCropper] 🔬 Mask step 3: background removed, final \(masked.width)×\(masked.height)")
        }
        #endif

        return maskedImage ?? image
    }

    /// Apply mask with feathered (soft) edges for better visual quality.
    static func applyMaskToCropWithFeather(
        image: CGImage,
        maskData: MaskData,
        boxInCrop: [Float],
        innerThreshold: Float = ScannerConfig.maskInnerThreshold,
        outerThreshold: Float = ScannerConfig.maskOuterThreshold
    ) -> CGImage? {
        // Use box constraint for better quality
        let mask = SegmentationHelper.reconstructMaskWithBoxConstraint(
            coeffs: maskData.maskCoeffs,
            protos: maskData.protoMasks,
            boxNormalized: boxInCrop
        )

        let fullMask = SegmentationHelper.resizeMaskToBox(mask, width: image.width, height: image.height)

        return SegmentationHelper.applyMaskWithFeather(
            image,
            mask: fullMask,
            innerThreshold: innerThreshold,
            outerThreshold: outerThreshold
        )
    }

    // MARK: - NEW: Background Removal with Multiple Detections

    /// Remove letterbox padding from image before applying mask.
    /// This removes black bars added during letterboxing.
    ///
    /// - Parameters:
    ///   - letterboxImage: Image with letterbox padding (640x640)
    ///   - letterboxInfo: Letterbox information (padding, ratio)
    /// - Returns: Image without padding, or original if crop fails
    static func removeLetterboxPadding(
        letterboxImage: CGImage,
        letterboxInfo: LetterboxInfo
    ) -> CGImage? {
        let padLeft = Int(letterboxInfo.padLeft)
        let padTop = Int(letterboxInfo.padTop)

        // Calculate content size (without padding)
        let contentWidth = letterboxImage.width - (padLeft * 2)
        let contentHeight = letterboxImage.height - (padTop * 2)

        guard contentWidth > 0, contentHeight > 0 else {
            return letterboxImage
        }

        // Crop to remove padding
        return createHighQualityCrop(
            source: letterboxImage,
            x: padLeft,
            y: padTop,
            width: contentWidth,
            height: contentHeight
        )
    }

    /// Apply mask by merging multiple detections for cleaner background removal.
    /// This is a NEW function that doesn't affect existing flows.
    ///
    /// - Parameters:
    ///   - image: Full frame image (not cropped)
    ///   - detections: Array of SegmentationDetection with mask coefficients
    ///   - protoMasks: Prototype masks from model [32][160][160]
    ///   - minConfidence: Minimum confidence to include detection (default 0.80)
    ///   - threshold: Sigmoid threshold for mask application (default 0.5)
    /// - Returns: Image with background removed, or original image on failure
    static func applyMaskWithMultipleDetections(
        image: CGImage,
        detections: [SegmentationDetection],
        protoMasks: [[Float]],
        letterboxInfo: LetterboxInfo?,
        minConfidence: Float = ScannerConfig.minConfidenceForMaskMerge,
        threshold: Float = ScannerConfig.maskThreshold
    ) -> CGImage? {

        // Filter high-confidence detections
        let highConfDetections = detections.filter { $0.confidence >= minConfidence }

        guard !highConfDetections.isEmpty else {
            #if DEBUG
            print("[ImageCropper] ⚠️ No high-confidence detections for mask merge")
            #endif
            return image
        }

        #if DEBUG
        print("[ImageCropper] 🎯 Merging masks from \(highConfDetections.count)/\(detections.count) detections (conf >= \(minConfidence))")
        #endif

        // Initialize combined mask (160x160)
        var combinedMask = [[Float]](repeating: [Float](repeating: 0, count: 160), count: 160)

        let ratio = CGFloat(letterboxInfo?.ratio ?? 1.0)
        let padL = CGFloat(letterboxInfo?.padLeft ?? 0.0)
        let padT = CGFloat(letterboxInfo?.padTop ?? 0.0)

        // Merge masks from all high-confidence detections
        for detection in highConfDetections {
            // Convert bounding box from original image space to letterbox space (640x640)
            let box = detection.boundingBox
            let lbX1 = box.minX * ratio + padL
            let lbY1 = box.minY * ratio + padT
            let lbX2 = box.maxX * ratio + padL
            let lbY2 = box.maxY * ratio + padT

            // Normalize to [0-1] in 640x640 space for mask reconstruction
            let boxNorm: [Float] = [
                Float(lbX1) / 640.0,
                Float(lbY1) / 640.0,
                Float(lbX2) / 640.0,
                Float(lbY2) / 640.0
            ]

            // Get mask coefficients from maskData
            guard let maskCoeffs = detection.maskData?.maskCoeffs else {
                continue
            }

            // Reconstruct mask for this detection
            let maskDet = SegmentationHelper.reconstructMaskWithBoxConstraint(
                coeffs: maskCoeffs,
                protos: protoMasks,
                boxNormalized: boxNorm
            )

            // Merge: take maximum value at each pixel (union of all masks)
            for y in 0..<160 {
                for x in 0..<160 {
                    combinedMask[y][x] = max(combinedMask[y][x], maskDet[y][x])
                }
            }
        }
        
        // Remove letterbox padding from the 160x160 mask before resizing
        let padL160 = Int(padL / 4.0)
        let padT160 = Int(padT / 4.0)
        let contentW160 = max(1, 160 - (padL160 * 2))
        let contentH160 = max(1, 160 - (padT160 * 2))
        
        var croppedMask = [[Float]](repeating: [Float](repeating: 0, count: contentW160), count: contentH160)
        
        for y in 0..<contentH160 {
            for x in 0..<contentW160 {
                let srcY = min(159, max(0, y + padT160))
                let srcX = min(159, max(0, x + padL160))
                croppedMask[y][x] = combinedMask[srcY][srcX]
            }
        }

        #if DEBUG
        let minVal = croppedMask.flatMap { $0 }.min() ?? 0
        let maxVal = croppedMask.flatMap { $0 }.max() ?? 0
        let meanVal = croppedMask.flatMap { $0 }.reduce(0, +) / Float(contentW160 * contentH160)
        print("[ImageCropper] 📊 Cropped mask stats: min=\(String(format: "%.3f", minVal)), max=\(String(format: "%.3f", maxVal)), mean=\(String(format: "%.3f", meanVal))")
        #endif

        // Resize mask to image size
        let fullMask = SegmentationHelper.resizeMaskToBox(croppedMask, width: image.width, height: image.height)

        // Apply mask to remove background
        let maskedImage = SegmentationHelper.applyMaskToBitmap(image, mask: fullMask, threshold: threshold)

        #if DEBUG
        if let masked = maskedImage {
            print("[ImageCropper] ✅ Background removed: \(masked.width)×\(masked.height)")
        }
        #endif

        return maskedImage ?? image
    }

    // MARK: - High-Quality Crop

    /// Create a high-quality crop using bilinear filtering.
    /// Mirrors Android createHighQualityCrop().
    /// Optimized for bark texture identification by SAM/DINO/SuperPoint AI models.
    private static func createHighQualityCrop(
        source: CGImage,
        x: Int, y: Int,
        width: Int, height: Int
    ) -> CGImage? {
        // Validate crop region
        guard x >= 0, y >= 0,
              x + width <= source.width,
              y + height <= source.height,
              width > 0, height > 0 else {
            print("[ImageCropper] ❌ Invalid crop region: x=\(x), y=\(y), w=\(width), h=\(height), source=\(source.width)×\(source.height)")
            return nil
        }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

        // Create bitmap context for the output crop
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ) else {
            print("[ImageCropper] ❌ Failed to create CGContext for crop")
            return nil
        }

        // Disable interpolation artifacts for high quality
        context.interpolationQuality = .high

        // Source rect in the original image
        let srcRect = CGRect(x: x, y: y, width: width, height: height)
        // Destination rect in the output bitmap
        let dstRect = CGRect(x: 0, y: 0, width: width, height: height)

        // Draw the cropped region using cropping
        if let croppedSource = source.cropping(to: srcRect) {
            context.draw(croppedSource, in: dstRect)
        } else {
            context.draw(source, in: dstRect)
        }

        // Extract CGImage from context
        guard let croppedImage = context.makeImage() else {
            print("[ImageCropper] ❌ Failed to make CGImage from context")
            return nil
        }

        #if DEBUG
        print("[ImageCropper] 🎨 High-quality crop: \(width)×\(height) from \(source.width)×\(source.height)")
        #endif

        return croppedImage
    }

    // MARK: - Simple Crop (No Padding)

    /// Simple crop without padding — mirrors CGRect cropping.
    static func simpleCrop(image: CGImage, rect: CGRect) -> CGImage? {
        return createHighQualityCrop(
            source: image,
            x: Int(rect.minX),
            y: Int(rect.minY),
            width: Int(rect.width),
            height: Int(rect.height)
        )
    }
}
