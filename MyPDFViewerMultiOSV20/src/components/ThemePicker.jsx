import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconTrash } from './Icons.jsx';
import {
  DEFAULT_CUSTOM_COLORS, MAX_CUSTOM_THEMES, THEME_KINDS,
  normalizeCustomTheme, normalizeCustomThemes, newCustomThemeId,
  parseHex, pickerThemeFromCustom, themesByKind,
} from '../lib/themes.js';

function Swatch({ bars, small }) {
  return (
    <span className={`theme-swatch${small ? ' small' : ''}`}>
      {bars.map((c, i) => <i key={i} style={{ background: c }} />)}
    </span>
  );
}

function ThemeRow({ theme, current, onPick, label }) {
  return (
    <button
      className={`dd-item${current === theme.id ? ' active' : ''}`}
      onClick={() => onPick(theme.id)}
      title={label}
      role="option"
      aria-selected={current === theme.id}
    >
      <Swatch bars={theme.bars} small />
      <span className="dd-name wide">{label}</span>
    </button>
  );
}

// Two-column Dark / Light list used by the toolbar dropdown and the detached
// theme popup. Custom themes sit in a row under both columns when any exist.
export function ThemeMenu({ current, onPick, labelledBy, customThemes = [] }) {
  const { t } = useTranslation();
  const customs = normalizeCustomThemes(customThemes).map(pickerThemeFromCustom);
  return (
    <div className="theme-cols" role="listbox" aria-label={labelledBy || t('toolbar.theme')}>
      {THEME_KINDS.map((kind) => (
        <div key={kind} className="theme-col">
          <div className="theme-col-title">{t(kind === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}</div>
          <ul className="dd-list themes">
            {themesByKind(kind).map((th) => (
              <li key={th.id}>
                <ThemeRow theme={th} current={current} onPick={onPick} label={th.id} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {customs.length ? (
        <div className="theme-col custom">
          <div className="theme-col-title">{t('settings.themeCustom')}</div>
          <ul className="dd-list themes custom">
            {customs.map((th) => (
              <li key={th.id}>
                <ThemeRow theme={th} current={current} onPick={onPick} label={th.name} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// Classified chip grids for the settings window.
export function ThemeChipGroups({ current, onPick }) {
  const { t } = useTranslation();
  return (
    <div className="theme-groups">
      {THEME_KINDS.map((kind) => (
        <section key={kind} className="theme-group">
          <h5 className="theme-group-title">{t(kind === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}</h5>
          <div className="theme-grid kind">
            {themesByKind(kind).map((th) => (
              <button
                key={th.id}
                className={`theme-chip${current === th.id ? ' active' : ''}`}
                onClick={() => onPick(th.id)}
                title={th.id}
              >
                <Swatch bars={th.bars} />
                <span className="theme-name">{th.id}</span>
                {current === th.id ? <IconCheck size={13} /> : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const COLOR_FIELDS = [
  ['bg', 'settings.themeBg'],
  ['panel', 'settings.themePanel'],
  ['text', 'settings.themeText'],
  ['accent', 'settings.themeAccent'],
];

function toDraft(theme, fallbackName) {
  const next = normalizeCustomTheme({
    ...theme,
    name: theme?.name || fallbackName,
    kind: theme?.kind === 'light' ? 'light' : 'dark',
    colors: theme?.colors || DEFAULT_CUSTOM_COLORS[theme?.kind === 'light' ? 'light' : 'dark'],
  });
  return next;
}

// Compact create / edit panel for user-defined palettes.
export function CustomThemeEditor({ themes = [], current, onCommit }) {
  const { t } = useTranslation();
  const list = normalizeCustomThemes(themes);
  const [draft, setDraft] = useState(null);
  const fallbackName = t('settings.themeCustomName');

  const startAdd = () => {
    if (list.length >= MAX_CUSTOM_THEMES) return;
    setDraft(toDraft({
      id: newCustomThemeId(),
      name: fallbackName,
      kind: 'dark',
      colors: { ...DEFAULT_CUSTOM_COLORS.dark },
    }, fallbackName));
  };

  const save = () => {
    if (!draft) return;
    const next = normalizeCustomTheme({
      ...draft,
      name: draft.name.trim() || fallbackName,
    });
    if (!next) return;
    const exists = list.some((item) => item.id === next.id);
    if (!exists && list.length >= MAX_CUSTOM_THEMES) return;
    const customThemes = exists
      ? list.map((item) => (item.id === next.id ? next : item))
      : [...list, next];
    onCommit({ customThemes, theme: next.id });
    setDraft(null);
  };

  const remove = (id) => {
    const customThemes = list.filter((item) => item.id !== id);
    onCommit({ customThemes, theme: current === id ? 'dark' : current });
    if (draft?.id === id) setDraft(null);
  };

  const setColor = (key, value) => {
    const hex = parseHex(value);
    if (!hex) return;
    setDraft((prev) => (prev ? { ...prev, colors: { ...prev.colors, [key]: hex } } : prev));
  };

  return (
    <section className="sgroup">
      <div className="theme-custom-head">
        <h4>{t('settings.themeCustom')}</h4>
        <button
          type="button"
          className="btn"
          disabled={list.length >= MAX_CUSTOM_THEMES}
          onClick={startAdd}
          title={t('settings.themeAdd')}
        >
          {t('settings.themeAdd')}
        </button>
      </div>
      {list.length ? (
        <div className="theme-grid custom">
          {list.map((th) => {
            const pick = pickerThemeFromCustom(th);
            return (
              <div key={th.id} className={`theme-chip custom${current === th.id ? ' active' : ''}`}>
                <button
                  type="button"
                  className="theme-chip-pick"
                  onClick={() => {
                    onCommit({ theme: th.id });
                    setDraft({ ...th });
                  }}
                  title={th.name}
                >
                  <Swatch bars={pick.bars} />
                  <span className="theme-name">{th.name}</span>
                  {current === th.id ? <IconCheck size={13} /> : null}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => remove(th.id)}
                  title={t('settings.themeDelete')}
                  aria-label={t('settings.themeDelete')}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {draft ? (
        <div className="theme-editor">
          <label className="field">
            <span className="field-label">{t('settings.themeName')}</span>
            <input
              className="input"
              value={draft.name}
              maxLength={24}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="row seg-row seg-fill">
            {THEME_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`btn seg${draft.kind === kind ? ' active' : ''}`}
                onClick={() => setDraft({
                  ...draft,
                  kind,
                  colors: list.some((item) => item.id === draft.id)
                    ? draft.colors
                    : { ...DEFAULT_CUSTOM_COLORS[kind] },
                })}
              >
                {t(kind === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}
              </button>
            ))}
          </div>
          <div className="theme-colors">
            {COLOR_FIELDS.map(([key, label]) => (
              <label key={key} className="theme-color">
                <span>{t(label)}</span>
                <input
                  type="color"
                  value={draft.colors[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  title={t(label)}
                  aria-label={t(label)}
                />
              </label>
            ))}
          </div>
          <div className="theme-editor-actions">
            <button type="button" className="btn primary" onClick={save}>{t('settings.themeSave')}</button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>{t('settings.themeCancel')}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
