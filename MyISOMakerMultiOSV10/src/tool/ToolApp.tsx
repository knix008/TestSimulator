/**
 * Help, Settings and About as windows of their own (tool.html#help, #settings[:tab], #about).
 * Each has its own title bar (icon, title, window buttons) and can be moved anywhere; the
 * theme and language follow the main window through the shared settings (PreferencesProvider
 * listens to `storage`). Opening one that is already open just brings it forward with the
 * new route (`tool-route`).
 */
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

type AppInfo = { version: string; tauri: string; webview: string; os: string; arch: string; debug: boolean }

/** About (MyZipMaster style): icon · name · version · description on top, then aligned
 *  label | value rows in sections, OK at the bottom. The window takes the content's height. */
function AboutView() {
  const { t } = usePrefs()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void invoke<AppInfo>('app_info').then(setInfo, () => setInfo(null))
  }, [])
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current
      if (!el) return
      const bar = document.querySelector('.titlebar')?.getBoundingClientRect().height ?? 40
      void invoke('fit_tool_window', { height: Math.ceil(el.scrollHeight + bar + 2) }).catch(() => {})
    }
    void document.fonts.ready.then(fit)
  })
  const osName = (os?: string) => (os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : os === 'linux' ? 'Linux' : os ?? '')
  const row = (label: string, value: ReactNode) => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
  return (
    <div className="about-view" ref={box}>
      <div className="about-body">
        <div className="about-top">
          <img className="about-logo" src="/icon-256.png" alt="" draggable={false} />
          <div className="about-top-text">
            <h1 className="about-name">
              {t('brand')} <small>V{info?.version ?? APP_VERSION}</small>
            </h1>
            <p className="about-desc">{t('homeLead')}</p>
          </div>
        </div>
        <dl className="about-grid">
          <dt className="about-section">{t('aboutSectionProgram')}</dt>
          {row(t('aboutVersionLabel'), info?.version ?? APP_VERSION)}
          {row(t('aboutAuthorLabel'), 'SHKWON · knix008@naver.com')}
          {row(t('aboutCopyrightLabel'), t('aboutCopyright', APP_YEAR))}
          <dt className="about-section">{t('aboutSectionFormats')}</dt>
          {row(t('aboutFormatsOpen'), 'ISO · IMG · AppImage · Docker tar (.tar / .tgz)')}
          {row(t('aboutFormatsMake'), t('aboutFormatsMakeValue'))}
          <dt className="about-section">{t('aboutSectionBuild')}</dt>
          {row(t('aboutPlatformLabel'), info ? `${osName(info.os)} · ${info.arch}` : '—')}
          {row(t('aboutRuntimeLabel'), info ? `Tauri ${info.tauri}${info.webview ? ` · WebView ${info.webview}` : ''}` : '—')}
          {row(t('aboutBuildLabel'), info ? (info.debug ? t('aboutBuildDebug') : t('aboutBuildRelease')) : '—')}
          {row(t('aboutEngineLabel'), 'React · Node.js · xorriso · SquashFS')}
        </dl>
      </div>
      <footer className="about-foot">
        <button type="button" className="dialog-btn primary" data-about-ok="" onClick={() => void getCurrentWindow().close()}>
          {Icons.check}
          <span>{t('dialogOk')}</span>
        </button>
      </footer>
    </div>
  )
}
