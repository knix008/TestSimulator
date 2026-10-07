/**
 * The main window.
 *
 * Layout, from the top down: the menu bar, the toolbar, then a row of three — a left
 * panel, the comparison with its own tab strip, and on a merge a right panel — then
 * the bottom panel (the log and the terminal) and the status bar across the bottom. The tabs sit inside the middle
 * column because they belong to the comparison; the log sits outside it because it
 * belongs to the application.
 *
 * What the side panels hold follows the session: a merge shows its conflicts on the
 * left and its own state on the right, and everything else shows the session list on
 * the left and nothing on the right, because a comparison has no second story to
 * tell. The bottom panel spans the whole width, under the panels, because the log and
 * the terminal belong to the application rather than to one tab.
 *
 * This component owns the things that are global to the window: the keyboard map,
 * Ctrl+Wheel zoom, drag & drop, and the measurement that keeps the window from ever
 * being narrower than the toolbar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_ZOOM, MAX_ZOOM } from "../core/settings.js";
import { windowMinimumWidth } from "./measure.js";
import { useCommands } from "./commands.js";
import * as host from "./host.js";
import { InlineDialogs } from "./DialogHost.js";
import { InlineMenu } from "./MenuPopup.js";
import { MenuBar } from "./MenuBar.js";
import { Icon } from "./icons.js";
import { LeftPanel } from "./LeftPanel.js";
import { BottomPanel } from "./BottomPanel.js";
import { SessionPanel } from "./SessionPanel.js";
import { RightPanel } from "./RightPanel.js";
import { Splitter } from "./Splitter.js";
import { Toolbar } from "./Toolbar.js";
import { TabBar } from "./TabBar.js";
import { StatusBar } from "./StatusBar.js";
import { Workspace } from "./Workspace.js";
import { useApp } from "./state.js";

export function App() {
  const app = useApp();
  const { commands, menus, contextMenu, run } = useCommands();
  const shellRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);

  /* ------------------------------------------------- menu dispatch */

  const choose = useCallback((id: string | null) => {
    if (!id) return;
    if (id.startsWith("theme:")) {
      void app.updateSettings({ theme: id.slice(6) });
      return;
    }
    if (id.startsWith("language:")) {
      void app.updateSettings({ language: id.slice(9) === "en" ? "en" : "ko" });
      return;
    }
    if (id.startsWith("recent:")) {
      const entry = app.settings.recent?.[Number(id.slice(7))];
      if (entry) void app.openRecentEntry(entry.kind, entry.paths);
      return;
    }
    run(id);
  }, [app, run]);

  /* ------------------------------------------------ keyboard model */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = comboOf(event);
      if (!combo) return;
      // Typing in an editable cell keeps its own Ctrl+C/V/X and Ctrl+A.
      const editing = isEditable(event.target);
      if (editing && ["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Ctrl+Z", "Ctrl+Y"].includes(combo)) return;

      for (const command of Object.values(commands)) {
        if (command.shortcut !== combo) continue;
        if (!command.enabled) return;
        event.preventDefault();
        void command.run();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands]);

  /* ---------------------------------------------- Ctrl + wheel zoom */

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const step = event.deltaY > 0 ? -10 : 10;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((app.settings.zoom + step) / 10) * 10));
      if (next !== app.settings.zoom) void app.updateSettings({ zoom: next });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [app]);

  /* ------------------------------------------------- drag and drop */

  useEffect(() => {
    const over = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropping(true);
    };
    const leave = (event: DragEvent) => {
      if (event.relatedTarget) return;
      setDropping(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      setDropping(false);
      const paths = droppedPaths(event);
      if (paths.length > 0) void app.openDropped(paths);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [app]);

  /* ------------------------------- minimum width = the full toolbar */

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    let applied = 0;
    const measure = () => {
      const next = windowMinimumWidth(element, {
        left: app.settings.leftPanelWidth,
        right: app.settings.rightPanelWidth,
      });
      // Only a real change is pushed: re-applying the same value on every resize
      // would make the window creep wider.
      if (next < 320 || Math.abs(next - applied) < 4) return;
      applied = next;
      host.setMinimumSize(next, 620);
    };

    measure();
    const observer = new ResizeObserver(measure);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    app.settings.language,
    app.settings.zoom,
    app.settings.leftPanelWidth,
    app.settings.rightPanelWidth,
    app.ready,
    // Which groups the toolbar shows follows the kind of tab that is open, and
    // the window's minimum width follows the toolbar.
    app.active?.kind,
  ]);

  /* ------------------------------------------- unsaved work on exit */

  useEffect(() => {
    if (!app.settings.confirmExit) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!app.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [app.dirty, app.settings.confirmExit]);

  /* -------------------------------- a second launch re-uses this one */

  useEffect(() => {
    if (!host.isDesktop()) return;
    return window.mdm?.onOpenRequest((argv) => {
      void app.openDropped(argv.filter((item) => !item.startsWith("-")));
    });
  }, [app]);

  const openContextMenu = useCallback(async (event: React.MouseEvent, target: Parameters<typeof contextMenu>[0]) => {
    event.preventDefault();
    const chosen = await host.openMenu(
      {
        menu: `context:${target}`,
        items: contextMenu(target),
        theme: app.settings.theme,
        language: app.settings.language,
        fontFamily: app.settings.font.family,
        fontSize: 13,
      },
      host.anchorForPoint(event.clientX, event.clientY),
    );
    choose(chosen);
  }, [app.settings, choose, contextMenu]);

  // The automation hook drives commands through this table, so a GUI test can
  // exercise a menu-only action without having to open the menu window first.
  (window as unknown as { __mdmCommands?: typeof commands }).__mdmCommands = commands;

  if (!app.ready) {
    return <div className="boot">My Diff &amp; Merge</div>;
  }

  // The side panels are a merge's own; every other kind of tab gets the full width.
  const merge = app.active?.kind === "merge" ? app.active : null;

  return (
    <div className={`shell${dropping ? " dropping" : ""}`} ref={shellRef}>
      <MenuBar menus={menus} onChoose={choose} />
      <Toolbar ref={toolbarRef} commands={commands} onChoose={choose} />

      <div className="body">
        {app.settings.showLeftPanel ? (
          <>
            {merge ? <LeftPanel tab={merge} /> : <SessionPanel onChoose={choose} />}
            <Splitter side="left" />
          </>
        ) : (
          /* A closed panel leaves a rail rather than nothing: the panel is closed
             from its own header, so it has to be reopenable from where it was. */
          <button
            type="button"
            className="panel-rail"
            data-command="panel.expand"
            title={app.t("panel.expand")}
            onClick={() => void app.updateSettings({ showLeftPanel: true })}
          >
            <Icon name="next" size={13} />
            <span>{merge ? app.t("merge.conflicts") : app.t("session.title")}</span>
          </button>
        )}

        {/* The tabs belong to the comparison, so they live in its column — between
            the panels rather than running across the top of them. */}
        <div className="workspace-column">
          <TabBar onContextMenu={(event) => openContextMenu(event, "tab")} />
          <Workspace onContextMenu={openContextMenu} />
        </div>

        {merge ? (
          app.settings.showRightPanel ? (
            <>
              <Splitter side="right" />
              <RightPanel tab={merge} />
            </>
          ) : (
            /* The same rail as on the left, against the other edge: a panel closed
               from its own header has to be reopenable from where it was. */
            <button
              type="button"
              className="panel-rail right"
              data-command="panel.expandRight"
              title={app.t("panel.expand")}
              onClick={() => void app.updateSettings({ showRightPanel: true })}
            >
              <Icon name="prev" size={13} />
              <span>{app.t("merge.info")}</span>
            </button>
          )
        ) : null}
      </div>

      <BottomPanel />
      {app.settings.showStatusBar ? <StatusBar /> : null}

      {dropping ? <div className="drop-overlay">{app.t("pane.dropHint")}</div> : null}
      <InlineMenu />
      <InlineDialogs />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

/** `Ctrl+Shift+S`, `F7`, `Alt+F4` — the same spelling the command table uses. */
function comboOf(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  let key = event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  if (key === "+" || key === "=") key = "+";
  else if (key === "_") key = "-";
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement;
}

/**
 * Paths out of a drop.
 *
 * Electron hands real file-system paths through `webUtils`-less `File.path` on older
 * versions and through the `text/plain` fallback otherwise; a browser can only give
 * names, which is why the web build treats a drop as a hint and the desktop build
 * treats it as an instruction.
 */
function droppedPaths(event: DragEvent): string[] {
  const transfer = event.dataTransfer;
  if (!transfer) return [];
  const paths: string[] = [];
  for (const file of Array.from(transfer.files)) {
    const candidate = (file as File & { path?: string }).path;
    if (candidate) paths.push(candidate);
  }
  if (paths.length > 0) return paths;

  const text = transfer.getData("text/plain").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^file:\/\/\/?/, "").trim())
    .filter(Boolean)
    .map((line) => decodeURIComponent(line));
}
