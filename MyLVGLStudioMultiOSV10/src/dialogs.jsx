// Project settings, the LVGL manager, and the small confirm / about dialogs.
import { clockWords, megabytes as wholeMegabytes, timeWords } from "./toolsProgress.js";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canPopOut, fitPopout, openPopout, sizePopout } from "./popout.js";
import { Icon } from "./icons.jsx";
import { ColorField, GripDots, IconSelect, Stepper, Toggle } from "./controls.jsx";
import { host, isDesktop } from "./host.js";
import { BUNDLED_ENGINES, DEFAULT_VERSION, KNOWN_VERSIONS, engineFor, sortReleases } from "./lvgl/versions.js";
import { DEVICES, normalDevice, sameDevice } from "./lvgl/schema.js";
import { joinPath, removeImageFromProject, validProjectName } from "./lvgl/project.js";

// The window a dialog is in, for what goes in its title bar.
const PopContext = createContext(null);

/** Minimize, a maximize that cannot be used, and close, for a dialog with a bar of its own. */
export function WindowButtons({ t, onClose }) {
  const pop = useContext(PopContext);
  return (
    <div className="window-controls" data-window-buttons="">
      {pop?.standsFree && (
        <>
          <button type="button" data-command="window-minimize" aria-label={t("cmd.minimize")} title={t("cmd.minimize")} onClick={() => void host.popoutMinimize(pop.label)}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
          <button type="button" data-command="window-maximize" aria-label={t("cmd.maximize")} title={t("cmd.maximize")} disabled><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
        </>
      )}
      <button type="button" className="close" data-command="window-close" aria-label={t("cmd.close")} title={t("cmd.close")} onClick={onClose}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
    </div>
  );
}

function DialogPanel({ title, icon, onClose, children, footer, width, panel, bare, grip }) {
  return (
    <div className="dialog" ref={panel} style={{ width }}>
      {!bare && (
        <header>
          <strong className="dialog-title" data-dialog-title=""><Icon name={icon} /><span>{title}</span></strong>
          <button type="button" className="mini" aria-label="×" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
      )}
      <div className="dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
      {grip}
    </div>
  );
}

/** The dialog in a window of its own, which can go anywhere, also outside the program. */
function WindowDialog({ pop, onClose, id, height, ...rest }) {
  const panel = useRef(null);
  const closing = useRef(onClose);
  closing.current = onClose;

  // Sized to the dialog once it has laid out, then shown; later it follows the content. One that
  // stands free has the size it is given, and then the size the user gives it.
  useEffect(() => {
    if (pop.standsFree) {
      const first = setTimeout(() => void sizePopout(pop, { width: rest.width, height }), 60);
      return () => clearTimeout(first);
    }
    let last = "";
    const key = () => {
      const box = panel.current?.getBoundingClientRect();
      return box ? `${Math.ceil(box.width)}x${Math.ceil(box.height)}` : "";
    };
    let shown = false;
    const first = setTimeout(() => {
      if (!panel.current) return;
      last = key();
      shown = true;
      void fitPopout(pop, panel.current);
    }, 60);
    const Observer = pop.win.ResizeObserver ?? ResizeObserver;
    const follow = new Observer(() => {
      if (!shown || !panel.current || key() === last) return;
      last = key();
      void fitPopout(pop, panel.current, { resizeOnly: true });
    });
    if (panel.current) follow.observe(panel.current);
    return () => {
      clearTimeout(first);
      follow.disconnect();
    };
    // Its size is read once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);

  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") closing.current();
    };
    pop.win.addEventListener("keydown", key);
    return () => pop.win.removeEventListener("keydown", key);
  }, [pop]);

  // The title bar moves the window, or the bar of a dialog that has its title in it.
  const onDragDown = (event) => {
    if (event.button !== 0 || !event.target.closest(".dialog > header, [data-window-drag]")) return;
    if (!event.target.closest("button, input, select, textarea, a")) void host.popoutDrag(pop.label);
  };
  return createPortal(
    <div
      data-dialog={id}
      role="dialog"
      aria-modal="true"
      aria-label={rest.title}
      onPointerDown={onDragDown}
      onContextMenu={(event) => {
        // The app's own right-click menu belongs to the main window.
        event.stopPropagation();
        if (!event.target.closest("input, textarea")) event.preventDefault();
      }}
    >
      <PopContext.Provider value={pop}>
        <DialogPanel
          {...rest}
          onClose={onClose}
          panel={panel}
          grip={pop.standsFree && (
            <button type="button" className="grip dialog-grip" aria-label="resize" onPointerDown={(event) => { event.preventDefault(); void host.popoutResize(pop.label); }}>
              <GripDots />
            </button>
          )}
        />
      </PopContext.Provider>
    </div>,
    pop.root,
  );
}

