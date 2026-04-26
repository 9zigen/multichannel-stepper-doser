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

struct PumpRuntimeEnvelope: Codable, Sendable {
    var pumps: [PumpRuntimeEntry]
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

// MARK: — Pump history volume helpers
//
// Firmware stores volumes as deci-milliliters (uint16) internally and converts
// to float ml before sending JSON: `scheduled_volume_ml` / `manual_volume_ml`.
// Max per-slot value is UINT16_MAX / 10 = 6553.5 ml — treat as saturated.

private let kHistoryVolumeMaxMl: Double = 6553.5

extension PumpHistoryHour {
    /// Total volume for this hour slot (scheduled + manual).
    var totalVolumeMl: Double { scheduledVolumeMl + manualVolumeMl }

    /// True when either component has hit the firmware storage ceiling.
    var isSaturated: Bool {
        scheduledVolumeMl >= kHistoryVolumeMaxMl || manualVolumeMl >= kHistoryVolumeMaxMl
    }

    /// Human-readable total volume for display (e.g. "1.5 ml", "1.2 L", "> 6.5L").
    var formattedVolume: String { PumpHistoryVolume.format(totalVolumeMl, saturated: isSaturated) }
}

extension PumpHistoryDay {
    /// Sum of all hour volumes for this day.
    var totalVolumeMl: Double { hours.reduce(0) { $0 + $1.totalVolumeMl } }

    /// True when any hour slot in this day is saturated.
    var isSaturated: Bool { hours.contains(where: \.isSaturated) }

    /// Human-readable total volume for this day.
    var formattedVolume: String { PumpHistoryVolume.format(totalVolumeMl, saturated: isSaturated) }
}

extension PumpHistoryPump {
    /// Sum of all day volumes across the pump's retained history.
    var totalVolumeMl: Double { days.reduce(0) { $0 + $1.totalVolumeMl } }

    /// Human-readable total volume for the whole pump history window.
    var formattedTotalVolume: String { PumpHistoryVolume.format(totalVolumeMl) }
}

/// Centralised volume formatting matching frontend `formatHistoryVolume` in utils.ts.
enum PumpHistoryVolume {
    /// Format a volume value with optional saturation override.
    /// - saturated: show "> 6.5L" regardless of numeric value.
    /// - ≥ 1000 ml: show in litres with 1 decimal (trailing zero stripped).
    /// - else: show in ml with 1 decimal (trailing zero stripped).
    static func format(_ ml: Double, saturated: Bool = false) -> String {
        if saturated || ml >= kHistoryVolumeMaxMl { return "> 6.5L" }
        if ml >= 1000 {
            let l = ml / 1000
            return l.truncatingRemainder(dividingBy: 1) == 0
                ? "\(Int(l)) L"
                : String(format: "%.1f L", l)
        }
        let rounded = (ml * 10).rounded() / 10
        return rounded.truncatingRemainder(dividingBy: 1) == 0
            ? "\(Int(rounded)) ml"
            : String(format: "%.1f ml", rounded)
    }
}

struct DeviceActionResponse: Codable, Sendable {
    var success: Bool
    var message: String?
}

struct PumpRunRequest: Codable, Sendable {
    var id: Int
    var speed: Double
    var direction: Bool
    var time: Double?
    var timeSeconds: Int?
}

struct SettingsUpdatePayload: Codable, Sendable {
    var auth: AuthCredentials?
    var app: AppConfiguration?
    var services: ServiceConfiguration?
    var networks: [WiFiNetworkConfiguration]?
    var pumps: [PumpConfiguration]?
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

struct RealtimeStatusEnvelope: Codable, Sendable {
    var type: String?
    var status: RealtimeStatusPatch
}

struct RealtimePumpRuntimeEnvelope: Codable, Sendable {
    var type: String?
    var pump: PumpRuntimeEntry
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
    case pumpRuntime(PumpRuntimeEntry)
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
