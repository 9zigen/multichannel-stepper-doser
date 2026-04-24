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

### 3.2 Other Tokens

- `StepperRadius` — static enum of corner radii
- `StepperSpacing` — static enum of spacing values
- `StepperLayout` — static enum of layout constants
- `StepperFont` — static enum of font styles

### 3.3 Haptics

`StepperHaptic` — `@MainActor enum` with static methods:
- `selection()`, `light()`, `medium()`, `warning()`, `success()`

All button styles apply haptics via `.onChange(of: configuration.isPressed)`. The `@MainActor` annotation is required — UIFeedbackGenerator methods are MainActor-isolated (see §7.6).

### 3.4 Button Styles

- `StepperPrimaryButtonStyle`
- `StepperSecondaryButtonStyle`
- `StepperDestructiveButtonStyle`
- `StepperGhostButtonStyle`

All apply haptics on press via `.onChange(of: configuration.isPressed)`.

### 3.5 StepperTextField

`UIViewRepresentable` wrapping `UITextField`.

**Critical rules**:
- **ALL static config in `makeUIView` only** — colors, fonts, `textContentType`, placeholder, keyboard type
- **`updateUIView` only syncs `text` and `isSecureTextEntry`** — anything else forces UIKit to reload the QuickType bar on every keystroke (see §7.3)
- Has `textAlignment: NSTextAlignment = .natural` parameter
- Number pad keyboards get a `UIToolbar` accessory with chip preset buttons on the left and a Done pill on the right
- Chip buttons use `UIButton(type: .custom)` with CALayer styling — **NOT** `UIButton.Configuration` (causes oval shape artifacts — see §7.4)

### 3.6 Layout Components

`StepperPage`, `StepperBackground`, `StepperCard`, `StepperPanel`, `StepperBadge`, `StepperSectionLabel`, `StepperKeyValueRow`, `StepperEmptyState`, `StepperMetricTile`, `StepperSelectionChip`, `StepperWearBar`, `StepperWeeklyHeatmap`, `StepperMiniBarChart`

---

## 4. Performance Rules

These rules exist because violations caused real user-visible bugs. Do not deviate without understanding the root cause.

### 4.1 @State Text Fields — Lightweight Child Struct

`@State` for text fields **must** be in a lightweight child struct, never in a parent that owns `ultraThinMaterial` or large shadows. Every keystroke triggers a re-render; if the parent contains expensive GPU operations, each keystroke triggers a full material re-composite.

### 4.2 updateUIView — Only Runtime-Changing Properties

`updateUIView` in `UIViewRepresentable` must **only** set properties that change at runtime (i.e., `text` and `isSecureTextEntry` for `StepperTextField`). Setting static props (colors, fonts, `textContentType`) in `updateUIView` forces UIKit to reload the QuickType bar on every keystroke.

### 4.3 syncSelectedDeviceMetadata — Never Call from apply(statusPatch:)

`syncSelectedDeviceMetadata()` does synchronous JSON encode + UserDefaults write + array sort. `apply(statusPatch:)` is called on every status patch (every few seconds). Calling sync from apply blocks the main thread and causes "System gesture gate timed out" — taps fail.

**Only call `syncSelectedDeviceMetadata()` from `refresh()` and `login()`.**

### 4.4 ManagedDeviceStore Equality Guard

`ManagedDeviceStore.updateDevice()` has an equality guard that skips encode + write if nothing changed. Do not remove it or work around it.

---

## 5. Xcodeproj Registration

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

## 6. Build Command

```bash
xcodebuild -project StepperDoser.xcodeproj -scheme StepperDoser \
  -destination "id=<simulator-id>" build 2>&1 | \
  grep -i "error:\|BUILD SUCCEEDED\|BUILD FAILED"
```

**Always run this before reporting a change done.** A file that type-checks in isolation may still fail when Xcode links everything together.

---

## 7. Known Fixes (Don't Repeat These Mistakes)

### 7.1 Keyboard Slow / Gesture Gate Timeout

**Symptom**: "System gesture gate timed out" in logs; taps on the keyboard and UI fail intermittently.

**Root cause**: `syncSelectedDeviceMetadata()` was called from `apply(statusPatch:)`. Status patches arrive every few seconds. Each call did synchronous JSON encode + UserDefaults write + array sort on the main thread.

**Fix**: Remove `syncSelectedDeviceMetadata()` from `apply(statusPatch:)`. Only call it from `refresh()` and `login()`.

### 7.2 Text Field Re-renders Slow

