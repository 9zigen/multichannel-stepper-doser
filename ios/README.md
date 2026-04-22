# iOS Scaffold

This folder contains the first native iPhone scaffold for the Stepper Doser app.

It is organized as:

- `project.yml`: XcodeGen project spec
- `StepperDoser/`: SwiftUI app sources

Recommended next steps:

1. Generate the Xcode project with `xcodegen generate` from this `ios/` folder.
2. Open the generated `StepperDoser.xcodeproj`.
3. Replace the placeholder app icon set.
4. Fill in the remaining feature views and BLE onboarding bridge.

The current scaffold already includes:

- endpoint setup
- auth token storage
- settings/status bootstrap
- onboarding gate
- realtime WebSocket client
- four-tab shell for dashboard, schedule, history, and settings
