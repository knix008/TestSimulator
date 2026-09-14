// Status strip: the message on the left, the uptime while running, and in
// the bottom-right corner the size grip (the WinForms SizeGrip) — the
// frameless window has no visible border to grab, so the grip drives the
// window size over IPC.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatUptime } from '../lib/format';
import { isElectron, getWindowSize, setWindowSize } from '../lib/backend';

function SizeGrip() {
  const drag = useRef(null);
  const down = async (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const [w, h] = await getWindowSize();
    drag.current = { x: e.screenX, y: e.screenY, w, h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    setWindowSize(d.w + (e.screenX - d.x), d.h + (e.screenY - d.y));
  };
  const up = (e) => { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ } };
  return (
    <span className="size-grip" title={t('win_resize')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="11.5" cy="11.5" r="1.2" /><circle cx="11.5" cy="7" r="1.2" /><circle cx="11.5" cy="2.5" r="1.2" />
          <circle cx="7" cy="11.5" r="1.2" /><circle cx="7" cy="7" r="1.2" />
          <circle cx="2.5" cy="11.5" r="1.2" />
        </g>
      </svg>
    </span>
  );
}

export function StatusBar({ status, startedAt, hostLabel }) {
  useLanguage();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <div className={`statusbar ${isElectron ? 'has-grip' : ''}`}>
      <span className="status-text ellipsis" title={status}>{status}</span>
      {startedAt > 0 && <span className="mono small">{t('uptime', { time: formatUptime(startedAt) })}</span>}
      {hostLabel && <span className="muted small">{hostLabel}</span>}
      {isElectron && <SizeGrip />}
    </div>
  );
}

export default StatusBar;
