// ios/Features/Auth/Components/StepIndicator.swift
//
// Step indicator for 3-step signup flow.
// Mirrors Android StepIndicator.tsx

import UIKit

class StepIndicator: UIView {
    private let current: Int
    private let total: Int
    private let primaryColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
    private let paleColor = UIColor(red: 0.85, green: 0.91, blue: 0.98, alpha: 1.0)

    init(current: Int, total: Int) {
        self.current = current
        self.total = total
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        let label = UILabel()
        label.text = "Bước \(current)/\(total)"
        label.font = .systemFont(ofSize: 10, weight: .heavy)
        label.textColor = primaryColor
        addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false

        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.alignment = .center
        addSubview(row)
        row.translatesAutoresizingMaskIntoConstraints = false

        for n in 1...total {
            let done = n < current
            let active = n == current

            let dot = UIView()
            dot.layer.cornerRadius = active ? 7 : 5
            dot.backgroundColor = done || active ? primaryColor : paleColor
            row.addArrangedSubview(dot)
            dot.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                dot.widthAnchor.constraint(equalToConstant: active ? 14 : 10),
                dot.heightAnchor.constraint(equalToConstant: active ? 14 : 10)
            ])

            if done {
                let check = UIView()
                check.backgroundColor = .white
                check.layer.cornerRadius = 2
                dot.addSubview(check)
                check.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([
                    check.centerXAnchor.constraint(equalTo: dot.centerXAnchor),
                    check.centerYAnchor.constraint(equalTo: dot.centerYAnchor),
                    check.widthAnchor.constraint(equalToConstant: 4),
                    check.heightAnchor.constraint(equalToConstant: 4)
                ])
            }

            if n < total {
                let bar = UIView()
                bar.backgroundColor = n < current ? primaryColor : paleColor
                bar.layer.cornerRadius = 1
                row.addArrangedSubview(bar)
                bar.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([
                    bar.widthAnchor.constraint(equalToConstant: 16),
                    bar.heightAnchor.constraint(equalToConstant: 2)
                ])
            }
        }

        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor),
            label.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 6),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }
}
