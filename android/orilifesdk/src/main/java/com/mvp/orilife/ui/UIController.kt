package com.mvp.orilife.ui

import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.mvp.orilife.detection.Detection
import com.mvp.orilife.R

/**
 * Loại trạng thái — quyết định icon + màu sắc hiển thị trên status card.
 * Mỗi loại tự gán drawable vector (không dùng emoji).
 */
enum class StatusType(val iconRes: Int, val tint: Int) {
    SCANNING (R.drawable.ic_status_scanning,   0xFF4CD964.toInt()),  // green
    DETECTED (R.drawable.ic_tree,              0xFF4CD964.toInt()),
    FOCUSING (R.drawable.ic_status_focus,      0xFFFFC107.toInt()),  // amber
    CAMERA_ON(R.drawable.ic_status_camera,     0xFF4CD964.toInt()),
    CAMERA_OFF(R.drawable.ic_status_camera_off,0xFF9E9E9E.toInt()),  // grey
    UPLOADING(R.drawable.ic_cloud_upload,      0xFF42A5F5.toInt()),  // blue
    SUCCESS  (R.drawable.ic_status_check,      0xFF4CD964.toInt()),
    ERROR    (R.drawable.ic_status_alert,      0xFFEF5350.toInt()),  // red
    OFFLINE  (R.drawable.ic_wifi_off,          0xFFFFC107.toInt()),
    LOW_POWER(R.drawable.ic_status_battery,    0xFFFFC107.toInt()),
}

class UIController(
    private val rootView: View,
    @Suppress("UNUSED_PARAMETER") private val lifecycleOwner: LifecycleOwner,
) {
    private val statusView: TextView? = rootView.findViewById(R.id.tvStatus)
    private val statusIconView: ImageView? = rootView.findViewById(R.id.imgStatusIcon)
    private val overlayView: OverlayView? = rootView.findViewById(R.id.overlay)
    private val pendingCountView: TextView? = rootView.findViewById(R.id.tvPendingCount)
    private val loadingOverlay: View? = rootView.findViewById(R.id.loadingOverlay)
    private val loadingMessage: TextView? = rootView.findViewById(R.id.tvLoadingMessage)
    private val loadingSubtext: TextView? = rootView.findViewById(R.id.tvLoadingSubtext)

    /**
     * Cập nhật status — hiển thị message + icon tương ứng với type.
     * Không dùng emoji trong message — type lo phần icon.
     */
    fun updateStatus(message: String, type: StatusType = StatusType.SCANNING) {
        statusView?.text = message
        statusIconView?.let { iv ->
            iv.setImageResource(type.iconRes)
            iv.colorFilter = PorterDuffColorFilter(type.tint, PorterDuff.Mode.SRC_IN)
        }
    }

    /** Backward-compat: nếu code cũ truyền chuỗi đơn → mặc định SCANNING. */
    fun updateStatus(message: String) = updateStatus(message, StatusType.SCANNING)

    fun updateOverlay(detections: List<Detection>, imageWidth: Int, imageHeight: Int, rotationDegrees: Int = 0) {
        overlayView?.setResults(detections, imageHeight, imageWidth, rotationDegrees)
    }

    fun updatePendingCount(count: Int) {
        pendingCountView?.text = "Chờ đồng bộ: $count"
        pendingCountView?.visibility = if (count > 0) View.VISIBLE else View.GONE
    }

    fun showLoading(message: String = "Đang xử lý", subtext: String = "Vui lòng chờ") {
        loadingMessage?.text = message
        loadingSubtext?.text = subtext
        loadingOverlay?.visibility = View.VISIBLE
    }

    fun hideLoading() {
        loadingOverlay?.visibility = View.GONE
    }

    fun clearOverlay() {
        overlayView?.clear()
    }
}
