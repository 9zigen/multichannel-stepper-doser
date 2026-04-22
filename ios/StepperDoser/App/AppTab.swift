import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case dashboard
    case schedule
    case history
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard:
            "Dashboard"
        case .schedule:
            "Schedule"
        case .history:
            "History"
        case .settings:
            "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard:
            "gauge.with.dots.needle.50percent"
        case .schedule:
            "calendar"
        case .history:
            "chart.line.uptrend.xyaxis"
        case .settings:
            "gearshape"
        }
    }

    @ViewBuilder
    func rootView() -> some View {
        switch self {
        case .dashboard:
            DashboardView()
        case .schedule:
            ScheduleListView()
        case .history:
            HistoryView()
        case .settings:
            SettingsHomeView()
        }
    }
}
