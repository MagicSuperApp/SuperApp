package com.mvp.orilife.ui
import com.mvp.orilife.detection.Detection

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PointF
import android.graphics.RectF
import android.util.AttributeSet
import android.util.Log
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.LinearInterpolator
import java.util.LinkedList
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min

class OverlayView(context: Context?, attrs: AttributeSet?) : View(context, attrs) {

    private var animator: android.animation.ValueAnimator? = null
    private var onLockCompleteListener: (() -> Unit)? = null

    private var results: List<Detection> = LinkedList<Detection>()
    private var boxPaint = Paint()
    private var textPaint = Paint()
    private var textBgPaint = Paint()
    private var reticlePaint = Paint()
    private var bounds = RectF()

    private var baseTextSize = 50f
    // Stroke mảnh, khớp xấp xỉ iOS (lineWidth ≈ 2.2 / densityFactor).
    // Trước đây = 8f → quá dày, che chi tiết khung detect.
    private var baseStrokeWidth = 1.5f
    private var densityFactor = 1f

    private var safeArea = android.graphics.Rect(0, 0, 0, 0)
    private var imageHeight = 0
    private var imageWidth = 0
    private var rotationDegrees = 0
    private var debugMode = false
    private var lastUpdateTime = 0L
    private var lastLogTime = 0L

    // ✅ FIX #3: Alpha cho fade-in/out animation — tránh box đơ/flash khi detection mất
    private var overlayAlpha: Float = 1.0f
    private var isFadingOut: Boolean = false

    private val gridPaint = Paint().apply {
        color = Color.parseColor("#40FFFFFF")
        style = Paint.Style.STROKE
        strokeWidth = 1f
    }

    private val debugInfoPaint = Paint().apply {
        color = Color.parseColor("#FFFF00")
        style = Paint.Style.FILL
        textSize = 24f
        setShadowLayer(4f, 0f, 0f, Color.BLACK)
    }

    private val centerPointPaint = Paint().apply {
        color = Color.parseColor("#FF0000")
        style = Paint.Style.FILL
    }

    private val crosshairPaint = Paint().apply {
        color = Color.parseColor("#FF0000")
        style = Paint.Style.STROKE
        strokeWidth = 2f
    }

    // ─── Scan animation (shown only while waiting for detection) ────────────
    enum class ScanMode { TREE, APPLE }

