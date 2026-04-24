import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var isSubmitting = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                StepperBackground()

                ScrollView {
                    VStack(spacing: StepperSpacing.xxl) {
                        // Device identity block
                        VStack(spacing: StepperSpacing.lg) {
                            ZStack {
                                Circle()
                                    .fill(StepperColor.secondary.opacity(0.25))
                                    .frame(width: 68, height: 68)
                                    .overlay(
                                        Circle()
                                            .stroke(StepperColor.primary.opacity(0.30), lineWidth: 1)
                                    )
                                Image(systemName: "server.rack")
                                    .font(.system(size: 24, weight: .medium))
                                    .foregroundStyle(StepperColor.primary)
                            }

                            VStack(spacing: StepperSpacing.xs) {
                                Text(session.selectedDevice?.displayName ?? "Controller")
                                    .font(StepperFont.title)
                                    .foregroundStyle(StepperColor.foreground)
                                    .multilineTextAlignment(.center)
                                Text(session.selectedDevice?.endpointLabel ?? "")
                                    .font(StepperFont.monoSmall)
                                    .foregroundStyle(StepperColor.mutedForeground)
                            }
                        }

                        // Credentials form — separate child view so its @State doesn't
                        // re-render the background gradient on every keystroke.
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
                    .padding(.horizontal, StepperSpacing.pagePadding)
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                    // Ensure the VStack fills the screen height so the ZStack centers it
                    .frame(minHeight: geo.size.height)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .ignoresSafeArea()
    }
}

/// Owns its own @State for the text fields so keystrokes only re-render this
/// lightweight view — not the parent that owns the gradient background.
private struct LoginCredentialsForm: View {
    let suggestedLogin: AuthCredentials?
    let preferredUsername: String?
    let isSubmitting: Bool
    let onLogin: (String, String) -> Void

    @State private var username = "admin"
    @State private var password = ""

    var body: some View {
        VStack(spacing: StepperSpacing.lg) {
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

            Button(isSubmitting ? "Signing In…" : "Sign In") {
                onLogin(username, password)
            }
            .buttonStyle(StepperPrimaryButtonStyle())
            .disabled(isSubmitting || username.isEmpty || password.isEmpty)
        }
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
