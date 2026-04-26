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

                // MARK: — Controller metrics
                StepperPanel {
                    StepperSectionLabel(text: "Controller")
                    LazyVGrid(columns: metricColumns, spacing: StepperSpacing.md) {
                        // 1 — Wi-Fi Mode
                        StepperMetricTile(
                            label: "Wi-Fi Mode",
                            value: status.wifiMode,
                            caption: status.stationConnected ? "Station linked" : "Access point only",
                            tone: status.stationConnected ? .primary : .warning
                        )

                        // 2 — Active SSID (station SSID when connected, AP SSID otherwise)
                        StepperMetricTile(
                            label: "Network",
                            value: status.stationConnected
                                ? (status.stationSsid.isEmpty ? "Connected" : status.stationSsid)
                                : (status.apSsid.isEmpty ? "No network" : status.apSsid),
                            caption: status.stationConnected ? "Station" : "Access point",
                            tone: status.stationConnected ? .primary : .neutral
                        )

                        // 3 — IP address (station IP when connected, AP IP otherwise)
                        StepperMetricTile(
                            label: "IP Address",
                            value: status.stationConnected
                                ? (status.stationIpAddress.isEmpty ? "—" : status.stationIpAddress)
                                : (status.apIpAddress.isEmpty ? "—" : status.apIpAddress),
                            caption: status.stationConnected ? "Station address" : "AP address",
                            tone: .neutral
                        )

                        // 4 — Reboots
                        StepperMetricTile(
                            label: "Reboots",
                            value: "\(status.rebootCount)",
                            caption: status.lastRebootReason.isEmpty ? "Since factory reset" : status.lastRebootReason,
                            tone: status.rebootCount > 10 ? .warning : .neutral
                        )

                        // 5 — Free heap in kB (memory pressure)
                        StepperMetricTile(
                            label: "Memory",
                            value: "\(status.freeHeap / 1024) kB",
                            caption: heapCaption,
                            tone: heapTone
                        )

                        // 6 — Uptime
                        StepperMetricTile(
                            label: "Uptime",
                            value: status.upTime.isEmpty ? "—" : status.upTime,
                            caption: "Since last reboot",
                            tone: .neutral
                        )

                        // 7 — MQTT status
                        StepperMetricTile(
                            label: "MQTT",
                            value: mqttValue,
                            caption: "Message broker",
                            tone: mqttTone
                        )

                        // 8 — NTP status
                        StepperMetricTile(
                            label: "NTP",
                            value: ntpValue,
                            caption: "Time sync",
                            tone: ntpTone
                        )
                    }
                }

                // MARK: — Today's Dosing
                if let history = session.history {
                    TodayDosingCard(history: history)
                }

                // MARK: — Pumps Overview + Detail
                if let pumps = session.settings?.pumps, !pumps.isEmpty {
                    PumpsOverviewCard(pumps: pumps, runtime: session.runtime)

                    StepperPanel {
                        StepperSectionLabel(text: "Pump Detail")
                        VStack(spacing: 0) {
                            ForEach(Array(pumps.enumerated()), id: \.element.id) { index, pump in
                                if index > 0 {
                                    Rectangle()
                                        .fill(StepperColor.border)
                                        .frame(height: 1)
                                        .padding(.vertical, StepperSpacing.lg)
                                }

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

                                    PumpManualRunControls(
                                        pump: pump,
                                        runtimeEntry: runtimeEntry(for: pump.id),
                                        onRun: runPump(_:seconds:speed:direction:),
                                        onStop: stopPump
                                    )
                                }
                            }
                        }
                    }
                }

                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await session.refresh()
            await session.refreshHistory()
        }
        .task {
            if session.history == nil {
                await session.refreshHistory()
            }
        }
    }

    // MARK: — Computed status helpers

    private var status: StatusSnapshot {
        session.status ?? .placeholder
    }

    private var heapTone: StepperMetricTone {
        let kb = status.freeHeap / 1024
        if kb < 30 { return .destructive }
        if kb < 60 { return .warning }
        return .neutral
    }

    private var heapCaption: String {
        let kb = status.freeHeap / 1024
        if kb < 30 { return "Critical" }
        if kb < 60 { return "Low" }
        return "Free heap"
    }

    private var mqttValue: String {
        if !status.mqttService.enabled { return "Disabled" }
        return status.mqttService.connected == true ? "Connected" : "Disconnected"
    }

    private var mqttTone: StepperMetricTone {
        if !status.mqttService.enabled { return .neutral }
        return status.mqttService.connected == true ? .primary : .warning
    }

    private var ntpValue: String {
        if !status.ntpService.enabled { return "Disabled" }
        return status.ntpService.sync == true ? "Synced" : "Pending"
    }

    private var ntpTone: StepperMetricTone {
        if !status.ntpService.enabled { return .neutral }
        return status.ntpService.sync == true ? .primary : .warning
    }

    // MARK: — Pump helpers

    private func runtimeEntry(for pumpID: Int) -> PumpRuntimeEntry? {
        session.runtime.first(where: { $0.id == pumpID })
    }

    private func runPump(_ pump: PumpConfiguration, seconds: Int, speed: Double, direction: Bool) {
        Task {
            _ = await session.runPump(
                id: pump.id,
                durationSeconds: seconds,
                speed: max(1, speed),
                direction: direction
            )
        }
    }

    private func stopPump(_ pump: PumpConfiguration) {
        Task {
            let speed = max(1, pump.schedule.speed)
            _ = await session.stopPump(
                id: pump.id,
                speed: speed,
                direction: pump.direction
            )
        }
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
        if pump.runningHours >= pump.aging.replaceHours { return "Replace" }
        if pump.runningHours >= pump.aging.warningHours { return "Warning" }
        return "Nominal"
    }

    private func wearBadgeTone(for pump: PumpConfiguration) -> StepperBadgeTone {
        if pump.runningHours >= pump.aging.replaceHours { return .destructive }
        if pump.runningHours >= pump.aging.warningHours { return .warning }
        return .outline
    }

    private func wearMetricTone(for pump: PumpConfiguration) -> StepperMetricTone {
        if pump.runningHours >= pump.aging.replaceHours { return .destructive }
        if pump.runningHours >= pump.aging.warningHours { return .warning }
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
        if pump.runningHours >= pump.aging.replaceHours { return .critical }
        if pump.runningHours >= pump.aging.warningHours { return .warning }
        return .nominal
    }

    private func formatHours(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}

