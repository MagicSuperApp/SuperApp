// ios/Modules/ProofChat/Features/Proof/VerificationBadge.swift
//
// Verification status badge (verified/pending/failed).

import UIKit

enum VerificationStatus: String {
    case verified, pending, failed
}

class VerificationBadge: UIView {
    private let status: VerificationStatus
    private let compact: Bool

    init(status: VerificationStatus, compact: Bool = false) {
        self.status = status
        self.compact = compact
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        let (icon, label, color) = config(for: status)

        if compact {
            let iconView = UIImageView(image: UIImage(systemName: icon))
            iconView.tintColor = color
            addSubview(iconView)
            iconView.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                iconView.widthAnchor.constraint(equalToConstant: 12),
                iconView.heightAnchor.constraint(equalToConstant: 12),
                iconView.centerXAnchor.constraint(equalTo: centerXAnchor),
                iconView.centerYAnchor.constraint(equalTo: centerYAnchor)
            ])
        } else {
            backgroundColor = color.withAlphaComponent(0.1)
            layer.cornerRadius = 6

            let iconView = UIImageView(image: UIImage(systemName: icon))
            iconView.tintColor = color
            addSubview(iconView)
            iconView.translatesAutoresizingMaskIntoConstraints = false

            let textLabel = UILabel()
            textLabel.text = label
            textLabel.font = .systemFont(ofSize: 10, weight: .bold)
            textLabel.textColor = color
            addSubview(textLabel)
            textLabel.translatesAutoresizingMaskIntoConstraints = false

            NSLayoutConstraint.activate([
                iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
                iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
                iconView.widthAnchor.constraint(equalToConstant: 10),
                iconView.heightAnchor.constraint(equalToConstant: 10),
                textLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 4),
                textLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
                textLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
                heightAnchor.constraint(equalToConstant: 20)
            ])
        }
    }

    private func config(for status: VerificationStatus) -> (String, String, UIColor) {
        switch status {
        case .verified:
            return ("checkmark.shield.fill", "Đã xác thực", UIColor(red: 0.24, green: 0.48, blue: 0.37, alpha: 1.0))
        case .pending:
            return ("arrow.triangle.2.circlepath", "Đang xác thực", UIColor(red: 0.69, green: 0.49, blue: 0.18, alpha: 1.0))
        case .failed:
            return ("exclamationmark.shield.fill", "KHÔNG xác thực", UIColor(red: 0.75, green: 0.33, blue: 0.23, alpha: 1.0))
        }
    }
}
