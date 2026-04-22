import SwiftUI

struct ConnectionSetupView: View {
    @Environment(AppSession.self) private var session
    @State private var endpoint = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Controller") {
                    TextField("stepper-doser.local or 192.168.1.50", text: $endpoint)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Text("Use the controller hostname or LAN IP. HTTP is assumed for local devices.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button("Save Endpoint") {
                        session.configureEndpoint(endpoint)
                    }
                    .disabled(endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("Connect Device")
            .onAppear {
                endpoint = session.endpointStore.rawValue
            }
        }
    }
}
