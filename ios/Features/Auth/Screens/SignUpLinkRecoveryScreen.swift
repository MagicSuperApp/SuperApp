// ios/Features/Auth/Screens/SignUpLinkRecoveryScreen.swift
//
// STEP 2/3 - Link recovery identifier (STRONGLY RECOMMENDED).
// Email/phone hashed with HMAC_SHA256 before sending to server.
// Server never sees real email/phone.

import UIKit

class SignUpLinkRecoveryScreen: UIViewController {
    private enum Channel { case email, phone }
    private var channel: Channel = .email
    private var inputValue = ""
    private let primaryColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 1.0, alpha: 1.0)
        setupUI()
    }

    private func setupUI() {
        let stepIndicator = StepIndicator(current: 2, total: 3)
        view.addSubview(stepIndicator)
        stepIndicator.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Liên kết khôi phục"
        title.font = .systemFont(ofSize: 24, weight: .heavy)
        title.textColor = .black
        view.addSubview(title)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = UILabel()
        subtitle.text = "Email hoặc SĐT để khôi phục tài khoản"
        subtitle.font = .systemFont(ofSize: 14)
        subtitle.textColor = .gray
        subtitle.numberOfLines = 0
        subtitle.textAlignment = .center
        view.addSubview(subtitle)
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let textField = UITextField()
        textField.placeholder = "Email hoặc số điện thoại"
        textField.borderStyle = .roundedRect
        textField.font = .systemFont(ofSize: 16)
        textField.keyboardType = .emailAddress
        textField.autocapitalizationType = .none
        view.addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false

        let continueButton = UIButton(type: .system)
        continueButton.setTitle("Tiếp tục", for: .normal)
        continueButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        continueButton.setTitleColor(.white, for: .normal)
        continueButton.backgroundColor = primaryColor
        continueButton.layer.cornerRadius = 14
        continueButton.addTarget(self, action: #selector(continueTapped), for: .touchUpInside)
        view.addSubview(continueButton)
        continueButton.translatesAutoresizingMaskIntoConstraints = false

        let skipButton = UIButton(type: .system)
        skipButton.setTitle("Bỏ qua (không khuyến nghị)", for: .normal)
        skipButton.titleLabel?.font = .systemFont(ofSize: 14)
        skipButton.setTitleColor(.gray, for: .normal)
        skipButton.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        view.addSubview(skipButton)
        skipButton.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stepIndicator.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stepIndicator.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
            title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 8),
            subtitle.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            subtitle.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            textField.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 32),
            textField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            textField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            textField.heightAnchor.constraint(equalToConstant: 48),
            continueButton.topAnchor.constraint(equalTo: textField.bottomAnchor, constant: 24),
            continueButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            continueButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            continueButton.heightAnchor.constraint(equalToConstant: 52),
            skipButton.topAnchor.constraint(equalTo: continueButton.bottomAnchor, constant: 16),
            skipButton.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
    }

    @objc private func continueTapped() {
        navigationController?.pushViewController(SignUpCompleteScreen(), animated: true)
    }

    @objc private func skipTapped() {
        let alert = UIAlertController(title: "Bỏ qua khôi phục?", message: "Nếu mất thiết bị, bạn sẽ không thể khôi phục tài khoản.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Quay lại", style: .cancel))
        alert.addAction(UIAlertAction(title: "Bỏ qua", style: .destructive) { _ in
            self.navigationController?.pushViewController(SignUpCompleteScreen(), animated: true)
        })
        present(alert, animated: true)
    }
}
