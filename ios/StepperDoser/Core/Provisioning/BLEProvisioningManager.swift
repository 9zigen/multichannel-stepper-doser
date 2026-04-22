import CoreBluetooth
import Foundation

@MainActor
@Observable
final class BLEProvisioningManager: NSObject {
    private let serviceUUID = CBUUID(string: "7DD22F2C-4A5E-319B-9F4E-915A01513492")
    private let userDescriptionUUID = CBUUID(string: "2901")
    private let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
    private let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    var phase: BLEProvisioningPhase = .waitingForBluetooth
    var devices: [BLEProvisioningDevice] = []
    var latestStatus: BLEProvisioningStatus?
    var protocolVersion: String?
    var isScanning = false

    private var centralManager: CBCentralManager!
    private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
    private var endpointCharacteristics: [BLEProvisioningEndpoint: CBCharacteristic] = [:]
    private var activePeripheral: CBPeripheral?
    private var discoveredService: CBService?
    private var discoveredCharacteristics: [CBCharacteristic] = []

    private var bluetoothWaiters: [CheckedContinuation<Void, Error>] = []
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var serviceContinuation: CheckedContinuation<Void, Error>?
    private var characteristicContinuation: CheckedContinuation<Void, Error>?
    private var endpointDiscovery: EndpointDiscovery?
    private var writeContinuations: [CBUUID: CheckedContinuation<Void, Error>] = [:]
    private var readContinuations: [CBUUID: CheckedContinuation<Data, Error>] = [:]

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func startScanning() {
        guard centralManager.state == .poweredOn else {
            phase = .waitingForBluetooth
            return
        }

        devices = []
        discoveredPeripherals = [:]
        isScanning = true
        phase = .scanning
        centralManager.scanForPeripherals(withServices: [serviceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
    }

    func stopScanning() {
        guard isScanning else { return }
        centralManager.stopScan()
        isScanning = false
        if case .scanning = phase {
            phase = .idle
        }
    }

    func refreshStatus(for device: BLEProvisioningDevice, pop: String) async throws -> BLEProvisioningStatus {
        try await ensurePoweredOn()
        stopScanning()

        do {
            try await connectAndSecure(device: device, pop: pop)
            let status = try await fetchStatus()
            latestStatus = status
            phase = .idle
            await disconnect()
            return status
        } catch {
            await disconnect()
            throw error
        }
    }

    func provision(
        device: BLEProvisioningDevice,
        pop: String,
        payload: BLEProvisioningPayload,
        waitTimeout: Duration = .seconds(25),
        pollInterval: Duration = .seconds(1)
    ) async throws -> BLEProvisioningResult {
        try await ensurePoweredOn()
        stopScanning()

        do {
            try await connectAndSecure(device: device, pop: pop)
            latestStatus = try await fetchStatus()

            phase = .provisioning(payload.network.ssid)
            let response = try await send(endpoint: .config, data: try secureJSON(payload))
            let immediateStatus = try decodeStatus(fromSecure: response)
            latestStatus = immediateStatus

            var finalStatus = immediateStatus
            if !finalStatus.stationConnected {
                let clock = ContinuousClock()
                let deadline = clock.now + waitTimeout
                while clock.now < deadline {
                    phase = .waitingForWiFi(payload.network.ssid)
                    try await Task.sleep(for: pollInterval)
                    finalStatus = try await fetchStatus()
                    latestStatus = finalStatus
                    if finalStatus.stationConnected,
                       !finalStatus.stationIPAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        break
                    }
                }
            }

            await disconnect()

            guard finalStatus.stationConnected,
                  !finalStatus.stationIPAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                phase = .failed("Provisioning completed, but the controller never reported a LAN IP before the BLE session timed out.")
                throw BLEProvisioningError.timeout("Provisioning finished, but the controller did not report a usable LAN IP in time.")
            }

            phase = .completed
            return BLEProvisioningResult(
                status: finalStatus,
                username: payload.auth?.username,
                password: payload.auth?.password
            )
        } catch {
            phase = .failed(error.localizedDescription)
            await disconnect()
            throw error
        }
    }

