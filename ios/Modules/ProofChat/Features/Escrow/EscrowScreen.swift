// ios/Modules/ProofChat/Features/Escrow/EscrowScreen.swift
//
// Escrow screen showing escrow status.

import UIKit

class EscrowScreen: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Escrow"
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 1.0, alpha: 1.0)
        setupUI()
    }

    private func setupUI() {
        let statusCard = EscrowStatusCard(status: "active", amount: 100.0)
        view.addSubview(statusCard)
        statusCard.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            statusCard.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            statusCard.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            statusCard.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)
        ])
    }
}
