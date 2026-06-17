package com.mvp.orilife.ui

import android.app.Dialog
import android.os.Bundle
import android.util.Log
import android.view.Window
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.DialogFragment

/**
 * Dialog hiển thị khi circular capture session hoàn thành.
 * Dùng DialogFragment thay vì AlertDialog thuần để:
 * 1. Tự quản lý lifecycle — không bị ảnh hưởng bởi Activity state
 * 2. Không bị `lifecycleScope.launch` cancel khi Activity STOPPING
 * 3. Retain instance qua configuration change
 */
class CircularCompleteDialogFragment : DialogFragment() {

    private var onUploadClick: (() -> Unit)? = null
    private var onSaveLocalClick: (() -> Unit)? = null
    private var onCancelClick: (() -> Unit)? = null
    private var onDismissListener: (() -> Unit)? = null

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val title = arguments?.getString(ARG_TITLE) ?: "🏁 Hoàn thành!"
        val message = arguments?.getString(ARG_MESSAGE) ?: ""
        val canUploadNow = arguments?.getBoolean(ARG_CAN_UPLOAD) ?: false
        val isPartial = arguments?.getBoolean(ARG_IS_PARTIAL) ?: false

        Log.d("CircularCompleteDialog", "📋 Creating dialog: title='$title', canUpload=$canUploadNow, isPartial=$isPartial")

        val builder = AlertDialog.Builder(requireActivity())
            .setTitle(title)
            .setMessage(message)

        // ✅ LUÔN thêm nút "Tải lên" — disable nếu offline
        val uploadButtonText = if (canUploadNow) "📤 Tải lên" else "📤 Tải lên (Offline)"
        builder.setPositiveButton(uploadButtonText) { _, _ ->
            Log.d("CircularCompleteDialog", "👆 Tải lên pressed")
            if (canUploadNow) {
                onUploadClick?.invoke()
            }
            // Nếu offline: không làm gì, toast đã hiện trong message
        }

        if (!isPartial) {
            builder.setNegativeButton("💾 Lưu local") { _, _ ->
                Log.d("CircularCompleteDialog", "👆 Lưu local pressed")
                onSaveLocalClick?.invoke()
            }
        } else {
            builder.setNegativeButton("📸 Chụp thêm") { _, _ ->
                Log.d("CircularCompleteDialog", "👆 Chụp thêm pressed")
                dismiss()
            }
        }

        builder.setNeutralButton("Huỷ") { _, _ ->
            Log.d("CircularCompleteDialog", "👆 Huỷ pressed")
            onCancelClick?.invoke()
        }

        val dialog = builder.create()

        // ✅ Không cho dismiss bằng BACK hoặc tap outside
        dialog.setCancelable(false)

        // ✅ Disable nút Tải lên nếu offline (sau khi dialog được tạo)
        if (!canUploadNow) {
            dialog.setOnShowListener {
                val positiveBtn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                positiveBtn.isEnabled = false
                positiveBtn.alpha = 0.5f
            }
        }

        dialog.setOnDismissListener {
            Log.d("CircularCompleteDialog", "❌ Dialog dismissed")
            onDismissListener?.invoke()
        }

        return dialog
    }

    override fun onStart() {
        super.onStart()
        Log.d("CircularCompleteDialog", "✅ Dialog started")
        // Force dialog to show on top — essential for cases where Activity is in STARTED state
        dialog?.window?.setType(android.view.WindowManager.LayoutParams.TYPE_APPLICATION_PANEL)
    }

    override fun onDestroyView() {
        Log.d("CircularCompleteDialog", "🗑️ Dialog destroyed")
        super.onDestroyView()
    }

    companion object {
        private const val TAG = "CircularCompleteDialog"
        private const val ARG_TITLE = "arg_title"
        private const val ARG_MESSAGE = "arg_message"
        private const val ARG_CAN_UPLOAD = "arg_can_upload"
        private const val ARG_IS_PARTIAL = "arg_is_partial"

        /**
         * Tạo fragment instance với arguments.
         * Dùng arguments bundle để survive process death.
         */
        fun newInstance(
            title: String,
            message: String,
            canUploadNow: Boolean,
            isPartial: Boolean
        ): CircularCompleteDialogFragment {
            return CircularCompleteDialogFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_TITLE, title)
                    putString(ARG_MESSAGE, message)
                    putBoolean(ARG_CAN_UPLOAD, canUploadNow)
                    putBoolean(ARG_IS_PARTIAL, isPartial)
                }
            }
        }
    }

    // Setters for callbacks (called from MainActivity after instantiation)
    fun setOnUploadClickListener(action: () -> Unit) { onUploadClick = action }
    fun setOnSaveLocalClickListener(action: () -> Unit) { onSaveLocalClick = action }
    fun setOnCancelClickListener(action: () -> Unit) { onCancelClick = action }
    fun setOnDismissListener(action: () -> Unit) { onDismissListener = action }
}
