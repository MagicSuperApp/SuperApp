package com.aladincontract.company.treereid

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.UiThreadUtil
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * TreeReIDBridge (Android) — port native guided realtime capture từ iOS.
 * Cùng tên module + hợp đồng method/event với iOS để NativeModules.TreeReIDBridge
 * dùng chung phía JS. Xem contract: ios/.../TreeReID/TreeReIDBridgeModule.swift.
 */
class TreeReIDBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "TreeReIDBridge"

        // Khớp TreeReIDConfig.swift
        private const val MAX_PER_ROUND = 12
        private const val ROUND1 = 1
        private const val ROUND2 = 2
        private const val ROUND1_NAME = "Lượt 1: Thân cây"
        private const val ROUND2_NAME = "Lượt 2: Cận gốc"
        private const val GUIDANCE_ROUND1 = "Đi vòng quanh cây, lia chậm để lấy đủ góc."
        private const val GUIDANCE_ROUND2 =
            "Đứng SÁT GỐC, chĩa ống kính LÊN — lấy rõ vỏ gốc, sẹo, chạc cây."

        private const val EV_HEADING = "onTreeReIDHeadingUpdate"
        private const val EV_CAPTURE = "onTreeReIDCaptureTriggered"
        private const val EV_ROUND = "onTreeReIDRoundComplete"
        private const val EV_SESSION = "onTreeReIDSessionComplete"
        private const val EV_ERROR = "onTreeReIDError"
    }

    override fun getName() = NAME

    private data class CaptureRecord(
        val id: String,
        val path: String,
        val heading: Double,
        val pitch: Double,
        val roll: Double,
        val round: Int,
        val capturedAt: Double,
        val width: Int,
        val height: Int,
    )

    private val hcm = HeadingCaptureManager()
    private var sensorReader: HeadingSensorReader? = null

    private var sessionId: String? = null
    private var currentRound = ROUND1
    private var startTimeMs = 0L
    private val captures = mutableListOf<CaptureRecord>()
    private val isRunning = AtomicBoolean(false)
    private val isCapturing = AtomicBoolean(false)
    private var lastHeadingEmitMs = 0L

    private val ioExecutor = Executors.newSingleThreadExecutor()

    // ── Lifecycle của session ────────────────────────────────────────────────

    @ReactMethod
    fun startCaptureSession(options: ReadableMap?, promise: Promise) {
        val hasCamera = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasCamera) {
            promise.reject("E_PERMISSION", "Chưa cấp quyền Camera")
            return
        }
        UiThreadUtil.runOnUiThread {
            try {
                // Self-heal: session cũ chưa dừng (user thoát màn không bấm "Nhận diện")
                // → dọn trước thay vì từ chối E_BUSY.
                if (isRunning.getAndSet(false)) {
                    try { sensorReader?.stop() } catch (_: Exception) {}
                    try { TreeReIDCamera.release() } catch (_: Exception) {}
                }
                // Bridgeless New Arch: currentActivity hay null → fallback ProcessLifecycleOwner
                // (lifecycle cấp app). Không còn phụ thuộc Activity để tránh E_FAILED.
                val owner: LifecycleOwner =
                    (reactContext.currentActivity as? LifecycleOwner) ?: ProcessLifecycleOwner.get()
                TreeReIDCamera.ensureController(reactContext)
                TreeReIDCamera.bind(owner)
                // Nạp model YOLO (Plan A) cho gate chất-lượng. Thiếu model → tự tắt gate.
                TreeReIDYolo.ensureLoaded(reactContext)

                synchronized(captures) { captures.clear() }
                sessionId = UUID.randomUUID().toString()
                currentRound = ROUND1
                startTimeMs = System.currentTimeMillis()
                hcm.reset()
                isCapturing.set(false)

                val reader = HeadingSensorReader(reactContext) { h, p, r -> onSensor(h, p, r) }
                sensorReader = reader
                reader.start()
                isRunning.set(true)

                val res = Arguments.createMap().apply {
                    putString("sessionId", sessionId)
                    putInt("round", ROUND1)
                    putString("roundName", ROUND1_NAME)
                    putString("guidance", GUIDANCE_ROUND1)
                }
                promise.resolve(res)
            } catch (e: Throwable) {
                isRunning.set(false)
                try { sensorReader?.stop() } catch (_: Exception) {}
                promise.reject("E_FAILED", "startCaptureSession: ${e.javaClass.simpleName}: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun stopCaptureSession(options: ReadableMap?, promise: Promise) {
        if (!isRunning.get()) {
            promise.resolve(null)
            return
        }
        val sid = sessionId
        val duration = (System.currentTimeMillis() - startTimeMs) / 1000.0

        UiThreadUtil.runOnUiThread {
            try {
                sensorReader?.stop()
                sensorReader = null
                TreeReIDCamera.release()
            } catch (_: Exception) { /* ignore */ }
            isRunning.set(false)

            val capturesArray = buildCapturesArray()
            val total = synchronized(captures) { captures.size }

            val res = Arguments.createMap().apply {
                putString("sessionId", sid)
                putInt("totalCaptures", total)
                putArray("captures", buildCapturesArray())
                putDouble("duration", duration)
            }
            val evt = Arguments.createMap().apply {
                putString("sessionId", sid)
                putInt("totalCaptures", total)
                putArray("captures", capturesArray)
                putDouble("duration", duration)
            }
            sendEvent(EV_SESSION, evt)
            promise.resolve(res)
        }
    }

    @ReactMethod
    fun advanceToRound2(promise: Promise) {
        if (!isRunning.get()) {
            promise.reject("E_NO_SESSION", "Chưa có session")
            return
        }
        if (currentRound != ROUND1) {
            promise.reject("E_INVALID_STATE", "Đã ở lượt 2")
            return
        }
        val prevCount = countRound(ROUND1)
        currentRound = ROUND2
        hcm.reset()

        val evt = Arguments.createMap().apply {
            putInt("round", ROUND1)
            putInt("captures", prevCount)
            putInt("nextRound", ROUND2)
            putString("nextRoundName", ROUND2_NAME)
            putString("nextGuidance", GUIDANCE_ROUND2)
        }
        sendEvent(EV_ROUND, evt)

        val res = Arguments.createMap().apply {
            putInt("round", ROUND2)
            putString("roundName", ROUND2_NAME)
            putString("guidance", GUIDANCE_ROUND2)
        }
        promise.resolve(res)
    }

    // ── Truy vấn ─────────────────────────────────────────────────────────────

    @ReactMethod
    fun getSessionState(promise: Promise) {
        if (!isRunning.get()) {
            promise.resolve(null)
            return
        }
        val res = Arguments.createMap().apply {
            putString("sessionId", sessionId)
            putInt("round", currentRound)
            putString("roundName", if (currentRound == ROUND2) ROUND2_NAME else ROUND1_NAME)
            putInt("totalCaptures", synchronized(captures) { captures.size })
            putArray("capturesByRound", Arguments.createArray().apply {
                pushInt(countRound(ROUND1))
                pushInt(countRound(ROUND2))
            })
            putDoubleOrNull(this, "lastHeading", hcm.lastEmittedHeading)
            putDoubleOrNull(this, "lastPitch", hcm.lastEmittedPitch)
            putNull("gps") // GPS lấy từ redux phía JS
        }
        promise.resolve(res)
    }

    @ReactMethod
    fun getCapturedImages(promise: Promise) {
        promise.resolve(buildCapturesArray())
    }

    @ReactMethod
    fun getCurrentHeading(promise: Promise) {
        val res = Arguments.createMap().apply {
            putDoubleOrNull(this, "heading", hcm.lastEmittedHeading)
            putDoubleOrNull(this, "pitch", hcm.lastEmittedPitch)
        }
        promise.resolve(res)
    }

    @ReactMethod
    fun addCapturedImage(imageData: ReadableMap, promise: Promise) {
        if (!isRunning.get()) {
            promise.reject("E_NO_SESSION", "Chưa có session")
            return
        }
        val data = if (imageData.hasKey("data")) imageData.getString("data") else null
        if (data.isNullOrEmpty()) {
            promise.reject("E_INVALID_DATA", "Thiếu data base64")
            return
        }
        val heading = if (imageData.hasKey("heading")) imageData.getDouble("heading")
        else hcm.lastEmittedHeading ?: 0.0
        val pitch = if (imageData.hasKey("pitch")) imageData.getDouble("pitch")
        else hcm.lastEmittedPitch ?: 0.0
        val roll = if (imageData.hasKey("roll")) imageData.getDouble("roll") else 0.0

        ioExecutor.execute {
            try {
                val processed = TreeReIDImageUtil.processBase64(data, reactContext.cacheDir)
                val rec = appendCapture(processed, heading, pitch, roll)
                val res = Arguments.createMap().apply {
                    putString("captureId", rec.id)
                    putString("fileURL", rec.path)
                    putInt("totalCaptures", synchronized(captures) { captures.size })
                    putInt("round", rec.round)
                }
                promise.resolve(res)
            } catch (e: Exception) {
                promise.reject("E_SAVE_FAILED", e.message, e)
            }
        }
    }

    // NativeEventEmitter yêu cầu (no-op).
    @ReactMethod
    fun addListener(eventName: String) { /* keep */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* keep */ }

    // ── Xử lý cảm biến + chụp tự động ────────────────────────────────────────

    private fun onSensor(heading: Double, pitch: Double, roll: Double) {
        if (!isRunning.get()) return
        val u = hcm.process(heading, pitch, roll)

        val now = System.currentTimeMillis()
        if (u.shouldCapture || now - lastHeadingEmitMs >= 50) {
            lastHeadingEmitMs = now
            val evt = Arguments.createMap().apply {
                putDouble("heading", u.heading)
                putDouble("pitch", u.pitch)
                putDouble("roll", u.roll)
                putDoubleOrNull(this, "deltaHeading", u.deltaHeading)
                putDoubleOrNull(this, "deltaPitch", u.deltaPitch)
                putBoolean("shouldCapture", u.shouldCapture)
                putDouble("timestamp", u.timestamp)
            }
            sendEvent(EV_HEADING, evt)
        }

        if (u.shouldCapture &&
            countRound(currentRound) < MAX_PER_ROUND &&
            yoloGatePass() &&
            isCapturing.compareAndSet(false, true)
        ) {
            triggerCapture(u.heading, u.pitch, u.roll)
        }
    }

    /**
     * Gate YOLO (Plan A): chỉ cho chụp khi frame gần nhất CÓ cây (conf ≥ ngưỡng).
     * An toàn — KHÔNG chặn oan khi: detector chưa nạp model, chưa có kết quả, hoặc
     * kết quả quá cũ (>800ms). Lúc đó rơi về gate stillness (Plan B) như trước.
     */
    private fun yoloGatePass(): Boolean {
        if (!TreeReIDYolo.available) return true
        val (conf, ageMs) = TreeReIDCamera.latestTargetConfidence()
        if (conf < 0f || ageMs > 800) return true
        return conf >= TreeReIDYolo.CONF_THRESHOLD
    }

    private fun triggerCapture(heading: Double, pitch: Double, roll: Double) {
        // Emit lần 1 — ngay khi trigger (count TRƯỚC).
        val before = Arguments.createMap().apply {
            putString("captureId", UUID.randomUUID().toString())
            putDouble("heading", heading)
            putDouble("pitch", pitch)
            putInt("round", currentRound)
            putInt("totalCaptures", synchronized(captures) { captures.size })
        }
        sendEvent(EV_CAPTURE, before)

        val tmp = File(reactContext.cacheDir, "treeid_raw_${UUID.randomUUID()}.jpg")
        TreeReIDCamera.takePicture(
            tmp,
            ioExecutor,
            onSaved = { file ->
                try {
                    val processed = TreeReIDImageUtil.processFile(file, reactContext.cacheDir)
                    file.delete()
                    val rec = appendCapture(processed, heading, pitch, roll)
                    // Emit lần 2 — sau khi lưu (có fileURL + count SAU).
                    val after = Arguments.createMap().apply {
                        putString("captureId", rec.id)
                        putString("fileURL", rec.path)
                        putDouble("heading", heading)
                        putDouble("pitch", pitch)
                        putInt("round", rec.round)
                        putInt("totalCaptures", synchronized(captures) { captures.size })
                        putInt("width", rec.width)
                        putInt("height", rec.height)
                    }
                    sendEvent(EV_CAPTURE, after)
                } catch (e: Exception) {
                    emitError("E_SAVE_FAILED", e.message ?: "Lưu ảnh thất bại")
                } finally {
                    isCapturing.set(false)
                }
            },
            onError = { e ->
                emitError("E_CAMERA_ERROR", e.message ?: "Chụp thất bại")
                isCapturing.set(false)
            },
        )
    }

    private fun appendCapture(
        p: TreeReIDImageUtil.Processed,
        heading: Double,
        pitch: Double,
        roll: Double,
    ): CaptureRecord {
        val rec = CaptureRecord(
            id = UUID.randomUUID().toString(),
            path = p.file.absolutePath,
            heading = heading,
            pitch = pitch,
            roll = roll,
            round = currentRound,
            capturedAt = System.currentTimeMillis() / 1000.0,
            width = p.width,
            height = p.height,
        )
        synchronized(captures) { captures.add(rec) }
        return rec
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun countRound(round: Int): Int =
        synchronized(captures) { captures.count { it.round == round } }

    private fun buildCapturesArray(): WritableArray {
        val arr = Arguments.createArray()
        synchronized(captures) {
            for (c in captures) {
                arr.pushMap(Arguments.createMap().apply {
                    putString("id", c.id)
                    putString("fileURL", c.path)
                    putDouble("heading", c.heading)
                    putDouble("pitch", c.pitch)
                    putDouble("roll", c.roll)
                    putInt("round", c.round)
                    putDouble("capturedAt", c.capturedAt)
                    putInt("width", c.width)
                    putInt("height", c.height)
                })
            }
        }
        return arr
    }

    private fun putDoubleOrNull(map: WritableMap, key: String, value: Double?) {
        if (value == null) map.putNull(key) else map.putDouble(key, value)
    }

    private fun emitError(code: String, message: String) {
        val evt = Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        }
        sendEvent(EV_ERROR, evt)
    }

    private fun sendEvent(name: String, params: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }
}
