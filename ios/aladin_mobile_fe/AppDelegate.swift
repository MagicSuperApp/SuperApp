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
// POST name+reason+stack về log server TRƯỚC khi app chết để biết ĐÚNG module/lý do.
// (_objc_terminate gọi handler này cho ObjC exception trước khi abort.)
private func aladinReportNativeException(_ name: String, _ reason: String, _ stack: [String]) {
  let joined = stack.prefix(40).joined(separator: " || ")
  NSLog("[NATIVE-CRASH] %@: %@\n%@", name, reason, stack.prefix(40).joined(separator: "\n"))
  guard let url = URL(string: "https://gutless-renovator-distaste.ngrok-free.dev/logs") else { return }
  var req = URLRequest(url: url)
  req.httpMethod = "POST"
  req.setValue("application/json", forHTTPHeaderField: "Content-Type")
  req.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")
  let payload: [String: Any] = [
    "event": "native_uncaught_exception",
    "device": "iOS RN", "osVersion": "", "appVersion": "", "stackTrace": joined,
    "data": ["message": "\(name): \(reason)", "stack": joined, "level": "error"],
  ]
  req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
  // Gửi ĐỒNG BỘ (chặn tối đa 3s) vì tiến trình sắp abort.
  let sem = DispatchSemaphore(value: 0)
  URLSession.shared.dataTask(with: req) { _, _, _ in sem.signal() }.resume()
  _ = sem.wait(timeout: .now() + 3)
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
    NSSetUncaughtExceptionHandler { exception in
      aladinReportNativeException(
        exception.name.rawValue,
        exception.reason ?? "nil",
        exception.callStackSymbols
      )
    }

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
