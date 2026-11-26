/** The Settings window (tool.html#settings[:tab]): General · Theme (40 + custom) · Packages · Start screen.
 *  Everything is saved to the shared settings, which the main window follows at once. */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isTauri } from '../platform/tauri-bridge'
import { usePrefs, type CustomColors } from '../i18n/Preferences'
import type { MessageKey } from '../i18n/messages'
import {
  loadAutoInstall,
  PackagePanel,
  PackageProgressDialog,
  saveAutoInstall,
  usePackageStatus,
  type PackageAction,
  type PackageId,
  type PackageProgress,
} from '../packages/packages'
import { BackgroundPanel } from '../start/BackgroundPanel'
import { BG_DEFAULTS, loadBgPrefs, saveBgPrefs, type BgPrefs } from '../start/bgPrefs'
import { loadShowOnStart, saveShowOnStart } from '../start/recent'
import { ThemeList } from '../theme/ThemeMenu'
import { CUSTOM_ID, DEFAULT_CUSTOM } from '../theme/themes'
import { Icons } from '../Toolbar'
import { Flag } from '../layout/TitleBar'

export type SettingsTab = 'general' | 'theme' | 'packages' | 'start'

const TABS: { id: SettingsTab; key: MessageKey; icon: keyof typeof Icons }[] = [
  { id: 'general', key: 'settingsTabGeneral', icon: 'settings' },
  { id: 'theme', key: 'settingsTabTheme', icon: 'sun' },
  { id: 'packages', key: 'settingsTabPackages', icon: 'download' },
  { id: 'start', key: 'settingsTabStart', icon: 'home' },
]

const COLOR_KEYS: { k: keyof CustomColors; label: MessageKey }[] = [
  { k: 'bg', label: 'themeColorBg' },
  { k: 'panel', label: 'themeColorPanel' },
  { k: 'text', label: 'themeColorText' },
  { k: 'accent', label: 'themeColorAccent' },
]

