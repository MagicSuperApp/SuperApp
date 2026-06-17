import Foundation
import Network

/// Network connectivity monitor using NWPathMonitor.
final class NetworkMonitor {

    // MARK: - Properties

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.aladin.networkmonitor")

    private(set) var isOnline = false
    private(set) var connectionType: ConnectionType = .unknown

    var onConnectivityChange: ((Bool) -> Void)?

    enum ConnectionType {
        case wifi, cellular, ethernet, unknown
    }

    // MARK: - Public API

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let wasOnline = self?.isOnline ?? false
            self?.isOnline = path.status == .satisfied

            self?.connectionType = self?.getConnectionType(path) ?? .unknown

            if wasOnline != self?.isOnline {
                DispatchQueue.main.async {
                    self?.onConnectivityChange?(self?.isOnline ?? false)
                }
            }

            print("[NetworkMonitor] 🌐 Status: \(self?.isOnline == true ? "ONLINE" : "OFFLINE"), type: \(String(describing: self?.connectionType))")
        }

        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }

    // MARK: - Private

    private func getConnectionType(_ path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) { return .wifi }
        if path.usesInterfaceType(.cellular) { return .cellular }
        if path.usesInterfaceType(.wiredEthernet) { return .ethernet }
        return .unknown
    }
}
