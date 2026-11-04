// Project settings, the LVGL manager, and the small confirm / about dialogs.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons.jsx";
import { ColorField, IconSelect, Stepper, Toggle } from "./controls.jsx";
import { host, isDesktop } from "./host.js";
import { BUNDLED_ENGINES, DEFAULT_VERSION, KNOWN_VERSIONS, engineFor, sortReleases } from "./lvgl/versions.js";
import { DEVICES } from "./lvgl/schema.js";
import { joinPath, removeImageFromProject, validProjectName } from "./lvgl/project.js";

export function Dialog({ title, icon, onClose, children, footer, width = 460, id }) {
  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="overlay-dim" role="dialog" aria-modal="true" aria-label={title} data-dialog={id}>
      <div className="dialog" style={{ width }}>
        <header>
          <strong className="dialog-title" data-dialog-title=""><Icon name={icon} /><span>{title}</span></strong>
          <button type="button" className="mini" aria-label="×" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ t, title, message, onYes, onNo, yesLabel }) {
  return (
    <Dialog
      title={title ?? t("dialog.confirm")}
      icon="about"
      onClose={onNo}
      id="confirm"
      width={420}
      footer={(
        <>
          <button type="button" className="primary" data-command="confirm-yes" onClick={onYes}>{yesLabel ?? t("dialog.ok")}</button>
          <button type="button" data-command="confirm-no" onClick={onNo}>{t("dialog.cancel")}</button>
        </>
      )}
    >
      <p className="dialog-message">{message}</p>
    </Dialog>
  );
}

export function MessageDialog({ t, title, message, onClose }) {
  return (
    <Dialog title={title} icon="about" onClose={onClose} id="message" width={420} footer={<button type="button" className="primary" onClick={onClose}>{t("dialog.ok")}</button>}>
      <p className="dialog-message">{message}</p>
    </Dialog>
  );
}

function platformName() {
  const text = navigator.userAgent;
  if (/Windows/i.test(text)) return "Windows";
  if (/Mac OS/i.test(text)) return "macOS";
  if (/Linux/i.test(text)) return "Linux";
  return navigator.platform || "-";
}

