/**
 * Theme button on the toolbar (after MyZipMaster): the main part switches to
 * the next theme of the same family at once; the ▾ part on its right opens a
 * drop-down with every theme as a colour chip — Custom and "Edit custom
 * theme…" on top, then 20 Dark and 20 Light.
 */
import { useEffect, useRef, useState } from 'react'
import { usePrefs } from '../i18n/Preferences'
import { CUSTOM_ID, themeById, themesByMode } from './themes'

export function ThemeChips({ onPick }: { onPick?: (id: string) => void }) {
  const { themeId, setThemeId, themeName, t } = usePrefs()
  const pick = (id: string) => {
    setThemeId(id)
    onPick?.(id)
  }
  return (
    <>
      {(['dark', 'light'] as const).map((mode) => (
        <div key={mode} className="theme-group" data-theme-group={mode}>
          <div className="theme-group-head">{mode === 'dark' ? t('themeGroupDark') : t('themeGroupLight')}</div>
          <div className="theme-grid">
            {themesByMode(mode).map((th: { id: string; bars: string[] }) => (
              <button
                key={th.id}
                type="button"
                data-theme-pick={th.id}
                className={`theme-chip${themeId === th.id ? ' on' : ''}`}
                title={themeName(th.id)}
                aria-pressed={themeId === th.id}
                onClick={() => pick(th.id)}
              >
                <span className="theme-chip-bars" aria-hidden="true">
                  {th.bars.map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                <span className="theme-chip-name">{themeName(th.id)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/** The theme button's icon: a painter's palette with coloured paint. */
export const PALETTE = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M12 3a9 9 0 0 0 0 18c1.3 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"
      fill="#f3d9a4"
      stroke="#b7791f"
      strokeWidth="1.2"
    />
    <circle cx="7.5" cy="11" r="1.6" fill="#ef4444" />
    <circle cx="9.5" cy="7" r="1.6" fill="#f59e0b" />
    <circle cx="14" cy="6.5" r="1.6" fill="#22c55e" />
    <circle cx="17.5" cy="9.5" r="1.6" fill="#3b82f6" />
  </svg>
)

export function ThemeSplitButton({ onEditCustom }: { onEditCustom: () => void }) {
  const { themeId, cycleTheme, setThemeId, themeName, t, customColors } = usePrefs()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  const custom = themeById(CUSTOM_ID) as { bars: string[] }
  void customColors // re-render when the custom colours change

  return (
    <div className="theme-split" ref={box}>
      <button
        type="button"
        className="toolbar-btn icon-only theme-cycle"
        data-testid="theme-cycle"
        title={t('tipThemeCycle', themeName(themeId))}
        aria-label={t('tipThemeCycle', themeName(themeId))}
        onClick={cycleTheme}
      >
        <span className="toolbar-icon" aria-hidden="true">
          {PALETTE}
        </span>
      </button>
      <button
        type="button"
        className={`theme-select${open ? ' open' : ''}`}
        data-testid="theme-menu"
        title={t('tipThemeMenu')}
        aria-label={t('tipThemeMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-select-name">{themeName(themeId)}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="theme-menu" role="menu">
          <div className="theme-menu-top">
            <button
              type="button"
              className={`theme-menu-item${themeId === CUSTOM_ID ? ' on' : ''}`}
              data-theme-pick={CUSTOM_ID}
              onClick={() => {
                setThemeId(CUSTOM_ID)
                setOpen(false)
              }}
            >
              <span className="theme-swatch-mini" aria-hidden="true">
                {custom.bars.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span>{t('themeCustom')}</span>
            </button>
            <button
              type="button"
              className="theme-menu-item"
              data-testid="theme-customize"
              onClick={() => {
                setOpen(false)
                onEditCustom()
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20h4l10-10-4-4L4 16v4z" />
                <path d="M13 7l4 4" />
              </svg>
              <span>{t('themeCustomEdit')}</span>
            </button>
          </div>
          <ThemeChips onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  )
}
