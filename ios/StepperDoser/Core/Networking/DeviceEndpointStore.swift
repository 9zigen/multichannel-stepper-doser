import Foundation

@MainActor
@Observable
final class DeviceEndpointStore {
    private let defaults: UserDefaults
    private let storageKey = "device_endpoint"

    var rawValue: String

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.rawValue = defaults.string(forKey: storageKey) ?? ""
    }

    var hasEndpoint: Bool {
        normalizedURL != nil
    }

    var normalizedURL: URL? {
        Self.normalize(rawValue)
    }

    func save(_ newValue: String) {
        rawValue = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        defaults.set(rawValue, forKey: storageKey)
    }

    nonisolated static func normalize(_ value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let candidate: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            candidate = trimmed
        } else {
            candidate = "http://\(trimmed)"
        }

        guard var components = URLComponents(string: candidate) else {
            return nil
        }

        if components.path.isEmpty {
            components.path = "/"
        }

        return components.url
    }
}
