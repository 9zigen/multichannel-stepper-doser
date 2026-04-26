# Pump Dosing History

## Overview

Pump dosing history is stored as hourly aggregates for debugging, anomaly detection, and tank-outage prediction.

The implementation is split into:

- RAM: live current local day
- NVS: retained daily snapshots for up to 28 days

## Hourly Data Model

Each pump has 24 hourly slots per day.

Each slot stores:

- `scheduled_volume_cml`
- `manual_volume_cml`
- `total_runtime_s`
- `flags`

The volume fields are stored in NVS as unsigned 32-bit centi-milliliter values:

- `1` stored unit = `0.01 ml`
- maximum stored value per source and hour = about `42,949,672.95 ml`
- values above the maximum saturate to the maximum stored value

The HTTP and MQTT APIs keep the public field names `scheduled_volume_ml` and
`manual_volume_ml` and expose decimal milliliter values. This keeps sub-ml
scheduled doses useful after reboot, for example `0.83 ml` persisted as
`83` stored units.

Flags indicate whether the hour contains:

- periodic schedule activity
- manual activity
- continuous schedule activity
- calibration activity

## Retention

- Current day is aggregated in RAM and backed up to NVS when dirty
- Historical days are stored in NVS as one blob per pump and day slot
- Retention window: 28 days

NVS key format:

- `HIS_P1_D00`
- `HIS_P1_D01`
- ...
- `HIS_P4_D27`

`Dxx` is a ring-buffer slot derived from the local day stamp.

## Backup

Backups are dirty-only and intentionally conservative for flash wear.

Supported triggers:

- automatic backup after a dosing run completes or is stopped
- slow 300 second safety-net backup during long-running activity
- normal Web/API restart before `esp_restart()`
- HTTP API
- MQTT command

Only dirty current-day pump blobs are written to NVS. This reduces flash wear.

## Restore

On boot, if a persisted day blob matches the current local day stamp, it is restored into the current-day RAM buffer.

Older days remain in NVS and are loaded on demand for API responses.

## API

- `GET /api/pumps/history`
  Returns merged 28-day history:
  - today from RAM
  - previous days from NVS

- `POST /api/pumps/history/backup`
  Persists dirty current-day pump history blobs to NVS.

Response includes `written_days`.

- `POST /api/pumps/history/today/reset`
  Clears today's scheduled/continuous history for one pump while preserving
  manual and calibration history.

Request body:

```json
{ "pump_id": 0, "scope": "scheduled" }
```

## MQTT

- Command: `<hostname>/command/history_backup`
  Payload: `backup`, `1`, or `true`

- Telemetry: `<hostname>/history/today`
  Publishes the current day aggregate from RAM

- Backup status: `<hostname>/history/backup/status`

## Limitations

- This is an hourly aggregate system, not a per-event log
- Multiple runs in one hour are merged into the same slot
- If the day rolls over before an automatic/manual backup, unsaved current-day
  data is discarded
- Per-hour scheduled and manual volume counters are clamped at the `uint32_t`
  centi-ml maximum, which is far above expected dosing volumes
