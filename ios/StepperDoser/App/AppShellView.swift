import SwiftUI

struct AppShellView: View {
    @Environment(AppSession.self) private var session
    @State private var router = TabRouter()

    var body: some View {
        TabView(selection: selectedTabBinding) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack(path: router.binding(for: tab)) {
                    tab.rootView()
                }
                .tabItem {
                    Label(tab.title, systemImage: tab.systemImage)
                }
                .tag(tab)
            }
        }
        .task {
            await session.refreshRealtimeIfNeeded()
        }
    }

    private var selectedTabBinding: Binding<AppTab> {
        Binding(
            get: { session.selectedTab },
            set: { session.selectedTab = $0 }
        )
    }
}
