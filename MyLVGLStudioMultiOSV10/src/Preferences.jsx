// The settings window: general options, themes (with the user's own) and the start screen.
import { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { ColorField, IconSelect, Stepper, Toggle } from "./controls.jsx";
import { ConfirmDialog, Dialog, versionChoices } from "./dialogs.jsx";
import { host } from "./host.js";
import { DEVICES } from "./lvgl/schema.js";
import { THEME_COLOR_KEYS, THEMES, themeById } from "./themes.js";
import { MAX_CUSTOM_THEMES, SNAP_MAX, SNAP_MIN, customThemeFrom, DEFAULT_START_SCREEN, effectiveSpeed } from "./settings.js";
import { BackgroundGrid, StartRanges } from "./StartScreen.jsx";

function ThemeRow({ item, label, selected, onPick }) {
  return (
    <button type="button" data-pref-theme={item.id} className={selected ? "theme-row selected" : "theme-row"} aria-pressed={selected} title={label} onClick={() => onPick(item.id)}>
      <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
      <span className="menu-label">{label}</span>
    </button>
  );
}

function ThemeEditor({ t, theme, onChange, onDelete }) {
  return (
    <div className="theme-editor" data-theme-editor={theme.id}>
      <div className="form-grid">
        <span>{t("theme.name")}</span>
        <input className="text-input" data-field="themeName" value={theme.name} onChange={(event) => onChange({ name: event.target.value })} />
        <span>{t("theme.mode")}</span>
        <IconSelect id="themeMode" value={theme.mode} options={[{ value: "light", label: t("theme.light"), icon: "theme" }, { value: "dark", label: t("theme.dark"), icon: "theme" }]} onChange={(mode) => onChange({ mode })} />
        <div className="theme-colors">
          {THEME_COLOR_KEYS.map((key) => (
            <div className="theme-color-row" key={key}>
              <span title={t(`themeColor.${key}`)}>{t(`themeColor.${key}`)}</span>
              <ColorField id={`themeColor-${key}`} value={theme.colors[key]} onChange={(color) => color && onChange({ colors: { ...theme.colors, [key]: color } })} />
            </div>
          ))}
        </div>
      </div>
      <button type="button" data-command="theme-delete" onClick={onDelete}><Icon name="delete" /> {t("theme.delete")}</button>
    </div>
  );
}

/** Downloading again what has been downloaded, for when it has gone wrong. */
function DownloadsPage({ t, disabled, onAgainTools, onAgainLvgl }) {
  const [tools, setTools] = useState(null);
  const [versions, setVersions] = useState(null);
  const [packages, setPackages] = useState([]);
  const [asking, setAsking] = useState(null);
  useEffect(() => {
    host.nativeCheck().then(setTools);
    host.lvglInstalled().then((list) => setVersions([...list].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))));
    host.toolsItems().then((info) => setPackages(info.items)).catch(() => {});
  }, []);
  const askLvgl = async (version) => {
    const info = await host.lvglItem(version);
    setAsking({
      message: t("pref.againLvglAsk", { version, size: info.items[0].megabytes }),
      onYes: () => onAgainLvgl(version),
    });
  };
  const installed = !!tools?.gcc;
  return (
    <div className="pref-general" data-pref-downloads="">
      <p className="dialog-note">{t("pref.againNote")}</p>
      {tools?.local && (
        <section>
          <h4><Icon name="build" size={14} /> {t("pref.packages")}</h4>
          {packages.map((item) => {
            const name = t(`tools.item.${item.id}`);
            return (
              <div className="pref-row pref-package" key={item.id} data-again-row={item.id}>
                <span>
                  <b>{name}</b> ({item.megabytes} MB)
                  <small>{item.parts.map((part) => `${t(`tools.part.${part.id}`)} ${part.version}`).join(", ")}{installed ? "" : ` · ${t("pref.notInstalled")}`}</small>
                </span>
                <button type="button" data-again={`tools:${item.id}`} disabled={disabled} onClick={() => setAsking({ message: t(installed ? "pref.againToolsAsk" : "pref.getToolsAsk", { name, size: installed ? item.megabytes : packages.reduce((sum, each) => sum + each.megabytes, 0) }), onYes: () => onAgainTools(item.id) })}><Icon name="download" /> {t(installed ? "pref.again" : "pref.get")}</button>
              </div>
            );
          })}
        </section>
      )}
      <section>
        <h4><Icon name="manager" size={14} /> {t("tools.item.lvgl")}</h4>
        {versions && !versions.length && <p className="dialog-note" data-again-none="">{t("pref.noLvgl")}</p>}
        {versions?.map((item) => (
          <div className="pref-row" key={item.version} data-again-row={item.version}>
            <span>LVGL {item.version} ({(item.size / 1000000).toFixed(1)} MB)</span>
            <button type="button" data-again={`lvgl:${item.version}`} disabled={disabled} onClick={() => void askLvgl(item.version)}><Icon name="download" /> {t("pref.again")}</button>
          </div>
        ))}
      </section>
      {disabled && <p className="form-note" data-again-busy="">{t("pref.againBusy")}</p>}
      {asking && <ConfirmDialog t={t} icon="download" message={asking.message} yesLabel={t("pref.again")} onYes={asking.onYes} onNo={() => setAsking(null)} />}
    </div>
  );
}

