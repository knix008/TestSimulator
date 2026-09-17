import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { commandsInMenu, type MenuId } from './commands'
import { t } from './i18n'
import { applyTheme } from './themes'
import type { Language } from './lib/types'

/**
 * The contents of one menu, rendered inside its own always-on-top window.
 *
 * A frameless BrowserWindow clips its HTML, so the Layer menu (which runs to
 * about thirty rows) could not be shown from inside the app window. Here the
 * list measures itself, asks the main process to size the window to match, and
 * the popup is free to overhang the application.
 */

export type MenuPayload = {
  menu: MenuId
  language: Language
  theme: string
  /** Ids that should read as pressed. */
  active: string[]
  /** Labels App resolves itself, such as the colour-mode toggle. */
  overrides: Record<string, string>
}

export default function MenuHost({ menu }: { menu: MenuId }) {
  const [payload, setPayload] = useState<MenuPayload | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.electronMenuApi?.payload().then((value) => {
      if (!cancelled && value) setPayload(value as MenuPayload)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (payload?.theme) applyTheme(payload.theme)
  }, [payload?.theme])

  // Report the measured size once the rows have laid out, so the window fits
  // its content exactly rather than guessing.
  useLayoutEffect(() => {
    const node = listRef.current
    if (!node || !payload) return
    const report = () => {
      const box = node.getBoundingClientRect()
      void window.electronMenuApi?.reportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [payload])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.electronMenuApi?.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!payload) {
    return <div className="menu-window" ref={listRef} />
  }

  const language = payload.language
  const label = (key: string) => payload.overrides[key] ?? t(language, key)

  return (
    <div className="menu-window" ref={listRef}>
      {commandsInMenu(payload.menu ?? menu).map((command) => {
        const Icon = command.icon
        return (
          <div key={command.id}>
            {command.separatorBefore && <div className="menu-separator" />}
            <button
              className={payload.active.includes(command.id) ? 'active' : ''}
              onClick={() => void window.electronMenuApi?.choose(command.id)}
            >
              <Icon size={16} />
              <span>{payload.overrides[command.id] ?? label(command.label)}</span>
              {command.accel && <kbd>{command.accel}</kbd>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
