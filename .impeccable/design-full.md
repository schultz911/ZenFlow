---
name: zenFlow
description: Swiss Agency Traffic Ledger for real-time ZenSciences creative workload, capacity, and pipeline orchestration.
colors:
  cobalt-accent: "#1d4ed8"
  cobalt-deep: "#1e40af"
  cobalt-wash: "#eff4ff"
  emerald-capacity: "#059669"
  amber-caution: "#b45309"
  vermilion-alert: "#dc2626"
  crimson-hold: "#b91c1c"
  alabaster-canvas: "#f8f9fb"
  paper-white: "#ffffff"
  ledger-band: "#fbfcfd"
  slate-mist: "#f2f4f8"
  ink-obsidian: "#121418"
  slate-body: "#525d6e"
  slate-muted: "#64748b"
  hairline-rule: "#dfe3ea"
  hairline-subtle: "#eceff4"
  rule-hover: "#c5ccd8"
  dark-cobalt-accent: "#2563eb"
  dark-cobalt-hover: "#1d4ed8"
  dark-cobalt-focus: "#60a5fa"
  dark-emerald-capacity: "#34d399"
  dark-amber-caution: "#fbbf24"
  dark-vermilion-alert: "#dc2626"
  callout-info-dark: "#93c5fd"
  callout-warning-light: "#92400e"
  callout-warning-dark: "#fcd34d"
  callout-danger-dark: "#fca5a5"
  callout-success-light: "#065f46"
  callout-success-dark: "#6ee7b7"
  emerald-hover: "#047857"
  emerald-hover-dark: "#065f46"
  crimson-border: "#991b1b"
  crimson-hover: "#a71919"
  crimson-fill: "#7f1d1d"
  emerald-confirm: "#166534"
  dark-ink-canvas: "#0f1115"
  dark-ledger-surface: "#15181f"
  dark-ledger-band: "#191d26"
  dark-inset-subtle: "#11141a"
  dark-raised-menu: "#1c202a"
  dark-ink-primary: "#f1f4f9"
  dark-slate-secondary: "#98a2b3"
  dark-slate-muted: "#7f8a9d"
  dark-hairline-rule: "#262b36"
  dark-hairline-subtle: "#1f242e"
  dark-rule-hover: "#3a4254"
typography:
  wordmark:
    fontFamily: "'Dancing Script', cursive, sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
  kpi-display:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
    fontFeature: "'tnum', 'cv02', 'cv03', 'cv04', 'cv11'"
  headline:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  card-title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.005em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  body:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  label:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
    fontFeature: "'tnum', 'cv02', 'cv03', 'cv04', 'cv11'"
rounded:
  chip: "5px"
  badge: "6px"
  card: "7px"
  control: "7px"
  dock: "9px"
  panel: "10px"
  pill: "9999px"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  base: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  control-height: "34px"
  header-height: "54px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-accent}"
    textColor: "{colors.paper-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "{spacing.control-height}"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.paper-white}"
  button-secondary:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "{spacing.control-height}"
  button-secondary-hover:
    backgroundColor: "{colors.slate-mist}"
    textColor: "{colors.ink-obsidian}"
  button-danger-outline:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.crimson-hold}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "{spacing.control-height}"
  icon-button:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.slate-body}"
    rounded: "{rounded.control}"
    width: "32px"
    height: "32px"
  input-search:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 32px 6px 36px"
    height: "{spacing.control-height}"
  ledger-alert-badge:
    backgroundColor: "{colors.vermilion-alert}"
    textColor: "{colors.paper-white}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "3px 9px"
  task-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    typography: "{typography.card-title}"
    rounded: "{rounded.card}"
    padding: "10px"
  ledger-frame:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    rounded: "{rounded.panel}"
  nav-tab-active:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    typography: "{typography.card-title}"
    padding: "0 4px"
    height: "{spacing.header-height}"
  free-pool-dock:
    backgroundColor: "{colors.ink-obsidian}"
    textColor: "{colors.paper-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  hold-confirm:
    backgroundColor: "{colors.crimson-hold}"
    textColor: "{colors.paper-white}"
    typography: "{typography.card-title}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
---

# Design System: zenFlow

## Overview

**Creative North Star: "Swiss Agency Traffic Ledger"**

