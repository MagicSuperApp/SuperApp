package com.mvp.orilife.detection

import android.graphics.RectF
import com.mvp.orilife.Config
import com.mvp.orilife.image.ImageProcessor
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class DetectionFilterConfig(
    val minConfidence: Float = Config.AR_OVERLAY_CONFIDENCE_THRESHOLD,
    val minAspectRatio: Float = 0.1f,
    val maxAspectRatio: Float = 10.0f
)

data class FilterReason(
    val reason: String,
    val value: String
)

/**
 * Filter detections using pixel-based bounding boxes.
 * Size/edge filters are already applied in YOLODetectionHelper.parseYOLOOutput(),
 * so here we only filter by confidence and aspect ratio.
 */
class DetectionFilter(private val config: DetectionFilterConfig = DetectionFilterConfig()) {

    fun shouldInclude(detection: SegmentationDetection): FilterReason? {
        val box = detection.boundingBox
        val w = box.width()
        val h = box.height()

        if (w <= 0f || h <= 0f) return FilterReason("Invalid box", "0")

        val aspectRatio = w / h

        return when {
            detection.confidence < config.minConfidence -> FilterReason(
                "Low confidence",
                "${(detection.confidence * 100).toInt()}%"
            )
            aspectRatio < config.minAspectRatio || aspectRatio > config.maxAspectRatio -> FilterReason(
                "Bad aspect ratio",
                String.format("%.2f", aspectRatio)
            )
            else -> null
        }
    }
}

data class StableDetection(
    val id: String,
    val detection: SegmentationDetection,
    var stableFrames: Int = 0,
    var isConfirmed: Boolean = false,
    var hasVirtualID: Boolean = false,
    var averageConfidence: Float = 0f,
    val boxes: MutableList<RectF> = mutableListOf(),
    val confidences: MutableList<Float> = mutableListOf(),
    var smoothedBox: RectF? = null
)

class DetectionTracker(
    private val iouThreshold: Float = Config.SAME_TREE_IOU_THRESHOLD,
    private val stabilityFrames: Int = Config.AR_OVERLAY_STABILITY_FRAMES,
    private val smoothingAlpha: Float = 0.3f
) {
    private val trackedDetections = mutableMapOf<String, StableDetection>()
    private val stateMutex = Mutex()

    suspend fun track(
        detections: List<SegmentationDetection>,
        onConfirmed: (StableDetection) -> Unit = {}
    ): List<StableDetection> {
        return stateMutex.withLock {
            val confirmed = mutableListOf<StableDetection>()
            val matchedKeys = mutableSetOf<String>()

            for (detection in detections) {
                val bestMatch = findBestMatch(detection, matchedKeys)

                if (bestMatch != null) {
                    val (key, stableDet) = bestMatch
                    matchedKeys.add(key)

                    updateStableDetection(stableDet, detection)
                    trackedDetections[key] = stableDet

                    if (stableDet.stableFrames >= stabilityFrames && !stableDet.isConfirmed) {
                        stableDet.isConfirmed = true
                        confirmed.add(stableDet)
                        onConfirmed(stableDet)
                    }
                } else {
                    val newKey = generateDetectionKey(detection)
                    val newStable = StableDetection(
                        id = newKey,
                        detection = detection,
                        stableFrames = 1,
                        averageConfidence = detection.confidence,
                        smoothedBox = RectF(detection.boundingBox)
                    )
                    trackedDetections[newKey] = newStable
                    matchedKeys.add(newKey)
                }
            }

            removeLostDetections(matchedKeys)
            confirmed
        }
    }

    suspend fun getAll(): List<StableDetection> = stateMutex.withLock {
        trackedDetections.values.toList()
    }

    suspend fun clear() = stateMutex.withLock {
        trackedDetections.clear()
    }

    private fun findBestMatch(
        detection: SegmentationDetection,
        excludeKeys: Set<String>
    ): Pair<String, StableDetection>? {
        val processor = ImageProcessor()
        return trackedDetections.entries
            .filter { it.key !in excludeKeys }
            .map { (key, stableDet) ->
                val iou = processor.calculateIoU(detection.boundingBox, stableDet.detection.boundingBox)
                Pair(key, stableDet) to iou
            }
            .maxByOrNull { it.second }
            ?.takeIf { it.second > iouThreshold }
            ?.first
    }

    private fun updateStableDetection(
        stableDet: StableDetection,
        detection: SegmentationDetection
    ) {
        stableDet.stableFrames++
        stableDet.boxes.add(detection.boundingBox)
        stableDet.confidences.add(detection.confidence)

        val avgConf = stableDet.confidences.average().toFloat()
        stableDet.averageConfidence = avgConf

        if (stableDet.smoothedBox == null) {
            stableDet.smoothedBox = RectF(detection.boundingBox)
        } else {
            val smoothed = stableDet.smoothedBox!!
            smoothed.left = smoothed.left * (1 - smoothingAlpha) + detection.boundingBox.left * smoothingAlpha
            smoothed.top = smoothed.top * (1 - smoothingAlpha) + detection.boundingBox.top * smoothingAlpha
            smoothed.right = smoothed.right * (1 - smoothingAlpha) + detection.boundingBox.right * smoothingAlpha
            smoothed.bottom = smoothed.bottom * (1 - smoothingAlpha) + detection.boundingBox.bottom * smoothingAlpha
        }
    }

    private fun removeLostDetections(matchedKeys: Set<String>) {
        trackedDetections.entries.removeIf { it.key !in matchedKeys }
    }

    private fun generateDetectionKey(detection: SegmentationDetection): String {
        val box = detection.boundingBox
        return "${detection.label}_${System.currentTimeMillis()}_${(box.left * 100).toInt()}_${(box.top * 100).toInt()}"
    }
}
