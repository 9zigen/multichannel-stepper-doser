# iOS Application Scaffold Plan

## Goal

Build a native SwiftUI iPhone app for the stepper doser controller by reusing the existing web product shape instead of redesigning the product from scratch.

The current web UI already tells us what the mobile app needs:

- authentication and first-run onboarding
- a dashboard for device state and manual pump actions
- schedule editing
- pump history
- device settings and maintenance

This document turns that into a recommended iOS scaffold.

## Source Audit Summary

The existing web app is under `frontend/` and already has a clean product split:

- route map in `frontend/src/routes.tsx`
- app shell and auth gate in `frontend/src/App.tsx` and `frontend/src/Layout.tsx`
- shared app state in `frontend/src/hooks/use-store.ts`
- backend contract in `frontend/src/lib/api.ts`
- websocket lifecycle and status updates in `frontend/src/components/realtime-provider.tsx`
- pump runtime sync and calibration session state in `frontend/src/components/pump-runtime-provider.tsx`

Main user-facing areas from the web UI:

- `Home`: dashboard, pump control, device overview, connectivity, system health
- `Schedule`: per-pump schedule editing
- `History`: pump history and charts
- `Login`: token-based auth
- `Onboarding`: secure credentials, configure network, optionally review board config
- `Settings.Network`
- `Settings.Services`
- `Settings.Pumps`
- `Settings.Board`
- `Settings.Firmware`
- `Settings.Backup`

The backend surface is small enough to map directly to Swift:

- `POST /api/auth`
- `GET /api/status`
- `GET/POST /api/settings`
- `GET/POST /api/board-config`
- `GET /api/pumps/runtime`
- `GET /api/pumps/history`
- `POST /api/run`
- `POST /api/device/restart`
- `POST /api/device/factory-reset`
- `GET /api/network/wifi/scan`
- `POST /upload`
- `GET /ws?token=...`

Realtime events currently used by the web client:

- `status_patch`
- `pump_runtime`
- `shutting_down`
- `system_ready`

## Recommended Product Decision

Do not try to ship full web parity in v1.

The iOS app should be optimized for the things a phone is best at:

- checking whether the controller is healthy
- quickly starting or stopping a pump
- seeing tank state, runtime state, and history
- making common schedule and service changes

The heavy admin surfaces should be phase 2 or phase 3:

- full board wiring editor
- backup import/export
- firmware upload
- API docs page

That split keeps the first native app focused and realistic.

## Recommended Technical Direction

- SwiftUI
- iOS 17+ target
- Observation API with `@Observable`
- `TabView` with one `NavigationStack` per tab
- `URLSession` for REST
- `URLSessionWebSocketTask` for realtime events
- Keychain for auth token storage
- `UserDefaults` for saved device endpoint and lightweight preferences
- `Charts` for history visualizations

Why iOS 17+:

- matches the modern SwiftUI/Observation guidance
- keeps the state model much simpler than supporting legacy `ObservableObject`
- this app is a controller companion, so clarity and iteration speed matter more than maximum backward compatibility

## iOS-Specific Constraints We Need Up Front

The web UI can rely on browser host or a dev-only fixed IP. The iOS app cannot.

The native app needs an explicit connection flow:

- device base URL or IP entry screen
- local persistence of the selected controller endpoint
- handling for plain HTTP to a local network device
- websocket URL generation from the selected endpoint

Required platform considerations:

- Local Network usage description in `Info.plist`
- ATS configuration for local HTTP access
- graceful handling when the device restarts and temporarily disappears

## Recommended App Shell

Use a root flow with three gates:

1. device endpoint selection
2. authentication
3. onboarding check

After those gates, show the main tab shell.

### Tabs

- `Dashboard`
- `Schedule`
- `History`
- `Settings`

### Navigation model

Use one `NavigationStack` per tab, each with its own router path.

That fits the existing product well:

- dashboard may push pump details or maintenance screens
- history may push pump-specific detail
- settings naturally contains deeper admin screens

## Recommended Root Types

Suggested top-level types:

```text
StepperDoserApp
AppRootView
AppShellView
AppTab
AppRoute
TabRouter
```

Suggested root state/services:

```text
AppSession
DeviceEndpointStore
AuthStore
SettingsStore
StatusStore
PumpRuntimeStore
RealtimeConnection
DeviceAPIClient
```

Recommended ownership:

- `StepperDoserApp` owns root `@State` reference models
- root installs shared services into the environment
- feature-local draft state stays inside feature views

## Proposed Folder Layout

If we generate the native app, use a structure close to this:

```text
ios/StepperDoser/
  StepperDoserApp.swift
  App/
    AppRootView.swift
    AppShellView.swift
    AppTab.swift
    AppRoute.swift
    TabRouter.swift
  Core/
    Models/
      AuthModels.swift
      SettingsModels.swift
      StatusModels.swift
      PumpModels.swift
      HistoryModels.swift
      BoardConfigModels.swift
    Networking/
      DeviceEndpointStore.swift
      DeviceAPIClient.swift
      RequestBuilder.swift
      APIError.swift
    Realtime/
      RealtimeConnection.swift
      RealtimeEvent.swift
    Persistence/
      KeychainTokenStore.swift
  Features/
    Connection/
      ConnectionSetupView.swift
    Auth/
      LoginView.swift
    Onboarding/
      OnboardingView.swift
    Dashboard/
      DashboardView.swift
      PumpControlCard.swift
      DeviceOverviewCard.swift
      SystemStatusCard.swift
    Schedule/
      ScheduleListView.swift
      ScheduleEditorView.swift
    History/
      HistoryView.swift
      PumpHistoryDetailView.swift
    Settings/
      SettingsHomeView.swift
      NetworkSettingsView.swift
      ServicesSettingsView.swift
      PumpsSettingsView.swift
      FirmwareView.swift
      MaintenanceView.swift
      BoardConfigView.swift
      BackupView.swift
```

