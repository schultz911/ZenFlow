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
  mobile-input:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
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
  header-height: "55px"
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
  free-pool-row:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    typography: "{typography.body}"
    padding: "0 16px"
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

<!-- impeccable:design-map -->
Name: zenFlow
Colors: primary: cobalt-accent #1d4ed8; secondary: emerald-capacity #059669; neutral: alabaster-canvas #f8f9fb; primary: cobalt-deep #1e40af; primary: cobalt-wash #eff4ff (+29 more in the sidecar)
Fonts: Dancing Script (wordmark); Inter (kpi-display, headline, title, card-title, body, label)
Spacing: 2xs 4px, xs 6px, sm 8px, md 10px, base 12px, lg 16px, xl 20px, 2xl 24px, 3xl 32px, control-height 34px, header-height 54px
Radius: chip 5px, badge 6px, card 7px, control 7px, dock 9px, panel 10px, pill 9999px
North Star: "Swiss Agency Traffic Ledger"
Rules:
- The Vermilion Reserve Rule. Solid vermilion (`#dc2626`) is strictly reserved for WIP overload (`>=12 pts`), overdue alarms, high-load dots, and destructive actions—never for decorative tags, neutral banners, or standard CTAs.
- (+6 more)
Elevation:
- Surface Flat: none
- Floating Overlay — Light: 0 12px 32px rgba(18, 20, 24, 0.12), 0 2px 6px rgba(18, 20, 24, 0.06)
- Floating Overlay — Dark: 0 14px 36px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)
- Modal Dialog — Light: 0 24px 64px rgba(18, 20, 24, 0.18), 0 4px 12px rgba(18, 20, 24, 0.08)
- Modal Dialog — Dark: 0 24px 72px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.4)
Don't:
- Don't add ambient drop shadows (`shadow-sm`, `shadow-md`) to resting workspace surfaces, KPI frames, swimlanes, or task cards (The Zero Ghost-Card Rule).
- Don't add thick colored left or top side-stripes (`border-l-4`) onto rounded cards or ledger panels (The Clean Perimeter Rule).
- Don't wrap every piece of card metadata (client, project, cognitive load, brand link, deadline) in competing pastel pill badges; use quiet inline typography separated by muted interpuncts (`·`).
- Don't nest rounded bordered cards inside KPI cells, `TeamPipeline` rows, or swimlane column containers when a 1px hairline rule establishes the boundary.
- Don't use `Dancing Script` anywhere outside the `Flow` portion of the `zenFlow` brand wordmark.
- Don't ship hardcoded hex surfaces without matching `:root.dark` tokens or bypass the global `2px solid var(--focus)` keyboard focus ring.
Full: .impeccable/design-full.md (read a section when you need its detail)

## Components

