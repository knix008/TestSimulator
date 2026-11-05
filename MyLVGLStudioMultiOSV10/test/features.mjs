import { advance, clockWords, startJob, tick, timeWords } from "../src/toolsProgress.js";
import { findProblems, locateInCode, parseBuildProblems } from "../src/lvgl/problems.js";
// Feature coverage for npm test: settings, themes, start backgrounds, and every widget,
// property, trigger and action on every engine.
import assert from "node:assert/strict";
import fs from "node:fs";
import { addNode, addScreen, createNode, findNode, imageNameFor, newProject, parseProject, removeImageFromProject, removeNode, safeRelativePath, serializeProject } from "../src/lvgl/project.js";
import { ACTION_IDS, ALIGNS, DEVICES, FLEX_FLOWS, FONT_SIZES, GRID_CELL_PROPS, PALETTE, TRIGGERS, WIDGETS, availableIn, normalDevice, sameDevice } from "../src/lvgl/schema.js";
import { cNames, emit, valueFormat } from "../src/lvgl/emit.js";
import { confActive, confDefault, confValue, evaluateCondition, generateLvConf, overridesFromText, parseConfTemplate, readDefines, setConfValue, unknownOverrides } from "../src/lvgl/lvconf.js";
import { CONF_TEMPLATES } from "../src/lvgl/confTemplates.js";
import { FONT_LANGUAGES, addFont, clearFonts, faceForLanguage, fontBytesForFace, fontData, fontFiles, fontNameFor, markFontsWritten, readFontFile, removeFontFromProject } from "../src/lvgl/fonts.js";
import { buildCollection, buildFont } from "./minifont.mjs";
import { TUTORIAL_STEPS, finishStep, findRole, stepDone, stepSelection, taskStates, tasksOf, tutorialProject } from "../src/lvgl/tutorial.js";
import { inlinePieces, parseMarkdown } from "../src/markdown.js";
import { applyCodeEdit, isEditableCode } from "../src/lvgl/codeparse.js";
import { GENERATED_DIRS, generateCode, projectFiles } from "../src/lvgl/codegen.js";
import { addImage, clearImages, extensionOf, imageData, imageFiles, removeImage } from "../src/lvgl/images.js";
import { MAX_ACCENT_LINE, THEMES, THEME_COLOR_KEYS, buildTheme, contrast, customTheme, isThemeId, readable, setCustomThemes, themeById } from "../src/themes.js";
import { BACKGROUND_KINDS, drawBackground, isBackgroundKind } from "../src/start/backgrounds.js";
import { translator } from "../src/i18n.js";
import { engineFor, parseVersion } from "../src/lvgl/versions.js";
import { ICON_NAMES } from "../src/icons-names.js";
import { COLS, autoArrange, cardsOf, compact, layoutValue, overlaps, place, rowsFor } from "../src/start/layout.js";
import {
  DEFAULT_START_SCREEN, MAX_CUSTOM_THEMES, MAX_RECENT, OPACITY_MAX, OPACITY_MIN, SPEED_MAX, START_CARDS,
  addRecent, customThemeFrom, effectiveSpeed, newCustomThemeId, removeRecent, sanitizeGeneral,
  sanitizeCustomThemes, sanitizeRecent, sanitizeSettings, sanitizeStartScreen,
} from "../src/settings.js";

const TEST_IMAGE = "testimg";

/** A 40x30 picture with a gradient and a see-through corner, so scale and rotation show. */
export function registerTestImage(project) {
  const w = 40;
  const h = 30;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      rgba[at] = 255 - x * 6;
      rgba[at + 1] = y * 8;
      rgba[at + 2] = x * 6;
      rgba[at + 3] = x + y < 8 ? 0 : 255;
    }
  }
  addImage(TEST_IMAGE, { w, h, rgba, base64: "AAAA" });
  if (!project.images.some((image) => image.name === TEST_IMAGE)) project.images.push({ name: TEST_IMAGE, file: `assets/images/${TEST_IMAGE}.png`, w, h });
}

/** A value that exercises a property. */
function valueFor(prop) {
  if (prop.key === "frames") return TEST_IMAGE;
  if (prop.kind === "fontFamily" || prop.key === "animate") return undefined;
  if (prop.key === "duration") return 1000;
  if (prop.key === "canvasW") return 40;
  if (prop.key === "canvasH") return 30;
  if (prop.key === "qrSize") return 60;
  if (prop.key === "gridColumns") return "1fr,40,content";
  if (prop.key === "gridRows") return "1fr,2fr";
  if (prop.key === "totalTicks") return 11;
  if (prop.key === "majorEvery") return 5;
  if (prop.key === "buttons") return "Yes,No";
  if (prop.key === "points") return "0,0 40,30 80,5";
  if (prop.key === "series") return "10,40,20,80\n50,20,70,30";
  if (prop.key === "year") return 2026;
  if (prop.key === "month") return 3;
  if (prop.key === "day") return 14;
  if (prop.key === "columnWidth") return 44;
  if (prop.key === "scale") return 150;
  if (prop.key === "rotation") return 30;
  if (prop.key === "digits") return 4;
  if (prop.key === "separator") return 2;
  switch (prop.kind) {
    case "image": return TEST_IMAGE;
    case "target": return undefined;
    case "int": return prop.key === "bgOpa" || prop.key === "opa" ? 180 : prop.key === "selected" ? 1 : 5;
    case "size": return 60;
    case "color": return "#336699";
    case "bool": return true;
    case "enum": return prop.options.at(-1);
    case "lines": return "One\nTwo\nThree";
    default: return "Sample";
  }
}

/** A second value for a property: what an edit in the code changes it to. */
function otherValue(prop, current) {
  const special = {
    points: "5,5 50,20 90,10", series: "1,2,3\n4,5,6", cells: "A,B\nC,D", map: "X,Y\nZ", gridColumns: "2fr,30", gridRows: "3fr", buttons: "Go,Stop",
    items: "#Head\nRow", spans: "A \nB", year: 2027, month: 7, day: 9, digits: 5, separator: 1, scale: 151, rotation: 31, bgOpa: 181, opa: 181, selected: 2,
    columnWidth: 45, duration: 1200, canvasW: 41, canvasH: 31, qrSize: 61, totalTicks: 13, majorEvery: 3, text: 'Say "hi"\tnow',
  };
  if (special[prop.key] !== undefined) return special[prop.key];
  switch (prop.kind) {
    case "int": return (Number(current) || 0) + 1;
    case "size": return (Number(current) || 0) + 7;
    case "color": return "#123456";
    case "bool": return !current;
    case "enum": return prop.options.find((option) => option !== current);
    case "lines": return "Alpha\nBeta";
    default: return "Changed";
  }
}

/** One widget of every type with every property set, plus every size and align form. */
export function everythingProject(version) {
  const project = newProject("Everything");
  project.lvgl = version;
  project.device = { w: 800, h: 480 };
  registerTestImage(project);
  const screen = project.screens[0];
  let x = 4;
  let y = 4;
  for (const [type, definition] of Object.entries(WIDGETS)) {
    if (type === "screen" || !availableIn(type, version)) continue;
    const props = {};
    for (const prop of definition.props) {
      const value = valueFor(prop);
      if (value !== undefined) props[prop.key] = value;
    }
    Object.assign(props, { x, y, width: 90, height: 70, align: "TOP_LEFT", hidden: false, clickable: true, scrollable: false, disabled: false, opa: 255, min: 0, max: 10, value: 5 });
    // The spinner moves with time, so it is built but stays out of the picture.
    if (type === "spinner") props.hidden = true;
    // Its text area blinks a cursor, so the keyboard stays unlinked in the picture.
    addNode(project, screen.id, createNode(project, type, props));
    x += 110;
    if (x > 700) {
      x = 4;
      y += 90;
    }
  }
  const forms = addScreen(project);
  forms.props = { flexFlow: "ROW_WRAP", gap: 6, pad: 8, bgColor: "#f0f4ff", bgOpa: 255 };
  for (const width of [80, "20%", "content"]) addNode(project, forms.id, createNode(project, "button", { width, height: "content", text: `w ${width}` }));
  const aligned = addScreen(project);
  for (const align of ALIGNS) addNode(project, aligned.id, createNode(project, "label", { align, text: align }));
  const data = addScreen(project);
  const defaults = ["image", "line", "list", "table", "chart", "tabview", "calendar", "spinbox", "buttonmatrix", "keyboard"];
  defaults.forEach((type, index) => {
    const props = { x: (index % 4) * 200, y: Math.floor(index / 4) * 160 };
    if (type === "image") Object.assign(props, { src: TEST_IMAGE, rotation: 45, scale: 200 });
    addNode(project, data.id, createNode(project, type, props));
  });
  const grid = addScreen(project);
  const table = addNode(project, grid.id, createNode(project, "grid", { x: 10, y: 10, width: 400, height: 300, gridColumns: "1fr,2fr,80", gridRows: "1fr,content,1fr" }));
  for (const props of [{}, {}, {}, { gridCol: 2, gridRow: 2 }, { gridCol: 0, gridRow: 1, gridColSpan: 2 }]) addNode(project, table.id, createNode(project, "button", { text: "Cell", ...props }));
  const fonts = addScreen(project);
  fonts.props = { flexFlow: "COLUMN", gap: 1, pad: 2 };
  for (const font of FONT_SIZES) addNode(project, fonts.id, createNode(project, "label", { font, text: `Font ${font}` }));
  return project;
}

/** Records draw calls: enough to run a background without a browser. */
const GRADIENT = { addColorStop: () => {} };

function recordingContext() {
  const calls = [];
  const gradient = GRADIENT;
  const target = { createLinearGradient: () => gradient };
  return new Proxy(target, {
    get(object, name) {
      if (name === "calls") return calls;
      if (name in object) return object[name];
      return (...args) => calls.push([name, ...args.map((value) => (typeof value === "number" ? Math.round(value * 100) : value))]);
    },
    set(object, name, value) {
      calls.push([`set ${String(name)}`, value]);
      return true;
    },
  });
}

const PALETTE_COLOURS = { bg: [20, 20, 30], panel: [40, 40, 50], ink: [230, 230, 230], muted: [150, 150, 160], line: [70, 70, 80], accent: [80, 160, 255] };

