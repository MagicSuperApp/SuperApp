// ios/Features/Chatbot/ChatbotStore.swift
//
// Store for floating chatbot bubble state.
// Persists position and enabled state.

import Foundation
import Combine

struct ChatbotPosition: Codable {
    var x: CGFloat
    var y: CGFloat
}

class ChatbotStore: ObservableObject {
    static let shared = ChatbotStore()

    @Published var enabled: Bool = true
    @Published var position: ChatbotPosition?

    private let defaults = UserDefaults.standard
    private let key = "chatbot_settings_v1"

    private init() {
        load()
    }

    func setEnabled(_ value: Bool) {
        enabled = value
        save()
    }

    func setPosition(_ pos: ChatbotPosition) {
        position = pos
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(Settings.self, from: data) else { return }
        enabled = decoded.enabled
        position = decoded.position
    }

    private func save() {
        let settings = Settings(enabled: enabled, position: position)
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: key)
        }
    }

    private struct Settings: Codable {
        let enabled: Bool
        let position: ChatbotPosition?
    }
}
