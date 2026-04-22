# CLAUDE.md — Stepper Doser Project Guide

Guidance for Claude Code (and future AI agents) working in this repository. Read this before making changes.

---

## 1. Project Overview

**What**: ESP32-based multi-channel peristaltic pump controller for precise liquid dosing (aquarium/lab/hydroponics). Configurable schedules, manual runs, wear tracking, and a web UI served directly from the device.

**Architecture**:
- **Firmware**: ESP-IDF (C/C++), CMake build system
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
- **Frontend**: React 19 + TypeScript + Vite (embedded in firmware binary)
  - `frontend/src/` — source
  - `frontend/dist/` — build output that gets embedded
  - `frontend/design/DESIGN_SYSTEM.md` — full design system brand book (read this before any UI work)
- **Docs**: `docs/`

**Critical constraint**: The web UI ships inside the firmware binary served by the ESP32's HTTP server. Bundle size matters. Every dependency and every byte counts. Brotli + gzip compression is applied via `vite-plugin-compression2`.

---

## 2. Working Directories & Commands

### Frontend (`frontend/`)

Package manager: **pnpm 9** (see `packageManager` field in `package.json` — do not use npm or yarn).

```bash
cd frontend
pnpm install             # install deps
pnpm dev                 # local dev server
pnpm dev:device          # dev server on 0.0.0.0 (for LAN device testing)
pnpm build               # tsc -b && vite build (type check + bundle)
pnpm build:device        # production build for embedding in firmware
pnpm lint                # eslint .
pnpm lint:fix            # eslint . --fix
pnpm format              # prettier --write .
pnpm format:check        # prettier --check .
```

**Always run `pnpm build` before declaring UI work done** — TypeScript errors (unused imports, unused variables) will fail the build and the firmware build will fail downstream.

#### Environment workaround — broken corepack shim

