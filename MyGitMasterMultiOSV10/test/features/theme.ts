// Test cases for user themes, the theme drop-down, colourful icons, the git toolbar and
// the progress pop-up; test/cases.ts runs them with the rest.
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { customThemeFrom, sanitizeCustomThemes } from "../../core/customThemes.js";
import {
  buildTheme,
  isThemeId,
  nextThemeId,
  setCustomThemes,
  themeById,
  themeColors,
  THEMES,
  type CustomTheme,
} from "../../core/themes.js";
import { startServer } from "../../server/index.js";
import { ICON_NAMES, hasDrawing } from "../../src/icons.js";
import { DUOTONE, ICON_TONE, TONES } from "../../src/iconTones.js";
import { beginProgress, currentProgress } from "../../src/progress.js";
import { translate } from "../../src/i18n.js";
import { assert, type AddCase, type FeatureCtx } from "./types";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(PROJECT_DIR, ...parts), "utf8");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Components import their own stylesheet (Vite bundles it); in Node a .css import is
// an empty module. Registered before the components are imported (dynamically, below).
let cssHook = false;
function ignoreCss(): void {
  if (cssHook) return;
  cssHook = true;
  register(`data:text/javascript,${encodeURIComponent(
    "export async function load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); }",
  )}`);
}

const SAMPLE: CustomTheme = {
  id: "custom-1",
  name: "Mine",
  mode: "dark",
  colors: themeColors(themeById("dark-ink")),
};

