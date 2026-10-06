/**
 * The toolbar.
 *
 * Every button carries a tooltip, and the window's minimum width is measured from this
 * row (see App.tsx) so no button can ever be clipped. The first button sits exactly as
 * far from the left edge as the last one does from the right.
 *
 * It holds the actions on the left and the *settings* on the right: the view and
 * comparison switches, the panel toggles, the pane font size, the theme, the language
 * and the zoom. They live here rather than in the property panel, which shows only
 * properties.
 *
 * Two of those settings are one-click toggles with a second way in beside them: the
 * theme button swaps light for dark and the caret next to it picks a different family;
 * the flag button swaps Korean for English.
 */
import { forwardRef, useCallback } from "react";
import { MAX_FONT_SIZE, MAX_ZOOM, MIN_FONT_SIZE, MIN_ZOOM } from "../core/settings.js";
import { CUSTOM_THEME_ID, THEMES, theme as themeOf } from "../core/themes.js";
import type { CommandMap } from "./commands.js";
import * as host from "./host.js";
import { Flag, Icon } from "./icons.js";
import { Stepper } from "./dialogs/parts.js";
import { useApp } from "./state.js";

type Group = (string | "|")[];

const GROUPS: Group[] = [
  ["file.compareFiles", "file.compareDirectories", "|", "file.openThreeWay", "file.openConflict", "file.openRepository"],
  ["file.saveResult", "file.print", "|", "edit.undo", "edit.redo", "|", "edit.copy", "edit.paste"],
  ["nav.back", "nav.forward", "|", "nav.prevDiff", "nav.nextDiff"],
  ["merge.takeLocal", "merge.takeRemote", "merge.takeBoth"],
  // The folder operations. They are disabled unless a folder comparison is open
  // with something selected, which is what keeps them out of the way the rest of
  // the time — and what let the directory view lose a whole row of its own.
  ["dir.copyToRight", "dir.copyToLeft", "|", "dir.moveToRight", "dir.rename", "|", "dir.deleteLeft", "dir.deleteRight"],
  ["view.refresh", "view.swap"],
];

/** The view and comparison settings, as toggle buttons with their own tooltips. */
/** The two panel switches. They only do anything on a merge tab, and say so. */
const PANELS: { id: string; tip: Parameters<ReturnType<typeof useApp>["t"]>[0] }[] = [
  { id: "view.leftPanel", tip: "tip.leftPanel" },
  { id: "view.rightPanel", tip: "tip.rightPanel" },
  { id: "view.logPanel", tip: "tip.logPanel" },
];

const TOGGLES: { id: string; tip: Parameters<ReturnType<typeof useApp>["t"]>[0] }[] = [
  { id: "view.differencesOnly", tip: "tip.differencesOnly" },
  { id: "view.wordWrap", tip: "tip.wordWrap" },
  { id: "view.wordHighlight", tip: "tip.wordHighlight" },
  { id: "view.ignoreWhitespace", tip: "tip.ignoreWhitespace" },
  { id: "view.ignoreCase", tip: "tip.ignoreCase" },
  { id: "view.ignoreComments", tip: "tip.ignoreComments" },
  { id: "view.syntaxHighlight", tip: "tip.syntaxHighlight" },
];

/**
 * Every command the toolbar offers.
 *
 * The left tool panel subtracts this set from what it shows, so nothing appears in
 * both places. Derived from the same arrays the toolbar renders from, which is what
 * keeps the two in step as buttons come and go.
 */
export const TOOLBAR_COMMAND_IDS: ReadonlySet<string> = new Set([
  ...GROUPS.flat().filter((id) => id !== "|"),
  ...TOGGLES.map((toggle) => toggle.id),
  ...PANELS.map((panel) => panel.id),
  "view.zoomIn",
  "view.zoomOut",
  "view.themeToggle",
  "tools.settings",
  "help.about",
]);

