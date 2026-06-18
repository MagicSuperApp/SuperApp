import Foundation
import UIKit

/// Breadcrumbs for the scanner pipeline — works even when JS is wedged, by POSTing in parallel to JS.
/// Keep default `endpoint` in sync with `REMOTE_LOG_SERVER_URL` in `src/services/remoteLogger.ts`.
///
/// **Không dùng Xcode:** trên server, sort theo `data.nativeSeq` (tăng dần) hoặc `data.bootSession` + `timestamp`.
/// File dự phòng trên máy: `Documents/scanner_native_breadcrumb.txt` (xem `localFallbackPath`).
///
/// **Crash triage — last successful phase:** `camera_first_frame_delivered` → `pipeline_first_letterbox_ok` →
/// `yolo_detect_first_entered` → `yolo_preprocess_inner_enter` → `yolo_resize_draw_before` → `yolo_resize_draw_after` → `yolo_preprocess_resize_ok` → `yolo_preprocess_float_pack_ok` →
/// `checkpoint_yolo_first_inference` (preprocess_ok / before_invoke / complete) → `yolo_inference_heartbeat` (n=5,15,30) →
/// **Coordinator (per frame with detections):** `coordinator_crop_begin` → `coordinator_crop_ok` → `coordinator_before_overlay_send` → `coordinator_before_stable_tracking` →
/// `coordinator_before_state_machine` → `coordinator_after_state_machine`.
/// **Circular session (once):** `coordinator_first_circular_pending_set` → `coordinator_circular_session_starting` →
/// `coordinator_creating_device_id` → `coordinator_device_id_ok` → `coordinator_tree_id_ok` →
/// `coordinator_circular_sm_start_begin` → `coordinator_circular_sm_start_ok` →
/// `coordinator_start_sensor_feed_begin` → `coordinator_start_sensor_feed_dispatched` → `coordinator_circular_session_fully_started`.
/// **UI:** `overlay_first_boxes_path_set` (CAShapeLayer path OK) | cảnh báo: `overlay_rebuild_skipped_zero_bounds` (có detection nhưng bounds=0).
/// Lỗi: `yolo_preprocess_resize_failed`, `yolo_preprocess_failed`, `yolo_copy_input_failed`, `yolo_invoke_failed`, `yolo_read_output_failed`,
/// `coordinator_crop_failed`, `coordinator_overlay_invalid_boxes`.
/// RAM: `scanner_vc_memory_warning`.
enum ScannerRemoteLog {

    /// Default must match `REMOTE_LOG_SERVER_URL` in remoteLogger.ts until JS calls `setLogEndpoint`.
    static var endpoint: String =
        "https://gutless-renovator-distaste.ngrok-free.dev/logs"

    /// Một ID mỗi lần cold start — lọc log sau khi app restart vì crash.
    static let bootSessionId: String = String(UUID().uuidString.prefix(8))

    private static let seqLock = NSLock()
    private static var nextSeq: Int = 0