    func disconnect() async {
        if let activePeripheral {
            centralManager.cancelPeripheralConnection(activePeripheral)
        }

        activePeripheral = nil
        endpointCharacteristics = [:]
        connectContinuation?.resume(throwing: BLEProvisioningError.disconnected)
        connectContinuation = nil
        serviceContinuation?.resume(throwing: BLEProvisioningError.disconnected)
        serviceContinuation = nil
        characteristicContinuation?.resume(throwing: BLEProvisioningError.disconnected)
        characteristicContinuation = nil

        if let endpointDiscovery {
            endpointDiscovery.continuation.resume(throwing: BLEProvisioningError.disconnected)
            self.endpointDiscovery = nil
        }

        for continuation in writeContinuations.values {
            continuation.resume(throwing: BLEProvisioningError.disconnected)
        }
        writeContinuations.removeAll()

        for continuation in readContinuations.values {
            continuation.resume(throwing: BLEProvisioningError.disconnected)
        }
        readContinuations.removeAll()
    }

    private func ensurePoweredOn() async throws {
        switch centralManager.state {
        case .poweredOn:
            return
        case .unsupported:
            throw BLEProvisioningError.bluetoothUnavailable("This device does not support Bluetooth LE provisioning.")
        case .unauthorized:
            throw BLEProvisioningError.bluetoothUnavailable("Bluetooth access is blocked. Allow Bluetooth for Stepper Doser in Settings.")
        case .poweredOff:
            throw BLEProvisioningError.bluetoothUnavailable("Turn Bluetooth on, then scan again.")
        case .resetting, .unknown:
            try await withCheckedThrowingContinuation { continuation in
                bluetoothWaiters.append(continuation)
            }
        @unknown default:
            throw BLEProvisioningError.bluetoothUnavailable("Bluetooth is unavailable right now.")
        }
    }

    private func connectAndSecure(device: BLEProvisioningDevice, pop: String) async throws {
        let peripheral = try await connect(to: device)
        let security = BLEProvisioningSecuritySession(pop: pop)
        phase = .securing(device.name)
        protocolVersion = try await fetchProtocolVersion()

        let setup0 = try await send(endpoint: .session, data: security.makeSetup0Request())
        try security.handleSetup0Response(setup0)

        let setup1 = try await send(endpoint: .session, data: try security.makeSetup1Request())
        try security.handleSetup1Response(setup1)

        activePeripheral = peripheral
        self.securitySession = security
    }

    private var securitySession: BLEProvisioningSecuritySession?

    private func connect(to device: BLEProvisioningDevice) async throws -> CBPeripheral {
        guard let peripheral = discoveredPeripherals[device.identifier] else {
            throw BLEProvisioningError.peripheralNotFound
        }

        phase = .connecting(device.name)
        activePeripheral = peripheral
        peripheral.delegate = self

        try await withCheckedThrowingContinuation { continuation in
            connectContinuation = continuation
            centralManager.connect(peripheral)
        }

        try await discoverProvisioningService(on: peripheral)
        guard let service = discoveredService else {
            throw BLEProvisioningError.serviceNotFound
        }

        try await discoverCharacteristics(on: peripheral, service: service)
        let characteristics = discoveredCharacteristics
        endpointCharacteristics = try await resolveEndpoints(on: peripheral, characteristics: characteristics)
        return peripheral
    }

    private func discoverProvisioningService(on peripheral: CBPeripheral) async throws {
        try await withCheckedThrowingContinuation { continuation in
            discoveredService = nil
            serviceContinuation = continuation
            peripheral.discoverServices([serviceUUID])
        }
    }

