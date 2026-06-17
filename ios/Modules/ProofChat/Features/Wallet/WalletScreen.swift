// ios/Modules/ProofChat/Features/Wallet/WalletScreen.swift
//
// Wallet screen showing balance and identity.

import UIKit
import Combine

class WalletScreen: UIViewController {
    private let store = ProofChatStore.shared
    private var cancellables = Set<AnyCancellable>()

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Wallet"
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 1.0, alpha: 1.0)
        setupUI()
    }

    private func setupUI() {
        let identityCard = IdentityCard()
        view.addSubview(identityCard)
        identityCard.translatesAutoresizingMaskIntoConstraints = false

        let balanceLabel = UILabel()
        balanceLabel.font = .systemFont(ofSize: 32, weight: .bold)
        balanceLabel.textAlignment = .center
        view.addSubview(balanceLabel)
        balanceLabel.translatesAutoresizingMaskIntoConstraints = false

        let addressLabel = UILabel()
        addressLabel.font = .systemFont(ofSize: 14)
        addressLabel.textColor = .gray
        addressLabel.textAlignment = .center
        view.addSubview(addressLabel)
        addressLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            identityCard.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            identityCard.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            identityCard.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            balanceLabel.topAnchor.constraint(equalTo: identityCard.bottomAnchor, constant: 32),
            balanceLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            addressLabel.topAnchor.constraint(equalTo: balanceLabel.bottomAnchor, constant: 8),
            addressLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])

        store.$wallet
            .sink { wallet in
                balanceLabel.text = String(format: "%.2f USDC", wallet.balance)
                addressLabel.text = wallet.address
            }
            .store(in: &cancellables)
    }
}
