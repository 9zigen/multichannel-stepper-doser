import SwiftUI

struct DeviceManagementView: View {
    @Environment(AppSession.self) private var session
    @State private var isPresentingAddDevice = false

    var body: some View {
        StepperPage {
            StepperCard {
                StepperSectionLabel(text: "Controllers")
                Text("Device Management")
                    .font(StepperFont.title)
                    .foregroundStyle(StepperColor.foreground)
                Text("Keep multiple dosers onboarded, switch the active controller, and add new hardware when you need it.")
                    .font(StepperFont.small)
                    .foregroundStyle(StepperColor.mutedForeground)

                if session.devices.isEmpty {
                    StepperEmptyState(
                        title: "No Controllers Yet",
                        message: "Use BLE provisioning or add a LAN endpoint to start building your device list.",
                        systemImage: "dot.radiowaves.left.and.right"
                    )
                } else {
                    StepperPanel {
                        StepperSectionLabel(text: "Onboarded Hardware")
                        VStack(spacing: StepperSpacing.md) {
                            ForEach(session.devices) { device in
                                DeviceRow(
                                    device: device,
                                    isSelected: session.selectedDevice?.id == device.id,
                                    onSwitch: {
                                        Task {
                                            await session.switchDevice(to: device.id)
                                        }
                                    }
                                )
                            }
                        }
                    }
                }

                StepperPanel {
                    StepperSectionLabel(text: "Add Hardware")
                    VStack(alignment: .leading, spacing: StepperSpacing.md) {
                        Text("BLE scanning auto-starts only when the app has no configured devices. Once your list exists, adding more hardware becomes an explicit action from here.")
                            .font(StepperFont.small)
                            .foregroundStyle(StepperColor.mutedForeground)

                        Button("Add Another Device") {
                            isPresentingAddDevice = true
                        }
                        .buttonStyle(StepperPrimaryButtonStyle())
                    }
                }
            }
        }
        .navigationTitle("Devices")
        .sheet(isPresented: $isPresentingAddDevice) {
            ConnectionSetupView(automaticBLEScan: false) {
                isPresentingAddDevice = false
            }
        }
    }
}

private struct DeviceRow: View {
    let device: ManagedDevice
    let isSelected: Bool
    let onSwitch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.md) {
            HStack(alignment: .firstTextBaseline, spacing: StepperSpacing.md) {
                VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                    Text(device.displayName)
                        .font(StepperFont.section)
                        .foregroundStyle(StepperColor.foreground)
                    Text(device.endpointLabel)
                        .font(StepperFont.monoSmall)
                        .foregroundStyle(StepperColor.mutedForeground)
                }

                Spacer()

                if isSelected {
                    StepperBadge(text: "Current", tone: .primary)
                }
            }

            if let lastKnownIPAddress = device.lastKnownIPAddress, !lastKnownIPAddress.isEmpty {
                StepperKeyValueRow("Last Known IP") {
                    Text(lastKnownIPAddress)
                        .font(StepperFont.monoSmall)
                }
            }

            if let preferredUsername = device.preferredUsername, !preferredUsername.isEmpty {
                StepperKeyValueRow("User") {
                    Text(preferredUsername)
                }
            }

            if let lastSeenAt = device.lastSeenAt {
                StepperKeyValueRow("Last Seen") {
                    Text(lastSeenAt.formatted(date: .abbreviated, time: .shortened))
                }
            }

            if !isSelected {
                Button("Switch to This Device", action: onSwitch)
                    .buttonStyle(StepperSecondaryButtonStyle())
            }
        }
        .padding(StepperSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.secondary.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(isSelected ? StepperColor.primary.opacity(0.45) : StepperColor.border.opacity(0.45), lineWidth: 1)
                )
        )
    }
}
