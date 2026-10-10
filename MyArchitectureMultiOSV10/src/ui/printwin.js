// The print window: File → Print (Ctrl+P) and File → Export plan as PDF.
// A large window inside the editor with its own title bar (program icon,
// name, ✕): detailed page settings on the left, a live preview of the real
// sheets on the right. Print sends the sheets straight to the chosen printer
// (desktop: webContents.print, silent) — no second system dialog. The web
// build has no printer access and hands over to the browser's print dialog.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, select, checkbox } from "./widgets.js";
import * as platform from "./platform.js";
import { SvgContext } from "./svgctx.js";
import { printTheme } from "./exports.js";
import { drawPlan, planBounds } from "../plan/render.js";
import { levelById } from "../core/project.js";

// Paper sizes in mm, long side first.
export const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841], A5: [210, 148], Letter: [279.4, 215.9], Legal: [355.6, 215.9], Tabloid: [431.8, 279.4] };
export const SCALES = [20, 50, 75, 100, 150, 200, 250, 500, 1000];
// Electron knows these by name; anything else is sent as a size in microns.
const NAMED_PAGES = new Set(["A0", "A1", "A2", "A3", "A4", "A5", "Letter", "Legal", "Tabloid"]);
export const MARGIN_PRESETS = { none: 0, narrow: 5, normal: 10, wide: 20 };
const ZOOMS = [0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const PX_PER_MM = 96 / 25.4;
const FONT = '"Segoe UI", "Malgun Gothic", sans-serif';

const baseName = (app) => (app.store.project.meta.title || "project").replace(/[\\/:*?"<>|\s]+/g, "_");
const clampNum = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

// Sheet size [W, H] in mm, orientation applied.
export function sheetSize(cfg) {
  let [a, b] = cfg.paper === "custom" ? [clampNum(cfg.customW, 50, 2000, 420), clampNum(cfg.customH, 50, 2000, 297)] : (PAPER[cfg.paper] || PAPER.A3);
  if (a < b) [a, b] = [b, a];
  return cfg.landscape ? [a, b] : [b, a];
}

// Margins in mm, kept small enough to leave a usable drawing area.
export function sheetMargins(cfg) {
  const [W, H] = sheetSize(cfg);
  const m = cfg.marginPreset === "custom" ? cfg.margins || {} : null;
  const d = MARGIN_PRESETS[cfg.marginPreset] ?? 10;
  const v = (k, span) => clampNum(m ? m[k] : d, 0, Math.max(0, span * 0.3), d);
  return { top: v("top", H), right: v("right", W), bottom: v("bottom", H), left: v("left", W) };
}

// Where everything goes on one sheet (mm).
function sheetLayout(cfg) {
  const [W, H] = sheetSize(cfg);
  const M = sheetMargins(cfg);
  const frame = { x1: M.left, y1: M.top, x2: W - M.right, y2: H - M.bottom };
  const header = cfg.header ? { x1: frame.x1, x2: frame.x2, y: frame.y1 + 4 } : null;
  if (header) frame.y1 += 7;
  const footer = cfg.footer ? { x1: frame.x1, x2: frame.x2, y: frame.y2 - 1.5 } : null;
  if (footer) frame.y2 -= 7;
  const pad = cfg.border ? 4 : 0;
  const tbH = 28, tbW = Math.min(170, frame.x2 - frame.x1);
  const band = cfg.titleBlock || cfg.north;
  const area = { x1: frame.x1 + pad, y1: frame.y1 + pad, x2: frame.x2 - pad, y2: frame.y2 - (band ? tbH + 6 : pad) };
  return { W, H, M, frame, header, footer, area, tbH, tbW };
}

export function sheetScale(app, level, cfg) {
  const L = sheetLayout(cfg);
  const b = planBounds(app.store.project, level) || { x1: 0, y1: 0, x2: 10000, y2: 8000 };
  const bw = b.x2 - b.x1 + 1200, bh = b.y2 - b.y1 + 1200;
  const aw = Math.max(10, L.area.x2 - L.area.x1), ah = Math.max(10, L.area.y2 - L.area.y1);
  let scale;
  if (cfg.scale === "fit") {
    const raw = Math.max(bw / aw, bh / ah);
    scale = SCALES.find((s) => s >= raw) || Math.ceil(raw / 100) * 100;
  } else scale = clampNum(cfg.scale === "custom" ? cfg.customScale : cfg.scale, 1, 100000, 100);
  return { scale, fits: bw / scale <= aw + 0.5 && bh / scale <= ah + 0.5, b, L };
}

let clipSeq = 0;

// One drawing sheet → { svg (sized in paper mm), W, H, scale, fits }.
export function renderSheet(app, level, cfg, index = 1, count = 1) {
  const p = app.store.project;
  const { scale, fits, b, L } = sheetScale(app, level, cfg);
  const { W, H, frame, area, tbH, tbW } = L;
  const ctx = new SvgContext(W, H);
  const k = 1 / scale;
  // The plan, clipped to its drawing area (a fixed scale may not fit).
  const clipId = `sheet-clip-${++clipSeq}`;
  ctx.parts.push(`<defs><clipPath id="${clipId}"><rect x="${area.x1}" y="${area.y1}" width="${Math.max(0, area.x2 - area.x1)}" height="${Math.max(0, area.y2 - area.y1)}"/></clipPath></defs><g clip-path="url(#${clipId})">`);
  ctx.save();
  if (cfg.centre) {
    const cx = (area.x1 + area.x2) / 2, cy = (area.y1 + area.y2) / 2;
    ctx.setTransform(k, 0, 0, k, cx - ((b.x1 + b.x2) / 2) * k, cy - ((b.y1 + b.y2) / 2) * k);
  } else ctx.setTransform(k, 0, 0, k, area.x1 - (b.x1 - 600) * k, area.y1 - (b.y1 - 600) * k);
  drawPlan(ctx, p, printTheme(cfg.mono), {
    level, lw: 0.18 * scale, px: 0.06 * scale, print: true, units: app.settings.units, models: new Map(p.models.map((x) => [x.id, x])), labels: { up: t("UP") },
    show: { ghost: false, underlays: false, furniture: cfg.furniture, dims: cfg.dims, areas: cfg.areas, roofs: cfg.roofs, drawings: cfg.drawings, texts: cfg.texts, grids: cfg.grids },
  });
  ctx.restore();
  ctx.parts.push("</g>");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ink = "#000000";
  const label = (s, x, y, size, { bold = false, align = "left", color = ink } = {}) => { ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x, y); };
  const small = (s, x, y) => label(s, x, y, 1.8, { color: "#555555" });
  const lv = levelById(p, level);
  const date = p.meta.date || new Date().toLocaleDateString();
  ctx.strokeStyle = ink;
  if (cfg.border) { ctx.lineWidth = 0.5; ctx.strokeRect(frame.x1, frame.y1, frame.x2 - frame.x1, frame.y2 - frame.y1); }
  if (L.header) {
    label(p.meta.title || t("Untitled"), L.header.x1, L.header.y, 3, { bold: true, color: "#222222" });
    label(date, L.header.x2, L.header.y, 2.6, { align: "right", color: "#444444" });
  }
  if (L.footer) {
    label(t("Page {i} of {n}", { i: index, n: count }), (L.footer.x1 + L.footer.x2) / 2, L.footer.y, 2.6, { align: "center", color: "#444444" });
    label(`${t("Floor plan")} — ${lv ? lv.name : ""}`, L.footer.x1, L.footer.y, 2.4, { color: "#666666" });
  }
  if (cfg.titleBlock) {
    const tx = frame.x2 - tbW, ty = frame.y2 - tbH;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(tx, ty, tbW, tbH);
    ctx.strokeRect(tx, ty, tbW, tbH);
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 10); ctx.lineTo(tx + tbW, ty + 10);
    ctx.moveTo(tx, ty + 19); ctx.lineTo(tx + tbW, ty + 19);
    ctx.moveTo(tx + tbW * 0.55, ty + 10); ctx.lineTo(tx + tbW * 0.55, ty + tbH);
    ctx.moveTo(tx + tbW * 0.78, ty + 10); ctx.lineTo(tx + tbW * 0.78, ty + tbH);
    ctx.stroke();
    label(p.meta.title || t("Untitled"), tx + 3, ty + 6.2, 4.2, { bold: true });
    small([p.meta.client, p.meta.address].filter(Boolean).join(" · "), tx + 3, ty + 9);
    small(t("Drawing"), tx + 2, ty + 12.4); label(`${t("Floor plan")} — ${lv ? lv.name : ""}`, tx + 2, ty + 17, 3.2, { bold: true });
    small(t("Drawing scale"), tx + tbW * 0.55 + 2, ty + 12.4); label(`1:${scale}`, tx + tbW * 0.55 + 2, ty + 17, 3.2);
    small(t("Sheet"), tx + tbW * 0.78 + 2, ty + 12.4); label(`${index} / ${count}`, tx + tbW * 0.78 + 2, ty + 17, 3.2);
    small(t("Drawn by"), tx + 2, ty + 21.4); label(p.meta.author || "—", tx + 2, ty + 26, 2.8);
    small(t("Date"), tx + tbW * 0.55 + 2, ty + 21.4); label(p.meta.date || "", tx + tbW * 0.55 + 2, ty + 26, 2.8);
    small(t("Rev."), tx + tbW * 0.78 + 2, ty + 21.4); label(p.meta.rev || "", tx + tbW * 0.78 + 2, ty + 26, 2.8);
  }
  if (cfg.north) {
    // North arrow and a scale bar divided in fifths, bottom left.
    const nx = frame.x1 + 14, ny = frame.y2 - 16;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(((p.meta.north || 0) * Math.PI) / 180);
    ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(2.6, 4); ctx.lineTo(0, 2); ctx.lineTo(-2.6, 4); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
    ctx.font = "bold 3.4px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("N", 0, -8.5);
    ctx.restore();
    const len = [1000, 2000, 5000, 10000, 20000].find((v) => v / scale >= 25) || 50000;
    const sx = frame.x1 + 30, sy = frame.y2 - 9, sw = len / scale;
    ctx.lineWidth = 0.25;
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : ink; ctx.fillRect(sx + (sw * i) / 5, sy, sw / 5, 1.6); }
    ctx.strokeRect(sx, sy, sw, 1.6);
    ctx.font = "2.2px sans-serif"; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("0", sx, sy - 0.8); ctx.fillText(`${len / 1000} m`, sx + sw, sy - 0.8);
  }
  return { svg: ctx.toString("#ffffff"), W, H, scale, fits };
}

