/**
 * Theme button on the toolbar (after MyZipMaster): the main part switches to
 * the next theme of the same family at once; the ▾ part on its right opens a
 * drop-down with every theme as a colour chip — Custom and "Edit custom
 * theme…" on top, then 20 Dark and 20 Light.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '../platform/tauri-bridge'
import { usePrefs } from '../i18n/Preferences'
import { CUSTOM_ID, themeById, themesByMode } from './themes'
import { Icons } from '../Toolbar'

/** Settings › Theme: the same two columns as the theme menu (Dark | Light), one theme per row. */
export function ThemeList() {
  const { themeId, setThemeId, themeName, t } = usePrefs()
  return (
    <div className="theme-list-cols">
      {(['dark', 'light'] as const).map((mode) => (
        <div key={mode} className="theme-list-col" data-theme-group={mode}>
          <div className="theme-v-head">{mode === 'dark' ? t('themeGroupDark') : t('themeGroupLight')}</div>
          {themesByMode(mode).map((th: { id: string; bars: string[] }) => (
            <button
              key={th.id}
              type="button"
              role="radio"
              aria-checked={themeId === th.id}
              className={`ctx-menu-item${themeId === th.id ? ' on' : ''}`}
              data-theme-pick={th.id}
              onClick={() => setThemeId(th.id)}
            >
              <span className="theme-swatch-mini" aria-hidden="true">
                {th.bars.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="theme-v-name">{themeName(th.id)}</span>
              {themeId === th.id ? <span className="theme-v-check" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

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
  const menu = useRef<HTMLDivElement>(null)
  // Desktop: the menu is a window of its own (thememenu.html), free to pass the main window's
  // edge and kept on the screen by Rust. It hides when it loses focus, so a click on this
  // button right after that means "close", not "open again".
  const desktop = isTauri()
  const winOpen = useRef(false)
  const closedAt = useRef(0)
  useEffect(() => {
    if (!desktop) return
    const offs = [
      listen('theme-menu-closed', () => {
        winOpen.current = false
        closedAt.current = Date.now()
      }),
      listen('theme-menu-customize', () => onEditCustom()),
    ]
    return () => {
      for (const off of offs) void off.then((f) => f())
    }
  }, [desktop, onEditCustom])
  const toggle = () => {
    if (!desktop) {
      setOpen((v) => !v)
      return
    }
    if (winOpen.current) {
      void invoke('hide_theme_menu').catch(() => {})
      return
    }
    if (Date.now() - closedAt.current < 300) return
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    winOpen.current = true
    void invoke('show_theme_menu', { x: r.right, y: r.bottom + 4 }).catch(() => {
      winOpen.current = false
    })
  }
  // The list is drawn on the page itself (a portal), placed under the button: the toolbar row
  // clips what goes past it (overflow: hidden keeps it on one line), which hid the list.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = box.current?.getBoundingClientRect()
      if (r) setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const target = e.target as Node
      if (!box.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
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
        onClick={toggle}
      >
        <span className="theme-select-name">{themeName(themeId)}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <div
              className="ctx-menu theme-menu-v"
              role="menu"
              ref={menu}
              style={{ top: pos.top, right: pos.right, maxHeight: `calc(100vh - ${pos.top + 12}px)` }}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={themeId === CUSTOM_ID}
                className={`ctx-menu-item${themeId === CUSTOM_ID ? ' on' : ''}`}
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
                <span className="theme-v-name">{t('themeCustom')}</span>
                {themeId === CUSTOM_ID ? <span className="theme-v-check" aria-hidden="true">✓</span> : null}
              </button>
              <button
                type="button"
                role="menuitem"
                className="ctx-menu-item"
                data-testid="theme-customize"
                onClick={() => {
                  setOpen(false)
                  onEditCustom()
                }}
              >
                <span className="ctx-menu-icon" aria-hidden="true">
                  {Icons.settings}
                </span>
                <span className="theme-v-name">{t('themeCustomEdit')}</span>
              </button>
              {(['dark', 'light'] as const).map((mode) => (
                <div key={mode} className="theme-v-group" data-theme-group={mode}>
                  <div className="ctx-menu-sep" role="separator" />
                  <div className="theme-v-head">{mode === 'dark' ? t('themeGroupDark') : t('themeGroupLight')}</div>
                  {themesByMode(mode).map((th: { id: string; bars: string[] }) => (
                    <button
                      key={th.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={themeId === th.id}
                      className={`ctx-menu-item${themeId === th.id ? ' on' : ''}`}
                      data-theme-pick={th.id}
                      onClick={() => {
                        setThemeId(th.id)
                        setOpen(false)
                      }}
                    >
                      <span className="theme-swatch-mini" aria-hidden="true">
                        {th.bars.map((c, i) => (
                          <i key={i} style={{ background: c }} />
                        ))}
                      </span>
                      <span className="theme-v-name">{themeName(th.id)}</span>
                      {themeId === th.id ? <span className="theme-v-check" aria-hidden="true">✓</span> : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
