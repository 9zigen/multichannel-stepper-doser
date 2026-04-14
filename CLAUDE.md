# CLAUDE.md — Stepper Doser Project Guide

Guidance for Claude Code (and future AI agents) working in this repository. Read this before making changes.

---

## 1. Project Overview

**What**: ESP32-based multi-channel peristaltic pump controller for precise liquid dosing (aquarium/lab/hydroponics). Configurable schedules, manual runs, wear tracking, and a web UI served directly from the device.

**Architecture**:
- **Firmware**: ESP-IDF (C/C++), CMake build system
  - `main/` — application entry point
  - `components/` — custom ESP-IDF components (stepper driver, scheduler, API, storage)
  - `managed_components/` — third-party components
  - `partitions.csv` — flash layout
  - `ota_server.py` — OTA update helper
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

```bash
idf.py build             # ESP-IDF build
idf.py flash monitor     # flash + serial monitor
```

---

## 3. Frontend — What I've Learned

### 3.1 Tailwind CSS v4 — CSS-based Config

This project uses **Tailwind CSS v4**. There is NO `tailwind.config.js` for theme. All theme tokens live in `src/index.css` inside `:root`, `.dark`, and `@theme inline` blocks. When adding design tokens:

- Add the CSS variable to `:root` and/or `.dark`
- Map it inside `@theme inline` so Tailwind utilities pick it up
- Keyframes for `--animate-*` tokens must be defined inside the `@theme inline` block (this is a v4 quirk)

### 3.2 shadcn/ui Style: `radix-nova`

Component styling is defined in `components.json` with `style: "radix-nova"` and `iconLibrary: "tabler"`. The project uses both Tabler (`@tabler/icons-react`) and Lucide (`lucide-react`) icons. When adding new shadcn components, scaffold via `npx shadcn@latest add <component>` — do not hand-write primitive components.

### 3.3 Design System — Read First

Before any UI work read `frontend/design/DESIGN_SYSTEM.md`. It documents:

- Color tokens (light + dark), typography, spacing, shadows, radius
- All 11 component patterns (Card, Flat Panel, Key-Value Row, etc.)
- Animation keyframes and stagger patterns
- Responsive strategy and mobile overflow prevention
- Data viz intensity scales

Match existing patterns exactly. Do not invent new patterns without a strong reason.

### 3.4 Core UI Patterns (the ones you WILL reuse)

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

### 3.5 State Management

Global state: **Zustand** (`src/hooks/use-store.ts`). Access with `useAppStore((state) => state.xxx)` — always use a selector, never `useAppStore()` without one (avoids over-rendering).

Forms: **React Hook Form + Zod** (`@hookform/resolvers/zod`). Define a `FormSchema` with zod and mirror it as a `FormData` TypeScript type.

### 3.6 API Layer

`src/lib/api.ts` holds fetch helpers and types. Async actions return `{ success: boolean }` style results. Wrap calls in try/catch and surface outcomes via `sonner` toasts (`toast.success`, `toast.error`).

### 3.7 Adding a new settings field end-to-end

When the firmware gains a new settings field (e.g. a new MQTT/service option), four frontend files need to change in lockstep — missing any one will fail `tsc -b`:

1. **`src/lib/api.ts`** — add the field to the relevant type (e.g. `ServiceState`). This is the source of truth.
2. **`src/hooks/use-store.ts`** — add a default value inside `defaultSettings` so the store satisfies the type before the backend responds.
3. **`src/lib/mock-backend.ts`** — add the same default to `initialState` so local dev without a device still works.
4. **`src/components/<section>-form.tsx`** — extend `FormData`, `FormSchema` (zod), `defaultValues`, and the JSX. For booleans paired with text fields, use `useWatch` + `cn('pointer-events-none opacity-40', !enabled)` to dim dependent inputs, matching the existing NTP/MQTT panels.

For **nested feature toggles** (e.g. Home Assistant Discovery inside MQTT), compose the dependency: `const discoveryActive = enableMqtt && enableDiscovery;` and dim when `!discoveryActive`. Nest the sub-panel visually inside its parent panel using a lighter inner wrapper (`rounded-md border border-border/40 bg-background/40 p-3`) rather than a sibling flat panel.

### 3.8 How forms dim disabled dependent fields

The established pattern for a boolean toggle controlling a group of inputs:

```tsx
const enableFoo = useWatch({ control, name: 'enable_foo' });

<div className={cn('grid gap-3 sm:grid-cols-2', !enableFoo && 'pointer-events-none opacity-40')}>
  <Input {...register('foo_field')} disabled={!enableFoo} />
</div>
```

Both `pointer-events-none opacity-40` on the wrapper AND `disabled` on each input are used — the wrapper gives the visual cue, `disabled` prevents keyboard tabbing into dead fields.

---

## 4. Code Style

### 4.1 TypeScript

