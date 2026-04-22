import SwiftUI

struct SettingsHomeView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        StepperPage {
            StepperCard {
                StepperSectionLabel(text: "Configuration")
                Text("Settings")
                    .font(StepperFont.title)
                    .foregroundStyle(StepperColor.foreground)

                StepperPanel {
                    StepperSectionLabel(text: "Active Device")
                    VStack(spacing: StepperSpacing.md) {
                        StepperKeyValueRow("Controller") {
                            Text(session.selectedDevice?.displayName ?? "None")
                        }
                        StepperKeyValueRow("Endpoint") {
                            Text(session.selectedDevice?.endpointLabel ?? "None")
                        }

                        NavigationLink {
                            DeviceManagementView()
                        } label: {
                            Text("Manage Devices")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())
                    }
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
                            Task {
                                await session.refresh()
                            }
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())

                        Button("Restart Device") {
                            Task {
                                await session.restartDevice()
                            }
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())

                        Button("Log Out", role: .destructive) {
                            session.logout()
                        }
                        .buttonStyle(StepperDestructiveButtonStyle())
                    }
                }
            }
        }
        .navigationTitle("Settings")
    }

    private var settings: SettingsResponse {
        session.settings ?? .placeholder
    }
}
