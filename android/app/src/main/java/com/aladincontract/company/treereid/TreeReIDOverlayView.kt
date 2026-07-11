package com.aladincontract.company.treereid

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View

/**
 * Overlay vẽ khung YOLO lên preview TreeReID (nằm trên PreviewView, FILL_CENTER).
 *
 * Box nhận vào là toạ-độ CHUẨN-HOÁ [0,1] theo frame ĐÃ XOAY về portrait (TreeReIDCamera
 * xoay bitmap trước khi detect). Map sang pixel view theo aspect-fill (center-crop) —
 * cùng cách PreviewView.FILL_CENTER hiển thị → khung khớp nội-dung.
 *
 * ⚠️ Vị trí có thể cần canh lại trên máy thật (mirror/aspect thực tế theo thiết bị).
 */
class TreeReIDOverlayView(context: Context) : View(context) {

    @Volatile private var boxes: List<TreeReIDYolo.Box> = emptyList()
    /** frameW/frameH của frame ĐÃ xoay (portrait → < 1). */
    @Volatile private var frameAspect: Float = 0f

    private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(77, 176, 80)  // xanh lá
        style = Paint.Style.STROKE
        strokeWidth = 4f * resources.displayMetrics.density
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(77, 176, 80)
        textSize = 12f * resources.displayMetrics.scaledDensity
        style = Paint.Style.FILL
    }

    /** Cập nhật box (gọi được từ thread nền — dùng postInvalidate). */
    fun setBoxes(newBoxes: List<TreeReIDYolo.Box>, aspect: Float) {
        boxes = newBoxes
        frameAspect = aspect
        postInvalidate()
    }

    fun clear() {
        boxes = emptyList()
        postInvalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val fa = frameAspect
        val b = boxes
        if (fa <= 0f || b.isEmpty()) return

        val vw = width.toFloat()
        val vh = height.toFloat()
        if (vw <= 0f || vh <= 0f) return
        val va = vw / vh

        // aspect-fill (center-crop): frame lấp đầy view, phần thừa bị cắt.
        val dispW: Float
        val dispH: Float
        if (va > fa) { dispW = vw; dispH = vw / fa } else { dispH = vh; dispW = vh * fa }
        val offX = (vw - dispW) / 2f
        val offY = (vh - dispH) / 2f

        for (box in b) {
            val l = offX + box.x * dispW
            val t = offY + box.y * dispH
            val r = l + box.w * dispW
            val bot = t + box.h * dispH
            canvas.drawRect(l, t, r, bot, boxPaint)
            canvas.drawText("${(box.conf * 100).toInt()}%", l + 4f, t + textPaint.textSize + 2f, textPaint)
        }
    }
}
