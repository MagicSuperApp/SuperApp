package com.mvp.orilife

object Config {

    // ✅ Evidence Ingest API (POST /evidences/ingest)
    val TREE_DETECTION_API = com.mvp.orilife.BuildConfig.TREE_DETECTION_API

    // ✅ Base API URL for /farms, /trees endpoints
    // Loaded from secrets.properties: BASE_API_URL
    val BASE_API_URL = com.mvp.orilife.BuildConfig.BASE_API_URL

    // ✅ API Key for X-API-Key header authentication
    // Loaded from secrets.properties: API_KEY
    val API_KEY = com.mvp.orilife.BuildConfig.API_KEY

    // ✅ Default region code for tree registration
    // Loaded from secrets.properties: REGION_CODE
    val DEFAULT_REGION_CODE = com.mvp.orilife.BuildConfig.REGION_CODE

    // --- Confidence Thresholds ---
    const val YOLO_CONFIDENCE_THRESHOLD = 0.25f
    const val AR_OVERLAY_CONFIDENCE_THRESHOLD = 0.55f
    const val PROCESSING_CONFIDENCE_THRESHOLD = 0.3f  // Giảm từ 0.6 → 0.5 để dễ test

    // --- Detection Stability ---
    const val AR_OVERLAY_STABILITY_FRAMES = 5
    const val PROCESSING_STABILITY_FRAMES = 3   // Giảm từ 10 → 3 để test nhanh hơn

    // --- NMS / Tracking ---
    const val NMS_IOU_THRESHOLD = 0.45f
    const val SAME_TREE_IOU_THRESHOLD = 0.5f

    // --- Delegate Config ---
    const val ENABLE_GPU_DELEGATE = false
    const val ENABLE_NNAPI_DELEGATE = true
    const val NUM_THREADS = 4
    const val DETAILED_LOG_INTERVAL_MS = 5000L

    // --- Sensor Thresholds ---
    const val SENSOR_MOVEMENT_THRESHOLD = 0.1f  // Giảm từ 0.5 → 0.1 để nhạy hơn
    const val SENSOR_SHAKE_THRESHOLD = 8.0f     // Giảm từ 15.0 → 8.0 để dễ trigger
    const val SENSOR_CUTTING_PATTERN_THRESHOLD = 5.0f  // Giảm từ 8.0 → 5.0

    // --- Detection Filters (used in YOLODetectionHelper.parseYOLOOutput) ---
    const val MIN_DETECTION_WIDTH_PERCENT = 0.05f
    const val MIN_DETECTION_HEIGHT_PERCENT = 0.08f
    const val MIN_DETECTION_AREA_PERCENT = 0.009f
    const val MIN_ASPECT_RATIO = 0.1f
    const val MAX_ASPECT_RATIO = 10.0f
    const val MAX_RESULTS = 5

    // --- Camera Performance ---
    const val ENABLE_FRAME_SKIP = true
    const val SKIP_FRAMES = 2
    const val MIN_FRAME_INTERVAL_MS = 50L
    const val IMAGE_QUEUE_DEPTH = 1

    // --- Mask / Segmentation ---
    const val MASK_THRESHOLD = 0.5f              // Ngưỡng sigmoid cho mask [0-1]
    const val MASK_INNER_THRESHOLD = 0.6f        // Ngưỡng trong (feathered mask)
    const val MASK_OUTER_THRESHOLD = 0.3f        // Ngưỡng ngoài (feathered mask)

    // --- Blur Detection (Camera Quality Gate) ---
    const val BLUR_CHECK_ENABLED = true          // Bật/tắt blur check pre-detection
    const val BLUR_VARIANCE_THRESHOLD = 100.0    // Ngưỡng Laplacian variance (cao = nghiêm ngặt)
    const val BLUR_STABLE_FRAMES = 3             // Số frame sắc nét liên tiếp trước khi bắt đầu detection

    // --- Auto-focus Gate ---
    const val AUTO_FOCUS_COOLDOWN_MS = 1200L     // Tránh spam trigger focus liên tục
    const val AUTO_FOCUS_SETTLE_MS = 350L        // Chờ lens ổn định trước khi detect/capture
}
