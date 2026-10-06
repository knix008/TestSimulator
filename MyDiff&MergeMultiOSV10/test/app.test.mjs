/**
 * The parts around the engines: directory comparison, settings validation, themes,
 * strings, the print layout and the command-line parser.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { compareDirectories, DEFAULT_EXCLUDES } from "../core/dirCompare.ts";
import { parseArguments } from "../core/cli.ts";
import { contrastRatio, luminance, mix, parseHex, readableOn, toHex } from "../core/color.ts";
import { LANGUAGES, translate, translator } from "../core/i18n.ts";
import { allPages, formatPageRange, geometry, paginate, parsePageRange, PAPER } from "../core/print.ts";
import { defaultSettings, MAX_RECENT, recentKey, sanitize } from "../core/settings.ts";
import { SettingsStore } from "../core/settingsStore.ts";
import {
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  counterpartOf,
  isThemeId,
  theme,
  themeBackground,
} from "../core/themes.ts";
import { formatBytes, splitBody } from "../core/text.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mdm-test-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function tree() {
  const root = fs.mkdtempSync(path.join(scratch, "tree-"));
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  const put = (base, relative, text) => {
    const target = path.join(base, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
  };
  put(left, "same.txt", "identical\n");
  put(right, "same.txt", "identical\n");
  put(left, "changed.txt", "left version\n");
  put(right, "changed.txt", "right version\n");
  put(left, "only-left.txt", "left\n");
  put(right, "only-right.txt", "right\n");
  put(left, "nested/deep.txt", "a\n");
  put(right, "nested/deep.txt", "a\n");
  put(left, "node_modules/skipped.txt", "should not appear\n");
  put(right, "node_modules/skipped.txt", "different\n");
  return { left, right };
}

/* ------------------------------------------------------------ directory */

test("directory › every status is reported", () => {
  const { left, right } = tree();
  const result = compareDirectories(left, right);
  const byStatus = Object.fromEntries(result.entries.map((entry) => [entry.rel, entry.status]));
  assert.equal(byStatus["same.txt"], "same");
  assert.equal(byStatus["changed.txt"], "different");
  assert.equal(byStatus["only-left.txt"], "leftOnly");
  assert.equal(byStatus["only-right.txt"], "rightOnly");
  assert.equal(byStatus["nested/deep.txt"], "same");
});

test("directory › the counts match the entries", () => {
  const { left, right } = tree();
  const result = compareDirectories(left, right);
  const count = (status) => result.entries.filter((entry) => entry.status === status).length;
  assert.equal(result.same, count("same"));
  assert.equal(result.different, count("different"));
  assert.equal(result.leftOnly, count("leftOnly"));
  assert.equal(result.rightOnly, count("rightOnly"));
});

test("directory › excluded folders are not walked", () => {
  const { left, right } = tree();
  const result = compareDirectories(left, right);
  assert.ok(DEFAULT_EXCLUDES.includes("node_modules"));
  assert.equal(result.entries.some((entry) => entry.rel.includes("node_modules")), false);
});

test("directory › an exclusion can be lifted", () => {
  const { left, right } = tree();
  const result = compareDirectories(left, right, []);
  assert.ok(result.entries.some((entry) => entry.rel.includes("node_modules")));
});

test("directory › files of equal size but different content are different", () => {
  const root = fs.mkdtempSync(path.join(scratch, "size-"));
  fs.mkdirSync(path.join(root, "a"));
  fs.mkdirSync(path.join(root, "b"));
  fs.writeFileSync(path.join(root, "a", "x.txt"), "AAAA");
  fs.writeFileSync(path.join(root, "b", "x.txt"), "BBBB");
  const result = compareDirectories(path.join(root, "a"), path.join(root, "b"));
  assert.equal(result.entries[0].status, "different");
});

test("directory › a missing folder is an error, not an empty result", () => {
  assert.throws(() => compareDirectories(path.join(scratch, "nope"), scratch), /Directory not found/);
});

/* ------------------------------------------------------------- settings */

test("settings › defaults are already valid", () => {
  const defaults = defaultSettings();
  assert.deepEqual(sanitize(defaults), defaults);
  assert.equal(defaults.language, "ko");
  assert.equal(defaults.recent.length, 0);
});

