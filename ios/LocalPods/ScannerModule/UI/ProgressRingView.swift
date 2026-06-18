import UIKit

/// Progress ring showing captured count out of 15 sectors.
final class ProgressRingView: UIView {

    // MARK: - Properties

    private let backgroundRing = CAShapeLayer()
    private let progressRing = CAShapeLayer()
    private let countLabel = UILabel()
    private let captionLabel = UILabel()

    var capturedCount: Int = 0 {
        didSet { update() }
    }

    var totalSectors: Int = 15

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
        // Background ring
        backgroundRing.fillColor = UIColor.clear.cgColor
        backgroundRing.strokeColor = UIColor.white.withAlphaComponent(0.2).cgColor
        backgroundRing.lineWidth = 4
        layer.addSublayer(backgroundRing)

        // Progress ring
        progressRing.fillColor = UIColor.clear.cgColor
        progressRing.strokeColor = UIColor(red: 0.3, green: 0.69, blue: 0.31, alpha: 1.0).cgColor
        progressRing.lineWidth = 4
        progressRing.lineCap = .round
        progressRing.strokeEnd = 0
        layer.addSublayer(progressRing)

        // Count label
        countLabel.textAlignment = .center
        countLabel.font = .systemFont(ofSize: 20, weight: .bold)
        countLabel.textColor = .white
        addSubview(countLabel)

        // Caption
        captionLabel.textAlignment = .center
        captionLabel.font = .systemFont(ofSize: 10, weight: .medium)
        captionLabel.textColor = UIColor.white.withAlphaComponent(0.7)
        captionLabel.text = "Hình"
        addSubview(captionLabel)
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()

        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        let radius = min(bounds.width, bounds.height) / 2 - 4
        let startAngle = -CGFloat.pi / 2
        let endAngle = startAngle + 2 * .pi

        let circlePath = UIBezierPath(
            arcCenter: center,
            radius: radius,
            startAngle: startAngle,
            endAngle: endAngle,
            clockwise: true
        )

        backgroundRing.path = circlePath.cgPath
        progressRing.path = circlePath.cgPath

        countLabel.frame = CGRect(x: 0, y: bounds.midY - 16, width: bounds.width, height: 28)
        captionLabel.frame = CGRect(x: 0, y: bounds.midY + 12, width: bounds.width, height: 16)
    }

    // MARK: - Private

    private func update() {
        countLabel.text = "\(capturedCount)/\(totalSectors)"

        let progress = CGFloat(capturedCount) / CGFloat(totalSectors)

        // Animate stroke
        let animation = CABasicAnimation(keyPath: "strokeEnd")
        animation.fromValue = progressRing.strokeEnd
        animation.toValue = progress
        animation.duration = 0.3
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        progressRing.strokeEnd = progress
        progressRing.add(animation, forKey: "progress")
    }
}
