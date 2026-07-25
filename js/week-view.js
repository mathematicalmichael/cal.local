import { DAY_SHORT, minutesToHHMM, toMinutes, formatTime12, hoursForDay } from "./time.js";

const DAY_START = 0; // minutes, 00:00
const DAY_END = 24 * 60; // 24:00
const PX_PER_MIN = 1; // grid height scaling, overridden by --hour-height in CSS via ratio
const SNAP = 15; // minute snapping

export function createWeekView(root, { getState, onCreateBlock, onUpdateBlock, onEditBlock }) {
  // A single CSS grid with an explicit header row (corner + day names) and
  // body row (time gutter + day columns), rather than per-column headers —
  // that way the time gutter's row-2 start is always exactly the header
  // row's height, with no pixel-matching needed to avoid clipping 12am.
  root.innerHTML = `
    <div class="week-grid" role="grid" aria-label="Weekly hours grid">
      <div class="week-grid__corner" aria-hidden="true"></div>
      ${DAY_SHORT.map((d) => `<div class="week-grid__day-label">${d}</div>`).join("")}
      <div class="week-grid__time-col" aria-hidden="true"></div>
      ${DAY_SHORT.map((d, i) => `<div class="week-grid__day-body" data-dow-body="${i}"></div>`).join("")}
    </div>
  `;

  const grid = root.querySelector(".week-grid");
  const timeCol = root.querySelector(".week-grid__time-col");
  buildTimeGutter(timeCol);

  const dayBodies = [...root.querySelectorAll("[data-dow-body]")];
  dayBodies.forEach((body) => attachDayInteractions(body, { onCreateBlock, onEditBlock, onUpdateBlock }));

  function render() {
    const state = getState();
    dayBodies.forEach((body) => {
      const dow = Number(body.dataset.dowBody);
      body.querySelectorAll(".hour-block").forEach((n) => n.remove());
      state.businesses.forEach((biz) => {
        hoursForDay(biz, dow).forEach((h) => {
          body.appendChild(renderBlock(biz, h));
        });
      });
    });
    highlightNow();
  }

  function highlightNow() {
    root.querySelectorAll(".now-line").forEach((n) => n.remove());
    const now = new Date();
    const dow = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const body = dayBodies[dow];
    if (!body) return;
    const line = document.createElement("div");
    line.className = "now-line";
    line.style.top = pct(mins) + "%";
    body.appendChild(line);
  }

  function renderBlock(biz, h) {
    const start = toMinutes(h.start);
    let end = toMinutes(h.end);
    if (end <= start) end = 24 * 60; // clamp overnight display to day end visually
    const el = document.createElement("div");
    el.className = "hour-block";
    el.style.setProperty("--block-color", biz.color);
    el.style.top = pct(start) + "%";
    el.style.height = Math.max(pct(end - start), pct(SNAP)) + "%";
    el.dataset.blockId = h.id;
    el.dataset.bizId = biz.id;
    el.innerHTML = `
      <div class="hour-block__handle hour-block__handle--top" data-resize="start"></div>
      <div class="hour-block__label">
        <strong>${escapeHtml(biz.name || "Untitled")}</strong>
        <span>${formatTime12(h.start)}–${formatTime12(h.end)}</span>
      </div>
      <div class="hour-block__handle hour-block__handle--bottom" data-resize="end"></div>
    `;
    el.addEventListener("click", (e) => {
      if (e.target.dataset.resize) return;
      if (el.dataset.dragged === "1") { el.dataset.dragged = "0"; return; }
      onEditBlock(biz.id, h.id);
    });
    attachBlockDrag(el, biz.id, h);
    return el;
  }

  function attachBlockDrag(el, bizId, block) {
    let mode = null; // 'move' | 'resize-start' | 'resize-end'
    let startY = 0;
    let origStart = 0;
    let origEnd = 0;
    let bodyEl = null;
    let bodyHeight = 0;

    const onDown = (e) => {
      const target = e.target;
      mode = target.dataset.resize === "start" ? "resize-start"
        : target.dataset.resize === "end" ? "resize-end"
        : "move";
      startY = pointY(e);
      origStart = toMinutes(block.start);
      origEnd = toMinutes(block.end);
      if (origEnd <= origStart) origEnd += 1440;
      bodyEl = el.parentElement;
      bodyHeight = bodyEl.getBoundingClientRect().height;
      el.setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      e.stopPropagation();
      e.preventDefault();
    };

    const onMove = (e) => {
      const dy = pointY(e) - startY;
      const dMin = snap((dy / bodyHeight) * 1440);
      if (Math.abs(dy) > 3) el.dataset.dragged = "1";
      if (mode === "move") {
        let ns = origStart + dMin;
        let ne = origEnd + dMin;
        const dur = origEnd - origStart;
        ns = clamp(ns, 0, 1440 - dur);
        ne = ns + dur;
        el.style.top = pct(ns) + "%";
      } else if (mode === "resize-start") {
        let ns = clamp(origStart + dMin, 0, origEnd - SNAP);
        el.style.top = pct(ns) + "%";
        el.style.height = pct(origEnd - ns) + "%";
      } else if (mode === "resize-end") {
        let ne = clamp(origEnd + dMin, origStart + SNAP, 1440);
        el.style.height = pct(ne - origStart) + "%";
      }
    };

    const onUp = (e) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (el.dataset.dragged !== "1") { mode = null; return; }
      const dy = pointY(e) - startY;
      const dMin = snap((dy / bodyHeight) * 1440);
      let ns = origStart, ne = origEnd;
      if (mode === "move") {
        const dur = origEnd - origStart;
        ns = clamp(origStart + dMin, 0, 1440 - dur);
        ne = ns + dur;
      } else if (mode === "resize-start") {
        ns = clamp(origStart + dMin, 0, origEnd - SNAP);
      } else if (mode === "resize-end") {
        ne = clamp(origEnd + dMin, origStart + SNAP, 1440);
      }
      onUpdateBlock(bizId, block.id, {
        start: minutesToHHMM(ns),
        end: minutesToHHMM(ne % 1440 === 0 ? 1440 : ne),
      });
      mode = null;
    };

    el.addEventListener("pointerdown", onDown);
  }

  function attachDayInteractions(body, { onCreateBlock }) {
    let dragging = false;
    let startY = 0;
    let ghost = null;
    let height = 0;

    body.addEventListener("pointerdown", (e) => {
      if (e.target !== body) return;
      dragging = true;
      height = body.getBoundingClientRect().height;
      startY = pointY(e) - body.getBoundingClientRect().top;
      ghost = document.createElement("div");
      ghost.className = "hour-block hour-block--ghost";
      const startMin = snap((startY / height) * 1440);
      ghost.style.top = pct(startMin) + "%";
      ghost.style.height = pct(SNAP) + "%";
      body.appendChild(ghost);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    const onMove = (e) => {
      if (!dragging || !ghost) return;
      const rect = body.getBoundingClientRect();
      const y = pointY(e) - rect.top;
      const startMin = snap((startY / height) * 1440);
      const curMin = snap((y / height) * 1440);
      const lo = Math.min(startMin, curMin);
      const hi = Math.max(startMin, curMin, lo + SNAP);
      ghost.style.top = pct(lo) + "%";
      ghost.style.height = pct(hi - lo) + "%";
    };

    const onUp = (e) => {
      dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!ghost) return;
      const rect = body.getBoundingClientRect();
      const y = pointY(e) - rect.top;
      const startMin = snap((startY / height) * 1440);
      const curMin = snap((y / height) * 1440);
      const lo = Math.min(startMin, curMin);
      const hi = Math.max(startMin, curMin, lo + SNAP);
      ghost.remove();
      ghost = null;
      const dow = Number(body.dataset.dowBody);
      onCreateBlock(dow, minutesToHHMM(lo), minutesToHHMM(hi));
    };
  }

  render();
  return { render };
}

function buildTimeGutter(col) {
  let html = "";
  for (let h = 0; h < 24; h++) {
    html += `<div class="week-grid__hour-tick" style="top:${pct(h * 60)}%">${formatHourLabel(h)}</div>`;
  }
  col.innerHTML = html;
}

function formatHourLabel(h) {
  const period = h < 12 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}${period}`;
}

function pct(minutes) {
  return (minutes / 1440) * 100;
}

function snap(mins) {
  return Math.round(mins / SNAP) * SNAP;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function pointY(e) {
  return e.clientY;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
