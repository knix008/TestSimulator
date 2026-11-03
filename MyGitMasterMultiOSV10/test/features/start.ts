// Test cases for the start screen and the tutorial; test/cases.ts runs them with the rest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SettingsStore } from "../../core/settings.js";
import { BACKGROUND_KINDS, DEFAULT_START_SCREEN, effectiveSpeed, sanitizeStartScreen } from "../../core/startScreen.js";
import { startStrings } from "../../src/strings/start.js";
import { autoArrange, cardsOf, compact, layoutValue, overlaps, place } from "../../src/startLayout.js";
import { defaultStartScreen, isStartScreenShown, applyStartupChoice, hideStartScreen, startScreenChoice, toggleStartScreen } from "../../src/startScreen.js";
import { TOUR_STEPS, tourKeys } from "../../src/tourSteps.js";
import { assert, type AddCase, type FeatureCtx } from "./types.js";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(PROJECT_DIR, ...parts), "utf8");

const IDS = ["hero", "actions", "recent", "urls", "theme", "background"];
const SPAN: Record<string, number> = { hero: 3, actions: 3, recent: 2, urls: 1, theme: 3, background: 3 };

function noOverlaps(cells: Record<string, { col: number; row: number; w: number; h: number; fit: boolean }>): boolean {
  const list = Object.values(cells);
  return list.every((a, i) => list.every((b, j) => i === j || !overlaps(a, b)));
}

