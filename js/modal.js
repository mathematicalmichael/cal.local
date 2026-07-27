import { DAY_NAMES, WEEK_ORDER, dateKey } from "./time.js";
import { newHourBlock, newException, CATEGORIES } from "./schema.js";

export function createBizModal(root, { onSave, onDelete }) {
  root.innerHTML = `
    <div class="modal-backdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal__header">
          <h2 id="modal-title">Business</h2>
          <button type="button" class="modal__close" aria-label="Close">&times;</button>
        </header>
        <div class="modal__body">
          <label class="field">
            <span>Name</span>
            <input type="text" name="name" required>
          </label>
          <div class="field">
            <span>Categories</span>
            <div class="category-select"></div>
            <p class="field-error category-error" hidden>Pick at least one category — use "Other" if nothing fits.</p>
          </div>
          <div class="field-row">
            <label class="field">
              <span>Address</span>
              <input type="text" name="address">
            </label>
            <label class="field">
              <span>Color</span>
              <input type="color" name="color">
            </label>
          </div>
          <div class="field-row">
            <label class="field">
              <span>Phone</span>
              <input type="tel" name="phone">
            </label>
            <label class="field">
              <span>Website</span>
              <input type="url" name="website" placeholder="https://">
            </label>
          </div>
          <label class="field">
            <span>Notes</span>
            <textarea name="notes" rows="3" placeholder="Best entrance, parking notes, favorite order…"></textarea>
          </label>

          <div class="hours-editor">
            <div class="hours-editor__head">
              <span>Weekly hours</span>
              <button type="button" class="btn btn--ghost btn--small add-hour">+ Add block</button>
            </div>
            <div class="hours-editor__rows"></div>
          </div>

          <div class="hours-editor">
            <div class="hours-editor__head">
              <span>Date overrides</span>
              <button type="button" class="btn btn--ghost btn--small add-exception">+ Add override</button>
            </div>
            <p class="field-hint">Holiday hours or one-off closures. These win
              over the weekly hours above for that date when working out
              whether a place is open.</p>
            <div class="exceptions-editor__rows"></div>
          </div>
        </div>
        <footer class="modal__footer">
          <button type="button" class="btn btn--danger delete-biz">Delete</button>
          <div class="modal__footer-spacer"></div>
          <button type="button" class="btn btn--ghost cancel-biz">Cancel</button>
          <button type="button" class="btn btn--primary save-biz">Save</button>
        </footer>
      </div>
    </div>
  `;

  const backdrop = root.querySelector(".modal-backdrop");
  const form = {
    name: root.querySelector('[name="name"]'),
    color: root.querySelector('[name="color"]'),
    address: root.querySelector('[name="address"]'),
    phone: root.querySelector('[name="phone"]'),
    website: root.querySelector('[name="website"]'),
    notes: root.querySelector('[name="notes"]'),
  };
  const categorySelectEl = root.querySelector(".category-select");
  const categoryErrorEl = root.querySelector(".category-error");
  const rowsEl = root.querySelector(".hours-editor__rows");
  const exceptionRowsEl = root.querySelector(".exceptions-editor__rows");
  const deleteBtn = root.querySelector(".delete-biz");

  let current = null; // working copy of business being edited
  let isNew = false;

  // Dragging out a new hours block on the grid saves a speculative business
  // to state immediately (so the block has something to attach to) before
  // this modal ever opens. If the user backs out here without saving, that
  // speculative entry needs to be rolled back — otherwise it's exactly the
  // kind of category-less orphan the required-category rule is meant to
  // prevent, just created a different way.
  function cancel() {
    if (isNew && current) onDelete(current.id);
    close();
  }

  root.querySelector(".modal__close").addEventListener("click", cancel);
  root.querySelector(".cancel-biz").addEventListener("click", cancel);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cancel(); });
  root.querySelector(".add-hour").addEventListener("click", () => {
    const prev = current.hours[current.hours.length - 1];
    if (prev) {
      const { id, dayOfWeek, ...rest } = prev;
      current.hours.push(newHourBlock({ ...rest, dayOfWeek: (dayOfWeek + 1) % 7 }));
    } else {
      current.hours.push(newHourBlock());
    }
    renderHourRows();
  });
  root.querySelector(".add-exception").addEventListener("click", () => {
    current.exceptions.push(newException({ date: dateKey(new Date()) }));
    renderExceptionRows();
  });
  root.querySelector(".save-biz").addEventListener("click", () => {
    if (current.categories.length === 0) {
      categoryErrorEl.hidden = false;
      categorySelectEl.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    current.name = form.name.value.trim() || "Untitled";
    current.color = form.color.value;
    current.address = form.address.value.trim();
    current.phone = form.phone.value.trim();
    current.website = form.website.value.trim();
    current.notes = form.notes.value.trim();
    // A dateless override can never match a day, so it would just sit in the
    // data forever looking like a real rule. Drop those on save.
    current.exceptions = current.exceptions.filter((e) => e.date);
    onSave(current, isNew);
    close();
  });
  deleteBtn.addEventListener("click", () => {
    if (!current) return;
    if (confirm(`Delete "${current.name}"? This removes all of its hours.`)) {
      onDelete(current.id);
      close();
    }
  });

  function open(biz, { focusHourId = null, asNew = false } = {}) {
    current = JSON.parse(JSON.stringify(biz));
    isNew = asNew;
    form.name.value = current.name;
    form.color.value = current.color;
    form.address.value = current.address;
    form.phone.value = current.phone;
    form.website.value = current.website;
    form.notes.value = current.notes;
    deleteBtn.hidden = asNew;
    categoryErrorEl.hidden = true;
    renderCategorySelect();
    renderHourRows(focusHourId);
    renderExceptionRows();
    backdrop.hidden = false;
    setTimeout(() => form.name.focus(), 0);
  }

  function close() {
    backdrop.hidden = true;
    current = null;
  }

  function renderCategorySelect() {
    categorySelectEl.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      const active = current.categories.includes(cat.key);
      chip.className = "category-chip" + (active ? " category-chip--active" : "");
      chip.textContent = cat.label;
      chip.setAttribute("aria-pressed", String(active));
      chip.addEventListener("click", () => {
        current.categories = current.categories.includes(cat.key)
          ? current.categories.filter((k) => k !== cat.key)
          : [...current.categories, cat.key];
        if (current.categories.length > 0) categoryErrorEl.hidden = true;
        renderCategorySelect();
      });
      categorySelectEl.appendChild(chip);
    });
  }

  function renderExceptionRows() {
    exceptionRowsEl.innerHTML = "";
    current.exceptions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((e) => exceptionRowsEl.appendChild(renderExceptionRow(e)));
  }

  function renderExceptionRow(e) {
    const row = document.createElement("div");
    row.className = "hour-row exception-row";
    row.dataset.exceptionId = e.id;
    row.innerHTML = `
      <input type="date" name="date" value="${escapeAttr(e.date)}">
      <label class="exception-row__closed">
        <input type="checkbox" name="closed" ${e.closed ? "checked" : ""}>
        <span>Closed</span>
      </label>
      <input type="time" name="start" value="${escapeAttr(e.start)}" ${e.closed ? "disabled" : ""}>
      <span aria-hidden="true">–</span>
      <input type="time" name="end" value="${escapeAttr(e.end)}" ${e.closed ? "disabled" : ""}>
      <input type="text" name="note" placeholder="Note (optional)" value="${escapeAttr(e.note)}">
      <button type="button" class="btn btn--icon remove-exception" aria-label="Remove override">&times;</button>
    `;
    const date = row.querySelector('[name="date"]');
    const closed = row.querySelector('[name="closed"]');
    const start = row.querySelector('[name="start"]');
    const end = row.querySelector('[name="end"]');
    const note = row.querySelector('[name="note"]');
    date.addEventListener("change", () => { e.date = date.value; });
    closed.addEventListener("change", () => {
      e.closed = closed.checked;
      // Times are meaningless while closed — disable rather than hide them so
      // the row doesn't reflow under the user's finger.
      start.disabled = end.disabled = e.closed;
    });
    start.addEventListener("change", () => { e.start = start.value; });
    end.addEventListener("change", () => { e.end = end.value; });
    note.addEventListener("input", () => { e.note = note.value; });
    row.querySelector(".remove-exception").addEventListener("click", () => {
      current.exceptions = current.exceptions.filter((x) => x.id !== e.id);
      renderExceptionRows();
    });
    return row;
  }

  function renderHourRows(focusHourId) {
    rowsEl.innerHTML = "";
    current.hours
      .slice()
      .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) || a.start.localeCompare(b.start))
      .forEach((h) => rowsEl.appendChild(renderHourRow(h)));
    if (focusHourId) {
      const el = rowsEl.querySelector(`[data-hour-id="${focusHourId}"] input[name="start"]`);
      el?.focus();
    }
  }

  function renderHourRow(h) {
    const row = document.createElement("div");
    row.className = "hour-row";
    row.dataset.hourId = h.id;
    row.innerHTML = `
      <select name="dayOfWeek">
        ${WEEK_ORDER.map((i) => `<option value="${i}" ${i === h.dayOfWeek ? "selected" : ""}>${DAY_NAMES[i]}</option>`).join("")}
      </select>
      <input type="time" name="start" value="${h.start}">
      <span aria-hidden="true">–</span>
      <input type="time" name="end" value="${h.end}">
      <button type="button" class="btn btn--icon remove-hour" aria-label="Remove block">&times;</button>
    `;
    const dow = row.querySelector('[name="dayOfWeek"]');
    const start = row.querySelector('[name="start"]');
    const end = row.querySelector('[name="end"]');
    dow.addEventListener("change", () => { h.dayOfWeek = Number(dow.value); });
    start.addEventListener("change", () => { h.start = start.value; });
    end.addEventListener("change", () => { h.end = end.value; });
    row.querySelector(".remove-hour").addEventListener("click", () => {
      current.hours = current.hours.filter((x) => x.id !== h.id);
      renderHourRows();
    });
    return row;
  }

  return { open, close };
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}
