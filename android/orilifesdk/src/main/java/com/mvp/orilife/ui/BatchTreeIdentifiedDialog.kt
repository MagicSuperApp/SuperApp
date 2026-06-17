package com.mvp.orilife.ui

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.LayoutInflater
import android.view.Window
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.mvp.orilife.R

class BatchTreeIdentifiedDialog(
    private val context: Context,
    private val treeCount: Int,
    private val treeIds: List<String>
) {

    private var dialog: Dialog? = null
    private var onDismissListener: (() -> Unit)? = null

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
            
            val view = LayoutInflater.from(context).inflate(R.layout.dialog_batch_tree_identified, null)
            setContentView(view)
            
            // Set title
            val title = if (treeCount == 1) {
                "Đã phát hiện 1 cây"
            } else {
                "Đã phát hiện $treeCount cây"
            }
            view.findViewById<TextView>(R.id.tvTitle).text = title
            
            // Add tree IDs to list
            val treeListContainer = view.findViewById<LinearLayout>(R.id.treeListContainer)
            treeIds.forEachIndexed { index, treeId ->
                val itemView = LayoutInflater.from(context).inflate(R.layout.item_tree_id, treeListContainer, false)
                itemView.findViewById<TextView>(R.id.tvTreeNumber).text = "${index + 1}"
                itemView.findViewById<TextView>(R.id.tvTreeId).text = treeId
                treeListContainer.addView(itemView)
            }
            
            // Close button
            view.findViewById<Button>(R.id.btnContinue).setOnClickListener {
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
    
    private fun performHapticFeedback() {
        try {
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    it.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    it.vibrate(50)
                }
            }
        } catch (e: Exception) {
            // Ignore if vibration not available
        }
    }
}
