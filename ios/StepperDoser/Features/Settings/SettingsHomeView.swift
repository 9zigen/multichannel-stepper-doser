import SwiftUI

struct SettingsHomeView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {

                StepperPanel {
                    StepperSectionLabel(text: "Active Device")
                    NavigationLink(destination: DeviceManagementView()) {
                        HStack {
                            VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                                Text(session.selectedDevice?.displayName ?? "None")
                                    .font(StepperFont.section)
                                    .foregroundStyle(StepperColor.foreground)
                                Text(session.selectedDevice?.endpointLabel ?? "No endpoint")
                                    .font(StepperFont.monoSmall)
                                    .foregroundStyle(StepperColor.mutedForeground)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(StepperColor.mutedForeground)
                        }
                    }
                    .buttonStyle(.plain)
                }

                StepperPanel {
                    StepperSectionLabel(text: "Services")
                    VStack(spacing: StepperSpacing.md) {
                        StepperKeyValueRow("Hostname") { Text(settings.services.hostname) }
                        StepperKeyValueRow("Time Zone") { Text(settings.services.timeZone) }
                        StepperKeyValueRow("MQTT") { Text(settings.services.enableMqtt ? "Enabled" : "Disabled") }
                    }
                }

                StepperPanel {
                    StepperSectionLabel(text: "Network")
                    if settings.networks.isEmpty {
                        Text("No saved network profiles.")
                            .font(StepperFont.small)
                            .foregroundStyle(StepperColor.mutedForeground)
                    } else {
                        VStack(spacing: StepperSpacing.md) {
                            ForEach(settings.networks) { network in
                                HStack {
                                    VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                                        Text(network.ssid)
                                            .font(StepperFont.section)
                                            .foregroundStyle(StepperColor.foreground)
                                        Text(network.keepApActive ? "AP remains active" : "AP auto-shutdown after grace period")
                                            .font(StepperFont.small)
                                            .foregroundStyle(StepperColor.mutedForeground)
                                    }
                                    Spacer()
                                    StepperBadge(text: network.keepApActive ? "Persistent AP" : "Grace AP", tone: network.keepApActive ? .warning : .secondary)
                                }
                            }
                        }
                    }
                }

                StepperPanel {
                    StepperSectionLabel(text: "Maintenance")
                    VStack(spacing: StepperSpacing.md) {
                        Button("Refresh Device State") {
                            Task { await session.refresh() }
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())

                        Button("Restart Device") {
                            Task { await session.restartDevice() }
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())

                        Button("Log Out", role: .destructive) {
                            session.logout()
                        }
                        .buttonStyle(StepperDestructiveButtonStyle())
                    }
                }

                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("Settings")
    }

    private var settings: SettingsResponse {
        session.settings ?? .placeholder
    }
}
