// ios/Modules/ProofChat/Features/Chat/JobRoomItem.swift
//
// Job room item with escrow status.

import UIKit

class JobRoomItem: UITableViewCell {
    private var room: ChatRoom?

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: .subtitle, reuseIdentifier: reuseIdentifier)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        selectionStyle = .none
        backgroundColor = .white
        layer.cornerRadius = 12
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.05
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowRadius = 4
    }

    func configure(with room: ChatRoom) {
        self.room = room
        textLabel?.text = room.name
        detailTextLabel?.text = room.lastMessage

        if room.type == "job" {
            let badge = UILabel()
            badge.text = "JOB"
            badge.font = .systemFont(ofSize: 9, weight: .heavy)
            badge.textColor = .white
            badge.backgroundColor = UIColor(red: 0.26, green: 0.52, blue: 0.96, alpha: 1.0)
            badge.textAlignment = .center
            badge.layer.cornerRadius = 8
            badge.clipsToBounds = true
            badge.frame = CGRect(x: 0, y: 0, width: 40, height: 16)
            accessoryView = badge
        }

        if room.unreadCount > 0 {
            let unreadBadge = UILabel()
            unreadBadge.text = "\(room.unreadCount)"
            unreadBadge.font = .systemFont(ofSize: 11, weight: .bold)
            unreadBadge.textColor = .white
            unreadBadge.backgroundColor = .systemRed
            unreadBadge.textAlignment = .center
            unreadBadge.layer.cornerRadius = 10
            unreadBadge.clipsToBounds = true
            unreadBadge.frame = CGRect(x: 0, y: 0, width: 20, height: 20)
            accessoryView = unreadBadge
        }
    }
}
