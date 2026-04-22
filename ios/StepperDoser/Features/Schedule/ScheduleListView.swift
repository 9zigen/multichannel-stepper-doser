import SwiftUI

struct ScheduleListView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List {
            if pumps.isEmpty {
                ContentUnavailableView("No Pumps Configured", systemImage: "calendar.badge.exclamationmark")
            } else {
                ForEach(pumps) { pump in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(pump.name)
                            .font(.headline)
                        Text(scheduleDescription(for: pump.schedule))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Schedule")
    }

    private var pumps: [PumpConfiguration] {
        session.settings?.pumps ?? []
    }

    private func scheduleDescription(for schedule: PumpSchedule) -> String {
        switch schedule.mode {
        case .off:
            "Disabled"
        case .periodic:
            "Periodic • \(Int(schedule.volume)) ml"
        case .continuous:
            "Continuous • speed \(Int(schedule.speed))"
        }
    }
}
