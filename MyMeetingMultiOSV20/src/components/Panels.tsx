// Beside the form: the outline on the left (sections and the discussion's own headings), the finished
// document on the right, and the status bar below.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { sectionIcon, stats, type Meeting, type Section } from '../meeting'
import { PREVIEW_MAX, PREVIEW_MIN } from '../settings'
import { Icon } from './Icons'
import { sectionLabel } from './SectionParts'

const countOf = (m: Meeting, s: Section) => {
  switch (s.kind) {
    case 'attendees': return m.attendees.length
    case 'agenda': return m.agenda.length
    case 'decisions': return m.decisions.length
    case 'actionItems': return m.actionItems.length
    default: return s.entries.length + s.tasks.length + s.people.length
  }
}

/** The rich text of a section that has one. */
const textOf = (m: Meeting, s: Section) => (s.kind === 'discussion' ? m.body : s.kind === 'text' ? s.body : '')

/** The discussion's headings, as the editor shows them. */
function headingsOf(body: string) {
  const out: { level: number; text: string }[] = []
  let fenced = false
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (match) out.push({ level: match[1].length, text: match[2].replace(/[*_`~]|<\/?u>/g, '') })
  }
  return out
}

export function OutlinePanel({ meeting, scroller, onHide }: { meeting: Meeting; scroller: HTMLElement | null; onHide: () => void }) {
  const { t } = useTranslation()
  const [active, setActive] = useState('')

  useEffect(() => {
    if (!scroller) return undefined
    const follow = () => {
      const top = scroller.getBoundingClientRect().top + 80
      let current = ''
      for (const section of scroller.querySelectorAll<HTMLElement>('.sheet-section')) {
        if (!current || section.getBoundingClientRect().top <= top) current = section.dataset.section ?? ''
      }
      setActive(current)
    }
    follow()
    scroller.addEventListener('scroll', follow, { passive: true })
    return () => scroller.removeEventListener('scroll', follow)
  }, [scroller, meeting.sections])

  const go = (id: string) => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setActive(id)
  }
  const goHeading = (id: string, index: number) => {
    const heading = document.querySelectorAll(`#sec-${CSS.escape(id)} .richeditor-page :is(h1,h2,h3,h4,h5,h6)`)[index]
    heading?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const s = stats(meeting)
  const present = meeting.attendees.filter((p) => p.attendance !== 'absent' && p.name.trim()).length

  return (
    <aside className="side-panel outline-panel" data-panel="outline" aria-label={t('panel.outline')}>
      <header className="panel-head">
        <Icon name="panelStructure" />
        <strong>{t('panel.outline')}</strong>
        <span className="grow" />
        <button type="button" className="mini" aria-label={t('panel.hideOutline')} onClick={onHide}><Icon name="collapseLeft" size={14} /></button>
      </header>
      <nav className="outline-list">
        {meeting.sections.map((section) => {
          const { id } = section
          const count = countOf(meeting, section)
          const headings = headingsOf(textOf(meeting, section))
          const minLevel = Math.min(6, ...headings.map((h) => h.level))
          return (
            <div key={id}>
              <button type="button" className={`outline-item${active === id ? ' is-active' : ''}`} data-outline={id} onClick={() => go(id)}>
                <Icon name={sectionIcon(section)} size={16} />
                <span className="outline-label">{sectionLabel(section, t)}</span>
                {count ? <span className="count-badge">{count}</span> : null}
              </button>
              {headings.length > 0 && (
                <div className="outline-sub">
                  {headings.map((heading, index) => (
                    <button type="button" key={index} className="outline-heading" style={{ '--level': heading.level - minLevel } as CSSProperties} title={heading.text} onClick={() => goHeading(id, index)}>
                      {heading.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <dl className="outline-stats">
        <dt>{t('stats.attendance')}</dt>
        <dd>{t('stats.present', { present, total: meeting.attendees.length })}</dd>
        <dt>{t('stats.actions')}</dt>
        <dd>
          <span className="progress-line" aria-hidden="true"><i style={{ width: `${s.actions ? (s.actionsDone / s.actions) * 100 : 0}%` }} /></span>
          {t('stats.done', { done: s.actionsDone, total: s.actions })}
        </dd>
        <dt>{t('stats.words')}</dt>
        <dd>{s.words}</dd>
      </dl>
    </aside>
  )
}

/** The editor keeps at least this much room beside the preview. */
const EDITOR_MIN = 420

type PreviewProps = { html: string; styleVars: string; width: number | null; onWidth: (width: number | null) => void; onPrint: () => void; onHide: () => void }

export function PreviewPanel({ html, styleVars, width, onWidth, onPrint, onHide }: PreviewProps) {
  const { t } = useTranslation()
  const panel = useRef<HTMLElement>(null)
  const clamp = (value: number) => {
    const room = (panel.current?.parentElement?.clientWidth ?? 1600) - EDITOR_MIN
    return Math.round(Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, room, value)))
  }
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = panel.current
    if (event.button !== 0 || !element) return
    event.preventDefault()
    const handle = event.currentTarget
    const right = element.getBoundingClientRect().right
    let last = element.offsetWidth
    handle.setPointerCapture(event.pointerId)
    document.body.classList.add('col-resizing')
    const move = (next: PointerEvent) => {
      last = clamp(right - next.clientX)
      element.style.width = `${last}px`
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      document.body.classList.remove('col-resizing')
      onWidth(last)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }
  const onKey = (event: React.KeyboardEvent) => {
    const by = event.key === 'ArrowLeft' ? 20 : event.key === 'ArrowRight' ? -20 : 0
    if (!by || !panel.current) return
    event.preventDefault()
    onWidth(clamp(panel.current.offsetWidth + by))
  }
  return (
    <aside ref={panel} className="side-panel preview-panel" data-panel="preview" aria-label={t('panel.preview')} style={width ? { width } : undefined}>
      <div className="preview-splitter" role="separator" aria-orientation="vertical" aria-label={t('panel.resizePreview')} title={t('panel.resizePreview')} tabIndex={0} data-preview-splitter="" onPointerDown={startResize} onDoubleClick={() => onWidth(null)} onKeyDown={onKey} />
      <header className="panel-head">
        <Icon name="eye" />
        <strong>{t('panel.preview')}</strong>
        <span className="grow" />
        <button type="button" className="mini" data-tip={t('toolbar.print')} aria-label={t('toolbar.print')} onClick={onPrint}><Icon name="print" size={14} /></button>
        <button type="button" className="mini" aria-label={t('panel.hidePreview')} onClick={onHide}><Icon name="collapseRight" size={14} /></button>
      </header>
      <div className="preview-scroll">
        <article className="preview-paper doc" style={Object.fromEntries(styleVars.split(';').filter(Boolean).map((pair) => { const at = pair.indexOf(':'); return [pair.slice(0, at), pair.slice(at + 1)] })) as CSSProperties} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </aside>
  )
}

export function StatusBar({ meeting, filePath, dirty, savedAt, message }: { meeting: Meeting; filePath: string | null; dirty: boolean; savedAt: Date | null; message: string }) {
  const { t } = useTranslation()
  const s = stats(meeting)
  return (
    <footer className="status-bar" data-status-bar="">
      <span className={`status-dot${dirty ? ' is-dirty' : ''}`} aria-hidden="true" />
      <span className="status-file" title={filePath ?? ''}>{filePath ?? t('status.unsaved')}</span>
      <span className="status-state">{dirty ? t('status.modified') : savedAt ? t('status.savedAt', { time: savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('status.draftKept')}</span>
      {message && <span className="status-message" data-status-message="">{message}</span>}
      <span className="grow" />
      <span><Icon name="users" size={13} /> {s.attendees}</span>
      <span><Icon name="agenda" size={13} /> {s.agenda}</span>
      <span><Icon name="decision" size={13} /> {s.decisions}</span>
      <span><Icon name="action" size={13} /> {s.actionsDone}/{s.actions}</span>
      <span>{t('stats.wordsShort', { count: s.words })}</span>
    </footer>
  )
}
