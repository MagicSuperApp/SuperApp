package com.mvp.orilife.network

import android.content.Context
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.work.*
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * UploadManager — Singleton quản lý upload qua WorkManager.
 *
 * ✅ Persist upload state: UploadState được lưu vào SharedPreferences
 *   → Survive Activity stop/start lifecycle, process death
 * ✅ Observe WorkInfo directly: Dùng WorkManager LiveData thay vì StateFlow
 *   → Không phụ thuộc Activity lifecycle
 * ✅ Survive process death: WorkManager tiếp tục upload kể cả OS kill app
 * ✅ Retry tự động: exponential backoff qua WorkManager
 * ✅ Auto-retry on network restore: WorkManager đợi có mạng rồi tự chạy
 *
 * Luồng:
 *   onCircularSessionComplete() → enqueueUpload()
 *     → Lưu state = Running vào SharedPreferences
 *     → WorkManager queue work
 *     → Loading hiện (observe WorkInfo)
 *   WorkManager.run() → thành công/thất bại
 *     → Lưu state = Success/Failed vào SharedPreferences
 *     → Loading tắt (WorkInfo = SUCCEEDED/FAILED)
 */
class UploadManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "UploadManager"

        @Volatile
        private var INSTANCE: UploadManager? = null

        fun getInstance(context: Context): UploadManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: UploadManager(context.applicationContext).also { INSTANCE = it }
            }
        }

        // SharedPreferences keys — ALL upload state persisted here
        const val PREFS_NAME = "upload_result"
        const val KEY_STATE = "upload_state"          // "idle" | "running" | "success" | "failed" | "partial"
        const val KEY_SUCCESS_COUNT = "upload_success_count"
        const val KEY_FAILED_COUNT = "upload_failed_count"
        const val KEY_ERROR_MSG = "upload_error"
        const val KEY_TIMESTAMP = "upload_timestamp"
    }

    // ─── Persisted State (SharedPreferences-backed) ─────────────────────────

    sealed class UploadState {
        object Idle : UploadState()
        object Running : UploadState()
        data class Success(val count: Int) : UploadState()
        data class Failed(val error: String) : UploadState()
        data class PartialSuccess(val success: Int, val failed: Int) : UploadState()
    }

    private val prefs by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    // ✅ Primary state — restored from SharedPreferences on init
    private val _uploadState = MutableLiveData<UploadState>(loadStateFromPrefs())
    val uploadState: LiveData<UploadState> = _uploadState

    // ✅ Derived StateFlow (for Kotlin consumers if needed)
    private val _uploadStateFlow = MutableStateFlow<UploadState>(loadStateFromPrefs())
    val uploadStateFlow: StateFlow<UploadState> = _uploadStateFlow.asStateFlow()

    private val workManager: WorkManager by lazy {
        WorkManager.getInstance(context)
    }

    init {
        // ✅ Restore state from SharedPreferences on startup
        val restored = loadStateFromPrefs()
        _uploadState.value = restored
        _uploadStateFlow.value = restored
        Log.d(TAG, "✅ UploadManager init: restored state=$restored")
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Enqueue upload work vào WorkManager.
     * Work sẽ CHỜ nếu không có mạng, tự động chạy khi network phục hồi.
     *
     * ✅ Trả về `UUID` của WorkRequest vừa enqueue — caller dùng `observeWorkById(id)`
     *    để track CHỈ work này, tránh nhận stale state từ work cũ đã SUCCEEDED.
     * ✅ ExistingWorkPolicy.REPLACE — cancel work cũ cùng unique name, đảm bảo
     *    lifecycle sạch cho mỗi session scan mới (KEEP cũ gây stale-emission bug).
     */
    fun enqueueUpload(treeId: String = "", tag: String = UploadWorker.WORK_TAG): UUID {
        Log.d(TAG, "enqueueUpload: tag=$tag, treeId=${treeId.takeLast(8)}")

        // ✅ Persist Running state immediately — survives Activity stop
        setState(UploadState.Running)

        // ✅ Network constraint: WorkManager CHỜ cho đến khi có mạng
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val uploadWork = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(constraints)
            .addTag(tag)
            .addTag(UploadWorker.WORK_TAG)
            .setInputData(workDataOf(UploadWorker.KEY_TREE_ID to treeId))
            .build()

        // REPLACE: huỷ work cũ → mỗi scan có một work fresh
        workManager.enqueueUniqueWork(
            UploadWorker.WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            uploadWork
        )

        Log.d(TAG, "Work enqueued: workId=${uploadWork.id}")
        return uploadWork.id
    }

    /**
     * Cancel all pending upload work.
     */
    fun cancelAll() {
        Log.d(TAG, "🛑 cancelAll")
        workManager.cancelUniqueWork(UploadWorker.WORK_NAME)
        setState(UploadState.Idle)
    }

    /**
     * Reset state về Idle và xóa SharedPreferences.
     */
    fun reset() {
        setState(UploadState.Idle)
    }

    // ─── WorkInfo Observer ──────────────────────────────────────────────────

    /**
     * ✅ Quan trọng: Trả LiveData từ WorkManager để observe work state
     * KHÔNG phụ thuộc Activity lifecycle — LiveData tự quản lý subscription.
     *
     * Usage:
     *   uploadManager.observeWorkInfo().observe(this) { workInfo ->
     *       when (workInfo?.state) {
     *           WorkInfo.State.RUNNING -> showLoading()
     *           WorkInfo.State.SUCCEEDED -> hideLoading() + showSuccess()
     *           WorkInfo.State.FAILED -> hideLoading() + showError()
     *           null -> {} // Work chưa được enqueue
     *       }
     *   }
     */
    fun observeWorkInfo(): LiveData<List<WorkInfo>> {
        return workManager.getWorkInfosForUniqueWorkLiveData(UploadWorker.WORK_NAME)
    }

    /**
     * Observe ONE specific WorkRequest by its UUID.
     * Dùng cho một session scan cụ thể — KHÔNG bị nhiễu bởi state work cũ.
     */
    fun observeWorkById(workId: UUID): LiveData<WorkInfo?> {
        return workManager.getWorkInfoByIdLiveData(workId)
    }

    /**
     * Get current WorkInfo synchronously (nếu cần check trạng thái ngay).
     */
    fun getCurrentWorkState(): WorkInfo.State? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return try {
            val workData = prefs.getString(KEY_STATE, "idle") ?: "idle"
            when (workData) {
                "running" -> WorkInfo.State.RUNNING
                "success" -> WorkInfo.State.SUCCEEDED
                "failed" -> WorkInfo.State.FAILED
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    // ─── State Persistence ──────────────────────────────────────────────────

    /**
     * Set state và persist ngay vào SharedPreferences.
     * Dùng cho WorkManager callback (chạy trong Worker process).
     * Gọi từ Activity (cùng process) → WorkManager worker ghi vào SharedPreferences
     * → Activity đọc lại khi resume.
     */
    fun setState(state: UploadState) {
        _uploadState.postValue(state)
        _uploadStateFlow.value = state
        persistState(state)
        Log.d(TAG, "📊 State set: $state")
    }

    /**
     * Gọi từ UploadWorker (sau khi work hoàn thành).
     * Worker chạy trong process riêng, dùng applicationContext.
     */
    fun notifyWorkComplete(successCount: Int, failedCount: Int, error: String?) {
        val state: UploadState = when {
            failedCount == 0 && successCount > 0 -> UploadState.Success(successCount)
            successCount > 0 && failedCount > 0 -> UploadState.PartialSuccess(successCount, failedCount)
            successCount == 0 && failedCount > 0 -> UploadState.Failed(error ?: "Upload failed")
            else -> UploadState.Idle
        }
        setState(state)
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    private fun persistState(state: UploadState) {
        try {
            val editor = prefs.edit()
            when (state) {
                is UploadState.Idle -> {
                    editor.putString(KEY_STATE, "idle")
                    editor.remove(KEY_SUCCESS_COUNT)
                    editor.remove(KEY_FAILED_COUNT)
                    editor.remove(KEY_ERROR_MSG)
                }
                is UploadState.Running -> {
                    editor.putString(KEY_STATE, "running")
                }
                is UploadState.Success -> {
                    editor.putString(KEY_STATE, "success")
                    editor.putInt(KEY_SUCCESS_COUNT, state.count)
                    editor.putLong(KEY_TIMESTAMP, System.currentTimeMillis())
                }
                is UploadState.Failed -> {
                    editor.putString(KEY_STATE, "failed")
                    editor.putString(KEY_ERROR_MSG, state.error)
                    editor.putLong(KEY_TIMESTAMP, System.currentTimeMillis())
                }
                is UploadState.PartialSuccess -> {
                    editor.putString(KEY_STATE, "partial")
                    editor.putInt(KEY_SUCCESS_COUNT, state.success)
                    editor.putInt(KEY_FAILED_COUNT, state.failed)
                    editor.putLong(KEY_TIMESTAMP, System.currentTimeMillis())
                }
            }
            editor.apply()
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ persistState failed: ${e.message}")
        }
    }

    private fun loadStateFromPrefs(): UploadState {
        return try {
            when (prefs.getString(KEY_STATE, "idle")) {
                "running" -> UploadState.Running
                "success" -> UploadState.Success(prefs.getInt(KEY_SUCCESS_COUNT, 0))
                "failed" -> UploadState.Failed(prefs.getString(KEY_ERROR_MSG, "Unknown error") ?: "Unknown error")
                "partial" -> UploadState.PartialSuccess(
                    prefs.getInt(KEY_SUCCESS_COUNT, 0),
                    prefs.getInt(KEY_FAILED_COUNT, 0)
                )
                else -> UploadState.Idle
            }
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ loadStateFromPrefs failed: ${e.message}")
            UploadState.Idle
        }
    }
}
