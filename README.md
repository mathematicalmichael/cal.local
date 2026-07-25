# vtcal

A personal ledger of store/business hours: a draggable weekly grid (ical-style)
plus a searchable list view, kept entirely in your browser's `localStorage`.
No backend, no build step — just HTML, CSS, and vanilla JS ES modules,
published via GitHub Pages.

## Features

- **Week view** — a 7-day grid of recurring weekly hours. Click-drag on empty
  space to create a new hours block; drag a block to move it; drag its top/
  bottom edge to resize; click a block to edit the business it belongs to.
- **List view** — every business as a card with its weekly hours spelled out,
  a search box (name / category / notes / address), and an "Open now" filter.
- **Per-business notes** — free-text notes field (parking tips, favorite
  order, entrance to use, etc.) alongside name, category, address, phone,
  website, and a color used to tint its blocks.
- **Date exceptions** — a business can carry dated overrides (holiday hours,
  closures) that take precedence over its regular weekly schedule when
  computing "open now".
- **Export / Import JSON** — your whole dataset as one JSON file, for backup
  or moving between devices. Import always runs through the same schema
  migration path as normal load, so old exports keep working.
- **Installable** — a web app manifest + tiny offline service worker let you
  "Add to Home Screen" on iOS/Android and use it like a standalone app.
  Works in both portrait and landscape on phones.

## Running locally

```sh
make          # same as `make run`
```

This serves the current directory over HTTP (via `bunx serve` if `bun` is
installed, otherwise Python's stdlib `http.server`) — no install step,
no bundler. Open the printed `localhost` URL.

## Data & schema

All state lives in `localStorage` under one key, as a single JSON document
with a `schemaVersion` field. See [`CLAUDE.md`](./CLAUDE.md) for the full
schema shape and the migration convention to follow when it needs to change.

Use **Export JSON** any time you want a backup file; **Import JSON** replaces
current data with an uploaded export (you'll be asked to confirm since it's
destructive to whatever is currently loaded).

## Deployment

`.github/workflows/pages.yml` deploys the repo root to GitHub Pages on every
push to `main` via `actions/upload-pages-artifact` + `actions/deploy-pages`.
In the repo's Settings → Pages, set the source to "GitHub Actions" once.

## Project layout

```
index.html              shell + toolbar markup
styles.css              all styling (single stylesheet, CSS variables, no build)
manifest.webmanifest    PWA manifest for "add to home screen"
sw.js                   minimal offline-cache service worker
icons/icon.svg          app icon
js/
  schema.js             data shapes, defaults, migration chain
  storage.js            localStorage load/save + JSON export/import
  time.js               day/time helpers, "is open now" logic
  week-view.js           draggable weekly grid renderer
  list-view.js          searchable/filterable list renderer
  modal.js              business add/edit modal (incl. hours editor)
  app.js                wires everything together
.github/workflows/pages.yml   GitHub Pages deploy workflow
Makefile                `make run` for local dev
```
