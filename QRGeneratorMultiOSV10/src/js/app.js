// Wires the page together: form → payload → Rust encoder → renderer → preview/export.
import { createEncoder, ECC_LEVELS, ECC_RECOVERY } from "./encoder.js";
import { formatById, FORMATS, hexToInt } from "./exporters.js";
import { History } from "./history.js";
import { applyTranslations, LANGUAGES, setLanguage, t } from "./i18n.js";
import { icon, IconSelect, useNativeMenus } from "./iconselect.js";
import { applyLayout, DEFAULT_LAYOUT, enableCardDragging, normalizeLayout } from "./layout.js";
import { buildPayload, CONTENT_TYPES, DEFAULT_VALUES } from "./payload.js";
import * as platform from "./platform.js";
import { DEFAULT_DESIGN, designWarnings, drawToCanvas, EYE_BALL_STYLES, EYE_FRAME_STYLES, MODULE_STYLES, toSvg } from "./render.js";
import { toEps, toPdf } from "./vector.js";

const TYPE_ICONS = { text: "i-text", url: "i-url", wifi: "i-wifi", vcard: "i-vcard", email: "i-email", sms: "i-sms", tel: "i-tel", geo: "i-geo" };
const THEME_ICONS = { system: "i-monitor", light: "i-sun", dark: "i-moon" };
const GRADIENTS = ["none", "vertical", "diagonal", "radial"];
const DEFAULT_ENCODING = { ecc: "M", version: 0, mask: -1, boostEcc: true, eciUtf8: false };
const DEFAULT_EXPORT = { format: "png", size: 1024, quality: 92, printMm: 50 };
const SIZE_PRESETS = [256, 512, 1024, 2048];
const LOGO_MAX_PX = 512;

const state = {
  type: "url",
  values: structuredClone(DEFAULT_VALUES),
  design: { ...DEFAULT_DESIGN },
  encoding: { ...DEFAULT_ENCODING },
  export: { ...DEFAULT_EXPORT },
  lang: "ko",
  theme: "system",
  layout: structuredClone(DEFAULT_LAYOUT),
};

let encoder;
let current = null; // last successful result
let lastResult = null;
let payload = "";
let seq = 0;
let logoImage = null;
let logoPixelsCache = null;
const selects = {};
const history = new History();
const tauriWindow = globalThis.__TAURI__?.window?.getCurrentWindow?.();

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

// ---- Settings ----

const clampSize = (value) => Math.max(64, Math.min(8192, Math.round(Number(value) || DEFAULT_EXPORT.size)));
const clampPrint = (value) => Math.max(5, Math.min(2000, Number(value) || DEFAULT_EXPORT.printMm));

function applySettings(saved) {
  if (!saved || typeof saved !== "object") return;
  if (saved.type in CONTENT_TYPES) state.type = saved.type;
  if (saved.values && typeof saved.values === "object") {
    for (const type of Object.keys(CONTENT_TYPES)) Object.assign(state.values[type], saved.values[type] || {});
  }
  if (saved.design) {
    for (const key of Object.keys(DEFAULT_DESIGN)) if (key in saved.design && typeof saved.design[key] === typeof DEFAULT_DESIGN[key]) state.design[key] = saved.design[key];
  }
  if (saved.encoding) {
    const e = saved.encoding;
    if (ECC_LEVELS.includes(e.ecc)) state.encoding.ecc = e.ecc;
    if (Number.isInteger(e.version) && e.version >= 0 && e.version <= 40) state.encoding.version = e.version;
    if (Number.isInteger(e.mask) && e.mask >= -1 && e.mask <= 7) state.encoding.mask = e.mask;
    if (typeof e.boostEcc === "boolean") state.encoding.boostEcc = e.boostEcc;
    if (typeof e.eciUtf8 === "boolean") state.encoding.eciUtf8 = e.eciUtf8;
  }
  const x = saved.export || {};
  if (FORMATS.some((f) => f.id === x.format)) state.export.format = x.format;
  if (Number.isFinite(x.size)) state.export.size = clampSize(x.size);
  if (Number.isFinite(saved.exportSize)) state.export.size = clampSize(saved.exportSize); // first version's key
  if (Number.isFinite(x.quality)) state.export.quality = Math.max(50, Math.min(100, Math.round(x.quality)));
  if (Number.isFinite(x.printMm)) state.export.printMm = clampPrint(x.printMm);
  if (saved.lang in LANGUAGES) state.lang = saved.lang;
  if (["system", "light", "dark"].includes(saved.theme)) state.theme = saved.theme;
  state.layout = normalizeLayout(saved.layout);
}

