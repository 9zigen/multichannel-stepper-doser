import SwiftUI

struct AppRootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        Group {
            if !session.hasConfiguredDevices {
                ConnectionSetupView(automaticBLEScan: true)
            } else if !session.hasSelectedDeviceEndpoint {
                NavigationStack {
                    DeviceManagementView()
                }
            } else if !session.isAuthenticated {
                LoginView()
            } else if session.isBootstrapping && !session.hasLoadedSettings {
                ConnectingView(device: session.selectedDevice)
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

// MARK: — Connecting splash

private struct ConnectingView: View {
    let device: ManagedDevice?

    @State private var pulsing = false

    private var hasDetails: Bool {
        guard let d = device else { return false }
        let hasIP = (d.lastKnownIPAddress ?? "").isEmpty == false
        let hasUser = (d.preferredUsername ?? "").isEmpty == false
        return hasIP || hasUser
    }

    var body: some View {
        ZStack {
            StepperBackground()

            VStack(spacing: StepperSpacing.xxl) {

                // Pulsing radio icon
                ZStack {
                    Circle()
                        .fill(StepperColor.primary.opacity(0.07))
                        .frame(width: 96, height: 96)
                        .scaleEffect(pulsing ? 1.18 : 1.0)
                        .opacity(pulsing ? 1.0 : 0.4)

                    Circle()
                        .fill(StepperColor.secondary.opacity(0.28))
                        .frame(width: 68, height: 68)
                        .overlay(
                            Circle()
                                .stroke(StepperColor.primary.opacity(0.35), lineWidth: 1)
                        )

                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 27, weight: .medium))
                        .foregroundStyle(StepperColor.primary)
                }
                .animation(
                    .easeInOut(duration: 1.1).repeatForever(autoreverses: true),
                    value: pulsing
                )

                // Device name + status
                VStack(spacing: StepperSpacing.sm) {
                    Text(device?.displayName ?? "Controller")
                        .font(StepperFont.title)
                        .foregroundStyle(StepperColor.foreground)
                        .multilineTextAlignment(.center)

                    HStack(spacing: StepperSpacing.sm) {
                        ProgressView()
                            .tint(StepperColor.mutedForeground)
                            .controlSize(.mini)
                        Text("Connecting…")
                            .font(StepperFont.small)
                            .foregroundStyle(StepperColor.mutedForeground)
                    }
                }

                // Device detail rows
                if hasDetails {
                    VStack(spacing: StepperSpacing.md) {
                        StepperKeyValueRow("Address") {
                            Text(device?.endpointLabel ?? "")
                                .font(StepperFont.monoSmall)
                        }
                        if let ip = device?.lastKnownIPAddress, !ip.isEmpty {
                            StepperKeyValueRow("Last IP") {
                                Text(ip)
                                    .font(StepperFont.monoSmall)
                            }
                        }
                        if let user = device?.preferredUsername, !user.isEmpty {
                            StepperKeyValueRow("User") {
                                Text(user)
                                    .font(StepperFont.small)
                            }
                        }
                    }
                    .padding(StepperSpacing.xl)
                    .background(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .fill(StepperColor.secondary.opacity(0.10))
                            .overlay(
                                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                                    .stroke(StepperColor.border, lineWidth: 1)
                            )
                    )
                } else {
                    // Always show address even when no extra details
                    Text(device?.endpointLabel ?? "")
                        .font(StepperFont.monoSmall)
                        .foregroundStyle(StepperColor.mutedForeground)
                }
            }
            .padding(.horizontal, StepperSpacing.xxl)
            .frame(maxWidth: 420)
        }
        .ignoresSafeArea()
        .onAppear { pulsing = true }
    }
}
