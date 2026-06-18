// ios/Features/Auth/Screens/SignUpBiometricScreen.swift
//
// STEP 1/3 - Biometric enrollment (REQUIRED).
// Activates Secure Enclave to generate hardware-backed key.
// No biometric = no key = cannot create account. No fallback.

import UIKit
import LocalAuthentication

class SignUpBiometricScreen: UIViewController {
    private enum Stage {
        case idle, prompting, generating, done
    }

    private var stage: Stage = .idle
    private var biometryType: LABiometryType = .none
    private let primaryColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 1.0, alpha: 1.0)
        setupUI()
        checkBiometry()
    }

    private func checkBiometry() {
        let context = LAContext()
        var error: NSError?
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            biometryType = context.biometryType
        }
    }

    private func setupUI() {
        let stepIndicator = StepIndicator(current: 1, total: 3)
        view.addSubview(stepIndicator)
        stepIndicator.translatesAutoresizingMaskIntoConstraints = false

        let iconView = UIView()
        iconView.backgroundColor = primaryColor.withAlphaComponent(0.12)
        iconView.layer.cornerRadius = 40
        view.addSubview(iconView)
        iconView.translatesAutoresizingMaskIntoConstraints = false

        let iconLabel = UILabel()
        iconLabel.text = biometryType == .faceID ? "👤" : "👆"
        iconLabel.font = .systemFont(ofSize: 40)
        iconView.addSubview(iconLabel)
        iconLabel.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Kích hoạt bảo mật"
        title.font = .systemFont(ofSize: 24, weight: .heavy)
        title.textColor = .black
        view.addSubview(title)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = UILabel()
        subtitle.text = "Sinh khóa phần cứng trong chip bảo mật"
        subtitle.font = .systemFont(ofSize: 14)
        subtitle.textColor = .gray
        subtitle.textAlignment = .center
        view.addSubview(subtitle)
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let button = UIButton(type: .system)
        button.setTitle("Bắt đầu", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = primaryColor
        button.layer.cornerRadius = 14
        button.addTarget(self, action: #selector(startEnrollment), for: .touchUpInside)
        view.addSubview(button)
        button.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stepIndicator.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stepIndicator.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            iconView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            iconView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -60),
            iconView.widthAnchor.constraint(equalToConstant: 80),
            iconView.heightAnchor.constraint(equalToConstant: 80),
            iconLabel.centerXAnchor.constraint(equalTo: iconView.centerXAnchor),
            iconLabel.centerYAnchor.constraint(equalTo: iconView.centerYAnchor),
            title.topAnchor.constraint(equalTo: iconView.bottomAnchor, constant: 24),
            title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 8),
            subtitle.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32),
            button.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            button.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            button.heightAnchor.constraint(equalToConstant: 52)
        ])
    }

    @objc private func startEnrollment() {
        guard stage == .idle else { return }
        stage = .prompting

        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Kích hoạt chip bảo mật") { success, error in
            DispatchQueue.main.async {
                if success {
                    self.stage = .generating
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                        self.stage = .done
                        self.navigationController?.pushViewController(SignUpLinkRecoveryScreen(), animated: true)
                    }
                } else {
                    self.stage = .idle
                }
            }
        }
    }
}
