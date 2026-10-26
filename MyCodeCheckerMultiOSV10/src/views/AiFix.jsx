// AI CodeFix in the issue details: ask the configured LLM for a fix of the
// issue's lines, show the diff with the explanation, apply it to the file.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { Btn, BtnGroup, emitAction } from './common';
import { record } from '../lib/history';
import { showError, toast } from '../lib/ui';

// The code view reloads a file after a fix is applied or undone.
const codeChanged = (file) => window.dispatchEvent(new CustomEvent('mcc-code-refresh', { detail: { file } }));

let aiCache = null;
const listeners = new Set();

export function refreshAiSettings(next) {
  aiCache = next || null;
  if (!next) call('ai.get').then((s) => { aiCache = s; listeners.forEach((fn) => fn(s)); }).catch(() => {});
  else listeners.forEach((fn) => fn(next));
}

export function useAiSettings() {
  const [s, setS] = useState(aiCache);
  useEffect(() => {
    listeners.add(setS);
    if (!aiCache) refreshAiSettings();
    return () => listeners.delete(setS);
  }, []);
  return s;
}

const AI_ERRORS = ['AI_NOT_CONFIGURED', 'AI_REFUSED', 'AI_BAD_REPLY', 'AI_AUTH', 'AI_HTTP', 'CONFLICT', 'FORBIDDEN'];
export function aiErrorText(err) {
  const code = err && err.code;
  if (AI_ERRORS.includes(code)) return `${t(`ai_err_${code}`)}${err.message ? ` (${err.message})` : ''}`;
  return (err && err.message) || String(err);
}

// Line diff (LCS) of two snippets: [{ op: ' ' | '-' | '+', text, a, b }].
export function lineDiff(before, after, start = 1) {
  const a = String(before || '').split(/\r?\n/);
  const b = String(after || '').split(/\r?\n/);
  if (a.length && a[a.length - 1] === '' && b.length && b[b.length - 1] === '') { a.pop(); b.pop(); }
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0; let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push({ op: ' ', text: a[i], a: start + i, b: start + j }); i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { out.push({ op: '+', text: b[j], a: null, b: start + j }); j++; }
    else { out.push({ op: '-', text: a[i], a: start + i, b: null }); i++; }
  }
  return out;
}

