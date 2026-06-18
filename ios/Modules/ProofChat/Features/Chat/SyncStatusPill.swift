// ios/Modules/ProofChat/Features/Chat/SyncStatusPill.swift
//
// Sync status indicator pill.

import UIKit

class SyncStatusPill: UIView {
    private let state: SyncState
    private var rotationLayer: CALayer?

    init(state: SyncState) {
        self.state = state
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        layer.cornerRadius = 10

        let icon = UIImageView()
        let label = UILabel()
        label.font = .systemFont(ofSize: 10, weight: .bold)

        if !state.online {
            backgroundColor = UIColor(red: 0.75, green: 0.33, blue: 0.23, alpha: 0.1)
            icon.image = UIImage(systemName: "cloud.slash")
            icon.tintColor = UIColor(red: 0.75, green: 0.33, blue: 0.23, alpha: 1.0)
            label.text = state.queuedCount > 0 ? "Queued · \(state.queuedCount)" : "Queued"
            label.textColor = icon.tintColor
        } else if state.syncing {
            backgroundColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 0.1)
            icon.image = UIImage(systemName: "arrow.triangle.2.circlepath")
            icon.tintColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
            label.text = "Syncing…"
            label.textColor = icon.tintColor
            startRotation(icon)
        } else {
            backgroundColor = UIColor(red: 0.24, green: 0.48, blue: 0.37, alpha: 0.1)
            icon.image = UIImage(systemName: "cloud.fill")
            icon.tintColor = UIColor(red: 0.24, green: 0.48, blue: 0.37, alpha: 1.0)
            label.text = "Sent"
            label.textColor = icon.tintColor
        }

        addSubview(icon)
        addSubview(label)
        icon.translatesAutoresizingMaskIntoConstraints = false
        label.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 11),
            icon.heightAnchor.constraint(equalToConstant: 11),
            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 5),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: 24)
        ])
    }

    private func startRotation(_ view: UIView) {
        let rotation = CABasicAnimation(keyPath: "transform.rotation")
        rotation.fromValue = 0
        rotation.toValue = Double.pi * 2
        rotation.duration = 1.2
        rotation.repeatCount = .infinity
        view.layer.add(rotation, forKey: "rotation")
    }
}
