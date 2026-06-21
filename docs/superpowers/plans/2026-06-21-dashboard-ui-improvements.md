# MCPRainforest Dashboard UI/Usability Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the MCPRainforest dashboard's accessibility, interaction, visual polish, surfaced data, and mobile behavior through targeted, additive changes — no redesign, no monolith refactor, no new dependencies.

**Architecture:** Build three small accessible primitives first (`Dialog`, `ConfirmDialog`, `Announcer`/`useAnnounce`), then apply them and the remaining improvements across the existing `App.tsx` and `styles.css`. All changes are additive components plus targeted edits to existing files. The compiled bundle is re-embedded into the Go binary at the end.

**Tech Stack:** React 18 + TypeScript + Vite. Hand-rolled components and CSS custom properties. No UI libraries.

## Global Constraints

- **Zero new dependencies.** Only `react` + `react-dom` are allowed. No icon/UI/test libraries. Verify `web/dashboard/package.json` dependencies are unchanged after every task.
- **No test runner exists** in `web/dashboard` and none may be added. The correctness gate for every task is: `npm --prefix web/dashboard run typecheck` (must pass) + `npm --prefix web/dashboard run build` (must succeed) + the explicit manual checks named in the task. There are no unit-test steps.
- **Preserve the existing rainforest visual language**, section layout, and all existing class names. New CSS uses the existing custom properties (`--accent`, `--surface`, `--border`, `--muted`, `--radius-*`, `--shadow`, `status-*` tones, etc.).
- **No monolith refactor.** `App.tsx` and `styles.css` are edited in place; not split.
- **No Go/backend changes.** Only surface fields already present in `web/dashboard/src/lib/types.ts`. (`namespaced_examples` is NOT in the TS contract → out of scope.)
- **Re-embed on completion.** `internal/dashboardui/dist` is checked in; run `scripts/build-dashboard.sh` and commit the regenerated assets (final task only, to avoid churn between tasks).
- **Path aliases:** `@/*` → `src/*`, `@repo-assets` → repo `assets/`. Build command from repo root: `npm --prefix web/dashboard run build`.
- **Respect `prefers-reduced-motion`** for all new transitions.
- All commits use Conventional Commit prefixes (`feat:`, `fix:`, `style:`, `refactor:`). The repo's default branch is `main`; work happens on branch `dashboard-ui-improvements`.

---

## Task 1: Dialog primitive (accessible modal shell)

**Files:**
- Create: `web/dashboard/src/components/Dialog.tsx`
- Modify: `web/dashboard/src/styles.css` (append reduced-motion + dialog-title rules near the modal block ~line 1481)
- Modify: `web/dashboard/src/components/StatusBadge.tsx` is NOT touched here.

**Interfaces:**
- Produces: `Dialog` component:
  ```ts
  function Dialog(props: {
    open: boolean;
    onClose: () => void;
    titleId: string;
    children: ReactNode;
    labelledBy?: string; // defaults to titleId
  }): JSX.Element | null
  ```
  Renders `null` when `open` is false. Renders the existing `.modal-backdrop` > `.modal-panel` structure with `role="dialog"`, `aria-modal="true"`, `aria-labelledby={labelledBy ?? titleId}`. Traps Tab focus, moves focus to the panel on open, restores focus to the previously focused element on close, closes on Escape, closes on backdrop click. Consumers render their own `.modal-header`/`.modal-form`/`.modal-footer` as children and must give the heading element `id={titleId}`.

- [ ] **Step 1: Create the Dialog component**

Create `web/dashboard/src/components/Dialog.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  titleId,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby={labelledBy ?? titleId}
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS for reduced motion and dialog focus**

Append to `web/dashboard/src/styles.css` (end of file):

```css
.modal-panel:focus {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npm --prefix web/dashboard run typecheck`
Expected: exits 0, no errors.

Run: `npm --prefix web/dashboard run build`
Expected: build succeeds, writes `web/dashboard/dist`.

- [ ] **Step 4: Confirm no dependency change**

Run: `git -C /Users/andrewws/GitHub/MCPJungle diff --stat web/dashboard/package.json`
Expected: no output (file unchanged).

- [ ] **Step 5: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/Dialog.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: add accessible Dialog primitive with focus trap and reduced-motion support"
```

---

## Task 2: ConfirmDialog + replace window.confirm

**Files:**
- Create: `web/dashboard/src/components/ConfirmDialog.tsx`
- Modify: `web/dashboard/src/App.tsx` (import; add confirm state; `deleteServer` ~line 1369; `deleteToolGroup` ~line 1448; render dialog before the closing `</main>` ~line 3427)
- Modify: `web/dashboard/src/styles.css` (append confirm-dialog message style)

**Interfaces:**
- Consumes: `Dialog` from Task 1.
- Produces: `ConfirmDialog` component:
  ```ts
  function ConfirmDialog(props: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    tone?: "danger" | "default"; // default "danger"
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }): JSX.Element | null
  ```
  Cancel button receives initial focus.

- [ ] **Step 1: Create the ConfirmDialog component**

Create `web/dashboard/src/components/ConfirmDialog.tsx`:

```tsx
import { useId } from "react";
import { Dialog } from "./Dialog";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Dialog onClose={onCancel} open={open} titleId={titleId}>
      <div className="modal-header">
        <div>
          <p className="panel-label">Confirm</p>
          <h2 id={titleId}>{title}</h2>
        </div>
      </div>
      <p className="confirm-message">{message}</p>
      <div className="modal-footer">
        <button autoFocus className="secondary-action" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className={tone === "danger" ? "danger-action" : "primary-action"}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add confirm state and a helper to App.tsx**

In `web/dashboard/src/App.tsx`, add the import near the other component imports (after the `CopyButton` import, ~line 19):

```tsx
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
```

Add this interface near the other interfaces (after `FeedbackMessage`, ~line 62):

```tsx
interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}
```

Add state inside `App()` near the other `useState` calls (after `busyKeys`, ~line 766):

```tsx
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
```

- [ ] **Step 3: Rewrite deleteServer to use ConfirmDialog**

Replace the body of `deleteServer` (`App.tsx` ~lines 1369-1386). The current version calls `window.confirm`. New version:

```tsx
  function deleteServer(server: DashboardServer) {
    setConfirmState({
      title: `Delete server "${server.name}"?`,
      message:
        "This removes the registration and all discovered tools, prompts, and resources from MCPRainforest.",
      confirmLabel: "Delete server",
      onConfirm: async () => {
        await runMutation(
          `server-delete:${server.name}`,
          async () => {
            await api.deleteServer(server.name);
          },
          `${server.name} deleted.`,
        );
        if (expandedServer === server.name) {
          setExpandedServer(null);
        }
      },
    });
  }