zenFlow is built in Operate mode for daily ZenSciences standups, cognitive-load rebalancing, and real-time creative traffic control across Content, Design, and Accounts. Rather than behaving like a decorative kanban board with floating drop-shadow cards and competing pastel pill tags, the interface operates like a ruled Swiss agency production schedule: cool alabaster paper in light mode and deep ink-slate in dark mode, partitioned by crisp 1px structural rules and anchored by tabular numerals.

The system strips visual noise down to operational signal so a Creative Director or Lead can diagnose overloaded teammates (>12 pts WIP cap), overdue deliverables, and available Free Pool capacity (<3h/day) in under two seconds. Hierarchy comes from sharp 1px ledger frames, hairline column dividers, weight contrast, and strict color discipline—not nested cards, ambient card elevation, or thick colored side-stripes bolted onto rounded boxes.

Every surface respects full light/dark mode parity through semantic CSS custom properties while preserving the signature `zenFlow` brand mark (`Inter` bold paired with `Dancing Script` for `Flow`). Frosted translucency and elevation shadows are withheld from the core workspace and reserved strictly for transient overlays: the sticky 54px header, dropdown menus, modal dialogs, and the Free Pool overlay.

**Key Characteristics:**
- High-density ruled ledger layout built on 1px hairlines (`--border` / `--border-subtle`) with zero ghost-card shadows on resting workspace surfaces.
- Strict semantic color economy: cobalt-blue drives active navigation and primary actions, emerald signals healthy utilization and Free Pool readiness, amber marks review/caution states, and solid vermilion (`#dc2626`) is reserved exclusively for WIP overload and overdue alarms.
- Universal `tabular-nums` alignment across KPI metrics, billable hour ratios, member counts, cognitive-load scores, and deadlines.
- Complete light alabaster and dark ink-slate parity backed by CSS custom properties and accessible 2px focus outlines.
- Preserved `zenFlow` wordmark (`Inter` + `Dancing Script`) paired with crisp `Inter` operational typography (`cv02`, `cv03`, `cv04`, `cv11`).

## Colors

A disciplined cool-neutral ledger palette in both light and dark modes, punctuated by cobalt for agency control and high-contrast semantic inks for capacity, caution, and overload.

### Primary
- **Cobalt Accent** (`#1d4ed8` light / `#2563eb` dark): Primary action buttons (`View Analytics`, `Add Task`, `Sign In`), active bottom-ruled navigation indicator, team efficiency metric, and active billable timer text.
- **Cobalt Deep** (`#1e40af` light / `#1d4ed8` dark): Primary button hover fill.
- **Cobalt Focus** (`#1d4ed8` light / `#60a5fa` dark): Accessible 2px keyboard focus rings, dark-mode `Flow` wordmark accent, and dark-mode active tab bottom rule.
- **Cobalt Wash** (`#eff4ff` light / `rgba(59, 130, 246, 0.14)` dark): Quiet tinted surface for active `In Progress` billable timer chips, `You` badge, inline `Assign` pipeline action, and drag-drop target highlights.

### Secondary
- **Vermilion Alert** (`#dc2626` light / `#dc2626` dark): Solid high-contrast alert badge background (`.ledger-alert-badge`) for WIP overload (`>12 pts`), overdue marquee counter, overdue deadline text, and high cognitive-load status dots.
- **Crimson Hold** (`#b91c1c`): Destructive outline button ink and the 5-second hold-to-purge confirmation fill (filling to `#7f1d1d` while held, `#166534` on completion).
- **Emerald Capacity** (`#059669` light / `#34d399` dark): Team utilization KPI, healthy efficiency scores (`>=75%`), `Sent` column status, live Firestore connection indicator, and Free Pool availability and actions for members below 3 hours per day.
- **Amber Caution** (`#b45309` light / `#fbbf24` dark): `In Review` column headers, unassigned pipeline counts, approaching deadlines (`Today`), moderate cognitive-load dots, and elevated workload averages (`8–11.9 pts`).

