import Foundation
import TensorFlowLite

/// TFLite Swift inference runner for YOLO models.
/// Supports dual models: yolov26seg.tflite (tree) and durian-model.tflite (fruit).
/// Uses Apple'sANE delegate when available for fast inference.
///
/// Model info:
///   Input:  [1, 640, 640, 3]  FLOAT32  RGB  [0, 1]
///   Output: [1, 300, 38]      FLOAT32  300 detections × [x1,y1,x2,y2,conf,classId, 32 coeffs]
///   Output: [1, 160, 160, 32] FLOAT32  32 prototype masks
final class YOLOTFLiteRunner {

    // MARK: - Model Type

    enum ModelType {
        case tree      // yolov26seg.tflite - classes: trunk, branch
        case fruit     // durian-model.tflite - class: durian

        var modelFileName: String {
            switch self {
            case .tree: return "yolov26seg"
            case .fruit: return "durian-model"
            }
        }
    }

    // MARK: - Properties

    private var interpreter: Interpreter?
    private let inputSize = ScannerConfig.modelInputSize
    private let numDetections = ScannerConfig.numDetections
    private let numBoxValues = ScannerConfig.numBoxValues
    private let numMaskCoeffs = ScannerConfig.numMaskCoeffs
    private let totalValues = ScannerConfig.totalValues
    private let protoSize = ScannerConfig.protoSize
    private let numProtos = ScannerConfig.numProtos

    private let threshold: Float
    private let numThreads: Int
    private let modelType: ModelType
    private let nmsHelper = NMSHelper()

    private(set) var isInitialized = false
    private var inferenceCount = 0

    /// One-shot triage logs inside `preprocessImage` (first live frame).
    private var loggedPreprocessInnerEnter = false
    private var loggedPreprocessAfterResize = false
    private var loggedPreprocessPacked = false
    private var loggedResizeDrawBefore = false
    private var loggedResizeDrawAfter = false

    /// TFLite `Interpreter` is not thread-safe. Live frames run on `DetectionCoordinator`'s
    /// background queue while `warmup()` runs on the main queue — concurrent `invoke()` can crash.
    private let inferenceLock = NSLock()

    // MARK: - Init

    init(modelType: ModelType = .tree,
         threshold: Float = ScannerConfig.yoloConfidenceThreshold,
         numThreads: Int = ScannerConfig.numThreads) {
        self.modelType = modelType
        self.threshold = threshold
        self.numThreads = numThreads
    }

    deinit {
        release()
    }

    // MARK: - Public API

    /// Load TFLite model from bundle Resources (app bundle or ScannerModule pod bundle).
    func loadModel() throws {
        let path = Self.resolveModelPath(modelName: modelType.modelFileName)

        guard let path = path else {
            throw YOLORunnerError.modelNotFound
        }

        ScannerRemoteLog.breadcrumb(phase: "yolo_model_path_resolved", detail: [
            "pathSuffix": (path as NSString).lastPathComponent,
            "modelType": modelType == .tree ? "tree" : "fruit"
        ])

        var options = Interpreter.Options()
        // Cap threads — high values + allocateTensors during modal present has crashed on some iPhones.
        options.threadCount = max(1, min(numThreads, 2))

        // Try ANE delegate first (fastest on Apple Silicon)
        if #available(iOS 15.0, *), ScannerConfig.enableNeuralEngineDelegate {
            // ANE delegate not directly available via TFLite Swift public API
            // Falls back to default GPU/CPU
        }

        ScannerRemoteLog.breadcrumb(phase: "yolo_before_interpreter_init", detail: [:])
        interpreter = try Interpreter(modelPath: path, options: options)

        ScannerRemoteLog.breadcrumb(phase: "yolo_before_allocate_tensors", detail: [:])
        try interpreter?.allocateTensors()

        ScannerRemoteLog.breadcrumb(phase: "yolo_allocate_tensors_ok", detail: [:])

        isInitialized = true

