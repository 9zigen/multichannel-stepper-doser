import SwiftUI

struct DashboardView: View {
    @Environment(AppSession.self) private var session
    private let metricColumns = [
        GridItem(.flexible(), spacing: StepperSpacing.md),
        GridItem(.flexible(), spacing: StepperSpacing.md),
    ]

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {
                // Card header — OVERVIEW label + page title + status badges
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                        StepperSectionLabel(text: "Overview")
                        Text("Dashboard")
                            .font(StepperFont.title)
                            .foregroundStyle(StepperColor.foreground)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: StepperSpacing.sm) {
                        StepperBadge(
                            text: status.stationConnected ? "Station Online" : "Station Offline",
                            tone: status.stationConnected ? .primary : .warning
                        )
                        StepperBadge(text: status.wifiMode, tone: .secondary)
                    }
                }
                .padding(StepperLayout.panelPadding)

                StepperPanel {
                    StepperSectionLabel(text: "Controller")
                    LazyVGrid(columns: metricColumns, spacing: StepperSpacing.md) {
                        StepperMetricTile(
                            label: "Wi-Fi Mode",
                            value: status.wifiMode,
                            caption: status.stationConnected ? "Station linked" : "Access point only",
                            tone: status.stationConnected ? .primary : .warning
                        )

                        StepperMetricTile(
                            label: "Device IP",
                            value: status.ipAddress.isEmpty ? "Unavailable" : status.ipAddress,
                            caption: "Controller address",
                            tone: .neutral
                        )

                        StepperMetricTile(
                            label: "Station",
                            value: status.stationConnected ? status.stationIpAddress : "Offline",
                            caption: status.stationSsid.isEmpty ? "No active SSID" : status.stationSsid,
                            tone: status.stationConnected ? .primary : .warning
                        )

                        StepperMetricTile(
                            label: "Access Point",
                            value: status.apSsid,
                            caption: "\(status.apClients) client(s)",
                            tone: status.apClients > 0 ? .primary : .neutral
                        )

                        StepperMetricTile(
                            label: "Temperature",
                            value: "\(Int(status.boardTemperature.rounded()))°C",
                            caption: "Board sensor",
                            tone: status.boardTemperature >= 55 ? .warning : .neutral
                        )

                        StepperMetricTile(
                            label: "Heap",
                            value: "\(status.freeHeap) B",
                            caption: status.firmwareVersion.isEmpty ? "Firmware unknown" : status.firmwareVersion,
                            tone: .neutral
                        )
                    }
                }

                StepperPanel {
                    StepperSectionLabel(text: "Pump Runtime")
                    if session.runtime.isEmpty {
                        StepperEmptyState(
                            title: "No pump activity",
                            message: "The controller has no active runtime sessions right now.",
                            systemImage: "drop.circle"
                        )
                    } else {
                        VStack(spacing: StepperSpacing.md) {
                            ForEach(session.runtime) { entry in
                                HStack {
                                    VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                                        Text("Pump \(entry.id + 1)")
                                            .font(StepperFont.section)
                                            .foregroundStyle(StepperColor.foreground)
                                        Text(entry.active ? "\(entry.state.capitalized) • \(Int(entry.remainingSeconds))s left" : "Idle")
                                            .font(StepperFont.small)
                                            .foregroundStyle(StepperColor.mutedForeground)
                                    }
                                    Spacer()
                                    StepperBadge(text: entry.active ? "Active" : "Idle", tone: entry.active ? .primary : .outline)
                                }
                            }
                        }
                    }
                }

                if let pumps = session.settings?.pumps, !pumps.isEmpty {
                    StepperPanel {
                        StepperSectionLabel(text: "Pump Detail")
                        VStack(spacing: StepperSpacing.md) {
                            ForEach(pumps) { pump in
                                VStack(alignment: .leading, spacing: StepperSpacing.md) {
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: StepperSpacing.xs) {
                                            Text(pump.name)
                                                .font(StepperFont.section)
                                                .foregroundStyle(StepperColor.foreground)
                                            Text(scheduleHeadline(for: pump))
                                                .font(StepperFont.small)
                                                .foregroundStyle(StepperColor.mutedForeground)
                                        }
                                        Spacer()
                                        StepperBadge(text: wearLabel(for: pump), tone: wearBadgeTone(for: pump))
                                    }

                                    LazyVGrid(
                                        columns: [
                                            GridItem(.flexible(), spacing: StepperSpacing.md),
                                            GridItem(.flexible(), spacing: StepperSpacing.md),
                                        ],
                                        spacing: StepperSpacing.md
                                    ) {
                                        StepperMetricTile(
                                            label: "Tank",
                                            value: "\(tankPercent(for: pump))%",
                                            caption: "\(Int(pump.tankCurrentVol))/\(Int(max(pump.tankFullVol, 0))) ml",
                                            tone: tankPercent(for: pump) <= 15 ? .destructive : tankPercent(for: pump) <= 30 ? .warning : .neutral
                                        )
                                        StepperMetricTile(
                                            label: "Run Hours",
                                            value: "\(formatHours(pump.runningHours)) h",
                                            caption: "Warn \(formatHours(pump.aging.warningHours)) • Replace \(formatHours(pump.aging.replaceHours))",
                                            tone: wearMetricTone(for: pump)
                                        )
                                    }

                                    StepperWearBar(
                                        progress: wearProgress(for: pump),
                                        warningAt: wearWarningMark(for: pump),
                                        state: wearBarState(for: pump)
                                    )
                                    .frame(height: 8)

                                    Button("Run \(pump.name) for 10s") {
                                        Task {
                                            let speed = max(1, pump.schedule.speed)
                                            _ = await session.runPump(
                                                id: pump.id,
                                                seconds: 10,
                                                speed: speed,
                                                direction: pump.direction
                                            )
                                        }
                                    }
                                    .buttonStyle(StepperSecondaryButtonStyle())
                                }
                                .padding(.bottom, StepperSpacing.sm)
                            }
                        }
                    }
                }

                StepperPanel {
                    StepperSectionLabel(text: "Quick Actions")
                    VStack(spacing: StepperSpacing.md) {
                        Button("Refresh") {
                            Task {
                                await session.refresh()
                            }
                        }
                        .buttonStyle(StepperSecondaryButtonStyle())

                        if let firstPump = session.settings?.pumps.first {
                            Button("Run \(firstPump.name) for 10s") {
                                Task {
                                    _ = await session.runPump(id: firstPump.id, seconds: 10)
                                }
                            }
                            .buttonStyle(StepperPrimaryButtonStyle())
                        }
                    }
                }
                // Bottom breath — outer panel has padding: 0 so last section needs a gap
                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await session.refresh()
        }
    }

    private var status: StatusSnapshot {
        session.status ?? .placeholder
    }

    private func scheduleHeadline(for pump: PumpConfiguration) -> String {
        switch pump.schedule.mode {
        case .off:
            "Manual only"
        case .periodic:
            "\(formatHours(pump.schedule.volume)) ml/day"
        case .continuous:
            "\(formatHours(pump.schedule.speed)) rpm continuous"
        }
    }

    private func tankPercent(for pump: PumpConfiguration) -> Int {
        guard pump.tankFullVol > 0 else { return 0 }
        return Int(((pump.tankCurrentVol / pump.tankFullVol) * 100).rounded())
    }

    private func wearLabel(for pump: PumpConfiguration) -> String {
        if pump.runningHours >= pump.aging.replaceHours {
            return "Replace"
        }
        if pump.runningHours >= pump.aging.warningHours {
            return "Warning"
        }
        return "Nominal"
    }

    private func wearBadgeTone(for pump: PumpConfiguration) -> StepperBadgeTone {
        if pump.runningHours >= pump.aging.replaceHours {
            return .destructive
        }
        if pump.runningHours >= pump.aging.warningHours {
            return .warning
        }
        return .outline
    }

    private func wearMetricTone(for pump: PumpConfiguration) -> StepperMetricTone {
        if pump.runningHours >= pump.aging.replaceHours {
            return .destructive
        }
        if pump.runningHours >= pump.aging.warningHours {
            return .warning
        }
        return .neutral
    }

    private func wearProgress(for pump: PumpConfiguration) -> Double {
        guard pump.aging.replaceHours > 0 else { return 0 }
        return min(pump.runningHours / pump.aging.replaceHours, 1)
    }

    private func wearWarningMark(for pump: PumpConfiguration) -> Double {
        guard pump.aging.replaceHours > 0 else { return 0 }
        return min(max(pump.aging.warningHours / pump.aging.replaceHours, 0), 1)
    }

    private func wearBarState(for pump: PumpConfiguration) -> StepperWearBar.State {
        if pump.runningHours >= pump.aging.replaceHours {
            return .critical
        }
        if pump.runningHours >= pump.aging.warningHours {
            return .warning
        }
        return .nominal
    }

    private func formatHours(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}
