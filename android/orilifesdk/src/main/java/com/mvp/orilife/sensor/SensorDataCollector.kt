package com.mvp.orilife.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.atomic.AtomicReference

/**
 * Thu thập heading (azimuth), pitch, roll từ sensor fusion.
 *
 * Sử dụng SensorManager.getRotationMatrix + getOrientation
 * kết hợp accelerometer + magnetometer để tính orientation chính xác.
 *
 * Cache giá trị mới nhất vào AtomicReference để thread-safe.
 *
 * Singleton: khởi tạo 1 lần trong MainActivity, dùng chung toàn app.
 */
object SensorDataCollector : SensorEventListener {

    private const val TAG = "SensorDataCollector"

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var magnetometer: Sensor? = null

    // Sensor fusion buffers
    private val gravity = FloatArray(3)
    private val geomagnetic = FloatArray(3)
    // Raw accelerometer values (chưa filter) — dùng cho stability detection
    private var rawAccelX: Float = 0f
    private var rawAccelY: Float = 0f
    private var rawAccelZ: Float = 0f
    private var rawAccelMagnitude: Float = 0f
    private val rotationMatrix = FloatArray(9)
    private val orientation = FloatArray(3)

    // Low-pass filter coefficient (0.0 - 1.0)
    // Cao hơn → mượt hơn nhưng lag nhiều hơn
    private val ALPHA = 0.15f

    // Cache giá trị mới nhất — thread-safe
    private val _snapshot = AtomicReference(SensorSnapshot())
    val snapshot: SensorSnapshot get() = _snapshot.get()

    /**
     * Raw accelerometer values — dùng cho StabilitySampler trong CircularCapture.
     */
    val accelX: Float get() = rawAccelX
    val accelY: Float get() = rawAccelY
    val accelZ: Float get() = rawAccelZ

    /**
     * Magnitude của raw accelerometer (chưa filter).
     * Dùng cho StabilitySampler trong CircularCapture —
     * lấy raw vibration để detect "tay rung".
     */
    val accelMagnitude: Float get() = rawAccelMagnitude

    // Low-pass filtered values
    private var filteredAzimuth = 0f
    private var filteredPitch = 0f
    private var filteredRoll = 0f

    private var isRegistered = false
    private var isAvailable = false

