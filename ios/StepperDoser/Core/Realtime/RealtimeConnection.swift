import Foundation

@MainActor
@Observable
final class RealtimeConnection {
    enum Status: String {
        case idle
        case connecting
        case connected
        case reconnecting
        case paused
    }

    enum SystemState: String {
        case normal
        case restarting
    }

    var status: Status = .idle
    var systemState: SystemState = .normal
    var attempt = 0
    var lastMessageType: String?

    private let decoder = JSONDecoder.deviceAPI
    private var webSocketTask: URLSessionWebSocketTask?
    private var listenerTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    func connect(baseURL: URL, token: String, onEvent: @escaping @MainActor (RealtimeEvent) -> Void) {
        disconnect()
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            status = .paused
            return
        }

        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "token", value: token)]

        guard let url = components.url else {
            status = .paused
            return
        }

        status = attempt > 0 ? .reconnecting : .connecting
        let task = URLSession.shared.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        status = .connected

        listenerTask = Task { [weak self] in
            guard let self else { return }
            await self.listen(onEvent: onEvent)
        }
    }

    func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        listenerTask?.cancel()
        listenerTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        status = .idle
    }

    private func listen(onEvent: @escaping @MainActor (RealtimeEvent) -> Void) async {
        guard let webSocketTask else { return }

        while !Task.isCancelled {
            do {
                let message = try await webSocketTask.receive()
                let payload: Data
                switch message {
                case let .data(data):
                    payload = data
                case let .string(string):
                    payload = Data(string.utf8)
                @unknown default:
                    continue
                }

                let event = try parseEvent(from: payload)
                await MainActor.run {
                    onEvent(event)
                }
            } catch {
                status = .paused
                return
            }
        }
    }

    private func parseEvent(from data: Data) throws -> RealtimeEvent {
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let type = root?["type"] as? String
        lastMessageType = type

        switch type {
        case "welcome":
            return .welcome
        case "pong":
            return .pong
        case "shutting_down":
            systemState = .restarting
            return .shuttingDown
        case "system_ready":
            systemState = .normal
            return .systemReady(firmwareVersion: root?["firmware_version"] as? String)
        case "status_patch", "status_update":
            let patch = try decoder.decode(RealtimeStatusPatch.self, from: data)
            return .statusPatch(patch)
        case "settings_update":
            let settings = try decoder.decode(SettingsResponse.self, from: data)
            return .settingsUpdate(settings)
        default:
            return .ignored
        }
    }
}
