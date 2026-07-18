import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { usePrefs } from '../i18n/Preferences'
import { IsoEditSession } from '../iso9660/session'
import type { IsoFlatEntry } from '../iso9660/types'
import './web.css'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

type DragOutPayload = {
  path: string
  name: string
  url: string
  file: File
}

export default function WebApp() {
  const { locale, theme, setLocale, setTheme } = usePrefs()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragOutRef = useRef<DragOutPayload | null>(null)
  const [session, setSession] = useState<IsoEditSession | null>(null)
  const [fileName, setFileName] = useState('')
  const [cwd, setCwd] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('ISO 파일을 열어 내용 보기·편집을 시작하세요.')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [progress, setProgress] = useState(0)
  const [rev, setRev] = useState(0)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [draggingOut, setDraggingOut] = useState(false)
  const bump = () => setRev((n) => n + 1)

  const children = useMemo(() => {
    if (!session) return [] as IsoFlatEntry[]
    const list = session.list(cwd)
    if (!filter.trim()) return list
    const q = filter.trim().toLowerCase()
    return list.filter((e) => e.name.toLowerCase().includes(q))
  }, [session, cwd, filter, rev])

  const crumbs = useMemo(() => {
    const parts = cwd.split('/').filter(Boolean)
    const items = [{ label: '루트', path: '' }]
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      items.push({ label: part, path: acc })
    }
    return items
  }, [cwd])

  useEffect(() => {
    return () => {
      clearDragOut()
    }
  }, [])

  const openFile = useCallback(async (file: File) => {
    setBusy(true)
    setError('')
    setStatus('ISO 읽는 중…')
    setProgress(10)
    try {
      const next = await IsoEditSession.open(file)
      setSession(next)
      setFileName(file.name)
      setCwd('')
      setSelected(null)
      setProgress(100)
      setStatus(
        `${file.name} · 볼륨 ${next.volumeLabel} · ${next.entries.length}개 항목 · ${formatBytes(file.size)}`,
      )
    } catch (err) {
      setSession(null)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('열기 실패')
    } finally {
      setBusy(false)
    }
  }, [])

  async function onPickIso(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await openFile(file)
  }

  function enterDir(path: string) {
    setCwd(path)
    setSelected(null)
  }

  async function downloadSelected() {
    if (!session || !selected) return
    setBusy(true)
    setError('')
    try {
      const blob = await session.readFile(selected)
      const name = selected.split('/').pop() || 'file.bin'
      triggerDownload(blob, name)
      setStatus(`다운로드: ${name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addExternalFiles(targetDir: string, fileList: FileList | File[]) {
    if (!session) return
    const files = Array.from(fileList).filter((f) => f.size >= 0 && f.name)
    if (!files.length) return
    try {
      await session.addFiles(targetDir, files)
      bump()
      const where = targetDir || '루트'
      setStatus(`${files.length}개 파일을 “${where}”에 추가했습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onAddFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ''
    if (!files?.length) return
    await addExternalFiles(cwd, files)
  }

  function removeSelected() {
    if (!session || !selected) return
    try {
      session.remove(selected)
      setSelected(null)
      bump()
      setStatus(`삭제 예약: ${selected}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function makeFolder() {
    if (!session) return
    const name = window.prompt('새 폴더 이름')
    if (!name?.trim()) return
    try {
      session.mkdir(cwd, name.trim())
      bump()
      setStatus(`폴더 생성: ${name.trim()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveIso() {
    if (!session) return
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      const blob = await session.exportIso((p) => {
        setProgress(p.percent)
        setStatus(p.message)
      })
      const outName = fileName.replace(/\.iso$/i, '') + '-edited.iso'
      triggerDownload(blob, outName)
      session.dirty = false
      bump()
      setStatus(`저장 완료: ${outName} (${formatBytes(blob.size)})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('저장 실패')
    } finally {
      setBusy(false)
    }
  }

  function clearDragOut() {
    if (dragOutRef.current) {
      URL.revokeObjectURL(dragOutRef.current.url)
      dragOutRef.current = null
    }
  }

  async function prepareDragOut(path: string) {
    if (!session) return
    if (dragOutRef.current?.path === path) return
    clearDragOut()
    const blob = await session.readFile(path)
    const name = path.split('/').pop() || 'file.bin'
    const file = new File([blob], name, {
      type: blob.type || 'application/octet-stream',
    })
    const url = URL.createObjectURL(file)
    dragOutRef.current = { path, name, url, file }
  }

  function onFileRowMouseDown(entry: IsoFlatEntry) {
    if (entry.isDir || busy || !session) return
    void prepareDragOut(entry.path).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }

  function onFileDragStart(e: DragEvent, entry: IsoFlatEntry) {
    if (entry.isDir) {
      e.preventDefault()
      return
    }
    setSelected(entry.path)
    setDraggingOut(true)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', entry.name)

    const payload = dragOutRef.current
    if (payload && payload.path === entry.path) {
      // Chromium: drag file out to desktop / Explorer / Finder
      e.dataTransfer.setData(
        'DownloadURL',
        `application/octet-stream:${sanitizeDownloadName(payload.name)}:${payload.url}`,
      )
      e.dataTransfer.setData('text/uri-list', payload.url)
      try {
        e.dataTransfer.items.add(payload.file)
      } catch {
        /* some browsers reject File on items during dragstart */
      }
      setStatus(`외부로 드래그: ${payload.name}`)
    } else {
      // Not ready yet — still allow internal text hint; user can retry
      setStatus('파일 준비 중… 잠시 후 다시 드래그하세요.')
    }
  }

  function onFileDragEnd() {
    setDraggingOut(false)
  }

  function isExternalFileDrag(e: DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  function onListDragOver(e: DragEvent, targetDir: string | null) {
    if (!session || !isExternalFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropTarget(targetDir === null ? cwd : targetDir)
  }

  function onListDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDropTarget(null)
  }

  async function onListDrop(e: DragEvent, targetDir: string | null) {
    if (!session || !isExternalFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const dest = targetDir === null ? cwd : targetDir
    const files = e.dataTransfer.files
    if (!files?.length) return
    await addExternalFiles(dest, files)
  }

  return (
    <div className="web-app">
      <header className="web-hero">
        <div>
          <p className="brand">ISO Maker Web</p>
          <h1>브라우저에서 ISO 보기 · 편집</h1>
          <p className="lede">
            외부 파일을 목록으로 끌어다 놓고, ISO 안 파일은 바탕화면·폴더로 끌어낼 수 있습니다.
          </p>
        </div>
        <div className="web-actions-top">
          <button
            type="button"
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            type="button"
            title={locale === 'ko' ? 'English' : '한국어'}
            onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
          >
            {locale === 'ko' ? 'EN' : '한'}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {locale === 'en' ? 'Open ISO' : 'ISO 열기'}
          </button>
          <button type="button" disabled={busy || !session} onClick={() => void saveIso()}>
            {locale === 'en' ? 'Save edited' : '편집본 저장'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".iso,application/x-iso9660-image"
            hidden
            onChange={(e) => void onPickIso(e)}
          />
        </div>
      </header>

      {!session ? (
        <div
          className="dropzone"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) void openFile(file)
          }}
        >
          <strong>ISO 파일을 여기에 놓거나</strong>
          <span>위 버튼으로 선택하세요. 디렉터리만 먼저 읽어 대용량도 열 수 있습니다.</span>
        </div>
      ) : (
        <div className="web-workspace">
          <div className="toolbar">
            <div className="crumbs">
              {crumbs.map((c, i) => (
                <button
                  key={c.path || 'root'}
                  type="button"
                  className={dropTarget === c.path ? 'crumb drop-hover' : 'crumb'}
                  onClick={() => enterDir(c.path)}
                  onDragOver={(e) => onListDragOver(e, c.path)}
                  onDragLeave={onListDragLeave}
                  onDrop={(e) => void onListDrop(e, c.path)}
                >
                  {i > 0 ? ' / ' : ''}
                  {c.label}
                </button>
              ))}
            </div>
            <input
              className="filter"
              placeholder="이 폴더에서 검색…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="editor-row">
            <section
              className={
                dropTarget === cwd
                  ? 'file-list drop-active'
                  : draggingOut
                    ? 'file-list dragging-out'
                    : 'file-list'
              }
              onDragOver={(e) => onListDragOver(e, null)}
              onDragLeave={onListDragLeave}
              onDrop={(e) => void onListDrop(e, null)}
            >
              <div className="drop-hint">
                외부 파일 드롭으로 추가 · 파일을 바깥으로 드래그해 추출
              </div>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>크기</th>
                  </tr>
                </thead>
                <tbody>
                  {cwd && (
                    <tr className="row" onDoubleClick={() => enterDir(parentPath(cwd))}>
                      <td colSpan={2}>..</td>
                    </tr>
                  )}
                  {children.map((entry) => (
                    <tr
                      key={entry.path}
                      className={[
                        'row',
                        selected === entry.path ? 'active' : '',
                        !entry.isDir ? 'draggable' : '',
                        dropTarget === entry.path ? 'drop-hover' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable={!entry.isDir && !busy}
                      onMouseDown={() => onFileRowMouseDown(entry)}
                      onDragStart={(e) => onFileDragStart(e, entry)}
                      onDragEnd={onFileDragEnd}
                      onDragOver={(e) => {
                        if (entry.isDir) onListDragOver(e, entry.path)
                      }}
                      onDragLeave={onListDragLeave}
                      onDrop={(e) => {
                        if (entry.isDir) void onListDrop(e, entry.path)
                      }}
                      onClick={() => setSelected(entry.path)}
                      onDoubleClick={() => {
                        if (entry.isDir) enterDir(entry.path)
                      }}
                    >
                      <td>
                        <span className={entry.isDir ? 'icon dir' : 'icon file'} />
                        {entry.name}
                      </td>
                      <td>{entry.isDir ? '—' : formatBytes(entry.size)}</td>
                    </tr>
                  ))}
                  {children.length === 0 && (
                    <tr>
                      <td colSpan={2} className="empty">
                        이 폴더는 비어 있습니다. 파일을 여기에 드롭하세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <aside className="side">
              <h2>편집</h2>
              <p className="meta">
                {session.dirty ? '변경 사항 있음' : '변경 없음'} · 볼륨
                <input
                  value={session.volumeLabel}
                  onChange={(e) => {
                    session.volumeLabel = e.target.value
                    bump()
                  }}
                />
              </p>
              <div className="side-actions">
                <button type="button" disabled={busy} onClick={() => addInputRef.current?.click()}>
                  파일 추가
                </button>
                <button type="button" disabled={busy} onClick={makeFolder}>
                  폴더 만들기
                </button>
                <button
                  type="button"
                  disabled={busy || !selected || children.find((c) => c.path === selected)?.isDir}
                  onClick={() => void downloadSelected()}
                >
                  선택 파일 추출
                </button>
                <button type="button" disabled={busy || !selected} onClick={removeSelected}>
                  선택 삭제
                </button>
              </div>
              <input ref={addInputRef} type="file" multiple hidden onChange={(e) => void onAddFiles(e)} />
              <p className="note">
                외부 → ISO: 파일 목록·폴더·경로 바에 드롭.
                <br />
                ISO → 외부: 파일을 바탕화면/탐색기로 드래그 (Chrome/Edge에서 가장 잘 동작).
                <br />
                저장 시 부팅 정보는 유지되지 않습니다.
              </p>
            </aside>
          </div>
        </div>
      )}

      <footer className="web-status">
        <div className="meter">
          <div className="meter-fill" style={{ width: `${busy ? Math.max(progress, 8) : progress}%` }} />
        </div>
        <div className="status-text">{status}</div>
        {error && <pre className="error">{error}</pre>}
      </footer>
    </div>
  )
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function sanitizeDownloadName(name: string): string {
  return name.replace(/[:/\?&=]/g, '_')
}
