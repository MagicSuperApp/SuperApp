// Shared/Components/ComingSoonLayout.swift
//
// Placeholder layout for incomplete modules. Shows themed header, icon,
// description, upcoming features list and notification CTA.

import UIKit

public struct ComingSoonFeature {
    let icon: String
    let title: String
    let description: String
}

public class ComingSoonLayout: UIViewController {
    private let theme: ModuleTheme
    private let moduleTitle: String
    private let tagline: String
    private let moduleDescription: String
    private let icon: String
    private let features: [ComingSoonFeature]
    private let releaseLabel: String
    private let onNotify: (() -> Void)?

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    public init(theme: ModuleTheme, title: String, tagline: String,
                description: String, icon: String, features: [ComingSoonFeature],
                releaseLabel: String = "Sắp ra mắt", onNotify: (() -> Void)? = nil) {
        self.theme = theme
        self.moduleTitle = title
        self.tagline = tagline
        self.moduleDescription = description
        self.icon = icon
        self.features = features
        self.releaseLabel = releaseLabel
        self.onNotify = onNotify
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = NeutralPalette.shared.bgSoft
        setupHeader()
        setupScrollView()
        animateIn()
    }

    private func setupHeader() {
        let header = UIView()
        header.backgroundColor = theme.primary
        header.layer.cornerRadius = 28
        header.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        view.addSubview(header)
        header.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 240)
        ])

        let backBtn = UIButton(type: .system)
        backBtn.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backBtn.tintColor = NeutralPalette.shared.white
        backBtn.backgroundColor = UIColor.white.withAlphaComponent(0.18)
        backBtn.layer.cornerRadius = 12
        backBtn.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        header.addSubview(backBtn)
        backBtn.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            backBtn.topAnchor.constraint(equalTo: header.safeAreaLayoutGuide.topAnchor, constant: 8),
            backBtn.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 20),
            backBtn.widthAnchor.constraint(equalToConstant: 36),
            backBtn.heightAnchor.constraint(equalToConstant: 36)
        ])

        let badge = UIView()
        badge.backgroundColor = UIColor.white.withAlphaComponent(0.20)
        badge.layer.cornerRadius = 14
        header.addSubview(badge)
        badge.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            badge.centerYAnchor.constraint(equalTo: backBtn.centerYAnchor),
            badge.centerXAnchor.constraint(equalTo: header.centerXAnchor)
        ])

        let dot = UIView()
        dot.backgroundColor = NeutralPalette.shared.white
        dot.layer.cornerRadius = 3
        badge.addSubview(dot)
        dot.translatesAutoresizingMaskIntoConstraints = false

        let badgeLabel = UILabel()
        badgeLabel.text = releaseLabel
        badgeLabel.font = .systemFont(ofSize: 10, weight: .heavy)
        badgeLabel.textColor = NeutralPalette.shared.white
        badge.addSubview(badgeLabel)
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            dot.leadingAnchor.constraint(equalTo: badge.leadingAnchor, constant: 12),
            dot.centerYAnchor.constraint(equalTo: badge.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 6),
            dot.heightAnchor.constraint(equalToConstant: 6),
            badgeLabel.leadingAnchor.constraint(equalTo: dot.trailingAnchor, constant: 6),
            badgeLabel.trailingAnchor.constraint(equalTo: badge.trailingAnchor, constant: -12),
            badgeLabel.topAnchor.constraint(equalTo: badge.topAnchor, constant: 5),
            badgeLabel.bottomAnchor.constraint(equalTo: badge.bottomAnchor, constant: -5)
        ])

        let iconWrap = UIView()
        iconWrap.backgroundColor = UIColor.white.withAlphaComponent(0.18)
        iconWrap.layer.cornerRadius = 24
        iconWrap.layer.borderWidth = 1.5
        iconWrap.layer.borderColor = UIColor.white.withAlphaComponent(0.30).cgColor
        header.addSubview(iconWrap)
        iconWrap.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            iconWrap.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            iconWrap.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -80),
            iconWrap.widthAnchor.constraint(equalToConstant: 86),
            iconWrap.heightAnchor.constraint(equalToConstant: 86)
        ])

        let iconLabel = UILabel()
        iconLabel.text = icon
        iconLabel.font = .systemFont(ofSize: 46)
        iconWrap.addSubview(iconLabel)
        iconLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            iconLabel.centerXAnchor.constraint(equalTo: iconWrap.centerXAnchor),
            iconLabel.centerYAnchor.constraint(equalTo: iconWrap.centerYAnchor)
        ])

        let titleLabel = UILabel()
        titleLabel.text = moduleTitle
        titleLabel.font = .systemFont(ofSize: 28, weight: .heavy)
        titleLabel.textColor = NeutralPalette.shared.white
        titleLabel.textAlignment = .center
        header.addSubview(titleLabel)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: iconWrap.bottomAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor)
        ])

        let taglineLabel = UILabel()
        taglineLabel.text = tagline
        taglineLabel.font = .systemFont(ofSize: 13)
        taglineLabel.textColor = UIColor.white.withAlphaComponent(0.85)
        taglineLabel.textAlignment = .center
        taglineLabel.numberOfLines = 0
        header.addSubview(taglineLabel)
        taglineLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            taglineLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            taglineLabel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 40),
            taglineLabel.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -40)
        ])
    }

    private func setupScrollView() {
        scrollView.showsVerticalScrollIndicator = false
        view.addSubview(scrollView)
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 240),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        contentStack.axis = .vertical
        contentStack.spacing = 10
        scrollView.addSubview(contentStack)
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 20),
            contentStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            contentStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -32)
        ])

        let descCard = UIView()
        descCard.backgroundColor = NeutralPalette.shared.card
        descCard.layer.cornerRadius = 16
        descCard.layer.borderWidth = 1
        descCard.layer.borderColor = NeutralPalette.shared.border.cgColor
        contentStack.addArrangedSubview(descCard)

        let descLabel = UILabel()
        descLabel.text = moduleDescription
        descLabel.font = .systemFont(ofSize: 14)
        descLabel.textColor = NeutralPalette.shared.textSub
        descLabel.numberOfLines = 0
        descCard.addSubview(descLabel)
        descLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            descLabel.topAnchor.constraint(equalTo: descCard.topAnchor, constant: 16),
            descLabel.leadingAnchor.constraint(equalTo: descCard.leadingAnchor, constant: 16),
            descLabel.trailingAnchor.constraint(equalTo: descCard.trailingAnchor, constant: -16),
            descLabel.bottomAnchor.constraint(equalTo: descCard.bottomAnchor, constant: -16)
        ])

        let sectionTitle = UILabel()
        sectionTitle.text = "Tính năng sắp tới"
        sectionTitle.font = .systemFont(ofSize: 13, weight: .heavy)
        sectionTitle.textColor = NeutralPalette.shared.text
        contentStack.addArrangedSubview(sectionTitle)
        contentStack.setCustomSpacing(12, after: sectionTitle)

        for feature in features {
            contentStack.addArrangedSubview(createFeatureRow(feature))
        }

        if let onNotify = onNotify {
            let ctaBtn = UIButton(type: .system)
            ctaBtn.setTitle("Nhận thông báo khi ra mắt", for: .normal)
            ctaBtn.setTitleColor(NeutralPalette.shared.white, for: .normal)
            ctaBtn.titleLabel?.font = .systemFont(ofSize: 14, weight: .bold)
            ctaBtn.backgroundColor = theme.primary
            ctaBtn.layer.cornerRadius = 14
            ctaBtn.addTarget(self, action: #selector(notifyTapped), for: .touchUpInside)
            contentStack.addArrangedSubview(ctaBtn)
            contentStack.setCustomSpacing(24, after: contentStack.arrangedSubviews[contentStack.arrangedSubviews.count - 2])
            NSLayoutConstraint.activate([
                ctaBtn.heightAnchor.constraint(equalToConstant: 48)
            ])
        }

        let footer = UILabel()
        footer.text = "Hiện tại bạn vẫn có thể sử dụng đầy đủ module Truy xuất."
        footer.font = .systemFont(ofSize: 11)
        footer.textColor = NeutralPalette.shared.textMuted
        footer.textAlignment = .center
        footer.numberOfLines = 0
        contentStack.addArrangedSubview(footer)
        contentStack.setCustomSpacing(16, after: contentStack.arrangedSubviews[contentStack.arrangedSubviews.count - 2])
    }

    private func createFeatureRow(_ feature: ComingSoonFeature) -> UIView {
        let row = UIView()
        row.backgroundColor = NeutralPalette.shared.card
        row.layer.cornerRadius = 14
        row.layer.borderWidth = 1
        row.layer.borderColor = NeutralPalette.shared.border.cgColor

        let iconWrap = UIView()
        iconWrap.backgroundColor = theme.primary.withAlphaComponent(0.12)
        iconWrap.layer.cornerRadius = 12
        row.addSubview(iconWrap)
        iconWrap.translatesAutoresizingMaskIntoConstraints = false

        let iconLabel = UILabel()
        iconLabel.text = feature.icon
        iconLabel.font = .systemFont(ofSize: 20)
        iconWrap.addSubview(iconLabel)
        iconLabel.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = feature.title
        titleLabel.font = .systemFont(ofSize: 14, weight: .bold)
        titleLabel.textColor = NeutralPalette.shared.text
        row.addSubview(titleLabel)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let descLabel = UILabel()
        descLabel.text = feature.description
        descLabel.font = .systemFont(ofSize: 12)
        descLabel.textColor = NeutralPalette.shared.textMuted
        descLabel.numberOfLines = 0
        row.addSubview(descLabel)
        descLabel.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            iconWrap.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 14),
            iconWrap.topAnchor.constraint(equalTo: row.topAnchor, constant: 14),
            iconWrap.widthAnchor.constraint(equalToConstant: 40),
            iconWrap.heightAnchor.constraint(equalToConstant: 40),
            iconLabel.centerXAnchor.constraint(equalTo: iconWrap.centerXAnchor),
            iconLabel.centerYAnchor.constraint(equalTo: iconWrap.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: iconWrap.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -14),
            titleLabel.topAnchor.constraint(equalTo: row.topAnchor, constant: 14),
            descLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            descLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            descLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 3),
            descLabel.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -14)
        ])

        return row
    }

    private func animateIn() {
        view.alpha = 0
        view.transform = CGAffineTransform(translationX: 0, y: -12)
        UIView.animate(withDuration: 0.5) {
            self.view.alpha = 1
            self.view.transform = .identity
        }
    }

    @objc private func backTapped() {
        navigationController?.popViewController(animated: true)
    }

    @objc private func notifyTapped() {
        onNotify?()
    }
}
