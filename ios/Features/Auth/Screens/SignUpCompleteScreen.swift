// ios/Features/Auth/Screens/SignUpCompleteScreen.swift
//
// STEP 3/3 - Complete.
// Simulates pipeline: generate DID → encrypt Recovery Blob → shard & distribute
// to network nodes (≥12 nodes). NO centralized cloud backup.

import UIKit

class SignUpCompleteScreen: UIViewController {
    private enum StepStatus { case pending, processing, done }

    private struct Step {
        let icon: String
        let title: String
        let detail: String
        let durationMs: Int
    }

    private let steps: [Step] = [
        Step(icon: "key.fill", title: "Sinh khóa phần cứng", detail: "Khóa riêng nằm trong chip bảo mật", durationMs: 700),
        Step(icon: "person.text.rectangle", title: "Tạo định danh DID", detail: "Public key được ghi vào danh sách", durationMs: 900),
        Step(icon: "lock.fill", title: "Mã hóa Recovery Blob", detail: "AES-256-GCM với khóa từ thiết bị", durationMs: 800),
        Step(icon: "network", title: "Phân mảnh & phân tán", detail: "Ghim trên ≥12 node", durationMs: 1200)
    ]

    private var statuses: [StepStatus] = []
    private let primaryColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
    private var stackView: UIStackView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 1.0, alpha: 1.0)
        statuses = Array(repeating: .pending, count: steps.count)
        setupUI()
        runPipeline()
    }

    private func setupUI() {
        let stepIndicator = StepIndicator(current: 3, total: 3)
        view.addSubview(stepIndicator)
        stepIndicator.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Đang hoàn tất"
        title.font = .systemFont(ofSize: 24, weight: .heavy)
        title.textColor = .black
        view.addSubview(title)
        title.translatesAutoresizingMaskIntoConstraints = false

        stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 16
        view.addSubview(stackView)
        stackView.translatesAutoresizingMaskIntoConstraints = false

        for (index, step) in steps.enumerated() {
            let row = createStepRow(step: step, index: index)
            stackView.addArrangedSubview(row)
        }

        NSLayoutConstraint.activate([
            stepIndicator.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stepIndicator.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
            title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stackView.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 40),
            stackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            stackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)
        ])
    }

    private func createStepRow(step: Step, index: Int) -> UIView {
        let row = UIView()

        let iconView = UIImageView()
        iconView.image = UIImage(systemName: step.icon)
        iconView.tintColor = .gray
        row.addSubview(iconView)
        iconView.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = step.title
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textColor = .black
        row.addSubview(titleLabel)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let detailLabel = UILabel()
        detailLabel.text = step.detail
        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .gray
        detailLabel.numberOfLines = 0
        row.addSubview(detailLabel)
        detailLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            iconView.topAnchor.constraint(equalTo: row.topAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 24),
            iconView.heightAnchor.constraint(equalToConstant: 24),
            titleLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            titleLabel.topAnchor.constraint(equalTo: row.topAnchor),
            detailLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            detailLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            detailLabel.bottomAnchor.constraint(equalTo: row.bottomAnchor)
        ])

        row.tag = index
        return row
    }

    private func runPipeline() {
        var currentStep = 0

        func processNext() {
            guard currentStep < steps.count else {
                showSuccess()
                return
            }

            statuses[currentStep] = .processing
            updateStepUI(index: currentStep, status: .processing)

            let duration = Double(steps[currentStep].durationMs) / 1000.0
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                self.statuses[currentStep] = .done
                self.updateStepUI(index: currentStep, status: .done)
                currentStep += 1
                processNext()
            }
        }

        processNext()
    }

    private func updateStepUI(index: Int, status: StepStatus) {
        guard let row = stackView.arrangedSubviews.first(where: { $0.tag == index }) else { return }
        guard let iconView = row.subviews.first as? UIImageView else { return }

        switch status {
        case .pending:
            iconView.tintColor = .gray
        case .processing:
            iconView.tintColor = primaryColor
        case .done:
            iconView.tintColor = UIColor(red: 0.3, green: 0.69, blue: 0.31, alpha: 1.0)
        }
    }

    private func showSuccess() {
        let alert = UIAlertController(title: "Hoàn tất!", message: "Tài khoản đã được tạo thành công", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Bắt đầu", style: .default) { _ in
            self.navigationController?.popToRootViewController(animated: true)
        })
        present(alert, animated: true)
    }
}
