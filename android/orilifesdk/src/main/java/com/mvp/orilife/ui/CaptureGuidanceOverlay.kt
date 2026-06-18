package com.mvp.orilife.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.util.Log
import android.view.MotionEvent
import android.view.View
import com.mvp.orilife.coordinator.CircularSessionState
import com.mvp.orilife.coordinator.CircularState
import com.mvp.orilife.coordinator.Guidance
import com.mvp.orilife.coordinator.GuidanceDirection
import kotlin.math.min

/**
 * Overlay tối giản: chỉ dots + mũi tên + text hướng dẫn.
 * KHÔNG có compass để không che khuất camera feed.
 */
class CaptureGuidanceOverlay @JvmOverloads constructor(
    context: Context?,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // ─── Paints ─────────────────────────────────────────────────────────────

    private val dotCapturedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#4CAF50")
        style = Paint.Style.FILL
    }

    private val dotPendingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#80FFFFFF")
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }

    private val arrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#60000000")
        style = Paint.Style.FILL
    }

    private val textMainPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 64f
        textAlign = Paint.Align.CENTER
        setShadowLayer(4f, 0f, 2f, Color.BLACK)
    }

    private val textSubPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#CCFFFFFF")
        textSize = 40f
        textAlign = Paint.Align.CENTER
        setShadowLayer(3f, 0f, 1f, Color.BLACK)
    }

    private val completePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#4CAF50")
        textSize = 56f
        textAlign = Paint.Align.CENTER
        setShadowLayer(4f, 0f, 2f, Color.BLACK)
    }

    // ─── Layout ─────────────────────────────────────────────────────────────

    private val dotRadius = 10f
    private val dotSpacing = 50f
    private val dotCenterY get() = 50f

    private val arrowSize = 80f
    private val arrowCenterY get() = height * 0.42f
    private val textCenterY get() = height * 0.62f

    // ─── State ──────────────────────────────────────────────────────────────

    private var sessionState: CircularSessionState = CircularSessionState()

    // ✅ Skip button callback — gọi khi user nhấn "Bỏ qua"
    var onSkipClicked: (() -> Unit)? = null

    // Skip button bounds (calculated in onSizeChanged)
    private var skipButtonRect = android.graphics.RectF()
    private var isSkipButtonVisible = false

    fun bindState(state: CircularSessionState) {
        sessionState = state
        visibility = if (state.state == CircularState.INACTIVE) INVISIBLE else VISIBLE
        // Hiện skip button trong cả GUIDANCE và STATIONARY_WAIT (match iOS).
        // User có thể bỏ qua sector hiện tại bất cứ lúc nào trong session active.
        isSkipButtonVisible = state.state == CircularState.GUIDANCE ||
                              state.state == CircularState.STATIONARY_WAIT

        // ✅ Init skip button rect nếu chưa được set (onSizeChanged chưa fire)
        if (skipButtonRect.isEmpty && width > 0 && height > 0) {
            recalculateSkipButtonRect()
        }

        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        recalculateSkipButtonRect()
    }

    private fun recalculateSkipButtonRect() {
        // Bottom-center, ngay trên statusContainer (~100dp tính cả margin+padding+height).
        // Match vị trí skipButton ở iOS ScannerViewController (bottom-center, safe-area bottom -24).
        val density = context.resources.displayMetrics.density
        val btnW = 180f * density        // rộng hơn để chứa "Bỏ qua section"
        val btnH = 44f * density         // pill cao 44dp như iOS
        val bottomOffset = 120f * density // cách đáy 120dp → trên statusContainer
        val btnX = (width - btnW) / 2f   // center horizontally
        val btnY = height - bottomOffset - btnH
        skipButtonRect = android.graphics.RectF(btnX, btnY, btnX + btnW, btnY + btnH)
    }

    override fun performClick(): Boolean {
        super.performClick()
        // Kiểm tra skip button tap
        // Will be handled in onTouchEvent
        return true
    }

    override fun onTouchEvent(event: android.view.MotionEvent): Boolean {
        if (event.action == android.view.MotionEvent.ACTION_UP && isSkipButtonVisible) {
            if (skipButtonRect.contains(event.x, event.y)) {
                Log.d("CaptureGuidanceOverlay", "👆 SKIP BUTTON TAPPED")
                onSkipClicked?.invoke()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    // ─── Drawing ─────────────────────────────────────────────────────────────

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (sessionState.state == CircularState.INACTIVE) return

        when (sessionState.state) {
            CircularState.GUIDANCE -> {
                drawSectors(canvas)
                drawGuidance(canvas)
                if (isSkipButtonVisible) drawSkipButton(canvas)
            }
            CircularState.STATIONARY_WAIT -> {
                drawSectors(canvas)
                drawStationaryWait(canvas)
                if (isSkipButtonVisible) drawSkipButton(canvas)
            }
            CircularState.CAPTURE_TRIGGERED -> {
                drawSectors(canvas)
                drawCapturing(canvas)
            }
            CircularState.COMPLETE -> {
                drawSectors(canvas)
                drawComplete(canvas)
            }
            else -> { /* nothing */ }
        }
    }

    // ─── Dots — hiển thị tất cả sectors đã capture ───────────────────────

    private fun drawSectors(canvas: Canvas) {
        val sectors = sessionState.sectors
        if (sectors.isEmpty()) return

        // Hiển thị tất cả 8 sectors: captured = filled, pending = outlined
        val totalWidth = (sectors.size - 1) * dotSpacing
        val startX = width / 2f - totalWidth / 2f

        for (i in sectors.indices) {
            val x = startX + i * dotSpacing
            val sector = sectors[i]
            val paint = if (sector.isCaptured) dotCapturedPaint else dotPendingPaint
            canvas.drawCircle(x, dotCenterY, dotRadius, paint)
        }
    }

    // ─── Guidance (mũi tên + text) ───────────────────────────────────────

    private fun drawGuidance(canvas: Canvas) {
        val guidance = sessionState.guidance ?: return

        // Heading realtime — hiển thị hướng hiện tại
        val headingTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#80FFFFFF")
            textSize = 28f
            textAlign = Paint.Align.CENTER
        }
        // "La bàn" (không phải "Hướng") để khỏi nhầm là "độ còn lại": đây là góc la-bàn
        // tuyệt-đối nên TĂNG khi xoay sang phải/Đông là đúng. Mũi tên + chữ bên dưới mới
        // là chỉ-dẫn "xoay phải/trái tới góc tiếp".
        val heading = sessionState.currentHeading
        val headingText = if (heading != null) "La bàn: ${heading.toInt()}°" else "Đang lấy hướng..."

        // Measure text widths để resize background responsive
        val mainText = guidance.instructionText
        val mainTextWidth = textMainPaint.measureText(mainText)
        val headingTextWidth = headingTextPaint.measureText(headingText)

        // Background padding
        val horizPad = 48f
        val maxTextWidth = maxOf(mainTextWidth, headingTextWidth)
        val bgWidth = maxTextWidth + horizPad * 2

        // Giảm text size nếu text quá rộng
        val maxAllowedWidth = this.width * 0.85f
        var effectiveTextSize = 64f
        var effectiveHeadingSize = 28f
        if (maxTextWidth > maxAllowedWidth) {
            val scale = maxAllowedWidth / maxTextWidth
            effectiveTextSize = (64f * scale).coerceAtLeast(36f)
            effectiveHeadingSize = (28f * scale).coerceAtLeast(20f)
        }

        val effectiveMainPaint = Paint(textMainPaint).apply { textSize = effectiveTextSize }
        val effectiveHeadingPaint = Paint(headingTextPaint).apply { textSize = effectiveHeadingSize }

        val bgHeight = 280f
        val bgY = arrowCenterY - arrowSize - 20f
        canvas.drawRoundRect(
            width / 2f - bgWidth / 2f, bgY,
            width / 2f + bgWidth / 2f, bgY + bgHeight,
            24f, 24f, bgPaint
        )

        // Heading
        canvas.drawText(headingText, width / 2f, bgY + 36f, effectiveHeadingPaint)

        // Mũi tên
        val arrowX = width / 2f
        drawArrow(canvas, arrowX, arrowCenterY, guidance)

        // ✅ Dùng instructionText từ Guidance — responsive size
        canvas.drawText(mainText, width / 2f, textCenterY, effectiveMainPaint)
    }

    private fun drawStationaryWait(canvas: Canvas) {
        // Measure text để resize responsive
        val mainText = "Dừng lại"
        val subText = "giữ yên để chụp"
        val mainWidth = textMainPaint.measureText(mainText)
        val subWidth = textSubPaint.measureText(subText)
        val maxWidth = maxOf(mainWidth, subWidth)
        val bgWidth = maxWidth + 80f

        val bgHeight = 180f
        val bgY = arrowCenterY - arrowSize - 20f
        canvas.drawRoundRect(
            width / 2f - bgWidth / 2f, bgY,
            width / 2f + bgWidth / 2f, bgY + bgHeight,
            24f, 24f, bgPaint
        )

        canvas.drawText(mainText, width / 2f, textCenterY, textMainPaint)
        canvas.drawText(subText, width / 2f, textCenterY + 56f, textSubPaint)
    }

    // ─── Skip Button ────────────────────────────────────────────────────────

    // Match iOS skipButton: nền vàng-nâu RGB(0.72, 0.59, 0.35) ~ #B89559, alpha 0.8
    private val skipBtnPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#CCB89559")
        style = Paint.Style.FILL
    }

    private val skipBtnStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#80FFFFFF")
        style = Paint.Style.STROKE
        strokeWidth = 2f
    }

    private val skipBtnTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 36f
        textAlign = Paint.Align.CENTER
        setShadowLayer(2f, 0f, 1f, Color.BLACK)
    }

    private fun drawSkipButton(canvas: Canvas) {
        if (skipButtonRect.isEmpty) return

        // Vẽ nền button — pill bo tròn theo chiều cao (match iOS .medium cornerStyle)
        val radius = skipButtonRect.height() / 2f
        canvas.drawRoundRect(skipButtonRect, radius, radius, skipBtnPaint)
        canvas.drawRoundRect(skipButtonRect, radius, radius, skipBtnStrokePaint)

        // Vẽ text
        val text = "Bỏ qua section"
        val textY = skipButtonRect.centerY() + skipBtnTextPaint.textSize / 3f
        canvas.drawText(text, skipButtonRect.centerX(), textY, skipBtnTextPaint)
    }

    private fun drawCapturing(canvas: Canvas) {
        val text = "Đang chụp..."
        val textWidth = textMainPaint.measureText(text)
        val bgWidth = textWidth + 80f

        val bgHeight = 160f
        val bgY = arrowCenterY - 40f
        canvas.drawRoundRect(
            width / 2f - bgWidth / 2f, bgY,
            width / 2f + bgWidth / 2f, bgY + bgHeight,
            24f, 24f, bgPaint
        )

        canvas.drawText(text, width / 2f, textCenterY, textMainPaint)
    }

    // ─── Mũi tên ───────────────────────────────────────────────────────────

    private fun drawArrow(canvas: Canvas, cx: Float, cy: Float, guidance: Guidance) {
        val s = arrowSize
        val path = Path()

        when (guidance.direction) {
            GuidanceDirection.CLOCKWISE -> {
                // Mũi tên sang PHẢI
                path.moveTo(cx - s * 0.3f, cy - s * 0.6f)
                path.lineTo(cx + s * 0.7f, cy)
                path.lineTo(cx - s * 0.3f, cy + s * 0.6f)
            }
            GuidanceDirection.COUNTER_CLOCKWISE -> {
                // Mũi tên sang TRÁI
                path.moveTo(cx + s * 0.3f, cy - s * 0.6f)
                path.lineTo(cx - s * 0.7f, cy)
                path.lineTo(cx + s * 0.3f, cy + s * 0.6f)
            }
            GuidanceDirection.ARRIVED -> {
                // ↓
                path.moveTo(cx, cy - s * 0.5f)
                path.lineTo(cx + s * 0.5f, cy + s * 0.5f)
                path.lineTo(cx - s * 0.5f, cy + s * 0.5f)
            }
        }
        path.close()
        canvas.drawPath(path, arrowPaint)
    }

    // ─── Complete ─────────────────────────────────────────────────────────

    private fun drawComplete(canvas: Canvas) {
        val mainText = "✅ Đã chụp đủ góc!"
        val subText = "Tải lên hoặc Lưu local"
        val mainWidth = completePaint.measureText(mainText)
        val subWidth = textSubPaint.measureText(subText)
        val maxWidth = maxOf(mainWidth, subWidth)
        val bgWidth = maxWidth + 80f

        val bgHeight = 200f
        val bgY = arrowCenterY - 60f
        canvas.drawRoundRect(
            width / 2f - bgWidth / 2f, bgY,
            width / 2f + bgWidth / 2f, bgY + bgHeight,
            24f, 24f, bgPaint
        )

        canvas.drawText(mainText, width / 2f, textCenterY, completePaint)
        canvas.drawText(subText, width / 2f, textCenterY + 56f, textSubPaint)
    }
}
