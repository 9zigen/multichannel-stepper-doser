import Foundation

struct ManagedDevice: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    var name: String
    var endpoint: String
    var preferredUsername: String?
    var lastKnownIPAddress: String?
    var lastSeenAt: Date?
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        endpoint: String,
        preferredUsername: String? = nil,
        lastKnownIPAddress: String? = nil,
        lastSeenAt: Date? = nil,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.endpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        self.preferredUsername = preferredUsername?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.lastKnownIPAddress = lastKnownIPAddress?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.lastSeenAt = lastSeenAt
        self.createdAt = createdAt
    }

    var normalizedURL: URL? {
        DeviceEndpointStore.normalize(endpoint)
    }

    var displayName: String {
        if !name.isEmpty {
            return name
        }

        if let host = normalizedURL?.host(), !host.isEmpty {
            return host
        }

        return endpoint
    }

    var endpointLabel: String {
        if let host = normalizedURL?.host(), !host.isEmpty {
            return host
        }
        return endpoint
    }

    var tokenAccount: String {
        "device-token.\(id.uuidString.lowercased())"
    }
}
