package com.mvp.orilife.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.min

/**
 * Progress ring showing captured count out of 8 sectors.
 * Matches iOS ProgressRingView.swift.
 */
class ProgressRingView @JvmOverloads constructor(
    context: Context?,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private val backgroundRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#33FFFFFF")
        style = Paint.Style.STROKE
        strokeWidth = 8f
    }

    private val progressRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#4CAF50")
        style = Paint.Style.STROKE
        strokeWidth = 8f
        strokeCap = Paint.Cap.ROUND
    }

    private val countLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 40f
        textAlign = Paint.Align.CENTER
    }

    private val captionLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#B3FFFFFF")
        textSize = 20f
        textAlign = Paint.Align.CENTER
    }

    private val arcRect = RectF()
    private var capturedCount: Int = 0
    private var totalSectors: Int = 8
    private var animatedProgress: Float = 0f

    var progress: Float = 0f
        set(value) {
            field = value
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val centerX = width / 2f
        val centerY = height / 2f
        val radius = min(width, height) / 2f - 8f

        arcRect.set(
            centerX - radius,
            centerY - radius,
            centerX + radius,
            centerY + radius
        )

        canvas.drawArc(arcRect, -90f, 360f, false, backgroundRingPaint)

        val sweepAngle = 360f * animatedProgress
        canvas.drawArc(arcRect, -90f, sweepAngle, false, progressRingPaint)

        val textY = centerY + 8f
        canvas.drawText("$capturedCount/$totalSectors", centerX, textY, countLabelPaint)

        val captionY = centerY + 40f
        canvas.drawText("Hình", centerX, captionY, captionLabelPaint)
    }

    fun setCapturedCount(count: Int) {
        capturedCount = count
        val targetProgress = count.toFloat() / totalSectors

        ValueAnimator.ofFloat(animatedProgress, targetProgress).apply {
            duration = 300
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { animator ->
                animatedProgress = animator.animatedValue as Float
                invalidate()
            }
            start()
        }
    }
}