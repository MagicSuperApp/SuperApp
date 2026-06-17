import UIKit

/// Circular guidance overlay showing the 15-sector guide.
/// Matches Android CaptureGuidanceOverlay.kt.
final class CircularGuidanceView: UIView {

    // MARK: - Properties

    private let sectorDotsLayer = CAShapeLayer()
    private let arrowLayer = CAShapeLayer()
    private let backgroundLayer = CAShapeLayer()
    private let mainTextLayer = CATextLayer()
    private let subTextLayer = CATextLayer()
    private let headingLayer = CATextLayer()
    private let completeTextLayer = CATextLayer()

    private var sessionState: CircularSessionState = CircularSessionState()
    private var densityFactor: CGFloat = 1.0

    var onSkipClicked: (() -> Void)?

    // Skip button
    private let skipButton = UIButton(type: .system)
    private var skipButtonVisible = false

    // MARK: - Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    // MARK: - Setup

    private func setup() {
        backgroundColor = .clear
        densityFactor = UIScreen.main.scale

        sectorDotsLayer.fillColor = UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        sectorDotsLayer.strokeColor = UIColor.white.withAlphaComponent(0.5).cgColor
        sectorDotsLayer.lineWidth = 3.0
        layer.addSublayer(sectorDotsLayer)

        arrowLayer.fillColor = UIColor.white.cgColor
        arrowLayer.strokeColor = UIColor.clear.cgColor
        layer.addSublayer(arrowLayer)

        backgroundLayer.fillColor = UIColor.black.withAlphaComponent(0.6).cgColor
        layer.addSublayer(backgroundLayer)

        mainTextLayer.fontSize = 24
        mainTextLayer.foregroundColor = UIColor.white.cgColor
        mainTextLayer.alignmentMode = .center
        mainTextLayer.contentsScale = UIScreen.main.scale
        mainTextLayer.shadowColor = UIColor.black.cgColor
        mainTextLayer.shadowOffset = CGSize(width: 0, height: 2)
        mainTextLayer.shadowRadius = 4
        mainTextLayer.shadowOpacity = 0.5
        layer.addSublayer(mainTextLayer)

        subTextLayer.fontSize = 16
        subTextLayer.foregroundColor = UIColor.white.withAlphaComponent(0.8).cgColor
        subTextLayer.alignmentMode = .center
        subTextLayer.contentsScale = UIScreen.main.scale
        subTextLayer.shadowColor = UIColor.black.cgColor
        subTextLayer.shadowOffset = CGSize(width: 0, height: 1)
        subTextLayer.shadowRadius = 3
        subTextLayer.shadowOpacity = 0.5
        layer.addSublayer(subTextLayer)

        headingLayer.fontSize = 12
        headingLayer.foregroundColor = UIColor.white.withAlphaComponent(0.5).cgColor
        headingLayer.alignmentMode = .center
        headingLayer.contentsScale = UIScreen.main.scale
        layer.addSublayer(headingLayer)

        completeTextLayer.fontSize = 22
        completeTextLayer.foregroundColor = UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        completeTextLayer.alignmentMode = .center
        completeTextLayer.contentsScale = UIScreen.main.scale
        completeTextLayer.shadowColor = UIColor.black.cgColor
        completeTextLayer.shadowOffset = CGSize(width: 0, height: 2)
        completeTextLayer.shadowRadius = 4
        completeTextLayer.shadowOpacity = 0.5
        layer.addSublayer(completeTextLayer)

        skipButton.backgroundColor = UIColor.black.withAlphaComponent(0.8)
        skipButton.setTitle("Bỏ qua", for: .normal)
        skipButton.setTitleColor(.white, for: .normal)
        skipButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
        skipButton.layer.cornerRadius = 8
        skipButton.layer.borderWidth = 1.5
        skipButton.layer.borderColor = UIColor.white.withAlphaComponent(0.5).cgColor
        skipButton.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        skipButton.isHidden = true
        skipButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(skipButton)

        NSLayoutConstraint.activate([
            skipButton.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 56),
            skipButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            skipButton.widthAnchor.constraint(equalToConstant: 80),
            skipButton.heightAnchor.constraint(equalToConstant: 36)
        ])
    }

    @objc private func skipTapped() {
        onSkipClicked?()
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()

        guard bounds.width > 0, bounds.height > 0 else { return }

        drawSectors()
        updateForState()

        headingLayer.frame = CGRect(x: 0, y: bounds.height * 0.20, width: bounds.width, height: 20)
    }

    // MARK: - Public API

    func bindState(_ state: CircularSessionState) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.bindState(state)
            }
            return
        }

        self.sessionState = state
        skipButtonVisible = state.state == .stationaryWait
        skipButton.isHidden = !skipButtonVisible

        updateForState()
    }

    // MARK: - Drawing

    private func updateForState() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        sectorDotsLayer.isHidden = false
        arrowLayer.isHidden = false
        backgroundLayer.isHidden = false
        mainTextLayer.isHidden = false
        subTextLayer.isHidden = false
        headingLayer.isHidden = false
        completeTextLayer.isHidden = true

        switch sessionState.state {
        case .guidance:
            drawGuidance()
        case .stationaryWait:
            drawStationaryWait()
        case .captureTriggered:
            drawCapturing()
        case .complete:
            drawComplete()
        default:
            sectorDotsLayer.isHidden = true
            arrowLayer.isHidden = true
            backgroundLayer.isHidden = true
            mainTextLayer.isHidden = true
            subTextLayer.isHidden = true
            headingLayer.isHidden = true
        }

        CATransaction.commit()
    }

    private func drawSectors() {
        let sectors = sessionState.sectors
        guard !sectors.isEmpty else { return }

        let dotRadius: CGFloat = 4  // Smaller dots for 15 sectors
        let dotSpacing: CGFloat = 18  // Tighter spacing for 15 sectors
        let dotCenterY: CGFloat = 30

        let totalWidth = CGFloat(sectors.count - 1) * dotSpacing
        let startX = bounds.midX - totalWidth / 2

        let path = UIBezierPath()
        for (i, sector) in sectors.enumerated() {
            let x = startX + CGFloat(i) * dotSpacing
            let paint = sector.isCaptured
                ? UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0)
                : UIColor.white.withAlphaComponent(0.5)

            let dotPath = UIBezierPath(arcCenter: CGPoint(x: x, y: dotCenterY), radius: dotRadius, startAngle: 0, endAngle: CGFloat.pi * 2, clockwise: true)
            path.append(dotPath)
        }

        sectorDotsLayer.fillColor = UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        sectorDotsLayer.strokeColor = UIColor.white.withAlphaComponent(0.5).cgColor
        sectorDotsLayer.lineWidth = 2.5  // Thinner stroke for smaller dots
        sectorDotsLayer.path = path.cgPath
    }

    private func drawGuidance() {
        guard let guidance = sessionState.guidance else { return }

        let headingText = sessionState.currentHeading != nil ? "Hướng: \(Int(sessionState.currentHeading!))°" : "Đang lấy hướng..."
        headingLayer.string = headingText

        mainTextLayer.string = guidance.instructionText

        drawArrow(direction: guidance.direction)
    }

    private func drawStationaryWait() {
        headingLayer.isHidden = true

        mainTextLayer.string = "Dừng lại"
        subTextLayer.string = "giữ yên để chụp"

        let textWidth = max(
            (mainTextLayer.string as? NSString)?.size(withAttributes: [.font: UIFont.systemFont(ofSize: 24)]).width ?? 100,
            (subTextLayer.string as? NSString)?.size(withAttributes: [.font: UIFont.systemFont(ofSize: 16)]).width ?? 100
        )
        let bgWidth = textWidth + 80
        let bgHeight: CGFloat = 160
        let bgY = bounds.height * 0.42 - 80

        let bgPath = UIBezierPath(roundedRect: CGRect(x: bounds.midX - bgWidth/2, y: bgY, width: bgWidth, height: bgHeight), cornerRadius: 12)
        backgroundLayer.path = bgPath.cgPath

        mainTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.42, width: bounds.width, height: 40)
        subTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.42 + 50, width: bounds.width, height: 30)

        arrowLayer.isHidden = true
    }

    private func drawCapturing() {
        headingLayer.isHidden = true

        mainTextLayer.string = "Đang chụp..."
        subTextLayer.isHidden = true

        let textWidth = (mainTextLayer.string as? NSString)?.size(withAttributes: [.font: UIFont.systemFont(ofSize: 24)]).width ?? 100
        let bgWidth = textWidth + 80
        let bgHeight: CGFloat = 140
        let bgY = bounds.height * 0.42 - 40

        let bgPath = UIBezierPath(roundedRect: CGRect(x: bounds.midX - bgWidth/2, y: bgY, width: bgWidth, height: bgHeight), cornerRadius: 12)
        backgroundLayer.path = bgPath.cgPath

        mainTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.42, width: bounds.width, height: 40)
        arrowLayer.isHidden = true
    }

    private func drawComplete() {
        sectorDotsLayer.isHidden = true
        arrowLayer.isHidden = true
        backgroundLayer.isHidden = true
        mainTextLayer.isHidden = true
        subTextLayer.isHidden = true
        headingLayer.isHidden = true

        completeTextLayer.isHidden = false
        completeTextLayer.string = "✅ Đã chụp đủ góc!"

        let subText = "Tải lên hoặc Lưu local"
        subTextLayer.string = subText
        subTextLayer.isHidden = false

        completeTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.38, width: bounds.width, height: 40)
        subTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.38 + 50, width: bounds.width, height: 30)
    }

    private func drawArrow(direction: GuidanceDirection) {
        let arrowSize: CGFloat = 40
        let arrowX = bounds.midX
        let arrowY = bounds.height * 0.42

        let path = UIBezierPath()

        switch direction {
        case .clockwise:
            path.move(to: CGPoint(x: arrowX - arrowSize * 0.3, y: arrowY - arrowSize * 0.6))
            path.addLine(to: CGPoint(x: arrowX + arrowSize * 0.7, y: arrowY))
            path.addLine(to: CGPoint(x: arrowX - arrowSize * 0.3, y: arrowY + arrowSize * 0.6))
        case .counterClockwise:
            path.move(to: CGPoint(x: arrowX + arrowSize * 0.3, y: arrowY - arrowSize * 0.6))
            path.addLine(to: CGPoint(x: arrowX - arrowSize * 0.7, y: arrowY))
            path.addLine(to: CGPoint(x: arrowX + arrowSize * 0.3, y: arrowY + arrowSize * 0.6))
        case .arrived:
            path.move(to: CGPoint(x: arrowX, y: arrowY - arrowSize * 0.5))
            path.addLine(to: CGPoint(x: arrowX + arrowSize * 0.5, y: arrowY + arrowSize * 0.5))
            path.addLine(to: CGPoint(x: arrowX - arrowSize * 0.5, y: arrowY + arrowSize * 0.5))
        }

        path.close()
        arrowLayer.path = path.cgPath

        mainTextLayer.frame = CGRect(x: 0, y: bounds.height * 0.52, width: bounds.width, height: 40)
        subTextLayer.isHidden = true

        let textWidth = (mainTextLayer.string as? NSString)?.size(withAttributes: [.font: UIFont.systemFont(ofSize: 24)]).width ?? 100
        let bgWidth = max(textWidth, 200) + 60
        let bgHeight: CGFloat = 200
        let bgY = arrowY - arrowSize - 30

        let bgPath = UIBezierPath(roundedRect: CGRect(x: bounds.midX - bgWidth/2, y: bgY, width: bgWidth, height: bgHeight), cornerRadius: 12)
        backgroundLayer.path = bgPath.cgPath
    }
}
