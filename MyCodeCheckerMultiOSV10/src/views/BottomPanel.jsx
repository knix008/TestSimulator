// Bottom panel: 문제 (open issues of the current file or view, jump to them),
// 분석 로그 (the last analysis: timings, engines, warnings, errors), 작업
// (running and recent background work) and 출력 (message history).
import React, { useEffect, useMemo, useState } from 'react';
import { t, textOf, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon, CloseButton } from '../components/Chrome';
import { Empty, SevBadge, TypeBadge, fmtDate } from './common';
import { engineOf } from './standards';

const OPENISH = new Set(['OPEN', 'CONFIRMED', 'REOPENED', 'TO_REVIEW']);

function dismissed(i) {
  return i.classification === 'False Positive' || i.classification === 'Intentional' || i.action === 'Ignore' || i.resolution === 'FALSE-POSITIVE' || i.resolution === 'WONTFIX';
}

/** Issues the 문제 tab lists for the current view. */
export function problemsFor(analysis, view, codeFile) {
  const all = (analysis && analysis.issues) || [];
  let list;
  if (view === 'code' && codeFile) list = all.filter((i) => i.file === codeFile && OPENISH.has(i.status));
  else if (view === 'hotspots') list = all.filter((i) => i.type === 'SECURITY_HOTSPOT' && i.status === 'TO_REVIEW');
  else if (view === 'defects') list = all.filter((i) => !dismissed(i));
  else list = all.filter((i) => i.type !== 'SECURITY_HOTSPOT' && OPENISH.has(i.status));
  return list;
}

