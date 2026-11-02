/**
 * The progress popup: a small window of fixed size with a progress bar.
 *
 * Shown only for work that has already taken longer than a third of a second (see
 * `withProgress` in state.tsx), so a fast operation never flashes a window up. The work
 * it covers — walking a directory tree, reading a pair of files — cannot report a
 * percentage honestly, so the bar fills steadily towards the end without ever claiming
 * to be done, and the elapsed time beside it shows the work is still going.
 */
import { useEffect, useState } from "react";
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import type { StringKey } from "../../core/i18n.js";

/** How full the bar is after `seconds`: quick at first, then ever slower, never 100%. */
export function progressFill(seconds: number): number {
  return 0.95 * (1 - Math.exp(-Math.max(0, seconds) / 3));
}

export function ProgressDialog({ payload, t }: DialogProps) {
  const label = (payload as { label?: StringKey } | null)?.label;
  const openId = (payload as { openId?: number } | null)?.openId;
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = performance.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [label, openId]);

  const fill = progressFill(seconds);
  return (
    <div className="progress-body">
      <div className="progress-head">
        <Icon name="clock" size={18} />
        <span className="progress-label" data-testid="progress-label">
          {label ? t(label) : t("progress.title")}
        </span>
        <span className="progress-time">{seconds.toFixed(1)}s</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-busy="true"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
      >
        <div className="progress-fill" style={{ width: `${(fill * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}
