import SwiftUI

struct SettingsHomeView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {

                StepperPanel {
                    StepperSectionLabel(text: "Appearance")
                    HStack(spacing: StepperSpacing.sm) {
                        ForEach(AppTheme.allCases, id: \.self) { theme in
                            AppearanceChip(theme: theme, isSelected: session.theme == theme) {
                                StepperHaptic.selection()
                                session.theme = theme
                            }
                        }
                    }
                }

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
                        StepperKeyValueRow("Hostname") {
                            Text(settings.services.hostname)
                        }
                        StepperKeyValueRow("Time Zone") {
                            Text(settings.services.timeZone)
                        }
                        if settings.services.enableMqtt {
                            let mqttConnected = session.status?.mqttService.connected == true
                            StepperKeyValueRow("MQTT") {
                                StepperBadge(
                                    text: mqttConnected ? "Connected" : "Disconnected",
                                    tone: mqttConnected ? .primary : .warning
                                )
                            }
                        } else {
                            StepperKeyValueRow("MQTT") {
                                Text("Disabled").foregroundStyle(StepperColor.mutedForeground)
                            }
                        }
                        if settings.services.enableNtp {
                            let ntpSynced = session.status?.ntpService.sync == true
                            StepperKeyValueRow("NTP") {
                                StepperBadge(
                                    text: ntpSynced ? "Synced" : "Pending",
                                    tone: ntpSynced ? .primary : .outline
                                )
                            }
                        } else {
                            StepperKeyValueRow("NTP") {
                                Text("Disabled").foregroundStyle(StepperColor.mutedForeground)
                            }
                        }
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

                if let status = session.status {
                    StepperPanel {
                        StepperSectionLabel(text: "System")
                        VStack(spacing: StepperSpacing.md) {
                            if !status.firmwareVersion.isEmpty {
                                StepperKeyValueRow("Firmware") {
                                    Text(status.firmwareVersion)
                                        .font(StepperFont.monoSmall)
                                }
                            }
                            if !status.hardwareVersion.isEmpty {
                                StepperKeyValueRow("Hardware") {
                                    Text(status.hardwareVersion)
                                        .font(StepperFont.monoSmall)
                                }
                            }
                            if !status.upTime.isEmpty {
                                StepperKeyValueRow("Uptime") {
                                    Text(status.upTime)
                                }
                            }
                            StepperKeyValueRow("Reboots") {
                                Text("\(status.rebootCount)")
                            }
                            if !status.lastRebootReason.isEmpty {
                                StepperKeyValueRow("Last Reboot") {
                                    Text(status.lastRebootReason)
                                        .font(StepperFont.monoSmall)
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

// MARK: — Appearance chip

private struct AppearanceChip: View {
    let theme: AppTheme
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: StepperSpacing.sm) {
                // Icon preview circle
                ZStack {
                    Circle()
                        .fill(isSelected ? StepperColor.primary : StepperColor.secondary.opacity(0.30))
                        .frame(width: 38, height: 38)
                    Image(systemName: theme.systemImage)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(isSelected ? StepperColor.primaryForeground : StepperColor.mutedForeground)
                }

                Text(theme.label)
                    .font(StepperFont.micro)
                    .kerning(0.3)
                    .foregroundStyle(isSelected ? StepperColor.primary : StepperColor.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, StepperSpacing.md)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(isSelected
                          ? StepperColor.primary.opacity(0.08)
                          : StepperColor.secondary.opacity(0.10))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .stroke(
                                isSelected ? StepperColor.primary.opacity(0.35) : StepperColor.border,
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: — AppTheme icon

extension AppTheme {
    var systemImage: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }
}
