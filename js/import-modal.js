// Confirmation modal for JSON import: shows what the file would actually
// change instead of the old confirm() that only told you a business count,
// and lets you merge with per-conflict "keep mine / take theirs" choices.
// Reuses the .modal-backdrop/.modal shell from styles.css.
import { diffStates, defaultChoices, applyMerge, MINE, THEIRS } from "./diff.js";

export function createImportModal(root) {
  root.innerHTML = `
    <div class="modal-backdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
        <header class="modal__header">
          <h2 id="import-modal-title">Review import</h2>
          <button type="button" class="modal__close" aria-label="Close">&times;</button>
        </header>
        <div class="import-modes" role="radiogroup" aria-label="Import mode">
          <button type="button" class="import-mode is-active" data-mode="merge" role="radio" aria-checked="true">Merge</button>
          <button type="button" class="import-mode" data-mode="replace" role="radio" aria-checked="false">Replace all</button>
          <div class="import-bulk">
            <button type="button" class="btn btn--ghost btn--small" data-bulk="mine">Keep all mine</button>
            <button type="button" class="btn btn--ghost btn--small" data-bulk="theirs">Take all theirs</button>
          </div>
        </div>
        <div class="modal__body diff-body"></div>
        <footer class="modal__footer">
          <span class="diff-warning"></span>
          <div class="modal__footer-spacer"></div>
          <button type="button" class="btn btn--ghost cancel-import">Cancel</button>
          <button type="button" class="btn btn--primary confirm-import">Import</button>
        </footer>
      </div>
    </div>
  `;

  const backdrop = root.querySelector(".modal-backdrop");
  const body = root.querySelector(".diff-body");
  const warningEl = root.querySelector(".diff-warning");
  const modesEl = root.querySelector(".import-modes");
  const modeButtons = [...root.querySelectorAll(".import-mode")];
  const bulkEl = root.querySelector(".import-bulk");

  let settle = null;
  let current = null;
  let incoming = null;
  let diff = null;
  let choices = null;
  let mode = "merge";

  function close(result) {
    backdrop.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    const done = settle;
    settle = null;
    current = incoming = diff = choices = null;
    if (done) done(result);
  }

  function onKeydown(e) {
    if (e.key === "Escape") close(null);
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-checked", String(active));
    });
    // The per-conflict choices are meaningless in replace mode, so hide the
    // bulk buttons and grey the rows out rather than leaving dead controls.
    bulkEl.hidden = mode !== "merge";
    body.classList.toggle("diff-body--replace", mode === "replace");
    warningEl.textContent = mode === "replace"
      ? "Replaces your current data entirely."
      : "Applies only the choices below.";
  }

  modesEl.addEventListener("click", (e) => {
    const modeBtn = e.target.closest(".import-mode");
    if (modeBtn) { setMode(modeBtn.dataset.mode); return; }
    const bulk = e.target.closest("[data-bulk]");
    if (bulk && choices) {
      const want = bulk.dataset.bulk === "mine" ? MINE : THEIRS;
      Object.keys(choices.businesses).forEach((id) => { choices.businesses[id] = want; });
      choices.filters = want;
      syncChoiceUi();
    }
  });

  // Choice buttons live inside the rendered diff, so delegate from the body
  // instead of rebinding after every render.
  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-choice]");
    if (!btn || mode !== "merge" || !choices) return;
    const group = btn.closest("[data-choice-key]");
    const key = group.dataset.choiceKey;
    if (key === "__filters__") choices.filters = btn.dataset.choice;
    else choices.businesses[key] = btn.dataset.choice;
    syncChoiceUi();
  });

  function syncChoiceUi() {
    body.querySelectorAll("[data-choice-key]").forEach((group) => {
      const key = group.dataset.choiceKey;
      const value = key === "__filters__" ? choices.filters : choices.businesses[key];
      group.querySelectorAll("[data-choice]").forEach((btn) => {
        const active = btn.dataset.choice === value;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
      group.closest(".diff-item")?.classList.toggle("is-declined", value === declinedValue(group));
    });
  }

  // "Declined" = the choice that means this row does nothing: skipping an
  // addition, or leaving a change/removal unapplied.
  function declinedValue(group) {
    return group.dataset.declined || MINE;
  }

  root.querySelector(".modal__close").addEventListener("click", () => close(null));
  root.querySelector(".cancel-import").addEventListener("click", () => close(null));
  root.querySelector(".confirm-import").addEventListener("click", () => {
    if (!diff) return close(null);
    close(mode === "replace" ? incoming : applyMerge(current, incoming, diff, choices));
  });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });

  // Resolves with the document to adopt, or null if the user cancelled.
  function open(currentState, incomingState) {
    current = currentState;
    incoming = incomingState;
    diff = diffStates(current, incoming);
    choices = defaultChoices(diff);
    body.innerHTML = renderDiff(diff, incoming);
    setMode("merge");
    syncChoiceUi();
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
    parts.push(section("In file, not here", "add", diff.added.map((b) => `
      <li class="diff-item diff-item--add">
        <span class="diff-swatch" style="background:${esc(b.color)}"></span>
        <span class="diff-name">${esc(b.name)}</span>
        <span class="diff-meta">${b.hours.length} hours block(s)</span>
        ${chooser(b.id, "Skip", "Add", MINE)}
      </li>`).join("")));
  }

  if (diff.removed.length) {
    parts.push(section("Here, not in file", "del", diff.removed.map((b) => `
      <li class="diff-item diff-item--del">
        <span class="diff-swatch" style="background:${esc(b.color)}"></span>
        <span class="diff-name">${esc(b.name)}</span>
        <span class="diff-meta">${b.hours.length} hours block(s)</span>
        ${chooser(b.id, "Keep", "Delete", THEIRS)}
      </li>`).join("")));
  }

  if (diff.changed.length) {
    parts.push(section("Changed", "mod", diff.changed.map(renderChanged).join("")));
  }

  if (diff.filters.length) {
    parts.push(section("Category filters", "mod", `
      <li class="diff-item diff-item--mod diff-item--block">
        <div class="diff-item__head">
          <span class="diff-name">Visibility filters</span>
          ${chooser("__filters__", "Keep mine", "Take theirs", MINE)}
        </div>
        ${diff.filters.map((f) => `
          <div class="diff-field">
            <span class="diff-field__name">${esc(f.label)}</span>
            <span class="diff-old">${f.before ? "shown" : "hidden"}</span>
            <span class="diff-arrow" aria-hidden="true">→</span>
            <span class="diff-new">${f.after ? "shown" : "hidden"}</span>
          </div>`).join("")}
      </li>`));
  }

  if (diff.unchangedCount) {
    parts.push(`<p class="diff-unchanged">${diff.unchangedCount} business(es) unchanged.</p>`);
  }

  return parts.join("");
}

// Two-button toggle. `declined` records which side is the no-op for this row
// so the UI can dim it — that differs by section (skipping an addition is
// "mine", declining a deletion is "theirs").
function chooser(key, mineLabel, theirsLabel, declined) {
  return `
    <span class="diff-choice" data-choice-key="${esc(key)}" data-declined="${esc(declined)}">
      <button type="button" data-choice="${MINE}" aria-pressed="false">${esc(mineLabel)}</button>
      <button type="button" data-choice="${THEIRS}" aria-pressed="false">${esc(theirsLabel)}</button>
    </span>`;
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
        ${chooser(entry.before.id, "Keep mine", "Take theirs", MINE)}
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
  if (diff.added.length) chips.push(`<span class="diff-chip diff-chip--add">+${diff.added.length} new</span>`);
  if (diff.removed.length) chips.push(`<span class="diff-chip diff-chip--del">−${diff.removed.length} missing</span>`);
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
