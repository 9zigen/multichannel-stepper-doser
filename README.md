# Multichannel Stepper Motor Doser

## Firmware Profiles

Two firmware build profiles are available now:

- `default`: BLE provisioning enabled, AP grace period enabled
- `legacy`: AP-only onboarding, Bluetooth disabled in sdkconfig defaults, Wi-Fi IRAM optimization re-enabled

After sourcing the ESP-IDF environment, you can build either profile with:

```bash
./scripts/build-profile.sh default
./scripts/build-profile.sh legacy
```

The legacy profile uses [sdkconfig.defaults.legacy](/Users/alekseyvolkov/dev/esp32/STEPPER_DOSER/sdkconfig.defaults.legacy) on top of [defconfig](/Users/alekseyvolkov/dev/esp32/STEPPER_DOSER/defconfig), so it does not require editing the main [sdkconfig](/Users/alekseyvolkov/dev/esp32/STEPPER_DOSER/sdkconfig) just to get a BLE-free image.

## Realtime lifecycle

The web UI listens on `/ws` and now receives lifecycle events in addition to pump runtime updates:

- `{"type":"shutting_down"}` before restart/factory reset so connected clients can show a restart banner
- `{"type":"system_ready"}` after startup settles, MQTT is started, and an additional reconnect delay has elapsed

`system_ready` includes firmware metadata so the frontend can refresh cached data and force a page reload when the firmware version changed.
