// "Which business does this block belong to?" — replaces a native prompt()
// that listed businesses as numbered lines. iOS truncated that dialog after a
// few entries, so with a real list of places it was unusable.
//
// Styled as a ledger index: a stamped chip for the block being filed, ruled
// rows with mono gutter numbers and a wax-dot color mark, and a dashed
// "new entry" row when what you typed doesn't match anything.
import { DAY_SHORT, formatTime12, isOpenAt } from "./time.js";
import { CATEGORIES } from "./schema.js";

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export function createPickerModal(root) {
  root.innerHTML = `
    <div class="modal-backdrop" hidden>
      <div class="modal picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <header class="picker__header">
          <div class="picker__titles">
            <h2 id="picker-title">File this block</h2>
            <span class="picker__stamp"></span>
          </div>
          <button type="button" class="modal__close picker-close" aria-label="Close">&times;</button>
        </header>
        <div class="picker__search">
          <input type="search" class="picker__input" placeholder="Search, or type a new name…"
                 aria-label="Search businesses or name a new one" autocomplete="off"
                 aria-controls="picker-list" role="combobox" aria-expanded="true">
        </div>
        <ul class="picker__list" id="picker-list" role="listbox" aria-label="Businesses"></ul>
        <footer class="modal__footer picker__footer">
          <span class="picker__hint">↑↓ to move · enter to file · esc to cancel</span>
          <div class="modal__footer-spacer"></div>
          <button type="button" class="btn btn--ghost picker-cancel">Cancel</button>
        </footer>
      </div>
    </div>
  `;

  const backdrop = root.querySelector(".modal-backdrop");
  const stampEl = root.querySelector(".picker__stamp");
  const input = root.querySelector(".picker__input");
  const listEl = root.querySelector(".picker__list");

  let settle = null;
  let businesses = [];
  let rows = []; // { kind: 'existing' | 'new', biz?, name? }
  let active = 0;

  function close(result) {
    backdrop.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    const done = settle;
    settle = null;
    businesses = [];
    rows = [];
    if (done) done(result);
  }

  function onKeydown(e) {
    if (e.key === "Escape") { close(null); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      paintActive();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    }
  }

  function choose(row) {
    if (!row) return;
    close(row.kind === "new" ? { name: row.name } : { id: row.biz.id });
  }

  root.querySelector(".picker-close").addEventListener("click", () => close(null));
  root.querySelector(".picker-cancel").addEventListener("click", () => close(null));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });
  input.addEventListener("input", () => { active = 0; renderRows(); });

  // Resolves { id } for an existing business, { name } for a new one, or null.
  function open({ dow, start, end, businesses: list }) {
    businesses = list.slice();
    stampEl.textContent = `${DAY_SHORT[dow] ?? ""} · ${formatTime12(start)}–${formatTime12(end)}`;
    input.value = "";
    active = 0;
    renderRows();
    backdrop.hidden = false;
    document.addEventListener("keydown", onKeydown);
    // Deliberately not focusing the field on open: on iOS that throws up the
    // keyboard over the list before you've even seen your options. Tap to
    // search; the arrow keys still work without focus.
    return new Promise((resolve) => { settle = resolve; });
  }

  function renderRows() {
    const query = input.value.trim();
    const needle = query.toLowerCase();
    const matches = businesses.filter((b) => {
      if (!needle) return true;
      const hay = [b.name, (b.categories || []).map((k) => CATEGORY_LABELS[k] || k).join(" ")].join(" ").toLowerCase();
      return hay.includes(needle);
    });

    rows = matches.map((biz) => ({ kind: "existing", biz }));
    const exact = businesses.some((b) => (b.name || "").trim().toLowerCase() === needle);
    if (query && !exact) rows.push({ kind: "new", name: query });

    listEl.innerHTML = "";
    if (!rows.length) {
      listEl.innerHTML = `<li class="picker__empty">Nothing matches — type a name to start a new one.</li>`;
      return;
    }
    rows.forEach((row, i) => listEl.appendChild(renderRow(row, i)));
    paintActive();
  }

  function renderRow(row, i) {
    const li = document.createElement("li");
    li.className = "picker-row" + (row.kind === "new" ? " picker-row--new" : "");
    li.id = `picker-row-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    // Staggered reveal, capped so a long list doesn't crawl in.
    li.style.animationDelay = `${Math.min(i, 8) * 22}ms`;

    if (row.kind === "new") {
      li.innerHTML = `
        <span class="picker-row__num">new</span>
        <span class="picker-row__mark picker-row__mark--new" aria-hidden="true">+</span>
        <span class="picker-row__body">
          <span class="picker-row__name">Start “${escapeHtml(row.name)}”</span>
          <span class="picker-row__meta">Creates the business, then opens it for details</span>
        </span>`;
    } else {
      const biz = row.biz;
      const cats = (biz.categories || []).map((k) => CATEGORY_LABELS[k] || k).join(" · ");
      const blocks = (biz.hours || []).length;
      const meta = [cats, `${blocks} block${blocks === 1 ? "" : "s"}`, isOpenAt(biz) ? "open now" : null]
        .filter(Boolean).join(" · ");
      li.innerHTML = `
        <span class="picker-row__num">${String(i + 1).padStart(2, "0")}</span>
        <span class="picker-row__mark" style="background:${escapeAttr(biz.color)}" aria-hidden="true"></span>
        <span class="picker-row__body">
          <span class="picker-row__name">${escapeHtml(biz.name || "Untitled")}</span>
          <span class="picker-row__meta">${escapeHtml(meta)}</span>
        </span>`;
    }

    li.addEventListener("click", () => choose(row));
    // Pointer hover moves the selection so keyboard and mouse agree.
    li.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      active = i;
      paintActive();
    });
    return li;
  }

  function paintActive() {
    [...listEl.children].forEach((li, i) => {
      const on = i === active;
      li.classList.toggle("is-active", on);
      li.setAttribute("aria-selected", String(on));
      if (on) {
        input.setAttribute("aria-activedescendant", li.id);
        li.scrollIntoView({ block: "nearest" });
      }
    });
  }

  return { open };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const escapeAttr = escapeHtml;
