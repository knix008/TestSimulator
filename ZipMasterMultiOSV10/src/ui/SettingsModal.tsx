import { useStore } from './store'
import { useEsc } from './useEsc'

/** 프로그램 설정 모달: 화면(테마·언어) + 파일 탐색(기본 폴더·마지막 폴더 기억). */
export function SettingsModal() {
  const {
    t,
    theme,
    toggleTheme,
    lang,
    toggleLang,
    isDesktop,
    defaultDir,
    setDefaultDir,
    pickDefaultDir,
    useCurrentAsDefault,
    extractDir,
    setExtractDir,
    rememberLast,
    setRememberLast,
    settingsOpen,
    setSettingsOpen
  } = useStore()

  useEsc(() => setSettingsOpen(false))
  if (!settingsOpen) return null

  return (
    <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{t.settingsTitle}</h2>

        {/* 화면 설정 */}
        <div className="settings-section">
          <h3>{t.settingsAppearance}</h3>
          <div className="settings-row">
            <span className="settings-label">{t.settingsTheme}</span>
            <button onClick={toggleTheme}>
              {theme === 'dark' ? `🌙 ${t.settingsThemeDark}` : `☀️ ${t.settingsThemeLight}`}
            </button>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t.settingsLanguage}</span>
            <button onClick={toggleLang}>🌐 {lang === 'ko' ? '한국어' : 'English'}</button>
          </div>
        </div>

        {/* 파일 탐색 설정(데스크톱 전용) */}
        {isDesktop && (
          <div className="settings-section">
            <h3>{t.settingsBrowsing}</h3>
            <div className="settings-row">
              <label className="radio">
                <input
                  type="checkbox"
                  checked={rememberLast}
                  onChange={(e) => setRememberLast(e.target.checked)}
                />
                {t.settingsRememberLast}
              </label>
            </div>
            <div className="settings-field">
              <span className="settings-label">{t.settingsDefaultDir}</span>
              <div className="settings-path" title={defaultDir || undefined}>
                {defaultDir || t.settingsNotSet}
              </div>
              <div className="settings-actions">
                <button onClick={pickDefaultDir}>{t.settingsBrowse}</button>
                <button onClick={useCurrentAsDefault}>{t.settingsUseCurrent}</button>
                <button onClick={() => setDefaultDir('')} disabled={!defaultDir}>
                  {t.settingsClear}
                </button>
              </div>
              <p className="hint">{t.settingsDefaultDirHint}</p>
            </div>
            <div className="settings-field">
              <span className="settings-label">{t.settingsExtractDir}</span>
              <div className="settings-path" title={extractDir || undefined}>
                {extractDir || t.settingsNotSet}
              </div>
              <div className="settings-actions">
                <button onClick={() => setExtractDir('')} disabled={!extractDir}>
                  {t.settingsClear}
                </button>
              </div>
              <p className="hint">{t.settingsExtractDirHint}</p>
            </div>
          </div>
        )}

        <button className="primary" onClick={() => setSettingsOpen(false)}>
          {t.settingsClose}
        </button>
      </div>
    </div>
  )
}
