# CLAUDE.md — iOS Native App (SwiftUI)

Read this before making any iOS changes. See also:
- Root project guide (firmware internals, shared REST/WebSocket API): [`../CLAUDE.md`](../CLAUDE.md)
- Frontend web UI: [`../frontend/CLAUDE.md`](../frontend/CLAUDE.md)

---

## 1. Tech Stack

- **SwiftUI** + **@Observable** (iOS 17+) + UIKit bridges where needed
- Minimum deployment target: **iOS 17**
- No third-party Swift packages — all networking and persistence is hand-rolled

---

## 2. Architecture

### 2.1 Core Types

**`AppSession`** (`Core/Stores/AppSession.swift`)
- `@MainActor @Observable` central store
- Owns: `ManagedDeviceStore`, `KeychainTokenStore`, `DeviceAPIClient`, `RealtimeConnection`
- Also owns `theme: AppTheme` preference (stored in `UserDefaults` as `'app_theme'`)
- Applied via `.preferredColorScheme(session.theme.colorScheme)` on the root `WindowGroup`

**`ManagedDeviceStore`** (`Core/Persistence/ManagedDeviceStore.swift`)
- Persists `[ManagedDevice]` to UserDefaults as JSON
- Has equality guard in `updateDevice` — skips encode + write if nothing changed (critical for performance — do not remove)

**`RealtimeConnection`** (`Core/Realtime/RealtimeConnection.swift`)
- WebSocket client, reconnects with exponential backoff (5 attempts)
- Exposes `status: Status` enum: `connecting / connected / reconnecting / paused`
- Exposes `attempt: Int`

**`AppTheme`** (defined in `AppSession.swift`)
- Enum: `system | light | dark`
- Stored in `UserDefaults` as `'app_theme'`
- Applied via `.preferredColorScheme(session.theme.colorScheme)` on the root `WindowGroup`

### 2.2 REST and WebSocket

The device exposes a REST API and WebSocket. See [`../CLAUDE.md §4`](../CLAUDE.md) for the full endpoint and protocol reference. The iOS app uses `DeviceAPIClient` for REST calls and `RealtimeConnection` for WebSocket.

---

## 3. Design Tokens (`StepperTokens.swift`)

All design tokens live in `ios/StepperDoser/Core/Design/StepperTokens.swift`.

### 3.1 Colors

`StepperColor` — **ALL** tokens are adaptive `Color(uiColor: UIColor { trait in ... })`. Never use hardcoded hex directly. Dark palette based on slate-900, light palette based on slate-50/white.

**Key color values:**

| Token | Dark mode | Light mode | Notes |
|---|---|---|---|
| `background` | `#0f172a` | `#f1f5f9` | Page background |
| `foreground` | `#e2e8f0` | `#0f172a` | Primary text |
| `mutedForeground` | `#94a3b8` (slate-400) | `#475569` (slate-600) | Subdued/caption text |
| `primary` | `#22d3ee` | `#0891b2` | Cyan accent |
| `border` | `#1e293b` | `#cbd5e1` | Dividers, outlines |
| `destructive` | `#ef4444` | `#dc2626` | Stop, delete, critical |
| `warning` | `#f59e0b` | `#d97706` | Caution states |

`mutedForeground` contrast ratios: ~5.7:1 (dark), ~6.5:1 (light) — both pass WCAG AA.

### 3.2 Typography

`StepperFont` — all sizes chosen to meet 11pt minimum readable threshold:

| Token | Size | Weight | Use |
|---|---|---|---|
| `title` | 18pt | semibold | Card/panel title |
| `section` | 16pt | semibold | List item headline |
| `metricValue` | 19pt | semibold | Metric tile values (monospaced digits) |
| `body` | 15pt | regular | Form fields, primary content |
| `small` | 14pt | regular | Secondary rows, table cells |
| `caption` | 13pt | regular | Help text, descriptions below fields |
| `micro` | 11pt | medium | Section labels, chip text, uppercase tags |
| `nano` | 11pt | regular | Heatmap axes, legends |
| `mono` | 13pt | medium | IP addresses, firmware hashes |
| `monoSmall` | 12pt | medium | Compact numeric data |

