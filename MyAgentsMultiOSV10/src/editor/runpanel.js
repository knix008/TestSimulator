// The bottom panel's Run tab: the run in progress (or one picked from the history) as a timeline — one row
// per step with a bar where it ran in time — the step's input, output and log, and the card that answers a
// waiting Approval / Ask-a-person step. Pure HTML builders; the editor wires the buttons.
import { nodeDef, categoryOf, label as L } from '../../core/nodes/defs.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { jsonView } from './jsonview.js';

export const STATUS_ICON = { running: 'hourglass', succeeded: 'check', failed: 'error', waiting: 'hourglass', skipped: 'powerOff', cancelled: 'stop', interrupted: 'warning' };
export const fmtMs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} m ${Math.round((ms % 60000) / 1000)} s`);

export function runHeaderHtml(run, t, { live = false } = {}) {
  if (!run) return '';
  const now = Date.now();
  const ms = run.endedAt ? run.ms : now - run.startedAt;
  const tokens = run.usage ? `${run.usage.input ?? 0} / ${run.usage.output ?? 0}` : '0 / 0';
  return `<div class="run-head">
    <span class="run-chip big st-${run.status}">${icon(STATUS_ICON[run.status] ?? 'dot')}<span>${escapeHtml(t(`run.status.${run.status}`))}</span></span>
    <span class="run-meta" title="${escapeHtml(run.id)}">${icon(run.trigger?.kind === 'chat' ? 'chat' : run.trigger?.kind === 'webhook' ? 'webhook' : run.trigger?.kind === 'schedule' ? 'calendarClock' : 'play')}<b>${escapeHtml(t(`trigger.kind.${run.trigger?.kind ?? 'manual'}`))}</b></span>
    <span class="run-meta">${icon('clock')}<span data-run-elapsed>${escapeHtml(fmtMs(ms))}</span></span>
    <span class="run-meta">${icon('list')}<span>${escapeHtml(t('run.steps', { n: run.steps?.length ?? run.stepsCount ?? 0 }))}</span></span>
    <span class="run-meta" title="${escapeHtml(t('run.tokensTip'))}">${icon('sparkles')}<span>${escapeHtml(`${run.usage?.calls ?? 0} × · ${tokens} tok`)}</span></span>
    ${run.draft ? `<span class="badge">${escapeHtml(t('run.draft'))}</span>` : ''}
    ${run.error ? `<span class="run-error-inline" title="${escapeHtml(run.error.message)}">${icon('error')}<span>${escapeHtml(run.error.nodeName ? `${run.error.nodeName}: ` : '')}${escapeHtml(run.error.message)}</span></span>` : ''}
    <span class="grow"></span>
    ${live && ['running', 'waiting'].includes(run.status) ? `<button class="small-button danger" data-run-action="stop">${icon('stop')}<span>${escapeHtml(t('action.stop'))}</span></button>` : ''}
    <button class="small-button" data-run-action="rerun" title="${escapeHtml(t('run.rerunTip'))}">${icon('refresh')}<span>${escapeHtml(t('run.rerun'))}</span></button>
    <button class="small-button" data-run-action="clear" title="${escapeHtml(t('run.clearTip'))}">${icon('clear')}<span>${escapeHtml(t('run.clear'))}</span></button>
  </div>`;
}

export function waitingHtml(run, t) {
  const w = run?.waiting;
  if (!w || run.status !== 'waiting') return '';
  const fields = w.kind === 'input' ? (w.fields?.length ? w.fields : ['answer']).map((f) => `<label class="wait-field"><span>${escapeHtml(f)}</span><input type="text" data-wait-field="${escapeHtml(f)}" /></label>`).join('') : `<label class="wait-field"><span>${escapeHtml(t('run.comment'))}</span><input type="text" data-wait-comment /></label>`;
  const buttons = w.kind === 'input'
    ? `<button class="button primary" data-run-action="submit">${icon('send')}<span>${escapeHtml(t('run.submit'))}</span></button>`
    : `<button class="button danger" data-run-action="reject">${icon('close')}<span>${escapeHtml(t('run.reject'))}</span></button><button class="button primary" data-run-action="approve">${icon('approve')}<span>${escapeHtml(t('run.approve'))}</span></button>`;
  return `<div class="wait-card" role="alert">
    <div class="wait-title">${icon(w.kind === 'input' ? 'form' : 'approve')}<b>${escapeHtml(w.nodeName)}</b><span class="muted">${escapeHtml(t(w.kind === 'input' ? 'run.waitInput' : 'run.waitApproval'))}</span></div>
    <pre class="wait-message">${escapeHtml(w.message)}</pre>
    <div class="wait-fields">${fields}</div>
    <div class="wait-buttons">${buttons}</div>
  </div>`;
}

/** The timeline: rows of steps; the bar of each shows when it ran within the whole run. */
export function stepsHtml(run, t, lang, selectedStep) {
  const steps = run?.steps ?? [];
  if (!steps.length) return `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('run.noSteps'))}</span></p>`;
  const t0 = run.startedAt;
  const t1 = Math.max(run.endedAt ?? Date.now(), ...steps.map((s) => s.endedAt ?? Date.now()));
  const span = Math.max(1, t1 - t0);
  return steps.map((s) => {
    const def = nodeDef(s.type);
    const cat = categoryOf(def?.category);
    const left = ((s.startedAt - t0) / span) * 100;
    const width = Math.max(0.6, (((s.endedAt ?? Date.now()) - s.startedAt) / span) * 100);
    const depth = s.toolOf ? 1 : s.loop ? 1 : 0;
    return `<div class="step-row st-${s.status} ${selectedStep === s.id ? 'selected' : ''}" data-step="${escapeHtml(s.id)}" data-node-ref="${escapeHtml(s.nodeId)}" style="--cat:${cat.color};--depth:${depth}">
      <span class="step-status">${icon(STATUS_ICON[s.status] ?? 'dot')}</span>
      <span class="step-name">${icon(def?.icon ?? 'dot')}<b>${escapeHtml(s.name)}</b>${s.loop ? `<i class="step-tag">#${s.loop.index + 1}</i>` : ''}${s.toolOf ? `<i class="step-tag">${icon('plug')}${escapeHtml(t('run.asTool'))}</i>` : ''}${s.pinned ? `<i class="step-tag">${icon('pin')}</i>` : ''}</span>
      <span class="step-port muted">${escapeHtml(s.port ?? '')}</span>
      <span class="step-bar"><i style="left:${left}%;width:${width}%"></i></span>
      <span class="step-ms muted">${escapeHtml(fmtMs(s.ms || (s.status === 'running' ? Date.now() - s.startedAt : 0)))}</span>
    </div>`;
  }).join('');
}

export function stepDetailHtml(step, t) {
  if (!step) return `<div class="step-detail empty muted">${icon('info')}<span>${escapeHtml(t('run.pickStep'))}</span></div>`;
  const logs = (step.logs ?? []).map((l) => `<div class="log-line ${l.level}"><span class="muted">${escapeHtml(new Date(l.at).toLocaleTimeString())}</span> ${escapeHtml(l.text)}</div>`).join('');
  return `<div class="step-detail">
    <div class="step-detail-head"><b>${escapeHtml(step.name)}</b><span class="run-chip st-${step.status}">${escapeHtml(t(`run.status.${step.status}`))}</span><span class="muted">${escapeHtml(fmtMs(step.ms))}${step.model ? ` · ${escapeHtml(step.model)}` : ''}${step.usage ? ` · ${step.usage.input}/${step.usage.output} tok` : ''}${step.attempt ? ` · ${escapeHtml(t('run.attempt', { n: step.attempt + 1 }))}` : ''}</span>
      <span class="grow"></span><button class="icon-button" data-run-action="copy-output" title="${escapeHtml(t('run.copyOutput'))}">${icon('copy')}</button></div>
    ${step.error ? `<div class="run-error">${icon('error')}<span><b>${escapeHtml(step.error.code)}</b> ${escapeHtml(step.error.message)}</span></div>` : ''}
    <div class="io-grid">
      <div><h4>${escapeHtml(t('run.input'))}</h4>${jsonView(step.input, { max: 3 })}</div>
      <div><h4>${escapeHtml(t('run.output'))}${step.port ? ` <small class="muted">→ ${escapeHtml(step.port)}</small>` : ''}</h4>${jsonView(step.output, { max: 3 })}</div>
    </div>
    ${logs ? `<h4>${escapeHtml(t('run.log'))}</h4><div class="log-box">${logs}</div>` : ''}
  </div>`;
}

export function historyHtml(runs, t, currentId) {
  if (!runs.length) return `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('run.noHistory'))}</span></p>`;
  return runs.map((r) => `<div class="problem-row bottom-row history-row ${r.id === currentId ? 'selected' : ''}" data-history="${escapeHtml(r.id)}">
      <span class="cell sev st-${r.status}">${icon(STATUS_ICON[r.status] ?? 'dot')}</span>
      <span class="cell"><b>${escapeHtml(new Date(r.startedAt).toLocaleString())}</b> <span class="muted">${escapeHtml(t(`trigger.kind.${r.trigger?.kind ?? 'manual'}`))}${r.draft ? ` · ${escapeHtml(t('run.draft'))}` : ''}</span></span>
      <span class="cell muted">${escapeHtml(t('run.steps', { n: r.steps }))} · ${escapeHtml(fmtMs(r.ms))}</span>
      <span class="cell muted">${r.error ? escapeHtml(r.error.message) : escapeHtml(t(`run.status.${r.status}`))}</span>
    </div>`).join('');
}

/** A node name with its category colour, for problem rows. */
export function problemRowHtml(p, i, t, doc, lang) {
  const node = p.nodeId ? doc?.nodes.find((n) => n.id === p.nodeId) : null;
  const glyph = { error: 'error', warning: 'warning', info: 'info' }[p.severity];
  const text = t(`problem.${p.code}`, p.params);
  return `<div class="problem-row bottom-row problems-row sev-${p.severity} ${node ? 'link' : ''}" data-problem="${i}" title="${escapeHtml(text)}"><span class="cell sev">${icon(glyph)}</span><span class="cell">${escapeHtml(text)}</span><span class="cell muted">${escapeHtml(node ? `${node.name} · ${L(nodeDef(node.type)?.label, lang)}` : '')}</span><span class="cell muted">${escapeHtml(t(`problems.sev.${p.severity}`))}</span></div>`;
}
