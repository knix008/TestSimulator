// The project's fonts: TrueType and OpenType files read from disk, the face and language of each,
// and the font everything uses by default. The surface draws with them right away.
import { useState } from "react";
import { Dialog } from "./dialogs.jsx";
import { IconSelect, Stepper } from "./controls.jsx";
import { Icon } from "./icons.jsx";
import { FONT_SIZES } from "./lvgl/schema.js";
import { DEFAULT_FONT_SIZE } from "./lvgl/emit.js";
import { FONT_LANGUAGES, faceForLanguage, fontData, removeFontFromProject } from "./lvgl/fonts.js";

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function FontCard({ t, font, store, standard }) {
  const data = fontData(font.name);
  const edit = (change) => store.update((draft) => {
    const own = draft.fonts.find((item) => item.name === font.name);
    if (own) change(own);
  });
  if (!data) {
    return (
      <div className="font-card" data-font={font.name}>
        <div className="font-head"><Icon name="error" /><strong>{font.name}</strong><code>{font.file}</code></div>
        <p className="form-note">{t("font.fileGone", { file: font.file })}</p>
      </div>
    );
  }
  const { faces } = data.info;
  const face = faces[font.face] ?? faces[0];
  return (
    <div className="font-card" data-font={font.name} data-font-face={font.face}>
      <div className="font-head">
        <Icon name="fontFile" />
        <strong>{face.family}</strong>
        <span className="font-meta">{face.style}</span>
        {standard && <span className="font-standard" data-font-standard="">{t("font.isDefault")}</span>}
        <span className="font-meta font-file" title={font.file}>{font.file.split("/").pop()} · {megabytes(data.bytes.length)}</span>
        <button type="button" className="mini" data-font-remove={font.name} title={t("font.remove")} aria-label={t("font.remove")} onClick={() => store.update((draft) => removeFontFromProject(draft, font.name, FONT_SIZES))}><Icon name="delete" size={14} /></button>
      </div>
      <div className="font-fields">
        <span>{t("font.language")}</span>
        <IconSelect
          id={`font-language-${font.name}`}
          value={font.language ?? ""}
          options={[{ value: "", label: t("font.languageNone"), icon: "fontFile" }, ...FONT_LANGUAGES.map((language) => ({ value: language.id, label: t(`language.${language.id}`), icon: "fontFile", note: face.languages.includes(language.id) || faces.some((item) => item.languages.includes(language.id)) ? "" : t("font.notInFile") }))]}
          onChange={(language) => edit((own) => {
            if (language) {
              own.language = language;
              own.face = faceForLanguage(data.info, language, own.face);
            } else {
              delete own.language;
            }
          })}
        />
        {faces.length > 1 && (
          <>
            <span>{t("font.face")}</span>
            <IconSelect id={`font-face-${font.name}`} value={String(font.face)} options={faces.map((item) => ({ value: String(item.index), label: item.full, icon: "fontFile" }))} onChange={(next) => edit((own) => { own.face = Number(next); })} />
          </>
        )}
        <span>{t("font.covers")}</span>
        <div className="font-languages" data-font-covers={face.languages.join(",")}>
          {FONT_LANGUAGES.map((language) => {
            const has = face.languages.includes(language.id);
            return <span key={language.id} className={has ? "font-language on" : "font-language"} title={language.sample}><Icon name={has ? "check" : "close"} size={11} /> {t(`language.${language.id}`)}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

export function FontsDialog({ t, store, onImport, onClose }) {
  const project = store.project;
  const fonts = project.fonts ?? [];
  const [busy, setBusy] = useState(false);
  const standard = project.defaultFont;
  const add = async () => {
    setBusy(true);
    try {
      await onImport();
    } finally {
      setBusy(false);
    }
  };
  const setStandard = (change) => store.update((draft) => {
    const next = change(draft.defaultFont);
    if (next) draft.defaultFont = next;
    else delete draft.defaultFont;
  }, { coalesce: "font-default" });
  return (
    <Dialog
      title={t("font.title")}
      icon="fontFile"
      onClose={onClose}
      id="fonts"
      width={640}
      footer={<button type="button" className="primary" data-command="fonts-close" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}
    >
      <div className="fonts-window">
        <div className="font-default">
          <span>{t("font.default")}</span>
          <IconSelect
            id="fontDefault"
            value={standard?.font ?? ""}
            options={[{ value: "", label: t("font.builtin"), icon: "fontFile" }, ...fonts.map((font) => ({ value: font.name, label: fontData(font.name)?.info.faces[font.face]?.full ?? font.name, icon: "fontFile" }))]}
            onChange={(name) => setStandard((current) => (name ? { font: name, size: current?.size ?? DEFAULT_FONT_SIZE } : null))}
          />
          {standard && <Stepper id="fontDefaultSize" unit="px" value={standard.size} min={6} max={200} onChange={(size) => setStandard((current) => ({ ...current, size }))} />}
        </div>
        <p className="conf-note"><Icon name="info" size={14} /> {t("font.note")}</p>
        <div className="font-list" data-font-list="">
          {fonts.length === 0 && <p className="start-empty" data-font-empty="">{t("font.empty")}</p>}
          {fonts.map((font) => <FontCard key={font.name} t={t} font={font} store={store} standard={standard?.font === font.name} />)}
        </div>
        <button type="button" className="wide-button" data-command="font-add" disabled={busy} onClick={add}><Icon name="add" /> {t(busy ? "font.reading" : "font.add")}</button>
      </div>
    </Dialog>
  );
}
