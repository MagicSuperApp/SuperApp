// ios/Features/Chatbot/AladinChatService.swift
//
// Streaming chat client for Aladin API.
// Uses URLSession for text/plain streaming.

import Foundation

typealias ChatRole = String
typealias ChatHistoryEntry = (String, ChatRole)

class AladinChatService {
    private let url = URL(string: "https://overmelodiously-skylike-phillip.ngrok-free.dev/chat")!
    private var task: URLSessionDataTask?

    func streamChat(
        message: String,
        history: [ChatHistoryEntry],
        mode: String = "QA",
        modelName: String = "llama3.2:1b-instruct-q8_0",
        onChunk: @escaping (String, String) -> Void,
        onDone: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/plain", forHTTPHeaderField: "Accept")

        let body: [String: Any] = [
            "message": message,
            "history": history.map { ["text": $0.0, "role": $0.1] },
            "mode": mode,
            "model_name": modelName
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        var accumulated = ""

        task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                onError(error)
                return
            }

            if let data = data, let chunk = String(data: data, encoding: .utf8) {
                accumulated += chunk
                onChunk(chunk, accumulated)
            }

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    onDone(accumulated)
                } else {
                    onError(NSError(domain: "AladinChat", code: httpResponse.statusCode))
                }
            }
        }

        task?.resume()
    }

    func abort() {
        task?.cancel()
    }
}
