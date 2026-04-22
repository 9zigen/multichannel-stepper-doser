import Foundation

enum NetworkType: Int, Codable, Sendable {
    case wifi = 0
    case ethernet = 1
    case ble = 2
    case thread = 3
    case can = 4
}

enum ScheduleMode: Int, Codable, Sendable {
    case off = 0
    case periodic = 1
    case continuous = 2
}

struct AuthCredentials: Codable, Equatable, Sendable {
    var username: String
    var password: String
}

struct AppConfiguration: Codable, Equatable, Sendable {
    var onboardingCompleted: Bool
}

struct ServiceConfiguration: Codable, Equatable, Sendable {
    var hostname: String
    var ntpServer: String
    var timeZone: String
    var mqttIpAddress: String
    var mqttPort: String
    var mqttUser: String
    var mqttPassword: String
    var mqttQos: Int
    var mqttRetain: Bool
    var mqttDiscoveryTopic: String
    var mqttDiscoveryStatusTopic: String
    var enableNtp: Bool
    var enableMqtt: Bool
    var enableMqttDiscovery: Bool
    var otaUrl: String
}

struct TimeConfiguration: Codable, Equatable, Sendable {
    var timeZone: String
    var date: String
    var time: String
}

struct WiFiNetworkConfiguration: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var type: NetworkType
    var isDirty: Bool
    var ipAddress: String
    var mask: String
    var gateway: String
    var dns: String
    var dhcp: Bool
    var ssid: String
    var password: String
    var keepApActive: Bool
}

struct PumpCalibrationPoint: Codable, Equatable, Sendable {
    var speed: Double
    var flow: Double
}

struct PumpAgingConfiguration: Codable, Equatable, Sendable {
    var warningHours: Double
    var replaceHours: Double
}

struct PumpSchedule: Codable, Equatable, Sendable {
    var mode: ScheduleMode
    var workHours: [Int]
    var weekdays: [Int]
    var speed: Double
    var time: Double
    var volume: Double
}

struct PumpConfiguration: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var state: Bool
    var name: String
    var direction: Bool
    var runningHours: Double
    var aging: PumpAgingConfiguration
    var tankFullVol: Double
    var tankCurrentVol: Double
    var tankConcentrationTotal: Double
    var tankConcentrationActive: Double
    var schedule: PumpSchedule
    var calibration: [PumpCalibrationPoint]
}

struct SettingsResponse: Codable, Equatable, Sendable {
    var auth: AuthCredentials
    var app: AppConfiguration
    var networks: [WiFiNetworkConfiguration]
    var services: ServiceConfiguration
    var pumps: [PumpConfiguration]
    var time: TimeConfiguration
}

struct ServiceStatus: Codable, Equatable, Sendable {
    var enabled: Bool
    var connected: Bool?
    var sync: Bool?
}

struct StatusSnapshot: Codable, Equatable, Sendable {
    var upTime: String
    var localTime: String
    var localDate: String
    var timeValid: Bool
    var timeWarning: String
    var freeHeap: Int
    var vcc: Double
    var boardTemperature: Double
    var wifiMode: String
    var ipAddress: String
    var macAddress: String
    var stationConnected: Bool
    var stationSsid: String
    var stationIpAddress: String
    var stationMacAddress: String
    var apSsid: String
    var apIpAddress: String
    var apMacAddress: String
    var apClients: Int
    var mqttService: ServiceStatus
    var ntpService: ServiceStatus
    var firmwareVersion: String
    var firmwareDate: String
    var hardwareVersion: String
    var wifiDisconnects: Int
    var rebootCount: Int
    var lastRebootReason: String
    var storageBackend: String
    var rtcBackend: String
}

struct StatusEnvelope: Codable, Sendable {
    var status: StatusSnapshot
}

struct AuthTokenResponse: Codable, Sendable {
    var token: String
}

struct PumpRuntimeEntry: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var active: Bool
    var state: String
    var speed: Double
    var direction: Bool
    var remainingTicks: Int
    var remainingSeconds: Double
    var volumeMl: Double
}

