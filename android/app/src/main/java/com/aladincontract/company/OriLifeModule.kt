package com.aladincontract.company

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mvp.orilife.MainActivity

/**
 * OriLifeModule — React Native native module bridge.
 *
 * JS calls methods here → launches com.mvp.orilife.MainActivity (from orilifesdk)
 * MainActivity fires broadcast intents → this module receives → emits JS events
 *
 * Architecture:
 *   SmartCaptureScreen.tsx (JS)
 *     → OriLifeModule.startScanner()
 *       → launches MainActivity (native camera + YOLO + circular capture)
 *         → fires Intent broadcasts
 *           → OriLifeModule receives (BroadcastReceiver)
 *             → emits RN events
 *               → SmartCaptureScreen receives, shows results
 */
class OriLifeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "OriLifeModule"
        const val EVENT_ON_SCAN_COMPLETE = "onScanComplete"
        const val EVENT_ON_SCAN_ERROR = "onScanError"
        const val EVENT_ON_UPLOAD_PROGRESS = "onUploadProgress"
        const val ACTION_SCAN_RESULT = "com.mvp.orilife.SCAN_RESULT"
        const val ACTION_SCAN_ERROR = "com.mvp.orilife.SCAN_ERROR"
        const val ACTION_UPLOAD_PROGRESS = "com.mvp.orilife.UPLOAD_PROGRESS"
        const val EXTRA_TREE_IDS = "tree_ids"
        const val EXTRA_ERROR_MESSAGE = "error_message"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_TOTAL = "total"
        
        // Farm data passed to scanner and returned back (as JSON string)
        const val EXTRA_FARM_ID = "farm_id"
    }

    private var isReceiverRegistered = false

    private val scanResultReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_SCAN_RESULT -> {
                    val treeIds = intent.getStringArrayListExtra(EXTRA_TREE_IDS) ?: arrayListOf()
                    val params = Arguments.createMap().apply {
                        putArray("treeIds", Arguments.createArray().apply {
                            treeIds.forEach { pushString(it) }
                        })
                        putInt("count", treeIds.size)
                    }
                    sendEvent(EVENT_ON_SCAN_COMPLETE, params)
                }
                ACTION_SCAN_ERROR -> {
                    val errorMsg = intent.getStringExtra(EXTRA_ERROR_MESSAGE) ?: "Unknown error"
                    val params = Arguments.createMap().apply {
                        putString("error", errorMsg)
                    }
                    sendEvent(EVENT_ON_SCAN_ERROR, params)
                }
                ACTION_UPLOAD_PROGRESS -> {
                    val progress = intent.getIntExtra(EXTRA_PROGRESS, 0)
                    val total = intent.getIntExtra(EXTRA_TOTAL, 0)
                    val params = Arguments.createMap().apply {
                        putInt("progress", progress)
                        putInt("total", total)
                    }
                    sendEvent(EVENT_ON_UPLOAD_PROGRESS, params)
                }
            }
        }
    }

    private fun registerReceiver() {
        if (!isReceiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(ACTION_SCAN_RESULT)
                addAction(ACTION_SCAN_ERROR)
                addAction(ACTION_UPLOAD_PROGRESS)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(scanResultReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactContext.registerReceiver(scanResultReceiver, filter)
            }
            isReceiverRegistered = true
        }
    }

    private fun unregisterReceiver() {
        if (isReceiverRegistered) {
            try {
                reactContext.unregisterReceiver(scanResultReceiver)
            } catch (e: IllegalArgumentException) {
                // Receiver was not registered
            }
            isReceiverRegistered = false
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        registerReceiver()
    }

    override fun invalidate() {
        unregisterReceiver()
        super.invalidate()
    }

    /**
     * JS calls: OriLifeModule.startScanner(options?)
     * Launches MainActivity (full-screen native camera + YOLO scanner)
     * Options can include:
     * - mode: 'single' or 'circular'
     * - virtualId: virtual ID for session
     * - farm: JSON string with farm data (id, name, coordinates, userId)
     */
    @ReactMethod
    fun startScanner(options: ReadableMap?, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is null")
            return
        }

        // ✅ KHÔNG dùng FLAG_ACTIVITY_NEW_TASK — sẽ tạo task riêng cho scanner
        //    → khi finish() có thể không tự bring RN task lên foreground.
        //    Launch trong cùng task của RN MainActivity → finish() = pop activity = back về RN.
        val intent = Intent(activity, MainActivity::class.java).apply {
            options?.let { opts ->
                opts.getString("mode")?.let { putExtra("mode", it) }
                opts.getString("virtualId")?.let { putExtra("virtualId", it) }

                // Pass farm data to scanner so it can return to the correct farm
                opts.getString("farm_id")?.let { putExtra(EXTRA_FARM_ID, it) }
                opts.getString("region_code")?.let { putExtra("region_code", it) }
            }
        }

        try {
            activity.startActivity(intent)
            promise.resolve("Scanner started")
        } catch (e: Exception) {
            promise.reject("E_LAUNCH_FAILED", "Failed to launch scanner: ${e.message}", e)
        }
    }

    /**
     * JS calls: OriLifeModule.stopScanner()
     * Finishes the active MainActivity
     */
    @ReactMethod
    fun stopScanner(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is null")
            return
        }

        val manager = activity.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        for (task in manager.appTasks) {
            val component = task.taskInfo.baseIntent?.component?.className ?: ""
            if (component == "com.mvp.orilife.MainActivity") {
                @Suppress("DEPRECATION")
                task.finishAndRemoveTask()
                promise.resolve("Scanner stopped")
                return
            }
        }
        promise.resolve("No active scanner")
    }

    /**
     * JS calls: OriLifeModule.getPendingUploadCount()
     * Returns number of pending uploads from Room DB
     */
    @ReactMethod
    fun getPendingUploadCount(promise: Promise) {
        try {
            // TODO: Wire to HarvestDatabase from orilifesdk
            // val db = HarvestDatabase.getDatabase(reactContext)
            // val count = db.treeDetectionDao().getPendingCountSync()
            promise.resolve(0)
        } catch (e: Exception) {
            promise.reject("E_DB_ERROR", "Failed to get pending count: ${e.message}", e)
        }
    }

    // ── Event emitter helpers ──────────────────────────────────────────────────

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Required for NativeEventEmitter in RN — do not remove
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: required for NativeEventEmitter
    }

    /**
     * Required for NativeEventEmitter in RN — do not remove
     */
    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: required for NativeEventEmitter
    }
}
