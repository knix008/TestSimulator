/**
 * Help: the user's guide and the tutorial from doc/ (Korean / English twins),
 * rendered in the app. Contents on the left (## headings), text on the right;
 * Print prints the document as shown.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '../components/Dialog'
import type { MessageKey } from '../i18n/messages'
import { Icons } from '../Toolbar'
import { renderMarkdown } from './markdown'
import guideKo from '../../doc/UsersGuide.md?raw'
import guideEn from '../../doc/UsersGuide.en.md?raw'
import tutorialKo from '../../doc/Tutorial.md?raw'
import tutorialEn from '../../doc/Tutorial.en.md?raw'

type T = (key: MessageKey, ...args: string[]) => string
type Doc = 'guide' | 'tutorial'

export function HelpDialog({ open, onClose, t, locale }: { open: boolean; onClose: () => void; t: T; locale: 'ko' | 'en' }) {
  const [doc, setDoc] = useState<Doc>('guide')
  const bodyRef = useRef<HTMLDivElement>(null)
  const source = doc === 'guide' ? (locale === 'ko' ? guideKo : guideEn) : locale === 'ko' ? tutorialKo : tutorialEn
  const { html, headings } = useMemo(() => renderMarkdown(source), [source])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [doc, locale])

  return (
    <Dialog
      open={open}
      title={t('help')}
      icon={Icons.help}
      onClose={onClose}
      panelClassName="dialog-panel--help"
      buttons={[
        { id: 'print', label: t('helpPrint'), icon: Icons.print, onClick: () => window.print() },
        { id: 'close', label: t('dialogClose'), icon: Icons.close, primary: true, onClick: onClose },
      ]}
    >
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
        <div className="help-doc" ref={bodyRef} data-help-doc={doc} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Dialog>
  )
}