**Rule**: never use inline `.font(.system(size: N))` below 11pt. Use tokens or 11pt minimum.

### 3.3 Spacing & Radius

`StepperSpacing`: `xs=2 · sm=6 · md=8 · lg=12 · xl=16 · xxl=24`
`StepperRadius`: `sm=2 · md=4 · lg=8 · xl=12`
`StepperLayout`: `panelPadding=xl · cardPadding=xl · inputHorizontalPadding=lg · inputVerticalPadding=10`

### 3.4 Haptics

`StepperHaptic` — `@MainActor enum` with static methods:
- `selection()`, `light()`, `medium()`, `warning()`, `success()`

All button styles apply haptics via `.onChange(of: configuration.isPressed)`. The `@MainActor` annotation is required — UIFeedbackGenerator methods are MainActor-isolated (see §7.6).

### 3.5 Button Styles

- `StepperPrimaryButtonStyle` — cyan fill, full-width, prominent
- `StepperSecondaryButtonStyle` — outlined, full-width
- `StepperDestructiveButtonStyle` — red fill, for Stop/Delete actions
- `StepperGhostButtonStyle` — transparent, text-only

All apply haptics on press via `.onChange(of: configuration.isPressed)`.

### 3.6 StepperTextField

`UIViewRepresentable` wrapping `UITextField`.

**Critical rules**:
- **ALL static config in `makeUIView` only** — colors, fonts, `textContentType`, placeholder, keyboard type
- **`updateUIView` only syncs `text` and `isSecureTextEntry`** — anything else forces UIKit to reload the QuickType bar on every keystroke (see §7.3)
- Has `textAlignment: NSTextAlignment = .natural` parameter
- Number pad keyboards get a `UIToolbar` accessory with chip preset buttons on the left and a Done pill on the right
- Chip buttons use `UIButton(type: .custom)` with CALayer styling — **NOT** `UIButton.Configuration` (causes oval shape artifacts — see §7.4)

**Height warning**: `StepperInputShell` (`.stepperInputField()`) adds `padding(.vertical, 10)` around its content. Never set `.frame(height: N)` on the text field before calling `.stepperInputField()` — the padding stacks on top and makes it taller than buttons. Let the shell determine height naturally. (see §7.7)

### 3.7 Layout Components

| Component | Notes |
|---|---|
| `StepperPage` | Scroll container for full pages |
| `StepperBackground` | Gradient background for auth/connecting screens |
| `StepperCard` | Elevated card with shadow |
| `StepperPanel` | Flat inner section panel |
| `StepperBadge` | Inline status chip: `.primary .secondary .outline .warning .destructive` |
| `StepperSectionLabel` | Uppercase micro-label above sections |
| `StepperKeyValueRow` | Horizontal label + trailing content row |
| `StepperEmptyState` | Centered icon + title + message placeholder |
| `StepperMetricTile` | 2-column metric grid cell: label / value / caption / tone |
| `StepperSelectionChip` | Selectable chip — see `expand` parameter below |
| `StepperWearBar` | Segmented progress bar with warning mark |
| `StepperWeeklyHeatmap` | Day-level heatmap (History page) |
| `StepperMiniBarChart` | Bar chart for recent day volumes |
| `MiniTankView` | Vertical tank fill icon (Dashboard pump overview) |

#### StepperSelectionChip — `expand` parameter

```swift
StepperSelectionChip(title: name, isSelected: selected, expand: true)  // default
StepperSelectionChip(title: name, isSelected: selected, expand: false) // content-sized
```

- `expand: true` (default) — `frame(maxWidth: .infinity)`, equal-width in `HStack`. Use for **fixed-option selectors** (Off/Periodic/Continuous, weekdays, hour grid).
- `expand: false` — sizes to content width with `StepperSpacing.xl` horizontal inset. **Always pair with `ScrollView(.horizontal, showsIndicators: false)`** for pump name rows. Long names scroll rather than truncating.

