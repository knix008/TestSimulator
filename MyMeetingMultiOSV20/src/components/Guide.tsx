// The user guide from doc/, with its screenshots, readable inside the app.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { docImage } from '../docImages'
import { inlinePieces, parseMarkdown, type Block as BlockData } from '../markdown'
import type { Locale } from '../settings'
import { Stepper } from './controls'
import { Dialog, WindowButtons } from './dialogs'
import { Flag, Icon } from './Icons'

const DOCUMENTS: Record<Locale, () => Promise<{ default: string }>> = {
  ko: () => import('../../doc/UsersGuide.md?raw'),
  en: () => import('../../doc/UsersGuide.en.md?raw'),
}
const FONT_KEY = 'mymeeting.guide.fontSize'
const LANGUAGE_KEY = 'mymeeting.guide.language'
const MIN_FONT = 11
const MAX_FONT = 22
const DEFAULT_FONT = 14
const HEADINGS = 'h1, h2, h3, h4'

function remembered(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function remember(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* storage blocked */
  }
}
function savedFont() {
  const value = Number(remembered(FONT_KEY))
  return Number.isInteger(value) && value >= MIN_FONT && value <= MAX_FONT ? value : DEFAULT_FONT
}

function Inline({ text, onZoom }: { text: string; onZoom: (src: string) => void }) {
  return inlinePieces(text).map((piece, index) => {
    if ('code' in piece) return <code key={index}>{piece.code}</code>
    if ('bold' in piece) return <strong key={index}>{piece.bold}</strong>
    if ('src' in piece) {
      const url = docImage(piece.src)
      return url ? (
        <button type="button" key={index} className="guide-shot" data-tip={piece.image} onClick={() => onZoom(url)}>
          <img src={url} alt={piece.image} loading="lazy" />
        </button>
      ) : null
    }
    if ('link' in piece) return <span key={index} title={piece.href}>{piece.link}</span>
    return <span key={index}>{piece.text}</span>
  })
}

function Block({ block, id, onZoom }: { block: BlockData; id: string; onZoom: (src: string) => void }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(block.level, 4)}` as 'h1'
      return <Tag id={id}><Inline text={block.text} onZoom={onZoom} /></Tag>
    }
    case 'code':
      return <pre>{block.text}</pre>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return <Tag>{block.items.map((item, index) => <li key={index}><Inline text={item} onZoom={onZoom} /></li>)}</Tag>
    }
    case 'table':
      return (
        <table>
          <thead><tr>{block.head.map((cell, index) => <th key={index}><Inline text={cell} onZoom={onZoom} /></th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, index) => <td key={index}><Inline text={cell} onZoom={onZoom} /></td>)}</tr>)}</tbody>
        </table>
      )
    default:
      return <p><Inline text={block.text} onZoom={onZoom} /></p>
  }
}

export function GuideDialog({ language: appLanguage, onClose }: { language: Locale; onClose: () => void }) {
  const [chosen, setChosen] = useState<Locale | null>(() => {
    const value = remembered(LANGUAGE_KEY)
    return value === 'ko' || value === 'en' ? value : null
  })
  const language: Locale = chosen ?? appLanguage
  const other: Locale = language === 'en' ? 'ko' : 'en'
  const { t } = useTranslation(undefined, { lng: language })
  const [fontSize, setFontSize] = useState(savedFont)
  const [source, setSource] = useState('')
  const [zoomed, setZoomed] = useState<string | null>(null)
  const body = useRef<HTMLElement>(null)
  const keep = useRef<number | null>(null)

  // Both languages have the same headings in the same order, so the reader stays on the same one.
  const currentHeading = () => {
    const element = body.current
    if (!element) return 0
    const top = element.getBoundingClientRect().top + 8
    let current = 0
    element.querySelectorAll(HEADINGS).forEach((heading, index) => {
      if (heading.getBoundingClientRect().top <= top) current = index
    })
    return current
  }
  const switchLanguage = () => {
    keep.current = currentHeading()
    setChosen(other)
    remember(LANGUAGE_KEY, other)
  }
  const changeFont = (size: number) => {
    setFontSize(size)
    remember(FONT_KEY, size)
  }

  useEffect(() => {
    let alive = true
    void DOCUMENTS[language]().then((module) => {
      if (alive) setSource(module.default)
    })
    return () => {
      alive = false
    }
  }, [language])
  const blocks = useMemo(() => parseMarkdown(source), [source])
  useLayoutEffect(() => {
    const element = body.current
    if (!element || !source) return
    if (keep.current === null) element.scrollTop = 0
    else element.querySelectorAll(HEADINGS)[keep.current]?.scrollIntoView({ block: 'start' })
    keep.current = null
  }, [source])
  const headings = blocks.flatMap((block, index) => (block.type === 'heading' && block.level === 2 ? [{ text: block.text, index }] : []))
  return (
    <Dialog id="guide" title={t('guide.title')} icon="guide" onClose={() => (zoomed ? setZoomed(null) : onClose())} large bare footer={<button type="button" className="primary" data-command="guide-close" onClick={onClose}><Icon name="close" size={14} /> {t('common.close')}</button>}>
      <div className="guide-window" style={{ '--guide-font': `${fontSize}px` } as CSSProperties}>
        <div className="guide-bar" data-window-drag="">
          <span className="guide-bar-title" data-dialog-title=""><Icon name="guide" /><span>{t('guide.title')}</span></span>
          <span className="guide-bar-gap" />
          <button type="button" className="guide-language" data-command="guide-language" data-language={language} data-tip={t('guide.switchLanguage')} aria-label={t('guide.switchLanguage')} onClick={switchLanguage}>
            <Flag country={other === 'en' ? 'gb' : 'kr'} />
            <span>{other === 'en' ? 'English' : '한국어'}</span>
          </button>
          <span className="guide-font" data-tip={t('guide.fontSize')}>
            <Icon name="fontFile" />
            <span>{t('guide.fontSize')}</span>
            <Stepper id="guideFontSize" unit="px" value={fontSize} min={MIN_FONT} max={MAX_FONT} onChange={changeFont} />
          </span>
          <WindowButtons onClose={onClose} />
        </div>
        <div className="guide-main">
          <nav className="conf-sections" data-guide-nav="">
            {headings.map(({ text, index }) => (
              <button type="button" key={index} data-guide-heading={index} data-tip={text} onClick={() => body.current?.querySelector(`[id="guide-${index}"]`)?.scrollIntoView({ block: 'start' })}>
                <span><Icon name="caretRight" size={12} /> {text}</span>
              </button>
            ))}
          </nav>
          <article className="guide-body" ref={body} lang={language} data-guide-body="">
            {blocks.map((block, index) => <Block key={index} block={block} id={`guide-${index}`} onZoom={setZoomed} />)}
          </article>
        </div>
        {zoomed && (
          <button type="button" className="shot-zoom" aria-label={t('common.close')} onClick={() => setZoomed(null)}>
            <img src={zoomed} alt="" />
          </button>
        )}
      </div>
    </Dialog>
  )
}