// Kept for older callers: the classic sheet (frame, title block, north arrow).
export function sheetSvg(app, level, cfg, index = 1, count = 1) {
  return renderSheet(app, level, { ...defaultContent(app), ...cfg, marginPreset: "normal", centre: true, border: true, titleBlock: true, north: true, header: false, footer: false }, index, count);
}

function defaultContent(app) {
  const s = app.settings;
  return { furniture: s.showFurniture !== false, dims: s.showDims !== false, areas: s.showAreas !== false, roofs: true, drawings: true, texts: true, grids: true };
}

// "1-3, 5" → [0, 1, 2, 4] (0-based, within n); null when it says nothing usable.
export function parseRange(text, n) {
  const out = new Set();
  for (const part of String(text || "").split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d*))?$/);
    if (!m) return null;
    const a = +m[1], b = m[2] === undefined ? a : m[2] === "" ? n : +m[2];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= n) out.add(i - 1);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

// Remembered between sessions (app settings → print).
const REMEMBER = ["printer", "paper", "customW", "customH", "landscape", "marginPreset", "margins", "mono", "centre", "border", "titleBlock", "north", "header", "footer"];

function initialConfig(app) {
  const p = app.store.project;
  const saved = app.settings.print || {};
  const cfg = {
    printer: "", copies: 1, paper: app.settings.defaultPaper || "A3", customW: 420, customH: 297, landscape: true,
    marginPreset: "normal", margins: { top: 10, right: 10, bottom: 10, left: 10 },
    scale: String(p.meta.scale || 100), customScale: p.meta.scale || 100, centre: true, mono: false,
    ...defaultContent(app), border: true, titleBlock: true, north: true, header: false, footer: false,
    levels: new Set([app.plan.level]), range: "all", rangeText: "",
  };
  for (const k of REMEMBER) if (saved[k] !== undefined) cfg[k] = k === "margins" ? { ...cfg.margins, ...saved.margins } : saved[k];
  // The default paper in Settings wins when it was changed after the last print.
  if (saved.paper && saved.paper !== "custom" && app.settings.defaultPaper && saved.defaultPaper !== app.settings.defaultPaper) cfg.paper = app.settings.defaultPaper;
  if (cfg.paper !== "custom" && !PAPER[cfg.paper]) cfg.paper = "A3";
  if (!SCALES.includes(+cfg.scale)) { cfg.customScale = +cfg.scale; cfg.scale = "custom"; }
  return cfg;
}

