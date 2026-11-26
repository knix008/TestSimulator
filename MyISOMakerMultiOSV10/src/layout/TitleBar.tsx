/**
 * The window has no system title bar (tauri.conf.json decorations: false). The
 * toolbar row is the title bar: program icon, name and version on the left
 * (drag area), the tools, then minimize / maximize / close on the right.
 */
import { useEffect, useId, useState } from 'react'
import type { MessageKey } from '../i18n/messages'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '../platform/tauri-bridge'

type T = (key: MessageKey, ...args: string[]) => string

async function win() {
  return getCurrentWindow()
}

export function TitleBrand({ name, version, dirty }: { name: string; version: string; dirty: boolean }) {
  return (
    <div
      className="title-brand"
      data-tauri-drag-region
      onDoubleClick={() => void win().then((w) => w.toggleMaximize())}
      title={`${name} V${version}`}
    >
      <img src="/icon-32.png" alt="" className="title-icon" draggable={false} data-tauri-drag-region />
      <span className="title-name" data-tauri-drag-region>
        {name}
        {dirty ? ' *' : ''}
      </span>
      <span className="title-version" data-tauri-drag-region>
        V{version}
      </span>
    </div>
  )
}

export function WindowControls({ t }: { t: T }) {
  const [maxed, setMaxed] = useState(false)
  useEffect(() => {
    if (!isTauri()) return
    let off: (() => void) | undefined
    void win().then(async (w) => {
      setMaxed(await w.isMaximized())
      off = await w.onResized(async () => setMaxed(await w.isMaximized()))
    })
    return () => off?.()
  }, [])
  if (!isTauri()) return null
  return (
    <div className="window-controls">
      <button type="button" className="win-btn" title={t('winMinimize')} aria-label={t('winMinimize')} data-win="minimize" onClick={() => void win().then((w) => w.minimize())}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 6.5h8" stroke="#0ea5e9" strokeWidth="1.4" />
        </svg>
      </button>
      <button
        type="button"
        className="win-btn"
        title={maxed ? t('winRestore') : t('winMaximize')}
        aria-label={maxed ? t('winRestore') : t('winMaximize')}
        data-win="maximize"
        onClick={() => void win().then((w) => w.toggleMaximize())}
      >
        {maxed ? (
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="#22c55e" strokeWidth="1.2">
            <rect x="2" y="4" width="6" height="6" />
            <path d="M4 4V2h6v6H8" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="#22c55e" strokeWidth="1.2">
            <rect x="2" y="2" width="8" height="8" />
          </svg>
        )}
      </button>
      <button type="button" className="win-btn close" title={t('winClose')} aria-label={t('winClose')} data-win="close" onClick={() => void win().then((w) => w.close())}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" stroke="#ef4444" strokeWidth="1.4">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  )
}

/** United Kingdom (English). Clip ids are per instance: two flags can be on screen. */
function UnionJack() {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 60 30" width="22" height="15" aria-hidden="true" className="flag" preserveAspectRatio="none">
      <clipPath id={`uk-s-${id}`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`uk-t-${id}`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#uk-s-${id})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#uk-t-${id})`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
}

/** Flag for the language buttons: Korea for 한국어, the United Kingdom for English. */
export function Flag({ locale }: { locale: 'ko' | 'en' }) {
  if (locale === 'ko') {
    return (
      <svg viewBox="0 0 30 20" width="22" height="15" aria-hidden="true" className="flag">
        <rect width="30" height="20" fill="#fff" stroke="#cbd5e1" strokeWidth="0.6" />
        <g transform="translate(15 10)">
          <path d="M-5 0a5 5 0 0 1 10 0z" fill="#cd2e3a" />
          <path d="M-5 0a5 5 0 0 0 10 0z" fill="#0047a0" />
          <circle cx="-2.5" cy="0" r="2.5" fill="#cd2e3a" />
          <circle cx="2.5" cy="0" r="2.5" fill="#0047a0" />
        </g>
        <g fill="#000">
          <rect x="3" y="3" width="5" height="0.9" transform="rotate(34 5.5 4)" />
          <rect x="3" y="4.6" width="5" height="0.9" transform="rotate(34 5.5 4)" />
          <rect x="22" y="3" width="5" height="0.9" transform="rotate(-34 24.5 4)" />
          <rect x="22" y="4.6" width="5" height="0.9" transform="rotate(-34 24.5 4)" />
          <rect x="3" y="14.4" width="5" height="0.9" transform="rotate(-34 5.5 16)" />
          <rect x="3" y="16" width="5" height="0.9" transform="rotate(-34 5.5 16)" />
          <rect x="22" y="14.4" width="5" height="0.9" transform="rotate(34 24.5 16)" />
          <rect x="22" y="16" width="5" height="0.9" transform="rotate(34 24.5 16)" />
        </g>
      </svg>
    )
  }
  return <UnionJack />

}
