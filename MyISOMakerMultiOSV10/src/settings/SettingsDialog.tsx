/** Settings: General · Theme (40 themes + custom) · Packages · Start screen. */
import { useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { usePrefs, type CustomColors } from '../i18n/Preferences'
import type { MessageKey } from '../i18n/messages'
import { PackagePanel, type PackageAction, type PackageId, type PackageStatus } from '../packages/packages'
import { BackgroundPanel } from '../start/BackgroundPanel'
import type { BgPrefs } from '../start/bgPrefs'
import { ThemeChips } from '../theme/ThemeMenu'
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

export function SettingsDialog({
  open,
  tab,
  onTab,
  onClose,
  showOnStart,
  onShowOnStart,
  packages,
  pkgBusy,
  onRunPackage,
  onRefreshPackages,
  autoInstall,
  onAutoInstall,
  bg,
  onBg,
}: {
  open: boolean
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  onClose: () => void
  showOnStart: boolean
  onShowOnStart: (on: boolean) => void
  packages: PackageStatus[] | null
  pkgBusy: boolean
  onRunPackage: (id: PackageId, action: PackageAction) => void
  onRefreshPackages: () => void
  autoInstall: boolean
  onAutoInstall: (on: boolean) => void
  bg: BgPrefs
  onBg: (next: BgPrefs) => void
}) {
  const { t, locale, setLocale, themeId, setThemeId, customColors, setCustomColors } = usePrefs()
  const [draft, setDraft] = useState<CustomColors>(customColors)
  useEffect(() => {
    if (open) setDraft(customColors)
  }, [open, customColors])

  const applyCustom = (next: CustomColors) => {
    setDraft(next)
    setCustomColors(next)
    setThemeId(CUSTOM_ID)
  }

  return (
    <Dialog
      open={open}
      title={t('settings')}
      icon={Icons.settings}
      onClose={onClose}
      panelClassName="dialog-panel--settings"
      buttons={[{ id: 'close', label: t('dialogClose'), icon: Icons.check, primary: true, onClick: onClose }]}
    >
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
        <div className="settings-page" data-settings-page={tab}>
          {tab === 'general' ? (
            <div className="settings-rows">
              <div className="settings-row">
                <span className="settings-label">
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
              <label className="settings-check">
                <input type="checkbox" checked={showOnStart} onChange={(e) => onShowOnStart(e.target.checked)} />
                <span>{t('homeShowOnStart')}</span>
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={autoInstall} onChange={(e) => onAutoInstall(e.target.checked)} />
                <span>{t('settingsAutoInstall')}</span>
              </label>
            </div>
          ) : null}

          {tab === 'theme' ? (
            <div className="settings-theme">
              <ThemeChips />
              <section className={`custom-theme${themeId === CUSTOM_ID ? ' on' : ''}`} data-custom-theme="">
                <h3>
                  {Icons.rename}
                  {t('themeCustom')}
                </h3>
                <p className="settings-hint">{t('themeCustomHint')}</p>
                <div className="custom-theme-colors">
                  {COLOR_KEYS.map(({ k, label }) => (
                    <label key={k} className="custom-color">
                      <input
                        type="color"
                        value={draft[k]}
                        data-custom-color={k}
                        onChange={(e) => applyCustom({ ...draft, [k]: e.target.value })}
                      />
                      <span>{t(label)}</span>
                      <code>{draft[k]}</code>
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

          {tab === 'packages' ? (
            <PackagePanel
              t={t}
              list={packages}
              busy={pkgBusy}
              onRun={onRunPackage}
              onRefresh={onRefreshPackages}
              autoInstall={autoInstall}
              onAutoInstall={onAutoInstall}
            />
          ) : null}

          {tab === 'start' ? (
            <div className="settings-rows">
              <label className="settings-check">
                <input type="checkbox" checked={showOnStart} onChange={(e) => onShowOnStart(e.target.checked)} />
                <span>{t('homeShowOnStart')}</span>
              </label>
              <h3 className="settings-sub">
                {Icons.image}
                {t('homeBackground')}
              </h3>
              <BackgroundPanel bg={bg} onChange={onBg} locale={locale} t={t} />
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}
