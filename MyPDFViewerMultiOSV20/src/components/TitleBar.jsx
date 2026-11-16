import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconMinimize, IconMaximize, IconRestore, IconClose, IconHome,
  IconPanelLeftClose, IconPanelLeftOpen, IconPanelRightClose, IconPanelRightOpen,
} from './Icons.jsx';
import { api, isDesktop } from '../lib/platform.js';
import buildInfo from '../build-info.json';

// Frameless-window title bar. The whole strip is draggable except the buttons.
// On the web build there is no OS window to control, so only the title shows.
// The Home button (start screen) sits right after the version badge.
// The left and right panel fold buttons sit just left of the window buttons.
export default function TitleBar({
  title, onHome, homeOpen = false, leftOpen = false, onToggleLeft, rightOpen = false, onToggleRight,
}) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return undefined;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    return api.win.onMaximizeChange(setMaximized);
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img className="titlebar-logo" src="./icon.svg" alt="" width="18" height="18" />
        <span className="titlebar-app">MyPDFViewer</span>
        <span className="titlebar-version" title={`${t('about.version')} ${buildInfo.version}`}>
          v{buildInfo.version}
        </span>
        {onHome ? (
          <button
            type="button"
            className={`titlebar-home${homeOpen ? ' active' : ''}`}
            onClick={onHome}
            title={t('tip.home')}
            aria-label={t('toolbar.home')}
            aria-pressed={homeOpen}
            data-titlebar-home
          >
            <IconHome size={15} />
          </button>
        ) : null}
        {title ? <span className="titlebar-sep">—</span> : null}
        <span className="titlebar-title">{title}</span>
      </div>
      {onToggleLeft || onToggleRight ? (
        <div className="titlebar-folds" role="group" aria-label={t('toolbar.sidebar')}>
          {onToggleLeft ? (
            <button
              type="button"
              className={`titlebar-fold${leftOpen ? ' active' : ''}`}
              onClick={onToggleLeft}
              title={t('tip.sidebar')}
              aria-label={t('toolbar.sidebar')}
              aria-pressed={leftOpen}
              data-titlebar-fold="left"
            >
              {leftOpen ? <IconPanelLeftClose size={16} /> : <IconPanelLeftOpen size={16} />}
            </button>
          ) : null}
          {onToggleRight ? (
            <button
              type="button"
              className={`titlebar-fold${rightOpen ? ' active' : ''}`}
              onClick={onToggleRight}
              title={t('tip.infoPanel')}
              aria-label={t('toolbar.infoPanel')}
              aria-pressed={rightOpen}
              data-titlebar-fold="right"
            >
              {rightOpen ? <IconPanelRightClose size={16} /> : <IconPanelRightOpen size={16} />}
            </button>
          ) : null}
        </div>
      ) : null}
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
