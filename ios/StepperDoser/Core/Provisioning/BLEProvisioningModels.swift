import Foundation

struct BLEProvisioningDevice: Identifiable, Equatable {
    let id: UUID
    let name: String
    let identifier: UUID
    let rssi: Int
}

struct BLEProvisioningStatus: Codable, Equatable, Sendable {
    var success: Bool
    var bleActive: Bool
    var recoveryMode: Bool
    var fallbackMode: Bool
    var graceMode: Bool
    var stationConnected: Bool
    var stationSSID: String
    var stationIPAddress: String
    var apSSID: String
    var apIPAddress: String
    var apClients: Int
    var hostname: String
    var timeZone: String
    var message: String?
}

struct BLEProvisioningPayload: Codable, Equatable, Sendable {
    struct Network: Codable, Equatable, Sendable {
        var ssid: String
        var password: String
        var dhcp: Bool
        var keepApActive: Bool
        var ipAddress: String?
        var mask: String?
        var gateway: String?
        var dns: String?
    }

    struct Services: Codable, Equatable, Sendable {
        var hostname: String
        var timeZone: String
    }

    struct Auth: Codable, Equatable, Sendable {
        var username: String
        var password: String
    }

    struct App: Codable, Equatable, Sendable {
        var onboardingCompleted: Bool
    }

    var network: Network
    var services: Services?
    var auth: Auth?
    var app: App?
}

struct BLEProvisioningResult: Sendable {
    var status: BLEProvisioningStatus
    var username: String?
    var password: String?
}

enum BLEProvisioningPhase: Equatable {
    case idle
    case waitingForBluetooth
    case scanning
    case connecting(String)
    case securing(String)
    case provisioning(String)
    case waitingForWiFi(String)
    case completed
    case failed(String)
}

enum BLEProvisioningError: LocalizedError {
    case bluetoothUnavailable(String)
    case peripheralNotFound
    case serviceNotFound
    case endpointNotFound(String)
    case invalidResponse(String)
    case securityFailure(String)
    case disconnected
    case timeout(String)
    case controllerRejected(String)

    var errorDescription: String? {
        switch self {
        case let .bluetoothUnavailable(message):
            return message
        case .peripheralNotFound:
            return "The selected controller is no longer in BLE provisioning mode."
        case .serviceNotFound:
            return "The controller did not expose the provisioning BLE service."
        case let .endpointNotFound(endpoint):
            return "The controller is missing the \(endpoint) BLE endpoint."
        case let .invalidResponse(message):
            return message
        case let .securityFailure(message):
            return message
        case .disconnected:
            return "The BLE connection closed before provisioning finished."
        case let .timeout(message):
            return message
        case let .controllerRejected(message):
            return message
        }
    }
}

extension BLEProvisioningPhase {
    var title: String {
        switch self {
        case .idle:
            return "Ready"
        case .waitingForBluetooth:
            return "Bluetooth Required"
        case .scanning:
            return "Scanning"
        case .connecting:
            return "Connecting"
        case .securing:
            return "Securing Session"
        case .provisioning:
            return "Sending Settings"
        case .waitingForWiFi:
            return "Joining Wi-Fi"
        case .completed:
            return "Provisioned"
        case .failed:
            return "Needs Attention"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            return "Scan for controllers in recovery, fallback, or AP grace mode."
        case .waitingForBluetooth:
            return "Bluetooth must be enabled before the app can discover nearby controllers."
        case .scanning:
            return "Looking for Stepper Doser controllers that are advertising the provisioning service."
        case let .connecting(deviceName):
            return "Opening a BLE link to \(deviceName)."
        case let .securing(deviceName):
            return "Running the Security1 handshake with \(deviceName)."
        case let .provisioning(ssid):
            return "Writing Wi-Fi and service settings for \(ssid)."
        case let .waitingForWiFi(ssid):
            return "Waiting for the controller to join \(ssid) and report its LAN IP."
        case .completed:
            return "The controller is ready for the normal app login flow."
        case let .failed(message):
            return message
        }
    }
}
