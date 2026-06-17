// ios/Features/Chatbot/FloatingChatbotBubble.swift
//
// Draggable floating chatbot bubble.

import UIKit
import Combine

class FloatingChatbotBubble: UIView {
    private let store = ChatbotStore.shared
    private var cancellables = Set<AnyCancellable>()
    private var panGesture: UIPanGestureRecognizer!

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
        layer.cornerRadius = 28
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowOffset = CGSize(width: 0, height: 4)
        layer.shadowRadius = 12

        let iconLabel = UILabel()
        iconLabel.text = "💬"
        iconLabel.font = .systemFont(ofSize: 28)
        iconLabel.textAlignment = .center
        addSubview(iconLabel)
        iconLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 56),
            heightAnchor.constraint(equalToConstant: 56),
            iconLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            iconLabel.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])

        panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
        addGestureRecognizer(panGesture)

        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tapGesture)

        store.$enabled
            .sink { [weak self] enabled in
                self?.isHidden = !enabled
            }
            .store(in: &cancellables)

        if let pos = store.position {
            center = CGPoint(x: pos.x, y: pos.y)
        }
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let superview = superview else { return }
        let translation = gesture.translation(in: superview)
        center = CGPoint(x: center.x + translation.x, y: center.y + translation.y)
        gesture.setTranslation(.zero, in: superview)

        if gesture.state == .ended {
            store.setPosition(ChatbotPosition(x: center.x, y: center.y))
        }
    }

    @objc private func handleTap() {
        // Open chat interface
        print("Chatbot tapped")
    }
}
