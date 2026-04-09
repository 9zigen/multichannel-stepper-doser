# Pump Dosing History

## Overview

Pump dosing history is stored as hourly aggregates for debugging, anomaly detection, and tank-outage prediction.

The implementation is split into:

- RAM: current local day only
- NVS: retained daily snapshots for up to 28 days

## Hourly Data Model

Each pump has 24 hourly slots per day.

Each slot stores:

- `scheduled_volume_ml`
- `manual_volume_ml`
- `total_runtime_s`
- `flags`

Flags indicate whether the hour contains:

- periodic schedule activity
- manual activity
- continuous schedule activity
- calibration activity

## Retention

- Current day is aggregated in RAM only
- Historical days are stored in NVS as one blob per pump and day slot
- Retention window: 28 days

NVS key format:

- `HIS_P1_D00`
- `HIS_P1_D01`
- ...
- `HIS_P4_D27`

`Dxx` is a ring-buffer slot derived from the local day stamp.

## Backup

Backups are manual only.

Supported triggers:

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

## MQTT

- Command: `<hostname>/command/history_backup`
  Payload: `backup`, `1`, or `true`

- Telemetry: `<hostname>/history/today`
  Publishes the current day aggregate from RAM

- Backup status: `<hostname>/history/backup/status`

## Limitations

- This is an hourly aggregate system, not a per-event log
- Multiple runs in one hour are merged into the same slot
- If the day rolls over before a manual backup, unsaved current-day data is discarded