export function themeCases(ctx: FeatureCtx, add: AddCase): void {
  add("Theme", "User themes are sanitised: bad ids, colours and duplicates are dropped", async () => {
    const list = sanitizeCustomThemes([
      SAMPLE,
      { ...SAMPLE },
      { id: "light-classic", name: "x", mode: "light", colors: SAMPLE.colors },
      { id: "custom-2", name: "  ", mode: "weird", colors: { ...SAMPLE.colors, bg: "red", accent: "#ABCDEF" } },
      "nonsense",
    ]);
    assert(list.length === 2, JSON.stringify(list.map((item) => item.id)));
    assert(list[1].mode === "light" && list[1].name === "custom-2", JSON.stringify(list[1]));
    assert(list[1].colors.bg === themeById("light-classic").vars["--bg"], "a bad colour falls back");
    assert(list[1].colors.accent === "#abcdef", list[1].colors.accent);
    assert(sanitizeCustomThemes("x").length === 0, "not a list");
  });

  add("Theme", "A user theme is built like a built-in one and is known once registered", async () => {
    for (const item of THEMES) {
      const rebuilt = buildTheme(item.mode, item.id.slice(item.mode.length + 1), item.nameKo, item.nameEn, themeColors(item));
      assert(JSON.stringify(rebuilt) === JSON.stringify(item), item.id);
    }
    const made = customThemeFrom("dark-ink", "Copy", [SAMPLE]);
    assert(made.id === "custom-2" && made.mode === "dark" && made.colors.bg === "#121212", JSON.stringify(made));
    assert(!isThemeId("custom-1"), "unknown without the list");
    assert(isThemeId("custom-1", [SAMPLE]), "known with the list");
    setCustomThemes([SAMPLE]);
    try {
      assert(themeById("custom-1").nameEn === "Mine" && themeById("custom-1").mode === "dark", "registered");
      assert(nextThemeId(THEMES[THEMES.length - 1].id) === "custom-1", "cycling reaches the user's themes");
    } finally {
      setCustomThemes([]);
    }
    assert(themeById("custom-1").id === "light-classic", "unregistered falls back");
  });

  add("Theme", "Settings keep a user theme as the current theme and drop it when it is deleted", async () => {
    const previous = process.env.MGM_SETTINGS_DIR;
    process.env.MGM_SETTINGS_DIR = path.join(ctx.home, "theme-settings");
    const server = await startServer({ port: 0, host: "127.0.0.1" });
    const put = async (body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.json() as Promise<{ theme: string; customThemes: CustomTheme[] }>;
    };
    try {
      let saved = await put({ customThemes: [SAMPLE], theme: "custom-1" });
      assert(saved.theme === "custom-1" && saved.customThemes.length === 1, JSON.stringify(saved));
      saved = await put({ theme: "custom-9" });
      assert(saved.theme === "custom-1", "an unknown theme is refused");
      saved = await put({ customThemes: [] });
      assert(saved.theme === "light-classic" && saved.customThemes.length === 0, JSON.stringify(saved));
    } finally {
      await server.close();
      if (previous === undefined) delete process.env.MGM_SETTINGS_DIR;
      else process.env.MGM_SETTINGS_DIR = previous;
    }
  });

  add("Theme", "The core knows the user's themes once settings load or are saved", async () => {
    const { SettingsStore } = await import("../../core/settings.js");
    const { promptThemeOf } = await import("../../core/promptSettings.js");
    const dir = path.join(ctx.home, "core-theme-settings");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ theme: "custom-1", customThemes: [SAMPLE] }));
    try {
      const store = new SettingsStore(dir);
      assert(store.get().theme === "custom-1", "a saved user theme stays current");
      assert(themeById("custom-1").nameEn === "Mine", "registered on load");
      assert(promptThemeOf("custom-1").bg === SAMPLE.colors.panel, "the prompt uses its colours");
      const edited = { ...SAMPLE, colors: { ...SAMPLE.colors, panel: "#102030" } };
      store.update({ customThemes: [edited] });
      assert(themeById("custom-1").vars["--panel"] === "#102030", "re-registered on save");
      store.update({ customThemes: [] });
      assert(themeById("custom-1").id === "light-classic", "gone once deleted");
    } finally {
      setCustomThemes([]);
    }
  });

  add("Theme", "The theme drop-down lists My themes, then Dark, then Light, in two top-to-bottom columns", async () => {
    ignoreCss();
    const { ThemeMenu } = await import("../../src/ThemeMenu.js");
    const t = (key: string) => translate("en", key);
    const render = (customThemes: CustomTheme[]) => renderToStaticMarkup(createElement(ThemeMenu, {
      settings: { theme: "dark-ink", customThemes } as never,
      lang: "en",
      t,
      onChoose: () => undefined,
      onSettings: () => undefined,
    }));
    const html = render([]);
    const order = ["custom", "dark", "light"].map((name) => html.indexOf(`data-section="${name}"`));
    assert(order.every((index) => index >= 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
    assert(html.includes(t("themeSettings")), "the settings button");
    assert(html.indexOf(t("themeSettings")) < order[1], "the settings button is in the first section");
    const grids = html.match(/grid-template-rows:repeat\(10, var\(--theme-entry-h\)\)/g) ?? [];
    assert(grids.length === 2, `two 10-row grids, got ${grids.length}`);
    assert(html.indexOf("Midnight") < html.indexOf("Classic"), "dark before light");
    const withMine = render([SAMPLE]);
    assert(withMine.indexOf("Mine") > 0 && withMine.indexOf("Mine") < withMine.indexOf(`data-section="dark"`), "my theme in the first section");
    assert(read("src", "themeMenu.css").includes("grid-auto-flow: column"), "column-major grid");
  });

  add("Theme", "Every theme drop-down entry has one fixed size, wide enough for every name", async () => {
    ignoreCss();
    const { ThemeMenu, THEME_ENTRY_WIDTH, THEME_ENTRY_HEIGHT } = await import("../../src/ThemeMenu.js");
    const css = read("src", "themeMenu.css");
    assert(css.includes("grid-template-columns: repeat(2, var(--theme-entry-w))"), "two fixed-width columns");
    assert(/\.theme-option \{[^}]*width: var\(--theme-entry-w\);[^}]*height: var\(--theme-entry-h\);/.test(css), "fixed entry size");
    assert(/\.theme-option \{[^}]*grid-template-columns: 48px minmax\(0, 1fr\) 16px;/.test(css), "swatch, name and check columns line up");
    // The longest name (either language) must fit: 48 px swatch + 16 px check + gaps + padding, ~7.5 px a character.
    const longest = Math.max(...THEMES.flatMap((item) => [item.nameEn.length * 7.5, item.nameKo.length * 12.5]));
    assert(THEME_ENTRY_WIDTH - 48 - 16 - 16 - 14 >= longest, `entry ${THEME_ENTRY_WIDTH}px vs longest name ${longest}px`);
    const html = renderToStaticMarkup(createElement(ThemeMenu, {
      settings: { theme: "dark-ink", customThemes: [SAMPLE] } as never,
      lang: "ko",
      t: (key: string) => translate("ko", key),
      onChoose: () => undefined,
      onSettings: () => undefined,
    }));
    assert(html.includes(`--theme-entry-w:${THEME_ENTRY_WIDTH}px`) && html.includes(`--theme-entry-h:${THEME_ENTRY_HEIGHT}px`), "the size is set");
    const entries = html.match(/class="theme-option(?: selected| theme-option-settings)?"/g) ?? [];
    assert(entries.length === 40 + 1 + 1, `entries ${entries.length}`);
    assert(html.includes("theme-option theme-option-settings"), "the settings button is an entry of the same grid");
    assert((html.match(/theme-option-check/g) ?? []).length === 41, "every theme has a check slot");
  });

  add("Icons", "Every icon has a drawing and a colour", async () => {
    for (const name of ICON_NAMES) {
      assert(hasDrawing(name), `${name} has no drawing`);
      assert(TONES.includes(ICON_TONE[name]), `${name} has no tone`);
    }
    for (const name of DUOTONE) assert(ICON_NAMES.includes(name as never), `${name} is not an icon`);
    const css = read("src", "icons.css");
    for (const tone of TONES) {
      assert(css.includes(`.icon[data-tone="${tone}"]`), `${tone} rule`);
      assert((css.match(new RegExp(`--tone-${tone}:`, "g")) ?? []).length === 2, `${tone} light and dark shades`);
    }
    assert(read("src", "main.tsx").includes(`import "./icons.css"`), "the colours are loaded");
  });

  add("Icons", "Every menu, context-menu and toolbar entry has an icon; settings use the gear", async () => {
    const app = read("src", "App.tsx");
    const entries = app.split("\n").filter((line) => /\blabel: t\(/.test(line) && /\b(action|onClick):/.test(line));
    assert(entries.length > 30, `entries ${entries.length}`);
    for (const line of entries) assert(/\bicon: "/.test(line), `no icon: ${line.trim().slice(0, 100)}`);
    for (const match of app.matchAll(/<Menu icon="([a-zA-Z]+)"/g)) assert(ICON_NAMES.includes(match[1] as never), match[1]);
    assert(/icon: "prefs", label: t\("preferences"\)/.test(app), "File › Preferences uses the gear");
    assert(/<ToolButton icon="prefs"/.test(app), "the toolbar settings button uses the gear");
    const icons = read("src", "icons.tsx");
    const gear = icons.slice(icons.indexOf(`case "prefs":`), icons.indexOf(`case "clock":`));
    assert(gear.includes("A gear") && gear.includes("<circle"), "the prefs icon is a gear with a hole");
  });

  add("Icons", "Menu labels stay on one line and toolbars show icons only", async () => {
    const css = read("src", "menuLabels.css");
    for (const selector of [".menu-pop button", ".context button", ".git-tool-more button", ".menubar .menu > button", ".prefs-tabs button", ".theme-option"]) {
      assert(css.includes(selector), `${selector} is kept on one line`);
    }
    assert(css.includes("width: max-content") && css.includes("white-space: nowrap"), "menus size to their content");
    assert(read("src", "main.tsx").includes(`import "./menuLabels.css"`), "the rules are loaded");
    const toolbar = read("src", "GitToolbar.tsx");
    const button = toolbar.slice(toolbar.indexOf("className={command.pressed"), toolbar.indexOf("</button>", toolbar.indexOf("className={command.pressed")));
    assert(button.includes("aria-label={command.label}") && button.includes("title={command.label}") && !button.includes("{command.label}</"), "toolbar buttons: icon, tooltip, no text");
    const app = read("src", "App.tsx");
    assert(app.includes("setMinimumSize?.(width, 640)") && app.includes("naturalWidths.current.menubar"), "the window minimum follows the toolbar and menu rows");
  });

  add("Toolbar", "The toolbar has every git command and moves what does not fit into More", async () => {
    const app = read("src", "App.tsx");
    const toolbar = app.slice(app.indexOf("<GitToolbar"), app.indexOf("]} />", app.indexOf("<GitToolbar")));
    for (const id of ["open", "clone", "browse", "refresh", "add", "reset", "discard", "commit", "resolve", "fetch", "pull", "push", "stash", "stashPop", "status"]) {
      assert(toolbar.includes(`id: "${id}"`), `toolbar has ${id}`);
    }
    ignoreCss();
    const { fitCount } = await import("../../src/GitToolbar.js");
    assert(fitCount([50, 50, 50], 200, 40, 4) === 3, "everything fits");
    assert(fitCount([50, 50, 50, 50], 150, 40, 4) === 2, "the rest goes to More");
    assert(fitCount([80], 10, 40, 4) === 0, "nothing fits");
  });

  add("Toolbar", "Toolbar buttons are never clipped: the window minimum width follows the toolbar", async () => {
    // Rules for the toolbar row and its groups, from every stylesheet that styles them.
    const sheets = [read("src", "styles.css"), read("src", "gitToolbar.css")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...sheets.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector]) => /(^|[\s,])\.(toolbar|git-toolbar|toolbar-end|git-tool-slot)(?![-\w])/.test(selector) && !/git-toolbar-ruler|git-tool-more/.test(selector));
    assert(rules.length >= 4, `toolbar rules ${rules.length}`);
    for (const [, selector, body] of rules) {
      assert(!/overflow(-x)?\s*:\s*(hidden|clip)/.test(body), `${selector.trim()} clips its buttons`);
    }
    const css = read("src", "gitToolbar.css");
    assert(css.includes(".toolbar > :not(.git-toolbar) { flex-shrink: 0; }"), "the other groups never shrink");
    assert(css.includes('.git-toolbar[data-overflow="off"] { flex: 1 0 auto; }'), "on the desktop the git group never shrinks");
    const toolbar = read("src", "GitToolbar.tsx");
    const app = read("src", "App.tsx");
    assert(toolbar.includes("document.fonts?.ready"), "measured again once fonts load");
    // The row stretches to the window: reading its size would make the minimum follow the
    // window (it could then never shrink again, and a maximized window would pin it).
    for (const source of [toolbar, app]) {
      assert(!/row\.(scrollWidth|clientWidth|offsetWidth)|bar\.(scrollWidth|clientWidth|offsetWidth)/.test(source), "never measures the stretching row");
    }
    assert(toolbar.includes("export function intrinsicWidth"), "growing boxes are measured by their content");
    assert(/width === sentMinWidth\.current\) return/.test(app) && app.includes("setTimeout(sendMinimumWidth, 120)"), "debounced and sent only on change");
    assert(app.includes("overflow={!window.mgm}"), "More is for the browser build only");
    assert(/window\.mgm\?\.setMinimumSize\?\.\(width, 640\)/.test(app), "App reports the minimum to the shell");
    assert(app.includes("naturalWidths.current.menubar") && app.includes("naturalWidths.current.toolbar"), "both rows count");
    assert(toolbar.includes("intrinsicWidth(child) + marginX(child)") && toolbar.includes("FRAME_ALLOWANCE"), "every child's margin box and the window edge count, up to the last button");
  });

  add("Toolbar", "Panel headers stay on one line, with an ellipsis and the full title as a tooltip", async () => {
    const css = read("src", "menuLabels.css");
    const rule = css.slice(css.indexOf(".section > span:not(.fs-path) {"), css.indexOf("}", css.indexOf(".section > span:not(.fs-path) {")));
    for (const part of ["white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis", "min-width: 4.5em"]) assert(rule.includes(part), part);
    assert(css.includes(".section > .section-btn") && css.includes("flex-shrink: 0"), "header buttons keep their size");
    const app = read("src", "App.tsx");
    for (const key of ["repository", "commitDetails", "changedFiles", "diff"]) {
      assert(app.includes(`<span title={t("${key}")}>{t("${key}")}</span>`), `${key} header has its full title`);
    }
    assert(app.includes('<span title={`${t("commitHistory")}'), "Commit History header has its full title");
  });

  add("Toolbar", "The progress pop-up shows only operations that outlast the delay", async () => {
    const quick = beginProgress("quick", "fetch", 40);
    assert(currentProgress()?.visible === false, "hidden at first");
    quick();
    assert(currentProgress() === null, "gone when done");
    await sleep(60);
    assert(currentProgress() === null, "a quick operation never shows");
    const slow = beginProgress("slow", "pull", 20);
    await sleep(50);
    const state = currentProgress();
    assert(state?.visible === true && state.label === "slow" && state.icon === "pull", JSON.stringify(state));
    slow();
    slow();
    assert(currentProgress() === null, "ending twice is harmless");
    ignoreCss();
    const { ProgressPopup, formatElapsed } = await import("../../src/ProgressPopup.js");
    assert(formatElapsed(65_400) === "1:05", formatElapsed(65_400));
    const html = renderToStaticMarkup(createElement(ProgressPopup, {
      state: { id: 1, label: "Git Pull", icon: "pull", startedAt: Date.now(), visible: true, detail: "Receiving objects: 42%" },
      t: (key: string) => translate("en", key),
      onCancel: () => undefined,
    }));
    for (const text of ["Working", "Git Pull", "Receiving objects: 42%", "Cancel", "progress-popup-bar"]) assert(html.includes(text), text);
    assert((html.match(/class="icon"/g) ?? []).length >= 2, "title and operation icons");
  });
}
