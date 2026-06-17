import Foundation
import CoreGraphics

// MARK: - MaskData

/// Mask data from YOLOv2.6 Seg model.
///
/// Mask is reconstructed from:
///   - 32 mask coefficients from output[0][i][6:38]
///   - 32 prototype masks from output[1][1][160][160][32]
struct MaskData: Sendable {
    /// 32 mask coefficients.
    let maskCoeffs: [Float]
    /// 32 prototype masks, each 160×160. Layout: [channel][height*width] (flat per channel).
    let protoMasks: [[Float]]
    /// Pre-reconstructed mask [height][width] (optional, computed lazily).
    var reconstructedMask: [[Float]]?
    /// Normalized bounding box [0-1] for original image.
    let boxNormalized: CGRect

    /// Maximum coefficient value (for debug).
    var maxCoeff: Float {
        maskCoeffs.max() ?? 0
    }
}

// MARK: - SegmentationDetection

/// Full segmentation detection result from YOLO model.
/// Contains bounding box, class, confidence, and mask data.
struct SegmentationDetection: Sendable {
    /// Bounding box in original image coordinates (pixels).
    let boundingBox: CGRect
    /// Normalized bounding box [0-1] for original image.
    let normalizedBox: CGRect
    /// Confidence score (0.0 - 1.0).
    let confidence: Float
    /// Class ID: 0 = Branch, 1 = Trunk.
    let classId: Int
    /// Class label string.
    let label: String
    /// Mask data (if available).
    let maskData: MaskData?

    init(boundingBox: CGRect, confidence: Float, classId: Int,
         label: String, maskData: MaskData?,
         imageWidth: CGFloat = 0, imageHeight: CGFloat = 0) {
        self.boundingBox = boundingBox
        // Compute normalizedBox if valid image dimensions are provided;
        // otherwise assign zero-rect to avoid crashing the overlay with
        // out-of-[0,1] values (pixel coords passed as normalized coords).
        if imageWidth > 0 && imageHeight > 0 {
            self.normalizedBox = CGRect(
                x: boundingBox.minX / imageWidth,
                y: boundingBox.minY / imageHeight,
                width: boundingBox.width / imageWidth,
                height: boundingBox.height / imageHeight
            )
        } else {
            // Fallback: zero-rect is filtered out by the overlay validation guard.
            self.normalizedBox = .zero
        }
        self.confidence = confidence
        self.classId = classId
        self.label = label
        self.maskData = maskData
    }

    /// Create from YOLODetection (extracts mask data if available).
    init(from yolo: YOLODetection, maskData: MaskData? = nil) {
        self.boundingBox = yolo.rect
        self.normalizedBox = yolo.normalizedRect
        self.confidence = yolo.confidence
        self.classId = yolo.classId
        self.label = yolo.label
        self.maskData = maskData ?? (yolo.maskCoeffs.isEmpty ? nil : MaskData(
            maskCoeffs: yolo.maskCoeffs,
            protoMasks: [],
            reconstructedMask: nil,
            boxNormalized: yolo.normalizedRect
        ))
    }
}

// MARK: - Detection (Alias for UI layer compatibility)

/// Alias for SegmentationDetection used by UI overlay rendering.
/// Mirrors Android Detection.kt.
struct Detection: Sendable {
    let boundingBox: CGRect
    let normalizedBox: CGRect
    let categories: [Category]
    let confidence: Float
    let label: String

    struct Category: Sendable {
        let label: String
        let score: Float
    }

    init(boundingBox: CGRect, normalizedBox: CGRect, categories: [Category]) {
        self.boundingBox = boundingBox
        self.normalizedBox = normalizedBox
        self.categories = categories
        self.confidence = categories.first?.score ?? 0
        self.label = categories.first?.label ?? ""
    }

    init(from segDet: SegmentationDetection) {
        self.boundingBox = segDet.boundingBox
        self.normalizedBox = segDet.normalizedBox
        self.categories = [Category(label: segDet.label, score: segDet.confidence)]
        self.confidence = segDet.confidence
        self.label = segDet.label
    }
}

/// Letterbox-aware detection result ready for overlay rendering.
struct LetterboxDetection {
    let detection: YOLODetection
    let letterboxInfo: LetterboxInfo
    let originalWidth: Int
    let originalHeight: Int
}

/// YOLO Detection result (raw model output).
struct YOLODetection: Sendable {
    /// Bounding box in original image coordinates (pixels).
    var rect: CGRect  // Changed from 'let' to 'var' for smoothing support
    /// Confidence score (0.0 - 1.0).
    let confidence: Float
    /// Class ID: 0 = Branch, 1 = Trunk.
    let classId: Int
    /// Class label string.
    let label: String
    /// Mask coefficients for segmentation (32 values).
    let maskCoeffs: [Float]
    /// Normalized bounding box [0-1] for original image.
    let normalizedRect: CGRect

    init(rect: CGRect, confidence: Float, classId: Int,
         maskCoeffs: [Float], normalizedRect: CGRect, modelType: YOLOTFLiteRunner.ModelType = .tree) {
        self.rect = rect
        self.confidence = confidence
        self.classId = classId

        // Select correct class enum based on model type
        if modelType == .fruit {
            self.label = ScannerConfig.FruitYOLOClass(rawValue: classId)?.label ?? "Unknown"
            print("[YOLODetection] 🍎 FRUIT mode: classId=\(classId) → label=\(self.label)")
        } else {
            self.label = ScannerConfig.YOLOClass(rawValue: classId)?.label ?? "Unknown"
            print("[YOLODetection] 🌳 TREE mode: classId=\(classId) → label=\(self.label)")
        }

        self.maskCoeffs = maskCoeffs
        self.normalizedRect = normalizedRect
    }
}

// MARK: - Conversion

extension YOLODetection {
    /// Convert to SegmentationDetection for use in DetectionCoordinator.
    /// Uses the `init(from:)` path which correctly preserves `normalizedRect`.
    func toSegmentation() -> SegmentationDetection {
        SegmentationDetection(from: self, maskData: nil)
    }
}
