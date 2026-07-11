package com.aladincontract.company.treereid

import android.content.Context
import android.widget.FrameLayout
import androidx.camera.view.PreviewView

/**
 * Wrapper FrameLayout chứa CameraX PreviewView (PreviewView là final, không subclass được).
 *
 * Fix layout cho React Native (New Arch/Fabric interop): RN KHÔNG tự chạy layout pass
 * cho view con của native view → PreviewView bên trong bị 0 kích thước → preview đen.
 * Ép measure + layout mỗi khi requestLayout → preview hiển thị đúng bounds RN gán.
 */
class TreeReIDPreviewView(context: Context) : FrameLayout(context) {

    val previewView: PreviewView = PreviewView(context).apply {
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    }

    /** Overlay vẽ khung YOLO — nằm TRÊN preview. */
    private val overlay = TreeReIDOverlayView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    }

    init {
        addView(previewView)
        addView(overlay)
        // Nhận box realtime từ analyzer YOLO (chạy nền → overlay tự postInvalidate).
        TreeReIDCamera.onBoxes = { boxes, aspect -> overlay.setBoxes(boxes, aspect) }
    }

    override fun onDetachedFromWindow() {
        // Tránh giữ tham chiếu view sau khi gỡ preview.
        if (TreeReIDCamera.onBoxes != null) TreeReIDCamera.onBoxes = null
        overlay.clear()
        super.onDetachedFromWindow()
    }

    private val layoutRunnable = Runnable {
        if (width > 0 && height > 0) {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
            )
            layout(left, top, right, bottom)
        }
    }

    override fun requestLayout() {
        super.requestLayout()
        post(layoutRunnable)
    }
}
