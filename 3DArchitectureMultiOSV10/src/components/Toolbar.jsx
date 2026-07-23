import { t } from '../i18n';

export default function Toolbar({
  fileName, wallCount, viewerRef,
  onOpenFile, onClear, onShowInfo, onShowModelManager, onShowSettings,
  lang, onLangToggle,
  theme, onThemeToggle,
  showAxes, onToggleAxes,
  showGrid,  onToggleGrid,
  showLightControl, onToggleLightControl,
  depthMapActive, onClearDepthMap,
}) {
  const _ = (key) => t(lang, key);

  const screenshot = async () => {
    const dataUrl = viewerRef.current?.screenshot?.();
    if (!dataUrl) return;
    if (window.electronAPI?.isElectron) {
      await window.electronAPI.saveScreenshot(dataUrl);
    } else {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'architecture-3d.png'; a.click();
    }
  };

  const setView     = (m) => viewerRef.current?.setView?.(m);
  const resetCamera = ()  => viewerRef.current?.resetCamera?.();
  const zoomIn      = ()  => viewerRef.current?.zoomIn?.();
  const zoomOut     = ()  => viewerRef.current?.zoomOut?.();

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <BrandIcon />
      </div>

      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={onOpenFile} title={_('openTip')}>
          <IconFolder /> {_('open')}
        </button>
        {fileName && (
          <span className="filename-badge" title={fileName}>{truncate(fileName, 22)}</span>
        )}
      </div>

      <div className="toolbar-group toolbar-views">
        <span className="group-label">{lang === 'en' ? 'View' : '뷰'}</span>
        <button className="btn btn-icon" onClick={() => setView('perspective')} title={_('perspectiveTip')}><IconPersp /></button>
        <button className="btn btn-icon" onClick={() => setView('top')}         title={_('topTip')}><IconTop /></button>
        <button className="btn btn-icon" onClick={() => setView('front')}       title={_('frontTip')}><IconFront /></button>
        <button className="btn btn-icon" onClick={() => setView('right')}       title={_('rightTip')}><IconRight /></button>
        {/* 카메라 초기 위치로 이동 - 카메라 아이콘 */}
        <button className="btn btn-icon" onClick={resetCamera} title={_('resetCameraTip')}><IconCameraReset /></button>
      </div>

      <button className="btn btn-icon" onClick={zoomIn}
        title={lang === 'ko' ? '확대 (+)' : 'Zoom In (+)'}>
        <IconZoomIn />
      </button>
      <button className="btn btn-icon" onClick={zoomOut}
        title={lang === 'ko' ? '축소 (-)' : 'Zoom Out (-)'}>
        <IconZoomOut />
      </button>

      <button className="btn btn-icon" onClick={screenshot} title={_('screenshotTip')} disabled={!fileName}>
        <IconScreenshot />
      </button>

      <div className="toolbar-group toolbar-toggles">
        <span className="group-label">{lang === 'en' ? 'Show' : '표시'}</span>
        <button
          className={`btn btn-icon${showAxes ? ' btn-active' : ''}`}
          onClick={onToggleAxes}
          title={lang === 'ko' ? (showAxes ? '축 숨기기' : '축 표시') : (showAxes ? 'Hide Axes' : 'Show Axes')}
        >
          <IconAxes />
        </button>
        <button
          className={`btn btn-icon${showGrid ? ' btn-active' : ''}`}
          onClick={onToggleGrid}
          title={lang === 'ko' ? (showGrid ? '그리드 숨기기' : '그리드 표시') : (showGrid ? 'Hide Grid' : 'Show Grid')}
        >
          <IconGrid />
        </button>
        <button
          className={`btn btn-icon${showLightControl ? ' btn-active' : ''}`}
          onClick={onToggleLightControl}
          title={lang === 'ko'
            ? (showLightControl ? '조명 컨트롤 숨기기' : '조명 위치 변경')
            : (showLightControl ? 'Hide Light Control' : 'Move Light')}
        >
          <IconLightControl />
        </button>
      </div>

      {fileName && (
        <button className="btn btn-icon btn-danger" onClick={onClear} title={_('closeTip')}>
          <IconClose />
        </button>
      )}

      {wallCount != null && (
        <div className="toolbar-stat" title={`${_('walls')}: ${wallCount}`}>
          {_('walls')} {wallCount}
        </div>
      )}

      {/* 슬라이더 범위 설정 버튼 */}
      <button className="btn btn-icon" onClick={onShowSettings}
        title={lang === 'ko' ? '슬라이더 범위 설정' : 'Slider Range Settings'}>
        <IconGear />
      </button>

      {/* AI 모델 관리 버튼 */}
      <button className="btn btn-icon toolbar-ai-btn" onClick={onShowModelManager}
        title={lang === 'ko' ? 'AI 모델 관리' : 'AI Model Manager'}>
        <IconAI />
      </button>

      {/* AI 깊이 맵 적용 중 → 해제 버튼 */}
      {depthMapActive && (
        <button className="btn btn-sm btn-active" onClick={onClearDepthMap}
          title={lang === 'ko' ? 'AI 깊이 맵 해제 (원래 뷰 복원)' : 'Clear AI depth map (restore original view)'}>
          {lang === 'ko' ? '✕ AI 뷰 해제' : '✕ Clear AI View'}
        </button>
      )}

      <div className="toolbar-right">
        <button className="btn btn-icon" onClick={onThemeToggle}
          title={theme === 'dark' ? _('themeLight') : _('themeDark')}>
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button className="btn btn-icon" onClick={onLangToggle}
          title={lang === 'ko' ? _('langEn') : _('langKo')}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'ko' ? 'EN' : 'KO'}</span>
        </button>
        <button className="btn btn-sm" onClick={onShowInfo} title={_('infoTip')}>
          <IconInfo /> {_('info')}
        </button>
      </div>
    </header>
  );
}

