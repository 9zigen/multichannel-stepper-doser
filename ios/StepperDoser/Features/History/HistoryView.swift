import SwiftUI

struct HistoryView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List {
            if let history = session.history {
                ForEach(history.pumps) { pump in
                    Section(pump.name) {
                        ForEach(pump.days, id: \.dayStamp) { day in
                            LabeledContent(day.date, value: "\(Int(day.hours.reduce(0) { $0 + $1.manualVolumeMl + $1.scheduledVolumeMl })) ml")
                        }
                    }
                }
            } else {
                Section {
                    Text("Load retained pump history from the controller.")
                        .foregroundStyle(.secondary)
                    Button("Load History") {
                        Task {
                            await session.refreshHistory()
                        }
                    }
                }
            }
        }
        .navigationTitle("History")
        .task {
            if session.history == nil {
                await session.refreshHistory()
            }
        }
    }
}
