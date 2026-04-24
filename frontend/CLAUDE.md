# CLAUDE.md — Frontend (React Web UI)

Read this before making any frontend changes. See also:
- Root project guide (firmware internals, shared REST/WebSocket API): [`../CLAUDE.md`](../CLAUDE.md)
- iOS native app: [`../ios/CLAUDE.md`](../ios/CLAUDE.md)

---

## 1. Tech Stack

- **React 19** + TypeScript (strict mode)
- **Vite** (build tool) + `vite-plugin-compression2` (brotli + gzip)
- **Tailwind CSS v4** (CSS-based config — no `tailwind.config.js`)
- **shadcn/ui** (`radix-nova` style, `tabler` icon library)
- **Zustand** (global state)
- **React Hook Form + Zod** (forms and validation)
- **sonner** (toasts)
- Icons: `@tabler/icons-react` and `lucide-react`

Package manager: **pnpm 9** (see `packageManager` in `package.json` — do not use npm or yarn).

---

## 2. Build Commands

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

### Environment Workaround — Broken Corepack Shim

The `pnpm` binary is a corepack shim that crashes with `SyntaxError: Unexpected identifier` on `#target` when loaded by an older Node. **Do not run `pnpm` directly from Bash tool calls.**

Instead:

- For **type checking / building**, use the local binaries directly:
  ```bash
  cd /Users/alekseyvolkov/dev/esp32/STEPPER_DOSER/frontend && ./node_modules/.bin/tsc -b
  cd /Users/alekseyvolkov/dev/esp32/STEPPER_DOSER/frontend && ./node_modules/.bin/vite build
  ```

- For **running the dev server**, use `preview_start` with the `Frontend Dev Server` entry in `.claude/launch.json`, which bypasses corepack:
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
  The explicit `PATH` export is required — the Bash tool shell defaults to Node 16, and Vite 7 needs Node ≥ 20.19.

- For **lint/format**: `./node_modules/.bin/eslint .`, `./node_modules/.bin/prettier --check .`

---

## 3. Theme System

### 3.1 Tailwind CSS v4 — CSS-Based Config

There is NO `tailwind.config.js`. All theme tokens live in `src/index.css` inside `:root`, `.dark`, and `@theme inline` blocks.

When adding design tokens:
- Add the CSS variable to `:root` and/or `.dark`
- Map it inside `@theme inline` so Tailwind utilities pick it up
- Keyframes for `--animate-*` tokens **must** be defined inside the `@theme inline` block (v4 quirk — see §9.9)

### 3.2 Theme Provider

`ThemeProvider` is in `src/components/theme-provider.tsx`. It stores the preference in `localStorage` as `'ui-theme'` with values `'system' | 'light' | 'dark'`. It adds `.dark` or `.light` class to `<html>` and listens to `prefers-color-scheme` for system mode.

The header theme button is a `DropdownMenu` with System / Light / Dark options (Monitor / Sun / Moon icons).

### 3.3 Font Scale Preference

Two-size system: **Default** (16px root) and **Large** (19px root). Stored as `"ui-font-scale"` in `localStorage`, applied as `data-font-scale="default|large"` on `document.documentElement`.

CSS hook in `src/index.css` inside `@layer base`:
```css
html {
  @apply font-sans;
  &[data-font-scale='large'] { font-size: 19px; }
}
```

Because Tailwind v4 uses `rem`, setting `html { font-size }` scales the entire UI proportionally. The `aA` toggle button uses fixed `px` values (`text-[11px]` / `text-[16px]`) so the button itself never resizes.

Key files: `src/components/font-scale-provider.tsx`, `src/components/site-header.tsx` (`ButtonFontScale`).

### 3.4 shadcn/ui

`components.json` sets `style: "radix-nova"` and `iconLibrary: "tabler"`. When adding new shadcn components, scaffold via `npx shadcn@latest add <component>` — do not hand-write primitive components.

---

## 4. Design System

Before any UI work read `frontend/design/DESIGN_SYSTEM.md`. It documents color tokens (light + dark), typography, spacing, shadows, radius, all 11 component patterns, animation keyframes, responsive strategy, and data viz intensity scales.

Match existing patterns exactly. Do not invent new patterns without a strong reason.

