# CLAUDE.md — Stepper Doser Root Guide

Read this before making changes. Sub-project details live in sibling files:
- Frontend (React web UI): [`frontend/CLAUDE.md`](frontend/CLAUDE.md)
- iOS native app: [`ios/CLAUDE.md`](ios/CLAUDE.md)

---

## 1. Project Overview

**What**: ESP32-based multi-channel peristaltic pump controller for precise liquid dosing (aquarium/lab/hydroponics). Configurable schedules, manual runs, wear tracking, and a web UI served directly from the device.

**Three sub-projects**:
- **Firmware**: ESP-IDF (C/C++), CMake build system — runs on the ESP32
- **Frontend**: React 19 + TypeScript + Vite web UI, embedded in the firmware binary and served by the ESP32's HTTP server
- **iOS**: SwiftUI native app (`ios/`) that connects to the device over the local network

**Firmware source layout**:
- `main/` — application entry point (`main.c`, `connect.c`, `led.c`, `stepper_task.c`)
- `components/` — custom ESP-IDF components:
  - `app_settings` — NVS-backed settings store; `stepper_board_config_t` is the canonical C struct for board config
  - `app_http_backend` — REST API handlers (`/api/board-config`, `/api/settings`, etc.)
  - `app_provisioning` — BLE-assisted onboarding via `protocomm_ble`; disabled at compile-time with `CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING=n`
  - `app_pumps`, `app_monitor`, `app_mqtt`, `app_time`, `app_interfaces`, `app_adc` — feature components
- `managed_components/` — third-party components
- `partitions.csv` — flash layout
- `ota_server.py` — OTA update helper
- `scripts/build-profile.sh` — build helper for firmware profiles (see §2)
- `defconfig` + `sdkconfig.defaults.legacy` — base sdkconfig files for the two profiles
- `frontend/dist/` — built web UI output that gets embedded in the firmware binary
- `docs/` — project documentation

**Critical constraint**: The web UI ships inside the firmware binary. Bundle size matters — every dependency and every byte counts. Brotli + gzip compression is applied via `vite-plugin-compression2`.

---

## 2. Build Commands

### Firmware

Two build profiles are available:

| Profile | BLE provisioning | Description |
|---------|-----------------|-------------|
| `default` | enabled | Full feature set — `protocomm_ble` onboarding, AP grace period |
| `legacy` | disabled | AP-only onboarding; BLE stack excluded; Wi-Fi IRAM optimization re-enabled |

```bash
# Build (after sourcing ESP-IDF environment)
./scripts/build-profile.sh default          # → build/
./scripts/build-profile.sh legacy           # → build-legacy/
./scripts/build-profile.sh default my-dir  # custom build dir

# Flash + monitor (standard)
idf.py flash monitor
```

The `legacy` profile layers `sdkconfig.defaults.legacy` on top of `defconfig` — no changes to the main `sdkconfig` file needed.

For BLE provisioning tests, use `./scripts/test-ble-provisioning.py`. It speaks the repo's custom encrypted JSON `prov-config` / `prov-status` flow over BLE — use this instead of stock `esp_prov.py`.

The BLE test script depends on ESP-IDF's `esp_prov` Python helpers plus extra packages:

```bash
. $HOME/dev/sdk/esp32/esp-idf-5.5.4/export.sh
python3 -m pip install -r $IDF_PATH/tools/requirements/requirements.test-specific.txt
```

### Frontend

See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for the full frontend build workflow and environment workarounds.

### iOS

See [`ios/CLAUDE.md`](ios/CLAUDE.md) for Xcode build commands and project registration rules.

---

## 3. Firmware — Internals

### 3.1 Board Config C Struct Alignment

The frontend `BoardConfigState` TypeScript type and the iOS `BoardConfig` Swift type must stay in sync with `stepper_board_config_t` in `components/app_settings/include/app_settings.h`.

Key field correspondences:

| C field | Type | Notes |
|---|---|---|
| `uart` | `uint8_t` | |
| `tx_pin` / `rx_pin` | `int32_t` | |
| `motors_num` | `uint8_t` | |
| `channels[MAX_PUMP]` | `stepper_channel_config_t` | |
| `rtc_i2c_addr` / `eeprom_i2c_addr` | `uint8_t` | |
| `i2c_sda_pin` / `i2c_scl_pin` | `int32_t` | |
| `can_tx_pin` / `can_rx_pin` | `int32_t` | -1 = disabled |
| `adc_channels[MAX_BOARD_ADC_CHANNELS]` | `adc_channel_config_t` | |
| `gpio_inputs[MAX_BOARD_GPIO_INPUTS]` | `gpio_input_config_t` | |
| `gpio_outputs[MAX_BOARD_GPIO_OUTPUTS]` | `gpio_output_config_t` | |

