# Multichannel Stepper Motor Doser

## Realtime lifecycle

The web UI listens on `/ws` and now receives lifecycle events in addition to pump runtime updates:

- `{"type":"shutting_down"}` before restart/factory reset so connected clients can show a restart banner
- `{"type":"system_ready"}` after startup settles, MQTT is started, and an additional reconnect delay has elapsed

`system_ready` includes firmware metadata so the frontend can refresh cached data and force a page reload when the firmware version changed.
