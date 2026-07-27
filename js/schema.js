// Data schema for cal.local.
//
// SCHEMA_VERSION is bumped whenever the shape of stored data changes.
// Every past shape must have a migration step in MIGRATIONS that upgrades
// it to the next version. `load()` in storage.js walks the chain from
// whatever version is on disk up to CURRENT, so old exports always load.

export const SCHEMA_VERSION = 4;

// Fixed category vocabulary — a business can belong to several. Adding a
// category here is additive (no version bump needed); renaming or removing
// one is a breaking change to existing categorized businesses and needs a
// migration to remap or drop the old key.
export const CATEGORIES = [
  { key: "food", label: "Food" },
  { key: "grocery", label: "Grocery" },
  { key: "shopping", label: "Shopping" },
  { key: "hardware", label: "Hardware" },
  { key: "administrative", label: "Administrative" },
  { key: "health", label: "Health" },
  { key: "auto", label: "Auto" },
  { key: "services", label: "Services" },
  { key: "government", label: "Government" },
  { key: "personal-care", label: "Personal Care" },
  { key: "other", label: "Other" },
];
const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

export function defaultCategoryFilters() {
  const f = {};
  CATEGORIES.forEach((c) => { f[c.key] = true; });
  return f;
}

// dayOfWeek: 0=Sun .. 6=Sat, matches Date#getDay().
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    businesses: [],
    categoryFilters: defaultCategoryFilters(),
    meta: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newBusiness(partial = {}) {
  return {
    id: newId(),
    name: "",
    categories: [], // keys from CATEGORIES; a business can belong to several
    address: "",
    phone: "",
    website: "",
    notes: "",
    color: pickColor(),
    hours: [], // { id, dayOfWeek, start:"HH:MM", end:"HH:MM" }
    exceptions: [], // { id, date:"YYYY-MM-DD", closed, start, end, note }
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...partial,
  };
}

export function newHourBlock(partial = {}) {
  return {
    id: newId(),
    dayOfWeek: 1,
    start: "09:00",
    end: "17:00",
    ...partial,
  };
}

// A dated override of the weekly hours — holiday closure, one-off early
// close. `closed: true` wins outright; otherwise start/end replace that day's
// regular blocks. An exception with neither falls through to `hours` (see
// activeBlockAt in time.js), so "closed" is the useful default.
export function newException(partial = {}) {
  return {
    id: newId(),
    date: "",
    closed: true,
    start: "",
    end: "",
    note: "",
    ...partial,
  };
}

const PALETTE = [
  "#c65d3b", "#3b6e63", "#a3852f", "#5c6bc0",
  "#8a4f7d", "#2f7a4f", "#b2482e", "#456990",
];
let colorCursor = 0;
function pickColor() {
  const c = PALETTE[colorCursor % PALETTE.length];
  colorCursor++;
  return c;
}

// Migration chain. MIGRATIONS[v] upgrades a document FROM version v TO v+1.
// Add new entries here as SCHEMA_VERSION increases; never remove old ones.
export const MIGRATIONS = {
  // v1 -> v2: added a per-business `visible` toggle for the week-view legend
  // (a business with many always-open hours can be hidden from the grid
  // without deleting its data). normalize() would default this anyway, but
  // the migration entry documents the version bump explicitly.
  1: (doc) => ({
    ...doc,
    schemaVersion: 2,
    businesses: (doc.businesses || []).map((b) => ({ ...b, visible: b.visible !== false })),
  }),
  // v2 -> v3: free-text `category` became a fixed, multi-select `categories`
  // list, plus a top-level `categoryFilters` layer that can hide a whole
  // category's businesses at once. The old `category` string is left in
  // place on each business — unused by the UI now, but not deleted, in case
  // a future version wants it back for a "custom category" fallback. (The
  // per-business `visible` toggle added in v2 was later removed from the UI
  // entirely — category filtering replaced it — but any lingering `visible`
  // key on old documents is harmless and left alone.)
  2: (doc) => ({
    ...doc,
    schemaVersion: 3,
    categoryFilters: defaultCategoryFilters(),
    businesses: (doc.businesses || []).map((b) => ({ ...b, categories: guessCategories(b.category) })),
  }),
  // v3 -> v4: dropped the per-hour-block `label`. Nothing ever rendered it,
  // so it was write-only clutter. Unlike the v2/v3 fields, this one is
  // actually deleted rather than left in place — it carried no information
  // the UI could surface, and leaving it would keep it in every export.
  3: (doc) => ({
    ...doc,
    schemaVersion: 4,
    businesses: (doc.businesses || []).map((b) => ({
      ...b,
      hours: (b.hours || []).map(({ label, ...rest }) => rest),
    })),
  }),
};

function guessCategories(legacyCategory) {
  if (!legacyCategory) return [];
  const needle = String(legacyCategory).trim().toLowerCase();
  const match = CATEGORIES.find((c) => c.key === needle || c.label.toLowerCase() === needle);
  return match ? [match.key] : [];
}

export function migrate(doc) {
  let d = doc;
  let v = d.schemaVersion || 0;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) {
      // No migration defined but versions differ: assume forward-compatible
      // shape and just stamp the current version rather than losing data.
      d = { ...d, schemaVersion: SCHEMA_VERSION };
      break;
    }
    d = step(d);
    v = d.schemaVersion;
  }
  return normalize(d);
}

// Defensive normalization so partially-missing fields (hand-edited JSON,
// older exports, future fields we don't know about yet) never crash the UI.
export function normalize(doc) {
  const d = { ...emptyState(), ...doc };
  d.schemaVersion = SCHEMA_VERSION;
  d.businesses = (doc.businesses || []).map((b) => ({
    ...newBusiness(),
    ...b,
    // Spreading `b` can put a null/number/missing name over the default, and
    // the list view sorts on name.localeCompare — so coerce here rather than
    // defending at every read site. Matches modal.js's "Untitled" fallback.
    name: typeof b.name === "string" && b.name.trim() ? b.name : "Untitled",
    categories: Array.isArray(b.categories) ? b.categories.filter((c) => CATEGORY_KEYS.has(c)) : [],
    // Strip `label` here too, not just in the migration: a hand-edited file or
    // an older export re-imported later would otherwise put it back, and it
    // would then ride along in every subsequent export.
    hours: (b.hours || []).map(({ label, ...h }) => ({ ...newHourBlock(), ...h })),
    exceptions: (b.exceptions || []).map((e) => ({
      id: e.id || newId(),
      date: e.date || "",
      closed: !!e.closed,
      start: e.start || "",
      end: e.end || "",
      note: e.note || "",
    })),
  }));
  d.categoryFilters = { ...defaultCategoryFilters(), ...(doc.categoryFilters || {}) };
  d.meta = { ...emptyState().meta, ...(doc.meta || {}) };
  return d;
}