function InlineDialog({ id, onClose, ...rest }) {
  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="overlay-dim" role="dialog" aria-modal="true" aria-label={rest.title} data-dialog={id}>
      <DialogPanel {...rest} onClose={onClose} />
    </div>
  );
}

export function Dialog({ title, icon, onClose, children, footer, width = 460, id, bare = false, standsFree = false, height }) {
  // undefined: the window is being opened. null: no window, so inside the page.
  const [pop, setPop] = useState(canPopOut() ? undefined : null);
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    if (!canPopOut()) return undefined;
    const opened = openPopout(id, title, typeof width === "number" ? width : 460, { standsFree });
    if (!opened) {
      setPop(null);
      return undefined;
    }
    setPop(opened);
    let ours = true;
    // Alt+F4 or anything else closed the window: the dialog ends with it.
    const off = host.on("popout-closed", (label) => {
      if (ours && label === opened.label) closing.current();
    });
    return () => {
      ours = false;
      off?.();
      opened.stop();
      void host.popoutClose(opened.label).catch(() => {});
    };
    // The window lives as long as the dialog; its size and title are read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (pop) pop.win.document.title = title;
  }, [pop, title]);
  const props = { title, icon, onClose, footer, width, id, bare };
  if (pop === undefined) return null;
  if (pop === null) return <InlineDialog {...props}>{children}</InlineDialog>;
  return <WindowDialog pop={pop} height={height} {...props}>{children}</WindowDialog>;
}

/** Asked before unsaved work would be lost: keep it, let it go, or stay where you are. */
export function UnsavedDialog({ t, name, onSave, onDiscard, onCancel }) {
  return (
    <Dialog
      title={t("dialog.confirm")}
      icon="save"
      onClose={onCancel}
      id="unsaved"
      width={460}
      footer={(
        <>
          <button type="button" className="primary" data-command="unsaved-save" onClick={onSave}><Icon name="save" size={14} /> {t("cmd.save")}</button>
          <button type="button" data-command="unsaved-discard" onClick={onDiscard}><Icon name="delete" size={14} /> {t("dialog.dontSave")}</button>
          <button type="button" data-command="unsaved-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t("dialog.cancel")}</button>
        </>
      )}
    >
      <p className="dialog-message">{t("dialog.unsaved", { name })}</p>
    </Dialog>
  );
}

export function ConfirmDialog({ t, title, message, onYes, onNo, yesLabel, icon = "about" }) {
  return (
    <Dialog
      title={title ?? t("dialog.confirm")}
      icon={icon}
      onClose={onNo}
      id="confirm"
      width={420}
      footer={(
        <>
          <button type="button" className="primary" data-command="confirm-yes" onClick={onYes}><Icon name="check" size={14} /> {yesLabel ?? t("dialog.ok")}</button>
          <button type="button" data-command="confirm-no" onClick={onNo}><Icon name="close" size={14} /> {t("dialog.cancel")}</button>
        </>
      )}
    >
      <p className="dialog-message">{message}</p>
    </Dialog>
  );
}

