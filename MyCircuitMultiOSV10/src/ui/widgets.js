// Small DOM widgets: modal dialogs, prompts, toasts, context menus, a
// searchable quick-pick list (command palette / part picker) and form helpers.

import { t } from "./i18n.js";
import { icon } from "./icons.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const stack = [];
const dialogWindows = new Set();

// The interactive tutorial points at dialogs inside this page, and the smoke
// test reads them here too. Everywhere else a dialog is its own window.
function dialogsStayInline() {
  if (window.mycircuitInlineDialogs) return true;
  if (document.body.classList.contains("dialog-host")) return true;
  const tut = document.querySelector(".tut-panel");
  return !!(tut && tut.style.display !== "none");
}

// about:blank keeps the opener's origin, so this page can build the dialog
// there. The name marks it for the desktop shell, which owns the window.
function hostDialog(box) {
  return new Promise((resolve) => {
    const name = `mycircuit-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let child = null;
    try { child = window.open("", name, "popup=yes,width=720,height=560"); } catch { child = null; }
    if (!child) { window.__dialogFail = "window.open returned null"; return resolve(null); }
    const start = Date.now();
    const tick = () => {
      if (child.closed) return resolve(null);
      let doc = null;
      try { doc = child.document; } catch { doc = null; }
      if (!doc || !doc.body) {
        if (Date.now() - start > 2500) {
          window.__dialogFail = "dialog document was not ready";
          try { child.close(); } catch { /* ignore */ }
          return resolve(null);
        }
        setTimeout(tick, 20);
        return;
      }
      try {
        if (!doc.getElementById("host")) {
          const base = new URL(".", location.href).href;
          doc.open();
          doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><title>MyCircuit</title><link rel="stylesheet" href="style/app.css"></head><body class="dialog-host"><div id="host"></div><script src="src/ui/dialog-host.js"></script></body></html>`);
          doc.close();
        }
        if (!child.mycircuitDialogReady) {
          if (Date.now() - start > 2500) {
            window.__dialogFail = "dialog host script did not load";
            try { child.close(); } catch { /* ignore */ }
            return resolve(null);
          }
          setTimeout(tick, 20);
          return;
        }
        child.syncDialogTheme(document.documentElement);
        doc.getElementById("host").replaceChildren(doc.adoptNode(box));
        dialogWindows.add(child);
        resolve(child);
      } catch (error) {
        window.__dialogFail = String(error && error.stack || error);
        try { child.close(); } catch { /* ignore */ }
        resolve(null);
      }
    };
    tick();
  });
}

window.addEventListener("pagehide", () => {
  for (const w of dialogWindows) { try { if (!w.closed) w.close(); } catch { /* ignore */ } }
  dialogWindows.clear();
});

