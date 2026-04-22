import SwiftUI

struct SettingsHomeView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List {
            Section("Services") {
                LabeledContent("Hostname", value: settings.services.hostname)
                LabeledContent("Time Zone", value: settings.services.timeZone)
                LabeledContent("MQTT", value: settings.services.enableMqtt ? "Enabled" : "Disabled")
            }

            Section("Network") {
                if settings.networks.isEmpty {
                    Text("No saved network profiles.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(settings.networks) { network in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(network.ssid)
                            Text(network.keepApActive ? "AP remains active" : "AP auto-shutdown after grace period")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Maintenance") {
                Button("Refresh Device State") {
                    Task {
                        await session.refresh()
                    }
                }

                Button("Restart Device") {
                    Task {
                        await session.restartDevice()
                    }
                }

                Button("Log Out", role: .destructive) {
                    session.logout()
                }
            }
        }
        .navigationTitle("Settings")
    }

    private var settings: SettingsResponse {
        session.settings ?? .placeholder
    }
}