### 4.1 Core UI Patterns

**Card wrapper** — every page:
```tsx
<Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
```

**Flat inner panel** — sections inside cards:
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

---

## 5. State Management

### 5.1 Zustand

Global state lives in `src/hooks/use-store.ts`. Always use a selector — never `useAppStore()` without one:
```ts
const foo = useAppStore((state) => state.foo);
```

### 5.2 Forms

React Hook Form + Zod. Define a `FormSchema` with zod and mirror it as a `FormData` TypeScript type.

### 5.3 API Layer

`src/lib/api.ts` holds fetch helpers and types. Async actions return `{ success: boolean }` results. Wrap calls in try/catch and surface outcomes via `sonner` toasts (`toast.success`, `toast.error`).

For the device's REST endpoints and WebSocket protocol, see [`../CLAUDE.md §4`](../CLAUDE.md).

### 5.4 Realtime (WebSocket)

`src/components/realtime-provider.tsx` manages the WebSocket lifecycle. Events received:
- `status_patch` — merge into Zustand, do not replace the whole status object
- `settings_update` — re-fetch `GET /api/settings`
- `pump_runtime` — pump activity event
- `system_ready` / `shutting_down` — connection lifecycle

Do not push the full status response over WebSocket on every tick. The firmware emits only changed fields. The frontend merges the patch.

---

## 6. Adding a New Settings Field End-to-End

When the firmware gains a new settings field, four frontend files must change in lockstep — missing any one fails `tsc -b`:

1. **`src/lib/api.ts`** — add the field to the relevant type (e.g. `ServiceState`). Source of truth.
2. **`src/hooks/use-store.ts`** — add a default value inside `defaultSettings`.
3. **`src/lib/mock-backend.ts`** — add the same default to `initialState` for local dev.
4. **`src/components/<section>-form.tsx`** — extend `FormData`, `FormSchema`, `defaultValues`, and JSX.

**Dimming dependent inputs** — boolean toggle controlling a group:
```tsx
const enableFoo = useWatch({ control, name: 'enable_foo' });

<div className={cn('grid gap-3 sm:grid-cols-2', !enableFoo && 'pointer-events-none opacity-40')}>
  <Input {...register('foo_field')} disabled={!enableFoo} />
</div>
```
Both `pointer-events-none opacity-40` on the wrapper AND `disabled` on each input — wrapper gives the visual cue, `disabled` prevents keyboard tabbing.

**Nested feature toggles** (e.g. HA Discovery inside MQTT): `const discoveryActive = enableMqtt && enableDiscovery;` — dim when `!discoveryActive`. Nest the sub-panel inside its parent using a lighter inner wrapper (`rounded-md border border-border/40 bg-background/40 p-3`).

**Inline boolean flag on a field row** (e.g. MQTT Retain alongside QoS):
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
The `flex h-8 items-center` wrapper aligns the switch with `h-8` inputs in the same grid row.

---

## 7. Board Configuration

### 7.1 Adding a Field to `BoardConfigState`

Update four places in lockstep:
1. `src/lib/api.ts` — add field to `BoardConfigState` (and any new sub-types)
2. `src/lib/board-config.ts` — add default in `createEmptyBoardConfig()`
3. `src/lib/board-presets.ts` — add value to `FYSETC_E4_BASE` (and any other preset bases)
4. `src/lib/mock-backend.ts` — add default to `initialState.boardConfig`

Also update the Zod schema in `src/lib/config-export.ts` if the field should be included in exports.

### 7.2 Current `BoardConfigState` Fields

**Scalar fields** (all `number`):
`uart`, `tx_pin`, `rx_pin`, `motors_num`, `rtc_i2c_addr`, `eeprom_i2c_addr`, `i2c_sda_pin`, `i2c_scl_pin`, `can_tx_pin` (`-1` = disabled), `can_rx_pin` (`-1` = disabled)

**Array fields**:
- `channels: BoardConfigChannel[]` — stepper driver wiring (DIR/EN/STEP/μstep per channel)
- `adc_channels: AdcChannelConfig[]` — `{ id, pin, enabled }` — ADC1_CH0 (GPIO36) and ADC1_CH3 (GPIO39) on Fysetc E4
- `gpio_inputs: GpioInputConfig[]` — `{ id, pin, enabled, pull: GpioPull, active_level }` — IO34, IO35, IO32 on Fysetc E4
- `gpio_outputs: GpioOutputConfig[]` — `{ id, pin, enabled, active_level }` — IO13, IO2, IO4 on Fysetc E4

