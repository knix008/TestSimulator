/** Right panel (image + selection info) and bottom panel (log). */
import { useEffect, useRef } from 'react'
import type { EngineInfo } from '../../host/iso/types'
import type { ContextMenuItem } from '../components/ContextMenu'
import type { IsoTreeNode } from '../iso9660/tree-types'
import type { MessageKey } from '../i18n/messages'
import { Icons } from '../Toolbar'
import type { EditSessionSnapshot } from '../vite-env'

type T = (key: MessageKey, ...args: string[]) => string

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function countTree(nodes: IsoTreeNode[]): { files: number; dirs: number; bytes: number } {
  let files = 0
  let dirs = 0
  let bytes = 0
  const walk = (list: IsoTreeNode[]) => {
    for (const n of list) {
      if (n.isDir) {
        dirs += 1
        if (n.children) walk(n.children)
      } else {
        files += 1
        bytes += n.size || 0
      }
    }
  }
  walk(nodes)
  return { files, dirs, bytes }
}

export function InfoPanel({
  t,
  session,
  selected,
  engine,
  onMenu,
  copyText,
}: {
  t: T
  session: EditSessionSnapshot | null
  selected: IsoTreeNode[]
  engine: EngineInfo | null
  onMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  copyText: (text: string) => void
}) {
  const rows: [string, string][] = []
  if (session) {
    rows.push([t('infoFile'), session.sourcePath])
    rows.push([t('infoKind'), session.sourceKind.toUpperCase()])
    rows.push([t('infoVolume'), session.volumeLabel || '—'])
    rows.push([t('infoEntries'), String(session.entryCount)])
    rows.push([t('infoSize'), fmtSize(session.totalBytes)])
    rows.push([t('infoState'), session.dirty ? t('dirtyBadge') : t('infoSaved')])
  }
  const sel = countTree(selected)
  const menu = (ev: React.MouseEvent, text: string) => {
    ev.preventDefault()
    ev.stopPropagation()
    onMenu(ev.clientX, ev.clientY, [
      { id: 'copy', label: t('infoCopyValue'), icon: Icons.copy, onClick: () => copyText(text) },
      {
        id: 'copy-all',
        label: t('infoCopyAll'),
        icon: Icons.copy,
        onClick: () => copyText(rows.map(([k, v]) => `${k}: ${v}`).join('\n')),
      },
    ])
  }
  return (
    <div className="info-panel">
      <h3 className="info-sub">
        {Icons.disc}
        {t('infoImage')}
      </h3>
      {session ? (
        <dl className="info-grid">
          {rows.map(([k, v]) => (
            <div key={k} className="info-item" onContextMenu={(e) => menu(e, v)}>
              <dt>{k}</dt>
              <dd title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="info-empty">{t('statusNoIso')}</p>
      )}

      <h3 className="info-sub">
        {Icons.check}
        {t('infoSelection')}
      </h3>
      {selected.length === 0 ? (
        <p className="info-empty">{t('infoNoSelection')}</p>
      ) : selected.length === 1 ? (
        <dl className="info-grid">
          {(
            [
              [t('infoName'), selected[0]!.name],
              [t('infoPath'), `/${selected[0]!.path}`],
              [t('infoType'), selected[0]!.isDir ? t('infoFolder') : t('infoFileType')],
              [t('infoSize'), selected[0]!.isDir ? `${fmtSize(sel.bytes)} · ${sel.files + sel.dirs - 1}` : fmtSize(selected[0]!.size)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="info-item" onContextMenu={(e) => menu(e, v)}>
              <dt>{k}</dt>
              <dd title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="info-grid">
          <div className="info-item">
            <dt>{t('infoSelected')}</dt>
            <dd>{selected.length}</dd>
          </div>
          <div className="info-item">
            <dt>{t('infoFilesDirs')}</dt>
            <dd>
              {sel.files} / {sel.dirs}
            </dd>
          </div>
          <div className="info-item">
            <dt>{t('infoSize')}</dt>
            <dd>{fmtSize(sel.bytes)}</dd>
          </div>
        </dl>
      )}

      <h3 className="info-sub">
        {Icons.engine}
        {t('homeEngine')}
      </h3>
      <dl className="info-grid">
        <div className="info-item">
          <dt>{t('infoState')}</dt>
          <dd className={engine?.available ? 'ok' : 'warn'}>
            {engine ? (engine.available ? t('homeEngineOk') : t('engineMissing')) : t('engineChecking')}
          </dd>
        </div>
        {engine?.version ? (
          <div className="info-item">
            <dt>{t('homeEngineVersion')}</dt>
            <dd>{engine.version}</dd>
          </div>
        ) : null}
        {engine?.binaryPath ? (
          <div className="info-item" onContextMenu={(e) => menu(e, engine.binaryPath ?? '')}>
            <dt>{t('homeEnginePath')}</dt>
            <dd title={engine.binaryPath}>{engine.binaryPath}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

export type LogEntry = { id: number; time: string; kind: string; message: string }

export function LogPanel({
  t,
  entries,
  onMenu,
}: {
  t: T
  entries: LogEntry[]
  onMenu: (x: number, y: number, entry: LogEntry | null) => void
}) {
  const end = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [entries.length])
  return (
    <div
      className="log-panel"
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY, null)
      }}
    >
      {entries.length === 0 ? (
        <div className="change-log-empty">{t('changeLogEmpty')}</div>
      ) : (
        <ul className="log-list">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              ref={i === entries.length - 1 ? end : undefined}
              className={`log-item kind-${entry.kind}`}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onMenu(e.clientX, e.clientY, entry)
              }}
            >
              <span className="log-time">{entry.time}</span>
              <span className={`log-kind kind-${entry.kind}`}>{entry.kind}</span>
              <span className="log-msg">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
