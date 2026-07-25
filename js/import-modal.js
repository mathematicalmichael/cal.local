// Confirmation modal for JSON import: shows what the file would actually
// change instead of the old confirm() that only told you a business count.
// Reuses the .modal-backdrop/.modal shell from styles.css.
import { diffStates } from "./diff.js";

export function createImportModal(root) {
  root.innerHTML = `
    <div class="modal-backdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
        <header class="modal__header">
          <h2 id="import-modal-title">Review import</h2>
          <button type="button" class="modal__close" aria-label="Close">&times;</button>
        </header>
        <div class="modal__body diff-body"></div>
        <footer class="modal__footer">
          <span class="diff-warning">Importing replaces your current data.</span>
          <div class="modal__footer-spacer"></div>
          <button type="button" class="btn btn--ghost cancel-import">Cancel</button>
          <button type="button" class="btn btn--primary confirm-import">Import</button>
        </footer>
      </div>
    </div>
  `;

  const backdrop = root.querySelector(".modal-backdrop");
  const body = root.querySelector(".diff-body");
  let settle = null;

  function close(result) {
    backdrop.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    const done = settle;
    settle = null;
    if (done) done(result);
  }

  function onKeydown(e) {
    if (e.key === "Escape") close(false);
  }

  root.querySelector(".modal__close").addEventListener("click", () => close(false));
  root.querySelector(".cancel-import").addEventListener("click", () => close(false));
  root.querySelector(".confirm-import").addEventListener("click", () => close(true));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });

  // Resolves true if the user confirmed the import, false otherwise.
  function open(current, incoming) {
    body.innerHTML = renderDiff(diffStates(current, incoming), incoming);
    backdrop.hidden = false;
    document.addEventListener("keydown", onKeydown);
    root.querySelector(".confirm-import").focus();
    return new Promise((resolve) => { settle = resolve; });
  }

  return { open };
}

function renderDiff(diff, incoming) {
  if (diff.isNoop) {
    return `<p class="diff-empty">This file matches your current data exactly — importing would change nothing.</p>`;
  }

  const parts = [`<div class="diff-summary">${summaryChips(diff, incoming)}</div>`];

  if (diff.added.length) {
    parts.push(section("Added", "add", diff.added.map((b) => `
      <li class="diff-item diff-item--add">
        <span class="diff-swatch" style="background:${esc(b.color)}"></span>
        <span class="diff-name">${esc(b.name)}</span>
        <span class="diff-meta">${b.hours.length} hours block(s)</span>
      </li>`).join("")));
  }

  if (diff.removed.length) {
    parts.push(section("Removed", "del", diff.removed.map((b) => `
      <li class="diff-item diff-item--del">
        <span class="diff-swatch" style="background:${esc(b.color)}"></span>
        <span class="diff-name">${esc(b.name)}</span>
        <span class="diff-meta">${b.hours.length} hours block(s)</span>
      </li>`).join("")));
  }

  if (diff.changed.length) {
    parts.push(section("Changed", "mod", diff.changed.map(renderChanged).join("")));
  }

  if (diff.filters.length) {
    parts.push(section("Category filters", "mod", diff.filters.map((f) => `
      <li class="diff-item diff-item--mod">
        <span class="diff-name">${esc(f.label)}</span>
        <span class="diff-meta">${f.before ? "shown" : "hidden"} → <strong>${f.after ? "shown" : "hidden"}</strong></span>
      </li>`).join("")));
  }

  if (diff.unchangedCount) {
    parts.push(`<p class="diff-unchanged">${diff.unchangedCount} business(es) unchanged.</p>`);
  }

  return parts.join("");
}

function renderChanged(entry) {
  const rows = entry.changes.map((c) => `
    <div class="diff-field">
      <span class="diff-field__name">${esc(c.field)}</span>
      <span class="diff-old">${esc(c.before)}</span>
      <span class="diff-arrow" aria-hidden="true">→</span>
      <span class="diff-new">${esc(c.after)}</span>
    </div>`);

  const listRows = (items, cls, prefix) =>
    items.map((s) => `<div class="diff-field"><span class="${cls}">${prefix} ${esc(s)}</span></div>`).join("");

  return `
    <li class="diff-item diff-item--mod diff-item--block">
      <div class="diff-item__head">
        <span class="diff-swatch" style="background:${esc(entry.after.color)}"></span>
        <span class="diff-name">${esc(entry.after.name || entry.before.name)}</span>
      </div>
      ${rows.join("")}
      ${listRows(entry.hours.added, "diff-new", "+ hours")}
      ${listRows(entry.hours.removed, "diff-old", "− hours")}
      ${listRows(entry.exceptions.added, "diff-new", "+ exception")}
      ${listRows(entry.exceptions.removed, "diff-old", "− exception")}
    </li>`;
}

function summaryChips(diff, incoming) {
  const chips = [
    `<span class="diff-chip">${incoming.businesses.length} in file</span>`,
  ];
  if (diff.added.length) chips.push(`<span class="diff-chip diff-chip--add">+${diff.added.length} added</span>`);
  if (diff.removed.length) chips.push(`<span class="diff-chip diff-chip--del">−${diff.removed.length} removed</span>`);
  if (diff.changed.length) chips.push(`<span class="diff-chip diff-chip--mod">${diff.changed.length} changed</span>`);
  return chips.join("");
}

function section(title, kind, inner) {
  return `
    <section class="diff-section diff-section--${kind}">
      <h3 class="diff-section__title">${title}</h3>
      <ul class="diff-list" role="list">${inner}</ul>
    </section>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
