// Progress of a long analysis (scan.start / scan.job): a fixed-size popup
// without a title bar — progress bar with %, the phase, the current file or
// engine, elapsed and remaining time, 취소 / Cancel. The × also cancels,
// after asking. App shows it when a job is still running after about 1 s.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { CloseButton, Icon } from '../components/Chrome';
import { Btn, Confirm } from './common';

export const mmss = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The middle of a long path or id goes, the start and the file name stay. */
export function shorten(text, max = 58) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const parts = s.split(/[\\/]/);
  const tail = parts.pop();
  if (tail.length >= max - 4) return `…${tail.slice(-(max - 1))}`;
  return `${s.slice(0, max - tail.length - 2)}…${s.includes('\\') ? '\\' : '/'}${tail}`;
}

export function phaseLabel(p) {
  if (!p) return t('sj_phase_collect');
  if (p.phase === 'engines') return t('sj_phase_engines', { engine: p.detail || '' });
  if (p.phase === 'finish' && p.detail) return `${t('sj_phase_finish')} · ${t(`sj_finish_${p.detail}`)}`;
  if (p.phase === 'db') return `${t('sj_phase_db')} · ${t(`db_phase_${p.dbPhase || 'connect'}`)}`;
  return t(`sj_phase_${p.phase || 'collect'}`);
}

// title / icon: the same popup serves database exports (DbExport.jsx).
export function ScanProgress({ job, onCancel, title, icon = 'search' }) {
  useLanguage();
  const [ask, setAsk] = useState(false);
  const p = (job && job.progress) || {};
  const pct = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
  const cancelling = job && job.status === 'cancelling';
  return (
    <div className="scan-progress-back">
      <div className="scan-progress" role="dialog" aria-modal="false" aria-label={title || t('sj_title')} data-tour="scan-progress" data-testid="scan-progress">
        <div className="sp-head">
          <span className="sp-icon"><Icon name={icon} size={16} /></span>
          <b>{title || t('sj_title')}</b>
          <span className="sp-path" title={job && job.path}>{shorten(job && job.path, 36)}</span>
          <CloseButton title={t('sj_cancel')} aria-label={t('sj_cancel')} onClick={() => setAsk(true)} size={13} />
        </div>
        <div className="sp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /><span>{pct}%</span></div>
        <div className="sp-phase">{phaseLabel(p)}{p.total > 1 ? <span className="small"> · {(p.done || 0).toLocaleString()}/{p.total.toLocaleString()}</span> : null}</div>
        <div className="sp-detail small" title={p.detail || ''}>{p.phase === 'engines' || p.phase === 'finish' ? '' : shorten(p.detail)}</div>
        {p.retry ? <div className="sp-retry small"><Icon name="alert" size={12} /> {t('sj_retry', { n: p.retry })}</div> : null}
        <div className="sp-foot">
          <span className="small">{t('sj_elapsed')} <b>{mmss(p.elapsedMs)}</b></span>
          <span className="small">{t('sj_remaining')} <b>{mmss(p.etaMs)}</b></span>
          <span className="spacer" />
          <Btn icon="close" label={cancelling ? t('sj_cancelling') : t('sj_cancel')} disabled={cancelling} onClick={onCancel} />
        </div>
      </div>
      {ask && <Confirm title={t('sj_cancel')} body={t('sj_cancel_confirm')} okLabel={t('sj_cancel')} danger onOk={() => { setAsk(false); onCancel(); }} onCancel={() => setAsk(false)} />}
    </div>
  );
}
