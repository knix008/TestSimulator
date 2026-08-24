import type { Progress } from '@core/types'

interface Props {
  progress: Progress | null
  busy: boolean
}

/** 참고 앱의 개수/바이트/marquee 3종 진행률을 이식한 진행 표시줄. */
export function ProgressBar({ progress, busy }: Props) {
  if (!busy && !progress) return null

  let percent: number | null = null
  if (progress && (progress.kind === 'count' || progress.kind === 'bytes')) {
    const total = progress.total ?? 0
    const current = progress.current ?? 0
    if (total > 0) percent = Math.min(100, Math.floor((current / total) * 100))
  }
  const marquee = progress?.kind === 'marquee' || (busy && percent === null)

  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div
          className={marquee ? 'progress-fill marquee' : 'progress-fill'}
          style={marquee ? undefined : { width: `${percent ?? 0}%` }}
        />
      </div>
      <div className="progress-text" aria-live="polite">
        {progress?.message ?? ''}
        {percent !== null ? ` ${percent}%` : ''}
      </div>
    </div>
  )
}
