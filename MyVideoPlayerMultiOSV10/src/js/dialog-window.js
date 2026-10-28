/**
 * Desktop (Tauri): each <dialog class="modal"> opens in its own frameless window, owned by the
 * player, so it can be larger than the player or sit beside it, and the video keeps playing in
 * view — no scrim over the stage.
 *
 * How: window.open("about:blank#dialog-<id>") keeps the page's origin, so this page writes a
 * small document into the popup and moves the dialog element there (adoptNode). Its event
 * listeners and all app.js logic keep working; `findHosted(id)` lets `$()` reach the elements.
 * src-tauri/src/lib.rs creates the window hidden (on_new_window); `dialog:fit` sizes, places
 * and shows it. Closing the dialog moves the element back and only HIDES the window: it is
 * reused next time. (Creating a window while another is being destroyed can stall the
 * synchronous window.open in WebView2, so dialog windows are never destroyed while the
 * player runs — except when the user closes one with Alt+F4.)
 * The web build (and MYVIDEOPLAYER_INLINE_DIALOGS) keeps the in-page dialogs.
 */

/** @type {Map<HTMLDialogElement, { child: Window, label: string, placeholder: Comment, observer: MutationObserver, onClose: () => void }>} */
const hosted = new Map();
/** Kept windows, one per dialog id: { child, label }. */
const pool = new Map();
let openCount = 0;

export function canHostDialogs() {
  return Boolean(window.desktopAPI?.isTauri) && !window.__VP__?.inlineDialogs;
}

/** An element inside one of the dialog windows, by id. */
export function findHosted(id) {
  for (const { child } of hosted.values()) {
    try {
      const el = child.document.getElementById(id);
      if (el) return el;
    } catch {
      /* window closing */
    }
  }
  return null;
}

export function hostedDialogs() {
  return [...hosted.keys()];
}

const invoke = (channel, ...args) => window.__TAURI_INTERNALS__.invoke("vp", { channel, args });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Theme attributes and inline CSS variables follow the player page. */
function copyTheme(doc) {
  const from = document.documentElement;
  const to = doc.documentElement;
  for (const name of ["data-theme", "data-color-scheme", "data-scheme", "lang", "style"]) {
    const value = from.getAttribute(name);
    if (value == null) to.removeAttribute(name);
    else to.setAttribute(name, value);
  }
  doc.body.className = `dialog-window-body ${document.body.className}`;
}

function stylesReady(doc) {
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
  return links.every((l) => {
    try {
      return Boolean(l.sheet && l.sheet.cssRules);
    } catch {
      return false;
    }
  });
}

/** The popup for `label`, its document written and styled. */
async function openWindow(label, title) {
  const child = window.open(`about:blank#${label}`, label, "popup=yes,width=1200,height=900");
  if (!child) return null;
  const start = Date.now();
  while (Date.now() - start < 3000) {
    let doc = null;
    try {
      doc = child.document;
    } catch {
      doc = null;
    }
    if (doc?.body) {
      if (!doc.getElementById("vp-dialog-host")) {
        const base = new URL(".", location.href).href;
        doc.open();
        doc.write(
          `<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><title></title>` +
            `<link rel="stylesheet" href="styles/themes.css"><link rel="stylesheet" href="styles/main.css">` +
            `</head><body class="dialog-window-body"><div id="vp-dialog-host"></div></body></html>`,
        );
        doc.close();
        doc.title = title;
      }
      if (stylesReady(doc)) return child;
    }
    await sleep(20);
  }
  try {
    child.close();
  } catch {
    /* ignore */
  }
  return null;
}

/** Size the window to the dialog card (CSS px) and show it centred over the player. */
async function fitAndShow(dialogEl, label) {
  const card = dialogEl.querySelector(".modal-card") || dialogEl;
  // A reused window still has the last dialog's size; the card's width depends on the window
  // width (min(…, 100vw - 32px)), so grow it (hidden) before measuring.
  const win = dialogEl.ownerDocument.defaultView;
  if (win && win.innerWidth < 1100) {
    await invoke("dialog:prepare", label);
    for (let i = 0; i < 25 && win.innerWidth < 1100; i++) await sleep(20);
  }
  // Natural size first (the popup starts large), then the card fills the window.
  const rect = card.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(Math.max(rect.height, card.scrollHeight));
  dialogEl.ownerDocument.body.classList.add("is-fitted");
  await invoke("dialog:fit", label, width, height);
}

