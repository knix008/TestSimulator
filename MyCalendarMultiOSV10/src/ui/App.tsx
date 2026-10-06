import { Component, useEffect, useState, type ReactNode } from "react";
import { messages } from "../domain/i18n";
import { closeCurrentWindow, currentWindowLabel, hideMain, isTauri, openAux } from "../platform/desktop";
import { AboutScreen } from "./AboutScreen";
import { CalendarScreen } from "./CalendarScreen";
import { Boot, LanguageGate } from "./LanguageGate";
import { SettingsScreen } from "./SettingsScreen";
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

function Gate({ children }: { children: (ctx: ReadyContext) => ReactNode }) {
  const model = useSettings();
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

function useWindowKind(): "pending" | "main" | "settings" | "about" {
  const [kind, setKind] = useState<"pending" | "main" | "settings" | "about">(isTauri() ? "pending" : "main");
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void currentWindowLabel().then((label) => {
      if (!alive) return;
      if (label === "settings" || label === "about") setKind(label);
      else setKind("main");
    });
    return () => {
      alive = false;
    };
  }, []);
  return kind;
}

function MainWindow() {
  const [dialog, setDialog] = useState<null | "settings" | "about">(null);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dialog) {
        setDialog(null);
        return;
      }
      if (isTauri()) void hideMain();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <Gate>
      {(ctx) => (
        <div className="app-frame">
          <CalendarScreen
            ctx={ctx}
            onOpenSettings={() => {
              if (isTauri()) void openAux("settings");
              else setDialog("settings");
            }}
            onOpenAbout={() => {
              if (isTauri()) void openAux("about");
              else setDialog("about");
            }}
          />
          {dialog && (
            <div className="modal-back" onMouseDown={() => setDialog(null)}>
              <div
                className={`modal ${dialog}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {dialog === "settings" ? (
                  <SettingsScreen ctx={ctx} onClose={() => setDialog(null)} />
                ) : (
                  <AboutScreen ctx={ctx} onClose={() => setDialog(null)} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Gate>
  );
}

function AuxWindow({ view }: { view: "settings" | "about" }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") void closeCurrentWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Gate>
      {(ctx) => (
        <div className="app-frame">
          {view === "settings" ? (
            <SettingsScreen ctx={ctx} onClose={() => void closeCurrentWindow()} />
          ) : (
            <AboutScreen ctx={ctx} onClose={() => void closeCurrentWindow()} />
          )}
        </div>
      )}
    </Gate>
  );
}

export function App() {
  const kind = useWindowKind();
  if (kind === "pending") {
    return (
      <div className="app-frame">
        <Boot />
      </div>
    );
  }
  return (
    <AppBoundary>
      {kind === "settings" ? <AuxWindow view="settings" /> : kind === "about" ? <AuxWindow view="about" /> : <MainWindow />}
    </AppBoundary>
  );
}