```swift
// Pump name selector pattern
ScrollView(.horizontal, showsIndicators: false) {
    HStack(spacing: StepperSpacing.xs) {
        ForEach(pumps) { pump in
            Button { select(pump.id) } label: {
                StepperSelectionChip(title: pump.name, isSelected: pump.id == selected, expand: false)
            }
            .buttonStyle(.plain)
        }
    }
}
```

#### Inline stepper pattern (DurationStepper / SpeedStepper / DirectionToggle)

Used in `PumpManualRunControls` (Dashboard). Shared structure:
- Fixed height **44pt** — matches button height exactly
- `−` and `+` buttons as `Image(systemName:)` with `.frame(width: 44, height: 44)` tap target
- Thin `Rectangle` dividers between sections (1pt wide, 20pt tall)
- Center label uses `.contentTransition(.numericText())` + `.animation(.snappy, value: N)` for animated flip
- Styled with `StepperInputShell`-equivalent background (popover fill + input border + xl radius)
- Step size scales with current value: `< 60s → ±10s`, `60–299s → ±30s`, `≥ 300s → ±60s`

---

## 4. Dashboard Architecture (`DashboardView.swift`)

The dashboard is the most complex view. Key sections and their private structs:

### 4.1 Controller Card (8-tile grid, 2 columns)

| Tile | Data source | Tone logic |
|---|---|---|
| Wi-Fi Mode | `status.wifiMode` | primary if station connected |
| Network | `stationSsid` / `apSsid` | primary if station, neutral if AP only |
| IP Address | `stationIpAddress` / `apIpAddress` | neutral |
| Reboots | `status.rebootCount` | warning if > 10 |
| Memory | `status.freeHeap / 1024` kB | warning < 60kB, destructive < 30kB |
| Uptime | `status.upTime` | neutral |
| MQTT | `status.mqttService.enabled/connected` | primary/warning/neutral |
| NTP | `status.ntpService.enabled/sync` | primary/warning/neutral |

### 4.2 Pumps Overview Card (`PumpsOverviewCard` / `PumpOverviewRow`)

Compact per-pump summary showing:
- Name + Active/Idle badge
- Schedule mode + amount + Wear badge
- `MiniTankView` icon on the right (vertical tank, fills from bottom by `tankRatio`)
- Active countdown line when pump is running

`MiniTankView`: uses `scaleEffect(y: ratio, anchor: .bottom)` on a `Color` fill inside an overlay — no `GeometryReader` needed. Cap rendered as a separate narrow `RoundedRectangle` at top.

### 4.3 Today's Dosing Card (`TodayDosingCard`)

Loaded automatically via `.task { if session.history == nil { await session.refreshHistory() } }`.

Contains:
- Pump selector (`expand: false` chips in `ScrollView(.horizontal)`)
- `HourlyHeatmapView`: 2-row × 12-column grid (AM 0–11 / PM 12–23), cell opacity = `0.15 + ratio * 0.70`
- 3-column metric grid: Volume / Runtime / Active hours
- Busiest hours list (top 3 by volume)
- `NavigationLink` to `HistoryView`

### 4.4 Manual Run Controls (`PumpManualRunControls`)

Three sub-components, each exactly **44pt tall**:

| Component | Purpose |
|---|---|
| `DurationStepper` | ±seconds with smart step size + numericText animation |
| `DirectionToggle` | Forward ↻ / Reverse ↺ split button |
| `SpeedStepper` | ±1 rpm stepper |

State initialises from `pump.schedule.speed` and `pump.direction` via `.task(id: pump.id)` — resets when pump selection changes. All three values passed to `onRun(pump, seconds, speed, direction)`.

---

## 5. Performance Rules

These rules exist because violations caused real user-visible bugs. Do not deviate without understanding the root cause.

### 5.1 @State Text Fields — Lightweight Child Struct

`@State` for text fields **must** be in a lightweight child struct, never in a parent that owns `ultraThinMaterial` or large shadows. Every keystroke triggers a re-render; if the parent contains expensive GPU operations, each keystroke triggers a full material re-composite.

### 5.2 updateUIView — Only Runtime-Changing Properties