struct PumpHistoryHour: Codable, Equatable, Sendable {
    var hour: Int
    var scheduledVolumeMl: Double
    var manualVolumeMl: Double
    var totalRuntimeS: Double
    var flags: Int
}

struct PumpHistoryDay: Codable, Equatable, Sendable {
    var dayStamp: Int
    var date: String
    var hours: [PumpHistoryHour]
}

struct PumpHistoryPump: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var name: String
    var days: [PumpHistoryDay]
}

struct PumpHistoryResponse: Codable, Equatable, Sendable {
    var retentionDays: Int
    var currentDayStamp: Int
    var pumps: [PumpHistoryPump]
}

struct DeviceActionResponse: Codable, Sendable {
    var success: Bool
    var message: String?
}

struct PumpRunRequest: Codable, Sendable {
    var id: Int
    var speed: Double
    var direction: Bool
    var time: Double
}

struct SettingsUpdatePayload: Codable, Sendable {
    var auth: AuthCredentials?
    var app: AppConfiguration?
    var services: ServiceConfiguration?
    var networks: [WiFiNetworkConfiguration]?
}

struct RealtimeStatusPatch: Codable, Sendable {
    var upTime: String?
    var localTime: String?
    var localDate: String?
    var timeValid: Bool?
    var timeWarning: String?
    var freeHeap: Int?
    var vcc: Double?
    var boardTemperature: Double?
    var wifiMode: String?
    var ipAddress: String?
    var stationConnected: Bool?
    var stationSsid: String?
    var stationIpAddress: String?
    var apSsid: String?
    var apIpAddress: String?
    var apClients: Int?
}

struct RealtimeSettingsEvent: Codable, Sendable {
    var auth: AuthCredentials
    var app: AppConfiguration
    var networks: [WiFiNetworkConfiguration]
    var services: ServiceConfiguration
    var pumps: [PumpConfiguration]
    var time: TimeConfiguration
}

enum RealtimeEvent: Sendable {
    case welcome
    case pong
    case shuttingDown
    case systemReady(firmwareVersion: String?)
    case statusPatch(RealtimeStatusPatch)
    case settingsUpdate(SettingsResponse)
    case ignored
}

extension SettingsResponse {
    static let placeholder = SettingsResponse(
        auth: AuthCredentials(username: "admin", password: "12345678"),
        app: AppConfiguration(onboardingCompleted: true),
        networks: [],
        services: ServiceConfiguration(
            hostname: "stepper-doser",
            ntpServer: "",
            timeZone: "UTC",
            mqttIpAddress: "",
            mqttPort: "",
            mqttUser: "",
            mqttPassword: "",
            mqttQos: 0,
            mqttRetain: false,
            mqttDiscoveryTopic: "homeassistant",
            mqttDiscoveryStatusTopic: "homeassistant/status",
            enableNtp: false,
            enableMqtt: false,
            enableMqttDiscovery: true,
            otaUrl: ""
        ),
        pumps: [],
        time: TimeConfiguration(timeZone: "UTC", date: "", time: "")
    )
}

extension StatusSnapshot {
    static let placeholder = StatusSnapshot(
        upTime: "",
        localTime: "",
        localDate: "",
        timeValid: true,
        timeWarning: "",
        freeHeap: 0,
        vcc: 0,
        boardTemperature: 0,
        wifiMode: "AP+STA",
        ipAddress: "",
        macAddress: "",
        stationConnected: false,
        stationSsid: "",
        stationIpAddress: "",
        stationMacAddress: "",
        apSsid: "DOSING",
        apIpAddress: "192.168.4.1",
        apMacAddress: "",
        apClients: 0,
        mqttService: ServiceStatus(enabled: false, connected: false, sync: nil),
        ntpService: ServiceStatus(enabled: false, connected: nil, sync: false),
        firmwareVersion: "",
        firmwareDate: "",
        hardwareVersion: "",
        wifiDisconnects: 0,
        rebootCount: 0,
        lastRebootReason: "",
        storageBackend: "",
        rtcBackend: ""
    )
}

extension JSONDecoder {
    static let deviceAPI: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
}

extension JSONEncoder {
    static let deviceAPI: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()
}