// MARK: — Pumps Overview card

private struct PumpsOverviewCard: View {
    let pumps: [PumpConfiguration]
    let runtime: [PumpRuntimeEntry]

    var body: some View {
        StepperPanel {
            StepperSectionLabel(text: "Pumps")
            VStack(spacing: 0) {
                ForEach(Array(pumps.enumerated()), id: \.element.id) { index, pump in
                    if index > 0 {
                        Rectangle()
                            .fill(StepperColor.border)
                            .frame(height: 1)
                            .padding(.vertical, StepperSpacing.md)
                    }
                    PumpOverviewRow(
                        pump: pump,
                        runtimeEntry: runtime.first(where: { $0.id == pump.id })
                    )
                }
            }
        }
    }
}

private struct PumpOverviewRow: View {
    let pump: PumpConfiguration
    let runtimeEntry: PumpRuntimeEntry?

    var body: some View {
        HStack(alignment: .center, spacing: StepperSpacing.md) {
            // Left — text info stack
            VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                // Name + active badge
                HStack {
                    Text(pump.name)
                        .font(StepperFont.section)
                        .foregroundStyle(StepperColor.foreground)
                    Spacer()
                    StepperBadge(
                        text: isActive ? "Active" : "Idle",
                        tone: isActive ? .primary : .outline
                    )
                }

                // Schedule + wear badge
                HStack {
                    Text(scheduleLabel)
                        .font(StepperFont.small)
                        .foregroundStyle(StepperColor.mutedForeground)
                    Spacer()
                    StepperBadge(text: wearLabel, tone: wearTone)
                }

                // Active countdown (only when pumping)
                if isActive, let entry = runtimeEntry {
                    HStack(spacing: StepperSpacing.xs) {
                        Image(systemName: "drop.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(StepperColor.primary)
                        Text("\(entry.state.capitalized) · \(Int(entry.remainingSeconds))s remaining")
                            .font(StepperFont.caption)
                            .foregroundStyle(StepperColor.primary)
                    }
                }
            }

            // Right — mini tank icon + percentage label
            VStack(spacing: 4) {
                MiniTankView(ratio: tankRatio, fillColor: tankFillColor)
                    .frame(width: 24, height: 42)

                Text("\(tankPercent)%")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(StepperColor.mutedForeground)
            }
            .frame(width: 36)
        }
    }

    // MARK: — Computed

    private var isActive: Bool { runtimeEntry?.active == true }

