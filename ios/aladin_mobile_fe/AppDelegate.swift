import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseAnalytics

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
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
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider() as! any RCTDependencyProvider

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "aladin_mobile_fe",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
