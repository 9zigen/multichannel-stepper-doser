# Pump Power-Loss Testing

Pump recovery must be conservative: after an unexpected reset or power loss,
the firmware restores persisted counters, but it must not resume a pump that
was actively running. This prevents an uncertain partial dose from becoming an
unbounded overdose after reboot.

## Expected Behavior

- All pump runtime states initialize as `PUMP_OFF`.
- The motor backend is not asked to restart an interrupted run.
- Tank current volume is restored from the latest EEPROM/NVS fallback backup.
  Runtime tank-volume changes are backed up about every 1 second with the
  external EEPROM/FRAM backend, or about every 30 seconds when using the NVS
  fallback to avoid excessive flash wear.
- Pump history is restored from the latest NVS history backup.
- Periodic schedule last-run hour state is restored, so a reboot in the same
  hour should not duplicate a periodic dose that already started.
- A manual operator or remote client must explicitly start any replacement dose.

## Manual Hardware Test

1. Configure one pump with a known calibration and safe low speed.
2. Set a visible tank current volume value.
3. Start a long manual run from the Web UI or API.
4. Wait at least a few seconds so runtime counters and tank volume move.
5. Remove power from the controller, not from only the motor driver.
6. Restore power and wait for `/api/pumps/runtime` and `/api/settings`.
7. Confirm runtime state is off for every pump.
8. Confirm no motor output is active after boot.
9. Confirm tank volume restored to the latest persisted backup, allowing for
   the expected backup interval: about 1 second with external EEPROM/FRAM, or
   about 30 seconds with the NVS fallback.
10. Confirm the Web UI shows no active manual run.

## Scheduled-Run Outage Test

1. Configure a periodic schedule for the current hour with a small safe dose.
2. Wait until the schedule starts and then remove power.
3. Restore power within the same hour.
4. Confirm the schedule does not immediately start a duplicate dose.
5. Move to the next configured hour or clear the persisted schedule marker when
   intentionally retesting the same hour.

## Fault-Injection Ideas

- Add a temporary debug endpoint or GPIO-triggered reset that calls
  `esp_restart()` while a pump is running.
- Use a bench supply with logging and physically cut power at randomized offsets
  during manual and scheduled runs.
- Repeat with I2C EEPROM present and absent, so the NVS fallback path is also
  exercised.
- Treat the NVS fallback as a development/failsafe path for this test. For
  production life-support dosing, prefer the external EEPROM/FRAM backend so
  runtime tank accounting can be persisted frequently without flash wear.
- For deeper automated tests, add a fake `app_pumps_backend_t` and a storage
  fault shim that can fail before or after schedule/tank writes.

## Pass Criteria

- No pump restarts automatically after reboot.
- No schedule duplicates in the same hour after the last-run marker was saved.
- Safety limits still reject new manual runs after reboot.
- The amount of tank-volume uncertainty is bounded by the configured backup
  cadence and is acceptable for the application.
