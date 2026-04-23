import SwiftUI

/// Slim banner that slides in below the navigation bar when the WebSocket is
/// not fully connected. Mirrors the web version's BackendConnectionIndicator.
struct RealtimeStatusBanner: View {
    let status: RealtimeConnection.Status
    let attempt: Int
    let onReconnect: () -> Void

    @State private var pulsing = false

    var body: some View {
        HStack(spacing: StepperSpacing.sm) {
            statusDot
            Text(label)
                .font(StepperFont.small.weight(.medium))
                .foregroundStyle(labelColor)
            Spacer()
            if status == .paused {
                Button(action: onReconnect) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Reconnect")
                            .font(StepperFont.small.weight(.semibold))
                    }
                    .foregroundStyle(StepperColor.primary)
                }
            }
        }
        .padding(.horizontal, StepperSpacing.pagePadding)
        .padding(.vertical, StepperSpacing.sm)
        .background(background)
    }

    // MARK: — Status dot

    @ViewBuilder
    private var statusDot: some View {
        switch status {
        case .paused:
            Image(systemName: "wifi.slash")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(StepperColor.destructive)
        case .connecting, .reconnecting:
            Circle()
                .fill(StepperColor.warning)
                .frame(width: 7, height: 7)
                .opacity(pulsing ? 1 : 0.25)
                .animation(.easeInOut(duration: 0.75).repeatForever(autoreverses: true), value: pulsing)
                .onAppear { pulsing = true }
                .onDisappear { pulsing = false }
        default:
            Circle()
                .fill(StepperColor.mutedForeground)
                .frame(width: 7, height: 7)
        }
    }

    // MARK: — Background

    private var background: some View {
        ZStack(alignment: .bottom) {
            Rectangle().fill(.ultraThinMaterial)
            Rectangle().fill(accentColor.opacity(0.07))
            Rectangle()
                .fill(StepperColor.border.opacity(0.45))
                .frame(height: 0.5)
        }
    }

    // MARK: — Derived

    private var label: String {
        switch status {
        case .idle:        return "Offline"
        case .connecting:  return "Connecting…"
        case .reconnecting:
            return attempt > 1 ? "Reconnecting… (attempt \(attempt) of 5)" : "Reconnecting…"
        case .paused:      return "Connection paused"
        case .connected:   return "Realtime"  // never shown — filtered in AppShellView
        }
    }

    private var labelColor: Color {
        switch status {
        case .paused:  return StepperColor.destructive
        default:       return StepperColor.mutedForeground
        }
    }

    private var accentColor: Color {
        switch status {
        case .paused:  return StepperColor.destructive
        default:       return StepperColor.warning
        }
    }
}
