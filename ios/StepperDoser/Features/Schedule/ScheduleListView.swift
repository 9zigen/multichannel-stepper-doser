import SwiftUI

struct ScheduleListView: View {
    @Environment(AppSession.self) private var session
    @State private var selectedPumpID: Int?
    @State private var draftSchedule = PumpSchedule(mode: .off, workHours: [], weekdays: [], speed: 1, time: 0, volume: 0)

    private let weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    private let hourColumns = Array(repeating: GridItem(.flexible(), spacing: StepperSpacing.xs), count: 6)

    var body: some View {
        StepperPage {
            StepperCard {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                        StepperSectionLabel(text: "Schedules")
                        Text("Schedule")
                            .font(StepperFont.title)
                            .foregroundStyle(StepperColor.foreground)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: StepperSpacing.sm) {
                        StepperBadge(text: "\(activeSchedules)/\(pumps.count) active", tone: .secondary)
                        if dailyVolume > 0 {
                            StepperBadge(text: "\(Int(dailyVolume)) ml/day", tone: .outline)
                        }
                    }
                }

                if pumps.isEmpty {
                    StepperPanel {
                        StepperEmptyState(
                            title: "No Pumps Configured",
                            message: "Schedules appear here once the controller reports pump definitions.",
                            systemImage: "calendar.badge.exclamationmark"
                        )
                    }
                } else if let selectedPump {
                    StepperPanel {
                        StepperSectionLabel(text: "Pump")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: StepperSpacing.sm) {
                                ForEach(pumps) { pump in
                                    Button {
                                        selectPump(pump.id)
                                    } label: {
                                        StepperBadge(
                                            text: pump.name,
                                            tone: pump.id == selectedPumpID ? .primary : .secondary
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Summary")
                        LazyVGrid(
                            columns: [
                                GridItem(.flexible(), spacing: StepperSpacing.md),
                                GridItem(.flexible(), spacing: StepperSpacing.md),
                            ],
                            spacing: StepperSpacing.md
                        ) {
                            StepperMetricTile(
                                label: "Mode",
                                value: modeLabel(draftSchedule.mode),
                                caption: scheduleHeadline(for: draftSchedule),
                                tone: draftSchedule.mode == .continuous ? .primary : .neutral
                            )
                            StepperMetricTile(
                                label: "Speed",
                                value: "\(formatNumber(draftSchedule.speed)) rpm",
                                caption: selectedPump.state ? "Pump currently enabled" : "Standby",
                                tone: .neutral
                            )
                            StepperMetricTile(
                                label: "Weekdays",
                                value: "\(draftSchedule.weekdays.count)",
                                caption: draftSchedule.mode == .periodic ? selectedWeekdaySummary : "No weekday rule",
                                tone: .neutral
                            )
                            StepperMetricTile(
                                label: "Hours",
                                value: "\(draftSchedule.workHours.count)",
                                caption: draftSchedule.mode == .periodic ? selectedHourSummary : "No hour rule",
                                tone: .neutral
                            )
                        }
                    }

                    StepperPanel {
                        StepperSectionLabel(text: "Mode")
                        HStack(spacing: StepperSpacing.sm) {
                            ForEach([ScheduleMode.off, .periodic, .continuous], id: \.self) { mode in
                                Button {
                                    draftSchedule.mode = mode
                                } label: {
                                    StepperBadge(
                                        text: modeLabel(mode),
                                        tone: draftSchedule.mode == mode ? .primary : .secondary
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        VStack(spacing: StepperSpacing.md) {
                            ScheduleNumberAdjuster(
                                label: "Speed",
                                valueLabel: "\(formatNumber(draftSchedule.speed)) rpm",
                                onDecrement: { draftSchedule.speed = max(0.1, draftSchedule.speed - 0.5) },
                                onIncrement: { draftSchedule.speed = min(400, draftSchedule.speed + 0.5) }
                            )

                            if draftSchedule.mode == .periodic {
                                ScheduleNumberAdjuster(
                                    label: "Daily Volume",
                                    valueLabel: "\(formatNumber(draftSchedule.volume)) ml",
                                    onDecrement: { draftSchedule.volume = max(0.1, draftSchedule.volume - 0.5) },
                                    onIncrement: { draftSchedule.volume = min(5000, draftSchedule.volume + 0.5) }
                                )

                                VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                                    StepperSectionLabel(text: "Weekdays")
                                    HStack(spacing: StepperSpacing.xs) {
                                        ForEach(Array(weekdayLabels.enumerated()), id: \.offset) { item in
                                            Button {
                                                toggleWeekday(item.offset)
                                            } label: {
                                                ScheduleSelectionChip(
                                                    title: item.element,
                                                    isSelected: draftSchedule.weekdays.contains(item.offset)
                                                )
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }

                                VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                                    HStack {
                                        StepperSectionLabel(text: "Hours")
                                        Spacer()
                                        Text("\(draftSchedule.workHours.count)/24")
                                            .font(StepperFont.micro)
                                            .foregroundStyle(StepperColor.mutedForeground)
                                    }

                                    LazyVGrid(columns: hourColumns, spacing: StepperSpacing.xs) {
                                        ForEach(0..<24, id: \.self) { hour in
                                            Button {
                                                toggleHour(hour)
                                            } label: {
                                                ScheduleSelectionChip(
                                                    title: String(format: "%02d", hour),
                                                    isSelected: draftSchedule.workHours.contains(hour),
                                                    monospace: true
                                                )
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        }

                        Button(session.isSaving ? "Saving..." : "Apply Schedule") {
                            Task {
                                await saveSchedule(for: selectedPump)
                            }
                        }
                        .buttonStyle(StepperPrimaryButtonStyle())
                        .disabled(session.isSaving || draftSchedule == selectedPump.schedule)
                    }
                }
            }
        }
        .navigationTitle("Schedule")
        .task {
            syncSelection()
        }
        .onChange(of: session.settings?.pumps.map(\.id) ?? []) { _, _ in
            syncSelection()
        }
        .onChange(of: selectedPumpID) { _, _ in
            syncDraft()
        }
    }

    private var pumps: [PumpConfiguration] {
        session.settings?.pumps ?? []
    }

    private var selectedPump: PumpConfiguration? {
        if let selectedPumpID,
           let match = pumps.first(where: { $0.id == selectedPumpID }) {
            return match
        }
        return pumps.first
    }

    private var activeSchedules: Int {
        pumps.filter { $0.schedule.mode != .off }.count
    }

    private var dailyVolume: Double {
        pumps
            .filter { $0.schedule.mode == .periodic }
            .reduce(0) { $0 + $1.schedule.volume }
    }

    private var selectedWeekdaySummary: String {
        if draftSchedule.weekdays.isEmpty {
            return "No days selected"
        }
        return draftSchedule.weekdays
            .sorted()
            .map { weekdayLabels[$0] }
            .joined(separator: " ")
    }

    private var selectedHourSummary: String {
        if draftSchedule.workHours.isEmpty {
            return "No hours selected"
        }
        return draftSchedule.workHours
            .sorted()
            .prefix(4)
            .map { String(format: "%02d:00", $0) }
            .joined(separator: ", ")
            + (draftSchedule.workHours.count > 4 ? "..." : "")
    }

    private func syncSelection() {
        guard !pumps.isEmpty else {
            selectedPumpID = nil
            return
        }

        if selectedPumpID == nil || pumps.contains(where: { $0.id == selectedPumpID }) == false {
            selectedPumpID = pumps.first?.id
        }

        syncDraft()
    }

    private func syncDraft() {
        guard let selectedPump else { return }
        draftSchedule = selectedPump.schedule
    }

    private func selectPump(_ pumpID: Int) {
        selectedPumpID = pumpID
        syncDraft()
    }

    private func toggleWeekday(_ day: Int) {
        if let index = draftSchedule.weekdays.firstIndex(of: day) {
            draftSchedule.weekdays.remove(at: index)
        } else {
            draftSchedule.weekdays.append(day)
            draftSchedule.weekdays.sort()
        }
    }

    private func toggleHour(_ hour: Int) {
        if let index = draftSchedule.workHours.firstIndex(of: hour) {
            draftSchedule.workHours.remove(at: index)
        } else {
            draftSchedule.workHours.append(hour)
            draftSchedule.workHours.sort()
        }
    }

    private func saveSchedule(for pump: PumpConfiguration) async {
        var updatedPump = pump
        updatedPump.schedule = draftSchedule
        _ = await session.savePumpConfiguration(updatedPump)
    }

    private func modeLabel(_ mode: ScheduleMode) -> String {
        switch mode {
        case .off:
            "Off"
        case .periodic:
            "Periodic"
        case .continuous:
            "Continuous"
        }
    }

    private func scheduleHeadline(for schedule: PumpSchedule) -> String {
        switch schedule.mode {
        case .off:
            "Manual control only"
        case .periodic:
            "\(formatNumber(schedule.volume)) ml/day"
        case .continuous:
            "Constant output"
        }
    }

    private func formatNumber(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}

private struct ScheduleSelectionChip: View {
    let title: String
    let isSelected: Bool
    var monospace = false

    var body: some View {
        Text(title)
            .font(monospace ? StepperFont.monoSmall : StepperFont.small)
            .foregroundStyle(isSelected ? StepperColor.primaryForeground : StepperColor.foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                    .fill(isSelected ? StepperColor.primary : StepperColor.secondary.opacity(0.24))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                            .stroke(isSelected ? StepperColor.primary.opacity(0.2) : StepperColor.border, lineWidth: 1)
                    )
            )
    }
}

private struct ScheduleNumberAdjuster: View {
    let label: String
    let valueLabel: String
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.sm) {
            StepperSectionLabel(text: label)
            HStack(spacing: StepperSpacing.md) {
                Button(action: onDecrement) {
                    Image(systemName: "minus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(StepperSecondaryButtonStyle())

                Text(valueLabel)
                    .font(StepperFont.section)
                    .foregroundStyle(StepperColor.foreground)
                    .frame(maxWidth: .infinity)

                Button(action: onIncrement) {
                    Image(systemName: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(StepperSecondaryButtonStyle())
            }
        }
    }
}
