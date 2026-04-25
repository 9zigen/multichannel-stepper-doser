# Multichannel Stepper Motor Doser

## Hardware Flash Target

Current hardware is expected to ship with 8 MB to 16 MB flash. The partition
table uses two 3840 KB OTA app slots, leaving room for the firmware, embedded
web UI, and PWA assets while keeping OTA updates available. Older 4 MB flash
layouts are no longer the default target for active development.

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

## Web UI PWA

The device-served web UI includes a manifest and a small service worker so the
interface can be installed as a PWA where the browser allows it. The service
worker caches only the app shell and static assets; API calls, WebSocket
telemetry, and uploads are never intercepted, so live dosing control always
uses the current device connection.

For BLE onboarding tests against the custom `prov-config` / `prov-status`
endpoints, use:

```bash
./scripts/test-ble-provisioning.py --service-name DOSING-A1B2C3 --ssid YourWiFi --wifi-passphrase YourPass
```

This script expects the ESP-IDF Python environment to be active and targets the
custom JSON provisioning flow implemented by the firmware, not the stock
Espressif Wi-Fi provisioning protobuf payload.

If the script reports missing `protobuf` / `bleak` helpers, install the
ESP-IDF test-specific Python extras once inside the ESP-IDF environment:

```bash
. $HOME/dev/sdk/esp32/esp-idf-5.5.4/export.sh
python3 -m pip install -r $IDF_PATH/tools/requirements/requirements.test-specific.txt
```

## Realtime lifecycle

The web UI listens on `/ws` and now receives lifecycle events in addition to pump runtime updates:

- `{"type":"shutting_down"}` before restart/factory reset so connected clients can show a restart banner
- `{"type":"system_ready"}` after startup settles, MQTT is started, and an additional reconnect delay has elapsed

`system_ready` includes firmware metadata so the frontend can refresh cached data and force a page reload when the firmware version changed.
