import Foundation

final class DeviceAPIClient {
    private let session: URLSession
    private let decoder = JSONDecoder.deviceAPI
    private let encoder = JSONEncoder.deviceAPI

    var baseURL: URL?
    var authToken: String?

    init(session: URLSession = .shared) {
        self.session = session
    }

    func login(username: String, password: String) async throws -> String {
        let request = AuthCredentials(username: username, password: password)
        let response: AuthTokenResponse = try await send(path: "api/auth", method: "POST", body: request)
        authToken = response.token
        return response.token
    }

    func fetchStatus() async throws -> StatusSnapshot {
        let response: StatusEnvelope = try await send(path: "api/status")
        return response.status
    }

    func fetchSettings() async throws -> SettingsResponse {
        try await send(path: "api/settings")
    }

    func saveSettings(_ payload: SettingsUpdatePayload) async throws -> SettingsResponse {
        try await send(path: "api/settings", method: "POST", body: payload)
    }

    func fetchPumpRuntime() async throws -> [PumpRuntimeEntry] {
        try await send(path: "api/pumps/runtime")
    }

    func fetchPumpHistory() async throws -> PumpHistoryResponse {
        try await send(path: "api/pumps/history")
    }

    func runPump(_ payload: PumpRunRequest) async throws -> DeviceActionResponse {
        try await send(path: "api/run", method: "POST", body: payload)
    }

    func restartDevice() async throws -> DeviceActionResponse {
        try await send(path: "api/device/restart", method: "POST", body: Optional<String>.none)
    }

    func factoryResetDevice() async throws -> DeviceActionResponse {
        try await send(path: "api/device/factory-reset", method: "POST", body: Optional<String>.none)
    }

    private func send<Response: Decodable>(path: String, method: String = "GET") async throws -> Response {
        try await send(path: path, method: method, body: Optional<String>.none)
    }

    private func send<Request: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Request?
    ) async throws -> Response {
        guard let baseURL else {
            throw APIError.missingEndpoint
        }

        let url = baseURL.appending(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let authToken, !authToken.isEmpty {
            request.setValue(authToken, forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Request failed with status \(httpResponse.statusCode)"
            throw APIError.server(message)
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.server("Failed to decode controller response.")
        }
    }
}