// modal({title, body: Node, buttons:[{label, value, primary, danger}], width, onOpen, className})
// → Promise<value> (Escape / ✕ resolve null)
export function modal({ title, body, buttons = [{ label: t("Close"), value: null }], width = 520, onOpen, className = "", closeOnBackdrop = true, validate }) {
  return new Promise((resolve) => {
    const backdrop = h("div", { class: "modal-backdrop" });
    const box = h("div", { class: `modal ${className}`, role: "dialog", "aria-modal": "true", style: { width: typeof width === "number" ? `${width}px` : width } });
    let child = null;
    let themeObs = null;
    let settled = false;
    let keyDoc = null;
    const close = (value) => {
      if (settled) return;
      if (value !== null && validate) {
        const err = validate(value);
        if (err) { toast(err, "error"); return; }
      }
      settled = true;
      if (themeObs) themeObs.disconnect();
      backdrop.remove();
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      if (keyDoc) keyDoc.removeEventListener("keydown", onKey, true);
      dialogWindows.delete(child);
      try { if (child && !child.closed) child.close(); } catch { /* ignore */ }
      resolve(value);
    };
    box._close = close;
    // Every popup title bar shows the program icon and the window name.
    const head = h("div", { class: "modal-head" },
      h("div", { class: "modal-title" }, h("img", { class: "modal-appicon", src: "assets/icon.png", alt: "", width: 18, height: 18 }), h("span", {}, title)),
      h("button", { class: "icon-btn", title: t("Close"), onclick: () => close(null), html: icon("close", 16) }));
    const foot = h("div", { class: "modal-foot" });
    for (const b of buttons) {
      const btn = h("button", { class: `btn ${b.primary ? "primary" : ""} ${b.danger ? "danger" : ""}`, onclick: () => close(typeof b.value === "function" ? b.value() : b.value) }, b.label);
      if (b.left) btn.classList.add("left");
      foot.append(btn);
    }
    box.append(head, h("div", { class: "modal-body" }, body), foot);
    const onKey = (e) => {
      if (stack[stack.length - 1] !== entry) return;
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(null); }
      if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") {
        const primary = buttons.find((b) => b.primary);
        if (primary) { e.preventDefault(); e.stopPropagation(); close(typeof primary.value === "function" ? primary.value() : primary.value); }
      }
    };
    const bindKey = (doc) => {
      if (keyDoc) keyDoc.removeEventListener("keydown", onKey, true);
      keyDoc = doc;
      doc.addEventListener("keydown", onKey, true);
    };
    const showInline = () => {
      entry.pending = false;
      backdrop.append(box);
      backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop && closeOnBackdrop) close(null); });
      bindKey(document);
      document.body.append(backdrop);
      const first = box.querySelector("input, select, textarea");
      if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
      if (onOpen) onOpen(box, close);
    };
    const entry = { close, el: backdrop, pending: true, get win() { return child; } };
    stack.push(entry);
    if (dialogsStayInline()) { showInline(); return; }
    const probe = h("div", { style: { position: "fixed", left: "-10000px", top: "0", width: "100vw", visibility: "hidden", display: "flex" } });
    probe.append(box);
    document.body.append(probe);
    const rect = box.getBoundingClientRect();
    const pxW = Math.max(280, Math.ceil(rect.width));
    const pxH = Math.max(160, Math.ceil(rect.height));
    box.style.width = `${pxW}px`;
    probe.remove();
    hostDialog(box).then((opened) => {
      if (settled) { try { if (opened && !opened.closed) opened.close(); } catch { /* ignore */ } return; }
      if (!opened) { showInline(); return; }
      child = opened;
      child.addEventListener("pagehide", () => close(null));
      themeObs = new MutationObserver(() => { try { if (!child.closed) child.syncDialogTheme(document.documentElement); } catch { /* gone */ } });
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme", "data-theme-id", "data-ui-scale", "lang"] });
      // The dimmed main window only brings the dialog forward. Closing it is
      // the dialog's own close button, Escape, or closing the main window.
      entry.pending = false;
      backdrop.addEventListener("pointerdown", () => { try { child.focus(); } catch { /* ignore */ } });
      document.body.append(backdrop);
      bindKey(child.document);
      const place = () => {
        const left = Math.round(window.screenX + (window.outerWidth - pxW) / 2);
        const top = Math.round(window.screenY + Math.max(24, (window.outerHeight - pxH) / 2));
        return Promise.resolve(child.fitDialog(pxW, pxH, left, top));
      };
      child.requestAnimationFrame(() => child.requestAnimationFrame(() => {
        place().then(() => {
          try { child.focus(); } catch { /* ignore */ }
          const first = box.querySelector("input, select, textarea");
          if (first) { first.focus(); if (first.select) first.select(); }
          if (onOpen) onOpen(box, close);
        });
      }));
    });
  });
}

export function anyModalOpen() {
  // Ask the DOM, not the stack: a dialog removed some other way must never
  // leave the keyboard dead.
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    const alive = entry.pending || (entry.el && entry.el.isConnected) || (entry.win && !entry.win.closed);
    if (!alive) stack.splice(i, 1);
  }
  return stack.length > 0 || !!document.querySelector(".modal-backdrop, .quickpick, .popup-input");
}

export async function confirmDialog(message, { title = t("Confirm"), ok = t("OK"), cancel = t("Cancel"), danger = false } = {}) {
  const r = await modal({ title, body: h("p", { class: "confirm-text" }, message), width: 440, buttons: [{ label: cancel, value: false }, { label: ok, value: true, primary: true, danger }] });
  return !!r;
}