export function startCases(ctx: FeatureCtx, add: AddCase): void {
  add("Start screen", "Start screen settings are sanitised to valid defaults", async () => {
    const fresh = sanitizeStartScreen(undefined);
    assert(JSON.stringify(fresh) === JSON.stringify(DEFAULT_START_SCREEN), JSON.stringify(fresh));
    const odd = sanitizeStartScreen({ showOnStartup: false, background: "nope", speed: 333, shuffleSec: 2, cardOpacity: 3, layout: [1] });
    assert(odd.showOnStartup === false, "showOnStartup");
    assert(odd.background === DEFAULT_START_SCREEN.background, odd.background);
    assert(odd.speed === 300 && odd.shuffleSec === 5 && odd.cardOpacity === 20 && odd.layout === null, JSON.stringify(odd));
    assert(sanitizeStartScreen({ speed: 47 }).speed === 50, "speed steps by 10");
    assert(effectiveSpeed({ speed: null }, false) === 100 && effectiveSpeed({ speed: null }, true) < 100, "default speed");
    assert(new Set(BACKGROUND_KINDS).size === BACKGROUND_KINDS.length && BACKGROUND_KINDS.length >= 20, "twenty distinct backgrounds");
  });

  add("Start screen", "Start screen and tutorial settings round-trip through the settings file", async () => {
    const dir = path.join(ctx.home, "start-settings");
    const store = new SettingsStore(dir);
    assert(store.get().showTutorial === true, "the tutorial is offered by default");
    const startScreen = store.get().startScreen as { showOnStartup: boolean };
    assert(startScreen.showOnStartup === true, JSON.stringify(startScreen));
    store.update({ showTutorial: false, startScreen: { background: "aurora", cardOpacity: 55, showOnStartup: false } });
    const again = new SettingsStore(dir).get();
    const saved = again.startScreen as ReturnType<typeof sanitizeStartScreen>;
    assert(again.showTutorial === false, "showTutorial saved");
    assert(saved.background === "aurora" && saved.cardOpacity === 55 && saved.showOnStartup === false, JSON.stringify(saved));
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    raw.startScreen = { background: 42, speed: "fast" };
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(raw));
    const repaired = new SettingsStore(dir).get().startScreen as ReturnType<typeof sanitizeStartScreen>;
    assert(repaired.background === DEFAULT_START_SCREEN.background && repaired.speed === null, JSON.stringify(repaired));
    const reset = new SettingsStore(dir);
    reset.resetPreferences();
    assert(reset.get().showTutorial === true, "Restore defaults offers the tutorial again");
    assert(JSON.stringify(reset.get().startScreen) === JSON.stringify(DEFAULT_START_SCREEN), "Restore defaults resets the start screen");
  });

  add("Start screen", "The card board packs, moves and compacts without overlaps", async () => {
    const cells = cardsOf(null, IDS, SPAN, { hero: 6, actions: 8, recent: 9, urls: 9, theme: 12, background: 10 });
    assert(IDS.every((id) => cells[id]), JSON.stringify(cells));
    assert(noOverlaps(cells), "default layout overlaps");
    assert(cells.hero.row === 0 && cells.hero.w === 3, JSON.stringify(cells.hero));
    const moved = compact(place(cells, "urls", { col: 0, row: 0 }));
    assert(noOverlaps(moved), "moved layout overlaps");
    assert(moved.urls.col === 0, JSON.stringify(moved.urls));
    const restored = cardsOf(layoutValue(moved), IDS, SPAN);
    assert(restored.urls.col === moved.urls.col && restored.urls.row === moved.urls.row, "a saved layout reads back");
    assert(noOverlaps(autoArrange(IDS, SPAN, {})), "auto arrange overlaps");
    assert(Object.keys(cardsOf({ version: 1, cards: { ghost: { col: 0, row: 0 } } }, IDS, SPAN)).sort().join() === [...IDS].sort().join(), "unknown cards are dropped");
  });

  add("Start screen", "The Start button switches between the start screen and the workspace", async () => {
    assert(defaultStartScreen(false, true) && !defaultStartScreen(true, true) && !defaultStartScreen(false, false), "defaults");
    assert(startScreenChoice() === null, "nothing chosen yet");
    applyStartupChoice(true);
    assert(isStartScreenShown(true, true), "show at startup puts it in front of a reopened repository");
    toggleStartScreen(true, true);
    assert(!isStartScreenShown(true, true), "the Start button hides it");
    toggleStartScreen(true, true);
    assert(isStartScreenShown(true, true), "and shows it again");
    hideStartScreen();
    assert(!isStartScreenShown(false, true), "opening a repository hides it");
    applyStartupChoice(true);
    assert(!isStartScreenShown(false, true), "the startup choice applies once per launch");
    const app = read("src", "App.tsx");
    const button = app.indexOf("className={onStart ? \"start-toggle active\" : \"start-toggle\"}");
    assert(button > app.indexOf("<span>{packageJson.version}</span>"), "the Start button sits right of the version number");
    assert(app.includes("<StartPage") && app.includes("display: onStart && settings ? \"none\""), "the start screen replaces the panels");
  });

  add("Start screen", "The start screen's menu offers every main action, with compact speed and opacity", async () => {
    const page = read("src", "StartPage.tsx");
    for (const id of ["open", "open-folder", "clone", "browse", "terminal", "theme", "language", "preferences", "start-settings", "guide", "tutorial", "about", "exit"]) {
      assert(page.includes(`id: "${id}"`), `the launcher has no ${id}`);
    }
    assert((page.match(/<RangeStepper\s+compact/g) ?? []).length === 2, "speed and opacity use the compact one-line stepper");
    assert((read("src", "settings", "StartSettings.tsx").match(/<RangeStepper\s+compact/g) ?? []).length === 2, "Preferences › Start screen uses the compact stepper too");
    const app = read("src", "App.tsx");
    assert(app.indexOf("<StartPage") > app.indexOf("className=\"menubar\""), "the menu bar stays above the start screen");
  });

  add("Start screen", "Every background kind has its own colourful icon", async () => {
    const source = read("src", "backgroundIcons.tsx");
    const tones = read("src", "iconTones.ts");
    const palette = new Set([...tones.matchAll(/"([a-z]+)"/g)].map((match) => match[1]));
    const seen = new Set<string>();
    for (const kind of BACKGROUND_KINDS) {
      const match = new RegExp(`\\n  ${kind}: \\["([a-z]+)", "([a-z]+)", "([a-z]+)"\\]`).exec(source);
      assert(match, `${kind} has no tones`);
      const triple = match.slice(1);
      assert(new Set(triple).size >= 2, `${kind} needs at least two colours: ${triple.join()}`);
      for (const tone of triple) assert(palette.has(tone), `${kind}: ${tone} is not in the shared palette`);
      seen.add(triple.join());
    }
    assert(seen.size === BACKGROUND_KINDS.length, "every background kind has a different colour set");
    assert(read("src", "startControls.tsx").includes("<BackgroundIcon kind={kind}"), "the background picker draws the coloured icons");
    assert(read("src", "startControls.css").includes(".bg-tile.on { border: 2px solid var(--accent)"), "the selected background is outlined in the accent colour");
  });

  add("Tutorial", "Every tour step has its strings and points at parts App.tsx has", async () => {
    const app = read("src", "App.tsx") + read("src", "StartPage.tsx");
    assert(TOUR_STEPS[0].id === "intro" && TOUR_STEPS[TOUR_STEPS.length - 1].id === "end", "intro … end");
    assert(new Set(TOUR_STEPS.map((step) => step.id)).size === TOUR_STEPS.length, "unique ids");
    for (const step of TOUR_STEPS) {
      const keys = tourKeys(step);
      for (const lang of ["ko", "en"] as const) {
        assert(startStrings[lang][keys.title] && startStrings[lang][keys.text], `${lang} ${step.id}`);
      }
      for (const selector of step.target ?? []) {
        const names = [...selector.matchAll(/\.([a-z][a-z0-9-]*)|data-tour="([a-z-]+)"/g)].map((match) => match[1] ?? match[2]);
        for (const name of names) {
          assert(app.includes(name), `${step.id}: ${name} is not in App.tsx / StartPage.tsx`);
        }
      }
    }
    assert(app.includes("<TutorialTour") && app.includes("<TutorialWelcome"), "the tour and the welcome card are mounted");
    assert(/\{settings && onStart && \(\s*<TutorialWelcome/.test(app), "the tutorial offer shows only on the start screen");
    assert(app.includes("onView={(view) => (view === \"start\" ? showStartScreen() : hideStartScreen())}"), "the tour switches views");
    for (const step of TOUR_STEPS) {
      const startPart = (step.target ?? []).some((selector) => selector.includes("start-") && selector.includes("data-tour"));
      const panel = (step.target ?? []).some((selector) => /left-col|center-col|right-col|log-panel/.test(selector));
      if (startPart) assert(step.view === "start", `${step.id} brings the start screen forward`);
      if (panel) assert(step.view === "workspace", `${step.id} brings the workspace forward`);
    }
    assert(app.includes("label: t(\"tutorialMenu\"), action: () => startTutorial()"), "Help › Tutorial starts the tour");
  });

  add("Tutorial", "Start screen and tutorial strings exist in Korean and English", async () => {
    const ko = Object.keys(startStrings.ko).sort();
    const en = Object.keys(startStrings.en).sort();
    assert(ko.join() === en.join(), `ko/en differ: ${ko.filter((k) => !en.includes(k)).concat(en.filter((k) => !ko.includes(k))).join(", ")}`);
    for (const kind of BACKGROUND_KINDS) assert(startStrings.ko[`startBg_${kind}`], kind);
    for (const [lang, table] of Object.entries(startStrings)) {
      for (const [key, value] of Object.entries(table)) assert(value.trim().length > 0, `${lang}.${key} is empty`);
    }
  });
}
