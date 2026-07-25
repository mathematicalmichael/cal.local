import { DAY_SHORT, WEEK_ORDER, formatTime12, hoursForDay, isOpenAt, minutesUntilClose } from "./time.js";
import { CATEGORIES } from "./schema.js";

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export function createListView(root, { getState, isVisible, onEdit }) {
  let query = "";
  let openOnly = false;

  root.innerHTML = `
    <div class="list-toolbar">
      <input type="search" class="list-search" placeholder="Search businesses, notes, categories…" aria-label="Search businesses">
      <label class="list-toggle">
        <input type="checkbox" class="list-open-only">
        <span>Open now</span>
      </label>
    </div>
    <ul class="biz-list" role="list"></ul>
    <p class="list-empty" hidden>Nothing matches yet.</p>
  `;

  const searchInput = root.querySelector(".list-search");
  const openOnlyInput = root.querySelector(".list-open-only");
  const listEl = root.querySelector(".biz-list");
  const emptyEl = root.querySelector(".list-empty");

  searchInput.addEventListener("input", () => { query = searchInput.value.trim().toLowerCase(); render(); });
  openOnlyInput.addEventListener("change", () => { openOnly = openOnlyInput.checked; render(); });

  function matches(biz) {
    if (!isVisible(biz)) return false;
    if (openOnly && !isOpenAt(biz)) return false;
    if (!query) return true;
    const categoryText = biz.categories.map((k) => CATEGORY_LABELS[k] || k).join(" ");
    const hay = [biz.name, categoryText, biz.notes, biz.address].join(" ").toLowerCase();
    return hay.includes(query);
  }

  function render() {
    const state = getState();
    const items = state.businesses.filter(matches).sort(openOnly ? byClosingSoonest : byName);
    listEl.innerHTML = "";
    emptyEl.hidden = items.length > 0;
    items.forEach((biz) => listEl.appendChild(renderRow(biz)));
  }

  function renderRow(biz) {
    const li = document.createElement("li");
    li.className = "biz-row";
    li.tabIndex = 0;
    const open = isOpenAt(biz);
    li.innerHTML = `
      <div class="biz-row__bar" style="background:${biz.color}"></div>
      <div class="biz-row__main">
        <div class="biz-row__head">
          <h3>${escapeHtml(biz.name || "Untitled")}</h3>
          <span class="status-pill ${open ? "status-pill--open" : "status-pill--closed"}">${open ? "Open now" : "Closed"}</span>
        </div>
        ${biz.categories.length ? `<div class="biz-row__category">${biz.categories.map((k) => escapeHtml(CATEGORY_LABELS[k] || k)).join(" · ")}</div>` : ""}
        <div class="biz-row__hours">${renderHoursSummary(biz)}</div>
        ${biz.notes ? `<div class="biz-row__notes">${escapeHtml(biz.notes)}</div>` : ""}
      </div>
    `;
    li.addEventListener("click", () => onEdit(biz.id));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") onEdit(biz.id); });
    return li;
  }

  function renderHoursSummary(biz) {
    if (!biz.hours.length) return `<span class="hours-empty">No hours set</span>`;
    const today = new Date().getDay();
    return WEEK_ORDER.map((dow) => {
      const blocks = hoursForDay(biz, dow);
      const text = blocks.length
        ? blocks.map((h) => `${formatTime12(h.start)}–${formatTime12(h.end)}`).join(", ")
        : "Closed";
      const cls = dow === today ? "hours-summary-row hours-summary-row--today" : "hours-summary-row";
      return `<div class="${cls}"><span>${DAY_SHORT[dow]}</span><span>${text}</span></div>`;
    }).join("");
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name);
  }

  // "Open now" is most useful sorted by whoever's closing soonest — that's
  // the one you'd want to rush to, not alphabetical order.
  function byClosingSoonest(a, b) {
    const diff = (minutesUntilClose(a) ?? Infinity) - (minutesUntilClose(b) ?? Infinity);
    return diff !== 0 ? diff : byName(a, b);
  }

  render();
  return { render };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
