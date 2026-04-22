import SwiftUI

@MainActor
@Observable
final class TabRouter {
    var dashboardPath: [String] = []
    var schedulePath: [String] = []
    var historyPath: [String] = []
    var settingsPath: [String] = []

    func binding(for tab: AppTab) -> Binding<[String]> {
        Binding(
            get: {
                switch tab {
                case .dashboard:
                    self.dashboardPath
                case .schedule:
                    self.schedulePath
                case .history:
                    self.historyPath
                case .settings:
                    self.settingsPath
                }
            },
            set: { newValue in
                switch tab {
                case .dashboard:
                    self.dashboardPath = newValue
                case .schedule:
                    self.schedulePath = newValue
                case .history:
                    self.historyPath = newValue
                case .settings:
                    self.settingsPath = newValue
                }
            }
        )
    }
}
