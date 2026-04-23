import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            StepperPage {
                StepperCard {
                    StepperSectionLabel(text: "Authentication")
                    Text("Sign In")
                        .font(StepperFont.title)
                        .foregroundStyle(StepperColor.foreground)
                    Text("Authenticate against the device API before loading settings and realtime status.")
                        .font(StepperFont.small)
                        .foregroundStyle(StepperColor.mutedForeground)

                    HStack(spacing: StepperSpacing.sm) {
                        StepperBadge(text: "Local Device", tone: .secondary)
                        if let selectedDevice = session.selectedDevice {
                            StepperBadge(text: selectedDevice.displayName, tone: .outline)
                        }
                    }

                    // Credentials form is a separate view so its @State (username /
                    // password) doesn't trigger re-renders of the outer StepperCard
                    // (ultraThinMaterial + shadow radius:16) on every keystroke.
                    LoginCredentialsForm(
                        suggestedLogin: session.suggestedLogin,
                        preferredUsername: session.selectedDevice?.preferredUsername,
                        isSubmitting: isSubmitting,
                        onLogin: { username, password in
                            Task {
                                isSubmitting = true
                                defer { isSubmitting = false }
                                _ = await session.login(username: username, password: password)
                            }
                        }
                    )
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// Owns its own @State for the text fields so keystrokes only re-render this
/// lightweight view — not the parent StepperCard with its expensive material.
private struct LoginCredentialsForm: View {
    let suggestedLogin: AuthCredentials?
    let preferredUsername: String?
    let isSubmitting: Bool
    let onLogin: (String, String) -> Void

    @State private var username = "admin"
    @State private var password = ""

    var body: some View {
        StepperPanel {
            StepperSectionLabel(text: "Credentials")
            VStack(spacing: StepperSpacing.lg) {
                StepperTextField(placeholder: "Username", text: $username)
                    .frame(minHeight: 24)
                    .stepperInputField()

                StepperTextField(placeholder: "Password", text: $password, isSecure: true)
                    .frame(minHeight: 24)
                    .stepperInputField()
            }
        }

        Button(isSubmitting ? "Signing In..." : "Sign In") {
            onLogin(username, password)
        }
        .buttonStyle(StepperPrimaryButtonStyle())
        .disabled(isSubmitting || username.isEmpty || password.isEmpty)
        .onAppear {
            if let suggestedLogin {
                username = suggestedLogin.username
                password = suggestedLogin.password
            } else if let preferredUsername, !preferredUsername.isEmpty {
                username = preferredUsername
            }
        }
    }
}