    private var scheduleLabel: String {
        switch pump.schedule.mode {
        case .off:        return "Manual only"
        case .periodic:   return "Periodic · \(formatValue(pump.schedule.volume)) ml/day"
        case .continuous: return "Continuous · \(formatValue(pump.schedule.speed)) rpm"
        }
    }

    private var tankRatio: Double {
        guard pump.tankFullVol > 0 else { return 0 }
        return min(max(pump.tankCurrentVol / pump.tankFullVol, 0), 1)
    }

    private var tankPercent: Int { Int((tankRatio * 100).rounded()) }

    private var tankFillColor: Color {
        if tankPercent <= 15 { return StepperColor.destructive }
        if tankPercent <= 30 { return StepperColor.warning }
        return StepperColor.primary
    }

    private var wearLabel: String {
        if pump.runningHours >= pump.aging.replaceHours { return "Replace" }
        if pump.runningHours >= pump.aging.warningHours { return "Warning" }
        return "Nominal"
    }

    private var wearTone: StepperBadgeTone {
        if pump.runningHours >= pump.aging.replaceHours { return .destructive }
        if pump.runningHours >= pump.aging.warningHours { return .warning }
        return .outline
    }

    private func formatValue(_ v: Double) -> String {
        v.rounded(.towardZero) == v ? String(Int(v)) : String(format: "%.1f", v)
    }
}

// MARK: — Mini tank icon

/// Vertical tank shape that fills from the bottom based on `ratio` (0…1).
/// A small cap sits on top to suggest a physical container.
private struct MiniTankView: View {
    let ratio: Double      // 0 = empty, 1 = full
    let fillColor: Color

    var body: some View {
        VStack(spacing: 0) {
            // Cap — narrow rect centered at the top
            HStack {
                Spacer()
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(StepperColor.secondary.opacity(0.25))
                    .frame(width: 10, height: 3)
                    .overlay(
                        RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                            .stroke(StepperColor.border.opacity(0.6), lineWidth: 0.75)
                    )
                Spacer()
            }

            // Body — liquid fills from the bottom
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(StepperColor.secondary.opacity(0.10))
                .overlay(alignment: .bottom) {
                    // Scale a color fill vertically anchored at bottom — no GeometryReader needed
                    fillColor.opacity(0.72)
                        .scaleEffect(
                            x: 1, y: max(ratio, 0),
                            anchor: .bottom
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 3.5, style: .continuous))
                        .padding(1.5)
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .stroke(StepperColor.border, lineWidth: 1)
                )
        }
    }
}

// MARK: — Today's Dosing card

/// Self-contained card showing today's hourly dosing data.
/// Owns its own @State for pump selection so pump chip taps don't re-render DashboardView.
private struct TodayDosingCard: View {
    let history: PumpHistoryResponse
    @State private var selectedPumpID: Int?