```

- [ ] **Step 4: Rewrite deleteToolGroup to use ConfirmDialog**

Replace the body of `deleteToolGroup` (`App.tsx` ~lines 1448-1463):

```tsx
  function deleteToolGroup(group: DashboardToolGroup) {
    setConfirmState({
      title: `Delete tool group "${group.name}"?`,
      message: "This removes the tool group and its dedicated MCP endpoints.",
      confirmLabel: "Delete group",
      onConfirm: async () => {
        await runMutation(
          `tool-group-delete:${group.name}`,
          async () => {
            await api.deleteToolGroup(group.name);
          },
          `${group.name} deleted.`,
        );
        if (expandedToolGroup === group.name) {
          setExpandedToolGroup(null);
        }
      },
    });
  }
```

- [ ] **Step 5: Render the ConfirmDialog**

In `App.tsx`, immediately before the closing `</main>` tag (~line 3427, after the register modal block), add:

```tsx
        <ConfirmDialog
          busy={confirmBusy}
          confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
          message={confirmState?.message ?? ""}
          onCancel={() => {
            if (confirmBusy) {
              return;
            }
            setConfirmState(null);
          }}
          onConfirm={async () => {
            if (!confirmState) {
              return;
            }
            setConfirmBusy(true);
            try {
              await confirmState.onConfirm();
              setConfirmState(null);
            } catch {
              // runMutation already surfaced the error via feedback; keep dialog open.
            } finally {
              setConfirmBusy(false);
            }
          }}
          open={confirmState !== null}
          title={confirmState?.title ?? ""}
        />
```

- [ ] **Step 6: Append confirm-message CSS**

Append to `web/dashboard/src/styles.css`:

```css
.confirm-message {
  margin: 0 0 16px;
  color: var(--muted-strong);
  line-height: 1.5;
}
```

- [ ] **Step 7: Verify no window.confirm remains**

Run: `grep -rn "window.confirm" web/dashboard/src/`
Expected: no output.

- [ ] **Step 8: Typecheck, build, and manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual (in `npm --prefix web/dashboard run dev`): trigger delete on a sample server → themed dialog appears, Cancel has focus, Escape closes, clicking the danger button shows "Working..." then closes.

- [ ] **Step 9: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/ConfirmDialog.tsx web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: replace window.confirm with themed accessible ConfirmDialog"
```

---

## Task 3: Live-region announcer

**Files:**
- Create: `web/dashboard/src/components/Announcer.tsx`
- Modify: `web/dashboard/src/App.tsx` (use the hook; announce on load/refresh/feedback; render the region)
- Modify: `web/dashboard/src/styles.css` (append `.sr-only`)

**Interfaces:**
- Produces:
  ```ts
  function useAnnounce(): { message: string; announce: (msg: string) => void }
  function Announcer(props: { message: string }): JSX.Element
  ```
  `Announcer` renders a visually-hidden `aria-live="polite"` `aria-atomic="true"` region.

- [ ] **Step 1: Create the Announcer**

Create `web/dashboard/src/components/Announcer.tsx`:

```tsx
import { useCallback, useState } from "react";

// Note: useCallback is imported from react below; see import line.
```

Replace the placeholder above with the real file content:

```tsx
import { useCallback, useState } from "react";

export function useAnnounce() {
  const [message, setMessage] = useState("");
  const announce = useCallback((msg: string) => {
    // Reset first so repeated identical messages are re-announced.
    setMessage("");
    window.setTimeout(() => setMessage(msg), 30);
  }, []);
  return { message, announce };
}

export function Announcer({ message }: { message: string }) {
  return (
    <div aria-atomic="true" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
```

- [ ] **Step 2: Append `.sr-only` CSS**

Append to `web/dashboard/src/styles.css`:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 3: Wire the hook into App.tsx**

Add import (after the `Dialog` import from Task 2):

```tsx
import { Announcer, useAnnounce } from "@/components/Announcer";
```

Inside `App()`, near the top with other hooks (after the `confirmBusy` state):

```tsx
  const { message: announcement, announce } = useAnnounce();
```

In `loadDashboardData`, in the success path right after `setLoadState("ready");` (~line 808), add:

```tsx
      announce(silent ? "Dashboard refreshed." : "Dashboard loaded.");
```

In `loadDashboardData`, in the catch block, after setting the error feedback/message, add (both branches):

```tsx
      announce(`Dashboard load failed: ${message}`);
```

In the `feedback` setter path inside `runMutation` success (~after `setFeedback({ tone: "success", message: successMessage });`), add:

```tsx
      announce(successMessage);
```

- [ ] **Step 4: Render the Announcer**

In `App.tsx`, immediately after the opening `<div className="app-shell">` (~line 1536), add:

```tsx
      <Announcer message={announcement} />
```

- [ ] **Step 5: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: with VoiceOver/screen reader (or by inspecting the `.sr-only` node in devtools), confirm the text updates on refresh and after a mutation.

- [ ] **Step 6: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/Announcer.tsx web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: announce dashboard load, refresh, and mutation results to assistive tech"
```

---

## Task 4: Re-wrap existing modals in Dialog

**Files:**
- Modify: `web/dashboard/src/App.tsx` (tool-group modal ~lines 2994-3136; register modal ~lines 3138-3426)

**Interfaces:**
- Consumes: `Dialog` from Task 1 (already imported in Task 2).

- [ ] **Step 1: Add stable title ids**

Inside `App()`, after the `useAnnounce` line, add:

```tsx
  const registerTitleId = "register-server-dialog-title";
  const toolGroupTitleId = "tool-group-dialog-title";
```

- [ ] **Step 2: Convert the tool-group modal**

Replace the tool-group modal opening (currently `App.tsx` ~lines 2994-2996):

```tsx
        {toolGroupOpen ? (
          <div className="modal-backdrop" onClick={closeToolGroupModal} role="presentation">
            <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
```

with:

```tsx
        <Dialog onClose={closeToolGroupModal} open={toolGroupOpen} titleId={toolGroupTitleId}>
```

Change the modal heading so the `<h2>Add Tool Group</h2>` (~line 3000) carries the id:

```tsx
                  <h2 id={toolGroupTitleId}>Add Tool Group</h2>
```

Replace the modal closing (the `</section></div>) ? null : null}` block, ~lines 3134-3136):

```tsx
            </section>
          </div>
        ) : null}
```

with:

```tsx
        </Dialog>
```

- [ ] **Step 3: Convert the register-server modal**

Replace the register modal opening (`App.tsx` ~lines 3138-3140):

```tsx
        {registerOpen ? (
          <div className="modal-backdrop" onClick={closeRegisterModal} role="presentation">
            <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
```

with:

```tsx
        <Dialog onClose={closeRegisterModal} open={registerOpen} titleId={registerTitleId}>
```

Give the register modal `<h2>` (the one rendering the dynamic title, ~line 3146) the id:

```tsx
                  <h2 id={registerTitleId}>
```

Replace the register modal closing (~lines 3424-3426):

```tsx
            </section>
          </div>
        ) : null}
```

with:

```tsx
        </Dialog>
```

- [ ] **Step 4: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: open Add Server and Add Tool Group → Escape closes both; Tab cycles within; on close focus returns to the trigger button; the multi-step OAuth view inside the register modal still renders.

- [ ] **Step 5: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx
git -C /Users/andrewws/GitHub/MCPJungle commit -m "refactor: route register-server and tool-group modals through Dialog primitive"
```

---

## Task 5: NavSidebar a11y + skip link + aria-busy

**Files:**
- Modify: `web/dashboard/src/components/NavSidebar.tsx` (active item `aria-current`)
- Modify: `web/dashboard/src/App.tsx` (skip link; `id` on main; `aria-busy`)
- Modify: `web/dashboard/src/styles.css` (skip-link styles)

**Interfaces:** none new.

- [ ] **Step 1: Add aria-current to the active nav item**

In `web/dashboard/src/components/NavSidebar.tsx`, update the nav `<button>` (~lines 90-95) to add `aria-current`:

```tsx
          <button
            aria-current={active === item.key ? "page" : undefined}
            className={`nav-item ${active === item.key ? "is-active" : ""}`}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
```

- [ ] **Step 2: Add skip link and main id**

In `App.tsx`, the `<Announcer />` line from Task 3 is the first child of `.app-shell`. Immediately after it, add the skip link:

```tsx
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
```

Change the `<main className="main-shell">` opening tag (~line 1538) to:

```tsx
      <main aria-busy={refreshing} className="main-shell" id="main-content" tabIndex={-1}>
```

- [ ] **Step 3: Append skip-link CSS**

Append to `web/dashboard/src/styles.css`:

```css
.skip-link {
  position: absolute;
  left: 12px;
  top: -48px;
  z-index: 100;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  color: var(--text);
  text-decoration: none;
  box-shadow: var(--shadow);
  transition: top 140ms ease;
}

.skip-link:focus-visible {
  top: 12px;
}

.main-shell:focus {
  outline: none;
}
```

- [ ] **Step 4: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: load the page, press Tab once → the "Skip to main content" link appears; activating it moves focus to the content. Inspect the active nav button → `aria-current="page"`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/NavSidebar.tsx web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: add skip link, aria-current nav, and aria-busy content region"
```

---

## Task 6: In-place skeleton loading state

**Files:**
- Modify: `web/dashboard/src/App.tsx` (replace the full-screen loading block ~lines 1592-1597)
- Modify: `web/dashboard/src/styles.css` (append skeleton styles)

**Interfaces:** none new.

- [ ] **Step 1: Replace the loading block**

In `App.tsx`, replace the loading-screen block (~lines 1592-1597):

```tsx
        {loadState === "loading" ? (
          <section className="loading-screen panel">
            <h2>Loading dashboard</h2>
            <p>Querying local MCPRainforest state, servers, tools, prompts, and resources.</p>
          </section>
        ) : null}
