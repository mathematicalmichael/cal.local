import { toMinutes, hoursForDay, DAY_SHORT, WEEK_ORDER } from "./time.js";
import { buildTimeGutter, layoutOverlaps, renderBlock, attachDayInteractions, pct } from "./grid-common.js";

export function createWeekView(root, { getState, isVisible, onCreateBlock, onUpdateBlock, onEditBlock }) {
  // A single CSS grid with an explicit header row (corner + day names) and
  // body row (time gutter + day columns), rather than per-column headers —
  // that way the time gutter's row-2 start is always exactly the header
  // row's height, with no pixel-matching needed to avoid clipping 12am.
  root.innerHTML = `
    <div class="week-grid" role="grid" aria-label="Weekly hours grid">
      <div class="week-grid__corner" aria-hidden="true"></div>
      ${WEEK_ORDER.map((dow) => `<div class="week-grid__day-label">${DAY_SHORT[dow]}</div>`).join("")}
      <div class="week-grid__time-col" aria-hidden="true"></div>
      ${WEEK_ORDER.map((dow) => `<div class="week-grid__day-body" data-dow-body="${dow}"></div>`).join("")}
    </div>
  `;

  const timeCol = root.querySelector(".week-grid__time-col");
  buildTimeGutter(timeCol);

  const dayBodies = [...root.querySelectorAll("[data-dow-body]")];
  dayBodies.forEach((body) => attachDayInteractions(body, { onCreateBlock }));

  function render() {
    const state = getState();
    dayBodies.forEach((body) => {
      const dow = Number(body.dataset.dowBody);
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
    });
    highlightNow();
  }

  function highlightNow() {
    root.querySelectorAll(".now-line").forEach((n) => n.remove());
    const now = new Date();
    const dow = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    // dayBodies is in Monday-first display order, so index !== dayOfWeek.
    const body = dayBodies.find((b) => Number(b.dataset.dowBody) === dow);
    if (!body) return;
    const line = document.createElement("div");
    line.className = "now-line";
    line.style.top = pct(mins) + "%";
    body.appendChild(line);
  }

  render();
  return { render };
}
