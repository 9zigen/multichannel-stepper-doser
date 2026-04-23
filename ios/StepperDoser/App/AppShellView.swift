import SwiftUI

struct AppShellView: View {
    @Environment(AppSession.self) private var session
    @State private var router = TabRouter()

    private var realtimeStatus: RealtimeConnection.Status { session.realtime.status }
    private var showBanner: Bool {
        // Only show when authenticated and the realtime link is not fully up.
        session.isAuthenticated && realtimeStatus != .connected
    }

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
        .safeAreaInset(edge: .top, spacing: 0) {
            if showBanner {
                RealtimeStatusBanner(
                    status: realtimeStatus,
                    attempt: session.realtime.attempt,
                    onReconnect: { session.reconnectRealtime() }
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: showBanner)
        .toolbarBackground(StepperColor.sidebar, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarColorScheme(.dark, for: .tabBar)
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
