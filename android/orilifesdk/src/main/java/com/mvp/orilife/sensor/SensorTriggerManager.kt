package com.mvp.orilife.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mvp.orilife.Config
import kotlin.math.abs
import kotlin.math.sqrt

class SensorTriggerManager(
    private val context: Context,
    private val listener: TriggerListener
) : SensorEventListener {

    interface TriggerListener {
        fun onShakeDetected(intensity: Float)
        fun onCuttingActionDetected()
        fun onMovementStopped()
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val handler = Handler(Looper.getMainLooper())

    private var lastX = 0f; private var lastY = 0f; private var lastZ = 0f
    private var lastShakeTime = 0L; private var lastMovementTime = 0L
    private val shakeHistory = mutableListOf<Float>()
    private val cuttingPatternBuffer = mutableListOf<Float>()
    private var isDetectingCutting = false
    private var isEnabled = false

    fun start() {
        if (isEnabled) return
        accelerometer?.also {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            isEnabled = true
        }
    }

    fun stop() {
        if (!isEnabled) return
        sensorManager.unregisterListener(this)
        isEnabled = false
        shakeHistory.clear()
        cuttingPatternBuffer.clear()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            if (it.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                processAcceleration(it.values[0], it.values[1], it.values[2])
                lastX = it.values[0]; lastY = it.values[1]; lastZ = it.values[2]
            }
        }
    }

    private fun processAcceleration(x: Float, y: Float, z: Float) {
        val dx = abs(x - lastX); val dy = abs(y - lastY); val dz = abs(z - lastZ)
        val delta = sqrt((dx * dx + dy * dy + dz * dz).toDouble()).toFloat()

        if (delta > Config.SENSOR_MOVEMENT_THRESHOLD) lastMovementTime = System.currentTimeMillis()
        if (delta > Config.SENSOR_SHAKE_THRESHOLD) detectShake(delta)
        detectCuttingAction(delta)
        checkMovementStopped()
    }

    private fun detectShake(intensity: Float) {
        val now = System.currentTimeMillis()
        if (now - lastShakeTime < 500) return
        shakeHistory.add(intensity)
        if (shakeHistory.size > 5) shakeHistory.removeAt(0)
        lastShakeTime = now
        listener.onShakeDetected(intensity)
    }

    private fun detectCuttingAction(delta: Float) {
        if (delta > Config.SENSOR_CUTTING_PATTERN_THRESHOLD) {
            cuttingPatternBuffer.add(delta)
            if (cuttingPatternBuffer.size > 10) cuttingPatternBuffer.removeAt(0)
            if (cuttingPatternBuffer.size >= 8 && !isDetectingCutting) {
                isDetectingCutting = true
                val first = cuttingPatternBuffer.take(4).average()
                val second = cuttingPatternBuffer.takeLast(4).average()
                val ratio = abs(first - second) / ((first + second) / 2)
                if (ratio > 0.5f) {
                    handler.post { listener.onCuttingActionDetected() }
                    cuttingPatternBuffer.clear()
                }
                isDetectingCutting = false
            }
        }
    }

    private fun checkMovementStopped() {
        val elapsed = System.currentTimeMillis() - lastMovementTime
        if (elapsed in 2000..2499) handler.post { listener.onMovementStopped() }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