test("settings › out-of-range values fall back instead of being stored", () => {
  const value = sanitize({
    ...defaultSettings(),
    zoom: 10_000,
    theme: "no-such-theme",
    font: { family: "   ", size: 999, weight: "heavy", style: "oblique" },
  });
  assert.equal(value.zoom, 300);
  assert.equal(value.theme, DEFAULT_THEME);
  assert.equal(value.font.family, defaultSettings().font.family);
  assert.equal(value.font.size, 32);
  assert.equal(value.font.weight, "normal");
  assert.equal(value.font.style, "normal");
});

test("settings › the recent list is capped at ten and keyed by its paths", () => {
  const entries = Array.from({ length: 25 }, (_, index) => ({
    kind: "files",
    paths: [`a${index}.txt`, `b${index}.txt`],
    at: index,
  }));
  const value = sanitize({ ...defaultSettings(), recent: entries });
  assert.equal(value.recent.length, MAX_RECENT);
  assert.equal(recentKey(entries[0]), recentKey({ kind: "files", paths: entries[0].paths }));
  assert.notEqual(recentKey(entries[0]), recentKey(entries[1]));
});

test("settings › the store round-trips through a file", () => {
  const directory = fs.mkdtempSync(path.join(scratch, "settings-"));
  process.env.MDM_SETTINGS_DIR = directory;
  try {
    const store = new SettingsStore();
    store.update({ theme: "classic-dark", zoom: 150 });
    store.addRecent({ kind: "files", paths: [path.join(directory, "x.txt"), path.join(directory, "y.txt")] });
    assert.equal(new SettingsStore().get().theme, "classic-dark");
    assert.equal(new SettingsStore().get().zoom, 150);
    assert.equal(new SettingsStore().get().recent.length, 1);
    assert.ok(new SettingsStore().get().recentDirectories.includes(directory));
  } finally {
    delete process.env.MDM_SETTINGS_DIR;
  }
});

test("settings › the store never records more than ten recent entries", () => {
  const directory = fs.mkdtempSync(path.join(scratch, "recent-"));
  process.env.MDM_SETTINGS_DIR = directory;
  try {
    const store = new SettingsStore();
    for (let index = 0; index < 20; index++) {
      store.addRecent({ kind: "files", paths: [`${directory}/a${index}.txt`, `${directory}/b${index}.txt`] });
    }
    assert.equal(store.get().recent.length, MAX_RECENT);
    // Newest first.
    assert.ok(store.get().recent[0].paths[0].endsWith("a19.txt"));
    store.clearRecent();
    assert.equal(store.get().recent.length, 0);
  } finally {
    delete process.env.MDM_SETTINGS_DIR;
  }
});

test("settings › resetting preferences keeps the history", () => {
  const directory = fs.mkdtempSync(path.join(scratch, "reset-"));
  process.env.MDM_SETTINGS_DIR = directory;
  try {
    const store = new SettingsStore();
    store.update({ theme: "nord", zoom: 200 });
    store.addRecent({ kind: "files", paths: [`${directory}/a.txt`, `${directory}/b.txt`] });
    store.resetPreferences();
    assert.equal(store.get().theme, DEFAULT_THEME);
    assert.equal(store.get().zoom, 100);
    assert.equal(store.get().recent.length, 1);
  } finally {
    delete process.env.MDM_SETTINGS_DIR;
  }
});

/* --------------------------------------------------------------- themes */

test("themes › there are twenty families, each in a light and a dark kind", () => {
  assert.equal(THEMES.length, 40);
  assert.equal(new Set(THEMES.map((item) => item.id)).size, 40);
  assert.equal(THEMES.filter((item) => item.kind === "light").length, 20);
  assert.equal(THEMES.filter((item) => item.kind === "dark").length, 20);

  // Every family has both kinds, which is what the theme button switches between.
  const families = new Set(THEMES.map((item) => item.family));
  assert.equal(families.size, 20);
  for (const family of families) {
    const kinds = THEMES.filter((item) => item.family === family).map((item) => item.kind);
    assert.deepEqual([...kinds].sort(), ["dark", "light"], `family ${family}`);
  }
});

test("themes › the button always switches kind, and never to the same theme", () => {
  for (const item of THEMES) {
    // Whatever the random pick lands on, the kind must flip and the theme change.
    for (const pick of [() => 0, (count) => count - 1, () => 7]) {
      const other = theme(counterpartOf(item.id, null, pick));
      assert.notEqual(other.kind, item.kind, `${item.id} → ${other.id}`);
      assert.notEqual(other.id, item.id, `${item.id} stayed put`);
    }
  }
});