    var body: some View {
        StepperPanel {
            // Header
            HStack {
                StepperSectionLabel(text: "Today's Dosing")
                Spacer()
                if let day = todayDay {
                    StepperBadge(text: day.date, tone: .secondary)
                }
            }

            // Pump selector chips (only if more than one pump)
            if history.pumps.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: StepperSpacing.xs) {
                        ForEach(history.pumps) { pump in
                            Button {
                                StepperHaptic.selection()
                                selectedPumpID = pump.id
                            } label: {
                                StepperSelectionChip(
                                    title: pump.name,
                                    isSelected: pump.id == effectivePumpID,
                                    expand: false
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            if let today = todayDay, todayHasActivity(today) {
                // Hourly heatmap — 2 rows × 12 cols (AM / PM)
                HourlyHeatmapView(hours: today.hours)

                // Summary metrics — 3 equal columns
                let totalRuntime = today.hours.reduce(0.0) { $0 + $1.totalRuntimeS }
                let activeCount = today.hours.filter { $0.totalVolumeMl > 0 || $0.totalRuntimeS > 0 }.count

                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: StepperSpacing.sm),
                        GridItem(.flexible(), spacing: StepperSpacing.sm),
                        GridItem(.flexible(), spacing: StepperSpacing.sm),
                    ],
                    spacing: StepperSpacing.sm
                ) {
                    StepperMetricTile(
                        label: "Volume",
                        value: today.formattedVolume,
                        caption: "Total today",
                        tone: .primary
                    )
                    StepperMetricTile(
                        label: "Runtime",
                        value: runtimeLabel(totalRuntime),
                        caption: "Motor total",
                        tone: .neutral
                    )
                    StepperMetricTile(
                        label: "Active",
                        value: "\(activeCount)h",
                        caption: "Hours dosed",
                        tone: .neutral
                    )
                }

                // Busiest hours (top 3 by volume)
                let busiest = today.hours
                    .filter { $0.totalVolumeMl > 0 }
                    .sorted { $0.totalVolumeMl > $1.totalVolumeMl }
                    .prefix(3)

                if !busiest.isEmpty {
                    VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                        StepperSectionLabel(text: "Busiest Hours")
                        VStack(spacing: StepperSpacing.sm) {
                            ForEach(Array(busiest), id: \.hour) { hour in
                                HStack(spacing: StepperSpacing.md) {
                                    Text(hourLabel(hour.hour))
                                        .font(StepperFont.monoSmall)
                                        .foregroundStyle(StepperColor.foreground)
                                    Spacer()
                                    StepperBadge(text: hour.formattedVolume, tone: .primary)
                                    Text(runtimeLabel(hour.totalRuntimeS))
                                        .font(StepperFont.caption)
                                        .foregroundStyle(StepperColor.mutedForeground)
                                        .frame(width: 40, alignment: .trailing)
                                }
                            }
                        }
                    }
                }
            } else {
                StepperEmptyState(
                    title: "No dosing today",
                    message: "No pump activity has been recorded for today yet.",
                    systemImage: "drop.circle"
                )
            }

            // Navigation to full History
            NavigationLink(destination: HistoryView()) {
                HStack {
                    Text("Open History")
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 13, weight: .semibold))
                }
            }
            .buttonStyle(StepperSecondaryButtonStyle())
        }
    }

    // MARK: — Helpers

    private var effectivePumpID: Int {
        selectedPumpID ?? history.pumps.first?.id ?? 0
    }

    private var selectedPump: PumpHistoryPump? {
        history.pumps.first(where: { $0.id == effectivePumpID })
    }

    private var todayDay: PumpHistoryDay? {
        selectedPump?.days.first(where: { $0.dayStamp == history.currentDayStamp })
    }

    private func todayHasActivity(_ day: PumpHistoryDay) -> Bool {
        day.hours.contains { $0.scheduledVolumeMl + $0.manualVolumeMl > 0 || $0.totalRuntimeS > 0 }
    }

    private func hourLabel(_ hour: Int) -> String {
        String(format: "%02d:00", max(0, min(hour, 23)))
    }

    private func runtimeLabel(_ seconds: Double) -> String {
        if seconds >= 3600 {
            return String(format: "%.1fh", seconds / 3600)
        }
        if seconds >= 60 {
            return "\(Int(seconds / 60))m"
        }
        return "\(Int(seconds))s"
    }
}

// MARK: — Hourly heatmap (24 cells, 2 rows × 12 cols)

private struct HourlyHeatmapView: View {
    let hours: [PumpHistoryHour]

    var body: some View {
        let allVolumes = (0..<24).map { volumeAt($0) }
        let maxVol = max(allVolumes.max() ?? 0, 0.01)

        VStack(spacing: 3) {
            heatmapRow(range: 0..<12, label: "AM", maxVol: maxVol)
            heatmapRow(range: 12..<24, label: "PM", maxVol: maxVol)
        }
    }

    private func heatmapRow(range: Range<Int>, label: String, maxVol: Double) -> some View {
        HStack(spacing: 3) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(StepperColor.mutedForeground)
                .frame(width: 20, alignment: .leading)

            ForEach(range, id: \.self) { hour in
                let vol = volumeAt(hour)
                let ratio = vol / maxVol
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(cellColor(ratio: ratio))
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1.0, contentMode: .fit)
            }
        }
    }

    private func volumeAt(_ hour: Int) -> Double {
        hours.first(where: { $0.hour == hour })
            .map { $0.scheduledVolumeMl + $0.manualVolumeMl } ?? 0
    }

    private func cellColor(ratio: Double) -> Color {
        if ratio < 0.02 {
            return StepperColor.secondary.opacity(0.12)
        }
        // Scale from 15% to 85% opacity
        return StepperColor.primary.opacity(0.15 + ratio * 0.70)
    }
}

// MARK: — Manual run controls

/// Owns its own @State so interactions only re-render this lightweight view,
/// not the parent DashboardView with all its metric tiles.
private struct PumpManualRunControls: View {
    let pump: PumpConfiguration
    let runtimeEntry: PumpRuntimeEntry?
    let onRun: (PumpConfiguration, Int, Double, Bool) -> Void
    let onStop: (PumpConfiguration) -> Void