- **Primary workspace.** Optimize the dashboard for laptop use. Evaluate its hierarchy, density, controls and workflows at laptop viewport sizes.
- **Laptop board navigation.** Put Overview, Pipeline and Members in a persistent jump bar at the right of a shallow footer. Give the board its own scroll area above the footer so the bar never covers work. Highlight the current section and move keyboard focus to the destination on activation. Offer Members when member lanes are present.
- **Assignment capacity.** Show the visible candidate range and total above the eligible-member list. Show the selected member’s current count of tasks that contribute load points, including overdue work. Keep the 1×, 1.5× and 2× load choices. In the existing help, explain that they are weights and show how overdue work can contribute points when 0h is scheduled today.
- **Assignment forecast.** Show current assigned hours and “Projected: set a deadline” until the lead selects a deadline. Then show the current and projected hours together. Keep load visible as its own measure.
- **Metric help.** Use the existing info controls to explain that scheduled estimates determine assigned hours and that active work can still add load points after its deadline. Explain how undated assignments count. Keep worked examples for Efficiency and for an assignment with 0h scheduled today alongside overdue load. Check that example in the assignment flow before changing the help. Make the info controls easy to spot and give them visible keyboard focus. Preserve headline metric copy.
- **Laptop workflow verification.** Check long names and metadata contrast at 200% zoom in both themes. Keep full names visible. Verify keyboard focus and single-choice states, consecutive assignments and return to Pipeline, the Accounts brief handoff, and draft preservation and retry after rejected assignment and brief saves.
- **Capacity language.** Keep one Free Pool entry in the overview on desktop and phone. Show the cutoff in the trigger and today's assigned hours beside each person. The pool describes recorded assignments under 3 hours today and cannot establish leave or availability. Include the assigned hours in each member action's accessible name.
- **Headline metric definitions.** Keep Utilization and Efficiency on the dashboard and in Analytics. Use concise inline copy: “2 of 3 assigned 3h+ today” on the dashboard and “Assigned 3h+ on [date]” in Analytics. For measured efficiency, use the concise format “3h est. / 20h billable · 17h over est.” with the actual hours and calculated difference. Use “No measured work” when unavailable. Use neutral text for 0% utilization and keep the assigned-hours threshold visible. Utilization is the share of members with at least 3 hours assigned on the displayed day. Efficiency is estimated hours divided by billable hours for completed work with both measures, cumulative through the displayed date. Above 100% means under estimate. Keep compact metric displays in tabs and member rows. Preserve headline copy and spacing. Use small info buttons beside efficiency and load labels for supplemental definitions. Keep essential labels visible and make supplemental help operable by keyboard and touch.
- **Assignment.** Use one dialog with Member, Destination, Schedule and Review, in that order. Compare eligible members in a compact selectable list. Put today's assigned hours before load points and sort by fewest hours, then lowest load. Include both values in each choice's accessible name. Give the selected member a distinct line in Review, followed by projected impact and destination. Keep destination choices visible and disabled until a member is selected, explain the prerequisite, and use “Save estimates in Pipeline” when unassigned. Preserve overload acknowledgement and draft recovery.
- **Task card order.** Use tight rows across Pipeline, Ongoing and swimlanes: drag handle and load with estimated and billed time and the actions menu; client in regular weight and project in bold; task title; then deadline and priority on the left with the lane action on the right. Do not repeat content or asset type on cards. Show only data and controls supported by that lane. Ongoing tasks are not draggable. Keep brief bodies, excerpts and reference links in task details. Preserve operational links to deliverables and ClickUp, permissions, keyboard access and status safeguards.
- **Task movement.** Offer Move in each editable board task's actions menu, with direct destinations among To Do, In Progress, In Review and Sent. Use the same safeguards as other moves. Keep quick previous and next controls and the separate Archive action.
- **Board grouping.** Use spacing for card footer groups when the outer card edge already establishes the boundary. Keep actionable card edges and focus states. Preserve laptop dashboard density and Pipeline disclosure. Show “Add or drop” only in editable empty stages. Keep card boundaries that identify interactive tasks.
- **Dashboard emphasis and reflow.** Let the phone summary control wrap below the title and member count when space runs out. On phones, place overdue work before other exceptions and keep search visible. Keep the overdue ribbon prominent and render the overload sort control with quieter styling. Keep the desktop density and enlarge small action targets without enlarging the icons.
- **Pipeline actions and recovery.** Put Reassign near the top of the existing actions menu for authorized users on assigned briefs. In Accounts task details, explain who can assign briefs when the action is unavailable. Show Next cards on phones only while cards remain off screen to the right. Keep the existing no-results copy and offer separate actions to clear workspace search and the Pipeline filter when each is active.
- **Error recovery.** Preserve the current Undo duration. For actionable errors, state the next step near the failure and use a cause only when it is known.

- **Journey verification.** Check Pipeline scrolling, per-member stages and Free Pool assignment with a larger fixture. Check card readability with long names and at 200% zoom. Let long client and project names wrap on Pipeline cards so neither disappears. Exercise keyboard and screen-reader access through search, metric help, Pipeline and assignment, plus the Accounts creation and status handoff. Check affected phone states in both themes.

