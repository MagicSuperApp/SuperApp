// ios/Modules/ProofChat/Features/Wallet/IdentityCard.swift
//
// Identity card component showing DID and name.

import UIKit
import Combine

class IdentityCard: UIView {
    private let store = ProofChatStore.shared
    private var cancellables = Set<AnyCancellable>()

    override init(frame: CGRect) {
        super.init(frame: frame)
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

        let nameLabel = UILabel()
        nameLabel.font = .systemFont(ofSize: 20, weight: .bold)
        addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        let didLabel = UILabel()
        didLabel.font = .systemFont(ofSize: 12)
        didLabel.textColor = .gray
        didLabel.numberOfLines = 0
        addSubview(didLabel)
        didLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            nameLabel.topAnchor.constraint(equalTo: topAnchor, constant: 20),
            nameLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            nameLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            didLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 8),
            didLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            didLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            didLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -20),
            heightAnchor.constraint(equalToConstant: 120)
        ])

        store.$identity
            .sink { identity in
                nameLabel.text = identity.name
                didLabel.text = identity.did
            }
            .store(in: &cancellables)
    }
}
