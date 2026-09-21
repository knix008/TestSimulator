import { useEffect, useState } from 'react'
import { Loader } from 'lucide-react'

/**
 * The window that says a long job is running.
 *
 * Several commands here take seconds and a few take minutes — a content-aware
 * fill over a large photograph, a neural model on the processor, a panorama of
 * four frames. Until now they said "working" in the status bar at the bottom
 * of the screen and nothing else moved, which reads as a frozen program.
 *
 * It appears only once a job has run long enough to be worth reporting, so the
 * hundreds of filters that finish in a moment do not make it flash, and it
 * reports a fraction when the job knows one and its elapsed time when it does
 * not. It covers the window because the job owns the document until it ends.
 */

export type BusyJob = {
  /** What is running, in the reader's language. */
  label: string
  /** 0 to 1 when the job can say; null when it cannot. */
  fraction: number | null
  /** A line under the label: which frame, which pass. */
  detail?: string
  /** When the job began, so the wait can be shown and the flash avoided. */
  startedAt: number
  /**
   * Whether this job's window belongs on the screen. The job decides, not the
   * window: one that yields while it works is given the usual grace period by
   * a timer, and one that holds the thread says yes from the start, because
   * no timer of its own would ever get to fire.
   */
  visible: boolean
}

/** How long a job must run before it is worth putting a window in front of someone. */
export const BUSY_AFTER_MS = 400

export function BusyOverlay({ job, language, waitingLabel }: { job: BusyJob | null; language: string; waitingLabel: string }) {
  /*
   * `now` is here for the elapsed time only, and is kept fresh by a timer.
   *
   * Whether to appear at all is no longer decided from it. It used to be, and
   * that was why a frozen window stayed blank: the stored time was whatever
   * it had been at the last tick, so a job beginning now looked to the window
   * as though it had not started yet — and the timer that would have put that
   * right cannot fire while the job holds the thread. The window meant to say
   * "this will take a while" was the one thing guaranteed not to arrive.
   */
  const [now, setNow] = useState(() => Date.now())
  const startedAt = job?.startedAt ?? 0

  useEffect(() => {
    if (!startedAt) return undefined
    const tick = window.setInterval(() => setNow(Date.now()), 150)
    return () => window.clearInterval(tick)
  }, [startedAt])

  // A job that finishes in a blink never asks to be shown at all.
  if (!job || !job.visible) return null
  /*
   * The clock only starts reading true once the timer has ticked, and while a
   * job holds the thread it never will. Rather than show a stopped 0.0s, which
   * would be its own small lie, the time is left off until there is one.
   */
  const elapsed = now - job.startedAt
  const seconds = elapsed > 0 ? (elapsed / 1000).toFixed(elapsed >= 10000 ? 0 : 1) : null
  const percent = job.fraction === null ? null : Math.round(Math.max(0, Math.min(1, job.fraction)) * 100)

  return (
    <div className="busy-scrim" role="dialog" aria-live="polite" aria-label={job.label} lang={language}>
      <div className="busy-window">
        <div className="busy-head">
          <Loader size={16} className="busy-spin" aria-hidden="true" />
          <strong>{job.label}</strong>
        </div>
        {job.detail && <p className="busy-detail">{job.detail}</p>}
        <progress max={1} value={job.fraction ?? undefined} />
        <p className="busy-detail">
          {percent === null ? waitingLabel : `${percent}%`}{seconds === null ? '' : ` · ${seconds}s`}
        </p>
      </div>
    </div>
  )
}
