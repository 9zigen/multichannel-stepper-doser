import Foundation
import os

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
    var lastPongAt: Date?

    private let decoder = JSONDecoder.deviceAPI
    private let logger = Logger(subsystem: "com.alekseyvolkov.stepperdoser", category: "Realtime")
    private var webSocketTask: URLSessionWebSocketTask?
    private var listenerTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    private var baseURL: URL?
    private var token: String?
    private var onEvent: (@MainActor (RealtimeEvent) -> Void)?
    private var shouldReconnect = false

    private let heartbeatInterval: Duration = .seconds(15)
    private let reconnectInterval: Duration = .seconds(2.5)
    private let reconnectPause: Duration = .seconds(30)
    private let maxReconnectAttempts = 5

    func connect(baseURL: URL, token: String, onEvent: @escaping @MainActor (RealtimeEvent) -> Void) {
        let normalizedBaseURL = normalizedRealtimeBaseURL(for: baseURL)
        let isSameConnection =
            self.baseURL == normalizedBaseURL &&
            self.token == token &&
            webSocketTask != nil &&
            status != .idle &&
            status != .paused

        self.baseURL = normalizedBaseURL
        self.token = token
        self.onEvent = onEvent
        shouldReconnect = true

        if isSameConnection {
            return
        }

        reconnectTask?.cancel()
        reconnectTask = nil
        openSocket()
    }

    func disconnect() {
        shouldReconnect = false
        baseURL = nil
        token = nil
        onEvent = nil
        stopCurrentConnection(resetStatus: true)
    }

    /// Force an immediate reconnect, resetting the back-off counter.
    /// Safe to call at any time — no-op if no credentials are stored.
    func reconnect() {
        guard baseURL != nil, token != nil else { return }
        attempt = 0
        shouldReconnect = true
        reconnectTask?.cancel()
        reconnectTask = nil
        openSocket()
    }

    private func normalizedRealtimeBaseURL(for url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        if components.path.isEmpty {
            components.path = "/"
        }
        components.query = nil
        components.fragment = nil
        return components.url ?? url
    }

    private func openSocket() {
        stopCurrentConnection(resetStatus: false)

        guard let baseURL, let token else {
            status = .idle
            attempt = 0
            return
        }

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

        logger.info("Opening realtime websocket: \(url.absoluteString, privacy: .public)")
        status = attempt > 0 ? .reconnecting : .connecting
        let task = URLSession.shared.webSocketTask(with: url)
        webSocketTask = task
        task.resume()

        listenerTask = Task { [weak self] in
            await self?.listen(expectedTask: task)
        }

        heartbeatTask = Task { [weak self] in
            await self?.runHeartbeat(expectedTask: task)
        }

        Task { [weak self] in
            await self?.beginSession(expectedTask: task)
        }
    }

    private func stopCurrentConnection(resetStatus: Bool) {
        if let webSocketTask {
            logger.info("Closing realtime websocket")
            webSocketTask.cancel(with: .goingAway, reason: nil)
        }

        reconnectTask?.cancel()
        reconnectTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        listenerTask?.cancel()
        listenerTask = nil
        webSocketTask = nil

        if resetStatus {
            status = .idle
            attempt = 0
            lastPongAt = nil
            lastMessageType = nil
        }
    }

    private func beginSession(expectedTask: URLSessionWebSocketTask) async {
        do {
            try await sendJSON(["type": "hello"], on: expectedTask)
            try await sendJSON(["type": "ping", "ts": Date().timeIntervalSince1970], on: expectedTask)
            guard webSocketTask === expectedTask else { return }
            status = .connected
            attempt = 0
            lastPongAt = .now
        } catch {
            await handleConnectionFailure(for: expectedTask)
        }
    }

    private func runHeartbeat(expectedTask: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: heartbeatInterval)
                guard webSocketTask === expectedTask else { return }
                try await sendJSON(["type": "ping", "ts": Date().timeIntervalSince1970], on: expectedTask)
            } catch {
                if Task.isCancelled {
                    return
                }
                await handleConnectionFailure(for: expectedTask)
                return
            }
        }
    }

    private func listen(expectedTask: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            guard webSocketTask === expectedTask else { return }

            do {
                let message = try await expectedTask.receive()
                let payload: Data
                switch message {
                case let .data(data):
                    payload = data
                    let text = String(data: data, encoding: .utf8) ?? "<non-utf8 \(data.count) bytes>"
                    logger.info("Realtime message in (binary): \(text, privacy: .public)")
                case let .string(string):
                    payload = Data(string.utf8)
                    logger.info("Realtime message in (text): \(string, privacy: .public)")
                @unknown default:
                    continue
                }

                let event = try parseEvent(from: payload)
                if case .pong = event {
                    lastPongAt = .now
                } else if case .welcome = event {
                    lastPongAt = .now
                }

                if let onEvent {
                    await MainActor.run {
                        onEvent(event)
                    }
                }
            } catch {
                logger.error("Realtime receive failed: \(error.localizedDescription, privacy: .public)")
                await handleConnectionFailure(for: expectedTask)
                return
            }
        }
    }

    private func handleConnectionFailure(for failedTask: URLSessionWebSocketTask) async {
        guard webSocketTask === failedTask else { return }
        logger.error("Realtime websocket failed, scheduling reconnect. attempt=\(self.attempt + 1, privacy: .public)")
        heartbeatTask?.cancel()
        heartbeatTask = nil
        listenerTask?.cancel()
        listenerTask = nil
        webSocketTask = nil

        guard shouldReconnect else {
            status = .idle
            return
        }

        attempt += 1

        if attempt >= maxReconnectAttempts {
            status = .paused
            logger.error("Realtime websocket paused after \(self.attempt, privacy: .public) attempts")
            let reconnectPause = self.reconnectPause
            reconnectTask?.cancel()
            reconnectTask = Task { [weak self] in
                do {
                    try await Task.sleep(for: reconnectPause)
                    guard let self else { return }
                    guard self.shouldReconnect else { return }
                    self.attempt = 0
                    self.openSocket()
                } catch {
                    return
                }
            }
            return
        }

        status = .reconnecting
        let reconnectInterval = self.reconnectInterval
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            do {
                try await Task.sleep(for: reconnectInterval)
                guard let self else { return }
                guard self.shouldReconnect else { return }
                self.openSocket()
            } catch {
                return
            }
        }
    }

    private func parseEvent(from data: Data) throws -> RealtimeEvent {
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let type = root?["type"] as? String
        lastMessageType = type
        logger.info("Realtime parsed event type: \(type ?? "<missing>", privacy: .public)")

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
            let patch = try decoder.decode(RealtimeStatusEnvelope.self, from: data)
            return .statusPatch(patch.status)
        case "pump_runtime":
            let runtime = try decoder.decode(RealtimePumpRuntimeEnvelope.self, from: data)
            return .pumpRuntime(runtime.pump)
        case "settings_update":
            let settings = try decoder.decode(SettingsResponse.self, from: data)
            return .settingsUpdate(settings)
        default:
            let payload = String(data: data, encoding: .utf8) ?? "<non-utf8 \(data.count) bytes>"
            logger.info("Realtime ignored payload: \(payload, privacy: .public)")
            return .ignored
        }
    }

    private func sendJSON(_ object: [String: Any], on task: URLSessionWebSocketTask) async throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        let text = String(decoding: data, as: UTF8.self)
        logger.info("Realtime message out: \(text, privacy: .public)")
        try await task.send(.string(text))
    }
}
