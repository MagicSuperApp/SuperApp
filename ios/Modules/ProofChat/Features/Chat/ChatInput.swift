// ios/Modules/ProofChat/Features/Chat/ChatInput.swift
//
// Chat input field with send button.

import UIKit

class ChatInput: UIView {
    private let onSend: (String) -> Void
    private let textField = UITextField()

    init(onSend: @escaping (String) -> Void) {
        self.onSend = onSend
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = .white
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.1
        layer.shadowOffset = CGSize(width: 0, height: -2)

        textField.placeholder = "Nhập tin nhắn..."
        textField.borderStyle = .roundedRect
        textField.font = .systemFont(ofSize: 15)
        addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false

        let sendBtn = UIButton(type: .system)
        sendBtn.setImage(UIImage(systemName: "paperplane.fill"), for: .normal)
        sendBtn.tintColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
        sendBtn.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)
        addSubview(sendBtn)
        sendBtn.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            textField.centerYAnchor.constraint(equalTo: centerYAnchor),
            textField.trailingAnchor.constraint(equalTo: sendBtn.leadingAnchor, constant: -8),
            textField.heightAnchor.constraint(equalToConstant: 40),
            sendBtn.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            sendBtn.centerYAnchor.constraint(equalTo: centerYAnchor),
            sendBtn.widthAnchor.constraint(equalToConstant: 44),
            sendBtn.heightAnchor.constraint(equalToConstant: 44),
            heightAnchor.constraint(equalToConstant: 64)
        ])
    }

    @objc private func sendTapped() {
        guard let text = textField.text, !text.isEmpty else { return }
        onSend(text)
        textField.text = ""
    }
}
