// On-screen scale bar for the floor plan and the 3D view: a bar of a round
// length (1, 2 or 5 × 10ⁿ, or inches / feet) that follows the zoom. It can be
// dragged anywhere over its view with the mouse; the place is kept in the
// settings (scaleBarPos) as a fraction of the view's size, so it stays put
// when the window is resized. A double-click puts it back in its corner
// (bottom right: the plan's level bar and the 3D gizmo are bottom left).

import { h } from "./widgets.js";
import { t } from "./i18n.js";

const TARGET_PX = 120; // about how long the bar is on screen
const INCH = 25.4, FOOT = 304.8;

// Round lengths (mm) a bar may have, shortest first.
function candidates(imperial) {
  const out = [];
  if (imperial) {
    for (const i of [1, 2, 6]) out.push(i * INCH);
    for (let p = 1; p <= 1e5; p *= 10) for (const k of [1, 2, 5]) out.push(k * p * FOOT);
  } else {
    for (let p = 0.1; p <= 1e8; p *= 10) for (const k of [1, 2, 5]) out.push(+(k * p).toPrecision(3));
  }
  return out;
}

// The round length (mm) whose bar comes closest to TARGET_PX.
export function niceLength(pxPerMm, imperial = false) {
  let best = null, err = Infinity;
  for (const L of candidates(imperial)) {
    const e = Math.abs(Math.log((L * pxPerMm) / TARGET_PX));
    if (e < err) { err = e; best = L; }
  }
  return best;
}

export function formatLength(mm, imperial = false) {
  const num = (v) => String(+v.toPrecision(4));
  if (imperial) return mm < FOOT ? `${num(mm / INCH)} in` : `${num(mm / FOOT)} ft`;
  if (mm >= 1e6) return `${num(mm / 1e6)} km`;
  if (mm >= 1000) return `${num(mm / 1000)} m`;
  if (mm >= 10) return `${num(mm / 10)} cm`;
  return `${num(mm)} mm`;
}

// host: the view element the bar floats in (positioned). view: "plan" | "3d".
// pxPerMm(): screen (CSS) pixels per millimetre now, or 0 when unknown.
// shown(): whether the bar is on. home: its corner before it is moved.
// target(): the canvas under the bar, which gets the wheel turned over it.
export function createScaleBar(app, host, { view, pxPerMm, shown, target = () => null, imperial = () => false, home = { right: 16, bottom: 16 }, note = "" }) {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  const el = h("div", { class: "scale-bar", "data-scale-bar": view, title: `${t("Scale bar")}${note ? ` — ${note}` : ""}\n${t("Drag to move it; double-click puts it back.")}` }, svg);
  host.append(el);
  let last = "";

  const place = () => {
    const pos = (app.settings.scaleBarPos || {})[view];
    const W = host.clientWidth, H = host.clientHeight, w = el.offsetWidth, hh = el.offsetHeight;
    if (!W || !H) return;
    let x, y;
    if (pos) { x = pos.fx * Math.max(0, W - w); y = pos.fy * Math.max(0, H - hh); }
    else { x = home.left ?? W - w - (home.right ?? 16); y = H - hh - (home.bottom ?? 16); }
    el.style.left = `${Math.round(Math.max(0, Math.min(W - w, x)))}px`;
    el.style.top = `${Math.round(Math.max(0, Math.min(H - hh, y)))}px`;
  };

  function draw(px, L, imp) {
    const segs = 4, bar = Math.round(L * px), pad = 8, top = 16, hgt = 6;
    const W = bar + pad * 2, H = top + hgt + 4;
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const parts = [];
    for (let i = 0; i < segs; i++) {
      const x = pad + (bar * i) / segs;
      parts.push(`<rect x="${x.toFixed(1)}" y="${top}" width="${(bar / segs).toFixed(1)}" height="${hgt}" class="${i % 2 ? "sb-light" : "sb-dark"}"/>`);
    }
    parts.push(`<rect x="${pad}" y="${top}" width="${bar}" height="${hgt}" class="sb-frame"/>`);
    const label = (x, s, anchor) => parts.push(`<text x="${x}" y="${top - 4}" text-anchor="${anchor}">${s}</text>`);
    label(pad, "0", "start");
    label(pad + bar / 2, formatLength(L / 2, imp).replace(/ .*/, ""), "middle");
    label(pad + bar, formatLength(L, imp), "end");
    svg.innerHTML = parts.join("");
  }

  function update() {
    const on = shown();
    el.hidden = !on;
    if (!on) return;
    const px = pxPerMm();
    if (!(px > 0) || !Number.isFinite(px)) { el.hidden = true; return; }
    const imp = !!imperial();
    const L = niceLength(px, imp);
    const key = `${L}|${Math.round(L * px)}|${imp}|${host.clientWidth}x${host.clientHeight}`;
    if (key === last) return;
    last = key;
    draw(px, L, imp);
    place();
  }

  // Dragging: the bar follows the pointer, kept inside the view.
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const move = (ev) => {
      const W = host.clientWidth, H = host.clientHeight, w = el.offsetWidth, hh = el.offsetHeight;
      const x = Math.max(0, Math.min(W - w, ev.clientX - hr.left - dx));
      const y = Math.max(0, Math.min(H - hh, ev.clientY - hr.top - dy));
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.classList.remove("dragging");
      const W = host.clientWidth, H = host.clientHeight, w = el.offsetWidth, hh = el.offsetHeight;
      const fx = W > w ? parseFloat(el.style.left) / (W - w) : 0, fy = H > hh ? parseFloat(el.style.top) / (H - hh) : 0;
      app.settings.scaleBarPos = { ...(app.settings.scaleBarPos || {}), [view]: { fx: +fx.toFixed(4), fy: +fy.toFixed(4) } };
      app.saveSettings();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
  el.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const pos = { ...(app.settings.scaleBarPos || {}) };
    delete pos[view];
    app.settings.scaleBarPos = pos;
    app.saveSettings();
    place();
  });
  // The wheel zooms the view under the bar as if the bar were not there.
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const c = target();
    if (c) c.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true }));
  }, { passive: false });
  for (const type of ["contextmenu", "click"]) el.addEventListener(type, (e) => { e.preventDefault(); e.stopPropagation(); });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { last = ""; update(); }).observe(host);

  return { el, update: () => update(), refresh: () => { last = ""; update(); } };
}
