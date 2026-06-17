import UIKit

/// Status feedback label showing current scanner state.
final class FeedbackLabel: UIView {

    // MARK: - Properties

    private let label = UILabel()

    var text: String? {
        didSet { label.text = text }
    }

    var statusColor: UIColor = .white {
        didSet { label.textColor = statusColor }
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

    // MARK: - Setup

    private func setup() {
        backgroundColor = UIColor.black.withAlphaComponent(0.7)
        layer.cornerRadius = 8
        clipsToBounds = true

        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        addSubview(label)
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        label.frame = CGRect(x: 12, y: 8, width: bounds.width - 24, height: bounds.height - 16)
    }

    // MARK: - Public

    func show(_ message: String, color: UIColor = .white) {
        text = message
        statusColor = color
        alpha = 0
        isHidden = false
        UIView.animate(withDuration: 0.2) { self.alpha = 1 }
    }

    func hide() {
        UIView.animate(withDuration: 0.2) {
            self.alpha = 0
        } completion: { _ in
            self.isHidden = true
        }
    }
}