**`GpioPull` enum** (in `api.ts`): `None = 0`, `Up = 1`, `Down = 2`.

### 7.3 UI Patterns for Board Config Fields

**Pull / active-level**: shadcn `Select`. Pull options: None / Pull-up / Pull-down. Active level: `High (1)` / `Low (0)`. Enabled uses a `Switch`. Each row dims with `opacity-60` when `!enabled`.

**Array field updaters pattern**:
```ts
const updateGpioInput = (id: number, field: keyof GpioInputConfig, value: number | boolean) => {
  setConfig((current) => ({
    ...current,
    gpio_inputs: current.gpio_inputs.map((inp) => inp.id === id ? { ...inp, [field]: value } : inp),
  }));
};
```

**`updateSharedField` type** — Omit all array fields:
```ts
const updateSharedField = (
  field: keyof Omit<BoardConfigState, 'channels' | 'adc_channels' | 'gpio_inputs' | 'gpio_outputs'>,
  value: number,
) => { ... }
```

**I2C address inputs** — text inputs (not number) with `formatI2cAddr` (number → `"0x6F"`) for display and `parseI2cInput` (accepts `"0x6F"` or `"111"`) on change. Both helpers in `src/lib/board-config.ts`.

**CAN pin inputs** — number inputs. Empty/zero maps to `-1` (disabled) via `parseNumericInput(v) || -1`.

### 7.4 Preset Picker

Preset definitions in `src/lib/board-presets.ts`. Each `BoardPreset` has `{ id, name, description, config: BoardConfigState }`. Three Fysetc E4 v1.0 presets (1ch / 2ch / 4ch) are the only ones currently defined.

**Picker pattern** — shadcn `Popover` in the card header. Preset list items are plain `<button>` elements (not shadcn `Button`) to avoid focus-ring overhead.

**Active preset detection** — `JSON.stringify(config) === JSON.stringify(preset.config)`. A check icon appears on the matching row.

**Dirty-state confirmation** — if `isDirty` when a preset is clicked, store as `pendingPreset` and switch the popover body to an inline amber confirmation. No modal.

```tsx
const applyPreset = (preset: BoardPreset) => {
  if (isDirty) { setPendingPreset(preset); }
  else { setConfig(preset.config); setPresetOpen(false); }
};
```

---

## 8. Config Export / Import (Backup & Restore)

`src/lib/config-export.ts` owns all export/import logic. `Settings.Backup.tsx` is purely UI.

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

**Always excluded**: `auth` (credentials), `running_hours`, `tank_current_vol`, `tank_concentration_total` (runtime/wear data), `time.date/time` (device-local).

**Version compatibility** — `checkVersion(n)` returns `'ok' | 'older' | 'newer'`. Both directions show an amber warning and let the user proceed. Hard reject only on structural Zod failure.

**Zod schema uses `.passthrough()`** on `networkStateSchema` and `serviceStateSchema` so exports from firmware versions with extra/missing fields still validate.

**`applyImport(data, selected)`** applies sections sequentially (not `Promise.all`) — a failure in one section doesn't cancel others. Returns `ApplyResult[]`.

**Restart recommendation** — `SECTION_META` maps each `ImportSection` to `{ requiresRestart: boolean }`. After a successful apply, if any applied section has `requiresRestart: true`, an amber banner with a "Restart now" button appears.

**Import UX flow**: drop zone → `parseImportFile` → file info panel → section checkboxes pre-ticked → "Import N sections" → results inline (✓ / ✗ per row) → restart banner if needed.

---

## 9. Code Style

### 9.1 TypeScript

- **Strict mode is on** — `tsc -b` fails on any type error
- **No unused imports or variables** — build failures. Remove before handing off.
- **Explicit return types on exported components**: `React.ReactElement`
- **Functional components only** — arrow function or `function` declarations; no class components
- **Hooks at the top** of the component; avoid conditional hook calls
- **`React.useMemo`** for derived values in lists

### 9.2 Imports

