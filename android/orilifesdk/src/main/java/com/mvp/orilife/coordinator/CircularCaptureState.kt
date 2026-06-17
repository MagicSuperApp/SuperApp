package com.mvp.orilife.coordinator

import com.mvp.orilife.detection.CropResult
import kotlin.math.abs
import kotlin.math.min

// ─────────────────────────────────────────────────────────────────────────────
// Sector — 8 sectors chia ĐỀU 360°, TƯƠNG ĐỐI từ heading bắt đầu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Một sector trong vòng tròn 360°.
 *
 * ✅ KEY: Sector index tương đối với heading bắt đầu (referenceHeading).
 * - Sector 0 = trung tâm = referenceHeading
 * - Sector 1 = referenceHeading + 45°
 * - Sector 2 = referenceHeading + 90°
 * - ...
 * - Sector 7 = referenceHeading + 315°
 *
 * Heading tuyệt đối (0-360°) được chuyển thành relative (0-360°) trước khi so sánh.
 *
 * @param index              0-7, tương đối từ referenceHeading
 * @param referenceHeading    Heading tuyệt đối tại thời điểm bắt đầu session (0-360°)
 * @param isCaptured          Đã chụp thành công chưa
 * @param isSkipped          User nhấn "Bỏ qua sector"
 */
class Sector(
    val index: Int,
    val referenceHeading: Float,
    val isCaptured: Boolean = false,
    val isSkipped: Boolean = false
) {
    companion object {
        const val TOTAL_SECTORS = 8
        const val SECTOR_SIZE_DEGREES = 45f
        const val SECTOR_HALF_ANGLE = SECTOR_SIZE_DEGREES / 2f  // 22.5°
        /** Tolerance thêm vào boundary để tránh miss khi heading gần edge */
        const val SECTOR_BOUNDARY_TOLERANCE = 5f

        /** Tạo 8 sector TƯƠNG ĐỐI từ referenceHeading */
        fun createSessionSectors(referenceHeading: Float): List<Sector> =
            (0 until TOTAL_SECTORS).map { index ->
                Sector(
                    index = index,
                    referenceHeading = referenceHeading
                )
            }

        /**
         * Chuyển heading tuyệt đối (0-360°) thành heading TƯƠNG ĐỐI
         * so với referenceHeading.
         * Relative heading tăng khi quay ngược chiều kim đồng hồ (tăng heading tuyệt đối).
         *
         * Ví dụ: ref=90°, heading=135° → relative=45°
         *         ref=350°, heading=10° → relative=20°
         */
        fun toRelativeHeading(heading: Float, referenceHeading: Float): Float {
            val diff = heading - referenceHeading
            val normalized = ((diff % 360f) + 360f) % 360f
            return normalized
        }

        /**
         * Khoảng cách góc ngắn nhất giữa 2 heading tuyệt đối (0-360°).
         */
        fun angularDistance(a: Float, b: Float): Float {
            val diff = abs(a - b) % 360f
            return min(diff, 360f - diff)
        }
    }

    /**
     * Trung tâm sector theo heading TUYỆT ĐỐI (0-360°).
     * = referenceHeading + index * 45°, normalized về 0-360°.
     */
    val centerDegrees: Float
        get() {
            val absolute = referenceHeading + index * SECTOR_SIZE_DEGREES
            return ((absolute % 360f) + 360f) % 360f
        }

    /**
     * Trung tâm sector theo heading TƯƠNG ĐỐI (0-360°).
     * = index * 45°
     */
    val relativeCenterDegrees: Float
        get() = index * SECTOR_SIZE_DEGREES

    /**
     * Heading hiện tại (tuyệt đối) có nằm trong sector này không?
     * So sánh bằng RELATIVE heading để đảm bảo đúng vòng tròn.
     *
     * @param heading  Heading tuyệt đối hiện tại (0-360°)
     */
    fun containsHeading(heading: Float): Boolean {
        val relative = toRelativeHeading(heading, referenceHeading)
        val distance = angularDistanceRelative(relative, relativeCenterDegrees)
        return distance <= SECTOR_HALF_ANGLE + SECTOR_BOUNDARY_TOLERANCE
    }

    /**
     * Khoảng cách giữa 2 relative headings (0-360°).
     */
    private fun angularDistanceRelative(a: Float, b: Float): Float {
        val diff = abs(a - b) % 360f
        return min(diff, 360f - diff)
    }

    /** Copy với trạng thái isCaptured mới */
    fun copyCaptured(): Sector = Sector(index, referenceHeading, isCaptured = true, isSkipped = false)

    /** Copy với trạng thái isSkipped mới */
    fun copySkipped(): Sector = Sector(index, referenceHeading, isCaptured = false, isSkipped = true)

    override fun toString(): String = "Sector[$index](captured=$isCaptured, skipped=$isSkipped, ref=${referenceHeading.toInt()}°)"
}

