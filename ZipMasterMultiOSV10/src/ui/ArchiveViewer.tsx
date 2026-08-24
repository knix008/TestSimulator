import { useEffect, useState, type MouseEvent } from 'react'
import { formatBytes, useStore } from './store'
import { useContextMenu, type MenuItem } from './ContextMenu'

/** 오른쪽 패널: 왼쪽에서 선택된 아카이브의 내부 내용 표시 + 해제 실행. */
export function ArchiveViewer() {
  const { t, busy, overwrite, setOverwrite, previewArchive, previewEntries, fileInfo, doExtract, doPreview, canBrowse } =
    useStore()
  const { openMenu } = useContextMenu()
  const has = previewArchive && previewEntries

  // 패널 제목: 아카이브 내용 / 디렉토리 정보 / 파일 정보(빈 상태는 기본 제목).
  const panelTitle = has
    ? t.viewerTitle
    : fileInfo
      ? fileInfo.isDirectory
        ? t.dirInfoTitle
        : t.fileInfoTitle
      : t.viewerTitle

  // 표시 상한(성능) — 선택/해제 모두 이 범위 내에서 동작.
  const shown = previewEntries ? previewEntries.slice(0, 500) : []

  // Ctrl/Shift 클릭 다중 선택 상태(표시된 항목 인덱스 기준).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)

  // 아카이브가 바뀌면 선택 초기화.
  useEffect(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [previewArchive])

  const onRowClick = (idx: number, e: MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      // 범위 선택: anchor ~ idx
      const lo = Math.min(anchor, idx)
      const hi = Math.max(anchor, idx)
      const next = new Set<number>()
      for (let i = lo; i <= hi; i++) next.add(i)
      setSelected(next)
    } else if (e.ctrlKey || e.metaKey) {
      // 토글 선택
      const next = new Set(selected)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      setSelected(next)
      setAnchor(idx)
    } else {
      // 단일 선택
      setSelected(new Set([idx]))
      setAnchor(idx)
    }
  }

  const namesOf = (set: Set<number>) =>
    Array.from(set)
      .sort((a, b) => a - b)
      .map((i) => shown[i]?.name)
      .filter((n): n is string => !!n)

  const extractSelected = () => {
    const names = namesOf(selected)
    if (names.length > 0) doExtract(names)
  }

  const selectAll = () => setSelected(new Set(shown.map((_, i) => i)))

  // 항목 우클릭: 선택되지 않은 항목이면 단일 선택으로 바꾼 뒤 메뉴 표시.
  const onRowContextMenu = (idx: number, ev: MouseEvent) => {
    const effective = selected.has(idx) && selected.size > 0 ? selected : new Set<number>([idx])
    if (!selected.has(idx)) {
      setSelected(new Set([idx]))
      setAnchor(idx)
    }
    const items: MenuItem[] = [
      {
        label: t.extractSelected(effective.size),
        icon: '📤',
        onClick: () => {
          const ns = namesOf(effective)
          if (ns.length > 0) doExtract(ns)
        }
      },
      { label: t.ctxSelectAll, icon: '☑️', onClick: selectAll },
      { separator: true },
      { label: t.ctxExtractAll, icon: '📦', onClick: () => doExtract() }
    ]
    openMenu(ev, items)
  }

  return (
    <section className="card viewer">
      <h2>{panelTitle}</h2>

      {!has && fileInfo && (
        <div className="file-info">
          <dl className="file-info-list">
            <dt>{t.fileInfoName}</dt>
            <dd>{fileInfo.name}</dd>
            <dt>{t.fileInfoType}</dt>
            <dd>
              {fileInfo.isDirectory ? t.fileTypeDir : fileInfo.isArchive ? t.fileTypeArchive : t.fileTypeFile}
            </dd>
            {!fileInfo.isDirectory && (
              <>
                <dt>{t.fileInfoSize}</dt>
                <dd>
                  {formatBytes(fileInfo.size)}{' '}
                  <span className="status-dim">({fileInfo.size.toLocaleString()} B)</span>
                </dd>
              </>
            )}
            {fileInfo.modified != null && (
              <>
                <dt>{t.fileInfoModified}</dt>
                <dd>{new Date(fileInfo.modified).toLocaleString()}</dd>
              </>
            )}
            <dt>{t.fileInfoPath}</dt>
            <dd className="file-info-path">{fileInfo.path}</dd>
          </dl>
        </div>
      )}

      {!has && !fileInfo && (
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
            <button className="primary" disabled={busy} onClick={() => doExtract()}>
              {t.pickArchive}
            </button>
            <button disabled={busy || selected.size === 0} onClick={extractSelected}>
              {t.extractSelected(selected.size)}
            </button>
          </div>

          <div className="selection-head">
            {t.contents(previewEntries!.length)}
            <span className="hint select-hint"> · {t.extractSelectHint}</span>
          </div>
          <ul
            className="entries-list"
            onContextMenu={(ev) =>
              openMenu(ev, [
                { label: t.ctxSelectAll, icon: '☑️', onClick: selectAll },
                { separator: true },
                { label: t.ctxExtractAll, icon: '📦', onClick: () => doExtract() }
              ])
            }
          >
            {shown.map((e, idx) => (
              <li
                key={idx}
                className={'entry-row' + (selected.has(idx) ? ' selected' : '')}
                onClick={(ev) => onRowClick(idx, ev)}
                onContextMenu={(ev) => onRowContextMenu(idx, ev)}
              >
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
