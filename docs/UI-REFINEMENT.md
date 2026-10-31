# UI refinement

The UI uses the platform system font, shared type sizing, and light/dark tokens
in `src/index.css` for canvas, surfaces, secondary text, borders, corner radii,
control height, focus, and shadows. Existing Tailwind, Motion, and Lucide remain
the only UI dependencies.

`DialogPanel` provides a shared surface, dynamic viewport height, scroll locking,
focus containment/restoration, accessible dialog semantics, and topmost-only
Escape dismissal. Callers provide their existing close callback and busy state.
The shared component is used by the application's 15 modal views.

`MetricBar` presents bounded, accessible meters. Values above a visual limit
retain their actual value in accompanying text. Dashboard and analytics meters
reuse existing utilization, efficiency, and workload calculations; no historical
data or synthetic trend lines are introduced.

Purge is available only under Database & Compliance → Firestore, to the right
of Apply Firestore Credentials, for superadmins. The confirmation owns the sole
UI call to the existing context purge operation. Server authorization, request
validation, database handling, protected-account behavior, and audit/SSE handling
are unchanged.

The hold control uses one monotonic clock for fill and integer countdown. Early
release, pointer exit, cancellation, lost capture, element/window blur, page
visibility loss, disabling, and modal exit reset the hold. A submission locks the
control until it settles; an error requires a new full hold. Modal exit cancels
before the next animation frame, even while Motion retains the exiting DOM.
Reduced-motion settings suppress decorative motion while retaining progress
feedback and the five-second requirement.

Mobile metrics use two primary tiles and three compact operational tiles.
Team navigation scrolls without wrapping, board columns adapt to narrower
screens, and the workload table retains readable columns in a labeled,
keyboard-focusable scroll region. Free Pool keeps separate mobile and desktop
expansion preferences and starts compact on mobile when no preference is saved.

## Verification

- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- `npm test`: 42 tests, including five deterministic hold-controller tests.
- `npm run build`
- `node --import tsx tests/smoke-production.ts`
- Eight real DOM/React interaction checks at
  `/tests/ui-preview/checks.html` (see `tests/ui-preview/README.md`).
- Interactive preview checks at 390, 768, and 1440 CSS pixels; light/dark
  dashboard, Firestore/purge, analytics, task form, and workload views reviewed.
- Native mouse early release, pointer exit with capture, full mouse/keyboard
  holds, error/success feedback, focus return, and nested Escape dismissal.
- Non-superadmin preview has no purge or credential controls. Existing backend
  authorization and purge tests continue to pass.

The preview replaces production providers with synthetic in-memory fixtures and
rejects API requests. Touch cancellation is covered by synthetic pointer events;
physical touchscreen and assistive-technology testing were not performed.
No live workspace was purged and no production deployment was performed.
