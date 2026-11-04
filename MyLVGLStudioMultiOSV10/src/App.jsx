// The studio window, laid out like Android Studio's layout editor: palette and component tree
// on the left, the design surface with Design / Split / Code in the middle, attributes on the
// right, log and build output below. Chrome and themes follow My Git Master.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import appIcon from "../assets/icons/32x32.png";
import { Icon } from "./icons.jsx";
import { host, isDesktop } from "./host.js";
import { translator } from "./i18n.js";
import { allThemes, applyTheme, setCustomThemes, THEMES, themeById } from "./themes.js";
import { addRecent, removeRecent, sanitizeStartScreen } from "./settings.js";
import { StartScreen } from "./StartScreen.jsx";
import { PreferencesDialog } from "./Preferences.jsx";
import { Surface } from "./Surface.jsx";
import { Attributes, CodeView, ComponentTree, LogView, Palette } from "./panels.jsx";
import { AboutDialog, ConfirmDialog, LvglManager, MessageDialog, NewProjectDialog, ProjectSettings } from "./dialogs.jsx";
import { useProjectStore } from "./store.js";
import { FILE_EXTENSION, addNode, addScreen, cloneNode, createNode, findNode, findParent, newProject, parseProject, removeNode, screenOf } from "./lvgl/project.js";
import { CONTAINERS, WIDGETS } from "./lvgl/schema.js";
import { GENERATED_DIRS, generateCode, projectFiles } from "./lvgl/codegen.js";
import { engineFor } from "./lvgl/versions.js";

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const clock = () => new Date().toTimeString().slice(0, 8);
const LOG_LIMIT = 2000;

