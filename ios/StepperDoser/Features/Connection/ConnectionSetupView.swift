import SwiftUI

struct ConnectionSetupView: View {
    @Environment(AppSession.self) private var session
    private let automaticBLEScan: Bool
    private let onComplete: (() -> Void)?

    @State private var deviceName = ""
    @State private var endpoint = ""
    @State private var provisioning = BLEProvisioningManager()
    @State private var selectedDevice: BLEProvisioningDevice?
    @State private var hasAutoStartedScan = false

    init(automaticBLEScan: Bool = false, onComplete: (() -> Void)? = nil) {
        self.automaticBLEScan = automaticBLEScan
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            StepperPage {
                StepperCard {
                    StepperSectionLabel(text: "Controller")
                    Text("Connect Device")
                        .font(StepperFont.title)
                        .foregroundStyle(StepperColor.foreground)
                    Text("Use a known LAN endpoint or provision brand-new hardware over BLE, then let the app switch to the controller’s reported Wi-Fi IP.")
                        .font(StepperFont.small)
                        .foregroundStyle(StepperColor.mutedForeground)

                    StepperPanel {
                        StepperSectionLabel(text: "LAN Endpoint")
                        VStack(spacing: StepperSpacing.lg) {
                            TextField("Device name", text: $deviceName)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                                .stepperInputField()

                            TextField("stepper-doser.local or 192.168.1.50", text: $endpoint)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .stepperInputField()

                            Button("Save Endpoint") {
                                session.addManualDevice(endpoint: endpoint, name: deviceName)
                                onComplete?()
                            }
                            .buttonStyle(StepperPrimaryButtonStyle())
                            .disabled(endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "BLE Provisioning")
                        VStack(alignment: .leading, spacing: StepperSpacing.lg) {
                            HStack(spacing: StepperSpacing.sm) {
                                StepperBadge(text: provisioning.phase.title, tone: phaseTone)
                                if provisioning.isScanning && provisioning.phase.title != "Scanning" {
                                    StepperBadge(text: "Scanning", tone: .secondary)
                                }
                            }

                            Text(provisioning.phase.detail)
                                .font(StepperFont.small)
                                .foregroundStyle(StepperColor.mutedForeground)

                            HStack(spacing: StepperSpacing.md) {
                                Button(provisioning.isScanning ? "Stop Scan" : "Scan for Controllers") {
                                    if provisioning.isScanning {
                                        provisioning.stopScanning()
                                    } else {
                                        provisioning.startScanning()
                                    }
                                }
                                .buttonStyle(StepperSecondaryButtonStyle())

                                if !provisioning.devices.isEmpty {
                                    Text("\(provisioning.devices.count) found")
                                        .font(StepperFont.caption)
                                        .foregroundStyle(StepperColor.mutedForeground)
                                }
                            }

                            if provisioning.devices.isEmpty {
                                StepperEmptyState(
                                    title: "No BLE Controllers Yet",
                                    message: "Boot the device into recovery, fallback, or AP grace mode, then scan again.",
                                    systemImage: "dot.radiowaves.left.and.right"
                                )
                            } else {
                                VStack(spacing: StepperSpacing.md) {
                                    ForEach(provisioning.devices) { device in
                                        Button {
                                            selectedDevice = device
                                        } label: {
                                            HStack(spacing: StepperSpacing.md) {
                                                VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                                                    Text(device.name)
                                                        .font(StepperFont.section)
                                                        .foregroundStyle(StepperColor.foreground)
                                                    Text(device.identifier.uuidString)
                                                        .font(StepperFont.monoSmall)
                                                        .foregroundStyle(StepperColor.mutedForeground)
                                                }

                                                Spacer()

                                                StepperBadge(text: "RSSI \(device.rssi)", tone: .outline)
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(StepperSpacing.lg)
                                            .background(
                                                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                                                    .fill(StepperColor.secondary.opacity(0.14))
                                                    .overlay(
                                                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                                                            .stroke(StepperColor.border.opacity(0.45), lineWidth: 1)
                                                    )
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if deviceName.isEmpty {
                    deviceName = "Stepper Doser"
                }

                if automaticBLEScan && session.devices.isEmpty && !hasAutoStartedScan {
                    hasAutoStartedScan = true
                    provisioning.startScanning()
                }
            }
            .sheet(item: $selectedDevice) { device in
                BLEProvisioningSheetView(device: device, provisioning: provisioning) { result in
                    session.beginProvisionedConnection(
                        status: result.status,
                        username: result.username,
                        password: result.password
                    )
                    onComplete?()
                }
            }
        }
    }

    private var phaseTone: StepperBadgeTone {
        switch provisioning.phase {
        case .completed:
            return .primary
        case .failed:
            return .destructive
        case .waitingForBluetooth:
            return .warning
        default:
            return .secondary
        }
    }
}
