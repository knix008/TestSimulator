/**
 * Preferences › Theme.
 *
 * Same order as the toolbar drop-down: the user's own themes (with the editor), then
 * Dark, then Light. A user theme is made from whatever theme is current; picking one
 * of them opens its colours for editing. Every change is shown at once and saved a
 * moment later, so dragging a colour picker does not send a request per pixel.
 */
import { useEffect, useRef, useState } from "react";
import { customThemeFrom } from "../core/customThemes";
import {
  applyTheme,
  customTheme,
  setCustomThemes,
  THEME_COLOR_KEYS,
  THEMES,
  type CustomTheme,
  type Theme,
  type ThemeColorKey,
  type ThemeMode,
} from "../core/themes";
import type { Settings } from "./api";
import type { Lang } from "./i18n";
import { Icon } from "./icons";
import { customThemesOf, themeName } from "./ThemeMenu";
import "./themePicker.css";

const SAVE_DELAY_MS = 300;

export function ThemePicker(props: {
  settings: Settings;
  lang: Lang;
  t: (key: string) => string;
  /** Choose an existing theme. */
  onChange: (id: string) => void;
  /** Save settings (customThemes, theme). */
  onPrefs: (patch: Partial<Settings>) => void;
}) {
  const { t, lang } = props;
  const current = props.settings.theme;
  const saved = customThemesOf(props.settings);
  const [draft, setDraft] = useState<CustomTheme[]>(saved);
  const timer = useRef<number | null>(null);
  const savedKey = JSON.stringify(saved);

  // Follow the saved list unless an edit is still waiting to be saved.
  useEffect(() => {
    if (timer.current == null) setDraft(JSON.parse(savedKey) as CustomTheme[]);
  }, [savedKey]);
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const editing = draft.find((item) => item.id === current) ?? null;

  /** Shows `next` at once; saves it (and `theme`, if given) shortly after. */
  const commit = (next: CustomTheme[], theme?: string, immediate = false) => {
    setDraft(next);
    setCustomThemes(next);
    applyTheme(theme ?? document.documentElement.dataset.theme ?? current);
    if (timer.current != null) window.clearTimeout(timer.current);
    const save = () => {
      timer.current = null;
      props.onPrefs(theme ? { customThemes: next, theme } : { customThemes: next });
    };
    if (immediate) save();
    else timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  };

  const create = () => {
    const made = customThemeFrom(current, `${t("themeDefaultName")} ${draft.length + 1}`, draft);
    commit([...draft, made], made.id, true);
  };
  const remove = (id: string) => {
    const gone = draft.find((item) => item.id === id);
    const next = draft.filter((item) => item.id !== id);
    const fallback = gone?.mode === "dark" ? "dark-midnight" : "light-classic";
    commit(next, id === current ? fallback : undefined, true);
  };
  const edit = (patch: Partial<Omit<CustomTheme, "colors">> & { colors?: Partial<CustomTheme["colors"]> }) => {
    if (!editing) return;
    const next = draft.map((item) => item.id === editing.id
      ? { ...item, ...patch, colors: { ...item.colors, ...(patch.colors ?? {}) } }
      : item);
    commit(next);
  };

  const card = (item: Theme) => (
    <button
      key={item.id}
      type="button"
      className={current === item.id ? "theme-card selected" : "theme-card"}
      title={themeName(item, lang)}
      onClick={() => {
        applyTheme(item.id);
        props.onChange(item.id);
      }}
    >
      <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
      <span>{themeName(item, lang)}</span>
    </button>
  );
  const group = (mode: ThemeMode) => THEMES.filter((item) => item.mode === mode);

  return (
    <div className="theme-picker">
      <section data-section="custom">
        <div className="group theme-picker-head">
          <Icon name="palette" />
          <span>{t("themeCustom")}</span>
          <button type="button" className="theme-picker-new" onClick={create} title={t("themeNewFrom")}>
            <Icon name="plus" />
            <span>{t("themeNewFrom")}</span>
          </button>
        </div>
        {draft.length > 0
          ? <div className="theme-grid">{draft.map((item) => card(customTheme(item)))}</div>
          : <div className="theme-picker-empty">{t("themeCustomEmpty")}</div>}
        {editing ? (
          <div className="theme-editor">
            <div className="theme-editor-row">
              <label>
                <span>{t("themeName")}</span>
                <input value={editing.name} maxLength={40} onChange={(event) => edit({ name: event.target.value })} />
              </label>
              <label>
                <span>{t("themeMode")}</span>
                <select value={editing.mode} onChange={(event) => edit({ mode: event.target.value === "dark" ? "dark" : "light" })}>
                  <option value="light">{t("themeLight")}</option>
                  <option value="dark">{t("themeDark")}</option>
                </select>
              </label>
              <button type="button" className="theme-editor-delete" onClick={() => remove(editing.id)}>
                <Icon name="trash" />
                <span>{t("themeDelete")}</span>
              </button>
            </div>
            <div className="theme-editor-colors">
              {THEME_COLOR_KEYS.map((key: ThemeColorKey) => (
                <label key={key} className="theme-color">
                  <input type="color" value={editing.colors[key]} onChange={(event) => edit({ colors: { [key]: event.target.value } })} />
                  <span>{t(`themeColor_${key}`)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : draft.length > 0 ? <div className="theme-picker-empty">{t("themeEditHint")}</div> : null}
      </section>
      <section data-section="dark">
        <div className="group theme-picker-head"><Icon name="theme" /><span>{t("themeDark")}</span></div>
        <div className="theme-grid">{group("dark").map(card)}</div>
      </section>
      <section data-section="light">
        <div className="group theme-picker-head"><Icon name="theme" /><span>{t("themeLight")}</span></div>
        <div className="theme-grid">{group("light").map(card)}</div>
      </section>
    </div>
  );
}
