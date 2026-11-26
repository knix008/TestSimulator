/**
 * Help: the user's guide and the tutorial from doc/ (Korean / English twins),
 * rendered in the app. The top bar has the manual's own language (flags), the text
 * size (− NNpx +, remembered) and Print, which opens the shared print window with the
 * document as shown. Contents on the left (## headings), text on the right.
 */
import { invoke } from '@tauri-apps/api/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MessageKey } from '../i18n/messages'
import { Flag } from '../layout/TitleBar'
import { isTauri } from '../platform/tauri-bridge'
import { Icons } from '../Toolbar'
import { renderMarkdown, setImageResolver } from './markdown'
import guideKo from '../../doc/UsersGuide.md?raw'
import guideEn from '../../doc/UsersGuide.en.md?raw'
import tutorialKo from '../../doc/Tutorial.md?raw'
import tutorialEn from '../../doc/Tutorial.en.md?raw'

type T = (key: MessageKey, ...args: string[]) => string

// The manuals' pictures (doc/images/<lang>/*.png, npm run doc:images), bundled with the page.
const IMAGES = import.meta.glob('../../doc/images/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
setImageResolver((src) => IMAGES[`../../doc/${src}`] ?? src)
type Doc = 'guide' | 'tutorial'

const FONT = { min: 10, max: 24, normal: 14 }
const FONT_KEY = 'isomaker.helpFontPx'

function loadFont(): number {
  try {
    const n = Math.round(Number(localStorage.getItem(FONT_KEY)))
    return Number.isFinite(n) && n >= FONT.min && n <= FONT.max ? n : FONT.normal
  } catch {
    return FONT.normal
  }
}

/** The Help window's contents (tool.html#help). */
export function HelpView({ t, locale }: { t: T; locale: 'ko' | 'en' }) {
  const [doc, setDoc] = useState<Doc>('guide')
  const [lang, setLang] = useState<'ko' | 'en'>(locale)
  const [font, setFontState] = useState(loadFont)
  const [printNote, setPrintNote] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const source = doc === 'guide' ? (lang === 'ko' ? guideKo : guideEn) : lang === 'ko' ? tutorialKo : tutorialEn
  const { html, headings } = useMemo(() => renderMarkdown(source), [source])

  // The manual follows the program's language when that changes.
  useEffect(() => {
    setLang(locale)
  }, [locale])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [doc, lang])

  const setFont = (n: number) => {
    const v = Math.max(FONT.min, Math.min(FONT.max, n))
    setFontState(v)
    try {
      localStorage.setItem(FONT_KEY, String(v))
    } catch {
      /* no storage */
    }
  }

  async function print() {
    const title = `${doc === 'guide' ? t('helpGuide') : t('helpTutorial')} (${lang === 'ko' ? '한국어' : 'English'})`
    const page = `<div style="font-size:${font}px">${html}</div>`
    if (!isTauri()) {
      window.print()
      return
    }
    try {
      await invoke('open_print_window', { title, html: page, lang })
      setPrintNote('')
    } catch (err) {
      setPrintNote(String(err))
    }
  }

  return (
    <div className="help-view">
      <div className="help-top">
        <div className="help-langs" role="group" aria-label={t('settingsLanguage')}>
          {(['ko', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`help-lang${lang === l ? ' on' : ''}`}
              data-help-lang={l}
              title={l === 'ko' ? '한국어' : 'English'}
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
            >
              <Flag locale={l} />
              <span>{l === 'ko' ? '한국어' : 'English'}</span>
            </button>
          ))}
        </div>
        <span className="help-top-sep" aria-hidden="true" />
        <div className="help-font" role="group" aria-label={t('helpFontSize')}>
          <button type="button" className="help-font-btn" title={t('helpFontSmaller')} disabled={font <= FONT.min} onClick={() => setFont(font - 1)}>
            <span aria-hidden="true">A−</span>
          </button>
          <button type="button" className="help-font-value" title={t('helpFontReset')} onClick={() => setFont(FONT.normal)} data-help-font="">
            {font}px
          </button>
          <button type="button" className="help-font-btn" title={t('helpFontLarger')} disabled={font >= FONT.max} onClick={() => setFont(font + 1)}>
            <span aria-hidden="true">A+</span>
          </button>
        </div>
        <span className="help-top-grow" />
        {printNote ? <span className="help-print-note">{printNote}</span> : null}
        <button type="button" className="dialog-btn help-print" data-help-print="" onClick={() => void print()}>
          {Icons.print}
          <span>{t('helpPrint')}</span>
        </button>
      </div>
      <div className="help-layout">
        <nav className="help-nav">
          <div className="help-tabs" role="tablist">
            {(['guide', 'tutorial'] as Doc[]).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={doc === d}
                className={`help-tab${doc === d ? ' on' : ''}`}
                onClick={() => setDoc(d)}
              >
                {d === 'guide' ? t('helpGuide') : t('helpTutorial')}
              </button>
            ))}
          </div>
          <ul className="help-toc">
            {headings
              .filter((h) => h.level === 2 || h.level === 3)
              .map((h) => (
                <li key={h.id} className={`lv${h.level}`}>
                  <button
                    type="button"
                    onClick={() => bodyRef.current?.querySelector(`#${h.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
          </ul>
        </nav>
        <div
          className="help-doc"
          ref={bodyRef}
          data-help-doc={doc}
          style={{ fontSize: `${font}px` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