    /**
     * Khởi tạo và đăng ký sensors.
     * Tự động hủy đăng ký khi lifecycleOwner bị destroy.
     *
     * @param lifecycleOwner Dùng để register/unregister sensor theo lifecycle
     */
    fun start(lifecycleOwner: LifecycleOwner) {
        if (isRegistered) {
            Log.d(TAG, "✅ Already started")
            return
        }

        val context = when (lifecycleOwner) {
            is Context -> lifecycleOwner
            else -> null
        } ?: run {
            Log.e(TAG, "❌ LifecycleOwner is not a Context")
            return
        }

        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        if (sensorManager == null) {
            Log.e(TAG, "❌ Cannot get SensorManager")
            return
        }

        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        magnetometer = sensorManager?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

        if (accelerometer == null) {
            Log.e(TAG, "❌ Accelerometer not available")
            return
        }

        if (magnetometer == null) {
            Log.w(TAG, "⚠️ Magnetometer not available — heading sẽ null (sensor fusion không hoạt động)")
        }

        isAvailable = accelerometer != null

        // Đăng ký sensor
        val delay = SensorManager.SENSOR_DELAY_UI
        accelerometer?.let { sensorManager?.registerListener(this, it, delay) }
        magnetometer?.let { sensorManager?.registerListener(this, it, delay) }

        isRegistered = true
        Log.d(TAG, "✅ Started: accel=${accelerometer != null}, mag=${magnetometer != null}")

        // Auto-unregister khi lifecycle destroy
        lifecycleOwner.lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onDestroy(owner: LifecycleOwner) {
                stop()
            }
        })
    }

    /**
     * Hủy đăng ký sensors.
     */
    fun stop() {
        if (!isRegistered) return
        sensorManager?.unregisterListener(this)
        isRegistered = false
        _snapshot.set(SensorSnapshot())
        Log.d(TAG, "🛑 Stopped")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                // Lưu raw values cho stability detection TRƯỚC KHI filter
                rawAccelX = event.values[0]
                rawAccelY = event.values[1]
                rawAccelZ = event.values[2]
                rawAccelMagnitude = kotlin.math.sqrt(
                    rawAccelX * rawAccelX + rawAccelY * rawAccelY + rawAccelZ * rawAccelZ
                )
                // Filtered gravity cho orientation
                lowPassFilter(event.values, gravity)
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                lowPassFilter(event.values, geomagnetic)
            }
        }

        // Tính orientation khi có đủ cả 2 sensors
        updateOrientation()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        if (accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE) {
            Log.w(TAG, "⚠️ Sensor accuracy unreliable: ${sensor?.name}")
        }
    }

    /**
     * Low-pass filter để smooth sensor data.
     * Giảm jitter nhưng vẫn responsive.
     */
    private fun lowPassFilter(input: FloatArray, output: FloatArray) {
        for (i in input.indices) {
            output[i] = output[i] + ALPHA * (input[i] - output[i])
        }
    }

    /**
     * Tính heading/pitch/roll từ sensor fusion.
     * Gọi mỗi khi có sensor update.
     */
    private fun updateOrientation() {
        val success = SensorManager.getRotationMatrix(
            rotationMatrix, null, gravity, geomagnetic
        )

        if (!success) {
            // Không đủ data → chỉ dùng accelerometer (ít chính xác hơn)
            computeAccelerometerOnlyOrientation()
            return
        }

        SensorManager.getOrientation(rotationMatrix, orientation)

        // orientation[0] = azimuth (radians) → heading (degrees)
        // orientation[1] = pitch (radians)
        // orientation[2] = roll (radians)
        val rawAzimuth = Math.toDegrees(orientation[0].toDouble()).toFloat()
        val rawPitch = Math.toDegrees(orientation[1].toDouble()).toFloat()
        val rawRoll = Math.toDegrees(orientation[2].toDouble()).toFloat()

        // Chuyển azimuth về 0-360 (thay vì -180 đến 180)
        val heading = if (rawAzimuth < 0) rawAzimuth + 360f else rawAzimuth

        // Low-pass filter
        filteredAzimuth = lowPassAngleFilter(filteredAzimuth, heading, ALPHA)
        filteredPitch = lowPassAngleFilter(filteredPitch, rawPitch, ALPHA)
        filteredRoll = lowPassAngleFilter(filteredRoll, rawRoll, ALPHA)

        // Round to 1 decimal
        val h = (filteredAzimuth * 10).toLong() / 10f
        val p = (filteredPitch * 10).toLong() / 10f
        val r = (filteredRoll * 10).toLong() / 10f

        _snapshot.set(
            SensorSnapshot(
                heading = h.toDouble(),
                pitch = p.toDouble(),
                roll = r.toDouble(),
                headingAccuracy = null,
                timestamp = System.currentTimeMillis()
            )
        )
    }

    /**
     * Fallback orientation chỉ từ accelerometer (khi không có magnetometer).
     * Kém chính xác hơn, không có heading đúng.
     */
    private var lastHeadingNullLogTime = 0L
    private fun computeAccelerometerOnlyOrientation() {
        // Accelerometer-only: không thể tính heading chính xác
        // Chỉ estimate pitch và roll
        val pitch = Math.toDegrees(
            kotlin.math.atan2(
                gravity[0].toDouble(),
                kotlin.math.sqrt((gravity[1] * gravity[1] + gravity[2] * gravity[2]).toDouble())
            )
        ).toFloat()
        val roll = Math.toDegrees(
            kotlin.math.atan2(
                gravity[1].toDouble(),
                kotlin.math.sqrt((gravity[0] * gravity[0] + gravity[2] * gravity[2]).toDouble())
            )
        ).toFloat()

        filteredPitch = lowPassAngleFilter(filteredPitch, pitch, ALPHA)
        filteredRoll = lowPassAngleFilter(filteredRoll, roll, ALPHA)

        val p = (filteredPitch * 10).toLong() / 10f
        val r = (filteredRoll * 10).toLong() / 10f

        // ✅ Bug B debug: Log khi heading = null (magnetometer unavailable hoặc unreliable)
        val now = System.currentTimeMillis()
        if (now - lastHeadingNullLogTime > 5000L) {
            Log.w(TAG, "⚠️ Heading=null — magnetometer unavailable/unreliable (gravity-based fallback only)")
            lastHeadingNullLogTime = now
        }

        _snapshot.set(
            SensorSnapshot(
                heading = null,  // Không có magnetometer → không có heading
                pitch = p.toDouble(),
                roll = r.toDouble(),
                headingAccuracy = null,
                timestamp = System.currentTimeMillis()
            )
        )
    }

    /**
     * Low-pass filter cho angle (heading) — xử lý wrap-around 360°→0°.
     */
    private fun lowPassAngleFilter(previous: Float, current: Float, alpha: Float): Float {
        // Tính shortest path angle difference
        var diff = current - previous

        // Normalize diff về -180 đến 180
        while (diff > 180f) diff -= 360f
        while (diff < -180f) diff += 360f

        // Apply filter
        val filtered = previous + alpha * diff

        // Normalize output về 0-360
        var result = filtered
        while (result < 0f) result += 360f
        while (result >= 360f) result -= 360f

        return result
    }

    /**
     * Kiểm tra sensor có available không.
     */
    fun isAvailable(): Boolean = isAvailable

    /**
     * Kiểm tra magnetometer có available không.
     */
    fun hasMagnetometer(): Boolean = magnetometer != null
}

/**
 * Container cho orientation data.
 */
data class SensorSnapshot(
    /** Heading (azimuth) theo degrees, 0-360 (0 = North, 90 = East, 180 = South, 270 = West). Null nếu không có magnetometer. */
    val heading: Double? = null,
    /** Pitch theo degrees, -90 đến 90. Góc nghiêng trước/sau. */
    val pitch: Double? = null,
    /** Roll theo degrees, -180 đến 180. Góc nghiêng trái/phải. */
    val roll: Double? = null,
    /** Magnetometer accuracy (nếu có). 0=uncalibrated, 3=high. */
    val headingAccuracy: Int? = null,
    /** Timestamp của measurement. */
    val timestamp: Long = 0
) {
    val hasValidHeading: Boolean get() = heading != null
}