Constants: `MAX_BOARD_ADC_CHANNELS = 2`, `MAX_BOARD_GPIO_INPUTS = 3`, `MAX_BOARD_GPIO_OUTPUTS = 3`.

The `board_gpio_pull_t` C enum (`BOARD_GPIO_PULL_NONE=0`, `BOARD_GPIO_PULL_UP=1`, `BOARD_GPIO_PULL_DOWN=2`) must match both the TypeScript `GpioPull` enum and the Swift equivalent exactly.

### 3.2 Time Subsystem (`app_time`)

`app_time` owns the device clock, RTC fallback, NTP synchronization, and the `time_valid` signal used to pause periodic schedules when the date is unsafe.

Boot order is intentionally conservative:

1. Apply the configured timezone.
2. Try to seed the system clock from MCP7940 RTC if the chip is present.
3. If NTP is enabled, wait for Wi-Fi and refresh the clock from SNTP.
4. Write successful NTP time back to RTC so the next boot has a local time source.
5. Leave `time_valid=false` when neither RTC nor NTP provides a sane date (`year >= 2024`).

The component uses a small internal state model for readability and logs transitions:

`not_started` → `rtc_check` → `rtc_valid` / `degraded` → `waiting_wifi` → `sntp_syncing` → `valid` / `degraded`

Keep this as a lightweight lifecycle aid rather than a broad dispatcher unless the time subsystem gains more independent events. Startup NTP waits synchronously so RTC can be seeded before schedules run; runtime settings changes start a short background task so HTTP/event handling is not blocked.

### 3.3 BLE Provisioning (`app_provisioning`)

The `app_provisioning` component provides BLE-assisted Wi-Fi onboarding using ESP-IDF `protocomm_ble`. Only compiled in when `CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING=y` (default profile).

**BLE service UUID**: `92345101-5a91-4e9f-9b31-5e4a2c2fd27d`

**Endpoints** (GATT characteristics):

| Endpoint name | UUID | Purpose |
|---|---|---|
| `prov-session` | 0xFF51 | Security handshake (Security1) |
| `proto-ver` | 0xFF52 | Read version/capabilities JSON |
| `prov-config` | 0xFF53 | Write Wi-Fi credentials + services |
| `prov-status` | 0xFF54 | Read current connection status |

**`prov-config` write payload** (JSON):
```json
{
  "network": { "ssid": "...", "password": "...", "ip_address": "...", "mask": "...", "gateway": "...", "dns": "..." },
  "services": { "hostname": "...", "time_zone": "..." }
}
```

**`prov-status` read response** (JSON): includes `ble_active`, `recovery_mode`, `fallback_mode`, `grace_mode`, `station_connected`, `station_ssid`, `station_ip_address`, `ap_ssid`, `ap_ip_address`, `ap_clients`, `hostname`, `time_zone`.

**Wi-Fi state machine flags** (in `connect.c`, default profile only):

| State flag | Meaning |
|---|---|
| `ap_fallback_active` | Fallback AP is up because STA failed |
| `recovery_mode_active` | AP raised because no STA profiles exist; BLE provisioning active |
| `ap_grace_active` | STA just connected; AP stays up for `WIFI_AP_GRACE_TIMEOUT_MS` to allow BLE to finish |

**Security**: `protocomm_security1` with a PoP (Proof-of-Possession) string derived from the device MAC.

**Note**: There is no frontend or iOS page for BLE provisioning — it is a firmware-side out-of-band flow. The web UI and iOS app are unreachable during provisioning (device has no IP yet).

---

## 4. Shared API Reference

Both the frontend and iOS app consume the same HTTP REST API and WebSocket protocol. This section is the canonical reference for both.

### 4.1 REST Endpoints