### Neutral
- **Alabaster Canvas / Dark Ink Canvas** (`#f8f9fb` light / `#0f1115` dark): Root workspace page backdrop (`--canvas`).
- **Paper White / Dark Ledger Surface** (`#ffffff` light / `#15181f` dark): Primary ledger frames, KPI cells, swimlane columns, task cards, inputs, and dialogs (`--surface`).
- **Ledger Band / Dark Ledger Band** (`#fbfcfd` light / `#191d26` dark): Slightly tinted top header bands inside `.ledger-frame` panels and muted completed task cards (`--surface-muted`).
- **Slate Mist / Dark Inset Subtle** (`#f2f4f8` light / `#11141a` dark): Inset controls, segmented filter tracks, secondary button hovers, and quick status stepper chips (`--surface-subtle`).
- **Raised Menu Surface** (`#ffffff` light / `#1c202a` dark): Floating dropdown menus and context popovers (`--surface-raised`).
- **Ink Obsidian / Dark Ink Primary** (`#121418` light / `#f1f4f9` dark): Primary headings, task titles, KPI numerals, and the high-contrast dark Free Pool dock & logo mark container (`--text-primary`).
- **Slate Body / Dark Slate Secondary** (`#525d6e` light / `#98a2b3` dark): Supporting metadata, labels, inactive tabs, emails, and descriptions (`--text-secondary`).
- **Slate Muted / Dark Slate Muted** (`#64748b` light / `#7f8a9d` dark): Icons, quiet counts, placeholders, interpunct separators (`·`), and empty dropzone prompts (`--text-muted`).
- **Hairline Rule / Dark Hairline Rule** (`#dfe3ea` light / `#262b36` dark): Structural 1px perimeter borders on ledger frames, buttons, inputs, task cards, and header bottom rule (`--border`).
- **Hairline Subtle / Dark Hairline Subtle** (`#eceff4` light / `#1f242e` dark): Internal 1px grid partitions between KPI cells, pipeline items, swimlane columns, and card footer rows (`--border-subtle`).
- **Rule Hover / Dark Rule Hover** (`#c5ccd8` light / `#3a4254` dark): Subtle border darkening on resting task card hover.

### Named Rules
**The Vermilion Reserve Rule.** Solid vermilion (`#dc2626`) is strictly reserved for WIP overload (`>=12 pts`), overdue alarms, high-load dots, and destructive actions—never for decorative tags, neutral banners, or standard CTAs.

**The Dual-Mode Parity Rule.** Every background, hairline border, and text token resolves through semantic CSS custom properties (`--canvas`, `--surface`, `--border`, `--text-primary`) so light alabaster and dark ink-slate preserve identical scan hierarchy and contrast.

## Typography

**Wordmark Accent Font:** Dancing Script (weights 600, 700; fallback `cursive, sans-serif`) — preserved strictly for `Flow` in the `zenFlow` brand wordmark.
**UI & Body Font:** Inter (weights 400, 500, 600, 700; fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) with OpenType stylistic alternates `'cv02', 'cv03', 'cv04', 'cv11'` enabled globally on `body`.

**Character:** Engineered, compact Swiss neo-grotesque clarity designed for high-density tables and traffic ledgers, paired with a single preserved calligraphic accent in the brand wordmark so ZenSciences identity stays unmistakable without intruding on operational data.

### Hierarchy
- **Wordmark** (`700`, `1.4375rem` / `23px` `Flow` alongside `19px` `Inter` `zen`, line-height `1`): Top-left sticky header brand lockup and session verification screen only.
- **KPI Display** (`700`, `1.5rem` / `24px`, line-height `1.2`, tracking `-0.03em`, `tabular-nums`): Single-frame team KPI ledger values (`Utilization`, `Efficiency`, `Avg load`, `In progress`, `To do`).
- **Headline** (`700`, `1.125rem` / `18px`, line-height `1.3`, tracking `-0.02em`): Active board ledger title (`All Teams`, `Content`, `Design`).
- **Title** (`700`, `0.875rem` / `14px`, line-height `1.4`, tracking `-0.015em`): Member swimlane names and `TeamPipeline` band headings (`13px` bold).
- **Card Title** (`600`, `0.8125rem` / `13px`, line-height `1.375`): Task card titles, pipeline deliverable titles, and desktop navigation tab labels.
- **Body** (`500`–`600`, `0.75rem` / `12px`, line-height `1.5`): Control labels, search inputs, dropdown items, telemetry scores, and body descriptions.
- **Label** (`600`–`700`, `0.6875rem` / `11px`, line-height `1.4`, tracking `0.05em` uppercase when acting as section/column header): KPI labels, swimlane status headers (`TO DO`, `IN PROGRESS`, `IN REVIEW`, `SENT`), `.ledger-alert-badge`, inline card metadata, and compact timestamps.

