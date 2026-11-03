/**
 * The theme drop-down (toolbar ▾ next to the theme button).
 *
 * Order, top to bottom: the user's own themes with the button that opens
 * Preferences › Theme, then the Dark themes, then the Light themes. Each section is a
 * strict two-column grid of same-size entries filled top to bottom (column-major), so
 * swatches, names and check marks line up in both columns; the settings button is an
 * entry of the same size.
 *
 * A pure component — it only gets the settings and reports a choice — so it can be
 * drawn in the main window or in a pop-up window of its own.
 */
import type { CSSProperties, ReactElement } from "react";
import type { Settings } from "./api";
import { customTheme, THEMES, type CustomTheme, type Theme, type ThemeMode } from "../core/themes";
import type { Lang } from "./i18n";
import { Icon } from "./icons";
import "./themeMenu.css";

export type ThemeMenuProps = {
  settings: Settings | null;
  lang: Lang;
  t: (key: string) => string;
  onChoose: (id: string) => void;
  onSettings: () => void;
};

/** The section order of the drop-down and of Preferences › Theme. */
export const THEME_SECTION_ORDER = ["custom", "dark", "light"] as const;

/** Every entry is this size (wide enough for the longest built-in name in either language). */
export const THEME_ENTRY_WIDTH = 176;
export const THEME_ENTRY_HEIGHT = 28;

export function customThemesOf(settings: Settings | null): CustomTheme[] {
  const list = settings?.customThemes;
  return Array.isArray(list) ? (list as CustomTheme[]) : [];
}

/** Rows for a two-column, top-to-bottom grid of `count` items. */
export function columnRows(count: number): number {
  return Math.max(1, Math.ceil(count / 2));
}

export function themeName(item: Theme, lang: Lang): string {
  return lang === "ko" ? item.nameKo : item.nameEn;
}

const GRID_SIZE = {
  "--theme-entry-w": `${THEME_ENTRY_WIDTH}px`,
  "--theme-entry-h": `${THEME_ENTRY_HEIGHT}px`,
} as CSSProperties;

export function ThemeMenu(props: ThemeMenuProps) {
  const { t, lang } = props;
  const current = props.settings?.theme ?? "light-classic";
  const customs = customThemesOf(props.settings).map(customTheme);
  const group = (mode: ThemeMode) => THEMES.filter((item) => item.mode === mode);
  const entry = (theme: Theme) => (
    <button
      key={theme.id}
      type="button"
      role="option"
      className={theme.id === current ? "theme-option selected" : "theme-option"}
      aria-selected={theme.id === current}
      title={themeName(theme, lang)}
      onClick={() => props.onChoose(theme.id)}
    >
      <span className="swatches">{theme.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
      <span className="theme-option-name">{themeName(theme, lang)}</span>
      <span className="theme-option-check" aria-hidden="true"><Icon name="check" /></span>
    </button>
  );
  const settingsEntry = (
    <button key="settings" type="button" className="theme-option theme-option-settings" title={t("themeCustomEmpty")} onClick={props.onSettings}>
      <span className="theme-option-icon"><Icon name="prefs" /></span>
      <span className="theme-option-name">{t("themeSettings")}</span>
    </button>
  );
  const grid = (cells: ReactElement[], label: string) => (
    <div className="theme-menu-grid" role="listbox" aria-label={label} style={{ gridTemplateRows: `repeat(${columnRows(cells.length)}, var(--theme-entry-h))` }}>
      {cells}
    </div>
  );
  return (
    <div className="theme-menu" style={GRID_SIZE} data-sections={THEME_SECTION_ORDER.join(" ")} onClick={(event) => event.stopPropagation()}>
      <section className="theme-menu-section" data-section="custom">
        <div className="theme-menu-title"><Icon name="palette" /><span>{t("themeCustom")}</span></div>
        {grid([...customs.map(entry), settingsEntry], t("themeCustom"))}
      </section>
      <section className="theme-menu-section" data-section="dark">
        <div className="theme-menu-title"><Icon name="theme" /><span>{t("themeDark")}</span></div>
        {grid(group("dark").map(entry), t("themeDark"))}
      </section>
      <section className="theme-menu-section" data-section="light">
        <div className="theme-menu-title"><Icon name="theme" /><span>{t("themeLight")}</span></div>
        {grid(group("light").map(entry), t("themeLight"))}
      </section>
    </div>
  );
}
