/**
 * The bottom panel.
 *
 * It spans the whole width — under the side panels, not between them — because what it
 * holds belongs to the application rather than to whatever is open in the middle: the log
 * of everything that has happened, and terminals in the folder being compared.
 *
 * The strip across its head is one row of tabs: the log, then one tab per open terminal,
 * named after its shell. There is no tab called "terminal" standing in front of them —
 * turning the terminal on opens one and its own name is the tab, which is also why
 * closing the last one turns the terminal off again.
 *
 * The log and the terminal each have their own switch (View menu, and the two toolbar
 * buttons), so the panel is there whenever either of them is.
 */
import { Icon } from "./icons.js";
import { LogList, LogTools } from "./LogPanel.js";
import { Splitter } from "./Splitter.js";
import { TerminalBody, TerminalTabs, TerminalTools, type TerminalEnv } from "./TerminalPanel.js";
import { useApp } from "./state.js";

export function BottomPanel() {
  const app = useApp();
  const { t, settings, bootstrap } = app;

  const showLog = settings.showLogPanel;
  const showTerminal = settings.showTerminalPanel;
  if (!showLog && !showTerminal) return null;
  // A pane that was switched off while in front hands over to the one that is left.
  const terminalInFront = showTerminal && (settings.bottomPanel === "terminal" || !showLog);

  const env: TerminalEnv = {
    home: bootstrap?.home ?? "",
    user: bootstrap?.user ?? "",
    host: bootstrap?.hostname ?? "",
    platform: bootstrap?.platform ?? "",
  };

  const close = () => void app.updateSettings(
    terminalInFront ? { showTerminalPanel: false } : { showLogPanel: false },
  );

  return (
    <>
      <Splitter side="bottom" />
      <section className="bottom-panel" style={{ height: settings.logPanelHeight }} data-testid="bottom-panel">
        <header className="panel-title bottom-tabs" role="tablist" data-tab={terminalInFront ? "terminal" : "log"}>
          {showLog ? (
            <button
              type="button"
              role="tab"
              aria-selected={!terminalInFront}
              className={`panel-tab${terminalInFront ? "" : " active"}`}
              data-panel-tab="log"
              onClick={() => void app.updateSettings({ bottomPanel: "log" })}
            >
              <Icon name="list" size={14} />
              <span>{t("log.title")}</span>
              <span className="count">{app.log.length}</span>
            </button>
          ) : null}

          {showTerminal ? <TerminalTabs inFront={terminalInFront} /> : null}

          {terminalInFront ? <TerminalTools /> : <LogTools />}

          <button
            type="button"
            className="icon-button"
            data-command={terminalInFront ? "terminal.close" : "log.close"}
            title={t(terminalInFront ? "terminal.hide" : "log.hide")}
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className={`bottom-body tab-${terminalInFront ? "terminal" : "log"}`}>
          {terminalInFront ? <TerminalBody settings={settings} env={env} /> : <LogList />}
        </div>
      </section>
    </>
  );
}