`updateUIView` in `UIViewRepresentable` must **only** set properties that change at runtime (i.e., `text` and `isSecureTextEntry` for `StepperTextField`). Setting static props (colors, fonts, `textContentType`) in `updateUIView` forces UIKit to reload the QuickType bar on every keystroke.

### 5.3 syncSelectedDeviceMetadata — Never Call from apply(statusPatch:)

`syncSelectedDeviceMetadata()` does synchronous JSON encode + UserDefaults write + array sort. `apply(statusPatch:)` is called on every status patch (every few seconds). Calling sync from apply blocks the main thread and causes "System gesture gate timed out" — taps fail.

**Only call `syncSelectedDeviceMetadata()` from `refresh()` and `login()`.**

### 5.4 ManagedDeviceStore Equality Guard

`ManagedDeviceStore.updateDevice()` has an equality guard that skips encode + write if nothing changed. Do not remove it or work around it.

---

## 6. Xcodeproj Registration

New Swift files need **four** entries in `project.pbxproj`:
1. `PBXBuildFile` entry
2. `PBXFileReference` entry
3. Group child entry (in the correct folder group)
4. `Sources` build phase entry

After editing `project.pbxproj` manually, validate:
```bash
plutil -lint ios/StepperDoser.xcodeproj/project.pbxproj
```

A file that exists on disk but is not registered will silently not compile.

---

## 7. Build Command

```bash
xcodebuild -project StepperDoser.xcodeproj -scheme StepperDoser \
  -destination "id=<simulator-id>" build 2>&1 | \
  grep -i "error:\|BUILD SUCCEEDED\|BUILD FAILED"
```

**Always run this before reporting a change done.** A file that type-checks in isolation may still fail when Xcode links everything together.

---

## 8. Known Fixes (Don't Repeat These Mistakes)

### 8.1 Keyboard Slow / Gesture Gate Timeout

**Symptom**: "System gesture gate timed out" in logs; taps on the keyboard and UI fail intermittently.

**Root cause**: `syncSelectedDeviceMetadata()` was called from `apply(statusPatch:)`. Status patches arrive every few seconds. Each call did synchronous JSON encode + UserDefaults write + array sort on the main thread.

**Fix**: Remove `syncSelectedDeviceMetadata()` from `apply(statusPatch:)`. Only call it from `refresh()` and `login()`.

### 8.2 Text Field Re-renders Slow

**Symptom**: Typing in a text field feels sluggish or drops frames.

**Root cause**: `@State` text field owned by a parent view containing `ultraThinMaterial` or `shadow(radius: 16)`. Every keystroke re-renders the parent, triggering GPU-expensive material compositing.

**Fix**: Extract the text field into a lightweight child struct that owns its own `@State`.

### 8.3 UITextField QuickType Bar Reloads Every Keystroke

**Symptom**: Autocomplete/QuickType suggestions flicker or reset on every character typed.

**Root cause**: Setting `textContentType`, colors, or fonts in `updateUIView`.

**Fix**: Move **all** static configuration (colors, fonts, `textContentType`, placeholder, keyboard type) to `makeUIView` only. `updateUIView` must only sync `text` and `isSecureTextEntry`.

### 8.4 UIButton Oval Shape Artifact

**Symptom**: Custom button in `UIToolbar` renders with an unwanted oval/pill background.

**Root cause**: `UIButton.Configuration` composites a private background view that overrides the button's shape.

**Fix**: Use `UIButton(type: .custom)` and apply styling directly via CALayer properties. Do not use `UIButton.Configuration` for custom-shaped buttons.

### 8.5 New File Not Building

**Symptom**: New Swift file exists on disk, no compiler errors in the editor, but the build fails with a linker error or the symbol is not found.

**Root cause**: File not registered in `project.pbxproj`.

**Fix**: Add PBXBuildFile + PBXFileReference + group child + Sources build phase entry to `project.pbxproj`. Validate with `plutil -lint`.

### 8.6 Haptic Feedback "Main Actor" Warnings

**Symptom**: Compiler warnings or errors about `UIFeedbackGenerator` methods being called from a non-isolated context.

