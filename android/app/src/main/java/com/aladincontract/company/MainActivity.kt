package com.aladincontract.company

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
// expo-modules-core: cần cho expo-gl (nền 3D three.js / @react-three/fiber).
import expo.modules.ReactActivityDelegateWrapper
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase

class MainActivity : ReactActivity() {

  /**
   * `null` khi app đang dựng KHÔNG có cấu hình Firebase. Xem `onCreate`.
   */
  private var analytics: FirebaseAnalytics? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // ── Firebase là TUỲ APP, nên chỗ này phải hỏi trước khi chạm ────────────
    //
    // `android/app/build.gradle` cố ý cho mỗi app tự quyết có Firebase hay
    // không: flavor nào không có `src/<flavor>/google-services.json` thì bước
    // xử lý Google Services bị TẮT cho flavor đó. Hôm nay chỉ `aladin` có tệp;
    // `checkfarm` thì không.
    //
    // Không có tệp ⇒ không có `google_app_id` trong tài nguyên ⇒ trình khởi-tạo
    // tự động của Firebase không dựng được app mặc-định. Khi ấy `Firebase.analytics`
    // KHÔNG trả về null mà NÉM:
    //
    //     java.lang.IllegalStateException: Default FirebaseApp is not initialized
    //     in this process com.checkfarm.app
    //
    // Ném trong `onCreate` nghĩa là chết TRƯỚC khi có một khung hình nào — người
    // dựng thấy app bật lên rồi tắt ngay, Metro chỉ in `BUNDLE ./index.js` lặp
    // lại (vòng lặp khởi động lại), và KHÔNG có lỗi JS nào để đọc. Muốn biết vì
    // sao phải mở `adb logcat`.
    //
    // Phía JS đã lường trước chuyện này từ đầu — `pushHandler.ts` nạp module
    // Firebase bằng `await import(...)` trong `try` và trả `null` khi vắng. Chỉ
    // lớp native này bị bỏ sót. Nay hỏi `FirebaseApp.getApps()` trước: hàm đó
    // trả về danh sách RỖNG (không ném) khi chưa có app nào được dựng.
    //
    // Analytics vắng thì app vẫn chạy đủ chức năng — đây là đo đếm, không phải
    // tính năng của người dùng.
    analytics = if (FirebaseApp.getApps(this).isNotEmpty()) Firebase.analytics else null
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SuperApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled))
}