**Symptom**: Typing in a text field feels sluggish or drops frames.

**Root cause**: `@State` text field owned by a parent view containing `ultraThinMaterial` or `shadow(radius: 16)`. Every keystroke re-renders the parent, triggering GPU-expensive material compositing.

**Fix**: Extract the text field into a lightweight child struct that owns its own `@State`.

### 7.3 UITextField QuickType Bar Reloads Every Keystroke

**Symptom**: Autocomplete/QuickType suggestions flicker or reset on every character typed.

**Root cause**: Setting `textContentType`, colors, or fonts in `updateUIView`.

**Fix**: Move **all** static configuration (colors, fonts, `textContentType`, placeholder, keyboard type) to `makeUIView` only. `updateUIView` must only sync `text` and `isSecureTextEntry`.

### 7.4 UIButton Oval Shape Artifact

**Symptom**: Custom button in `UIToolbar` renders with an unwanted oval/pill background.

**Root cause**: `UIButton.Configuration` composites a private background view that overrides the button's shape.

**Fix**: Use `UIButton(type: .custom)` and apply styling directly via CALayer properties. Do not use `UIButton.Configuration` for custom-shaped buttons.

### 7.5 New File Not Building

**Symptom**: New Swift file exists on disk, no compiler errors in the editor, but the build fails with a linker error or the symbol is not found.

**Root cause**: File not registered in `project.pbxproj`.

**Fix**: Add PBXBuildFile + PBXFileReference + group child + Sources build phase entry to `project.pbxproj`. Validate with `plutil -lint`.

### 7.6 Haptic Feedback "Main Actor" Warnings

**Symptom**: Compiler warnings or errors about `UIFeedbackGenerator` methods being called from a non-isolated context.

**Root cause**: `UIFeedbackGenerator` methods are `@MainActor`-isolated.

**Fix**: Mark the `StepperHaptic` enum `@MainActor`.

---

## 8. Things to Avoid

- **Don't set static UITextField properties in `updateUIView`** — colors, fonts, `textContentType` all go in `makeUIView` only
- **Don't own `@State` text fields in a view containing `ultraThinMaterial` or `shadow(radius: 16)`** — extract to a lightweight child struct
- **Don't call `syncSelectedDeviceMetadata()` on every status patch** — only from `refresh()` and `login()`
- **Don't use `UIButton.Configuration` for custom-shaped buttons** — use `UIButton(type: .custom)` with CALayer
- **Don't forget xcodeproj registration** for new Swift files — add all four entries and run `plutil -lint`
- **Don't skip the build check** — always run `xcodebuild` before reporting done
- **Don't use `--no-verify`** on git commits
- **Language/i18n**: Not implemented. Strings are hardcoded English. Do not add i18n infrastructure until explicitly requested.

---

## 9. Key File Pointers

| File | Purpose |
|---|---|
| `StepperDoser/Core/Design/StepperTokens.swift` | All design tokens, button styles, layout components, `StepperTextField` |
| `StepperDoser/Core/Stores/AppSession.swift` | Central observable session + `AppTheme` enum |
| `StepperDoser/Core/Persistence/ManagedDeviceStore.swift` | Device list persistence |
| `StepperDoser/Core/Realtime/RealtimeConnection.swift` | WebSocket client |
| `StepperDoser/App/AppRootView.swift` | Auth/boot routing + `ConnectingView` |
| `StepperDoser/App/AppShellView.swift` | `TabView` shell + `RealtimeStatusBanner` injection |
| `StepperDoser/App/RealtimeStatusBanner.swift` | Connection status banner (`safeAreaInset` top) |
| `StepperDoser/Features/Dashboard/DashboardView.swift` | Main dashboard + `PumpManualRunControls` |
| `StepperDoser/Features/Schedule/ScheduleListView.swift` | Schedule editor + `ScheduleNumberAdjuster` |
| `StepperDoser/Features/History/HistoryView.swift` | Heatmap + bar chart |
| `StepperDoser/Features/Settings/SettingsHomeView.swift` | Settings + appearance picker + system info |
| `StepperDoser/Features/Devices/DeviceManagementView.swift` | Device list, add/edit/delete |
| `StepperDoser/Features/Auth/LoginView.swift` | Full-screen centered login |
| `StepperDoser/Features/Onboarding/OnboardingView.swift` | First-run credential setup |
| `StepperDoser.xcodeproj/project.pbxproj` | Xcode project file — must be updated when adding Swift files |
