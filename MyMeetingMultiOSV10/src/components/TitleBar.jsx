import React, { useEffect, useState } from 'react';
import { isElectron, api } from '../lib/platform';
import { IconWinMin, IconWinMax, IconWinRestore, IconWinClose } from './Icons';

// Frameless-window title bar with drag region + window controls (Electron only).
export default function TitleBar({ title }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    const off = api.win.onMaximizeChange(setMaximized);
    return off;
  }, []);

  if (!isElectron) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img className="titlebar-logo" src="./icon.svg" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
        <span className="titlebar-title">{title}</span>
      </div>
      <div className="titlebar-controls">
        <button className="winbtn" title="Minimize" onClick={() => api.win.minimize()}><IconWinMin /></button>
        <button className="winbtn" title="Maximize" onClick={() => api.win.toggleMaximize()}>
          {maximized ? <IconWinRestore /> : <IconWinMax />}
        </button>
        <button className="winbtn winbtn-close" title="Close" onClick={() => api.win.close()}><IconWinClose /></button>
      </div>
    </div>
  );
}
