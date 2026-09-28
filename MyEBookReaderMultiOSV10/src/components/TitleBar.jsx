import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMinimize, IconMaximize, IconRestore, IconClose } from './Icons.jsx';
import { api, isElectron } from '../lib/platform.js';
import buildInfo from '../build-info.json';

// Frameless-window title bar: the program's name, its version and the book that
// is open. The whole strip is draggable except the buttons; on the web there is
// no OS window to control, so only the title shows.
export default function TitleBar({ title }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return undefined;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    return api.win.onMaximizeChange(setMaximized);
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img className="titlebar-logo" src="./icon.svg" alt="" width="18" height="18" />
        <span className="titlebar-app">MyEBookReader</span>
        <span className="titlebar-version" title={`${t('about.version')} ${buildInfo.version}`}>
          v{buildInfo.version}
        </span>
        {title ? <span className="titlebar-sep">—</span> : null}
        <span className="titlebar-title">{title}</span>
      </div>
      {isElectron ? (
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