- Use the `@/` path alias — never relative `../../`
- Order: React first, external libs, `@/` imports, sibling imports
- Include `.ts` / `.tsx` extensions on some internal imports to match existing convention

### 9.3 Styling

- **Use `cn()` from `@/lib/utils`** (wraps `clsx` + `tailwind-merge`)
- **Never write raw CSS** for components — only Tailwind utilities and CSS variables
- **Match existing spacing/sizing tokens** — don't introduce arbitrary values unless in DESIGN_SYSTEM.md
- **Use `tabular-nums`** for all numeric displays
- **Prefer existing shadcn primitives** over hand-rolled HTML

### 9.4 Component File Conventions

- One component per file; default export for pages, named exports for components
- File names: kebab-case (`pump-control-card.tsx`), component names: PascalCase
- Co-locate tightly coupled pieces: e.g. `pump-history/` folder with `heatmap.tsx`, `day-detail.tsx`, `utils.ts`, `use-pump-history.ts`

### 9.5 Formatting

Prettier + ESLint. Before committing:
```bash
pnpm lint && pnpm format:check
```
Do not reformat unrelated files — keep diffs minimal.

### 9.6 Comments

- Only add comments where logic is non-obvious
- No JSDoc on every prop; types carry the intent
- No TODO comments unless the user asks

### 9.7 Language / i18n

**Not implemented.** Strings are hardcoded English. Do not add any i18n library or translation infrastructure until explicitly started.

---

## 10. Known Fixes (Don't Repeat These Mistakes)

### 10.1 Mobile Grid Overflow (608px on 375px viewport)

**Root cause**: CSS Grid items have implicit `min-width: auto` — prevents shrinking below content intrinsic size.

**Fix**: Add `min-w-0` to every direct grid child:
```tsx
<section className="grid xl:grid-cols-12">
  <div className="min-w-0 xl:col-span-3">...</div>
  <div className="min-w-0 xl:col-span-9">...</div>
</section>
```

**Rule**: Every direct child of a grid or flex container with unknown-width content needs `min-w-0`.

### 10.2 Device Card Height Stretch (Permanent Vertical Scrollbar)

**Root cause**: `Card` had `h-full`, `CardContent` had `flex-1`, maintenance section had `mt-auto`. Combined with `xl:row-span-3`, caused card to eat all rows' height.

**Fix**: Remove `h-full` from Card, `flex-1` from CardContent, `mt-auto` from inner sections. Let content dictate height.

**Rule**: When placing cards in grids with `row-span`, do not force `h-full`.

### 10.3 Maintenance Buttons Overflowing Narrow Column

**Fix**: Force vertical stacking:
```tsx
<div className="[&>div]:flex-col">
  <ButtonGroup>...</ButtonGroup>
</div>
```

### 10.4 Day Detail Table Columns Cut Off on Mobile

**Fix**: Hide non-essential columns on mobile:
```tsx
<th className="hidden sm:table-cell">Sched</th>
<td className="hidden sm:table-cell">{value}</td>
```

**Rule**: On mobile, show only the 2 most critical columns. Use `hidden sm:table-cell` for the rest.

### 10.5 Unused Variables Causing Build Failures

**Fix**: Remove unused declarations before committing. `noUnusedLocals` is an error, not a warning. Run `pnpm build` before handing off.

### 10.6 Dark Mode Text Selection Unreadable

**Fix**:
```css
.dark ::selection {
  background: color-mix(in oklab, var(--color-primary) 40%, black);
  color: #e2e8f0;
}
```

### 10.7 Heatmap Bar Chart Too Prominent

