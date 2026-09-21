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
}

/** How long a job must run before it is worth putting a window in front of someone. */
export const BUSY_AFTER_MS = 400

export function BusyOverlay({ job, language, waitingLabel }: { job: BusyJob | null; language: string; waitingLabel: string }) {
  /*
   * `now` exists only to bring the component back at a steady beat: whether
   * the window has waited long enough to appear, and how long it has been
   * there, are both read from the job's own start time. Nothing is stored that
   * could disagree with it.
   */
  const [now, setNow] = useState(() => Date.now())
  const startedAt = job?.startedAt ?? 0

  useEffect(() => {
    if (!startedAt) return undefined
    const tick = window.setInterval(() => setNow(Date.now()), 150)
    return () => window.clearInterval(tick)
  }, [startedAt])

  if (!job) return null
  const elapsed = Math.max(0, now - job.startedAt)
  // A job that finishes in a blink should not put a window on the screen.
  if (elapsed < BUSY_AFTER_MS) return null
  const seconds = (elapsed / 1000).toFixed(elapsed >= 10000 ? 0 : 1)
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
          {percent === null ? waitingLabel : `${percent}%`} · {seconds}s
        </p>
      </div>
    </div>
  )
}
