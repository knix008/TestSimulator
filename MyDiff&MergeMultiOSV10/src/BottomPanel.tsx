/**
 * The bottom panel.
 *
 * It spans the whole width — under the side panels, not between them — because both of
 * its tabs belong to the application rather than to whatever is open in the middle: the
 * log of what has happened, and a terminal in the folder being compared.
 *
 * Each tab has its own switch (View › Log Panel / Terminal Panel, and the two toolbar
 * buttons), so the strip only shows the tabs that are turned on and the panel itself is
 * there whenever either of them is. The buttons at the right end belong to the tab in
 * front; the last one closes that tab, which is the same as switching it off.
 */
import type { BottomPanelTab } from "../core/settings.js";
import { Icon } from "./icons.js";
import { LogList, LogTools } from "./LogPanel.js";
import { Splitter } from "./Splitter.js";
import { TerminalBody, TerminalTools, type TerminalEnv } from "./TerminalPanel.js";
import { useApp } from "./state.js";

export function BottomPanel() {
  const app = useApp();
  const { t, settings, bootstrap } = app;

  const open: Record<BottomPanelTab, boolean> = {
    log: settings.showLogPanel,
    terminal: settings.showTerminalPanel,
  };
  const tabs = (["log", "terminal"] as BottomPanelTab[]).filter((id) => open[id]);
  if (tabs.length === 0) return null;
  // A tab that was switched off while in front hands over to the one that is left.
  const active: BottomPanelTab = tabs.includes(settings.bottomPanel) ? settings.bottomPanel : tabs[0];

  const env: TerminalEnv = {
    home: bootstrap?.home ?? "",
    user: bootstrap?.user ?? "",
    host: bootstrap?.hostname ?? "",
    platform: bootstrap?.platform ?? "",
  };

  const close = () => void app.updateSettings(active === "log" ? { showLogPanel: false } : { showTerminalPanel: false });

  return (
    <>
      <Splitter side="bottom" />
      <section className="bottom-panel" style={{ height: settings.logPanelHeight }} data-testid="bottom-panel">
        <header className="panel-title bottom-tabs" role="tablist" data-tab={active}>
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              className={`panel-tab${id === active ? " active" : ""}`}
              data-panel-tab={id}
              onClick={() => void app.updateSettings({ bottomPanel: id })}
            >
              <Icon name={id === "log" ? "list" : "terminal"} size={14} />
              <span>{t(id === "log" ? "log.title" : "terminal.title")}</span>
            </button>
          ))}

          {active === "log" ? <LogTools /> : <TerminalTools />}

          <button
            type="button"
            className="icon-button"
            data-command={active === "log" ? "log.close" : "terminal.close"}
            title={t(active === "log" ? "log.hide" : "terminal.hide")}
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className={`bottom-body tab-${active}`}>
          {active === "log" ? <LogList /> : <TerminalBody settings={settings} env={env} />}
        </div>
      </section>
    </>
  );
}