- **Strict mode is on** — the build runs `tsc -b` and fails on any type error
- **No unused imports or variables** — they cause build failures. If you introduce a variable while iterating, remove it before handing off.
- **Explicit return types on exported components**: `React.ReactElement` (see existing pages/components)
- **Functional components only** — use arrow function or `function` declarations; no class components
- **Hooks at the top** of the component; avoid conditional hook calls
- **`React.useMemo`** for anything derived from props/state that would otherwise cause re-renders in lists

### 4.2 Imports

- Use the `@/` path alias (`@/components/ui/button`, `@/lib/api`, `@/hooks/use-store`) — never relative paths like `../../`
- Order: React first, then external libs, then `@/` aliased imports, then sibling imports
- Include `.ts` / `.tsx` extensions on some internal imports to match existing convention (see `api.ts` imports)

### 4.3 Styling

- **Use `cn()` from `@/lib/utils`** to merge conditional classes (it wraps `clsx` + `tailwind-merge`)
- **Never write raw CSS** for components — only Tailwind utilities and existing CSS variables
- **Match existing spacing/sizing tokens** — don't introduce arbitrary values unless documented in DESIGN_SYSTEM.md
- **Use `tabular-nums`** for all numeric displays (volumes, hours, IPs, timestamps)
- **Prefer existing shadcn primitives** over hand-rolled HTML elements (use `<Button>`, `<Badge>`, `<Input>`, `<Toggle>`)

### 4.4 Component File Conventions

- One component per file; default export for pages, named exports for components
- File names: kebab-case (`pump-control-card.tsx`), component names: PascalCase
- Co-locate tightly coupled pieces: e.g. `pump-history/` folder holds `heatmap.tsx`, `day-detail.tsx`, `utils.ts`, `use-pump-history.ts`

### 4.5 Formatting

Prettier + ESLint enforce style. Before committing, run:

```bash
pnpm lint && pnpm format:check
```

Do **not** reformat unrelated files — keep diffs minimal.

### 4.6 Comments

- Only add comments where logic is non-obvious
- Do not add JSDoc to every prop; types carry the intent
- Do not add TODO comments unless the user asks — just finish the work or surface the issue in the PR description

---

## 5. How I've Fixed Errors in This Codebase

A log of real fixes applied during past sessions so future agents don't repeat the same mistakes.

### 5.1 Mobile Grid Overflow (Home Page, 608px on 375px viewport)

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

### 5.2 Device Card Height Stretch (Permanent Vertical Scrollbar)

**Symptom**: On the Home page, the Device Overview card stretched to 986px (exceeding 900px viewport) causing a permanent vertical scrollbar.

**Root cause**: `Card` had `h-full`, `CardContent` had `flex-1`, and the maintenance section had `mt-auto`. Combined with `xl:row-span-3`, this caused the card to eat all three rows' height.

**Fix**: Let the card find its natural height. Remove `h-full` from Card, `flex-1` from CardContent, `mt-auto` from inner sections.

**Rule going forward**: When placing cards in grids with `row-span`, do not force `h-full` on the Card. Let content dictate height.

### 5.3 Maintenance Buttons Overflowing Narrow Column

**Symptom**: Side-by-side `<Button>`s inside a narrow 3-column grid cell overflowed horizontally.

**Fix**: Force vertical stacking in the narrow container:

```tsx
<div className="[&>div]:flex-col">
  <ButtonGroup>...</ButtonGroup>
</div>
```

### 5.4 Day Detail Table Columns Cut Off on Mobile

**Symptom**: Table with 4 columns (Time, Sched, Manual, Flags) was cut off on mobile because `w-full` constrained it inside a narrow parent.

**Fix**: Hide non-essential columns on mobile:

```tsx
<th className="hidden sm:table-cell">Sched</th>
<td className="hidden sm:table-cell">{value}</td>
```

**Rule going forward**: On mobile, show only the most critical 2 columns of any data table. Use `hidden sm:table-cell` for the rest.

### 5.5 Unused Variables Causing Build Failures

**Symptom**: `pnpm build` failed with "declared but never used" errors on `modeDetails` and `mode` variables after iterating on the Schedule form.

**Fix**: Remove unused declarations before committing. TypeScript strict mode treats `noUnusedLocals` as an error, not a warning.

**Rule going forward**: Run `pnpm build` before handing off any UI change. Do not disable `noUnusedLocals` to dodge this.

### 5.6 Dark Mode Text Selection Unreadable

**Symptom**: Default `::selection` styling in dark mode mixed primary with white, producing washed-out, low-contrast highlights.

**Fix**: Override selection in dark mode to mix with black instead:

```css
.dark ::selection {
  background: color-mix(in oklab, var(--color-primary) 40%, black);
  color: #e2e8f0;
}
```

### 5.7 Heatmap Bar Chart Too Prominent

