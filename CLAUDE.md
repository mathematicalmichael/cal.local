# CLAUDE.md

Guidance for future Claude Code (or human) sessions working on this repo.

## What this is

A static, buildless single-page app for tracking the weekly hours of stores
and businesses the user frequents, presented as an ical-like draggable week
grid plus a searchable list. All persistence is client-side `localStorage`
with JSON export/import. Deployed to GitHub Pages via GitHub Actions.

There is intentionally **no build step, no framework, no package.json**.
Don't introduce one (bundler, React, TypeScript compile step, etc.) unless
the user explicitly asks — the whole point is that `index.html` + a handful
of ES modules is enough, and it keeps `make run` instant.

## Stack conventions for this repo

- Plain HTML/CSS/JS (ES modules, no transpile). If a task genuinely needs
  a TS toolchain or extra tooling later, prefer **bun**; pnpm is acceptable.
  Python tooling (if ever needed, e.g. a data migration script) should use
  **uv**, not pip/venv directly.
- Local dev: `make run` (default target). It shells out to `bunx serve` if
  `bun` is present, else falls back to `python3 -m http.server`. Keep this
  working with zero installed dependencies — that's the point.
- Deploy: `.github/workflows/pages.yml` uploads the repo root as a Pages
  artifact on push to `main`. If you add files that shouldn't ship (drafts,
  scratch notes), keep them out of the repo root or add a `.github` step to
  exclude them — don't assume anything is filtered by default.

## Data model (`js/schema.js`)

Top-level document:

```js
{
  schemaVersion: 1,
  businesses: [
    {
      id, name, category, address, phone, website,
      notes,           // free text
      color,           // hex, used to tint week-view blocks
      hours: [
        { id, dayOfWeek /* 0=Sun..6=Sat */, start /* "HH:MM" */, end, label }
      ],
      exceptions: [
        { id, date /* "YYYY-MM-DD" */, closed, start, end, note }
      ],
      createdAt, updatedAt,
    },
  ],
  meta: { createdAt, updatedAt },
}
```

Design choices worth preserving:

- **Hours are recurring weekly blocks keyed by `dayOfWeek`**, not dated
  calendar events. That's the correct model for "what time does this store
  open on Tuesdays" — don't refactor this into per-date events unless the
  feature request genuinely needs arbitrary one-off events (in which case,
  add it as a new capability alongside `hours`/`exceptions`, don't replace
  them).
- **`exceptions` is the escape hatch for one-off overrides** (holiday hours,
  temporary closures) without touching the regular weekly `hours`. `isOpenAt`
  in `js/time.js` checks exceptions first, then falls back to `hours`.
- **Overnight blocks** (e.g. `22:00`–`02:00`) are supported by `spans()` in
  `time.js` treating `end <= start` as wrapping past midnight. Keep that
  convention if you touch time math.
- IDs are UUIDs (`crypto.randomUUID`, with a fallback). Never reuse array
  index as an identity — the drag/resize code and edit modal both key off
  `id`, not position.

## Backward compatibility / schema evolution

This is the part to get right when the user asks for new fields or a
reshaped model:

1. **Bump `SCHEMA_VERSION`** in `js/schema.js` when the *shape* of stored
   data changes (new required field, renamed field, restructured array,
   etc.). Purely additive optional fields with sensible defaults in
   `normalize()` often don't need a version bump — but when in doubt, bump.
2. **Add a migration function** to the `MIGRATIONS` map, keyed by the
   version it upgrades *from*: `MIGRATIONS[1] = (doc) => ({ ...doc,
   schemaVersion: 2, ... })`. Never delete or rewrite old migration entries
   — the chain must be able to walk an ancient export all the way to
   current.
3. **`migrate()`** in `schema.js` walks the chain from whatever version is
   found (including `0`/undefined for pre-versioned data) up to
   `SCHEMA_VERSION`, then runs `normalize()`.
4. **`normalize()`** is the defensive layer: it fills in any missing fields
   with defaults so hand-edited JSON, partial exports, or fields from a
   *newer* version of the app than the one running never crash the UI. When
   you add a field, add its default here too, not just in `newBusiness()`.
5. Both `storage.load()` (reading from `localStorage`) and
   `storage.importJson()` (reading an uploaded file) route through
   `migrate()`. Do not add a second code path that reads state without
   migrating — that's how bwd-compat silently breaks.
6. `localStorage` key (`vtcal.state.v1` in `storage.js`) is **not** the same
   thing as `schemaVersion` and should generally stay stable across schema
   versions — the migration chain handles shape changes, not the storage
   key. Only change the storage key if you deliberately want to reset
   everyone's local data (rare, and worth flagging to the user first).

When asked to add a feature, prefer extending the schema (new optional
fields, new arrays) over repurposing existing fields, and always write the
migration + normalize-default pair together, even if it feels like
overkill for a one-person tool — that's the whole ask here.

## UI architecture

- `js/time.js` — pure helpers (no DOM): time math, "open now" logic, day
  names. Keep this DOM-free so it stays easily testable if tests are added.
- `js/week-view.js` — renders the draggable grid. Blocks are absolutely
  positioned by percentage-of-day inside each day column; dragging/resizing
  works in minutes snapped to 15-minute increments (`SNAP` constant).
  Creating a new block on empty grid space calls back into `app.js`, which
  currently uses a `prompt()`-based picker when more than one business
  exists — that's a deliberate low-ceremony choice, not an oversight; feel
  free to replace with a nicer picker UI if asked, but don't reintroduce a
  build step to do it.
- `js/list-view.js` — search + "open now" filtering, pure client-side
  string matching over name/category/notes/address.
- `js/modal.js` — single add/edit modal for a business, including its
  nested hours-block editor (add/remove rows, per-row day/start/end/label).
- `js/app.js` — composition root: wires storage, the two views, and the
  modal together; owns the single in-memory `state` object and the
  `persist()` function that saves + re-renders both views.

## Testing changes

No test suite yet (small buildless app). At minimum, after any change:
`make run`, open the page, and click through: add a business, drag-create
an hours block, drag to move/resize it, edit it via the list view, search,
toggle "open now", export JSON, then import it back. Check both portrait
and landscape on a narrow viewport (devtools device mode) since mobile/PWA
use is a first-class goal.
