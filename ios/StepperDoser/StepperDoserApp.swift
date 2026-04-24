import SwiftUI

@main
struct StepperDoserApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(session)
                .preferredColorScheme(session.theme.colorScheme)
                .tint(StepperColor.primary)
        }
    }
}
