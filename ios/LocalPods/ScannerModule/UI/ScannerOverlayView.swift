import UIKit

/// Scanner overlay view showing YOLO bounding boxes.
/// Uses CAShapeLayer for performant, hardware-accelerated rendering.
/// Mirrors Android OverlayView.kt.
final class ScannerOverlayView: UIView {

    // MARK: - Static Logging

    private static var loggedFirstBoxesPath = false
    private static var loggedZeroBoundsOnce = false

    // MARK: - Properties

    private let boxLayer = CAShapeLayer()
    private let labelLayer = CALayer()
    private let reticleLayer = CAShapeLayer()
    private let scanLayer = CAShapeLayer()

    private var overlayAlpha: CGFloat = 1.0
    private var isFadingOut = false
    private var densityFactor: CGFloat = 1.0

    private var imageHeight: Int = 0
    private var imageWidth: Int = 0
    private var debugMode = false

    private var scanDotPaint: UIColor = UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0)
    private var scanWaveProgress: CGFloat = 0.0
    private var scanAnimator: Timer?
    private var scanMode: ScanMode = .tree

    enum ScanMode { case tree, apple }

    var detections: [Detection] = [] {
        didSet {
            if detections.isEmpty && !oldValue.isEmpty {
                fadeOut()
            } else if !detections.isEmpty && oldValue.isEmpty {
                fadeIn()
            }
            rebuildBoxPath()
        }
    }

    var showBoxes = true {
        didSet {
            boxLayer.isHidden = !showBoxes
            labelLayer.isHidden = !showBoxes
            rebuildBoxPath()
        }
    }

    func setDebugMode(_ enabled: Bool) {
        debugMode = enabled
        setNeedsDisplay()
    }

    func clearDetections() {
        fadeOut()
    }

    // MARK: - Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    deinit {
        stopScanAnimation()
    }

    // MARK: - Setup

    private func setup() {
        backgroundColor = .clear
        isUserInteractionEnabled = false

        calculateDensityFactor()

        boxLayer.fillColor = UIColor.clear.cgColor
        boxLayer.strokeColor = UIColor(red: 0.3, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        boxLayer.lineWidth = 2.2 / densityFactor
        boxLayer.lineDashPattern = nil
        layer.addSublayer(boxLayer)

        labelLayer.backgroundColor = UIColor.black.withAlphaComponent(0.6).cgColor
        labelLayer.cornerRadius = 4
        labelLayer.masksToBounds = true
        layer.addSublayer(labelLayer)

        reticleLayer.fillColor = UIColor.clear.cgColor
        reticleLayer.strokeColor = UIColor.white.withAlphaComponent(0.5).cgColor
        reticleLayer.lineWidth = 2.0 / densityFactor
        layer.addSublayer(reticleLayer)

        scanLayer.fillColor = UIColor.clear.cgColor
        scanLayer.strokeColor = UIColor.clear.cgColor
        layer.addSublayer(scanLayer)

        startScanAnimation()
    }

    private func calculateDensityFactor() {
        let density = UIScreen.main.scale
        densityFactor = min(max(density, 0.75), 2.0)
    }

    // MARK: - Scan Animation (matches Android GRID_SIZE=40, TREE_PATTERN)

    private func startScanAnimation() {
        stopScanAnimation()
        scanAnimator = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] _ in
            self?.updateScanAnimation()
        }
    }

    private func stopScanAnimation() {
        scanAnimator?.invalidate()
        scanAnimator = nil
    }

    private func updateScanAnimation() {
        scanWaveProgress += 0.0045
        if scanWaveProgress > 1.0 { scanWaveProgress = 0.0 }

        if detections.isEmpty && !isFadingOut {
            rebuildScanAnimation()
            setNeedsDisplay()
        }
    }

    private func rebuildScanAnimation() {
        let pattern = scanMode == .tree ? TreeScanPattern() : AppleScanPattern()
        guard !pattern.isEmpty else { return }

        let sizePx = min(bounds.width, bounds.height) * 0.70
        let left = (bounds.width - sizePx) / 2
        let top = (bounds.height - sizePx) / 2
        let gridCount = CGFloat(pattern.count)
        let cellSize = sizePx / gridCount
        let baseRadius = cellSize * 0.20

        let path = UIBezierPath()
        var dotCount = 0

        for (row, rowStr) in pattern.enumerated() {
            for (col, char) in rowStr.enumerated() {
                if char == "1" {
                    let normalizedY = CGFloat(row) / gridCount
                    let dy = scanWaveProgress - normalizedY

                    let w: CGFloat
                    if dy < -0.22 {
                        w = 0.0
                    } else if dy > 0.18 {
                        w = 0.0
                    } else if dy < 0 {
                        let t = (dy + 0.22) / 0.22
                        w = (1 - cos(CGFloat.pi * t)) / 2
                    } else {
                        let t = dy / 0.18
                        w = (1 + cos(CGFloat.pi * t)) / 2
                    }

                    let scale = 0.85 + (1.9 - 0.85) * w
                    let alpha = 0.35 + (1.0 - 0.35) * w

                    let cx = left + (CGFloat(col) + 0.5) * cellSize
                    let cy = top + (CGFloat(row) + 0.5) * cellSize

                    let dotPath = UIBezierPath(arcCenter: CGPoint(x: cx, y: cy), radius: baseRadius * scale, startAngle: 0, endAngle: CGFloat.pi * 2, clockwise: true)
                    path.append(dotPath)
                    dotCount += 1
                }
            }
        }

        scanLayer.fillColor = scanDotPaint.withAlphaComponent(CGFloat(0.35 + (1.0 - 0.35) * 0.5)).cgColor
        scanLayer.path = path.cgPath
    }

    private func TreeScanPattern() -> [String] {
        return [
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000111111000001111100000000000",
            "0000000000111111111111111111111000000000",
            "0000001111111111111111111111111110000000",
            "0000111111111111111111111111111111100000",
            "0000111111111111111111111111111111100000",
            "0001111111111111111111111111111111000000",
            "0111111111111111111111111111111111100000",
            "1111111111111111111111111111111111111000",
            "1111111111111111111111111111111111111110",
            "0111111111111111111111111111111111111100",
            "0001111111111111111111111111111111111000",
            "0000111111111111111111111111111111110000",
            "0001111111111111111111111111111111111000",
            "0011111111111111111111111111111111111100",
            "0111111111111111111111111111111111111110",
            "0111111111111111111111111111111111111100",
            "0011111111111111111111111111111111110000",
            "0000111111111111111111111111111111100000",
            "0000000011111111111111111111111110000000",
            "0000000000111111111111111111000000000000",
            "0000000000000111111111111110000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000000001111111111000111000000000",
            "0000000000000000111111110011111100000000",
            "0000000000000000001111000111111100000000",
            "0000000000000000001111000111110000000000",
            "0000000000000000001111011100000000000000",
            "0000000000000000001111111000000000000000",
            "0000000000000000001111100000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000001111000000000000000000",
            "0000000000000000011111100000000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000000000000000000000000000000"
        ]
    }

    private func AppleScanPattern() -> [String] {
        return [
            "0000000000000000000000000000000000000000",
            "0000000000000000000110000000000000000000",
            "0000000000000000000110000000000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000001111111111111111000000000000",
            "0000000000011111111111111111100000000000",
            "0000000000111111111111111111110000000000",
            "0000000001111111111111111111111000000000",
            "0000000011111111111111111111111100000000",
            "0000000011111111111111111111111100000000",
            "0000000111111111111111111111111110000000",
            "0000000111111111111111111111111110000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000001111111111111111111111111111000000",
            "0000000111111111111111111111111110000000",
            "0000000111111111111111111111111110000000",
            "0000000011111111111111111111111100000000",
            "0000000011111111111111111111111100000000",
            "0000000001111111111111111111111000000000",
            "0000000000111111111111111111110000000000",
            "0000000000011111111111111111100000000000",
            "0000000000001111111111111111000000000000",
            "0000000000000011111111111100000000000000",
            "0000000000000000111111110000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000"
        ]
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        boxLayer.frame = bounds
        labelLayer.frame = bounds
        reticleLayer.frame = bounds
        scanLayer.frame = bounds
        rebuildBoxPath()
        rebuildReticle()
    }

    // MARK: - Box Colors (matches Android getColorForLabel)

    private func colorForLabel(_ label: String) -> UIColor {
        switch label.lowercased() {
        case "trunk": return UIColor(red: 0.13, green: 0.59, blue: 0.95, alpha: 1.0)   // #2196F3 blue
        case "branch": return UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0) // #4CAF50 green
        case "leaf": return UIColor(red: 1.00, green: 0.76, blue: 0.03, alpha: 1.0)   // #FFC107 yellow
        case "fruit": return UIColor(red: 1.00, green: 0.60, blue: 0.00, alpha: 1.0)  // #FF9800 orange
        default: return UIColor(red: 0.61, green: 0.15, blue: 0.69, alpha: 1.0)       // #9C27B0 purple
        }
    }

    // MARK: - Rebuild Paths

    private func rebuildBoxPath() {
        guard showBoxes, !detections.isEmpty else {
            boxLayer.path = nil
            labelLayer.sublayers?.forEach { $0.removeFromSuperlayer() }
            return
        }

        let bw = bounds.width
        let bh = bounds.height
        guard bw > 0, bh > 0 else {
            boxLayer.path = nil
            if !detections.isEmpty, !Self.loggedZeroBoundsOnce {
                Self.loggedZeroBoundsOnce = true
            }
            return
        }

        let scaleX = bw / CGFloat(imageWidth > 0 ? imageWidth : 1)
        let scaleY = bh / CGFloat(imageHeight > 0 ? imageHeight : 1)
        let scale = max(scaleX, scaleY)

        let scaledW = CGFloat(imageWidth) * scale
        let scaledH = CGFloat(imageHeight) * scale
        let offsetX = (bw - scaledW) / 2
        let offsetY = (bh - scaledH) / 2

        let path = UIBezierPath()
        var sublayers: [CALayer] = []

        for detection in detections {
            let n = detection.normalizedBox
            let nx = CGFloat.minimum(CGFloat.maximum(n.origin.x, 0), 1)
            let ny = CGFloat.minimum(CGFloat.maximum(n.origin.y, 0), 1)
            let nw = CGFloat.minimum(CGFloat.maximum(n.size.width, 0), 1)
            let nh = CGFloat.minimum(CGFloat.maximum(n.size.height, 0), 1)

            let screenBox = CGRect(
                x: nx * scaledW + offsetX,
                y: ny * scaledH + offsetY,
                width: nw * scaledW,
                height: nh * scaledH
            )

            guard screenBox.width > 0, screenBox.height > 0 else { continue }

            let boxColor = colorForLabel(detection.label)
            let radius = min(4, min(screenBox.width, screenBox.height) / 2)
            let boxPath = UIBezierPath(roundedRect: screenBox, cornerRadius: radius)
            path.append(boxPath)

            let textLabel = "\(detection.label): \(Int(detection.confidence * 100))%"
            let textSize = textLabel.size(withAttributes: [.font: UIFont.systemFont(ofSize: 12, weight: .medium)])
            let labelW = textSize.width + 16
            let labelH = textSize.height + 8

            var labelY = screenBox.minY - labelH - 4
            if labelY < 0 { labelY = screenBox.maxY + 4 }

            let labelLayerInner = CATextLayer()
            labelLayerInner.string = textLabel
            labelLayerInner.font = UIFont.systemFont(ofSize: 12, weight: .medium)
            labelLayerInner.fontSize = 12
            labelLayerInner.foregroundColor = UIColor.white.cgColor
            labelLayerInner.backgroundColor = boxColor.withAlphaComponent(0.8).cgColor
            labelLayerInner.cornerRadius = 4
            labelLayerInner.alignmentMode = .center
            labelLayerInner.contentsScale = UIScreen.main.scale
            labelLayerInner.frame = CGRect(x: screenBox.minX, y: labelY, width: labelW, height: labelH)
            sublayers.append(labelLayerInner)
        }

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        boxLayer.strokeColor = UIColor(red: 0.3, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        boxLayer.lineWidth = 2.2 / densityFactor
        boxLayer.path = path.cgPath

        labelLayer.sublayers?.forEach { $0.removeFromSuperlayer() }
        sublayers.forEach { labelLayer.addSublayer($0) }
        CATransaction.commit()

        if !Self.loggedFirstBoxesPath, !detections.isEmpty {
            Self.loggedFirstBoxesPath = true
        }
    }

    private func rebuildReticle() {
        let cx = bounds.midX
        let cy = bounds.midY
        let reticleRadius: CGFloat = 30
        let reticleLength: CGFloat = 20

        let path = UIBezierPath()
        path.addArc(withCenter: CGPoint(x: cx, y: cy), radius: reticleRadius, startAngle: 0, endAngle: CGFloat.pi * 2, clockwise: true)
        path.move(to: CGPoint(x: cx - reticleLength, y: cy))
        path.addLine(to: CGPoint(x: cx + reticleLength, y: cy))
        path.move(to: CGPoint(x: cx, y: cy - reticleLength))
        path.addLine(to: CGPoint(x: cx, y: cy + reticleLength))

        reticleLayer.path = path.cgPath
    }

    // MARK: - Update Detections

    func updateDetections(_ detections: [Detection], imageHeight: Int = 0, imageWidth: Int = 0) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.updateDetections(detections, imageHeight: imageHeight, imageWidth: imageWidth)
            }
            return
        }

        self.imageHeight = imageHeight
        self.imageWidth = imageWidth
        self.detections = detections
    }

    func clearDetectionsAnimated() {
        detections = []
    }

    // MARK: - Fade Animation

    private func fadeOut() {
        guard !isFadingOut else { return }
        isFadingOut = true

        UIView.animate(withDuration: 0.2, animations: {
            self.overlayAlpha = 0.0
            self.boxLayer.opacity = Float(self.overlayAlpha)
            self.labelLayer.opacity = Float(self.overlayAlpha)
        }, completion: { [weak self] _ in
            self?.isFadingOut = false
        })
    }

    private func fadeIn() {
        UIView.animate(withDuration: 0.15) {
            self.overlayAlpha = 1.0
            self.boxLayer.opacity = Float(self.overlayAlpha)
            self.labelLayer.opacity = Float(self.overlayAlpha)
        }
    }

    // MARK: - Draw Debug Grid

    override func draw(_ rect: CGRect) {
        super.draw(rect)

        guard debugMode else { return }

        guard let context = UIGraphicsGetCurrentContext() else { return }

        context.setStrokeColor(UIColor.white.withAlphaComponent(0.25).cgColor)
        context.setLineWidth(1)

        let gridSize = 10
        let stepX = bounds.width / CGFloat(gridSize)
        let stepY = bounds.height / CGFloat(gridSize)

        for i in 0...gridSize {
            context.move(to: CGPoint(x: CGFloat(i) * stepX, y: 0))
            context.addLine(to: CGPoint(x: CGFloat(i) * stepX, y: bounds.height))
        }
        for i in 0...gridSize {
            context.move(to: CGPoint(x: 0, y: CGFloat(i) * stepY))
            context.addLine(to: CGPoint(x: bounds.width, y: CGFloat(i) * stepY))
        }
        context.strokePath()

        context.setStrokeColor(UIColor.white.withAlphaComponent(0.5).cgColor)
        context.setLineWidth(2)
        context.stroke(rect)

        let debugInfo = [
            "DEBUG MODE ON",
            "View: \(Int(bounds.width))x\(Int(bounds.height))",
            "Image: \(imageWidth)x\(imageHeight)",
            "Detections: \(detections.count)"
        ]

        var y: CGFloat = 50
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 14),
            .foregroundColor: UIColor.yellow
        ]
        for line in debugInfo {
            line.draw(at: CGPoint(x: 10, y: y), withAttributes: attributes)
            y += 20
        }
    }
}