function Menu({ id, label, open, onOpen, onHover, items }) {
  return (
    <div className="menu" data-menu={id}>
      <button type="button" className={open ? "active" : undefined} onClick={() => onOpen(open ? null : id)} onPointerEnter={() => onHover(id)}>{label}</button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((item, index) => (item === "-" ? (
            <div className="sep" key={index} />
          ) : (
            <button
              type="button"
              key={item.id}
              role="menuitem"
              data-command={item.id}
              className={item.disabled ? "is-disabled" : undefined}
              onClick={() => {
                if (item.disabled) return;
                onOpen(null);
                item.run();
              }}
            >
              <Icon name={item.icon} />
              <span className="menu-label">{item.label}</span>
              {item.keys && <span className="menu-note">{item.keys}</span>}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

function ToolButton({ command }) {
  return (
    <button
      type="button"
      className={command.pressed ? "tool active" : "tool"}
      data-command={command.id}
      aria-label={command.label}
      title={command.keys ? `${command.label} (${command.keys})` : command.label}
      aria-pressed={command.pressed}
      disabled={command.disabled}
      onClick={command.run}
    >
      <Icon name={command.icon} />
    </button>
  );
}

export function App({ initialSettings }) {
  const store = useProjectStore();
  const { project } = store;
  const [language, setLanguage] = useState(initialSettings.language);
  const [themeId, setThemeId] = useState(themeById(initialSettings.theme).id);
  const [customThemes, setCustomThemeList] = useState(initialSettings.customThemes);
  const [start, setStart] = useState(initialSettings.startScreen);
  const [recent, setRecent] = useState(initialSettings.recent);
  const [showStart, setShowStart] = useState(initialSettings.startScreen.showOnStartup);
  const t = useMemo(() => translator(language), [language]);

  const [activeId, setActiveId] = useState(project.screens[0].id);
  const [selected, setSelected] = useState(project.screens[0].id);
  const [path, setPath] = useState(null);
  const [mode, setMode] = useState("design"); // design | run
  const [view, setView] = useState("design"); // design | split | code
  const [zoom, setZoom] = useState(2);
  const [openMenu, setOpenMenu] = useState(null);
  const [popup, setPopup] = useState(null); // theme | language
  const [dialog, setDialog] = useState(null);
  const [bottomTab, setBottomTab] = useState("log");
  const [logLines, setLogLines] = useState([]);
  const [buildLines, setBuildLines] = useState([]);
  const [native, setNative] = useState("idle"); // idle | building | running
  const [installed, setInstalled] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [sizes, setSizes] = useState({ left: 250, right: 300, bottom: 170, ...initialSettings.panels });

  const clipboard = useRef(null);
  const surface = useRef(null);
  const viewport = useRef(null);

  const activeScreen = project.screens.find((screen) => screen.id === activeId) ?? project.screens[0];
  const selectedNode = selected ? findNode(project, selected) : null;
  const engineInfo = engineFor(project.lvgl);
  const running = mode === "run";

  useEffect(() => void applyTheme(themeId), [themeId]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const log = useCallback((text, kind) => {
    setLogLines((lines) => [...lines, { time: clock(), text, kind }].slice(-LOG_LIMIT));
  }, []);

  const showError = useCallback((message) => setDialog({ kind: "message", title: t("dialog.error"), message: String(message) }), [t]);

  const refreshInstalled = useCallback(() => host.lvglInstalled().then((list) => setInstalled(list.map((item) => item.version))), []);
  useEffect(() => void refreshInstalled(), [refreshInstalled]);

  // A selection or active screen that no longer exists (undo, delete) falls back to the screen.
  useEffect(() => {
    if (!project.screens.some((screen) => screen.id === activeId)) setActiveId(project.screens[0].id);
    if (selected && !findNode(project, selected)) setSelected(activeScreen.id);
  }, [project, activeId, selected, activeScreen]);

  const select = useCallback((id) => {
    setSelected(id);
    const owner = screenOf(store.get(), id);
    if (owner) setActiveId(owner.id);
  }, [store]);

  /* ---------------------------------------------------------- document */

  const guardUnsaved = (next) => {
    if (store.dirty) setDialog({ kind: "confirm", message: t("dialog.unsaved"), onYes: next });
    else next();
  };

  const rememberRecent = (file) => {
    setRecent((list) => {
      const next = addRecent(list, file);
      void host.saveSettings({ recent: next });
      return next;
    });
  };

  const forgetRecent = (file) => {
    setRecent((list) => {
      const next = removeRecent(list, file);
      void host.saveSettings({ recent: next });
      return next;
    });
  };

  const load = (next, filePath) => {
    setShowStart(false);
    if (filePath) rememberRecent(filePath);
    store.replace(next);
    setPath(filePath);
    setActiveId(next.screens[0].id);
    setSelected(next.screens[0].id);
    setMode("design");
  };

  /** Opens the dialog that decides a project folder. */
  const askProjectFolder = async (saveOnly) => {
    const location = initialSettings.projectsDir || (await host.defaultLocation().catch(() => "")) || "";
    setDialog({ kind: "project", saveOnly, location, name: saveOnly ? store.get().name : "MyLVGLProject" });
  };

  const cmdNew = () => guardUnsaved(() => askProjectFolder(false));

  /** A recent project that cannot be read any more leaves the list; a damaged one stays. */
  const forgetIfMissing = (file, error) => {
    if (/os error [23]\b|not found|cannot find/i.test(String(error?.message ?? error))) forgetRecent(file);
  };

  const openFile = async (file) => {
    try {
      load(parseProject(await host.readText(file)), file);
      log(t("log.opened", { path: file }));
    } catch (error) {
      forgetIfMissing(file, error);
      showError(`${file}\n${error?.message ?? error}`);
    }
  };

  const cmdOpen = () => guardUnsaved(async () => {
    const file = await host.openProjectDialog().catch(showError);
    if (file) await openFile(file);
  });

  // A project file double-clicked in the file manager: at start, or while the app is running.
  const openFileRef = useRef(null);
  openFileRef.current = (file) => guardUnsaved(() => openFile(file));
  useEffect(() => {
    void host.startupFile().then((file) => file && openFileRef.current(file));
    return host.on("open-file", (file) => openFileRef.current(file));
  }, []);

  /** Writes the project file and all generated code into the project folder. */
  const writeFolder = async (folder, baseName, document) => {
    await host.writeProject(folder, projectFiles(document, baseName), GENERATED_DIRS);
    log(t("log.saved", { path: folder }));
  };

  /** Finishes the project dialog: a new project, or the open one under a new name. */
  const createProjectFolder = async ({ name, folder, location, version, device }, saveOnly) => {
    const state = await host.dirState(folder);
    if (state === "other") throw new Error(t("project.exists", { path: folder }));
    const separator = folder.includes("\\") ? "\\" : "/";
    const file = `${folder}${separator}${name}.${FILE_EXTENSION}`;
    const document = saveOnly ? { ...store.get(), name } : { ...newProject(name), lvgl: version, device };
    await writeFolder(folder, name, document);
    if (saveOnly) {
      store.update((draft) => {
        draft.name = name;
      });
      store.markSaved();
      setPath(file);
      rememberRecent(file);
    } else {
      load(document, file);
    }
    initialSettings.projectsDir = location;
    void host.saveSettings({ projectsDir: location });
    setDialog(null);
  };

  const cmdSaveAs = () => askProjectFolder(true);

  const cmdSave = async () => {
    if (!path) return cmdSaveAs();
    try {
      const parts = path.split(/[\\/]/);
      const baseName = parts.pop().replace(/\.[^.]+$/, "");
      await writeFolder(parts.join(path.includes("\\") ? "\\" : "/"), baseName, store.get());
      store.markSaved();
    } catch (error) {
      showError(error);
    }
    return undefined;
  };

  /* ---------------------------------------------------------- editing */

  const addWidget = useCallback((type, parentId, position) => {
    let id = null;
    store.update((draft) => {
      const node = createNode(draft, type, position ?? {});
      addNode(draft, parentId, node);
      id = node.id;
    });
    if (id) setSelected(id);
    setShowStart(false);
  }, [store]);

  /** Double-click in the palette: into the selected container, else the screen. */
  const addFromPalette = useCallback((type) => {
    const parent = selectedNode && CONTAINERS.has(selectedNode.type) ? selectedNode : activeScreen;
    addWidget(type, parent.id, { x: 10, y: 10 });
  }, [activeScreen, addWidget, selectedNode]);

  const beginPaletteDrag = useCallback((type, start) => {
    if (running) return;
    start.preventDefault();
    let moved = false;
    const move = (event) => {
      if (!moved && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 4) return;
      moved = true;
      setGhost({ type, x: event.clientX, y: event.clientY });
    };
    const up = (event) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      if (!moved) return;
      const target = surface.current?.dropTarget(event.clientX, event.clientY);
      if (target) addWidget(type, target.parentId, { x: target.x, y: target.y });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [addWidget, running]);

  const isWidget = selectedNode && selectedNode.type !== "screen";

  const cmdDelete = () => {
    if (!selectedNode) return;
    const fallback = isWidget ? findParent(project, selectedNode.id)?.id : project.screens.find((screen) => screen.id !== selectedNode.id)?.id;
    store.update((draft) => removeNode(draft, selectedNode.id));
    if (fallback) select(fallback);
  };

  const cmdCopy = () => {
    if (isWidget) clipboard.current = structuredClone(selectedNode);
  };

  const pasteNode = (source) => {
    const parent = selectedNode && CONTAINERS.has(selectedNode.type) ? selectedNode.id : (findParent(project, selected)?.id ?? activeScreen.id);
    let id = null;
    store.update((draft) => {
      const copy = cloneNode(draft, source);
      copy.props.x = (Number(copy.props.x) || 0) + 10;
      copy.props.y = (Number(copy.props.y) || 0) + 10;
      addNode(draft, parent, copy);
      id = copy.id;
    });
    if (id) setSelected(id);
  };

  const cmdPaste = () => {
    if (clipboard.current) pasteNode(clipboard.current);
  };

  const cmdDuplicate = () => {
    if (!isWidget) return;
    const parent = findParent(project, selected);
    let id = null;
    store.update((draft) => {
      const copy = cloneNode(draft, selectedNode);
      copy.props.x = (Number(copy.props.x) || 0) + 10;
      copy.props.y = (Number(copy.props.y) || 0) + 10;
      addNode(draft, parent.id, copy);
      id = copy.id;
    });
    if (id) setSelected(id);
  };

  const reorder = (direction) => {
    if (!isWidget) return;
    store.update((draft) => {
      const parent = findParent(draft, selected);
      const index = parent.children.findIndex((child) => child.id === selected);
      const target = index + direction;
      if (target < 0 || target >= parent.children.length) return false;
      const [node] = parent.children.splice(index, 1);
      parent.children.splice(target, 0, node);
      return undefined;
    });
  };

  const nudge = (dx, dy) => {
    if (!isWidget) return;
    store.update((draft) => {
      const node = findNode(draft, selected);
      node.props.x = (Number(node.props.x) || 0) + dx;
      node.props.y = (Number(node.props.y) || 0) + dy;
    }, { coalesce: `${selected}:nudge` });
  };

  const cmdAddScreen = () => {
    let id = null;
    store.update((draft) => {
      id = addScreen(draft).id;
    });
    if (id) select(id);
  };

  const removeScreen = (id) => {
    if (project.screens.length < 2) return;
    const other = project.screens.find((screen) => screen.id !== id).id;
    store.update((draft) => removeNode(draft, id));
    select(other);
  };

  /* ---------------------------------------------------------- running */

  const toggleRun = () => {
    setMode((value) => {
      log(t(value === "run" ? "log.runStop" : "log.runStart"));
      return value === "run" ? "design" : "run";
    });
    setView((value) => (value === "code" ? "design" : value));
  };

  const addBuildLine = useCallback((text, kind) => {
    setBuildLines((lines) => [...lines, { time: clock(), text, kind }].slice(-LOG_LIMIT));
  }, []);

  useEffect(() => {
    const offLog = host.on("native-log", ({ stream, line }) => {
      if (stream === "app") log(line);
      else addBuildLine(line, stream === "error" ? "error" : undefined);
    });
    const offStarted = host.on("native-started", () => setNative("running"));
    const offExit = host.on("native-exit", () => setNative("idle"));
    return () => {
      offLog();
      offStarted();
      offExit();
    };
  }, [addBuildLine, log]);

  const startNative = async () => {
    const current = store.get();
    setBottomTab("build");
    setBuildLines([]);
    setNative("building");
    try {
      await host.nativeRun(current.lvgl, generateCode(current));
    } catch (error) {
      setNative("idle");
      showError(error);
    }
  };

  const cmdNative = async () => {
    if (native !== "idle") {
      await host.nativeStop();
      return;
    }
    if (!isDesktop) {
      showError(t("native.desktopOnly"));
      return;
    }
    const version = store.get().lvgl;
    const tools = await host.nativeCheck();
    const missing = ["gcc", "cmake", "ninja"].filter((tool) => !tools[tool]);
    if (!tools.sdl) missing.push("SDL2");
    if (missing.length) {
      showError(t("native.needTools", { tools: missing.join(", ") }));
      return;
    }
    const list = (await host.lvglInstalled()).map((item) => item.version);
    setInstalled(list);
    if (!list.includes(version)) {
      setDialog({
        kind: "confirm",
        message: t("native.needInstall", { version }),
        yesLabel: t("manager.install"),
        onYes: () => setDialog({ kind: "manager", autoInstall: version }),
      });
      return;
    }
    await startNative();
  };

  /* --------------------------------------------------------- appearance */

  const changeTheme = (id) => {
    setThemeId(id);
    setPopup(null);
    void host.saveSettings({ theme: id });
  };

  /** Saves a change to the start screen's settings. */
  const changeStart = useCallback((patch) => {
    setStart((state) => {
      const next = sanitizeStartScreen({ ...state, ...patch });
      void host.saveSettings({ startScreen: next });
      return next;
    });
  }, []);

  /** The user's themes changed: the list, and the theme to show now. */
  const changeCustomThemes = (list, selectedId) => {
    setCustomThemes(list);
    setCustomThemeList(list);
    setThemeId(selectedId);
    // An edited theme keeps its id, so the effect on themeId would not run for it.
    applyTheme(selectedId);
    void host.saveSettings({ customThemes: list, theme: selectedId });
  };

  const changeLanguage = (value) => {
    setLanguage(value);
    setPopup(null);
    void host.saveSettings({ language: value });
  };

  const fitZoom = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const scale = Math.min((element.clientWidth - 48) / project.device.w, (element.clientHeight - 48) / project.device.h);
    setZoom(Math.max(0.25, Math.min(6, Math.floor(scale * 4) / 4)));
  }, [project.device.w, project.device.h]);

  const stepZoom = (direction) => {
    const next = direction > 0 ? ZOOMS.find((value) => value > zoom) : [...ZOOMS].reverse().find((value) => value < zoom);
    if (next) setZoom(next);
  };

  // A new device size starts fitted to the view.
  useEffect(() => {
    if (!showStart) fitZoom();
  }, [project.device.w, project.device.h, fitZoom, showStart]);

  const beginSplit = (key, sign) => (start) => {
    start.preventDefault();
    const from = sizes[key];
    const horizontal = key !== "bottom";
    const limit = horizontal ? [200, 520] : [80, 480];
    let latest = from;
    const move = (event) => {
      const delta = horizontal ? event.clientX - start.clientX : event.clientY - start.clientY;
      latest = Math.max(limit[0], Math.min(limit[1], from + sign * delta));
      setSizes((state) => ({ ...state, [key]: latest }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSizes((state) => {
        void host.saveSettings({ panels: state });
        return state;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------------------------------------------------- commands */

  const c = {
    new: { id: "new", icon: "new", label: t("cmd.new"), keys: "Ctrl+N", run: cmdNew },
    open: { id: "open", icon: "open", label: t("cmd.open"), keys: "Ctrl+O", run: cmdOpen },
    save: { id: "save", icon: "save", label: t("cmd.save"), keys: "Ctrl+S", run: cmdSave },
    saveAs: { id: "saveAs", icon: "save", label: t("cmd.saveAs"), keys: "Ctrl+Shift+S", run: cmdSaveAs },
    undo: { id: "undo", icon: "undo", label: t("cmd.undo"), keys: "Ctrl+Z", disabled: !store.canUndo || running, run: store.undo },
    redo: { id: "redo", icon: "redo", label: t("cmd.redo"), keys: "Ctrl+Y", disabled: !store.canRedo || running, run: store.redo },
    copy: { id: "copy", icon: "copy", label: t("cmd.copy"), keys: "Ctrl+C", disabled: !isWidget || running, run: cmdCopy },
    paste: { id: "paste", icon: "paste", label: t("cmd.paste"), keys: "Ctrl+V", disabled: running, run: cmdPaste },
    duplicate: { id: "duplicate", icon: "duplicate", label: t("cmd.duplicate"), keys: "Ctrl+D", disabled: !isWidget || running, run: cmdDuplicate },
    delete: { id: "delete", icon: "delete", label: t("cmd.delete"), keys: "Del", disabled: running || !selectedNode || (!isWidget && project.screens.length < 2), run: cmdDelete },
    forward: { id: "forward", icon: "forward", label: t("cmd.forward"), disabled: !isWidget || running, run: () => reorder(1) },
    backward: { id: "backward", icon: "backward", label: t("cmd.backward"), disabled: !isWidget || running, run: () => reorder(-1) },
    run: { id: "run", icon: running ? "stop" : "run", label: t(running ? "cmd.stop" : "cmd.run"), keys: "F5", pressed: running, run: toggleRun },
    native: { id: "native", icon: native === "idle" ? "native" : "stop", label: t(native === "idle" ? "cmd.nativeRun" : "cmd.nativeStop"), keys: "Shift+F5", pressed: native !== "idle", run: cmdNative },
    settings: { id: "settings", icon: "settings", label: t("cmd.settings"), run: () => setDialog({ kind: "settings" }) },
    manager: { id: "manager", icon: "manager", label: t("cmd.manager"), run: () => setDialog({ kind: "manager" }) },
    about: { id: "about", icon: "about", label: t("cmd.about"), run: () => setDialog({ kind: "about" }) },
    start: { id: "start", icon: "home", label: t("start.title"), pressed: showStart, run: () => setShowStart((value) => !value) },
    preferences: { id: "preferences", icon: "settings", label: t("cmd.preferences"), run: () => setDialog({ kind: "preferences" }) },
    exit: { id: "exit", icon: "close", label: t("cmd.exit"), run: () => guardUnsaved(() => host.close()) },
    zoomIn: { id: "zoomIn", icon: "zoomIn", label: t("cmd.zoomIn"), run: () => stepZoom(1) },
    zoomOut: { id: "zoomOut", icon: "zoomOut", label: t("cmd.zoomOut"), run: () => stepZoom(-1) },
    zoomFit: { id: "zoomFit", icon: "zoomFit", label: t("cmd.zoomFit"), run: fitZoom },
  };

  const menus = [
    { id: "file", items: [c.new, c.open, "-", c.save, c.saveAs, "-", c.exit] },
    { id: "edit", items: [c.undo, c.redo, "-", c.copy, c.paste, c.duplicate, c.delete, "-", c.forward, c.backward] },
    { id: "view", items: [c.start, "-", c.zoomIn, c.zoomOut, c.zoomFit] },
    { id: "run", items: [c.run, c.native] },
    { id: "tools", items: [c.settings, c.manager, "-", c.preferences] },
    { id: "help", items: [c.about] },
  ];

  const toolbarGroups = [
    [c.start],
    [c.new, c.open, c.save],
    [c.undo, c.redo],
    [c.copy, c.paste, c.duplicate, c.delete],
    [c.backward, c.forward],
    [c.run, c.native],
    [c.settings, c.manager],
  ];

  // The latest commands, for the keyboard handler below.
  const commands = useRef(c);
  commands.current = c;

  useEffect(() => {
    const key = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName));
      const cmd = commands.current;
      const fire = (command) => {
        event.preventDefault();
        if (!command.disabled) command.run();
      };
      if (event.key === "F5") return fire(event.shiftKey ? cmd.native : cmd.run);
      if (event.ctrlKey || event.metaKey) {
        const letter = event.key.toLowerCase();
        if (letter === "s") return fire(event.shiftKey ? cmd.saveAs : cmd.save);
        if (letter === "n") return fire(cmd.new);
        if (letter === "o") return fire(cmd.open);
        if (typing) return undefined;
        if (letter === "z") return fire(event.shiftKey ? cmd.redo : cmd.undo);
        if (letter === "y") return fire(cmd.redo);
        if (letter === "c") return fire(cmd.copy);
        if (letter === "v") return fire(cmd.paste);
        if (letter === "d") return fire(cmd.duplicate);
        return undefined;
      }
      if (typing || mode === "run") return undefined;
      if (event.key === "Delete") return fire(cmd.delete);
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
      if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
      if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
      if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
      return undefined;
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  useEffect(() => {
    if (!openMenu && !popup) return undefined;
    const close = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".menu, .popup-host")) {
        setOpenMenu(null);
        setPopup(null);
      }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [openMenu, popup]);

  /** Read-only hook for the GUI test (test/gui.mjs). */
  useEffect(() => {
    window.__mls = {
      project: () => store.get(),
      selected: () => selected,
      engine: () => surface.current?.engine(),
      box: (id) => surface.current?.boxes().get(id) ?? null,
      canvas: () => surface.current?.canvas(),
      zoom: () => zoom,
      themeId: () => themeId,
      showStart: () => showStart,
      start: () => start,
      recent: () => recent,
      language: () => language,
    };
  });

  const code = useMemo(() => (view === "design" ? null : generateCode(project)), [project, view]);

  const dragTitlebar = (event) => {
    if (event.button === 0 && !(event.target instanceof Element && event.target.closest("button"))) {
      if (event.detail === 2) host.toggleMaximize();
      else host.startDrag();
    }
  };

  const fileName = path ? path.split(/[\\/]/).pop() : project.name;
  const status = native === "building" ? t("status.building") : native === "running" ? t("status.native") : running ? t("status.run") : t("status.design");

  return (
    <div className="app">
      <div className="menubar" onPointerDown={dragTitlebar}>
        <span className="app-title">
          <img src={appIcon} alt="" />
          <strong>My LVGL Studio</strong>
        </span>
        {menus.map((menu) => (
          <Menu
            key={menu.id}
            id={menu.id}
            label={t(`menu.${menu.id}`)}
            open={openMenu === menu.id}
            onOpen={setOpenMenu}
            onHover={(id) => openMenu && setOpenMenu(id)}
            items={menu.items}
          />
        ))}
        <span className="title-file">{fileName}{store.dirty ? " •" : ""}</span>
        <div className="window-controls">
          <button type="button" aria-label={t("cmd.minimize")} title={t("cmd.minimize")} onClick={host.minimize}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
          <button type="button" aria-label={t("cmd.maximize")} title={t("cmd.maximize")} onClick={host.toggleMaximize}><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
          <button type="button" className="close" aria-label={t("cmd.close")} title={t("cmd.close")} onClick={() => c.exit.run()}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
        </div>
      </div>

      <div className="toolbar">
        {toolbarGroups.map((group, index) => (
          <span className="tool-group" key={index}>
            {index > 0 && <i className="tool-sep" />}
            {group.map((command) => <ToolButton key={command.id} command={command} />)}
          </span>
        ))}
        <div className="toolbar-end">
          <div className="popup-host">
            <button type="button" className={popup === "theme" ? "tool active" : "tool"} data-command="theme" aria-label={t("cmd.theme")} title={t("cmd.theme")} onClick={() => setPopup(popup === "theme" ? null : "theme")}><Icon name="theme" /></button>
            {popup === "theme" && (
              <div className="menu-pop theme-pop" role="menu">
                {["light", "dark"].map((themeMode) => (
                  <section key={themeMode}>
                    <h4>{t(`theme.${themeMode}`)}</h4>
                    {allThemes().filter((item) => item.mode === themeMode).map((item) => (
                      <button type="button" key={item.id} role="menuitem" data-theme-id={item.id} className={item.id === themeId ? "selected" : undefined} onClick={() => changeTheme(item.id)}>
                        <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
                        <span className="menu-label">{language === "en" ? item.nameEn : item.nameKo}</span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="popup-host">
            <button type="button" className={popup === "language" ? "tool active" : "tool"} data-command="language" aria-label={t("cmd.language")} title={t("cmd.language")} onClick={() => setPopup(popup === "language" ? null : "language")}><Icon name="language" /></button>
            {popup === "language" && (
              <div className="menu-pop language-pop" role="menu">
                <button type="button" role="menuitem" data-language="ko" className={language === "ko" ? "selected" : undefined} onClick={() => changeLanguage("ko")}><span className="lang-glyph">ㅎㆍㄴ</span><span className="menu-label">한국어</span></button>
                <button type="button" role="menuitem" data-language="en" className={language === "en" ? "selected" : undefined} onClick={() => changeLanguage("en")}><span className="lang-glyph">Aa</span><span className="menu-label">English</span></button>
              </div>
            )}
          </div>
          <ToolButton command={c.preferences} />
          <ToolButton command={c.about} />
        </div>
      </div>

      {showStart && (
        <StartScreen
          t={t}
          language={language}
          themeId={themeId}
          customThemes={customThemes}
          start={start}
          recent={recent}
          onStart={changeStart}
          onNew={cmdNew}
          onOpen={cmdOpen}
          onContinue={() => setShowStart(false)}
          onOpenRecent={(file) => openFileRef.current(file)}
          onRemoveRecent={forgetRecent}
          onTheme={changeTheme}
          onPreferences={() => setDialog({ kind: "preferences" })}
        />
      )}

      <div className="workspace" style={{ display: showStart ? "none" : undefined, gridTemplateColumns: `${sizes.left}px 5px minmax(0, 1fr) 5px ${sizes.right}px`, gridTemplateRows: `minmax(0, 1fr) 5px ${sizes.bottom}px` }}>
        <div className="left-col">
          <section className="panel">
            <h3>{t("panel.palette")}</h3>
            <Palette t={t} onDragStart={beginPaletteDrag} onAdd={addFromPalette} />
          </section>
          <section className="panel">
            <h3>{t("panel.tree")}</h3>
            <ComponentTree t={t} screen={activeScreen} selected={selected} onSelect={select} />
          </section>
        </div>
        <div className="splitter" onPointerDown={beginSplit("left", 1)} />

        <div className="center-col">
          <div className="design-bar">
            <div className="screen-tabs">
              {project.screens.map((screen) => (
                <span className={screen.id === activeScreen.id ? "screen-tab active" : "screen-tab"} key={screen.id}>
                  <button type="button" data-screen-tab={screen.id} onClick={() => select(screen.id)}>
                    <Icon name="screen" /> {screen.name}
                  </button>
                  {project.screens.length > 1 && !running && (
                    <button type="button" className="mini" aria-label={t("screen.remove")} title={t("screen.remove")} onClick={() => removeScreen(screen.id)}><Icon name="close" size={11} /></button>
                  )}
                </span>
              ))}
              <button type="button" className="mini" data-command="add-screen" disabled={running} aria-label={t("screen.add")} title={t("screen.add")} onClick={cmdAddScreen}><Icon name="add" size={14} /></button>
            </div>
            <div className="design-tools">
              <button type="button" className="version-chip" data-command="version-chip" title={t("settings.version")} onClick={() => setDialog({ kind: "settings" })}>
                <Icon name="manager" size={14} /> LVGL {project.lvgl}
              </button>
              <span className="zoom-box">
                <button type="button" className="mini" aria-label={c.zoomOut.label} title={c.zoomOut.label} onClick={c.zoomOut.run}><Icon name="zoomOut" size={14} /></button>
                <span data-zoom="">{Math.round(zoom * 100)}%</span>
                <button type="button" className="mini" aria-label={c.zoomIn.label} title={c.zoomIn.label} onClick={c.zoomIn.run}><Icon name="zoomIn" size={14} /></button>
                <button type="button" className="mini" aria-label={c.zoomFit.label} title={c.zoomFit.label} onClick={c.zoomFit.run}><Icon name="zoomFit" size={14} /></button>
              </span>
              <span className="view-switch">
                {["design", "split", "code"].map((item) => (
                  <button type="button" key={item} data-view={item} className={view === item ? "active" : undefined} aria-label={t(`view.${item}`)} title={t(`view.${item}`)} onClick={() => setView(item)}><Icon name={item} /></button>
                ))}
              </span>
            </div>
          </div>
          <div className={`design-area view-${view}`}>
            <div className="viewport" ref={viewport} style={view === "code" ? { display: "none" } : undefined}>
              <Surface
                ref={surface}
                store={store}
                activeId={activeScreen.id}
                selected={selected}
                onSelect={select}
                mode={mode}
                zoom={zoom}
                onLog={log}
                onMeta={useCallback((meta) => setRuntime(meta.runtime), [])}
                onError={showError}
              />
            </div>
            {code && <CodeView files={code} />}
          </div>
        </div>
        <div className="splitter" onPointerDown={beginSplit("right", -1)} />

        <div className="right-col panel">
          <h3>{t("panel.attributes")}</h3>
          <Attributes t={t} store={store} selected={selected} readOnly={running} />
        </div>

        <div className="splitter h span" onPointerDown={beginSplit("bottom", -1)} />
        <div className="bottom-panel span">
          <div className="bottom-tabs">
            <button type="button" data-bottom="log" className={bottomTab === "log" ? "active" : undefined} onClick={() => setBottomTab("log")}><Icon name="log" /> {t("panel.log")}</button>
            <button type="button" data-bottom="build" className={bottomTab === "build" ? "active" : undefined} onClick={() => setBottomTab("build")}><Icon name="build" /> {t("panel.build")}</button>
          </div>
          {bottomTab === "log" ? <LogView id="log" lines={logLines} /> : <LogView id="build" lines={buildLines} />}
        </div>
      </div>

      <div className="statusbar">
        <span className="status-cell" data-status="mode"><Icon name={running || native !== "idle" ? "run" : "design"} /><span>{status}</span></span>
        <span className="status-cell" data-status="file"><span>{fileName} · {t(store.dirty ? "status.modified" : "status.saved")}</span></span>
        <span className={engineInfo.exact ? "status-cell" : "status-cell warn"} data-status="engine">
          <Icon name="manager" />
          <span>{engineInfo.exact ? `LVGL ${project.lvgl}` : t("status.engineClose", { engine: engineInfo.engine, version: project.lvgl })}</span>
        </span>
        <span className="status-cell" data-status="device"><Icon name="device" /><span>{project.device.w}×{project.device.h}</span></span>
        {selectedNode && <span className="status-cell" data-status="selection"><Icon name={WIDGETS[selectedNode.type].icon} /><span>{selectedNode.name}</span></span>}
        <span className="status-end">
          {isDesktop && (
            <button type="button" className="grip" aria-label="resize" onPointerDown={(event) => { event.preventDefault(); host.startResize(); }}>
              <svg viewBox="0 0 12 12"><path d="M11 3 3 11M11 7l-4 4M11 10.5l-.5.5" /></svg>
            </button>
          )}
        </span>
      </div>

      {ghost && (
        <div className="drag-ghost" data-ghost="" style={{ left: ghost.x + 8, top: ghost.y + 8 }}>
          <Icon name={WIDGETS[ghost.type].icon} /> {t(`widget.${ghost.type}`)}
        </div>
      )}

      {dialog?.kind === "preferences" && (
        <PreferencesDialog
          t={t}
          language={language}
          onLanguage={changeLanguage}
          themeId={themeId}
          onTheme={changeTheme}
          customThemes={customThemes}
          onCustomThemes={changeCustomThemes}
          start={start}
          onStart={changeStart}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "project" && (
        <NewProjectDialog
          t={t}
          saveOnly={dialog.saveOnly}
          initialName={dialog.name}
          initialLocation={dialog.location}
          installed={installed}
          onCreate={(choice) => createProjectFolder(choice, dialog.saveOnly)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "settings" && (
        <ProjectSettings t={t} store={store} installed={installed} onClose={() => setDialog(null)} onManager={() => setDialog({ kind: "manager", back: "settings" })} />
      )}
      {dialog?.kind === "manager" && (
        <LvglManager t={t} autoInstall={dialog.autoInstall} onInstalledChange={setInstalled} onClose={() => setDialog(dialog.back ? { kind: dialog.back } : null)} />
      )}
      {dialog?.kind === "about" && <AboutDialog t={t} runtime={runtime} onClose={() => setDialog(null)} />}
      {dialog?.kind === "message" && <MessageDialog t={t} title={dialog.title} message={dialog.message} onClose={() => setDialog(null)} />}
      {dialog?.kind === "confirm" && (
        <ConfirmDialog
          t={t}
          message={dialog.message}
          yesLabel={dialog.yesLabel}
          onYes={() => {
            const next = dialog.onYes;
            setDialog(null);
            next();
          }}
          onNo={() => setDialog(null)}
        />
      )}
    </div>
  );
}
