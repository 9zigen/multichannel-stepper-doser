import Foundation

@MainActor
@Observable
final class ManagedDeviceStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let devicesKey = "managed_devices"
    private let selectedDeviceKey = "selected_managed_device"

    var devices: [ManagedDevice]
    var selectedDeviceID: UUID?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let data = defaults.data(forKey: devicesKey),
           let decoded = try? decoder.decode([ManagedDevice].self, from: data) {
            devices = decoded
        } else {
            devices = []
        }

        if let selectedID = defaults.string(forKey: selectedDeviceKey) {
            selectedDeviceID = UUID(uuidString: selectedID)
        } else {
            selectedDeviceID = nil
        }

        normalizeSelection()
    }

    var hasDevices: Bool {
        !devices.isEmpty
    }

    var selectedDevice: ManagedDevice? {
        guard let selectedDeviceID else { return nil }
        return devices.first(where: { $0.id == selectedDeviceID })
    }

    func addDevice(endpoint: String, name: String, preferredUsername: String? = nil, select: Bool = true) -> ManagedDevice {
        let trimmedEndpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)

        if let existingIndex = devices.firstIndex(where: {
            $0.endpoint.caseInsensitiveCompare(trimmedEndpoint) == .orderedSame
        }) {
            devices[existingIndex].endpoint = trimmedEndpoint
            if !trimmedName.isEmpty {
                devices[existingIndex].name = trimmedName
            }
            if let preferredUsername, !preferredUsername.isEmpty {
                devices[existingIndex].preferredUsername = preferredUsername
            }

            let existing = devices[existingIndex]
            if select {
                selectedDeviceID = existing.id
            }
            persist()
            return existing
        }

        let device = ManagedDevice(
            name: trimmedName.isEmpty ? trimmedEndpoint : trimmedName,
            endpoint: trimmedEndpoint,
            preferredUsername: preferredUsername
        )
        devices.append(device)
        devices.sort { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }

        if select {
            selectedDeviceID = device.id
        }

        persist()
        return device
    }

    func updateDevice(_ device: ManagedDevice) {
        guard let index = devices.firstIndex(where: { $0.id == device.id }) else { return }
        // Skip the encode + UserDefaults write if nothing actually changed.
        guard devices[index] != device else { return }
        devices[index] = device
        devices.sort { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        persist()
    }

    func removeDevice(_ device: ManagedDevice) {
        if selectedDeviceID == device.id {
            selectedDeviceID = nil
        }
        devices.removeAll { $0.id == device.id }
        normalizeSelection()
        persist()
    }

    func selectDevice(_ id: UUID?) {
        selectedDeviceID = id
        normalizeSelection()
        persist()
    }

    private func normalizeSelection() {
        if let selectedDeviceID,
           devices.contains(where: { $0.id == selectedDeviceID }) {
            return
        }

        selectedDeviceID = devices.first?.id
    }

    private func persist() {
        normalizeSelection()
        if let data = try? encoder.encode(devices) {
            defaults.set(data, forKey: devicesKey)
        }

        defaults.set(selectedDeviceID?.uuidString, forKey: selectedDeviceKey)
    }
}
