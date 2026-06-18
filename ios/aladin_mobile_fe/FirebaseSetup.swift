import Foundation
import FirebaseCore

/// Pure Swift utility — no @main, no entry point.
/// Import this and call setupFirebase() from AppDelegate.
public func setupFirebase() {
    // Only configure if not already done
    if FirebaseApp.app() != nil {
        print("[FirebaseApp] Already configured, skipping")
        return
    }

    // Get the path to GoogleService-Info.plist in the bundle
    guard let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") else {
        print("[FirebaseApp] ❌ GoogleService-Info.plist NOT found in bundle!")
        print("[FirebaseApp] Searched in: \(Bundle.main.bundlePath)")
        return
    }

    print("[FirebaseApp] Found plist at: \(plistPath)")

    // FirebaseOptions(contentsOfFile:) returns optional — must unwrap
    guard let options = FirebaseOptions(contentsOfFile: plistPath) else {
        print("[FirebaseApp] ❌ Failed to load FirebaseOptions from plist")
        return
    }

    FirebaseApp.configure(options: options)
    print("[FirebaseApp] ✅ FirebaseApp.configure() SUCCESS")
    print("[FirebaseApp]    Project ID: \(options.projectID ?? "unknown")")
    print("[FirebaseApp]    Bundle ID: \(options.bundleID ?? "unknown")")
}
