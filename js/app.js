import { load, save, exportJson, importJson } from "./storage.js";
import { newBusiness, newHourBlock, normalize } from "./schema.js";
import { createWeekView } from "./week-view.js";
import { createDayView } from "./day-view.js";
import { createListView } from "./list-view.js";
import { createBizModal } from "./modal.js";
import { createLegend } from "./legend.js";
import { createImportModal } from "./import-modal.js";

let state = load();

const weekRoot = document.querySelector("#week-view");
const weekGridRoot = document.querySelector("#week-grid-root");
const dayRoot = document.querySelector("#day-view");
const legendRoot = document.querySelector("#legend");
const listRoot = document.querySelector("#list-view");
const modalRoot = document.querySelector("#modal-root");
const importModal = createImportModal(document.querySelector("#import-modal-root"));

const legend = createLegend(legendRoot, {
  getState: () => state,
  onToggleCategory: (key, forceValue) => {
    if (key === "__all__") {
      Object.keys(state.categoryFilters).forEach((k) => { state.categoryFilters[k] = forceValue; });
    } else {
      state.categoryFilters[key] = !(state.categoryFilters[key] !== false);
    }
    persist();
  },
  onIsolateCategory: (key) => {
    Object.keys(state.categoryFilters).forEach((k) => { state.categoryFilters[k] = k === key; });
    persist();
  },
});

// The category filter is the only visibility control now — a business with
// no categories isn't affected by it at all (shows everywhere).
function isBizVisible(biz) {
  if (!biz.categories.length) return true;
  return biz.categories.some((k) => state.categoryFilters[k] !== false);
}

// Shared by both the week grid and the day grid — same underlying data,
// just different amounts of horizontal room per day.
const gridHandlers = {
  getState: () => state,
  isVisible: isBizVisible,
  onCreateBlock: (dow, start, end) => {
    if (!state.businesses.length) {
      const biz = newBusiness({ name: "New business" });
      addBlockAllDays(biz, start, end);
      state.businesses.push(biz);
      persist();
      const focusHour = biz.hours.find((h) => h.dayOfWeek === dow) || biz.hours[0];
      modal.open(biz, { asNew: true, focusHourId: focusHour.id });
      return;
    }
    openBusinessPicker(dow, start, end);
  },
  onUpdateBlock: (bizId, hourId, patch) => {
    const biz = state.businesses.find((b) => b.id === bizId);
    const hour = biz?.hours.find((h) => h.id === hourId);
    if (!hour) return;
    Object.assign(hour, patch);
    persist();
  },
  onEditBlock: (bizId, hourId) => {
    const biz = state.businesses.find((b) => b.id === bizId);
    if (biz) modal.open(biz, { focusHourId: hourId });
  },
};

const weekView = createWeekView(weekGridRoot, gridHandlers);
const dayView = createDayView(dayRoot, gridHandlers);

const listView = createListView(listRoot, {
  getState: () => state,
  isVisible: isBizVisible,
  onEdit: (bizId) => {
    const biz = state.businesses.find((b) => b.id === bizId);
    if (biz) modal.open(biz);
  },
});

const modal = createBizModal(modalRoot, {
  onSave: (biz, isNew) => {
    const idx = state.businesses.findIndex((b) => b.id === biz.id);
    if (idx === -1) state.businesses.push(biz);
    else state.businesses[idx] = biz;
    persist();
  },
  onDelete: (bizId) => {
    state.businesses = state.businesses.filter((b) => b.id !== bizId);
    persist();
  },
});

// A dragged selection defaults to every day of the week — it's easier to
// remove the days that don't apply than to add six more one at a time.
function addBlockAllDays(biz, start, end) {
  for (let d = 0; d < 7; d++) {
    biz.hours.push(newHourBlock({ dayOfWeek: d, start, end }));
  }
}

function persist() {
  save(state);
  weekView.render();
  dayView.render();
  listView.render();
  legend.render();
}

function openBusinessPicker(dow, start, end) {
  const names = state.businesses.map((b, i) => `${i + 1}. ${b.name || "Untitled"}`).join("\n");
  const answer = prompt(
    `Add this time block to which business?\n${names}\n\nEnter a number, or type a new business name:`
  );
  if (answer == null || answer.trim() === "") return;
  const trimmed = answer.trim();
  const idx = Number(trimmed);
  let biz;
  if (Number.isInteger(idx) && idx >= 1 && idx <= state.businesses.length) {
    biz = state.businesses[idx - 1];
    addBlockAllDays(biz, start, end);
    persist();
  } else {
    biz = newBusiness({ name: trimmed });
    addBlockAllDays(biz, start, end);
    state.businesses.push(biz);
    persist();
    modal.open(biz, { asNew: true });
    return;
  }
}

// --- Toolbar: add / export / import / view switch ---

document.querySelector("#add-business").addEventListener("click", () => {
  const biz = newBusiness();
  modal.open(biz, { asNew: true });
});

document.querySelector("#export-json").addEventListener("click", () => exportJson(state));

const importInput = document.querySelector("#import-json");
document.querySelector("#import-trigger").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const imported = await importJson(file);
    // The modal resolves with the document to adopt (a merge result, or the
    // file itself in replace mode), or null if cancelled. normalize() again
    // because a merge stitches two documents together.
    const next = await importModal.open(state, imported);
    if (next) {
      state = normalize(next);
      persist();
    }
  } catch (err) {
    alert("Could not read that file as cal.local JSON.");
    console.error(err);
  } finally {
    importInput.value = "";
  }
});

const VIEW_KEY = "cal.local.view";
const VALID_VIEWS = ["week", "day", "list"];

const tabs = [...document.querySelectorAll(".view-tab")];

function setView(view) {
  localStorage.setItem(VIEW_KEY, view);
  tabs.forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", String(active));
  });
  weekRoot.hidden = view !== "week";
  dayRoot.hidden = view !== "day";
  listRoot.hidden = view !== "list";
  if (view === "week") weekView.render();
  if (view === "day") dayView.render();
  if (view === "list") listView.render();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

// List is the default for a first visit — it's the view that answers "is this
// place open right now" without any panning, and it reads fine on a phone.
const savedView = localStorage.getItem(VIEW_KEY);
setView(savedView && VALID_VIEWS.includes(savedView) ? savedView : "list");

const THEME_KEY = "cal.local.theme";
const themeToggle = document.querySelector("#theme-toggle");

function currentTheme() {
  return document.documentElement.dataset.theme
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function updateThemeIcon() {
  themeToggle.textContent = currentTheme() === "dark" ? "☾" : "☀";
}

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon();
});
updateThemeIcon();

document.querySelector(".menu-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  document.querySelector(".menu").classList.toggle("is-open");
});
document.addEventListener("click", () => document.querySelector(".menu").classList.remove("is-open"));

// keep "now" line and open/closed state fresh
setInterval(() => { weekView.render(); dayView.render(); listView.render(); }, 60_000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