/** Drag handles on every card heading; the arrangement is saved with the settings. */
function setupLayout() {
  for (const h2 of document.querySelectorAll(".card > h2")) {
    // The title gets its own span: translating replaces text content, which would drop the handle.
    const title = el("span", { textContent: h2.textContent });
    title.dataset.i18n = h2.dataset.i18n;
    delete h2.dataset.i18n;
    const handle = el("span", { className: "drag-handle" }, icon("i-grip"));
    handle.dataset.i18nTitle = "layout.drag";
    h2.replaceChildren(title, handle);
  }
  applyLayout(state.layout);
  enableCardDragging((layout) => {
    state.layout = layout;
    persist();
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".drag-handle")) document.body.classList.add("dragging-card");
  });
  document.addEventListener("pointerup", () => document.body.classList.remove("dragging-card"));
  $("layout-reset").addEventListener("click", () => {
    state.layout = structuredClone(DEFAULT_LAYOUT);
    applyLayout(state.layout);
    persist();
  });
}

// ---- Undo / redo ----

/** What undo/redo restores: the document, not UI preferences (language, theme). */
function snapshot() {
  return { type: state.type, values: state.values, design: state.design, encoding: state.encoding, export: state.export };
}

/** Which control the change came from, so typing in one field or dragging one slider is one step. */
function changeSource() {
  const a = document.activeElement;
  if (!a || a === document.body) return "other";
  return a.dataset?.for || a.id || a.closest("[data-design]")?.dataset.design || a.parentElement?.id || "other";
}

function refreshHistoryButtons() {
  $("undo").disabled = !history.canUndo;
  $("redo").disabled = !history.canRedo;
}

async function applySnapshot(snap) {
  if (!snap) return;
  const focusedId = document.activeElement?.id;
  state.type = snap.type;
  state.values = snap.values;
  state.encoding = snap.encoding;
  state.export = snap.export;
  const logoChanged = snap.design.logo !== state.design.logo;
  state.design = snap.design;
  if (logoChanged) await setLogo(snap.design.logo, { keepHistory: true });
  renderTypeTabs();
  renderFields();
  syncControls();
  await update();
  if (focusedId) $(focusedId)?.focus?.();
  refreshHistoryButtons();
}

const undo = () => applySnapshot(history.undo());
const redo = () => applySnapshot(history.redo());

let saveTimer;
/** Called after every change: records an undo step and saves the settings shortly after. */
function persist() {
  if (history.record(snapshot(), changeSource())) refreshHistoryButtons();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const values = structuredClone(state.values);
    values.wifi.password = ""; // never written to disk
    platform.saveSettings({ ...state, values });
  }, 400);
}

