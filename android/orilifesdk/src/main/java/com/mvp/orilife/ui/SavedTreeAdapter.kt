package com.mvp.orilife.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.mvp.orilife.R
import com.mvp.orilife.database.SavedTree
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SavedTreeAdapter(
    private val onDeleteClick: (SavedTree) -> Unit
) : ListAdapter<SavedTree, SavedTreeAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_saved_tree, parent, false)
        return ViewHolder(view, onDeleteClick)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ViewHolder(
        itemView: View,
        private val onDeleteClick: (SavedTree) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {
        
        private val tvTreeId: TextView = itemView.findViewById(R.id.tvTreeId)
        private val tvSavedDate: TextView = itemView.findViewById(R.id.tvSavedDate)
        private val btnCopy: ImageView = itemView.findViewById(R.id.btnCopy)
        private val btnDelete: ImageView = itemView.findViewById(R.id.btnDelete)

        fun bind(tree: SavedTree) {
            tvTreeId.text = tree.treeId
            
            val sdf = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
            tvSavedDate.text = "Đã lưu: ${sdf.format(Date(tree.savedTimestamp))}"
            
            btnCopy.setOnClickListener {
                copyToClipboard(tree.treeId)
            }
            
            btnDelete.setOnClickListener {
                onDeleteClick(tree)
            }
        }
        
        private fun copyToClipboard(text: String) {
            val clipboard = itemView.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Tree ID", text)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(itemView.context, "Đã sao chép: $text", Toast.LENGTH_SHORT).show()
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<SavedTree>() {
        override fun areItemsTheSame(oldItem: SavedTree, newItem: SavedTree) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: SavedTree, newItem: SavedTree) = oldItem == newItem
    }
}
