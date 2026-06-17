// LocalPods/ScannerModule/Core/StatusType.swift
//
// Status types for scanner UI - determines icon + color.
// Mirrors Android UIController.kt StatusType enum.

import UIKit

enum StatusType {
    case scanning
    case detected
    case focusing
    case cameraOn
    case cameraOff
    case uploading
    case success
    case error
    case offline
    case lowPower

    var icon: String {
        switch self {
        case .scanning: return "viewfinder.circle"
        case .detected: return "leaf.circle"
        case .focusing: return "scope"
        case .cameraOn: return "camera.circle"
        case .cameraOff: return "camera.circle.fill"
        case .uploading: return "icloud.and.arrow.up"
        case .success: return "checkmark.circle"
        case .error: return "exclamationmark.triangle"
        case .offline: return "wifi.slash"
        case .lowPower: return "battery.25"
        }
    }

    var tint: UIColor {
        switch self {
        case .scanning, .detected, .cameraOn, .success:
            return UIColor(red: 0.30, green: 0.85, blue: 0.39, alpha: 1.0) // #4CD964 green
        case .focusing, .offline, .lowPower:
            return UIColor(red: 1.0, green: 0.76, blue: 0.03, alpha: 1.0) // #FFC107 amber
        case .cameraOff:
            return UIColor(red: 0.62, green: 0.62, blue: 0.62, alpha: 1.0) // #9E9E9E grey
        case .uploading:
            return UIColor(red: 0.26, green: 0.65, blue: 0.96, alpha: 1.0) // #42A5F5 blue
        case .error:
            return UIColor(red: 0.94, green: 0.33, blue: 0.31, alpha: 1.0) // #EF5350 red
        }
    }
}
