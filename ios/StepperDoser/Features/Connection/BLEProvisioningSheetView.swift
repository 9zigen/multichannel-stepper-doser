import SwiftUI

struct BLEProvisioningSheetView: View {
    @Environment(\.dismiss) private var dismiss

    let device: BLEProvisioningDevice
    let provisioning: BLEProvisioningManager
    let onProvisioned: (BLEProvisioningResult) -> Void

    @State private var pop = "12345678"
    @State private var ssid = ""
    @State private var wifiPassword = ""
    @State private var hostname = "stepper-doser"
    @State private var timeZone = TimeZone.current.identifier
    @State private var configureAdmin = false
    @State private var adminUsername = "admin"
    @State private var adminPassword = ""
    @State private var keepApActive = false
    @State private var completeOnboarding = false
    @State private var isLoadingStatus = false
    @State private var isProvisioning = false

    var body: some View {
        NavigationStack {
            ZStack {
                StepperBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: StepperSpacing.xl) {
                        VStack(alignment: .leading, spacing: StepperSpacing.lg) {
                            StepperSectionLabel(text: "BLE Provisioning")
                            Text(device.name)
                                .font(StepperFont.title)
                                .foregroundStyle(StepperColor.foreground)
                            Text("Provision this controller over BLE, then the app will switch to its LAN endpoint for the normal login flow.")
                                .font(StepperFont.small)
                                .foregroundStyle(StepperColor.mutedForeground)

                            HStack(spacing: StepperSpacing.sm) {
                                StepperBadge(text: provisioning.phase.title, tone: phaseTone)
                                StepperBadge(text: "RSSI \(device.rssi)", tone: .outline)
                            }
                        }

                        StepperPanel {
                            StepperSectionLabel(text: "Access")
                            VStack(spacing: StepperSpacing.lg) {
                                nonCredentialSecretField(
                                    title: "Proof of possession",
                                    text: $pop
                                )

                                Text("Use the AP password by default. If the firmware password was changed, enter the matching BLE PoP here.")
                                    .font(StepperFont.caption)
                                    .foregroundStyle(StepperColor.mutedForeground)
                            }
                        }

                        StepperPanel {
                            StepperSectionLabel(text: "Wi-Fi")
                            VStack(spacing: StepperSpacing.lg) {
                                provisioningInputField(
                                    "SSID",
                                    text: $ssid
                                )
                                    .stepperInputField()

                                nonCredentialSecretField(
                                    title: "Wi-Fi password",
                                    text: $wifiPassword
                                )

                                provisioningInputField(
                                    "Hostname",
                                    text: $hostname
                                )
                                    .stepperInputField()

                                provisioningInputField(
                                    "Time zone",
                                    text: $timeZone
                                )
                                    .stepperInputField()

                                Toggle("Keep AP active after provisioning", isOn: $keepApActive)
                                    .tint(StepperColor.primary)
                                    .font(StepperFont.small)
                                    .foregroundStyle(StepperColor.foreground)
                            }
                        }

                        StepperPanel {
                            StepperSectionLabel(text: "Admin")
                            VStack(alignment: .leading, spacing: StepperSpacing.lg) {
                                Toggle("Set admin credentials during provisioning", isOn: $configureAdmin)
                                    .tint(StepperColor.primary)
                                    .font(StepperFont.small)
                                    .foregroundStyle(StepperColor.foreground)

                                if configureAdmin {
                                    provisioningInputField(
                                        "Admin username",
                                        text: $adminUsername
                                    )
                                        .stepperInputField()

                                    provisioningInputField(
                                        "Admin password",
                                        text: $adminPassword,
                                        secure: true
                                    )
                                        .stepperInputField()

                                    Toggle("Mark onboarding complete", isOn: $completeOnboarding)
                                        .tint(StepperColor.primary)
                                        .font(StepperFont.small)
                                        .foregroundStyle(StepperColor.foreground)
                                } else {
                                    Text("Leave this off if you only want to move the controller onto Wi-Fi and finish setup after login.")
                                        .font(StepperFont.caption)
                                        .foregroundStyle(StepperColor.mutedForeground)
                                }
                            }
                        }

                        if let protocolVersion = provisioning.protocolVersion {
                            StepperPanel {
                                StepperSectionLabel(text: "Transport")
                                Text(protocolVersion)
                                    .font(StepperFont.monoSmall)
                                    .foregroundStyle(StepperColor.foreground)
                            }
                        }

                        if let status = provisioning.latestStatus {
                            StepperPanel {
                                StepperSectionLabel(text: "Device Status")
                                VStack(spacing: StepperSpacing.md) {
                                    HStack(spacing: StepperSpacing.sm) {
                                        StepperBadge(text: status.recoveryMode ? "Recovery" : (status.graceMode ? "Grace" : "Normal"), tone: status.recoveryMode ? .warning : .secondary)
                                        StepperBadge(text: status.stationConnected ? "Station Online" : "Station Offline", tone: status.stationConnected ? .primary : .outline)
                                    }

                                    StepperKeyValueRow("Hostname") {
                                        Text(status.hostname)
                                    }
                                    StepperKeyValueRow("AP") {
                                        Text(status.apSSID)
                                    }
                                    StepperKeyValueRow("Station") {
                                        Text(status.stationSSID.isEmpty ? "Not joined yet" : status.stationSSID)
                                    }
                                    StepperKeyValueRow("LAN IP") {
                                        Text(status.stationIPAddress)
                                            .font(StepperFont.monoSmall)
                                    }
                                    StepperKeyValueRow("Time Zone") {
                                        Text(status.timeZone)
                                    }
                                }
                            }
                        }

                        if case let .failed(message) = provisioning.phase {
                            StepperPanel {
                                StepperSectionLabel(text: "Failure")
                                Text(message)
                                    .font(StepperFont.small)
                                    .foregroundStyle(StepperColor.destructive)
                            }
                        }

                        StepperPanel {
                            StepperSectionLabel(text: "Actions")
                            VStack(spacing: StepperSpacing.md) {
                                Button(isLoadingStatus ? "Reading..." : "Read Current Status") {
                                    Task {
                                        await loadStatus()
                                    }
                                }
                                .buttonStyle(StepperSecondaryButtonStyle())
                                .disabled(isBusy || pop.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                                Button(isProvisioning ? "Provisioning..." : "Provision Controller") {
                                    Task {
                                        await runProvisioning()
                                    }
                                }
                                .buttonStyle(StepperPrimaryButtonStyle())
                                .disabled(!canProvision)
                            }
                        }
                    }
                    .padding(.horizontal, StepperSpacing.pagePadding)
                    .padding(.vertical, StepperSpacing.lg)
                    .frame(maxWidth: 900)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Provision Controller")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                provisioning.stopScanning()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        Task {
                            await provisioning.disconnect()
                            dismiss()
                        }
                    }
                    .foregroundStyle(StepperColor.foreground)
                }
            }
        }
    }

    private var isBusy: Bool {
        isLoadingStatus || isProvisioning
    }

    private var canProvision: Bool {
        !isBusy &&
        !pop.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !ssid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !hostname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !timeZone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        (!configureAdmin || (!adminUsername.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !adminPassword.isEmpty))
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

    private func loadStatus() async {
        isLoadingStatus = true
        defer { isLoadingStatus = false }

        do {
            _ = try await provisioning.refreshStatus(for: device, pop: pop.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            provisioning.phase = .failed(error.localizedDescription)
        }
    }

    private func runProvisioning() async {
        isProvisioning = true
        defer { isProvisioning = false }

        do {
            let result = try await provisioning.provision(
                device: device,
                pop: pop.trimmingCharacters(in: .whitespacesAndNewlines),
                payload: payload
            )
            onProvisioned(result)
            dismiss()
        } catch {
            provisioning.phase = .failed(error.localizedDescription)
        }
    }

    private var payload: BLEProvisioningPayload {
        BLEProvisioningPayload(
            network: .init(
                ssid: ssid.trimmingCharacters(in: .whitespacesAndNewlines),
                password: wifiPassword,
                dhcp: true,
                keepApActive: keepApActive,
                ipAddress: nil,
                mask: nil,
                gateway: nil,
                dns: nil
            ),
            services: .init(
                hostname: hostname.trimmingCharacters(in: .whitespacesAndNewlines),
                timeZone: timeZone.trimmingCharacters(in: .whitespacesAndNewlines)
            ),
            auth: configureAdmin ? .init(
                username: adminUsername.trimmingCharacters(in: .whitespacesAndNewlines),
                password: adminPassword
            ) : nil,
            app: configureAdmin && completeOnboarding ? .init(onboardingCompleted: true) : nil
        )
    }

    @ViewBuilder
    private func nonCredentialSecretField(title: String, text: Binding<String>) -> some View {
        provisioningInputField(title, text: text)
            .privacySensitive()
            .stepperInputField()
    }

    @ViewBuilder
    private func provisioningInputField(_ title: String, text: Binding<String>, secure: Bool = false) -> some View {
        ProvisioningUIKitTextField(
            title: title,
            text: text,
            secure: secure
        )
        .frame(minHeight: 24)
    }
}

private struct ProvisioningUIKitTextField: UIViewRepresentable {
    let title: String
    @Binding var text: String
    var secure: Bool = false

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField(frame: .zero)
        textField.delegate = context.coordinator
        textField.borderStyle = .none
        textField.backgroundColor = .clear
        textField.textColor = UIColor(StepperColor.foreground)
        textField.tintColor = UIColor(StepperColor.primary)
        textField.attributedPlaceholder = NSAttributedString(
            string: title,
            attributes: [.foregroundColor: UIColor(StepperColor.mutedForeground)]
        )
        textField.textContentType = .none
        textField.autocorrectionType = .no
        textField.spellCheckingType = .no
        textField.autocapitalizationType = .none
        textField.smartQuotesType = .no
        textField.smartDashesType = .no
        textField.smartInsertDeleteType = .no
        textField.keyboardType = .asciiCapable
        textField.returnKeyType = .done
        textField.enablesReturnKeyAutomatically = false
        textField.isSecureTextEntry = secure
        textField.clearButtonMode = .never
        textField.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return textField
    }

    func updateUIView(_ textField: UITextField, context: Context) {
        if textField.text != text {
            textField.text = text
        }
        if textField.isSecureTextEntry != secure {
            textField.isSecureTextEntry = secure
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        private let text: Binding<String>

        init(text: Binding<String>) {
            self.text = text
        }

        func textFieldDidChangeSelection(_ textField: UITextField) {
            text.wrappedValue = textField.text ?? ""
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            textField.resignFirstResponder()
            return true
        }
    }
}