function applyTheme() {
  if (state.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

// ---- Content ----

function renderTypeTabs() {
  const tabs = $("type-tabs");
  tabs.replaceChildren();
  for (const type of Object.keys(CONTENT_TYPES)) {
    const button = el("button", { type: "button", className: "type-tab", role: "tab", title: t(`type.${type}`) }, icon(TYPE_ICONS[type]), el("span", { textContent: t(`type.${type}`) }));
    button.dataset.type = type;
    button.setAttribute("aria-selected", String(type === state.type));
    button.addEventListener("click", () => {
      if (state.type === type) return;
      state.type = type;
      renderTypeTabs();
      renderFields();
      update();
    });
    tabs.append(button);
  }
}

function renderFields() {
  const form = $("fields");
  form.replaceChildren();
  const values = (state.values[state.type] ??= {});
  for (const f of CONTENT_TYPES[state.type]) {
    const id = `field-${state.type}-${f.key}`;
    const label = el("span", { textContent: t(`field.${f.key}`) });
    if (f.kind === "checkbox") {
      const control = el("input", { type: "checkbox", id, checked: Boolean(values[f.key]) });
      control.addEventListener("change", () => {
        values[f.key] = control.checked;
        update();
      });
      form.append(el("label", { className: "check" }, control, label));
    } else if (f.kind === "select") {
      // Choices with icons, like every other dropdown.
      const holder = el("div", { id, className: "full" });
      const select = new IconSelect(holder, {
        options: f.options.map((o) => ({ value: o, label: t(`option.${o}`), icon: f.icons?.[o] || "i-chevron" })),
        value: values[f.key] ?? f.options[0],
        title: t(`field.${f.key}`),
        onChange(value) {
          values[f.key] = value;
          update();
        },
      });
      holder.classList.add("full");
      select.button.id = `${id}-button`;
      form.append(el("div", { className: `field${f.half ? " half" : ""}` }, label, holder));
    } else {
      const control =
        f.kind === "textarea" ? el("textarea", { id, rows: f.rows || 3, value: values[f.key] ?? "" }) : el("input", { id, type: f.type || "text", value: values[f.key] ?? "", spellcheck: false });
      if (f.step) control.step = f.step;
      if (f.placeholder) control.placeholder = f.placeholder;
      control.dataset.key = f.key;
      control.addEventListener("input", () => {
        values[f.key] = control.value;
        update();
      });
      form.append(el("label", { className: `field${f.half ? " half" : ""}` }, label, control));
    }
  }
}

// ---- Controls ----

/** Four-column segmented control; every button has an icon and a label. */
function segmented(container, options, get, set) {
  container.replaceChildren();
  for (const { value, label, icon: iconId } of options) {
    const button = el("button", { type: "button", title: label }, icon(iconId), el("span", { textContent: label }));
    button.dataset.value = String(value);
    button.setAttribute("aria-pressed", String(get() === value));
    button.addEventListener("click", () => {
      set(value);
      for (const b of container.children) b.setAttribute("aria-pressed", String(b === button));
    });
    container.append(button);
  }
}

function formatOptions() {
  return FORMATS.map((f) => ({ value: f.id, label: f.id.toUpperCase(), icon: f.kind === "vector" ? "i-vector" : "i-image", group: t(`format.${f.kind}`) }));
}

function renderControls() {
  const design = state.design;
  const styleIcons = { moduleStyle: "i-mod", eyeFrame: "i-frame", eyeBall: "i-ball" };
  for (const [key, list] of Object.entries({ moduleStyle: MODULE_STYLES, eyeFrame: EYE_FRAME_STYLES, eyeBall: EYE_BALL_STYLES })) {
    segmented(
      document.querySelector(`[data-design="${key}"]`),
      list.map((s) => ({ value: s, label: t(`style.${s}`), icon: `${styleIcons[key]}-${s}` })),
      () => state.design[key],
      (v) => {
        state.design[key] = v;
        redraw();
      },
    );
  }
  segmented($("ecc"), ECC_LEVELS.map((e) => ({ value: e, label: `${e} ${ECC_RECOVERY[e]}%`, icon: `i-ecc-${e}` })), () => state.encoding.ecc, (v) => {
    state.encoding.ecc = v;
    update();
  });

  const versions = [{ value: "0", label: t("adv.auto"), icon: "i-auto" }];
  for (let v = 1; v <= 40; v += 1) versions.push({ value: String(v), label: `${v}  (${v * 4 + 17}×${v * 4 + 17})`, icon: "i-version" });
  selects.version.setOptions(versions, String(state.encoding.version));
  selects.version.setTitle(t("adv.version"));
  const masks = [{ value: "-1", label: t("adv.auto"), icon: "i-auto" }];
  for (let m = 0; m < 8; m += 1) masks.push({ value: String(m), label: String(m), icon: "i-mask" });
  selects.mask.setOptions(masks, String(state.encoding.mask));
  selects.mask.setTitle(t("adv.mask"));

  const chips = $("size-chips");
  chips.replaceChildren();
  for (const px of SIZE_PRESETS) {
    const chip = el("button", { type: "button", textContent: String(px) });
    chip.addEventListener("click", () => {
      state.export.size = px;
      syncControls();
      persist();
    });
    chips.append(chip);
  }

  // Dropdowns: every option shows an icon.
  selects.gradient.setOptions(GRADIENTS.map((g) => ({ value: g, label: t(`gradient.${g}`), icon: `i-grad-${g}` })), design.gradient);
  selects.gradient.setTitle(t("design.gradient"));
  selects.format.setOptions(formatOptions(), state.export.format);
  selects.format.setTitle(t("tb.format"));
  selects.lang.setOptions(Object.entries(LANGUAGES).map(([value, label]) => ({ value, label, icon: `i-lang-${value}` })), state.lang);
  selects.lang.setTitle(t("ui.language"));
  selects.theme.setOptions(["system", "light", "dark"].map((value) => ({ value, label: t(`theme.${value}`), icon: THEME_ICONS[value] })), state.theme);
  selects.theme.setTitle(t("ui.theme"));
}

function createSelects() {
  selects.version = new IconSelect($("version-select"), {
    onChange(value) {
      state.encoding.version = Number(value);
      update();
    },
  });
  selects.mask = new IconSelect($("mask-select"), {
    onChange(value) {
      state.encoding.mask = Number(value);
      update();
    },
  });
  selects.gradient = new IconSelect($("gradient-select"), {
    onChange(value) {
      state.design.gradient = value;
      syncControls();
      redraw();
    },
  });
  selects.format = new IconSelect($("format-select"), {
    onChange(value) {
      state.export.format = value;
      syncControls();
      persist();
    },
  });
  selects.lang = new IconSelect($("lang-select"), {
    onChange(value) {
      state.lang = value;
      setLanguage(value);
      translateAll();
      persist();
    },
  });
  selects.theme = new IconSelect($("theme-select"), {
    onChange(value) {
      state.theme = value;
      applyTheme();
      persist();
    },
  });
}

const pressed = (id, on) => $(id).setAttribute("aria-pressed", String(Boolean(on)));

/** Shows how far a slider is filled (the bar is drawn by CSS from --fill). */
function paintRange(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
}

/** Puts the state into the controls (after load, undo, reset, swap, language change). */
function syncControls() {
  const d = state.design;
  $("fg").value = d.fg;
  $("bg").value = d.bg;
  $("eyeColor").value = d.eyeColor || d.fg;
  $("eyeColor").closest(".color").classList.toggle("disabled", !d.eyeColor);
  $("bg").closest(".color").classList.toggle("disabled", d.transparent);
  selects.gradient.setValue(d.gradient);
  $("fg2").value = d.fg2;
  $("fg2-wrap").classList.toggle("disabled", d.gradient === "none");
  $("margin").value = String(d.margin);
  $("margin-out").textContent = String(d.margin);
  $("logo-scale").value = String(d.logoScale);
  $("logo-scale-out").textContent = `${Math.round(d.logoScale * 100)}%`;
  $("logo-remove").disabled = !d.logo;
  const thumb = $("logo-thumb");
  thumb.classList.toggle("has-logo", Boolean(d.logo));
  thumb.style.backgroundImage = d.logo ? `url("${d.logo}")` : "";
  for (const key of ["moduleStyle", "eyeFrame", "eyeBall"]) {
    for (const b of document.querySelector(`[data-design="${key}"]`).children) b.setAttribute("aria-pressed", String(b.dataset.value === d[key]));
  }
  for (const b of $("ecc").children) b.setAttribute("aria-pressed", String(b.dataset.value === state.encoding.ecc));
  selects.version.setValue(String(state.encoding.version));
  selects.mask.setValue(String(state.encoding.mask));

  // Toolbar toggles.
  pressed("eyeSame", !d.eyeColor);
  pressed("transparent", d.transparent);
  pressed("logo-clear", d.logoClear);
  $("logo-clear").disabled = !d.logo;
  pressed("boost", state.encoding.boostEcc);
  pressed("eci", state.encoding.eciUtf8);

  // Export settings follow the chosen format.
  const x = state.export;
  const format = formatById(x.format);
  selects.format.setValue(format.id);
  $("save-label").textContent = t("tb.save", { format: format.id.toUpperCase() });
  if (document.querySelector(".main-bar.compact") === null) requestAnimationFrame(fitToolbars);
  $("size-field").querySelector(".size-grid").classList.toggle("off", Boolean(format.print));
  $("size-chips").classList.toggle("off", Boolean(format.print));
  const px = format.maxSize ? Math.min(x.size, format.maxSize) : x.size;
  $("export-size").value = String(px);
  for (const chip of $("size-chips").children) {
    chip.setAttribute("aria-pressed", String(Number(chip.textContent) === x.size));
    chip.disabled = Boolean(format.maxSize && Number(chip.textContent) > format.maxSize);
  }
  $("quality-field").classList.toggle("off", !format.quality);
  $("quality").value = String(x.quality);
  $("quality-out").textContent = String(x.quality);
  $("print-field").classList.toggle("off", !format.print);
  $("print-size").value = String(x.printMm);
  $("format-hint").textContent = t(`hint.${format.id}`);
  $("status-format-text").textContent = format.print ? `${format.id.toUpperCase()} · ${x.printMm} mm` : `${format.id.toUpperCase()} · ${px} px`;
  for (const range of document.querySelectorAll('.stepper input[type="range"]')) paintRange(range);
}

function toggle(id, flip) {
  $(id).addEventListener("click", () => {
    flip();
    syncControls();
  });
}

/** −/+ buttons beside sliders and number boxes; holding a button repeats. */
function bindSteppers() {
  for (const button of document.querySelectorAll(".step[data-for]")) {
    const input = $(button.dataset.for);
    const step = () => {
      if (Number(button.dataset.step) > 0) input.stepUp();
      else input.stepDown();
      input.dispatchEvent(new Event(input.type === "range" ? "input" : "change", { bubbles: true }));
    };
    let timer;
    const stop = () => {
      clearTimeout(timer);
      clearInterval(timer);
    };
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      button.focus();
      step();
      timer = setTimeout(() => (timer = setInterval(step, 60)), 400);
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, stop);
    // Keyboard activation (pointer clicks are handled on pointerdown).
    button.addEventListener("click", (event) => {
      if (event.detail === 0) step();
    });
  }
}

function bindControls() {
  const d = () => state.design;
  const onDesign = (id, event, apply) => $(id).addEventListener(event, () => {
    apply($(id));
    syncControls();
    redraw();
  });
  onDesign("fg", "input", (e) => (d().fg = e.value));
  onDesign("bg", "input", (e) => (d().bg = e.value));
  onDesign("eyeColor", "input", (e) => (d().eyeColor = e.value));
  onDesign("fg2", "input", (e) => (d().fg2 = e.value));
  onDesign("margin", "input", (e) => (d().margin = Number(e.value)));
  onDesign("logo-scale", "input", (e) => (d().logoScale = Number(e.value)));

  // Toolbar: on/off options and design actions.
  toggle("eyeSame", () => {
    d().eyeColor = d().eyeColor ? "" : d().fg;
    redraw();
  });
  toggle("transparent", () => {
    d().transparent = !d().transparent;
    redraw();
  });
  toggle("logo-clear", () => {
    d().logoClear = !d().logoClear;
    redraw();
  });
  toggle("boost", () => {
    state.encoding.boostEcc = !state.encoding.boostEcc;
    update();
  });
  toggle("eci", () => {
    state.encoding.eciUtf8 = !state.encoding.eciUtf8;
    update();
  });
  toggle("swap", () => {
    [d().fg, d().bg] = [d().bg, d().fg];
    redraw();
  });
  toggle("reset", () => {
    const { logo, logoScale, logoClear } = d();
    state.design = { ...DEFAULT_DESIGN, logo, logoScale, logoClear };
    redraw();
  });
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);

  $("logo-choose").addEventListener("click", () => $("logo-file").click());
  $("logo-file").addEventListener("change", async () => {
    const file = $("logo-file").files[0];
    $("logo-file").value = "";
    if (file) await setLogoFromFile(file);
  });
  $("logo-remove").addEventListener("click", () => setLogo(""));


  const onExport = (id, event, apply) => $(id).addEventListener(event, () => {
    apply($(id));
    syncControls();
    persist();
  });
  onExport("export-size", "change", (e) => (state.export.size = clampSize(e.value)));
  $("size-default").addEventListener("click", () => {
    state.export.size = DEFAULT_EXPORT.size;
    syncControls();
    persist();
  });
  onExport("quality", "input", (e) => (state.export.quality = Number(e.value)));
  onExport("print-size", "change", (e) => (state.export.printMm = clampPrint(e.value)));
  bindSteppers();

  $("save").addEventListener("click", () => exportAs().catch(() => {}));
  $("copy-image").addEventListener("click", () => copyImage());
  $("copy-text").addEventListener("click", () => copyPayload());

  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      exportAs(event.shiftKey ? "svg" : state.export.format).catch(() => {});
    } else if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  });

  // Dropping an image anywhere sets it as the logo.
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    setLogoFromFile(file);
  });
}

