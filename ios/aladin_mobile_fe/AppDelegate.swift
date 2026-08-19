internal import Expo
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseAnalytics

// ── Bắt uncaught ObjC exception (native) ─────────────────────────────────────
// Bản signed crash EXC_CRASH/SIGABRT do NSException không bắt (ObjCTurboModule
// performVoidMethodInvocation rethrow) — crash log .ips KHÔNG ghi reason. Hàm này
// ghi name+reason+stack ra nhật ký hệ thống TRƯỚC khi app chết, để biết ĐÚNG
// module/lý do. (_objc_terminate gọi handler này cho ObjC exception trước abort.)
//
// KHÔNG gửi đi đâu cả. Bản trước POST thẳng về một tên miền ngrok tạm viết cứng
// trong mã: đo được chuỗi đó nằm trong nhị phân bản phát hành 94 (`strings` trên
// chính tệp .app đã ký). Tên miền ngrok miễn phí hết hạn là ai cũng giành lại
// được, và từ giây đó mọi tên module + lý do lỗi + dấu vết ngăn xếp của máy người
// dùng thật chảy về tay người lạ — không cờ tắt, không ai đồng ý.
//
// Cần lại đường gửi từ xa thì đi qua `REMOTE_LOG_URL` (biến môi trường, mặc định
// rỗng = tắt) như `src/services/remoteLogger.ts` đã làm — đừng viết cứng lần nữa.
private func aladinReportNativeException(_ name: String, _ reason: String, _ stack: [String]) {
  NSLog("[NATIVE-CRASH] %@: %@\n%@", name, reason, stack.prefix(40).joined(separator: "\n"))
}

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // PHẢI đặt SỚM NHẤT — bắt NSException gây SIGABRT lúc khởi động (bản signed).
    // LƯU vào UserDefaults NGAY (không phụ thuộc mạng) rồi POST. Nếu POST lúc crash
    // không kịp, lần mở SAU sẽ gửi lại (dưới) — bulletproof kể cả crash-loop.
    NSSetUncaughtExceptionHandler { exception in
      let text = "\(exception.name.rawValue): \(exception.reason ?? "nil")\n"
        + exception.callStackSymbols.prefix(30).joined(separator: "\n")
      UserDefaults.standard.set(text, forKey: "aladin_native_crash")
      UserDefaults.standard.synchronize()
      aladinReportNativeException(
        exception.name.rawValue,
        exception.reason ?? "nil",
        exception.callStackSymbols
      )
    }

    // Gửi lại crash lần trước (nếu POST lúc crash chưa kịp) — chạy TRƯỚC startReactNative
    // nên kể cả app crash mỗi lần mở, lần mở kế vẫn đẩy được lý do lên server.
    if let saved = UserDefaults.standard.string(forKey: "aladin_native_crash") {
      UserDefaults.standard.removeObject(forKey: "aladin_native_crash")
      UserDefaults.standard.synchronize()
      aladinReportNativeException("native_crash_recovered", saved, [])
    }

    // ── PRE-WARM UIKit text/font trên MAIN THREAD (fix crash Fabric off-main) ──────
    // NGUYÊN NHÂN GỐC màn trắng→crash bản signed: RN New Architecture (Fabric) đo &
    // layout text trên BACKGROUND thread. Lần ĐẦU chạm UIFont/NSAttributedString,
    // ObjC gọi `+initialize` của các class UIKit (UIFont, NSAttributeDictionary,
    // NSParagraphStyle) — trên MÁY THẬT, `+initialize` chạy lần đầu NGOÀI main thread
    // gây SIGABRT (crash log build 73: `+[UIFont systemFontOfSize:]`; build 74:
    // `+[NSAttributeDictionary initialize]` — đều trên dispatch worker/JS thread).
    // Giả lập timing khác nên không lộ. Chạm trước TRÊN MAIN để `+initialize` hoàn
    // tất an toàn TRƯỚC khi Fabric đo text ở background.
    let warmFont = UIFont.systemFont(ofSize: 14)
    _ = UIFont.boldSystemFont(ofSize: 14)
    _ = NSParagraphStyle.default
    let warm = NSMutableAttributedString(string: "warmup")
    warm.addAttribute(.font, value: warmFont, range: NSRange(location: 0, length: warm.length))
    warm.addAttribute(.paragraphStyle, value: NSParagraphStyle.default, range: NSRange(location: 0, length: warm.length))
    _ = warm.size()

    // ── Firebase init via GoogleService-Info.plist (native-side only) ────────────
    // Firebase Analytics for tracking user experience
    if FirebaseApp.app() == nil {
      if let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
         let options = FirebaseOptions(contentsOfFile: plistPath) {
        FirebaseApp.configure(options: options)
        print("[AppDelegate] ✅ Firebase configured, projectID: \(options.projectID ?? "unknown")")
      } else {
        print("[AppDelegate] ⚠️  GoogleService-Info.plist not in bundle — Firebase may not work")
        print("[AppDelegate]    Check that autolink copied it: pod install should handle this")
      }
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider() as! any RCTDependencyProvider

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "aladin_mobile_fe",
      in: window,
      launchOptions: launchOptions
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // Giữ entry "index" của RN CLI (KHÔNG dùng ".expo/.virtual-metro-entry" mà
    // install-expo-modules tự đặt) — app vẫn chạy metro RN gốc, expo chỉ để expo-gl.
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