    private func discoverCharacteristics(on peripheral: CBPeripheral, service: CBService) async throws {
        try await withCheckedThrowingContinuation { continuation in
            discoveredCharacteristics = []
            characteristicContinuation = continuation
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    private func resolveEndpoints(
        on peripheral: CBPeripheral,
        characteristics: [CBCharacteristic]
    ) async throws -> [BLEProvisioningEndpoint: CBCharacteristic] {
        try await withCheckedThrowingContinuation { continuation in
            endpointDiscovery = EndpointDiscovery(characteristics: characteristics, continuation: continuation)
            for characteristic in characteristics {
                peripheral.discoverDescriptors(for: characteristic)
            }
        }

        return endpointCharacteristics
    }

    private func fetchProtocolVersion() async throws -> String {
        let response = try await send(endpoint: .protoVersion, data: Data())
        guard let value = String(data: response, encoding: .utf8) else {
            throw BLEProvisioningError.invalidResponse("The controller returned an unreadable protocol version.")
        }
        return value
    }

    private func fetchStatus() async throws -> BLEProvisioningStatus {
        let response = try await send(endpoint: .status, data: try secureJSON(Optional<String>.none))
        return try decodeStatus(fromSecure: response)
    }

    private func secureJSON<T: Encodable>(_ value: T) throws -> Data {
        guard let securitySession else {
            throw BLEProvisioningError.securityFailure("The BLE security session has not been established.")
        }
        let payload = try jsonEncoder.encode(value)
        return try securitySession.crypt(payload)
    }

    private func decodeStatus(fromSecure data: Data) throws -> BLEProvisioningStatus {
        guard let securitySession else {
            throw BLEProvisioningError.securityFailure("The BLE security session has not been established.")
        }
        let decrypted = try securitySession.crypt(data)
        let status = try jsonDecoder.decode(BLEProvisioningStatus.self, from: decrypted)
        if !status.success {
            throw BLEProvisioningError.controllerRejected(status.message ?? "The controller rejected the provisioning request.")
        }
        return status
    }

    private func send(endpoint: BLEProvisioningEndpoint, data: Data) async throws -> Data {
        guard let characteristic = endpointCharacteristics[endpoint] else {
            throw BLEProvisioningError.endpointNotFound(endpoint.rawValue)
        }
        guard let activePeripheral else {
            throw BLEProvisioningError.disconnected
        }

        try await withCheckedThrowingContinuation { continuation in
            writeContinuations[characteristic.uuid] = continuation
            activePeripheral.writeValue(data, for: characteristic, type: .withResponse)
        }

        return try await withCheckedThrowingContinuation { continuation in
            readContinuations[characteristic.uuid] = continuation
            activePeripheral.readValue(for: characteristic)
        }
    }
}

@MainActor
extension BLEProvisioningManager: @preconcurrency CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if case .waitingForBluetooth = phase {
                phase = .idle
            }
            bluetoothWaiters.forEach { $0.resume() }
            bluetoothWaiters.removeAll()
        case .unsupported:
            let error = BLEProvisioningError.bluetoothUnavailable("This device does not support Bluetooth LE provisioning.")
            phase = .failed(error.localizedDescription)
            bluetoothWaiters.forEach { $0.resume(throwing: error) }
            bluetoothWaiters.removeAll()
        case .unauthorized:
            let error = BLEProvisioningError.bluetoothUnavailable("Bluetooth access is blocked. Allow Bluetooth for Stepper Doser in Settings.")
            phase = .failed(error.localizedDescription)
            bluetoothWaiters.forEach { $0.resume(throwing: error) }
            bluetoothWaiters.removeAll()
        case .poweredOff:
            phase = .waitingForBluetooth
        case .resetting, .unknown:
            phase = .waitingForBluetooth
        @unknown default:
            phase = .waitingForBluetooth
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let advertisementName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedName = (advertisementName?.isEmpty == false ? advertisementName : nil) ?? peripheral.name ?? "Stepper Doser"

        discoveredPeripherals[peripheral.identifier] = peripheral
        let device = BLEProvisioningDevice(
            id: peripheral.identifier,
            name: resolvedName,
            identifier: peripheral.identifier,
            rssi: RSSI.intValue
        )

        if let index = devices.firstIndex(where: { $0.identifier == device.identifier }) {
            devices[index] = device
        } else {
            devices.append(device)
            devices.sort { lhs, rhs in
                if lhs.name == rhs.name {
                    return lhs.rssi > rhs.rssi
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectContinuation?.resume()
        connectContinuation = nil
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let resolvedError = error ?? BLEProvisioningError.disconnected
        connectContinuation?.resume(throwing: resolvedError)
        connectContinuation = nil
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        let resolvedError = error ?? BLEProvisioningError.disconnected
        activePeripheral = nil
        endpointCharacteristics = [:]
        securitySession = nil

        connectContinuation?.resume(throwing: resolvedError)
        connectContinuation = nil
        serviceContinuation?.resume(throwing: resolvedError)
        serviceContinuation = nil
        characteristicContinuation?.resume(throwing: resolvedError)
        characteristicContinuation = nil

        if let endpointDiscovery {
            endpointDiscovery.continuation.resume(throwing: resolvedError)
            self.endpointDiscovery = nil
        }

        for continuation in writeContinuations.values {
            continuation.resume(throwing: resolvedError)
        }
        writeContinuations.removeAll()

        for continuation in readContinuations.values {
            continuation.resume(throwing: resolvedError)
        }
        readContinuations.removeAll()
    }
}

@MainActor
extension BLEProvisioningManager: @preconcurrency CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            serviceContinuation?.resume(throwing: error)
            serviceContinuation = nil
            return
        }

        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            serviceContinuation?.resume(throwing: BLEProvisioningError.serviceNotFound)
            serviceContinuation = nil
            return
        }

