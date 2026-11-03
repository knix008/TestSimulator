/**
 * The progress pop-up for long operations (clone, fetch, pull, push, open, export…).
 *
 * Title row with icon, the operation, git's latest progress line, an indeterminate bar
 * and the elapsed time; Cancel stops the running git command. A pure component: it is
 * given the state (src/progress.ts) and draws it, so any window can host it.
 */
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { ProgressState } from "./progress";
import "./progressPopup.css";

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ProgressPopup(props: {
  state: ProgressState;
  t: (key: string) => string;
  onCancel?: () => void;
}) {
  const { state, t } = props;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="progress-popup" role="dialog" aria-live="polite" aria-label={t("progressTitle")}>
      <header className="progress-popup-title">
        <Icon name="refresh" />
        <strong>{t("progressTitle")}</strong>
      </header>
      <div className="progress-popup-body">
        <div className="progress-popup-op">
          <Icon name={state.icon} />
          <span>{state.label}</span>
        </div>
        <div className="progress-popup-detail" title={state.detail}>{state.detail || t("progressWorking")}</div>
        <div className="progress-popup-bar" aria-hidden="true"><i /></div>
        <div className="progress-popup-foot">
          <span>{t("progressElapsed")} {formatElapsed(now - state.startedAt)}</span>
          {props.onCancel && (
            <button type="button" onClick={props.onCancel}>
              <Icon name="stop" />
              <span>{t("progressCancel")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
