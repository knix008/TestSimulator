/**
 * Help, Settings and About as windows of their own (tool.html#help, #settings[:tab], #about).
 * Each has its own title bar (icon, title, window buttons) and can be moved anywhere; the
 * theme and language follow the main window through the shared settings (PreferencesProvider
 * listens to `storage`). Opening one that is already open just brings it forward with the
 * new route (`tool-route`).
 */
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState, type ReactNode } from 'react'
import { HelpView } from '../help/HelpView'
import { usePrefs } from '../i18n/Preferences'
import { WindowControls } from '../layout/TitleBar'
import { SettingsView, type SettingsTab } from '../settings/SettingsView'
import { Icons } from '../Toolbar'
import { APP_VERSION, APP_YEAR } from '../version'

type Route = { kind: 'help' | 'settings' | 'about'; tab?: SettingsTab }

function parse(hash: string): Route {
  const [kind, tab] = hash.replace(/^#/, '').split(':')
  if (kind === 'settings') return { kind, tab: (['general', 'theme', 'packages', 'start'].includes(tab ?? '') ? tab : 'general') as SettingsTab }
  if (kind === 'about') return { kind }
  return { kind: 'help' }
}

export function ToolApp() {
  const { t } = usePrefs()
  const [route, setRoute] = useState<Route>(() => parse(location.hash))

  useEffect(() => {
    const off = listen<string>('tool-route', (e) => setRoute(parse(`#${e.payload}`)))
    return () => void off.then((f) => f())
  }, [])

  const title = route.kind === 'help' ? t('help') : route.kind === 'settings' ? t('settings') : t('aboutTitle')
  const icon = route.kind === 'help' ? Icons.help : route.kind === 'settings' ? Icons.settings : Icons.info

  useEffect(() => {
    document.title = `${title} — ${t('brand')}`
    void getCurrentWindow().setTitle(document.title).catch(() => {})
  }, [title, t])

  return (
    <div className={`tool-app tool-${route.kind}`}>
      <div className="titlebar" data-tauri-drag-region>
        <div className="title-brand" data-tauri-drag-region>
          <span className="title-icon-svg" aria-hidden="true">
            {icon}
          </span>
          <span className="title-name" data-tauri-drag-region>
            {title}
          </span>
          <span className="title-version" data-tauri-drag-region>
            {t('brand')}
          </span>
        </div>
        <span className="titlebar-drag" data-tauri-drag-region />
        <WindowControls t={t} />
      </div>
      <div className="tool-body">
        {route.kind === 'help' ? <HelpBody /> : null}
        {route.kind === 'settings' ? <SettingsView tab={route.tab ?? 'general'} onTab={(tab) => setRoute({ kind: 'settings', tab })} /> : null}
        {route.kind === 'about' ? <AboutView /> : null}
      </div>
    </div>
  )
}

function HelpBody() {
  const { t, locale } = usePrefs()
  return <HelpView t={t} locale={locale} />
}

function AboutView() {
  const { t } = usePrefs()
  const row = (label: string, value: ReactNode) => (
    <div className="about-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
  return (
    <div className="about-view">
      <img className="about-view-icon" src="/icon-256.png" alt="" draggable={false} />
      <h1>
        {t('brand')} <small>V{APP_VERSION}</small>
      </h1>
      <p className="about-view-lead">{t('homeLead')}</p>
      <dl className="about-grid">
        {row(t('aboutVersionLabel'), APP_VERSION)}
        {row(t('aboutPlatformLabel'), navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Mac') ? 'macOS' : 'Linux')}
        {row(t('aboutEngineLabel'), 'Tauri 2 · React · Node.js · xorriso')}
        {row(t('aboutAuthorLabel'), 'SHKWON (knix008@naver.com)')}
      </dl>
      <p className="about-view-copy">{t('aboutCopyright', APP_YEAR)}</p>
      <button type="button" className="dialog-btn primary about-close" onClick={() => void getCurrentWindow().close()}>
        {Icons.check}
        <span>{t('dialogOk')}</span>
      </button>
    </div>
  )
}
