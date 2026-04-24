import SwiftUI

struct ScheduleListView: View {
    @Environment(AppSession.self) private var session
    @State private var selectedPumpID: Int?
    @State private var draftSchedule = PumpSchedule(mode: .off, workHours: [], weekdays: [], speed: 1, time: 0, volume: 0)

    private let weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    private let hourColumns = Array(repeating: GridItem(.flexible(), spacing: StepperSpacing.xs), count: 6)

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {
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
                .padding(StepperLayout.panelPadding)

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
                        HStack(spacing: StepperSpacing.xs) {
                            ForEach(pumps) { pump in
                                Button {
                                    selectPump(pump.id)
                                } label: {
                                    StepperSelectionChip(
                                        title: pump.name,
                                        isSelected: pump.id == selectedPumpID
                                    )
                                }
                                .buttonStyle(.plain)
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
                        HStack(spacing: StepperSpacing.xs) {
                            ForEach([ScheduleMode.off, .periodic, .continuous], id: \.self) { mode in
                                Button {
                                    draftSchedule.mode = mode
                                } label: {
                                    StepperSelectionChip(
                                        title: modeLabel(mode),
                                        isSelected: draftSchedule.mode == mode
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        VStack(spacing: StepperSpacing.md) {
                            ScheduleNumberAdjuster(
                                label: "Speed",
                                unit: "rpm",
                                value: $draftSchedule.speed,
                                minValue: 0.1,
                                maxValue: 400,
                                step: 0.5
                            )

                            if draftSchedule.mode == .periodic {
                                ScheduleNumberAdjuster(
                                    label: "Daily Volume",
                                    unit: "ml",
                                    value: $draftSchedule.volume,
                                    minValue: 0.1,
                                    maxValue: 5000,
                                    step: 0.5
                                )

                                VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                                    StepperSectionLabel(text: "Weekdays")
                                    HStack(spacing: StepperSpacing.xs) {
                                        ForEach(Array(weekdayLabels.enumerated()), id: \.offset) { item in
                                            Button {
                                                toggleWeekday(item.offset)
                                            } label: {
                                                StepperSelectionChip(
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
                                                StepperSelectionChip(
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
                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("Schedule")
        .refreshable {
            await session.refresh()
            syncSelection()
        }
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

/// Stepper adjuster with direct text-field input for fast value entry.
/// +/− buttons offer fine ±step nudging; typing a value and tapping Done commits it.
private struct ScheduleNumberAdjuster: View {
    let label: String
    let unit: String
    @Binding var value: Double
    let minValue: Double
    let maxValue: Double
    let step: Double

    @State private var rawText: String

    init(label: String, unit: String, value: Binding<Double>,
         minValue: Double, maxValue: Double, step: Double) {
        self.label = label
        self.unit = unit
        self._value = value
        self.minValue = minValue
        self.maxValue = maxValue
        self.step = step
        self._rawText = State(initialValue: Self.format(value.wrappedValue))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                StepperSectionLabel(text: label)
                Spacer()
                Text(unit)
                    .font(StepperFont.micro)
                    .foregroundStyle(StepperColor.mutedForeground)
                    .kerning(0.5)
            }
            HStack(spacing: StepperSpacing.sm) {
                Button { nudge(-step) } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(StepperSecondaryButtonStyle())
                .frame(maxWidth: 52)

                StepperTextField(
                    placeholder: "0",
                    text: $rawText,
                    keyboardType: .decimalPad,
                    textAlignment: .center,
                    onSubmit: commit
                )
                .frame(minHeight: 24)
                .stepperInputField()

                Button { nudge(step) } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(StepperSecondaryButtonStyle())
                .frame(maxWidth: 52)
            }
        }
        .onChange(of: value) { _, v in rawText = Self.format(v) }
    }

    private func nudge(_ delta: Double) {
        let rounded = ((value + delta) * 10).rounded() / 10
        value = min(maxValue, max(minValue, rounded))
    }

    private func commit() {
        let normalised = rawText.replacingOccurrences(of: ",", with: ".")
        let parsed = Double(normalised) ?? value
        value = min(maxValue, max(minValue, parsed))
        rawText = Self.format(value)
    }

    private static func format(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(format: "%.1f", v)
    }
}
