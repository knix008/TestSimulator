// Status strip: the server state (● running / ○ stopped — it survives the
// transient messages), the message, the uptime and the "settings locked"
// notice while running (a status-bar item, not an extra row: the window's
// minimum height must not change when the server starts), and in
// the bottom-right corner the size grip (the WinForms SizeGrip) — the
// frameless window has no visible border to grab, so the grip starts the
// system's own resize loop (it follows the minimum size and the monitors).
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatUptime } from '../lib/format';
import { isDesktop, startResizeDrag } from '../lib/backend';
import { Icon } from './Icons';

function SizeGrip() {
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startResizeDrag();
  };
  return (
    <span className="size-grip" title={t('win_resize')} onPointerDown={down}>
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
    <div className={`statusbar ${isDesktop ? 'has-grip' : ''}`}>
      <span className={`sb-state ${state}`} title={t(`state_${state}`)}>
        <span className="sb-dot" />
        <span>{t(`state_${state}`)}</span>
      </span>
      <span className="status-text ellipsis" title={status}>{status}</span>
      {startedAt > 0 && <span className="mono small">{t('uptime', { time: formatUptime(startedAt) })}</span>}
      {locked && <span className="sb-lock" title={t('locked_hint')}><Icon name="lock" size={12} />{t('locked_short')}</span>}
      {hostLabel && <span className="muted small">{hostLabel}</span>}
      {isDesktop && <SizeGrip />}
    </div>
  );
}

export default StatusBar;
