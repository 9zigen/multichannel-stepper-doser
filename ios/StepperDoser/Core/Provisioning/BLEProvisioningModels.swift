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

    enum CodingKeys: String, CodingKey {
        case success
        case bleActive = "ble_active"
        case recoveryMode = "recovery_mode"
        case fallbackMode = "fallback_mode"
        case graceMode = "grace_mode"
        case stationConnected = "station_connected"
        case stationSSID = "station_ssid"
        case stationIPAddress = "station_ip_address"
        case apSSID = "ap_ssid"
        case apIPAddress = "ap_ip_address"
        case apClients = "ap_clients"
        case hostname
        case timeZone = "time_zone"
        case message
    }

    init(
        success: Bool = false,
        bleActive: Bool = false,
        recoveryMode: Bool = false,
        fallbackMode: Bool = false,
        graceMode: Bool = false,
        stationConnected: Bool = false,
        stationSSID: String = "",
        stationIPAddress: String = "",
        apSSID: String = "",
        apIPAddress: String = "",
        apClients: Int = 0,
        hostname: String = "",
        timeZone: String = "",
        message: String? = nil
    ) {
        self.success = success
        self.bleActive = bleActive
        self.recoveryMode = recoveryMode
        self.fallbackMode = fallbackMode
        self.graceMode = graceMode
        self.stationConnected = stationConnected
        self.stationSSID = stationSSID
        self.stationIPAddress = stationIPAddress
        self.apSSID = apSSID
        self.apIPAddress = apIPAddress
        self.apClients = apClients
        self.hostname = hostname
        self.timeZone = timeZone
        self.message = message
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? false
        bleActive = try container.decodeIfPresent(Bool.self, forKey: .bleActive) ?? false
        recoveryMode = try container.decodeIfPresent(Bool.self, forKey: .recoveryMode) ?? false
        fallbackMode = try container.decodeIfPresent(Bool.self, forKey: .fallbackMode) ?? false
        graceMode = try container.decodeIfPresent(Bool.self, forKey: .graceMode) ?? false
        stationConnected = try container.decodeIfPresent(Bool.self, forKey: .stationConnected) ?? false
        stationSSID = try container.decodeIfPresent(String.self, forKey: .stationSSID) ?? ""
        stationIPAddress = try container.decodeIfPresent(String.self, forKey: .stationIPAddress) ?? ""
        apSSID = try container.decodeIfPresent(String.self, forKey: .apSSID) ?? ""
        apIPAddress = try container.decodeIfPresent(String.self, forKey: .apIPAddress) ?? ""
        apClients = try container.decodeIfPresent(Int.self, forKey: .apClients) ?? 0
        hostname = try container.decodeIfPresent(String.self, forKey: .hostname) ?? ""
        timeZone = try container.decodeIfPresent(String.self, forKey: .timeZone) ?? ""
        message = try container.decodeIfPresent(String.self, forKey: .message)
    }
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