function remember(app, cfg) {
  const keep = {};
  for (const k of REMEMBER) keep[k] = cfg[k];
  keep.defaultPaper = cfg.paper !== "custom" ? cfg.paper : app.settings.defaultPaper;
  app.settings.print = keep;
  if (cfg.paper !== "custom") app.settings.defaultPaper = cfg.paper;
  app.saveSettings();
}

// ---------------------------------------------------------------- small controls
const num = (value, { min, max, step = 1, onChange, width } = {}) => {
  const el = h("input", { class: "input num", type: "number", value, min, max, step, style: width ? { width } : null });
  el.addEventListener("change", () => { const v = clampNum(el.value, min ?? -Infinity, max ?? Infinity, value); el.value = v; onChange(v); });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  return el;
};

function segmented(value, options, onChange) {
  const wrap = h("div", { class: "pw-seg", role: "radiogroup" });
  const paint = () => { for (const b of wrap.children) b.classList.toggle("on", b.dataset.value === String(value)); };
  for (const [v, label, ic] of options) {
    wrap.append(h("button", { type: "button", class: "pw-seg-btn", "data-value": String(v), role: "radio", onclick: () => { value = v; paint(); onChange(v); } },
      ic ? h("span", { class: "pw-seg-ico", html: ic }) : null, h("span", {}, label)));
  }
  paint();
  wrap.setValue = (v) => { value = v; paint(); };
  return wrap;
}

