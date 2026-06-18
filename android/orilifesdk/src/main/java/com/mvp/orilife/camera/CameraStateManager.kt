package com.mvp.orilife.camera

import android.os.Handler
import android.os.Looper

/**
 * Tracks camera activity state and manages auto power-off timer.
 * Does NOT own or bind the camera — that's CameraManager's job.
 */
class CameraStateManager private constructor() {

    interface CameraStateListener {
        fun onCameraTurnedOn()
        fun onCameraTurnedOff()
        fun onLowPowerMode()
        fun onAutoPowerOff()
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isLowPowerMode = false
    private var lastActivityTime = 0L
    private var autoPowerOffDelay = 5 * 60 * 1000L
    private var listener: CameraStateListener? = null
    private val activityCheckRunnable = Runnable { checkAutoPowerOff() }

    fun recordActivity() {
        lastActivityTime = System.currentTimeMillis()
        if (isLowPowerMode) {
            isLowPowerMode = false
            listener?.onCameraTurnedOn()
        }
        handler.removeCallbacks(activityCheckRunnable)
        handler.postDelayed(activityCheckRunnable, 60_000L)
    }

    fun enterLowPowerMode() {
        if (isLowPowerMode) return
        isLowPowerMode = true
        handler.removeCallbacks(activityCheckRunnable)
        listener?.onLowPowerMode()
    }

    fun setAutoPowerOffDelay(delayMs: Long) { autoPowerOffDelay = delayMs }

    fun setCameraStateListener(newListener: CameraStateListener?) { listener = newListener }

    private fun checkAutoPowerOff() {
        val elapsed = System.currentTimeMillis() - lastActivityTime
        if (elapsed >= autoPowerOffDelay) {
            listener?.onAutoPowerOff()
        }else {
            handler.postDelayed(activityCheckRunnable, 60_000L)
        }
    }

    fun release() {
        handler.removeCallbacks(activityCheckRunnable)
        listener = null
    }

    companion object {
        @Volatile
        private var INSTANCE: CameraStateManager? = null
        fun getInstance(): CameraStateManager =
            INSTANCE ?: synchronized(this) { INSTANCE ?: CameraStateManager().also { INSTANCE = it }}
    }
}
