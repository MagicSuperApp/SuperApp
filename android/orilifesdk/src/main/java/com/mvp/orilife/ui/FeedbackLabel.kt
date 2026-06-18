package com.mvp.orilife.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.mvp.orilife.R

/**
 * Status feedback label showing current scanner state.
 * Matches iOS FeedbackLabel.swift.
 */
class FeedbackLabel @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    private val label = TextView(context).apply {
        textSize = 13f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
    }

    private var statusColor: Int = Color.WHITE

    init {
        val drawable = GradientDrawable().apply {
            setColor(Color.parseColor("#B3000000"))
            cornerRadius = 16f
        }
        background = drawable

        val lp = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
        lp.gravity = Gravity.CENTER
        addView(label, lp)

        visibility = GONE
    }

    fun show(message: String, color: Int = Color.WHITE) {
        label.text = message
        label.setTextColor(color)
        statusColor = color

        visibility = VISIBLE
        alpha = 0f
        animate().alpha(1f).setDuration(200).start()
    }

    fun hide() {
        animate()
            .alpha(0f)
            .setDuration(200)
            .withEndAction {
                visibility = GONE
            }
            .start()
    }
}