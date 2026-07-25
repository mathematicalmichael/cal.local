import { CATEGORIES } from "./schema.js";

// The category filter — shown above all three views (week/day/list). This
// is the one layer that controls which businesses show up: turning a
// category off hides every business in it, everywhere. Double-click a
// category to isolate it (turn everything else off in one move).
export function createLegend(root, { getState, onToggleCategory, onIsolateCategory }) {
  root.innerHTML = `
    <div class="legend">
      <div class="legend__row">
        <div class="legend__chips"></div>
        <div class="legend__actions">
          <button type="button" class="legend__action" data-action="all">All</button>
          <button type="button" class="legend__action" data-action="none">None</button>
        </div>
      </div>
    </div>
  `;

  const chipsEl = root.querySelector(".legend__chips");
  const legendEl = root.querySelector(".legend");

  root.querySelector('[data-action="all"]').addEventListener("click", () => onToggleCategory("__all__", true));
  root.querySelector('[data-action="none"]').addEventListener("click", () => onToggleCategory("__all__", false));

  function render() {
    const state = getState();
    chipsEl.innerHTML = "";
    CATEGORIES.forEach((cat) => chipsEl.appendChild(renderChip(cat, state)));
    // `root` (#legend)'s own hidden state is owned by app.js.
    legendEl.hidden = state.businesses.length === 0;
  }

  function renderChip(cat, state) {
    const active = state.categoryFilters[cat.key] !== false;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "legend__chip" + (active ? "" : " legend__chip--off");
    chip.textContent = cat.label;
    chip.title = "Click to toggle, double-click to isolate";
    chip.addEventListener("click", () => onToggleCategory(cat.key));
    chip.addEventListener("dblclick", () => onIsolateCategory(cat.key));
    return chip;
  }

  render();
  return { render };
}
