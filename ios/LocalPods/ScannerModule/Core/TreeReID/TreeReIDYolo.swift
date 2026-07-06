import Foundation
import CoreImage
import CoreVideo
import CoreGraphics
import TensorFlowLite

/// YOLO gate cho TreeReID iOS (Plan A) — đối xứng bản Android TreeReIDYolo.kt.
///
/// MỤC ĐÍCH DUY NHẤT: lọc frame CÓ / KHÔNG có cây trước khi cho phép chụp, để không
/// đẩy rác lên server. KHÔNG dùng segmentation/mask — chỉ lấy MAX box-confidence.
/// Chạy trên frame `onFrameCaptured` của CameraSessionManager (BGRA, ~30fps, throttle).
///
/// Model `yolov26seg.tflite` nằm trong bundle ScannerModule (thêm qua podspec resources).
/// THIẾU model / nạp lỗi → available=false → gate KHÔNG chặn (fallback stillness) để
/// build/test vẫn chạy khi chưa gắn model.
///
/// I/O (khớp Android + YOLOTFLiteRunner cũ): input [1,640,640,3] FLOAT32 [0,1] RGB;
/// output[0]=[1,300,38] (x1,y1,x2,y2,conf,cls + 32 mask coeff) — lấy conf ở index 4.
final class TreeReIDYolo {

    // MARK: - Config
    private let inputSize = 640
    private let numDet = 300
    private let totalValues = 38   // 6 box + 32 mask coeff
    private let confIndex = 4      // x1,y1,x2,y2,[conf],cls
    private let inferIntervalMs: Double = 150

    /// Ngưỡng coi là "có cây trong khung". Chỉnh theo thực địa (0..1).
    static let confThreshold: Float = 0.35

    // MARK: - State
    private var interpreter: Interpreter?
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let lock = NSLock()

    private(set) var available = false
    private var lastConf: Float = -1
    private var lastConfAtMs: Double = 0
    private var lastInferAtMs: Double = 0

    private static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    // MARK: - Load
    /// Nạp model (idempotent). Gọi khi bắt đầu phiên chụp.
    func loadModel() {
        lock.lock(); defer { lock.unlock() }
        if interpreter != nil { return }
        guard let path = Self.modelPath() else {
            available = false
            print("[TreeReIDYolo] ⚠️ yolov26seg.tflite không có trong bundle — gate TẮT (fallback stillness)")
            return
        }
        do {
            var opts = Interpreter.Options()
            opts.threadCount = 2
            let itp = try Interpreter(modelPath: path, options: opts)
            try itp.allocateTensors()
            interpreter = itp
            available = true
            print("[TreeReIDYolo] ✅ model nạp OK — gate BẬT")
        } catch {
            interpreter = nil
            available = false
            print("[TreeReIDYolo] ⚠️ nạp model lỗi: \(error) — gate TẮT")
        }
    }

    /// Model có thể ở framework bundle của pod, không phải Bundle.main.
    private static func modelPath() -> String? {
        let name = "yolov26seg", ext = "tflite"
        for b in [Bundle(for: TreeReIDYolo.self), Bundle.main] {
            if let p = b.path(forResource: name, ofType: ext) { return p }
            if let p = b.path(forResource: name, ofType: ext, inDirectory: "ScannerModuleResources") { return p }
        }
        return nil
    }

    func reset() {
        lock.lock(); defer { lock.unlock() }
        lastConf = -1; lastConfAtMs = 0; lastInferAtMs = 0
    }

    // MARK: - Frame processing (gọi từ onFrameCaptured, chạy trên videoOutputQueue)
    /// Chạy detect có throttle, cập nhật lastConf. Nuốt mọi lỗi (không làm sập camera).
    func processFrame(_ pixelBuffer: CVPixelBuffer) {
        let now = Self.nowMs()
        lock.lock()
        let go = available && (now - lastInferAtMs >= inferIntervalMs)
        if go { lastInferAtMs = now }
        lock.unlock()
        guard go else { return }

        guard let cg = cgImage(from: pixelBuffer), let input = preprocess(cg) else { return }
        let conf = infer(input)
        lock.lock()
        lastConf = conf
        lastConfAtMs = now
        lock.unlock()
    }

    /// Gate: true nếu frame gần nhất CÓ cây. An toàn — không chặn oan khi detector
    /// chưa nạp / chưa có kết quả / kết quả quá cũ (>800ms) → rơi về stillness.
    func gatePass() -> Bool {
        lock.lock(); defer { lock.unlock() }
        if !available { return true }
        let ageMs = Self.nowMs() - lastConfAtMs
        if lastConf < 0 || ageMs > 800 { return true }
        return lastConf >= Self.confThreshold
    }

    // MARK: - Internals
    private func cgImage(from pb: CVPixelBuffer) -> CGImage? {
        let ci = CIImage(cvPixelBuffer: pb)
        return ciContext.createCGImage(ci, from: ci.extent)
    }

    /// CGImage → Float32 [1,640,640,3] RGB [0,1]. Tái dùng path proven của YOLOTFLiteRunner.
    private func preprocess(_ image: CGImage) -> Data? {
        let cs = CGColorSpaceCreateDeviceRGB()
        let info = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(
            data: nil, width: inputSize, height: inputSize,
            bitsPerComponent: 8, bytesPerRow: inputSize * 4,
            space: cs, bitmapInfo: info
        ) else { return nil }
        ctx.interpolationQuality = .low
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: inputSize, height: inputSize))
        guard let raw = ctx.data else { return nil }

        let bytesPerRow = inputSize * 4
        let px = Data(bytes: raw, count: bytesPerRow * inputSize)
        let count = inputSize * inputSize * 3
        var buf = Data(count: count * MemoryLayout<Float>.size)

        buf.withUnsafeMutableBytes { dst in
            let fp = dst.bindMemory(to: Float.self)
            px.withUnsafeBytes { src in
                let sp = src.bindMemory(to: UInt8.self)
                var o = 0
                for y in 0..<inputSize {
                    let row = y * bytesPerRow
                    for x in 0..<inputSize {
                        let p = row + x * 4
                        // Khớp YOLOTFLiteRunner cũ (đọc byte[0..2] → xuất r,g,b).
                        let b = Float(sp[p]) / 255.0
                        let g = Float(sp[p + 1]) / 255.0
                        let r = Float(sp[p + 2]) / 255.0
                        fp[o] = r; fp[o + 1] = g; fp[o + 2] = b
                        o += 3
                    }
                }
            }
        }
        return buf
    }

    private func infer(_ input: Data) -> Float {
        lock.lock(); let itp = interpreter; lock.unlock()
        guard let itp = itp else { return -1 }
        do {
            try itp.copy(input, toInputAt: 0)
            try itp.invoke()
            let out = try itp.output(at: 0).data      // [1,300,38] FLOAT32
            var maxConf: Float = 0
            out.withUnsafeBytes { raw in
                let f = raw.bindMemory(to: Float.self)
                let n = min(numDet, f.count / totalValues)
                for i in 0..<n {
                    let c = f[i * totalValues + confIndex]
                    if c > maxConf { maxConf = c }
                }
            }
            return maxConf
        } catch {
            print("[TreeReIDYolo] infer lỗi (bỏ qua): \(error)")
            return -1
        }
    }
}