**Fix**: `getBarIntensityClass` in `pump-history/utils.ts` uses 25-40% opacity (vs heatmap's 50-95%). Selected bar uses full-intensity.

**Rule**: When two visualizations coexist, dim the secondary one via lower opacity classes.

### 10.8 Flag Abbreviations Overflowing Table Cells

**Fix**: Single-letter abbreviations (S, M, C, K) with `title` attribute for full name on hover. See `renderFlags` and `flagTitle` in `utils.ts`.

### 10.9 Tailwind v4 Keyframes Not Working

**Fix**: In Tailwind v4, keyframes bound to `--animate-*` tokens must be inside the `@theme inline` block, not at the top level of `index.css`.

### 10.10 TS2739 After Adding a Field to `ServiceState`

**Root cause**: `defaultSettings.services` is typed as `ServiceState` — any new required field needs a default there, not just in the form.

**Fix**: Add defaults to three places in lockstep:
1. `src/hooks/use-store.ts` → `defaultSettings.services`
2. `src/lib/mock-backend.ts` → `initialState.services`
3. `src/components/<form>.tsx` → `defaultValues` + `FormSchema`

### 10.11 Dev Server Fails to Start via `pnpm`

**Root cause**: Corepack shim loaded by Node 16 doesn't understand private class fields (`#target`).

**Fix**: Bypass corepack. Use `./node_modules/.bin/vite` directly or `preview_start "Frontend Dev Server"` which has the workaround baked in. Never call `pnpm` from Bash tool calls.

---

## 11. UI Verification Workflow

When making UI changes, verify before reporting done. Use the `preview_*` tools — never ask the user to check manually:

1. `preview_start` if no dev server is running
2. Reload with `preview_eval: window.location.reload()` if HMR didn't pick up
3. `preview_console_logs` / `preview_network` for runtime errors
4. `preview_snapshot` for content/structure assertions
5. `preview_resize` to test mobile (375×667) AND desktop (1440×900)
6. `preview_screenshot` when sharing visual results

Test both light and dark modes if the change affects theme-sensitive styling.

---

## 12. Things to Avoid

- **Don't add new UI libraries** — everything through shadcn/ui + Tailwind. Bundle size is sacred.
- **Don't add runtime validators** for internal data — Zod is for user-input boundaries only (forms, file imports). Never validate API responses with Zod at runtime.
- **Don't refactor unrelated files** while making a targeted change.
- **Don't add `console.log`** debugging statements to committed code.
- **Don't add backwards-compat shims** for code the user asked to remove — delete it cleanly.
- **Don't lazy-load UI modules** — the ESP32 serves everything from flash; dynamic imports bloat the manifest.
- **Don't introduce non-CSS-variable colors** — always go through theme tokens.
- **Don't skip `min-w-0`** on grid/flex children (see §10.1).
- **Don't skip `pnpm build`** before handing off (see §10.5).
- **Don't call `pnpm` directly from Bash** — use local binaries (see §2).

---

## 13. Key File Pointers

| File | Purpose |
|---|---|
| `src/index.css` | Theme tokens, keyframes, gradients |
| `../design/DESIGN_SYSTEM.md` | Full design system reference |
| `../components.json` | shadcn/ui config |
| `src/lib/api.ts` | API client + shared types |
| `src/lib/board-config.ts` | Board config helpers, `createEmptyBoardConfig`, RPM math, `parseI2cInput`, `formatI2cAddr` |
| `src/lib/board-presets.ts` | `BOARD_PRESETS` — Fysetc E4 v1.0 preset definitions |
| `src/lib/config-export.ts` | `ConfigExport` type, Zod schema, `buildExport`, `downloadExport`, `parseImportFile`, `applyImport` |
| `src/lib/mock-backend.ts` | Mock device backend for local dev |
| `src/hooks/use-store.ts` | Zustand global store |
| `src/lib/utils.ts` | `cn()` utility |
| `src/components/home/pump-history/utils.ts` | Heatmap intensity + flag helpers |
| `src/components/schedule-form.tsx` | Compact form patterns reference |
| `src/components/services-form.tsx` | Nested feature-toggle panel reference (HA Discovery inside MQTT) |
| `src/components/font-scale-provider.tsx` | Font scale preference (Default/Large) |
| `src/components/theme-provider.tsx` | Theme preference (system/light/dark) |
| `src/components/realtime-provider.tsx` | WebSocket lifecycle + realtime state |
| `src/components/site-header.tsx` | Header with theme + font scale toggles |
| `.claude/launch.json` | Dev server launch config (corepack workaround) |
| `src/pages/Home.tsx` | Complex grid layout reference |
| `src/pages/History.tsx` | Single-card layout reference |
| `src/pages/Settings.Board.tsx` | Board config page — preset picker, Peripherals, no-form pattern |
| `src/pages/Settings.Backup.tsx` | Backup & Restore page — export/import UI |
