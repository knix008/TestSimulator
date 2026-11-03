/**
 * The terminal half of the bottom panel's tab row: one tab per terminal ("PowerShell 1",
 * × to close, middle-click closes too), "+" for a new terminal with the default shell and
 * "▾" to pick its shell, and "<" ">" at the right end to step through the tabs when there
 * are more than the row can show. The single Log tab stays App's own.
 *
 * TerminalPanes keeps every tab's xterm mounted (hidden when not shown), so switching
 * tabs never loses a terminal's screen.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { TerminalPane } from "./TerminalPane";
import {
  closeTerminal,
  ensureTerminal,
  openTerminal,
  selectTerminal,
  setShells,
  stepTerminal,
  tabTitle,
  useTerminalTabs,
} from "./terminalTabStore";
import "./terminalTabs.css";

export function TerminalTabStrip(props: {
  t: (key: string) => string;
  /** The Terminal view is the one shown (not the Log). */
  showing: boolean;
  onShow: () => void;
}) {
  const { t } = props;
  const { tabs, activeId, shells, defaultShell } = useTerminalTabs();
  const strip = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let stop = false;
    api.shells().then((result) => {
      if (!stop) setShells(result.shells.map((shell) => ({ id: shell.id, label: shell.label })), result.selected);
    }).catch(() => undefined);
    return () => { stop = true; };
  }, []);

  const measure = useCallback(() => {
    const element = strip.current;
    if (!element) return;
    setOverflow({
      left: element.scrollLeft > 1,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    });
  }, []);

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, tabs.length]);

  // The selected tab is always scrolled into view.
  useEffect(() => {
    const element = strip.current?.querySelector<HTMLElement>(`[data-terminal-tab="${CSS.escape(activeId)}"]`);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [activeId, measure]);

  useEffect(() => {
    if (!picking) return;
    const close = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".terminal-shell-menu, .terminal-new-caret")) return;
      setPicking(false);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [picking]);

  const show = (id: string) => {
    selectTerminal(id);
    props.onShow();
  };
  const open = (shellId: string) => {
    setPicking(false);
    openTerminal(shellId);
    props.onShow();
  };
  const step = (direction: number) => {
    stepTerminal(direction);
    props.onShow();
  };
  const index = tabs.findIndex((tab) => tab.id === activeId);
  const scrolls = overflow.left || overflow.right;

  return (
    <div className="terminal-tabs" role="tablist" aria-label={t("terminal")}>
      <div className="terminal-tab-strip" ref={strip} onScroll={measure}>
        {tabs.map((tab) => {
          const active = props.showing && tab.id === activeId;
          const title = tabTitle(tab, t("terminal"));
          return (
            <div
              key={tab.id}
              data-terminal-tab={tab.id}
              className={active ? "terminal-tab active" : "terminal-tab"}
              role="tab"
              aria-selected={active}
              title={title}
              onMouseDown={(event: ReactMouseEvent) => {
                if (event.button === 1) {
                  event.preventDefault();
                  closeTerminal(tab.id);
                }
              }}
            >
              <button type="button" className="terminal-tab-name" onClick={() => show(tab.id)}>
                <Icon name="terminal" />
                <span>{title}</span>
              </button>
              <button type="button" className="terminal-tab-close" aria-label={`${t("terminalClose")} ${title}`} title={t("terminalClose")} onClick={() => closeTerminal(tab.id)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
              </button>
            </div>
          );
        })}
      </div>
      <div className="terminal-new">
        <button type="button" className="terminal-new-button" title={t("terminalNew")} aria-label={t("terminalNew")} onClick={() => open("")}>
          <Icon name="plus" />
        </button>
        <button type="button" className={picking ? "terminal-new-caret active" : "terminal-new-caret"} title={t("terminalNewShell")} aria-label={t("terminalNewShell")} aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4l2.5 2.5L7.5 4" /></svg>
        </button>
        {picking && (
          <div className="terminal-shell-menu" role="menu">
            {shells.map((shell) => (
              <button key={shell.id} type="button" role="menuitem" className={shell.id === defaultShell ? "default" : ""} onClick={() => open(shell.id)}>
                <Icon name="terminal" />
                <span>{shell.label}</span>
              </button>
            ))}
            {shells.length === 0 && <div className="terminal-shell-empty">{t("terminalNoShells")}</div>}
          </div>
        )}
      </div>
      {/* Always at the right end while the terminal shows; each button is enabled only
          when there is a tab on that side to move to. */}
      {props.showing && (
        <div className="terminal-scroll" data-overflow={scrolls ? "yes" : "no"}>
          <button type="button" className="terminal-step" title={t("terminalPrevious")} aria-label={t("terminalPrevious")} disabled={index <= 0} onClick={() => step(-1)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
          </button>
          <button type="button" className="terminal-step" title={t("terminalNext")} aria-label={t("terminalNext")} disabled={index < 0 || index >= tabs.length - 1} onClick={() => step(1)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

/** Every terminal tab's xterm; only the selected one is shown, the rest keep their screen. */
export function TerminalPanes(props: { active: boolean }) {
  const { tabs, activeId } = useTerminalTabs();
  useEffect(() => {
    if (props.active) ensureTerminal();
  }, [props.active]);
  return (
    <>
      {tabs.map((tab) => (
        <TerminalPane
          key={tab.id}
          id={tab.id}
          shellId={tab.shellId}
          active={props.active && tab.id === activeId}
          onExit={() => closeTerminal(tab.id, false)}
        />
      ))}
    </>
  );
}