export function MessageDialog({ t, title, message, onClose }) {
  return (
    <Dialog title={title} icon="about" onClose={onClose} id="message" width={420} footer={<button type="button" className="primary" onClick={onClose}><Icon name="check" size={14} /> {t("dialog.ok")}</button>}>
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
    <Dialog title={t("about.window")} icon="about" onClose={onClose} id="about" width={520} footer={<button type="button" className="primary" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
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

/** The samples shipped with the app: their list and where they are. */
export function useSamples() {
  const [samples, setSamples] = useState({ dir: "", items: [] });
  useEffect(() => {
    host.samplesList().then(setSamples).catch(() => {});
  }, []);
  return samples;
}

export function SamplesDialog({ t, language, onOpen, onClose }) {
  const { dir, items } = useSamples();
  return (
    <Dialog title={t("samples.title")} icon="samples" onClose={onClose} id="samples" width={560} footer={<button type="button" className="primary" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
      {items.length === 0 && <p className="dialog-note">{t("samples.empty")}</p>}
      <div className="samples-list">
        {items.map((sample) => (
          <button type="button" key={sample.id} data-sample={sample.id} title={`LVGL ${sample.lvgl}`} onClick={() => onOpen(sample, dir)}>
            <Icon name={sample.icon} />
            <b>{sample[language]?.[0] ?? sample.id}</b>
            <small>{sample[language]?.[1]} · LVGL {sample.lvgl}</small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Versions a project can choose: what is bundled, installed or known, newest first. */
export function versionChoices(t, installed, current) {
  const set = sortReleases([...BUNDLED_ENGINES, ...KNOWN_VERSIONS, ...installed, current]);
  return set.map((value) => {
    const notes = [];
    if (installed.includes(value)) notes.push(t("version.installed"));
    if (BUNDLED_ENGINES.includes(value)) notes.push(t("version.engine"));
    return { value, label: `LVGL ${value}`, icon: "manager", note: notes.join(" · ") || t("version.notInstalled") };
  });
}

export function ProjectSettings({ t, store, onClose, onManager, onVersion, onConf, onFonts, installed }) {
  const project = store.project;
  const edit = (change, coalesce) => store.update(change, { coalesce: coalesce ? `settings:${coalesce}` : null });
  const engine = engineFor(project.lvgl);
  const deviceValue = DEVICES.find((device) => sameDevice(device, project.device))?.id ?? "custom";
  const round = project.device.shape === "round";
  const deviceOptions = useMemo(() => [
    ...DEVICES.map((device) => ({ value: device.id, label: t(`device.${device.id}`), icon: "device" })),
    { value: "custom", label: t("device.custom"), icon: "device" },
  ], [t]);
  return (
    <Dialog title={t("settings.title")} icon="project" onClose={onClose} id="settings" width={500} footer={<button type="button" className="primary" data-command="settings-close" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
      <div className="form-grid">
        <span>{t("settings.name")}</span>
        <input className="text-input" data-field="projectName" value={project.name} onChange={(event) => edit((draft) => { draft.name = event.target.value; }, "name")} />
        <span>{t("settings.version")}</span>
        <div className="row">
          <IconSelect id="lvglVersion" value={project.lvgl} options={versionChoices(t, installed, project.lvgl)} onChange={onVersion} />
          <button type="button" data-command="open-manager" onClick={onManager}><Icon name="manager" /> {t("settings.manage")}</button>
        </div>
        <span>{t("font.short")}</span>
        <button type="button" data-command="open-fonts" onClick={onFonts}><Icon name="fontFile" /> {t("cmd.fonts")}</button>
        <span>{t("conf.short")}</span>
        <button type="button" data-command="open-lvconf" onClick={onConf}><Icon name="conf" /> {t("cmd.lvConf")}</button>
        {!engine.exact && <p className="form-note" data-note="engine">{t("settings.engineNote", { engine: engine.engine, version: project.lvgl })}</p>}
        <span>{t("settings.device")}</span>
        <IconSelect
          id="device"
          value={deviceValue}
          options={deviceOptions}
          onChange={(id) => {
            const device = DEVICES.find((item) => item.id === id);
            if (device) edit((draft) => { draft.device = normalDevice(device); });
          }}
        />
        <span>{t("settings.width")}</span>
        <Stepper id="deviceW" unit="px" value={project.device.w} min={32} max={4096} onChange={(w) => edit((draft) => { draft.device = normalDevice({ ...draft.device, w }); }, "w")} />
        <span>{t("settings.height")}</span>
        <Stepper id="deviceH" unit="px" value={project.device.h} min={32} max={4096} onChange={(h) => edit((draft) => { draft.device = normalDevice(round ? { ...draft.device, w: h } : { ...draft.device, h }); }, "h")} />
        <span>{t("device.roundToggle")}</span>
        <Toggle id="deviceRound" checked={round} onChange={(on) => edit((draft) => {
          const side = Math.min(draft.device.w, draft.device.h);
          draft.device = on ? normalDevice({ w: side, h: side, shape: "round" }) : { w: draft.device.w, h: draft.device.h };
        })} />
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
export function NewProjectDialog({ t, saveOnly, initialName, initialLocation, initialVersion, initialDevice, installed, onCreate, onClose }) {
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [version, setVersion] = useState(initialVersion ?? DEFAULT_VERSION);
  const [deviceId, setDeviceId] = useState(initialDevice ?? DEVICES[0].id);
  const [customSize, setCustomSize] = useState({ w: 320, h: 240 });
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
      const device = DEVICES.find((item) => item.id === deviceId) ?? customSize;
      await onCreate({ name, folder, location: location.trim(), version, device: normalDevice(device) });
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
          <button type="button" className="primary" data-command="project-create" disabled={!ready} onClick={submit}><Icon name={saveOnly ? "save" : "new"} size={14} /> {t(saveOnly ? "cmd.save" : "project.create")}</button>
          <button type="button" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.cancel")}</button>
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
            <IconSelect id="newDevice" value={deviceId} options={[...DEVICES.map((device) => ({ value: device.id, label: t(`device.${device.id}`), icon: "device" })), { value: "custom", label: t("device.custom"), icon: "device" }]} onChange={setDeviceId} />
            {deviceId === "custom" && (
              <>
                <span>{t("settings.width")}</span>
                <Stepper id="newDeviceW" unit="px" value={customSize.w} min={32} max={4096} onChange={(w) => setCustomSize((size) => ({ ...size, w }))} />
                <span>{t("settings.height")}</span>
                <Stepper id="newDeviceH" unit="px" value={customSize.h} min={32} max={4096} onChange={(h) => setCustomSize((size) => ({ ...size, h }))} />
              </>
            )}
          </>
        )}
        {error && <p className="form-note" data-note="project-error">{error}</p>}
      </div>
    </Dialog>
  );
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/** The compiler's installation: what is coming, what it is for, how far it is, how long is left. */
export function ToolsProgress({ t, id = "tools-progress", title, intro, job, onHide, onCancel, onRetry }) {
  const failed = job.status === "failed";
  const left = timeWords(t, job.seconds);
  const stateOf = (item) => {
    if (item.state === "download") return t(item.exact ? "tools.downloading" : "tools.downloadingAbout", { received: wholeMegabytes(item.received), total: wholeMegabytes(item.bytes) });
    if (item.state === "unpack") return t("tools.unpacking", { percent: Math.floor(item.unpacked * 100) });
    return t(item.state === "done" ? "tools.done" : "tools.waiting");
  };
  return (
    <Dialog
      title={title ?? t("tools.title")}
      icon="download"
      id={id}
      width={600}
      height={job.items.length > 1 ? 520 : job.items[0].parts.length > 1 ? 440 : 400}
      standsFree
      onClose={onHide}
      footer={failed ? (
        <>
          <button type="button" className="primary" data-command="tools-retry" onClick={onRetry}><Icon name="download" /> {t("tools.retry")}</button>
          <button type="button" data-command="tools-hide" onClick={onHide}><Icon name="close" size={14} /> {t("dialog.close")}</button>
        </>
      ) : (
        <>
          <button type="button" data-command="tools-hide" onClick={onHide}><Icon name="collapseDown" size={14} /> {t("tools.hide")}</button>
          <button type="button" data-command="tools-cancel" disabled={job.cancelling} onClick={onCancel}><Icon name="close" size={14} /> {t(job.cancelling ? "tools.cancelling" : "dialog.cancel")}</button>
        </>
      )}
    >
      <div className="tools-progress" data-tools-progress="">
        <p className="dialog-message">{intro ?? t("tools.intro")}</p>
        <ul className="tools-items">
          {job.items.map((item) => (
            <li key={item.id} className={item.state === "done" ? "done" : undefined} data-tools-item={item.id} data-state={item.state}>
              <div className="tools-item-head">
                {item.state === "download" || item.state === "unpack" ? <i className="tools-spinner" data-tools-spinner="" /> : <Icon name={item.state === "done" ? "check" : "clock"} size={14} />}
                <strong>{t(`tools.item.${item.id}`)}</strong>
                <span className="tools-item-state" data-tools-state="">{stateOf(item)}</span>
              </div>
              <div className={item.state === "download" || item.state === "unpack" ? "tools-bar active" : "tools-bar"}><i style={{ width: `${item.state === "done" ? 100 : (item.state === "unpack" ? item.unpacked : item.received / item.bytes) * 100}%` }} /></div>
              <ul className="tools-parts">
                {item.parts.map((part) => <li key={part.id} data-tools-part={part.id}><b>{t(`tools.part.${part.id}`)} {part.version}</b> <span>{t(`tools.role.${part.id}`)}</span></li>)}
              </ul>
            </li>
          ))}
        </ul>
        <div className="tools-overall">
          <strong data-tools-percent="">{job.percent}%</strong>
          <div className="tools-bar"><i style={{ width: `${job.percent}%` }} /></div>
        </div>
        {failed ? (
          <p className="form-note" data-tools-error="">{t("tools.failed", { error: job.error })}</p>
        ) : (
          <p className="tools-time" data-tools-time="">
            <b data-tools-status="">{job.cancelling ? t("tools.cancelling") : job.stalled ? t("tools.stalled") : job.percent >= 100 ? t("tools.finishing") : left ? t("tools.remaining", { time: left }) : t("tools.calculating")}</b>
            <span data-tools-elapsed="">{t("tools.elapsed", { time: clockWords(job.elapsed) })}</span>
            <span>{t(job.items.every((item) => item.exact) ? "tools.amount" : "tools.amountAbout", { received: wholeMegabytes(job.received), total: wholeMegabytes(job.bytes) })}</span>
            {job.speed > 0 && job.items.some((item) => item.state === "download") && <span>{(job.speed / 1000000).toFixed(1)} MB/s</span>}
          </p>
        )}
        <p className="tools-place" data-tools-place="" title={job.dir}>{t(job.installedMegabytes ? "tools.place" : "tools.placeOnly", { dir: job.dir, size: job.installedMegabytes })}</p>
      </div>
    </Dialog>
  );
}

export function LvglManager({ t, onClose, onInstalledChange, toolsBusy, onInstallLocal, onInstallLvgl, lvglBusy }) {
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
      setToolOutput(ok ? t("manager.toolsDone") : error === "stopped" ? "" : error);
      host.nativeCheck().then(setTools);
    });
    return () => {
      offLog();
      offExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app's own compiler has its progress window, which also says what comes; the system's asks first.
  const askInstallTools = async () => {
    if (tools?.local) void onInstallLocal?.();
    else setToolPlan(await host.toolsPlan());
  };
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
    const result = await onInstallLvgl(version);
    if (!result.ok && result.error !== "stopped") setErrors((state) => ({ ...state, [version]: result.error }));
    setProgress((state) => ({ ...state, [version]: null }));
    await refresh();
  };

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
    <Dialog title={t("manager.title")} icon="manager" onClose={onClose} id="manager" width={640} footer={<button type="button" className="primary" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
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
                  <button type="button" data-action="install" disabled={busy || lvglBusy || !isDesktop} onClick={() => install(version)}><Icon name="manager" /> {t("manager.install")}</button>
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
          <button type="button" data-action="install-tools" disabled={!isDesktop || installingTools || toolsBusy || !!(tools.gcc && tools.cmake && tools.ninja && tools.sdl)} onClick={askInstallTools}><Icon name="build" /> {t("manager.installTools")}</button>
        </div>
      )}
      {toolOutput && <p className="tools-output" data-tools-output="" title={toolOutput}>{toolOutput}</p>}
      {toolPlan && <ConfirmDialog t={t} message={`${t("manager.toolsAsk")}\n\n${toolPlan.join("\n")}`} yesLabel={t("manager.installTools")} onYes={installTools} onNo={() => setToolPlan(null)} />}
      {asking && <ConfirmDialog t={t} message={t("manager.removeAsk", { version: asking })} yesLabel={t("manager.remove")} onYes={() => remove(asking)} onNo={() => setAsking(null)} />}
    </Dialog>
  );
}
