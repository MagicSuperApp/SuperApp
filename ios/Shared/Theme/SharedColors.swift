// Shared/Theme/SharedColors.swift
//
// Neutral palette for all modules (light modern).
// Each module has its own brand colors at Modules/<name>/Theme/

import UIKit

public struct NeutralPalette {
    public let bg: UIColor
    public let bgSoft: UIColor
    public let bgWarm: UIColor
    public let card: UIColor

    public let border: UIColor
    public let borderSoft: UIColor
    public let divider: UIColor

    public let text: UIColor
    public let textSub: UIColor
    public let textMuted: UIColor

    public let white: UIColor
    public let black: UIColor

    public let success: UIColor
    public let error: UIColor
    public let warning: UIColor
    public let info: UIColor

    public let shadow: UIColor
    public let shadowSoft: UIColor
    public let overlay: UIColor

    public static let shared = NeutralPalette(
        bg: UIColor(hex: "#FFFFFF"),
        bgSoft: UIColor(hex: "#F7F8F7"),
        bgWarm: UIColor(hex: "#FAFAF8"),
        card: UIColor(hex: "#FFFFFF"),
        border: UIColor(hex: "#ECEDEE"),
        borderSoft: UIColor(hex: "#F1F2F3"),
        divider: UIColor(hex: "#EAEBED"),
        text: UIColor(hex: "#0F1614"),
        textSub: UIColor(hex: "#4D5A52"),
        textMuted: UIColor(hex: "#9AA39E"),
        white: UIColor(hex: "#FFFFFF"),
        black: UIColor(hex: "#0F1614"),
        success: UIColor(hex: "#3D7A5E"),
        error: UIColor(hex: "#C0533A"),
        warning: UIColor(hex: "#B07D2F"),
        info: UIColor(hex: "#3B6EA8"),
        shadow: UIColor(hex: "#0F1614").withAlphaComponent(0.08),
        shadowSoft: UIColor(hex: "#0F1614").withAlphaComponent(0.04),
        overlay: UIColor(hex: "#0F1614").withAlphaComponent(0.4)
    )
}

public struct ModuleTheme {
    public let key: String
    public let name: String
    public let primary: UIColor
    public let primaryDeep: UIColor
    public let primaryLight: UIColor
    public let primaryGlow: UIColor
    public let onPrimary: UIColor
    public let gradient: [UIColor]

    public init(key: String, name: String, primary: String, primaryDeep: String,
                primaryLight: String, primaryGlow: String, onPrimary: String,
                gradient: [String]) {
        self.key = key
        self.name = name
        self.primary = UIColor(hex: primary)
        self.primaryDeep = UIColor(hex: primaryDeep)
        self.primaryLight = UIColor(hex: primaryLight)
        self.primaryGlow = UIColor(hex: primaryGlow)
        self.onPrimary = UIColor(hex: onPrimary)
        self.gradient = gradient.map { UIColor(hex: $0) }
    }
}

extension UIColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: CGFloat(a) / 255)
    }
}
