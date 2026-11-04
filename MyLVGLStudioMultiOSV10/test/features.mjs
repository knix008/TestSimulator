import { findProblems, locateInCode, parseBuildProblems } from "../src/lvgl/problems.js";
// Feature coverage for npm test: settings, themes, start backgrounds, and every widget,
// property, trigger and action on every engine.
import assert from "node:assert/strict";
import fs from "node:fs";
import { addNode, addScreen, createNode, findNode, imageNameFor, newProject, parseProject, removeImageFromProject, removeNode, safeRelativePath, serializeProject } from "../src/lvgl/project.js";
import { ACTION_IDS, ALIGNS, DEVICES, FLEX_FLOWS, FONT_SIZES, GRID_CELL_PROPS, PALETTE, TRIGGERS, WIDGETS, availableIn } from "../src/lvgl/schema.js";
import { emit } from "../src/lvgl/emit.js";
import { GENERATED_DIRS, generateCode, projectFiles } from "../src/lvgl/codegen.js";
import { addImage, clearImages, extensionOf, imageData, imageFiles, removeImage } from "../src/lvgl/images.js";
import { THEMES, THEME_COLOR_KEYS, buildTheme, contrast, customTheme, isThemeId, readable, setCustomThemes, themeById } from "../src/themes.js";
import { BACKGROUND_KINDS, drawBackground, isBackgroundKind } from "../src/start/backgrounds.js";
import { translator } from "../src/i18n.js";
import { parseVersion } from "../src/lvgl/versions.js";
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
      assert.deepEqual(sanitizeGeneral(undefined), { reopenLast: false, newVersion: "9.6.0", newDevice: "cyd", snap: 1 });
      assert.deepEqual(sanitizeGeneral({ reopenLast: "yes", newVersion: "7.0.0", newDevice: "nope", snap: 900 }), { reopenLast: false, newVersion: "9.6.0", newDevice: "cyd", snap: 50 });
      assert.deepEqual(sanitizeGeneral({ reopenLast: true, newVersion: "8.4.0", newDevice: "wvga", snap: 8 }), { reopenLast: true, newVersion: "8.4.0", newDevice: "wvga", snap: 8 });
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