### Named Rules
**The Tabular Ledger Rule.** Every metric, count, percentage, hour ratio, cognitive-load score, and date must carry `font-variant-numeric: tabular-nums` so numbers align cleanly across KPI cells, swimlane telemetry, and card rows without horizontal jitter.

**The Single-Line Metadata Rule.** Compact metadata inside `TeamPipeline` rows and `TaskCard` headers separates items with quiet muted interpuncts (`·`) rather than stacking wrapped bordered pill chips.

## Layout

zenFlow centers its operational workspace inside a `1400px` max-width container (`max-w-[1400px]`) with responsive horizontal gutters (`16px` mobile, `24px` at `640px`, `32px` at `1024px`) and `32px` bottom padding (`pb-8`).

- **Sticky Chrome & Urgent Ticker:** A `55px` (`3.4375rem`, including `1px` bottom border) sticky header anchors at `top: 0` on desktop (`>=1280px`); below `1280px`, a `44px` (`2.75rem`) horizontal sub-header strip adds team navigation for a combined `99px` (`6.1875rem`) `--header-height`. The urgent `MarqueeRibbon` pins directly beneath at `top: var(--header-height)` on `>=640px` whenever overdue or due-today tasks exist, and scrolls inline on `<640px` to preserve above-the-fold canvas space.
- **Single-Frame KPI Ledger & Inline Free Pool:** `OverviewBar` renders one `.ledger-frame` containing a `.ledger-band` header, a hairline-divided `.ledger-kpi-grid` (`5` equal columns at `>=1024px`, `3` columns at `>=640px`, collapsing cleanly on `<640px` so active work leads above the fold), and an inline bottom-ruled collapsible `FreePoolContainer` row (`44px` trigger expanding a horizontal `.free-pool-members` roster with 3-segment `.free-pool-hours-scale` meters, `Assign brief` portaled pickers, and `+ Task` actions). Directly beneath sits a unified toolbar row (`search input` + `Select Team Board` + `View Analytics` + `Export Report`, with `View Analytics`/`Export Report` folding into a mobile overflow menu below `640px`).
- **Centralized Pipeline Triage Strip:** `TeamPipeline` uses a `.ledger-frame` with a horizontal swimlane-style card strip (`md+` inline filter pills in its header bar; auto-collapsed on desktop when `unassignedCount === 0`).
- **Ruled Swimlane Grids:** Each member workspace is a collapsible `.ledger-frame` whose body divides cleanly into `4` status columns (`repeat(4, minmax(195px, 1fr))`), expanding to `5` columns (`repeat(5, minmax(185px, 1fr))`) when `Completed` is toggled open. Column cells use `1px solid var(--border-subtle)` right dividers, `10px 12px` padding, a `200px` min-height, and a `385px` internal scroll ceiling. Below `640px`, the horizontal scroll wrapper snaps cleanly across `min(80vw, 300px)` columns and dialog inputs bump to `16px` to prevent mobile zoom.

### Named Rules
**The Hairline Partition Rule.** Separate adjacent KPI cells, pipeline entries, and swimlane status columns with 1px structural rules (`--border` / `--border-subtle`) inside a shared `.ledger-frame` rather than wrapping every sub-region in nested rounded cards.

## Elevation & Depth

zenFlow is flat by default. Resting workspace containers—the KPI ledger, `TeamPipeline`, member `Swimlane` frames, and individual `TaskCard` items—carry zero drop shadow (`--shadow-surface: none`). Visual hierarchy comes from 1px borders (`--border` for outer frames, `--border-subtle` for inner rules) and disciplined surface stepping (`--canvas` -> `--surface` -> `--surface-muted`).

Shadows and frosted translucency appear strictly on layers that float above the scrolling ledger: the sticky header (`bg-[var(--surface)]/92 backdrop-blur-md`), floating dropdown menus and the `Free Pool` dock (`--shadow-floating`), and modal dialogs (`--shadow-dialog` above a `backdrop-filter: blur(4px)` scrim).