        discoveredService = service
        serviceContinuation?.resume()
        serviceContinuation = nil
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            characteristicContinuation?.resume(throwing: error)
            characteristicContinuation = nil
            return
        }

        discoveredCharacteristics = service.characteristics ?? []
        characteristicContinuation?.resume()
        characteristicContinuation = nil
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverDescriptorsFor characteristic: CBCharacteristic, error: Error?) {
        guard var endpointDiscovery else { return }
        if let error {
            endpointDiscovery.continuation.resume(throwing: error)
            self.endpointDiscovery = nil
            return
        }

        endpointDiscovery.markDescriptorsDiscovered(for: characteristic)
        let descriptors = characteristic.descriptors ?? []
        let userDescriptors = descriptors.filter { $0.uuid == userDescriptionUUID }
        endpointDiscovery.setPendingDescriptorReads(userDescriptors.count, for: characteristic)
        self.endpointDiscovery = endpointDiscovery

        if userDescriptors.isEmpty {
            finishEndpointDiscoveryIfNeeded()
            return
        }

        for descriptor in userDescriptors {
            peripheral.readValue(for: descriptor)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor descriptor: CBDescriptor, error: Error?) {
        guard var endpointDiscovery else { return }
        if let error {
            endpointDiscovery.continuation.resume(throwing: error)
            self.endpointDiscovery = nil
            return
        }

        if descriptor.uuid == userDescriptionUUID,
           let characteristic = descriptor.characteristic,
           let name = descriptor.value as? String {
            endpointDiscovery.register(name: name.lowercased(), for: characteristic)
        }

        self.endpointDiscovery = endpointDiscovery
        finishEndpointDiscoveryIfNeeded()
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let continuation = writeContinuations.removeValue(forKey: characteristic.uuid) else { return }
        if let error {
            continuation.resume(throwing: error)
        } else {
            continuation.resume()
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let continuation = readContinuations.removeValue(forKey: characteristic.uuid) else { return }
        if let error {
            continuation.resume(throwing: error)
            return
        }

        continuation.resume(returning: characteristic.value ?? Data())
    }

    private func finishEndpointDiscoveryIfNeeded() {
        guard let endpointDiscovery, endpointDiscovery.isComplete else { return }

        var map: [BLEProvisioningEndpoint: CBCharacteristic] = [:]
        for endpoint in BLEProvisioningEndpoint.allCases {
            guard let characteristic = endpointDiscovery.characteristic(named: endpoint.rawValue) else {
                endpointDiscovery.continuation.resume(throwing: BLEProvisioningError.endpointNotFound(endpoint.rawValue))
                self.endpointDiscovery = nil
                return
            }
            map[endpoint] = characteristic
        }

        endpointCharacteristics = map
        endpointDiscovery.continuation.resume()
        self.endpointDiscovery = nil
    }
}

private struct EndpointDiscovery {
    struct Entry {
        let characteristic: CBCharacteristic
        var descriptorsDiscovered = false
        var pendingDescriptorReads = 0
        var endpointName: String?
    }

    var entries: [CBUUID: Entry]
    let continuation: CheckedContinuation<Void, Error>

    init(
        characteristics: [CBCharacteristic],
        continuation: CheckedContinuation<Void, Error>
    ) {
        self.entries = Dictionary(
            uniqueKeysWithValues: characteristics.map { ($0.uuid, Entry(characteristic: $0)) }
        )
        self.continuation = continuation
    }

    var isComplete: Bool {
        entries.values.allSatisfy { $0.descriptorsDiscovered && $0.pendingDescriptorReads == 0 }
    }

    mutating func markDescriptorsDiscovered(for characteristic: CBCharacteristic) {
        guard var entry = entries[characteristic.uuid] else { return }
        entry.descriptorsDiscovered = true
        entries[characteristic.uuid] = entry
    }

    mutating func setPendingDescriptorReads(_ count: Int, for characteristic: CBCharacteristic) {
        guard var entry = entries[characteristic.uuid] else { return }
        entry.pendingDescriptorReads = count
        entries[characteristic.uuid] = entry
    }

    mutating func register(name: String, for characteristic: CBCharacteristic) {
        guard var entry = entries[characteristic.uuid] else { return }
        entry.endpointName = name
        entry.pendingDescriptorReads = max(0, entry.pendingDescriptorReads - 1)
        entries[characteristic.uuid] = entry
    }

    func characteristic(named endpointName: String) -> CBCharacteristic? {
        entries.values.first(where: { $0.endpointName == endpointName })?.characteristic
    }
}
