import Foundation
import CoreLocation
import ScannerModule

// MARK: - LocationListener

/// Listener callbacks for GPS location updates.
protocol LocationListener: AnyObject {
    /// Called when a location is found with acceptable accuracy.
    func onLocationFound(location: CLLocation)
    /// Called periodically while waiting for better accuracy.
    func onLocationWait(currentAccuracy: Float)
}

// MARK: - LocationHelper

/// GPS location tracking helper.
/// Requests location permission, starts location updates with best accuracy,
/// and feeds coordinates into DetectionCoordinator.
/// Mirrors Android LocationHelper.kt exactly.
final class LocationHelper: NSObject {

    // MARK: - Properties

    weak var listener: LocationListener?

    /// Most recently acquired location.
    private(set) var latestLocation: CLLocation?

    private let locationManager = CLLocationManager()
    private var isRunning = false
    private var isPermissionGranted = false

    /// Accuracy threshold in meters — location is considered "good" when <= this.
    private let targetAccuracy: Double = 10.0
    /// Maximum wait time for good accuracy before giving up (seconds).
    private let maxWaitTimeSeconds: TimeInterval = 30.0
    private var startTime: Date?

    // MARK: - Init

    override init() {
        super.init()
        locationManager.delegate = self
        // Field test 2026-05-15 (lần 2): @Quang test 6 cây + retry 2 = 2 mã khác nhau.
        // Root cause: NearestTen accuracy + lazy GPS init → `latestLocation` có thể nil
        // khi user bắt đầu quét → fallback timestamp-based ID → mỗi quét khác nhau.
        // Revert về Best để GPS fix nhanh + chính xác hơn cho dedup.
        // distanceFilter = 3m vẫn giữ → callback chỉ 1 lần/3m → vẫn tiết kiệm pin
        // (so với kCLDistanceFilterNone trước đây).
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 3.0
        // Build 51 (2026-05-17) — Thư field feedback "0 điểm + máy nóng":
        // .fitness activity type = Apple recommended cho walking; tự auto-pause
        // khi user đứng yên → giảm 30-50% power vs .other default.
        // KHÔNG đổi desiredAccuracy (vẫn Best cho dedup chính xác).
        // KHÔNG đổi distanceFilter (3m tối ưu accuracy ↔ thermal).
        // Internal sensor fusion (GPS + accel + gyro + compass) của Apple
        // cho .fitness sẽ smooth GPS jitter mà không cần Kalman tự build.
        locationManager.activityType = .fitness
        locationManager.pausesLocationUpdatesAutomatically = true
        // allowsBackgroundLocationUpdates default = false → boundary capture chỉ
        // chạy khi app foreground (đúng UX); explicit để tránh accidentally enable.
        locationManager.allowsBackgroundLocationUpdates = false
    }

    // MARK: - Public API

    /// Request location permission from the user.
    func requestPermission() {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = locationManager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        ScannerRemoteLog.breadcrumb(phase: "treereid_location_request_permission", detail: [
            "status": "\(status)",
            "isRunning": isRunning
        ])

        switch status {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_dialog_shown", detail: [:])
        case .authorizedWhenInUse, .authorizedAlways:
            isPermissionGranted = true
            print("[LocationHelper] ✅ Permission already granted")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_permission_already_granted", detail: [:])
        case .denied, .restricted:
            isPermissionGranted = false
            print("[LocationHelper] ⚠️ Location permission denied")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_permission_denied", detail: [:])
        @unknown default:
            isPermissionGranted = false
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_permission_unknown", detail: ["status": "\(status)"])
        }
    }

