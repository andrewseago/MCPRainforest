# MCPRainforest Dashboard — Usability & UI Improvements

**Date:** 2026-06-21
**Status:** Approved (design)
**Author:** Brainstormed with Claude Code

## Goal

Improve the usability and UI of the MCPRainforest dashboard (the fork-specific
React frontend in `web/dashboard/`) through a set of **targeted, high-impact
fixes** — without a visual redesign or a structural refactor of the monolithic
`App.tsx`.

## Constraints (locked during brainstorming)

1. **Zero new dependencies.** The fork deliberately ships only `react` +
   `react-dom` and embeds the compiled bundle into the Go binary via
   `go:embed` (`internal/dashboardui/dist`). All new UI is hand-rolled
   components and CSS. No icon library, no headless-UI library.
2. **Preserve the existing rainforest visual language and section layout.**
   This is polish within the current design system (CSS custom properties in
   `src/styles.css`), not a new look or new information architecture.
3. **No monolith refactor.** `App.tsx` (~3,430 lines) and `styles.css`
   (~2,425 lines) are not being split up as part of this work. Changes are
   *additive* new components plus *targeted* edits to the existing files.
4. **Re-embed on every change.** Because `internal/dashboardui/dist` is checked
   in, `scripts/build-dashboard.sh` must be run and the regenerated assets
   committed as part of the deliverable. A stale `dist` means the served
   dashboard does not reflect the source.

## Background / current state

The dashboard is a Vite + React 18 + TypeScript app. A single `App.tsx`
renders all seven sections (servers, marketplace, tools, tool_groups, prompts,
resources, diagnostics/"System Info"), both modals (register server, create
tool group), the upstream-OAuth flow, and all helper functions. Theming
(light/dark/system) is implemented with CSS custom properties and persisted to
`localStorage`.

Data is fetched from the backend dashboard API (`src/lib/api.ts`) into a
section-keyed `DashboardData` object. Preview/sample data
(`src/lib/previewData.ts`) is shown when no real servers are registered.

### Problems this work addresses

- **Accessibility / interaction**
  - Modals lack `role="dialog"`/`aria-modal`, focus trapping, focus restore,
    and Escape-to-close.
  - Three destructive actions use the native `window.confirm` (jarring,
    off-brand, not themed).
  - No `aria-current` on the active nav item; no skip-to-content link.
  - Async loading/refresh/feedback is not announced to assistive tech.
  - Full-screen loading state wipes the view on every refresh.
- **Visual polish**
  - Inconsistent table density and badge/pill styling; abrupt expand/collapse;
    plain empty/error states.
- **Hidden data / capability** — the backend already returns fields the UI
  never shows (verified present in `src/lib/types.ts`):
  - Tools: `annotation_keys`, `input_preview`, `server_status`.
  - Prompts: `arguments_preview`.
  - Resources: `mime_type`, `transport`, `server_status` (current view is a
    thin static table).
  - Diagnostics: `config_source`, `config_path`, `metrics_endpoint`,
    `troubleshooting_hints` (currently unused).
- **Mobile / responsive**
  - Sidebar collapses into a cramped nav grid; only the marketplace table has a
    card transform — the tools and prompts tables just horizontally scroll.

## Non-goals

- No redesign of layouts, navigation, or flows (no new dashboard "home", no
  command palette — those were explicitly deferred as "deeper redesign").
- No refactor of `App.tsx`/`styles.css` into modules.
- No backend/Go changes. Specifically, `namespaced_examples` exists on the Go
  DTO but is **not** in the TypeScript contract (`types.ts`); surfacing it would
  require touching the data layer, so it is out of scope.
- No new third-party dependencies.

## Approach

Approach A — **shared primitives first, then apply.** Build the small reusable,
accessible pieces once; then apply them and the remaining improvements across
the app. This front-loads exactly the pieces everything else depends on (the
dialog primitive and the live-region announcer), keeps accessibility uniform,
and avoids rework — the right fit for a monolith we are intentionally not
refactoring.

## Work breakdown

### Section 1 — Shared primitives (built first; everything depends on these)

New files under `web/dashboard/src/components/`:

- **`Dialog.tsx`** — accessible modal shell:
  - `role="dialog"`, `aria-modal="true"`, labelled by its title
    (`aria-labelledby`).
  - Focus trap (Tab/Shift+Tab cycle within the dialog); move focus in on open;
    **restore focus to the previously focused element on close**.
  - Escape closes; backdrop click closes (preserving current behavior).
  - Respects `prefers-reduced-motion`.
  - The two existing modals (register server, create tool group) are
    re-wrapped to use it. Existing inner markup and class names are preserved so
    current styling is unaffected.
