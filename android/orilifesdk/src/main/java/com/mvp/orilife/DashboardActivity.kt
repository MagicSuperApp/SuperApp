package com.mvp.orilife
import com.mvp.orilife.MainActivity
import com.mvp.orilife.network.NetworkMonitor

import com.mvp.orilife.ui.SavedTreeAdapter

import android.content.Intent
import android.os.Bundle
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.mvp.orilife.database.HarvestDatabase
import com.mvp.orilife.database.SavedTree
import com.mvp.orilife.database.TreeStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DashboardActivity : AppCompatActivity() {
    private lateinit var db: HarvestDatabase
    private lateinit var adapter: SavedTreeAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            setContentView(R.layout.activity_dashboard)

            db = HarvestDatabase.getDatabase(this)

            findViewById<android.view.View>(R.id.cardScan).setOnClickListener {
                startActivity(Intent(this@DashboardActivity, MainActivity::class.java))
            }

            setupRecyclerView()
            loadSavedTrees()

            // Monitor network status
            try {
                val networkMonitor = NetworkMonitor(this)
                networkMonitor.isOnline.observe(this) { isOnline ->
                    try {
                        findViewById<LinearLayout>(R.id.offlineBanner)?.visibility =
                            if (!isOnline) android.view.View.VISIBLE else android.view.View.GONE
                    } catch (e: Exception) {
                        android.util.Log.e("DashboardActivity", "Error updating network status", e)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardActivity", "Error initializing network monitor", e)
            }
        } catch (e: Exception) {
            android.util.Log.e("DashboardActivity", "Error in onCreate", e)
            android.widget.Toast.makeText(this, "Error initializing app: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        loadSavedTrees()
    }

    private fun setupRecyclerView() {
        adapter = SavedTreeAdapter { tree ->
            showDeleteConfirmation(tree)
        }
        
        findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.rvRecentHistory).apply {
            layoutManager = LinearLayoutManager(this@DashboardActivity)
            adapter = this@DashboardActivity.adapter
        }
    }

    private fun loadSavedTrees() {
        lifecycleScope.launch {
            try {
                db.savedTreeDao().getAllExceptStatus(TreeStatus.CANCELLED).collect { trees ->
                    adapter.submitList(trees)
                    
                    // Show/hide empty state
                    val emptyState = findViewById<LinearLayout>(R.id.layoutEmptyState)
                    emptyState?.visibility = if (trees.isEmpty()) {
                        android.view.View.VISIBLE
                    } else {
                        android.view.View.GONE
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardActivity", "Error loading saved trees", e)
            }
        }
    }
    
    private fun showDeleteConfirmation(tree: SavedTree) {
        AlertDialog.Builder(this)
            .setTitle("Xóa cây")
            .setMessage("Bạn có chắc muốn xóa ${tree.treeId}?")
            .setPositiveButton("Xóa") { _, _ ->
                deleteSavedTree(tree)
            }
            .setNegativeButton("Hủy", null)
            .show()
    }
    
    private fun deleteSavedTree(tree: SavedTree) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                db.savedTreeDao().delete(tree)
                withContext(Dispatchers.Main) {
                    android.widget.Toast.makeText(
                        this@DashboardActivity,
                        "Đã xóa ${tree.treeId}",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("DashboardActivity", "Error deleting tree", e)
                withContext(Dispatchers.Main) {
                    android.widget.Toast.makeText(
                        this@DashboardActivity,
                        "Lỗi khi xóa cây",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}
