// ios/Modules/ProofChat/Features/Chat/MessageBubble.swift
//
// Message bubble for chat.

import UIKit

class MessageBubble: UIView {
    private let message: Message

    init(message: Message) {
        self.message = message
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        let bubble = UIView()
        bubble.backgroundColor = message.isMine ? UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0) : UIColor(white: 0.95, alpha: 1.0)
        bubble.layer.cornerRadius = 16
        addSubview(bubble)
        bubble.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = message.text
        label.font = .systemFont(ofSize: 15)
        label.textColor = message.isMine ? .white : .black
        label.numberOfLines = 0
        bubble.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            bubble.topAnchor.constraint(equalTo: topAnchor),
            bubble.bottomAnchor.constraint(equalTo: bottomAnchor),
            bubble.widthAnchor.constraint(lessThanOrEqualToConstant: 260),
            label.topAnchor.constraint(equalTo: bubble.topAnchor, constant: 10),
            label.leadingAnchor.constraint(equalTo: bubble.leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: bubble.trailingAnchor, constant: -12),
            label.bottomAnchor.constraint(equalTo: bubble.bottomAnchor, constant: -10)
        ])

        if message.isMine {
            bubble.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16).isActive = true
        } else {
            bubble.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16).isActive = true
        }
    }
}