## Data Layer Recommendation

Mirror the existing backend contract closely instead of inventing a new abstraction.

### `DeviceAPIClient`

Responsibilities:

- stores current base URL
- injects auth token into requests
- exposes async methods matching backend resources
- translates JSON into Swift domain models

Suggested methods:

- `login(username:password:)`
- `fetchStatus()`
- `fetchSettings()`
- `saveSettings(_:)`
- `fetchBoardConfig()`
- `saveBoardConfig(_:)`
- `fetchPumpRuntime()`
- `fetchPumpHistory()`
- `runPump(_:)`
- `restartDevice()`
- `factoryResetDevice()`
- `scanWiFi()`
- `uploadFirmware(_:)`

### `RealtimeConnection`

Responsibilities:

- build websocket URL from current endpoint + token
- connect/disconnect/reconnect
- parse incoming event payloads
- publish updates into `StatusStore` and `PumpRuntimeStore`
- surface device lifecycle state so the UI can show "restarting" or "reconnected"

This should behave like the current web realtime provider, including:

- welcome/connect bootstrap
- reconnection with backoff
- paused state after repeated failures
- refresh after `system_ready`

## State Model Recommendation

The web app uses one central store with settings/status/runtime slices. Keep the same idea in Swift, but split it into a few focused observable objects.

### `AppSession`

Root coordinator for:

- selected device endpoint
- auth token presence
- overall app phase

Suggested app phase enum:

```swift
enum AppPhase {
  case needsEndpoint
  case needsLogin
  case onboarding
  case ready
}
```

### `SettingsStore`

Owns:

- `SettingsState`
- load/save calls
- transient saving/error states

### `StatusStore`

Owns:

- full `StatusState`
- patch application from websocket events

### `PumpRuntimeStore`

Owns:

- runtime entries
- calibration session draft state
- periodic sync fallback when websocket data is stale

This is a direct native counterpart to the web `pump-runtime-provider`.

## Screen Mapping

### 1. Connection setup

Native-only screen, required before login.

Purpose:

- let the user enter or edit device IP / base URL
- validate basic connectivity
- save the chosen endpoint locally

This is the main thing the web app does not need but iOS does.

### 2. Login

Map from `frontend/src/pages/Login.tsx`.

Native requirements:

- username/password form
- token persistence in Keychain
- redirect to onboarding or main shell after success

### 3. Onboarding

Map from `frontend/src/pages/Onboarding.tsx`.

Keep it as a short wizard:

- secure admin credentials
- configure at least one network
- optionally review board defaults
- mark onboarding complete

### 4. Dashboard

Map from `frontend/src/pages/Home.tsx`.

Recommended mobile composition:

- device overview section
- active pump/tank summary
- manual pump control section
- connectivity/system health section
- today history summary

The home page is the best v1 native screen because it combines the high-frequency actions users want on a phone.

### 5. Schedule

Map from `frontend/src/pages/Schedule.tsx` and `frontend/src/components/schedule-form.tsx`.

Recommended native UX:

- pump picker at top
- segmented mode switch: off / periodic / continuous
- form sections for speed, volume, weekdays, hours

This should be native in v1.

### 6. History

Map from `frontend/src/pages/History.tsx`.

Recommended native UX:

- pump selector
- daily history summary
- chart-backed detail using Swift Charts

This should be native in v1.

### 7. Settings

Start with a settings index screen, then split the details.

Recommended v1 settings screens:

- network settings
- services settings
- pump settings
- maintenance actions

Recommended later settings screens:

- board configuration
- firmware upload
- backup import/export

## What Should Be Native First

### Phase 1

- connection setup
- login
- onboarding
- dashboard
- manual pump control
- schedule editing
- history
- basic settings: network, services, pumps
- restart / factory reset actions

### Phase 2

- pump calibration workflow
- firmware upload
- richer history detail
- Wi-Fi scanning
- better endpoint discovery

### Phase 3

- full board configuration editor
- backup export/import
- parity with every advanced admin form from the web UI

## Why Not Start With Board Configuration

`Settings.Board` is large, validation-heavy, and closer to an installer/admin workflow than a daily-use mobile workflow.

It also carries more risk:

- more complex input validation
- more pin conflict rules
- more chances to create an unusable device configuration from a small-screen UI

That screen should be implemented later, after the core control flow is stable.

## Suggested First Implementation Slice

If we start coding the iOS app, the first milestone should be:

1. create the SwiftUI app shell
2. add endpoint setup
3. add login
4. load `status`, `settings`, and `runtime`
5. render a simplified dashboard
6. connect websocket updates

That gives us an end-to-end usable app quickly.

## Suggested Native Scaffold Sequence

1. Create the Xcode project and root app shell.
2. Add endpoint persistence and connection setup UI.
3. Implement `DeviceAPIClient` and auth.
4. Port the shared API models from `frontend/src/lib/api.ts` into Swift structs.
5. Add root stores: session, settings, status, runtime.
6. Implement websocket connection and patch application.
7. Build the dashboard tab.
8. Build schedule and history tabs.
9. Add settings screens incrementally.

## Recommendation

The right scaffold is:

- a native SwiftUI app
- iOS 17+
- `TabView` with four tabs
- one `NavigationStack` per tab
- a root observable session model
- a thin REST client plus websocket connection
- a mobile-first v1 that focuses on monitoring, pump control, schedules, history, and common settings

Do not start by cloning the entire web settings surface. Start with the connection/login/dashboard/schedule/history path and add the heavier admin tools later.
