import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFrame } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { platform } from '../lib/platform.js';
import { errorToText } from '../lib/errors.js';
import { formatBytes, formatDateTime } from '../lib/format.js';

// ── About ─────────────────────────────────────────────────
export function AboutDialog({ payload, onClose, standalone }) {
  const { t, i18n } = useTranslation();
  const info = (payload && payload.info) || {};
  const [copied, setCopied] = useState(false);
  const rows = [
    [t('about.version'), info.version ? `v${info.version}` : '-'],
    [t('about.buildTime'), info.buildTime ? formatDateTime(info.buildTime, i18n.language) : '-'],
    [t('about.commit'), info.gitCommit || '-'],
    [t('about.branch'), info.gitBranch || '-'],
    [t('about.author'), 'SHKWON(knix008@naver.com)'],
    [t('about.license'), info.license || 'MIT'],
    [t('about.platform'), `${info.platform || ''} ${info.arch || ''} ${info.osRelease ? '(' + info.osRelease + ')' : ''}`.trim() || '-'],
    [t('about.electron'), info.electron || (info.isElectron === false ? t('about.web') : '-')],
    [t('about.chrome'), info.chrome || '-'],
    [t('about.node'), info.node || '-'],
    [t('about.userData'), info.userData || '-'],
  ];
  const copy = async () => {
    const text = [`CaptureMaster ${info.version ? 'v' + info.version : ''}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
    await platform.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <DialogFrame
      title={t('about.title')}
      standalone={standalone}
      onClose={onClose}
      footer={<>
        <div className="left"><button className="btn" onClick={copy}><Icon name="copy" />{copied ? t('common.copied') : t('about.copyInfo')}</button></div>
        <button className="btn primary" onClick={onClose}>{t('common.ok')}</button>
      </>}
    >
      <div className="about-head">
        <img src="./icon.svg" alt="" draggable={false} />
        <div>
          <h1>CaptureMaster</h1>
          <div className="v">v{info.version || '-'}{info.packaged === false ? ` (${t('about.dev')})` : ''}</div>
          <div style={{ marginTop: 6, color: 'var(--text-dim)' }}>{t('about.description')}</div>
        </div>
      </div>
      <div className="section-title">{t('about.build')}</div>
      <dl className="kv">
        {rows.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
      </dl>
    </DialogFrame>
  );
}

// ── Error ─────────────────────────────────────────────────
export function ErrorDialog({ payload, onClose, standalone }) {
  const { t } = useTranslation();
  const err = (payload && payload.error) || { message: '?', stack: '' };
  const [copied, setCopied] = useState(false);
  const text = errorToText(err, payload && payload.info);
  const copy = async () => {
    await platform.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <DialogFrame
      title={err.context ? `${t('error.title')} — ${err.context}` : t('error.title')}
      standalone={standalone}
      onClose={onClose}
      footer={<>
        <div className="left"><button className="btn" onClick={copy}><Icon name="copy" />{copied ? t('error.copied') : t('error.copy')}</button></div>
        <button className="btn primary" onClick={onClose}>{t('common.ok')}</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
        <div className="err-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="error" size={26} style={{ color: 'var(--danger)', flex: 'none' }} />
          <span>{err.message}</span>
        </div>
        {err.context ? <div className="err-ctx">{t('error.where')}: {err.context}</div> : null}
        <div style={{ color: 'var(--text-dim)', fontSize: '0.9em' }}>{t('error.stack')}</div>
        <textarea className="err-stack" readOnly value={text} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
      </div>
    </DialogFrame>
  );
}

// ── Progress ──────────────────────────────────────────────
export function ProgressDialog({ payload, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const total = Number(p.total) || 0;
  const done = Number(p.done) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const indeterminate = !(total > 0);
  return (
    <DialogFrame title={p.title || t('progress.working')} standalone={standalone} onClose={onClose} noEscape>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.message}>{p.message || ''}</div>
      <div className={`progress-bar${indeterminate ? ' indeterminate' : ''}`}><div style={{ width: `${indeterminate ? 30 : pct}%` }} /></div>
      <div className="progress-text">
        <span>{indeterminate ? t('progress.working') : `${pct}%`}</span>
        <span>{total > 0 ? t('progress.of', { done: formatBytes(done), total: formatBytes(total) }) : done ? formatBytes(done) : ''}</span>
      </div>
    </DialogFrame>
  );
}

// ── Confirm ───────────────────────────────────────────────
/** payload.buttons: [{ id, label, kind: 'primary'|'danger'|'' }] — the last is the default. */
export function ConfirmDialog({ payload, onSubmit, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const buttons = p.buttons && p.buttons.length ? p.buttons : [{ id: 'cancel', label: t('common.cancel') }, { id: 'ok', label: t('common.ok'), kind: 'primary' }];
  const first = useRef(null);
  useEffect(() => { if (first.current) first.current.focus(); }, []);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Enter') { const d = buttons.find((b) => b.kind === 'primary') || buttons[buttons.length - 1]; onSubmit({ id: d.id }); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [buttons, onSubmit]);
  return (
    <DialogFrame
      title={p.title || t('common.info')}
      standalone={standalone}
      onClose={onClose}
      footer={buttons.map((b, i) => (
        <button key={b.id} ref={b.kind === 'primary' ? first : null} className={`btn ${b.kind || ''}`} onClick={() => onSubmit({ id: b.id })} autoFocus={i === buttons.length - 1}>{b.label}</button>
      ))}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name={p.icon || 'warning'} size={28} style={{ color: p.icon === 'info' ? 'var(--accent)' : 'var(--warning)', flex: 'none' }} />
        <div style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{p.message}</div>
      </div>
    </DialogFrame>
  );
}

// ── Prompt (one text field) ───────────────────────────────
export function PromptDialog({ payload, onSubmit, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const [value, setValue] = useState(p.value || '');
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, []);
  const ok = () => { if (value.trim()) onSubmit({ value: value.trim() }); };
  return (
    <DialogFrame
      title={p.title || ''}
      standalone={standalone}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" onClick={ok} disabled={!value.trim()}>{p.okLabel || t('common.ok')}</button>
      </>}
    >
      <div className="field" style={{ gridTemplateColumns: '1fr' }}>
        <label>{p.label || ''}</label>
        <input ref={ref} type={p.type || 'text'} value={value} placeholder={p.placeholder || ''} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} style={{ width: '100%' }} />
      </div>
    </DialogFrame>
  );
}