export function PreferencesDialog({ t, downloading, onAgainTools, onAgainLvgl, initialTab, general, onGeneral, onStartTutorial, projectsDir, onProjectsDir, rulers, onRulers, recentCount, onClearRecent, language, onLanguage, themeId, onTheme, customThemes, onCustomThemes, start, onStart, onClose }) {
  const [tab, setTab] = useState(initialTab ?? "general");
  const [asking, setAsking] = useState(false);
  const label = (item) => (language === "en" ? item.nameEn : item.nameKo);
  const editing = customThemes.find((item) => item.id === themeId);

  const addTheme = () => {
    const item = customThemeFrom(themeId, `${t("theme.custom")} ${customThemes.length + 1}`, customThemes);
    onCustomThemes([...customThemes, item], item.id);
  };

  const editTheme = (patch) => {
    onCustomThemes(customThemes.map((item) => (item.id === editing.id ? { ...item, ...patch } : item)), editing.id);
  };

  const deleteTheme = () => {
    setAsking(false);
    const base = themeById(`${editing.mode}-${editing.mode === "dark" ? "midnight" : "classic"}`);
    onCustomThemes(customThemes.filter((item) => item.id !== editing.id), base.id);
  };

  const tabs = [
    { id: "general", icon: "settings", label: t("pref.general") },
    { id: "theme", icon: "theme", label: t("cmd.theme") },
    { id: "start", icon: "home", label: t("start.title") },
    { id: "downloads", icon: "download", label: t("pref.downloads") },
  ];

  return (
    <Dialog title={t("cmd.preferences").replace("…", "")} icon="settings" onClose={onClose} id="preferences" width={960} footer={<button type="button" className="primary" data-command="preferences-close" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
      <div className="pref-layout">
        <nav className="pref-tabs">
          {tabs.map((item) => (
            <button type="button" key={item.id} data-pref-tab={item.id} className={tab === item.id ? "active" : undefined} onClick={() => setTab(item.id)}><Icon name={item.icon} /> {item.label}</button>
          ))}
        </nav>
        <div className="pref-page" data-pref-page={tab}>
          {tab === "general" && (
            <div className="pref-general">
              <section>
                <h4><Icon name="language" size={14} /> {t("pref.startup")}</h4>
                <div className="form-grid">
                  <span>{t("cmd.language")}</span>
                  <IconSelect id="prefLanguage" value={language} options={[{ value: "ko", label: "한국어", icon: "language" }, { value: "en", label: "English", icon: "language" }]} onChange={onLanguage} />
                  <span>{t("start.showOnStartup")}</span>
                  <Toggle id="prefShowStart" checked={start.showOnStartup} onChange={(showOnStartup) => onStart({ showOnStartup })} />
                  <span>{t("pref.reopenLast")}</span>
                  <Toggle id="prefReopen" checked={general.reopenLast} onChange={(reopenLast) => onGeneral({ reopenLast })} />
                  <span>{t("pref.autoTools")}</span>
                  <Toggle id="prefAutoTools" checked={general.autoInstallTools} onChange={(autoInstallTools) => onGeneral({ autoInstallTools })} />
                  <span>{t("pref.askTutorial")}</span>
                  <div className="pref-tutorial">
                    <Toggle id="prefAskTutorial" checked={general.askTutorial} onChange={(askTutorial) => onGeneral({ askTutorial })} />
                    <button type="button" data-command="pref-tutorial" onClick={onStartTutorial}><Icon name="tutorial" /> {t("tutorial.start")}</button>
                  </div>
                </div>
              </section>
              <section>
                <h4><Icon name="new" size={14} /> {t("pref.newProject")}</h4>
                <div className="form-grid">
                  <span>{t("settings.version")}</span>
                  <IconSelect id="prefNewVersion" value={general.newVersion} options={versionChoices(t, [], general.newVersion)} onChange={(newVersion) => onGeneral({ newVersion })} />
                  <span>{t("settings.device")}</span>
                  <IconSelect id="prefNewDevice" value={general.newDevice} options={DEVICES.map((device) => ({ value: device.id, label: t(`device.${device.id}`), icon: "device" }))} onChange={(newDevice) => onGeneral({ newDevice })} />
                  <span>{t("project.location")}</span>
                  <div className="row">
                    <input className="text-input" data-field="prefLocation" value={projectsDir} placeholder={t("pref.locationHint")} onChange={(event) => onProjectsDir(event.target.value)} />
                    <button type="button" data-command="pref-browse" onClick={async () => {
                      const chosen = await host.pickFolder(projectsDir).catch(() => null);
                      if (chosen) onProjectsDir(chosen);
                    }}><Icon name="open" /> {t("project.browse")}</button>
                  </div>
                </div>
              </section>
              <section>
                <h4><Icon name="design" size={14} /> {t("pref.editor")}</h4>
                <div className="form-grid">
                  <span>{t("cmd.rulers")}</span>
                  <Toggle id="prefRulers" checked={rulers} onChange={onRulers} />
                  <span>{t("pref.snap")}</span>
                  <Stepper id="prefSnap" unit="px" value={general.snap} min={SNAP_MIN} max={SNAP_MAX} onChange={(snap) => onGeneral({ snap })} />
                </div>
              </section>
              <section>
                <h4><Icon name="clock" size={14} /> {t("start.recent")}</h4>
                <div className="pref-row">
                  <span>{t("pref.recentCount", { count: recentCount })}</span>
                  <button type="button" data-command="pref-clear-recent" disabled={recentCount === 0} onClick={onClearRecent}><Icon name="delete" /> {t("start.clearRecent")}</button>
                </div>
              </section>
            </div>
          )}
          {tab === "downloads" && <DownloadsPage t={t} disabled={downloading} onAgainTools={onAgainTools} onAgainLvgl={onAgainLvgl} />}
          {tab === "theme" && (
            <div className="pref-themes">
              <div className="theme-columns">
                {["light", "dark"].map((mode) => (
                  <section key={mode} data-theme-group={mode}>
                    <h4>{t(`theme.${mode}`)}</h4>
                    {THEMES.filter((item) => item.mode === mode).map((item) => (
                      <ThemeRow key={item.id} item={item} label={label(item)} selected={item.id === themeId} onPick={onTheme} />
                    ))}
                  </section>
                ))}
              </div>
              <section className="my-themes" data-theme-group="custom">
                <h4>{t("theme.mine")}</h4>
                <div className="my-themes-list">
                  {customThemes.map((item) => (
                    <ThemeRow key={item.id} item={{ ...item, swatch: [item.colors.bg, item.colors.panel, item.colors.accent] }} label={item.name} selected={item.id === themeId} onPick={onTheme} />
                  ))}
                </div>
                <button type="button" data-command="theme-add" disabled={customThemes.length >= MAX_CUSTOM_THEMES} onClick={addTheme}><Icon name="add" /> {t("theme.add")}</button>
                {editing ? <ThemeEditor t={t} theme={editing} onChange={editTheme} onDelete={() => setAsking(true)} /> : <p className="dialog-note">{t("theme.hint")}</p>}
              </section>
            </div>
          )}
          {tab === "start" && (
            <>
              <div className="form-grid">
                <span>{t("start.showOnStartup")}</span>
                <Toggle id="prefStartShow" checked={start.showOnStartup} onChange={(showOnStartup) => onStart({ showOnStartup })} />
              </div>
              <StartRanges t={t} start={start} speed={effectiveSpeed(start.speed, !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)} onChange={onStart} />
              <div className="pref-row pref-reset">
                <button type="button" data-command="start-layout-reset" disabled={!start.layout} onClick={() => onStart({ layout: null })}><Icon name="grid" /> {t("start.arrange")}</button>
                <button type="button" data-command="start-reset" onClick={() => onStart({ ...DEFAULT_START_SCREEN })}><Icon name="undo" /> {t("start.reset")}</button>
              </div>
              <h4>{t("start.background")}</h4>
              <BackgroundGrid t={t} value={start.background} themeId={themeId} onChange={(background) => onStart({ background })} shuffle={{ on: start.shuffle, onToggle: () => onStart({ shuffle: !start.shuffle }) }} />
            </>
          )}
        </div>
      </div>
      {asking && <ConfirmDialog t={t} message={t("theme.deleteAsk", { name: editing?.name ?? "" })} yesLabel={t("theme.delete")} onYes={deleteTheme} onNo={() => setAsking(false)} />}
    </Dialog>
  );
}
