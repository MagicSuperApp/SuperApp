// ios/Modules/ProofChat/Store/ProofChatStore.swift
//
// Combine-based store for ProofChat module.
// Consolidates chat/wallet/escrow state for MVP.

import Foundation
import Combine

struct ChatRoom: Identifiable {
    let id: String
    let name: String
    let type: String
    let lastMessage: String?
    let unreadCount: Int
}

struct Message: Identifiable {
    let id: String
    let roomId: String
    let senderId: String
    let isMine: Bool
    let timestamp: Int64
    let text: String
    let stage: String
}

struct Wallet {
    let balance: Double
    let address: String
}

struct Identity {
    let did: String
    let name: String
}

struct SyncState {
    var online: Bool
    var syncing: Bool
    var queuedCount: Int
}

class ProofChatStore: ObservableObject {
    static let shared = ProofChatStore()

    @Published var meId: String = "user-1"
    @Published var rooms: [ChatRoom] = []
    @Published var messagesByRoom: [String: [Message]] = [:]
    @Published var sync: SyncState = SyncState(online: true, syncing: false, queuedCount: 0)
    @Published var wallet: Wallet = Wallet(balance: 0, address: "")
    @Published var identity: Identity = Identity(did: "", name: "")

    private init() {
        loadMockData()
    }

    private func loadMockData() {
        rooms = [
            ChatRoom(id: "r1", name: "General", type: "group", lastMessage: "Hello", unreadCount: 0),
            ChatRoom(id: "r2", name: "Work", type: "job", lastMessage: "Task done", unreadCount: 2)
        ]

        messagesByRoom = [
            "r1": [
                Message(id: "m1", roomId: "r1", senderId: "user-2", isMine: false, timestamp: 1000, text: "Hi", stage: "delivered"),
                Message(id: "m2", roomId: "r1", senderId: meId, isMine: true, timestamp: 2000, text: "Hello", stage: "delivered")
            ]
        ]

        wallet = Wallet(balance: 100.0, address: "0x1234")
        identity = Identity(did: "did:example:123", name: "User")
    }

    func sendMessage(roomId: String, text: String) {
        let msg = Message(
            id: "m-\(Date().timeIntervalSince1970)",
            roomId: roomId,
            senderId: meId,
            isMine: true,
            timestamp: Int64(Date().timeIntervalSince1970 * 1000),
            text: text,
            stage: sync.online ? "encrypting" : "queued"
        )

        var messages = messagesByRoom[roomId] ?? []
        messages.append(msg)
        messagesByRoom[roomId] = messages
    }
}
