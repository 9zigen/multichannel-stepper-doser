import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var username = "admin"
    @State private var password = ""
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
                        StepperBadge(text: session.endpointStore.normalizedURL?.host() ?? session.endpointStore.rawValue, tone: .outline)
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Credentials")
                        VStack(spacing: StepperSpacing.lg) {
                            TextField("Username", text: $username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .stepperInputField()

                            SecureField("Password", text: $password)
                                .stepperInputField()
                        }
                    }

                    Button(isSubmitting ? "Signing In..." : "Sign In") {
                        Task {
                            isSubmitting = true
                            defer { isSubmitting = false }
                            _ = await session.login(username: username, password: password)
                        }
                    }
                    .buttonStyle(StepperPrimaryButtonStyle())
                    .disabled(isSubmitting || username.isEmpty || password.isEmpty)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let suggestedLogin = session.suggestedLogin {
                    username = suggestedLogin.username
                    password = suggestedLogin.password
                }
            }
        }
    }
}
