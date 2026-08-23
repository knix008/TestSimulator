import { formatBytes, useStore } from './store'

/** 오른쪽 패널: 왼쪽에서 선택된 아카이브의 내부 내용 표시 + 해제 실행. */
export function ArchiveViewer() {
  const { t, busy, overwrite, setOverwrite, previewArchive, previewEntries, doExtract, doPreview, canBrowse } =
    useStore()
  const has = previewArchive && previewEntries

  return (
    <section className="card viewer">
      <h2>{t.viewerTitle}</h2>

      {!has && (
        <div className="viewer-empty">
          <p className="hint">{t.viewerHint}</p>
          {/* 웹 등 탐색 미지원 환경에서는 파일 선택으로 내용 보기 */}
          {!canBrowse && (
            <button disabled={busy} onClick={doPreview}>
              {t.selectArchive}
            </button>
          )}
        </div>
      )}

      {has && (
        <>
          <div className="selection-head">{t.selectedArchive(previewArchive!)}</div>
          <div className="row extract-opts">
            <label className="radio">
              <input
                type="checkbox"
                checked={overwrite}
                disabled={busy}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              {t.overwrite}
            </label>
            <button className="primary" disabled={busy} onClick={doExtract}>
              {t.pickArchive}
            </button>
          </div>

          <div className="selection-head">{t.contents(previewEntries!.length)}</div>
          <ul className="entries-list">
            {previewEntries!.slice(0, 500).map((e, idx) => (
              <li key={idx}>
                <span aria-hidden>{e.isDirectory ? '📁 ' : '📄 '}</span>
                <span className="fs-name">{e.name}</span>
                {!e.isDirectory && <span className="fs-size">{formatBytes(e.size)}</span>}
              </li>
            ))}
            {previewEntries!.length > 500 && <li>{t.andMore(previewEntries!.length - 500)}</li>}
          </ul>
        </>
      )}
    </section>
  )
}