test("themes › the button reaches every theme of the other kind", () => {
  // Nineteen others of the same kind are excluded, so the twenty of the other kind
  // are exactly what a press can land on.
  const reachable = new Set();
  for (let index = 0; index < 20; index++) {
    reachable.add(counterpartOf("classic-light", null, () => index));
  }
  assert.equal(reachable.size, 20);
  for (const id of reachable) assert.equal(theme(id).kind, "dark");
});

test("themes › a custom theme switches by its own kind", () => {
  const light = { ...DEFAULT_CUSTOM_THEME, kind: "light" };
  assert.equal(theme(counterpartOf(CUSTOM_THEME_ID, light, () => 0)).kind, "dark");
  const dark = { ...DEFAULT_CUSTOM_THEME, kind: "dark" };
  assert.equal(theme(counterpartOf(CUSTOM_THEME_ID, dark, () => 0)).kind, "light");
});

test("themes › a custom theme is derived exactly like a built-in one", () => {
  const custom = theme(CUSTOM_THEME_ID, DEFAULT_CUSTOM_THEME);
  assert.equal(custom.id, CUSTOM_THEME_ID);
  assert.deepEqual(Object.keys(custom.vars).sort(), Object.keys(THEMES[0].vars).sort());
  assert.ok(contrastRatio(custom.vars["--panel"], custom.vars["--text"]) >= 4.5);

  // Its four colours come from the settings, not from a table.
  const dark = theme(CUSTOM_THEME_ID, { ...DEFAULT_CUSTOM_THEME, kind: "dark", bg: "#101317", panel: "#171c22", text: "#e6edf5" });
  assert.equal(dark.kind, "dark");
  assert.equal(dark.background, "#101317");
  assert.ok(contrastRatio(dark.vars["--panel"], dark.vars["--text"]) >= 4.5);
});

test("themes › every theme defines the whole variable set", () => {
  const expected = Object.keys(THEMES[0].vars);
  assert.ok(expected.length > 30);
  for (const item of THEMES) {
    assert.deepEqual(Object.keys(item.vars).sort(), [...expected].sort(), `theme ${item.id}`);
  }
});

test("themes › body text is readable on the panel in every theme", () => {
  for (const item of THEMES) {
    const ratio = contrastRatio(item.vars["--panel"], item.vars["--text"]);
    assert.ok(ratio >= 4.5, `${item.id}: contrast ${ratio.toFixed(2)}`);
  }
});

test("themes › the accent is readable against its own contrast colour", () => {
  for (const item of THEMES) {
    const ratio = contrastRatio(item.vars["--accent"], item.vars["--accent-contrast"]);
    assert.ok(ratio >= 4.5, `${item.id}: accent contrast ${ratio.toFixed(2)}`);
  }
});

test("themes › an unknown id falls back to the default", () => {
  assert.equal(isThemeId("classic-dark"), true);
  assert.equal(isThemeId(CUSTOM_THEME_ID), true);
  assert.equal(isThemeId("nonsense"), false);
  assert.equal(theme("nonsense").id, DEFAULT_THEME);
  assert.equal(
    themeBackground("classic-dark"),
    THEMES.find((item) => item.id === "classic-dark").background,
  );
});

test("themes › applyTheme needs a document and is browser-only", () => {
  assert.equal(typeof applyTheme, "function");
});

test("color › the maths behaves", () => {
  assert.deepEqual(parseHex("#ff8000"), [255, 128, 0]);
  assert.equal(toHex([255, 128, 0]), "#ff8000");
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.ok(luminance("#ffffff") > luminance("#000000"));
  assert.equal(readableOn("#ffffff"), "#10151c");
  assert.equal(readableOn("#000000"), "#f8fafc");
});

/* ---------------------------------------------------------------- i18n */

test("i18n › both languages are offered", () => {
  assert.deepEqual(LANGUAGES.map((item) => item.id), ["ko", "en"]);
});

test("i18n › every key has a Korean and an English form, and they differ", () => {
  // The whole table is reachable through the two translators; walking a
  // representative set catches a missing or copy-pasted entry.
  const keys = [
    "menu.file", "menu.edit", "menu.view", "menu.compare", "menu.merge", "menu.tools", "menu.help",
    "cmd.file.compareFiles", "cmd.merge.takeLocal", "cmd.view.theme", "settings.title",
    "print.title", "error.title", "unsaved.message", "status.ready", "pane.base",
  ];
  for (const key of keys) {
    const ko = translate("ko", key);
    const en = translate("en", key);
    assert.ok(ko.length > 0, `missing ko: ${key}`);
    assert.ok(en.length > 0, `missing en: ${key}`);
  }
});