export function AboutDialog({ t, onClose, runtime, iconSource }) {
  const rows = [
    ["about.version", __APP_VERSION__],
    ["about.build", `${__BUILD_INFO__.date}${__BUILD_INFO__.commit ? ` (${__BUILD_INFO__.commit})` : ""}`],
    ["about.engine", runtime ? `LVGL ${runtime}` : "-"],
    ["about.versions", t("about.versionsValue", { engines: BUNDLED_ENGINES.join(", ") })],
    ["about.format", ".mylvgl"],
    ["about.tech", "Tauri 2, React, WebAssembly"],
    ["about.platform", platformName()],
    ["about.creator", "SHKWON(knix008@naver.com)"],
    ["about.license", "MIT. LVGL © LVGL Kft, MIT"],
  ];
  return (
    <Dialog title={t("about.window")} icon="about" onClose={onClose} id="about" width={520} footer={<button type="button" className="primary" onClick={onClose}>{t("dialog.close")}</button>}>
      <div className="about-body">
        <img className="about-icon" src={iconSource} alt="" />
        <div className="about-copy">
          <p className="about-name"><strong>My LVGL Studio</strong><span>{__APP_VERSION__}</span></p>
          <p>{t("about.text")}</p>
        </div>
        <dl className="about-meta">
          {rows.map(([key, value]) => (
            <div key={key} style={{ display: "contents" }} data-about={key}>
              <dt>{t(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}

/** Versions a project can choose: what is bundled, installed or known, newest first. */
function versionChoices(t, installed, current) {
  const set = sortReleases([...BUNDLED_ENGINES, ...KNOWN_VERSIONS, ...installed, current]);
  return set.map((value) => {
    const notes = [];
    if (installed.includes(value)) notes.push(t("version.installed"));
    if (BUNDLED_ENGINES.includes(value)) notes.push(t("version.engine"));
    return { value, label: `LVGL ${value}`, icon: "manager", note: notes.join(" · ") || t("version.notInstalled") };
  });
}

export function ProjectSettings({ t, store, onClose, onManager, installed }) {
  const project = store.project;
  const edit = (change, coalesce) => store.update(change, { coalesce: coalesce ? `settings:${coalesce}` : null });
  const engine = engineFor(project.lvgl);
  const deviceValue = DEVICES.find((device) => device.w === project.device.w && device.h === project.device.h)?.id ?? "custom";
  const deviceOptions = useMemo(() => [
    ...DEVICES.map((device) => ({ value: device.id, label: t(`device.${device.id}`), icon: "device" })),
    { value: "custom", label: t("device.custom"), icon: "device" },
  ], [t]);
  return (
    <Dialog title={t("settings.title")} icon="project" onClose={onClose} id="settings" width={500} footer={<button type="button" className="primary" data-command="settings-close" onClick={onClose}>{t("dialog.close")}</button>}>
      <div className="form-grid">
        <span>{t("settings.name")}</span>
        <input className="text-input" data-field="projectName" value={project.name} onChange={(event) => edit((draft) => { draft.name = event.target.value; }, "name")} />
        <span>{t("settings.version")}</span>
        <div className="row">
          <IconSelect id="lvglVersion" value={project.lvgl} options={versionChoices(t, installed, project.lvgl)} onChange={(version) => edit((draft) => { draft.lvgl = version; })} />
          <button type="button" data-command="open-manager" onClick={onManager}><Icon name="manager" /> {t("settings.manage")}</button>
        </div>
        {!engine.exact && <p className="form-note" data-note="engine">{t("settings.engineNote", { engine: engine.engine, version: project.lvgl })}</p>}
        <span>{t("settings.device")}</span>
        <IconSelect
          id="device"
          value={deviceValue}
          options={deviceOptions}
          onChange={(id) => {
            const device = DEVICES.find((item) => item.id === id);
            if (device) edit((draft) => { draft.device = { w: device.w, h: device.h }; });
          }}
        />
        <span>{t("settings.width")}</span>
        <Stepper id="deviceW" unit="px" value={project.device.w} min={32} max={4096} onChange={(w) => edit((draft) => { draft.device.w = w; }, "w")} />
        <span>{t("settings.height")}</span>
        <Stepper id="deviceH" unit="px" value={project.device.h} min={32} max={4096} onChange={(h) => edit((draft) => { draft.device.h = h; }, "h")} />
        <span>{t("image.title")}</span>
        <div className="image-list" data-images="">
          {(project.images ?? []).length === 0 && <span className="start-empty">{t("image.empty")}</span>}
          {(project.images ?? []).map((image) => (
            <div className="image-row" key={image.name} data-image={image.name}>
              <Icon name="image" />
              <span title={image.file}>{image.name}</span>
              <span>{image.w}×{image.h}</span>
              <button type="button" className="mini" title={t("image.remove")} aria-label={t("image.remove")} data-image-remove={image.name} onClick={() => edit((draft) => removeImageFromProject(draft, image.name))}><Icon name="delete" size={13} /></button>
            </div>
          ))}
        </div>
        <span>{t("settings.dark")}</span>
        <Toggle id="themeDark" checked={project.theme.dark} onChange={(dark) => edit((draft) => { draft.theme.dark = dark; })} />
        <span>{t("settings.primary")}</span>
        <ColorField id="themePrimary" value={project.theme.primary} onChange={(primary) => primary && edit((draft) => { draft.theme.primary = primary; }, "primary")} />
        <span>{t("settings.secondary")}</span>
        <ColorField id="themeSecondary" value={project.theme.secondary} onChange={(secondary) => secondary && edit((draft) => { draft.theme.secondary = secondary; }, "secondary")} />
      </div>
    </Dialog>
  );
}

/**
 * New Project, and the first save of a project: name and location decide the project folder.
 * `saveOnly` hides the choices the open project has already made.
 */
export function NewProjectDialog({ t, saveOnly, initialName, initialLocation, installed, onCreate, onClose }) {
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const nameOk = validProjectName(name);
  const ready = nameOk && location.trim() !== "" && !busy;
  const folder = location.trim() && nameOk ? joinPath(location.trim(), name) : "";
  const browse = async () => {
    const chosen = await host.pickFolder(location).catch(() => null);
    if (chosen) setLocation(chosen);
  };
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const device = DEVICES.find((item) => item.id === deviceId);
      await onCreate({ name, folder, location: location.trim(), version, device: { w: device.w, h: device.h } });
    } catch (failure) {
      setError(String(failure?.message ?? failure));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t(saveOnly ? "cmd.saveAs" : "cmd.new")}
      icon={saveOnly ? "save" : "new"}
      onClose={onClose}
      id="new-project"
      width={540}
      footer={(
        <>
          <button type="button" className="primary" data-command="project-create" disabled={!ready} onClick={submit}>{t(saveOnly ? "cmd.save" : "project.create")}</button>
          <button type="button" onClick={onClose}>{t("dialog.cancel")}</button>
        </>
      )}
    >
      <div className="form-grid">
        <span>{t("settings.name")}</span>
        <input className="text-input" data-field="newName" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        {!nameOk && name !== "" && <p className="form-note">{t("project.badName")}</p>}
        <span>{t("project.location")}</span>
        <div className="row">
          <input className="text-input" data-field="newLocation" value={location} onChange={(event) => setLocation(event.target.value)} />
          <button type="button" onClick={browse}><Icon name="open" /> {t("project.browse")}</button>
        </div>
        <span>{t("project.folder")}</span>
        <code className="path-preview" data-field="newFolder">{folder || "-"}</code>
        {!saveOnly && (
          <>
            <span>{t("settings.version")}</span>
            <IconSelect id="newVersion" value={version} options={versionChoices(t, installed, version)} onChange={setVersion} />
            <span>{t("settings.device")}</span>
            <IconSelect id="newDevice" value={deviceId} options={DEVICES.map((device) => ({ value: device.id, label: t(`device.${device.id}`), icon: "device" }))} onChange={setDeviceId} />
          </>
        )}
        {error && <p className="form-note" data-note="project-error">{error}</p>}
      </div>
    </Dialog>
  );
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

export function LvglManager({ t, onClose, onInstalledChange, autoInstall }) {
  const [installed, setInstalled] = useState([]);
  const [releases, setReleases] = useState(null);
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState({});
  const [errors, setErrors] = useState({});
  const [tools, setTools] = useState(null);
  const [asking, setAsking] = useState(null);
  const [toolPlan, setToolPlan] = useState(null);
  const [installingTools, setInstallingTools] = useState(false);
  const [toolOutput, setToolOutput] = useState("");

  useEffect(() => {
    const offLog = host.on("native-log", ({ line }) => setToolOutput(line));
    const offExit = host.on("tools-exit", ({ ok, error }) => {
      setInstallingTools(false);
      setToolOutput(ok ? t("manager.toolsDone") : error);
      host.nativeCheck().then(setTools);
    });
    return () => {
      offLog();
      offExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askInstallTools = async () => setToolPlan(await host.toolsPlan());
  const installTools = async () => {
    setToolPlan(null);
    setInstallingTools(true);
    setToolOutput("");
    try {
      await host.toolsInstall();
    } catch (error) {
      setInstallingTools(false);
      setToolOutput(String(error));
    }
  };

  const refresh = async () => {
    const list = await host.lvglInstalled();
    setInstalled(list);
    onInstalledChange?.(list.map((item) => item.version));
  };

  useEffect(() => {
    void refresh();
    host.lvglReleases().then((tags) => setReleases(sortReleases(tags))).catch(() => {
      setOffline(true);
      setReleases(sortReleases(KNOWN_VERSIONS));
    });
    host.nativeCheck().then(setTools);
    return host.on("lvgl-progress", (payload) => setProgress((state) => ({ ...state, [payload.version]: payload })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async (version) => {
    setErrors((state) => ({ ...state, [version]: null }));
    setProgress((state) => ({ ...state, [version]: { phase: "download", received: 0, total: 0 } }));
    try {
      await host.lvglInstall(version);
    } catch (error) {
      setErrors((state) => ({ ...state, [version]: String(error) }));
    }
    setProgress((state) => ({ ...state, [version]: null }));
    await refresh();
  };

  useEffect(() => {
    if (autoInstall) void install(autoInstall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInstall]);

  const remove = async (version) => {
    setAsking(null);
    try {
      await host.lvglRemove(version);
    } catch (error) {
      setErrors((state) => ({ ...state, [version]: String(error) }));
    }
    await refresh();
  };

  const stateOf = (version) => {
    const job = progress[version];
    if (job && job.phase !== "done") {
      if (job.phase === "extract") return t("manager.extracting");
      const percent = job.total ? `${Math.round((job.received / job.total) * 100)}%` : megabytes(job.received);
      return t("manager.downloading", { percent });
    }
    if (errors[version]) return errors[version];
    return installed.some((item) => item.version === version) ? t("version.installed") : t("version.notInstalled");
  };

  const versions = useMemo(() => sortReleases([...(releases ?? KNOWN_VERSIONS), ...installed.map((item) => item.version), ...BUNDLED_ENGINES]), [releases, installed]);

  return (
    <Dialog title={t("manager.title")} icon="manager" onClose={onClose} id="manager" width={640} footer={<button type="button" className="primary" onClick={onClose}>{t("dialog.close")}</button>}>
      <p className="dialog-note">{t("manager.intro")}</p>
      {!isDesktop && <p className="form-note">{t("native.desktopOnly")}</p>}
      {offline && <p className="form-note" data-note="offline">{t("manager.offline")}</p>}
      <div className="manager-table" data-manager="">
        <div className="manager-row head">
          <span>{t("manager.version")}</span><span>{t("manager.state")}</span><span>{t("manager.size")}</span><span />
        </div>
        {versions.map((version) => {
          const item = installed.find((entry) => entry.version === version);
          const busy = progress[version] && progress[version].phase !== "done";
          return (
            <div className="manager-row" key={version} data-version={version}>
              <span className="manager-version">
                <Icon name="manager" /> {version}
                {BUNDLED_ENGINES.includes(version) && <em>{t("version.engine")}</em>}
              </span>
              <span className={errors[version] ? "manager-state error" : "manager-state"} title={stateOf(version)}>{stateOf(version)}</span>
              <span>{item ? megabytes(item.size) : ""}</span>
              <span className="manager-action">
                {item ? (
                  <button type="button" data-action="remove" disabled={busy} onClick={() => setAsking(version)}><Icon name="delete" /> {t("manager.remove")}</button>
                ) : (
                  <button type="button" data-action="install" disabled={busy || !isDesktop} onClick={() => install(version)}><Icon name="manager" /> {t("manager.install")}</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {tools && (
        <div className="tool-check" data-tools="">
          <strong>{t("manager.tools")}</strong>
          {["gcc", "cmake", "ninja"].map((tool) => (
            <span key={tool} className={tools[tool] ? "ok" : "bad"} title={tools[tool] ?? ""}>{tool}: {tools[tool] ? tools[tool].replace(/^.*?(\d+\.\d+[.\d]*).*$/, "$1") : t("manager.toolMissing")}</span>
          ))}
          <span className={tools.sdl ? "ok" : "bad"}>SDL2: {tools.sdl ? t("manager.sdlFound") : t("manager.toolMissing")}</span>
        </div>
      )}
      {tools && (
        <div className="tools-row">
          <span className="dialog-note" style={{ margin: 0 }}>{t(tools.gcc && tools.cmake && tools.ninja && tools.sdl ? "manager.toolsReady" : "manager.toolsMissing")}</span>
          <button type="button" data-action="install-tools" disabled={!isDesktop || installingTools || !!(tools.gcc && tools.cmake && tools.ninja && tools.sdl)} onClick={askInstallTools}><Icon name="build" /> {t("manager.installTools")}</button>
        </div>
      )}
      {toolOutput && <p className="tools-output" data-tools-output="" title={toolOutput}>{toolOutput}</p>}
      {toolPlan && <ConfirmDialog t={t} message={`${t("manager.toolsAsk")}\n\n${toolPlan.join("\n")}`} yesLabel={t("manager.installTools")} onYes={installTools} onNo={() => setToolPlan(null)} />}
      {asking && <ConfirmDialog t={t} message={t("manager.removeAsk", { version: asking })} yesLabel={t("manager.remove")} onYes={() => remove(asking)} onNo={() => setAsking(null)} />}
    </Dialog>
  );
}
