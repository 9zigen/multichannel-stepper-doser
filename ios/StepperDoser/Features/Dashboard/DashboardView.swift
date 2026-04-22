import SwiftUI

struct DashboardView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List {
            Section("Controller") {
                LabeledContent("Wi-Fi Mode", value: status.wifiMode)
                LabeledContent("Device IP", value: status.ipAddress)
                LabeledContent("Station", value: status.stationConnected ? status.stationIpAddress : "Offline")
                LabeledContent("AP", value: status.apSsid)
                LabeledContent("Firmware", value: status.firmwareVersion)
            }

            Section("Pump Runtime") {
                if session.runtime.isEmpty {
                    Text("No pump activity reported.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(session.runtime) { entry in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Pump \(entry.id + 1)")
                                .font(.headline)
                            Text(entry.active ? "\(entry.state.capitalized) • \(Int(entry.remainingSeconds))s left" : "Idle")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Quick Actions") {
                Button("Refresh") {
                    Task {
                        await session.refresh()
                    }
                }

                if let firstPump = session.settings?.pumps.first {
                    Button("Run \(firstPump.name) for 10s") {
                        Task {
                            _ = await session.runPump(id: firstPump.id, seconds: 10)
                        }
                    }
                }
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
}