    @State private var seconds: Int = 30
    @State private var speed: Double = 0
    @State private var forward: Bool = true

    var body: some View {
        VStack(spacing: StepperSpacing.md) {
            if let runtimeEntry, runtimeEntry.active {
                Button("Stop \(pump.name)") { onStop(pump) }
                    .buttonStyle(StepperDestructiveButtonStyle())
            } else {
                // Row 1 — duration stepper + Start button
                HStack(spacing: StepperSpacing.sm) {
                    DurationStepper(seconds: $seconds)
                        .frame(maxWidth: .infinity)

                    Button("Start") {
                        onRun(pump, seconds, speed, forward)
                    }
                    .buttonStyle(StepperPrimaryButtonStyle())
                    .frame(maxWidth: .infinity)
                }

                // Row 2 — direction toggle + speed stepper
                HStack(spacing: StepperSpacing.sm) {
                    DirectionToggle(forward: $forward)
                        .frame(maxWidth: .infinity)

                    SpeedStepper(speed: $speed)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .task(id: pump.id) {
            seconds = 30
            speed   = max(1, pump.schedule.speed)
            forward = pump.direction
        }
    }
}

// MARK: — Duration stepper

/// Animated ± stepper for seconds. Step size scales with current value.
/// The value label uses numericText transition for a smooth flip animation.
private struct DurationStepper: View {
    @Binding var seconds: Int

    var body: some View {
        HStack(spacing: 0) {
            stepButton(systemImage: "minus") {
                withAnimation(.snappy(duration: 0.18)) { seconds = max(1, seconds - stepSize) }
                StepperHaptic.selection()
            }

            divider

            Text(formatted)
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(StepperColor.foreground)
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.18), value: seconds)
                .frame(maxWidth: .infinity)

            divider

            stepButton(systemImage: "plus") {
                withAnimation(.snappy(duration: 0.18)) { seconds = min(9999, seconds + stepSize) }
                StepperHaptic.selection()
            }
        }
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.popover.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(StepperColor.input, lineWidth: 1)
                )
        )
    }

    private var stepSize: Int {
        if seconds >= 300 { return 60 }
        if seconds >= 60  { return 30 }
        return 10
    }

    private var formatted: String {
        if seconds >= 3600 { return String(format: "%.1fh", Double(seconds) / 3600) }
        if seconds >= 60 {
            let m = seconds / 60; let s = seconds % 60
            return s == 0 ? "\(m)m" : "\(m)m\(s)s"
        }
        return "\(seconds)s"
    }

    private var divider: some View {
        Rectangle()
            .fill(StepperColor.border)
            .frame(width: 1, height: 20)
    }

    private func stepButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(StepperColor.mutedForeground)
    }
}

// MARK: — Direction toggle

private struct DirectionToggle: View {
    @Binding var forward: Bool

    var body: some View {
        HStack(spacing: 0) {
            side(label: "↺ Rev", selected: !forward) { forward = false }
            Rectangle()
                .fill(StepperColor.border)
                .frame(width: 1, height: 20)
            side(label: "Fwd ↻", selected: forward) { forward = true }
        }
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.popover.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(StepperColor.input, lineWidth: 1)
                )
        )
    }

    private func side(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: {
            withAnimation(.snappy(duration: 0.15)) { action() }
            StepperHaptic.selection()
        }) {
            Text(label)
                .font(.system(size: 12, weight: selected ? .semibold : .regular))
                .foregroundStyle(selected ? StepperColor.primary : StepperColor.mutedForeground)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.15), value: selected)
    }
}

// MARK: — Speed stepper

private struct SpeedStepper: View {
    @Binding var speed: Double

    var body: some View {
        HStack(spacing: 0) {
            stepButton(systemImage: "minus") {
                withAnimation(.snappy(duration: 0.18)) { speed = max(1, speed - 1) }
                StepperHaptic.selection()
            }

            Rectangle()
                .fill(StepperColor.border)
                .frame(width: 1, height: 20)

            Text("\(Int(speed)) rpm")
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(StepperColor.foreground)
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.18), value: speed)
                .frame(maxWidth: .infinity)

            Rectangle()
                .fill(StepperColor.border)
                .frame(width: 1, height: 20)

            stepButton(systemImage: "plus") {
                withAnimation(.snappy(duration: 0.18)) { speed = min(999, speed + 1) }
                StepperHaptic.selection()
            }
        }
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.popover.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(StepperColor.input, lineWidth: 1)
                )
        )
    }

    private func stepButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 36, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(StepperColor.mutedForeground)
    }
}
