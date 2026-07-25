import { toMinutes, hoursForDay, DAY_NAMES } from "./time.js";
import { buildTimeGutter, layoutOverlaps, renderBlock, attachDayInteractions, pct } from "./grid-common.js";

// One weekday at a time, full width — for when several businesses are open
// most of the day and even side-by-side columns in the week view get too
// narrow to read. Swipe or use the arrows to move day to day.
export function createDayView(root, { getState, isVisible, onCreateBlock, onUpdateBlock, onEditBlock }) {
  let dow = new Date().getDay();

  root.innerHTML = `
    <div class="day-nav">
      <button type="button" class="day-nav__btn" data-nav="prev" aria-label="Previous day">‹</button>
      <button type="button" class="day-nav__label" data-nav="today" title="Jump to today"></button>
      <button type="button" class="day-nav__btn" data-nav="next" aria-label="Next day">›</button>
    </div>
    <div class="day-grid" role="grid" aria-label="Day hours grid">
      <div class="week-grid__time-col" aria-hidden="true"></div>
      <div class="week-grid__day-body" data-dow-body="${dow}"></div>
    </div>
  `;

  const labelEl = root.querySelector('[data-nav="today"]');
  const timeCol = root.querySelector(".week-grid__time-col");
  buildTimeGutter(timeCol);

  const body = root.querySelector("[data-dow-body]");
  attachDayInteractions(body, { onCreateBlock });

  root.querySelector('[data-nav="prev"]').addEventListener("click", () => { dow = (dow + 6) % 7; render(); });
  root.querySelector('[data-nav="next"]').addEventListener("click", () => { dow = (dow + 1) % 7; render(); });
  labelEl.addEventListener("click", () => { dow = new Date().getDay(); render(); });

  let touchStartX = null;
  const dayGrid = root.querySelector(".day-grid");
  dayGrid.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  dayGrid.addEventListener("touchend", (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      dow = dx < 0 ? (dow + 1) % 7 : (dow + 6) % 7;
      render();
    }
    touchStartX = null;
  }, { passive: true });

  function render() {
    body.dataset.dowBody = String(dow);
    const state = getState();
    body.querySelectorAll(".hour-block").forEach((n) => n.remove());
    const items = [];
    state.businesses.filter(isVisible).forEach((biz) => {
      hoursForDay(biz, dow).forEach((h) => {
        const start = toMinutes(h.start);
        const end = toMinutes(h.end) <= start ? 24 * 60 : toMinutes(h.end);
        items.push({ biz, h, start, end });
      });
    });
    layoutOverlaps(items);
    items.forEach((it) => body.appendChild(renderBlock(it.biz, it.h, it.col, it.cols, { onEditBlock, onUpdateBlock })));
    labelEl.textContent = DAY_NAMES[dow] + (dow === new Date().getDay() ? " · Today" : "");
    highlightNow();
  }

  function highlightNow() {
    root.querySelectorAll(".now-line").forEach((n) => n.remove());
    const now = new Date();
    if (now.getDay() !== dow) return;
    const mins = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement("div");
    line.className = "now-line";
    line.style.top = pct(mins) + "%";
    body.appendChild(line);
  }

  render();
  return { render };
}
