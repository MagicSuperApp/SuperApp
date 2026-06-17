// ios/Modules/ProofChat/Features/Chat/ChatHeader.swift
//
// Chat header with avatar, name, verification badge.

import UIKit

class ChatHeader: UIView {
    private let room: ChatRoom
    private let onBack: () -> Void

    init(room: ChatRoom, onBack: @escaping () -> Void) {
        self.room = room
        self.onBack = onBack
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = .white

        let backBtn = UIButton(type: .system)
        backBtn.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backBtn.tintColor = .black
        backBtn.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        addSubview(backBtn)
        backBtn.translatesAutoresizingMaskIntoConstraints = false

        let nameLabel = UILabel()
        nameLabel.text = room.name
        nameLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        addSubview(nameLabel)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            backBtn.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            backBtn.centerYAnchor.constraint(equalTo: centerYAnchor),
            backBtn.widthAnchor.constraint(equalToConstant: 44),
            backBtn.heightAnchor.constraint(equalToConstant: 44),
            nameLabel.leadingAnchor.constraint(equalTo: backBtn.trailingAnchor, constant: 8),
            nameLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: 56)
        ])
    }

    @objc private func backTapped() {
        onBack()
    }
}
