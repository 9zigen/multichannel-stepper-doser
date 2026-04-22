# Stepper Doser Design System

A comprehensive design system reference for the ESP32 Stepper Doser web interface. This document provides everything needed for an AI agent or human designer to replicate, extend, or adapt this design for similar embedded IoT controller products.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Border Radius](#6-border-radius)
7. [Shadows](#7-shadows)
8. [Backgrounds & Gradients](#8-backgrounds--gradients)
9. [Component Patterns](#9-component-patterns)
10. [Animation System](#10-animation-system)
11. [Responsive Strategy](#11-responsive-strategy)
12. [Icon System](#12-icon-system)
13. [Form Patterns](#13-form-patterns)
14. [Data Visualization](#14-data-visualization)
15. [Interaction Patterns](#15-interaction-patterns)
16. [Production Constraints](#16-production-constraints)
17. [File Structure](#17-file-structure)
18. [Font Scale System](#18-font-scale-system)
19. [iOS Adaptation (SwiftUI Tokens)](#19-ios-adaptation-swiftui-tokens)

---

## 1. Overview

### Design Philosophy

The UI follows a **dark-first fintech-inspired** aesthetic optimized for embedded devices. Key principles:

- **Information density over whitespace** — compact cards, small text, tabular numbers
- **Glassy depth** — translucent cards with backdrop blur over gradient backgrounds
- **Muted hierarchy** — primary content in foreground color, secondary in muted tones, labels in uppercase micro text
- **Minimal chrome** — thin borders at low opacity, subtle shadows, no heavy dividers
- **Single-card layouts** — each page centers around one primary card containing all related content in flat panels
- **Performance-first** — bundle size is critical; the compiled UI is embedded in ESP32 firmware binary and served via brotli compression

### Visual Identity

| Attribute       | Value                                  |
|-----------------|----------------------------------------|
| Primary accent  | Cyan `#22d3ee`                         |
| Background      | Near-black `#0b0e11`                   |
| Card surface    | Dark blue-grey `#131820`               |
| Text            | Slate white `#e2e8f0`                  |
| Muted text      | Slate grey `#64748b`                   |
| Destructive     | Red `#ef4444`                          |
| Warning         | Amber (Tailwind `amber-500`/`amber-600`) |
| Data positive   | Emerald (Tailwind `emerald-200` → `emerald-500`) |

---

## 2. Technology Stack

| Layer          | Technology                            | Notes                                    |
|----------------|---------------------------------------|------------------------------------------|
| Framework      | React 19 + TypeScript 5.9             | SPA, no SSR (`rsc: false`)               |
| Build          | Vite 7 + `@tailwindcss/vite`          | Brotli + gzip compression via plugins    |
| CSS            | Tailwind CSS v4                       | CSS-based config (no `tailwind.config.js` for theme) |
| Components     | shadcn/ui (style: `radix-nova`)       | Radix UI primitives underneath           |
| State          | Zustand 5                             | Global app store                         |
| Forms          | React Hook Form 7 + Zod 4             | Schema validation                        |
| Routing        | React Router DOM 7                    | Client-side SPA routing                  |
| Icons          | Lucide React + Tabler Icons           | `iconLibrary: "tabler"` in shadcn config |
| Toasts         | Sonner 2                              | Toast notifications                      |
| Package mgr    | pnpm 9                                |                                          |

### shadcn/ui Configuration (`components.json`)

```json
{
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "iconLibrary": "tabler",
  "menuColor": "inverted-translucent",
  "menuAccent": "subtle",
  "tailwind": {
    "css": "src/index.css",
    "cssVariables": true,
    "baseColor": "neutral"
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## 3. Color System

All colors are defined as CSS custom properties in `src/index.css` and mapped to Tailwind via `@theme inline`.

### Light Mode (`:root`)

| Token                | Value                                         | Usage                        |
|----------------------|-----------------------------------------------|------------------------------|
| `--background`       | `#ffffff`                                     | Page background              |
| `--foreground`       | `#36454f`                                     | Primary text                 |
| `--card`             | `#ffffff`                                     | Card surfaces                |
| `--card-foreground`  | `#36454f`                                     | Card text                    |
| `--primary`          | `#36454f`                                     | Primary actions/accents      |
| `--primary-foreground` | `#ffffff`                                   | Text on primary              |
| `--secondary`        | `#d3d3d3`                                     | Secondary surfaces           |
| `--secondary-foreground` | `#36454f`                                 | Text on secondary            |
| `--muted`            | `color-mix(in srgb, #d3d3d3 45%, #ffffff)`    | Muted backgrounds            |
| `--muted-foreground` | `#708090`                                     | Secondary text               |
| `--accent`           | `#708090`                                     | Accent elements              |
| `--destructive`      | `oklch(0.577 0.245 27.325)`                   | Error/danger                 |
| `--border`           | `color-mix(in srgb, #d3d3d3 75%, #ffffff)`    | Border color                 |
| `--input`            | `color-mix(in srgb, #d3d3d3 82%, #ffffff)`    | Input borders                |
| `--ring`             | `#708090`                                     | Focus rings                  |

### Dark Mode (`.dark`)

| Token                | Value                          | Usage                        |
|----------------------|--------------------------------|------------------------------|
| `--background`       | `#0b0e11`                      | Page background              |
| `--foreground`       | `#e2e8f0`                      | Primary text                 |
| `--card`             | `#131820`                      | Card surfaces                |
| `--card-foreground`  | `#e2e8f0`                      | Card text                    |
| `--popover`          | `#161b22`                      | Popover/dropdown surfaces    |
| `--primary`          | `#22d3ee`                      | Cyan accent                  |
| `--primary-foreground` | `#0b0e11`                    | Text on primary buttons      |
| `--secondary`        | `#1e293b`                      | Secondary surfaces           |
| `--secondary-foreground` | `#e2e8f0`                  | Text on secondary            |
| `--muted`            | `#1e293b`                      | Muted backgrounds            |
| `--muted-foreground` | `#64748b`                      | Labels, captions             |
| `--accent`           | `#06b6d4`                      | Accent (slightly darker cyan)|
| `--destructive`      | `#ef4444`                      | Error/danger                 |
| `--border`           | `rgb(148 163 184 / 0.08)`      | Very subtle borders          |
| `--input`            | `rgb(148 163 184 / 0.12)`      | Input field borders          |
| `--ring`             | `#22d3ee`                      | Focus ring color             |

### Chart Colors (Dark Mode)

| Token       | Value     | Usage        |
|-------------|-----------|--------------|
| `--chart-1` | `#22d3ee` | Primary data |
| `--chart-2` | `#10b981` | Secondary    |
| `--chart-3` | `#f59e0b` | Tertiary     |
| `--chart-4` | `#8b5cf6` | Quaternary   |
| `--chart-5` | `#64748b` | Quinary      |

### Sidebar Colors (Dark Mode)

| Token                        | Value                    |
|------------------------------|--------------------------|
| `--sidebar`                  | `#0f1318`                |
| `--sidebar-foreground`       | `#e2e8f0`                |
| `--sidebar-primary`          | `#22d3ee`                |
| `--sidebar-border`           | `rgb(148 163 184 / 0.06)`|

### Selection Colors

```css
/* Light mode */
::selection {
  background: color-mix(in oklab, var(--color-primary) 30%, white);
  color: var(--color-foreground);
}

/* Dark mode — mix with black to maintain readability */
.dark ::selection {
  background: color-mix(in oklab, var(--color-primary) 40%, black);
  color: #e2e8f0;
}
```

---

## 4. Typography

### Font Stack

| Role   | Font Family                   | CSS Variable   | Fallback    |
|--------|-------------------------------|----------------|-------------|
| Sans   | `DejaVu Sans`                 | `--font-sans`  | `sans-serif` |
| Mono   | `JetBrains Mono`              | `--font-mono`  | `monospace`  |
| Serif  | `Source Serif 4`              | `--font-serif` | `serif`      |

The heading font (`--font-heading`) is the same as `--font-sans`.

### Type Scale

| Element               | Classes                                     | Usage                          |
|-----------------------|---------------------------------------------|--------------------------------|
| Page title            | `text-lg font-medium`                       | Card titles                    |
| Section title         | `text-base font-medium`                     | Sub-card headers               |
| Body text             | `text-sm`                                   | Default content text           |
| Small text            | `text-xs`                                   | Table cells, form labels       |
| Micro text            | `text-[10px]`                               | Badges, counters               |
| Nano text             | `text-[9px]`                                | Heatmap labels, chart legends  |
| Caption text          | `text-[11px]`                               | Help text, descriptions        |

### Label Pattern (Section Headers)

Uppercase micro labels are used consistently for section titles inside flat panels:

```html
<span class="text-[10px] uppercase tracking-wider text-muted-foreground">
  Section Name
</span>
```

### Tabular Numbers

Use `tabular-nums` class on all numeric displays (hours, volumes, percentages, IP addresses, dates/times) for proper alignment:

```html
<span class="font-medium tabular-nums">192.168.1.1</span>
```

---

## 5. Spacing & Layout

### Base Spacing

The spacing scale is based on `--spacing: 0.25rem` (4px). Tailwind's default spacing utilities apply.

### Page Container Pattern

Every page follows this wrapper structure:

```html
<div class="flex flex-col gap-4 py-2 md:py-3">
  <section class="mx-auto w-full max-w-screen-2xl px-3">
    <!-- Card content -->
  </section>
</div>
```

- `max-w-screen-2xl` = `1536px` max content width
- `px-3` = `12px` horizontal page padding
- `py-2 md:py-3` = `8px` top/bottom on mobile, `12px` on desktop
- `gap-4` = `16px` between major sections

### Grid Systems

#### Home Page — Complex 12-Column Grid

```html
<section class="mx-auto grid w-full max-w-screen-2xl gap-3 px-3 xl:grid-cols-12">
  <div class="min-w-0 xl:col-span-3 xl:row-span-3"><!-- Device Overview --></div>
  <div class="min-w-0 xl:col-span-9"><!-- Pump Aging --></div>
  <div class="min-w-0 xl:col-span-3 xl:h-full"><!-- Today's Dosing --></div>
  <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:col-span-6 xl:grid-cols-12">
    <div class="md:col-span-2 xl:col-span-12"><!-- Pump Control --></div>
    <div class="md:col-span-1 xl:col-span-6 xl:h-full"><!-- Connectivity --></div>
    <div class="md:col-span-1 xl:col-span-6 xl:h-full"><!-- System --></div>
  </div>
</section>
```

**Critical**: All grid children must have `min-w-0` to prevent overflow on mobile viewports.

#### History / Schedule Pages — Single Card

```html
<section class="mx-auto w-full max-w-screen-2xl px-3">
  <Card><!-- Full-width single card --></Card>
</section>
```

#### Inner Content Split

```html
<div class="grid gap-3 xl:grid-cols-[1fr_1fr]">
  <div class="min-w-0 overflow-hidden ..."><!-- Left panel --></div>
  <div class="min-w-0 ..."><!-- Right panel --></div>
</div>
```

### Gap Scale (Common Values)

| Context             | Gap   | Pixels |
|---------------------|-------|--------|
| Between cards       | `gap-3` | 12px |
| Inside card content | `gap-3` | 12px |
| Between form fields | `gap-3` | 12px |
| Table row items     | `gap-2` | 8px  |
| Badge groups        | `gap-1.5` | 6px |
| Heatmap cells       | `gap-1` | 4px  |
| Icon + label        | `gap-2` | 8px  |

---

## 6. Border Radius

Defined as CSS custom properties with a base of `--radius: 0.75rem` (light) / `0.5rem` (dark):

| Token          | Computed (Dark) | Usage                |
|----------------|-----------------|----------------------|
| `--radius-sm`  | `0.125rem`      | Small elements       |
| `--radius-md`  | `0.25rem`       | Buttons, inputs      |
| `--radius-lg`  | `0.5rem`        | Cards, panels        |
| `--radius-xl`  | `1rem`          | Large containers     |
| `--radius-2xl` | `0.9rem`        | Card outer corners   |
| `--radius-3xl` | `1.1rem`        | Extra large          |
| `--radius-4xl` | `1.3rem`        | Maximum rounding     |

### Common Radius Usage

| Element        | Class           |
|----------------|-----------------|
| Cards          | `rounded-2xl`   |
| Flat panels    | `rounded-lg`    |
| Buttons        | `rounded-lg`    |
| Toggle cells   | `rounded-md`    |
| Heatmap cells  | `rounded-[3px]` |
| Pill buttons   | `rounded-full`  |
| Progress bars  | `rounded-full`  |

---

## 7. Shadows

The shadow system uses a layered approach with an outer ring for subtle edge definition in dark mode.

### Dark Mode Shadows

| Token          | Value                                                                        |
|----------------|------------------------------------------------------------------------------|
| `--shadow-2xs` | `0 1px 2px 0 rgb(0 0 0 / 0.3)`                                              |
| `--shadow-xs`  | `0 0 0 1px rgb(148 163 184 / 0.04), 0 2px 8px -2px rgb(0 0 0 / 0.4)`        |
| `--shadow-sm`  | `0 0 0 1px rgb(148 163 184 / 0.04), 0 4px 16px -4px rgb(0 0 0 / 0.5)`       |
| `--shadow`     | `0 0 0 1px rgb(148 163 184 / 0.04), 0 8px 24px -6px rgb(0 0 0 / 0.5)`       |
| `--shadow-md`  | `0 0 0 1px rgb(148 163 184 / 0.04), 0 12px 32px -8px rgb(0 0 0 / 0.55)`     |
| `--shadow-lg`  | `0 0 0 1px rgb(148 163 184 / 0.04), 0 16px 40px -10px rgb(0 0 0 / 0.6)`     |
| `--shadow-xl`  | `0 0 0 1px rgb(148 163 184 / 0.04), 0 24px 56px -14px rgb(0 0 0 / 0.65)`    |
| `--shadow-2xl` | `0 0 0 1px rgb(148 163 184 / 0.04), 0 32px 72px -18px rgb(0 0 0 / 0.7)`     |

Pattern: `1px inset ring at 4% opacity` + `blur shadow with high negative spread`. The ring provides subtle edge definition against the dark background.

### Light Mode Shadows

Single-layer shadows using the primary foreground color `rgb(54 69 79 / opacity)`, no ring:

| Token          | Value                                           |
|----------------|-------------------------------------------------|
| `--shadow-sm`  | `0 8px 20px -12px rgb(54 69 79 / 0.12)`         |
| `--shadow`     | `0 12px 32px -16px rgb(54 69 79 / 0.14)`        |

### Card Shadow

Cards use `shadow-sm` — the lightest meaningful shadow:

```html
<Card class="shadow-sm">
```

### Cyan Glow (Active State)

Active/selected elements get a subtle cyan glow:

```css
shadow-[0_0_12px_rgba(34,211,238,0.1)]
```

---

## 8. Backgrounds & Gradients

### Page Background

The page uses layered radial gradients for atmospheric depth:

```css
/* Dark mode */
.dark body {
  background:
    radial-gradient(circle at top left, color-mix(in oklab, var(--color-accent) 6%, transparent) 0, transparent 32%),
    radial-gradient(circle at top right, color-mix(in oklab, var(--color-primary) 4%, transparent) 0, transparent 26%),
    var(--color-background);
  min-height: 100vh;
}

/* Light mode — slightly more visible gradients */
body {
  background:
    radial-gradient(circle at top left, color-mix(in oklab, var(--color-accent) 12%, transparent) 0, transparent 32%),
    radial-gradient(circle at top right, color-mix(in oklab, var(--color-primary) 8%, transparent) 0, transparent 26%),
    linear-gradient(180deg, color-mix(in oklab, var(--color-secondary) 38%, transparent), transparent 30%),
    var(--color-background);
  min-height: 100vh;
}
```

### Wear Progress Bar Gradients

```css
/* Nominal (cyan accent) */
from-primary via-primary/85 to-accent

/* Warning (amber) */
from-amber-500 to-amber-400

/* Replace (destructive red) */
from-destructive to-destructive/70
```

---

## 9. Component Patterns

### 9.1 Card (Primary Container)

The main container for all page content. Uses glassmorphism effect.

```html
<Card class="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
  <CardHeader class="pb-2">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div class="flex items-center gap-2">
        <Icon class="size-5 text-primary" />
        <CardTitle class="text-lg">Title</CardTitle>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" class="text-xs tabular-nums">stat</Badge>
      </div>
    </div>
  </CardHeader>
  <CardContent class="flex flex-col gap-3">
    <!-- Content -->
  </CardContent>
</Card>
```

Key card classes:
- `border-border/50` — 50% opacity border
- `bg-card/80` — 80% opacity card background (translucent)
- `backdrop-blur-sm` — subtle frosted glass effect
- `shadow-sm` — minimal shadow for depth
- `overflow-hidden` — clip children to rounded corners

### 9.2 Flat Panel (Inner Container)

Content sections inside cards use flat panels:

```html
<div class="rounded-lg border border-border/40 bg-secondary/10 p-3">
  <span class="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">
    Section Title
  </span>
  <!-- Section content -->
</div>
```

Key flat panel classes:
- `rounded-lg` — consistent rounding
- `border border-border/40` — 40% opacity border (lighter than card)
- `bg-secondary/10` — 10% opacity secondary background
- `p-3` — 12px padding

### 9.3 Key-Value Row

Used extensively for displaying status information:

```html
<div class="flex items-center justify-between gap-2">
  <span class="text-muted-foreground">Label</span>
  <span class="font-medium tabular-nums">Value</span>
</div>
```

Wrap multiple rows in a grid:

```html
<div class="grid gap-2 text-xs">
  <!-- Key-value rows -->
</div>
```

### 9.4 Badge Variants

| Variant       | Usage                      | Appearance                             |
|---------------|----------------------------|----------------------------------------|
| `default`     | Active status, primary     | Cyan bg, dark text                     |
| `secondary`   | Stats, counts              | Slate bg, light text                   |
| `outline`     | Neutral status, nominal    | Border only                            |
| `destructive` | Errors, replace warnings   | Red bg at 10-20% opacity, red text     |

Common badge pattern:

```html
<Badge variant="secondary" class="text-xs tabular-nums">4 pumps</Badge>
<Badge variant="outline" class="text-[10px] tabular-nums">10.5 ml/day</Badge>
```

### 9.5 Card Header with Badges

The standard header combines an icon, title, and inline stat badges:

```html
<CardHeader class="pb-2">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <div class="flex items-center gap-2">
      <IconComponent class="size-5 text-primary" />
      <CardTitle class="text-lg">Title</CardTitle>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" class="text-xs tabular-nums">Stat 1</Badge>
      <Badge variant="secondary" class="text-xs tabular-nums">Stat 2</Badge>
    </div>
  </div>
</CardHeader>
```

### 9.6 Pill Button Selector

Used for pump selection in Schedule and History pages:

```html
<button
  type="button"
  class="rounded-full border px-3 py-1 text-sm font-medium transition-all
    border-primary/40 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]"
>
  <!-- Selected state (above) -->
</button>

<button
  type="button"
  class="rounded-full border px-3 py-1 text-sm font-medium transition-all
    border-border/50 bg-secondary/10 text-muted-foreground hover:bg-secondary/20 hover:text-foreground"
>
  <!-- Unselected state (above) -->
</button>
```

### 9.7 Alert / Warning Banner

```html
<div class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
  <div class="mb-1 flex items-center gap-2 font-medium text-destructive">
    <AlertTriangle class="size-4" />
    Warning title
  </div>
  <div class="text-muted-foreground">Description text.</div>
</div>
```

### 9.8 Info Note

```html
<div class="flex items-start gap-2 rounded-lg border border-border/40 bg-secondary/10 p-3">
  <TimerReset class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  <p class="text-[11px] leading-relaxed text-muted-foreground">
    Helpful note text.
  </p>
</div>
```

### 9.9 Data Table

```html
<table class="w-full text-sm">
  <thead>
    <tr class="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
      <th class="whitespace-nowrap py-2 pr-4 text-left font-medium">Column</th>
    </tr>
  </thead>
  <tbody>
    <tr class="animate-fade-in-up border-b border-border/50 last:border-0"
        style="animation-delay: 50ms">
      <td class="whitespace-nowrap py-2 pr-4">
        <span class="font-medium">Cell value</span>
      </td>
    </tr>
  </tbody>
</table>
```

### 9.10 Empty State

```html
<Empty class="border-border bg-muted/20">
  <EmptyHeader>
    <EmptyMedia variant="icon"><ListChecks /></EmptyMedia>
    <EmptyTitle>No data available</EmptyTitle>
    <EmptyDescription>Explanation text.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

### 9.11 Confirmation Dialog (Alert Dialog)

Used for destructive actions (restart, factory reset):

```html
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Action</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogMedia class="bg-destructive/10 text-destructive">
        <ShieldAlert />
      </AlertDialogMedia>
      <AlertDialogTitle>Confirm action</AlertDialogTitle>
      <AlertDialogDescription>Explanation.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive">Confirm</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 9.12 Preset Picker (Popover + Inline Dirty Confirmation)

Used in the Board Configuration page header. A small "Presets" button opens a Popover listing hardware presets. If the form is dirty, clicking a preset swaps the Popover body to an amber inline confirmation instead of opening a modal.

```tsx
// Trigger in card header
<Popover open={presetOpen} onOpenChange={setPresetOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs">
      <LayoutTemplate class="size-3.5" />
      Presets
      <ChevronDown class="size-3" />
    </Button>
  </PopoverTrigger>
  <PopoverContent class="w-72 p-0" align="end">
    {!pendingPreset ? (
      // Normal list
      <div class="flex flex-col py-1">
        {BOARD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            class="flex flex-col gap-0.5 px-3 py-2 text-left text-sm
              hover:bg-secondary/40 transition-colors"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium">{preset.name}</span>
              {isActive(preset) && <Check class="size-3.5 text-primary" />}
            </div>
            <span class="text-[11px] text-muted-foreground">{preset.description}</span>
          </button>
        ))}
      </div>
    ) : (
      // Inline amber dirty-state confirmation
      <div class="p-3">
        <div class="mb-2 flex items-center gap-2 text-sm font-medium text-amber-500">
          <AlertTriangle class="size-4" /> Unsaved changes
        </div>
        <p class="mb-3 text-[11px] text-muted-foreground">
          Apply "{pendingPreset.name}" and discard current edits?
        </p>
        <div class="flex gap-2">
          <Button size="sm" class="h-7 flex-1" onClick={confirmApplyPreset}>
            Apply anyway
          </Button>
          <Button variant="outline" size="sm" class="h-7" onClick={() => setPendingPreset(null)}>
            Cancel
          </Button>
        </div>
      </div>
    )}
  </PopoverContent>
</Popover>
```

Active preset detection: `JSON.stringify(currentConfig) === JSON.stringify(preset.config)`.

### 9.13 Drop Zone (File Import)

Used in the Backup & Restore page. A bordered dashed area that responds to drag events and click-to-select:

```tsx
<div
  onClick={() => fileInputRef.current?.click()}
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
  class={cn(
    "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8",
    "transition-colors text-center",
    isDragging
      ? "border-primary/60 bg-primary/5 text-primary"
      : "border-border/50 bg-secondary/5 text-muted-foreground hover:border-border hover:bg-secondary/10"
  )}
>
  <Upload class="size-8 opacity-50" />
  <div>
    <p class="text-sm font-medium">Drop config file here</p>
    <p class="text-[11px] mt-0.5">or click to browse — .json files only</p>
  </div>
</div>
<input ref={fileInputRef} type="file" accept=".json" class="hidden"
  onChange={(e) => handleFile(e.target.files?.[0])} />
```

### 9.14 File Info Panel (Post-Parse Import)

Displayed after a config file is successfully parsed:

```tsx
<div class="rounded-lg border border-border/40 bg-secondary/10 p-3">
  <div class="flex items-start justify-between gap-2">
    <div class="grid gap-1.5 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="text-muted-foreground">Version</span>
        <Badge variant={versionOk ? "secondary" : "outline"}
          class={cn("text-[10px]", !versionOk && "border-amber-500/40 text-amber-500")}>
          v{parsed.version}
        </Badge>
        {versionStatus !== 'ok' && (
          <span class="text-[10px] text-amber-500">
            ({versionStatus === 'older' ? 'older format' : 'newer format'})
          </span>
        )}
      </div>
      <div class="flex gap-1.5">
        <span class="text-muted-foreground">Exported</span>
        <span class="tabular-nums">{formatDate(parsed.exported_at)}</span>
      </div>
      <div class="flex gap-1.5">
        <span class="text-muted-foreground">Firmware</span>
        <span>{parsed.device_info.firmware_version}</span>
      </div>
    </div>
    <Button variant="ghost" size="icon" class="size-6 shrink-0" onClick={clearFile}>
      <XCircle class="size-4" />
    </Button>
  </div>
</div>
```

### 9.15 Per-Row Result Item (Import Outcome)

Applied sequentially after import completes — each section shows ✓ or ✗:

```tsx
{applyResults.map((result) => (
  <div key={result.section}
    class="flex items-center gap-2 rounded-md border border-border/30 bg-secondary/10 px-3 py-2 text-xs">
    {result.success
      ? <CheckCircle2 class="size-3.5 shrink-0 text-emerald-500" />
      : <XCircle class="size-3.5 shrink-0 text-destructive" />}
    <span class="flex-1 font-medium">{SECTION_META[result.section].label}</span>
    {!result.success && (
      <span class="text-destructive/80 truncate max-w-[180px]">{result.error}</span>
    )}
  </div>
))}
```

### 9.16 Amber Action Banner (Restart Recommendation)

Displayed after a config import that requires a device restart:

```tsx
<div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-start gap-2">
      <AlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-500" />
      <div>
        <p class="text-sm font-medium text-amber-500">Restart recommended</p>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          Applied sections require a device restart to take effect.
        </p>
      </div>
    </div>
    <Button size="sm" variant="outline"
      class="shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10">
      Restart now
    </Button>
  </div>
</div>
```

### 9.17 Peripheral Config Row (GPIO / ADC)

Used in the Board Configuration page for GPIO inputs, outputs, and ADC channels. Each row is a horizontal strip with a label, a `Switch` enable toggle, and contextual selects/number inputs — all dimmed at 60% opacity when disabled:

```tsx
{config.gpio_inputs.map((inp) => (
  <div key={inp.id}
    class={cn(
      "flex flex-wrap items-center gap-3 rounded-md border border-border/30 bg-background/40 px-3 py-2",
      !inp.enabled && "opacity-60"
    )}>
    {/* Enable toggle */}
    <Switch checked={inp.enabled}
      onCheckedChange={(v) => updateGpioInput(inp.id, 'enabled', v)} />
    {/* Pin label */}
    <span class="min-w-[52px] text-xs font-medium tabular-nums">IO{inp.pin}</span>
    {/* Pull resistor */}
    <Select value={String(inp.pull)} disabled={!inp.enabled}
      onValueChange={(v) => updateGpioInput(inp.id, 'pull', Number(v))}>
      <SelectTrigger class="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="0">None</SelectItem>
        <SelectItem value="1">Pull-up</SelectItem>
        <SelectItem value="2">Pull-down</SelectItem>
      </SelectContent>
    </Select>
    {/* Active level */}
    <Select value={String(inp.active_level)} disabled={!inp.enabled}
      onValueChange={(v) => updateGpioInput(inp.id, 'active_level', Number(v))}>
      <SelectTrigger class="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="1">High (1)</SelectItem>
        <SelectItem value="0">Low (0)</SelectItem>
      </SelectContent>
    </Select>
  </div>
))}
```

### 9.18 Section Checkbox Selector

Used in the Backup & Restore import flow to let the user choose which config sections to restore:

```tsx
{ALL_SECTIONS.map((section) => {
  const meta = SECTION_META[section];
  const available = !!parsed[section];
  return (
    <div key={section}
      class={cn(
        "flex items-start gap-3 rounded-lg border border-border/40 bg-secondary/10 p-3",
        !available && "opacity-50"
      )}>
      <Checkbox id={section} checked={selected.has(section)} disabled={!available}
        onCheckedChange={(checked) => toggleSection(section, !!checked)}
        class="mt-0.5" />
      <div class="grid gap-0.5">
        <Label htmlFor={section} class="text-sm font-medium cursor-pointer">
          {meta.label}
          {meta.requiresRestart && (
            <Badge variant="outline" class="ml-2 text-[9px] border-amber-500/40 text-amber-500">
              restart
            </Badge>
          )}
        </Label>
        <span class="text-[11px] text-muted-foreground">{meta.description}</span>
        {!available && <span class="text-[10px] text-muted-foreground/60">Not in this file</span>}
      </div>
    </div>
  );
})}
```

---

## 10. Animation System

All animations are defined in `src/index.css` inside `@theme inline`.

### Keyframes

#### `fade-in-up` — Entry animation for list items and table rows

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
--animate-fade-in-up: fade-in-up 0.3s ease-out both;
```

Usage: Apply to list items with staggered delays:

```html
<tr class="animate-fade-in-up" style="animation-delay: 50ms">
<tr class="animate-fade-in-up" style="animation-delay: 100ms">
```

Standard delay: `${index * 50}ms` for table rows, `${index * 20}ms` for dense grids.

#### `bar-rise` — Chart bar entry animation

```css
@keyframes bar-rise {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}
--animate-bar-rise: bar-rise 0.4s ease-out both;
```

Usage: Apply to bar chart elements with `origin-bottom` and staggered delays:

```html
<div class="origin-bottom animate-bar-rise"
     style="height: 75%; animation-delay: 15ms">
```

Standard delay: `${index * 15}ms` for bar chart columns.

#### `collapsible-down` / `collapsible-up` — Expand/collapse

```css
@keyframes collapsible-down {
  from { height: 0; opacity: 0; }
  to { height: var(--radix-collapsible-content-height); opacity: 1; }
}
/* Duration: 0.2s ease-out (down), 0.15s ease-in (up) */
```

#### `accordion-down` / `accordion-up` — Accordion panels

```css
@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}
/* Duration: 0.2s ease-out */
```

### CSS Transitions for Collapsible Help Text

Instead of keyframe animations, help text uses CSS grid row transitions:

```html
<div class="grid transition-all duration-200
     grid-rows-[1fr] opacity-100    /* expanded */
     grid-rows-[0fr] opacity-0">    /* collapsed */
  <p class="overflow-hidden text-[11px] leading-tight text-muted-foreground">
    Help text content
  </p>
</div>
```

### Loading Spinner

```html
<LoaderCircle class="animate-spin" />
```

---

## 11. Responsive Strategy

### Breakpoints (Tailwind v4 Defaults)

| Prefix | Width    | Usage                             |
|--------|----------|-----------------------------------|
| `sm`   | `640px`  | Side-by-side layouts begin        |
| `md`   | `768px`  | Two-column grids                  |
| `xl`   | `1280px` | Full desktop 12-column grid       |

### Mobile-First Patterns

1. **Grid overflow prevention**: Always add `min-w-0` to grid children
2. **Column hiding**: Hide secondary table columns on mobile:
   ```html
   <th class="hidden sm:table-cell">Optional Column</th>
   ```
3. **Responsive grid columns**: Hours grid adapts:
   ```html
   <div class="grid grid-cols-6 gap-1 sm:grid-cols-8 xl:grid-cols-12">
   ```
4. **Stacked → row**: Use `flex-col sm:flex-row` for layouts that stack on mobile
5. **Chart height**: Fixed height on mobile, flexible on desktop:
   ```html
   <div class="h-10 sm:h-auto sm:flex-1">
   ```
6. **Button stacking**: Force vertical on narrow containers:
   ```css
   [&>div]:flex-col
   ```

### Preventing Height Stretch

When a card is inside a grid with `row-span`, avoid:
- `h-full` on the Card itself
- `flex-1` on CardContent
- `mt-auto` on bottom sections

Instead, let the card take its natural height.

---

## 12. Icon System

### Icon Sizing Convention

| Context          | Class      | Size   |
|------------------|------------|--------|
| Card title icon  | `size-5`   | 20px   |
| Section icon     | `size-4`   | 16px   |
| Inline icon      | `size-3.5` | 14px   |
| Small inline     | `size-3`   | 12px   |

### Icon Color Convention

| Context          | Class                    |
|------------------|--------------------------|
| Card title       | `text-primary`           |
| Section label    | `text-primary`           |
| Muted label      | `text-muted-foreground`  |
| Destructive      | `text-destructive`       |

### Button Icon Pattern

Icons in buttons use the `data-icon` attribute for spacing:

```html
<Button>
  <RotateCcw data-icon="inline-start" />
  Restart device
</Button>
```

---

## 13. Form Patterns

### Input Fields

All inputs use compact height and consistent styling:

```html
<Input
  type="number"
  class="h-8 text-sm tabular-nums"
  placeholder="1"
  min="0.1"
  step="0.1"
/>
```

The base Input component includes:
- `h-8` height (32px)
- `rounded-lg` border radius
- `border-input` border color
- `bg-transparent` (dark: `dark:bg-input/30`)
- `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`

### Label Pattern

```html
<Label htmlFor="field-id" class="text-xs text-muted-foreground">
  Field Name [unit]
</Label>
```

### Error Messages

```html
<p class="text-[11px] text-destructive">Error message</p>
```

### Toggle Group (Mode Selector)

```html
<ToggleGroup type="single" spacing={3} class="grid w-full grid-cols-3">
  <ToggleGroupItem
    class="h-8 rounded-md border border-transparent px-2 text-sm font-medium
           /* selected: */ border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_rgba(34,211,238,0.1)]
           /* unselected: */ text-foreground/80 hover:bg-secondary/25"
  >
    <Icon class="size-3.5 shrink-0" />
    <span>Label</span>
  </ToggleGroupItem>
</ToggleGroup>
```

### Toggle Grid (Weekdays / Hours)

Weekdays — single row of 7:

```html
<div class="grid grid-cols-7 gap-1">
  <Toggle size="sm" class="h-8 rounded-md px-0 text-xs">Mo</Toggle>
  <!-- ... -->
</div>
```

Hours — responsive grid of 24:

```html
<div class="grid grid-cols-6 gap-1 sm:grid-cols-8 xl:grid-cols-12">
  <Toggle size="sm" class="h-7 rounded-md px-0 text-xs tabular-nums">00</Toggle>
  <!-- ... -->
</div>
```

### Inline Switch in Field Row

For boolean flags that belong next to text/number inputs on the same grid row (e.g. MQTT Retain beside QoS), wrap the `<Switch>` in a labelled cell that matches the `h-8` input height so elements align vertically:

```tsx
<div className="flex flex-col gap-1">
  <Label htmlFor="mqtt_retain" className="text-xs text-muted-foreground">Retain</Label>
  <div className="flex h-8 items-center">
    <Controller
      name="mqtt_retain"
      control={control}
      render={({ field }) => (
        <Switch
          id="mqtt_retain"
          checked={field.value}
          onCheckedChange={field.onChange}
          disabled={!enabled}
        />
      )}
    />
  </div>
</div>
```

Grid template for a row mixing inputs and a switch:

```tsx
<div className="grid gap-3 sm:grid-cols-[1fr_100px_72px_auto]">
  {/* Broker Host (1fr) | Port (100px) | QoS (72px) | Retain (auto) */}
</div>
```

### I2C Address Input (Hex / Decimal)

Board config uses text inputs for I2C addresses to support both `0x6F` and `111` notation. Display with `formatI2cAddr`, parse with `parseI2cInput` from `src/lib/board-config.ts`:

```tsx
<Input
  type="text"
  value={formatI2cAddr(config.rtc_i2c_addr)}      // "0x6F"
  onChange={(e) => updateSharedField('rtc_i2c_addr', parseI2cInput(e.target.value))}
  class="h-8 font-mono text-sm tabular-nums"
  placeholder="0x6F"
/>
```

`formatI2cAddr(n)` → `"0x6F"` (uppercase hex, 2-digit zero-padded)
`parseI2cInput(s)` → accepts `"0x6F"` or `"111"`, returns 0 on invalid input.

### CAN / Negative-Sentinel Pin Input

GPIO pins that are disabled use `-1` as a sentinel. Map empty/zero from the input back to `-1`:

```tsx
<Input
  type="number"
  value={config.can_tx_pin === -1 ? '' : config.can_tx_pin}
  onChange={(e) => updateSharedField('can_tx_pin', parseNumericInput(e.target.value) || -1)}
  class="h-8 text-sm tabular-nums"
  placeholder="-1 (disabled)"
/>
```

### GPIO Peripheral Row Layout

A row mixing Switch + pin label + Selects for a GPIO input/output configuration. Uses `flex-wrap` so it collapses cleanly on narrow viewports:

```tsx
// Grid wrapper for all GPIO rows
<div class="flex flex-col gap-2">
  {/* Each row: */}
  <div class="flex flex-wrap items-center gap-3 rounded-md border border-border/30 bg-background/40 px-3 py-2">
    <Switch ... />
    <span class="min-w-[52px] text-xs font-medium tabular-nums">IO{pin}</span>
    <Select ...>  {/* Pull: None / Pull-up / Pull-down */}
    <Select ...>  {/* Active level: High (1) / Low (0) */}
  </div>
</div>
```

### Submit Button

```html
<div class="flex justify-end">
  <Button type="submit" size="sm" disabled={!isDirty}>
    {isSubmitting ? (
      <>
        <LoaderCircle class="animate-spin" data-icon="inline-start" /> Saving
      </>
    ) : (
      <>
        <Check data-icon="inline-start" /> Apply
      </>
    )}
  </Button>
</div>
```

### Collapsible Help Text

Toggle visibility with a `?` button:

```html
<button
  type="button"
  onClick={() => setShowHelp(v => !v)}
  class="rounded-full p-0.5 transition-colors
    /* active: */ text-primary
    /* inactive: */ text-muted-foreground/50 hover:text-muted-foreground"
>
  <CircleHelp class="size-3.5" />
</button>

<!-- Help text container -->
<div class="grid transition-all duration-200
  /* visible: */ grid-rows-[1fr] opacity-100
  /* hidden: */ grid-rows-[0fr] opacity-0">
  <p class="overflow-hidden text-[11px] leading-tight text-muted-foreground">
    Description text.
  </p>
</div>
```

---

## 14. Data Visualization

### Heatmap (GitHub-Style Contribution Graph)

Cell size: `14px × 14px`, gap: `4px`, radius: `3px`

#### Intensity Scale (Emerald)

| Ratio     | Class                                    |
|-----------|------------------------------------------|
| 0 / empty | `bg-muted/40 text-muted-foreground/40`   |
| 0–30%     | `bg-emerald-200/50 text-emerald-950`     |
| 30–55%    | `bg-emerald-300/65 text-emerald-950`     |
| 55–85%    | `bg-emerald-400/80 text-emerald-950`     |
| 85–100%   | `bg-emerald-500/95 text-emerald-950`     |

#### Selected Cell

```css
ring-1.5 ring-primary/80 ring-offset-1 ring-offset-background
```

#### Legend

```html
<div class="flex items-center gap-1 text-[9px] text-muted-foreground">
  <span>Less</span>
  <span class="size-2.5 rounded-[2px] bg-muted/40" />
  <span class="size-2.5 rounded-[2px] bg-emerald-200/50" />
  <span class="size-2.5 rounded-[2px] bg-emerald-300/65" />
  <span class="size-2.5 rounded-[2px] bg-emerald-400/80" />
  <span class="size-2.5 rounded-[2px] bg-emerald-500/95" />
  <span>More</span>
</div>
```

### Daily Volume Bar Chart

Adjacent to the heatmap, shows last 30 days:

- Layout: stacked on mobile (`flex-col`), side-by-side on desktop (`sm:flex-row`)
- Height: `h-10` mobile, `sm:h-auto sm:flex-1` desktop
- Gap between bars: `gap-px` (1px)
- Min bar height: `4%` of container
- Animation: `animate-bar-rise` with `origin-bottom`, `animationDelay: ${index * 15}ms`

#### Bar Intensity (Dimmed for Hierarchy)

Non-selected bars use reduced opacity to maintain visual hierarchy with the heatmap:

| Ratio     | Class                  |
|-----------|------------------------|
| 0 / empty | `bg-muted/30`          |
| 0–30%     | `bg-emerald-200/25`    |
| 30–55%    | `bg-emerald-300/30`    |
| 55–85%    | `bg-emerald-400/35`    |
| 85–100%   | `bg-emerald-500/40`    |

Selected bar uses full intensity (same as heatmap cells).

### Hourly Activity Grid (Today's Dosing)

24-cell grid using the same emerald intensity scale:

```html
<div class="grid grid-cols-12 gap-1">
  <div class="animate-fade-in-up flex h-5 items-center justify-center rounded-[3px] text-[8px]
    bg-emerald-400/80 text-emerald-950/70"
    style="animation-delay: 40ms">
    00
  </div>
</div>
```

### Wear Progress Bar

Multi-segment horizontal bar with warning/replace markers:

```html
<div class="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
  <!-- Progress fill -->
  <div class="h-full rounded-full bg-linear-to-r from-primary via-primary/85 to-accent"
       style="width: 65%" />
  <!-- Warning marker -->
  <div class="absolute top-0 h-full w-0.5 bg-amber-500/70" style="left: 70%" />
  <!-- Replace marker -->
  <div class="absolute top-0 right-0 h-full w-0.5 bg-destructive/70" />
</div>
```

---

## 15. Interaction Patterns

### Toast Notifications

Using Sonner library:

```typescript
toast.success('Settings saved.');
toast.error('Failed to save settings.');
```

### Async Action Pattern

```typescript
const [isLoading, setIsLoading] = useState(false);

const handleAction = async () => {
  try {
    setIsLoading(true);
    const success = await apiCall();
    if (success) {
      toast.success('Action completed.');
    } else {
      toast.error('Action failed.');
    }
  } finally {
    setIsLoading(false);
  }
};
```

### Button Loading State

```html
<Button disabled={isLoading}>
  {isLoading
    ? <><LoaderCircle data-icon="inline-start" class="animate-spin" /> Loading</>
    : <><Check data-icon="inline-start" /> Submit</>}
</Button>
```

### Staggered List Animation

Apply `animate-fade-in-up` with incrementing delays:

```tsx
{items.map((item, index) => (
  <div
    key={item.id}
    className="animate-fade-in-up"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    {/* content */}
  </div>
))}
```

### Status Indicators

Three-tier status system using badge variants:

| State     | Badge Variant  | Bar Color                           |
|-----------|----------------|-------------------------------------|
| Nominal   | `outline`      | `from-primary via-primary/85 to-accent` |
| Warning   | `secondary`    | `from-amber-500 to-amber-400`      |
| Critical  | `destructive`  | `from-destructive to-destructive/70`|

### Hover States

- Heatmap cells: `hover:scale-110 hover:border-border`
- Bar chart bars: `hover:opacity-80`
- Buttons: Built into variants (e.g., `hover:bg-muted`)
- Pill selectors: `hover:bg-secondary/20 hover:text-foreground`

---

## 16. Production Constraints

### ESP32 Embedded Requirements

This UI is compiled and embedded directly into an ESP32 microcontroller's firmware binary. Critical constraints:

1. **Bundle size**: Every byte matters. Use brotli compression (`vite-plugin-compression2`).
2. **No lazy loading from network**: Everything loads from flash storage.
3. **No CDN fonts**: Fonts must be bundled or use system fonts.
4. **Limited memory**: Keep DOM complexity reasonable.
5. **Single-threaded server**: The ESP32 serves files via its own HTTP server.

### Build Pipeline

```bash
pnpm build:device  # tsc -b && vite build
```

Output goes to `dist/` which is embedded in firmware.

### Performance Guidelines

- Prefer CSS animations over JS animations
- Minimize re-renders with `useMemo` for computed values
- Use `tabular-nums` for numeric values to prevent layout shifts
- Avoid heavy libraries for simple visualizations (custom heatmap vs charting library)
- Keep component tree shallow where possible
- Use `React.useState` with functional updates for state derived from async operations

---

## 17. File Structure

```
frontend/
├── components.json              # shadcn/ui configuration
├── src/
│   ├── index.css                # Theme variables, animations, gradients
│   ├── routes.tsx               # React Router routes
│   ├── pages/
│   │   ├── Home.tsx             # Dashboard with 12-col grid
│   │   ├── History.tsx          # Heatmap + day detail (single card)
│   │   ├── Schedule.tsx         # Pump schedule config (single card)
│   │   ├── Login.tsx            # Basic auth login form
│   │   ├── Onboarding.tsx       # First-run setup
│   │   ├── Settings.Board.tsx   # Board config + preset picker + peripherals
│   │   ├── Settings.Backup.tsx  # Export/import config (Backup & Restore)
│   │   ├── Settings.Network.tsx # Wi-Fi / Ethernet network settings
│   │   ├── Settings.Services.tsx# NTP, MQTT, hostname settings
│   │   ├── Settings.Pumps.tsx   # Pump parameters
│   │   ├── Settings.Aging.tsx   # Pump wear thresholds
│   │   ├── Settings.Firmware.tsx# OTA firmware update
│   │   └── Settings.Api.tsx     # REST API reference
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (50+ components)
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── input.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── select.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── toggle.tsx
│   │   │   ├── toggle-group.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   └── ...
│   │   ├── home/
│   │   │   ├── device-overview-card.tsx
│   │   │   ├── pump-aging-card.tsx
│   │   │   ├── pump-control-card.tsx
│   │   │   ├── pump-history-today-card.tsx
│   │   │   ├── pump-history-card.tsx
│   │   │   ├── connectivity-stability-card.tsx
│   │   │   ├── maintenance-actions-card.tsx
│   │   │   ├── system-card.tsx
│   │   │   └── pump-history/
│   │   │       ├── heatmap.tsx
│   │   │       ├── day-detail.tsx
│   │   │       ├── pump-selector.tsx
│   │   │       ├── skeletons.tsx
│   │   │       ├── use-pump-history.ts
│   │   │       └── utils.ts
│   │   ├── network-form/        # Modular network form components
│   │   │   ├── add-network-combobox.tsx
│   │   │   ├── common-ipv4-fields.tsx
│   │   │   ├── wifi-ipv4-fields.tsx
│   │   │   └── ethernet-ipv4-fields.tsx
│   │   ├── app-sidebar.tsx      # Left navigation sidebar
│   │   ├── site-header.tsx      # Top header with breadcrumb + font scale toggle
│   │   ├── font-scale-provider.tsx  # Default/Large font preference
│   │   ├── realtime-provider.tsx    # WebSocket lifecycle
│   │   ├── schedule-form.tsx
│   │   ├── services-form.tsx
│   │   ├── pump-form.tsx
│   │   ├── pump-calibration.tsx
│   │   ├── network-form.tsx
│   │   ├── login-form.tsx
│   │   └── device-maintenance-actions.tsx
│   ├── hooks/
│   │   └── use-store.ts         # Zustand global store
│   └── lib/
│       ├── api.ts               # API types and fetch functions
│       ├── utils.ts             # cn() utility (clsx + tailwind-merge)
│       ├── board-config.ts      # Hardware config helpers, RPM math, I2C formatting
│       ├── board-presets.ts     # Fysetc E4 v1.0 hardware presets
│       ├── config-export.ts     # ConfigExport type, Zod schema, build/parse/apply
│       └── mock-backend.ts      # Local dev mock (mirrors firmware API)
└── design/
    └── DESIGN_SYSTEM.md         # This file
```

---

## 18. Font Scale System

### Two-Size Preference

The UI supports two root font sizes, stored in `localStorage` under key `"ui-font-scale"`. The active value is set as `data-font-scale="default|large"` on `document.documentElement`.

| Value     | Root font-size | When to use            |
|-----------|----------------|------------------------|
| `default` | `16px`         | Standard density       |
| `large`   | `19px`         | Accessibility / hi-DPI |

Because all Tailwind utilities use `rem`, bumping `html { font-size }` scales the **entire UI proportionally** — no per-component overrides needed.

### CSS Hook

```css
/* src/index.css — inside @layer base */
html {
  @apply font-sans;
  &[data-font-scale='large'] { font-size: 19px; }
}
```

### Toggle Button

The `aA` button in the site header uses fixed `px` sizes so it never scales with the preference:

```tsx
// site-header.tsx — ButtonFontScale
<Button
  variant="ghost"
  size="icon"
  onClick={toggle}
  aria-label="Toggle font size"
>
  <span aria-hidden style={{ fontSize: scale === 'large' ? '16px' : '11px' }}>
    aA
  </span>
</Button>
```

### Key Files

- `src/components/font-scale-provider.tsx` — reads/writes localStorage, applies `data-font-scale`
- `src/components/site-header.tsx` — `ButtonFontScale` component

---

## 19. iOS Adaptation (SwiftUI)

The native iOS app (`ios/`) uses the same visual language as the web UI. All design tokens are defined in `ios/StepperDoser/Core/Design/StepperTokens.swift`. Do not add raw hex literals or magic sizes to feature views — always reference a token.

### 19.1 Color Tokens (`StepperColor`)

| Token                    | Hex        | Role                              |
|--------------------------|------------|-----------------------------------|
| `StepperColor.background` | `#0b0e11` | Page / app background             |
| `StepperColor.card`       | `#131820` | Deep card surface                 |
| `StepperColor.popover`    | `#161b22` | Metric tile / dropdown surface    |
| `StepperColor.secondary`  | `#1e293b` | Panel fill, secondary surfaces    |
| `StepperColor.primary`    | `#22d3ee` | Cyan accent — active states, highlights |
| `StepperColor.accent`     | `#06b6d4` | Slightly darker cyan              |
| `StepperColor.foreground` | `#e2e8f0` | Primary text                      |
| `StepperColor.mutedForeground` | `#64748b` | Labels, captions, placeholders |
| `StepperColor.destructive` | `#ef4444` | Error / danger                   |
| `StepperColor.warning`    | `#f59e0b` | Amber warning                     |
| `StepperColor.border`     | `white 8%` | Subtle borders                   |
| `StepperColor.input`      | `white 12%` | Input field borders              |
| Data intensity (emerald)  | see tokens | `dataLow` / `dataMid` / `dataHigh` / `dataPeak` |

### 19.2 Typography (`StepperFont`)

All sizes are `Font.system(...)`. **Do not use Dynamic Type** — fixed sizes are intentional for information density parity with the web UI.

| Token                  | Size  | Weight      | Notes                                          |
|------------------------|-------|-------------|------------------------------------------------|
| `StepperFont.title`    | 18pt  | semibold    | Card / panel page title ("Dashboard", "Schedule") |
| `StepperFont.section`  | 16pt  | semibold    | List item headline, group label ("Pump 1")     |
| `StepperFont.metricValue` | 19pt | semibold  | Primary value in `StepperMetricTile` — `+ .monospacedDigit()` |
| `StepperFont.body`     | 15pt  | regular     | Body text, form fields                         |
| `StepperFont.small`    | 13pt  | regular     | Secondary / subtitle text ("Timed • 288s left")|
| `StepperFont.caption`  | 12pt  | regular     | Help text, metric tile captions                |
| `StepperFont.micro`    | 10pt  | medium      | Uppercase section labels (OVERVIEW, CONTROLLER)|
| `StepperFont.nano`     | 9pt   | regular     | Heatmap axes, legend labels                    |
| `StepperFont.mono`     | 13pt  | medium mono | IP addresses, firmware hashes                  |
| `StepperFont.monoSmall`| 11pt  | medium mono | Compact monospace (history hour rows)          |

### 19.3 Spacing & Radius (`StepperSpacing`, `StepperRadius`, `StepperLayout`)

| Token                         | Value | Maps to (web) |
|-------------------------------|-------|---------------|
| `StepperSpacing.xs`           | 4pt   | `gap-1`       |
| `StepperSpacing.sm`           | 6pt   | `gap-1.5`     |
| `StepperSpacing.md`           | 8pt   | `gap-2`       |
| `StepperSpacing.lg`           | 12pt  | `gap-3 / p-3` |
| `StepperSpacing.xl`           | 16pt  | `gap-4`       |
| `StepperSpacing.xxl`          | 24pt  | section gap   |
| `StepperSpacing.pagePadding`  | 12pt  | `px-3`        |
| `StepperLayout.cardPadding`   | 16pt  | card `p-4`    |
| `StepperLayout.panelPadding`  | 12pt  | panel `p-3`   |
| `StepperRadius.sm`            | 2pt   | `rounded-sm`  |
| `StepperRadius.lg`            | 8pt   | `rounded-lg`  |
| `StepperRadius.xl`            | 12pt  | `rounded-xl`  |
| `StepperRadius.card`          | 16pt  | `rounded-2xl` |
| `StepperRadius.pill`          | 999pt | `rounded-full`|

### 19.4 Component Library (StepperTokens.swift)

All components live in `StepperTokens.swift` — never duplicate them in feature files.

| Component / Style           | Purpose                                                  |
|-----------------------------|----------------------------------------------------------|
| `StepperBackground`         | Full-screen radial gradient page background              |
| `StepperPage`               | `ZStack(background + ScrollView)` — root page shell      |
| `StepperCard`               | Deep glassmorphic card: `bg-card/82 + ultraThinMaterial + shadow` |
| `StepperPanel`              | Flat inner panel: `bg-secondary/10 + border stroke`      |
| `StepperSectionLabel`       | Uppercase 10pt micro label with 1pt kerning              |
| `StepperBadge`              | Status pill — tones: `primary / secondary / outline / warning / destructive` |
| `StepperMetricTile`         | Stat tile: uppercase label + 19pt semibold value + caption |
| `StepperKeyValueRow`        | Label-left / value-right row (text-xs both sides)        |
| `StepperEmptyState`         | Icon + title + message centred placeholder               |
| `StepperWearBar`            | Gradient progress bar with warning + replace markers     |
| `StepperHeatmapCell`        | 14×14pt emerald intensity cell with selection ring       |
| `StepperWeeklyHeatmap`      | Scrollable `LazyHGrid` heatmap + legend                  |
| `StepperMiniBarChart`       | 30-day `HStack` bar chart (dimmed; selected bar = full)  |
| `StepperPrimaryButtonStyle` | Cyan fill, full-width, 12pt vertical padding             |
| `StepperSecondaryButtonStyle` | Secondary fill + border, full-width                    |
| `StepperDestructiveButtonStyle` | Destructive tint, full-width                         |
| `StepperInputShell`         | ViewModifier for text fields — `popover/92 + input border` |

### 19.5 Tab Page Layout Pattern

Every tab view follows this structure. **Do not use `StepperCard` as the outermost container** — it creates double indentation when inner `StepperPanel` sections are nested inside.

```swift
StepperPage {
    StepperPanel(spacing: StepperSpacing.lg, padding: 0) {

        // ── Page header ──────────────────────────────────────────
        // HStack (with badges) or VStack (without) — always padded
        // with panelPadding so it aligns with inner panel labels.
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: StepperSpacing.sm) {
                StepperSectionLabel(text: "Section Label")   // ← 12pt from edge
                Text("Page Title")
                    .font(StepperFont.title)
                    .foregroundStyle(StepperColor.foreground)
            }
            Spacer()
            // Optional trailing badges
            StepperBadge(text: "Status", tone: .secondary)
        }
        .padding(StepperLayout.panelPadding)                 // ← same 12pt

        // ── Content sections ─────────────────────────────────────
        // Each StepperPanel gets its own padding: 0 (outer)
        // + panelPadding (inner) = 12pt from outer edge. Aligned ✓
        StepperPanel {
            StepperSectionLabel(text: "Section One")         // ← 12pt from edge
            // ... content
        }

        StepperPanel {
            StepperSectionLabel(text: "Section Two")         // ← 12pt from edge
            // ... content
        }

        // ── Bottom breath ─────────────────────────────────────────
        // Required: outer panel has padding:0 so the last section
        // would otherwise flush against the rounded corner.
        Color.clear.frame(height: StepperSpacing.xs)
    }
}
.navigationTitle("Page Title")
```

**Alignment rule**: `StepperPanel(padding: 0)` + header padded with `StepperLayout.panelPadding` (12pt) + inner `StepperPanel` sections (which apply their own 12pt) → all `StepperSectionLabel` elements land at the same 12pt indent from the outer edge.

**When to use `StepperCard` instead**: Only for standalone floating cards that are not full-width page containers — e.g. a summary card embedded inside a `StepperPanel`, or a widget in a future home-screen widget context.

### 19.6 Page Background Gradient

```swift
// StepperBackground (from StepperTokens.swift) — use via StepperPage
ZStack {
    StepperColor.background.ignoresSafeArea()
    RadialGradient(colors: [StepperColor.accent.opacity(0.06), .clear],
                   center: .topLeading, startRadius: 0, endRadius: 340)
        .ignoresSafeArea()
    RadialGradient(colors: [StepperColor.primary.opacity(0.04), .clear],
                   center: .topTrailing, startRadius: 0, endRadius: 260)
        .ignoresSafeArea()
}
```

See `ios/StepperDoser/Core/Design/StepperTokens.swift` for all components.

---

## Quick-Start Checklist for New Products

To replicate this design for a similar IoT controller product:

1. **Initialize**: `npx shadcn@latest init` with style `radix-nova`, icon library `tabler`
2. **Copy theme**: Paste the `:root` and `.dark` CSS variables from Section 3 into `index.css`
3. **Add animations**: Copy the `@theme inline` block with keyframes from Section 10
4. **Add background gradients**: Copy the `@layer base` body background rules from Section 8
5. **Install fonts**: Add DejaVu Sans, JetBrains Mono, Source Serif 4 (or substitute)
6. **Create card wrapper**: Use the glassmorphism card pattern from Section 9.1
7. **Create flat panels**: Use Section 9.2 for inner content sections
8. **Add key-value rows**: Use Section 9.3 for status displays
9. **Wire up form inputs**: Follow Section 13 for compact input styling
10. **Add page containers**: Use Section 5 page container pattern
11. **Enable staggered animations**: Apply `animate-fade-in-up` with `${index * 50}ms` delays
12. **Test mobile**: Ensure all grid children have `min-w-0`, hide non-essential columns
13. **Add font scale toggle**: Implement `font-scale-provider.tsx` + `data-font-scale` hook (Section 18)

---

*Generated from the Stepper Doser codebase. Last updated: 2026-04-22.*
