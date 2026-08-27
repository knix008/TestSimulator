import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImportIcon, ZoomInIcon, ZoomOutIcon, FitIcon, ActualIcon,
  ThemeIcon, LangIcon, ExportIcon, AboutIcon,
  MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon,
} from './Icons.jsx';
import buildInfo from '../build-info.json';

const VERSION = 'v' + (buildInfo.version || '1.0.0').split('.').slice(0, 2).join('.');
const api = (typeof window !== 'undefined' && window.electronAPI) || null;

function TB({ title, onClick, children, disabled }) {
  return (
    <button className="tb-btn" title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!api?.win) return;
    api.win.isMaximized().then(setMax).catch(() => {});
    return api.win.onMaximizeChange(setMax);
  }, []);
  if (!api?.win) return null;
  return (
    <div className="tb-group win-ctrls">
      <button className="win-btn" title="Minimize" onClick={() => api.win.minimize()}><MinimizeIcon size={16} /></button>
      <button className="win-btn" title="Maximize" onClick={() => api.win.toggleMaximize()}>
        {max ? <RestoreIcon size={15} /> : <MaximizeIcon size={15} />}
      </button>
      <button className="win-btn win-close" title="Close" onClick={() => api.win.close()}><CloseIcon size={16} /></button>
    </div>
  );
}

export default function Toolbar({
  hasObjects, lang,
  onImport, onZoomIn, onZoomOut, onFit, onActual,
  onToggleTheme, onToggleLang, onExport, onAbout,
}) {
  const { t } = useTranslation();
  return (
    <div className="toolbar">
      <div className="tb-brand">
        <div className="tb-logo" aria-hidden />
        <span className="tb-title">{t('app.title')} {VERSION}</span>
      </div>

      <div className="tb-group">
        <TB title={t('toolbar.import')} onClick={onImport}><ImportIcon /></TB>
      </div>

      <div className="tb-sep" />

      <div className="tb-group">
        <TB title={t('toolbar.zoomOut')} onClick={onZoomOut}><ZoomOutIcon /></TB>
        <TB title={t('toolbar.zoomIn')} onClick={onZoomIn}><ZoomInIcon /></TB>
        <TB title={t('toolbar.fit')} onClick={onFit}><FitIcon /></TB>
        <TB title={t('toolbar.actual')} onClick={onActual}><ActualIcon /></TB>
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <TB title={t('toolbar.export')} onClick={onExport} disabled={!hasObjects}><ExportIcon /></TB>
        <TB title={t('toolbar.language')} onClick={onToggleLang}>
          <LangIcon /><span className="tb-badge">{lang.toUpperCase()}</span>
        </TB>
        <TB title={t('toolbar.theme')} onClick={onToggleTheme}><ThemeIcon /></TB>
        <TB title={t('toolbar.about')} onClick={onAbout}><AboutIcon /></TB>
      </div>

      <WindowControls />
    </div>
  );
}
