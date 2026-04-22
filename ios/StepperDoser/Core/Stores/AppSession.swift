import Foundation

@MainActor
@Observable
final class AppSession {
    let deviceStore: ManagedDeviceStore
    let tokenStore: KeychainTokenStore
    let apiClient: DeviceAPIClient
    let realtime: RealtimeConnection

    var selectedTab: AppTab = .dashboard
    var authToken: String?
    var settings: SettingsResponse?
    var status: StatusSnapshot?
    var runtime: [PumpRuntimeEntry] = []
    var history: PumpHistoryResponse?
    var isBootstrapping = false
    var hasAttemptedBootstrap = false
    var isSaving = false
    var errorMessage: String?
    var suggestedLogin: AuthCredentials?

    init() {
        let deviceStore = ManagedDeviceStore()
        let tokenStore = KeychainTokenStore()
        let apiClient = DeviceAPIClient()
        let realtime = RealtimeConnection()
        self.deviceStore = deviceStore
        self.tokenStore = tokenStore
        self.apiClient = apiClient
        self.realtime = realtime
        self.authToken = tokenStore.loadToken(for: deviceStore.selectedDevice)
        syncAPIClient()
    }

    var devices: [ManagedDevice] {
        deviceStore.devices
    }

    var selectedDevice: ManagedDevice? {
        deviceStore.selectedDevice
    }

    var hasConfiguredDevices: Bool {
        deviceStore.hasDevices
    }

    var hasSelectedDeviceEndpoint: Bool {
        selectedDevice?.normalizedURL != nil
    }

    var isAuthenticated: Bool {
        guard let authToken else { return false }
        return !authToken.isEmpty
    }

    var hasLoadedSettings: Bool {
        settings != nil
    }

    var requiresOnboarding: Bool {
        guard let settings else { return false }
        return !settings.app.onboardingCompleted
    }

    func bootstrapIfNeeded() async {
        guard !hasAttemptedBootstrap else { return }
        hasAttemptedBootstrap = true
        guard hasSelectedDeviceEndpoint, isAuthenticated else { return }
        await refresh()
    }

    func addManualDevice(endpoint: String, name: String) {
        let trimmedEndpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard DeviceEndpointStore.normalize(trimmedEndpoint) != nil else {
            errorMessage = "Enter a valid controller hostname or IP address."
            return
        }

        let resolvedName = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? trimmedEndpoint : name
        let device = deviceStore.addDevice(endpoint: trimmedEndpoint, name: resolvedName, select: true)
        activate(device: device)
        errorMessage = nil
    }

    func beginProvisionedConnection(
        status: BLEProvisioningStatus,
        username: String?,
        password: String?
    ) {
        let lanIP = status.stationIPAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !lanIP.isEmpty else {
            errorMessage = "Provisioning succeeded, but the controller did not report a LAN IP yet."
            return
        }

        authToken = nil
        clearActiveState()

        if let username,
           let password,
           !username.isEmpty,
           !password.isEmpty {
            suggestedLogin = AuthCredentials(username: username, password: password)
        }

        let resolvedName = status.hostname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? lanIP : status.hostname
        let device = deviceStore.addDevice(
            endpoint: lanIP,
            name: resolvedName,
            preferredUsername: username,
            select: true
        )
        activate(device: device)
        errorMessage = nil
    }

    func switchDevice(to id: UUID) async {
        guard let device = devices.first(where: { $0.id == id }) else { return }
        deviceStore.selectDevice(device.id)
        activate(device: device)

        if isAuthenticated {
            await refresh()
        }
    }

