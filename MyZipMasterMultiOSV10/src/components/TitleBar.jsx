import React, { useEffect, useState } from 'react';
import { isDesktop, invoke } from '../lib/host';
import buildInfo from '../build-info.json';
import { IconHome, IconWinMin, IconWinMax, IconWinRestore, IconWinClose } from './Icons';

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

// There is no title bar: the toolbar is the window's top edge. Windows moves the window through
// the CSS drag region; macOS and Linux have to ask.
const dragByHand = isDesktop && typeof navigator !== 'undefined' && !/Windows/.test(navigator.userAgent);

export function startDragByHand(e) {
  if (dragByHand && e.button === 0 && !e.target.closest('button,select,input,.dropdown-menu')) {
    invoke('start_window_drag').catch(() => {});
  }
}

export function Brand({ startOpen, startDisabled, startTip, onToggleStart }) {
  return (
    <div className="brand" data-testid="brand">
      <img className="brand-logo" src="./icon.svg" alt="" />
      <span className="brand-name" data-testid="brand-name">MyZipMaster</span>
      <span className="brand-version" data-testid="brand-version">v{buildInfo.version}</span>
      <button className={`tbtn${startOpen ? ' on' : ''}`} data-testid="btn-start" title={startTip} aria-label={startTip} aria-pressed={!!startOpen} disabled={startDisabled} onClick={onToggleStart}><IconHome size={20} /></button>
    </div>
  );
}

// The size grip: a triangle of dots in the corner, as on a classic window.
export function ResizeGrip() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isDesktop) return undefined;
    let off = () => {};
    let gone = false;
    (async () => {
      const win = await currentWindow();
      setMaximized(await win.isMaximized());
      const un = await win.onResized(async () => setMaximized(await win.isMaximized()));
      if (gone) un();
      else off = un;
    })().catch(() => {});
    return () => {
      gone = true;
      off();
    };
  }, []);
  if (!isDesktop || maximized) return null;
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    currentWindow().then((w) => w.startResizeDragging('SouthEast')).catch(() => {});
  };
  return (
    <div className="resize-grip" data-testid="resize-grip" onMouseDown={onMouseDown}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {[[11, 3], [7, 7], [11, 7], [3, 11], [7, 11], [11, 11]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />)}
      </svg>
    </div>
  );
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return undefined;
    let off = () => {};
    let gone = false;
    (async () => {
      const win = await currentWindow();
      setMaximized(await win.isMaximized());
      const un = await win.onResized(async () => setMaximized(await win.isMaximized()));
      if (gone) un();
      else off = un;
    })().catch(() => {});
    return () => {
      gone = true;
      off();
    };
  }, []);

  if (!isDesktop) return null;
  return (
    <div className="window-controls" data-testid="window-controls">
      <button className="winbtn" data-testid="win-min" title="Minimize" onClick={() => currentWindow().then((w) => w.minimize())}><IconWinMin /></button>
      <button className="winbtn" data-testid="win-max" title="Maximize" onClick={() => currentWindow().then((w) => w.toggleMaximize())}>
        {maximized ? <IconWinRestore /> : <IconWinMax />}
      </button>
      <button className="winbtn winbtn-close" data-testid="win-close" title="Close" onClick={() => currentWindow().then((w) => w.close())}><IconWinClose /></button>
    </div>
  );
}
