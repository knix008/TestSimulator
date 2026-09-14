// Status strip: the message on the left, and while something runs the
// progress bar (marquee while connecting, percent during transfers), the
// speed and a Cancel button on the right. The bottom-right corner carries a
// size grip (the WinForms SizeGrip) — the frameless window has no visible
// border to grab, so the grip drives the window size over IPC.
import React, { useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, formatSpeed } from '../lib/format';
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

export function StatusBar({ status, progress, onCancel }) {
  useLanguage();
  const p = progress;
  const pct = p && p.total > 0 ? Math.min(100, Math.round((p.done * 100) / p.total)) : null;
  return (
    <div className={`statusbar ${isElectron ? 'has-grip' : ''}`}>
      <span className="status-text ellipsis" title={status}>{status}</span>
      {p && (
        <span className="status-progress">
          {p.total > 0 && <span className="status-bytes mono">{formatSize(p.done)} / {formatSize(p.total)}</span>}
          {p.speed > 0 && <span className="status-speed mono">{formatSpeed(p.speed)}</span>}
          <span className={`bar ${pct === null ? 'indeterminate' : ''}`}>
            <span className="bar-fill" style={pct === null ? undefined : { width: `${pct}%` }} />
            {pct !== null && <span className="bar-text">{pct}%</span>}
          </span>
          {onCancel && <button className="btn tiny" onClick={onCancel} disabled={p.cancelling}>{t('status_cancel')}</button>}
        </span>
      )}
      {isElectron && <SizeGrip />}
    </div>
  );
}

export default StatusBar;
