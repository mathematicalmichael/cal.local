// Data schema for vtcal.
//
// SCHEMA_VERSION is bumped whenever the shape of stored data changes.
// Every past shape must have a migration step in MIGRATIONS that upgrades
// it to the next version. `load()` in storage.js walks the chain from
// whatever version is on disk up to CURRENT, so old exports always load.

export const SCHEMA_VERSION = 1;

// dayOfWeek: 0=Sun .. 6=Sat, matches Date#getDay().
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    businesses: [],
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
    category: "",
    address: "",
    phone: "",
    website: "",
    notes: "",
    color: pickColor(),
    hours: [], // { id, dayOfWeek, start:"HH:MM", end:"HH:MM", label }
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
    label: "",
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
  // Example shape for the future:
  // 1: (doc) => ({ ...doc, schemaVersion: 2, businesses: doc.businesses.map(b => ({...b, newField: "" })) }),
};

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
    hours: (b.hours || []).map((h) => ({ ...newHourBlock(), ...h })),
    exceptions: (b.exceptions || []).map((e) => ({
      id: e.id || newId(),
      date: e.date || "",
      closed: !!e.closed,
      start: e.start || "",
      end: e.end || "",
      note: e.note || "",
    })),
  }));
  d.meta = { ...emptyState().meta, ...(doc.meta || {}) };
  return d;
}