- **Quick Add drafts.** Ask before discarding an edited title, deadline or load when the user taps outside, cancels, presses Escape or switches stages. Default to Keep editing and return focus to the draft.
- **Phone lead navigation.** Keep overdue work first and include assignee names in deadline exceptions, with Unassigned as the fallback. Provide Members near Pipeline and Back to Pipeline above the member lanes. Label the assigned-hours threshold and average load in the collapsed overview.
- **Pipeline filters.** Match desktop filter button height and alignment to New Brief. Keep amber for the unassigned count. Check zoom and keyboard focus before changing compact type.

- **Laptop Pipeline navigation.** Show only whole cards at each resting position. Show Previous and Next only when the row overflows. Move by one visible page and show the visible brief range and total. Let Tab reach offscreen cards and bring the focused card fully into view. After assignment, retain the active Pipeline filter and scroll position when possible. Return focus to the originating brief, the next visible brief, the previous one, or a Pipeline control when the row is empty. Bring the focused brief fully into view if the row has shifted.
- **Laptop assignment and member lanes.** Show the task title and available client, project and due date above the assignment form. On laptops, put the candidate list on the left and assignment fields on the right. Let the candidate rows scroll beneath their headings and visible range. Keep the selected member, destination, projected hours and load, and an edit-deadline control directly above the save action. Preserve Pipeline return position and focus across consecutive assignments. Default to all member lanes. Offer Members with work to show only members with work in their lanes under the current board and search filters. Pipeline briefs and archived work do not count toward this filter.
- **Laptop type and access.** Keep Inter and use weight and spacing to distinguish task names, client names and project names. Allow card metadata to wrap for long names. Check contrast, readability at 200% zoom, keyboard order, accessible action names and visible focus. Remove redundant borders only where the surrounding boundary already groups the content.
- **Metric help and alerts.** Preserve headline metric copy. Include a worked example in Efficiency help. Explain that Free Pool and Utilization use opposite sides of the same assigned-hours cutoff. Keep overdue work more prominent than overload.
- **Analytics Efficiency scale.** Mark 100% as on estimate and show the actual percentage in the meter. Start at 0–200% and extend the visible maximum in 100-point steps to include higher values. Use percentages alone for visible scale labels. Expose the percentage, baseline and scale to assistive technology. Keep the approved headline and estimate comparison.
- **Workspace Help.** Place Help immediately after Keyboard Shortcuts in the user menu. Use one short guide to explain creating and tracking briefs, assigning work and comparing capacity, moving assigned work, and reading Analytics. Use the app’s labels and call out permission-dependent actions.
- **Accounts handoff.** Confirm when a brief enters Pipeline for assignment. Verify that Accounts can create a brief, see confirmation, and check its status and assignment guidance after changes to Pipeline navigation.


- **Analytics disclosures.** Show the flagged counts for underutilization and low efficiency with both lists collapsed by default. Expand each list independently and allow full member names to wrap.
- **New Brief requirements.** Use New Brief for the entry and dialog title, Create Brief for the submit action, and Cluster and Parent task where those concepts appear. Start focus at the first missing required field. Explain the current prerequisite beside Create Brief and update the message as fields are completed. Keep the footer in view and show “More fields below” only while the form has content below the visible area. On a failed save, retain the draft and tell the user how to retry.
- **Laptop typography.** Keep Inter. Give Pipeline task titles a small gap after client and project metadata. Wrap Efficiency detail between the hours and comparison phrases in Overview and Analytics. Keep the approved wording. Preserve task borders and the empty-stage “Add or drop” cue.
- **Laptop regression checks.** Check keyboard order, accessible names, visible focus and zoom in the affected dialogs and Analytics. Use a radio group for the mutually exclusive Cognitive Load weights and verify arrow-key selection. Exercise consecutive assignments, Pipeline paging, Members with work, overdue ownership and the worked Efficiency example.
