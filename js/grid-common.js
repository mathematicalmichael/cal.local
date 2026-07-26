// Shared building blocks for the draggable day-grid, used by both the
// 7-day week view and the single-day view so the drag/resize/overlap
// logic (and its edge cases) only exists in one place.
import { minutesToHHMM, toMinutes, formatTime12 } from "./time.js";

export const SNAP = 15; // minute snapping

export function buildTimeGutter(col) {
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

// Overlapping blocks get their own side-by-side column instead of stacking
// full-width — otherwise a wide block fully covers narrower ones underneath
// and makes them impossible to click or drag.
export function layoutOverlaps(items) {
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster = [];
  let clusterEnd = -Infinity;
  const clusters = [];
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) clusters.push(cluster);

  clusters.forEach((c) => {
    const columnEnds = [];
    c.forEach((it) => {
      let placed = false;
      for (let i = 0; i < columnEnds.length; i++) {
        if (columnEnds[i] <= it.start) {
          it.col = i;
          columnEnds[i] = it.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = columnEnds.length;
        columnEnds.push(it.end);
      }
    });
    c.forEach((it) => { it.cols = columnEnds.length; });
  });
}

export function renderBlock(biz, h, col, cols, { onEditBlock, onUpdateBlock }) {
  const start = toMinutes(h.start);
  let end = toMinutes(h.end);
  if (end <= start) end = 24 * 60; // clamp overnight display to day end visually
  const el = document.createElement("div");
  el.className = "hour-block";
  el.style.setProperty("--block-color", biz.color);
  el.style.top = pct(start) + "%";
  el.style.height = Math.max(pct(end - start), pct(SNAP)) + "%";
  const widthPct = 100 / cols;
  el.style.left = `calc(${col * widthPct}% + 2px)`;
  el.style.width = `calc(${widthPct}% - 4px)`;
  el.style.zIndex = String(2 + col);
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
  attachBlockDrag(el, biz.id, h, onUpdateBlock);
  return el;
}

export function attachBlockDrag(el, bizId, block, onUpdateBlock) {
  let mode = null; // 'move' | 'resize-start' | 'resize-end'
  let startY = 0;
  let origStart = 0;
  let origEnd = 0;
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
    bodyHeight = el.parentElement.getBoundingClientRect().height;
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
      const dur = origEnd - origStart;
      const ns = clamp(origStart + dMin, 0, 1440 - dur);
      el.style.top = pct(ns) + "%";
    } else if (mode === "resize-start") {
      const ns = clamp(origStart + dMin, 0, origEnd - SNAP);
      el.style.top = pct(ns) + "%";
      el.style.height = pct(origEnd - ns) + "%";
    } else if (mode === "resize-end") {
      const ne = clamp(origEnd + dMin, origStart + SNAP, 1440);
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

// How long a touch has to sit still before it counts as "I want to create a
// block here" rather than "I'm about to scroll", and how far it may drift in
// the meantime. Mouse/trackpad input starts immediately — there's no scroll
// gesture to disambiguate from, and a hold would just feel broken.
const HOLD_MS = 400;
const HOLD_SLOP = 10; // px

export function attachDayInteractions(body, { onCreateBlock }) {
  let dragging = false;
  let startY = 0;
  let ghost = null;
  let height = 0;
  let holdTimer = null;
  let downClientY = 0;
  let downClientX = 0;

  // Non-passive touchmove is what actually stops the page from scrolling once
  // a hold has been recognized — pointer capture alone doesn't reliably
  // suppress native panning on touch.
  const blockScroll = (e) => e.preventDefault();

  function beginDrag(clientY) {
    dragging = true;
    const rect = body.getBoundingClientRect();
    height = rect.height;
    startY = clientY - rect.top;
    ghost = document.createElement("div");
    ghost.className = "hour-block hour-block--ghost";
    const startMin = snap((startY / height) * 1440);
    ghost.style.top = pct(startMin) + "%";
    ghost.style.height = pct(SNAP) + "%";
    body.appendChild(ghost);
    document.addEventListener("touchmove", blockScroll, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function cancelHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    body.classList.remove("is-holding");
    window.removeEventListener("pointermove", onHoldMove);
    window.removeEventListener("pointerup", cancelHold);
    window.removeEventListener("pointercancel", cancelHold);
  }

  // Before the hold fires, any real movement means the user is scrolling.
  const onHoldMove = (e) => {
    if (Math.abs(e.clientY - downClientY) > HOLD_SLOP || Math.abs(e.clientX - downClientX) > HOLD_SLOP) {
      cancelHold();
    }
  };

  body.addEventListener("pointerdown", (e) => {
    if (e.target !== body) return;
    if (e.pointerType === "mouse") {
      beginDrag(pointY(e));
      return;
    }
    downClientY = e.clientY;
    downClientX = e.clientX;
    const y = e.clientY;
    body.classList.add("is-holding");
    window.addEventListener("pointermove", onHoldMove);
    window.addEventListener("pointerup", cancelHold);
    window.addEventListener("pointercancel", cancelHold);
    holdTimer = setTimeout(() => {
      holdTimer = null;
      cancelHold();
      navigator.vibrate?.(15);
      beginDrag(y);
    }, HOLD_MS);
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
    document.removeEventListener("touchmove", blockScroll);
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

export function pct(minutes) {
  return (minutes / 1440) * 100;
}

export function snap(mins) {
  return Math.round(mins / SNAP) * SNAP;
}

export function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function pointY(e) {
  return e.clientY;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
