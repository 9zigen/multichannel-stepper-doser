import SwiftUI

struct HistoryView: View {
    @Environment(AppSession.self) private var session
    @State private var selectedPumpID: Int?
    @State private var selectedDayStamp: Int?

    var body: some View {
        StepperPage {
            StepperPanel(spacing: StepperSpacing.lg, padding: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                        StepperSectionLabel(text: "Retained Data")
                        Text("History")
                            .font(StepperFont.title)
                            .foregroundStyle(StepperColor.foreground)
                    }
                    Spacer()
                    if let selectedPump {
                        VStack(alignment: .trailing, spacing: StepperSpacing.sm) {
                            StepperBadge(text: "\(selectedPump.days.count) days", tone: .secondary)
                            StepperBadge(text: "\(Int(totalVolume(for: selectedPump))) ml", tone: .outline)
                        }
                    }
                }
                .padding(StepperLayout.panelPadding)

                if let history = session.history, !history.pumps.isEmpty, let selectedPump {
                    StepperPanel {
                        StepperSectionLabel(text: "Pump")
                        HStack(spacing: StepperSpacing.xs) {
                            ForEach(history.pumps) { pump in
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
                        StepperSectionLabel(text: "Daily Activity")
                        StepperWeeklyHeatmap(
                            points: heatmapPoints(for: selectedPump),
                            selectedID: selectedDayStamp,
                            onSelect: { selectedDayStamp = $0 }
                        )

                        VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                            StepperSectionLabel(text: "Recent Volume")
                            StepperMiniBarChart(
                                points: recentBarPoints(for: selectedPump),
                                selectedID: selectedDayStamp,
                                onSelect: { selectedDayStamp = $0 }
                            )
                        }
                    }

                    StepperPanel {
                        if let selectedDay {
                            StepperSectionLabel(text: selectedDay.date)

                            LazyVGrid(
                                columns: [
                                    GridItem(.flexible(), spacing: StepperSpacing.md),
                                    GridItem(.flexible(), spacing: StepperSpacing.md),
                                ],
                                spacing: StepperSpacing.md
                            ) {
                                StepperMetricTile(
                                    label: "Total Volume",
                                    value: "\(Int(dayVolume(selectedDay))) ml",
                                    caption: "\(activeHours(selectedDay).count) active hour(s)",
                                    tone: .primary
                                )
                                StepperMetricTile(
                                    label: "Runtime",
                                    value: "\(Int(dayRuntime(selectedDay) / 60)) min",
                                    caption: "Motor runtime",
                                    tone: .neutral
                                )
                            }

                            VStack(spacing: StepperSpacing.md) {
                                ForEach(activeHours(selectedDay), id: \.hour) { hour in
                                    StepperKeyValueRow(hourLabel(hour.hour)) {
                                        Text("\(Int(hour.scheduledVolumeMl + hour.manualVolumeMl)) ml • \(runtimeLabel(hour.totalRuntimeS))")
                                            .font(StepperFont.monoSmall)
                                    }
                                }
                            }
                        } else {
                            StepperEmptyState(
                                title: "Select a day",
                                message: "Choose a highlighted day in the heatmap to inspect hourly totals.",
                                systemImage: "calendar"
                            )
                        }
                    }
                } else {
                    StepperPanel {
                        StepperEmptyState(
                            title: "History not loaded",
                            message: "Fetch retained pump history from the controller to review recent dosing totals.",
                            systemImage: "chart.line.uptrend.xyaxis"
                        )
                    }

                    Button("Load History") {
                        Task {
                            await session.refreshHistory()
                            syncSelection()
                        }
                    }
                    .buttonStyle(StepperSecondaryButtonStyle())
                }
                Color.clear.frame(height: StepperSpacing.xs)
            }
        }
        .navigationTitle("History")
        .task {
            if session.history == nil {
                await session.refreshHistory()
            }
            syncSelection()
        }
        .onChange(of: session.history?.pumps.map(\.id) ?? []) { _, _ in
            syncSelection()
        }
    }

    private var selectedPump: PumpHistoryPump? {
        guard let history = session.history else { return nil }
        if let selectedPumpID,
           let matching = history.pumps.first(where: { $0.id == selectedPumpID }) {
            return matching
        }
        return history.pumps.first
    }

    private var selectedDay: PumpHistoryDay? {
        guard let selectedPump else { return nil }
        if let selectedDayStamp,
           let matching = selectedPump.days.first(where: { $0.dayStamp == selectedDayStamp }) {
            return matching
        }
        return selectedPump.days.last
    }

    private func syncSelection() {
        guard let history = session.history, !history.pumps.isEmpty else {
            selectedPumpID = nil
            selectedDayStamp = nil
            return
        }

        if selectedPumpID == nil || history.pumps.contains(where: { $0.id == selectedPumpID }) == false {
            selectedPumpID = history.pumps.first?.id
        }

        if let selectedPump,
           (selectedDayStamp == nil || selectedPump.days.contains(where: { $0.dayStamp == selectedDayStamp }) == false) {
            selectedDayStamp = selectedPump.days.last?.dayStamp
        }
    }

    private func selectPump(_ pumpID: Int) {
        selectedPumpID = pumpID
        if let pump = session.history?.pumps.first(where: { $0.id == pumpID }) {
            selectedDayStamp = pump.days.last?.dayStamp
        }
    }

    private func totalVolume(for pump: PumpHistoryPump) -> Double {
        pump.days.reduce(0) { $0 + dayVolume($1) }
    }

    private func dayVolume(_ day: PumpHistoryDay) -> Double {
        day.hours.reduce(0) { $0 + $1.scheduledVolumeMl + $1.manualVolumeMl }
    }

    private func dayRuntime(_ day: PumpHistoryDay) -> Double {
        day.hours.reduce(0) { $0 + $1.totalRuntimeS }
    }

    private func activeHours(_ day: PumpHistoryDay) -> [PumpHistoryHour] {
        day.hours.filter { ($0.scheduledVolumeMl + $0.manualVolumeMl) > 0 || $0.totalRuntimeS > 0 }
    }

    private func heatmapPoints(for pump: PumpHistoryPump) -> [StepperHeatmapPoint] {
        let maxVolume = max(pump.days.map(dayVolume).max() ?? 0, 1)
        return pump.days.map { day in
            StepperHeatmapPoint(
                id: day.dayStamp,
                ratio: dayVolume(day) / maxVolume,
                label: "\(day.date) · \(Int(dayVolume(day))) ml"
            )
        }
    }

    private func recentBarPoints(for pump: PumpHistoryPump) -> [StepperMiniBarPoint] {
        pump.days.suffix(30).map { day in
            StepperMiniBarPoint(
                id: day.dayStamp,
                value: dayVolume(day),
                label: "\(day.date) · \(Int(dayVolume(day))) ml"
            )
        }
    }

    private func hourLabel(_ hour: Int) -> String {
        let normalized = max(0, min(hour, 23))
        return String(format: "%02d:00", normalized)
    }

    private func runtimeLabel(_ seconds: Double) -> String {
        if seconds >= 60 {
            return "\(Int(seconds / 60))m"
        }
        return "\(Int(seconds))s"
    }
}
