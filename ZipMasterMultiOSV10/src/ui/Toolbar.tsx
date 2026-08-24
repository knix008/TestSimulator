import { useStore } from './store'

/**
 * 액션 툴바(네이티브 메뉴 대체). 모든 버튼에 툴팁을 표시하며,
 * 창 폭이 줄어도 버튼이 가려지지 않도록 flex-wrap 으로 접힌다.
 */
export function Toolbar() {
  const { t, busy, caps, toggleTheme, toggleLang, theme, doCompress, doExtract, doPreview, setAboutOpen, setSettingsOpen } =
    useStore()

  return (
    <div className="toolbar" role="toolbar">
      <div className="toolbar-group">
        <button className="tool-btn" title={t.tipCompressFiles} disabled={busy} onClick={() => doCompress('files')}>
          <span className="tool-ico" aria-hidden>🗜️</span>
          <span className="tool-label">{t.tbCompressFiles}</span>
        </button>
        {caps.nativePaths && (
          <button
            className="tool-btn"
            title={t.tipCompressFolder}
            disabled={busy}
            onClick={() => doCompress('folder')}
          >
            <span className="tool-ico" aria-hidden>📁</span>
            <span className="tool-label">{t.tbCompressFolder}</span>
          </button>
        )}
        <button className="tool-btn" title={t.tipExtract} disabled={busy} onClick={() => doExtract()}>
          <span className="tool-ico" aria-hidden>📤</span>
          <span className="tool-label">{t.tbExtract}</span>
        </button>
        <button className="tool-btn" title={t.tipPreview} disabled={busy} onClick={doPreview}>
          <span className="tool-ico" aria-hidden>🔍</span>
          <span className="tool-label">{t.tbPreview}</span>
        </button>
      </div>

      <div className="toolbar-spacer" />

      {/* 우측 정렬 그룹: 정보 · 테마 · 언어 */}
      <div className="toolbar-group toolbar-right">
        <button className="tool-btn" title={t.tipSettings} onClick={() => setSettingsOpen(true)}>
          <span className="tool-ico" aria-hidden>⚙️</span>
          <span className="tool-label">{t.tbSettings}</span>
        </button>
        <button className="tool-btn" title={t.tipInfo} onClick={() => setAboutOpen(true)}>
          <span className="tool-ico" aria-hidden>ℹ️</span>
          <span className="tool-label">{t.tbInfo}</span>
        </button>
        <button className="tool-btn" title={t.tipTheme} onClick={toggleTheme}>
          <span className="tool-ico" aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="tool-label">{t.tbTheme}</span>
        </button>
        <button className="tool-btn" title={t.tipLang} onClick={toggleLang}>
          <span className="tool-ico" aria-hidden>🌐</span>
          <span className="tool-label">{t.tbLang}</span>
        </button>
      </div>
    </div>
  )
}