### Shadow Vocabulary
- **Surface Flat** (`box-shadow: none`): Default for `.ledger-frame`, `.surface`, `.surface-inset`, `.metric-card`, and `.task-card`.
- **Floating Overlay — Light** (`box-shadow: 0 12px 32px rgba(18, 20, 24, 0.12), 0 2px 6px rgba(18, 20, 24, 0.06)`): `.menu-surface` dropdowns and `.free-pool-panel` dock in light mode.
- **Floating Overlay — Dark** (`box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)`): `.menu-surface` dropdowns and `.free-pool-panel` dock in dark mode.
- **Modal Dialog — Light** (`box-shadow: 0 24px 64px rgba(18, 20, 24, 0.18), 0 4px 12px rgba(18, 20, 24, 0.08)`): `.dialog-panel` over `rgba(15, 17, 21, 0.48)` backdrop blur.
- **Modal Dialog — Dark** (`box-shadow: 0 24px 72px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.4)`): `.dialog-panel` in dark mode.

### Named Rules
**The Zero Ghost-Card Rule.** Resting workspace panels and task cards must never carry ambient drop shadows (`--shadow-surface: none`). Reserve elevation shadows strictly for transient overlays: menus, dialogs, and the floating Free Pool dock.

## Shapes

The form language is architectural and crisp, using a tight concentric radius ladder (`5px` -> `6px` -> `7px` -> `9px` -> `10px`) so nested controls never look bloated or bulbous.

- **Inner micro-chips (`5px`):** Inline status steppers, active timer chips, `You` label, active segmented filter pills, and inline rename inputs.
- **Alert badges & small toggles (`6px`):** `.ledger-alert-badge`, Free Pool filter chips, and reorder control groups.
- **Interactive controls & cards (`7px`):** `--radius-control` and `--radius-card` unify buttons, inputs, task cards, icon buttons, and the header logo mark.
- **Floating menus (`9px`):** Dropdown menus and portaled brief/action pickers.
- **Structural frames & modals (`10px`):** `--radius-panel` defines outer `.ledger-frame` containers, `.dialog-panel` and the `MarqueeRibbon`.
- **Circular indicators (`9999px`):** `6px` (`h-1.5 w-1.5`) cognitive-load dots, `8px` (`h-2 w-2`) sync/Free Pool status dots, `3px` metric tracks, and `6px` custom scrollbars.

### Named Rules
**The Clean Perimeter Rule.** Cards and ledger containers use uniform 1px perimeter borders with zero colored left/top side-stripes bolted onto rounded boxes; status is communicated via compact dots, ink weight, and solid vermilion alert badges.

## Components

Controls feel crisp, immediate, and tactile—with `150ms` `cubic-bezier(0.2, 0.7, 0.2, 1)` color/border transitions, `34px` standard control height, and guaranteed `2px solid var(--focus)` keyboard focus outlines (`outline-offset: 2px`). All motion respects `prefers-reduced-motion: reduce`.

### Buttons
- **Shape:** Crisp engineered rectangle (`7px` radius), `34px` minimum height, `6px 12px` padding, `12px` semibold `Inter`, `6px` icon-to-label gap.
- **Primary (`.button-primary`):** Solid Cobalt Accent (`#1d4ed8` light / `#2563eb` dark) with crisp white ink (`#ffffff`). Hover shifts to Cobalt Deep (`#1e40af` / `#1d4ed8`). Disabled drops to `50%` opacity.
- **Secondary (`.button-secondary`):** Paper White (`--surface`) with 1px Hairline Rule (`--border`) and primary ink (`--text-primary`). Hover fills with Slate Mist (`--surface-subtle`).
- **Danger Outline (`.button-danger-outline`):** Transparent surface with `rgba(220, 38, 38, 0.35)` border and `#b91c1c` ink (`#fca5a5` in dark mode); hover adds an `8%` crimson tint.
- **Icon Button (`.icon-button`):** Square `32px × 32px` (`7px` radius) bordered surface button for theme toggle, collapse/expand, and user profile actions.
- **Hold-to-Purge Safety Button (`.hold-confirm`):** Full-width `44px`-tall Crimson Hold (`#b91c1c`) safety control with a left-anchored progress fill (`#7f1d1d`, using `clip-path` under reduced motion) requiring a continuous 5-second hold before transitioning to `#166534` on completion.