/**
 * Toolbars drop button labels (icons stay) when the window is too narrow for them, so the
 * language and theme dropdowns and the window buttons are never pushed out of view.
 */
function fitToolbars() {
  const main = document.querySelector(".main-bar");
  main.classList.remove("compact", "compact-2");
  if (main.scrollWidth > main.clientWidth) main.classList.add("compact");
  if (main.scrollWidth > main.clientWidth) main.classList.add("compact-2");
  const options = document.querySelector(".option-bar");
  options.classList.remove("compact");
  const clipped = [...options.querySelectorAll(".tb > span")].some((s) => s.scrollWidth > s.clientWidth + 0.5);
  if (clipped) options.classList.add("compact");
}

/** Frameless desktop window: our own minimise/maximise/close and the resize grip. */
function bindWindow() {
  if (!tauriWindow) return;
  document.body.classList.add("frameless");
  $("window-controls").hidden = false;
  $("resize-grip").hidden = false;
  $("win-min").addEventListener("click", () => tauriWindow.minimize());
  $("win-max").addEventListener("click", () => tauriWindow.toggleMaximize());
  $("win-close").addEventListener("click", () => tauriWindow.close());
  $("resize-grip").addEventListener("pointerdown", (event) => {
    if (event.button === 0) tauriWindow.startResizeDragging("SouthEast");
  });
  const refresh = async () => {
    const maximized = await tauriWindow.isMaximized().catch(() => false);
    $("win-max").querySelector("use").setAttribute("href", maximized ? "#i-win-restore" : "#i-win-max");
    $("win-max").title = t(maximized ? "win.restore" : "win.maximize");
    $("resize-grip").hidden = maximized;
  };
  tauriWindow.onResized(refresh);
  refresh();
}