export function AiFixBox({ project, branch, issue, onApplied }) {
  useLanguage();
  const ai = useAiSettings();
  const [state, setState] = useState({ busy: false, proposal: null, error: null, applied: null });
  useEffect(() => { setState({ busy: false, proposal: null, error: null, applied: null }); }, [issue && issue.key]);
  if (!issue || !project) return null;
  const enabled = !!(ai && ai.enabled);
  // 되돌리기: the file as it was before the fix (CONFLICT when it changed since, NOT_FOUND when already undone).
  const revert = async () => {
    const a = state.applied;
    if (!a || !a.undoId) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await call('issue.aiFixRevert', { projectId: project.id, undoId: a.undoId, issueKey: issue && issue.key });
      setState((s) => ({ ...s, busy: false, applied: null }));
      codeChanged(a.file);
      toast(t('ai_undone', { file: a.file || '' }), 'ok');
    } catch (err) { setState((s) => ({ ...s, busy: false })); showError(err); }
  };
  const ask = async () => {
    setState({ busy: true, proposal: null, error: null, applied: null });
    try {
      const proposal = await call('issue.aiFix', { projectId: project.id, branch, key: issue.key });
      setState({ busy: false, proposal, error: null, applied: null });
    } catch (err) { setState({ busy: false, proposal: null, error: err, applied: null }); }
  };
  const apply = async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const proposal = state.proposal;
      const pid = project.id;
      const issueKey = issue && issue.key;
      const applied = await call('issue.aiFixApply', { projectId: pid, proposal });
      setState((s) => ({ ...s, busy: false, applied }));
      codeChanged(applied.file);
      if (onApplied) onApplied(applied);
      // Undo history: undo = aiFixRevert, redo = apply the same proposal again.
      let undoId = applied.undoId;
      if (undoId) {
        record({
          label: t('hist_ai_fix', { file: applied.file || '' }),
          undo: async () => { await call('issue.aiFixRevert', { projectId: pid, undoId, issueKey }); codeChanged(applied.file); setState((s) => (s.applied && s.applied.undoId === undoId ? { ...s, applied: null } : s)); },
          redo: async () => { const again = await call('issue.aiFixApply', { projectId: pid, proposal }); undoId = again.undoId; codeChanged(again.file); },
        });
      }
    } catch (err) { setState((s) => ({ ...s, busy: false, error: err })); }
  };
  const p = state.proposal;
  const diff = p && !p.noFix ? lineDiff(p.original, p.replacement, p.startLine || 1) : [];
  return (
    <div className="ai-box" data-tour="ai-fix">
      <h3 className="sub-title"><Icon name="ai" size={15} />{t('ai_fix_title')}</h3>
      {!p && !state.busy && (
        <div className="ai-start">
          <Btn icon="sparkle" label={t('ai_fix_ask')} primary disabled={!enabled} onClick={ask} title={enabled ? `${t('ai_fix_ask')} (${ai.model || ai.defaultModel})` : t('ai_fix_disabled')} />
          {!enabled && <span className="small">{t('ai_fix_disabled')} <button type="button" className="link-btn" onClick={() => emitAction('settings:ai')}><Icon name="settings" size={11} /> {t('ai_open_settings')}</button></span>}
        </div>
      )}
      {state.busy && <div className="ai-busy small"><Icon name="spinner" size={14} className="spin" /> {p ? t('ai_applying') : t('ai_thinking')}</div>}
      {state.error && (
        <div className="note-box warn">
          <Icon name="alert" size={14} />
          <div><span className="small">{aiErrorText(state.error)}</span>
            {state.error.code === 'CONFLICT' && <span className="small">{t('ai_conflict_hint')}</span>}</div>
        </div>
      )}
      {p && (
        <div className="ai-proposal">
          <div className="chips">
            {!p.noFix && <span className={`status-pill tone-${p.confidence === 'high' ? 'ok' : p.confidence === 'medium' ? 'warn' : 'bad'}`}><Icon name="gauge" size={12} />{t('ai_confidence')} {t(`ai_conf_${p.confidence || 'low'}`)}</span>}
            {p.noFix && <span className="status-pill tone-muted"><Icon name="info" size={12} />{t('ai_no_fix')}</span>}
            <span className="chip"><Icon name="ai" size={11} />{p.model}</span>
            {p.usage && <span className="chip" title={t('ai_tokens')}><Icon name="hash" size={11} />{t('ai_usage', { input: p.usage.input ?? '—', output: p.usage.output ?? '—' })}</span>}
          </div>
          {!p.noFix && (
            <div className="diff selectable" data-tour="ai-diff" role="table" aria-label={t('ai_diff')}>
              <div className="diff-head small"><Icon name="file" size={12} /> {p.file}:{p.startLine}–{p.endLine}</div>
              {diff.map((d, i) => (
                <div key={i} className={`diff-row op-${d.op === '+' ? 'add' : d.op === '-' ? 'del' : 'same'}`}>
                  <span className="dn">{d.a ?? ''}</span><span className="dn">{d.b ?? ''}</span><span className="dop">{d.op}</span><span className="dt">{d.text || ' '}</span>
                </div>
              ))}
            </div>
          )}
          {p.explanation && <p className="small ai-expl">{p.explanation}</p>}
          {state.applied ? (
            <div className="note-box ok">
              <Icon name="checkCircle" size={14} />
              <div><strong>{t('ai_applied')}</strong><span className="small">{t('ai_applied_detail', { file: state.applied.file, removed: state.applied.linesRemoved, added: state.applied.linesAdded })}</span>
                <span><BtnGroup>
                  <Btn icon="play" label={t('ai_reanalyze')} primary onClick={() => emitAction('analyze')} />
                  {state.applied.undoId && <Btn icon="undo" label={t('ai_undo_fix')} disabled={state.busy} onClick={revert} title={t('ai_undo_fix_tip')} />}
                </BtnGroup></span></div>
            </div>
          ) : (
            <div className="actions">
              {!p.noFix && <Btn icon="check" label={t('ai_apply')} primary disabled={state.busy} onClick={apply} title={t('ai_apply_tip')} />}
              <Btn icon="refresh" label={t('ai_retry')} disabled={state.busy} onClick={ask} />
              <Btn icon="close" label={t('close')} disabled={state.busy} onClick={() => setState({ busy: false, proposal: null, error: null, applied: null })} />
            </div>
          )}
        </div>
      )}
      {!p && state.error && state.error.code !== 'AI_NOT_CONFIGURED' && <BtnGroup><Btn icon="refresh" label={t('ai_retry')} onClick={ask} /></BtnGroup>}
    </div>
  );
}