### Chips & Badges
- **Ledger Alert Badge (`.ledger-alert-badge`):** Solid Vermilion Alert (`#dc2626`) fill with white `11px` semibold tabular text, `3px 9px` padding, `6px` radius, and inline warning icon. Used strictly for WIP overload (`>12 pts`) and overdue ticker counts.
- **Segmented Pipeline Filter:** Inset `--surface-subtle` container (`7px` radius, `2px` padding, 1px `--border`) holding `All`, `Unassigned`, and `Assigned` buttons (`5px` radius); active segment lifts onto `--surface` with a 1px `--border`.
- **Quiet Cognitive Load Indicator:** Inline `6px` colored dot (red high, amber medium, emerald low) paired with capitalized `11px` semibold text—no bordered pill box.
- **Billable Timer Chip:** `5px` radius inline button (`11px` semibold `tabular-nums`); active `In Progress` tasks highlight with Cobalt Wash (`--accent-soft`) and cobalt ink, while idle tasks stay quiet secondary ink.

### Cards / Containers
- **Ledger Frame & Band (`.ledger-frame`, `.ledger-band`):** Outer `10px` radius white/dark-slate container with 1px `--border`, `overflow: hidden`, and a `--surface-muted` top header band separated by a 1px bottom rule. Zero shadow.
- **KPI Metric Cell (`.metric-card`):** `12px 16px` padding (`10px 12px` on `<640px`), uppercase `11px` tracking-wide label, `24px` bold tabular figure, and `12px` tabular detail subline separated by internal `--border-subtle` dividers.
- **Task Card (`.task-card`):** `7px` radius `--surface` container with 1px `--border` and `10px` internal padding. Hover shifts border to `#c5ccd8` (`#3a4254` dark) and reveals edit/duplicate/delete icon actions; dragging drops opacity to `0.35` with a cobalt focus ring; `Sent` cards dim to `--surface-muted` at `70%` opacity with strikethrough titles. Bottom metadata row separates deadline + status stepper via a `1px solid var(--border-subtle)` top divider.

### Inputs / Fields
- **Workspace & Pipeline Search Inputs:** `7px` radius `--surface` input with 1px `--border`, `12px` text (`--text-primary`), `--text-muted` placeholder, left-aligned `14px` magnifying glass icon, and clear (`X`) button when populated.
- **Focus & Inline Editing:** Borders shift directly to `--accent` (`#1d4ed8` / `#2563eb`) with global `2px solid var(--focus)` keyboard focus outlines. Inline task renaming uses a `5px` radius cobalt-bordered input directly inside the card title slot.

### Navigation
- **Sticky Header (`.app-header`):** `55px` tall (`3.4375rem` with `1px` border), frosted `--surface` (`92%` opacity, `backdrop-blur-md`), 1px bottom hairline. Left hosts the `32px` obsidian `zenFlow` wave icon + `zenFlow` wordmark; right houses the bordered Firestore connection indicator, `32px` theme toggle, and compact user profile menu trigger.
- **Flush Bottom-Ruled Team Tabs:** Full-height (`54px`) horizontal tabs (`All`, `Content`, `Design`) with `13px` semibold labels and `11px` tabular member counts. The active tab anchors a `2px` cobalt bottom rule (`layoutId="active-role-tab-rule"`, `180ms` `cubic-bezier(0.2, 0.7, 0.2, 1)`) flush against the header border. Below `1280px`, tabs move into a `44px` horizontally scrollable sub-header row.

### Signature Components
- **Centralized `TeamPipeline` Triage Strip:** Collapsible `.ledger-frame` uniting unassigned and assigned discipline deliverables in a ruled multi-column strip (`1`/`2`/`3` columns via `divide-x`) with inline rename, cognitive-load dot, tabular estimate, and right-aligned `Assign` action.
- **Urgent `MarqueeRibbon`:** `10px` radius crimson-tinted alert strip led by a solid vermilion `.ledger-alert-badge` and hairline-divided clickable overdue/due-today task items scrolling smoothly over `35s` (paused on hover, horizontal scroll fallback under `prefers-reduced-motion`). Pinned beneath the sticky header on `>=640px`, inline on `<640px`.
- **Inline `Free Pool` Ledger Row:** Bottom-ruled collapsible bar integrated inside the `OverviewBar` `.ledger-frame` (`44px` trigger displaying live `<3h/d` count), expanding a hairline-divided `.free-pool-members` roster with 3-segment `.free-pool-hours-scale` bars, discipline filters, swimlane jump links, portaled `Assign brief` pickers, drag-drop handoff, and `+ Task` creation without obstructing swimlane headers.