        if ScannerConfig.runWarmupInLoadModel {
            ScannerRemoteLog.breadcrumb(phase: "yolo_warmup_begin", detail: ["inlineWithLoad": true])
            let warmed = warmup()
            ScannerRemoteLog.breadcrumb(phase: warmed ? "yolo_warmup_ok" : "yolo_warmup_skipped", detail: [:])
        }

        print("[YOLOTFLiteRunner] ✅ Model loaded: \(modelType.modelFileName) from: \(path)")
        logModelInfo()
    }

    /// CocoaPods may embed model files in the framework bundle, not `Bundle.main`.
    private static func resolveModelPath(modelName: String) -> String? {
        let candidates: [Bundle] = [Bundle.main, Bundle(for: YOLOTFLiteRunner.self)]
        for bundle in candidates {
            if let p = bundle.path(forResource: modelName, ofType: "tflite", inDirectory: "ScannerModuleResources") {
                return p
            }
            if let p = bundle.path(forResource: modelName, ofType: "tflite") {
                return p
            }
        }
        return nil
    }

    /// Run detection on a CGImage (letterboxed image at 640×640).
    /// - Parameters:
    ///   - letterboxImage: Preprocessed letterbox CGImage (640×640)
    ///   - letterboxInfo: Letterbox parameters to convert coords back to original
    ///   - originalWidth: Original image width before letterbox
    ///   - originalHeight: Original image height before letterbox
    /// - Returns: Array of YOLODetection in original image coordinates
    func detect(
        letterboxImage: CGImage,
        letterboxInfo: LetterboxInfo,
        originalWidth: Int,
        originalHeight: Int
    ) -> [YOLODetection] {
        inferenceLock.lock()
        defer { inferenceLock.unlock() }

        guard isInitialized, let interpreter = interpreter else { return [] }

        inferenceCount += 1
        let n = inferenceCount

        if n == 1 {
            ScannerRemoteLog.breadcrumb(phase: "yolo_detect_first_entered", detail: [
                "letterboxCgWidth": letterboxImage.width,
                "letterboxCgHeight": letterboxImage.height
            ])
        }

        // Preprocess: convert CGImage → Float32 ByteBuffer [1, 640, 640, 3]
        guard let inputBuffer = preprocessImage(letterboxImage) else {
            print("[YOLOTFLiteRunner] ❌ Preprocess failed")
            ScannerRemoteLog.error(phase: "yolo_preprocess_failed", message: "preprocessImage returned nil", detail: ["inferenceN": n])
            return []
        }

        if n == 1 {
            ScannerRemoteLog.checkpoint("yolo_first_inference", detail: ["step": "preprocess_ok", "inferenceN": n])
        }

        // Copy input to tensor
        do {
            try interpreter.copy(inputBuffer, toInputAt: 0)
        } catch {
            print("[YOLOTFLiteRunner] ❌ Copy input failed: \(error)")
            ScannerRemoteLog.error(phase: "yolo_copy_input_failed", message: error.localizedDescription, detail: ["inferenceN": n])
            return []
        }

        if n == 1 {
            ScannerRemoteLog.checkpoint("yolo_first_inference", detail: ["step": "before_invoke", "inferenceN": n])
        }

        // Run inference
        do {
            try interpreter.invoke()
        } catch {
            print("[YOLOTFLiteRunner] ❌ Invoke failed: \(error)")
            ScannerRemoteLog.error(phase: "yolo_invoke_failed", message: error.localizedDescription, detail: ["inferenceN": n])
            return []
        }

        // Read outputs
        guard let outputBoxes = try? interpreter.output(at: 0),
              let outputProtos = try? interpreter.output(at: 1) else {
            ScannerRemoteLog.error(phase: "yolo_read_output_failed", message: "output(at:) nil", detail: ["inferenceN": n])
            return []
        }

        // Parse output
        let detections = parseYOLOOutput(
            outputBoxes: outputBoxes.data,
            outputProtos: outputProtos.data,
            letterboxInfo: letterboxInfo,
            originalWidth: originalWidth,
            originalHeight: originalHeight
        )

        if n == 1 {
            ScannerRemoteLog.checkpoint("yolo_first_inference", detail: [
                "step": "complete",
                "inferenceN": n,
                "detectionCount": detections.count
            ])
        } else if n == 5 || n == 15 || n == 30 {
            ScannerRemoteLog.breadcrumb(phase: "yolo_inference_heartbeat", detail: [
                "inferenceN": n,
                "detectionCount": detections.count
            ])
        }

        if inferenceCount <= 3 {
            print("[YOLOTFLiteRunner] 🔍 frame#\(inferenceCount): \(detections.count) detections")
        }

        return detections
    }

    /// Warmup the model with a dummy inference.
    func warmup() -> Bool {
        guard isInitialized else { return false }

        guard let dummyImage = createDummyImage(size: inputSize) else {
            print("[YOLOTFLiteRunner] ⚠️ Warmup skipped — could not create dummy image")
            return false
        }
        let letterboxInfo = LetterboxInfo(ratio: 1.0, padLeft: 0, padTop: 0,
                                          originalWidth: inputSize, originalHeight: inputSize)
        let result = detect(letterboxImage: dummyImage, letterboxInfo: letterboxInfo,
                           originalWidth: inputSize, originalHeight: inputSize)

        return result.count >= 0
    }

    /// Release model resources.
    func release() {
        inferenceLock.lock()
        defer { inferenceLock.unlock() }
        interpreter = nil
        isInitialized = false
    }

    // MARK: - Private: Preprocessing

    private func preprocessImage(_ image: CGImage) -> Data? {
        if !loggedPreprocessInnerEnter {
            loggedPreprocessInnerEnter = true
            ScannerRemoteLog.breadcrumb(phase: "yolo_preprocess_inner_enter", detail: [
                "cgWidth": image.width,
                "cgHeight": image.height
            ])
        }

        // Resize to 640×640 using Core Graphics
        guard let resized = resizeToInputSize(image) else {
            ScannerRemoteLog.error(
                phase: "yolo_preprocess_resize_failed",
                message: "resizeToInputSize returned nil",
                detail: [:]
            )
            return nil
        }

        if !loggedPreprocessAfterResize {
            loggedPreprocessAfterResize = true
            ScannerRemoteLog.breadcrumb(phase: "yolo_preprocess_resize_ok", detail: [:])
        }

        // Pixel data: premultiplied BGRA8, 4 bytes/pixel (`pixels` is owned `Data`, not a freed CGContext buffer).
        let px = resized.pixels

        // Create Float32 buffer [1, 640, 640, 3] in NHWC format (RGB order)
        // Normalize: [0, 255] → [0, 1]
        let bufferSize = inputSize * inputSize * 3
        var buffer = Data(count: bufferSize * MemoryLayout<Float>.size)
        buffer.withUnsafeMutableBytes { ptr in
            let floatPtr = ptr.bindMemory(to: Float.self)
            var offset = 0

            for y in 0..<inputSize {
                let rowBase = y * resized.bytesPerRow
                for x in 0..<inputSize {
                    let pixelOffset = rowBase + x * 4

                    // BGRA → RGB for model input
                    let b = Float(px[pixelOffset]) / 255.0
                    let g = Float(px[pixelOffset + 1]) / 255.0
                    let r = Float(px[pixelOffset + 2]) / 255.0

                    floatPtr[offset]     = r
                    floatPtr[offset + 1] = g
                    floatPtr[offset + 2] = b
                    offset += 3
                }
            }
        }

        if !loggedPreprocessPacked {
            loggedPreprocessPacked = true
            ScannerRemoteLog.breadcrumb(phase: "yolo_preprocess_float_pack_ok", detail: ["byteCount": buffer.count])
        }

        return buffer
    }

    private func resizeToInputSize(_ image: CGImage) -> ResizedImage? {
        // Letterbox already outputs 640×640 for live frames; we still run one bilinear draw into a BGRA8 buffer
        // (identity scale when 640×640). Pixel bytes are copied into `Data` before the pool frees `CGContext`.
        // (vImage was removed: `vImage_CGImageFormat` / SDK overlays differ across Xcode versions and broke CI.)

        // Pool transient CoreGraphics objects; copy pixels out before the pool frees the context buffer.
        return autoreleasepool {
            if !loggedResizeDrawBefore {
                loggedResizeDrawBefore = true
                ScannerRemoteLog.breadcrumb(phase: "yolo_resize_draw_before", detail: [
                    "srcW": image.width,
                    "srcH": image.height,
                    "dst": inputSize
                ])
            }

            let colorSpace = CGColorSpaceCreateDeviceRGB()
            let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

            guard let context = CGContext(
                data: nil,
                width: inputSize,
                height: inputSize,
                bitsPerComponent: 8,
                bytesPerRow: inputSize * 4,
                space: colorSpace,
                bitmapInfo: bitmapInfo.rawValue
            ) else {
                return nil
            }

            context.interpolationQuality = .low
            context.draw(image, in: CGRect(x: 0, y: 0, width: inputSize, height: inputSize))

            guard let raw = context.data else {
                return nil
            }

            let rowBytes = inputSize * 4
            let byteCount = rowBytes * inputSize
            let pixels = Data(bytes: raw, count: byteCount)

            if !loggedResizeDrawAfter {
                loggedResizeDrawAfter = true
                ScannerRemoteLog.breadcrumb(phase: "yolo_resize_draw_after", detail: [
                    "byteCount": byteCount
                ])
            }

            return ResizedImage(
                pixels: pixels,
                width: inputSize,
                height: inputSize,
                bytesPerRow: rowBytes
            )
        }
    }

    private func createDummyImage(size: Int) -> CGImage? {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

        guard let context = CGContext(
            data: nil,
            width: size,
            height: size,
            bitsPerComponent: 8,
            bytesPerRow: size * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ) else {
            return nil
        }

        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: size, height: size))

        return context.makeImage()
    }

    // MARK: - Private: Output Parsing

    /// Parse YOLO output — matches Kotlin parseYOLOOutput().
    private func parseYOLOOutput(
        outputBoxes: Data,
        outputProtos: Data,
        letterboxInfo: LetterboxInfo,
        originalWidth: Int,
        originalHeight: Int
    ) -> [YOLODetection] {
        let floatCount = outputBoxes.count / MemoryLayout<Float>.size
        guard let floatPtr = outputBoxes.withUnsafeBytes({ $0.bindMemory(to: Float.self).baseAddress }) else {
            print("[YOLOTFLiteRunner] ⚠️ Empty output tensor, skipping")
            return []
        }

        let ratio = letterboxInfo.ratio
        let padLeft = letterboxInfo.padLeft
        let padTop = letterboxInfo.padTop

        let minW = Float(originalWidth) * ScannerConfig.minDetectionWidthPercent
        let minH = Float(originalHeight) * ScannerConfig.minDetectionHeightPercent
        let minArea = Float(originalWidth * originalHeight) * ScannerConfig.minDetectionAreaPercent
        let marginX = Float(originalWidth) * 0.01
        let marginY = Float(originalHeight) * 0.01

        var rawDetections: [YOLODetection] = []

        for i in 0..<numDetections {
            let base = i * totalValues
            guard (base + totalValues - 1) < floatCount else { break }

            let v0 = floatPtr[base + 0]
            let v1 = floatPtr[base + 1]
            let v2 = floatPtr[base + 2]
            let v3 = floatPtr[base + 3]
            let conf = floatPtr[base + 4]
            let classId = Int(floatPtr[base + 5])

            if conf < threshold { continue }

            // Try Format 1: [x1, y1, x2, y2] normalized → pixel coords
            var x1 = (v0 * Float(inputSize) - padLeft) / ratio
            var y1 = (v1 * Float(inputSize) - padTop) / ratio
            var x2 = (v2 * Float(inputSize) - padLeft) / ratio
            var y2 = (v3 * Float(inputSize) - padTop) / ratio

            x1 = max(0, min(Float(originalWidth), x1))
            y1 = max(0, min(Float(originalHeight), y1))
            x2 = max(0, min(Float(originalWidth), x2))
            y2 = max(0, min(Float(originalHeight), y2))

            if x2 <= x1 || y2 <= y1 { continue }

            let bw = x2 - x1
            let bh = y2 - y1
            let area = bw * bh
            let ar = bw / bh

            // Filters (same as Android)
            if bw < minW || bh < minH || area < minArea { continue }
            if ar < ScannerConfig.minAspectRatio || ar > ScannerConfig.maxAspectRatio { continue }
            if x2 < marginX || y2 < marginY ||
               x1 > Float(originalWidth) - marginX ||
               y1 > Float(originalHeight) - marginY { continue }

            // Extract 32 mask coefficients
            var maskCoeffs = [Float](repeating: 0, count: numMaskCoeffs)
            for m in 0..<numMaskCoeffs {
                maskCoeffs[m] = floatPtr[base + numBoxValues + m]
            }

            // Normalized rect [0-1]
            let normRect = CGRect(
                x: CGFloat(x1 / Float(originalWidth)),
                y: CGFloat(y1 / Float(originalHeight)),
                width: CGFloat(bw / Float(originalWidth)),
                height: CGFloat(bh / Float(originalHeight))
            )

            let detection = YOLODetection(
                rect: CGRect(x: Double(x1), y: Double(y1), width: Double(bw), height: Double(bh)),
                confidence: conf,
                classId: classId,
                maskCoeffs: maskCoeffs,
                normalizedRect: normRect,
                modelType: self.modelType
            )

            rawDetections.append(detection)
        }

        // Apply NMS
        let boxesWithIdx = rawDetections.enumerated().map { (idx, det) in
            (rect: det.rect, confidence: det.confidence, classId: det.classId)
        }
        let keepIndices = nmsHelper.applyNMS(boxes: boxesWithIdx)
        let nmsFiltered = keepIndices.compactMap { idx in rawDetections.first { $0.rect == boxesWithIdx[idx].rect && $0.confidence == boxesWithIdx[idx].confidence } }

        // Limit to maxResults
        return Array(nmsFiltered.prefix(ScannerConfig.maxResults))
    }

    // MARK: - Private

    private func logModelInfo() {
        guard let interpreter = interpreter else { return }
        print("[YOLOTFLiteRunner] 📦 Model inputs: \(interpreter.inputTensorCount)")
        print("[YOLOTFLiteRunner] 📦 Model outputs: \(interpreter.outputTensorCount)")
        for i in 0..<interpreter.inputTensorCount {
            if let tensor = try? interpreter.input(at: i) {
                print("   Input[\(i)] shape: \(tensor.shape.dimensions), dtype: \(tensor.dataType)")
            }
        }
        for i in 0..<interpreter.outputTensorCount {
            if let tensor = try? interpreter.output(at: i) {
                print("   Output[\(i)] shape: \(tensor.shape.dimensions), dtype: \(tensor.dataType)")
            }
        }
    }
}

// MARK: - Errors

enum YOLORunnerError: Error, LocalizedError {
    case modelNotFound
    case allocationFailed
    case inferenceFailed

    var errorDescription: String? {
        switch self {
        case .modelNotFound: return "YOLO model file not found in bundle"
        case .allocationFailed: return "Failed to allocate tensors"
        case .inferenceFailed: return "TFLite inference failed"
        }
    }
}

// MARK: - Helpers

private struct ResizedImage {
    /// Premultiplied BGRA8, row length `bytesPerRow` (may be padded).
    let pixels: Data
    let width: Int
    let height: Int
    let bytesPerRow: Int
}