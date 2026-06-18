// ios/Modules/ProofChat/Features/Escrow/EscrowStatusCard.swift
//
// Escrow status card component.

import UIKit

class EscrowStatusCard: UIView {
    private let status: String
    private let amount: Double

    init(status: String, amount: Double) {
        self.status = status
        self.amount = amount
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = .white
        layer.cornerRadius = 16
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.1
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowRadius = 8

        let statusLabel = UILabel()
        statusLabel.text = status.uppercased()
        statusLabel.font = .systemFont(ofSize: 12, weight: .bold)
        statusLabel.textColor = status == "active" ? .systemGreen : .gray
        addSubview(statusLabel)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        let amountLabel = UILabel()
        amountLabel.text = String(format: "%.2f USDC", amount)
        amountLabel.font = .systemFont(ofSize: 24, weight: .bold)
        addSubview(amountLabel)
        amountLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            statusLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            amountLabel.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            amountLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            amountLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
            heightAnchor.constraint(equalToConstant: 100)
        ])
    }
}
