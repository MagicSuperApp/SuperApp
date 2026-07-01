package com.aladincontract.company.treereid

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.abs

/**
 * Đọc heading/pitch/roll từ TYPE_ROTATION_VECTOR (sensor fusion sẵn của Android).
 *
 * Remap AXIS_X / AXIS_Z để lấy hướng ống kính (camera mặt sau) khi cầm máy dựng đứng
 * chĩa về phía cây — heading = phương ống kính, pitch = ngẩng/cúi. Tương đương
 * CMMotionManager attitude + compass heading bên iOS (HeadingCaptureManager.swift).
 *
 * Low-pass α=0.15 (khớp ghi chú orilifesdk) để bớt jitter mà vẫn nhạy.
 */
class HeadingSensorReader(
    context: Context,
    private val onSample: (heading: Double, pitch: Double, roll: Double) -> Unit,
) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    val hasRotationVector: Boolean get() = rotationSensor != null

    private val rotationMatrix = FloatArray(9)
    private val remapped = FloatArray(9)
    private val orientation = FloatArray(3)

    private var filteredHeading: Double? = null
    private var filteredPitch: Double? = null
    private var filteredRoll: Double? = null

    private val alpha = 0.15

    fun start() {
        val s = rotationSensor ?: return
        // ~50Hz như iOS (SENSOR_DELAY_GAME ≈ 20ms).
        sensorManager.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        filteredHeading = null
        filteredPitch = null
        filteredRoll = null
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return

        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        // AXIS_X, AXIS_Z: hệ toạ độ khi cầm máy dựng đứng, camera chĩa ngang về phía trước.
        SensorManager.remapCoordinateSystem(
            rotationMatrix,
            SensorManager.AXIS_X,
            SensorManager.AXIS_Z,
            remapped,
        )
        SensorManager.getOrientation(remapped, orientation)

        val rawHeading = ((Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0)
        val rawPitch = Math.toDegrees(orientation[1].toDouble())
        val rawRoll = Math.toDegrees(orientation[2].toDouble())

        val h = lowPassHeading(rawHeading)
        val p = lowPassLinear(filteredPitch, rawPitch).also { filteredPitch = it }
        val r = lowPassLinear(filteredRoll, rawRoll).also { filteredRoll = it }

        onSample(h, p, r)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { /* no-op */ }

    /** Low-pass có xử lý wrap 360° cho heading. */
    private fun lowPassHeading(raw: Double): Double {
        val prev = filteredHeading
        if (prev == null) {
            filteredHeading = raw
            return raw
        }
        var delta = raw - prev
        if (delta > 180) delta -= 360
        else if (delta < -180) delta += 360
        var next = prev + alpha * delta
        next = (next % 360 + 360) % 360
        filteredHeading = next
        return next
    }

    private fun lowPassLinear(prev: Double?, raw: Double): Double {
        if (prev == null) return raw
        // Nếu nhảy quá lớn (sensor glitch) thì nhận thẳng.
        if (abs(raw - prev) > 90) return raw
        return prev + alpha * (raw - prev)
    }
}
