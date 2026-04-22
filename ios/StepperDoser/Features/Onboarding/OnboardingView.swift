import SwiftUI

struct OnboardingView: View {
    @Environment(AppSession.self) private var session
    @State private var username = "admin"
    @State private var password = ""

    var body: some View {
        NavigationStack {
            StepperPage {
                StepperCard {
                    StepperSectionLabel(text: "Initial Setup")
                    Text("Onboarding")
                        .font(StepperFont.title)
                        .foregroundStyle(StepperColor.foreground)
                    Text("Finish the first-run checklist, then the controller drops back into the normal app flow.")
                        .font(StepperFont.small)
                        .foregroundStyle(StepperColor.mutedForeground)

                    HStack(spacing: StepperSpacing.sm) {
                        StepperBadge(text: isDefaultCredentials ? "Default Credentials" : "Credentials Updated", tone: isDefaultCredentials ? .warning : .secondary)
                        StepperBadge(text: hasNetwork ? "\(settings.networks.count) network" : "Network missing", tone: hasNetwork ? .primary : .outline)
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Progress")
                        VStack(spacing: StepperSpacing.md) {
                            StepperKeyValueRow("Credentials") {
                                Text(isDefaultCredentials ? "Default" : "Updated")
                            }
                            StepperKeyValueRow("Network") {
                                Text(hasNetwork ? "\(settings.networks.count) configured" : "Missing")
                            }
                            StepperKeyValueRow("Hostname") {
                                Text(settings.services.hostname)
                            }
                        }
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Step 1: Secure Admin Access")
                        VStack(spacing: StepperSpacing.lg) {
                            TextField("Username", text: $username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .stepperInputField()

                            SecureField("Password", text: $password)
                                .stepperInputField()

                            Button(session.isSaving ? "Saving..." : "Save Credentials") {
                                Task {
                                    _ = await session.saveCredentials(username: username, password: password)
                                }
                            }
                            .buttonStyle(StepperSecondaryButtonStyle())
                            .disabled(session.isSaving || username.isEmpty || password.isEmpty)
                        }
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Step 2: Network")
                        if hasNetwork, let network = settings.networks.first {
                            VStack(alignment: .leading, spacing: StepperSpacing.md) {
                                Text(network.ssid)
                                    .font(StepperFont.section)
                                    .foregroundStyle(StepperColor.foreground)
                                Text(network.keepApActive ? "AP kept active" : "AP grace shutdown enabled")
                                    .font(StepperFont.small)
                                    .foregroundStyle(StepperColor.mutedForeground)
                            }
                        } else {
                            VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                                Text("Provision the device over BLE or AP first, then return here to finish onboarding.")
                                    .font(StepperFont.small)
                                    .foregroundStyle(StepperColor.mutedForeground)
                                Text("The native app’s BLE setup flow writes Wi-Fi, hostname, time zone, and optional admin credentials before handing off to the normal API login.")
                                    .font(StepperFont.caption)
                                    .foregroundStyle(StepperColor.mutedForeground.opacity(0.9))
                            }
                        }
                    }

                    Button(session.isSaving ? "Completing..." : "Complete Onboarding") {
                        Task {
                            _ = await session.completeOnboarding()
                        }
                    }
                    .buttonStyle(StepperPrimaryButtonStyle())
                    .disabled(session.isSaving || !hasNetwork)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                username = settings.auth.username
                password = settings.auth.password
            }
        }
    }

    private var settings: SettingsResponse {
        session.settings ?? .placeholder
    }

    private var hasNetwork: Bool {
        !settings.networks.isEmpty
    }

    private var isDefaultCredentials: Bool {
        settings.auth.username == "admin" && settings.auth.password == "12345678"
    }
}
