---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css","src/components/Header.tsx","src/components/OverviewBar.tsx","src/components/TeamPipeline.tsx","src/components/Swimlane.tsx","src/components/TaskCard.tsx","src/components/FreePoolContainer.tsx"]
---

# Surface Brief — zenFlow Workspace Dashboard (`src/App.tsx`)

- **Scope:** Authenticated operational workspace (`Header`, `OverviewBar`, `MarqueeRibbon`, `TeamPipeline`, `Swimlane`, `TaskCard`, `FreePoolContainer`, shared `index.css` & `DialogPanel` tokens).
- **Visitor mode:** `operate`
- **Primary task:** Daily standup scanning, cognitive-load/WIP rebalancing, Free Pool (`< 3h/day`) allocation, and unassigned `TeamPipeline` triage for ZenSciences Content, Design, and Accounts teams.
- **Constraints:** Preserve `zenFlow` logo/wordmark, all DOM IDs/workflows/drag-and-drop/RBAC/hold-to-purge mechanics, responsive mobile layouts, and full light/dark mode parity.

## Direction contract

- **THESIS:** Swiss Agency Traffic Ledger — a ruled, high-density editorial production schedule that replaces competing pill badges and nested card noise with 1px structural rules, tabular numerals, and high-contrast vermilion overload alerts.
- **OWN-WORLD:** Cool alabaster (`#f8f9fb` / `#ffffff`) in light mode and deep ink-slate (`#0f1115` / `#161920`) in dark mode, `#dfe3ea` / `#262b36` 1px ledger hairlines, cobalt-blue (`#1d4ed8` / `#60a5fa`) for active navigation and primary actions, emerald (`#059669` / `#34d399`) for healthy utilization/Free Pool, amber (`#b45309` / `#fbbf24`) for review/caution, and solid vermilion (`#dc2626`) exclusively for WIP overload and overdue alarms. Zero ghost-card double elevation; subtle frosted translucency reserved strictly for sticky header and floating Free Pool/dialog overlays.
- **STORY:** A Creative Director or Lead opens zenFlow, spots overloaded team members and urgent deadlines in under two seconds via vermilion ledger alerts, checks Free Pool availability (`< 3h/day`), and assigns unassigned pipeline deliverables directly into balanced member swimlanes.
- **FIRST VIEWPORT:** 54px sticky header with preserved `zenFlow` mark, flush bottom-ruled team tabs (`All`, `Content`, `Design` with animated active-indicator glide), sync indicator, theme toggle, and user menu; directly below, a ruled single-frame 5-column KPI ledger (`Utilization`, `Efficiency`, `Avg workload`, `In progress`, `To do`) with inline overload alert badge, compact search/filter toolbar, ruled `TeamPipeline` triage bar, member swimlanes divided into 4 crisp ruled columns (`To Do`, `In Progress`, `In Review`, `Sent`) with single-line tabular card metadata, and a right-edge `Free Pool` handle that opens a capacity sidebar. On wide screens the sidebar can dock beside the board, while smaller screens use an overlay.
- **FORM:** Swiss Agency Traffic Ledger (candidate 3 of 7 grounded directions, chosen via safer register reroll 2), `seed:10aeab85e9505c39`.
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
