import SwiftUI

struct OnboardingView: View {
    @Environment(AppSession.self) private var session
    @State private var username = "admin"
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Progress") {
                    LabeledContent("Credentials") {
                        Text(isDefaultCredentials ? "Default" : "Updated")
                    }
                    LabeledContent("Network") {
                        Text(hasNetwork ? "\(settings.networks.count) configured" : "Missing")
                    }
                    LabeledContent("Hostname") {
                        Text(settings.services.hostname)
                    }
                }

                Section("Step 1: Secure Admin Access") {
                    TextField("Username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)

                    Button(session.isSaving ? "Saving..." : "Save Credentials") {
                        Task {
                            _ = await session.saveCredentials(username: username, password: password)
                        }
                    }
                    .disabled(session.isSaving || username.isEmpty || password.isEmpty)
                }

                Section("Step 2: Network") {
                    if hasNetwork, let network = settings.networks.first {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(network.ssid)
                                .font(.headline)
                            Text(network.keepApActive ? "AP kept active" : "AP grace shutdown enabled")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("Provision the device over BLE or AP first, then return here to finish onboarding.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(session.isSaving ? "Completing..." : "Complete Onboarding") {
                        Task {
                            _ = await session.completeOnboarding()
                        }
                    }
                    .disabled(session.isSaving || !hasNetwork)
                }
            }
            .navigationTitle("Initial Setup")
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