    /// Đường dẫn file fallback (Documents) — có thể xuất qua Files / chia sẻ nếu HTTP không tới được.
    static var localFallbackPath: String? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("scanner_native_breadcrumb.txt").path
    }

    // MARK: - Public API

    /// Phase names are stable so you can grep server logs: e.g. `camera_configure_begin`.
    static func breadcrumb(phase: String, detail: [String: Any] = [:]) {
        emit(level: "info", phase: phase, detail: detail)
    }

    /// Dùng trong `catch` hoặc nhánh lỗi.
    static func error(phase: String, message: String, detail: [String: Any] = [:]) {
        var d = detail
        d["message"] = message
        emit(level: "error", phase: phase, detail: d)
    }

    /// Điểm neo có tên (cùng payload; `level` = checkpoint).
    static func checkpoint(_ name: String, detail: [String: Any] = [:]) {
        var d = detail
        d["checkpoint"] = name
        emit(level: "checkpoint", phase: "checkpoint_\(name)", detail: d)
    }

    /// Camera lifecycle events
    static func cameraEvent(_ event: String, detail: [String: Any] = [:]) {
        var d = detail
        d["cameraEvent"] = event
        emit(level: "info", phase: "camera_\(event)", detail: d)
    }

    /// Circular session lifecycle
    static func circularSession(_ stage: String, detail: [String: Any] = [:]) {
        var d = detail
        d["sessionStage"] = stage
        emit(level: "info", phase: "circular_session_\(stage)", detail: d)
    }

    /// Tree operations tracking
    static func treeOperation(_ action: String, treeId: String?, detail: [String: Any] = [:]) {
        var d = detail
        d["action"] = action
        if let tid = treeId {
            d["treeId"] = tid
        }
        emit(level: "info", phase: "tree_\(action)", detail: d)
    }

    // MARK: - Core

    private static func nextNativeSeq() -> Int {
        seqLock.lock()
        defer { seqLock.unlock() }
        nextSeq += 1
        return nextSeq
    }

    private static func threadLabel() -> String {
        if Thread.isMainThread { return "main" }
        if let n = Thread.current.name, !n.isEmpty { return n }
        return "bg"
    }

    private static func emit(level: String, phase: String, detail: [String: Any]) {
        let seq = nextNativeSeq()
        var data: [String: Any] = detail
        data["phase"] = phase
        data["level"] = level
        data["nativeSeq"] = seq
        data["bootSession"] = bootSessionId
        data["isMainThread"] = Thread.isMainThread
        data["thread"] = threadLabel()
        data["timestamp"] = ISO8601DateFormatter().string(from: Date())
        data["platform"] = "ios"
        data["deviceModel"] = UIDevice.current.model
        data["osVersion"] = UIDevice.current.systemVersion
        if let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            data["appVersion"] = v
        }

        // CRITICAL FIX: Only get stack trace on main thread to avoid crashes
        // Background thread stack traces can cause crashes in React Native bridge
        var stackSnippet = ""
        if Thread.isMainThread {
            do {
                let symbols = Thread.callStackSymbols
                stackSnippet = symbols.prefix(12).joined(separator: "\n")
            } catch {
                stackSnippet = "Stack trace unavailable: \(error.localizedDescription)"
            }
        } else {
            stackSnippet = "Background thread - stack trace skipped for safety"
        }

        let summary = "seq=\(seq) \(phase) level=\(level) main=\(Thread.isMainThread) \(detail)"
        print("[ScannerRemoteLog] \(summary)")

        appendLocalFallback(summary)

        guard let url = URL(string: endpoint) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")
        request.timeoutInterval = 8

        let body: [String: Any] = [
            "event": "scanner_native",
            "data": data,
            "stackTrace": stackSnippet,
            "device": "iOS Device",
            "osVersion": UIDevice.current.systemVersion,
            "appVersion": data["appVersion"] ?? ""
        ]

        guard let httpBody = try? JSONSerialization.data(withJSONObject: body, options: []) else { return }
        request.httpBody = httpBody

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                print("[ScannerRemoteLog] HTTP fail \(phase): \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                print("[ScannerRemoteLog] HTTP \(http.statusCode) for \(phase)")
            }
        }.resume()
    }

    private static func appendLocalFallback(_ line: String) {
        guard let fileURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("scanner_native_breadcrumb.txt") else { return }

        let stamp = ISO8601DateFormatter().string(from: Date())
        let row = "[\(stamp)] \(line)\n"

        do {
            if FileManager.default.fileExists(atPath: fileURL.path) {
                let old = try String(contentsOf: fileURL, encoding: .utf8)
                // Giữ khoảng 120KB cuối để file không phình vô hạn
                let maxChars = 120_000
                let combined = old + row
                let trimmed: String
                if combined.count > maxChars {
                    trimmed = String(combined.suffix(maxChars))
                } else {
                    trimmed = combined
                }
                try trimmed.write(to: fileURL, atomically: true, encoding: .utf8)
            } else {
                try row.write(to: fileURL, atomically: true, encoding: .utf8)
            }
        } catch {
            print("[ScannerRemoteLog] local file append failed: \(error.localizedDescription)")
        }
    }
}