**Symptom**: Daily volume bar chart (next to the heatmap) was visually louder than the heatmap itself, breaking hierarchy.

**Fix**: Created `getBarIntensityClass` in `pump-history/utils.ts` using 25-40% opacity (vs the heatmap's 50-95%). The selected bar falls back to the full-intensity class so it stands out.

**Rule going forward**: When two data visualizations coexist on the same card, one must be visually subordinate. Dim the secondary one via lower opacity classes.

### 5.8 Flag Abbreviations Overflowing Table Cells

**Symptom**: Flag names ("Scheduled", "Manual", "Continuous", "Calibration") overflowed the narrow Flags column.

**Fix**: Render single-letter abbreviations (S, M, C, K) with a `title` attribute for the full name on hover. See `renderFlags` and `flagTitle` in `utils.ts`.

### 5.9 Tailwind v4 Keyframes Not Working Outside `@theme inline`

**Symptom**: Added `@keyframes bar-rise` at the top level of `index.css`, but `animate-bar-rise` class didn't resolve.

**Fix**: In Tailwind v4, keyframes bound to `--animate-*` tokens must live inside the `@theme inline` block alongside the `--animate-bar-rise` declaration.

### 5.10 TS2739 After Adding a Field to `ServiceState`

**Symptom**: Added `mqtt_discovery_topic` / `enable_mqtt_discovery` to `ServiceState` in `api.ts`. `tsc -b` immediately failed with `TS2739: Type '{ ... }' is missing the following properties from type 'ServiceState'` at `src/hooks/use-store.ts:107` (the `defaultSettings` literal).

**Root cause**: `defaultSettings.services` is typed as `ServiceState`, so any new required field must have a default value there — not just in the form.

**Fix**: Add the defaults to **three** places in lockstep with the type change:
1. `src/hooks/use-store.ts` → `defaultSettings.services`
2. `src/lib/mock-backend.ts` → `initialState.services`
3. `src/components/<form>.tsx` → `defaultValues` + `FormSchema`

See section 3.7 for the canonical order.

### 5.11 Dev Server Fails to Start via `pnpm`

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

## 6. UI Verification Workflow

When making UI changes, verify them before reporting done. Use the `preview_*` tools (never ask the user to check manually):

1. `preview_start` if no dev server is running
2. Reload with `preview_eval: window.location.reload()` if HMR didn't pick up
3. `preview_console_logs` / `preview_network` for runtime errors
4. `preview_snapshot` for content/structure assertions
5. `preview_resize` to test mobile (375×667) AND desktop (1440×900)
6. `preview_screenshot` when sharing visual results with the user

Test both light and dark modes if the change affects theme-sensitive styling.

---

## 7. Commit & PR Conventions

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

## 8. Things to Avoid

- **Don't add new UI libraries** — everything must go through shadcn/ui + Tailwind. Bundle size is sacred.
- **Don't add runtime validators** for internal data — Zod is for form input boundaries only.
- **Don't refactor unrelated files** while making a targeted change.
- **Don't add `console.log`** debugging statements to committed code.
- **Don't add backwards-compat shims** for code the user asked to remove — delete it cleanly.
- **Don't lazy-load UI modules** — the ESP32 serves everything from flash, dynamic imports just bloat the manifest.
- **Don't introduce non-CSS-variable colors** — always go through the theme tokens.
- **Don't skip `min-w-0`** on grid/flex children (see 5.1).
- **Don't skip `pnpm build`** before handing off (see 5.5).

---

## 9. Useful File Pointers

| File                                              | Purpose                                   |
|---------------------------------------------------|-------------------------------------------|
| `frontend/src/index.css`                          | Theme tokens, keyframes, gradients        |
| `frontend/design/DESIGN_SYSTEM.md`                | Full design system reference              |
| `frontend/components.json`                        | shadcn/ui config                          |
| `frontend/src/lib/api.ts`                         | API client + shared types                 |
| `frontend/src/hooks/use-store.ts`                 | Zustand global store                      |
| `frontend/src/lib/utils.ts`                       | `cn()` utility                            |
| `frontend/src/components/home/pump-history/utils.ts` | Heatmap intensity + flag helpers      |
| `frontend/src/components/schedule-form.tsx`       | Compact form patterns reference           |
| `frontend/src/components/services-form.tsx`       | Nested feature-toggle panel reference (HA Discovery inside MQTT) |
| `.claude/launch.json`                             | Dev server launch config (corepack workaround) |
| `frontend/src/pages/Home.tsx`                     | Complex grid layout reference             |
| `frontend/src/pages/History.tsx`                  | Single-card layout reference              |

---

*Last updated: Home Assistant discovery fields added to Services page; corepack/pnpm workaround documented; end-to-end settings-field propagation playbook added (sections 3.7, 3.8, 5.10, 5.11).*
