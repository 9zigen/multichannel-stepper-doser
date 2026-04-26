# NVM and EEPROM Writes

This note summarizes every known persistent write path in the firmware. It is
intended for quick human review when changing persistence behavior, flash
partition sizes, or power-loss handling.

## Storage Backends

- `storage` NVS namespace: general configuration, auth, app state, pump aging,
  and EEPROM fallback keys.
- `pump_hist` NVS namespace: retained pump dosing history blobs.
- I2C EEPROM backend: runtime counters that are useful across power loss.
- EEPROM fallback: if I2C is unavailable or fails, the same EEPROM API writes
  NVS keys named `EE_xxxx` in the `storage` namespace.
- OTA partitions: firmware and embedded web assets are written during OTA.

## Write Table

| Data | Backend | Key or address | Trigger | Typical frequency | Wear risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Network settings | NVS `storage` | `network` | Network settings save, provisioning apply, first default init | User action | Low | Includes Wi-Fi, Ethernet, Thread, CAN network config. |
| Service settings | NVS `storage` | `service` | Services settings save, provisioning apply, time-zone-only update, default/normalization init | User action | Low | Includes hostname, OTA URL, NTP, MQTT, discovery, global daily safety limit. |
| Pump settings | NVS `storage` | `PUMP1_CFG` ... `PUMP4_CFG` | Pump settings save, default init | User action | Low | One blob per pump. Includes tank config, current tank value snapshot, direction, safety limits, calibration count. |
| Pump calibration points | NVS `storage` | `PUMP1_CAL1` ... | Pump settings save | User action | Low | Saved with pump settings. Unused point keys are erased during save. |
| Schedule settings | NVS `storage` | `schedule` | Schedule settings save, pump settings save with embedded schedule, default init | User action | Low | Persistent configuration, not the runtime last-run marker. |
| Auth settings | NVS `storage` | `auth` | Auth settings save, provisioning apply, default init, first startup if token is missing | User action | Low | Current token behavior should avoid rewriting on every successful login. |
| Board hardware config | NVS `storage` | `stepper_cfg` | Board settings save, default init | User action | Low | Pins, I2C addresses, CAN pins, ADC/GPIO definitions. |
| App onboarding state | NVS `storage` | `APP_STATE` | Provisioning/app settings save, default init | User action | Low | Currently mainly `onboarding_completed`. |
| Pump aging config | NVS `storage` | `PUMP_AGECFG` | Pump aging settings save, pump defaults | User action | Low | Warning/replace thresholds. |
| Pump aging runtime state | NVS `storage` | `PUMP_AGING` | First init if missing, once per local day from backup timer, pump settings save | Daily plus user action | Low | Stores `running_hours[]` and day stamp. Not written every runtime tick. |
| Tank current volume backup | I2C EEPROM or NVS fallback | `0x64` or `EE_0064` | Dosing run completes/stops, safety stop, normal restart, pump settings save | Per completed/stopped run | Medium if NVS fallback | Stores all pump `tank_current_vol` values. Designed to avoid per-second flash writes. |
| Periodic schedule last-run marker | I2C EEPROM or NVS fallback | `0x32` or `EE_0032` | Schedule day rollover, scheduled dose start, manual reset of today's scheduled history marker | Per scheduled run/change | Medium if NVS fallback | Prevents duplicate same-hour periodic doses after reboot. Does not resume an interrupted pump. |
| Reboot counter | I2C EEPROM or NVS fallback | `0x90` or `EE_0090` | Boot | Every boot | Medium if NVS fallback | Used by monitor telemetry. Frequent reset loops can wear fallback NVS. |
| Pump history day blobs | NVS `pump_hist` | `HIS_P1_D00` ... `HIS_P4_D27` | Dirty backup after run completion/stop, slow 300 s safety net, HTTP/MQTT backup command, normal restart, scheduled-history reset | Per dirty pump day | Medium | 28-day ring per pump. Hour volumes are stored as 0.1 ml fixed point. |
| NVS erase | NVS partition | whole NVS partition | Factory reset, NVS no-free-pages recovery during init | Rare | High but rare | Factory reset is intentionally destructive. |
| OTA image and web bundle | OTA/app flash partitions | active update partition | OTA update endpoint | User action | Medium during update | Writes firmware image and embedded frontend assets; normal OTA wear expectations apply. |

## Hot-Path Rules

- Do not write NVS or EEPROM directly from pump runtime ticks.
- Prefer dirty flags plus completion/stop flushes for runtime data.
- If a write is needed during a long run, use a coarse safety-net interval, not
  a high-frequency timer.
- Keep manual HTTP/MQTT backup commands for testing and emergency operator use,
  but do not make clients poll them repeatedly.
- Treat NVS fallback for EEPROM as a development/failsafe mode. For production
  life-support dosing, prefer real EEPROM or FRAM for runtime durability.

## Current Runtime Persistence Policy

- Tank volume is updated in RAM during dosing and backed up when a run completes
  or is stopped.
- Pump history is updated in RAM during dosing and backed up after run
  completion/stop, on normal restart, or by the 300 second dirty safety net.
- Schedule last-run state is persisted before starting a periodic dose so reboot
  in the same hour does not duplicate that dose.
- Pump aging running hours are accumulated in RAM and persisted once per local
  day, plus when pump settings are saved.

## Review Checklist

- Does the new feature write only on user action, lifecycle boundary, or a slow
  safety-net timer?
- If the I2C EEPROM is absent, is the NVS fallback write rate still acceptable?
- Is the data needed after power loss, or can it remain RAM-only?
- Is there a manual operator action to repair/reset incorrect runtime
  accounting?
- Does the write happen before starting hardware when it prevents duplicate
  dosing after reboot?