function translateAll() {
  applyTranslations();
  requestAnimationFrame(fitToolbars);
  renderTypeTabs();
  renderFields();
  renderControls();
  syncControls();
  $("engine").textContent = t(`engine.${encoder.backend}`);
  showResult();
  status(t("status.ready"));
}

// ---- Logo ----

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Downscales to at most 512 px PNG so the logo stays small in settings and exports. */
async function setLogoFromFile(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url).finally(() => URL.revokeObjectURL(url));
    const w = img.naturalWidth || LOGO_MAX_PX;
    const h = img.naturalHeight || LOGO_MAX_PX;
    const k = Math.min(1, LOGO_MAX_PX / Math.max(w, h));
    const canvas = el("canvas", { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) });
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    await setLogo(canvas.toDataURL("image/png"));
    if (state.encoding.ecc !== "H") {
      state.encoding.ecc = "H";
      syncControls();
      update();
    }
  } catch (error) {
    status(t("toast.failed", { message: error.message }), "error");
  }
}

async function setLogo(dataUrl, { keepHistory = false } = {}) {
  logoImage = dataUrl ? await loadImage(dataUrl).catch(() => null) : null;
  logoPixelsCache = null;
  state.design.logo = logoImage ? dataUrl : "";
  syncControls();
  if (!keepHistory) redraw();
}