    private val scanDotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#4CAF50")
        style = Paint.Style.FILL
    }
    private var scanMode: ScanMode = ScanMode.TREE
    private var scanDots: List<PointF> = parsePattern(TREE_PATTERN)
    private var scanWaveProgress: Float = 0f
    private var scanAnimator: ValueAnimator? = null

    /**
     * Choose which silhouette to draw while waiting for detection.
     * Call this when launching a tree-scan vs fruit-scan feature.
     */
    fun setScanMode(mode: ScanMode) {
        if (scanMode == mode) return
        scanMode = mode
        scanDots = parsePattern(
            when (mode) {
                ScanMode.TREE -> TREE_PATTERN
                ScanMode.APPLE -> APPLE_PATTERN
            }
        )
        invalidate()
    }

    init {
        calculateDensityFactor()
        initPaints()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startScanAnimation()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopScanAnimation()
    }

    private fun startScanAnimation() {
        if (scanAnimator?.isRunning == true) return
        scanAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = SCAN_DURATION_MS
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            interpolator = LinearInterpolator()
            addUpdateListener {
                scanWaveProgress = it.animatedValue as Float
                // Only redraw if we're actually showing the silhouette (no detections).
                if (results.isEmpty() && !isFadingOut) invalidate()
            }
            start()
        }
    }

    private fun stopScanAnimation() {
        scanAnimator?.cancel()
        scanAnimator = null
    }

    /**
     * Calculate density factor for responsive UI across devices
     */
    private fun calculateDensityFactor() {
        val density = resources.displayMetrics.density
        densityFactor = density

        // Clamp to reasonable range (0.75x - 2.0x)
        densityFactor = densityFactor.coerceIn(0.75f, 2.0f)

        Log.d("OverlayView", "📐 Density: $density, Factor: $densityFactor")
    }

    /**
     * Recalculate density factor when layout changes
     */
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        Log.d("OverlayView", "📐 Size changed: ${oldw}x${oldh} → ${w}x${h}")

        // Recalculate scale factor based on new size
        if (w > 0 && h > 0) {
            val scaleFactor = minOf(w, h).toFloat() / 640f
            densityFactor = scaleFactor.coerceIn(0.5f, 1.5f)
            Log.d("OverlayView", "📐 Updated density factor: $densityFactor")
        }

        initPaints()
    }

    fun setTransformConfig(config: Any?) {
        // No-op: transform is now inline FILL_CENTER in draw()
    }

    fun setDebugMode(enabled: Boolean) {
        debugMode = enabled
        Log.d("OverlayView", "🐛 Debug mode: $enabled")
        invalidate()
    }

    fun toggleDebugMode() {
        debugMode = !debugMode
        Log.d("OverlayView", "🐛 Debug mode toggled: $debugMode")
        invalidate()
    }

    /**
     * Update safe area for system bars and notches
     */
    fun setSafeArea(left: Int, top: Int, right: Int, bottom: Int) {
        safeArea.set(left, top, right, bottom)
        Log.d("OverlayView", "📐 Safe area updated: [$left, $top, $right, $bottom]")
        invalidate()
    }

    fun clear() {
        // ✅ FIX #3: Cancel fade animation khi clear
        animator?.cancel()
        isFadingOut = false
        overlayAlpha = 1.0f
        results = emptyList()  // ✅ QUAN TRỌNG: xóa box NGAY không cần fade
        textPaint.reset()
        boxPaint.reset()
        invalidate()
        initPaints()
    }

    private fun initPaints() {
        textPaint.color = Color.WHITE
        textPaint.style = Paint.Style.FILL
        textPaint.textSize = baseTextSize * densityFactor
        textPaint.setShadowLayer(5f * densityFactor, 0f, 0f, Color.BLACK)

        boxPaint.color = Color.GREEN
        boxPaint.style = Paint.Style.STROKE
        boxPaint.strokeWidth = baseStrokeWidth * densityFactor
        boxPaint.strokeCap = Paint.Cap.ROUND
        boxPaint.strokeJoin = Paint.Join.ROUND

        textBgPaint.style = Paint.Style.FILL
        textBgPaint.alpha = 200

        reticlePaint.color = Color.WHITE
        reticlePaint.alpha = 100
        reticlePaint.style = Paint.Style.STROKE
        reticlePaint.strokeWidth = 2f * densityFactor
    }

    /** ✅ Mỗi label → màu riêng cho box + label bg */
    private fun getColorForLabel(label: String): Int {
        return when (label.lowercase()) {
            "trunk"  -> Color.parseColor("#2196F3")  // xanh dương
            "branch" -> Color.parseColor("#4CAF50")  // xanh lá
            "leaf"   -> Color.parseColor("#FFC107")  // vàng
            "fruit"  -> Color.parseColor("#FF9800")  // cam
            else     -> Color.parseColor("#9C27B0")  // tím
        }
    }

    override fun draw(canvas: Canvas) {
        super.draw(canvas)

        // ✅ FIX #3: Skip draw nếu đang fade out và results đã empty
        if (canvas.width <= 0 || canvas.height <= 0) return

        // Scan animation: hiện khi chưa detect được object nào, để hướng dẫn user.
        // Khi detection xuất hiện, animation sẽ tự động ẩn (không vẽ nữa).
        if (results.isEmpty() && !isFadingOut) {
            drawScanAnimation(canvas)
            return
        }

        // Boxes are in portrait image coords (already rotated by ImageProcessor).
        // PreviewView fillCenter: scale to FILL view, center, crop overflow.
        // We apply the same transform so boxes align with the camera preview.

        if (imageHeight <= 0 || imageWidth <= 0) return

        val scaleX = width.toFloat() / imageWidth
        val scaleY = height.toFloat() / imageHeight
        val scale = maxOf(scaleX, scaleY) // fillCenter = max scale

        val scaledW = imageWidth * scale
        val scaledH = imageHeight * scale
        val offsetX = (width - scaledW) / 2f
        val offsetY = (height - scaledH) / 2f

        // Throttle debug logs to once per 3 seconds
        val now = System.currentTimeMillis()
        val shouldLog = now - lastLogTime > 3000L
        if (shouldLog && results.isNotEmpty()) {
            lastLogTime = now
            Log.d("OverlayView", "🎨 Draw: ${results.size} boxes, img=${imageWidth}x${imageHeight}, view=${width}x${height}, scale=${"%.3f".format(scale)}, offset=(${"%.0f".format(offsetX)},${"%.0f".format(offsetY)})")
        }

        for ((index, result) in results.withIndex()) {
            val bb = result.boundingBox

            val screenBox = RectF(
                bb.left * scale + offsetX,
                bb.top * scale + offsetY,
                bb.right * scale + offsetX,
                bb.bottom * scale + offsetY
                )

            if (index == 0 && shouldLog) {
                Log.d("OverlayView", "  box=[${bb.left.toInt()},${bb.top.toInt()},${bb.right.toInt()},${bb.bottom.toInt()}] → screen=[${screenBox.left.toInt()},${screenBox.top.toInt()},${screenBox.right.toInt()},${screenBox.bottom.toInt()}]")
            }

            // Clip to visible area
            val clipped = RectF(
                screenBox.left.coerceAtLeast(0f),
                screenBox.top.coerceAtLeast(0f),
                screenBox.right.coerceAtMost(width.toFloat()),
                screenBox.bottom.coerceAtMost(height.toFloat())
            )

            // Skip if box is entirely outside view
            if (clipped.width() <= 0 || clipped.height() <= 0) continue

            // Draw box — màu matching với label text
            val boxColor = getColorForLabel(result.label)

            // ✅ FIX #3: Áp dụng alpha cho boxes khi đang fade
            boxPaint.alpha = (overlayAlpha * 255).toInt().coerceIn(0, 255)
            boxPaint.color = boxColor
            canvas.drawRect(clipped, boxPaint)

            // Draw label — tiếng Việt, KHÔNG hiện % (độ chính xác còn thấp → tránh tạo
            // niềm-tin-giả; theo nguyên tắc ẩn-nội-tạng: chỉ nói VẬT, không lộ điểm số).
            val label = when (result.label.lowercase()) {
                "trunk"  -> "Thân"
                "branch" -> "Cành"
                "leaf"   -> "Lá"
                "fruit"  -> "Quả"
                else     -> result.label
            }
            textBgPaint.color = boxColor
            textBgPaint.alpha = (200 * overlayAlpha).toInt().coerceIn(0, 255)

            val textBounds = android.graphics.Rect()
            textPaint.getTextBounds(label, 0, label.length, textBounds)

            val labelY = if (clipped.top > textBounds.height() + 20f) clipped.top else clipped.bottom + textBounds.height() + 20f
            val textBgRect = RectF(
                clipped.left,
                labelY - textBounds.height() - 20f,
                clipped.left + textBounds.width() + 20f,
                labelY
            )

            canvas.drawRect(textBgRect, textBgPaint)
            canvas.drawText(label, clipped.left + 10f, labelY - 10f, textPaint)
        }

        // Draw center reticle
        val cx = width / 2f
        val cy = height / 2f
        val reticleRadius = 30f * densityFactor
        val reticleLength = 20f * densityFactor
        canvas.drawCircle(cx, cy, reticleRadius, reticlePaint)
        canvas.drawLine(cx - reticleLength, cy, cx + reticleLength, cy, reticlePaint)
        canvas.drawLine(cx, cy - reticleLength, cx, cy + reticleLength, reticlePaint)

        if (debugMode) {
            drawDebugGrid(canvas)
            drawDebugInfo(canvas)
        }
    }

    private fun drawDebugGrid(canvas: Canvas) {
        val gridSize = 10
        val stepX = width / gridSize.toFloat()
        val stepY = height / gridSize.toFloat()

        for (i in 0..gridSize) {
            canvas.drawLine(i * stepX, 0f, i * stepX, height.toFloat(), gridPaint)
        }
        for (i in 0..gridSize) {
            canvas.drawLine(0f, i * stepY, width.toFloat(), i * stepY, gridPaint)
        }

        val borderPaint = Paint(gridPaint).apply {
            color = Color.parseColor("#80FFFFFF")
            strokeWidth = 2f
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), borderPaint)
    }

    private fun drawDebugInfo(canvas: Canvas) {
        val padding = 20f * densityFactor
        var y = padding + 30f * densityFactor

        val infoLines = mutableListOf<String>()
        infoLines.add("🐛 DEBUG MODE ON")
        infoLines.add("View: ${width}x${height}")
        infoLines.add("Image: ${imageWidth}x${imageHeight}")
        infoLines.add("Detections: ${results.size}")
        infoLines.add("Updated: ${System.currentTimeMillis() - lastUpdateTime}ms ago")

        infoLines.forEach { line ->
            canvas.drawText(line, padding, y, debugInfoPaint)
            y += 25f * densityFactor
        }
    }

    private var isLocking = false
    private var lockingProgress = 0f

    fun startLockingAnimation(duration: Long, onComplete: () -> Unit) {
        if (isLocking) return // Already locking

        isLocking = true
        onLockCompleteListener = onComplete

        animator?.cancel()
        animator = android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
            this.duration = duration
            addUpdateListener {
                lockingProgress = it.animatedValue as Float
                invalidate()
            }
            doOnEnd {
                if (isLocking) {
                     onLockCompleteListener?.invoke()
                }
            }
            start()
        }
    }

    fun cancelLocking() {
        isLocking = false
        lockingProgress = 0f
        animator?.cancel()
        invalidate()
    }

    // Extension for simple doOnEnd to avoid adding full listener
    private fun android.animation.ValueAnimator.doOnEnd(action: () -> Unit) {
        this.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                action()
            }
        })
    }

    // ✅ FIX #3: Fade-out animation khi cache bị clear (tránh box "nhảy" đột ngột)
    fun animateClear(durationMs: Long = 200) {
        // ✅ Ensure animation chỉ chạy trên Main thread — tránh crash nếu được gọi từ background
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { animateClear(durationMs) }
            return
        }
        if (results.isEmpty() || isFadingOut) return

        isFadingOut = true
        android.animation.ValueAnimator.ofFloat(1f, 0f).apply {
            duration = durationMs
            addUpdateListener { animator ->
                overlayAlpha = animator.animatedValue as Float
                invalidate()
            }
            doOnEnd {
                // Clear sau khi fade xong
                results = LinkedList<Detection>()
                overlayAlpha = 1.0f
                isFadingOut = false
                invalidate()
            }
            start()
        }
    }

    // ✅ Fade-in animation khi detection xuất hiện lại
    fun animateResults(
        newResults: List<Detection>,
        newImageHeight: Int,
        newImageWidth: Int,
        newRotationDegrees: Int = 0,
        durationMs: Long = 150
    ) {
        // ✅ Thread-safe: đảm bảo animation chỉ chạy trên Main thread
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                animateResults(newResults, newImageHeight, newImageWidth, newRotationDegrees, durationMs)
            }
            return
        }
        val previousResults = results
        results = newResults
        imageHeight = newImageHeight
        imageWidth = newImageWidth
        rotationDegrees = newRotationDegrees
        lastUpdateTime = System.currentTimeMillis()

        if (previousResults.isEmpty() && newResults.isNotEmpty()) {
            // Fade-in từ 0 → 1
            overlayAlpha = 0f
            isFadingOut = false
            android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
                duration = durationMs
                addUpdateListener { animator ->
                    overlayAlpha = animator.animatedValue as Float
                    invalidate()
                }
                doOnEnd {
                    overlayAlpha = 1.0f
                    invalidate()
                }
                start()
            }
        } else {
            invalidate()
        }
    }

    fun setResults(
        results: List<Detection>,
        imageHeight: Int,
        imageWidth: Int,
        rotationDegrees: Int = 0
    ) {
        // ✅ Thread-safe: đảm bảo invalidate() luôn được gọi trên Main thread
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                setResults(results, imageHeight, imageWidth, rotationDegrees)
            }
            return
        }
        // ✅ FIX #3: Nếu đang fade out thì cancel animation trước khi set results mới
        if (isFadingOut && results.isNotEmpty()) {
            animator?.cancel()
            isFadingOut = false
            overlayAlpha = 1.0f
        }
        this.results = results
        this.imageHeight = imageHeight
        this.imageWidth = imageWidth
        this.rotationDegrees = rotationDegrees
        this.lastUpdateTime = System.currentTimeMillis()
        invalidate()
    }

    // ─── Scan animation drawing ─────────────────────────────────────────────

    private fun drawScanAnimation(canvas: Canvas) {
        if (scanDots.isEmpty() || width == 0 || height == 0) return

        val sizePx = min(width, height) * 0.70f
        val left = (width - sizePx) / 2f
        val top = (height - sizePx) / 2f
        // Base dot radius scales to grid cell size so dots line up like a pixel grid
        val baseRadius = (sizePx / GRID_SIZE) * 0.20f

        for (p in scanDots) {
            // Wave moves top→bottom as scanWaveProgress goes 0→1.
            // Each dot pulses in ease-in-out bell shape when wave passes its Y.
            val dy = scanWaveProgress - p.y
            val w: Float = when {
                dy < -SCAN_PULSE_LEAD -> 0f
                dy > SCAN_PULSE_TAIL -> 0f
                dy < 0f -> {
                    val t = (dy + SCAN_PULSE_LEAD) / SCAN_PULSE_LEAD
                    (1f - cos(PI.toFloat() * t)) / 2f
                }
                else -> {
                    val t = dy / SCAN_PULSE_TAIL
                    (1f + cos(PI.toFloat() * t)) / 2f
                }
            }

            val scale = SCAN_BASE_SCALE + (SCAN_PEAK_SCALE - SCAN_BASE_SCALE) * w
            val alpha = SCAN_BASE_ALPHA + (SCAN_PEAK_ALPHA - SCAN_BASE_ALPHA) * w

            val cx = left + p.x * sizePx
            val cy = top + p.y * sizePx

            scanDotPaint.alpha = (alpha * 255f).toInt().coerceIn(0, 255)
            canvas.drawCircle(cx, cy, baseRadius * scale, scanDotPaint)
        }
    }

    companion object {
        private const val GRID_SIZE = 40f
        private const val SCAN_PULSE_LEAD = 0.22f
        private const val SCAN_PULSE_TAIL = 0.18f
        private const val SCAN_BASE_SCALE = 0.85f
        private const val SCAN_PEAK_SCALE = 1.9f
        private const val SCAN_BASE_ALPHA = 0.35f
        private const val SCAN_PEAK_ALPHA = 1.0f
        private const val SCAN_DURATION_MS = 2200L

        /**
         * Lưới 40×40, mỗi ô là 1 chấm.
         * '1' = vẽ chấm, '0' = bỏ trống. Sửa hình thù bằng cách sắp xếp lại chuỗi.
         */
        private val TREE_PATTERN = arrayOf(
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000111111000001111100000000000",
            "0000000000111111111111111111111000000000",
            "0000001111111111111111111111111110000000",
            "0000111111111111111111111111111111100000",
            "0000111111111111111111111111111111100000",
            "0001111111111111111111111111111111000000",
            "0111111111111111111111111111111111100000",
            "1111111111111111111111111111111111111000",
            "1111111111111111111111111111111111111110",
            "0111111111111111111111111111111111111100",
            "0001111111111111111111111111111111111000",
            "0000111111111111111111111111111111110000",
            "0001111111111111111111111111111111111000",
            "0011111111111111111111111111111111111100",
            "0111111111111111111111111111111111111110",
            "0111111111111111111111111111111111111100",
            "0011111111111111111111111111111111110000",
            "0000111111111111111111111111111111100000",
            "0000000011111111111111111111111110000000",
            "0000000000111111111111111111000000000000",
            "0000000000000111111111111110000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000000001111111111000111000000000",
            "0000000000000000111111110011111100000000",
            "0000000000000000001111000111111100000000",
            "0000000000000000001111000111110000000000",
            "0000000000000000001111011100000000000000",
            "0000000000000000001111111000000000000000",
            "0000000000000000001111100000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000011111100000000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000000000000000000000000000000"
        )

        private val APPLE_PATTERN = arrayOf(
            "0000000000000000000000000000000000000000",
            "0000000000000000000110000000000000000000",
            "0000000000000000000110000000000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000001111111111111111000000000000",
            "0000000000011111111111111111100000000000",
            "0000000000111111111111111111110000000000",
            "0000000001111111111111111111111000000000",
            "0000000011111111111111111111111100000000",
            "0000000011111111111111111111111100000000",
            "0000000111111111111111111111111110000000",
            "0000000111111111111111111111111110000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000000111111111111111111111111110000000",
            "0000000111111111111111111111111110000000",
            "0000000011111111111111111111111100000000",
            "0000000011111111111111111111111100000000",
            "0000000001111111111111111111111000000000",
            "0000000000111111111111111111110000000000",
            "0000000000011111111111111111100000000000",
            "0000000000001111111111111111000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000"
        )

        /**
         * Đọc lưới ký tự thành danh sách điểm normalized [0,1]².
         * Mỗi cell '1' thành 1 PointF tại tâm cell.
         */
        private fun parsePattern(pattern: Array<String>): List<PointF> {
            val rows = pattern.size
            if (rows == 0) return emptyList()
            val cols = pattern[0].length
            val dots = ArrayList<PointF>()
            for (r in 0 until rows) {
                val line = pattern[r]
                for (c in 0 until cols) {
                    if (c < line.length && line[c] == '1') {
                        val x = (c + 0.5f) / cols
                        val y = (r + 0.5f) / rows
                        dots.add(PointF(x, y))
                    }
                }
            }
            return dots
        }
    }
}
