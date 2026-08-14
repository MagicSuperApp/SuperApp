package com.aladincontract.company.compass

import com.aladincontract.company.treereid.HeadingSensorReader
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.abs

/**
 * CompassHeading — LA BÀN dùng chung, cho màn Dẫn đường.
 *
 * ── Vì sao có module này, trong khi app đã đọc được la bàn ──────────────────
 * `HeadingSensorReader` (cảm biến hợp nhất TYPE_ROTATION_VECTOR) đã có sẵn và đã
 * chỉnh kỹ, nhưng nó bị khoá bên trong `TreeReIDBridgeModule` — chỉ chạy trong
 * PHIÊN CHỤP ẢNH CÂY, và bật nó lên đồng nghĩa với mở cả camera. Màn Dẫn đường
 * chỉ cần con số hướng, không cần camera.
 *
 * Nên module này KHÔNG viết lại phép đọc cảm biến: nó dùng chính
 * `HeadingSensorReader`, chỉ bọc thêm vòng đời bật/tắt độc lập với camera.
 *
 * ── Hợp đồng với JS ─────────────────────────────────────────────────────────
 *   NativeModules.CompassHeading.start(minDeltaDeg)   bắt đầu phát sự kiện
 *   NativeModules.CompassHeading.stop()               dừng, nhả cảm biến
 *   NativeModules.CompassHeading.hasCompass(promise)  máy này có từ kế không
 *   sự kiện 'HeadingUpdated' → { heading: Double }    0…360, 0 = Bắc
 *
 * Tên module và tên sự kiện đặt TRÙNG với thư viện `react-native-compass-heading`
 * — nếu sau này thay bằng thư viện đó thì phía JS không phải đụng dòng nào.
 *
 * ── CẦM MÁY THẾ NÀO (cần thử ngoài thực địa) ───────────────────────────────
 * `HeadingSensorReader` remap trục theo tư thế CẦM DỰNG ĐỨNG, ống kính chĩa về
 * phía trước — vì nó vốn viết cho lúc chụp ảnh cây. Với màn Dẫn đường, tư thế đó
 * cho đúng thứ ta cần: hướng người đang nhìn.
 *
 * Nhưng nếu người dùng cầm máy NẰM NGANG như cầm la bàn thật, phép remap ấy cho
 * số kém tin cậy. Chưa đổi phép remap ở đây vì việc đó phải đo trên máy thật ở
 * cả hai tư thế mới biết đúng sai — đoán rồi sửa mù là cách chắc chắn nhất để
 * làm hỏng cái đang chạy được cho luồng chụp cây.
 *
 * ── Vì sao có ngưỡng `minDeltaDeg` ──────────────────────────────────────────
 * Cảm biến chạy ~50 Hz. Bắn hết sang JS là 50 lần vẽ lại mỗi giây cho một con số
 * gần như không đổi — tốn pin giữa vườn, chỗ người dùng không sạc được. Chỉ báo
 * khi hướng đổi quá ngưỡng. Lọc rung thì `HeadingSensorReader` đã làm (α=0,15).
 */
class CompassHeadingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CompassHeading"
        private const val EV_HEADING = "HeadingUpdated"
        private const val DEFAULT_MIN_DELTA = 1.0
    }

    override fun getName(): String = NAME

    private var reader: HeadingSensorReader? = null

    /** Hướng đã báo lần gần nhất — để so với ngưỡng. */
    private var lastSent: Double? = null
    private var minDelta: Double = DEFAULT_MIN_DELTA

    @ReactMethod
    fun start(minDeltaDeg: Double) {
        minDelta = if (minDeltaDeg > 0) minDeltaDeg else DEFAULT_MIN_DELTA
        // Cảm biến phải đăng ký trên luồng có Looper. Gọi từ JS thread mà không
        // chuyển luồng thì trên một số máy listener im lặng không bao giờ chạy.
        UiThreadUtil.runOnUiThread {
            if (reader != null) return@runOnUiThread
            lastSent = null
            val r = HeadingSensorReader(reactContext) { heading, _, _ -> onHeading(heading) }
            if (!r.hasRotationVector) return@runOnUiThread
            reader = r
            r.start()
        }
    }

    @ReactMethod
    fun stop() {
        UiThreadUtil.runOnUiThread {
            reader?.stop()
            reader = null
            lastSent = null
        }
    }

    /** Máy này có cảm biến hướng không — JS hỏi trước để biết nên nói gì với người dùng. */
    @ReactMethod
    fun hasCompass(promise: Promise) {
        promise.resolve(HeadingSensorReader(reactContext) { _, _, _ -> }.hasRotationVector)
    }

    // RN yêu cầu hai method này cho mọi module có phát sự kiện; thiếu là cảnh báo
    // "new NativeEventEmitter() requires a non-null argument" trên bản dựng release.
    @ReactMethod
    fun addListener(eventName: String) { /* giữ chỗ */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* giữ chỗ */ }

    /**
     * Kiến trúc mới (bridgeless) gọi `invalidate()` chứ không còn
     * `onCatalystInstanceDestroy`. Không nhả cảm biến ở đây thì listener sống
     * qua cả lần tải lại JS — pin tụt mà không màn nào đang dùng la bàn.
     */
    override fun invalidate() {
        reader?.stop()
        reader = null
        super.invalidate()
    }

    private fun onHeading(heading: Double) {
        val prev = lastSent
        if (prev != null) {
            // So sánh theo VÒNG TRÒN: 359° và 1° cách nhau 2°, không phải 358°.
            var d = abs(heading - prev)
            if (d > 180) d = 360 - d
            if (d < minDelta) return
        }
        lastSent = heading
        if (!reactContext.hasActiveReactInstance()) return
        val evt = Arguments.createMap().apply { putDouble("heading", heading) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EV_HEADING, evt)
    }
}