const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

/* ── SVG 아이콘 ──────────────────────────────────────── */
const BrandIcon = () => (
  <svg className="brand-icon" viewBox="0 0 32 32" fill="none">
    <rect x="2" y="18" width="28" height="12" rx="2" fill="#4a9eff" opacity="0.3"/>
    <rect x="6" y="10" width="20" height="10" rx="1" fill="#4a9eff" opacity="0.6"/>
    <rect x="10" y="4"  width="12" height="8"  rx="1" fill="#4a9eff"/>
  </svg>
);
const IconFolder   = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>;
const IconPersp    = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 4h14v12H3V4zm2 2v8h10V6H5z"/><path d="M7 8l6 4M13 8l-6 4" stroke="currentColor" strokeWidth="1"/></svg>;
const IconTop      = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="14" height="14" rx="1" opacity=".4"/><rect x="6" y="6" width="8" height="8" rx="1"/></svg>;
const IconFront    = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="6" width="14" height="10" rx="1" opacity=".4"/><rect x="6" y="9" width="8" height="6" rx="1"/></svg>;
const IconRight    = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="6" y="3" width="10" height="14" rx="1" opacity=".4"/><rect x="9" y="6" width="6" height="8" rx="1"/></svg>;

/* 카메라 초기 위치: 카메라 + 조준 십자선 */
const IconCameraReset = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M4 5h3l2-2h2l2 2h3a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"/>
    <circle cx="10" cy="11" r="2.5" fill="none" stroke="white" strokeWidth="1.3" opacity=".8"/>
    <path d="M10 8.5v1M10 13v1M7.5 11h1M12 11h1" stroke="white" strokeWidth="1" strokeLinecap="round" opacity=".8"/>
  </svg>
);
const IconZoomIn  = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 4a4 4 0 100 8 4 4 0 000-8zm-6 4a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const IconZoomOut = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 4a4 4 0 100 8 4 4 0 000-8zm-6 4a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/><path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
/* 스크린샷: 모니터 + 화살표 */
const IconScreenshot = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="8.5" r="2.5" fill="currentColor" opacity=".7"/>
  </svg>
);
const IconClose = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>;
const IconSun  = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/></svg>;
const IconMoon = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>;
const IconInfo = () => <svg viewBox="0 0 20 20" fill="currentColor" style={{width:14,height:14,marginRight:3}}><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>;
/* X/Y/Z 축 아이콘 */
const IconAxes = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="4" y1="16" x2="16" y2="16"/><line x1="4" y1="16" x2="4" y2="4"/>
    <line x1="4" y1="16" x2="10" y2="11"/>
    <text x="16" y="16" fontSize="5" fill="currentColor" stroke="none" fontWeight="bold">x</text>
    <text x="3"  y="4"  fontSize="5" fill="currentColor" stroke="none" fontWeight="bold">y</text>
    <text x="10" y="10" fontSize="5" fill="currentColor" stroke="none" fontWeight="bold">z</text>
  </svg>
);
/* 조명 이동 아이콘 (태양 + 이동 화살표) */
const IconLightControl = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <circle cx="10" cy="10" r="3"/>
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M10 6.5V5M10 15v-1.5M6.5 10H5M15 10h-1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".5"/>
  </svg>
);
/* 그리드 아이콘 */
const IconGrid = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="16" height="16" rx="1"/>
    <line x1="8"  y1="2"  x2="8"  y2="18"/>
    <line x1="14" y1="2"  x2="14" y2="18"/>
    <line x1="2"  y1="8"  x2="18" y2="8"/>
    <line x1="2"  y1="14" x2="18" y2="14"/>
  </svg>
);
/* 설정 아이콘 (기어) */
const IconGear = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd"
      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
      clipRule="evenodd" />
  </svg>
);
/* AI 모델 관리 아이콘 (뇌/회로 모양) */
const IconAI = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="10" cy="10" r="2.5"/>
    <path d="M10 3v4M10 13v4M3 10h4M13 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M5.64 5.64l2.83 2.83M11.54 11.54l2.83 2.83M14.36 5.64l-2.83 2.83M8.46 11.54l-2.82 2.82"
      stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".5"/>
  </svg>
);