    /// Start location updates.
    /// Call requestPermission() first.
    func start() {
        guard !isRunning else {
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_start_skipped", detail: [
                "reason": "alreadyRunning"
            ])
            return
        }

        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = locationManager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        ScannerRemoteLog.breadcrumb(phase: "treereid_location_start_check", detail: [
            "status": "\(status)",
            "isRunning": isRunning
        ])

        // Only start if permission is already granted.
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            print("[LocationHelper] ⚠️ Permission not yet granted (status=\(status)) — skipping start, will retry on authorization change")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_start_skipped", detail: [
                "reason": "noPermission",
                "status": "\(status)"
            ])
            if status == .notDetermined {
                // Dialog is showing — no action needed, callback will fire
            } else {
                isPermissionGranted = false
            }
            return
        }

        isPermissionGranted = true
        startTime = Date()
        isRunning = true
        locationManager.startUpdatingLocation()
        print("[LocationHelper] ✅ Started — best accuracy location tracking active")
        ScannerRemoteLog.breadcrumb(phase: "treereid_location_start_ok", detail: [:])
    }

    /// Stop location updates.
    func stop() {
        guard isRunning else { return }
        isRunning = false
        locationManager.stopUpdatingLocation()
        print("[LocationHelper] 🛑 Stopped")
    }

    /// Whether location is currently tracking.
    var isLocationRunning: Bool { isRunning }

    /// Whether location permission is granted.
    var hasPermission: Bool { isPermissionGranted }
}

// MARK: - CLLocationManagerDelegate

extension LocationHelper: CLLocationManagerDelegate {

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        latestLocation = location

        let accuracy = location.horizontalAccuracy

        ScannerRemoteLog.breadcrumb(phase: "treereid_location_update", detail: [
            "lat": location.coordinate.latitude,
            "lon": location.coordinate.longitude,
            "accuracy": accuracy,
            "targetAccuracy": targetAccuracy
        ])

        // Auto-stop if accuracy is good enough
        if accuracy <= targetAccuracy {
            print("[LocationHelper] ✅ Location acquired: lat=\(location.coordinate.latitude), lon=\(location.coordinate.longitude), accuracy=\(accuracy)m")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_acquired", detail: [
                "lat": location.coordinate.latitude,
                "lon": location.coordinate.longitude,
                "accuracy": accuracy
            ])
            listener?.onLocationFound(location: location)
        } else {
            // Check if we've been waiting too long
            if let start = startTime {
                let elapsed = Date().timeIntervalSince(start)
                if elapsed >= maxWaitTimeSeconds {
                    print("[LocationHelper] ⏰ Max wait time reached — using current location (accuracy=\(accuracy)m)")
                    ScannerRemoteLog.breadcrumb(phase: "treereid_location_timeout", detail: [
                        "accuracy": accuracy,
                        "elapsed": elapsed
                    ])
                    listener?.onLocationFound(location: location)
                    return
                }
            }

            print("[LocationHelper] 📍 Location wait: accuracy=\(accuracy)m (target=\(targetAccuracy)m)")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_waiting", detail: [
                "accuracy": accuracy,
                "targetAccuracy": targetAccuracy
            ])
            listener?.onLocationWait(currentAccuracy: Float(accuracy))
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[LocationHelper] ❌ Location error: \(error.localizedDescription)")
        ScannerRemoteLog.error(phase: "treereid_location_error", message: error.localizedDescription, detail: [:])

        if let clError = error as? CLError {
            switch clError.code {
            case .denied:
                isPermissionGranted = false
                print("[LocationHelper] ⚠️ Location access denied")
            case .locationUnknown:
                print("[LocationHelper] ⚠️ Location temporarily unavailable")
            default:
                break
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if #available(iOS 14.0, *) {
            handleAuthorizationStatus(manager.authorizationStatus)
        }
    }

    private func handleAuthorizationStatus(_ status: CLAuthorizationStatus) {
        ScannerRemoteLog.breadcrumb(phase: "treereid_location_auth_changed", detail: [
            "status": "\(status)",
            "isRunning": isRunning
        ])

        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            isPermissionGranted = true
            print("[LocationHelper] ✅ Location permission granted")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_auth_granted", detail: [:])
            // If start() was called while dialog was showing, retry now
            if !isRunning {
                print("[LocationHelper] 🔄 Retrying start after permission granted")
                start()
            }
        case .denied, .restricted:
            isPermissionGranted = false
            print("[LocationHelper] ⚠️ Location permission denied/restricted")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_auth_denied", detail: [:])
        case .notDetermined:
            print("[LocationHelper] ⏳ Location permission not yet determined")
            ScannerRemoteLog.breadcrumb(phase: "treereid_location_auth_not_determined", detail: [:])
        @unknown default:
            break
        }
    }
}