function ProblemsTab({ list, scope, onJump }) {
  useLanguage();
  if (!list.length) return <Empty icon="checkCircle" text={t('bp_no_problems')} />;
  return (
    <div className="bp-list">
      <div className="bp-scope small"><Icon name="filter" size={12} /> {scope}</div>
      <table className="bp-table">
        <tbody>
          {list.slice(0, 400).map((i, idx) => (
            <tr key={`${i.key}-${idx}`} className="click" title={t('bp_jump')} onClick={() => onJump(i)}>
              <td className="nowrap"><SevBadge sev={i.severity} /></td>
              <td className="wrap"><span className="msg-line"><TypeBadge type={i.type} short />{textOf(i.message)}</span></td>
              <td className="small nowrap mono">{i.file}:{i.line}</td>
              <td className="small nowrap">{i.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > 400 && <div className="small bp-more">{t('bp_more', { n: list.length - 400 })}</div>}
    </div>
  );
}

function LogTab({ analysis, task }) {
  useLanguage();
  if (!analysis && !task) return <Empty icon="clock" text={t('es_no_activity')} hint={t('es_no_activity_hint')} />;
  const engines = {};
  for (const i of (analysis && analysis.issues) || []) { const e = engineOf(i); engines[e] = (engines[e] || 0) + 1; }
  const warnings = [...((analysis && analysis.warnings) || []), ...((task && task.warnings) || [])];
  const m = (analysis && analysis.measures) || {};
  const line = (icon, label, value, tone) => (
    <div className={`log-line ${tone || ''}`}><Icon name={icon} size={13} /><span className="log-k">{label}</span><span className="log-v">{value}</span></div>
  );
  return (
    <div className="bp-log selectable">
      {task && line(task.status === 'SUCCESS' ? 'checkCircle' : task.status === 'FAILED' ? 'xCircle' : task.status === 'CANCELED' ? 'cancelCircle' : 'hourglass', t('bl_task'), `${t(`task_${task.status}`) === `task_${task.status}` ? task.status : t(`task_${task.status}`)} · ${task.branch || ''} · ${fmtDate(task.submittedAt)}`, task.status === 'FAILED' ? 'bad' : task.status === 'CANCELED' ? 'warn' : 'ok')}
      {task && task.error && line('alert', t('bl_error'), task.error, 'bad')}
      {analysis && line('clock', t('bl_time'), `${fmtDate(analysis.startedAt)} → ${fmtDate(analysis.finishedAt)} · ${analysis.durationMs} ms`)}
      {analysis && line('file', t('bl_files'), `${m.files ?? '—'} ${t('files')} · ${m.ncloc ?? '—'} ${t('ncloc')} · ${Object.entries(analysis.languages || {}).map(([k, n]) => `${k} ${n}`).join(', ')}`)}
      {analysis && line('cpu', t('bl_engines'), Object.entries(engines).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || '—')}
      {analysis && analysis.coverage && line('checkCircle', t('coverage'), `${analysis.coverage.format} · ${analysis.coverage.lineCoverage}%`)}
      {analysis && line('gate', t('gate'), analysis.qualityGate && analysis.qualityGate.status === 'OK' ? t('passed') : t('failed'), analysis.qualityGate && analysis.qualityGate.status === 'OK' ? 'ok' : 'bad')}
      <div className="log-sep">{t('bl_warnings')} ({warnings.length})</div>
      {warnings.length === 0 && line('check', t('bl_no_warnings'), '')}
      {warnings.map((w, i) => line('alert', w.engine || t('bl_warning'), typeof w === 'string' ? w : textOf(w.message) || JSON.stringify(w), 'warn'))}
    </div>
  );
}

function JobsTab({ active, busy, message, jobs }) {
  useLanguage();
  const [schedules, setSchedules] = useState(null);
  const [dast, setDast] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    const load = () => {
      call('schedule.list').then((s) => { if (!stop) setSchedules(s || []); }).catch(() => { if (!stop) setSchedules([]); });
      call('dast.progress').then((d) => { if (!stop) setDast(d); }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { stop = true; clearInterval(timer); };
  }, [active]);
  const rows = [];
  if (busy) rows.push({ icon: 'spinner', spin: true, kind: t('bj_scan'), text: message || t('analyzing'), status: 'running' });
  if (dast && dast.running) rows.push({ icon: 'globe', kind: 'DAST', text: dast.progress ? JSON.stringify(dast.progress).slice(0, 160) : dast.id, status: 'running' });
  for (const j of Object.values(jobs || {})) rows.push({ icon: 'installBox', kind: t('bj_install'), text: `${j.tool} · ${j.command || ''}`, status: j.status, at: j.startedAt });
  for (const s of schedules || []) {
    if (s.lastRun) rows.push({ icon: s.kind === 'dast' ? 'globe' : 'calendar', kind: t('bj_schedule'), text: `${s.name}${s.lastSummary ? ` — ${s.lastSummary}` : ''}`, status: s.lastStatus || '', at: s.lastRun });
    if (s.enabled !== false && s.nextRun) rows.push({ icon: 'clock', kind: t('bj_next'), text: s.name, status: 'scheduled', at: s.nextRun });
  }
  if (!rows.length) return <Empty icon="hourglass" text={t('bj_empty')} />;
  const tone = (st) => (/running|scheduled/i.test(st) ? 'info' : /^(ok|done|success)$/i.test(st) ? 'ok' : st ? 'bad' : 'muted');
  return (
    <table className="bp-table">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="nowrap"><Icon name={r.icon} size={13} className={r.spin ? 'spin' : ''} /> {r.kind}</td>
            <td className="wrap">{r.text}</td>
            <td className="nowrap"><span className={`status-pill tone-${tone(r.status)}`}>{r.status || '—'}</span></td>
            <td className="small nowrap">{r.at ? fmtDate(r.at) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutputTab({ messages, onClear }) {
  useLanguage();
  if (!messages.length) return <Empty icon="list" text={t('bo_empty')} />;
  return (
    <div className="bp-log selectable">
      <div className="log-sep"><span>{t('bo_history')} ({messages.length})</span><button type="button" className="link-btn" onClick={onClear}><Icon name="trash" size={12} /> {t('bo_clear')}</button></div>
      {[...messages].reverse().map((m, i) => (
        <div key={i} className={`log-line ${m.kind || ''}`}><Icon name={m.kind === 'bad' ? 'xCircle' : m.kind === 'ok' ? 'checkCircle' : 'info'} size={13} /><span className="log-k">{fmtDate(m.at).slice(11)}</span><span className="log-v">{m.text}</span></div>
      ))}
    </div>
  );
}

export const BOTTOM_TABS = [
  ['problems', 'alert', 'bp_problems'],
  ['log', 'list', 'bp_log'],
  ['jobs', 'hourglass', 'bp_jobs'],
  ['output', 'terminal', 'bp_output'],
];

export function BottomPanel({ tab, onTab, folded, onFold, onClose, height, analysis, task, view, codeFile, busy, message, jobs, messages, onClearMessages, onJump }) {
  useLanguage();
  const problems = useMemo(() => problemsFor(analysis, view, codeFile), [analysis, view, codeFile]);
  const warnCount = ((analysis && analysis.warnings) || []).length + ((task && task.warnings) || []).length;
  const running = (busy ? 1 : 0) + Object.values(jobs || {}).filter((j) => j.status === 'running').length;
  const counts = { problems: problems.length, log: warnCount, jobs: running, output: messages.length };
  const scope = view === 'code' && codeFile ? t('bp_scope_file', { file: codeFile }) : view === 'hotspots' ? t('bp_scope_hotspots') : view === 'defects' ? t('bp_scope_defects') : t('bp_scope_open');
  const head = (
    <div className="bp-head" role="tablist">
      <Icon name="panelBottom" size={14} />
      {BOTTOM_TABS.map(([id, icon, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id && !folded} className={`bp-tab ${tab === id ? 'on' : ''}`} data-tour={`bottom-tab-${id}`}
          onClick={() => { onTab(id); if (folded) onFold(false); }}>
          <Icon name={icon} size={13} /><span>{t(label)}</span>{counts[id] ? <span className={`nav-count ${id === 'log' || id === 'problems' ? 'warn' : ''}`}>{counts[id]}</span> : null}
        </button>
      ))}
      <span className="spacer" />
      <button type="button" className="icon-btn" title={folded ? t('pn_unfold') : t('pn_fold')} aria-label={folded ? t('pn_unfold') : t('pn_fold')} onClick={() => onFold(!folded)}><Icon name={folded ? 'chevronUp' : 'chevronDown'} size={14} /></button>
      <CloseButton title={t('pn_close')} aria-label={t('pn_close')} onClick={onClose} size={13} />
    </div>
  );
  return (
    <div className={`bottom-panel ${folded ? 'folded' : ''}`} data-tour="bottom-panel" style={folded ? undefined : { height }}>
      {head}
      {!folded && (
        <div className="bp-body">
          {tab === 'problems' && <ProblemsTab list={problems} scope={scope} onJump={onJump} />}
          {tab === 'log' && <LogTab analysis={analysis} task={task} />}
          {tab === 'jobs' && <JobsTab active busy={busy} message={message} jobs={jobs} />}
          {tab === 'output' && <OutputTab messages={messages} onClear={onClearMessages} />}
        </div>
      )}
    </div>
  );
}