The `pnpm` binary in this environment is a corepack shim that crashes with a `SyntaxError: Unexpected identifier` on `#target` (corepack's CJS loaded by an older Node). **Do not try to run `pnpm` directly** from Bash tool calls — it will fail before doing anything.

Instead:

- For **type checking**, run vite/tsc binaries directly:
  ```bash
  cd frontend && ./node_modules/.bin/tsc -b
  cd frontend && ./node_modules/.bin/vite build
  ```
  `node_modules/.bin/tsc` and `node_modules/.bin/vite` are resolved via the local package and bypass corepack entirely.

- For **running the dev server**, use `preview_start` with the `Frontend Dev Server` entry in `.claude/launch.json`. That entry has been rewired to avoid corepack/pnpm:
  ```json
  {
    "runtimeExecutable": "bash",
    "runtimeArgs": [
      "-c",
      "export PATH=/Users/alekseyvolkov/.nvm/versions/node/v22.21.1/bin:$PATH && cd frontend && node ./node_modules/vite/bin/vite.js"
    ],
    "port": 5173
  }
  ```
  The explicit `PATH` export is required because the Bash tool shell defaults to Node 16, and Vite 7 needs Node ≥ 20.19. Do not remove this workaround unless corepack is fixed system-wide.

If you need to run lint/format, invoke the local binary directly the same way: `./node_modules/.bin/eslint .`, `./node_modules/.bin/prettier --check .`.

### Firmware

Two build profiles are available:

| Profile | BLE provisioning | Description |
|---------|-----------------|-------------|
| `default` | ✅ enabled | Full feature set — `protocomm_ble` onboarding, AP grace period |
| `legacy` | ❌ disabled | AP-only onboarding; BLE stack excluded; Wi-Fi IRAM optimization re-enabled |

```bash
# Build (after sourcing ESP-IDF environment)
./scripts/build-profile.sh default          # → build/
./scripts/build-profile.sh legacy           # → build-legacy/
./scripts/build-profile.sh default my-dir  # custom build dir

# Flash + monitor (standard)
idf.py flash monitor
```

The `legacy` profile layers `sdkconfig.defaults.legacy` on top of `defconfig` — no changes to the main `sdkconfig` file needed.

---

## 3. Firmware — What I've Learned

### 3.1 Board config C struct alignment

The frontend `BoardConfigState` TypeScript type must stay in sync with `stepper_board_config_t` in `components/app_settings/include/app_settings.h`. Key field correspondences:

| TypeScript field | C field | Type |
|---|---|---|
| `uart` | `uart` | `uint8_t` |
| `tx_pin` / `rx_pin` | `tx_pin` / `rx_pin` | `int32_t` |
| `motors_num` | `motors_num` | `uint8_t` |
| `channels[]` | `channels[MAX_PUMP]` | `stepper_channel_config_t` |
| `rtc_i2c_addr` / `eeprom_i2c_addr` | same | `uint8_t` |
| `i2c_sda_pin` / `i2c_scl_pin` | same | `int32_t` |
| `can_tx_pin` / `can_rx_pin` | same | `int32_t` (-1 = disabled) |
| `adc_channels[]` | `adc_channels[MAX_BOARD_ADC_CHANNELS]` | `adc_channel_config_t` |
| `gpio_inputs[]` | `gpio_inputs[MAX_BOARD_GPIO_INPUTS]` | `gpio_input_config_t` |
| `gpio_outputs[]` | `gpio_outputs[MAX_BOARD_GPIO_OUTPUTS]` | `gpio_output_config_t` |

Constants: `MAX_BOARD_ADC_CHANNELS = 2`, `MAX_BOARD_GPIO_INPUTS = 3`, `MAX_BOARD_GPIO_OUTPUTS = 3`.

The `board_gpio_pull_t` C enum (`BOARD_GPIO_PULL_NONE=0`, `BOARD_GPIO_PULL_UP=1`, `BOARD_GPIO_PULL_DOWN=2`) matches the TypeScript `GpioPull` enum exactly.

### 3.2 BLE Provisioning (`app_provisioning`)

The `app_provisioning` component provides BLE-assisted Wi-Fi onboarding using ESP-IDF `protocomm_ble`. It is **only compiled in** when `CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING=y` (default profile).

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

**Wi-Fi state machine additions** (in `connect.c`, default profile only):

| State flag | Meaning |
|---|---|
| `ap_fallback_active` | Fallback AP is up because STA failed — existing |
| `recovery_mode_active` | AP raised because no STA profiles exist; BLE provisioning active |
| `ap_grace_active` | STA just connected; AP stays up for `WIFI_AP_GRACE_TIMEOUT_MS` to allow BLE finish |

**Security**: `protocomm_security1` with a PoP (Proof-of-Possession) string derived from the device MAC.

**Frontend note**: There is **no frontend page** for BLE provisioning — it is a firmware-side out-of-band flow. The web UI is unreachable during provisioning (device has no IP yet). Once the device connects to Wi-Fi the web UI becomes available normally.

---

## 4. Frontend — What I've Learned

### 4.1 Tailwind CSS v4 — CSS-based Config

This project uses **Tailwind CSS v4**. There is NO `tailwind.config.js` for theme. All theme tokens live in `src/index.css` inside `:root`, `.dark`, and `@theme inline` blocks. When adding design tokens:

- Add the CSS variable to `:root` and/or `.dark`
- Map it inside `@theme inline` so Tailwind utilities pick it up
- Keyframes for `--animate-*` tokens must be defined inside the `@theme inline` block (this is a v4 quirk)

### 4.2 shadcn/ui Style: `radix-nova`

Component styling is defined in `components.json` with `style: "radix-nova"` and `iconLibrary: "tabler"`. The project uses both Tabler (`@tabler/icons-react`) and Lucide (`lucide-react`) icons. When adding new shadcn components, scaffold via `npx shadcn@latest add <component>` — do not hand-write primitive components.

### 4.3 Design System — Read First

Before any UI work read `frontend/design/DESIGN_SYSTEM.md`. It documents:

- Color tokens (light + dark), typography, spacing, shadows, radius
- All 11 component patterns (Card, Flat Panel, Key-Value Row, etc.)
- Animation keyframes and stagger patterns
- Responsive strategy and mobile overflow prevention
- Data viz intensity scales

Match existing patterns exactly. Do not invent new patterns without a strong reason.

### 4.4 Core UI Patterns (the ones you WILL reuse)

**Card wrapper** — every page uses this glassmorphic card:

```tsx
<Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
```

**Flat inner panel** — for sections inside cards:

```tsx
<div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
    Section Label
  </span>
</div>
```

**Page container**:

```tsx
<div className="flex flex-col gap-4 py-2 md:py-3">
  <section className="mx-auto w-full max-w-screen-2xl px-3">
    {/* content */}
  </section>
</div>
```

**Cyan glow on active states**:

```tsx
className="border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]"
```

### 4.5 State Management

Global state: **Zustand** (`src/hooks/use-store.ts`). Access with `useAppStore((state) => state.xxx)` — always use a selector, never `useAppStore()` without one (avoids over-rendering).

Forms: **React Hook Form + Zod** (`@hookform/resolvers/zod`). Define a `FormSchema` with zod and mirror it as a `FormData` TypeScript type.

### 4.6 API Layer

`src/lib/api.ts` holds fetch helpers and types. Async actions return `{ success: boolean }` style results. Wrap calls in try/catch and surface outcomes via `sonner` toasts (`toast.success`, `toast.error`).

### 4.7 Realtime Status Design

The device serves two different realtime patterns over WebSocket and they should stay distinct:

- **Event payloads** for pump activity, e.g. `pump_runtime`
- **Field patches** for device status, e.g. `status_patch`

Do **not** push the full `GET /api/status` response over websocket on every monitor tick. It is too large for the ESP32 and most fields are unchanged. Instead:

- Produce a small tracked snapshot in firmware
- Detect which fields changed
- Emit a websocket message with only those changed keys under `status`
- Merge the patch into Zustand on the frontend instead of replacing the whole `status` object

Current tracked minimum set for `status_patch`:

- `up_time`
- `local_time`
- `local_date`
- `free_heap`
- `vcc`
- `wifi_mode`
- `ip_address`
- `station_connected`
- `station_ssid`
- `station_ip_address`
- `ap_ssid`
- `ap_ip_address`
- `ap_clients`
- `board_temperature`
- `wifi_disconnects`
- `time_valid`
- `time_warning`
- `mqtt_service`
- `ntp_service`

Use `components/app_events` as the bridge between producers and websocket broadcasting. For immediate connection UX, Wi-Fi/IP/AP client transitions should publish right inside `main/connect.c` instead of waiting for the periodic monitor timer.

### 4.8 Adding a new settings field end-to-end

When the firmware gains a new settings field (e.g. a new MQTT/service option), four frontend files need to change in lockstep — missing any one will fail `tsc -b`:

1. **`src/lib/api.ts`** — add the field to the relevant type (e.g. `ServiceState`). This is the source of truth.
2. **`src/hooks/use-store.ts`** — add a default value inside `defaultSettings` so the store satisfies the type before the backend responds.
3. **`src/lib/mock-backend.ts`** — add the same default to `initialState` so local dev without a device still works.
4. **`src/components/<section>-form.tsx`** — extend `FormData`, `FormSchema` (zod), `defaultValues`, and the JSX. For booleans paired with text fields, use `useWatch` + `cn('pointer-events-none opacity-40', !enabled)` to dim dependent inputs, matching the existing NTP/MQTT panels.

For **nested feature toggles** (e.g. Home Assistant Discovery inside MQTT), compose the dependency: `const discoveryActive = enableMqtt && enableDiscovery;` and dim when `!discoveryActive`. Nest the sub-panel visually inside its parent panel using a lighter inner wrapper (`rounded-md border border-border/40 bg-background/40 p-3`) rather than a sibling flat panel.

For **inline boolean flags placed on a field row** (e.g. MQTT Retain sitting alongside QoS), render a labelled `<Switch>` cell so it lines up with the adjacent Inputs:

```tsx
<div className="flex flex-col gap-1">
  <Label htmlFor="mqtt_retain" className="text-xs text-muted-foreground">Retain</Label>
  <div className="flex h-8 items-center">
    <Controller name="mqtt_retain" control={control} render={({ field }) => (
      <Switch id="mqtt_retain" checked={field.value} onCheckedChange={field.onChange} disabled={!enableMqtt} />
    )} />
  </div>
</div>
```

The `flex h-8 items-center` wrapper ensures the switch vertically aligns with `h-8` inputs in the same grid row.

### 4.9 Font scale preference

Two-size system: **Default** (16 px root) and **Large** (19 px root). Stored as `"ui-font-scale"` in `localStorage`, applied as `data-font-scale="default|large"` on `document.documentElement`.

CSS hook in `src/index.css` inside `@layer base`:
```css
html {
  @apply font-sans;
  &[data-font-scale='large'] { font-size: 19px; }
}
```

Because Tailwind v4 spacing and typography utilities use `rem`, setting `html { font-size }` scales the **entire UI proportionally** — no per-component changes needed. The `aA` toggle button in the site header uses fixed `px` arbitrary values (`text-[11px]` / `text-[16px]`) so the button itself never changes size regardless of the active scale.

Key files: `src/components/font-scale-provider.tsx`, `src/components/site-header.tsx` (`ButtonFontScale` component).

### 4.10 Language / i18n

**Not yet implemented.** UI strings are hardcoded English. A locale switcher is planned — build it from scratch when the time comes. Do not add any i18n library or translation infrastructure until that work is explicitly started.

### 4.11 Board configuration presets

Preset definitions live in `src/lib/board-presets.ts`. Each `BoardPreset` has `{ id, name, description, config: BoardConfigState }`. The three Fysetc E4 v1.0 presets (1ch / 2ch / 4ch) are the only ones currently defined — add new hardware here when it is validated against physical hardware.

**Preset picker pattern** — a shadcn `Popover` in the card header, opened by a small "Presets" button. Preset list items are plain `<button>` elements (not shadcn `Button`) to avoid focus-ring overhead inside the popover.

**Active preset detection** — `JSON.stringify(config) === JSON.stringify(preset.config)`. Exact match; a `✓` icon appears on the matching row.

**Dirty-state confirmation** — if `isDirty` when a preset is clicked, the preset is stored as `pendingPreset` state instead of being applied immediately. The popover body switches to an inline amber confirmation (`AlertTriangle` + "Apply anyway" / "Cancel"). No modal.

```tsx
const applyPreset = (preset: BoardPreset) => {
  if (isDirty) { setPendingPreset(preset); }
  else { setConfig(preset.config); setPresetOpen(false); }
};
```

**When `BoardConfigState` gains a new field** — update four places in lockstep:
1. `src/lib/api.ts` — add the field to `BoardConfigState` (and any new sub-types)
2. `src/lib/board-config.ts` — add default in `createEmptyBoardConfig()`
3. `src/lib/board-presets.ts` — add the value to `FYSETC_E4_BASE` (and any other preset bases)
4. `src/lib/mock-backend.ts` — add default to `initialState.boardConfig`

Also update the Zod schema in `src/lib/config-export.ts` if the field should be included in exports.

**Current `BoardConfigState` scalar fields** (all `number`):
`uart`, `tx_pin`, `rx_pin`, `motors_num`, `rtc_i2c_addr`, `eeprom_i2c_addr`, `i2c_sda_pin`, `i2c_scl_pin`, `can_tx_pin` (`-1` = disabled), `can_rx_pin` (`-1` = disabled)

**Current `BoardConfigState` array fields**:
- `channels: BoardConfigChannel[]` — stepper driver wiring (DIR/EN/STEP/μstep per channel)
- `adc_channels: AdcChannelConfig[]` — `{ id, pin, enabled }` — ADC1_CH0 (GPIO36) and ADC1_CH3 (GPIO39) on Fysetc E4
- `gpio_inputs: GpioInputConfig[]` — `{ id, pin, enabled, pull: GpioPull, active_level }` — IO34, IO35, IO32 on Fysetc E4
- `gpio_outputs: GpioOutputConfig[]` — `{ id, pin, enabled, active_level }` — IO13, IO2, IO4 on Fysetc E4

**`GpioPull` enum** (defined in `api.ts`): `None = 0`, `Up = 1`, `Down = 2`. Import it from `@/lib/api.ts` when needed in components or defaults.

**Pull / active-level UI pattern** — use shadcn `Select` for both. Pull options: None / Pull-up / Pull-down. Active level: `High (1)` / `Low (0)`. Enabled state uses a `Switch` from `@/components/ui/switch`. Each row dims with `opacity-60` when `!enabled`.

**Array field updaters pattern** (used in `Settings.Board.tsx`):
```ts
const updateGpioInput = (id: number, field: keyof GpioInputConfig, value: number | boolean) => {
  setConfig((current) => ({
    ...current,
    gpio_inputs: current.gpio_inputs.map((inp) => inp.id === id ? { ...inp, [field]: value } : inp),
  }));
};
```
Same pattern for `updateAdcChannel` and `updateGpioOutput`.

**`updateSharedField` type** — must Omit all array fields so TypeScript enforces the value is `number`:
```ts
const updateSharedField = (
  field: keyof Omit<BoardConfigState, 'channels' | 'adc_channels' | 'gpio_inputs' | 'gpio_outputs'>,
  value: number,
) => { ... }
```

**I2C address inputs** — use text inputs (not number) with `formatI2cAddr` (number → `"0x6F"`) for display and `parseI2cInput` (accepts `"0x6F"` or `"111"`) on change. Both helpers are in `src/lib/board-config.ts`.

**CAN pin inputs** — use number inputs. Empty/zero value maps to `-1` (disabled) via `parseNumericInput(v) || -1`.

### 4.12 Config export / import (Backup & Restore)

`src/lib/config-export.ts` owns all export/import logic. The page (`Settings.Backup.tsx`) is purely UI.

**Export shape**:

```ts
type ConfigExport = {
  version: number;        // CONFIG_EXPORT_VERSION = 1
  exported_at: string;    // ISO 8601
  device_info: { firmware_version: string; hardware_version: string };
  networks?: NetworkState[];
  services?: ServiceState;
  board?: BoardConfigState;
  pumps?: ConfigExportPump[];   // subset of PumpState — no runtime fields
};
```

**Always excluded from export**: `auth` (credentials), `running_hours`, `tank_current_vol`, `tank_concentration_total` (runtime/wear data), `time.date/time` (device-local).

**Version compatibility** — `checkVersion(n)` returns `'ok' | 'older' | 'newer'`. Both directions show an amber warning and let the user proceed. Hard reject only on structural Zod failure.

**Zod schema uses `.passthrough()`** on `networkStateSchema` and `serviceStateSchema` so exports from firmware versions with extra/missing fields still validate. The structural core (required fields) is still checked strictly.

**`applyImport(data, selected)`** applies sections **sequentially** (not `Promise.all`) so a failure in one section doesn't cancel the others. Returns `ApplyResult[]` — the page iterates results for per-section toasts.

**Restart recommendation** — `SECTION_META` maps each `ImportSection` to `{ requiresRestart: boolean }`. After a successful apply, if any applied section has `requiresRestart: true`, an amber banner with a "Restart now" button appears.

**Import UX flow**: drop zone → `parseImportFile` → file info panel (version, date, firmware) → section checkboxes pre-ticked for available sections → "Import N sections" button → results inline (✓ / ✗ per row) → restart banner if needed.

### 4.13 How forms dim disabled dependent fields

The established pattern for a boolean toggle controlling a group of inputs:

```tsx
const enableFoo = useWatch({ control, name: 'enable_foo' });

<div className={cn('grid gap-3 sm:grid-cols-2', !enableFoo && 'pointer-events-none opacity-40')}>
  <Input {...register('foo_field')} disabled={!enableFoo} />
</div>
```

Both `pointer-events-none opacity-40` on the wrapper AND `disabled` on each input are used — the wrapper gives the visual cue, `disabled` prevents keyboard tabbing into dead fields.

---

## 5. Code Style

### 5.1 TypeScript

- **Strict mode is on** — the build runs `tsc -b` and fails on any type error
- **No unused imports or variables** — they cause build failures. If you introduce a variable while iterating, remove it before handing off.
- **Explicit return types on exported components**: `React.ReactElement` (see existing pages/components)
- **Functional components only** — use arrow function or `function` declarations; no class components
- **Hooks at the top** of the component; avoid conditional hook calls
- **`React.useMemo`** for anything derived from props/state that would otherwise cause re-renders in lists

### 5.2 Imports

- Use the `@/` path alias (`@/components/ui/button`, `@/lib/api`, `@/hooks/use-store`) — never relative paths like `../../`
- Order: React first, then external libs, then `@/` aliased imports, then sibling imports
- Include `.ts` / `.tsx` extensions on some internal imports to match existing convention (see `api.ts` imports)

### 5.3 Styling

- **Use `cn()` from `@/lib/utils`** to merge conditional classes (it wraps `clsx` + `tailwind-merge`)
- **Never write raw CSS** for components — only Tailwind utilities and existing CSS variables
- **Match existing spacing/sizing tokens** — don't introduce arbitrary values unless documented in DESIGN_SYSTEM.md
- **Use `tabular-nums`** for all numeric displays (volumes, hours, IPs, timestamps)
- **Prefer existing shadcn primitives** over hand-rolled HTML elements (use `<Button>`, `<Badge>`, `<Input>`, `<Toggle>`)

### 5.4 Component File Conventions

- One component per file; default export for pages, named exports for components
- File names: kebab-case (`pump-control-card.tsx`), component names: PascalCase
- Co-locate tightly coupled pieces: e.g. `pump-history/` folder holds `heatmap.tsx`, `day-detail.tsx`, `utils.ts`, `use-pump-history.ts`

### 5.5 Formatting

Prettier + ESLint enforce style. Before committing, run:

```bash
pnpm lint && pnpm format:check
```

Do **not** reformat unrelated files — keep diffs minimal.

### 5.6 Comments

- Only add comments where logic is non-obvious
- Do not add JSDoc to every prop; types carry the intent
- Do not add TODO comments unless the user asks — just finish the work or surface the issue in the PR description

---

## 6. How I've Fixed Errors in This Codebase

A log of real fixes applied during past sessions so future agents don't repeat the same mistakes.

### 6.1 Mobile Grid Overflow (Home Page, 608px on 375px viewport)

**Symptom**: On a 375px-wide mobile viewport, Home page grid children measured 608px each — causing horizontal overflow and a permanent horizontal scrollbar.

**Root cause**: CSS Grid items have an implicit `min-width: auto` which prevents them from shrinking below their content's intrinsic size. When a child contains wide content (a `<table>`, long text, etc.), the grid track expands beyond the container.

**Fix**: Add `min-w-0` to every direct grid child:

```tsx
<section className="grid xl:grid-cols-12">
  <div className="min-w-0 xl:col-span-3">...</div>
  <div className="min-w-0 xl:col-span-9">...</div>
</section>
```

**Rule going forward**: Every direct child of a grid or flex container that contains unknown-width content needs `min-w-0`.

### 6.2 Device Card Height Stretch (Permanent Vertical Scrollbar)

**Symptom**: On the Home page, the Device Overview card stretched to 986px (exceeding 900px viewport) causing a permanent vertical scrollbar.

**Root cause**: `Card` had `h-full`, `CardContent` had `flex-1`, and the maintenance section had `mt-auto`. Combined with `xl:row-span-3`, this caused the card to eat all three rows' height.

**Fix**: Let the card find its natural height. Remove `h-full` from Card, `flex-1` from CardContent, `mt-auto` from inner sections.

**Rule going forward**: When placing cards in grids with `row-span`, do not force `h-full` on the Card. Let content dictate height.

### 6.3 Maintenance Buttons Overflowing Narrow Column

**Symptom**: Side-by-side `<Button>`s inside a narrow 3-column grid cell overflowed horizontally.

**Fix**: Force vertical stacking in the narrow container:

```tsx
<div className="[&>div]:flex-col">
  <ButtonGroup>...</ButtonGroup>
</div>
```

### 6.4 Day Detail Table Columns Cut Off on Mobile

**Symptom**: Table with 4 columns (Time, Sched, Manual, Flags) was cut off on mobile because `w-full` constrained it inside a narrow parent.

**Fix**: Hide non-essential columns on mobile:

```tsx
<th className="hidden sm:table-cell">Sched</th>
<td className="hidden sm:table-cell">{value}</td>
```

**Rule going forward**: On mobile, show only the most critical 2 columns of any data table. Use `hidden sm:table-cell` for the rest.

### 6.5 Unused Variables Causing Build Failures

**Symptom**: `pnpm build` failed with "declared but never used" errors on `modeDetails` and `mode` variables after iterating on the Schedule form.

**Fix**: Remove unused declarations before committing. TypeScript strict mode treats `noUnusedLocals` as an error, not a warning.

**Rule going forward**: Run `pnpm build` before handing off any UI change. Do not disable `noUnusedLocals` to dodge this.

### 6.6 Dark Mode Text Selection Unreadable

**Symptom**: Default `::selection` styling in dark mode mixed primary with white, producing washed-out, low-contrast highlights.

**Fix**: Override selection in dark mode to mix with black instead:

```css
.dark ::selection {
  background: color-mix(in oklab, var(--color-primary) 40%, black);
  color: #e2e8f0;
}
```

### 6.7 Heatmap Bar Chart Too Prominent

**Symptom**: Daily volume bar chart (next to the heatmap) was visually louder than the heatmap itself, breaking hierarchy.

**Fix**: Created `getBarIntensityClass` in `pump-history/utils.ts` using 25-40% opacity (vs the heatmap's 50-95%). The selected bar falls back to the full-intensity class so it stands out.

**Rule going forward**: When two data visualizations coexist on the same card, one must be visually subordinate. Dim the secondary one via lower opacity classes.

### 6.8 Flag Abbreviations Overflowing Table Cells

**Symptom**: Flag names ("Scheduled", "Manual", "Continuous", "Calibration") overflowed the narrow Flags column.

**Fix**: Render single-letter abbreviations (S, M, C, K) with a `title` attribute for the full name on hover. See `renderFlags` and `flagTitle` in `utils.ts`.

### 6.9 Tailwind v4 Keyframes Not Working Outside `@theme inline`

**Symptom**: Added `@keyframes bar-rise` at the top level of `index.css`, but `animate-bar-rise` class didn't resolve.

**Fix**: In Tailwind v4, keyframes bound to `--animate-*` tokens must live inside the `@theme inline` block alongside the `--animate-bar-rise` declaration.

### 6.10 TS2739 After Adding a Field to `ServiceState`

**Symptom**: Added `mqtt_discovery_topic` / `enable_mqtt_discovery` to `ServiceState` in `api.ts`. `tsc -b` immediately failed with `TS2739: Type '{ ... }' is missing the following properties from type 'ServiceState'` at `src/hooks/use-store.ts:107` (the `defaultSettings` literal).

**Root cause**: `defaultSettings.services` is typed as `ServiceState`, so any new required field must have a default value there — not just in the form.

**Fix**: Add the defaults to **three** places in lockstep with the type change:
1. `src/hooks/use-store.ts` → `defaultSettings.services`
2. `src/lib/mock-backend.ts` → `initialState.services`
3. `src/components/<form>.tsx` → `defaultValues` + `FormSchema`

See section 4.7 for the canonical order.

### 6.11 Dev Server Fails to Start via `pnpm`

**Symptom**: `preview_start` (which ran `pnpm --dir frontend dev`) crashed with `SyntaxError: Unexpected identifier` at `corepack.cjs:8499`, pointing at `#target`. Also, running `pnpm` directly from Bash exploded the same way.

**Root cause**: The corepack shim at `/Users/alekseyvolkov/.nvm/versions/node/v22.21.1/lib/node_modules/corepack/dist/pnpm.js` is being loaded by an older Node (the Bash tool's default shell resolves `node` to v16), which doesn't understand private class fields (`#target`).

**Fix**: Bypass corepack entirely. `.claude/launch.json` was rewritten to call Vite directly via Node 22:

```json
{
  "runtimeExecutable": "bash",
  "runtimeArgs": [
    "-c",
    "export PATH=/Users/alekseyvolkov/.nvm/versions/node/v22.21.1/bin:$PATH && cd frontend && node ./node_modules/vite/bin/vite.js"
  ]
}
```

**Rule going forward**: Never call `pnpm` from Bash tool calls in this environment. Use `./node_modules/.bin/{vite,tsc,eslint,prettier}` directly, or use `preview_start "Frontend Dev Server"` which has the workaround baked in.

---

## 7. UI Verification Workflow

When making UI changes, verify them before reporting done. Use the `preview_*` tools (never ask the user to check manually):

1. `preview_start` if no dev server is running
2. Reload with `preview_eval: window.location.reload()` if HMR didn't pick up
3. `preview_console_logs` / `preview_network` for runtime errors
4. `preview_snapshot` for content/structure assertions
5. `preview_resize` to test mobile (375×667) AND desktop (1440×900)
6. `preview_screenshot` when sharing visual results with the user

Test both light and dark modes if the change affects theme-sensitive styling.

---

## 8. Commit & PR Conventions

Recent commit message style (see `git log`):

```
Fix Device card height stretch and maintenance button overflow on Home page
Compact Schedule page and Home page cards, merge Maintenance into Device
History page: polish heatmap layout, add daily volume chart, fix dark selection
```

Guidelines:
- **Imperative mood** ("Fix", "Compact", "Add" — not "Fixed", "Compacts")
- **Mention the page or component** affected
- **One subject line** under 80 chars; body optional
- **Do not mention tools** ("Claude", "AI", "Copilot") in commit messages unless the user asks

Always confirm with the user before committing. Never push, force-push, or amend without explicit instruction. Never use `--no-verify`.

---

## 9. Things to Avoid

- **Don't add new UI libraries** — everything must go through shadcn/ui + Tailwind. Bundle size is sacred.
- **Don't add runtime validators** for internal data — Zod is for user-input boundaries only (forms, file imports). Never validate API responses with Zod at runtime.
- **Don't refactor unrelated files** while making a targeted change.
- **Don't add `console.log`** debugging statements to committed code.
- **Don't add backwards-compat shims** for code the user asked to remove — delete it cleanly.
- **Don't lazy-load UI modules** — the ESP32 serves everything from flash, dynamic imports just bloat the manifest.
- **Don't introduce non-CSS-variable colors** — always go through the theme tokens.
- **Don't skip `min-w-0`** on grid/flex children (see 6.1).
- **Don't skip `pnpm build`** before handing off (see 6.5).

---

## 10. Useful File Pointers

| File                                              | Purpose                                   |
|---------------------------------------------------|-------------------------------------------|
| `frontend/src/index.css`                          | Theme tokens, keyframes, gradients        |
| `frontend/design/DESIGN_SYSTEM.md`                | Full design system reference              |
| `frontend/components.json`                        | shadcn/ui config                          |
| `frontend/src/lib/api.ts`                         | API client + shared types                 |
| `frontend/src/lib/api.ts`                         | API client + shared types                 |
| `frontend/src/lib/board-config.ts`                | Board config helpers, `createEmptyBoardConfig`, RPM math, `parseI2cInput`, `formatI2cAddr` |
| `frontend/src/lib/board-presets.ts`               | `BOARD_PRESETS` — Fysetc E4 v1.0 preset definitions |
| `frontend/src/lib/config-export.ts`               | `ConfigExport` type, Zod schema, `buildExport`, `downloadExport`, `parseImportFile`, `applyImport` |
| `frontend/src/hooks/use-store.ts`                 | Zustand global store                      |
| `frontend/src/lib/utils.ts`                       | `cn()` utility                            |
| `frontend/src/components/home/pump-history/utils.ts` | Heatmap intensity + flag helpers      |
| `frontend/src/components/schedule-form.tsx`       | Compact form patterns reference           |
| `frontend/src/components/services-form.tsx`       | Nested feature-toggle panel reference (HA Discovery inside MQTT) |
| `frontend/src/components/font-scale-provider.tsx` | Font scale preference (Default/Large), `localStorage` `ui-font-scale` |
| `frontend/src/components/realtime-provider.tsx`   | WebSocket lifecycle + realtime state (`status_patch`, `settings_update`, `shutting_down`, `system_ready`) |
| `.claude/launch.json`                             | Dev server launch config (corepack workaround) |
| `frontend/src/pages/Home.tsx`                     | Complex grid layout reference             |
| `frontend/src/pages/History.tsx`                  | Single-card layout reference              |
| `frontend/src/pages/Settings.Board.tsx`           | Board config page — preset picker (Popover), Peripherals section, no-form pattern |
| `frontend/src/pages/Settings.Backup.tsx`          | Backup & Restore page — export/import UI  |

---

*Last updated: Font scale selector (Default/Large) in header toolbar; Board Configuration presets (Fysetc E4 v1.0 — 1/2/4ch) + extended peripheral fields (I2C bus SDA/SCL, RTC/EEPROM I2C addr, CAN GPIO, 2× ADC channels, 3× digital inputs with pull/active-level, 3× digital outputs with active-level); Backup & Restore page (`/settings/backup`) with selective section export/import and version compatibility check; language/i18n deferred — will be built from scratch when started.*
