# Isolated UI validation

Run `node --import tsx tests/ui-preview.ts`, then open
`http://127.0.0.1:4175/tests/ui-preview/index.html`.

This renders the real application with synthetic in-memory users/tasks. The Vite
preview substitutes the Dashboard provider and Firebase connection module, and
rejects all `/api` requests. It never connects to workspace storage.

Query options: `theme=light`, `width=390` (iframe with a real mobile viewport),
`width=768`, `width=1440`, `member=1` (hide superadmin controls), `error=1`
(simulate a failed purge). No query options or fixtures enter the production build.

Verify navigation and export dropdowns, search, analytics, task/member forms,
scrolling columns, and Database & Compliance → Firestore → Purge Database.
Check early release, exit/reentry, pointer cancellation, touch, Space/Enter,
Escape, focus loss, retry, full five-second completion and duplicate prevention.
The fixture purge only removes synthetic in-memory records.

Open `/tests/ui-preview/checks.html` and select **Run isolated checks** for eight
real DOM/React checks, including touch cancellation, pointer exit, Space/Enter,
disabled controls, exit animation cancellation, duplicate prevention, and retry.
These use synthetic events with a short hold duration. Native pointer capture and
the full five-second keyboard/mouse hold should also be checked interactively.