```

with an accessible skeleton:

```tsx
        {loadState === "loading" ? (
          <section aria-hidden="true" className="panel skeleton-panel">
            <div className="skeleton-line skeleton-line-lg" />
            <div className="skeleton-line skeleton-line-md" />
            <div className="skeleton-grid">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-md" />
          </section>
        ) : null}
```

- [ ] **Step 2: Append skeleton CSS**

Append to `web/dashboard/src/styles.css`:

```css
.skeleton-panel {
  display: grid;
  gap: 14px;
}

.skeleton-line {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-soft) 50%, var(--surface-muted) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

.skeleton-line-lg {
  height: 24px;
  width: 40%;
}

.skeleton-line-md {
  width: 65%;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.skeleton-card {
  height: 72px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-soft) 50%, var(--surface-muted) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 720px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 3: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: throttle network in devtools and reload → skeleton shimmer shows in place of content; under `prefers-reduced-motion: reduce` the shimmer animation is suppressed (static blocks).

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: replace full-screen loading wipe with in-place skeleton"
```

---

## Task 7: Dismissible feedback banner

**Files:**
- Modify: `web/dashboard/src/App.tsx` (feedback banner ~lines 1585-1590)
- Modify: `web/dashboard/src/styles.css` (append dismiss-button style)

**Interfaces:** none new.

- [ ] **Step 1: Add a dismiss button to the banner**

In `App.tsx`, replace the feedback banner block (~lines 1585-1590):

```tsx
        {feedback ? (
          <section className={`feedback-banner feedback-${feedback.tone}`}>
            <strong>{feedback.tone === "success" ? "Updated" : "Request failed"}</strong>
            <span>{feedback.message}</span>
          </section>
        ) : null}
```

with:

```tsx
        {feedback ? (
          <section className={`feedback-banner feedback-${feedback.tone}`} role="status">
            <div className="feedback-banner-text">
              <strong>{feedback.tone === "success" ? "Updated" : "Request failed"}</strong>
              <span>{feedback.message}</span>
            </div>
            <button
              aria-label="Dismiss message"
              className="feedback-dismiss icon-button"
              onClick={() => setFeedback(null)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </section>
        ) : null}
```

- [ ] **Step 2: Append feedback layout CSS**

Append to `web/dashboard/src/styles.css`:

```css
.feedback-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.feedback-banner-text {
  display: grid;
  gap: 2px;
}

.feedback-dismiss {
  flex: 0 0 auto;
  color: inherit;
  opacity: 0.7;
}

.feedback-dismiss:hover {
  opacity: 1;
}
```

- [ ] **Step 3: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: trigger a success feedback (toggle a sample tool is blocked in preview; instead register or refresh to surface a banner) → the dismiss button clears it.

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: make feedback banner dismissible and a status live region"
```

---

## Task 8: StatusBadge tone typing + polish

**Files:**
- Modify: `web/dashboard/src/components/StatusBadge.tsx`
- Modify: `web/dashboard/src/styles.css` (append row-expand transition polish)

**Interfaces:**
- Produces: `StatusBadge` with a typed `tone` and optional `dot`:
  ```ts
  type StatusTone = "good" | "warn" | "bad" | "muted";
  function StatusBadge(props: { tone: StatusTone; text: string; dot?: boolean }): JSX.Element
  ```
  Existing call sites pass `tone` values already constrained by helper functions returning `"good" | "warn" | "bad" | "muted"`, so they remain valid.

- [ ] **Step 1: Type the StatusBadge and add a dot variant**

Replace the entire `web/dashboard/src/components/StatusBadge.tsx`:

```tsx
export type StatusTone = "good" | "warn" | "bad" | "muted";

export function StatusBadge({
  tone,
  text,
  dot = false,
}: {
  tone: StatusTone;
  text: string;
  dot?: boolean;
}) {
  return (
    <span className={`status-badge status-${tone}`}>
      {dot ? <span aria-hidden="true" className="status-badge-dot" /> : null}
      {text}
    </span>
  );
}
```

- [ ] **Step 2: Append the dot + expand-transition CSS**

Append to `web/dashboard/src/styles.css`:

```css
.status-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.row-chevron {
  transition: transform 140ms ease;
}

.row-chevron.is-expanded {
  transform: rotate(90deg);
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm --prefix web/dashboard run typecheck`
Expected: 0 errors. (If any call site passes a string not in `StatusTone`, the compiler flags it — fix by confirming the helper return types in `App.tsx` are `as const` "good"/"warn"/"bad"/"muted"; they already are.)

Run: `npm --prefix web/dashboard run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/StatusBadge.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "refactor: type StatusBadge tones, add dot variant and chevron transition"
```

---

## Task 9: Surface tool safety annotations + input preview

**Files:**
- Modify: `web/dashboard/src/App.tsx` (tool summary row ~lines 2373-2386; tool detail panel ~lines 2427-2437)
- Modify: `web/dashboard/src/styles.css` (append annotation badge styles)

**Interfaces:** uses `DashboardTool.annotation_keys?: string[]` and `DashboardTool.input_preview?: string` (already in `types.ts`).

- [ ] **Step 1: Add an annotation-label helper**

In `App.tsx`, add near the other helper functions (after `toolDescription`, ~line 234):

```tsx
const annotationLabels: Record<string, { label: string; tone: "good" | "warn" | "muted" }> = {
  readOnlyHint: { label: "Read-only", tone: "good" },
  destructiveHint: { label: "Destructive", tone: "warn" },
  idempotentHint: { label: "Idempotent", tone: "muted" },
  openWorldHint: { label: "Open-world", tone: "muted" },
};

function annotationBadge(key: string): { label: string; tone: "good" | "warn" | "muted" } {
  return annotationLabels[key] ?? { label: key, tone: "muted" };
}
```

- [ ] **Step 2: Show annotation badges in the tool row**

In the tools table, in the `<td>` rendering the tool name (`App.tsx` ~line 2374), replace. NOTE: the exact line `<div className="table-primary">{tool.name}</div>` appears twice — at ~2374 inside the tools table row (the correct target, immediately following a `<td>` and a `<ChevronIcon>`/canonical-name cell) and at ~3078 inside the tool-group modal's pick list (a `<button className="tool-pick-item">`, NOT a `<td>`). Edit only the one wrapped in `<td>…</td>` shown here:

```tsx
                                <td>
                                  <div className="table-primary">{tool.name}</div>
                                </td>
```

with:

```tsx
                                <td>
                                  <div className="table-primary">{tool.name}</div>
                                  {tool.annotation_keys && tool.annotation_keys.length > 0 ? (
                                    <div className="annotation-row">
                                      {tool.annotation_keys.map((key) => {
                                        const badge = annotationBadge(key);
                                        return (
                                          <span className={`annotation-badge tone-${badge.tone}`} key={key}>
                                            {badge.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </td>
```

- [ ] **Step 3: Show input preview in the tool detail panel**

In the tool detail panel, after the description `<dl className="tool-detail-meta">…</dl>` (~line 2437) and before the `<div className="tool-schema-section">` (~line 2439), insert:

```tsx
                                      {tool.input_preview ? (
                                        <p className="detail-preview">
                                          <span className="detail-preview-label">Signature</span>
                                          <code>{tool.input_preview}</code>
                                        </p>
                                      ) : null}
```

- [ ] **Step 4: Append annotation + preview CSS**

Append to `web/dashboard/src/styles.css`:

```css
.annotation-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.annotation-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 650;
  border: 1px solid transparent;
}

.annotation-badge.tone-good {
  color: var(--accent-deep);
  background: var(--accent-soft);
  border-color: rgba(15, 122, 79, 0.2);
}

.annotation-badge.tone-warn {
  color: var(--warn);
  background: rgba(139, 100, 18, 0.1);
  border-color: rgba(139, 100, 18, 0.18);
}

.annotation-badge.tone-muted {
  color: var(--muted);
  background: var(--surface-muted);
  border-color: var(--border);
}

.detail-preview {
  display: grid;
  gap: 4px;
  margin: 0 0 12px;
}

.detail-preview-label {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}
```

- [ ] **Step 5: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: in preview data, expand a tool → if `annotation_keys`/`input_preview` are present they render; if absent the row is unchanged (no empty containers).

- [ ] **Step 6: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: surface tool safety annotations and input signature preview"
```

---

## Task 10: Surface prompt arguments preview

**Files:**
- Modify: `web/dashboard/src/App.tsx` (prompt summary row description cell ~lines 2764-2768)

**Interfaces:** uses `DashboardPrompt.arguments_preview?: string` (already in `types.ts`).

- [ ] **Step 1: Show arguments_preview under the prompt description**

In the prompts table, replace the description `<td>` (`App.tsx` ~lines 2764-2768):

```tsx
                                <td>
                                  <div className="clamped-description" title={promptDescription(prompt)}>
                                    {promptDescription(prompt)}
                                  </div>
                                </td>
```

with:

```tsx
                                <td>
                                  <div className="clamped-description" title={promptDescription(prompt)}>
                                    {promptDescription(prompt)}
                                  </div>
                                  {prompt.arguments_preview ? (
                                    <code className="row-preview-code">{prompt.arguments_preview}</code>
                                  ) : null}
                                </td>
```

- [ ] **Step 2: Append row-preview CSS**

Append to `web/dashboard/src/styles.css`:

```css
.row-preview-code {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--muted-strong);
  font-size: 0.78rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Typecheck, build**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: show prompt arguments preview in prompts table"
```

---

## Task 11: Richer Resources section

**Files:**
- Modify: `web/dashboard/src/App.tsx` (resources section ~lines 2904-2946)
- Modify: `web/dashboard/src/styles.css` (reuse existing table styles; append nothing unless needed)

**Interfaces:** uses `DashboardResource.mime_type?`, `.transport?`, `.server_status?`, `.enabled` (all in `types.ts`). Reuses `healthTone` and `StatusBadge`.

- [ ] **Step 1: Add a resource filter state**

In `App.tsx`, near the other filter states (after `promptFilter`, ~line 749), add:

```tsx
  const [resourceFilter, setResourceFilter] = useState("");
```

Add a memoized filtered list near `filteredPrompts` (~line 1025):

```tsx
  const filteredResources = useMemo(() => {
    const resources = data.resources?.resources ?? [];
    if (!resourceFilter.trim()) {
      return resources;
    }
    const term = resourceFilter.toLowerCase();
    return resources.filter(
      (resource) =>
        resource.name.toLowerCase().includes(term) ||
        resource.uri.toLowerCase().includes(term) ||
        resource.server.toLowerCase().includes(term) ||
        resourceDescription(resource).toLowerCase().includes(term) ||
        (resource.mime_type ?? "").toLowerCase().includes(term),
    );
  }, [data.resources?.resources, resourceFilter]);

  const hasResourceFilter = resourceFilter.trim().length > 0;
```

- [ ] **Step 2: Replace the resources section**

Replace the resources section (`App.tsx` ~lines 2904-2946) with a filtered, status-aware table:

```tsx
            {section === "resources" && data.resources ? (
              <SectionCard
                title="Resources"
                subtitle="Discovered MCP resources"
                action={
                  <div className="toolbar-cluster">
                    <input
                      className="table-filter compact-filter"
                      onChange={(event) => setResourceFilter(event.target.value)}
                      placeholder="Search resources"
                      value={resourceFilter}
                    />
                  </div>
                }
              >
                {filteredResources.length === 0 && hasResourceFilter ? (
                  <FilterEmptyState
                    actionLabel="Clear search"
                    description="Clear the current search to show all discovered resources."
                    onClear={() => setResourceFilter("")}
                    title="No resources match"
                  />
                ) : data.resources.empty_state && data.resources.resources.length === 0 ? (
                  <EmptyStateCard emptyState={data.resources.empty_state} />
                ) : (
                  <div className="tools-table-wrap">
                    <table className="data-table compact-table resources-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>URI</th>
                          <th>Server</th>
                          <th>MIME</th>
                          <th>Status</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResources.map((resource) => (
                          <tr key={resource.uri}>
                            <td>
                              <div className="table-primary">{resource.name}</div>
                            </td>
                            <td>
                              <div className="inline-copy resource-uri-cell">
                                <code className="identifier-code" title={resource.uri}>
                                  {resource.uri}
                                </code>
                                <CopyButton
                                  ariaLabel="Copy resource URI"
                                  title="Copy resource URI"
                                  value={resource.uri}
                                />
                              </div>
                            </td>
                            <td>{resource.server}</td>
                            <td>
                              <code>{resource.mime_type || "Unknown"}</code>
                            </td>
                            <td>
                              <div className="tool-state-line">
                                <StatusBadge
                                  text={resource.enabled ? "Enabled" : "Disabled"}
                                  tone={resource.enabled ? "good" : "muted"}
                                />
                                {resource.server_status ? (
                                  <StatusBadge
                                    text={serverStatusLabel(resource.server_status)}
                                    tone={healthTone(resource.server_status)}
                                  />
                                ) : null}
                              </div>
                            </td>
                            <td>{resourceDescription(resource)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            ) : null}
```

- [ ] **Step 3: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: open Resources → search filters rows; MIME and status columns render; empty-search state shows a clear-search action.

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: add resource search, MIME, and status columns to resources view"
```

---

## Task 12: Surface diagnostics config/metrics/hints in System Info

**Files:**
- Modify: `web/dashboard/src/App.tsx` (diagnostics section ~lines 2948-2990)

**Interfaces:** uses `DashboardDiagnosticsResponse.config_source?`, `.config_path?`, `.metrics_endpoint?`, `.troubleshooting_hints: string[]` (already in `types.ts`).

- [ ] **Step 1: Extend the Runtime details list and add hints**

In the diagnostics section, replace the second `SectionCard` ("Runtime details", `App.tsx` ~lines 2967-2988) with an expanded version that adds config source/path, metrics endpoint link, and a troubleshooting-hints block:

```tsx
                <SectionCard title="Runtime details" subtitle="System information">
                  <dl className="diagnostic-list compact-diagnostic-list">
                    <div>
                      <dt>Full build</dt>
                      <dd>
                        <code>{diagnostics.version}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Global MCP Endpoint</dt>
                      <dd>
                        <code>{diagnostics.primary_endpoint}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Enabled transports</dt>
                      <dd>
                        <code>{diagnostics.enabled_transports.join(", ")}</code>
                      </dd>
                    </div>
                    {diagnostics.config_source ? (
                      <div>
                        <dt>Config source</dt>
                        <dd>
                          <code>{diagnostics.config_source}</code>
                        </dd>
                      </div>
                    ) : null}
                    {diagnostics.config_path ? (
                      <div>
                        <dt>Config path</dt>
                        <dd>
                          <div className="detail-copy-row">
                            <code className="detail-target-code">{diagnostics.config_path}</code>
                            <CopyButton
                              ariaLabel="Copy config path"
                              title="Copy config path"
                              value={diagnostics.config_path}
                            />
                          </div>
                        </dd>
                      </div>
                    ) : null}
                    {diagnostics.metrics_endpoint ? (
                      <div>
                        <dt>Metrics endpoint</dt>
                        <dd>
                          <a
                            className="diagnostic-link"
                            href={diagnostics.metrics_endpoint}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {diagnostics.metrics_endpoint}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </SectionCard>

                {diagnostics.troubleshooting_hints.length > 0 ? (
                  <SectionCard title="Troubleshooting" subtitle="Suggested checks">
                    <ul className="hint-list">
                      {diagnostics.troubleshooting_hints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  </SectionCard>
                ) : null}
```

- [ ] **Step 2: Append diagnostics-link + hint-list CSS**

Append to `web/dashboard/src/styles.css`:

```css
.diagnostic-link {
  color: var(--accent-deep);
  word-break: break-all;
}

.hint-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--muted-strong);
  line-height: 1.5;
}
```

- [ ] **Step 3: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: open System Info → config path shows a copy control; metrics endpoint (if present) is a link; troubleshooting hints render as a list when present, and the card is absent when empty.

- [ ] **Step 4: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: surface config source/path, metrics endpoint, and troubleshooting hints"
```

---

## Task 13: Mobile drawer sidebar

**Files:**
- Modify: `web/dashboard/src/components/NavSidebar.tsx` (add `open`/`onClose` props; drawer semantics)
- Modify: `web/dashboard/src/App.tsx` (menu toggle button in topbar; drawer open state; close on section select)
- Modify: `web/dashboard/src/styles.css` (drawer behavior at <=1080px; overlay)

**Interfaces:**
- Produces: `NavSidebar` gains optional props:
  ```ts
  function NavSidebar(props: {
    active: AppSection;
    onSelect: (section: AppSection) => void;
    logoUrl: string;
    counts?: Partial<Record<AppSection, number>>;
    open?: boolean;        // drawer open on mobile
    onClose?: () => void;  // called when overlay/Escape/nav-select closes the drawer
  }): JSX.Element
  ```

- [ ] **Step 1: Add drawer props and overlay to NavSidebar**

In `web/dashboard/src/components/NavSidebar.tsx`, update the signature and root markup. Change the function signature (~lines 66-76) to include `open` and `onClose`, and import `useEffect`:

```tsx
import { useEffect } from "react";
import type { AppSection } from "@/lib/types";
```

Update the component signature and add Escape handling + overlay. Replace the `export function NavSidebar({ … }) {` opening and the `<aside className="sidebar">` line through the first child:

```tsx
export function NavSidebar({
  active,
  onSelect,
  logoUrl,
  counts,
  open = false,
  onClose,
}: {
  active: AppSection;
  onSelect: (section: AppSection) => void;
  logoUrl: string;
  counts?: Partial<Record<AppSection, number>>;
  open?: boolean;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!open || !onClose) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open ? <div className="sidebar-overlay" onClick={onClose} role="presentation" /> : null}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
```

Update the nav button's `onClick` to also close the drawer (~line 93):

```tsx
            onClick={() => {
              onSelect(item.key);
              onClose?.();
            }}
```

Close the fragment: change the final `</aside>` (~line 156) to:

```tsx
      </aside>
    </>
  );
```

- [ ] **Step 2: Add a menu toggle and drawer state in App.tsx**

In `App.tsx`, add state near the other UI state (after the `registerTitleId`/`toolGroupTitleId` consts from Task 4):

```tsx
  const [navOpen, setNavOpen] = useState(false);
```

Update the `<NavSidebar … />` render (~line 1537) to pass drawer props:

```tsx
      <NavSidebar
        active={section}
        counts={navCounts}
        logoUrl={logoUrl}
        onClose={() => setNavOpen(false)}
        onSelect={setSection}
        open={navOpen}
      />
```

Add a menu toggle button as the first child inside `<header className="topbar">` (~line 1539), before the existing `<div>`:

```tsx
          <button
            aria-controls="main-content"
            aria-expanded={navOpen}
            aria-label="Open navigation menu"
            className="nav-toggle icon-button"
            onClick={() => setNavOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
              <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
            </svg>
          </button>
```

- [ ] **Step 3: Add drawer CSS**

Append to `web/dashboard/src/styles.css`:

```css
.nav-toggle {
  display: none;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 1080px) {
  .nav-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-soft);
  }

  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 60;
    width: min(280px, 86vw);
    height: 100vh;
    transform: translateX(-105%);
    transition: transform 200ms ease;
    border-right: 1px solid var(--border);
    border-bottom: 0;
    overflow-y: auto;
  }

  .sidebar.is-open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(9, 21, 28, 0.4);
    backdrop-filter: blur(2px);
  }

  .nav-list {
    grid-template-columns: 1fr;
  }

  .sidebar-actions {
    grid-template-columns: 1fr;
  }
}
```

Note: the existing `@media (max-width: 1080px)` block (~line 2157) already sets `.sidebar` to static and reshapes `.nav-list`/`.sidebar-actions` into grids. This new block is appended AFTER it, so these rules win by source order. Verify visually that the drawer (not the old static stacked nav) is what renders at ≤1080px.

- [ ] **Step 4: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors.
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: shrink viewport ≤1080px → hamburger appears in the topbar; clicking opens the drawer; overlay click, Escape, and selecting a section all close it; focus styles visible; on wide screens the sidebar is the normal static column and the toggle is hidden.

- [ ] **Step 5: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/components/NavSidebar.tsx web/dashboard/src/App.tsx web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: convert sidebar to an accessible drawer on small screens"
```

---

## Task 14: Tools & prompts table→card responsive transform

**Files:**
- Modify: `web/dashboard/src/styles.css` (extend the `<=720px` block with tools/prompts card rules mirroring the marketplace pattern at ~lines 2311-2389)

**Interfaces:** none new. Purely CSS, mirroring the existing `.marketplace-table` mobile pattern.

The tools table columns are: `(expand) | Tool | Canonical name | Server | Description | Status | Actions` (7 columns, indices 1–7). The prompts table has the same 7-column shape. The labels for columns 3–6 are "Canonical name", "Server", "Description", "Status".

- [ ] **Step 1: Append tools/prompts mobile card CSS**

Append to `web/dashboard/src/styles.css`:

```css
@media (max-width: 720px) {
  .tools-table,
  .tools-table tbody,
  .tools-table tr,
  .tools-table td,
  .prompts-table,
  .prompts-table tbody,
  .prompts-table tr,
  .prompts-table td {
    display: block;
    width: 100%;
  }

  .tools-table thead,
  .prompts-table thead {
    display: none;
  }

  .tools-table .tool-summary-row,
  .prompts-table .tool-summary-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 7px 10px;
    padding: 12px;
    border-top: 1px solid var(--border);
  }

  .tools-table .tool-summary-row:first-child,
  .prompts-table .tool-summary-row:first-child {
    border-top: 0;
  }

  .tools-table .tool-summary-row td,
  .prompts-table .tool-summary-row td {
    grid-column: 2;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .tools-table .tool-summary-row td:first-child,
  .prompts-table .tool-summary-row td:first-child {
    grid-column: 1;
    grid-row: 1 / span 6;
    padding-top: 2px;
  }

  .tools-table .tool-summary-row td:nth-child(3)::before,
  .tools-table .tool-summary-row td:nth-child(4)::before,
  .tools-table .tool-summary-row td:nth-child(6)::before,
  .prompts-table .tool-summary-row td:nth-child(3)::before,
  .prompts-table .tool-summary-row td:nth-child(4)::before,
  .prompts-table .tool-summary-row td:nth-child(6)::before {
    display: block;
    margin-bottom: 2px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 700;
  }

  .tools-table .tool-summary-row td:nth-child(3)::before,
  .prompts-table .tool-summary-row td:nth-child(3)::before {
    content: "Canonical name";
  }

  .tools-table .tool-summary-row td:nth-child(4)::before,
  .prompts-table .tool-summary-row td:nth-child(4)::before {
    content: "Server";
  }

  .tools-table .tool-summary-row td:nth-child(6)::before,
  .prompts-table .tool-summary-row td:nth-child(6)::before {
    content: "Status";
  }

  .tools-table .tool-summary-row .row-actions,
  .prompts-table .tool-summary-row .row-actions {
    margin-top: 4px;
  }

  .tools-table .tool-expanded-row,
  .tools-table .tool-expanded-cell,
  .prompts-table .tool-expanded-row,
  .prompts-table .tool-expanded-cell {
    display: block;
    width: 100%;
  }

  .tools-table .tool-expanded-cell,
  .prompts-table .tool-expanded-cell {
    border-left: 0;
    border-right: 0;
    border-radius: 0;
  }
}
```

- [ ] **Step 2: Typecheck, build, manual check**

Run: `npm --prefix web/dashboard run typecheck` → 0 errors (CSS-only, but run for consistency).
Run: `npm --prefix web/dashboard run build` → succeeds.
Manual: at ≤720px, the Tools and Prompts tables render as stacked cards with labeled fields (like the marketplace table); the expand chevron stays in its own column; the expanded detail spans full width.

- [ ] **Step 3: Commit**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add web/dashboard/src/styles.css
git -C /Users/andrewws/GitHub/MCPJungle commit -m "feat: render tools and prompts tables as cards on small screens"
```

---

## Task 15: Re-embed assets and final verification

**Files:**
- Modify: `internal/dashboardui/dist/**` (regenerated by the build script)

**Interfaces:** none.

- [ ] **Step 1: Rebuild and re-embed the dashboard**

Run: `scripts/build-dashboard.sh`
Expected: runs `npm run build` in `web/dashboard`, then copies `web/dashboard/dist` to `internal/dashboardui/dist`. (If `node_modules` is absent it runs `npm ci` first.)

- [ ] **Step 2: Confirm embedded assets changed**

Run: `git -C /Users/andrewws/GitHub/MCPJungle status --short internal/dashboardui/dist`
Expected: shows modified/added asset files (new hashed `assets/index-*.js` / `index-*.css`, updated `index.html`).

- [ ] **Step 3: Run the Go test suite as a guard**

Run: `go -C /Users/andrewws/GitHub/MCPJungle test ./...`
Expected: PASS (no Go code changed; the embed still compiles). e2e tests requiring `npx` may skip — that is acceptable.

- [ ] **Step 4: Full keyboard accessibility pass (manual)**

Start the server (`go -C /Users/andrewws/GitHub/MCPJungle run . start`), open `http://localhost:8080`, and verify keyboard-only:
- Tab reveals the skip link; it jumps to content.
- Each modal (Add Server, Add Tool Group, Confirm delete) traps focus, closes on Escape, and restores focus to its trigger.
- Active nav item exposes `aria-current="page"`.
- Drawer (narrow viewport) opens/closes via keyboard and overlay.
- `prefers-reduced-motion: reduce` suppresses shimmer/transitions.

- [ ] **Step 5: Commit the embedded assets**

```bash
git -C /Users/andrewws/GitHub/MCPJungle add internal/dashboardui/dist
git -C /Users/andrewws/GitHub/MCPJungle commit -m "build: re-embed dashboard assets with UI/usability improvements"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (shared primitives) → Tasks 1 (Dialog), 2 (ConfirmDialog), 3 (Announcer). Inline icons added where needed (Tasks 7, 13). ✓
- Section 2 (a11y/interaction) → Tasks 2 (confirm), 4 (modal focus), 5 (aria-current/skip/aria-busy), 6 (skeleton), 7 (dismiss + live region). ✓
- Section 3 (visual polish) → Tasks 6 (skeleton), 8 (StatusBadge tones/dot + chevron transition), reduced-motion (Task 1). ✓
- Section 4 (hidden data) → Tasks 9 (tool annotations/preview), 10 (prompt preview), 11 (resources), 12 (diagnostics). ✓
- Section 5 (mobile) → Tasks 13 (drawer), 14 (table→card). ✓
- Testing/verification + re-embed → Task 15. ✓
- `namespaced_examples` correctly excluded (not in TS contract). ✓

**Placeholder scan:** The only "placeholder" text is inside Task 3 Step 1, which explicitly instructs to replace it with the real file content shown immediately below — left intentionally to flag the two-import gotcha. No TODO/TBD/"add error handling"/"similar to Task N" remain; every code step shows complete code.

**Type consistency:** `StatusTone` ("good"|"warn"|"bad"|"muted") defined in Task 8 matches the tones produced by `healthTone`/`marketplace*Tone` helpers used at all `StatusBadge` call sites. `ConfirmState` (Task 2) is consumed only by the Task 2 render block. `NavSidebar` prop additions (Task 13) are optional, so earlier call sites stay valid until updated in the same task. `Dialog` props (`open`, `onClose`, `titleId`) are used identically in Tasks 2 and 4.
