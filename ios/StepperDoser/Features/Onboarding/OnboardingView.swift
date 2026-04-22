import SwiftUI

struct OnboardingView: View {
    @Environment(AppSession.self) private var session

    @State private var username = "admin"
    @State private var password = ""
    @State private var isEditingCredentials = false

    private var settings: SettingsResponse {
        session.settings ?? .placeholder
    }

    private var primaryNetwork: WiFiNetworkConfiguration? {
        settings.networks.first
    }

    private var hasNetwork: Bool {
        primaryNetwork != nil
    }

    private var isDefaultCredentials: Bool {
        settings.auth.username == "admin" && settings.auth.password == "12345678"
    }

    var body: some View {
        NavigationStack {
            StepperPage {
                OnboardingHeroCard(
                    isDefaultCredentials: isDefaultCredentials,
                    networkCount: settings.networks.count,
                    hostname: settings.services.hostname
                )

                credentialsSection

                OnboardingControllerSummaryCard(
                    network: primaryNetwork,
                    hostname: settings.services.hostname,
                    timeZone: settings.services.timeZone
                )
            }
            .safeAreaInset(edge: .bottom) {
                onboardingActionBar
            }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                username = settings.auth.username
                password = settings.auth.password
                isEditingCredentials = isDefaultCredentials
            }
        }
    }

    @ViewBuilder
    private var credentialsSection: some View {
        if isEditingCredentials || isDefaultCredentials {
            OnboardingCredentialsEditorCard(
                username: $username,
                password: $password,
                isSaving: session.isSaving,
                isDefaultCredentials: isDefaultCredentials,
                onSave: saveCredentials,
                onSkip: isDefaultCredentials ? nil : { isEditingCredentials = false }
            )
        } else {
            OnboardingCredentialsSummaryCard(
                username: settings.auth.username,
                onEdit: { isEditingCredentials = true }
            )
        }
    }

    private var onboardingActionBar: some View {
        VStack(spacing: StepperSpacing.sm) {
            if !hasNetwork {
                Text("Finish Wi-Fi provisioning first, then come back to complete onboarding.")
                    .font(StepperFont.caption)
                    .foregroundStyle(StepperColor.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(session.isSaving ? "Completing..." : "Complete Onboarding") {
                Task {
                    _ = await session.completeOnboarding()
                }
            }
            .buttonStyle(StepperPrimaryButtonStyle())
            .disabled(session.isSaving || !hasNetwork)
        }
        .padding(.horizontal, StepperSpacing.pagePadding)
        .padding(.top, StepperSpacing.sm)
        .padding(.bottom, StepperSpacing.lg)
        .background(
            LinearGradient(
                colors: [
                    StepperColor.background.opacity(0),
                    StepperColor.background.opacity(0.92),
                    StepperColor.background
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private func saveCredentials() {
        Task {
            let saved = await session.saveCredentials(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            if saved {
                isEditingCredentials = false
            }
        }
    }
}

private struct OnboardingHeroCard: View {
    let isDefaultCredentials: Bool
    let networkCount: Int
    let hostname: String

    var body: some View {
        StepperCard(spacing: StepperSpacing.md) {
            StepperSectionLabel(text: "Initial Setup")
            Text("Onboarding")
                .font(StepperFont.title)
                .foregroundStyle(StepperColor.foreground)
            Text("Lock down the controller, confirm Wi-Fi, then drop into the normal app flow.")
                .font(StepperFont.small)
                .foregroundStyle(StepperColor.mutedForeground)

            HStack(spacing: StepperSpacing.sm) {
                StepperBadge(
                    text: isDefaultCredentials ? "Default Credentials" : "Credentials Ready",
                    tone: isDefaultCredentials ? .warning : .secondary
                )
                StepperBadge(
                    text: networkCount == 0 ? "Network Missing" : "\(networkCount) Network",
                    tone: networkCount == 0 ? .outline : .primary
                )
            }

            OnboardingChecklistStrip(
                items: [
                    .init(title: "Credentials", value: isDefaultCredentials ? "Default" : "Updated"),
                    .init(title: "Network", value: networkCount == 0 ? "Missing" : "Configured"),
                    .init(title: "Hostname", value: hostname)
                ]
            )
        }
    }
}

private struct OnboardingChecklistStrip: View {
    struct Item: Identifiable {
        let id = UUID()
        let title: String
        let value: String
    }

    let items: [Item]

    var body: some View {
        VStack(spacing: StepperSpacing.sm) {
            ForEach(items) { item in
                HStack(spacing: StepperSpacing.md) {
                    Text(item.title)
                        .font(StepperFont.caption)
                        .foregroundStyle(StepperColor.mutedForeground)
                    Spacer(minLength: StepperSpacing.md)
                    Text(item.value)
                        .font(StepperFont.body.weight(.medium))
                        .foregroundStyle(StepperColor.foreground)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(StepperSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.secondary.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(StepperColor.border.opacity(0.35), lineWidth: 1)
                )
        )
    }
}

private struct OnboardingCredentialsEditorCard: View {
    @Binding var username: String
    @Binding var password: String

    let isSaving: Bool
    let isDefaultCredentials: Bool
    let onSave: () -> Void
    let onSkip: (() -> Void)?

    var body: some View {
        StepperPanel {
            StepperSectionLabel(text: "Secure Admin Access")
            Text(isDefaultCredentials
                 ? "Default credentials are still active. Update them before you leave setup."
                 : "You can change admin access here before closing out onboarding.")
                .font(StepperFont.caption)
                .foregroundStyle(StepperColor.mutedForeground)

            VStack(spacing: StepperSpacing.md) {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .stepperInputField()

                SecureField("Password", text: $password)
                    .stepperInputField()
            }

            HStack(spacing: StepperSpacing.md) {
                Button(isSaving ? "Saving..." : "Save Credentials", action: onSave)
                    .buttonStyle(StepperSecondaryButtonStyle())
                    .disabled(isSaving || username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)

                if let onSkip {
                    Button("Done Editing", action: onSkip)
                        .buttonStyle(StepperGhostButtonStyle())
                        .disabled(isSaving)
                }
            }
        }
    }
}

private struct OnboardingCredentialsSummaryCard: View {
    let username: String
    let onEdit: () -> Void

    var body: some View {
        StepperPanel {
            StepperSectionLabel(text: "Admin Access")
            HStack(spacing: StepperSpacing.md) {
                VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                    Text("Credentials already updated")
                        .font(StepperFont.section)
                        .foregroundStyle(StepperColor.foreground)
                    Text(username)
                        .font(StepperFont.caption)
                        .foregroundStyle(StepperColor.mutedForeground)
                }

                Spacer()

                Button("Edit", action: onEdit)
                    .buttonStyle(StepperGhostButtonStyle())
            }
        }
    }
}

private struct OnboardingControllerSummaryCard: View {
    let network: WiFiNetworkConfiguration?
    let hostname: String
    let timeZone: String

    var body: some View {
        StepperPanel {
            StepperSectionLabel(text: "Controller Summary")

            VStack(spacing: StepperSpacing.md) {
                summaryRow(
                    title: "Wi-Fi",
                    value: network?.ssid ?? "Not configured",
                    tone: network == nil ? .warning : .primary
                )
                summaryRow(
                    title: "AP Behavior",
                    value: network?.keepApActive == true ? "Kept active" : "Grace shutdown",
                    tone: .outline
                )
                summaryRow(
                    title: "Hostname",
                    value: hostname,
                    tone: .secondary
                )
                summaryRow(
                    title: "Time Zone",
                    value: timeZone,
                    tone: .outline
                )
            }
        }
    }

    private func summaryRow(title: String, value: String, tone: StepperBadgeTone) -> some View {
        HStack(spacing: StepperSpacing.md) {
            Text(title)
                .font(StepperFont.caption)
                .foregroundStyle(StepperColor.mutedForeground)
            Spacer(minLength: StepperSpacing.md)
            StepperBadge(text: value, tone: tone)
        }
    }
}

private struct StepperGhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(StepperFont.body.weight(.medium))
            .foregroundStyle(StepperColor.foreground)
            .padding(.horizontal, StepperSpacing.md)
            .padding(.vertical, StepperSpacing.md)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(StepperColor.secondary.opacity(configuration.isPressed ? 0.18 : 0.10))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .stroke(StepperColor.border.opacity(0.35), lineWidth: 1)
                    )
            )
    }
}