function restore(dialogEl, { closeWindow = true } = {}) {
  const entry = hosted.get(dialogEl);
  if (!entry) return;
  hosted.delete(dialogEl);
  entry.observer.disconnect();
  dialogEl.removeEventListener("close", entry.onClose);
  delete dialogEl.dataset.hosted;
  try {
    entry.placeholder.replaceWith(document.adoptNode(dialogEl));
  } catch {
    document.body.appendChild(document.adoptNode(dialogEl));
  }
  if (dialogEl.open) dialogEl.close();
  if (closeWindow) {
    try {
      entry.child.document.body.classList.remove("is-fitted");
    } catch {
      /* window gone */
    }
    invoke("dialog:hide", entry.label).catch(() => {});
  }
}

/** A kept window for this dialog, or a new one. */
async function windowFor(dialogEl, title) {
  const kept = pool.get(dialogEl.id);
  if (kept) {
    let alive = false;
    try {
      alive = !kept.child.closed && Boolean(kept.child.document.getElementById("vp-dialog-host"));
    } catch {
      alive = false;
    }
    if (alive) {
      kept.child.document.title = title;
      return kept;
    }
    pool.delete(dialogEl.id);
  }
  const label = `dialog-${dialogEl.id}-${++openCount}`;
  const child = await openWindow(label, title);
  if (!child) return null;
  const entry = { child, label };
  pool.set(dialogEl.id, entry);
  const doc = child.document;
  // Escape closes the dialog shown in this window; Alt+F4 brings the element back first.
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const shown = [...hosted.entries()].find(([, h]) => h.child === child)?.[0];
    if (shown?.open) {
      e.preventDefault();
      shown.close();
    }
  });
  child.addEventListener("pagehide", () => {
    pool.delete(dialogEl.id);
    for (const [el, h] of hosted) if (h.child === child) restore(el, { closeWindow: false });
  });
  return entry;
}

/**
 * Shows `dialogEl` in its own window. Resolves false when that is not possible (then the
 * caller shows it inside the page as before).
 */
export async function hostDialog(dialogEl) {
  if (!canHostDialogs() || !dialogEl?.id) return false;
  const existing = hosted.get(dialogEl);
  if (existing) {
    await invoke("dialog:focus", existing.label).catch(() => {});
    return true;
  }
  const title = dialogEl.querySelector(".modal-header h2")?.textContent?.trim() || document.title;
  const win = await windowFor(dialogEl, title);
  if (!win) return false;
  const { child, label } = win;

  const doc = child.document;
  copyTheme(doc);
  const observer = new MutationObserver(() => copyTheme(doc));
  observer.observe(document.documentElement, { attributes: true });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const placeholder = document.createComment(`dialog:${dialogEl.id}`);
  dialogEl.before(placeholder);
  const onClose = () => restore(dialogEl);
  hosted.set(dialogEl, { child, label, placeholder, observer, onClose });
  doc.getElementById("vp-dialog-host").appendChild(doc.adoptNode(dialogEl));
  dialogEl.dataset.hosted = "true";
  dialogEl.dataset.blocking = "false";
  dialogEl.addEventListener("close", onClose);
  dialogEl.show();

  try {
    await fitAndShow(dialogEl, label);
  } catch {
    restore(dialogEl);
    return false;
  }
  const entry = hosted.get(dialogEl);
  if (entry) entry.shown = true;
  return true;
}

/** Closes every dialog window (player page unloading). */
export function closeAllHosted() {
  for (const el of hostedDialogs()) restore(el, { closeWindow: false });
  for (const { label } of pool.values()) invoke("dialog:close", label).catch(() => {});
  pool.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", closeAllHosted);
  // For the test suite: reach elements and windows of hosted dialogs.
  window.__vpDialogs = {
    find: (id) => document.getElementById(id) || findHosted(id),
    windows: () =>
      [...hosted.entries()].map(([el, { child, label, shown }]) => ({
        id: el.id,
        label,
        shown: Boolean(shown),
        width: child.outerWidth,
        height: child.outerHeight,
        x: child.screenX,
        y: child.screenY,
      })),
  };
}
