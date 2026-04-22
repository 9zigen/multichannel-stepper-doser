import SwiftUI

struct AppRootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        Group {
            if !session.hasConfiguredEndpoint {
                ConnectionSetupView()
            } else if !session.isAuthenticated {
                LoginView()
            } else if session.isBootstrapping && !session.hasLoadedSettings {
                ProgressView("Connecting to controller...")
                    .controlSize(.large)
            } else if session.requiresOnboarding {
                OnboardingView()
            } else {
                AppShellView()
            }
        }
        .task {
            await session.bootstrapIfNeeded()
        }
        .alert("Error", isPresented: errorIsPresented) {
            Button("OK", role: .cancel) {
                session.errorMessage = nil
            }
        } message: {
            Text(session.errorMessage ?? "")
        }
    }

    private var errorIsPresented: Binding<Bool> {
        Binding(
            get: { session.errorMessage != nil },
            set: { newValue in
                if !newValue {
                    session.errorMessage = nil
                }
            }
        )
    }
}
