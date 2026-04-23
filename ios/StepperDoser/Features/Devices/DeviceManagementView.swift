import SwiftUI

struct DeviceManagementView: View {
    @Environment(AppSession.self) private var session
    @State private var isPresentingAddDevice = false
    @State private var editingDevice: ManagedDevice?
    @State private var deviceToDelete: ManagedDevice?

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {

                // Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                        StepperSectionLabel(text: "Controllers")
                        Text("Devices")
                            .font(StepperFont.title)
                            .foregroundStyle(StepperColor.foreground)
                    }
                    Spacer()
                    Button {
                        isPresentingAddDevice = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(StepperColor.foreground)
                            .padding(StepperSpacing.md)
                            .background(
                                Circle()
                                    .fill(StepperColor.secondary.opacity(0.20))
                                    .overlay(Circle().stroke(StepperColor.border.opacity(0.45), lineWidth: 1))
                            )
                    }
                }
                .padding(StepperLayout.panelPadding)

                if session.devices.isEmpty {
                    StepperPanel {
                        StepperEmptyState(
                            title: "No Controllers Yet",
                            message: "Use BLE provisioning or add a LAN endpoint to start building your device list.",
                            systemImage: "dot.radiowaves.left.and.right"
                        )
                    }
                } else {
                    StepperPanel {
                        StepperSectionLabel(text: "Onboarded Hardware")
                        VStack(spacing: StepperSpacing.md) {
                            ForEach(session.devices) { device in
                                DeviceRow(
                                    device: device,
                                    isSelected: session.selectedDevice?.id == device.id,
                                    onSwitch: {
                                        Task { await session.switchDevice(to: device.id) }
                                    },
                                    onEdit: { editingDevice = device }
                                )
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        deviceToDelete = device
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                }

                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("Devices")
        .sheet(isPresented: $isPresentingAddDevice) {
            ConnectionSetupView(automaticBLEScan: false) {
                isPresentingAddDevice = false
            }
        }
        .sheet(item: $editingDevice) { device in
            EditDeviceSheet(device: device) { updated in
                session.updateDevice(updated)
                editingDevice = nil
            }
        }
        .alert(
            "Remove \(deviceToDelete?.displayName ?? "Device")?",
            isPresented: Binding(
                get: { deviceToDelete != nil },
                set: { if !$0 { deviceToDelete = nil } }
            )
        ) {
            Button("Remove", role: .destructive) {
                if let device = deviceToDelete {
                    session.removeDevice(device)
                }
                deviceToDelete = nil
            }
            Button("Cancel", role: .cancel) {
                deviceToDelete = nil
            }
        } message: {
            if deviceToDelete?.id == session.selectedDevice?.id {
                Text("This is your active controller. Removing it will log you out.")
            } else {
                Text("The controller will be removed from your device list.")
            }
        }
    }
}

private struct DeviceRow: View {
    let device: ManagedDevice
    let isSelected: Bool
    let onSwitch: () -> Void
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.md) {
            HStack(alignment: .firstTextBaseline) {
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

            if let ip = device.lastKnownIPAddress, !ip.isEmpty {
                StepperKeyValueRow("Last Known IP") {
                    Text(ip).font(StepperFont.monoSmall)
                }
            }
            if let username = device.preferredUsername, !username.isEmpty {
                StepperKeyValueRow("User") { Text(username) }
            }
            if let lastSeen = device.lastSeenAt {
                StepperKeyValueRow("Last Seen") {
                    Text(lastSeen.formatted(date: .abbreviated, time: .shortened))
                }
            }

            HStack(spacing: StepperSpacing.sm) {
                if !isSelected {
                    Button("Switch", action: onSwitch)
                        .buttonStyle(StepperSecondaryButtonStyle())
                }
                Button(action: onEdit) {
                    HStack(spacing: StepperSpacing.xs) {
                        Image(systemName: "pencil")
                            .font(.system(size: 13, weight: .medium))
                        Text("Edit")
                            .font(StepperFont.small.weight(.medium))
                    }
                    .foregroundStyle(StepperColor.foreground)
                    .frame(maxWidth: isSelected ? .infinity : nil)
                    .padding(.horizontal, StepperSpacing.lg)
                    .padding(.vertical, StepperSpacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .fill(StepperColor.secondary.opacity(0.14))
                            .overlay(
                                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                                    .stroke(StepperColor.border.opacity(0.55), lineWidth: 1)
                            )
                    )
                }
                .buttonStyle(.plain)
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

/// Sheet for editing a device's display name and endpoint.
private struct EditDeviceSheet: View {
    let device: ManagedDevice
    let onSave: (ManagedDevice) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var endpoint: String

    init(device: ManagedDevice, onSave: @escaping (ManagedDevice) -> Void) {
        self.device = device
        self.onSave = onSave
        _name = State(initialValue: device.name)
        _endpoint = State(initialValue: device.endpoint)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                StepperBackground()
                ScrollView {
                    VStack(spacing: StepperSpacing.xl) {
                        StepperPanel {
                            StepperSectionLabel(text: "Identity")
                            VStack(spacing: StepperSpacing.lg) {
                                StepperTextField(placeholder: "Device name", text: $name)
                                    .frame(minHeight: 24)
                                    .stepperInputField()
                                StepperTextField(placeholder: "Endpoint (hostname or IP)", text: $endpoint)
                                    .frame(minHeight: 24)
                                    .stepperInputField()
                            }
                        }

                        Button("Save Changes") {
                            var updated = device
                            updated.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                            updated.endpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
                            onSave(updated)
                        }
                        .buttonStyle(StepperPrimaryButtonStyle())
                        .disabled(
                            name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                            endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                    .padding(.horizontal, StepperSpacing.pagePadding)
                    .padding(.vertical, StepperSpacing.lg)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Edit Device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(StepperColor.foreground)
                }
            }
        }
    }
}