/** The logo as { width, height, rgba } for the PDF/EPS writers. */
function logoPixels() {
  if (!logoImage || !state.design.logo) return null;
  if (!logoPixelsCache) {
    const canvas = el("canvas", { width: logoImage.naturalWidth || 1, height: logoImage.naturalHeight || 1 });
    const ctx = canvas.getContext("2d");
    ctx.drawImage(logoImage, 0, 0);
    logoPixelsCache = { width: canvas.width, height: canvas.height, rgba: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer) };
  }
  return logoPixelsCache;
}

// ---- Encoding and drawing ----

async function update() {
  payload = buildPayload(state.type, state.values[state.type] || {});
  const bytes = new TextEncoder().encode(payload).length;
  $("payload").textContent = payload || t("payload.empty");
  $("payload-count").textContent = t("payload.chars", { chars: [...payload].length, bytes });

  const mine = ++seq;
  let result = null;
  if (payload) {
    try {
      result = await encoder.encode(payload, state.encoding);
    } catch (error) {
      result = { ok: false, error: "invalid", message: String(error?.message || error) };
    }
  }
  if (mine !== seq) return; // a newer edit already finished or is on its way
  lastResult = result;
  current = result?.ok ? result : null;
  showResult();
  persist();
}

function showResult() {
  const result = lastResult;
  const message = $("message");
  if (!payload || !result) {
    message.hidden = false;
    message.className = "stage-message";
    message.textContent = t("error.empty");
  } else if (!result.ok) {
    message.hidden = false;
    message.className = "stage-message error";
    message.textContent = t(`error.${result.error}`, result);
  } else {
    message.hidden = true;
  }

  const ok = Boolean(current) && Boolean(payload);
  $("info-version").textContent = ok ? `${current.version} · ${current.size}×${current.size}` : "–";
  $("info-ecc").textContent = ok ? `${current.ecc} · ${ECC_RECOVERY[current.ecc]}%` : "–";
  $("info-mask").textContent = ok ? String(current.mask) : "–";
  $("info-mode").textContent = ok ? t(`mode.${current.mode}`) : "–";
  const used = ok ? current.dataBits : result?.dataBits || 0;
  const cap = ok ? current.capacityBits : result?.maxBits || 0;
  const share = cap ? Math.min(1, used / cap) : 0;
  $("capacity-bar").style.width = `${(share * 100).toFixed(1)}%`;
  $("capacity-bar").classList.toggle("full", Boolean(result && !result.ok));
  $("capacity-text").textContent = cap ? `${used} / ${cap} bit (${Math.round(share * 100)}%)` : "";
  for (const id of ["save", "copy-image"]) $(id).disabled = !ok;
  $("copy-text").disabled = !payload;
  redraw();
}