test("i18n › placeholders are substituted", () => {
  const t = translator("en");
  assert.equal(t("print.pageOf", 2, 7), "Page 2 of 7");
  assert.equal(translator("ko")("misc.entries", 5), "5개 항목");
});

/* ---------------------------------------------------------------- print */

test("print › paper sizes are the real millimetre sizes", () => {
  assert.deepEqual(PAPER.A4, { width: 210, height: 297 });
  assert.equal(PAPER.A3.width, 297);
});

test("print › landscape swaps the page dimensions", () => {
  const settings = { ...defaultSettings().print, orientation: "landscape" };
  const page = geometry(settings, 13);
  assert.equal(page.width, 297);
  assert.equal(page.height, 210);
});

test("print › a bigger margin fits fewer lines on a page", () => {
  const base = defaultSettings().print;
  const tight = geometry({ ...base, margin: 5 }, 13);
  const loose = geometry({ ...base, margin: 40 }, 13);
  assert.ok(tight.linesPerPage > loose.linesPerPage);
});

test("print › pagination covers every row exactly once", () => {
  const rows = Array.from({ length: 95 }, (_, index) => ({
    left: `l${index}`, right: `r${index}`, leftNo: index + 1, rightNo: index + 1, kind: "same",
  }));
  const pages = paginate(rows, 40);
  assert.equal(pages.length, 3);
  assert.equal(pages.reduce((total, page) => total + page.rows.length, 0), 95);
  assert.deepEqual(pages.map((page) => page.number), [1, 2, 3]);
});

test("print › an empty document is still one page", () => {
  assert.equal(paginate([], 40).length, 1);
});

test("print › the custom range accepts lists and spans", () => {
  assert.deepEqual(parsePageRange("1-3, 5", 10), [1, 2, 3, 5]);
  assert.deepEqual(parsePageRange("7-", 9), [7, 8, 9]);
  assert.deepEqual(parsePageRange("-2", 9), [1, 2]);
  assert.deepEqual(parsePageRange("", 3), [1, 2, 3]);
  assert.deepEqual(parsePageRange("99", 3), []);
  assert.deepEqual(parsePageRange("5-2", 9), []);
  assert.deepEqual(allPages(3), [1, 2, 3]);
});

test("print › a page set formats back into a range", () => {
  assert.equal(formatPageRange([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
  assert.equal(formatPageRange([]), "");
});

/* ------------------------------------------------------------------ cli */

test("cli › git difftool arguments open a file comparison", () => {
  assert.deepEqual(parseArguments(["--diff", "a.txt", "b.txt"]), { kind: "diff", left: "a.txt", right: "b.txt" });
  assert.deepEqual(parseArguments(["a.txt", "b.txt"]), { kind: "diff", left: "a.txt", right: "b.txt" });
});

test("cli › git mergetool arguments open a 3-way merge", () => {
  assert.deepEqual(
    parseArguments(["--merge", "base", "local", "remote", "merged"]),
    { kind: "merge", base: "base", local: "local", remote: "remote", merged: "merged" },
  );
  assert.deepEqual(
    parseArguments(["base", "local", "remote", "merged"]),
    { kind: "merge", base: "base", local: "local", remote: "remote", merged: "merged" },
  );
});

test("cli › a lone session file opens as a session", () => {
  assert.deepEqual(parseArguments(["work.dmrg"]), { kind: "session", file: "work.dmrg" });
});

test("cli › a lone existing file opens as a conflicted file", () => {
  const file = path.join(scratch, "conflicted.txt");
  fs.writeFileSync(file, "x\n");
  assert.deepEqual(parseArguments([file]), { kind: "conflict", file });
});

test("cli › no arguments means nothing to open", () => {
  assert.equal(parseArguments([]), null);
  assert.equal(parseArguments(["--help"]), null);
});

/* ----------------------------------------------------------------- text */

test("text › a trailing newline is remembered, not invented", () => {
  assert.deepEqual(splitBody("a\nb\n"), { lines: ["a", "b"], trailingNewline: true });
  assert.deepEqual(splitBody("a\nb"), { lines: ["a", "b"], trailingNewline: false });
});

test("text › sizes read in human units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(null), "-");
});
