package com.mvp.orilife.detection

import com.mvp.orilife.Config
import com.mvp.orilife.image.ImageProcessor
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TreeDetectionStateMachine(
    private val confidenceThreshold: Float = Config.PROCESSING_CONFIDENCE_THRESHOLD,
    private val stabilityFrames: Int = Config.PROCESSING_STABILITY_FRAMES,
    private val cooldownDuration: Long = 3000L
) {
    sealed interface State {
        object Searching : State
        object TreeDetected : State
        object Processing : State
        object Sending : State
        object Cooldown : State
    }

    private val stateMutex = Mutex()
    private var currentState: State = State.Searching
    private var consecutiveFrames = 0
    private var lastDetection: SegmentationDetection? = null
    // ✅ Tạm dừng SM khi circular capture đang chạy
    private var isPaused: Boolean = false

    val state: State get() = currentState

    suspend fun process(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        // ✅ Circular capture đang active → bỏ qua hoàn toàn, không thay đổi state
        if (isPaused) return null

        return stateMutex.withLock {
            when (currentState) {
                State.Searching -> handleSearching(detections)
                State.TreeDetected -> handleTreeDetected(detections)
                State.Processing -> handleProcessing(detections)
                State.Sending -> handleSending(detections)
                State.Cooldown -> handleCooldown(detections)
            }
        }
    }

    suspend fun setState(newState: State) {
        stateMutex.withLock {
            currentState = newState
        }
    }

    private fun handleSearching(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        val treeDetection = detections?.findValidTreeDetection() ?: run {
            android.util.Log.d("TreeSM", "handleSearching: no valid tree, resetting counter")
            consecutiveFrames = 0
            return null
        }

        if (treeDetection.confidence < confidenceThreshold) {
            consecutiveFrames = 0
            return null
        }

        consecutiveFrames++
        android.util.Log.d("TreeSM", "handleSearching: consecutiveFrames=${consecutiveFrames}/${stabilityFrames}")

        if (consecutiveFrames >= stabilityFrames) {
            currentState = State.TreeDetected
            lastDetection = treeDetection
            consecutiveFrames = 0
            return TreeDetectionAction.Process(treeDetection)
        }

        return null
    }

    private fun handleTreeDetected(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        return when {
            lastDetection == null -> {
                currentState = State.Searching
                null
            }
            detections?.containsSimilarDetection(lastDetection!!) == true -> {
                // Chuyển sang Processing để tránh gửi lặp lại
                currentState = State.Processing
                TreeDetectionAction.Process(lastDetection!!)
            }
            else -> {
                currentState = State.Searching
                null
            }
        }
    }

    private fun handleProcessing(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        // Chuyển sang Sending và không xử lý thêm detection nào
        currentState = State.Sending
        return null
    }

    private fun handleSending(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        // Chuyển sang Cooldown để tránh detect lại ngay
        currentState = State.Cooldown
        return TreeDetectionAction.Cooldown(cooldownDuration)
    }

    private fun handleCooldown(detections: List<SegmentationDetection>?): TreeDetectionAction? {
        // Reset về Searching để sẵn sàng detect tiếp
        currentState = State.Searching
        consecutiveFrames = 0
        lastDetection = null
        return TreeDetectionAction.ResumeSearching
    }
    
    suspend fun reset() {
        stateMutex.withLock {
            currentState = State.Searching
            consecutiveFrames = 0
            lastDetection = null
        }
    }

    fun pause() {
        isPaused = true
    }

    fun resume() {
        isPaused = false
    }
}

sealed interface TreeDetectionAction {
    data class Process(val detection: SegmentationDetection) : TreeDetectionAction
    data class Cooldown(val duration: Long) : TreeDetectionAction
    object ResumeSearching : TreeDetectionAction
}

private fun List<SegmentationDetection>.findValidTreeDetection(): SegmentationDetection? {
    val valid = firstOrNull { det ->
        (det.label == "Trunk" || det.label == "Branch") &&
        det.confidence >= Config.PROCESSING_CONFIDENCE_THRESHOLD
    }
    if (isNotEmpty()) {
        val first = first()
        android.util.Log.d("TreeSM", "findValidTree: size=$size, firstLabel=${first.label}, firstConf=${"%.2f".format(first.confidence)}, threshold=${Config.PROCESSING_CONFIDENCE_THRESHOLD}, valid=$valid")
    }
    return valid
}

private fun List<SegmentationDetection>.containsSimilarDetection(detection: SegmentationDetection): Boolean {
    val processor = ImageProcessor()
    return any { det ->
        det.label == detection.label &&
        processor.calculateIoU(det.boundingBox, detection.boundingBox) > Config.SAME_TREE_IOU_THRESHOLD
    }
}
