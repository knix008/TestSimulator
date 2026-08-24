import { useStore } from './store'

/**
 * 커스텀 타이틀바. 정보(About) 버튼은 항상 최소/최대/닫기 창 버튼의 "좌측"에 위치한다.
 * 데스크톱(Electron, frameless)에서는 창 제어 버튼을 그리고, 웹에서는 정보 버튼만 표시한다.
 */
export function TitleBar() {
  const { t, lang, isDesktop, appVersion, minimize, maximizeToggle, close } = useStore()
  const ko = lang === 'ko'
  // 타이틀에는 major.minor 만 표시(예: 1.0.0 → v1.0)
  const shortVer = appVersion.split('.').slice(0, 2).join('.')
  const tips = ko
    ? { min: '최소화', max: '최대화', close: '닫기' }
    : { min: 'Minimize', max: 'Maximize', close: 'Close' }

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img
          src="./icon.png"
          className="titlebar-icon"
          alt=""
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <span className="titlebar-title">
          {t.appTitle} v{shortVer}
        </span>
      </div>

      {/* 창 제어 버튼(최소/최대/닫기). 정보 버튼은 툴바로 이동됨. */}
      {isDesktop && (
        <div className="window-controls">
          <button className="win-btn" title={tips.min} aria-label={tips.min} onClick={minimize}>
            <span aria-hidden>—</span>
          </button>
          <button className="win-btn" title={tips.max} aria-label={tips.max} onClick={maximizeToggle}>
            <span aria-hidden>▢</span>
          </button>
          <button className="win-btn close" title={tips.close} aria-label={tips.close} onClick={close}>
            <span aria-hidden>✕</span>
          </button>
        </div>
      )}
    </div>
  )
}