All endpoints are relative to `http://<device-ip>`. Authenticated endpoints require the session token from `POST /api/auth` as a cookie or `Authorization` header (implementation-specific — check `app_http_backend`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth` | Authenticate. Body: `{ "username": "...", "password": "..." }`. Returns session token. |
| `GET` | `/api/status` | Full device status snapshot. Large — do not poll; prefer `status_patch` over WebSocket. |
| `GET` | `/api/settings` | All user-configurable settings (networks, services, pumps, time). |
| `POST` | `/api/settings` | Save settings. Body: full or partial settings object. Returns the updated full settings payload. |
| `GET` | `/api/board-config` | Current board-level hardware configuration. |
| `POST` | `/api/board-config` | Save board configuration. Returns the updated saved board config. |
| `GET` | `/api/pumps/runtime` | Current runtime state for all pump channels. |
| `GET` | `/api/pumps/history` | Historical dosing log (daily aggregates). |
| `POST` | `/api/pumps/history/backup` | Flush retained pump history to persistent storage. |
| `POST` | `/api/run` | Trigger a manual pump run. Duration-based body such as `{ "id": 0, "speed": 1, "direction": true, "time_seconds": 10 }`. |
| `POST` | `/api/calibration` | Start or stop pump calibration runs. |
| `POST` | `/api/device/restart` | Restart the device. Body: `{}`. |
| `POST` | `/api/device/factory-reset` | Erase persisted configuration and restart. |

### 4.1.1 Pump Safety And Calibration Fields

`GET /api/settings` pump items may include:

- `max_single_run_ml`
- `max_single_run_seconds`
- `max_hourly_ml`
- `max_daily_ml`

`GET /api/settings` services may include:

- `max_total_daily_ml`

Safety limits are enforced in firmware for manual runs and during active runtime. Periodic schedules requiring dosing volume must have valid calibration points. If calibration is missing or a limit would be exceeded, the firmware rejects the request with `400 Bad Request`.

### 4.2 WebSocket Protocol

**Endpoint**: `ws://<device-ip>/ws`

The device sends JSON messages. Each message has a `type` field:

| `type` | Direction | Description |
|---|---|---|
| `welcome` | server → client | Sent on connection. Contains device info. |
| `pong` | server → client | Response to a `ping` from the client. |
| `status_patch` | server → client | Partial status update — only changed fields under `status`. Merge into local state, do not replace. |
| `pump_runtime` | server → client | Pump activity event (running, stopped, dispensed volume, alert flags, driver health). |
| `system_ready` | server → client | Device finished booting / reconnected. |
| `shutting_down` | server → client | Device is about to restart. |

**`status_patch` tracked fields** — the minimum set the firmware tracks and emits when changed:

`up_time`, `local_time`, `local_date`, `free_heap`, `vcc`, `wifi_mode`, `ip_address`, `station_connected`, `station_ssid`, `station_ip_address`, `ap_ssid`, `ap_ip_address`, `ap_clients`, `board_temperature`, `wifi_disconnects`, `time_valid`, `time_warning`, `mqtt_service`, `ntp_service`

**Design rule**: Do not push the full `GET /api/status` response over WebSocket on every monitor tick. Too large for the ESP32 and most fields are unchanged. Detect changed fields in firmware, emit only those, merge on the client.

**`pump_runtime` tracked fields** — runtime snapshots include:

- `id`, `active`, `state`, `speed`, `direction`
- `remaining_ticks`, `remaining_seconds`, `volume_ml`
- `alert_flags`
- `driver`

`driver` currently exposes UART-derived TMC2209 health fields such as `uart_ready`, `reset`, `driver_error`, `undervoltage`, `otpw`, `ot`, short/open-load bits, `thermal_level`, `cs_actual`, `stealth`, `standstill`, and `version`.

---

## 5. Commit & PR Conventions

Recent commit message style (see `git log`):

```
Fix Device card height stretch and maintenance button overflow on Home page
Compact Schedule page and Home page cards, merge Maintenance into Device
History page: polish heatmap layout, add daily volume chart, fix dark selection
Add GPIO inputs/outputs and ADC channels to board configuration
BLE Provisioning and new firmware assembly options with legacy WIFI AP only
```

Guidelines:
- **Imperative mood** ("Fix", "Compact", "Add" — not "Fixed", "Compacts")
- **Mention the page, component, or subsystem** affected
- **One subject line** under 80 chars; body optional
- **Do not mention tools** ("Claude", "AI", "Copilot") in commit messages unless the user asks

Always confirm with the user before committing. Never push, force-push, or amend without explicit instruction. Never use `--no-verify`.

---

*Last updated: iOS native app (SwiftUI, @Observable, StepperTokens design system, haptics, RealtimeConnection WebSocket); shared API reference extracted to root CLAUDE.md; BLE provisioning (default firmware profile); Board Configuration presets (Fysetc E4 v1.0 — 1/2/4ch) + extended peripheral fields; Backup & Restore page; font scale selector; pump safety limits; multi-point calibration validation; TMC2209 UART health in pump runtime payloads; app_time RTC/NTP lifecycle state notes; language/i18n deferred.*
