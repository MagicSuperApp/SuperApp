import Foundation

/// TreeReID configuration constants
/// Based on docs: capture-by-heading protocol (|Δheading| ≥ 25° OR |Δpitch| ≥ 18°)
enum TreeReIDConfig {

    // MARK: - Sensor Thresholds

    /// Minimum heading change to trigger capture (degrees)
    static let minHeadingDelta: Double = 25.0

    /// Minimum pitch change to trigger capture (degrees)
    static let minPitchDelta: Double = 18.0

    /// Sensor update frequency (Hz)
    static let sensorUpdateHz: Double = 50.0

    /// Heading filter threshold for CLLocationManager (degrees)
    static let headingFilterDegrees: Double = 1.0

    // MARK: - Stillness (chống chụp khi đang lia/di chuyển → ảnh nhoè/trùng — Lỗi field #2)

    /// Tốc-độ xoay tức-thời tối-đa (độ/frame @50Hz) để coi là "đứng yên". Trên ngưỡng =
    /// đang lia máy → CHƯA chụp (chờ tay dừng).
    /// ⚠️ CẦN CALIBRATE TRÊN MÁY THẬT: xem log breadcrumb `capture_deferred_moving` +
    /// `heading_capture_triggered` (steadyFrames). Máy đứng yên nhiễu ~<0.5°/frame; lia
    /// chậm ~0.6°/frame; lia nhanh >1.5. Default 1.5 = an-toàn (không chặn máy đang giữ,
    /// chỉ chặn lia nhanh). Muốn siết ảnh trùng thì GIẢM dần (vd 0.8) tới khi vừa.
    static let steadyRateThreshold: Double = 1.5

    /// Số frame ổn-định LIÊN TIẾP cần có trước khi cho phép chụp (≈ steadyFramesRequired/50Hz giây).
    static let steadyFramesRequired: Int = 3

    // MARK: - Blur (kiểm độ-nét ảnh — loại ảnh mờ)

    /// Ngưỡng Laplacian variance; DƯỚI ngưỡng = ảnh mờ (khớp main ScannerConfig.blurVarianceThreshold).
    static let blurVarianceThreshold: Double = 100.0

    // MARK: - Image Processing

    /// Maximum image dimension (pixels) - resize if larger
    static let imageMaxDimension: Int = 1280

    /// JPEG compression quality (0.0 - 1.0)
    static let imageQuality: CGFloat = 0.85

    /// Minimum images required for enrollment
    static let minImagesForEnroll: Int = 4

    /// Maximum images per request
    static let maxImagesPerRequest: Int = 20

    // MARK: - Capture Rounds

    /// Minimum captures for Round 1 (thân cây)
    static let minCapturesRound1: Int = 4

    /// Minimum captures for Round 2 (cận gốc/vỏ)
    static let minCapturesRound2: Int = 2

    /// Maximum captures per round (safety limit)
    static let maxCapturesPerRound: Int = 12

    // MARK: - Guidance Hints

    static let guidanceRound1: String = "Đi vòng quanh cây, lia chậm để lấy đủ góc."

    static let guidanceRound2: String = "Đứng SÁT GỐC, chĩa ống kính LÊN — lấy rõ vỏ gốc, sẹo, chạc cây."

    static let guidanceNeedMore: String = "Xoay thêm chút nữa để lấy góc mới."

    static let guidanceCaptured: String = "Đã lấy 1 góc 👍 — tiếp tục lia."

    static let guidanceSufficient: String = "Đủ để nhận rồi. Muốn chắc hơn: bấm Lia thêm lượt (cận gốc)."

    static let guidanceSameSpeciesNearby: String = "Cây này giống cây gần đây — lấy thêm góc cận gốc/vỏ để phân biệt."

    // MARK: - API

    /// Base URL for Tree ReID API (from env or default)
    static var baseURL: String {
        // TODO: Load from environment/config
        return ProcessInfo.processInfo.environment["ORILIFE_TREEID_BASE_URL"]
            ?? "https://test.orilife.io"
    }

    /// API timeout (seconds)
    static let apiTimeout: TimeInterval = 45.0

    /// Auth token TTL (seconds) - 12 hours
    static let authTokenTTL: TimeInterval = 12 * 60 * 60

    // MARK: - Events

    static let eventHeadingUpdate: String = "onTreeReIDHeadingUpdate"
    static let eventCaptureTriggered: String = "onTreeReIDCaptureTriggered"
    static let eventRoundComplete: String = "onTreeReIDRoundComplete"
    static let eventSessionComplete: String = "onTreeReIDSessionComplete"
    static let eventIdentificationResult: String = "onTreeReIDIdentificationResult"
    static let eventError: String = "onTreeReIDError"
}

/// Capture round state
enum CaptureRound: Int {
    case round1Body = 1   // Thân cây (trunk body)
    case round2Bark = 2  // Cận gốc/vỏ (near-base bark detail)
    case complete = 3

    var displayName: String {
        switch self {
        case .round1Body: return "Lượt 1: Thân cây"
        case .round2Bark: return "Lượt 2: Cận gốc"
        case .complete: return "Hoàn thành"
        }
    }

    var guidance: String {
        switch self {
        case .round1Body: return TreeReIDConfig.guidanceRound1
        case .round2Bark: return TreeReIDConfig.guidanceRound2
        case .complete: return TreeReIDConfig.guidanceSufficient
        }
    }
}