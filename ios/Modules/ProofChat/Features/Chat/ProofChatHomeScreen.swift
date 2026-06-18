// ios/Modules/ProofChat/Features/Chat/ProofChatHomeScreen.swift
//
// ProofChat home screen with room list.

import UIKit
import Combine

class ProofChatHomeScreen: UIViewController {
    private let store = ProofChatStore.shared
    private var cancellables = Set<AnyCancellable>()
    private let tableView = UITableView()
    private var rooms: [ChatRoom] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "ProofChat"
        view.backgroundColor = .white
        setupUI()
        observeRooms()
    }

    private func setupUI() {
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        tableView.dataSource = self
        tableView.delegate = self
        view.addSubview(tableView)
        tableView.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func observeRooms() {
        store.$rooms
            .sink { [weak self] rooms in
                self?.rooms = rooms
                self?.tableView.reloadData()
            }
            .store(in: &cancellables)
    }
}

extension ProofChatHomeScreen: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        rooms.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        let room = rooms[indexPath.row]
        cell.textLabel?.text = room.name
        cell.detailTextLabel?.text = room.lastMessage
        if room.unreadCount > 0 {
            cell.accessoryView = {
                let badge = UILabel()
                badge.text = "\(room.unreadCount)"
                badge.font = .systemFont(ofSize: 12, weight: .bold)
                badge.textColor = .white
                badge.backgroundColor = .systemRed
                badge.textAlignment = .center
                badge.layer.cornerRadius = 10
                badge.clipsToBounds = true
                badge.frame = CGRect(x: 0, y: 0, width: 20, height: 20)
                return badge
            }()
        }
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let chatScreen = ChatScreen(room: rooms[indexPath.row])
        navigationController?.pushViewController(chatScreen, animated: true)
    }
}