function redraw() {
  const canvas = $("preview");
  const px = Math.max(1, Math.round($("stage").clientWidth * (window.devicePixelRatio || 1)));
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext("2d");
  if (current && payload) drawToCanvas(ctx, current, state.design, px, logoImage);
  else ctx.clearRect(0, 0, px, px);

  const list = $("warnings");
  list.replaceChildren();
  if (current && payload) {
    for (const key of designWarnings(current, state.design, ECC_RECOVERY[current.ecc])) {
      list.append(el("li", {}, icon("i-warn"), el("span", { textContent: t(key) })));
    }
  }
  persist();
}

// ---- Export ----

function fileName(ext) {
  const now = new Date();
  const p = (v) => String(v).padStart(2, "0");
  return `qrcode-${state.type}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.${ext}`;
}

function renderCanvas(px) {
  const canvas = el("canvas", { width: px, height: px });
  drawToCanvas(canvas.getContext("2d"), current, state.design, px, logoImage);
  return canvas;
}

/** Pixel size for a raster format (ICO holds at most 256 px). */
function rasterSize(format) {
  return format.maxSize ? Math.min(state.export.size, format.maxSize) : state.export.size;
}

function rasterPixels(format) {
  const px = rasterSize(format);
  const { data } = renderCanvas(px).getContext("2d").getImageData(0, 0, px, px);
  return { px, rgba: new Uint8Array(data.buffer) };
}

const exportBackground = () => (state.design.transparent ? 0xffffff : hexToInt(state.design.bg));

/** Bytes of a vector file (SVG, PDF, EPS), written here in JavaScript. */
async function vectorBytes(format) {
  if (format.id === "svg") return new TextEncoder().encode(toSvg(current, state.design, state.export.size));
  const options = { sizeMm: state.export.printMm, logo: logoPixels(), title: payload.slice(0, 120) };
  return format.id === "pdf" ? toPdf(current, state.design, options) : toEps(current, state.design, options);
}

