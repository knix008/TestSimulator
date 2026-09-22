import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FileText, Trash } from 'lucide-react'
import { commandsInMenu, fileMenuWithRecents, sectionLabel as sectionLabelFor, RECENT_FORGET_PREFIX, RECENT_PREFIX, type MenuId } from './commands'
import { MenuTree } from './MenuTree'
import { t } from './i18n'
import { applyTheme } from './themes'
import { buildErrorReport } from './lib/errors'
import type { Language, RecentFile } from './lib/settings'
import './App.css'

/**
 * The contents of one menu, rendered inside its own always-on-top window.
 *
 * A frameless BrowserWindow clips its HTML, so a dropdown drawn inside the
 * app could never reach past the app's edge. Here the list measures itself,
 * asks the main process to size the window to match, and the popup is free
 * to overhang the application — in one column, however long it is.
 */
export type MenuPayload = {
  menu: MenuId
  language: Language
  theme: string
  active: string[]
  disabled?: string[]
  /** Labels the app resolves itself: theme names, format names, recent files. */
  overrides: Record<string, string>
  recentFiles?: RecentFile[]
  openId?: number
}

export default function MenuHost({ menu }: { menu: MenuId }) {
  const [payload, setPayload] = useState<MenuPayload | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.electronMenuApi?.payload().then((value) => {
      if (!cancelled) setPayload((value ?? null) as MenuPayload | null)
    })
    const off = window.electronMenuApi?.onPayload((next) => {
      if (!cancelled) setPayload((next ?? null) as MenuPayload | null)
    })
    return () => { cancelled = true; off?.() }
  }, [])

  useEffect(() => {
    if (payload?.theme) applyTheme(payload.theme)
  }, [payload?.theme])

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
    const send = (error: unknown) => {
      const report = buildErrorReport(error, { action: `menu:${menu}`, source: `menu:${menu}` })
      void window.electronDialogApi?.reportError({ source: report.title, message: report.message, details: report.details })
    }
    const onError = (event: ErrorEvent) => send(event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => send(event.reason)
    window.addEventListener('keydown', onKey)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [menu])

  // A submenu longer than the screen (the output formats run to sixty rows)
  // scrolls inside the popup rather than being cut off by the display edge.
  const menuMax = `${Math.max(240, (window.screen?.availHeight ?? 800) - 48)}px`

  if (!payload) {
    return <div className="menu-window" ref={listRef} />
  }

  const language = payload.language
  const which = payload.menu ?? menu
  const rows = which === 'file' ? fileMenuWithRecents(payload.recentFiles ?? [], { file: FileText, clear: Trash }) : commandsInMenu(which)

  return (
    <div className="menu-window" ref={listRef} style={{ '--menu-max': menuMax } as React.CSSProperties}>
      <MenuTree
        key={`${which}:${payload.openId ?? 0}`}
        rows={rows}
        label={(command) => payload.overrides[command.id] ?? t(language, command.label)}
        sectionLabel={(section) => sectionLabelFor(language, section, (key) => t(language, key))}
        isActive={(id) => payload.active.includes(id)}
        isDisabled={(id) => (payload.disabled ?? []).includes(id)}
        onChoose={(id) => void window.electronMenuApi?.choose(id)}
        onForget={(id) => void window.electronMenuApi?.choose(`${RECENT_FORGET_PREFIX}${id.slice(RECENT_PREFIX.length)}`)}
        forgetLabel={t(language, 'forgetRecent')}
      />
    </div>
  )
}
