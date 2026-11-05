// One download with a progress window: the compiler, or an LVGL version. Holds how far it is
// (toolsProgress.js), whether its window is open, and what happens when it ends.
import { useEffect, useState } from "react";
import { host } from "./host.js";
import { focusPopout } from "./popout.js";
import { advance, startJob, tick } from "./toolsProgress.js";

export function useInstallJob(id, event, toProgress = (payload) => payload) {
  const [job, setJob] = useState(null);
  const [open, setOpen] = useState(false);
  const busy = job?.status === "running";

  // The clock in the window moves on even when nothing is arriving.
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setJob((current) => (current?.status === "running" ? tick(current, Date.now()) : current)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  /** Runs `launch`, which ends in { ok, error }. A failure stays on screen until it is dismissed. */
  const run = async (info, launch) => {
    setJob(startJob(info, Date.now()));
    setOpen(true);
    const off = host.on(event, (payload) => setJob((current) => (current ? advance(current, toProgress(payload), Date.now()) : current)));
    const result = await launch();
    off();
    if (result.ok || result.error === "stopped") {
      setJob(null);
      setOpen(false);
    } else {
      setJob((current) => ({ ...current, status: "failed", error: result.error }));
      setOpen(true);
    }
    return result;
  };

  return {
    id,
    job,
    open,
    busy,
    run,
    hide: () => setOpen(false),
    // In front if it is open already: it stands free, so it can be behind the main window.
    show: () => {
      if (!focusPopout(id)) setOpen(true);
    },
    markCancelling: () => setJob((current) => current && { ...current, cancelling: true }),
  };
}
