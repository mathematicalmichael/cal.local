import { emptyState, migrate, nowIso, SCHEMA_VERSION } from "./schema.js";

const KEY = "cal.local.state.v1";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.error("cal.local: failed to load state, starting fresh", err);
    return emptyState();
  }
}

export function save(state) {
  state.meta.updatedAt = nowIso();
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportJson(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `cal-local-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can race with the browser's async download start
  // and produce a broken/empty download with a mangled filename — give it
  // a moment first.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function importJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(migrate(parsed));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;
