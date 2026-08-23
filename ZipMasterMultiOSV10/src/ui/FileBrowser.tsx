import { formatBytes, useStore } from './store'

/** 왼쪽 패널: 드라이브 + 디렉터리 구조 탐색. 아카이브 클릭 시 오른쪽에 내용 표시. */
export function FileBrowser() {
  const { t, canBrowse, listing, browseBusy, selectedArchivePath, browseUp, openFsEntry } = useStore()

  if (!canBrowse) {
    return (
      <section className="card browser">
        <h2>{t.browserTitle}</h2>
        <p className="hint">{t.browserWebUnsupported}</p>
      </section>
    )
  }

  const atDrives = !listing || !listing.path
  return (
    <section className="card browser">
      <div className="browser-head">
        <h2>{t.browserTitle}</h2>
        <button className="up-btn" disabled={browseBusy || atDrives} onClick={browseUp} title={t.browserUp}>
          ⬆ {t.browserUp}
        </button>
      </div>
      <div className="browser-path" title={listing?.path}>
        {listing?.path || '💽 ' + t.browserTitle}
      </div>

      <ul className="fs-list">
        {listing && listing.entries.length === 0 && <li className="fs-empty">{t.browserEmpty}</li>}
        {listing?.entries.map((e) => (
          <li
            key={e.path}
            className={
              'fs-item' +
              (e.path === selectedArchivePath ? ' selected' : '') +
              (e.isArchive ? ' archive' : '') +
              (e.isDirectory ? ' dir' : '')
            }
            onClick={() => openFsEntry(e)}
            title={e.path}
          >
            <span className="fs-ico" aria-hidden>
              {e.isDirectory ? '📁' : e.isArchive ? '🗜️' : '📄'}
            </span>
            <span className="fs-name">{e.name}</span>
            {!e.isDirectory && <span className="fs-size">{formatBytes(e.size)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
