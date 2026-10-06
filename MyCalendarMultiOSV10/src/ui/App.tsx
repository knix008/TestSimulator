import { Component, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { messages } from "../domain/i18n";
import {
  closeCurrentWindow,
  currentWindowLabel,
  fitReminderWindow,
  hideCurrentWindow,
  hideMain,
  isTauri,
  onTrayAbout,
  openAux,
  setWindowTitle,
} from "../platform/desktop";
import { ReminderPopup, useReminderScheduler } from "./ReminderPopup";
import { CalendarScreen } from "./CalendarScreen";
import { EventsScreen } from "./EventsScreen";
import { PrintScreen } from "./PrintScreen";
import { requestPrintMonth } from "../domain/print";
import { Boot, LanguageGate } from "./LanguageGate";
import { SettingsScreen } from "./SettingsScreen";
import { requestSettingsTab, type SettingsTab } from "./settingsTab";
import { usePanelDrag } from "./usePanelDrag";
import { useSettings, type ReadyContext } from "./useSettings";

class AppBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="app-frame">
          <section className="panel boot">
            <p>{this.state.message}</p>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}

function Gate({ children, followTray = false }: { children: (ctx: ReadyContext) => ReactNode; followTray?: boolean }) {
  const model = useSettings({ followTray });
  if (!model.ready) {
    return (
      <div className="app-frame">
        <Boot />
      </div>
    );
  }
  if (!model.settings.language) {
    return (
      <div className="app-frame">
        <LanguageGate onSelect={(language) => model.update({ language })} />
      </div>
    );
  }
  const ctx: ReadyContext = {
    settings: { ...model.settings, language: model.settings.language },
    update: model.update,
    desktopError: model.desktopError,
    t: messages[model.settings.language],
  };
  return children(ctx);
}

type WindowKind = "pending" | "main" | "settings" | "events" | "print" | "reminder";
type AuxView = "settings" | "events" | "print";

/** The webview's own menu (back, reload, print the raw page, inspect) never makes sense in the desktop app. */
function useNoNativeMenu() {
  useEffect(() => {
    if (!isTauri()) return;
    const onMenu = (event: globalThis.MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea")) return;
      event.preventDefault();
    };
    window.addEventListener("contextmenu", onMenu);
    return () => window.removeEventListener("contextmenu", onMenu);
  }, []);
}

function useWindowKind(): WindowKind {
  const [kind, setKind] = useState<WindowKind>(isTauri() ? "pending" : "main");
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void currentWindowLabel().then((label) => {
      if (!alive) return;
      if (label === "settings" || label === "events" || label === "print" || label === "reminder") setKind(label);
      else setKind("main");
    });
    return () => {
      alive = false;
    };
  }, []);
  return kind;
}

function AuxScreen({
  view,
  ctx,
  onClose,
  onHeaderMouseDown,
}: {
  view: AuxView;
  ctx: ReadyContext;
  onClose: () => void;
  onHeaderMouseDown?: (event: MouseEvent) => void;
}) {
  return view === "events" ? (
    <EventsScreen ctx={ctx} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />
  ) : view === "print" ? (
    <PrintScreen ctx={ctx} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />
  ) : (
    <SettingsScreen ctx={ctx} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />
  );
}

function AuxDialog({ view, ctx, onClose }: { view: AuxView; ctx: ReadyContext; onClose: () => void }) {
  const drag = usePanelDrag();
  const onHeaderMouseDown = (event: MouseEvent) => drag.onMouseDown(event);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className={view === "print" ? "modal print-modal" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        style={{ transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <AuxScreen view={view} ctx={ctx} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />
      </div>
    </div>
  );
}

function MainWindow() {
  const [dialog, setDialog] = useState<AuxView | null>(null);
  useReminderScheduler();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (dialog) {
        setDialog(null);
        return;
      }
      if (isTauri()) void hideMain();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const openSettings = (tab?: SettingsTab) => {
    if (tab) requestSettingsTab(tab);
    if (isTauri()) void openAux("settings");
    else setDialog("settings");
  };
  const openEvents = () => {
    if (isTauri()) void openAux("events");
    else setDialog("events");
  };
  const openPrint = (year: number, month: number) => {
    requestPrintMonth(year, month);
    if (isTauri()) void openAux("print");
    else setDialog("print");
  };

  useEffect(() => {
    let alive = true;
    let unlisten = () => {};
    void onTrayAbout(() => openSettings("about")).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten();
    };
  }, []);

  return (
    <Gate followTray>
      {(ctx) => (
        <div className="app-frame">
          <CalendarScreen ctx={ctx} onOpenSettings={openSettings} onOpenEvents={openEvents} onOpenPrint={openPrint} />
          {dialog && <AuxDialog key={dialog} view={dialog} ctx={ctx} onClose={() => setDialog(null)} />}
          {!isTauri() && (
            <div className="reminder-overlay">
              <ReminderPopup t={ctx.t} language={ctx.settings.language} />
            </div>
          )}
        </div>
      )}
    </Gate>
  );
}

function AuxWindow({ view }: { view: AuxView }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) void closeCurrentWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <Gate>{(ctx) => <AuxWindowContent view={view} ctx={ctx} />}</Gate>;
}

function AuxWindowContent({ view, ctx }: { view: AuxView; ctx: ReadyContext }) {
  const title = view === "events" ? ctx.t.manageEvents : view === "print" ? ctx.t.printTitle : ctx.t.settings;
  useEffect(() => {
    void setWindowTitle(title);
  }, [title]);

  return (
    <div className="app-frame">
      <AuxScreen view={view} ctx={ctx} onClose={() => void closeCurrentWindow()} />
    </div>
  );
}

function ReminderWindow() {
  return (
    <Gate>
      {(ctx) => <ReminderWindowContent ctx={ctx} />}
    </Gate>
  );
}

function ReminderWindowContent({ ctx }: { ctx: ReadyContext }) {
  useEffect(() => {
    void setWindowTitle(ctx.t.remindersTitle);
  }, [ctx.t.remindersTitle]);
  return (
    <div className="app-frame reminder-frame">
      <ReminderPopup
        t={ctx.t}
        language={ctx.settings.language}
        onSize={(height) => void fitReminderWindow(height)}
        onEmpty={() => void hideCurrentWindow()}
      />
    </div>
  );
}

export function App() {
  const kind = useWindowKind();
  useNoNativeMenu();
  if (kind === "pending") {
    return (
      <div className="app-frame">
        <Boot />
      </div>
    );
  }
  return (
    <AppBoundary>
      {kind === "settings" || kind === "events" || kind === "print" ? (
        <AuxWindow view={kind} />
      ) : kind === "reminder" ? (
        <ReminderWindow />
      ) : (
        <MainWindow />
      )}
    </AppBoundary>
  );
}
