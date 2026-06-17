package com.mvp.orilife.network

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.mvp.orilife.database.HarvestDatabase
import com.mvp.orilife.database.PendingTreeDetection
import com.mvp.orilife.database.SavedTree
import com.mvp.orilife.database.TreeStatus
import com.mvp.orilife.security.MonotonicCounter
import com.mvp.orilife.security.SecureSignature
import com.mvp.orilife.security.SecurityHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * WorkManager Worker xử lý upload tree detection lên server.
 *
 * ✅ Survive process death: OS kill app → Worker vẫn chạy tiếp khi app restart
 * ✅ Survive device reboot: kết hợp với BootReceiver nếu cần
 * ✅ Retry tự động: WorkManager quản lý retry với exponential backoff
 * ✅ Không giữ Activity reference: dùng applicationContext
 *
 * @param context  ApplicationContext (KHÔNG dùng Activity context)
 * @param params   WorkerParameters (chứa work tags, ids)
 */
class UploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val TAG = "UploadWorker"
        const val WORK_NAME = "tree_detection_upload"
        const val WORK_TAG = "upload_circular_session"
        const val KEY_TREE_ID = "tree_id"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "🚀 [UploadWorker] doWork START — attempt=${runAttemptCount}")

        // ✅ Dùng applicationContext — không bị leak khi Activity destroy
        val appContext = applicationContext

        // ✅ Đọc treeId từ WorkManager InputData
        val treeId = inputData.getString(KEY_TREE_ID)
        Log.d(TAG, "📋 treeId from input: ${treeId?.takeLast(8) ?: "null (will update all)"}")

        return withContext(Dispatchers.IO) {
            try {
                val queue = TreeDetectionQueue.getInstance(appContext)
                val savedTreeDao = appContext.let {
                    HarvestDatabase.getDatabase(it).savedTreeDao()
                }

                // Kiểm tra có ảnh nào đang chờ upload không
                val pendingCount = queue.getPendingCount()
                Log.d(TAG, "📋 Pending count: $pendingCount")

                if (pendingCount == 0) {
                    Log.d(TAG, "✅ No pending detections — Worker complete")
                    return@withContext Result.success()
                }

                // Gọi sync — đây là logic upload đã có sẵn trong TreeDetectionQueue
                val syncResult = queue.syncPendingDetections()

                Log.d(TAG, "📊 Sync result: success=${syncResult.successCount}, " +
                        "fail=${syncResult.failureCount}, retry=${syncResult.retryCount}")

                // ✅ Cập nhật SavedTree status dựa trên kết quả sync
                if (treeId != null) {
                    when {
                        syncResult.failureCount > 0 && syncResult.successCount == 0 -> {
                            // Toàn bộ fail → status = FAILED
                            savedTreeDao.updateStatus(treeId, TreeStatus.FAILED)
                            Log.d(TAG, "💾 SavedTree status → FAILED: ${treeId.takeLast(8)}")
                        }
                        syncResult.successCount > 0 -> {
                            // Có thành công → status = UPLOADED
                            savedTreeDao.updateStatus(treeId, TreeStatus.UPLOADED)
                            Log.d(TAG, "💾 SavedTree status → UPLOADED: ${treeId.takeLast(8)}")
                        }
                    }
                }

                // ✅ Quyết định Result:
                when {
                    syncResult.successCount > 0 && syncResult.retryCount == 0 -> {
                        Log.d(TAG, "✅ Upload SUCCESS — ${syncResult.successCount} items uploaded")
                        notifyUploadSuccess(appContext, syncResult.successCount)
                        Result.success(workDataOf("success_count" to syncResult.successCount))
                    }
                    syncResult.totalProcessed == 0 -> {
                        Log.d(TAG, "✅ No more items to process — success")
                        Result.success(workDataOf("success_count" to 0))
                    }
                    else -> {
                        val currentPending = queue.getPendingCount()
                        if (currentPending == 0) {
                            Log.d(TAG, "✅ All items processed — success")
                            Result.success()
                        } else {
                            Log.w(TAG, "⚠️ Some items failed — retry pending (count=$currentPending)")
                            Result.retry()
                        }
                    }
                }

            } catch (e: Exception) {
                Log.e(TAG, "❌ UploadWorker EXCEPTION: ${e::class.simpleName}: ${e.message}", e)

                // ✅ Cập nhật SavedTree status = FAILED khi có exception
                if (treeId != null) {
                    try {
                        val savedTreeDao = appContext.let {
                            HarvestDatabase.getDatabase(it).savedTreeDao()
                        }
                        savedTreeDao.updateStatus(treeId, TreeStatus.FAILED)
                        Log.d(TAG, "💾 SavedTree status → FAILED (exception): ${treeId.takeLast(8)}")
                    } catch (dbErr: Exception) {
                        Log.e(TAG, "❌ Failed to update SavedTree FAILED: ${dbErr.message}")
                    }
                }

                // ✅ Retry cho network errors, transient failures
                if (runAttemptCount < 3) {
                    Log.d(TAG, "🔄 Retrying... (attempt ${runAttemptCount + 1}/3)")
                    Result.retry()
                } else {
                    Log.e(TAG, "🛑 Max retries reached — failing permanently")
                    val errorMsg = e.message ?: "Unknown error"
                    notifyUploadFailed(appContext, errorMsg)
                    Result.failure(workDataOf("error" to errorMsg))
                }
            }
        }
    }

    /**
     * Thông báo upload thành công qua SharedPreferences.
     * Activity/UI sẽ đọc flag này khi resume.
     *
     * ✅ Không dùng EventBus/RxBus — tránh leak
     * ✅ Dùng SharedPreferences — survive process death
     */
    private fun notifyUploadSuccess(context: Context, successCount: Int) {
        try {
            val prefs = context.getSharedPreferences("upload_result", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("upload_success", true)
                .putInt(UploadManager.KEY_SUCCESS_COUNT, successCount)
                .putLong(UploadManager.KEY_TIMESTAMP, System.currentTimeMillis())
                .putString(UploadManager.KEY_STATE, "success")
                .apply()
            Log.d(TAG, "📡 Upload success saved: count=$successCount, state=success")
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ Failed to save upload success: ${e.message}")
        }
    }

    /**
     * Thông báo upload thất bại qua SharedPreferences.
     */
    private fun notifyUploadFailed(context: Context, error: String) {
        try {
            val prefs = context.getSharedPreferences("upload_result", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("upload_success", false)
                .putString(UploadManager.KEY_STATE, "failed")
                .putString(UploadManager.KEY_ERROR_MSG, error)
                .putLong(UploadManager.KEY_TIMESTAMP, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "📡 Upload failed saved: error=$error, state=failed")
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ Failed to save upload failure: ${e.message}")
        }
    }
}