    func login(username: String, password: String) async -> Bool {
        syncAPIClient()
        guard let selectedDevice else {
            errorMessage = APIError.missingEndpoint.localizedDescription
            return false
        }

        do {
            let token = try await apiClient.login(username: username, password: password)
            authToken = token
            tokenStore.saveToken(token, for: selectedDevice)
            updateSelectedDevice { device in
                device.preferredUsername = username
            }
            syncAPIClient()
            await refresh()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func logout() {
        authToken = nil
        clearActiveState()
        tokenStore.deleteToken(for: selectedDevice)
        suggestedLogin = nil
        syncAPIClient()
    }

    func refresh() async {
        guard hasSelectedDeviceEndpoint, isAuthenticated else { return }
        isBootstrapping = true
        syncAPIClient()

        do {
            status = try await apiClient.fetchStatus()
            settings = try await apiClient.fetchSettings()
            runtime = try await apiClient.fetchPumpRuntime()
            syncSelectedDeviceMetadata()
            errorMessage = nil
            await refreshRealtimeIfNeeded()
        } catch APIError.unauthorized {
            logout()
            errorMessage = APIError.unauthorized.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isBootstrapping = false
    }

    func refreshHistory() async {
        guard hasSelectedDeviceEndpoint, isAuthenticated else { return }
        syncAPIClient()

        do {
            history = try await apiClient.fetchPumpHistory()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveCredentials(username: String, password: String) async -> Bool {
        guard let settings else { return false }
        isSaving = true
        defer { isSaving = false }

        let payload = SettingsUpdatePayload(
            auth: AuthCredentials(username: username, password: password),
            app: nil,
            services: nil,
            networks: nil,
            pumps: nil
        )

        do {
            self.settings = try await apiClient.saveSettings(payload)
            status = status ?? .placeholder
            self.settings?.services.timeZone = settings.services.timeZone
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func completeOnboarding() async -> Bool {
        isSaving = true
        defer { isSaving = false }

        let payload = SettingsUpdatePayload(
            auth: nil,
            app: AppConfiguration(onboardingCompleted: true),
            services: nil,
            networks: nil,
            pumps: nil
        )

        do {
            settings = try await apiClient.saveSettings(payload)
            syncSelectedDeviceMetadata()
            errorMessage = nil
            return true
        } catch APIError.server(let message) where message == "Failed to decode controller response." {
            do {
                let refreshedSettings = try await apiClient.fetchSettings()
                settings = refreshedSettings
                syncSelectedDeviceMetadata()
                if refreshedSettings.app.onboardingCompleted {
                    errorMessage = nil
                    return true
                }
                errorMessage = message
                return false
            } catch {
                errorMessage = error.localizedDescription
                return false
            }
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func savePumpConfiguration(_ updatedPump: PumpConfiguration) async -> Bool {
        guard var settings else { return false }
        guard let index = settings.pumps.firstIndex(where: { $0.id == updatedPump.id }) else { return false }

        isSaving = true
        defer { isSaving = false }

        settings.pumps[index] = updatedPump

        let payload = SettingsUpdatePayload(
            auth: nil,
            app: nil,
            services: nil,
            networks: nil,
            pumps: settings.pumps
        )

        do {
            let saved = try await apiClient.saveSettings(payload)
            self.settings = saved
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func runPump(id: Int, seconds: Double, speed: Double = 100, direction: Bool = true) async -> Bool {
        do {
            _ = try await apiClient.runPump(PumpRunRequest(id: id, speed: speed, direction: direction, time: seconds))
            await refresh()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func restartDevice() async {
        do {
            _ = try await apiClient.restartDevice()
            realtime.systemState = .restarting
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshRealtimeIfNeeded() async {
        guard let baseURL = selectedDevice?.normalizedURL,
              let authToken,
              !authToken.isEmpty else {
            realtime.disconnect()
            return
        }

        realtime.connect(baseURL: baseURL, token: authToken) { [weak self] event in
            guard let self else { return }
            self.handleRealtimeEvent(event)
        }
    }

    private func handleRealtimeEvent(_ event: RealtimeEvent) {
        switch event {
        case .welcome:
            Task {
                await refresh()
            }
        case .statusPatch(let patch):
            apply(statusPatch: patch)
        case .pumpRuntime(let entry):
            apply(pumpRuntime: entry)
        case .settingsUpdate(let settings):
            self.settings = settings
            syncSelectedDeviceMetadata()
        case .systemReady:
            Task {
                await refresh()
            }
        case .shuttingDown, .pong, .ignored:
            break
        }
    }

    private func apply(statusPatch patch: RealtimeStatusPatch) {
        guard var current = status else {
            return
        }

        current.upTime = patch.upTime ?? current.upTime
        current.localTime = patch.localTime ?? current.localTime
        current.localDate = patch.localDate ?? current.localDate
        current.timeValid = patch.timeValid ?? current.timeValid
        current.timeWarning = patch.timeWarning ?? current.timeWarning
        current.freeHeap = patch.freeHeap ?? current.freeHeap
        current.vcc = patch.vcc ?? current.vcc
        current.boardTemperature = patch.boardTemperature ?? current.boardTemperature
        current.wifiMode = patch.wifiMode ?? current.wifiMode
        current.ipAddress = patch.ipAddress ?? current.ipAddress
        current.stationConnected = patch.stationConnected ?? current.stationConnected
        current.stationSsid = patch.stationSsid ?? current.stationSsid
        current.stationIpAddress = patch.stationIpAddress ?? current.stationIpAddress
        current.apSsid = patch.apSsid ?? current.apSsid
        current.apIpAddress = patch.apIpAddress ?? current.apIpAddress
        current.apClients = patch.apClients ?? current.apClients
        status = current
        syncSelectedDeviceMetadata()
    }

    private func apply(pumpRuntime entry: PumpRuntimeEntry) {
        if let index = runtime.firstIndex(where: { $0.id == entry.id }) {
            runtime[index] = entry
        } else {
            runtime.append(entry)
            runtime.sort { $0.id < $1.id }
        }
    }

    private func activate(device: ManagedDevice) {
        authToken = tokenStore.loadToken(for: device)
        clearActiveState()
        syncAPIClient()
        hasAttemptedBootstrap = false
    }

    private func clearActiveState() {
        settings = nil
        status = nil
        runtime = []
        history = nil
        realtime.disconnect()
    }

    private func updateSelectedDevice(_ mutate: (inout ManagedDevice) -> Void) {
        guard var device = selectedDevice else { return }
        mutate(&device)
        deviceStore.updateDevice(device)
    }

    private func syncSelectedDeviceMetadata() {
        guard selectedDevice != nil else { return }

        updateSelectedDevice { device in
            if let settings, !settings.services.hostname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                device.name = settings.services.hostname
                device.preferredUsername = settings.auth.username
            }

            let lanIP = status?.stationIpAddress.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let fallbackIP = status?.ipAddress.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let resolvedIP = !lanIP.isEmpty && lanIP != "0.0.0.0" ? lanIP : fallbackIP
            if !resolvedIP.isEmpty && resolvedIP != "0.0.0.0" {
                device.lastKnownIPAddress = resolvedIP
            }

            device.lastSeenAt = .now
        }
    }

    private func syncAPIClient() {
        apiClient.baseURL = selectedDevice?.normalizedURL
        apiClient.authToken = authToken
    }
}