- **`ConfirmDialog.tsx`** — a themed, promise-based confirm built on `Dialog`,
  replacing all `window.confirm` calls (delete server, delete tool group, and
  any future destructive guard). Danger-styled confirm button, keyboard
  operable, focus defaults to the safe (Cancel) action.
- **`Announcer.tsx`** + a small `useAnnounce` hook — a single visually-hidden
  `aria-live="polite"` region mounted once at the app root. Load, refresh, and
  feedback events announce human-readable messages
  (e.g. "Dashboard updated", "Refresh failed: <reason>").
- **Inline icon additions** — extend the existing inline-SVG pattern (as in
  `App.tsx`'s `TrashIcon`/`RefreshIcon`) with any new glyphs (safety, transport,
  menu). No icon dependency.

### Section 2 — Accessibility & interaction (applied across the app)

- `aria-current="page"` on the active `NavSidebar` item (in addition to the
  existing `is-active` class).
- Skip-to-content link as the first focusable element, targeting the main
  content region.
- `aria-busy` on the content region while refreshing.
- Replace the full-screen loading wipe with **in-place skeleton rows** so
  context is preserved during refresh.
- Feedback banner gains an explicit dismiss control and is wired to the
  announcer.
- Confirm all new interactive controls show the existing `:focus-visible` ring.

### Section 3 — Visual polish (within existing tokens)

- Tighten spacing rhythm and normalize table density across the tools,
  prompts, marketplace, tool-groups, and resources tables.
- Unify badge/pill styling; give `StatusBadge` an optional dot/icon variant and
  tighten its `tone` typing while keeping all current call sites working.
- Add subtle, `prefers-reduced-motion`-respecting transitions to row expansion
  and dialog open/close.
- Bring empty and error states in line with the rainforest styling and
  consistent `status-*` tones.

### Section 4 — Surface hidden data (fields verified in `types.ts`)

- **Tools:** render `annotation_keys` as safety badges (e.g. read-only /
  destructive / idempotent) in both the row and the detail panel; show
  `input_preview` as a compact summary when the full schema is not expanded.
- **Prompts:** show `arguments_preview` in the row.
- **Resources:** upgrade from the thin static table to the expandable
  table/detail pattern used elsewhere; surface `mime_type`, `transport`,
  `server_status`, and enabled state.
- **System Info (diagnostics):** surface `config_source`, `config_path`,
  `metrics_endpoint` (as a link), and `troubleshooting_hints`.

### Section 5 — Mobile & responsive

- Convert the sidebar to a proper **drawer** on small screens: a toggle button
  with `aria-expanded`/`aria-controls`, closeable via Escape and overlay click,
  with focus handling consistent with `Dialog`.
- Extend the existing marketplace table→card responsive transform to the
  **tools** and **prompts** tables.
- Ensure the topbar endpoint/meta cluster wraps cleanly on narrow viewports.

## Testing & verification

- **No Go changes**, so the Go suite is unaffected; run `go test ./...` once as
  a guard.
- Per change set: `npm --prefix web/dashboard run typecheck` and
  `npm --prefix web/dashboard run build` must pass.
- Run `scripts/build-dashboard.sh` to rebuild and re-embed
  `internal/dashboardui/dist`; commit the regenerated assets.
- Manual accessibility pass, keyboard-only:
  - Tab order is logical; skip link works.
  - Dialog focus trap holds; focus restores to the trigger on close; Escape
    closes.
  - Confirm dialogs are reachable and operable without a mouse.
- Verify behavior under `prefers-reduced-motion: reduce`.
- Visual smoke check in light, dark, and system themes, and at mobile widths
  (the existing breakpoints: 1360px, 1080px, 720px, 480px).

## Parallelization plan

After this spec is approved and an implementation plan is written, the work is
executed with multiple agents:

1. **Section 1 (shared primitives) lands first** — it is foundational and
   everything else consumes it.
2. **Sections 2–5 then fan out across parallel agents**, partitioned to avoid
   clobbering the same regions of `App.tsx`/`styles.css`:
   - split application work by app section (servers/tools/prompts/resources/
     diagnostics) so edits touch disjoint JSX regions,
   - a dedicated agent owns the CSS-token/polish pass,
   - an integration/build agent reconciles, runs `scripts/build-dashboard.sh`,
     and runs typecheck/build/Go-test guards.

## Deliverables

- New components: `Dialog.tsx`, `ConfirmDialog.tsx`, `Announcer.tsx`
  (+ `useAnnounce`), inline icon additions.
- Targeted edits to `App.tsx`, `styles.css`, `NavSidebar.tsx`, `StatusBadge.tsx`.
- Regenerated and committed `internal/dashboardui/dist` assets.
- All typecheck/build/Go-test guards passing; manual a11y and theme checks done.
