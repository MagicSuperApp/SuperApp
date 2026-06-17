package com.mvp.orilife.ui

import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.LayoutInflater
import android.view.Window
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.mvp.orilife.R
import com.mvp.orilife.network.TreeDetectionQueue

class TreeIdentifiedDialog(
    private val context: Context,
    private val treeId: String,
    private val detectionData: TreeDetectionQueue.DetectionData?
) {

    private var dialog: Dialog? = null
    private var onSaveClick: (() -> Unit)? = null
    private var onDismissListener: (() -> Unit)? = null

    fun setOnSaveClickListener(listener: () -> Unit) {
        onSaveClick = listener
    }
    
    fun setOnDismissListener(listener: () -> Unit) {
        onDismissListener = listener
    }

    fun show() {
        // Haptic feedback
        performHapticFeedback()
        
        dialog = Dialog(context).apply {
            requestWindowFeature(Window.FEATURE_NO_TITLE)
            window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            window?.attributes?.windowAnimations = R.style.DialogAnimation
            
            val view = LayoutInflater.from(context).inflate(R.layout.dialog_tree_identified, null)
            setContentView(view)
            
            // Set data
            view.findViewById<TextView>(R.id.tvTreeId).text = treeId
            
            // Copy button
            view.findViewById<ImageView>(R.id.btnCopyTreeId).setOnClickListener {
                copyToClipboard(treeId)
            }
            
            // Save button
            view.findViewById<Button>(R.id.btnSave).setOnClickListener {
                onSaveClick?.invoke()
                dismiss()
            }
            
            // Close button
            view.findViewById<Button>(R.id.btnClose).setOnClickListener {
                dismiss()
            }
            
            setCancelable(true)
            show()
        }
    }

    fun dismiss() {
        onDismissListener?.invoke()
        dialog?.dismiss()
        dialog = null
    }

    private fun copyToClipboard(text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Tree ID", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "Đã sao chép: $text", Toast.LENGTH_SHORT).show()
    }
    
    private fun performHapticFeedback() {
        try {
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    it.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                }else {
                    @Suppress("DEPRECATION")
                    it.vibrate(50)
                }
            }
        } catch (e: Exception) {
            // Ignore if vibration not available
        }
    }
}