**Root cause**: `UIFeedbackGenerator` methods are `@MainActor`-isolated.

**Fix**: Mark the `StepperHaptic` enum `@MainActor`.

### 8.7 Input Field Taller Than Adjacent Button

**Symptom**: A text field wrapped with `.stepperInputField()` is visually taller than a button next to it in an `HStack`.

**Root cause**: `StepperInputShell` adds `padding(.vertical, 10)` around its content. If `.frame(height: N)` is set on the field first, the padding stacks on top: total = N + 20. Buttons use `padding(.vertical, 12)` around `~17pt` body font ≈ 41pt.

**Fix**: Do **not** set `.frame(height:)` on a field that will receive `.stepperInputField()`. Instead, use a custom control (like `DurationStepper`) with an explicit `.frame(height: 44)` that includes the background styling internally.

---

## 9. Things to Avoid

- **Don't set static UITextField properties in `updateUIView`** — colors, fonts, `textContentType` all go in `makeUIView` only
- **Don't own `@State` text fields in a view containing `ultraThinMaterial` or `shadow(radius: 16)`** — extract to a lightweight child struct
- **Don't call `syncSelectedDeviceMetadata()` on every status patch** — only from `refresh()` and `login()`
- **Don't use `UIButton.Configuration` for custom-shaped buttons** — use `UIButton(type: .custom)` with CALayer
- **Don't forget xcodeproj registration** for new Swift files — add all four entries and run `plutil -lint`
- **Don't skip the build check** — always run `xcodebuild` before reporting done
- **Don't use `--no-verify`** on git commits
- **Don't use inline font sizes below 11pt** — use `StepperFont` tokens or minimum 11pt
- **Don't use `StepperSelectionChip(expand: true)` inside `ScrollView(.horizontal)`** — `maxWidth: .infinity` expands to unconstrained width; use `expand: false` instead
- **Don't set `.frame(height:)` before `.stepperInputField()`** — the padding stacks; use a custom stepper control instead
- **Language/i18n**: Not implemented. Strings are hardcoded English. Do not add i18n infrastructure until explicitly requested.

---

## 10. Key File Pointers

| File | Purpose |
|---|---|
| `StepperDoser/Core/Design/StepperTokens.swift` | All design tokens, button styles, layout components, `StepperTextField`, `StepperSelectionChip`, `MiniTankView` |
| `StepperDoser/Core/Stores/AppSession.swift` | Central observable session + `AppTheme` enum |
| `StepperDoser/Core/Persistence/ManagedDeviceStore.swift` | Device list persistence |
| `StepperDoser/Core/Realtime/RealtimeConnection.swift` | WebSocket client |
| `StepperDoser/App/AppRootView.swift` | Auth/boot routing + `ConnectingView` |
| `StepperDoser/App/AppShellView.swift` | `TabView` shell + `RealtimeStatusBanner` injection |
| `StepperDoser/App/RealtimeStatusBanner.swift` | Connection status banner (`safeAreaInset` top) |
| `StepperDoser/Features/Dashboard/DashboardView.swift` | Controller card · Pumps Overview · Today's Dosing · `PumpManualRunControls` · `DurationStepper` · `DirectionToggle` · `SpeedStepper` · `MiniTankView` · `HourlyHeatmapView` · `TodayDosingCard` |
| `StepperDoser/Features/Schedule/ScheduleListView.swift` | Schedule editor + `ScheduleNumberAdjuster` |
| `StepperDoser/Features/History/HistoryView.swift` | Weekly heatmap + bar chart + day detail |
| `StepperDoser/Features/Settings/SettingsHomeView.swift` | Settings + appearance picker + live MQTT/NTP + system info |
| `StepperDoser/Features/Devices/DeviceManagementView.swift` | Device list, add/edit/delete |
| `StepperDoser/Features/Auth/LoginView.swift` | Full-screen centered login |
| `StepperDoser/Features/Onboarding/OnboardingView.swift` | First-run credential setup |
| `StepperDoser.xcodeproj/project.pbxproj` | Xcode project file — must be updated when adding Swift files |
