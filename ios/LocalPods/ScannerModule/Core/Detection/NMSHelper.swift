import Foundation
import CoreGraphics

/// Non-Maximum Suppression helper.
/// Matches Android's applyNMS() in YOLODetectionHelper.kt.
final class NMSHelper {

    /// Apply NMS to deduplicate overlapping bounding boxes.
    /// - Parameters:
    ///   - boxes: Array of (rect, confidence) pairs
    ///   - iouThreshold: IoU threshold for suppression (default 0.45)
    /// - Returns: Indices of boxes to keep
    func applyNMS(
        boxes: [(rect: CGRect, confidence: Float, classId: Int)],
        iouThreshold: Float = ScannerConfig.nmsIOUThreshold
    ) -> [Int] {
        guard !boxes.isEmpty else { return [] }

        // Sort by confidence descending
        let sorted = boxes.enumerated()
            .sorted { $0.element.confidence > $1.element.confidence }
            .map { ($0.offset, $0.element) }

        var suppressed = [Bool](repeating: false, count: boxes.count)
        var keep = [Int]()

        for i in 0..<sorted.count {
            let (originalIdx, box) = sorted[i]
            if suppressed[originalIdx] { continue }

            keep.append(originalIdx)

            for j in (i + 1)..<sorted.count {
                let (otherIdx, otherBox) = sorted[j]
                if suppressed[otherIdx] { continue }

                // Only suppress boxes of the same class
                if box.classId != otherBox.classId { continue }

                let iou = calculateIoU(box.rect, otherBox.rect)
                if iou > iouThreshold {
                    suppressed[otherIdx] = true
                }
            }
        }

        return keep
    }

    /// Calculate Intersection over Union of two rectangles.
    func calculateIoU(_ a: CGRect, _ b: CGRect) -> Float {
        let interX = max(0, min(a.maxX, b.maxX) - max(a.minX, b.minX))
        let interY = max(0, min(a.maxY, b.maxY) - max(a.minY, b.minY))
        let interArea = interX * interY
        let unionArea = a.width * a.height + b.width * b.height - interArea
        guard unionArea > 0 else { return 0 }
        return Float(interArea / unionArea)
    }
}
