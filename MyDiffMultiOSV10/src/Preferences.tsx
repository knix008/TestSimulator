import { useState } from "react";
import { HEADER_PALETTE } from "../core/themes";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "../core/settings";
import { api, type Settings } from "./api";
import type { Translate } from "./i18n";

type Props = {
  t: Translate;
  settings: Settings;
  /** Applied live so the panes update while the dialog is open. */
  onPreview: (patch: Partial<Settings>) => void;
  onClose: (saved: boolean) => void;
  onError: (error: unknown) => void;
};

export function Preferences({ t, settings, onPreview, onClose, onError }: Props) {
  const [original] = useState(settings);
  const [draft, setDraft] = useState(settings);

  const change = (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onPreview(patch);
  };

  const save = async () => {
    try {
      await api.saveSettings({
        language: draft.language,
        theme: draft.theme,
        paneFontSize: draft.paneFontSize,
        wordWrap: draft.wordWrap,
        wordHighlight: draft.wordHighlight,
        leftHeaderColor: draft.leftHeaderColor,
        rightHeaderColor: draft.rightHeaderColor,
        excludes: draft.excludes,
        autoRefresh: draft.autoRefresh,
      });
      onClose(true);
    } catch (error) {
      onError(error);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) {
        onPreview(original);
        onClose(false);
      }
    }}>
      <div className="modal prefs" role="dialog" aria-label={t("prefTitle")}>
        <header className="modal-header">{t("prefTitle")}</header>
        <div className="modal-body">
          <label className="field">
            <span>{t("prefFontSize")}</span>
            <span className="row">
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={0.5}
                value={draft.paneFontSize}
                onChange={(event) => change({ paneFontSize: Number(event.target.value) })}
              />
              <output>{draft.paneFontSize.toFixed(1)}</output>
            </span>
          </label>

          <label className="field check">
            <input
              type="checkbox"
              checked={draft.wordWrap}
              onChange={(event) => change({ wordWrap: event.target.checked })}
            />
            <span>{t("prefWordWrap")}</span>
          </label>

          <label className="field check">
            <input
              type="checkbox"
              checked={draft.wordHighlight}
              onChange={(event) => change({ wordHighlight: event.target.checked })}
            />
            <span>{t("prefWordHighlight")}</span>
          </label>

          <label className="field check">
            <input
              type="checkbox"
              checked={draft.autoRefresh}
              onChange={(event) => change({ autoRefresh: event.target.checked })}
            />
            <span>{t("prefAutoRefresh")}</span>
          </label>

          <label className="field">
            <span>{t("prefLanguage")}</span>
            <select
              className="input"
              value={draft.language}
              onChange={(event) => change({ language: event.target.value as Settings["language"] })}
            >
              <option value="ko">{t("languageKorean")}</option>
              <option value="en">{t("languageEnglish")}</option>
            </select>
          </label>

          <label className="field">
            <span>{t("prefTheme")}</span>
            <select
              className="input"
              value={draft.theme}
              onChange={(event) => change({ theme: event.target.value as Settings["theme"] })}
            >
              <option value="light">{t("themeLight")}</option>
              <option value="dark">{t("themeDark")}</option>
            </select>
          </label>

          <div className="field">
            <span>{t("prefLeftHeader")}</span>
            <Swatches value={draft.leftHeaderColor} onPick={(color) => change({ leftHeaderColor: color })} />
          </div>

          <div className="field">
            <span>{t("prefRightHeader")}</span>
            <Swatches value={draft.rightHeaderColor} onPick={(color) => change({ rightHeaderColor: color })} />
          </div>

          <label className="field">
            <span>{t("prefExcludes")}</span>
            <input
              className="input"
              value={draft.excludes.join(", ")}
              onChange={(event) => change({
                excludes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
              })}
            />
          </label>

          <p className="field-note">{t("prefSettingsPath")}: <code>{settings.settingsPath}</code></p>
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="btn ghost"
            onClick={() => api.resetSettings().then((next) => {
              setDraft(next);
              onPreview(next);
            }).catch(onError)}
          >
            {t("prefReset")}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => {
            onPreview(original);
            onClose(false);
          }}>
            {t("cancel")}
          </button>
          <button type="button" className="btn primary" onClick={() => void save()}>{t("ok")}</button>
        </footer>
      </div>
    </div>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <span className="swatches">
      {HEADER_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch${value === color ? " is-active" : ""}`}
          style={{ background: color }}
          title={color}
          onClick={() => onPick(color)}
        />
      ))}
      <input
        type="color"
        className="swatch-custom"
        value={value}
        onChange={(event) => onPick(event.target.value)}
        title={value}
      />
    </span>
  );
}
