import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChip, IconAlert, IconCheck, IconKey, IconRefresh, IconTerminal } from './Icons.jsx';
import { formatBytes, openExternal } from '../lib/platform.js';

// Where the engine is: installing (with the step and a progress bar), waiting
// for a Hugging Face token, failed, or ready on which device. Shown on the
// start screen and, while it needs attention, over the 3D view.
export function engineSummary(health, connection, t) {
  if (connection === 'stability') return { kind: 'ok', text: t('engine.stability') };
  if (!health) {
    if (connection === 'starting') return { kind: 'busy', text: t('engine.starting') };
    return { kind: 'error', text: t('engine.unreachable') };
  }
  switch (health.state) {
    case 'installing': return { kind: 'busy', text: t('engine.installing') };
    case 'install-failed': return { kind: 'error', text: t('engine.installFailed') };
    case 'starting': return { kind: 'busy', text: t('engine.starting') };
    default: break;
  }
  const sel = (health.models || []).find((m) => m.id === health.model);
  if (sel?.status === 'installing') return { kind: 'busy', text: t('engine.modelInstalling', { name: sel.name }) };
  if (sel?.status === 'loading') return { kind: 'busy', text: t('engine.modelLoading', { name: sel.name }) };
  if (sel?.status === 'needs-token') return { kind: 'error', text: t('engine.needsToken', { name: sel.name }) };
  if (sel?.status === 'failed') return { kind: 'error', text: t('engine.modelFailed', { name: sel.name }) };
  const dev = health.device?.name || t('engine.deviceAuto');
  return { kind: 'ok', text: t('engine.ready', { device: dev }) };
}

export function TokenForm({ onSubmit, compact = false, page }) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  return (
    <form
      className={`token-form${compact ? ' compact' : ''}`}
      onSubmit={(e) => { e.preventDefault(); if (token.trim()) onSubmit(token.trim()); }}
    >
      <p>{t('engine.tokenHelp')}</p>
      <ol>
        <li><button type="button" className="linkish" onClick={() => openExternal(page || 'https://huggingface.co/stabilityai/stable-fast-3d')}>{t('engine.tokenStep1')}</button></li>
        <li><button type="button" className="linkish" onClick={() => openExternal('https://huggingface.co/settings/tokens')}>{t('engine.tokenStep2')}</button></li>
        <li>{t('engine.tokenStep3')}</li>
      </ol>
      <div className="row">
        <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="hf_…" aria-label={t('engine.token')} autoComplete="off" />
        <button className="btn primary" type="submit" disabled={!token.trim()}><IconKey size={14} /> {t('engine.tokenSave')}</button>
      </div>
    </form>
  );
}

export default function EngineCard({ health, connection, onRetry, onToken, onShowLog, onUseModel, compact = false }) {
  const { t } = useTranslation();
  const sum = engineSummary(health, connection, t);
  const inst = health?.install || {};
  const sel = (health?.models || []).find((m) => m.id === health?.model);
  const installing = health?.state === 'installing' || sel?.status === 'installing';
  const frac = typeof inst.fraction === 'number' ? inst.fraction : null;
  const Icon = sum.kind === 'ok' ? IconCheck : sum.kind === 'error' ? IconAlert : IconChip;

  return (
    <div className={`engine-card k-${sum.kind}${compact ? ' compact' : ''}`}>
      <div className="engine-head">
        {sum.kind === 'busy' ? <span className="spinner" /> : <Icon size={16} />}
        <strong>{sum.text}</strong>
      </div>
      {installing ? (
        <>
          <div className="engine-step">
            {t('engine.step', { step: t(`installStep.${String(inst.step || '').split(' ').pop()}`, inst.step || '…') })}
            {frac !== null && inst.size ? ` · ${formatBytes(inst.done || 0)} / ${formatBytes(inst.size)}` : ''}
          </div>
          <div className="progbar"><div className={`progbar-fill${frac === null ? ' indeterminate' : ''}`} style={{ width: frac === null ? '35%' : `${Math.max(2, frac * 100)}%` }} /></div>
          <p className="engine-note">{t('engine.installNote')}</p>
        </>
      ) : null}
      {sel?.status === 'needs-token' && onToken ? <TokenForm onSubmit={onToken} compact={compact} page={sel.page} /> : null}
      {(health?.state === 'install-failed' || sel?.status === 'failed') ? (
        <p className="engine-error">{health?.error || sel?.error}</p>
      ) : null}
      {!health && connection !== 'starting' && connection !== 'stability' ? <p className="engine-note">{t('engine.unreachableHelp')}</p> : null}
      <div className="row">
        {(health?.state === 'install-failed' || sel?.status === 'failed' || (!health && connection === 'down')) && onRetry ? (
          <button className="btn small" onClick={onRetry}><IconRefresh size={14} /> {t('engine.retry')}</button>
        ) : null}
        {sel?.status === 'needs-token' && onUseModel ? (
          <button className="btn small" onClick={() => onUseModel('triposr')}>{t('engine.useTripo')}</button>
        ) : null}
        {onShowLog ? <button className="btn small" onClick={onShowLog}><IconTerminal size={14} /> {t('engine.showLog')}</button> : null}
      </div>
    </div>
  );
}
