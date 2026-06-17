import Foundation

/// ID generation utilities matching Android IdGenerator.kt.
final class IDGenerator {

    // MARK: - Public API

    /// Generate a unique image ID.
    static func generateImageId() -> String {
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let random = Int.random(in: 1000...9999)
        return "img_\(timestamp)_\(random)"
    }

    /// Generate a tree ID from device ID, session, and timestamp.
    ///
    /// ⚠️ LEGACY — Tạo tree_id KHÁC NHAU mỗi lần quét (vì có timestamp), KHÔNG dedup theo cây.
    /// Dùng cho scenario không có GPS. Khi có GPS → ưu tiên `generateTreeIdByLocation`.
    static func generateTreeId(deviceId: String, sessionId: String, timestamp: Int64) -> String {
        let input = "\(deviceId)_\(sessionId)_\(timestamp)"
        let hash = input.sha256Prefix(16)
        return "tree_\(hash)"
    }

    /// Generate a tree ID **deterministic theo vị trí GPS** trong 1 trang trại.
    ///
    /// Quét lại cùng 1 cây (vị trí cách nhau ≤ `gridMeters`) → trả về CÙNG tree_id → tự động dedup.
    ///
    /// Cơ chế: round lat/lng theo grid `gridMeters` (mặc định 8m), hash với farmId.
    /// 1m ≈ 0.000009° → grid 8m = 0.000072°.
    ///
    /// **Field test 18/5 + 25/5 cho thấy GPS dưới tán sầu riêng jitter 5-15m,**
    /// **không phải 3m như giả định ban đầu** — 2 lần scan cùng cây rơi vào 2
    /// grid cell khác nhau → 2 tree_id khác → trùng ID. Grid 8m bao phủ hết
    /// jitter range trong khi cây sầu riêng trồng ≥6m nên rất hiếm khi 2 cây
    /// thực sự chung 1 cell.
    ///
    /// Trả `nil` nếu GPS hỏng (lat=0 hoặc lng=0 — "Null Island", thường là
    /// GPS chưa lock). Caller phải fallback `generateTreeId(deviceId, session,
    /// timestamp)` hoặc đợi GPS lock trước khi gen ID.
    static func generateTreeIdByLocation(
        farmId: String,
        latitude: Double,
        longitude: Double,
        gridMeters: Double = 8.0
    ) -> String? {
        // Null Island guard — (0, 0) thường là GPS chưa lock, không phải vị
        // trí thật. Nếu hash (0, 0) thành tree_id, mọi cây scan với GPS hỏng
        // sẽ merge thành 1 tree_id → mass-deduplication.
        guard latitude != 0.0, longitude != 0.0 else { return nil }
        // Sanity bound — lat/lng ngoài range có nghĩa là GPS rác.
        guard abs(latitude) <= 90.0, abs(longitude) <= 180.0 else { return nil }

        let gridDeg = gridMeters / 111_000.0
        let latGrid = (latitude / gridDeg).rounded() * gridDeg
        let lngGrid = (longitude / gridDeg).rounded() * gridDeg
        let input = "\(farmId)_\(String(format: "%.6f", latGrid))_\(String(format: "%.6f", lngGrid))"
        let hash = input.sha256Prefix(16)
        return "tree_\(hash)"
    }

    /// Generate a virtual ID for a detected object.
    static func generateVirtualId(label: String) -> String {
        let timestamp = Int(Date().timeIntervalSince1970)
        let random = Int.random(in: 1000...9999)
        return "vid_\(label.lowercased())_\(timestamp)_\(random)"
    }
}

// MARK: - String Extension

extension String {
    func sha256Prefix(_ length: Int) -> String {
        // Simple FNV-like hash
        var hashValue: UInt64 = 14695981039346656037
        for byte in Data(self.utf8) {
            hashValue ^= UInt64(byte)
            hashValue &*= 1099511628211
        }

        let hex = String(hashValue, radix: 16)
        return String(hex.prefix(length))
    }
}
