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
  schemaVersion: 3,
  businesses: [
    {
      id, name, address, phone, website,
      categories,      // string[], keys from schema.js CATEGORIES; multi-select, required (>=1)
      notes,           // free text
      color,           // hex, used to tint week/day-view blocks
      hours: [
        { id, dayOfWeek /* 0=Sun..6=Sat */, start /* "HH:MM" */, end, label }
      ],
      exceptions: [
        { id, date /* "YYYY-MM-DD" */, closed, start, end, note }
      ],
      createdAt, updatedAt,
    },
  ],
  categoryFilters: { [categoryKey]: boolean },  // the one visibility control, shared by week/day/list views
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
- **`categories` is a fixed vocabulary** (`schema.js` `CATEGORIES`, includes
  an "Other" catch-all), not free text — a business can hold several, and
  the modal *requires at least one* (enforced in `modal.js`'s save handler)
  so a business can never end up orphaned from the one visibility control
  that exists. Adding a new category to the list is additive and safe;
  renaming or removing an existing `key` breaks every business already
  tagged with it and needs a migration to remap. The old free-text
  `category` field is still present on migrated businesses (unused by the
  UI, kept only so old data isn't silently destroyed) — don't resurrect it
  as a second source of truth.
- **`categoryFilters` is the single, shared visibility control** across
  week/day/list views — see `app.js`'s `isBizVisible()`. A business with no
  categories is always visible (the filter doesn't apply to it); otherwise
  it's visible if at least one of its categories is enabled in
  `categoryFilters`. There used to also be a per-business `visible` toggle
  (a second, finer layer) — it was removed in favor of just categories
  being the one control, since two overlapping visibility mechanisms was
  more confusing than useful. Don't reintroduce a per-business toggle
  without a specific reason; if you do, keep `categoryFilters` as the
  higher-precedence layer, matching the isolate/double-click behavior in
  `legend.js`.
- **Speculative businesses created by dragging on the grid** (see
  `app.js`'s `onCreateBlock`/`openBusinessPicker`) get pushed into `state`
  *before* the edit modal opens, so the new hours block has something to
  attach to. If the user then cancels that modal without saving,
  `modal.js`'s `cancel()` deletes that speculative business again — this is
  what keeps the "at least one category" rule from being trivially bypassed
  by drag-create-then-cancel. If you add another path that creates a
  business before the modal confirms it, give it the same rollback-on-
  cancel treatment.

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
6. `localStorage` key (`cal.local.state.v1` in `storage.js`) is **not** the same
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
- `js/grid-common.js` — shared building blocks used by both grid views:
  overlap-aware column layout (`layoutOverlaps`), block rendering/drag/
  resize, the create-by-drag interaction, and the hour gutter. Overlapping
  blocks get their own side-by-side column instead of stacking full-width —
  a wide block used to fully cover narrower ones underneath, making them
  unclickable. If you touch drag/resize math, fix it here once, not in both
  view modules.
- `js/week-view.js` — the 7-day grid. A single CSS grid with an explicit
  header row (corner + day names) and body row (time gutter + day columns);
  the two-row structure is what keeps 12am from being clipped under the
  sticky header — don't collapse it back into per-column sticky headers.
  Creating a new block on empty grid space calls back into `app.js`, which
  currently uses a `prompt()`-based picker when more than one business
  exists — deliberate low-ceremony choice, not an oversight. A dragged
  selection defaults to *every* day of the week (`app.js`'s
  `addBlockAllDays`) since removing days you don't want is easier than
  adding six more one at a time.
- `js/day-view.js` — one weekday at a time, full width, with prev/next
  arrows, a "jump to today" label, and touch-swipe. Exists because the week
  view's side-by-side columns still get unreadably narrow once several
  businesses are open most of the day — the day view trades breadth for
  width. Shares all interaction logic with week-view.js via
  `grid-common.js`; don't fork it.
- `js/legend.js` — the category-filter bar. Shown above all three views
  (week/day/list) — it isn't nested inside one view's markup, so wiring a
  new view in later just means putting `#legend` above it too. Click to
  toggle, double-click to isolate one category.
- `js/list-view.js` — search + "open now" + the same category filter as
  the grid views, pure client-side string matching over
  name/categories/notes/address.
- `js/modal.js` — single add/edit modal for a business, including its
  required category multi-select chips (save is blocked with an inline
  error until at least one is picked — see the schema section above for
  why) and nested hours-block editor (add/remove rows, per-row
  day/start/end/label). "+ Add block" copies the *previous* row's
  start/end/label and advances to the next day of week, rather than
  repeating a generic default — faster for entering a run of similar days.
- `js/app.js` — composition root: wires storage, the three views, the
  legend, and the modal together; owns the single in-memory `state` object,
  `isBizVisible()` (the two-layer visibility check), and the `persist()`
  function that saves + re-renders every view.

## Testing changes

No test suite yet (small buildless app). At minimum, after any change:
`make run`, open the page, and click through: add a business, drag-create
an hours block, drag to move/resize it, edit it via the list view, search,
toggle "open now", export JSON, then import it back. Check both portrait
and landscape on a narrow viewport (devtools device mode) since mobile/PWA
use is a first-class goal.
