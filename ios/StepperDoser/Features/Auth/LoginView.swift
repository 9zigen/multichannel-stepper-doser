import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var username = "admin"
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Controller") {
                    LabeledContent("Endpoint") {
                        Text(session.endpointStore.normalizedURL?.host() ?? session.endpointStore.rawValue)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Credentials") {
                    TextField("Username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                }

                Section {
                    Button(isSubmitting ? "Signing In..." : "Sign In") {
                        Task {
                            isSubmitting = true
                            defer { isSubmitting = false }
                            _ = await session.login(username: username, password: password)
                        }
                    }
                    .disabled(isSubmitting || username.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("Sign In")
        }
    }
}