export async function promptDialog(message, value = "", { title = t("Input"), placeholder = "" } = {}) {
  const input = h("input", { type: "text", class: "input wide", value, placeholder });
  const r = await modal({ title, body: h("label", { class: "field" }, h("span", {}, message), input), width: 420, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: () => input.value, primary: true }] });
  return r;
}

// A tiny inline text box floating at screen coords (label names, values).
export function popupInput({ x, y, value = "", placeholder = "", onDone }) {
  const input = h("input", { class: "popup-input", value, placeholder, style: { left: `${x}px`, top: `${y}px` } });
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    const v = input.value;
    input.remove();
    onDone(ok ? v : null);
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(input.value.trim() !== "" && input.value !== value ? true : false));
  document.body.append(input);
  setTimeout(() => { input.focus(); input.select(); }, 10);
}

let toastHost = null;
export function toast(message, kind = "info", ms = 3200) {
  if (!toastHost) {
    toastHost = h("div", { class: "toast-host", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const ic = kind === "error" ? "error" : kind === "warn" ? "warning" : kind === "ok" ? "check" : "info";
  const el = h("div", { class: `toast ${kind}` }, h("span", { html: icon(ic, 16) }), h("span", {}, message));
  toastHost.append(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 400);
  return el;
}

// contextMenu([{label, icon, shortcut, action, disabled, danger} | "-"], x, y)
export function contextMenu(items, x, y) {
  closeMenus();
  const menu = h("div", { class: "ctx-menu", role: "menu" });
  for (const it of items) {
    if (it === "-") { menu.append(h("div", { class: "menu-sep" })); continue; }
    if (!it) continue;
    const row = h("button", { class: `menu-item ${it.danger ? "danger" : ""} ${it.checked ? "checked" : ""}`, disabled: it.disabled, role: "menuitem" },
      h("span", { class: "mi-icon", html: it.icon ? icon(it.icon, 16) : it.checked ? icon("check", 14) : "" }),
      h("span", { class: "mi-label" }, it.label),
      h("span", { class: "mi-key" }, it.shortcut || ""));
    row.addEventListener("click", () => { closeMenus(); if (it.action) it.action(); });
    menu.append(row);
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  function outside(e) {
    if (!menu.contains(e.target)) closeMenus();
  }
  menu._outside = outside;
  return menu;
}

export function closeMenus() {
  for (const m of document.querySelectorAll(".ctx-menu")) {
    document.removeEventListener("pointerdown", m._outside, true);
    m.remove();
  }
}

// quickPick({items:[{label, detail, hint, icon, value, preview?}], placeholder, onPick, onHover})
// Fuzzy-ish filter as you type, arrows + Enter, Escape closes.
const QP_ROWS = 10;

export function quickPick({ items, placeholder = t("Type to search…"), onPick, render, filter, initial = "", title = t("Search") }) {
  document.querySelector(".quickpick")?.remove();
  const input = h("input", { class: "qp-input", placeholder, value: initial });
  const list = h("div", { class: "qp-list" });
  // Like every popup, the picker has a title bar with the program icon and its name.
  const head = h("div", { class: "qp-head" }, h("img", { src: "assets/icon.png", width: 16, height: 16, alt: "" }), h("span", {}, title));
  const box = h("div", { class: "quickpick" }, head, h("div", { class: "qp-search" }, h("span", { html: icon("search", 16) }), input), list);
  const back = h("div", { class: "qp-backdrop" }, box);
  let shown = [];
  let hidden = 0;
  let index = 0;
  const close = () => back.remove();
  const score = (it, q) => {
    if (!q) return 1;
    const hay = `${it.label} ${it.detail || ""} ${it.keywords || ""}`.toLowerCase();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => hay.includes(w))) return 0;
    const l = it.label.toLowerCase();
    return 1 + (l.startsWith(words[0]) ? 5 : 0) + (l.includes(q.toLowerCase()) ? 2 : 0);
  };
  const update = () => {
    const q = input.value.trim();
    const all = filter ? filter(items, q) : items.map((it) => [it, score(it, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
    // No scrollbar: show the best matches and say how many more there are.
    shown = all.slice(0, QP_ROWS);
    hidden = all.length - shown.length;
    index = Math.min(index, Math.max(0, shown.length - 1));
    list.innerHTML = "";
    shown.forEach((it, i) => {
      const row = h("div", { class: `qp-item ${i === index ? "on" : ""}` },
        it.icon ? h("span", { class: "qp-icon", html: icon(it.icon, 16) }) : null,
        h("div", { class: "qp-text" }, h("div", { class: "qp-label" }, it.label), it.detail ? h("div", { class: "qp-detail" }, it.detail) : null),
        it.hint ? h("kbd", { class: "qp-hint" }, it.hint) : null);
      if (render) render(row, it);
      row.addEventListener("pointerenter", () => { index = i; mark(); });
      row.addEventListener("click", () => { close(); onPick(it); });
      list.append(row);
    });
    if (!shown.length) list.append(h("div", { class: "qp-empty" }, t("No matches")));
    if (hidden > 0) list.append(h("div", { class: "qp-more" }, t("{n} more — keep typing to narrow the list", { n: hidden })));
  };
  const mark = () => {
    [...list.children].forEach((c, i) => c.classList.toggle("on", i === index));
    const el = list.children[index];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { index = 0; update(); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") { index = Math.min(shown.length - 1, index + 1); mark(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { index = Math.max(0, index - 1); mark(); e.preventDefault(); }
    else if (e.key === "Enter") { const it = shown[index]; close(); if (it) onPick(it); }
    else if (e.key === "Escape") close();
  });
  back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
  document.body.append(back);
  update();
  setTimeout(() => input.focus(), 10);
  return { close };
}

// ---------------------------------------------------------------- paging
// Popups never scroll: long lists are split into pages with numbered tabs.
// pager(items, perPage, render(slice, offset) → Node) → Node
export function pager(items, perPage, render) {
  const wrap = h("div", { class: "pager" });
  const body = h("div", { class: "pager-body" });
  const tabsEl = h("div", { class: "pager-tabs" });
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  let page = 0;
  const show = () => {
    body.innerHTML = "";
    body.append(render(items.slice(page * perPage, (page + 1) * perPage), page * perPage));
    tabsEl.innerHTML = "";
    if (pages < 2) return;
    tabsEl.append(h("span", { class: "pager-info" }, `${page * perPage + 1}–${Math.min(items.length, (page + 1) * perPage)} / ${items.length}`));
    for (let i = 0; i < pages; i++) {
      tabsEl.append(h("button", { class: `pager-tab ${i === page ? "on" : ""}`, onclick: () => { page = i; show(); } }, String(i + 1)));
    }
  };
  wrap.append(body, tabsEl);
  wrap.showPage = (i) => { page = Math.max(0, Math.min(pages - 1, i)); show(); };
  show();
  return wrap;
}

// ---------------------------------------------------------------- forms
// field(label, control, hint?) → <label class="field">
export function field(label, control, hint) {
  // A <label> would forward clicks on its text to the stepper's "−" button.
  const tag = control && control.classList && control.classList.contains("stepper") ? "div" : "label";
  return h(tag, { class: "field" }, h("span", { class: "field-label" }, label), control, hint ? h("small", { class: "field-hint" }, hint) : null);
}

export function input(value, { type = "text", step, min, max, placeholder, onInput, onChange, list, cls = "" } = {}) {
  const el = h("input", { class: `input ${cls}`, type, value: value ?? "", step, min, max, placeholder, list });
  if (onInput) el.addEventListener("input", () => onInput(el.value, el));
  if (onChange) el.addEventListener("change", () => onChange(el.value, el));
  return el;
}

export function select(value, options, { onChange, cls = "" } = {}) {
  const el = h("select", { class: `input ${cls}` });
  for (const o of options) {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    const opt = h("option", { value: v }, label);
    if (String(v) === String(value)) opt.selected = true;
    el.append(opt);
  }
  if (onChange) el.addEventListener("change", () => onChange(el.value, el));
  return el;
}

// Numeric setting: [−] value [+], value centred. Either a range (min/max/step)
// or a list of allowed values. Arrow keys step too; holding a button repeats.
// editable: the value is a centred text box that also accepts typing.
export function stepper(value, { min = -Infinity, max = Infinity, step = 1, values = null, format = (v) => String(v), onChange, editable = false } = {}) {
  let v = Number(value);
  const out = editable ? h("input", { class: "stepper-val", type: "text", inputmode: "decimal", spellcheck: "false" }) : h("span", { class: "stepper-val" });
  const dec = h("button", { class: "stepper-btn", type: "button", title: t("Decrease"), "aria-label": t("Decrease"), "data-step": "-1" }, "−");
  const inc = h("button", { class: "stepper-btn", type: "button", title: t("Increase"), "aria-label": t("Increase"), "data-step": "1" }, "+");
  const nearest = () => {
    let best = 0;
    for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - v) < Math.abs(values[best] - v)) best = i;
    return best;
  };
  const render = () => {
    if (editable) out.value = format(v); else out.textContent = format(v);
    if (values) { const i = nearest(); dec.disabled = i <= 0; inc.disabled = i >= values.length - 1; }
    else { dec.disabled = v <= min + 1e-9; inc.disabled = v >= max - 1e-9; }
  };
  const move = (dir) => {
    let nv;
    if (values) nv = values[Math.min(values.length - 1, Math.max(0, nearest() + dir))];
    else nv = +Math.min(max, Math.max(min, v + dir * step)).toFixed(6);
    if (nv === v) return;
    v = nv;
    render();
    if (onChange) onChange(v);
  };
  for (const [b, dir] of [[dec, -1], [inc, 1]]) {
    let timer = null;
    const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
    b.addEventListener("click", (e) => { if (e.detail === 0 || !b.dataset.held) move(dir); delete b.dataset.held; });
    b.addEventListener("pointerdown", () => { stop(); timer = setTimeout(() => { b.dataset.held = "1"; timer = setInterval(() => move(dir), 90); }, 450); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
  }
  const el = h("div", { class: `stepper${editable ? " editable" : ""}`, tabindex: editable ? "-1" : "0", role: "spinbutton" }, dec, out, inc);
  el.addEventListener("keydown", (e) => {
    e.stopPropagation(); // editor shortcuts must not fire while stepping a value
    if (editable && e.target === out && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return; // move the caret
    if (editable && e.key === "Enter") { out.blur(); return; }
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (d) { e.preventDefault(); move(d); }
  });
  if (editable) {
    out.addEventListener("change", () => {
      const n = parseFloat(String(out.value).replace(",", "."));
      if (!Number.isFinite(n)) { render(); return; }
      const nv = Math.min(max, Math.max(min, n));
      if (nv === v) { render(); return; }
      v = nv;
      render();
      if (onChange) onChange(v);
    });
  }
  el.getValue = () => v;
  el.setValue = (nv) => { v = Number(nv); render(); };
  render();
  return el;
}

export function checkbox(checked, label, { onChange, icon: iconName } = {}) {
  const box = h("input", { type: "checkbox" });
  box.checked = !!checked;
  if (onChange) box.addEventListener("change", () => onChange(box.checked, box));
  return h("label", { class: "check" }, box, iconName ? h("span", { class: "check-ico", html: icon(iconName, 14) }) : null, h("span", {}, label));
}

export function tabs(defs) {
  // defs: [{id, label, body: Node}]
  const bar = h("div", { class: "tabs" });
  const host = h("div", { class: "tab-bodies" });
  const show = (id) => {
    for (const b of bar.children) b.classList.toggle("on", b.dataset.id === id);
    // Hidden pages leave the layout, so the dialog is only as tall as the
    // page that is open.
    for (const d of defs) {
      const off = d.id !== id;
      d.body.classList.toggle("tab-hidden", off);
      if (off) d.body.setAttribute("aria-hidden", "true"); else d.body.removeAttribute("aria-hidden");
    }
  };
  for (const d of defs) {
    bar.append(h("button", { class: "tab", "data-id": d.id, onclick: () => show(d.id) }, d.label));
    host.append(d.body);
  }
  show(defs[0].id);
  return h("div", { class: "tabbed" }, bar, host);
}