export function SettingsView({ tab, onTab }: { tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  const [showOnStart, setShowOnStartState] = useState(loadShowOnStart)
  const onShowOnStart = (on: boolean) => {
    setShowOnStartState(on)
    saveShowOnStart(on)
  }
  const [autoInstall, setAutoInstallState] = useState(loadAutoInstall)
  const onAutoInstall = (on: boolean) => {
    setAutoInstallState(on)
    saveAutoInstall(on)
  }
  const [bg, setBgState] = useState<BgPrefs>(loadBgPrefs)
  const onBg = (next: BgPrefs) => {
    setBgState(next)
    saveBgPrefs(next)
  }
  const pkgs = usePackageStatus()
  const [pkgProgress, setPkgProgress] = useState<PackageProgress | null>(null)
  const [pkgBusy, setPkgBusy] = useState(false)
  const running = useRef(false)
  useEffect(() => window.isoMaker?.onPackageProgress?.((p) => running.current && setPkgProgress(p)), [])
  async function onRunPackage(id: PackageId, action: PackageAction) {
    const api = window.isoMaker
    if (!api?.runPackage || running.current) return
    running.current = true
    setPkgBusy(true)
    setPkgProgress({ id, action, phase: 'index', percent: null, message: '' })
    try {
      pkgs.setList(await api.runPackage(id, action))
    } catch {
      void pkgs.refresh()
    } finally {
      running.current = false
      setPkgBusy(false)
    }
  }
  useEffect(() => {
    if (tab === 'packages') void pkgs.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const measureRef = useRef<HTMLDivElement>(null)
  // The window is as short as the tallest tab allows: no scrollbars, nothing cut off.
  useLayoutEffect(() => {
    const fit = () => {
      const box = measureRef.current
      if (!box || !isTauri()) return
      const tallest = Math.max(...[...box.children].map((c) => (c as HTMLElement).scrollHeight))
      const chrome = (document.querySelector('.titlebar')?.getBoundingClientRect().height ?? 40) + (document.querySelector('.settings-foot')?.getBoundingClientRect().height ?? 56)
      void invoke('fit_tool_window', { height: Math.ceil(tallest + chrome + 2) }).catch(() => {})
    }
    void document.fonts.ready.then(fit)
    const ro = new ResizeObserver(fit)
    if (measureRef.current) for (const c of measureRef.current.children) ro.observe(c)
    return () => ro.disconnect()
  })

  const { t, locale, setLocale, themeId, setThemeId, customColors, setCustomColors } = usePrefs()
  const [draft, setDraft] = useState<CustomColors>(customColors)
  useEffect(() => {
    setDraft(customColors)
  }, [customColors])

  /** Reset: every setting back to how a new installation starts. */
  const resetAll = () => {
    setLocale('ko')
    setCustomColors({ ...DEFAULT_CUSTOM })
    setThemeId('dark')
    onShowOnStart(true)
    onAutoInstall(true)
    onBg({ ...BG_DEFAULTS })
  }

  const applyCustom = (next: CustomColors) => {
    setDraft(next)
    setCustomColors(next)
    setThemeId(CUSTOM_ID)
  }

  /** One tab's page. The visible tab uses it, and so does the hidden copy that measures every tab. */
  const renderPage = (which: SettingsTab) => (
    <div className="settings-page" data-settings-page={which}>
      <header className="settings-head">
        <span className="settings-head-icon" aria-hidden="true">
          {Icons[TABS.find((x) => x.id === which)!.icon]}
        </span>
        <div>
          <h2>{t(TABS.find((x) => x.id === which)!.key)}</h2>
          <p>{t(`settingsDesc_${which}` as MessageKey)}</p>
        </div>
      </header>
      {which === 'general' ? (
        <div className="settings-form settings-card">
          <div className="form-row">
            <span className="form-label">
              {Icons.lang}
              {t('settingsLanguage')}
            </span>
            <div className="settings-seg">
              {(['ko', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`settings-seg-btn${locale === l ? ' on' : ''}`}
                  onClick={() => setLocale(l)}
                >
                  <Flag locale={l} />
                  <span>{l === 'ko' ? '한국어' : 'English'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">
              {Icons.home}
              {t('settingsTabStart')}
            </span>
            <label className="settings-check">
              <input type="checkbox" checked={showOnStart} onChange={(e) => onShowOnStart(e.target.checked)} />
              <span>{t('homeShowOnStart')}</span>
            </label>
          </div>
          <div className="form-row">
            <span className="form-label">
              {Icons.download}
              {t('settingsTabPackages')}
            </span>
            <label className="settings-check">
              <input type="checkbox" checked={autoInstall} onChange={(e) => onAutoInstall(e.target.checked)} />
              <span>{t('settingsAutoInstall')}</span>
            </label>
          </div>
        </div>
      ) : null}

      {which === 'theme' ? (
        <div className="settings-theme">
          <section className="settings-card">
            <h3 className="settings-card-title">
              {Icons.sun}
              {t('settingsThemeList')}
            </h3>
            <ThemeList />
          </section>
          <section className={`settings-card custom-theme${themeId === CUSTOM_ID ? ' on' : ''}`} data-custom-theme="">
            <h3 className="settings-card-title">
              {Icons.rename}
              {t('themeCustom')}
            </h3>
            <p className="settings-hint">{t('themeCustomHint')}</p>
            <div className="settings-form">
              {COLOR_KEYS.map(({ k, label }) => (
                <label key={k} className="form-row">
                  <span className="form-label">{t(label)}</span>
                  <span className="custom-color-value">
                    <input
                      type="color"
                      value={draft[k]}
                      data-custom-color={k}
                      onChange={(e) => applyCustom({ ...draft, [k]: e.target.value })}
                    />
                    <code>{draft[k]}</code>
                  </span>
                </label>
              ))}
            </div>
            <div className="custom-theme-actions">
              <button type="button" className="dialog-btn primary" onClick={() => applyCustom(draft)}>
                {Icons.check}
                <span>{t('themeCustomApply')}</span>
              </button>
              <button type="button" className="dialog-btn" onClick={() => applyCustom({ ...DEFAULT_CUSTOM })}>
                {Icons.refresh}
                <span>{t('themeCustomReset')}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {which === 'packages' ? (
        <PackagePanel
          t={t}
          list={pkgs.list}
          busy={pkgBusy}
          onRun={(id, action) => void onRunPackage(id, action)}
          onRefresh={() => void pkgs.refresh()}
          autoInstall={autoInstall}
          onAutoInstall={onAutoInstall}
        />
      ) : null}

      {which === 'start' ? (
        <div className="settings-stack">
        <div className="settings-form settings-card">
          <div className="form-row">
            <span className="form-label">
              {Icons.home}
              {t('settingsTabStart')}
            </span>
            <label className="settings-check">
              <input type="checkbox" checked={showOnStart} onChange={(e) => onShowOnStart(e.target.checked)} />
              <span>{t('homeShowOnStart')}</span>
            </label>
          </div>
        </div>
        <section className="settings-card">
          <h3 className="settings-card-title">
            {Icons.image}
            {t('homeBackground')}
          </h3>
          <BackgroundPanel bg={bg} onChange={onBg} locale={locale} t={t} form />
        </section>
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              data-settings-tab={x.id}
              aria-selected={tab === x.id}
              className={`settings-tab${tab === x.id ? ' on' : ''}`}
              onClick={() => onTab(x.id)}
            >
              <span className="settings-tab-icon" aria-hidden="true">
                {Icons[x.icon]}
              </span>
              <span>{t(x.key)}</span>
            </button>
          ))}
        </nav>
        {renderPage(tab)}
      </div>
      <footer className="settings-foot">
        <button type="button" className="dialog-btn" data-settings-reset="" onClick={resetAll} title={t('settingsResetTip')}>
          {Icons.refresh}
          <span>{t('settingsReset')}</span>
        </button>
        <span className="settings-foot-grow" />
        <button type="button" className="dialog-btn primary" data-settings-ok="" onClick={() => void getCurrentWindow().close()}>
          {Icons.check}
          <span>{t('dialogOk')}</span>
        </button>
      </footer>
      {/* Every tab laid out off screen: the window takes the tallest one's height. */}
      <div className="settings-measure" aria-hidden="true" ref={measureRef} inert>
        {TABS.map((x) => (
          <div key={x.id} className="settings-measure-page" data-measure={x.id}>
            {renderPage(x.id)}
          </div>
        ))}
      </div>
      <PackageProgressDialog
        t={t}
        progress={pkgProgress}
        running={pkgBusy}
        note=""
        onCancel={() => void window.isoMaker?.cancelPackage?.()}
        onClose={() => setPkgProgress(null)}
      />
    </>
  )
}
