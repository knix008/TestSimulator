// Runs view: every run of every agent (newest first) with filters, and what is scheduled next.
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { STATUS_ICON, fmtMs } from '../editor/runpanel.js';

export function createRunsView(app) {
  const { t } = app;
  const state = { runs: [], schedules: [], status: '', agent: '' };
  let host = null;

  async function load() {
    try {
      [state.runs, state.schedules] = await Promise.all([app.client.runs({ limit: 300, status: state.status || undefined, agentId: state.agent || undefined }), app.client.schedules()]);
    } catch (error) { app.showError('error.load', error); }
    render();
  }
  function mount(el) { host = el; render(); load(); }

  function render() {
    if (!host) return;
    const agents = app.agents();
    const name = (id) => agents.find((a) => a.id === id)?.name ?? id;
    const counts = Object.fromEntries(['succeeded', 'failed', 'running', 'waiting'].map((s) => [s, state.runs.filter((r) => r.status === s).length]));
    host.innerHTML = `<div class="view-page runs-view">
      <div class="view-head">${icon('timeline')}<h2>${escapeHtml(t('view.runs'))}</h2>
        <span class="run-chip st-succeeded">${icon('check')}${counts.succeeded}</span><span class="run-chip st-failed">${icon('error')}${counts.failed}</span><span class="run-chip st-running">${icon('hourglass')}${counts.running + counts.waiting}</span>
        <span class="grow"></span>
        <select data-runs-agent data-icon="robot"><option value="">${escapeHtml(t('runs.allAgents'))}</option>${agents.map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === state.agent ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
        <select data-runs-status data-icon="filter"><option value="">${escapeHtml(t('runs.allStatus'))}</option>${['succeeded', 'failed', 'running', 'waiting', 'cancelled', 'interrupted'].map((s) => `<option value="${s}" ${s === state.status ? 'selected' : ''}>${escapeHtml(t(`run.status.${s}`))}</option>`).join('')}</select>
        <button class="small-button" data-runs="refresh">${icon('refresh')}<span>${escapeHtml(t('action.refresh'))}</span></button></div>
      ${state.schedules.length ? `<div class="schedules"><h3>${icon('calendarClock')} ${escapeHtml(t('runs.upcoming'))}</h3>${state.schedules.map((s) => `<span class="chip">${icon('robot')} ${escapeHtml(name(s.agentId))} — ${escapeHtml(s.error ?? (s.at ? new Date(s.at).toLocaleString() : '—'))}</span>`).join('')}</div>` : ''}
      <table class="data-table runs-table"><thead><tr><th></th><th>${escapeHtml(t('runs.agent'))}</th><th>${escapeHtml(t('runs.started'))}</th><th>${escapeHtml(t('runs.trigger'))}</th><th>${escapeHtml(t('runs.steps'))}</th><th>${escapeHtml(t('runs.duration'))}</th><th>${escapeHtml(t('runs.tokens'))}</th><th>${escapeHtml(t('runs.result'))}</th></tr></thead>
      <tbody>${state.runs.map((r) => `<tr class="st-${r.status}" data-run-open="${escapeHtml(r.id)}" data-run-agent="${escapeHtml(r.agentId)}"><td class="st-cell">${icon(STATUS_ICON[r.status] ?? 'dot')}</td><td><b>${escapeHtml(r.agentName || name(r.agentId))}</b>${r.draft ? ` <i class="badge">${escapeHtml(t('run.draft'))}</i>` : ''}</td><td>${escapeHtml(new Date(r.startedAt).toLocaleString())}</td><td>${escapeHtml(t(`trigger.kind.${r.trigger?.kind ?? 'manual'}`))}</td><td>${r.steps}</td><td>${escapeHtml(fmtMs(r.ms))}</td><td>${escapeHtml(`${r.usage?.input ?? 0}/${r.usage?.output ?? 0}`)}</td><td class="muted">${escapeHtml(r.error?.message ?? t(`run.status.${r.status}`))}</td></tr>`).join('') || `<tr><td colspan="8" class="muted">${escapeHtml(t('run.noHistory'))}</td></tr>`}</tbody></table>
    </div>`;
  }

  function onClick(event) {
    const row = event.target.closest('[data-run-open]');
    if (row) return app.openRun(row.dataset.runAgent, row.dataset.runOpen);
    if (event.target.closest('[data-runs="refresh"]')) return load();
    return undefined;
  }
  function onChange(event) {
    if ('runsAgent' in event.target.dataset) { state.agent = event.target.value; load(); }
    if ('runsStatus' in event.target.dataset) { state.status = event.target.value; load(); }
  }
  return { mount, render, load, onClick, onChange };
}
