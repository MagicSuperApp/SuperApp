package com.mvp.orilife.ui
import com.mvp.orilife.data.VirtualIDManager
import com.mvp.orilife.security.TrustScoreManager

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class HumanOverrideDialog(
    private val context: Context,
    private val virtualID: String,
    private val confidence: Float,
    private val label: String,
    private val listener: OverrideListener
) {

    interface OverrideListener {
        fun onConfirm(isCorrect: Boolean)
        fun onCancel()
    }

    fun show() {
        val trustScoreManager = TrustScoreManager(context)
        val virtualInfo = VirtualIDManager.getVirtualInfo(virtualID)

        val alertDialogBuilder = AlertDialog.Builder(context)
        alertDialogBuilder.setTitle("🔍 Verify Detection")
        alertDialogBuilder.setCancelable(false)

        val layout = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(50, 40, 50, 10)
        }

        // Virtual ID
        val tvVirtualID = TextView(context).apply {
            text = "Virtual ID: $virtualID"
            textSize = 14f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#212121"))
            setPadding(0, 10, 0, 10)
        }
        layout.addView(tvVirtualID)

        // Label
        val tvLabel = TextView(context).apply {
            text = "Label: $label"
            textSize = 14f
            setTextColor(Color.parseColor("#757575"))
            setPadding(0, 5, 0, 5)
        }
        layout.addView(tvLabel)

        // Confidence Progress
        val tvConfidenceLabel = TextView(context).apply {
            text = "AI Confidence: ${(confidence * 100).toInt()}%"
            textSize = 14f
            setTextColor(Color.parseColor("#757575"))
            setPadding(0, 10, 0, 5)
        }
        layout.addView(tvConfidenceLabel)

        val progressBar = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = (confidence * 100).toInt()
        }
        layout.addView(progressBar)

        // Current Trust Score
        val currentTrustScore = virtualInfo?.trustScore ?: 0.5f
        val tvTrustScoreLabel = TextView(context).apply {
            text = "Trust Score: ${trustScoreManager.getTrustScoreLabel(currentTrustScore)} (${"%.2f".format(currentTrustScore)})"
            textSize = 14f
            setTextColor(trustScoreManager.getTrustScoreColor(currentTrustScore))
            setPadding(0, 10, 0, 5)
        }
        layout.addView(tvTrustScoreLabel)

        val trustScoreProgressBar = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = trustScoreManager.getTrustScoreProgress(currentTrustScore)
            progressTintList = android.content.res.ColorStateList.valueOf(
                trustScoreManager.getTrustScoreColor(currentTrustScore)
            )
        }
        layout.addView(trustScoreProgressBar)

        // Warning about manual verification
        val tvWarning = TextView(context).apply {
            text = "⚠️ Manual verification will reduce trust score"
            textSize = 12f
            setTextColor(Color.parseColor("#FF9800"))
            setPadding(0, 15, 0, 5)
        }
        layout.addView(tvWarning)

        alertDialogBuilder.setView(layout)

        alertDialogBuilder.setPositiveButton("✅ Correct") { _, _ ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    trustScoreManager.updateTrustScore(
                        virtualID,
                        TrustScoreManager.TrustEvent.HUMAN_CORRECT
                    )

                    listener.onConfirm(true)

                    (context as android.app.Activity).runOnUiThread {
                        Toast.makeText(
                            context,
                            "✅ Verified as Correct",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                } catch (e: Exception) {
                    (context as android.app.Activity).runOnUiThread {
                        Toast.makeText(
                            context,
                            "❌ Failed to update trust score",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        }

        alertDialogBuilder.setNegativeButton("❌ Wrong") { _, _ ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    trustScoreManager.updateTrustScore(
                        virtualID,
                        TrustScoreManager.TrustEvent.HUMAN_WRONG
                    )

                    listener.onConfirm(false)

                    (context as android.app.Activity).runOnUiThread {
                        Toast.makeText(
                            context,
                            "❌ Verified as Wrong",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                } catch (e: Exception) {
                    (context as android.app.Activity).runOnUiThread {
                        Toast.makeText(
                            context,
                            "❌ Failed to update trust score",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        }

        alertDialogBuilder.setNeutralButton("Cancel") { _, _ ->
            listener.onCancel()
        }

        alertDialogBuilder.show()
    }

    companion object {
        fun showVerificationDialog(
            context: Context,
            virtualID: String,
            confidence: Float,
            label: String,
            onCorrect: () -> Unit,
            onWrong: () -> Unit,
            onCancel: () -> Unit
        ) {
            val dialog = HumanOverrideDialog(
                context,
                virtualID,
                confidence,
                label,
                object : OverrideListener {
                    override fun onConfirm(isCorrect: Boolean) {
                        if (isCorrect) {
                            onCorrect()
                        } else {
                            onWrong()
                        }
                    }

                    override fun onCancel() {
                        onCancel()
                    }
                }
            )

            dialog.show()
        }
    }
}
