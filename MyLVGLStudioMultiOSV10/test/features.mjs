// Feature coverage for npm test: settings, themes, start backgrounds, and every widget,
// property, trigger and action on every engine.
import assert from "node:assert/strict";
import { addNode, addScreen, createNode, findNode, imageNameFor, newProject, parseProject, removeImageFromProject, removeNode, safeRelativePath, serializeProject } from "../src/lvgl/project.js";
import { ACTION_IDS, ALIGNS, DEVICES, FLEX_FLOWS, FONT_SIZES, PALETTE, TRIGGERS, WIDGETS } from "../src/lvgl/schema.js";
import { emit } from "../src/lvgl/emit.js";
import { GENERATED_DIRS, generateCode, projectFiles } from "../src/lvgl/codegen.js";
import { addImage, clearImages, extensionOf, imageData, imageFiles, removeImage } from "../src/lvgl/images.js";
import { THEMES, THEME_COLOR_KEYS, buildTheme, contrast, customTheme, isThemeId, readable, setCustomThemes, themeById } from "../src/themes.js";
import { BACKGROUND_KINDS, drawBackground, isBackgroundKind } from "../src/start/backgrounds.js";
import { translator } from "../src/i18n.js";
import { ICON_NAMES } from "../src/icons-names.js";
import { COLS, autoArrange, cardsOf, compact, layoutValue, overlaps, place, rowsFor } from "../src/start/layout.js";
import {
  DEFAULT_START_SCREEN, MAX_CUSTOM_THEMES, MAX_RECENT, OPACITY_MAX, OPACITY_MIN, SPEED_MAX, START_CARDS,
  addRecent, customThemeFrom, effectiveSpeed, newCustomThemeId, removeRecent,
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
    if (type === "screen") continue;
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

    /* -------------------------------------------------------- widget tables */
    category("Widgets and commands");
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
        const node = addNode(project, project.screens[0].id, createNode(project, type, { x: 30, y: 30, ...(type === "image" ? { src: TEST_IMAGE } : {}), ...props }));
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
        if (type === "screen") continue;
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
          if (!["label", "checkbox", "roller", "dropdown", "spinbox", "line"].includes(type)) assert.deepEqual([box.w, box.h], [90, 60]);
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
      ];
      for (const [type, base, name, change] of visible) {
        await test(`${type}: ${name} changes the picture`, () => {
          assert.ok(differs(type, base, change));
        });
      }
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
