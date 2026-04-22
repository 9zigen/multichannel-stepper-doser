import Foundation

@MainActor
@Observable
final class AppSession {
    let endpointStore: DeviceEndpointStore
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

    init() {
        let endpointStore = DeviceEndpointStore()
        let tokenStore = KeychainTokenStore()
        let apiClient = DeviceAPIClient()
        let realtime = RealtimeConnection()
        self.endpointStore = endpointStore
        self.tokenStore = tokenStore
        self.apiClient = apiClient
        self.realtime = realtime
        self.authToken = tokenStore.loadToken()
        syncAPIClient()
    }

    var hasConfiguredEndpoint: Bool {
        endpointStore.hasEndpoint
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
        guard hasConfiguredEndpoint, isAuthenticated else { return }
        await refresh()
    }

    func configureEndpoint(_ value: String) {
        endpointStore.save(value)
        syncAPIClient()
        hasAttemptedBootstrap = false
    }

    func login(username: String, password: String) async -> Bool {
        syncAPIClient()

        do {
            let token = try await apiClient.login(username: username, password: password)
            authToken = token
            tokenStore.saveToken(token)
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
        settings = nil
        status = nil
        runtime = []
        history = nil
        tokenStore.deleteToken()
        syncAPIClient()
        realtime.disconnect()
    }

    func refresh() async {
        guard hasConfiguredEndpoint, isAuthenticated else { return }
        isBootstrapping = true
        syncAPIClient()

        do {
            async let statusRequest = apiClient.fetchStatus()
            async let settingsRequest = apiClient.fetchSettings()
            async let runtimeRequest = apiClient.fetchPumpRuntime()
            status = try await statusRequest
            settings = try await settingsRequest
            runtime = try await runtimeRequest
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
        guard hasConfiguredEndpoint, isAuthenticated else { return }
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
            networks: nil
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
            networks: nil
        )

        do {
            settings = try await apiClient.saveSettings(payload)
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func runPump(id: Int, seconds: Double) async -> Bool {
        do {
            _ = try await apiClient.runPump(PumpRunRequest(id: id, speed: 100, direction: true, time: seconds))
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
        guard let baseURL = endpointStore.normalizedURL,
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
        case .settingsUpdate(let settings):
            self.settings = settings
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
    }

    private func syncAPIClient() {
        apiClient.baseURL = endpointStore.normalizedURL
        apiClient.authToken = authToken
    }
}
