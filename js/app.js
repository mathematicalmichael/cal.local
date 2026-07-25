import { load, save, exportJson, importJson } from "./storage.js";
import { newBusiness, newHourBlock } from "./schema.js";
import { createWeekView } from "./week-view.js";
import { createListView } from "./list-view.js";
import { createBizModal } from "./modal.js";

let state = load();

const weekRoot = document.querySelector("#week-view");
const listRoot = document.querySelector("#list-view");
const modalRoot = document.querySelector("#modal-root");

const weekView = createWeekView(weekRoot, {
  getState: () => state,
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
});

const listView = createListView(listRoot, {
  getState: () => state,
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
  listView.render();
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
    if (confirm(`Import ${imported.businesses.length} business(es)? This replaces your current data.\n(Export a backup first if unsure.)`)) {
      state = imported;
      persist();
    }
  } catch (err) {
    alert("Could not read that file as vtcal JSON.");
    console.error(err);
  } finally {
    importInput.value = "";
  }
});

const tabs = [...document.querySelectorAll(".view-tab")];
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    const view = tab.dataset.view;
    weekRoot.hidden = view !== "week";
    listRoot.hidden = view !== "list";
    if (view === "week") weekView.render();
    if (view === "list") listView.render();
  });
});

document.querySelector(".menu-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  document.querySelector(".menu").classList.toggle("is-open");
});
document.addEventListener("click", () => document.querySelector(".menu").classList.remove("is-open"));

// keep "now" line and open/closed state fresh
setInterval(() => { weekView.render(); listView.render(); }, 60_000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
