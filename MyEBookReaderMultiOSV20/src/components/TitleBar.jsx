import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMinimize, IconMaximize, IconRestore, IconClose } from './Icons.jsx';
import { api, isDesktop } from '../lib/platform.js';
import buildInfo from '../build-info.json';

// Frameless-window title bar. The whole strip is draggable except the buttons.
// On the web build there is no OS window to control, so only the title shows.
//
// `left` and `right` are the app-level buttons that live up here rather than
// in the toolbar — Home and the File menu after the name, and theme, language,
// help, settings and about before the window controls — so the toolbar keeps
// only what works on the open book.
export default function TitleBar({ title, left = null, right = null }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return undefined;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    return api.win.onMaximizeChange(setMaximized);
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <img className="titlebar-logo" src="./icon.svg" alt="" width="18" height="18" />
        <span className="titlebar-app">MyEBookReader</span>
        <span className="titlebar-version" title={`${t('about.version')} ${buildInfo.version}`}>
          v{buildInfo.version}
        </span>
      </div>
      {left ? <div className="titlebar-actions left">{left}</div> : null}
      <div className="titlebar-drag">
        {title ? <span className="titlebar-sep">—</span> : null}
        <span className="titlebar-title">{title}</span>
      </div>
      {right ? <div className="titlebar-actions right">{right}</div> : null}
      {isDesktop ? (
        <div className="titlebar-controls">
          <button className="winbtn" onClick={() => api.win.minimize()} title={t('tip.minimize')} aria-label={t('tip.minimize')}>
            <IconMinimize />
          </button>
          <button className="winbtn" onClick={() => api.win.toggleMaximize()} title={t('tip.maximize')} aria-label={t('tip.maximize')}>
            {maximized ? <IconRestore /> : <IconMaximize />}
          </button>
          <button className="winbtn winbtn-close" onClick={() => api.win.close()} title={t('tip.closeWin')} aria-label={t('tip.closeWin')}>
            <IconClose size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