async function exportAs(formatId = state.export.format) {
  if (!current) return null;
  const format = formatById(formatId);
  try {
    const name = fileName(format.ext);
    let saved;
    if (format.kind === "vector") {
      saved = await platform.saveFile(format, name, await vectorBytes(format));
    } else {
      const { px, rgba } = rasterPixels(format);
      saved = await platform.saveRaster(format, name, rgba, px, px, { quality: state.export.quality, background: exportBackground() });
    }
    if (saved) status(t(platform.isDesktop ? "toast.saved" : "toast.downloaded", { path: saved }), "ok");
    return saved;
  } catch (error) {
    status(t("toast.failed", { message: String(error?.message || error) }), "error");
    throw error;
  }
}

async function copyImage() {
  if (!current) return;
  try {
    await platform.copyImage(renderCanvas(Math.min(state.export.size, 2048)));
    status(t("toast.copiedImage"), "ok");
  } catch (error) {
    status(t("toast.failed", { message: String(error?.message || error) }), "error");
  }
}

async function copyPayload() {
  try {
    await platform.copyText(payload);
    status(t("toast.copiedText"), "ok");
  } catch (error) {
    status(t("toast.failed", { message: String(error?.message || error) }), "error");
  }
}

/** Shows a message in the status bar (kind: "", "ok" or "error"). */
function status(text, kind = "") {
  $("status").className = `status-message${kind ? ` ${kind}` : ""}`;
  $("status-text").textContent = text;
  $("status").title = text;
}

// ---- Start ----

async function init() {
  applySettings(await platform.loadSettings());
  setLanguage(state.lang);
  applyTheme();
  encoder = await createEncoder();
  if (globalThis.__TAURI__?.webviewWindow) useNativeMenus(globalThis.__TAURI__);
  setupLayout();
  createSelects();
  renderControls();
  bindControls();
  bindWindow();
  applyTranslations();
  renderTypeTabs();
  renderFields();
  syncControls();
  $("engine").textContent = t(`engine.${encoder.backend}`);
  if (state.design.logo) await setLogo(state.design.logo, { keepHistory: true });
  await update();
  history.reset(snapshot());
  refreshHistoryButtons();
  status(t("status.ready"));
  new ResizeObserver(() => redraw()).observe($("stage"));
  new ResizeObserver(() => fitToolbars()).observe(document.body);
  fitToolbars();
  platform.ready();

  // Hook for the end-to-end tests (test/scenario.js).
  window.__qrgen = {
    get state() {
      return state;
    },
    backend: encoder.backend,
    selects,
    layout: () => structuredClone(state.layout),
    result: () => current && { ...current, modules: Array.from(current.modules) },
    payload: () => payload,
    setType(type) {
      state.type = type;
      renderTypeTabs();
      renderFields();
      return update();
    },
    setValue(key, value) {
      state.values[state.type][key] = value;
      renderFields();
      return update();
    },
    setEncoding(patch) {
      Object.assign(state.encoding, patch);
      syncControls();
      return update();
    },
    setDesign(patch) {
      Object.assign(state.design, patch);
      syncControls();
      redraw();
    },
    setExport(patch) {
      Object.assign(state.export, patch);
      syncControls();
    },
    setLogo,
    /** Lists inside the page even in the desktop app (the tutorial recorder films one page). */
    inPageMenus() {
      IconSelect.native = null;
    },
    exportAs,
    undo,
    redo,
    /** Browser build only: the encoded file as base64, without saving it. */
    async exportBytes(formatId) {
      const format = formatById(formatId);
      if (format.kind === "vector") return platform.toBase64(await vectorBytes(format));
      const { wasmImageEncoder } = await import("./exporters.js");
      const { px, rgba } = rasterPixels(format);
      return platform.toBase64((await wasmImageEncoder())(rgba, px, px, format, state.export.quality, exportBackground()));
    },
    previewPixels() {
      const c = $("preview");
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return { width: c.width, height: c.height, rgba: platform.toBase64(new Uint8Array(data.buffer)) };
    },
  };
}

init().catch((error) => {
  console.error(error);
  document.body.prepend(el("pre", { className: "fatal", textContent: `QR Generator failed to start: ${error?.stack || error}` }));
  platform.ready();
});
