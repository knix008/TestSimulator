// Status strip: the server state (● running / ○ stopped — it survives the
// transient messages), the message, the uptime and the "settings locked"
// notice while running (a status-bar item, not an extra row: the window's
// minimum height must not change when the server starts), and in
// the bottom-right corner the size grip (the WinForms SizeGrip) — the
// frameless window has no visible border to grab, so the grip drives the
// window size over IPC.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatUptime } from '../lib/format';
import { isElectron, getWindowSize, setWindowSize } from '../lib/backend';
import { Icon } from './Icons';

function SizeGrip() {
  const drag = useRef(null);
  const frame = useRef(0);
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Capture the pointer *before* asking the main process for the size:
    // after an await the event's currentTarget is gone, and without capture
    // the moves stop the moment the (lagging) pointer leaves the 18px grip.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const d = { x: e.screenX, y: e.screenY, w: 0, h: 0, ready: false, next: null };
    drag.current = d;
    getWindowSize().then(([w, h]) => {
      if (drag.current !== d) return;
      d.w = w; d.h = h; d.ready = true;
      if (d.next) flush();
    });
  };
  // One IPC per frame — the pointer fires far more moves than the window
  // can follow, and queueing them makes the resize lag behind the mouse.
  const flush = () => {
    frame.current = 0;
    const d = drag.current;
    if (!d || !d.ready || !d.next) return;
    const { x, y } = d.next;
    d.next = null;
    setWindowSize(d.w + (x - d.x), d.h + (y - d.y));
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.next = { x: e.screenX, y: e.screenY };
    if (d.ready && !frame.current) frame.current = requestAnimationFrame(flush);
  };
  const up = (e) => {
    const d = drag.current;
    if (d && d.ready && d.next) { d.next = null; setWindowSize(d.w + (e.screenX - d.x), d.h + (e.screenY - d.y)); }
    drag.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
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

export function StatusBar({ status, startedAt, hostLabel, state = 'stopped', locked = false }) {
  useLanguage();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <div className={`statusbar ${isElectron ? 'has-grip' : ''}`}>
      <span className={`sb-state ${state}`} title={t(`state_${state}`)}>
        <span className="sb-dot" />
        <span>{t(`state_${state}`)}</span>
      </span>
      <span className="status-text ellipsis" title={status}>{status}</span>
      {startedAt > 0 && <span className="mono small">{t('uptime', { time: formatUptime(startedAt) })}</span>}
      {locked && <span className="sb-lock" title={t('locked_hint')}><Icon name="lock" size={12} />{t('locked_short')}</span>}
      {hostLabel && <span className="muted small">{hostLabel}</span>}
      {isElectron && <SizeGrip />}
    </div>
  );
}

export default StatusBar;