### Workspace interaction standards

- **Capacity language.** Keep the Free Pool name. Show the cutoff in the trigger and today's assigned hours beside each person. The pool describes recorded assignments under 3 hours today and cannot establish leave or availability. Include the assigned hours in each member action's accessible name.
- **Headline metric definitions.** Keep Utilization and Efficiency on the dashboard and in Analytics. Use concise inline copy: “2 of 3 assigned 3h+ today” on the dashboard and “Assigned 3h+ on [date]” in Analytics. For measured efficiency, use “Est. ÷ billable · completed work” with the hours ratio and under/over estimate result. Use “No measured work” when unavailable. Utilization is the share of members with at least 3 hours assigned on the displayed day. Efficiency is estimated hours divided by billable hours for completed work with both measures, cumulative through the displayed date. Above 100% means under estimate. Keep compact metric displays in tabs and member rows.
- **Assignment.** Use one dialog with Member, Destination, Schedule and Review, in that order. Compare eligible members in a compact selectable list. Put today's assigned hours before load points and sort by fewest hours, then lowest load. Include both values in each choice's accessible name. Keep the selected member, destination and projected impact visible in Review. Preserve overload acknowledgement and draft recovery.
- **Task card order.** Use tight rows across Pipeline, Ongoing and swimlanes: drag handle and load with estimated and billed time and the actions menu; content or asset type; client and project; task title; then deadline and priority on the left with the lane action on the right. Show only data and controls supported by that lane. Ongoing tasks are not draggable. Preserve task links, permissions, keyboard access and status safeguards.
- **Task movement.** Offer Move in each editable board task's actions menu, with direct destinations among To Do, In Progress, In Review and Sent. Use the same safeguards as other moves. Keep quick previous and next controls and the separate Archive action.
- **Board grouping.** Use spacing for card footer groups when the outer card edge already establishes the boundary. Keep actionable card edges and focus states. Preserve current dashboard density, pipeline disclosure and the local “Add or drop” cue in each status column.

## Do's and Don'ts

### Do:
- **Do** partition KPI groups, pipeline rows, and swimlane columns with 1px structural rules (`--border` and `--border-subtle`) inside a shared `.ledger-frame` (**The Hairline Partition Rule**).
- **Do** apply `font-variant-numeric: tabular-nums` to every KPI figure, efficiency percentage, billable hour ratio, cognitive-load score, member count, and deadline (**The Tabular Ledger Rule**).
- **Do** reserve solid vermilion (`#dc2626`) strictly for WIP overload (`>=12 pts`), overdue alarms, high-load dots, and destructive safety actions (**The Vermilion Reserve Rule**).
- **Do** use semantic CSS custom properties (`--canvas`, `--surface`, `--surface-muted`, `--border`, `--text-primary`, `--accent`) so every new view maintains instant light/dark parity (**The Dual-Mode Parity Rule**).
- **Do** preserve the `zenFlow` wordmark (`Inter` bold `zen` + `Dancing Script` bold `Flow`) and keep all operational typography strictly in `Inter`.
- **Do** limit elevation shadows (`--shadow-floating`, `--shadow-dialog`) and frosted `backdrop-blur` strictly to sticky headers, dropdown menus, dialogs, and the Free Pool overlay.

### Don't:
- **Don't** add ambient drop shadows (`shadow-sm`, `shadow-md`) to resting workspace surfaces, KPI frames, swimlanes, or task cards (**The Zero Ghost-Card Rule**).
- **Don't** add thick colored left or top side-stripes (`border-l-4`) onto rounded cards or ledger panels (**The Clean Perimeter Rule**).
- **Don't** wrap every piece of card metadata (client, project, cognitive load, brand link, deadline) in competing pastel pill badges; use quiet inline typography separated by muted interpuncts (`·`).
- **Don't** nest rounded bordered cards inside KPI cells, `TeamPipeline` rows, or swimlane column containers when a 1px hairline rule establishes the boundary.
- **Don't** use `Dancing Script` anywhere outside the `Flow` portion of the `zenFlow` brand wordmark.
- **Don't** ship hardcoded hex surfaces without matching `:root.dark` tokens or bypass the global `2px solid var(--focus)` keyboard focus ring.
