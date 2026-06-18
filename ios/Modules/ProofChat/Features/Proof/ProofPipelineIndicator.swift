// ios/Modules/ProofChat/Features/Proof/ProofPipelineIndicator.swift
//
// Pipeline stage indicator for message processing.

import UIKit

enum MessageStage: String {
    case queued, encrypting, signing, sending
    case decrypting, verifyingSignature, checkingIntegrity
    case delivered
}

class ProofPipelineIndicator: UIView {
    private let stage: MessageStage
    private let isMine: Bool

    init(stage: MessageStage, isMine: Bool = false) {
        self.stage = stage
        self.isMine = isMine
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        let (icon, label) = config(for: stage)

        backgroundColor = isMine ? UIColor.white.withAlphaComponent(0.18) : UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 0.1)
        layer.cornerRadius = 8

        let iconView = UIImageView(image: UIImage(systemName: icon))
        iconView.tintColor = isMine ? .white : UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
        addSubview(iconView)
        iconView.translatesAutoresizingMaskIntoConstraints = false

        let textLabel = UILabel()
        textLabel.text = label
        textLabel.font = .systemFont(ofSize: 9, weight: .semibold)
        textLabel.textColor = iconView.tintColor
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

        if stage != .delivered {
            startPulse(iconView)
        }
    }

    private func config(for stage: MessageStage) -> (String, String) {
        switch stage {
        case .queued: return ("clock", "Queued")
        case .encrypting: return ("lock.fill", "Encrypting")
        case .signing: return ("signature", "Signing")
        case .sending: return ("paperplane", "Sending")
        case .decrypting: return ("lock.open", "Decrypting")
        case .verifyingSignature: return ("checkmark.seal", "Verifying")
        case .checkingIntegrity: return ("shield.checkered", "Checking")
        case .delivered: return ("checkmark", "Delivered")
        }
    }

    private func startPulse(_ view: UIView) {
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 0.6
        pulse.toValue = 1.0
        pulse.duration = 0.7
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        view.layer.add(pulse, forKey: "pulse")
    }
}
