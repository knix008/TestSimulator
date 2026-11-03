/* A colour chooser that opens beside the control that asked for it.
 *
 * The browser's own <input type="color"> opens a chooser the page does not own: in the desktop
 * build it stayed on screen when the user clicked somewhere else in the window. This one is a
 * plain element of the page, so it closes on any press outside it, on Escape, when the window
 * loses focus, and when the window is resized.
 *
 *   ColorPicker.open({ anchor, value, palette, recent, allowNone, labels, onInput, onChange, onClose })
 *   ColorPicker.close(commit)   → closes the open chooser (commit=false throws the edit away)
 *   ColorPicker.isOpen()
 *   ColorPicker.current()       → the open chooser's element, for tests
 *
 * Colours are "#rrggbb" strings; "" means no colour when allowNone is set.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintColorPicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SV_W = 196;
  const SV_H = 128;
  let state = null;
  let closedAnchor = null;
  let closedAt = 0;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function normalizeHex(value) {
    const text = String(value || "").trim().toLowerCase();
    let match = /^#?([0-9a-f]{6})$/.exec(text);
    if (match) return "#" + match[1];
    match = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
    if (match) return "#" + match[1] + match[1] + match[2] + match[2] + match[3] + match[3];
    return "";
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex) || "#000000";
    return {
      r: parseInt(clean.slice(1, 3), 16),
      g: parseInt(clean.slice(3, 5), 16),
      b: parseInt(clean.slice(5, 7), 16),
    };
  }

  function rgbToHex(r, g, b) {
    const part = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return "#" + part(r) + part(g) + part(b);
  }

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max ? d / max : 0, v: max };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function swatches(list, cls) {
    return (list || []).map((color) => (
      '<button type="button" class="cp-swatch ' + cls + '" data-cp-color="' + esc(color) + '" style="background:' + esc(color) + '" title="' + esc(color) + '" aria-label="' + esc(color) + '"></button>'
    )).join("");
  }

  function paintSv() {
    const canvas = state.el.querySelector(".cp-sv");
    const ctx = canvas.getContext("2d");
    const hue = hsvToRgb(state.h, 1, 1);
    ctx.fillStyle = rgbToHex(hue.r, hue.g, hue.b);
    ctx.fillRect(0, 0, SV_W, SV_H);
    const white = ctx.createLinearGradient(0, 0, SV_W, 0);
    white.addColorStop(0, "rgba(255,255,255,1)");
    white.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, SV_W, SV_H);
    const black = ctx.createLinearGradient(0, 0, 0, SV_H);
    black.addColorStop(0, "rgba(0,0,0,0)");
    black.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, SV_W, SV_H);
  }

  function paintHue() {
    const canvas = state.el.querySelector(".cp-hue");
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    [0, 60, 120, 180, 240, 300, 360].forEach((h) => {
      const c = hsvToRgb(h % 360, 1, 1);
      grad.addColorStop(h / 360, rgbToHex(c.r, c.g, c.b));
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function sync(fromHex) {
    const el = state.el;
    const rgb = hsvToRgb(state.h, state.s, state.v);
    if (!state.none) state.value = rgbToHex(rgb.r, rgb.g, rgb.b);
    const knob = el.querySelector(".cp-knob");
    knob.style.left = (state.s * SV_W) + "px";
    knob.style.top = ((1 - state.v) * SV_H) + "px";
    el.querySelector(".cp-hue-knob").style.left = (state.h / 360 * SV_W) + "px";
    const preview = el.querySelector(".cp-preview");
    preview.style.background = state.none ? "" : state.value;
    preview.classList.toggle("none", state.none);
    const hex = el.querySelector(".cp-hex");
    if (!fromHex && document.activeElement !== hex) hex.value = state.none ? "" : state.value;
    const noneBtn = el.querySelector(".cp-none");
    if (noneBtn) noneBtn.classList.toggle("on", state.none);
  }

  function setFromHex(hex, fromHex) {
    const clean = normalizeHex(hex);
    if (!clean) return false;
    const rgb = hexToRgb(clean);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // grey has no hue of its own: keep the one the user was on
    if (hsv.s > 0) state.h = hsv.h;
    state.s = hsv.s;
    state.v = hsv.v;
    state.none = false;
    paintSv();
    sync(fromHex);
    return true;
  }

  function emitInput() {
    if (state && state.onInput) state.onInput(state.none ? "" : state.value);
  }

  function place(anchor, el) {
    const box = anchor.getBoundingClientRect();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const gap = 6;
    let left = box.right + gap;
    if (left + width > window.innerWidth - 4) left = box.left - width - gap;
    if (left < 4) left = clamp(box.left, 4, Math.max(4, window.innerWidth - width - 4));
    let top = box.top;
    if (top + height > window.innerHeight - 4) top = window.innerHeight - height - 4;
    if (top < 4) top = 4;
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function drag(target, handler) {
    target.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try { target.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      handler(event);
      const move = (ev) => handler(ev);
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    });
  }

  function onOutside(event) {
    if (!state) return;
    if (state.el.contains(event.target)) return;
    if (state.anchor && state.anchor.contains(event.target)) {
      // a second press on the control that opened it closes it, and is not a new open
      event.stopPropagation();
      event.preventDefault();
      close(true);
      return;
    }
    close(true);
  }

  function onKey(event) {
    if (!state) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    } else if (event.key === "Enter" && state.el.contains(event.target)) {
      event.preventDefault();
      close(true);
    }
  }

  function onBlur() { if (state) close(true); }
  function onResize() { if (state) close(true); }

  function open(options) {
    const opts = options || {};
    close(true);
    const labels = Object.assign({ hex: "HEX", none: "None", palette: "Colours", recent: "Recent", title: "Colour" }, opts.labels || {});
    const el = document.createElement("div");
    el.className = "color-pop";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", labels.title);
    el.innerHTML =
      '<div class="cp-sv-wrap"><canvas class="cp-sv" width="' + SV_W + '" height="' + SV_H + '"></canvas><i class="cp-knob"></i></div>' +
      '<div class="cp-hue-wrap"><canvas class="cp-hue" width="' + SV_W + '" height="12"></canvas><i class="cp-hue-knob"></i></div>' +
      '<div class="cp-row"><span class="cp-preview"></span>' +
      '<label class="cp-hex-label"><span>' + esc(labels.hex) + '</span><input class="cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off"></label>' +
      (opts.allowNone ? '<button type="button" class="cp-none" title="' + esc(labels.none) + '">' + esc(labels.none) + "</button>" : "") +
      "</div>" +
      '<div class="cp-title">' + esc(labels.palette) + '</div><div class="cp-grid">' + swatches(opts.palette, "pal") + "</div>" +
      ((opts.recent || []).length ? '<div class="cp-title">' + esc(labels.recent) + '</div><div class="cp-grid">' + swatches(opts.recent, "rec") + "</div>" : "");
    document.body.appendChild(el);
    state = {
      el: el,
      anchor: opts.anchor || null,
      h: 0,
      s: 0,
      v: 0,
      none: false,
      value: "#000000",
      start: opts.value || "",
      onInput: opts.onInput,
      onChange: opts.onChange,
      onClose: opts.onClose,
    };
    paintHue();
    if (!setFromHex(opts.value || "")) {
      state.none = Boolean(opts.allowNone);
      if (!state.none) setFromHex("#000000");
      else { paintSv(); sync(); }
    }
    drag(el.querySelector(".cp-sv"), (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      state.s = clamp((event.clientX - box.left) / box.width, 0, 1);
      state.v = 1 - clamp((event.clientY - box.top) / box.height, 0, 1);
      state.none = false;
      sync();
      emitInput();
    });
    drag(el.querySelector(".cp-hue"), (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      state.h = clamp((event.clientX - box.left) / box.width, 0, 0.9999) * 360;
      state.none = false;
      paintSv();
      sync();
      emitInput();
    });
    el.querySelector(".cp-hex").addEventListener("input", (event) => {
      if (setFromHex(event.target.value, true)) emitInput();
    });
    el.addEventListener("click", (event) => {
      const sw = event.target.closest("[data-cp-color]");
      if (sw) {
        setFromHex(sw.dataset.cpColor);
        emitInput();
        if (opts.closeOnSwatch !== false) close(true);
        return;
      }
      if (event.target.closest(".cp-none")) {
        state.none = true;
        sync();
        emitInput();
        close(true);
      }
    });
    if (state.anchor) place(state.anchor, el);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    return el;
  }

  function close(commit) {
    if (!state) return false;
    const done = state;
    state = null;
    closedAnchor = done.anchor;
    closedAt = Date.now();
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", onResize);
    done.el.remove();
    const value = done.none ? "" : done.value;
    if (commit !== false) {
      if (done.onChange && value !== done.start) done.onChange(value);
    } else if (done.onInput) {
      done.onInput(done.start);
    }
    if (done.onClose) done.onClose(commit !== false ? value : done.start);
    return true;
  }

  return {
    open: open,
    close: close,
    isOpen: () => Boolean(state),
    /* true for the click that follows the press which closed the chooser from its own control */
    recentlyClosed: (anchor) => Boolean(anchor) && anchor === closedAnchor && Date.now() - closedAt < 450,
    current: () => (state ? state.el : null),
    normalizeHex: normalizeHex,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
  };
});
