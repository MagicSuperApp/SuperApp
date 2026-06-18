import Foundation

/// Swift constants equivalent to Android Config.kt
enum ScannerConfig {

    private struct APISecrets {
        static let treeDetectionAPI: String = {
            // SAFE FALLBACK: To maintain security, we DO NOT hardcode the real API URL here.
            // The real API URL must be injected via `secrets.plist` during the Codemagic build
            // or local build environment.
            let fallbackURL = "https://placeholder-api.orilife.com/error_missing_secrets"

            class BundleFinder {}
            let bundles = [Bundle.main, Bundle(for: BundleFinder.self)]

            for bundle in bundles {
                if let url = bundle.url(forResource: "secrets", withExtension: "plist"),
                   let data = try? Data(contentsOf: url),
                   let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
                   let apiURL = plist["TREE_DETECTION_API"] as? String,
                   !apiURL.isEmpty && !apiURL.contains("placeholder-api") {
                    return apiURL
                }
            }
            return fallbackURL
        }()

        static let apiKey: String = {
            class BundleFinder {}
            let bundles = [Bundle.main, Bundle(for: BundleFinder.self)]

            for bundle in bundles {
                if let url = bundle.url(forResource: "secrets", withExtension: "plist"),
                   let data = try? Data(contentsOf: url),
                   let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
                   let key = plist["API_KEY"] as? String,
                   !key.isEmpty {
                    return key
                }
            }
            return ""
        }()

        static let regionCode: String = {
            class BundleFinder {}
            let bundles = [Bundle.main, Bundle(for: BundleFinder.self)]

            for bundle in bundles {
                if let url = bundle.url(forResource: "secrets", withExtension: "plist"),
                   let data = try? Data(contentsOf: url),
                   let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
                   let region = plist["REGION_CODE"] as? String,
                   !region.isEmpty {
                    return region
                }
            }
            return "vn-south-01"
        }()

        static var baseApiUrl: String { treeDetectionAPI }
    }

    // MARK: - API
    static var treeDetectionAPI: String {
        APISecrets.treeDetectionAPI
    }

    static var regionCode: String {
        APISecrets.regionCode
    }

    static var baseApiUrl: String {
        APISecrets.baseApiUrl
    }

    static var apiKey: String {
        APISecrets.apiKey
    }

    // MARK: - Confidence Thresholds
    static let yoloConfidenceThreshold: Float = 0.25  // Keep original for other flows
    static let arOverlayConfidenceThreshold: Float = 0.60  // Increased from 0.55 for more stable overlay
    static let processingConfidenceThreshold: Float = 0.30

    // NEW: For background removal flow only
    static let backgroundRemovalConfidenceThreshold: Float = 0.25  // Lower to include all detections (was 0.60 - too high!)

    // MARK: - Detection Stability
    static let arOverlayStabilityFrames = 5
    static let processingStabilityFrames = 3

    // MARK: - Box Smoothing
    static let boxSmoothingAlpha: Float = 0.15  // Lower = smoother (15% new, 85% old)

    // MARK: - NMS / Tracking
    static let nmsIOUThreshold: Float = 0.45
    static let sameTreeIOUThreshold: Float = 0.50

    // MARK: - Delegate Config
    /// Optional extra `invoke()` right after `allocateTensors`. Can still crash on some devices; first live frame warms the model if false.
    static let runWarmupInLoadModel = false
    /// Fewer threads reduces peak memory and GPU/Metal contention during `allocateTensors` on device.
    static let numThreads = 2
    static let enableGPUDelegate = false
    static let enableNeuralEngineDelegate = true

    // MARK: - Sensor Thresholds
    static let sensorMovementThreshold: Float = 0.10
    static let sensorShakeThreshold: Float = 8.0
    static let sensorCuttingPatternThreshold: Float = 5.0

    // MARK: - Detection Filters
    static let minDetectionWidthPercent: Float = 0.05
    static let minDetectionHeightPercent: Float = 0.08
    static let minDetectionAreaPercent: Float = 0.009
    static let minAspectRatio: Float = 0.10
    static let maxAspectRatio: Float = 10.0
    static let maxResults = 5

    // MARK: - Camera Performance
    static let enableFrameSkip = true
    static let skipFrames = 2
    static let minFrameIntervalMS: Int64 = 50
    static let imageQueueDepth = 1

    // MARK: - Mask / Segmentation
    static let maskThreshold: Float = 0.50
    static let maskInnerThreshold: Float = 0.60
    static let maskOuterThreshold: Float = 0.30

    // NEW: For background removal with multiple detections
    static let minConfidenceForMaskMerge: Float = 0.80  // Only merge high-quality detections

    // MARK: - Blur Detection
    static let blurCheckEnabled = true
    static let blurVarianceThreshold: Double = 100.0
    static let blurStableFrames = 3
    /// Laplacian gate — not a fatal error; emit via `onBlurDetected`, not `onDetectionError`.
    static let blurStabilityHintMessage = "Hãy giữ camera ổn định"

    // MARK: - Auto-focus Gate
    static let autoFocusCooldownMS: Int64 = 1200
    static let autoFocusSettleMS: Int64 = 350

    // MARK: - YOLO Model
    static let modelInputSize = 640
    static let numDetections = 300
    static let numBoxValues = 6          // cx, cy, w, h, conf, classId
    static let numMaskCoeffs = 32         // 32 mask coefficients
    static let totalValues = 38           // 6 box + 32 mask coeffs
    static let protoSize = 160             // prototype mask size 160x160
    static let numProtos = 32             // 32 prototype masks

    // MARK: - Image Cropping
    static let cropPadding: Float = 0.30  // 30% padding around detections

    // MARK: - YOLO Classes
    enum YOLOClass: Int {
        case branch = 0
        case trunk = 1

        var label: String {
            switch self {
            case .branch: return "Branch"
            case .trunk:  return "Trunk"
            }
        }
    }

    // MARK: - Fruit YOLO Classes
    enum FruitYOLOClass: Int {
        case durian = 0

        var label: String {
            return "Durian"
        }
    }
}
