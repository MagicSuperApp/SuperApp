// ios/Modules/ProofChat/Features/Chat/ChatScreen.swift
//
// Main chat screen with messages and input.

import UIKit
import Combine

class ChatScreen: UIViewController {
    private let room: ChatRoom
    private let store = ProofChatStore.shared
    private var cancellables = Set<AnyCancellable>()
    private let tableView = UITableView()
    private var messages: [Message] = []

    init(room: ChatRoom) {
        self.room = room
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupUI()
        observeMessages()
    }

    private func setupUI() {
        let header = ChatHeader(room: room) { [weak self] in
            self?.navigationController?.popViewController(animated: true)
        }
        view.addSubview(header)
        header.translatesAutoresizingMaskIntoConstraints = false

        tableView.separatorStyle = .none
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        tableView.dataSource = self
        view.addSubview(tableView)
        tableView.translatesAutoresizingMaskIntoConstraints = false

        let input = ChatInput { [weak self] text in
            self?.store.sendMessage(roomId: self?.room.id ?? "", text: text)
        }
        view.addSubview(input)
        input.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.topAnchor.constraint(equalTo: header.bottomAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: input.topAnchor),
            input.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            input.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            input.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    private func observeMessages() {
        store.$messagesByRoom
            .map { $0[self.room.id] ?? [] }
            .sink { [weak self] messages in
                self?.messages = messages
                self?.tableView.reloadData()
            }
            .store(in: &cancellables)
    }
}

extension ChatScreen: UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        messages.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        cell.contentView.subviews.forEach { $0.removeFromSuperview() }
        cell.selectionStyle = .none

        let bubble = MessageBubble(message: messages[indexPath.row])
        cell.contentView.addSubview(bubble)
        bubble.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            bubble.topAnchor.constraint(equalTo: cell.contentView.topAnchor, constant: 4),
            bubble.leadingAnchor.constraint(equalTo: cell.contentView.leadingAnchor),
            bubble.trailingAnchor.constraint(equalTo: cell.contentView.trailingAnchor),
            bubble.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor, constant: -4)
        ])

        return cell
    }
}