export function registerFeatureTests({ category, test, engines, versions }) {
  /* ------------------------------------------------------------- settings */
  return (async () => {
    category("Settings");
    await test("Nothing stored gives the defaults", () => {
      const settings = sanitizeSettings(undefined);
      assert.equal(settings.language, "ko");
      assert.equal(settings.theme, "light-classic");
      assert.deepEqual(settings.customThemes, []);
      assert.deepEqual(settings.recent, []);
      assert.deepEqual(settings.startScreen, DEFAULT_START_SCREEN);
    });
    await test("Damaged settings become valid ones", () => {
      const settings = sanitizeSettings({ language: 5, theme: "nope", customThemes: "x", recent: {}, startScreen: 7 });
      assert.equal(settings.language, "ko");
      assert.equal(settings.theme, "light-classic");
      assert.deepEqual(settings.customThemes, []);
      assert.deepEqual(settings.recent, []);
    });
    await test("Settings the module does not know are kept", () => {
      const settings = sanitizeSettings({ window: { width: 900 }, panels: { left: 300 }, projectsDir: "C:\\p" });
      assert.deepEqual(settings.window, { width: 900 });
      assert.deepEqual(settings.panels, { left: 300 });
      assert.equal(settings.projectsDir, "C:\\p");
    });
    await test("General settings are made valid", () => {
      assert.deepEqual(sanitizeGeneral(undefined), { reopenLast: false, askTutorial: true, autoInstallTools: true, newVersion: "9.6.0", newDevice: "cyd", snap: 1 });
      assert.deepEqual(sanitizeGeneral({ reopenLast: "yes", newVersion: "7.0.0", newDevice: "nope", snap: 900 }), { reopenLast: false, askTutorial: true, autoInstallTools: true, newVersion: "9.6.0", newDevice: "cyd", snap: 50 });
      assert.deepEqual(sanitizeGeneral({ reopenLast: true, newVersion: "8.4.0", newDevice: "wvga", snap: 8 }), { reopenLast: true, askTutorial: true, autoInstallTools: true, newVersion: "8.4.0", newDevice: "wvga", snap: 8 });
    });
    await test("A saved user theme stays selected", () => {
      const settings = sanitizeSettings({ theme: "custom-1", customThemes: [{ id: "custom-1", name: "A", mode: "dark", colors: {} }] });
      assert.equal(settings.theme, "custom-1");
    });
    await test("A selected theme that no longer exists falls back", () => {
      assert.equal(sanitizeSettings({ theme: "custom-9", customThemes: [] }).theme, "light-classic");
    });
    await test("Start screen numbers are clamped to range and step", () => {
      const start = sanitizeStartScreen({ speed: 9999, cardOpacity: 1 });
      assert.equal(start.speed, SPEED_MAX);
      assert.equal(start.cardOpacity, OPACITY_MIN);
      assert.equal(sanitizeStartScreen({ speed: 44 }).speed, 40);
      assert.equal(sanitizeStartScreen({ cardOpacity: 999 }).cardOpacity, OPACITY_MAX);
    });
    await test("A background that no longer exists falls back", () => {
      assert.equal(sanitizeStartScreen({ background: "gone" }).background, DEFAULT_START_SCREEN.background);
    });
    await test("Show at startup is on unless turned off", () => {
      assert.equal(sanitizeStartScreen({}).showOnStartup, true);
      assert.equal(sanitizeStartScreen({ showOnStartup: false }).showOnStartup, false);
    });
    await test("The speed follows reduced motion only until it is chosen", () => {
      assert.equal(effectiveSpeed(null, false), 100);
      assert.equal(effectiveSpeed(null, true), 40);
      assert.equal(effectiveSpeed(0, true), 0);
      assert.equal(effectiveSpeed(200, false), 200);
    });
    await test("The saved card layout is kept, and nonsense is dropped", () => {
      assert.equal(sanitizeStartScreen({}).layout, null);
      assert.equal(sanitizeStartScreen({ layout: [1] }).layout, null);
      assert.deepEqual(sanitizeStartScreen({ layout: { version: 1, cards: {} } }).layout, { version: 1, cards: {} });
    });
    await test("Recent projects: newest first, no duplicates, limited", () => {
      let list = [];
      for (let i = 0; i < MAX_RECENT + 5; i++) list = addRecent(list, `C:\\p${i}.mylvgl`);
      assert.equal(list.length, MAX_RECENT);
      assert.equal(list[0], `C:\\p${MAX_RECENT + 4}.mylvgl`);
      list = addRecent(["C:\\A.mylvgl", "C:\\B.mylvgl"], "c:\\b.MYLVGL");
      assert.deepEqual(list, ["c:\\b.MYLVGL", "C:\\A.mylvgl"]);
      assert.deepEqual(removeRecent(list, "C:\\B.mylvgl"), ["C:\\A.mylvgl"]);
      assert.deepEqual(sanitizeRecent(["a", 5, "", null, "A"]), ["a"]);
    });

    /* --------------------------------------------------------------- themes */
    category("Themes");
    await test("A theme's accent line never glares around a button", () => {
      for (const item of THEMES) {
        const line = item.vars["--accent-line"];
        const panel = item.vars["--panel"];
        assert.ok(contrast(line, panel) <= MAX_ACCENT_LINE + 0.01, `${item.id}: ${contrast(line, panel).toFixed(2)}`);
        assert.ok(contrast(line, panel) >= Math.min(3, contrast(item.vars["--accent"], panel)), `${item.id} cannot be seen: ${contrast(line, panel).toFixed(2)}`);
      }
      const custom = buildTheme("dark", "x", "x", "x", { bg: "#000000", panel: "#101010", ink: "#ffffff", muted: "#999999", line: "#333333", accent: "#ffffff", soft: "#222222", header: "#111111", alt: "#151515", danger: "#ff5555" });
      assert.ok(contrast(custom.vars["--accent-line"], "#101010") <= MAX_ACCENT_LINE + 0.01);
    });
    await test("No thin line in the style sheets uses the raw accent around a button", () => {
      const sheets = ["styles.css", "start.css"].map((name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8")).join("\n");
      const filled = /^(\.toggle\.on|button\.primary|\.start-btn\.primary|\.start-toggle\.active|\.range-step:hover|\.selection|\.handle|\.image-placeholder|\.code-focus|\.start-card\.resizing)/;
      const found = sheets.split("\n").filter((row) => /(border(-[a-z]+)?|outline):[^;]*var\(--accent\)/.test(row) && !filled.test(row.trim()) && !row.trim().startsWith("border:") );
      assert.deepEqual(found, []);
    });
    await test("There are 20 light and 20 dark themes", () => {
      assert.equal(THEMES.filter((item) => item.mode === "light").length, 20);
      assert.equal(THEMES.filter((item) => item.mode === "dark").length, 20);
    });
    await test("Theme ids are unique and start with their mode", () => {
      assert.equal(new Set(THEMES.map((item) => item.id)).size, THEMES.length);
      for (const item of THEMES) assert.ok(item.id.startsWith(`${item.mode}-`), item.id);
    });
    await test("Every theme has names in both languages and three swatches", () => {
      for (const item of THEMES) {
        assert.ok(item.nameKo && item.nameEn, item.id);
        assert.equal(item.swatch.length, 3, item.id);
      }
    });
    await test("Every theme defines every variable the window uses", () => {
      for (const item of THEMES) {
        for (const name of ["--bg", "--panel", "--ink", "--muted", "--line", "--accent", "--accent-soft", "--header", "--danger", "--chrome", "--hover", "--button", "--pop", "--selected", "--input", "--overlay", "--on-accent", "--shadow"]) {
          assert.ok(item.vars[name], `${item.id} ${name}`);
        }
      }
    });
    await test("Text contrasts with the background in every theme", () => {
      const luminance = (hex) => {
        const n = Number.parseInt(hex.slice(1), 16);
        return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      };
      for (const item of THEMES) {
        const gap = Math.abs(luminance(item.vars["--ink"]) - luminance(item.vars["--panel"]));
        assert.ok(gap > 0.4, `${item.id}: ${gap.toFixed(2)}`);
      }
    });
    await test("Text is readable on every surface of every theme", () => {
      for (const item of THEMES) {
        const v = item.vars;
        for (const surface of ["--panel", "--input", "--pop", "--button", "--hover", "--selected", "--header", "--chrome", "--bg"]) {
          assert.ok(contrast(v["--ink"], v[surface]) >= 4.5, `${item.id}: ink on ${surface} is ${contrast(v["--ink"], v[surface]).toFixed(2)}`);
        }
        for (const surface of ["--panel", "--input", "--header", "--chrome", "--bg"]) {
          assert.ok(contrast(v["--muted"], v[surface]) >= 4.5, `${item.id}: muted on ${surface} is ${contrast(v["--muted"], v[surface]).toFixed(2)}`);
        }
        assert.ok(contrast(v["--accent-ink"], v["--selected"]) >= 4.5, `${item.id}: selected text`);
        assert.ok(contrast(v["--on-accent"], v["--accent"]) >= 3, `${item.id}: text on accent`);
        assert.ok(contrast(v["--danger"], v["--panel"]) >= 4.5, `${item.id}: danger`);
      }
    });
    await test("A user theme cannot make its text vanish", () => {
      for (const [mode, surface] of [["dark", "#101010"], ["light", "#f8f8f8"], ["dark", "#808080"]]) {
        const colors = Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, surface]));
        const { vars } = buildTheme(mode, "x", "x", "x", colors);
        assert.ok(contrast(vars["--ink"], vars["--input"]) >= 4.5, surface);
        assert.ok(contrast(vars["--muted"], vars["--input"]) >= 4.5, surface);
        assert.ok(contrast(vars["--accent-ink"], vars["--selected"]) >= 4.5, surface);
      }
    });
    await test("A theme whose surfaces disagree is still readable everywhere", () => {
      // Exactly what a user gets by editing only some colours of a light theme.
      const light = Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, "#eef2f6"]));
      const { vars } = buildTheme("dark", "x", "x", "x", { ...light, bg: "#101820", panel: "#18242f", ink: "#e8f0f8", muted: "#616a7e", accent: "#ff8800" });
      assert.equal(vars["--ink"], "#e8f0f8", "good text must not be changed");
      for (const name of ["--panel", "--input", "--pop", "--button", "--bg", "--header", "--chrome", "--hover", "--selected", "--alt-row"]) {
        assert.ok(contrast(vars["--ink"], vars[name]) >= 4.5, `ink on ${name}: ${contrast(vars["--ink"], vars[name]).toFixed(2)}`);
      }
      for (const name of ["--panel", "--input", "--header", "--chrome", "--bg"]) {
        assert.ok(contrast(vars["--muted"], vars[name]) >= 4.5, `muted on ${name}: ${contrast(vars["--muted"], vars[name]).toFixed(2)}`);
      }
      assert.ok(contrast(vars["--accent-ink"], vars["--selected"]) >= 4.5);
    });
    await test("Built-in themes keep their own colours when they already read well", () => {
      const classic = themeById("light-classic").vars;
      assert.equal(classic["--panel"], "#ffffff");
      assert.equal(classic["--accent"], "#2563eb");
    });
    await test("A colour that already reads well is left as it is", () => {
      assert.equal(readable("#000000", ["#ffffff"], 4.5), "#000000");
      assert.equal(readable("#2563eb", ["#ffffff"], 4.5), "#2563eb");
      assert.equal(contrast("#000000", "#ffffff").toFixed(0), "21");
    });
    await test("A user theme is built like a built-in one", () => {
      const colors = Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, "#112233"]));
      const built = customTheme({ id: "custom-1", name: "Mine", mode: "dark", colors });
      assert.equal(built.id, "custom-1");
      assert.equal(built.vars["--accent"], "#112233");
      assert.equal(built.vars["--bg"], "#112233");
      assert.deepEqual(Object.keys(built.vars).sort(), Object.keys(buildTheme("dark", "x", "x", "x", colors).vars).sort());
    });
    await test("A user theme is copied from any theme, and gets a new id", () => {
      const first = customThemeFrom("dark-midnight", "One", []);
      assert.equal(first.mode, "dark");
      assert.equal(first.id, "custom-1");
      assert.equal(customThemeFrom("light-classic", "Two", [first]).id, "custom-2");
      assert.equal(newCustomThemeId([{ id: "custom-2" }]), "custom-3");
    });
    await test("Registered user themes can be looked up", () => {
      const item = customThemeFrom("dark-midnight", "One", []);
      setCustomThemes([item]);
      assert.equal(themeById(item.id).nameEn, "One");
      assert.ok(isThemeId(item.id, [item]));
      setCustomThemes([]);
      assert.equal(themeById(item.id).id, "light-classic");
    });
    await test("Damaged user themes are repaired or dropped", () => {
      const list = sanitizeCustomThemes([
        null,
        { id: "bad id", name: "x" },
        { id: "custom-1", name: "  A  ", mode: "dark", colors: { bg: "#ABCDEF", ink: "red" } },
        { id: "custom-1", name: "Duplicate" },
        { id: "custom-2" },
      ]);
      assert.equal(list.length, 2);
      assert.equal(list[0].name, "A");
      assert.equal(list[0].colors.bg, "#abcdef");
      assert.match(list[0].colors.ink, /^#[0-9a-f]{6}$/);
      assert.equal(list[1].name, "custom-2");
      assert.equal(list[1].mode, "light");
    });
    await test("The number of user themes is limited", () => {
      const many = Array.from({ length: MAX_CUSTOM_THEMES + 6 }, (_, index) => ({ id: `custom-${index + 1}`, name: "x", colors: {} }));
      assert.equal(sanitizeCustomThemes(many).length, MAX_CUSTOM_THEMES);
    });

    /* ---------------------------------------------------------- backgrounds */
    category("Start screen backgrounds");
    await test("There are at least 20 backgrounds", () => {
      assert.ok(BACKGROUND_KINDS.length >= 20, String(BACKGROUND_KINDS.length));
    });
    await test("Every background has a name in both languages", () => {
      for (const language of ["ko", "en"]) {
        const t = translator(language);
        for (const kind of BACKGROUND_KINDS) assert.notEqual(t(`bg.${kind}`), `bg.${kind}`, kind);
      }
    });
    for (const kind of BACKGROUND_KINDS) {
      await test(`Background ${kind}: draws, moves, and works at any size`, () => {
        const frame = (w, h, t) => {
          const ctx = recordingContext();
          drawBackground(kind, ctx, w, h, t, PALETTE_COLOURS);
          return ctx.calls;
        };
        const early = frame(1280, 720, 10);
        assert.ok(early.length > 10, "draws too little");
        const later = frame(1280, 720, 13.7);
        assert.notDeepEqual(early, later, "does not move");
        assert.deepEqual(frame(1280, 720, 10), early, "is not a function of time");
        for (const [w, h] of [[112, 70], [1, 1], [3840, 2160]]) frame(w, h, 5);
        for (const call of early) {
          for (const value of call.slice(1)) assert.ok(typeof value !== "number" || Number.isFinite(value), `${kind}: ${call[0]} got ${value}`);
        }
        assert.ok(isBackgroundKind(kind));
      });
    }

    /* ----------------------------------------------------------- card board */
    category("Start screen board");
    const SPANS = Object.fromEntries(START_CARDS.map((id) => [id, 3]));
    const noOverlap = (cards) => {
      const ids = Object.keys(cards);
      for (const a of ids) for (const b of ids) if (a !== b) assert.ok(!overlaps(cards[a], cards[b]), `${a} overlaps ${b}`);
    };
    await test("The default board holds every card, without overlaps", () => {
      const cards = cardsOf(null, START_CARDS, SPANS, {}, 6);
      assert.deepEqual(Object.keys(cards).sort(), [...START_CARDS].sort());
      noOverlap(cards);
    });
    await test("Moving a card pushes the others down, and it stays where it was dropped", () => {
      const cards = cardsOf(null, START_CARDS, { ...SPANS, recent: 1 }, {}, 6);
      const moved = place(cards, "recent", { col: 2, row: 0 });
      assert.equal(moved.recent.col, 2);
      noOverlap(moved);
    });
    await test("Resizing a card never leaves the grid", () => {
      const cards = cardsOf({ version: 1, cards: { recent: { col: 2, row: 0, w: 9, h: 1 } } }, START_CARDS, SPANS, {}, 6);
      assert.ok(cards.recent.col + cards.recent.w <= COLS);
      assert.ok(cards.recent.h >= 2);
    });
    await test("Auto arrange and saved layouts survive a round trip", () => {
      const cards = autoArrange(START_CARDS, SPANS, {}, 6);
      noOverlap(cards);
      assert.deepEqual(cardsOf(layoutValue(cards), START_CARDS, SPANS, {}, 6), compact(cards));
    });
    await test("A card height is measured in rows, gap included", () => {
      assert.equal(rowsFor(100), 6);
      assert.equal(rowsFor(1), 2);
    });

    /* --------------------------------------------------------------- images */
    category("Images");
    await test("Image names are C-safe and unique, whatever the case", () => {
      const project = newProject();
      assert.equal(imageNameFor(project, "C:\\pics\\my logo.png"), "my_logo");
      project.images.push({ name: "my_logo", file: "assets/images/my_logo.png", w: 1, h: 1 });
      assert.equal(imageNameFor(project, "MY LOGO.jpg"), "MY_LOGO_2");
      assert.equal(imageNameFor(project, "1.png"), "_1");
    });
    await test("Pixels are stored as BGRA, the order LVGL reads", () => {
      addImage("order", { w: 1, h: 1, rgba: new Uint8ClampedArray([1, 2, 3, 4]) });
      assert.deepEqual(Array.from(imageData("order").bgra), [3, 2, 1, 4]);
      removeImage("order");
      assert.equal(imageData("order"), null);
    });
    await test("The file extension is read case-insensitively", () => {
      assert.equal(extensionOf("A.PNG"), "png");
      assert.equal(extensionOf("noextension"), "png");
    });
    await test("Removing an image clears it from widgets", () => {
      const project = newProject();
      project.images.push({ name: "a", file: "assets/images/a.png", w: 1, h: 1 });
      const node = addNode(project, project.screens[0].id, createNode(project, "image", { src: "a" }));
      removeImageFromProject(project, "a");
      assert.equal(project.images.length, 0);
      assert.ok(!("src" in findNode(project, node.id).props));
    });
    await test("Removing a text area clears the keyboards aimed at it", () => {
      const project = newProject();
      const area = addNode(project, project.screens[0].id, createNode(project, "textarea"));
      const keyboard = addNode(project, project.screens[0].id, createNode(project, "keyboard", { target: area.id }));
      removeNode(project, area.id);
      assert.ok(!("target" in findNode(project, keyboard.id).props));
    });
    await test("Project files check their images", () => {
      const bad = (images) => {
        const project = newProject();
        project.images = images;
        return serializeProject(project);
      };
      assert.throws(() => parseProject(bad([{ name: "a b", file: "assets/a.png" }])), /image name/);
      assert.throws(() => parseProject(bad([{ name: "a", file: "../evil.png" }])), /image path/);
      assert.throws(() => parseProject(bad([{ name: "a", file: "C:\\evil.png" }])), /image path/);
      assert.throws(() => parseProject(bad([{ name: "a", file: "a.png" }, { name: "a", file: "b.png" }])), /duplicate image/);
      assert.deepEqual(parseProject(JSON.stringify({ ...JSON.parse(bad([])), images: undefined })).images, []);
    });
    await test("Only paths inside the project folder are accepted", () => {
      assert.ok(safeRelativePath("assets/images/a.png"));
      for (const path of ["../a", "/a", "a/../b", "a\\b", "C:/a", "a//b"]) assert.ok(!safeRelativePath(path), path);
    });
    await test("The project folder holds the image file and its C source", () => {
      const project = newProject();
      registerTestImage(project);
      addNode(project, project.screens[0].id, createNode(project, "image", { src: TEST_IMAGE }));
      assert.deepEqual(imageFiles(project), { "assets/images/testimg.png": "AAAA" });
      const files = projectFiles(project, "App");
      const source = files["src/ui/images/ui_img_testimg.c"];
      assert.match(source, /LV_COLOR_FORMAT_ARGB8888/);
      assert.match(source, /\.header\.w = 40/);
      assert.ok(source.split("0x").length > 40 * 30 * 4, "the pixels are missing");
      assert.match(files["src/ui/ui.h"], /LV_IMAGE_DECLARE\(ui_img_testimg\)/);
      assert.match(files["src/ui/screens/ui_Screen1.c"], /lv_image_set_src\(ui_image1, &ui_img_testimg\)/);
      assert.ok(files["CMakeLists.txt"].includes("src/ui/images/ui_img_testimg.c"));
      assert.ok(GENERATED_DIRS.includes("src/ui/images"));
    });
    await test("LVGL v8 gets its own image format, for 32 and 16 bit colour", () => {
      const project = newProject();
      project.lvgl = "8.4.0";
      registerTestImage(project);
      const source = generateCode(project)["src/ui/images/ui_img_testimg.c"];
      assert.match(source, /LV_IMG_CF_TRUE_COLOR_ALPHA/);
      assert.match(source, /LV_COLOR_DEPTH == 32/);
      assert.match(source, /LV_COLOR_16_SWAP == 0/);
      assert.match(generateCode(project)["src/ui/ui.h"], /LV_IMG_DECLARE/);
    });
    await test("The code view can leave out the pixel data", () => {
      const project = newProject();
      registerTestImage(project);
      const source = generateCode(project, { imageData: false })["src/ui/images/ui_img_testimg.c"];
      assert.ok(source.length < 400);
      clearImages();
      registerTestImage(project);
    });
    await test("The API names of the new widgets follow the version", () => {
      const code = (version) => Object.values(generateCode(everythingProject(version), { imageData: false })).join("\n");
      const v8 = code("8.4.0");
      assert.match(v8, /lv_tabview_create\(ui_\w+, LV_DIR_TOP, 40\)/);
      assert.match(v8, /lv_btnmatrix_create/);
      assert.match(v8, /lv_list_add_btn/);
      assert.match(v8, /lv_table_set_row_cnt/);
      assert.match(v8, /lv_img_set_angle/);
      const v92 = code("9.2.2");
      assert.match(v92, /lv_chart_set_range/);
      assert.match(v92, /lv_calendar_set_showed_date/);
      assert.match(v92, /lv_buttonmatrix_create/);
      const v96 = code("9.6.0");
      assert.match(v96, /lv_chart_set_axis_range/);
      assert.match(v96, /lv_calendar_set_month_shown/);
      assert.match(v96, /lv_image_set_rotation/);
    });

    /* -------------------------------------------------------------- samples */
    category("Sample projects");
    const sampleIndex = JSON.parse(fs.readFileSync(new URL("../samples/index.json", import.meta.url), "utf8"));
    await test("There are several samples, each named in both languages", () => {
      assert.ok(sampleIndex.length >= 6, String(sampleIndex.length));
      for (const sample of sampleIndex) {
        assert.ok(sample.ko[0] && sample.ko[1] && sample.en[0] && sample.en[1], sample.id);
      }
    });
    await test("The samples show every LVGL family", () => {
      const families = new Set(sampleIndex.map((sample) => sample.lvgl.split(".")[0]));
      assert.deepEqual([...families].sort(), ["8", "9"]);
    });
    for (const sample of sampleIndex) {
      await test(`Sample ${sample.id}: valid, complete, no LVGL inside, and it draws`, async () => {
        const folder = new URL(`../samples/${sample.id}/`, import.meta.url);
        const project = parseProject(fs.readFileSync(new URL(`${sample.id}.mylvgl`, folder), "utf8"));
        assert.equal(project.lvgl, sample.lvgl);
        for (const file of ["CMakeLists.txt", "config/lv_conf.h", "src/main.c", "src/ui/ui.c", "src/ui/ui.h"]) assert.ok(fs.existsSync(new URL(file, folder)), file);
        assert.ok(!fs.existsSync(new URL("lvgl", folder)), "LVGL must not be included");
        clearImages();
        for (const image of project.images) {
          const bytes = fs.readFileSync(new URL(image.file, folder));
          assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47], image.file);
          const rgba = new Uint8ClampedArray(image.w * image.h * 4).fill(200);
          addImage(image.name, { w: image.w, h: image.h, rgba, base64: bytes.toString("base64") });
          assert.ok(fs.existsSync(new URL(`src/ui/images/ui_img_${image.name}.c`, folder)), image.name);
        }
        const engine = engines.get(sample.lvgl);
        if (!engine) return;
        for (const screen of project.screens) {
          engine.load(project, screen.id, { events: true });
          assert.deepEqual(engine.errors, [], screen.name);
        }
        for (const node of project.screens[0].children) assert.ok(availableIn(node.type, project.lvgl), node.type);
        clearImages();
      });
    }
    for (const [version, engine] of engines) {
      await test(`Sample ScrollMenu on LVGL ${version}: rows below the display scroll into view with a drag`, () => {
        const project = parseProject(fs.readFileSync(new URL("../samples/ScrollMenu/ScrollMenu.mylvgl", import.meta.url), "utf8"));
        project.lvgl = version;
        const menu = project.screens[0].children.find((node) => node.name === "menu_list");
        for (const row of menu.children) row.events.push({ trigger: "CLICKED", action: "log", target: "", text: row.props.text });
        const ticks = (count) => {
          for (let i = 0; i < count; i++) engine.tick(20);
        };
        engine.load(project, project.screens[0].id, { events: true });
        assert.deepEqual(engine.errors, []);
        const first = menu.children[0];
        const last = menu.children.at(-1);
        const firstY = engine.coords(first.id).y;
        const area = engine.coords(menu.id);
        assert.ok(engine.coords(last.id).y > project.device.h, "the last row should start below the display");
        const x = area.x + area.w / 2;
        // Three drags up: the throw of each is settled before the next.
        for (let drag = 0; drag < 3; drag++) {
          engine.pointer(x, 300, false);
          ticks(3);
          engine.pointer(x, 300, true);
          ticks(3);
          for (let y = 280; y >= 60; y -= 20) {
            engine.pointer(x, y, true);
            ticks(2);
          }
          engine.pointer(x, 60, false);
          ticks(80);
        }
        assert.deepEqual(engine.drainLog(), [], "a drag must not click a row");
        assert.ok(engine.coords(first.id).y < firstY, "the menu did not move");
        const row = engine.coords(last.id);
        assert.ok(row.y >= area.y && row.y + row.h <= area.y + area.h, `the last row is at ${row.y}, outside the menu`);
        engine.pointer(x, row.y + row.h / 2, false);
        ticks(3);
        engine.pointer(x, row.y + row.h / 2, true);
        ticks(3);
        engine.pointer(x, row.y + row.h / 2, false);
        ticks(5);
        assert.deepEqual(engine.drainLog(), [last.props.text]);
      });
    }
    await test("The samples are up to date with the generator", async () => {
      const { SAMPLES } = await import("../scripts/generate-samples.mjs");
      assert.deepEqual(SAMPLES.map((sample) => sample.id), sampleIndex.map((sample) => sample.id));
      for (const sample of SAMPLES) {
        clearImages();
        const expected = projectFiles(sample.build(), sample.id);
        for (const [name, text] of Object.entries(expected)) {
          const saved = fs.readFileSync(new URL(`../samples/${sample.id}/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
          assert.equal(saved, text, `${sample.id}/${name}: run npm run samples`);
        }
      }
      clearImages();
    });

    /* ------------------------------------------------------- code to design */
    category("Code to design");
    const everyFile = (project) => generateCode(project, { imageData: false });
    const screenFile = (project, screen = project.screens[0]) => `src/ui/screens/${cNames(project).get(screen.id)}.c`;
    const editLine = (text, from, to) => {
      assert.ok(text.includes(from), from);
      return text.replace(from, () => to);
    };
    const buttonProject = () => {
      const project = newProject("Edit");
      const screen = project.screens[0];
      const first = addNode(project, screen.id, createNode(project, "button", { x: 10, y: 20, width: 100, height: 40, text: "One" }));
      const second = addNode(project, screen.id, createNode(project, "label", { x: 30, y: 90, text: "Two" }));
      first.events.push({ trigger: "CLICKED", action: "setText", target: second.id, text: "Pressed" });
      return { project, first, second, file: screenFile(project) };
    };
    await test("Only the files that hold the design can be edited", () => {
      assert.ok(isEditableCode("src/ui/screens/ui_Screen1.c"));
      assert.ok(isEditableCode("src/main.c"));
      assert.ok(isEditableCode("src/ui/ui.c"));
      assert.ok(isEditableCode("config/lv_conf.h"));
      for (const file of ["src/ui/ui.h", "src/ui/ui_events.c", "src/ui/ui_events.h", "CMakeLists.txt"]) assert.ok(!isEditableCode(file), file);
    });
    for (const [version] of engines) {
      await test(`LVGL ${version}: code as generated changes nothing`, () => {
        const project = everythingProject(version);
        const files = everyFile(project);
        for (const file of Object.keys(files).filter(isEditableCode)) {
          const result = applyCodeEdit(project, file, files[file]);
          assert.deepEqual(result.errors, [], file);
          assert.equal(result.changed, false, file);
          assert.equal(result.project, project, file);
        }
      });
      const widgetProject = everythingProject(version);
      for (const node of widgetProject.screens[0].children) {
        await test(`LVGL ${version}: every property of ${node.type} can be changed in code`, () => {
          const file = screenFile(widgetProject);
          for (const prop of WIDGETS[node.type].props) {
            if (prop.kind === "target" || prop.kind === "image" || prop.key === "frames" || node.props[prop.key] === undefined) continue;
            const wanted = structuredClone(widgetProject);
            findNode(wanted, node.id).props[prop.key] = otherValue(prop, node.props[prop.key]);
            const text = everyFile(wanted)[file];
            if (text === everyFile(widgetProject)[file]) continue;
            const result = applyCodeEdit(widgetProject, file, text);
            assert.deepEqual(result.errors, [], prop.key);
            assert.ok(result.changed, prop.key);
            assert.equal(everyFile(result.project)[file], text, prop.key);
          }
        });
      }
      await test(`LVGL ${version}: the other screens read back too`, () => {
        const project = everythingProject(version);
        for (const screen of project.screens) {
          const file = screenFile(project, screen);
          const text = everyFile(project)[file];
          const result = applyCodeEdit(project, file, `${text}\n`);
          assert.deepEqual(result.errors, [], file);
          assert.equal(result.changed, false, file);
        }
      });
    }
    await test("Every sample reads back without a change", () => {
      for (const sample of sampleIndex) {
        const project = parseProject(fs.readFileSync(new URL(`../samples/${sample.file}`, import.meta.url), "utf8"));
        clearImages();
        for (const image of project.images) addImage(image.name, { w: image.w, h: image.h, rgba: new Uint8ClampedArray(image.w * image.h * 4), base64: "AAAA" });
        const files = everyFile(project);
        for (const file of Object.keys(files).filter(isEditableCode)) {
          const result = applyCodeEdit(project, file, `${files[file]}\n`);
          assert.deepEqual(result.errors, [], `${sample.id} ${file}`);
          assert.equal(result.changed, false, `${sample.id} ${file}`);
        }
      }
      clearImages();
    });
    await test("A changed number moves the widget, and the engine draws it there", () => {
      const { project, first, file } = buttonProject();
      const text = editLine(everyFile(project)[file], "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, 77);");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      assert.equal(findNode(result.project, first.id).props.x, 77);
      const engine = engines.get(result.project.lvgl);
      engine.load(result.project, result.project.screens[0].id);
      assert.equal(engine.coords(first.id).x, 77);
      assert.equal(findNode(project, first.id).props.x, 10, "the open project must not change by itself");
    });
    await test("Everyday spellings are understood and printed in the design's form", () => {
      const { project, first, file } = buttonProject();
      let text = editLine(everyFile(project)[file], "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_pos( ui_button1 , 5, 6 ) ; // moved");
      text = editLine(text, "lv_obj_set_y(ui_button1, 20);", "");
      text = editLine(text, "lv_obj_set_width(ui_button1, 100);", "lv_obj_set_size(ui_button1, LV_PCT(50), LV_SIZE_CONTENT);");
      text = editLine(text, "lv_obj_set_height(ui_button1, 40);", "/* gone */");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      const props = findNode(result.project, first.id).props;
      assert.deepEqual([props.x, props.y, props.width, props.height], [5, 6, "50%", "content"]);
    });
    await test("A new widget in the code joins the design; removing its lines removes it", () => {
      const { project, file } = buttonProject();
      const text = editLine(everyFile(project)[file], "ui_label1 = lv_label_create(ui_Screen1);", 'ui_extra = lv_slider_create(ui_Screen1);\n    lv_slider_set_value(ui_extra, 33, LV_ANIM_OFF);\n    lv_obj_set_x(ui_extra, 12);\n    ui_label1 = lv_label_create(ui_Screen1);');
      const added = applyCodeEdit(project, file, text);
      assert.deepEqual(added.errors, []);
      const node = added.project.screens[0].children[1];
      assert.deepEqual([node.type, node.name, node.props.value, node.props.x], ["slider", "extra", 33, 12]);
      assert.equal(new Set(added.project.screens[0].children.map((child) => child.id)).size, 3);
      const removed = applyCodeEdit(added.project, file, everyFile(project)[file]);
      assert.deepEqual(removed.errors, []);
      assert.equal(removed.project.screens[0].children.length, 2);
    });
    await test("Removing a widget clears the events that pointed at it", () => {
      const { project, first, file } = buttonProject();
      const text = everyFile(project)[file].split("\n").filter((line) => !line.includes("ui_label1")).join("\n");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      assert.equal(result.project.screens[0].children.length, 1);
      assert.deepEqual(findNode(result.project, first.id).events, []);
    });
    await test("Renaming in the code keeps the widget and its events", () => {
      const { project, first, file } = buttonProject();
      const text = everyFile(project)[file].replaceAll("ui_button1", "ui_start");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      const node = findNode(result.project, first.id);
      assert.equal(node.name, "start");
      assert.equal(node.events.length, 1);
      assert.equal(everyFile(result.project)[file], text);
    });
    await test("The order of the code is the order of the widgets", () => {
      const { project, first, second, file } = buttonProject();
      const lines = everyFile(project)[file].split("\n");
      const open = lines.findIndex((line) => line.includes("ui_button1 = "));
      const split = lines.findIndex((line) => line.includes("ui_label1 = "));
      const end = lines.lastIndexOf("}");
      const text = [...lines.slice(0, open), ...lines.slice(split, end), ...lines.slice(open, split), ...lines.slice(end)].join("\n");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.project.screens[0].children.map((child) => child.id), [second.id, first.id]);
    });
    await test("A widget can move into a container in the code", () => {
      const { project, first, file } = buttonProject();
      const box = addNode(project, project.screens[0].id, createNode(project, "container", { x: 0, y: 150, width: 100, height: 60 }));
      const lines = everyFile(project)[file].split("\n");
      const open = lines.findIndex((line) => line.includes("ui_button1 = "));
      const split = lines.findIndex((line) => line.includes("ui_label1 = "));
      const end = lines.lastIndexOf("}");
      const moved = lines.slice(open, split).join("\n").replace("lv_button_create(ui_Screen1)", "lv_button_create(ui_container1)");
      const text = [...lines.slice(0, open), ...lines.slice(split, end), moved, ...lines.slice(end)].join("\n");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(findNode(result.project, box.id).children.map((child) => child.id), [first.id]);
      assert.equal(result.project.screens[0].children.length, 2);
    });
    await test("A removed statement returns the property to the theme's", () => {
      const { project, first, file } = buttonProject();
      const result = applyCodeEdit(project, file, editLine(everyFile(project)[file], "lv_obj_set_width(ui_button1, 100);", ""));
      assert.deepEqual(result.errors, []);
      assert.equal(findNode(result.project, first.id).props.width, undefined);
    });
    await test("What the code does not show survives an edit", () => {
      const { project, first, second, file } = buttonProject();
      const old = addNode(project, project.screens[0].id, createNode(project, "meter", { x: 1 }));
      const keyboard = addNode(project, project.screens[0].id, createNode(project, "keyboard", { target: "" }));
      const area = addNode(project, project.screens[0].id, createNode(project, "textarea", {}));
      keyboard.props.target = area.id;
      const result = applyCodeEdit(project, file, editLine(everyFile(project)[file], "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, 11);"));
      assert.deepEqual(result.errors, []);
      assert.ok(findNode(result.project, old.id), "the meter of LVGL 8 is gone");
      assert.equal(findNode(result.project, keyboard.id).props.target, area.id);
      assert.equal(findNode(result.project, first.id).events[0].target, second.id);
    });
    const refused = [
      ["a missing semicolon", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, 10)"), "syntax"],
      ["a missing bracket", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, 10;"), "syntax"],
      ["an open string", (t) => editLine(t, 'lv_label_set_text(ui_label1, "Two");', 'lv_label_set_text(ui_label1, "Two);'), "syntax"],
      ["a function it does not know", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "my_function(ui_button1);"), "unknown"],
      ["an LVGL call it cannot show", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_scroll_to_y(ui_button1, 5, LV_ANIM_OFF);"), "unknown"],
      ["an object that does not exist", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_nothing, 10);"), "noObject"],
      ["a number that is not one", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, ten);"), "number"],
      ["a colour it cannot read", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_style_bg_color(ui_button1, red, 0);"), "colour"],
      ["a font that is not built in", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_style_text_font(ui_button1, &lv_font_montserrat_13, 0);"), "font"],
      ["a property the widget lacks", (t) => editLine(t, "lv_obj_set_x(ui_button1, 10);", "lv_slider_set_value(ui_button1, 5, LV_ANIM_OFF);"), "noProp"],
      ["a control this version lacks", (t) => editLine(t, "ui_button1 = lv_button_create(ui_Screen1);", "ui_button1 = lv_meter_create(ui_Screen1);"), "noWidget"],
      ["a second object with one name", (t) => editLine(t, "ui_label1 = lv_label_create(ui_Screen1);", "ui_button1 = lv_label_create(ui_Screen1);"), "duplicate"],
      ["a name without ui_", (t) => editLine(t, "ui_label1 = lv_label_create(ui_Screen1);", "label9 = lv_label_create(ui_Screen1);"), "badName"],
      ["a child of a button", (t) => editLine(t, "ui_label1 = lv_label_create(ui_Screen1);", "ui_label1 = lv_label_create(ui_button1);"), "notContainer"],
      ["a renamed screen", (t) => t.replaceAll("ui_Screen1", "ui_Home"), "screenName"],
      ["an image the project lacks", (t) => editLine(t, "ui_label1 = lv_label_create(ui_Screen1);", "ui_pic = lv_image_create(ui_Screen1);\n    lv_image_set_src(ui_pic, &ui_img_nothing);\n    ui_label1 = lv_label_create(ui_Screen1);"), "noImage"],
    ];
    for (const [what, change, code] of refused) {
      await test(`Code with ${what} is refused with a reason, and nothing changes`, () => {
        const { project, file } = buttonProject();
        const result = applyCodeEdit(project, file, change(everyFile(project)[file]));
        assert.equal(result.errors[0]?.code, code, JSON.stringify(result.errors));
        assert.ok(result.errors[0].line >= 1);
        assert.equal(result.project, project);
        assert.equal(result.changed, false);
      });
    }
    await test("An error names the line it is on", () => {
      const { project, file } = buttonProject();
      const text = everyFile(project)[file];
      const line = text.split("\n").findIndex((row) => row.includes("lv_obj_set_x(ui_button1, 10);")) + 1;
      const result = applyCodeEdit(project, file, editLine(text, "lv_obj_set_x(ui_button1, 10);", "lv_obj_set_x(ui_button1, ten);"));
      assert.equal(result.errors[0].line, line);
    });
    await test("Every kind of refusal has words in both languages", () => {
      for (const language of ["ko", "en"]) {
        const say = translator(language);
        for (const code of ["syntax", "unknown", "string", "number", "colour", "noObject", "duplicate", "badName", "screenName", "notContainer", "font", "noScreen", "noWidget", "noProp", "noImage", "noDefine", "deviceRange", "noTheme", "noFile", "notApplied"]) {
          assert.notEqual(say(`codeError.${code}`), `codeError.${code}`, code);
        }
      }
    });
    await test("WIDTH and HEIGHT in main.c are the screen size", () => {
      const { project } = buttonProject();
      const text = editLine(editLine(everyFile(project)["src/main.c"], `#define WIDTH ${project.device.w}`, "#define WIDTH 640"), `#define HEIGHT ${project.device.h}`, "#define HEIGHT 400");
      const result = applyCodeEdit(project, "src/main.c", text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.project.device, { w: 640, h: 400 });
      assert.deepEqual(result.unused, []);
      assert.equal(applyCodeEdit(project, "src/main.c", editLine(text, "#define WIDTH 640", "#define WIDTH 5")).errors[0].code, "deviceRange");
      assert.equal(applyCodeEdit(project, "src/main.c", editLine(text, "#define WIDTH 640", "")).errors[0].code, "noDefine");
    });
    await test("Other edits of main.c are named as having no effect", () => {
      const { project } = buttonProject();
      const text = editLine(everyFile(project)["src/main.c"], "static int redraw;", "static int redraws;");
      const result = applyCodeEdit(project, "src/main.c", text);
      assert.equal(result.changed, false);
      assert.deepEqual(result.unused, [text.split("\n").findIndex((row) => row.includes("redraws")) + 1]);
    });
    await test("The theme call in ui.c is the LVGL theme", () => {
      const { project } = buttonProject();
      const text = everyFile(project)["src/ui/ui.c"].replace(/lv_color_hex\(0x2196f3\)/, "lv_color_hex(0x112233)").replace(/, false, LV_FONT_DEFAULT/, ", true, LV_FONT_DEFAULT");
      const result = applyCodeEdit(project, "src/ui/ui.c", text);
      assert.deepEqual(result.errors, []);
      assert.equal(result.project.theme.primary, "#112233");
      assert.equal(result.project.theme.dark, true);
    });
    await test("A generated-only file never changes the project", () => {
      const { project } = buttonProject();
      const result = applyCodeEdit(project, "src/ui/ui.h", "nonsense");
      assert.deepEqual(result, { project, changed: false, errors: [], unused: [] });
    });

    /* ---------------------------------------------------------- TrueType fonts */
    category("Project fonts");
    const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ";
    const singleFont = buildFont({ family: "Mini Sans", characters: `${LATIN}가나다한글` });
    const cjkFont = buildCollection([
      { family: "Mini CJK JP", characters: `${LATIN}あいカタ日本汉语简体漢語繁體가나다한글`, shape: 0 },
      { family: "Mini CJK KR", characters: `${LATIN}あいカタ日本汉语简体漢語繁體가나다한글`, shape: 1 },
      { family: "Mini CJK SC", characters: `${LATIN}汉语简体`, shape: 0 },
    ]);
    const fontProject = (options = {}) => {
      clearFonts();
      addFont("mini", { bytes: singleFont, base64: "bWluaQ==" });
      addFont("cjk", { bytes: cjkFont, base64: "Y2pr" });
      const project = newProject("Fonts");
      project.fonts = [{ name: "mini", file: "assets/fonts/mini.ttf", face: 0 }, { name: "cjk", file: "assets/fonts/cjk.ttc", face: 1, language: "ko" }];
      const label = addNode(project, project.screens[0].id, createNode(project, "label", { x: 10, y: 10, text: "한글 ABC", ...options }));
      return { project, label, file: screenFile(project) };
    };
    await test("A font file is read: its faces, names and characters", () => {
      const { faces } = readFontFile(singleFont);
      assert.equal(faces.length, 1);
      assert.equal(faces[0].family, "Mini Sans");
      assert.equal(faces[0].style, "Regular");
      assert.ok(faces[0].has("A".codePointAt(0)));
      assert.ok(faces[0].has("한".codePointAt(0)));
      assert.ok(!faces[0].has("漢".codePointAt(0)));
      assert.deepEqual(faces[0].languages, ["ko", "latin"]);
    });
    await test("A collection has a face per language", () => {
      const { faces } = readFontFile(cjkFont);
      assert.deepEqual(faces.map((face) => face.family), ["Mini CJK JP", "Mini CJK KR", "Mini CJK SC"]);
      assert.deepEqual(faces.map((face) => face.tagged), ["ja", "ko", "zh-Hans"]);
      assert.deepEqual(faces[2].languages, ["zh-Hans", "latin"]);
    });
    await test("Choosing a language chooses its face", () => {
      const info = readFontFile(cjkFont);
      assert.equal(faceForLanguage(info, "ko"), 1);
      assert.equal(faceForLanguage(info, "ja"), 0);
      assert.equal(faceForLanguage(info, "zh-Hans"), 2);
      assert.equal(faceForLanguage(info, "latin", 2), 2, "the current face already serves it");
      assert.equal(faceForLanguage(readFontFile(singleFont), "ko"), 0, "a single font has one face");
      for (const language of FONT_LANGUAGES) assert.notEqual(translator("ko")(`language.${language.id}`), `language.${language.id}`, language.id);
    });
    await test("What is not a font is refused", () => {
      for (const bytes of [new Uint8Array(4), new Uint8Array(64), Uint8Array.from(Buffer.from("this is certainly not a font file at all"))]) assert.throws(() => readFontFile(bytes), /not a/);
      const truncated = cjkFont.slice(0, 40);
      assert.throws(() => readFontFile(truncated), /font/);
    });
    await test("A collection is pointed at the wanted face without changing the file", () => {
      const before = cjkFont.slice();
      const second = fontBytesForFace(cjkFont, 1);
      const reader = new DataView(second.buffer);
      assert.equal(reader.getUint32(12), new DataView(cjkFont.buffer).getUint32(16));
      assert.deepEqual(cjkFont, before);
      assert.equal(fontBytesForFace(cjkFont, 0), cjkFont);
      assert.equal(fontBytesForFace(singleFont, 3), singleFont);
    });
    await test("Font names fit C and stay unique", () => {
      const project = newProject("Fonts");
      assert.equal(fontNameFor(project, "C:\\Fonts\\NotoSansCJK-Regular.ttc"), "NotoSansCJK_Regular");
      project.fonts = [{ name: "NotoSansCJK_Regular", file: "a", face: 0 }];
      assert.equal(fontNameFor(project, "/x/NotoSansCJK-Regular.ttc"), "NotoSansCJK_Regular_2");
      assert.equal(fontNameFor(project, "9x.ttf"), "_9x");
    });
    await test("A project keeps its fonts on disk, and damage is refused", () => {
      const { project } = fontProject();
      project.defaultFont = { font: "cjk", size: 18 };
      const read = parseProject(serializeProject(project));
      assert.deepEqual(read.fonts, project.fonts);
      assert.deepEqual(read.defaultFont, { font: "cjk", size: 18 });
      for (const fonts of [{}, [{ name: "bad name", file: "a.ttf", face: 0 }], [{ name: "x", file: "../up.ttf", face: 0 }], [{ name: "x", file: "a.ttf", face: -1 }], [{ name: "x", file: "a.ttf", face: 0 }, { name: "x", file: "b.ttf", face: 0 }]]) {
        assert.throws(() => parseProject(JSON.stringify({ ...project, fonts })), /font/, JSON.stringify(fonts));
      }
      assert.throws(() => parseProject(JSON.stringify({ ...project, defaultFont: { font: "cjk" } })), /default font/);
      clearFonts();
    });
    await test("A project without fonts prints the code it always did", () => {
      const project = newProject("Fonts");
      const files = generateCode(project);
      assert.ok(!Object.keys(files).some((name) => name.includes("fonts")));
      assert.match(files["src/ui/ui.c"], /LV_FONT_DEFAULT\);/);
      assert.doesNotMatch(files["src/ui/ui.c"], /ui_fonts_init/);
    });
    await test("The code reads the font file and uses it", () => {
      const { project, label, file } = fontProject({ fontFamily: "cjk", font: 22 });
      project.defaultFont = { font: "mini", size: 15 };
      const files = generateCode(project);
      assert.match(files[file], new RegExp(`lv_obj_set_style_text_font\\(ui_${label.name}, ui_font_cjk_22, 0\\);`));
      const source = files["src/ui/fonts/ui_fonts.c"];
      assert.match(source, /ui_font_read\(UI_FONT_DIR "\/" "cjk\.ttc", 1, &size\)/, "face 1 of the collection");
      assert.match(source, /ui_font_cjk_22 = data \? lv_tiny_ttf_create_data\(data, size, 22\)/);
      assert.match(source, /ui_font_mini_15 = /);
      assert.match(files["src/ui/ui.h"], /extern const lv_font_t \* ui_font_cjk_22;/);
      assert.match(files["src/ui/ui.c"], /ui_fonts_init\(\);/);
      assert.match(files["src/ui/ui.c"], /, false, ui_font_mini_15\);/);
      assert.match(files["CMakeLists.txt"], /src\/ui\/fonts\/ui_fonts\.c/);
      assert.match(files["CMakeLists.txt"], /UI_FONT_DIR=/);
      assert.ok(GENERATED_DIRS.includes("src/ui/fonts"), "a removed font's code must go with it");
      clearFonts();
    });
    await test("A font and its size can be changed in the code", () => {
      const { project, label, file } = fontProject({ fontFamily: "cjk", font: 22 });
      const text = editLine(everyFile(project)[file], "ui_font_cjk_22", "ui_font_mini_30");
      const result = applyCodeEdit(project, file, text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual([findNode(result.project, label.id).props.fontFamily, findNode(result.project, label.id).props.font], ["mini", 30]);
      const none = applyCodeEdit(project, file, editLine(everyFile(project)[file], "ui_font_cjk_22", "ui_font_nothing_30"));
      assert.equal(none.errors[0].code, "noFont");
      const back = applyCodeEdit(project, file, editLine(everyFile(project)[file], "ui_font_cjk_22", "&lv_font_montserrat_24"));
      assert.deepEqual(back.errors, []);
      assert.equal(findNode(back.project, label.id).props.fontFamily, undefined);
      assert.equal(findNode(back.project, label.id).props.font, 24);
      clearFonts();
    });
    await test("The default font can be changed in ui.c", () => {
      const { project } = fontProject();
      const text = everyFile(project)["src/ui/ui.c"].replace(/, false, LV_FONT_DEFAULT\)/, ", false, ui_font_mini_20)");
      const result = applyCodeEdit(project, "src/ui/ui.c", text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.project.defaultFont, { font: "mini", size: 20 });
      assert.match(everyFile(result.project)[screenFile(result.project)], /lv_obj_set_style_text_font\(ui_Screen1, ui_font_mini_20, 0\);/);
      clearFonts();
    });
    await test("A size alone keeps the default font, in any size", () => {
      const { project, label, file } = fontProject({ font: 20 });
      const plain = everyFile(project)[file];
      assert.match(plain, /&lv_font_montserrat_20/);
      project.defaultFont = { font: "cjk", size: 16 };
      const text = everyFile(project)[file];
      assert.match(text, new RegExp(`lv_obj_set_style_text_font\\(ui_${label.name}, ui_font_cjk_20, 0\\);`));
      assert.doesNotMatch(text, /lv_font_montserrat/);
      assert.equal(applyCodeEdit(project, file, text).changed, false, "reading it back changes nothing");
      findNode(project, label.id).props.font = 23;
      assert.match(everyFile(project)[file], /ui_font_cjk_23/);
      delete project.defaultFont;
      assert.doesNotMatch(everyFile(project)[file], /lv_font_montserrat_23/, "the built-in font has no such size");
      clearFonts();
    });
    await test("What a font file lacks falls back on the built-in font", () => {
      const { project } = fontProject({ fontFamily: "mini" });
      assert.match(generateCode(project)["src/ui/fonts/ui_fonts.c"], /->fallback = LV_FONT_DEFAULT;/);
      clearFonts();
    });
    await test("Removing a font returns its widgets to the built-in font", () => {
      const { project, label } = fontProject({ fontFamily: "cjk", font: 22 });
      project.defaultFont = { font: "cjk", size: 15 };
      removeFontFromProject(project, "cjk", FONT_SIZES);
      assert.deepEqual(project.fonts.map((font) => font.name), ["mini"]);
      assert.equal(project.defaultFont, undefined);
      assert.equal(findNode(project, label.id).props.fontFamily, undefined);
      assert.equal(findNode(project, label.id).props.font, undefined, "22 is not a built-in size");
      removeFontFromProject(project, "mini", FONT_SIZES);
      assert.equal(project.fonts, undefined);
      clearFonts();
    });
    await test("A font file goes to a folder once", () => {
      const { project } = fontProject();
      assert.deepEqual(Object.keys(fontFiles(project, "one")).sort(), ["assets/fonts/cjk.ttc", "assets/fonts/mini.ttf"]);
      markFontsWritten(project, "one");
      assert.deepEqual(fontFiles(project, "one"), {});
      assert.equal(Object.keys(fontFiles(project, "two")).length, 2);
      assert.equal(fontData("mini").bytes, singleFont);
      clearFonts();
    });
    await test("Characters the font in effect lacks are a problem", () => {
      const glyphs = (project) => findProblems(project).filter((problem) => problem.code === "fontGlyphs").map((problem) => problem.params.characters);
      const built = fontProject();
      assert.deepEqual(glyphs(built.project), ["한 글"], "the built-in font is Latin only");
      const own = fontProject({ fontFamily: "mini" });
      assert.deepEqual(glyphs(own.project), [], "this font has them");
      findNode(own.project, own.label.id).props.text = "한漢";
      assert.deepEqual(glyphs(own.project), ["漢"]);
      const standard = fontProject();
      standard.project.defaultFont = { font: "cjk", size: 16 };
      assert.deepEqual(glyphs(standard.project), [], "the default font has them");
      // A size alone stays in the default font, and the built-in font's characters always show.
      const sized = fontProject({ font: 20 });
      sized.project.defaultFont = { font: "cjk", size: 16 };
      assert.deepEqual(glyphs(sized.project), []);
      const symbols = fontProject({ fontFamily: "mini", text: "A\uF001" });
      assert.deepEqual(glyphs(symbols.project), [], "LVGL's symbols come from the built-in font");
      // A container's font reaches what is inside it.
      const nested = fontProject();
      const box = addNode(nested.project, nested.project.screens[0].id, createNode(nested.project, "container", { fontFamily: "mini" }));
      addNode(nested.project, box.id, createNode(nested.project, "label", { text: "한" }));
      assert.deepEqual(glyphs(nested.project), ["한 글"]);
      clearFonts();
    });
    await test("A missing font is a problem, and the built-in font takes over", () => {
      const { project } = fontProject({ fontFamily: "gone" });
      assert.ok(findProblems(project).some((problem) => problem.code === "fontMissing"));
      clearFonts();
      assert.deepEqual(findProblems(project).filter((problem) => problem.code === "fontFile").map((problem) => problem.params.name), ["mini", "cjk"]);
      project.lvConf = { LV_USE_TINY_TTF: "0" };
      assert.ok(findProblems(project).some((problem) => problem.code === "confTtf"));
      const say = translator("en");
      for (const code of ["fontFile", "fontMissing", "fontGlyphs", "confTtf"]) assert.notEqual(say(`problem.${code}`), `problem.${code}`, code);
    });
    for (const [version, engine] of engines) {
      const ink = () => {
        const frame = engine.frame();
        let dark = 0;
        for (let i = 0; i < frame.length; i += 4) if (frame[i] < 128) dark++;
        return dark;
      };
      await test(`LVGL ${version}: the surface draws with the font file`, () => {
        const { project, label } = fontProject({ fontFamily: "mini", font: 30 });
        project.lvgl = version;
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        const own = { ink: ink(), box: engine.coords(label.id) };
        assert.ok(own.ink > 200, `nothing was drawn: ${own.ink}`);
        // Hangul has a glyph here: six characters, six boxes as wide as the font says.
        assert.ok(own.box.w >= 100, `width ${own.box.w}`);
        findNode(project, label.id).props.font = 60;
        engine.load(project, project.screens[0].id);
        assert.ok(engine.coords(label.id).w > own.box.w * 1.5, "the size did nothing");
        clearFonts();
      });
      await test(`LVGL ${version}: the keyboard keeps LVGL's symbols under a font without them`, () => {
        const frameOf = (project) => {
          engine.load(project, project.screens[0].id);
          assert.deepEqual(engine.errors, []);
          return engine.frame().slice();
        };
        const { project, label } = fontProject({ fontFamily: "mini", font: 14, text: "" });
        project.lvgl = version;
        findNode(project, label.id).props.hidden = true;
        // A button showing only a symbol: drawn with the built-in font, it looks the same either way.
        const button = addNode(project, project.screens[0].id, createNode(project, "button", { x: 20, y: 40, width: 120, height: 60, text: "\uF00C" }));
        const builtIn = frameOf(project);
        project.defaultFont = { font: "mini", size: 14 };
        delete findNode(project, button.id).props.font;
        const own = frameOf(project);
        assert.equal(Buffer.compare(Buffer.from(builtIn), Buffer.from(own)), 0, "the symbol changed: it did not come from the built-in font");
        clearFonts();
      });
      await test(`LVGL ${version}: choosing a language draws with that face`, () => {
        const { project, label } = fontProject({ fontFamily: "cjk", font: 40 });
        project.lvgl = version;
        project.fonts[1].face = 0;
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        const tall = ink();
        project.fonts[1].face = 1;
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        const flat = ink();
        assert.ok(flat < tall * 0.7, `the faces drew alike: ${tall} and ${flat}`);
        assert.ok(flat > 50, "the second face drew nothing");
        void label;
        clearFonts();
      });
      await test(`LVGL ${version}: the default font reaches every widget without its own`, () => {
        const { project, label } = fontProject({ text: "ABC" });
        project.lvgl = version;
        engine.load(project, project.screens[0].id);
        const before = engine.coords(label.id).w;
        project.defaultFont = { font: "mini", size: 44 };
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        assert.ok(engine.coords(label.id).w > before, `${before} and ${engine.coords(label.id).w}`);
        delete project.defaultFont;
        engine.load(project, project.screens[0].id);
        assert.equal(engine.coords(label.id).w, before, "the built-in font should come back");
        clearFonts();
      });
    }

    /* ---------------------------------------------- values that move other widgets */
    category("Interaction and animation");
    await test("Every sample has something to drag that moves something else", () => {
      const DRAGGED = new Set(["slider", "arc", "roller"]);
      assert.ok(sampleIndex.length >= 28, String(sampleIndex.length));
      for (const sample of sampleIndex) {
        const project = parseProject(fs.readFileSync(new URL(`../samples/${sample.file}`, import.meta.url), "utf8"));
        let drags = 0;
        const step = (node) => {
          if (DRAGGED.has(node.type) && node.events.some((event) => event.action === "setValue" || event.action === "showValue")) drags++;
          node.children.forEach(step);
        };
        project.screens.forEach(step);
        assert.ok(drags > 0, `${sample.id} has nothing to drag`);
      }
    });
    for (const [version, engine] of engines) {
      await test(`LVGL ${version}: dragging in a sample really changes the picture`, () => {
        for (const sample of sampleIndex.filter((item) => engineFor(item.lvgl).engine === version)) {
          const project = parseProject(fs.readFileSync(new URL(`../samples/${sample.file}`, import.meta.url), "utf8"));
          clearImages();
          for (const image of project.images) addImage(image.name, { w: image.w, h: image.h, rgba: new Uint8ClampedArray(image.w * image.h * 4).fill(200), base64: "AAAA" });
          let dragged = null;
          const step = (node) => {
            if (!dragged && (node.type === "slider" || node.type === "roller" || node.type === "arc") && node.events.some((event) => event.action === "setValue" || event.action === "showValue")) dragged = node;
            node.children.forEach(step);
          };
          const screen = project.screens.find((item) => {
            dragged = null;
            step(item);
            return dragged;
          });
          // Only what is dragged may change here: animations hold still, so the picture is steady.
          const still = structuredClone(project);
          const quiet = (node) => {
            delete node.props.animate;
            node.children = node.children.filter((child) => child.type !== "spinner" && child.type !== "animimage");
            node.children.forEach(quiet);
          };
          still.screens.forEach(quiet);
          engine.load(still, screen.id, { events: true });
          assert.deepEqual(engine.errors, [], sample.id);
          const ticks = (count) => { for (let i = 0; i < count; i++) engine.tick(20); };
          ticks(6);
          const before = Buffer.from(engine.frame());
          const box = engine.coords(dragged.id);
          const ring = dragged.type === "arc";
          const tall = box.h > box.w * 1.5;
          const from = ring ? { x: box.x + 7, y: box.y + box.h * 0.5 } : tall ? { x: box.x + box.w / 2, y: box.y + box.h * 0.85 } : dragged.type === "roller" ? { x: box.x + box.w / 2, y: box.y + box.h * 0.8 } : { x: box.x + box.w * 0.15, y: box.y + box.h / 2 };
          const to = ring ? { x: box.x + box.w * 0.85, y: box.y + box.h * 0.15 } : tall ? { x: from.x, y: box.y + box.h * 0.2 } : dragged.type === "roller" ? { x: from.x, y: box.y + box.h * 0.2 } : { x: box.x + box.w * 0.8, y: from.y };
          engine.pointer(from.x, from.y, false);
          ticks(3);
          engine.pointer(from.x, from.y, true);
          ticks(3);
          for (let i = 1; i <= 10; i++) {
            engine.pointer(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10, true);
            ticks(2);
          }
          engine.pointer(to.x, to.y, false);
          ticks(60);
          assert.ok(!before.equals(Buffer.from(engine.frame())), `${sample.id}: dragging ${dragged.name} changed nothing`);
        }
        clearImages();
      });
    }
    await test("A value's format allows one number and shows every other % as itself", () => {
      for (const [text, wanted] of [["%d km/h", "%d km/h"], ["%d %%", "%d %%"], ["100%", "100%%"], ["%s", "%%s"], ["%d and %d", "%d and %%d"], ["%n", "%%n"], ["", ""], ["plain", "plain"]]) {
        assert.equal(valueFormat(text), wanted, text);
      }
    });
    for (const [version, engine] of engines) {
      await test(`LVGL ${version}: an arc and a spinner draw in their indicator colour`, () => {
        const red = (project) => {
          engine.load(project, project.screens[0].id);
          assert.deepEqual(engine.errors, []);
          const frame = engine.frame();
          let count = 0;
          for (let i = 0; i < frame.length; i += 4) if (frame[i] < 40 && frame[i + 1] < 40 && frame[i + 2] > 220) count++;
          return count;
        };
        for (const [type, props] of [["arc", { min: 0, max: 100, value: 80 }], ["spinner", {}]]) {
          const project = newProject("Colour");
          project.lvgl = version;
          const node = addNode(project, project.screens[0].id, createNode(project, type, { x: 20, y: 20, width: 150, height: 150, ...props }));
          assert.equal(red(project), 0, `${type} is red by itself`);
          node.props.indicatorColor = "#ff0000";
          assert.ok(red(project) > 100, `${type} did not turn red`);
        }
      });
    }
    await test("An arc's indicator colour goes both ways through the code", () => {
      const project = newProject("Colour");
      project.lvgl = "9.6.0";
      const arc = addNode(project, project.screens[0].id, createNode(project, "arc", { x: 20, y: 20, indicatorColor: "#112233" }));
      const file = "src/ui/screens/ui_Screen1.c";
      const text = generateCode(project, { imageData: false })[file];
      assert.match(text, /lv_obj_set_style_arc_color\(ui_arc1, lv_color_hex\(0x112233\), LV_PART_INDICATOR\);/);
      assert.match(text, /lv_obj_set_style_bg_color\(ui_arc1, lv_color_hex\(0x112233\), LV_PART_KNOB\);/);
      assert.equal(applyCodeEdit(project, file, text).changed, false);
      const edited = applyCodeEdit(project, file, text.replace("lv_color_hex(0x112233), LV_PART_INDICATOR", "lv_color_hex(0x445566), LV_PART_INDICATOR"));
      assert.deepEqual(edited.errors, []);
      assert.equal(findNode(edited.project, arc.id).props.indicatorColor, "#445566");
      assert.match(generateCode(edited.project, { imageData: false })[file], /0x445566\), LV_PART_KNOB/, "the knob follows");
    });
    const linkedProject = (version) => {
      const project = newProject("Links");
      project.lvgl = version;
      project.device = { w: 480, h: 320 };
      const screen = project.screens[0];
      const put = (type, props) => addNode(project, screen.id, createNode(project, type, props));
      const slider = put("slider", { x: 20, y: 280, width: 400, height: 12, min: 0, max: 240, value: 0 });
      const arc = put("arc", { x: 20, y: 20, width: 120, height: 120, min: 0, max: 100, value: 0 });
      const bar = put("bar", { x: 160, y: 20, width: 200, height: 20, min: -50, max: 50, value: -50 });
      const led = put("led", { x: 160, y: 60, width: 30, height: 30, ledBright: 0 });
      const label = put("label", { x: 160, y: 100, text: "0" });
      for (const target of [arc, bar, led]) slider.events.push({ trigger: "VALUE_CHANGED", action: "setValue", target: target.id, text: "" });
      slider.events.push({ trigger: "VALUE_CHANGED", action: "showValue", target: label.id, text: "%d km/h" });
      return { project, slider, arc, bar, led, label };
    };
    for (const [version, engine] of engines) {
      await test(`LVGL ${version}: dragging a slider moves what it drives, each over its own range`, () => {
        const { project, slider, arc, bar, label } = linkedProject(version);
        engine.load(project, project.screens[0].id, { events: true });
        assert.deepEqual(engine.errors, []);
        const width = engine.coords(label.id).w;
        const box = engine.coords(slider.id);
        const y = box.y + 6;
        const ticks = (count) => { for (let i = 0; i < count; i++) engine.tick(20); };
        engine.pointer(box.x + 5, y, false);
        ticks(3);
        engine.pointer(box.x + 5, y, true);
        ticks(3);
        for (let x = box.x + 20; x <= box.x + 200; x += 20) {
          engine.pointer(x, y, true);
          ticks(2);
        }
        engine.pointer(box.x + 200, y, false);
        ticks(5);
        const value = engine.valueOf(slider.id);
        assert.ok(value > 80 && value < 160, `slider ${value}`);
        assert.equal(engine.valueOf(arc.id), Math.floor((value * 100) / 240), "the arc");
        assert.ok(Math.abs(engine.valueOf(bar.id) - (-50 + (value * 100) / 240)) <= 1, `the bar: ${engine.valueOf(bar.id)}`);
        assert.ok(engine.coords(label.id).w > width, "the text did not change");
      });
      await test(`LVGL ${version}: a value sweeps by itself when running, and holds still in the design`, () => {
        const { project, slider, arc } = linkedProject(version);
        slider.props.animate = 400;
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        for (let i = 0; i < 10; i++) engine.tick(20);
        assert.equal(engine.valueOf(slider.id), 0, "the design must hold still");
        assert.deepEqual(engine.drainLog(), []);
        engine.load(project, project.screens[0].id, { events: true });
        assert.deepEqual(engine.errors, []);
        for (let i = 0; i < 10; i++) engine.tick(20);
        const rising = engine.valueOf(slider.id);
        assert.ok(rising > 0, `it did not start: ${rising}`);
        assert.ok(engine.valueOf(arc.id) > 0, "the slider's listeners did not hear it");
        for (let i = 0; i < 12; i++) engine.tick(20);
        const top = engine.valueOf(slider.id);
        assert.ok(top > rising, `${rising} then ${top}`);
        for (let i = 0; i < 20; i++) engine.tick(20);
        assert.ok(engine.valueOf(slider.id) < top, "it did not come back");
      });
    }
    await test("The code does what the surface does", () => {
      const { project, slider } = linkedProject("9.6.0");
      slider.props.animate = 1500;
      const files = generateCode(project);
      const events = files["src/ui/ui_events.c"];
      assert.match(events, /lv_arc_set_value\(ui_arc1, lv_map\(lv_slider_get_value\(ui_slider1\), 0, 240, 0, 100\)\);/);
      assert.match(events, /lv_bar_set_value\(ui_bar1, lv_map\(lv_slider_get_value\(ui_slider1\), 0, 240, -50, 50\), LV_ANIM_OFF\);/);
      assert.match(events, /lv_led_set_brightness\(ui_led1, lv_map\(lv_slider_get_value\(ui_slider1\), 0, 240, 0, 255\)\);/);
      assert.match(events, /lv_snprintf\(text, sizeof\(text\), "%d km\/h", lv_slider_get_value\(ui_slider1\)\);/);
      assert.match(events, /lv_label_set_text\(ui_label1, text\);/);
      assert.match(events, /void ui_slider1_set\(void \* obj, int32_t value\)/);
      assert.match(events, /lv_anim_set_repeat_count\(&anim, LV_ANIM_REPEAT_INFINITE\);/);
      assert.match(files["src/ui/screens/ui_Screen1.c"], /ui_animate_value\(ui_slider1, ui_slider1_set, 0, 240, 1500\);/);
      assert.match(files["src/ui/ui.h"], /void ui_animate_value\(/);
      const plain = linkedProject("9.6.0");
      assert.doesNotMatch(generateCode(plain.project)["src/ui/ui_events.c"], /ui_animate_value/);
    });
    await test("The sweep can be changed in the code, and removed", () => {
      const { project, slider } = linkedProject("9.6.0");
      slider.props.animate = 1500;
      const file = "src/ui/screens/ui_Screen1.c";
      const text = generateCode(project, { imageData: false })[file];
      assert.equal(applyCodeEdit(project, file, text).changed, false);
      const faster = applyCodeEdit(project, file, text.replace("0, 240, 1500", "0, 240, 700"));
      assert.deepEqual(faster.errors, []);
      assert.equal(findNode(faster.project, slider.id).props.animate, 700);
      const none = applyCodeEdit(project, file, text.replace("    ui_animate_value(ui_slider1, ui_slider1_set, 0, 240, 1500);\n", ""));
      assert.deepEqual(none.errors, []);
      assert.equal(findNode(none.project, slider.id).props.animate, undefined);
    });
    await test("A value action on a widget without a value is a problem", () => {
      const project = newProject("Links");
      const screen = project.screens[0];
      const button = addNode(project, screen.id, createNode(project, "button", { x: 0, y: 0, width: 50, height: 30, text: "x" }));
      const slider = addNode(project, screen.id, createNode(project, "slider", { x: 0, y: 60, width: 100, height: 10 }));
      const label = addNode(project, screen.id, createNode(project, "label", { x: 0, y: 100, text: "x" }));
      const codes = () => findProblems(project).filter((problem) => problem.code === "eventValue").length;
      assert.equal(codes(), 0);
      button.events.push({ trigger: "CLICKED", action: "setValue", target: slider.id, text: "" });
      assert.equal(codes(), 1);
      button.events = [];
      slider.events.push({ trigger: "VALUE_CHANGED", action: "setValue", target: label.id, text: "" });
      assert.equal(codes(), 1);
      slider.events = [{ trigger: "VALUE_CHANGED", action: "showValue", target: label.id, text: "%d" }];
      assert.equal(codes(), 0);
    });

    /* ------------------------------------------------------------ round screens */
    category("Round screens");
    await test("A round screen is square, stays on disk, and damage is refused", () => {
      assert.deepEqual(normalDevice({ w: 300, h: 200, shape: "round" }), { w: 300, h: 300, shape: "round" });
      assert.deepEqual(normalDevice({ w: 300, h: 200 }), { w: 300, h: 200 });
      const project = newProject("Round");
      project.device = { w: 360, h: 360, shape: "round" };
      assert.deepEqual(parseProject(serializeProject(project)).device, project.device);
      for (const device of [{ w: 360, h: 360, shape: "oval" }, { w: 360, h: 300, shape: "round" }]) {
        assert.throws(() => parseProject(JSON.stringify({ ...project, device })), /device shape/, JSON.stringify(device));
      }
    });
    await test("There are round sizes to choose, told apart from square ones", () => {
      const round = DEVICES.filter((device) => device.shape === "round");
      assert.ok(round.length >= 3);
      for (const device of round) assert.equal(device.w, device.h);
      assert.equal(sameDevice({ w: 240, h: 240 }, { w: 240, h: 240, shape: "round" }), false);
      assert.equal(sameDevice({ w: 240, h: 240, shape: "round" }, { w: 240, h: 240, shape: "round" }), true);
      for (const device of DEVICES) assert.notEqual(translator("ko")(`device.${device.id}`), `device.${device.id}`, device.id);
    });
    await test("Widgets reaching outside the circle are a problem; a ring that fits is not", () => {
      const project = newProject("Round");
      project.device = { w: 240, h: 240, shape: "round" };
      const screen = project.screens[0];
      const outside = () => findProblems(project).filter((problem) => problem.code === "roundOutside").length;
      const corner = addNode(project, screen.id, createNode(project, "button", { x: 0, y: 0, width: 60, height: 40, text: "x" }));
      assert.equal(outside(), 1);
      corner.props.x = 90;
      corner.props.y = 100;
      assert.equal(outside(), 0);
      addNode(project, screen.id, createNode(project, "arc", { align: "CENTER", width: 220, height: 220 }));
      assert.equal(outside(), 0);
      delete project.device.shape;
      corner.props.x = 0;
      corner.props.y = 0;
      assert.equal(outside(), 0, "not on a rectangular screen");
    });
    await test("The simulator window masks what lies outside the circle", () => {
      const project = newProject("Round");
      assert.doesNotMatch(generateCode(project)["src/main.c"], /SDL_RenderDrawLine/);
      project.device = { w: 240, h: 240, shape: "round" };
      assert.match(generateCode(project)["src/main.c"], /SDL_RenderDrawLine/);
    });
    await test("The round samples use the round screen", () => {
      assert.equal(sampleIndex.find((sample) => sample.id === "RoundGauge").device.shape, "round");
      assert.equal(sampleIndex.find((sample) => sample.id === "SmartWatch").device.shape, "round");
    });

    /* ---------------------------------------------------- tutorial and documents */
    category("Tutorial and documents");
    await test("Uninstalling removes every downloaded LVGL file, the compiler and the builds; an update keeps them", () => {
      const hooks = fs.readFileSync(new URL("../src-tauri/windows/hooks.nsh", import.meta.url), "utf8").replace(/\r\n/g, "\n");
      const main = fs.readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
      const lvgl = fs.readFileSync(new URL("../src-tauri/src/lvgl.rs", import.meta.url), "utf8");
      const folder = /const SETTINGS_FOLDER: &str = "([^"]+)"/.exec(main)[1];
      assert.equal(/!define MLS_FOLDER "([^"]+)"/.exec(hooks)[1], folder, "the uninstaller must look where the app stores");
      assert.ok(lvgl.includes('crate::data_dir().join("lvgl")'), "the LVGL versions moved: the uninstaller must follow");
      // A download that was interrupted is in the same folder.
      assert.ok(lvgl.includes('base.join(format!(".download-{version}.zip"))') && lvgl.includes('base.join(format!(".partial-{version}"))'), "an interrupted download moved");
      const uninstall = hooks.slice(hooks.indexOf("!macro NSIS_HOOK_POSTUNINSTALL"));
      const when = uninstall.slice(uninstall.indexOf("${If} $UpdateMode <> 1"), uninstall.indexOf("${EndIf}"));
      for (const line of ['RmDir /r "$APPDATA\\${MLS_FOLDER}\\lvgl"', 'RmDir /r "$APPDATA\\${MLS_FOLDER}\\native"', 'RmDir /r "$LOCALAPPDATA\\${MLS_FOLDER}\\toolchain"', 'RmDir /r "$LOCALAPPDATA\\${MLS_FOLDER}\\toolchain.partial"']) {
        assert.ok(when.includes(line), line);
      }
    });

    await test("The tutorial question can be turned off, and stays off", () => {
      assert.equal(sanitizeGeneral({}).askTutorial, true);
      assert.equal(sanitizeGeneral({ askTutorial: false }).askTutorial, false);
      assert.equal(sanitizeGeneral({ askTutorial: "no" }).askTutorial, true);
      assert.equal(sanitizeGeneral({}).autoInstallTools, true);
      {
        // The installation's progress: what it says at each point, on a clock of its own.
        const info = { dir: "x", installedMegabytes: 410, items: [{ id: "a", megabytes: 100, parts: [] }, { id: "b", megabytes: 10, parts: [] }] };
        let job = startJob(info, 0);
        assert.equal(job.percent, 0);
        assert.equal(job.seconds, null, "the time is not known before anything has come");
        assert.equal(timeWords((key, v) => key + JSON.stringify(v), job.seconds), null);
        job = advance(job, { item: 0, phase: "download", done: 20000000, total: 100000000 }, 2000);
        assert.equal(job.items[0].state, "download");
        assert.equal(job.received, 20000000);
        assert.equal(Math.round(job.speed), 10000000);
        // 90 MB at 10 MB/s, and an estimate for unpacking 110 MB.
        assert.equal(Math.round(job.seconds), 9 + Math.round(110 * 0.06));
        // Nothing arriving: the clock goes on and it says that it is waiting, then news ends that.
        job = tick(job, 2500);
        assert.equal(job.stalled, false);
        assert.equal(job.elapsed, 2.5);
        const quiet = tick(job, 8000);
        assert.equal(quiet.stalled, true);
        assert.equal(quiet.elapsed, 8);
        assert.equal(quiet.speed, 0, "the speed falls when nothing is arriving");
        assert.notEqual(quiet.seconds, null, "the last speed still gives a time");
        assert.equal(advance(quiet, { item: 0, phase: "download", done: 21000000, total: 100000000 }, 8100).stalled, false);
        assert.equal(clockWords(0), "0:00");
        assert.equal(clockWords(125.7), "2:05");
        const before = job.percent;
        job = advance(job, { item: 0, phase: "unpack", done: 50, total: 100 }, 10000);
        assert.ok(job.percent > before, "unpacking counts");
        // Unpacking the first archive with the second still to come: the speed runs down, the time must not jump.
        const fading = advance(job, { item: 0, phase: "unpack", done: 95, total: 100 }, 14000);
        assert.ok(fading.speed < job.speed, "nothing is arriving");
        assert.ok(fading.seconds < 15, `the time left jumped to ${fading.seconds} s`);
        assert.equal(job.items[0].received, 100000000, "an archive being unpacked has been downloaded");
        job = advance(job, { item: 0, phase: "done", done: 1, total: 1 }, 12000);
        job = advance(job, { item: 1, phase: "done", done: 1, total: 1 }, 13000);
        assert.equal(job.percent, 100);
        assert.equal(job.seconds, 0);
        // A server that does not say the size: an estimate that grows, and is exact once it is all here.
        let unknown = startJob({ dir: "x", installedMegabytes: 25, version: "9.6.0", items: [{ id: "lvgl", megabytes: 100, parts: [] }] }, 0);
        assert.equal(unknown.version, "9.6.0");
        unknown = advance(unknown, { item: 0, phase: "download", done: 40000000, total: 0 }, 2000);
        assert.equal(unknown.items[0].exact, false);
        assert.equal(unknown.bytes, 100000000);
        assert.ok(unknown.seconds > 0, "the estimate gives a time");
        unknown = advance(unknown, { item: 0, phase: "download", done: 120000000, total: 0 }, 4000);
        assert.ok(unknown.bytes > 120000000, "the estimate grows past what has arrived");
        assert.ok(unknown.percent < 100, "not done before it is");
        unknown = advance(unknown, { item: 0, phase: "unpack", done: 0, total: 1 }, 5000);
        assert.equal(unknown.bytes, 120000000, "all of it has arrived: now the size is known");
        assert.equal(unknown.items[0].exact, true);
        const words = (key, v) => `${key}:${JSON.stringify(v ?? {})}`;
        assert.equal(timeWords(words, 3), 'tools.seconds:{"seconds":5}');
        assert.equal(timeWords(words, 61), 'tools.minutes:{"minutes":1,"seconds":5}');
        assert.equal(timeWords(words, 120), 'tools.minutesOnly:{"minutes":2}');
      }
      assert.equal(sanitizeGeneral({ autoInstallTools: false }).autoInstallTools, false);
    });
    await test("Every tutorial step and task has words in both languages", () => {
      assert.ok(TUTORIAL_STEPS.length >= 10);
      assert.equal(new Set(TUTORIAL_STEPS.map((step) => step.id)).size, TUTORIAL_STEPS.length);
      for (const language of ["ko", "en"]) {
        const say = translator(language);
        for (const step of TUTORIAL_STEPS) {
          for (const part of ["title", "text", ...tasksOf(step).map((task) => `task.${task.id}`)]) assert.notEqual(say(`tutorial.${step.id}.${part}`), `tutorial.${step.id}.${part}`, `${language} ${step.id}`);
          // A task's words must not stand in for the step's own explanation.
          assert.ok(say(`tutorial.${step.id}.text`).length > 30, `${language} ${step.id}: too short to explain anything`);
        }
        for (const word of ["tutorial.doIt", "tutorial.notYet"]) assert.notEqual(say(word), word);
      }
    });
    const builtWatch = (version) => {
      const project = tutorialProject();
      if (version) project.lvgl = version;
      for (const step of TUTORIAL_STEPS) finishStep(project, step, { ran: true });
      return project;
    };
    await test("Tutorial: a task is open until it is done, also when done by hand", () => {
      const project = tutorialProject();
      assert.deepEqual(project.screens[0].children, []);
      const round = TUTORIAL_STEPS.find((step) => step.id === "round");
      assert.equal(stepDone(project, round), false);
      project.device = { w: 360, h: 360, shape: "round" };
      assert.equal(stepDone(project, round), true);
      for (const step of TUTORIAL_STEPS) {
        if (!tasksOf(step).length) {
          assert.equal(stepDone(project, step), true, step.id);
          continue;
        }
        if (step.id !== "round") assert.equal(stepDone(project, step), false, `${step.id} is done before it starts`);
        const before = taskStates(project, step).filter((task) => !task.done).length;
        assert.ok(before > 0 || step.id === "round", step.id);
        finishStep(project, step);
        if (tasksOf(step).some((task) => task.run)) assert.equal(stepDone(project, step, { ran: true }), true);
        else assert.equal(stepDone(project, step), true, step.id);
      }
      // Colours in capitals and numbers as text count the same; a wrong value does not.
      const ring = findRole(project, { screen: 0, type: "arc", nth: 0 });
      const colour = TUTORIAL_STEPS.find((step) => step.id === "outer");
      ring.props.indicatorColor = "#66BB6A";
      ring.props.value = "68";
      assert.equal(stepDone(project, colour), true);
      ring.props.value = 67;
      assert.equal(stepDone(project, colour), false);
    });
    await test("Tutorial: doing a step again adds nothing, and selection follows the step", () => {
      const project = builtWatch();
      const once = JSON.stringify(project);
      for (const step of TUTORIAL_STEPS) finishStep(project, step, { ran: true });
      assert.equal(JSON.stringify(project), once);
      const heart = TUTORIAL_STEPS.find((step) => step.id === "heart");
      assert.equal(stepSelection(project, heart), findRole(project, heart.focus).id);
      const fresh = tutorialProject();
      assert.equal(stepSelection(fresh, TUTORIAL_STEPS[1]), fresh.screens[0].id, "before its widget exists, a step selects its screen");
    });
    await test("Tutorial: the finished watch is round, has two screens and has no problems", () => {
      const project = builtWatch();
      assert.deepEqual(project.device, { w: 360, h: 360, shape: "round" });
      assert.deepEqual(project.screens.map((screen) => screen.name), ["Face", "Workout"]);
      assert.deepEqual(project.screens[0].children.map((node) => node.type), ["arc", "arc", "label", "label", "label", "bar", "button"]);
      assert.deepEqual(project.screens[1].children.map((node) => node.type), ["arc", "label", "label", "button"]);
      assert.deepEqual(findProblems(project).map((problem) => `${problem.code ?? problem.key}`), []);
      assert.equal(findRole(project, { screen: 0, type: "label", nth: 0 }).props.text, "10:30", "the code step changes the time");
      const code = generateCode(project);
      assert.match(JSON.stringify(code), /ui_init/);
    });
    for (const [version, engine] of engines) {
      await test(`LVGL ${version}: the tutorial's watch really works`, () => {
        const project = builtWatch(version);
        const [face, workout] = project.screens;
        const ring = findRole(project, { screen: 0, type: "arc", nth: 0 });
        const inner = findRole(project, { screen: 0, type: "arc", nth: 1 });
        const go = findRole(project, { screen: 0, type: "button", nth: 0 });
        engine.load(project, face.id, { events: true });
        assert.deepEqual(engine.errors, []);
        const ticks = (count) => { for (let i = 0; i < count; i++) engine.tick(20); };
        // The inner ring sweeps by itself.
        const at = engine.valueOf(inner.id);
        ticks(30);
        assert.notEqual(engine.valueOf(inner.id), at, "the inner ring stands still");
        // Without the sweep the picture holds still, so what changes is what was done.
        const still = structuredClone(project);
        delete findRole(still, { screen: 0, type: "arc", nth: 1 }).props.animate;
        engine.load(still, face.id, { events: true });
        ticks(6);
        // The outer ring follows a drag along its edge, over the top.
        const box = engine.coords(ring.id);
        const edge = (degrees) => [box.x + box.w / 2 + (Math.cos((degrees * Math.PI) / 180) * box.w * 0.47), box.y + box.h / 2 + (Math.sin((degrees * Math.PI) / 180) * box.h * 0.47)];
        const start = engine.valueOf(ring.id);
        const [fromX, fromY] = edge(300);
        engine.pointer(fromX, fromY, false);
        ticks(3);
        engine.pointer(fromX, fromY, true);
        ticks(3);
        for (let degrees = 300; degrees >= 200; degrees -= 10) {
          const [x, y] = edge(degrees);
          engine.pointer(x, y, true);
          ticks(3);
        }
        const [toX, toY] = edge(200);
        engine.pointer(toX, toY, false);
        ticks(5);
        assert.ok(engine.valueOf(ring.id) < start, `the ring did not follow the drag: ${start} to ${engine.valueOf(ring.id)}`);
        // The button leads to another picture.
        const before = Buffer.from(engine.frame());
        const button = engine.coords(go.id);
        const [x, y] = [button.x + button.w / 2, button.y + button.h / 2];
        engine.pointer(x, y, false);
        ticks(3);
        engine.pointer(x, y, true);
        ticks(5);
        engine.pointer(x, y, false);
        ticks(30);
        assert.ok(!before.equals(Buffer.from(engine.frame())), "the button did not change the screen");
        assert.equal(workout.name, "Workout");
        assert.deepEqual(engine.errors, []);
      });
    }
    await test("Rings inside rings: the code says only the ring takes a press", () => {
      const project = tutorialProject();
      addNode(project, project.screens[0].id, createNode(project, "arc"));
      assert.match(JSON.stringify(generateCode(project)), /lv_obj_add_flag\(ui_arc\d+, LV_OBJ_FLAG_ADV_HITTEST\);/);
    });
    for (const [version, engine] of engines) {
      await test(`LVGL ${version}: each of three rings inside each other takes its own drag`, () => {
        const project = tutorialProject();
        project.device = { w: 480, h: 480, shape: "round" };
        const screen = project.screens[0];
        const rings = [420, 320, 220].map((size) => addNode(project, screen.id, createNode(project, "arc", { align: "CENTER", width: size, height: size, min: 0, max: 100, value: 70 })));
        const ticks = (count) => { for (let i = 0; i < count; i++) engine.tick(20); };
        for (const ring of rings) {
          engine.load(project, screen.id, { events: true });
          ticks(6);
          const box = engine.coords(ring.id);
          const at = (degrees) => [box.x + box.w / 2 + (Math.cos((degrees * Math.PI) / 180) * (box.w / 2 - 7)), box.y + box.h / 2 + (Math.sin((degrees * Math.PI) / 180) * (box.h / 2 - 7))];
          const [startX, startY] = at(300);
          engine.pointer(startX, startY, false);
          ticks(3);
          engine.pointer(startX, startY, true);
          ticks(3);
          for (let degrees = 300; degrees >= 200; degrees -= 10) {
            const [x, y] = at(degrees);
            engine.pointer(x, y, true);
            ticks(3);
          }
          const [endX, endY] = at(200);
          engine.pointer(endX, endY, false);
          ticks(5);
          for (const other of rings) {
            const value = engine.valueOf(other.id);
            if (other === ring) assert.ok(value < 70, `the ring of ${box.w} did not follow its drag: ${value}`);
            else assert.equal(value, 70, `a drag on the ring of ${box.w} moved another ring`);
          }
        }
        // A press in the empty middle moves nothing.
        engine.load(project, screen.id, { events: true });
        ticks(6);
        engine.pointer(240, 240, false);
        ticks(3);
        engine.pointer(240, 240, true);
        ticks(3);
        engine.pointer(300, 200, true);
        ticks(5);
        engine.pointer(300, 200, false);
        ticks(5);
        for (const ring of rings) assert.equal(engine.valueOf(ring.id), 70);
      });
    }
    await test("The installer asks for its language every time, in both languages", () => {
      const conf = JSON.parse(fs.readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
      assert.equal(conf.bundle.windows.nsis.displayLanguageSelector, true);
      assert.deepEqual(conf.bundle.windows.nsis.languages, ["Korean", "English"]);
      const bytes = fs.readFileSync(new URL("../src-tauri/windows/hooks.nsh", import.meta.url));
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "without the BOM NSIS garbles the Korean");
      const hooks = bytes.toString("utf8");
      assert.match(hooks, /^!define MUI_LANGDLL_ALWAYSSHOW/m);
      // The program's first start uses it, and uninstalling leaves no file behind.
      assert.match(hooks, /FileWrite \$R0 "\$LANGUAGE"/);
      assert.match(hooks, /NSIS_HOOK_PREUNINSTALL\s+Delete "\$INSTDIR\\\$\{MLS_LANGUAGE_FILE\}"/);
      assert.match(fs.readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8"), /install-language\.txt/);
      assert.match(hooks, /MUI_LANGDLL_INFO ".*[\uAC00-\uD7A3].*Please select/);
    });
    await test("Markdown becomes plain data", () => {
      const blocks = parseMarkdown("# Title\n\nSome **bold** and `code`.\nNext line.\n\n- one\n- two\n\n1. first\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nint x;\n```\n");
      assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "table", "code"]);
      assert.equal(blocks[1].text, "Some **bold** and `code`. Next line.");
      assert.equal(blocks[3].ordered, true);
      assert.deepEqual(blocks[4].rows, [["1", "2"]]);
      assert.equal(blocks[5].text, "int x;");
      assert.deepEqual(inlinePieces("a **b** `c` [d](e.md) ![f](g.png)"), [{ text: "a " }, { bold: "b" }, { text: " " }, { code: "c" }, { text: " " }, { link: "d", href: "e.md" }, { text: " " }, { image: "f", src: "g.png" }]);
      assert.deepEqual(inlinePieces("<script>x</script>"), [{ text: "<script>x</script>" }], "markup stays text");
    });
    const docText = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    await test("The documents are in doc/, and what they link to exists", () => {
      assert.ok(!fs.existsSync(new URL("../UsersGuide.md", import.meta.url)), "the guide has moved");
      for (const name of ["doc/UsersGuide.md", "doc/Tutorial.md"]) {
        for (const { src, href } of parseMarkdown(docText(name)).flatMap((block) => inlinePieces(block.text ?? (block.items ?? []).join(" ")))) {
          const target = src ?? href;
          if (target && !/^https?:/.test(target) && !target.startsWith("../")) assert.ok(fs.existsSync(new URL(`../doc/${target}`, import.meta.url)), `${name}: ${target}`);
        }
      }
      for (const link of docText("README.md").matchAll(/\]\((doc\/[^)]+)\)/g)) assert.ok(fs.existsSync(new URL(`../${link[1]}`, import.meta.url)), link[1]);
    });
    await test("Both languages of the documents match, block by block", () => {
      const shape = (name) => parseMarkdown(docText(name)).map((block) => (block.type === "heading" ? `h${block.level}` : block.type === "table" ? `table:${block.head.length}x${block.rows.length}` : block.type === "list" ? `list:${block.items.length}` : block.type));
      for (const [ko, en] of [["doc/UsersGuide.md", "doc/UsersGuide.en.md"], ["doc/Tutorial.md", "doc/Tutorial.en.md"]]) {
        assert.deepEqual(shape(en), shape(ko), en);
        assert.deepEqual([...docText(en).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]), [...docText(ko).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]), `${en}: images`);
        assert.doesNotMatch(docText(en), /^(?!.*(한국어|시속)).*[\uAC00-\uD7A3]{2,}/m, `${en} still has Korean`);
      }
    });
    await test("The guide names every sample, and the new features", () => {
      const guide = docText("doc/UsersGuide.md");
      for (const sample of sampleIndex) assert.ok(guide.includes(`\`${sample.id}\``), sample.id);
      for (const word of ["튜토리얼", "탐색기", "원형 화면", "값 연결", "LVGL 설정", "글꼴", "자동 왕복"]) assert.ok(guide.includes(word), word);
    });
    await test("The dev server leaves the LVGL sources and the build output alone", () => {
      const config = docText("vite.config.js");
      assert.match(config, /entries: \["index\.html"\]/);
      for (const folder of ["third_party", "src-tauri", "build", "test-results"]) assert.ok(config.includes(`**/${folder}/**`), folder);
    });

    /* ------------------------------------------------------ the project file */
    category("Project file registration");
    const bundleConfig = JSON.parse(fs.readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    const hooks = fs.readFileSync(new URL("../src-tauri/windows/hooks.nsh", import.meta.url), "utf8");
    await test("The installer registers .mylvgl under the ProgID its hook uses", () => {
      const [association] = bundleConfig.bundle.fileAssociations;
      assert.deepEqual(association.ext, ["mylvgl"]);
      assert.equal(association.mimeType, "application/vnd.mylvgl+json");
      assert.match(association.name, /^[A-Za-z][A-Za-z0-9.]*$/, "a ProgID has no spaces");
      assert.ok(hooks.includes(`!define MLS_PROGID "${association.name}"`));
      assert.ok(hooks.includes(`"Content Type" "${association.mimeType}"`));
      assert.equal(bundleConfig.bundle.windows.nsis.installerHooks, "windows/hooks.nsh");
    });
    await test("A project file has an icon of its own, in every size Windows asks for", () => {
      assert.equal(bundleConfig.bundle.resources["../assets/file-icon.ico"], "file-icon.ico");
      assert.ok(hooks.includes('DefaultIcon" "" "$INSTDIR\\file-icon.ico,0"'));
      const icon = fs.readFileSync(new URL("../assets/file-icon.ico", import.meta.url));
      assert.deepEqual([icon.readUInt16LE(0), icon.readUInt16LE(2)], [0, 1]);
      const sizes = Array.from({ length: icon.readUInt16LE(4) }, (_, index) => icon[6 + index * 16] || 256);
      assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
      assert.notDeepEqual(icon, fs.readFileSync(new URL("../assets/icon.ico", import.meta.url)), "the same as the program's");
    });
    await test("Linux learns the file type from the package", () => {
      const { deb } = bundleConfig.bundle.linux;
      const xml = fs.readFileSync(new URL(`../src-tauri/${deb.files["/usr/share/mime/packages/mylvgl.xml"]}`, import.meta.url), "utf8");
      assert.match(xml, /glob pattern="\*\.mylvgl"/);
      assert.match(xml, /type="application\/vnd\.mylvgl\+json"/);
      assert.ok(deb.files["/usr/share/icons/hicolor/256x256/mimetypes/application-vnd.mylvgl+json.png"]);
      assert.match(fs.readFileSync(new URL(`../src-tauri/${deb.postInstallScript}`, import.meta.url), "utf8"), /update-mime-database/);
    });

    /* -------------------------------------------------------- LVGL settings */
    category("LVGL settings (lv_conf.h)");
    const confModels = Object.fromEntries(Object.entries(CONF_TEMPLATES).map(([version, text]) => [version, parseConfTemplate(text)]));
    await test("The bundled templates are the files in third_party", async () => {
      const { confTemplatesSource } = await import("../scripts/generate-conf-templates.mjs");
      assert.equal(fs.readFileSync(new URL("../src/lvgl/confTemplates.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), confTemplatesSource());
    });
    await test("Each bundled engine version has its template", () => {
      for (const [version] of engines) assert.ok(confModels[version], version);
    });
    await test("Every define of a template becomes an option, or is a known exception", () => {
      for (const [version, text] of Object.entries(CONF_TEMPLATES)) {
        const model = confModels[version];
        const defined = [...text.matchAll(/^\s*#\s*define\s+(LV_\w+)(?!\()\b/gm)].map((match) => match[1]).filter((name) => name !== "LV_CONF_H");
        const missing = [...new Set(defined)].filter((name) => !model.options.has(name) && !new RegExp(`define\\s+${name}\\(`).test(text));
        assert.deepEqual(missing, [], version);
        assert.ok(model.options.size >= 200, `${version}: ${model.options.size}`);
      }
    });
    await test("Versions get different windows: their own options and sections", () => {
      const has = (version, name) => confModels[version].options.has(name);
      assert.ok(has("8.4.0", "LV_USE_BTN") && !has("8.4.0", "LV_USE_BUTTON"));
      assert.ok(has("9.2.2", "LV_USE_BUTTON") && !has("9.2.2", "LV_USE_BTN"));
      assert.ok(has("8.4.0", "LV_COLOR_16_SWAP") && !has("9.6.0", "LV_COLOR_16_SWAP"));
      assert.ok(has("9.6.0", "LV_USE_ARCLABEL") && !has("9.2.2", "LV_USE_ARCLABEL"));
      assert.ok(confModels["9.6.0"].options.size > confModels["9.2.2"].options.size);
      assert.ok(confModels["9.2.2"].options.size > confModels["8.4.0"].options.size);
      assert.notDeepEqual(confModels["8.4.0"].sections.map((item) => item.title), confModels["9.6.0"].sections.map((item) => item.title));
      for (const model of Object.values(confModels)) assert.ok(model.sections.length >= 6, String(model.sections.length));
    });
    await test("Options get a fitting control", () => {
      for (const [version, model] of Object.entries(confModels)) {
        const of = (name) => model.options.get(name);
        assert.equal(of("LV_USE_LOG").kind, "bool", version);
        assert.equal(of("LV_FONT_MONTSERRAT_14").kind, "bool", version);
        if (version === "9.6.0") {
          assert.equal(of("LV_COLOR_DEPTH"), undefined, "9.6 replaced it");
          assert.equal(of("LV_COLOR_FORMAT_DEFAULT").kind, "enum");
          assert.ok(of("LV_COLOR_FORMAT_DEFAULT").choices.includes("LV_COLOR_FORMAT_RGB565"));
        } else {
          assert.equal(of("LV_COLOR_DEPTH").kind, "enum", version);
          assert.ok(of("LV_COLOR_DEPTH").choices.includes("16") && of("LV_COLOR_DEPTH").choices.includes("32"), version);
        }
        assert.equal(of("LV_LOG_LEVEL").kind, "enum", version);
        assert.ok(of("LV_LOG_LEVEL").choices.includes("LV_LOG_LEVEL_WARN"), version);
        assert.equal(of("LV_FONT_DEFAULT").kind, "enum", version);
        assert.ok(of("LV_FONT_DEFAULT").choices.includes(version === "9.6.0" ? "LV_FONT_DEFAULT_MONTSERRAT_24" : "&lv_font_montserrat_24"), version);
        for (const name of ["LV_USE_FLEX", "LV_USE_GRID"]) assert.equal(of(name).kind, "bool", name);
        assert.ok(of("LV_USE_LOG").description.length > 3, version);
      }
      assert.equal(confModels["9.6.0"].options.get("LV_USE_STDLIB_MALLOC").kind, "enum");
      assert.equal(confModels["9.6.0"].options.get("LV_MEM_SIZE").kind, "int");
      assert.equal(confModels["8.4.0"].options.get("LV_MEM_SIZE").kind, "text");
      assert.equal(confModels["8.4.0"].options.get("LV_MEM_ADR").kind, "int");
      assert.equal(confModels["8.4.0"].options.get("LV_COLOR_CHROMA_KEY").kind, "color");
    });
    await test("Conditions are read as the preprocessor reads them", () => {
      const values = { A: "1", B: "0", KIND: "LV_STDLIB_CLIB", N: "16" };
      const look = (name) => values[name];
      for (const [condition, wanted] of [["A", true], ["B", false], ["!B", true], ["!A", false], ["A && B", false], ["A || B", true], ["KIND == LV_STDLIB_CLIB", true], ["KIND == LV_STDLIB_BUILTIN", false], ["KIND != LV_STDLIB_BUILTIN", true], ["N == 16", true], ["N > 8", true], ["N < 8", false], ["(A || B) && !B", true], ["defined(A)", true], ["defined(NOPE)", false], ["NOPE", false], ["!(A) && (B)", false]]) {
        assert.equal(evaluateCondition(condition, look), wanted, condition);
      }
    });
    await test("An option under an #if is off until its parent is on", () => {
      const model = confModels["9.6.0"];
      assert.equal(confActive(model, undefined, "LV_LOG_LEVEL"), false);
      assert.equal(confActive(model, { LV_USE_LOG: "1" }, "LV_LOG_LEVEL"), true);
      assert.equal(confActive(model, undefined, "LV_USE_LOG"), true);
      assert.equal(confActive(model, undefined, "LV_MEM_SIZE"), false, "the shared file uses the C library's malloc");
      assert.equal(confActive(model, { LV_USE_STDLIB_MALLOC: "LV_STDLIB_BUILTIN" }, "LV_MEM_SIZE"), true);
    });
    await test("Values come from the project, the shared file, then the template", () => {
      const model = confModels["9.6.0"];
      const old = confModels["9.2.2"];
      assert.equal(confValue(old, undefined, "LV_COLOR_DEPTH"), "32", "the shared file says 32; the template says 16");
      assert.equal(confValue(old, { LV_COLOR_DEPTH: "16" }, "LV_COLOR_DEPTH"), "16");
      assert.equal(confValue(model, undefined, "LV_COLOR_FORMAT_DEFAULT"), "LV_COLOR_FORMAT_XRGB8888", "9.6 derives it from the shared file's depth");
      assert.equal(confValue(model, { LV_COLOR_DEPTH: "16" }, "LV_COLOR_FORMAT_DEFAULT"), "LV_COLOR_FORMAT_RGB565");
      assert.equal(confValue(model, undefined, "LV_USE_FLEX"), "1");
      assert.equal(confDefault(old, { LV_COLOR_DEPTH: "16" }, "LV_COLOR_DEPTH"), "32");
    });
    await test("Only what differs is stored, and setting it back removes it", () => {
      const model = confModels["9.2.2"];
      const project = newProject("Conf");
      setConfValue(project, model, "LV_COLOR_DEPTH", "32");
      assert.equal(project.lvConf, undefined);
      setConfValue(project, model, "LV_COLOR_DEPTH", "16");
      assert.deepEqual(project.lvConf, { LV_COLOR_DEPTH: "16" });
      setConfValue(project, model, "LV_USE_LOG", "1");
      setConfValue(project, model, "LV_COLOR_DEPTH", undefined);
      assert.deepEqual(project.lvConf, { LV_USE_LOG: "1" });
      setConfValue(project, model, "LV_USE_LOG", "0");
      assert.equal(project.lvConf, undefined);
    });
    await test("The generated lv_conf.h carries the settings", () => {
      const project = newProject("Conf");
      const plain = generateCode(project)["config/lv_conf.h"];
      assert.equal(generateLvConf(project), plain);
      project.lvConf = { LV_COLOR_DEPTH: "16", LV_USE_LOG: "1", LV_LOG_LEVEL: "LV_LOG_LEVEL_WARN", LV_FONT_MONTSERRAT_48: "0" };
      const defines = readDefines(generateCode(project)["config/lv_conf.h"]);
      assert.equal(defines.get("LV_COLOR_DEPTH"), "16");
      assert.equal(defines.get("LV_USE_LOG"), "1");
      assert.equal(defines.get("LV_LOG_LEVEL"), "LV_LOG_LEVEL_WARN");
      assert.equal(defines.get("LV_FONT_MONTSERRAT_48"), "0");
      const text = generateCode(project)["config/lv_conf.h"];
      assert.equal(text.match(/define LV_COLOR_DEPTH/g).length, 1, "defined twice");
      assert.ok(text.indexOf("LV_LOG_LEVEL") < text.lastIndexOf("#endif"), "after the guard");
      assert.deepEqual(overridesFromText(text), project.lvConf);
    });
    await test("A 9.6 colour format takes the place of the shared file's depth", () => {
      const project = newProject("Conf");
      project.lvConf = { LV_COLOR_FORMAT_DEFAULT: "LV_COLOR_FORMAT_RGB565" };
      const defines = readDefines(generateLvConf(project));
      assert.equal(defines.has("LV_COLOR_DEPTH"), false, "9.6 would keep it and disagree with the format");
      assert.equal(defines.get("LV_COLOR_FORMAT_DEFAULT"), "LV_COLOR_FORMAT_RGB565");
    });
    await test("Editing lv_conf.h in the code view changes the settings, and the other way round", () => {
      const project = newProject("Conf");
      const text = everyFile(project)["config/lv_conf.h"].replace("#define LV_COLOR_DEPTH 32", "#define LV_COLOR_DEPTH 16").replace("#endif", "#define LV_USE_LOG 1\n\n#endif");
      const result = applyCodeEdit(project, "config/lv_conf.h", text);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.project.lvConf, { LV_COLOR_DEPTH: "16", LV_USE_LOG: "1" });
      const back = applyCodeEdit(result.project, "config/lv_conf.h", everyFile(project)["config/lv_conf.h"]);
      assert.equal(back.project.lvConf, undefined);
      const same = applyCodeEdit(result.project, "config/lv_conf.h", everyFile(result.project)["config/lv_conf.h"]);
      assert.equal(same.changed, false);
    });
    await test("A project keeps its settings on disk, and a damaged entry is refused", () => {
      const project = newProject("Conf");
      project.lvConf = { LV_USE_LOG: "1" };
      assert.deepEqual(parseProject(serializeProject(project)).lvConf, { LV_USE_LOG: "1" });
      for (const lvConf of [[], { "BAD NAME": "1" }, { LV_X: "1\n#define Y" }, { LV_X: 5 }, { LV_CONF_H: "1" }]) {
        assert.throws(() => parseProject(JSON.stringify({ ...project, lvConf })), /lvConf/, JSON.stringify(lvConf));
      }
    });
    await test("Settings another version does not have are found", () => {
      assert.deepEqual(unknownOverrides(confModels["9.6.0"], { LV_USE_BTN: "0", LV_USE_LOG: "1" }), ["LV_USE_BTN"]);
      assert.deepEqual(unknownOverrides(confModels["8.4.0"], { LV_USE_BTN: "0", LV_USE_LOG: "1" }), []);
    });
    await test("What the design needs but the settings turned off is a problem", () => {
      const project = newProject("Conf");
      const screen = project.screens[0];
      addNode(project, screen.id, createNode(project, "button", { font: 24, text: "x", flexFlow: "ROW" }));
      addNode(project, screen.id, createNode(project, "grid", {}));
      const codes = (lvConf) => {
        project.lvConf = lvConf;
        return findProblems(project).filter((problem) => problem.code.startsWith("conf")).map((problem) => `${problem.severity}:${problem.code}:${problem.params.option ?? problem.params.depth}`).sort();
      };
      assert.deepEqual(codes({}), []);
      assert.deepEqual(codes({ LV_USE_BUTTON: "0" }), ["error:confWidget:LV_USE_BUTTON"]);
      assert.deepEqual(codes({ LV_FONT_MONTSERRAT_24: "0" }), ["error:confFont:LV_FONT_MONTSERRAT_24"]);
      assert.deepEqual(codes({ LV_USE_FLEX: "0" }), ["error:confLayout:LV_USE_FLEX"]);
      assert.deepEqual(codes({ LV_USE_GRID: "0" }), ["error:confLayout:LV_USE_GRID"]);
      assert.deepEqual(codes({ LV_USE_THEME_DEFAULT: "0" }), ["error:confTheme:LV_USE_THEME_DEFAULT"]);
      assert.deepEqual(codes({ LV_COLOR_DEPTH: "8" }), ["warning:confDepth:8"]);
      assert.deepEqual(codes({ LV_COLOR_DEPTH: "16" }), []);
      assert.deepEqual(codes({ LV_FONT_MONTSERRAT_14: "0" }), ["error:confFontDefault:LV_FONT_MONTSERRAT_14"]);
      const say = translator("ko");
      for (const code of ["confTheme", "confDepth", "confSwap", "confFontDefault", "confWidget", "confFont", "confLayout"]) assert.notEqual(say(`problem.${code}`), `problem.${code}`, code);
    });

    /* -------------------------------------------------------- widget tables */
    category("Problems");
    await test("Samples have no problems in their own LVGL version", () => {
      const folder = new URL("../samples/", import.meta.url);
      const index = JSON.parse(fs.readFileSync(new URL("index.json", folder), "utf8"));
      assert.ok(index.length >= 16);
      for (const item of index) {
        const file = new URL(item.file, folder);
        const sample = parseProject(fs.readFileSync(file, "utf8"));
        const errors = findProblems(sample).filter((problem) => problem.severity === "error");
        assert.deepEqual(errors.map((problem) => problem.key), [], item.file);
        assert.deepEqual(findProblems(sample).map((problem) => problem.key), [], item.file);
      }
    });
    const problemProject = () => {
      const p = newProject("P");
      p.lvgl = "9.6.0";
      return p;
    };
    const putNode = (p, type, props = {}, parent = p.screens[0].id, name) => {
      const node = createNode(p, type, props);
      if (name) node.name = name;
      addNode(p, parent, node);
      return node;
    };
    const codes = (list, code) => list.filter((problem) => problem.code === code);
    await test("A clean project has no problems", () => {
      const p = problemProject();
      putNode(p, "button", { x: 10, y: 10, width: 50, height: 30, align: "TOP_LEFT" });
      assert.deepEqual(findProblems(p), []);
    });
    await test("A control missing from the version is an error without code", () => {
      const p = problemProject();
      const meter = putNode(p, "meter");
      const [found] = codes(findProblems(p), "widgetVersion");
      assert.equal(found.severity, "error");
      assert.equal(found.node, meter.id);
      assert.equal(found.hasCode, false);
      p.lvgl = "8.4.0";
      assert.deepEqual(codes(findProblems(p), "widgetVersion"), []);
    });
    await test("Images: none chosen, and one that is gone", () => {
      const p = problemProject();
      putNode(p, "image", { width: 20, height: 20, x: 0, y: 0 });
      const gone = putNode(p, "image", { src: "gone", x: 30, y: 0, width: 20, height: 20 });
      const list = findProblems(p);
      assert.equal(codes(list, "imageEmpty").length, 1);
      assert.equal(codes(list, "imageMissing")[0].node, gone.id);
      assert.equal(codes(list, "imageMissing")[0].severity, "error");
    });
    await test("Events: a lost target, and one this version lacks", () => {
      const p = problemProject();
      const button = putNode(p, "button", { x: 0, y: 0, width: 20, height: 20 });
      button.events.push({ trigger: "CLICKED", action: "hide", target: "nothing", text: "" });
      button.events.push({ trigger: "CLICKED", action: "log", target: "", text: "fine" });
      assert.equal(codes(findProblems(p), "eventTarget").length, 1);
      const meter = putNode(p, "meter");
      button.events[0].target = meter.id;
      assert.equal(codes(findProblems(p), "eventTarget").length, 0);
      assert.equal(codes(findProblems(p), "eventTargetVersion").length, 1);
    });
    await test("Conflicts: names, grid cells and overlapping controls", () => {
      const p = problemProject();
      putNode(p, "led", { x: 0, y: 0, width: 20, height: 20 }, undefined, "Same");
      const twin = putNode(p, "led", { x: 15, y: 15, width: 20, height: 20 }, undefined, "same");
      const list = findProblems(p);
      assert.equal(codes(list, "nameClash")[0].node, twin.id);
      assert.equal(codes(list, "nameClash")[0].params.generated, "ui_same_2");
      assert.equal(codes(list, "overlap")[0].node, twin.id);
      // One inside the other is a design, not a conflict.
      const q = problemProject();
      putNode(q, "container", { x: 0, y: 0, width: 100, height: 100 });
      putNode(q, "label", { x: 10, y: 10, width: 20, height: 20 });
      assert.deepEqual(codes(findProblems(q), "overlap"), []);
      const g = problemProject();
      const grid = putNode(g, "grid", { gridColumns: "1fr,1fr", gridRows: "1fr", x: 0, y: 0, width: 100, height: 100 });
      putNode(g, "led", { gridCol: 0, gridRow: 0 }, grid.id);
      putNode(g, "led", { gridCol: 0, gridRow: 0 }, grid.id);
      putNode(g, "led", { gridCol: 5, gridRow: 0 }, grid.id);
      const cells = findProblems(g);
      assert.equal(codes(cells, "gridOverlap").length, 1);
      assert.equal(codes(cells, "gridCell").length, 1);
    });
    await test("Positions: off the screen, partly off, and flowing children are left alone", () => {
      const p = problemProject();
      putNode(p, "led", { x: 1000, y: 0, width: 20, height: 20 });
      putNode(p, "led", { x: p.device.w - 5, y: 0, width: 20, height: 20 });
      putNode(p, "led", { x: -10, y: -10, width: 20, height: 20, align: "BOTTOM_RIGHT" });
      const list = findProblems(p);
      assert.equal(codes(list, "offScreen").length, 1);
      assert.equal(codes(list, "partlyOff").length, 1);
      const q = problemProject();
      const box = putNode(q, "container", { x: 0, y: 0, width: 100, height: 100, flexFlow: "ROW" });
      putNode(q, "led", { x: 0, y: 0, width: 50, height: 50 }, box.id);
      putNode(q, "led", { x: 10, y: 10, width: 50, height: 50 }, box.id);
      assert.deepEqual(codes(findProblems(q), "overlap"), []);
    });
    await test("Ranges, and errors sort first", () => {
      const p = problemProject();
      putNode(p, "slider", { min: 10, max: 5, x: 0, y: 0, width: 50, height: 10 });
      putNode(p, "slider", { min: 0, max: 5, value: 9, x: 0, y: 20, width: 50, height: 10 });
      putNode(p, "meter");
      const list = findProblems(p);
      assert.equal(codes(list, "range").length, 1);
      assert.equal(codes(list, "valueRange").length, 1);
      assert.equal(list[0].severity, "error");
    });
    await test("The LVGL version's engine and download are reported", () => {
      const p = problemProject();
      assert.deepEqual(findProblems(p, { installed: ["9.6.0"] }), []);
      const [missing] = findProblems(p, { installed: [] });
      assert.equal(missing.code, "notInstalled");
      assert.equal(missing.manager, true);
      p.lvgl = "9.5.0";
      assert.equal(findProblems(p)[0].code, "engineClose");
    });
    await test("Compiler output: own files lead to code, others do not", () => {
      const list = parseBuildProblems([
        "C:\\work\\build\\src\\ui\\screens\\ui_Screen1.c:12:5: error: 'lv_foo' undeclared",
        "D:/x/src/main.c:3:1: warning: unused variable",
        "D:/x/third_party/lvgl/src/core/lv_obj.c:9:2: error: boom",
        "D:/x/third_party/lvgl/src/core/lv_obj.c:9:2: warning: ignored",
        "ld.exe: ui.c.obj: undefined reference to `ui_events`",
        "CMake Error at CMakeLists.txt:3 (project):",
        "[12/40] Building C object",
        "D:/x/src/main.c:3:1: warning: unused variable",
      ]);
      assert.equal(list.length, 5);
      assert.deepEqual([list[0].file, list[0].line, list[0].severity, list[0].hasCode], ["src/ui/screens/ui_Screen1.c", 12, "error", true]);
      assert.deepEqual([list[1].file, list[1].severity], ["src/main.c", "warning"]);
      assert.deepEqual([list[2].file, list[2].where, list[2].hasCode], [null, "lv_obj.c:9", false]);
    });
    await test("A control is found in the generated code", () => {
      const files = { "src/ui/ui.c": "lv_obj_t *ui_a;\n", "src/ui/screens/ui_S.c": "// x\nui_a = lv_label_create(p);\n" };
      assert.deepEqual(locateInCode(files, "ui_a"), { file: "src/ui/screens/ui_S.c", line: 2 });
      assert.deepEqual(locateInCode({ "x.c": "\n\nuse(ui_b);" }, "ui_b"), { file: "x.c", line: 3 });
      assert.equal(locateInCode(files, "ui_none"), null);
      assert.equal(locateInCode(files, "ui_ab"), null);
    });

    category("Widgets and commands");
    await test("The palette shows what each LVGL version has", () => {
      const names = (version) => PALETTE.flatMap(({ items }) => items).filter((type) => availableIn(type, version));
      assert.ok(names("8.4.0").includes("meter") && names("8.4.0").includes("colorwheel"));
      assert.ok(!names("8.4.0").includes("scale") && !names("8.4.0").includes("barcode") && !names("8.4.0").includes("arclabel"));
      assert.ok(names("9.2.2").includes("scale") && names("9.2.2").includes("barcode"));
      assert.ok(!names("9.2.2").includes("meter") && !names("9.2.2").includes("colorwheel") && !names("9.2.2").includes("arclabel"));
      assert.ok(names("9.3.0").includes("scale") && !names("9.3.0").includes("arclabel"));
      assert.ok(names("9.4.0").includes("arclabel") && names("9.6.0").includes("arclabel"));
      assert.equal(names("8.4.0").length, 35);
      assert.equal(names("9.2.2").length, 35);
      assert.equal(names("9.6.0").length, 36);
      for (const version of ["8.4.0", "9.6.0"]) assert.ok(names(version).includes("grid"), "Grid");
    });
    await test("Grid cell properties have labels", () => {
      for (const prop of GRID_CELL_PROPS) assert.notEqual(translator("ko")(`prop.${prop.key}`), `prop.${prop.key}`);
    });
    await test("Every widget can be placed, except the screen itself", () => {
      const placed = PALETTE.flatMap(({ items }) => items).sort();
      assert.deepEqual(placed, Object.keys(WIDGETS).filter((type) => type !== "screen").sort());
    });
    await test("Every widget's icon exists", () => {
      for (const [type, definition] of Object.entries(WIDGETS)) assert.ok(ICON_NAMES.includes(definition.icon), type);
    });
    await test("Every trigger and action has a label", () => {
      for (const language of ["ko", "en"]) {
        const t = translator(language);
        for (const trigger of TRIGGERS) assert.notEqual(t(`trigger.${trigger}`), `trigger.${trigger}`);
        for (const action of Object.keys(ACTION_IDS)) assert.notEqual(t(`action.${action}`), `action.${action}`);
      }
    });
    await test("Every widget is named as LVGL names it, in both languages", () => {
      const names = { container: "Base Object", dropdown: "Drop-Down List", textarea: "Text Area", tabview: "Tabview", spinbox: "Spinbox", buttonmatrix: "Button Matrix", led: "LED" };
      for (const language of ["ko", "en"]) {
        const t = translator(language);
        for (const [type, name] of Object.entries(names)) assert.equal(t(`widget.${type}`), name);
      }
      assert.equal(translator("ko")("panel.palette"), "콘트롤");
    });
    await test("Every device has a label and a sensible size", () => {
      const t = translator("en");
      for (const device of DEVICES) {
        assert.notEqual(t(`device.${device.id}`), `device.${device.id}`);
        assert.ok(device.w >= 100 && device.h >= 100);
      }
    });
    await test("A switch's indicator colour targets its on state in C", () => {
      const project = newProject();
      addNode(project, project.screens[0].id, createNode(project, "switch", { indicatorColor: "#ff0000" }));
      addNode(project, project.screens[0].id, createNode(project, "slider", { indicatorColor: "#00ff00" }));
      const code = Object.values(generateCode(project)).join("\n");
      assert.ok(code.includes("lv_color_hex(0xff0000), LV_PART_INDICATOR | LV_STATE_CHECKED)"));
      assert.ok(code.includes("lv_color_hex(0x00ff00), LV_PART_INDICATOR)"));
    });
    await test("Every property produces a line of C, in both API families", () => {
      for (const version of ["8.4.0", "9.6.0"]) {
        const project = everythingProject(version);
        const code = Object.values(generateCode(project)).join("\n");
        const { ops } = emit(project);
        assert.ok(ops.length > 100);
        for (const name of ["lv_obj_set_style_bg_color", "lv_obj_set_style_text_font", "lv_obj_set_flex_flow", "lv_obj_set_style_pad_gap", "LV_PART_INDICATOR", "lv_pct(", "LV_SIZE_CONTENT", "lv_textarea_set_placeholder_text", "lv_roller_set_options", "lv_dropdown_set_selected", "lv_led_set_brightness", "lv_arc_set_range"]) {
          assert.ok(code.includes(name), `${version}: ${name}`);
        }
      }
    });

    /* -------------------------------------------------------------- engines */
    for (const version of versions) {
      const engine = engines.get(version);
      if (!engine) continue;
      category(`Every feature on engine ${version}`);
      const single = (type, props, parentProps) => {
        const project = newProject();
        project.lvgl = version;
        project.device = { w: 320, h: 240 };
        registerTestImage(project);
        Object.assign(project.screens[0].props, parentProps);
        const node = addNode(project, project.screens[0].id, createNode(project, type, { x: 30, y: 30, ...(type === "image" || type === "imagebutton" ? { src: TEST_IMAGE } : {}), ...(type === "animimage" ? { frames: TEST_IMAGE } : {}), ...props }));
        return { project, node };
      };
      const frameOf = (project) => {
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        // The theme applies state changes through short transitions; let them finish.
        for (let i = 0; i < 30; i++) engine.tick(20);
        return Buffer.from(engine.frame());
      };
      const differs = (type, base, change) => {
        const before = frameOf(single(type, base).project);
        const after = frameOf(single(type, { ...base, ...change }).project);
        return !before.equals(after);
      };

      await test("The whole everything-project loads without an error", () => {
        const project = everythingProject(version);
        for (const screen of project.screens) {
          engine.load(project, screen.id, { events: true });
          assert.deepEqual(engine.errors, []);
        }
      });
      for (const [type, definition] of Object.entries(WIDGETS)) {
        if (type === "screen" || !availableIn(type, version)) continue;
        await test(`${type}: every property is accepted, and it draws`, () => {
          for (const prop of definition.props) {
            if (prop.kind === "target") continue;
            const { project } = single(type, { [prop.key]: valueFor(prop) });
            if (prop.key === "min" || prop.key === "max") Object.assign(project.screens[0].children[0].props, { min: 0, max: 10 });
            engine.load(project, project.screens[0].id, { events: true });
            assert.deepEqual(engine.errors, [], prop.key);
          }
          const blank = newProject();
          blank.lvgl = version;
          blank.device = { w: 320, h: 240 };
          const empty = frameOf(blank);
          const { project } = single(type, { width: 100, height: 60, text: "Sample", options: "One\nTwo" });
          assert.ok(!frameOf(project).equals(empty), "draws nothing");
        });
        await test(`${type}: position, size and hidden take effect`, () => {
          const { project, node } = single(type, { x: 40, y: 50, width: 90, height: 60 });
          engine.load(project, project.screens[0].id);
          const box = engine.coords(node.id);
          assert.deepEqual([box.x, box.y], [40, 50]);
          if (!["label", "checkbox", "roller", "dropdown", "spinbox", "line", "canvas", "qrcode", "msgbox", "imagebutton", "animimage", "span", "meter"].includes(type)) assert.deepEqual([box.w, box.h], [90, 60]);
          const base = { width: 90, height: 60, text: "Sample", options: "One\nTwo" };
          assert.ok(differs(type, base, { hidden: true }), "hidden changes nothing");
        });
      }
      const visible = [
        ["button", { width: 100, height: 50, text: "A" }, "bgColor", { bgColor: "#ff0000" }],
        ["button", { width: 100, height: 50, text: "A" }, "bgOpa", { bgOpa: 80 }],
        ["button", { width: 100, height: 50, text: "A" }, "borderWidth + borderColor", { borderWidth: 4, borderColor: "#00ff00" }],
        ["button", { width: 100, height: 50, text: "A" }, "radius", { radius: 0 }],
        ["button", { width: 100, height: 50, text: "A" }, "shadowWidth + shadowColor", { shadowWidth: 20, shadowColor: "#0000ff" }],
        ["button", { width: 100, height: 50, text: "A" }, "opa", { opa: 90 }],
        ["button", { width: 100, height: 50, text: "A" }, "textColor", { textColor: "#ff00ff" }],
        ["button", { width: 100, height: 50, text: "A" }, "font", { font: 28 }],
        ["button", { width: 100, height: 50, text: "A" }, "text", { text: "B" }],
        ["button", { width: 100, height: 50, text: "A" }, "disabled", { disabled: true }],
        ["label", { text: "Hello" }, "text", { text: "World" }],
        ["checkbox", { text: "Check" }, "text", { text: "Other" }],
        ["checkbox", { text: "Check" }, "checked", { checked: true }],
        ["switch", { width: 50, height: 26 }, "checked", { checked: true }],
        ["switch", { width: 50, height: 26, checked: true }, "indicatorColor", { indicatorColor: "#ff0000" }],
        ["slider", { width: 180, min: 0, max: 100, value: 10 }, "value", { value: 90 }],
        ["slider", { width: 180, min: 0, max: 100, value: 50 }, "range", { max: 1000 }],
        ["slider", { width: 180, min: 0, max: 100, value: 50 }, "indicatorColor", { indicatorColor: "#ff0000" }],
        ["bar", { width: 180, height: 18, min: 0, max: 100, value: 10 }, "value", { value: 90 }],
        ["arc", { width: 110, height: 110, min: 0, max: 100, value: 10 }, "value", { value: 90 }],
        ["dropdown", { width: 120, options: "One\nTwo" }, "selected", { selected: 1 }],
        ["dropdown", { width: 120, options: "One\nTwo" }, "options", { options: "Three\nFour" }],
        ["roller", { options: "One\nTwo\nThree" }, "selected", { selected: 2 }],
        ["roller", { options: "One\nTwo\nThree" }, "options", { options: "Red\nGreen\nBlue" }],
        ["textarea", { width: 180, height: 60 }, "text", { text: "Typed" }],
        ["textarea", { width: 180, height: 60 }, "placeholder", { placeholder: "Hint" }],
        ["led", { width: 26, height: 26, ledBright: 255 }, "ledBright", { ledBright: 80 }],
        ["container", { width: 180, height: 110 }, "bgColor", { bgColor: "#ffff00" }],
        ["container", { width: 180, height: 110 }, "pad", { pad: 0, borderWidth: 3 }],
        ["image", {}, "the picture itself", { src: undefined }],
        ["image", {}, "rotation", { rotation: 30 }],
        ["image", {}, "scale", { scale: 200 }],
        ["image", {}, "opa", { opa: 90 }],
        ["line", { points: "0,0 80,40" }, "points", { points: "0,40 80,0" }],
        ["line", { points: "0,0 80,40" }, "lineColor", { lineColor: "#ff0000" }],
        ["line", { points: "0,0 80,40" }, "lineWidth", { lineWidth: 9 }],
        ["list", { width: 160, height: 150 }, "items", { items: "#Title\nOnly one" }],
        ["table", { width: 240, height: 120 }, "cells", { cells: "Other,Text\nC,3" }],
        ["table", { width: 240, height: 120, columnWidth: 60 }, "columnWidth", { columnWidth: 110 }],
        ["chart", { width: 200, height: 120 }, "series", { series: "90,10,90,10" }],
        ["chart", { width: 200, height: 120 }, "chartType", { chartType: "BAR" }],
        ["chart", { width: 200, height: 120, min: 0, max: 100 }, "range", { max: 500 }],
        ["tabview", { width: 240, height: 150 }, "tabs", { tabs: "First\nSecond" }],
        ["calendar", { width: 220, height: 200 }, "month", { month: 6 }],
        ["calendar", { width: 220, height: 200 }, "today", { day: 20 }],
        ["spinbox", { width: 110 }, "value", { value: 777 }],
        ["spinbox", { width: 110 }, "digits", { digits: 3, separator: 1 }],
        ["buttonmatrix", { width: 200, height: 110 }, "map", { map: "A,B\nC" }],
        ["keyboard", { width: 300, height: 110 }, "size", { height: 90 }],
        ["imagebutton", { src: TEST_IMAGE }, "the picture itself", { src: undefined }],
        ["animimage", { frames: TEST_IMAGE }, "the frames", { frames: "" }],
        ["canvas", {}, "canvasColor", { canvasColor: "#ff0000" }],
        ["canvas", {}, "size", { canvasW: 60 }],
        ["msgbox", {}, "title", { title: "Other" }],
        ["msgbox", {}, "text", { text: "Other" }],
        ["msgbox", {}, "buttons", { buttons: "Yes,No,Maybe" }],
        ["win", {}, "title", { title: "Other" }],
        ["win", {}, "text", { text: "Other" }],
        ["tileview", {}, "tiles", { tiles: "Other" }],
        ["menu", {}, "items", { menuItems: "Other" }],
        ["span", {}, "spans", { spans: "Other text" }],
        ["colorwheel", {}, "size", { width: 90, height: 90 }],
        ["meter", {}, "value", { value: 90 }],
        ["meter", {}, "range", { max: 500 }],
        ["scale", {}, "range", { max: 500 }],
        ["scale", {}, "ticks", { totalTicks: 7, majorEvery: 3 }],
        ["scale", { width: 150, height: 150 }, "scaleMode", { scaleMode: "ROUND_INNER" }],
        ["qrcode", {}, "text", { text: "other" }],
        ["qrcode", {}, "qrSize", { qrSize: 60 }],
        ["barcode", {}, "text", { text: "OTHER" }],
        ["arclabel", {}, "text", { text: "Other" }],
        ["grid", {}, "size", { width: 120 }],
      ];
      for (const [type, base, name, change] of visible) {
        if (!availableIn(type, version)) continue;
        await test(`${type}: ${name} changes the picture`, () => {
          assert.ok(differs(type, base, change));
        });
      }
      await test("Grid: children take their cells, with spans and fixed tracks", () => {
        const project = newProject();
        project.lvgl = version;
        project.device = { w: 480, h: 320 };
        const grid = addNode(project, project.screens[0].id, createNode(project, "grid", { x: 0, y: 0, width: 400, height: 300, pad: 0, gap: 0, borderWidth: 0, gridColumns: "100,1fr", gridRows: "50,1fr" }));
        const first = addNode(project, grid.id, createNode(project, "button", { text: "a" }));
        const second = addNode(project, grid.id, createNode(project, "button", { text: "b" }));
        const wide = addNode(project, grid.id, createNode(project, "button", { text: "c", gridCol: 0, gridRow: 1, gridColSpan: 2 }));
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        const [a, b, c] = [engine.coords(first.id), engine.coords(second.id), engine.coords(wide.id)];
        assert.deepEqual([a.x, a.y, a.w, a.h], [0, 0, 100, 50]);
        assert.deepEqual([b.x, b.y, b.w, b.h], [100, 0, 300, 50]);
        assert.deepEqual([c.x, c.y, c.w, c.h], [0, 50, 400, 250]);
      });
      await test("Grid: content and fr tracks are understood", () => {
        const project = newProject();
        project.lvgl = version;
        project.device = { w: 480, h: 320 };
        const grid = addNode(project, project.screens[0].id, createNode(project, "grid", { width: 400, height: 300, pad: 0, gap: 0, borderWidth: 0, gridColumns: "content,1fr,3fr", gridRows: "1fr" }));
        const nodes = ["Hello", "x", "y"].map((text) => addNode(project, grid.id, createNode(project, "label", { text })));
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
        const [hello, x, y] = nodes.map((node) => engine.coords(node.id));
        assert.ok(hello.w > 10 && hello.w < 80, String(hello.w));
        assert.ok(Math.abs(y.w - x.w * 3) <= 3, `${x.w} and ${y.w}`);
      });
      await test("A widget of another LVGL version is left out, not an error", () => {
        const project = newProject();
        project.lvgl = version;
        const other = parseVersion(version).major === 8 ? "scale" : "meter";
        const node = addNode(project, project.screens[0].id, createNode(project, other, {}));
        engine.load(project, project.screens[0].id, { events: true });
        assert.deepEqual(engine.errors, []);
        assert.equal(engine.coords(node.id), null);
        assert.ok(!Object.values(generateCode(project)).join("").includes(parseVersion(version).major === 8 ? "lv_scale_create" : "lv_meter_create"));
      });
      await test("A keyboard types into its text area when running", () => {
        const project = newProject();
        project.lvgl = version;
        project.device = { w: 480, h: 320 };
        const area = addNode(project, project.screens[0].id, createNode(project, "textarea", { x: 10, y: 10, width: 200, height: 50 }));
        const keyboard = addNode(project, project.screens[0].id, createNode(project, "keyboard", { x: 0, y: 0, width: 480, height: 200, align: "BOTTOM_MID", target: area.id }));
        engine.load(project, project.screens[0].id, { events: true });
        assert.deepEqual(engine.errors, []);
        for (let i = 0; i < 10; i++) engine.tick(20);
        const before = Buffer.from(engine.frame());
        const box = engine.coords(keyboard.id);
        press({ x: box.x + 30, y: box.y + 25, w: 10, h: 10 });
        for (let i = 0; i < 10; i++) engine.tick(20);
        assert.ok(!before.equals(Buffer.from(engine.frame())));
      });
      await test("The image's see-through corner shows the screen behind it", () => {
        const { project, node } = single("image", { x: 0, y: 0, width: "content", height: "content" });
        project.screens[0].props = { bgColor: "#00ff00", bgOpa: 255 };
        engine.load(project, project.screens[0].id);
        const box = engine.coords(node.id);
        assert.deepEqual([box.w, box.h], [40, 30]);
        const frame = engine.frame();
        const pixel = (x, y) => {
          const at = (y * engine.width + x) * 4;
          return [frame[at + 2], frame[at + 1], frame[at]];
        };
        assert.deepEqual(pixel(0, 0), [0, 255, 0]);
        assert.deepEqual(pixel(0, 20), [255, 160, 0]);
      });
      await test("An image widget naming a missing image is simply empty", () => {
        const { project } = single("image", { src: "nothing" });
        engine.load(project, project.screens[0].id);
        assert.deepEqual(engine.errors, []);
      });
      await test("Width and height accept pixels, percent and content", () => {
        const { project, node } = single("button", { width: "50%", height: "content", text: "Text" });
        engine.load(project, project.screens[0].id);
        const box = engine.coords(node.id);
        assert.ok(Math.abs(box.w - 160) <= 16, `percent gave ${box.w}`);
        assert.ok(box.h > 10 && box.h < 60, `content gave ${box.h}`);
      });
      await test("Every align puts the widget in a different place", () => {
        const places = new Set();
        for (const align of ALIGNS.slice(1)) {
          const { project, node } = single("button", { align, x: 0, y: 0, width: 40, height: 30 });
          engine.load(project, project.screens[0].id);
          const box = engine.coords(node.id);
          places.add(`${box.x},${box.y}`);
        }
        assert.equal(places.size, ALIGNS.length - 1);
      });
      await test("Every font size changes the text's size", () => {
        const heights = FONT_SIZES.map((font) => {
          const { project, node } = single("label", { font, text: "Hg" });
          engine.load(project, project.screens[0].id);
          return engine.coords(node.id).h;
        });
        for (let i = 1; i < heights.length; i++) assert.ok(heights[i] > heights[i - 1], heights.join());
      });
      await test("Every flex flow arranges children its own way", () => {
        const arrange = (flexFlow) => {
          const project = newProject();
          project.lvgl = version;
          project.device = { w: 320, h: 240 };
          Object.assign(project.screens[0].props, { flexFlow, gap: 4 });
          const nodes = [];
          for (let i = 0; i < 6; i++) nodes.push(addNode(project, project.screens[0].id, createNode(project, "button", { width: 100, height: 80, text: "x" })));
          engine.load(project, project.screens[0].id);
          assert.deepEqual(engine.errors, []);
          return nodes.map((node) => {
            const box = engine.coords(node.id);
            return `${box.x},${box.y}`;
          }).join(" ");
        };
        const layouts = FLEX_FLOWS.map(arrange);
        assert.equal(new Set(layouts).size, FLEX_FLOWS.length, layouts.join(" | "));
      });
      await test("A child of a container sits inside its content area", () => {
        const project = newProject();
        project.lvgl = version;
        const box = addNode(project, project.screens[0].id, createNode(project, "container", { x: 20, y: 20, width: 200, height: 150, pad: 10, borderWidth: 0 }));
        const child = addNode(project, box.id, createNode(project, "label", { x: 5, y: 7, text: "x" }));
        engine.load(project, project.screens[0].id);
        const origin = engine.contentOrigin(box.id);
        assert.deepEqual(origin, { x: 30, y: 30 });
        const at = engine.coords(child.id);
        assert.deepEqual([at.x, at.y], [35, 37]);
      });
      await test("The LVGL theme's dark mode and primary colour apply", () => {
        const base = () => {
          const { project } = single("button", { width: 100, height: 50, text: "A" });
          return project;
        };
        const light = frameOf(base());
        const dark = base();
        dark.theme.dark = true;
        assert.ok(!frameOf(dark).equals(light), "dark");
        const coloured = base();
        coloured.theme.primary = "#ff0000";
        assert.ok(!frameOf(coloured).equals(light), "primary");
      });
      await test("Every device size gives a frame of that size", () => {
        for (const device of DEVICES) {
          const project = newProject();
          project.lvgl = version;
          project.device = { w: device.w, h: device.h };
          engine.load(project, project.screens[0].id);
          assert.equal(engine.frame().length, device.w * device.h * 4);
        }
      });

      function press(box, { hold = true } = {}) {
        const x = box.x + box.w / 2;
        const y = box.y + box.h / 2;
        engine.pointer(x, y, false);
        for (let i = 0; i < 3; i++) engine.tick(20);
        engine.pointer(x, y, true);
        for (let i = 0; i < 5; i++) engine.tick(20);
        if (hold) engine.pointer(x, y, false);
        for (let i = 0; i < 6; i++) engine.tick(20);
      }
      for (const trigger of TRIGGERS) {
        await test(`Trigger ${trigger} fires`, () => {
          const type = trigger === "VALUE_CHANGED" ? "switch" : "button";
          const { project, node } = single(type, { width: 80, height: 40, text: "x" });
          node.events.push({ trigger, action: "log", target: "", text: `fired ${trigger}` });
          engine.load(project, project.screens[0].id, { events: true });
          press(engine.coords(node.id));
          assert.deepEqual(engine.drainLog(), [`fired ${trigger}`]);
        });
      }
      const actionProject = (action, targetProps = {}) => {
        const { project, node } = single("button", { x: 10, y: 10, width: 80, height: 40, text: "go" });
        const target = addNode(project, project.screens[0].id, createNode(project, "label", { x: 150, y: 100, text: "Target", ...targetProps }));
        node.events.push({ trigger: "CLICKED", action, target: target.id, text: "Changed" });
        return { project, node, target };
      };
      await test("Action toggle hides and shows again", () => {
        const { project, node } = actionProject("toggle");
        engine.load(project, project.screens[0].id, { events: true });
        const start = Buffer.from(engine.frame());
        const box = engine.coords(node.id);
        press(box);
        for (let i = 0; i < 20; i++) engine.tick(20);
        const hidden = Buffer.from(engine.frame());
        assert.ok(!start.equals(hidden));
        press(box);
        for (let i = 0; i < 20; i++) engine.tick(20);
        assert.ok(Buffer.from(engine.frame()).equals(start));
      });
      await test("Action hide hides the target", () => {
        const { project, node } = actionProject("hide");
        engine.load(project, project.screens[0].id, { events: true });
        const before = Buffer.from(engine.frame());
        press(engine.coords(node.id));
        for (let i = 0; i < 20; i++) engine.tick(20);
        assert.ok(!before.equals(Buffer.from(engine.frame())));
      });
      await test("Action show shows a hidden target", () => {
        const { project, node } = actionProject("show", { hidden: true });
        engine.load(project, project.screens[0].id, { events: true });
        const before = Buffer.from(engine.frame());
        press(engine.coords(node.id));
        for (let i = 0; i < 20; i++) engine.tick(20);
        assert.ok(!before.equals(Buffer.from(engine.frame())));
      });
      for (const type of ["label", "button", "checkbox", "textarea"]) {
        await test(`Action setText changes a ${type}`, () => {
          const { project, node } = single("button", { x: 10, y: 10, width: 80, height: 40, text: "go" });
          const target = addNode(project, project.screens[0].id, createNode(project, type, { x: 120, y: 100, text: "Before", width: 150, height: 50 }));
          node.events.push({ trigger: "CLICKED", action: "setText", target: target.id, text: "After" });
          engine.load(project, project.screens[0].id, { events: true });
          const box = engine.coords(node.id);
          engine.pointer(box.x + 20, box.y + 20, false);
          for (let i = 0; i < 40; i++) engine.tick(20);
          const before = Buffer.from(engine.frame());
          press(box);
          for (let i = 0; i < 40; i++) engine.tick(20);
          assert.ok(!before.equals(Buffer.from(engine.frame())));
        });
      }
      await test("Action screen loads the target screen", () => {
        const { project, node } = single("button", { x: 10, y: 10, width: 80, height: 40, text: "go" });
        const other = addScreen(project);
        other.props.bgColor = "#102030";
        node.events.push({ trigger: "CLICKED", action: "screen", target: other.id });
        engine.load(project, project.screens[0].id, { events: true });
        press(engine.coords(node.id));
        for (let i = 0; i < 10; i++) engine.tick(20);
        const frame = engine.frame();
        assert.deepEqual([frame[2], frame[1], frame[0]], [0x10, 0x20, 0x30]);
      });
      await test("Action log keeps text in UTF-8", () => {
        const { project, node } = single("button", { width: 80, height: 40, text: "go" });
        node.events.push({ trigger: "CLICKED", action: "log", target: "", text: "한글 로그" });
        engine.load(project, project.screens[0].id, { events: true });
        press(engine.coords(node.id));
        assert.deepEqual(engine.drainLog(), ["한글 로그"]);
      });
      await test("Several actions on one event all run", () => {
        const { project, node } = single("button", { width: 80, height: 40, text: "go" });
        node.events.push({ trigger: "CLICKED", action: "log", target: "", text: "a" }, { trigger: "CLICKED", action: "log", target: "", text: "b" });
        engine.load(project, project.screens[0].id, { events: true });
        press(engine.coords(node.id));
        assert.deepEqual(engine.drainLog().sort(), ["a", "b"]);
      });
      await test("Input outside a widget does not fire its event", () => {
        const { project, node } = single("button", { x: 10, y: 10, width: 60, height: 30, text: "go" });
        node.events.push({ trigger: "CLICKED", action: "log", target: "", text: "fired" });
        engine.load(project, project.screens[0].id, { events: true });
        press({ x: 200, y: 200, w: 10, h: 10 });
        assert.deepEqual(engine.drainLog(), []);
      });
      await test("A slider follows the pointer when running", () => {
        const { project, node } = single("slider", { x: 20, y: 60, width: 200, height: 12, min: 0, max: 100, value: 0 });
        node.events.push({ trigger: "VALUE_CHANGED", action: "log", target: "", text: "moved" });
        engine.load(project, project.screens[0].id, { events: true });
        const box = engine.coords(node.id);
        const before = Buffer.from(engine.frame());
        engine.pointer(box.x + 5, box.y + 6, false);
        for (let i = 0; i < 3; i++) engine.tick(20);
        engine.pointer(box.x + 5, box.y + 6, true);
        for (let i = 0; i < 5; i++) engine.tick(20);
        engine.pointer(box.x + 150, box.y + 6, true);
        for (let i = 0; i < 5; i++) engine.tick(20);
        engine.pointer(box.x + 150, box.y + 6, false);
        for (let i = 0; i < 10; i++) engine.tick(20);
        assert.ok(engine.drainLog().includes("moved"));
        assert.ok(!before.equals(Buffer.from(engine.frame())));
      });
      await test("The spinner animates with time", () => {
        const { project } = single("spinner", { width: 60, height: 60 });
        engine.load(project, project.screens[0].id);
        const before = Buffer.from(engine.frame());
        for (let i = 0; i < 20; i++) engine.tick(20);
        assert.ok(!before.equals(Buffer.from(engine.frame())));
      });
      await test("A press queued between two ticks is not lost", () => {
        const { project, node } = single("button", { width: 80, height: 40, text: "go" });
        node.events.push({ trigger: "CLICKED", action: "log", target: "", text: "quick" });
        engine.load(project, project.screens[0].id, { events: true });
        const box = engine.coords(node.id);
        engine.pointer(box.x + 10, box.y + 10, false);
        engine.pointer(box.x + 10, box.y + 10, true);
        engine.pointer(box.x + 10, box.y + 10, false);
        for (let i = 0; i < 10; i++) engine.tick(20);
        assert.deepEqual(engine.drainLog(), ["quick"]);
      });
    }
  })();
}