export const Toolbar = forwardRef<HTMLDivElement, { commands: CommandMap; onChoose: (id: string | null) => void }>(
  function Toolbar({ commands, onChoose }, ref) {
    const app = useApp();
    const { t, settings } = app;
    const current = themeOf(settings.theme, settings.customTheme);

    /**
     * The theme dropdown lists the twenty families, not the forty themes: the button
     * beside it already decides light or dark, and a forty-row menu would be taller
     * than the screen. Each row carries that family's own colours.
     */
    const pickTheme = useCallback(async (element: HTMLElement) => {
      // Both kinds, each under its own heading: the button alternates between them,
      // so a list of only the one you are not in would be half the choices.
      // Two columns, light and dark, rather than forty rows: one long list is
      // taller than the screen, and two rows of twenty swatches is wider than it.
      const columnFor = (kind: "light" | "dark") => THEMES
        .filter((item) => item.kind === kind)
        .map((item) => ({
          id: `theme:${item.id}`,
          label: app.language === "en" ? item.en : item.ko,
          colors: [item.bg, item.accent, item.text],
          checked: settings.theme === item.id,
        }));

      const chosen = await host.openMenu(
        {
          menu: "theme",
          items: [
            {
              kind: "columns" as const,
              columns: [
                { label: t("settings.themeLight"), options: columnFor("light") },
                { label: t("settings.themeDark"), options: columnFor("dark") },
              ],
            },
            { kind: "separator" as const },
            {
              kind: "item" as const,
              id: `theme:${CUSTOM_THEME_ID}`,
              label: t("settings.themeCustom"),
              icon: "palette",
              checked: settings.theme === CUSTOM_THEME_ID,
              swatches: [
                settings.customTheme.bg,
                settings.customTheme.panel,
                settings.customTheme.accent,
                settings.customTheme.text,
              ],
            },
          ],
          theme: settings.theme,
          customTheme: settings.customTheme,
          language: settings.language,
          fontFamily: settings.font.family,
          fontSize: 13,
        },
        host.anchorFor(element),
      );
      onChoose(chosen);
    }, [app.language, current.kind, onChoose, settings, t]);

    const toggleButton = (toggle: { id: string; tip: Parameters<typeof t>[0] }) => {
      const command = commands[toggle.id];
      if (!command) return null;
      return (
        <button
          key={toggle.id}
          type="button"
          className={`tool-button${command.checked ? " checked" : ""}`}
          data-command={toggle.id}
          title={t(toggle.tip)}
          aria-label={command.label}
          aria-pressed={Boolean(command.checked)}
          disabled={!command.enabled}
          onClick={() => onChoose(toggle.id)}
        >
          <Icon name={command.icon} size={18} />
        </button>
      );
    };

    return (
      <div className="toolbar" ref={ref} role="toolbar" aria-label="Main toolbar">
        {/*
          * A group whose every action is unavailable is left out entirely rather
          * than shown greyed. The folder operations mean nothing on a text
          * comparison and the merge buttons mean nothing off a merge; carrying
          * both at all times made the toolbar wider than the window, and the
          * window's minimum width follows the toolbar, so the overflow could not
          * be scrolled to either.
          */}
        {GROUPS.filter((group) => group.some((id) => commands[id]?.enabled)).map((group, index) => (
          <div className="toolbar-group" key={index}>
            {group.map((id, position) => {
              if (id === "|") return <span className="toolbar-divider" key={`d${position}`} />;
              const command = commands[id];
              if (!command) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`tool-button${command.checked ? " checked" : ""}`}
                  data-command={id}
                  title={tooltipFor(id, command.label, command.shortcut, t)}
                  aria-label={command.label}
                  disabled={!command.enabled}
                  onClick={() => onChoose(id)}
                >
                  <Icon name={command.icon} size={18} />
                </button>
              );
            })}
          </div>
        ))}

        <div className="toolbar-group">{TOGGLES.map(toggleButton)}</div>
        <div className="toolbar-group">{PANELS.map(toggleButton)}</div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group font-group" title={t("tip.fontSize")}>
          <Icon name="font" size={17} />
          <Stepper
            name="paneFontSize"
            label={t("settings.fontSize")}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={settings.font.size}
            onChange={(size) => void app.updateSettings({ font: { ...settings.font, size } })}
          />
        </div>

        <div className="toolbar-group theme-group">
          <button
            type="button"
            className="tool-button theme-toggle"
            data-command="view.themeToggle"
            title={t("tip.theme")}
            aria-label={t("cmd.view.themeToggle")}
            onClick={() => onChoose("view.themeToggle")}
          >
            <Icon name="palette" size={18} />
            {/* The chips are the theme. A sun or a moon beside them would be saying
                the same thing twice, and the button no longer goes anywhere
                predictable enough for an icon to promise it. */}
            <span className="theme-chips" aria-hidden="true">
              <span style={{ background: current.bg }} />
              <span style={{ background: current.accent }} />
              <span style={{ background: current.text }} />
            </span>
          </button>
          <button
            type="button"
            className="tool-button caret"
            data-command="toolbar.themeList"
            title={t("tip.themeList")}
            aria-label={t("cmd.view.theme")}
            onPointerDown={(event) => {
              event.preventDefault();
              void pickTheme(event.currentTarget.parentElement as HTMLElement);
            }}
          >
            <Icon name="down" size={13} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="tool-button language-select"
            data-command="toolbar.language"
            title={t("tip.language")}
            aria-label={t("cmd.view.language")}
            onClick={() => void app.updateSettings({ language: settings.language === "ko" ? "en" : "ko" })}
          >
            <Flag language={settings.language} size={22} />
          </button>
        </div>

        <div className="toolbar-group zoom-group" title={t("tip.zoom")}>
          <Stepper
            name="zoom"
            label={t("cmd.view.zoomIn")}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={10}
            suffix="%"
            value={settings.zoom}
            onChange={(zoom) => void app.updateSettings({ zoom })}
          />
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="tool-button"
            data-command="tools.settings"
            title={t("tip.settings")}
            aria-label={t("cmd.tools.settings")}
            onClick={() => onChoose("tools.settings")}
          >
            <Icon name="settings" size={18} />
          </button>
          <button
            type="button"
            className="tool-button"
            data-command="help.about"
            title={t("tip.about")}
            aria-label={t("cmd.help.about")}
            onClick={() => onChoose("help.about")}
          >
            <Icon name="about" size={18} />
          </button>
        </div>
      </div>
    );
  },
);