// ─────────────────────────────────────────────────────────────────────────────
// Guidance — hướng dẫn di chuyển cho người dùng
// ─────────────────────────────────────────────────────────────────────────────

enum class GuidanceDirection {
    CLOCKWISE,         // Heading TĂNG = user xoay TRÁI (ngược kim đồng hồ thực tế)
    COUNTER_CLOCKWISE, // Heading GIẢM = user xoay PHẢI (thuận kim đồng hồ thực tế)
    ARRIVED
}

/**
 * Hướng dẫn di chuyển cho người dùng.
 * Dựa trên RELATIVE heading delta.
 */
data class Guidance(
    val direction: GuidanceDirection,
    val deltaDegrees: Float
) {
    val instructionText: String
        get() = when (direction) {
            GuidanceDirection.CLOCKWISE -> "Sang phải ${deltaDegrees.toInt()}°"
            GuidanceDirection.COUNTER_CLOCKWISE -> "Sang trái ${deltaDegrees.toInt()}°"
            GuidanceDirection.ARRIVED -> "Dừng lại, giữ yên"
        }

    companion object {
        val NONE = Guidance(GuidanceDirection.ARRIVED, 0f)

        /**
         * Tính guidance từ heading hiện tại đến sector mục tiêu.
         * Dùng RELATIVE heading để so sánh chính xác.
         *
         * @param currentHeading      Heading tuyệt đối hiện tại (0-360°)
         * @param targetSector       Sector mục tiêu
         */
        fun fromHeadingToTarget(currentHeading: Float, targetSector: Sector): Guidance {
            if (currentHeading < 0f || currentHeading >= 360f) return NONE

            // Chuyển sang relative heading để so sánh đúng vòng tròn
            val currentRelative = Sector.toRelativeHeading(currentHeading, targetSector.referenceHeading)
            val targetRelative = targetSector.relativeCenterDegrees

            // Khoảng cách khi quay ngược kim (heading tăng = CLOCKWISE)
            val clockwiseDelta = ((targetRelative - currentRelative) % 360f + 360f) % 360f
            // Khoảng cách khi quay thuận kim (heading giảm = COUNTER_CLOCKWISE)
            val counterClockwiseDelta = ((currentRelative - targetRelative) % 360f + 360f) % 360f

            return when {
                clockwiseDelta < 5f || counterClockwiseDelta < 5f ->
                    Guidance(GuidanceDirection.ARRIVED, 0f)
                clockwiseDelta <= counterClockwiseDelta ->
                    Guidance(GuidanceDirection.CLOCKWISE, clockwiseDelta)
                else ->
                    Guidance(GuidanceDirection.COUNTER_CLOCKWISE, counterClockwiseDelta)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Indicators — 3 điều kiện chụp
// ─────────────────────────────────────────────────────────────────────────────

enum class ConditionStatus {
    PENDING,
    READY,
    UNKNOWN
}

data class ConditionIndicator(
    val label: String,
    val status: ConditionStatus
) {
    companion object {
        fun stable(status: ConditionStatus) = ConditionIndicator("Ổn định", status)
        fun yolo(status: ConditionStatus)   = ConditionIndicator("YOLO", status)
        fun blur(status: ConditionStatus)   = ConditionIndicator("Rõ nét", status)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session State — trạng thái session để bind vào UI
// ─────────────────────────────────────────────────────────────────────────────

enum class CircularState {
    INACTIVE,
    GUIDANCE,
    STATIONARY_WAIT,
    CAPTURE_TRIGGERED,
    COMPLETE
}

data class CircularSessionState(
    val state: CircularState = CircularState.INACTIVE,
    val sectors: List<Sector> = emptyList(),
    val currentTargetSector: Sector? = null,
    val currentHeading: Float? = null,
    val guidance: Guidance? = null,
    val indicators: List<ConditionIndicator> = emptyList()
) {
    val capturedCount: Int
        get() = sectors.count { it.isCaptured }
    val remainingCount: Int
        get() = sectors.count { !it.isCaptured && !it.isSkipped }
    val isComplete: Boolean
        get() = state == CircularState.COMPLETE
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture Result — kết quả chụp báo về state machine
// ─────────────────────────────────────────────────────────────────────────────

sealed class CaptureResult {
    data class Success(
        val sectorIndex: Int,
        val cropResult: CropResult,
        val imageId: String,
        val treeId: String
    ) : CaptureResult()

    data class Failure(
        val sectorIndex: Int,
        val error: String
    ) : CaptureResult()
}
