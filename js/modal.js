import { DAY_NAMES } from "./time.js";
import { newHourBlock } from "./schema.js";

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
          <div class="field-row">
            <label class="field">
              <span>Category</span>
              <input type="text" name="category" placeholder="Coffee, Hardware, Bakery…">
            </label>
            <label class="field">
              <span>Color</span>
              <input type="color" name="color">
            </label>
          </div>
          <label class="field">
            <span>Address</span>
            <input type="text" name="address">
          </label>
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
    category: root.querySelector('[name="category"]'),
    color: root.querySelector('[name="color"]'),
    address: root.querySelector('[name="address"]'),
    phone: root.querySelector('[name="phone"]'),
    website: root.querySelector('[name="website"]'),
    notes: root.querySelector('[name="notes"]'),
  };
  const rowsEl = root.querySelector(".hours-editor__rows");
  const deleteBtn = root.querySelector(".delete-biz");

  let current = null; // working copy of business being edited
  let isNew = false;

  root.querySelector(".modal__close").addEventListener("click", close);
  root.querySelector(".cancel-biz").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  root.querySelector(".add-hour").addEventListener("click", () => {
    const prev = current.hours[current.hours.length - 1];
    if (prev) {
      const { id, ...rest } = prev;
      current.hours.push(newHourBlock(rest));
    } else {
      current.hours.push(newHourBlock());
    }
    renderHourRows();
  });
  root.querySelector(".save-biz").addEventListener("click", () => {
    current.name = form.name.value.trim() || "Untitled";
    current.category = form.category.value.trim();
    current.color = form.color.value;
    current.address = form.address.value.trim();
    current.phone = form.phone.value.trim();
    current.website = form.website.value.trim();
    current.notes = form.notes.value.trim();
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
    form.category.value = current.category;
    form.color.value = current.color;
    form.address.value = current.address;
    form.phone.value = current.phone;
    form.website.value = current.website;
    form.notes.value = current.notes;
    deleteBtn.hidden = asNew;
    renderHourRows(focusHourId);
    backdrop.hidden = false;
    setTimeout(() => form.name.focus(), 0);
  }

  function close() {
    backdrop.hidden = true;
    current = null;
  }

  function renderHourRows(focusHourId) {
    rowsEl.innerHTML = "";
    current.hours
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start.localeCompare(b.start))
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
        ${DAY_NAMES.map((d, i) => `<option value="${i}" ${i === h.dayOfWeek ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <input type="time" name="start" value="${h.start}">
      <span aria-hidden="true">–</span>
      <input type="time" name="end" value="${h.end}">
      <input type="text" name="label" placeholder="Label (optional)" value="${escapeAttr(h.label)}">
      <button type="button" class="btn btn--icon remove-hour" aria-label="Remove block">&times;</button>
    `;
    const dow = row.querySelector('[name="dayOfWeek"]');
    const start = row.querySelector('[name="start"]');
    const end = row.querySelector('[name="end"]');
    const label = row.querySelector('[name="label"]');
    dow.addEventListener("change", () => { h.dayOfWeek = Number(dow.value); });
    start.addEventListener("change", () => { h.start = start.value; });
    end.addEventListener("change", () => { h.end = end.value; });
    label.addEventListener("input", () => { h.label = label.value; });
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
