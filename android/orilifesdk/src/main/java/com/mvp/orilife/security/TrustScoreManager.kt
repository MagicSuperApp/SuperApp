package com.mvp.orilife.security
import com.mvp.orilife.data.VirtualIDManager
import com.mvp.orilife.detection.SegmentationDetection

import android.content.Context
import android.util.Log
import com.mvp.orilife.database.HarvestDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class TrustScoreManager(private val context: Context) {

    companion object {
        private const val INITIAL_SCORE = 0.5f
        private const val MIN_SCORE = 0.0f
        private const val MAX_SCORE = 1.0f

        private const val AI_DETECTION_BOOST = 0.05f
        private const val HUMAN_VERIFY_BOOST = 0.10f
        private const val HUMAN_CORRECT_BOOST = 0.15f
        private const val HUMAN_WRONG_PENALTY = -0.10f
        private const val LOW_CONFIDENCE_PENALTY = -0.02f
        private const val HIGH_CONFIDENCE_BOOST = 0.03f
    }

    private val db = HarvestDatabase.getDatabase(context)

    suspend fun calculateInitialScore(detection: SegmentationDetection): Float {
        return withContext(Dispatchers.Default) {
            var score = INITIAL_SCORE

            score += when (detection.confidence) {
                in 0.9f..1.0f -> HIGH_CONFIDENCE_BOOST
                in 0.7f..0.9f -> 0.01f
                in 0.5f..0.7f -> 0.0f
                else -> LOW_CONFIDENCE_PENALTY
            }

            val adjustedScore = score.coerceIn(MIN_SCORE, MAX_SCORE)
            Log.d("TrustScore", "📊 Initial score: ${"%.2f".format(adjustedScore)} (confidence: ${detection.confidence})")

            adjustedScore
        }
    }

    suspend fun updateTrustScore(
        virtualID: String,
        event: TrustEvent,
        detection: SegmentationDetection? = null
    ): Result<Float> = withContext(Dispatchers.IO) {
        try {
            val currentInfo = VirtualIDManager.getVirtualInfo(virtualID)

            var newScore = currentInfo?.trustScore ?: INITIAL_SCORE

            when (event) {
                TrustEvent.AI_DETECTION -> {
                    newScore += AI_DETECTION_BOOST
                    if (detection != null) {
                        newScore += if (detection.confidence > 0.8f) {
                            HIGH_CONFIDENCE_BOOST
                        } else if (detection.confidence < 0.5f) {
                            LOW_CONFIDENCE_PENALTY
                        } else {
                            0.0f
                        }
                    }
                }

                TrustEvent.HUMAN_VERIFY -> {
                    newScore += HUMAN_VERIFY_BOOST
                }

                TrustEvent.HUMAN_CORRECT -> {
                    newScore += HUMAN_CORRECT_BOOST
                }

                TrustEvent.HUMAN_WRONG -> {
                    newScore += HUMAN_WRONG_PENALTY
                }
            }

            newScore = newScore.coerceIn(MIN_SCORE, MAX_SCORE)

            VirtualIDManager.updateVirtualInfo(virtualID) {
                it.copy(trustScore = newScore)
            }

            Log.d("TrustScore", "📊 Updated score for $virtualID: ${"%.2f".format(newScore)} ($event)")

            Result.success(newScore)

        } catch (e: Exception) {
            Log.e("TrustScore", "❌ Failed to update trust score", e)
            Result.failure(e)
        }
    }

    suspend fun getTrustScore(virtualID: String): Float {
        val info = VirtualIDManager.getVirtualInfo(virtualID)
        return info?.trustScore ?: INITIAL_SCORE
    }

    suspend fun getAverageTrustScore(): Float = withContext(Dispatchers.IO) {
        try {
            val allIDs = VirtualIDManager.getAllVirtualIDs()

            if (allIDs.isEmpty()) {
                return@withContext INITIAL_SCORE
            }

            var totalScore = 0.0f
            for (id in allIDs) {
                val info = VirtualIDManager.getVirtualInfo(id)
                totalScore += info?.trustScore ?: INITIAL_SCORE
            }

            val average = totalScore / allIDs.size

            Log.d("TrustScore", "📊 Average trust score: ${"%.2f".format(average)}")

            average
        } catch (e: Exception) {
            Log.e("TrustScore", "❌ Failed to calculate average", e)
            INITIAL_SCORE
        }
    }

    suspend fun resetTrustScore(virtualID: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            VirtualIDManager.updateVirtualInfo(virtualID) {
                it.copy(trustScore = INITIAL_SCORE)
            }

            Log.d("TrustScore", "🔄 Reset score for $virtualID")

            Result.success(Unit)
        } catch (e: Exception) {
            Log.e("TrustScore", "❌ Failed to reset trust score", e)
            Result.failure(e)
        }
    }

    fun getTrustScoreLabel(score: Float): String {
        return when {
            score >= 0.9f -> "Very High"
            score >= 0.75f -> "High"
            score >= 0.5f -> "Medium"
            score >= 0.25f -> "Low"
            else -> "Very Low"
        }
    }

    fun getTrustScoreColor(score: Float): Int {
        return when {
            score >= 0.9f -> 0xFF4CAF50.toInt() // Green
            score >= 0.75f -> 0xFF8BC34A.toInt() // Light Green
            score >= 0.5f -> 0xFFFFC107.toInt() // Orange
            score >= 0.25f -> 0xFFFF5722.toInt() // Red-Orange
            else -> 0xFFF44336.toInt() // Red
        }
    }

    fun getTrustScoreProgress(score: Float): Int {
        return (score * 100).toInt()
    }

    enum class TrustEvent {
        AI_DETECTION,
        HUMAN_VERIFY,
        HUMAN_CORRECT,
        HUMAN_WRONG
    }
}
