// The studio window, laid out like Android Studio's layout editor: the palette on the left, the
// design surface with Design / Split / Code in the middle, the component tree above the attributes
// on the right, log and build output below. Chrome and themes follow My Git Master.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import appIcon from "../assets/icons/32x32.png";
import appIconLarge from "../assets/icons/128x128.png";
import { Flag, Icon } from "./icons.jsx";
import { ContextMenu, readOnlyTextItems, textFieldItems } from "./ContextMenu.jsx";
import { host, isDesktop } from "./host.js";
import { translator } from "./i18n.js";
import { applyTheme, setCustomThemes, THEMES, themeById } from "./themes.js";
import { addRecent, removeRecent, sanitizeGeneral, sanitizeStartScreen } from "./settings.js";
import { StartScreen } from "./StartScreen.jsx";
import { PreferencesDialog } from "./Preferences.jsx";
import { Surface } from "./Surface.jsx";
import { RULER_SIZE, Ruler } from "./Ruler.jsx";
import { findProblems, locateInCode, parseBuildProblems } from "./lvgl/problems.js";
import { cNames } from "./lvgl/emit.js";
import { setTipTranslator } from "./tooltips.js";
import { Attributes, CodeView, Explorer, ProblemsView, ComponentTree, LogView, Palette, PanelTitle } from "./panels.jsx";
import { AboutDialog, ConfirmDialog, LvglManager, MessageDialog, NewProjectDialog, ProjectSettings, SamplesDialog } from "./dialogs.jsx";
import { useProjectStore } from "./store.js";
import { FILE_EXTENSION, serializeProject, addNode, addScreen, cloneNode, createNode, findNode, findParent, newProject, parseProject, imageNameFor, removeNode, screenOf } from "./lvgl/project.js";
import { CONTAINERS, DEVICES, PALETTE, WIDGETS, availableIn, normalDevice, sameDevice } from "./lvgl/schema.js";
import { Stepper } from "./controls.jsx";
import { LvConfDialog } from "./LvConfDialog.jsx";
import { GENERATED_DIRS, generateCode, projectFiles } from "./lvgl/codegen.js";
import { applyCodeEdit } from "./lvgl/codeparse.js";
import { addImage, clearImages, decodeImage, extensionOf, imageData, imageFiles } from "./lvgl/images.js";
import { FONT_LANGUAGES, addFont, base64ToBytes, clearFonts, faceForLanguage, fontData, fontFiles, fontNameFor, markFontsWritten } from "./lvgl/fonts.js";
import { FontsDialog } from "./FontsDialog.jsx";
import { Tutorial, TutorialAsk } from "./Tutorial.jsx";
import { GuideDialog } from "./Guide.jsx";
import { GripDots } from "./controls.jsx";
import { focusPopout } from "./popout.js";
import { finishStep, stepSelection, tasksOf, tutorialProject } from "./lvgl/tutorial.js";
import { clearDragCursor, setDragCursor } from "./cursor.js";
import { engineFor } from "./lvgl/versions.js";
import { versionChoices } from "./dialogs.jsx";

const MENU_ICONS = { file: "open", edit: "paste", view: "eye", run: "run", tools: "settings", help: "about" };
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const clock = () => new Date().toTimeString().slice(0, 8);
const LOG_LIMIT = 2000;
const RUN_TITLE_HEIGHT = 32;
/** Room for the window's own edge, and for rounding at 125 % and 150 % scaling. */
const WINDOW_EDGE = 8;
const MIN_WINDOW_HEIGHT = 640;
/** A small display gets a larger run window, so it can be seen and its title bar still fits. */
const runScale = (w) => (w < 200 ? 3 : w < 360 ? 2 : 1);
const MAX_IMAGE_SIZE = 2048;

