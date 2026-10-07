/**
 * The log, the first tab of the bottom panel.
 *
 * What it holds is the same stream the status bar shows, kept instead of overwritten:
 * every comparison run, file copied, merge saved and error raised, with the time it
 * happened. The status bar answers "what just happened"; this answers "what has
 * happened", which is the question you have after a long folder sync.
 *
 * It scrolls to the newest line unless you have scrolled away from the bottom, so reading
 * back through it is not fought by the next message to arrive.
 *
 * The frame around it — the splitter, the tab strip and the close button — belongs to
 * `BottomPanel.tsx`, which the terminal shares.
 */
import { useEffect, useRef } from "react";
import * as host from "./host.js";
import { Icon } from "./icons.js";
import { renderMessage, useApp } from "./state.js";

/** The log's own buttons at the right-hand end of the panel header: copy, and clear. */
export function LogTools() {
  const app = useApp();
  const { t, log } = app;

  const asText = () => log
    .map((entry) =>
      `${time(entry.at)}\t${entry.kind === "error" ? "ERROR" : "INFO"}\t${renderMessage(entry.text, t)}`)
    .join("\n");

  return (
    <>
      <span className="panel-spacer" />
      <button
        type="button"
        className="icon-button"
        data-command="log.copy"
        title={t("log.copy")}
        disabled={log.length === 0}
        onClick={() => void host.copyText(asText())}
      >
        <Icon name="copy" size={14} />
      </button>
      <button
        type="button"
        className="icon-button"
        data-command="log.clear"
        title={t("log.clear")}
        disabled={log.length === 0}
        onClick={app.clearLog}
      >
        <Icon name="trash" size={14} />
      </button>
    </>
  );
}

export function LogList() {
  const app = useApp();
  const { t, log } = app;
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && pinned.current) list.scrollTop = list.scrollHeight;
  }, [log]);

  return (
    <div
      className="log-list"
      ref={listRef}
      data-testid="log-list"
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}
    >
      {log.length === 0 ? (
        <p className="panel-empty">{t("log.empty")}</p>
      ) : (
        log.map((entry, index) => {
          // Rendered here, not when the line was logged, so the whole log follows the
          // language setting the way the status bar does.
          const text = renderMessage(entry.text, t);
          return (
            <div className={`log-row ${entry.kind}`} key={index}>
              <span className="log-time">{time(entry.at)}</span>
              <Icon name={entry.kind === "error" ? "warning" : "check"} size={12} />
              <span className="log-text" title={text}>{text}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function time(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
