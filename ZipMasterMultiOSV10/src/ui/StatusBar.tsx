import { useStore } from './store'
import { ProgressBar } from './ProgressBar'

/**
 * 상태바: 프로그램의 각종 상태를 표시.
 * - 왼쪽: 현재 탐색 경로와 항목 수(또는 드라이브 목록).
 * - 오른쪽: 작업 진행률 · 선택된 아카이브 정보 · 준비 상태.
 */
export function StatusBar() {
  const { t, busy, progress, canBrowse, listing, previewArchive, previewEntries } = useStore()

  return (
    <footer className="statusbar">
      <div className="status-left" title={listing?.path || undefined}>
        {canBrowse && (
          <>
            <span className="status-item">
              {listing?.path ? t.statusPath(listing.path) : t.statusDrives}
            </span>
            {listing && (
              <span className="status-item status-dim">{t.statusItems(listing.entries.length)}</span>
            )}
          </>
        )}
      </div>

      <div className="status-right">
        {busy || progress ? (
          <ProgressBar progress={progress} busy={busy} />
        ) : previewArchive ? (
          <span className="status-item">
            {t.statusSelected(previewArchive)}
            <span className="status-dim"> · {t.statusItems(previewEntries?.length ?? 0)}</span>
          </span>
        ) : (
          <span className="status-ready">{t.ready}</span>
        )}
      </div>
    </footer>
  )
}