function Menu({ id, icon, label, open, onOpen, onHover, items }) {
  return (
    <div className="menu" data-menu={id}>
      <button type="button" className={open ? "active" : undefined} onClick={() => onOpen(open ? null : id)} onPointerEnter={() => onHover(id)}><Icon name={icon} size={14} /><span>{label}</span></button>
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
  setTipTranslator(t);

  const [activeId, setActiveId] = useState(project.screens[0].id);
  const [selected, setSelected] = useState(project.screens[0].id);
  const [path, setPath] = useState(null);
  const [mode, setMode] = useState("design"); // design | run
  const [view, setView] = useState("design"); // design | split | code
  const [zoom, setZoom] = useState(2);
  const [openMenu, setOpenMenu] = useState(null);
  const [popup, setPopup] = useState(null); // theme
  const [runOpen, setRunOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({ left: false, right: false, bottom: false, tree: false, attributes: false, ...initialSettings.collapsed });
  const [rulers, setRulers] = useState(initialSettings.rulers !== false);
  const [rulerView, setRulerView] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const rulerMarkerX = useRef(null);
  const rulerMarkerY = useRef(null);
  const [general, setGeneral] = useState(initialSettings.general);
  const [projectsDir, setProjectsDir] = useState(initialSettings.projectsDir ?? "");
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const [dialog, setDialog] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState("log");
  const [chosenProblem, setChosenProblem] = useState(null);
  const [codeFocus, setCodeFocus] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [buildLines, setBuildLines] = useState([]);
  const [native, setNative] = useState("idle"); // idle | building | running
  const [installed, setInstalled] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [sizes, setSizes] = useState({ left: 250, right: 300, bottom: 170, tree: 240, code: 480, explorer: 210, ...initialSettings.panels });

  const clipboard = useRef(null);
  const minimumWidth = useRef(0);
  const [hasClipboard, setHasClipboard] = useState(false);
  const screenTabs = useRef(null);
  const surface = useRef(null);
  const viewport = useRef(null);

  const activeScreen = project.screens.find((screen) => screen.id === activeId) ?? project.screens[0];
  const activeIndex = project.screens.indexOf(activeScreen);
  const selectedNode = selected ? findNode(project, selected) : null;
  const engineInfo = engineFor(project.lvgl);
  const running = mode === "run";

  useEffect(() => void applyTheme(themeId), [themeId]);
  // The active tab stays in view however many screens there are.
  useEffect(() => {
    screenTabs.current?.querySelector(".screen-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, project.screens.length]);
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

  // The rulers stay at the edges of the design area; their zero follows the device screen.
  const measureRulers = useCallback(() => {
    const element = viewport.current;
    const screen = surface.current?.canvas();
    if (!element || !screen) return;
    const area = element.getBoundingClientRect();
    const rect = screen.getBoundingClientRect();
    const next = { width: Math.round(area.width), height: Math.round(area.height), x: rect.left - area.left, y: rect.top - area.top };
    setRulerView((state) => (state.width === next.width && state.height === next.height && Math.abs(state.x - next.x) < 0.5 && Math.abs(state.y - next.y) < 0.5 ? state : next));
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    measureRulers();
    const observer = new ResizeObserver(measureRulers);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", measureRulers, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measureRulers);
    };
  }, [measureRulers, rulers, showStart]);
  useEffect(() => {
    measureRulers();
  }, [measureRulers, zoom, project.device.w, project.device.h, collapsed, view, sizes]);

  /** The pointer on the rulers: moved directly, a frame must not depend on a render. */
  const movePointerLine = (event) => {
    const element = viewport.current;
    if (!element || !rulerMarkerX.current) return;
    const area = element.getBoundingClientRect();
    rulerMarkerX.current.style.transform = `translateX(${event.clientX - area.left}px)`;
    rulerMarkerY.current.style.transform = `translateY(${event.clientY - area.top}px)`;
    rulerMarkerX.current.style.visibility = "visible";
    rulerMarkerY.current.style.visibility = "visible";
  };
  const hidePointerLine = () => {
    if (!rulerMarkerX.current) return;
    rulerMarkerX.current.style.visibility = "hidden";
    rulerMarkerY.current.style.visibility = "hidden";
  };

  const changeGeneral = useCallback((patch) => {
    setGeneral((state) => {
      const next = sanitizeGeneral({ ...state, ...patch });
      void host.saveSettings({ general: next });
      return next;
    });
  }, []);

  const changeProjectsDir = useCallback((value) => {
    setProjectsDir(value);
    initialSettings.projectsDir = value;
    void host.saveSettings({ projectsDir: value });
  }, [initialSettings]);

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
    const location = projectsDir || (await host.defaultLocation().catch(() => "")) || "";
    setDialog({ kind: "project", saveOnly, location, name: saveOnly ? store.get().name : "MyLVGLProject" });
  };

  const cmdNew = () => guardUnsaved(() => askProjectFolder(false));

  /** A recent project that cannot be read any more leaves the list; a damaged one stays. */
  const forgetIfMissing = (file, error) => {
    if (/os error [23]\b|not found|cannot find/i.test(String(error?.message ?? error))) forgetRecent(file);
  };

  /** Reads a project's image files; one that cannot be read is reported, and the project still opens. */
  const loadProjectImages = async (document, file) => {
    clearImages();
    const separator = file.includes("\\") ? "\\" : "/";
    const folder = file.slice(0, file.lastIndexOf(separator));
    for (const image of document.images) {
      try {
        const base64 = await host.readBase64(`${folder}${separator}${image.file.split("/").join(separator)}`);
        addImage(image.name, { ...(await decodeImage(base64, extensionOf(image.file))), base64 });
      } catch {
        log(t("image.missing", { file: image.file }), "error");
      }
    }
    clearFonts();
    for (const font of document.fonts ?? []) {
      try {
        const base64 = await host.readBase64(`${folder}${separator}${font.file.split("/").join(separator)}`);
        addFont(font.name, { bytes: base64ToBytes(base64), base64 });
        fontData(font.name).writtenTo.add(folder);
      } catch {
        log(t("font.fileGone", { file: font.file }), "error");
      }
    }
  };

  const openFile = async (file) => {
    try {
      const document = parseProject(await host.readText(file));
      await loadProjectImages(document, file);
      load(document, file);
      log(t("log.opened", { path: file }));
    } catch (error) {
      forgetIfMissing(file, error);
      showError(`${file}\n${error?.message ?? error}`);
    }
  };

  /**
   * Opens a sample as an unsaved copy, so its folder stays as shipped. When its LVGL version is
   * not installed, only now is the user asked: designing and running do not need it.
   */
  const openSample = (sample, directory) => guardUnsaved(async () => {
    try {
      const separator = directory.includes("\\") ? "\\" : "/";
      const file = `${directory}${separator}${sample.file.split("/").join(separator)}`;
      const document = parseProject(await host.readText(file));
      await loadProjectImages(document, file);
      load(document, null);
      log(t("log.sampleOpened", { name: sample.id }));
      log(t("log.sampleTip"));
      const list = (await host.lvglInstalled()).map((item) => item.version);
      setInstalled(list);
      if (!list.includes(document.lvgl)) {
        setDialog({
          kind: "confirm",
          message: t("samples.needLvgl", { version: document.lvgl }),
          yesLabel: t("manager.install"),
          onYes: () => setDialog({ kind: "manager", autoInstall: document.lvgl }),
        });
      }
    } catch (error) {
      showError(error);
    }
  });

  const cmdOpen = () => guardUnsaved(async () => {
    const file = await host.openProjectDialog().catch(showError);
    if (file) await openFile(file);
  });

  // A project file double-clicked in the file manager: at start, or while the app is running.
  const openFileRef = useRef(null);
  openFileRef.current = (file) => guardUnsaved(() => openFile(file));
  useEffect(() => {
    void host.startupFile().then((file) => {
      const target = file ?? (initialSettings.general.reopenLast ? initialSettings.recent[0] : null);
      if (target) openFileRef.current(target);
      // The question belongs to the start screen: without it, nothing is asked.
      else if (initialSettings.general.askTutorial && initialSettings.startScreen.showOnStartup) setDialog({ kind: "tutorialAsk" });
    });
    return host.on("open-file", (file) => openFileRef.current(file));
  }, []);

  /** Writes the project file and all generated code into the project folder. */
  const writeFolder = async (folder, baseName, document) => {
    await host.writeProject(folder, projectFiles(document, baseName), { ...imageFiles(document), ...fontFiles(document, folder) }, GENERATED_DIRS);
    markFontsWritten(document, folder);
    log(t("log.saved", { path: folder }));
  };

  /** Finishes the project dialog: a new project, or the open one under a new name. */
  const createProjectFolder = async ({ name, folder, location, version, device }, saveOnly) => {
    const state = await host.dirState(folder);
    if (state === "other") throw new Error(t("project.exists", { path: folder }));
    const separator = folder.includes("\\") ? "\\" : "/";
    const file = `${folder}${separator}${name}.${FILE_EXTENSION}`;
    const document = saveOnly ? { ...store.get(), name } : { ...newProject(name), lvgl: version, device };
    if (!saveOnly) {
      clearImages();
      clearFonts();
    }
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
    changeProjectsDir(location);
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
      rememberRecent(path);
    } catch (error) {
      showError(error);
    }
    return undefined;
  };

  /* ---------------------------------------------------------- editing */

  /** Imports an image file and shows it in an image widget. */
  const importImage = async (nodeId) => {
    try {
      const file = await host.pickImage();
      if (!file) return;
      const extension = extensionOf(file);
      const base64 = await host.readBase64(file);
      const decoded = await decodeImage(base64, extension);
      if (decoded.w > MAX_IMAGE_SIZE || decoded.h > MAX_IMAGE_SIZE) {
        showError(t("image.tooLarge", { w: decoded.w, h: decoded.h, max: MAX_IMAGE_SIZE }));
        return;
      }
      addImportedImage(nodeId, file, decoded, base64);
    } catch (error) {
      showError(error);
    }
  };

  /** Reads a font file into the project, set to the language of the window when it has one. */
  const importFontFile = async (file) => {
    const base64 = await host.readBase64(file);
    const bytes = base64ToBytes(base64);
    const name = fontNameFor(store.get(), file);
    try {
      addFont(name, { bytes, base64 });
    } catch {
      throw new Error(t("font.bad", { file }));
    }
    const { info } = fontData(name);
    const wanted = FONT_LANGUAGES.find((item) => item.id === language)?.id;
    const face = wanted ? faceForLanguage(info, wanted, 0) : 0;
    store.update((draft) => {
      draft.fonts = [...(draft.fonts ?? []), { name, file: `assets/fonts/${name}.${extensionOf(file)}`, face, ...(info.faces[face].languages.includes(wanted) ? { language: wanted } : {}) }];
    });
    log(t("font.added", { name: info.faces[face].full }));
    return name;
  };

  const importFont = async () => {
    try {
      const file = await host.pickFont();
      if (file) await importFontFile(file);
    } catch (error) {
      showError(error);
    }
  };

  const addImportedImage = (nodeId, file, decoded, base64) => {
    const name = imageNameFor(store.get(), file);
    addImage(name, { ...decoded, base64 });
    store.update((draft) => {
      draft.images.push({ name, file: `assets/images/${name}.${extensionOf(file)}`, w: decoded.w, h: decoded.h });
      const node = findNode(draft, nodeId);
      if (node) {
        node.props.src = name;
        delete node.props.width;
        delete node.props.height;
      }
    });
  };

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
      // Over the screen it can be dropped; anywhere else it cannot.
      setDragCursor(surface.current?.dropTarget(event.clientX, event.clientY) ? "copy" : "no-drop");
      setGhost({ type, x: event.clientX, y: event.clientY });
    };
    const up = (event) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      clearDragCursor();
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
    if (!isWidget) return;
    clipboard.current = structuredClone(selectedNode);
    setHasClipboard(true);
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

  const togglePanel = useCallback((key) => {
    setCollapsed((state) => {
      const next = { ...state, [key]: !state[key] };
      void host.saveSettings({ collapsed: next });
      return next;
    });
  }, []);

  const folds = useMemo(() => ({ collapsed, toggle: togglePanel }), [collapsed, togglePanel]);

  const toggleRulers = () => {
    setRulers((value) => {
      void host.saveSettings({ rulers: !value });
      return !value;
    });
  };

  /** Desktop: the project runs in a window of its own, on a copy of the document. */
  const toggleRunWindow = async () => {
    if (runOpen) {
      await host.runClose();
      return;
    }
    const document = store.get();
    const images = (document.images ?? []).flatMap((image) => {
      const data = imageData(image.name);
      return data?.base64 ? [{ name: image.name, file: image.file, base64: data.base64 }] : [];
    });
    const fontList = (document.fonts ?? []).flatMap((font) => {
      const data = fontData(font.name);
      return data?.base64 ? [{ name: font.name, base64: data.base64 }] : [];
    });
    const scale = runScale(document.device.w);
    try {
      await host.runOpen({ project: document, images, fonts: fontList }, Math.max(320, document.device.w * scale), document.device.h * scale + RUN_TITLE_HEIGHT);
      setRunOpen(true);
      log(t("log.runStart"));
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    const offLog = host.on("run-log", (line) => log(line));
    const offClosed = host.on("run-closed", () => {
      setRunOpen(false);
      log(t("log.runStop"));
    });
    return () => {
      offLog();
      offClosed();
    };
  }, [log, t]);

  const toggleRun = () => {
    if (isDesktop) {
      void toggleRunWindow();
      return;
    }
    setMode((value) => {
      log(t(value === "run" ? "log.runStop" : "log.runStart"));
      return value === "run" ? "design" : "run";
    });
    setView((value) => (value === "code" ? "design" : value));
  };

  /** Changing the version redraws with its engine; the controls and the code follow the project. */
  const changeVersion = (version) => {
    setPopup(null);
    if (version === store.get().lvgl) return;
    store.update((draft) => {
      draft.lvgl = version;
    });
    log(t("log.versionChanged", { version }));
    if (findProblems(store.get(), { installed }).some((problem) => problem.severity === "error")) {
      setBottomTab("problems");
      setCollapsed((state) => ({ ...state, bottom: false }));
    }
  };

  /** An edit in the code view: the design follows when the code can be read. */
  const applyCode = (file, text) => {
    const result = applyCodeEdit(store.get(), file, text);
    if (result.changed) {
      store.update((draft) => {
        for (const key of Object.keys(draft)) delete draft[key];
        Object.assign(draft, structuredClone(result.project));
      }, { coalesce: `code:${file}` });
    }
    return result;
  };

  /** The screen size from the toolbar. Consecutive edits of the fields are one undo step. */
  const changeDevice = (device, coalesce = null) => {
    const next = normalDevice(device);
    store.update((draft) => {
      if (sameDevice(draft.device, next)) return false;
      draft.device = next;
      return undefined;
    }, { coalesce });
  };

  const goToCode = (problem) => {
    const current = store.get();
    const focus = problem.file
      ? { file: problem.file, line: problem.line }
      : locateInCode(generateCode(current, { imageData: false }), cNames(current).get(problem.node) ?? "");
    if (!focus) return;
    setCodeFocus({ ...focus, at: Date.now() });
    setView((value) => (value === "design" ? "split" : value));
  };

  const chooseProblem = (problem) => {
    setChosenProblem(problem.key);
    if (problem.node) {
      select(problem.node);
      if (view !== "design" && problem.hasCode) goToCode(problem);
    } else if (problem.file) {
      goToCode(problem);
    }
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
      await host.nativeRun(current.lvgl, generateCode(current), fontFiles(current, `native:${current.lvgl}`));
      markFontsWritten(current, `native:${current.lvgl}`);
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
      setDialog({
        kind: "confirm",
        message: t("native.needTools", { tools: missing.join(", ") }),
        yesLabel: t("cmd.manager").replace("…", ""),
        onYes: () => setDialog({ kind: "manager" }),
      });
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

  // Ctrl + wheel over the surface zooms around the pointer: what is under it stays under it.
  const zoomAnchor = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const wheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = zoomRef.current;
      const next = event.deltaY < 0 ? ZOOMS.find((value) => value > current) : [...ZOOMS].reverse().find((value) => value < current);
      if (!next) return;
      const canvas = element.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      if (rect) zoomAnchor.current = { clientX: event.clientX, clientY: event.clientY, x: (event.clientX - rect.left) / current, y: (event.clientY - rect.top) / current };
      setZoom(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [showStart]);
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const element = viewport.current;
    zoomAnchor.current = null;
    const rect = element?.querySelector("canvas")?.getBoundingClientRect();
    if (!anchor || !rect) return;
    element.scrollLeft += rect.left + anchor.x * zoom - anchor.clientX;
    element.scrollTop += rect.top + anchor.y * zoom - anchor.clientY;
  }, [zoom]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const update = (event) => element.classList.toggle("zooming", event.ctrlKey || event.metaKey);
    const clear = () => element.classList.remove("zooming");
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    // A key released in another window is never heard here; the next move tells the truth.
    window.addEventListener("pointermove", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("pointermove", update);
      window.removeEventListener("blur", clear);
    };
  }, [showStart]);

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
    const horizontal = key === "left" || key === "right" || key === "code";
    const limit = key === "code" ? [220, Math.max(220, (start.currentTarget.parentElement?.clientWidth ?? 800) - 225)] : horizontal ? [200, 520] : key === "tree" || key === "explorer" ? [60, Math.max(60, (start.currentTarget.parentElement?.clientHeight ?? 300) - 120)] : [80, 480];
    let latest = from;
    setDragCursor(horizontal ? "col-resize" : "row-resize");
    const move = (event) => {
      const delta = horizontal ? event.clientX - start.clientX : event.clientY - start.clientY;
      latest = Math.max(limit[0], Math.min(limit[1], from + sign * delta));
      setSizes((state) => ({ ...state, [key]: latest }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      clearDragCursor();
      setSizes((state) => {
        void host.saveSettings({ panels: state });
        return state;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------------------------------------------------- the tutorial */
  const [touring, setTouring] = useState(false);
  const [tutorialRan, setTutorialRan] = useState(false);
  // Any other screen ends the question.
  useEffect(() => {
    if (!showStart) setDialog((current) => (current?.kind === "tutorialAsk" ? null : current));
  }, [showStart]);
  const beginTutorial = () => {
    setDialog(null);
    guardUnsaved(() => {
      load(tutorialProject(), null);
      setTutorialRan(false);
      setTouring(true);
    });
  };
  const prepareTutorialStep = (step) => {
    setView(step.view);
    // Only the step about running has the program running.
    if ((runOpen || running) && !tasksOf(step).some((task) => task.run)) commands.current.run.run();
    const chosen = stepSelection(store.get(), step);
    select(chosen);
    // A step about the code opens the file of what it talks about.
    if (step.view === "split") {
      const found = locateInCode(generateCode(store.get(), { imageData: false }), cNames(store.get()).get(chosen) ?? "");
      if (found) setCodeFocus({ ...found, at: Date.now() });
    }
  };
  const finishTutorialStep = (step) => {
    if (tasksOf(step).some((task) => task.run)) {
      if (!tutorialRan) commands.current.run.run();
      return;
    }
    store.update((draft) => finishStep(draft, step));
    select(stepSelection(store.get(), step));
  };
  // Starting the program once ticks off its task, whichever way it was started.
  useEffect(() => {
    if (touring && (runOpen || running)) setTutorialRan(true);
  }, [touring, runOpen, running]);

  /* ---------------------------------------------------------- commands */

  const designing = !showStart;
  const editing = designing && !running;
  const siblings = isWidget ? findParent(project, selected)?.children ?? [] : [];
  const siblingIndex = siblings.findIndex((child) => child.id === selected);
  const zoomStep = (direction) => (direction > 0 ? ZOOMS.find((value) => value > zoom) : [...ZOOMS].reverse().find((value) => value < zoom));

  const c = {
    new: { id: "new", icon: "new", label: t("cmd.new"), keys: "Ctrl+N", run: cmdNew },
    open: { id: "open", icon: "open", label: t("cmd.open"), keys: "Ctrl+O", run: cmdOpen },
    save: { id: "save", icon: "save", label: t("cmd.save"), keys: "Ctrl+S", disabled: !store.dirty && !!path, run: cmdSave },
    saveAs: { id: "saveAs", icon: "save", label: t("cmd.saveAs"), keys: "Ctrl+Shift+S", run: cmdSaveAs },
    undo: { id: "undo", icon: "undo", label: t("cmd.undo"), keys: "Ctrl+Z", disabled: !store.canUndo || !editing, run: store.undo },
    redo: { id: "redo", icon: "redo", label: t("cmd.redo"), keys: "Ctrl+Y", disabled: !store.canRedo || !editing, run: store.redo },
    cut: {
      id: "cut",
      icon: "cut",
      label: t("cmd.cut"),
      keys: "Ctrl+X",
      disabled: !isWidget || !editing,
      run: () => {
        cmdCopy();
        cmdDelete();
      },
    },
    copy: { id: "copy", icon: "copy", label: t("cmd.copy"), keys: "Ctrl+C", disabled: !isWidget || !editing, run: cmdCopy },
    paste: { id: "paste", icon: "paste", label: t("cmd.paste"), keys: "Ctrl+V", disabled: !hasClipboard || !editing, run: cmdPaste },
    duplicate: { id: "duplicate", icon: "duplicate", label: t("cmd.duplicate"), keys: "Ctrl+D", disabled: !isWidget || !editing, run: cmdDuplicate },
    delete: { id: "delete", icon: "delete", label: t("cmd.delete"), keys: "Del", disabled: !editing || !selectedNode || (!isWidget && project.screens.length < 2), run: cmdDelete },
    forward: { id: "forward", icon: "forward", label: t("cmd.forward"), disabled: !isWidget || !editing || siblingIndex >= siblings.length - 1, run: () => reorder(1) },
    backward: { id: "backward", icon: "backward", label: t("cmd.backward"), disabled: !isWidget || !editing || siblingIndex <= 0, run: () => reorder(-1) },
    run: { id: "run", icon: running || runOpen ? "stop" : "run", label: t(running || runOpen ? "cmd.stop" : "cmd.run"), keys: "F5", disabled: !designing && !runOpen, pressed: running || runOpen, run: toggleRun },
    cleanBuild: {
      id: "cleanBuild",
      icon: "delete",
      label: t("cmd.cleanBuild", { version: project.lvgl }),
      disabled: native !== "idle" || !isDesktop,
      run: () => setDialog({
        kind: "confirm",
        message: t("cmd.cleanBuildAsk", { version: project.lvgl }),
        yesLabel: t("cmd.delete"),
        onYes: async () => {
          try {
            await host.nativeClean(project.lvgl);
            setBuildLines([]);
            log(t("log.buildCleaned", { version: project.lvgl }));
          } catch (error) {
            showError(error);
          }
        },
      }),
    },
    samples: { id: "samples", icon: "samples", label: t("cmd.samples"), run: () => setDialog({ kind: "samples" }) },
    code: { id: "code", icon: "code", label: t("view.code"), disabled: !designing, pressed: view !== "design", run: () => setView((value) => (value === "design" ? "split" : "design")) },
    panelLeft: { id: "panelLeft", icon: "panelLeft", label: t("panel.toggleLeft"), disabled: !designing, pressed: !collapsed.left, run: () => togglePanel("left") },
    panelRight: { id: "panelRight", icon: "panelRight", label: t("panel.toggleRight"), disabled: !designing, pressed: !collapsed.right, run: () => togglePanel("right") },
    panelBottom: { id: "panelBottom", icon: "panelBottom", label: t("panel.toggleBottom"), disabled: !designing, pressed: !collapsed.bottom, run: () => togglePanel("bottom") },
    rulers: { id: "rulers", icon: "ruler", label: t("cmd.rulers"), disabled: !designing, pressed: rulers, run: toggleRulers },
    native: { id: "native", icon: native === "idle" ? "native" : "stop", label: t(native === "idle" ? "cmd.nativeRun" : "cmd.nativeStop"), keys: "Shift+F5", disabled: !designing && native === "idle", pressed: native !== "idle", run: cmdNative },
    settings: { id: "settings", icon: "project", label: t("cmd.settings"), run: () => setDialog({ kind: "settings" }) },
    lvConf: { id: "lvconf", icon: "conf", label: t("cmd.lvConf"), run: () => setDialog({ kind: "lvconf" }) },
    fonts: { id: "fonts", icon: "fontFile", label: t("cmd.fonts"), run: () => setDialog({ kind: "fonts" }) },
    manager: { id: "manager", icon: "manager", label: t("cmd.manager"), run: () => setDialog({ kind: "manager" }) },
    about: { id: "about", icon: "about", label: t("cmd.about"), run: () => setDialog({ kind: "about" }) },
    tutorial: { id: "tutorial", icon: "tutorial", label: t("cmd.tutorial"), run: beginTutorial },
    guide: { id: "guide", icon: "guide", label: t("cmd.guide"), keys: "F1", run: () => {
      if (!focusPopout("guide")) setGuideOpen(true);
    } },
    start: { id: "start", icon: "home", label: t("start.title"), pressed: showStart, run: () => setShowStart((value) => !value) },
    preferences: { id: "preferences", icon: "settings", label: t("cmd.preferences"), run: () => setDialog({ kind: "preferences" }) },
    exit: { id: "exit", icon: "close", label: t("cmd.exit"), run: () => guardUnsaved(() => host.close()) },
    zoomIn: { id: "zoomIn", icon: "zoomIn", label: t("cmd.zoomIn"), keys: "Ctrl++", disabled: !designing || !zoomStep(1), run: () => stepZoom(1) },
    zoomOut: { id: "zoomOut", icon: "zoomOut", label: t("cmd.zoomOut"), keys: "Ctrl+-", disabled: !designing || !zoomStep(-1), run: () => stepZoom(-1) },
    zoomFit: { id: "zoomFit", icon: "zoomFit", label: t("cmd.zoomFit"), keys: "Ctrl+0", disabled: !designing, run: fitZoom },
  };

  const menus = [
    { id: "file", items: [c.new, c.open, c.samples, "-", c.save, c.saveAs, "-", c.exit] },
    { id: "edit", items: [c.undo, c.redo, "-", c.cut, c.copy, c.paste, c.duplicate, c.delete, "-", c.forward, c.backward] },
    { id: "view", items: [c.start, "-", c.panelLeft, c.panelBottom, c.panelRight, c.rulers, c.code, "-", c.zoomIn, c.zoomOut, c.zoomFit] },
    { id: "run", items: [c.run, c.native, "-", c.cleanBuild] },
    { id: "tools", items: [c.settings, c.fonts, c.lvConf, c.manager, "-", c.preferences] },
    { id: "help", items: [c.tutorial, c.guide, "-", c.about] },
  ];

  const toolbarGroups = [
    [c.new, c.open, c.save],
    [c.undo, c.redo],
    [c.copy, c.paste, c.duplicate, c.delete],
    [c.backward, c.forward],
    [c.run, c.native, c.code],
    [c.settings, c.fonts, c.lvConf, c.manager],
    [c.panelLeft, c.panelBottom, c.panelRight, c.rulers],
  ];

  // The window can never be narrower than its menu row and toolbar: nothing there hides or clips.
  const measureMinimum = useCallback(() => {
    const row = (selector, skip) => {
      const element = document.querySelector(selector);
      if (!element) return 0;
      const style = getComputedStyle(element);
      const kids = Array.from(element.children).filter((child) => !skip?.(child) && getComputedStyle(child).display !== "none");
      const widths = kids.reduce((sum, child) => {
        const own = getComputedStyle(child);
        return sum + child.getBoundingClientRect().width + (Number.parseFloat(own.marginRight) || 0) + (child.classList.contains("toolbar-end") || child.classList.contains("window-controls") ? 0 : Number.parseFloat(own.marginLeft) || 0);
      }, 0);
      return widths + (Number.parseFloat(style.columnGap) || 0) * Math.max(0, kids.length - 1) + (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    };
    // The file name may shorten, so only a little of it counts.
    const needed = Math.ceil(Math.max(row(".menubar", (child) => child.classList.contains("title-file")) + 60, row(".toolbar")) + WINDOW_EDGE);
    document.documentElement.style.setProperty("--app-min-width", `${needed}px`);
    minimumWidth.current = needed;
    void host.setMinimumSize(needed, MIN_WINDOW_HEIGHT);
  }, []);

  useEffect(() => {
    measureMinimum();
    // Web fonts change every width once they arrive.
    document.fonts?.ready.then(measureMinimum);
    const observer = new ResizeObserver(measureMinimum);
    for (const selector of [".toolbar-info", ".toolbar-end", ".app-title", ".tool-group"]) {
      for (const element of document.querySelectorAll(selector)) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [language, measureMinimum]);

  /** What a right click offers, by what is under the pointer. */
  const contextItems = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return null;
    const field = target.closest("input:not([type=color]):not([type=checkbox]), textarea");
    if (field) return textFieldItems(t, field);
    const logView = target.closest("[data-log]");
    if (logView) {
      const clear = () => (logView.dataset.log === "build" ? setBuildLines([]) : setLogLines([]));
      return readOnlyTextItems(t, logView, ["-", { id: "log-clear", icon: "delete", label: t("cmd.clearLog"), run: clear }]);
    }
    const code = target.closest("[data-code]");
    if (code) return readOnlyTextItems(t, code);
    if (target.closest("[data-overlay=run]")) return [c.run, c.native];
    // Every control of this LVGL version, grouped as in the panel.
    const addControls = (place) => ({
      id: "add-control",
      icon: "add",
      label: t("cmd.addControl"),
      disabled: !editing,
      children: PALETTE.map(({ group, items }) => ({ group, items: items.filter((type) => availableIn(type, project.lvgl)) })).map(({ group, items }) => ({
        id: `add-group-${group}`,
        icon: WIDGETS[items[0]].icon,
        label: t(`palette.${group}`),
        children: items.map((type) => ({ id: `add-${type}`, icon: WIDGETS[type].icon, label: t(`widget.${type}`), run: () => place(type) })),
      })),
    });
    const editItems = [c.cut, c.copy, c.paste, c.duplicate, c.delete, "-", c.forward, c.backward, "-", c.undo, c.redo];
    const row = target.closest("[data-tree]");
    if (row) {
      select(row.dataset.tree);
      const node = findNode(project, row.dataset.tree);
      const parentId = node && CONTAINERS.has(node.type) ? node.id : findParent(project, row.dataset.tree)?.id ?? activeScreen.id;
      return [addControls((type) => addWidget(type, parentId, { x: 10, y: 10 })), "-", ...editItems];
    }
    if (target.closest("[data-overlay=design]")) {
      const node = surface.current?.hitAt(event.clientX, event.clientY);
      if (node) select(node.id);
      const drop = surface.current?.dropTarget(event.clientX, event.clientY);
      const place = (type) => (drop ? addWidget(type, drop.parentId, { x: drop.x, y: drop.y }) : addFromPalette(type));
      return [addControls(place), "-", ...editItems, "-", c.zoomIn, c.zoomOut, c.zoomFit, "-", c.code, c.run, c.settings];
    }
    const tab = target.closest(".screen-tab");
    if (tab) {
      const id = tab.querySelector("[data-screen-tab]")?.dataset.screenTab;
      if (id) select(id);
      return [
        { id: "screen-add", icon: "add", label: t("screen.add"), disabled: running, run: cmdAddScreen },
        { id: "screen-remove", icon: "delete", label: t("screen.remove"), disabled: running || project.screens.length < 2, run: () => removeScreen(id) },
      ];
    }
    const paletteItem = target.closest("[data-palette]");
    if (paletteItem) {
      const type = paletteItem.dataset.palette;
      return [{ id: "palette-add", icon: WIDGETS[type].icon, label: `${t("cmd.addWidget")}: ${t(`widget.${type}`)}`, disabled: running, run: () => addFromPalette(type) }];
    }
    if (target.closest("[data-dialog]")) return null;
    return [c.new, c.open, c.samples, c.save, "-", c.start, c.settings, c.manager, c.preferences, "-", c.about];
  };

  // A right click on the design bar or the panel background also offers the controls.
  const onContextMenu = (event) => {
    event.preventDefault();
    const items = contextItems(event);
    setContextMenu(items ? { x: event.clientX, y: event.clientY, items } : null);
  };

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
      if (event.key === "F1") return fire(cmd.guide);
      if (event.key === "F5") return fire(event.shiftKey ? cmd.native : cmd.run);
      if (event.ctrlKey || event.metaKey) {
        const letter = event.key.toLowerCase();
        if (letter === "s") return fire(event.shiftKey ? cmd.saveAs : cmd.save);
        if (letter === "n") return fire(cmd.new);
        if (letter === "o") return fire(cmd.open);
        if (typing) return undefined;
        if (letter === "=" || letter === "+") return fire(cmd.zoomIn);
        if (letter === "-") return fire(cmd.zoomOut);
        if (letter === "0") return fire(cmd.zoomFit);
        if (letter === "z") return fire(event.shiftKey ? cmd.redo : cmd.undo);
        if (letter === "y") return fire(cmd.redo);
        if (letter === "x") return fire(cmd.cut);
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
      dialog: () => dialog?.kind ?? (guideOpen ? "guide" : null),
      showDialog: (next) => setDialog(next),
      command: (id) => commands.current[id]?.run(),
      selected: () => selected,
      engine: () => surface.current?.engine(),
      box: (id) => surface.current?.boxes().get(id) ?? null,
      canvas: () => surface.current?.canvas(),
      zoom: () => zoom,
      addTestImage: (nodeId, file, w, h, r, g, b) => {
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < rgba.length; i += 4) rgba.set([r, g, b, 255], i);
        const canvas = new OffscreenCanvas(w, h);
        canvas.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
        return canvas.convertToBlob({ type: "image/png" }).then(async (blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          addImportedImage(nodeId, file, { w, h, rgba }, btoa(String.fromCharCode(...bytes)));
        });
      },
      themeId: () => themeId,
      showStart: () => showStart,
      start: () => start,
      recent: () => recent,
      general: () => general,
      problems: () => problems,
      codeFocus: () => codeFocus,
      minimumWidth: () => minimumWidth.current,
      resetForTest: () => {
        load(newProject(), null);
        setShowStart(true);
      },
      runOpen: () => runOpen,
      importFont: (file) => importFontFile(file),
      openFile: (file) => openFile(file),
      collapsed: () => collapsed,
      contextMenu: () => contextMenu,
      language: () => language,
    };
  });

  const code = useMemo(() => (view === "design" ? null : generateCode(project, { imageData: false })), [project, view]);
  const problems = useMemo(() => [...parseBuildProblems(buildLines.map((line) => line.text)), ...findProblems(project, { installed })], [project, installed, buildLines]);
  const problemCounts = { error: 0, warning: 0, info: 0 };
  for (const problem of problems) problemCounts[problem.severity]++;

  const dragTitlebar = (event) => {
    if (event.button === 0 && !(event.target instanceof Element && event.target.closest("button"))) {
      if (event.detail === 2) host.toggleMaximize();
      else host.startDrag();
    }
  };

  const fileName = path ? path.split(/[\\/]/).pop() : project.name;
  const projectFile = path ? fileName : `${project.name}.${FILE_EXTENSION}`;

  // The project as a folder: what saving writes, also before it is saved for the first time.
  const explorerPaths = useMemo(() => {
    if (showStart || collapsed.left || collapsed.explorer) return [];
    return [projectFile, ...Object.keys(generateCode(project, { imageData: false })), ...(project.images ?? []).map((image) => image.file), ...(project.fonts ?? []).map((font) => font.file)];
  }, [project, projectFile, showStart, collapsed.left, collapsed.explorer]);

  // Files the code view shows but does not generate.
  const extraFiles = useMemo(() => {
    if (view === "design") return {};
    const files = { [projectFile]: { text: serializeProject(project) } };
    for (const image of project.images ?? []) {
      const data = imageData(image.name);
      const extension = extensionOf(image.file);
      const type = extension === "jpg" ? "jpeg" : extension === "svg" ? "svg+xml" : extension;
      files[image.file] = data?.base64 ? { image: `data:image/${type};base64,${data.base64}` } : { text: t("image.missing", { file: image.file }) };
    }
    for (const font of project.fonts ?? []) {
      const data = fontData(font.name);
      files[font.file] = {
        text: data
          ? [font.file, `${(data.bytes.length / 1048576).toFixed(1)} MB`, "", ...data.info.faces.map((face) => `${face.index === font.face ? "* " : "  "}${face.index}: ${face.full}  (${face.languages.join(", ")})`)].join("\n")
          : t("font.fileGone", { file: font.file }),
      };
    }
    return files;
  }, [project, projectFile, t, view]);
  const [openName, setOpenName] = useState(null);


  /** Opens a file of the explorer in the code view; a screen's file also shows that screen. */
  const openFromExplorer = (file) => {
    setView((value) => (value === "design" ? "split" : value));
    setCodeFocus({ file, line: null, at: Date.now() });
    const names = cNames(project);
    const screen = project.screens.find((item) => `src/ui/screens/${names.get(item.id)}.c` === file);
    if (screen) select(screen.id);
  };
  const status = runOpen ? t("status.run") : native === "building" ? t("status.building") : native === "running" ? t("status.native") : running ? t("status.run") : t("status.design");

  return (
    <div className="app" onContextMenu={onContextMenu}>
      <div className="menubar" onPointerDown={dragTitlebar}>
        <span className="app-title">
          <img src={appIcon} alt="" />
          <strong>My LVGL Studio</strong>
          <span className="app-version">1.0.0</span>
          <button type="button" className={showStart ? "start-toggle active" : "start-toggle"} data-command="start" title={t("start.title")} aria-pressed={showStart} onClick={c.start.run}>
            <Icon name="home" size={14} />
            <span>{t("start.short")}</span>
          </button>
        </span>
        {menus.map((menu) => (
          <Menu
            key={menu.id}
            id={menu.id}
            icon={MENU_ICONS[menu.id]}
            label={t(`menu.${menu.id}`)}
            open={openMenu === menu.id}
            onOpen={setOpenMenu}
            onHover={(id) => openMenu && setOpenMenu(id)}
            items={menu.items}
          />
        ))}
        {!showStart && <span className="title-file" data-title-file="">{fileName}{store.dirty ? " •" : ""}</span>}
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
        <span className="tool-group toolbar-info">
          <i className="tool-sep" />
          <div className="popup-host">
            <button type="button" className={popup === "version" ? "version-chip active" : "version-chip"} data-command="version-chip" disabled={!designing} aria-haspopup="menu" aria-expanded={popup === "version"} title={t("version.change")} onClick={() => setPopup(popup === "version" ? null : "version")}>
              <Icon name="manager" size={14} /> LVGL {project.lvgl} <Icon name="dropDown" size={12} />
            </button>
            {popup === "version" && (
              <div className="menu-pop version-pop" role="menu" data-version-menu="">
                {versionChoices(t, installed, project.lvgl).map((item) => (
                  <button type="button" key={item.value} role="menuitem" data-version={item.value} title={t("version.switchTo", { version: item.value })} className={item.value === project.lvgl ? "selected" : undefined} onClick={() => changeVersion(item.value)}>
                    <Icon name={item.value === project.lvgl ? "check" : "manager"} />
                    <span className="menu-label">{item.label}</span>
                    <span className="menu-note">{item.note}</span>
                  </button>
                ))}
                <div className="sep" />
                <button type="button" role="menuitem" data-command="version-manager" onClick={() => { setPopup(null); setDialog({ kind: "manager" }); }}>
                  <Icon name="manager" />
                  <span className="menu-label">{t("cmd.manager")}</span>
                </button>
              </div>
            )}
          </div>
          <div className="popup-host">
            <button type="button" className={popup === "device" ? "version-chip active" : "version-chip"} data-command="device-chip" disabled={!designing} aria-haspopup="menu" aria-expanded={popup === "device"} title={t("device.change")} onClick={() => setPopup(popup === "device" ? null : "device")}>
              <Icon name="device" size={14} /> {project.device.shape === "round" ? "◯ " : ""}{project.device.w}×{project.device.h} <Icon name="dropDown" size={12} />
            </button>
            {popup === "device" && (
              <div className="menu-pop version-pop device-pop" role="menu" data-device-menu="">
                {DEVICES.map((device) => {
                  const current = sameDevice(device, project.device);
                  return (
                    <button type="button" key={device.id} role="menuitem" data-device={device.id} className={current ? "selected" : undefined} onClick={() => { changeDevice(device); setPopup(null); }}>
                      <Icon name={current ? "check" : "device"} />
                      <span className="menu-label">{t(`device.${device.id}`)}</span>
                    </button>
                  );
                })}
                <div className="sep" />
                <div className="device-custom" data-device-custom="">
                  <span>{t("settings.width")}</span>
                  <Stepper id="toolbarDeviceW" unit="px" value={project.device.w} min={32} max={4096} onChange={(w) => changeDevice({ ...project.device, w }, "toolbar:w")} />
                  <span>{t("settings.height")}</span>
                  <Stepper id="toolbarDeviceH" unit="px" value={project.device.h} min={32} max={4096} onChange={(h) => changeDevice(project.device.shape === "round" ? { ...project.device, w: h } : { ...project.device, h }, "toolbar:h")} />
                </div>
                <button type="button" role="menuitem" data-command="device-round" aria-pressed={project.device.shape === "round"} onClick={() => changeDevice(project.device.shape === "round" ? { w: project.device.w, h: project.device.h } : { w: Math.min(project.device.w, project.device.h), h: Math.min(project.device.w, project.device.h), shape: "round" })}>
                  <Icon name={project.device.shape === "round" ? "check" : "device"} />
                  <span className="menu-label">{t("device.roundToggle")}</span>
                </button>
                <button type="button" role="menuitem" data-command="device-swap" onClick={() => changeDevice({ ...project.device, w: project.device.h, h: project.device.w })}>
                  <Icon name="device" />
                  <span className="menu-label">{t("device.swap")}</span>
                </button>
              </div>
            )}
          </div>
          <span className="zoom-box">
            <button type="button" className="mini" data-command="zoomOut" disabled={c.zoomOut.disabled} aria-label={c.zoomOut.label} title={c.zoomOut.label} onClick={c.zoomOut.run}><Icon name="zoomOut" size={14} /></button>
            <span className="popup-host">
              <button type="button" className={popup === "zoom" ? "zoom-value active" : "zoom-value"} data-zoom="" disabled={!designing} aria-haspopup="menu" aria-expanded={popup === "zoom"} title={t("zoom.choose")} onClick={() => setPopup(popup === "zoom" ? null : "zoom")}>{Math.round(zoom * 100)}%</button>
              {popup === "zoom" && (
                <div className="menu-pop zoom-pop" role="menu" data-zoom-menu="">
                  {ZOOMS.map((value) => (
                    <button type="button" key={value} role="menuitem" data-zoom-value={value} className={value === zoom ? "selected" : undefined} onClick={() => { setZoom(value); setPopup(null); }}>
                      <Icon name={value === zoom ? "check" : "zoomIn"} />
                      <span className="menu-label">{Math.round(value * 100)}%</span>
                    </button>
                  ))}
                  <div className="sep" />
                  <button type="button" role="menuitem" data-zoom-value="fit" onClick={() => { fitZoom(); setPopup(null); }}>
                    <Icon name="zoomFit" />
                    <span className="menu-label">{t("cmd.zoomFit")}</span>
                  </button>
                </div>
              )}
            </span>
            <button type="button" className="mini" data-command="zoomIn" disabled={c.zoomIn.disabled} aria-label={c.zoomIn.label} title={c.zoomIn.label} onClick={c.zoomIn.run}><Icon name="zoomIn" size={14} /></button>
            <button type="button" className="mini" data-command="zoomFit" disabled={c.zoomFit.disabled} aria-label={c.zoomFit.label} title={c.zoomFit.label} onClick={c.zoomFit.run}><Icon name="zoomFit" size={14} /></button>
          </span>
        </span>
        <div className="toolbar-end">
          <div className="popup-host">
            <button type="button" className={popup === "theme" ? "tool active" : "tool"} data-command="theme" aria-label={t("cmd.theme")} title={t("cmd.theme")} onClick={() => setPopup(popup === "theme" ? null : "theme")}><Icon name="theme" /></button>
            {popup === "theme" && (
              <div className="menu-pop theme-pop" role="menu">
                <div className="theme-pop-top" data-theme-group="top">
                  {customThemes.map((item) => (
                    <button type="button" key={item.id} role="menuitem" data-theme-id={item.id} className={item.id === themeId ? "selected" : undefined} onClick={() => changeTheme(item.id)}>
                      <span className="swatches">{[item.colors.bg, item.colors.panel, item.colors.accent].map((color, index) => <i key={index} style={{ background: color }} />)}</span>
                      <span className="menu-label">{item.name}</span>
                    </button>
                  ))}
                  <button type="button" role="menuitem" data-command="theme-settings" onClick={() => { setPopup(null); setDialog({ kind: "preferences", tab: "theme" }); }}>
                    <Icon name="settings" />
                    <span className="menu-label">{t("start.themeSettings")}</span>
                  </button>
                </div>
                <div className="theme-pop-columns">
                  {["dark", "light"].map((themeMode) => (
                    <section key={themeMode} data-theme-column={themeMode}>
                      <h4>{t(`theme.${themeMode}`)}</h4>
                      {THEMES.filter((item) => item.mode === themeMode).map((item) => (
                        <button type="button" key={item.id} role="menuitem" data-theme-id={item.id} className={item.id === themeId ? "selected" : undefined} onClick={() => changeTheme(item.id)}>
                          <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
                          <span className="menu-label">{language === "en" ? item.nameEn : item.nameKo}</span>
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" className="tool" data-command="language" aria-label={language === "en" ? "한국어" : "English"} title={language === "en" ? "한국어" : "English"} onClick={() => changeLanguage(language === "en" ? "ko" : "en")}>
            <Flag country={language === "en" ? "kr" : "gb"} />
          </button>
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
          onOpenSample={openSample}
          onSamples={c.samples.run}
          onRemoveRecent={forgetRecent}
          onClearRecent={() => {
            setRecent([]);
            void host.saveSettings({ recent: [] });
          }}
          onTheme={changeTheme}
          onPreferences={(tab) => setDialog({ kind: "preferences", tab })}
          onManager={c.manager.run}
          onTutorial={beginTutorial}
          onSettings={c.settings.run}
          onLanguage={() => changeLanguage(language === "en" ? "ko" : "en")}
          onAbout={c.about.run}
          onExit={c.exit.run}
        />
      )}

      <div className="workspace" style={{ display: showStart ? "none" : undefined, gridTemplateColumns: `${collapsed.left ? 30 : sizes.left}px ${collapsed.left ? 0 : 5}px minmax(0, 1fr) ${collapsed.right ? 0 : 5}px ${collapsed.right ? 30 : sizes.right}px`, gridTemplateRows: "minmax(0, 1fr)" }}>
        <div className="left-col">
          {collapsed.left ? (
            <button type="button" className="panel-strip" data-expand="left" title={t("panel.expand")} aria-label={t("panel.expand")} onClick={() => togglePanel("left")}>
              <Icon name="collapseRight" size={14} />
              <Icon name="open" />
              <span>{t("panel.explorer")}</span>
              <Icon name="grid" />
              <span>{t("panel.palette")}</span>
            </button>
          ) : (
            <div className="left-stack" style={{ gridTemplateRows: collapsed.explorer && collapsed.palette ? "auto auto 0 auto" : collapsed.explorer ? "auto auto 0 minmax(0, 1fr)" : collapsed.palette ? "auto minmax(0, 1fr) 0 auto" : `auto minmax(60px, ${sizes.explorer}px) 5px minmax(0, 1fr)` }}>
              <div className="right-head" data-panel-title="left">
                <Icon name="panelProject" />
                <span className="panel-title-text">{t("panel.project")}</span>
                <button type="button" className="mini" data-collapse="left" title={t("panel.collapseLeft")} aria-label={t("panel.collapseLeft")} onClick={() => togglePanel("left")}><Icon name="collapseLeft" size={14} /></button>
              </div>
              <section className="panel" data-panel="explorer">
                <PanelTitle t={t} id="explorer" icon="open" title={t("panel.explorer")} collapsed={collapsed.explorer} collapseIcon="collapseUp" expandIcon="collapseDown" onToggle={() => togglePanel("explorer")} />
                {!collapsed.explorer && <Explorer t={t} title={showStart ? "" : project.name} paths={explorerPaths} current={view === "design" ? null : openName} onOpen={openFromExplorer} />}
              </section>
              <div className="splitter h" data-splitter="explorer" style={collapsed.explorer || collapsed.palette ? { visibility: "hidden" } : undefined} onPointerDown={beginSplit("explorer", 1)} />
              <section className="panel" data-panel="palette">
                <PanelTitle t={t} id="palette" icon="grid" title={t("panel.palette")} collapsed={collapsed.palette} collapseIcon="collapseUp" expandIcon="collapseDown" onToggle={() => togglePanel("palette")} />
                {!collapsed.palette && <Palette t={t} version={project.lvgl} disabled={!editing} onDragStart={beginPaletteDrag} onAdd={addFromPalette} folds={folds} />}
              </section>
            </div>
          )}
        </div>
        <div className="splitter" data-splitter="left" style={collapsed.left ? { visibility: "hidden" } : undefined} onPointerDown={beginSplit("left", 1)} />

        <div className="center-col" style={{ gridTemplateRows: `minmax(0, 1fr) ${collapsed.bottom ? 0 : 5}px ${collapsed.bottom ? 29 : sizes.bottom}px` }}>
          <div className="center-top">
          <div className="design-bar">
            <div className="screen-tabs" ref={screenTabs}>
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
            </div>
            <button type="button" className="mini" data-command="add-screen" disabled={running} aria-label={t("screen.add")} title={t("screen.add")} onClick={cmdAddScreen}><Icon name="add" size={14} /></button>
            <span className="tab-nav">
              <button type="button" className="mini" data-command="tab-prev" disabled={activeIndex <= 0} aria-label={t("screen.prev")} title={t("screen.prev")} onClick={() => select(project.screens[activeIndex - 1].id)}><Icon name="collapseLeft" size={14} /></button>
              <button type="button" className="mini" data-command="tab-next" disabled={activeIndex >= project.screens.length - 1} aria-label={t("screen.next")} title={t("screen.next")} onClick={() => select(project.screens[activeIndex + 1].id)}><Icon name="collapseRight" size={14} /></button>
            </span>
          </div>
          <div className={`design-area view-${view}`}>
            <div className={rulers ? "ruled-view rulers-on" : "ruled-view"} data-rulers={rulers ? "" : undefined} style={rulers ? { gridTemplateColumns: `${RULER_SIZE}px minmax(0, 1fr)`, gridTemplateRows: `${RULER_SIZE}px minmax(0, 1fr)` } : undefined}>
            {rulers && (
              <>
                <span className="ruler-corner">px</span>
                <Ruler ref={rulerMarkerX} axis="x" length={rulerView.width} origin={rulerView.x} zoom={zoom} />
                <Ruler ref={rulerMarkerY} axis="y" length={rulerView.height} origin={rulerView.y} zoom={zoom} />
              </>
            )}
            <div className="viewport" ref={viewport} onPointerMove={movePointerLine} onPointerLeave={hidePointerLine}>
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
                snap={general.snap}
              />
            </div>
            </div>
            {code && <div className="splitter" data-splitter="code" role="separator" aria-orientation="vertical" onPointerDown={beginSplit("code", -1)} />}
            {code && <CodeView t={t} files={code} extra={extraFiles} focus={codeFocus} readOnly={!designing} onEdit={applyCode} width={sizes.code} onName={setOpenName} />}
          </div>
          </div>
          <div className="splitter h" data-splitter="bottom" style={collapsed.bottom ? { visibility: "hidden" } : undefined} onPointerDown={beginSplit("bottom", -1)} />
          <div className="bottom-panel">
            <div className="bottom-tabs">
              <button type="button" data-bottom="log" className={bottomTab === "log" ? "active" : undefined} onClick={() => setBottomTab("log")}><Icon name="log" /> {t("panel.log")}</button>
              <button type="button" data-bottom="build" className={bottomTab === "build" ? "active" : undefined} onClick={() => setBottomTab("build")}><Icon name="build" /> {t("panel.build")}</button>
              <button type="button" data-bottom="problems" className={bottomTab === "problems" ? "active" : undefined} title={t("problem.tabTip")} onClick={() => setBottomTab("problems")}>
                <Icon name="problems" /> {t("panel.problems")}
                {problemCounts.error + problemCounts.warning > 0 && <b className="problem-count" data-problem-count="" data-errors={problemCounts.error ? "" : undefined}>{problemCounts.error + problemCounts.warning}</b>}
              </button>
              <span className="bottom-actions">
                <button type="button" className="mini" data-command="clear-output" disabled={bottomTab === "problems" || (bottomTab === "log" ? logLines : buildLines).length === 0} title={t(bottomTab === "log" ? "cmd.clearLog" : "cmd.clearBuild")} aria-label={t(bottomTab === "log" ? "cmd.clearLog" : "cmd.clearBuild")} onClick={() => (bottomTab === "log" ? setLogLines([]) : setBuildLines([]))}><Icon name="clearOutput" size={14} /></button>
                <button type="button" className="mini" data-command="clean-build" disabled={c.cleanBuild.disabled} title={c.cleanBuild.label} aria-label={c.cleanBuild.label} onClick={c.cleanBuild.run}><Icon name="delete" size={14} /></button>
              </span>
              <button type="button" className="mini" data-collapse="bottom" title={t(collapsed.bottom ? "panel.expand" : "panel.collapse")} aria-label={t(collapsed.bottom ? "panel.expand" : "panel.collapse")} onClick={() => togglePanel("bottom")}><Icon name={collapsed.bottom ? "collapseUp" : "collapseDown"} size={14} /></button>
            </div>
            {collapsed.bottom ? null : bottomTab === "problems" ? (
              <ProblemsView t={t} problems={problems} chosen={chosenProblem} onChoose={chooseProblem} onControl={(problem) => { setChosenProblem(problem.key); select(problem.node); }} onCode={(problem) => { setChosenProblem(problem.key); if (problem.node) select(problem.node); goToCode(problem); }} onManager={() => setDialog({ kind: "manager" })} />
            ) : bottomTab === "log" ? <LogView id="log" lines={logLines} /> : <LogView id="build" lines={buildLines} />}
          </div>
        </div>
        <div className="splitter" data-splitter="right" style={collapsed.right ? { visibility: "hidden" } : undefined} onPointerDown={beginSplit("right", -1)} />

        {collapsed.right ? (
          <div className="right-col">
            <button type="button" className="panel-strip" data-expand="right" title={t("panel.expand")} aria-label={t("panel.expand")} onClick={() => togglePanel("right")}>
              <Icon name="collapseLeft" size={14} />
              <Icon name="list" />
              <span>{t("panel.tree")}</span>
              <Icon name="attributes" />
              <span>{t("panel.attributes")}</span>
            </button>
          </div>
        ) : (
          <div className="right-col" style={{ gridTemplateRows: collapsed.tree && collapsed.attributes ? "auto auto 0 auto" : collapsed.tree ? "auto auto 0 minmax(0, 1fr)" : collapsed.attributes ? "auto minmax(0, 1fr) 0 auto" : `auto minmax(60px, ${sizes.tree}px) 5px minmax(0, 1fr)` }}>
            <div className="right-head" data-panel-title="right">
              <Icon name="panelStructure" />
              <span className="panel-title-text">{t("panel.right")}</span>
              <button type="button" className="mini" data-collapse="right" title={t("panel.collapseRight")} aria-label={t("panel.collapseRight")} onClick={() => togglePanel("right")}><Icon name="collapseRight" size={14} /></button>
            </div>
            <section className="panel" data-panel="tree">
              <PanelTitle t={t} id="tree" icon="list" title={t("panel.tree")} collapsed={collapsed.tree} collapseIcon="collapseUp" expandIcon="collapseDown" onToggle={() => togglePanel("tree")} />
              {!collapsed.tree && <ComponentTree t={t} screen={activeScreen} selected={selected} onSelect={select} />}
            </section>
            <div className="splitter h" data-splitter="tree" style={collapsed.tree || collapsed.attributes ? { visibility: "hidden" } : undefined} onPointerDown={beginSplit("tree", 1)} />
            <section className="panel" data-panel="attributes">
              <PanelTitle t={t} id="attributes" icon="attributes" title={t("panel.attributes")} collapsed={collapsed.attributes} collapseIcon="collapseUp" expandIcon="collapseDown" onToggle={() => togglePanel("attributes")} />
              {!collapsed.attributes && <Attributes t={t} store={store} selected={selected} readOnly={running} onImportImage={importImage} onOpenFonts={() => setDialog({ kind: "fonts" })} folds={folds} />}
            </section>
          </div>
        )}

      </div>

      <div className="statusbar">
        <span className="status-cell" data-status="mode"><Icon name={running || native !== "idle" ? "run" : "design"} /><span>{status}</span></span>
        {!showStart && (
          <>
            <span className="status-cell" data-status="file"><span>{fileName} · {t(store.dirty ? "status.modified" : "status.saved")}</span></span>
            <span className={engineInfo.exact ? "status-cell" : "status-cell warn"} data-status="engine">
              <Icon name="manager" />
              <span>{engineInfo.exact ? `LVGL ${project.lvgl}` : t("status.engineClose", { engine: engineInfo.engine, version: project.lvgl })}</span>
            </span>
            <span className="status-cell" data-status="device"><Icon name="device" /><span>{project.device.shape === "round" ? "◯ " : ""}{project.device.w}×{project.device.h}</span></span>
            {selectedNode && <span className="status-cell" data-status="selection"><Icon name={WIDGETS[selectedNode.type].icon} /><span>{selectedNode.name}</span></span>}
          </>
        )}
        <span className="status-end">
          {isDesktop && (
            <button type="button" className="grip" aria-label="resize" onPointerDown={(event) => { event.preventDefault(); host.startResize(); }}>
              <GripDots />
            </button>
          )}
        </span>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={closeContextMenu} />}

      {ghost && (
        <div className="drag-ghost" data-ghost="" style={{ left: ghost.x + 8, top: ghost.y + 8 }}>
          <Icon name={WIDGETS[ghost.type].icon} /> {t(`widget.${ghost.type}`)}
        </div>
      )}

      {dialog?.kind === "samples" && (
        <SamplesDialog
          t={t}
          language={language}
          onOpen={(sample, directory) => {
            setDialog(null);
            openSample(sample, directory);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "preferences" && (
        <PreferencesDialog
          t={t}
          initialTab={dialog.tab}
          general={general}
          onGeneral={changeGeneral}
          onStartTutorial={beginTutorial}
          projectsDir={projectsDir}
          onProjectsDir={changeProjectsDir}
          rulers={rulers}
          onRulers={toggleRulers}
          recentCount={recent.length}
          onClearRecent={() => {
            setRecent([]);
            void host.saveSettings({ recent: [] });
          }}
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
      {dialog?.kind === "tutorialAsk" && showStart && <TutorialAsk t={t} ask={general.askTutorial} onAsk={(askTutorial) => changeGeneral({ askTutorial })} onStart={beginTutorial} onLater={() => setDialog(null)} />}
      {guideOpen && <GuideDialog language={language} onClose={() => setGuideOpen(false)} />}
      {touring && <Tutorial t={t} project={project} ran={tutorialRan} onPrepare={prepareTutorialStep} onFinishStep={finishTutorialStep} onClose={() => { setTouring(false); setView("design"); log(t("tutorial.closed")); }} />}
      {dialog?.kind === "fonts" && <FontsDialog t={t} store={store} onImport={importFont} onClose={() => setDialog(null)} />}
      {dialog?.kind === "lvconf" && <LvConfDialog t={t} store={store} installed={installed} onVersion={changeVersion} onClose={() => setDialog(null)} />}
      {dialog?.kind === "project" && (
        <NewProjectDialog
          t={t}
          saveOnly={dialog.saveOnly}
          initialName={dialog.name}
          initialLocation={dialog.location}
          initialVersion={general.newVersion}
          initialDevice={general.newDevice}
          installed={installed}
          onCreate={(choice) => createProjectFolder(choice, dialog.saveOnly)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "settings" && (
        <ProjectSettings t={t} store={store} installed={installed} onVersion={changeVersion} onClose={() => setDialog(null)} onManager={() => setDialog({ kind: "manager", back: "settings" })} onConf={() => setDialog({ kind: "lvconf" })} onFonts={() => setDialog({ kind: "fonts" })} />
      )}
      {dialog?.kind === "manager" && (
        <LvglManager t={t} autoInstall={dialog.autoInstall} onInstalledChange={setInstalled} onClose={() => setDialog(dialog.back ? { kind: dialog.back } : null)} />
      )}
      {dialog?.kind === "about" && <AboutDialog t={t} runtime={runtime} iconSource={appIconLarge} onClose={() => setDialog(null)} />}
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