const row = (label, control, cls = "") => h("div", { class: `pw-row ${cls}` }, h("span", { class: "pw-label" }, label), h("div", { class: "pw-ctl" }, control));

function section(id, title, ic, open, ...children) {
  const d = h("details", { class: "pw-section", "data-section": id, open }, h("summary", {}, h("span", { class: "pw-sum-ico", html: icon(ic, 14) }), h("span", {}, title)), h("div", { class: "pw-section-body" }, ...children));
  return d;
}

const pageIcon = (land) => `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="${land ? 1.5 : 3.5}" y="${land ? 3.5 : 1.5}" width="${land ? 13 : 9}" height="${land ? 9 : 13}" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

// ---------------------------------------------------------------- the window
export async function printWindow(app, { pdf = false } = {}) {
  const p = app.store.project;
  const cfg = initialConfig(app);
  const desktop = platform.isDesktop;
  let index = 0;
  let zoom = "fit";

  const sheetLevels = () => p.levels.filter((l) => cfg.levels.has(l.id)).map((l) => l.id);
  // The sheets that will print, in order: [{level, n (1-based of all)}].
  const jobPages = () => {
    const all = sheetLevels();
    const pick = cfg.range === "custom" ? parseRange(cfg.rangeText, all.length) : all.map((_, i) => i);
    return (pick || []).map((i) => ({ level: all[i], n: i + 1, of: all.length }));
  };
  const renderPages = () => jobPages().map((pg) => ({ ...pg, title: `${t("Floor plan")} — ${levelById(p, pg.level).name}`, ...renderSheet(app, pg.level, cfg, pg.n, pg.of) }));

  // ---- right: preview
  const stage = h("div", { class: "print-stage pw-stage" });
  const pageInfo = h("span", { class: "pw-pageinfo" });
  const prevBtn = h("button", { class: "icon-btn pw-prev", title: t("Previous page"), html: icon("chevronLeft", 16), onclick: () => { index--; draw(); } });
  const nextBtn = h("button", { class: "icon-btn pw-next", title: t("Next page"), html: icon("chevronRight", 16), onclick: () => { index++; draw(); } });
  const zoomLabel = h("span", { class: "pw-zoomlabel" });
  const zoomStep = (dir) => {
    const cur = zoom === "fit" ? fitZoom() : zoom;
    const nz = dir > 0 ? ZOOMS.find((z) => z > cur + 1e-6) : [...ZOOMS].reverse().find((z) => z < cur - 1e-6);
    if (nz) { zoom = nz; placePage(); }
  };
  const fitBtn = h("button", { class: "btn small pw-fit", title: t("Zoom to fit"), onclick: () => { zoom = "fit"; placePage(); } }, h("span", { html: icon("zoomFit", 14) }), t("Fit"));
  const toolbar = h("div", { class: "pw-previewbar" },
    h("div", { class: "pw-nav" }, prevBtn, pageInfo, nextBtn),
    h("div", { class: "pw-zoom" },
      h("button", { class: "icon-btn", title: t("Zoom out"), html: icon("zoomOut", 16), onclick: () => zoomStep(-1) }), zoomLabel,
      h("button", { class: "icon-btn", title: t("Zoom in"), html: icon("zoomIn", 16), onclick: () => zoomStep(1) }), fitBtn));
  const status = h("div", { class: "pw-status" });
  const warnLine = h("div", { class: "pw-warn" });
  const preview = h("div", { class: "pw-preview" }, toolbar, stage, h("div", { class: "pw-statusbar" }, status, warnLine));

  let current = null; // { svg, W, H, ... }
  function fitZoom() {
    if (!current) return 1;
    const r = stage.getBoundingClientRect();
    const pad = 28;
    return Math.max(0.02, Math.min((r.width - pad * 2) / (current.W * PX_PER_MM), (r.height - pad * 2) / (current.H * PX_PER_MM)));
  }
  function placePage() {
    const page = stage.querySelector(".page");
    if (!page || !current) return;
    const z = zoom === "fit" ? fitZoom() : zoom;
    page.style.width = `${Math.round(current.W * PX_PER_MM * z)}px`;
    page.style.height = `${Math.round(current.H * PX_PER_MM * z)}px`;
    stage.classList.toggle("zoomed", zoom !== "fit");
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
  }

  function draw() {
    const pages = jobPages();
    index = Math.max(0, Math.min(index, pages.length - 1));
    stage.innerHTML = "";
    warnLine.textContent = "";
    current = null;
    const [W, H] = sheetSize(cfg);
    if (!pages.length) {
      stage.append(h("div", { class: "pw-empty" }, cfg.levels.size ? t("No pages in this range") : t("Tick at least one level")));
      pageInfo.textContent = "0 / 0";
    } else {
      const pg = pages[index];
      current = renderSheet(app, pg.level, cfg, pg.n, pg.of);
      const page = h("div", { class: "page", "data-w": String(current.W), "data-h": String(current.H) });
      page.innerHTML = current.svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="100%" preserveAspectRatio="none"');
      // Margin guides — preview only, never printed.
      const M = sheetMargins(cfg);
      if (M.top + M.right + M.bottom + M.left > 0) page.append(h("div", { class: "pw-margins", style: { left: `${(M.left / W) * 100}%`, top: `${(M.top / H) * 100}%`, right: `${(M.right / W) * 100}%`, bottom: `${(M.bottom / H) * 100}%` } }));
      stage.append(page);
      pageInfo.textContent = t("Page {i} of {n}", { i: index + 1, n: pages.length });
      if (!current.fits) warnLine.textContent = t("The drawing does not fit on the page at 1:{s}.", { s: current.scale });
    }
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= pages.length - 1;
    const paperName = cfg.paper === "custom" ? `${Math.round(W)} × ${Math.round(H)} mm` : `${cfg.paper} (${Math.round(W)} × ${Math.round(H)} mm)`;
    status.textContent = [t("Sheets: {n}", { n: pages.length }), paperName, cfg.landscape ? t("Landscape") : t("Portrait"), current ? `1:${current.scale}` : null, cfg.mono ? t("Black and white") : t("Colour"), desktop && cfg.copies > 1 ? t("{n} copies", { n: cfg.copies }) : null].filter(Boolean).join(" · ");
    placePage();
  }
  let pending = 0;
  const redraw = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(draw); };
  const set = (k, v) => { cfg[k] = v; redraw(); };

  // ---- left: settings
  const printerSel = h("select", { class: "input wide pw-printer" }, h("option", { value: "" }, t("Loading printers…")));
  printerSel.addEventListener("change", () => { cfg.printer = printerSel.value; redraw(); });
  const loadPrinters = async () => {
    const list = await platform.listPrinters();
    printerSel.innerHTML = "";
    const def = list.find((x) => x.isDefault);
    // Without a known default, an empty device name prints to the system's default.
    if (!def) printerSel.append(h("option", { value: "" }, t("Default printer")));
    const want = list.some((x) => x.name === cfg.printer) ? cfg.printer : def ? def.name : "";
    if (!want) printerSel.firstChild.selected = true;
    for (const x of list) {
      const o = h("option", { value: x.name }, x.isDefault ? `${x.displayName} (${t("Default printer")})` : x.displayName);
      if (x.name === want) o.selected = true;
      printerSel.append(o);
    }
    cfg.printer = want;
  };
  const printerSection = desktop ? section("printer", t("Printer"), "print", true,
    row(t("Printer"), printerSel, "pw-wide"),
    row(t("Copies"), num(cfg.copies, { min: 1, max: 99, onChange: (v) => set("copies", Math.round(v)) })),
    row(t("Colour"), segmented(cfg.mono ? "mono" : "color", [["color", t("Colour")], ["mono", t("Black and white")]], (v) => set("mono", v === "mono")), "pw-wide")) : section("printer", t("Colour"), "palette", true,
    row(t("Colour"), segmented(cfg.mono ? "mono" : "color", [["color", t("Colour")], ["mono", t("Black and white")]], (v) => set("mono", v === "mono")), "pw-wide"));

  const customSize = h("div", { class: "pw-pair" },
    num(cfg.customW, { min: 50, max: 2000, onChange: (v) => set("customW", v) }), h("span", {}, "×"),
    num(cfg.customH, { min: 50, max: 2000, onChange: (v) => set("customH", v) }), h("span", { class: "pw-unit" }, "mm"));
  const customSizeRow = row(t("Custom size"), customSize, "pw-wide");
  const paperSel = select(cfg.paper, [...Object.entries(PAPER).map(([k, [a, b]]) => [k, `${k} — ${a} × ${b} mm`]), ["custom", t("Custom size")]], { onChange: (v) => { cfg.paper = v; customSizeRow.hidden = v !== "custom"; redraw(); }, cls: "wide pw-paper" });
  customSizeRow.hidden = cfg.paper !== "custom";
  const orient = segmented(cfg.landscape ? "l" : "p", [["l", t("Landscape"), pageIcon(true)], ["p", t("Portrait"), pageIcon(false)]], (v) => set("landscape", v === "l"));
  orient.classList.add("pw-orient");
  const marginInputs = {};
  const marginLabels = { top: t("Top"), bottom: t("Bottom"), left: t("Left"), right: t("Right") };
  const marginGrid = h("div", { class: "pw-margin-grid" }, ...["top", "bottom", "left", "right"].map((k) => {
    marginInputs[k] = num(cfg.margins[k], { min: 0, max: 100, onChange: (v) => { cfg.margins = { ...cfg.margins, [k]: v }; redraw(); } });
    return h("label", { class: "pw-margin" }, h("span", {}, marginLabels[k]), marginInputs[k]);
  }));
  const marginRow = row("", marginGrid, "pw-wide");
  const marginSel = select(cfg.marginPreset, [["none", t("None")], ["narrow", `${t("Narrow")} — 5 mm`], ["normal", `${t("Normal")} — 10 mm`], ["wide", `${t("Wide")} — 20 mm`], ["custom", t("Custom")]], {
    cls: "wide pw-margin-preset",
    onChange: (v) => {
      if (v === "custom") { const M = sheetMargins(cfg); cfg.margins = { ...M }; for (const k in marginInputs) marginInputs[k].value = M[k]; }
      cfg.marginPreset = v; marginRow.hidden = v !== "custom"; redraw();
    },
  });
  marginRow.hidden = cfg.marginPreset !== "custom";
  const pageSection = section("page", t("Page"), "sheet", true,
    row(t("Paper size"), paperSel, "pw-wide"), customSizeRow,
    row(t("Orientation"), orient, "pw-wide"),
    row(t("Margins"), marginSel, "pw-wide"), marginRow);

  const customScale = h("div", { class: "pw-pair" }, h("span", {}, "1 :"), num(cfg.customScale, { min: 1, max: 100000, onChange: (v) => set("customScale", v) }));
  const customScaleRow = row(t("Custom scale"), customScale);
  customScaleRow.hidden = cfg.scale !== "custom";
  const scaleSel = select(cfg.scale, [["fit", t("Fit to page")], ...SCALES.map((s) => [String(s), `1:${s}`]), ["custom", t("Custom")]], { cls: "wide pw-scale", onChange: (v) => { cfg.scale = v; customScaleRow.hidden = v !== "custom"; redraw(); } });
  const levelChecks = h("div", { class: "check-col pw-levels" }, ...p.levels.slice().reverse().map((l) => checkbox(cfg.levels.has(l.id), l.name, { onChange: (v) => { if (v) cfg.levels.add(l.id); else cfg.levels.delete(l.id); redraw(); } })));
  const allLevels = h("button", { type: "button", class: "btn small pw-all-levels", onclick: () => { for (const l of p.levels) cfg.levels.add(l.id); for (const c of levelChecks.querySelectorAll("input")) c.checked = true; redraw(); } }, t("Select all"));
  const rangeInput = h("input", { class: "input wide pw-range-text", placeholder: t("e.g. 1-2, 4"), value: cfg.rangeText });
  rangeInput.addEventListener("input", () => { cfg.rangeText = rangeInput.value; redraw(); });
  rangeInput.addEventListener("keydown", (e) => e.stopPropagation());
  rangeInput.hidden = cfg.range !== "custom";
  const rangeSeg = segmented(cfg.range, [["all", t("All pages")], ["custom", t("Pages")]], (v) => { cfg.range = v; rangeInput.hidden = v !== "custom"; if (v === "custom") rangeInput.focus(); redraw(); });
  const drawingSection = section("drawing", t("Drawing"), "floorplan", true,
    row(t("Drawing scale"), scaleSel, "pw-wide"), customScaleRow,
    h("div", { class: "pw-row" }, checkbox(cfg.centre, t("Centre on page"), { onChange: (v) => set("centre", v) })),
    row(t("Levels (one sheet each)"), h("div", { class: "pw-levels-wrap" }, levelChecks, p.levels.length > 1 ? allLevels : null), "pw-wide"),
    row(t("Page range"), h("div", { class: "pw-range" }, rangeSeg, rangeInput), "pw-wide"));

  const tog = (k, label) => checkbox(cfg[k], label, { onChange: (v) => set(k, v) });
  const contentSection = section("contents", t("Drawing contents"), "layers", false,
    h("div", { class: "check-col" }, tog("furniture", t("Furniture")), tog("dims", t("Dimensions")), tog("areas", t("Room areas")), tog("roofs", t("Roofs (dashed)")), tog("drawings", t("CAD layers")), tog("texts", t("Texts and labels")), tog("grids", t("Structural grids"))));
  const sheetSection = section("sheet", t("Sheet layout"), "file", false,
    h("div", { class: "check-col" }, tog("border", t("Sheet border")), tog("titleBlock", t("Title block")), tog("north", t("North arrow and scale bar")), tog("header", t("Header: project name and date")), tog("footer", t("Footer: page numbers"))),
    h("p", { class: "field-hint" }, t("Title block from File → Project properties.")));

  const settings = h("div", { class: "pw-settings" }, printerSection, pageSection, drawingSection, contentSection, sheetSection);
  const body = h("div", { class: "pw-body" }, settings, preview);

  let ro = null;
  // Enter in a settings box only commits the value: it must never print. The
  // dialog listens on document (capture), so this runs first, on window.
  const enterGuard = (e) => {
    if (e.key !== "Enter" || !(e.target instanceof Element) || !e.target.closest(".pw-settings")) return;
    if (e.target.matches("input, select")) { e.stopPropagation(); e.preventDefault(); e.target.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  window.addEventListener("keydown", enterGuard, true);
  const r = await modal({
    title: pdf ? t("Export plan as PDF…") : t("Print"), width: "min(1400px, calc(100vw - 40px))", className: "print-window", body,
    buttons: [
      ...(desktop ? [{ label: t("Save as PDF…"), value: "pdf", left: true, primary: pdf }] : []),
      { label: t("Save as SVG…"), value: "svg", left: !desktop },
      { label: t("Cancel"), value: null },
      { label: desktop ? t("Print") : t("Print…"), value: "print", primary: !pdf || !desktop },
    ],
    validate: (v) => (v && !jobPages().length ? (cfg.levels.size ? t("No pages in this range") : t("Tick at least one level")) : null),
    onOpen: (box) => {
      box.querySelector(".modal-foot")?.classList.add("pw-foot");
      ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (zoom === "fit") placePage(); }) : null;
      if (ro) ro.observe(stage);
      setTimeout(draw, 10);
      if (desktop) loadPrinters().catch(() => {});
    },
  });
  if (ro) ro.disconnect();
  window.removeEventListener("keydown", enterGuard, true);
  remember(app, cfg);
  if (!r) return;
  const pages = renderPages();
  if (!pages.length) return;
  if (r === "svg") {
    for (const pg of pages) {
      const out = pg.svg.replace(/width="([\d.]+)" height="([\d.]+)"/, 'width="$1mm" height="$2mm"');
      const sv = await platform.saveTextFile({ name: `${baseName(app)}-${pg.title.split(" — ").pop()}.svg`, text: `<?xml version="1.0" encoding="UTF-8"?>\n${out}`, filters: [{ name: "SVG", extensions: ["svg"] }] });
      if (!sv) return;
    }
    toast(t("Saved {name}", { name: `${pages.length} SVG` }), "ok");
    return;
  }
  const [W, H] = sheetSize(cfg);
  const cleanup = layoutForPrint(pages, W, H);
  try {
    if (r === "pdf") {
      const out = await platform.printToPDF({ pageSize: { width: W / 25.4, height: H / 25.4 }, landscape: false, defaultPath: `${baseName(app)}.pdf` });
      if (out && !out.canceled && out.ok !== false) toast(t("Saved {name}", { name: out.filePath || "PDF" }), "ok");
      else if (out && out.ok === false) toast(out.error || "PDF", "error");
      return;
    }
    if (!desktop) { await platform.printPage(); return; }
    const printerName = cfg.printer || t("Default printer");
    toast(t("Printing {n} pages on {printer}…", { n: pages.length, printer: printerName }), "info", 2500);
    const named = cfg.paper !== "custom" && NAMED_PAGES.has(cfg.paper);
    const res = await platform.printSheets({
      deviceName: cfg.printer || undefined,
      copies: cfg.copies,
      landscape: cfg.landscape,
      // Named sizes go by name with the orientation flag; others in microns, already oriented.
      pageSize: named ? cfg.paper : { width: Math.round(W * 1000), height: Math.round(H * 1000) },
      color: !cfg.mono,
      pages: pages.length,
      paper: cfg.paper,
      sheet: [W, H],
    });
    if (res && res.ok) toast(t("Sent {n} pages to {printer}.", { n: pages.length, printer: printerName }), "ok", 4000);
    else toast(t("Printing failed: {error}", { error: (res && res.error) || "?" }), "error", 6000);
  } finally {
    setTimeout(cleanup, 1000);
  }
}

// The sheets go into the hidden #print-area at their real size; the page box
// is the sheet itself with no margin of its own (margins are on the sheet).
function layoutForPrint(pages, W, H) {
  const area = document.getElementById("print-area");
  area.innerHTML = "";
  let style = document.getElementById("print-page-style");
  if (!style) { style = document.createElement("style"); style.id = "print-page-style"; document.head.append(style); }
  style.textContent = `@page { size: ${W}mm ${H}mm; margin: 0; } @media print { .print-sheet { width: ${W}mm; height: ${H}mm; overflow: hidden; } .print-sheet svg { display: block; width: ${W}mm; height: ${H}mm; } }`;
  for (const pg of pages) {
    const sheet = h("section", { class: "print-sheet" });
    sheet.innerHTML = pg.svg.replace(/width="([\d.]+)" height="([\d.]+)"/, 'width="$1mm" height="$2mm"');
    area.append(sheet);
  }
  return () => { area.innerHTML = ""; };
}