/** Tooltips come from the string table where one exists, falling back to the label. */
function tooltipFor(
  id: string,
  label: string,
  shortcut: string | undefined,
  t: ReturnType<typeof useApp>["t"],
): string {
  const key = TOOLTIPS[id];
  if (key) return t(key);
  return shortcut ? `${label} (${shortcut})` : label;
}

const TOOLTIPS: Record<string, Parameters<ReturnType<typeof useApp>["t"]>[0]> = {
  "file.compareFiles": "tip.compareFiles",
  "file.compareDirectories": "tip.compareDirs",
  "file.openThreeWay": "tip.threeWay",
  "file.openConflict": "tip.conflict",
  "file.openRepository": "tip.repo",
  "file.saveResult": "tip.save",
  "edit.undo": "tip.undo",
  "edit.redo": "tip.redo",
  "edit.copy": "tip.copy",
  "edit.paste": "tip.paste",
  "nav.prevDiff": "tip.prevDiff",
  "nav.nextDiff": "tip.nextDiff",
  "merge.takeLocal": "tip.takeLocal",
  "merge.takeRemote": "tip.takeRemote",
  "merge.takeBoth": "tip.takeBoth",
  "nav.back": "tip.back",
  "nav.forward": "tip.forward",
  "view.refresh": "tip.refresh",
  "view.swap": "tip.swap",
  "file.print": "tip.print",
};
