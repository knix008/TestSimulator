// The bottom panel's Progress and Code tabs (live while a run goes on):
//   Progress — the agent's phases (node.phase, in document order; else the palette groups) with their state,
//              the whole run's percentage, the round (how often the tests ran), and every test node's
//              passed / failed per round.
//   Code     — every file a run wrote (File and Save nodes): the list with versions and +/− lines, the newest
//              text with line numbers and the lines changed since the version before highlighted.
// The models are pure (unit tested); the HTML builders only draw them.
import { nodeDef, categoryOf, label as L } from '../../core/nodes/defs.js';
import { changedLines } from '../../core/diff.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';

const DONE = new Set(['succeeded', 'skipped', 'cancelled']);
const BUSY = new Set(['running', 'waiting']);
const runnable = (n) => !nodeDef(n.type)?.note && !n.disabled;

/** → { phases: [{ name, nodes, done, total, state }], percent, round, tests: [{ node, name, kind, rounds: [{ passed, failed, skipped, ok }] }], status, ms } */
export function progressModel(doc, run, lang = 'ko', now = Date.now()) {
  const nodes = (doc?.nodes ?? []).filter(runnable);
  const steps = run?.steps ?? [];
  const byNode = new Map();
  for (const s of steps) { if (!byNode.has(s.nodeId)) byNode.set(s.nodeId, []); byNode.get(s.nodeId).push(s); }
  const hasPhases = nodes.some((n) => n.phase);
  const groups = new Map();
  // a node without a phase in a phased agent belongs to the phase before it (or the first one)
  const firstPhase = nodes.find((n) => n.phase)?.phase;
  let lastPhase = firstPhase;
  for (const n of nodes) {
    if (n.phase) lastPhase = n.phase;
    const key = hasPhases ? n.phase || lastPhase : L(categoryOf(nodeDef(n.type)?.category)?.label, lang);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const stateOf = (n) => {
    const list = byNode.get(n.id) ?? [];
    if (!list.length) return 'pending';
    const last = list.at(-1);
    if (BUSY.has(last.status)) return last.status === 'waiting' ? 'waiting' : 'running';
    if (last.status === 'failed') return 'failed';
    return DONE.has(last.status) ? 'done' : 'pending';
  };
  const phases = [...groups.entries()].map(([name, list]) => {
    const states = list.map(stateOf);
    const done = states.filter((s) => s === 'done').length;
    const state = states.includes('failed') ? 'failed' : states.includes('waiting') ? 'waiting' : states.includes('running') ? 'running' : done === list.length ? 'done' : done || states.some((s) => s !== 'pending') ? 'partial' : 'pending';
    return { name, nodes: list.map((n) => n.id), done, total: list.length, state };
  });
  const touched = nodes.filter((n) => stateOf(n) === 'done').length;
  const finished = run && !BUSY.has(run.status);
  const percent = !run ? 0 : finished && run.status === 'succeeded' ? 100 : Math.min(99, Math.round((touched / Math.max(1, nodes.length)) * 100));
  const tests = nodes.filter((n) => n.type === 'tool.test').map((n) => ({
    node: n.id, name: n.name, kind: n.config?.kind || 'unit',
    rounds: (byNode.get(n.id) ?? []).filter((s) => s.output && typeof s.output === 'object').map((s) => ({ passed: s.output.passed ?? 0, failed: s.output.failed ?? 0, skipped: s.output.skipped ?? 0, ok: Boolean(s.output.ok) && !s.output.failed })),
  }));
  const round = Math.max(0, ...tests.map((x) => x.rounds.length), ...steps.filter((s) => s.type === 'logic.counter').map((s) => Number(s.output?.value) || 0).slice(-1));
  const ms = run ? (run.ms || (run.startedAt ? (run.endedAt ?? now) - run.startedAt : 0)) : 0;
  return { phases, percent, round, tests, status: run?.status ?? 'idle', ms, nodes: nodes.length, touched };
}

/** → [{ file, versions: [{ text, stepId, at, op }], added, removed }] in the order the files were first written. */
export function codeModel(run) {
  const files = new Map();
  for (const s of run?.steps ?? []) {
    const o = s.output;
    if (!o || typeof o !== 'object' || typeof o.file !== 'string' || typeof o.text !== 'string') continue;
    if (s.type !== 'tool.file' && s.type !== 'io.write') continue;
    if (!files.has(o.file)) files.set(o.file, []);
    const list = files.get(o.file);
    if (list.at(-1)?.text !== o.text) list.push({ text: o.text, stepId: s.id, at: s.endedAt ?? s.startedAt ?? 0, op: o.op ?? 'write', format: o.format ?? '' });
  }
  return [...files.entries()].map(([file, versions]) => {
    const last = versions.at(-1);
    const prev = versions.at(-2);
    const ch = changedLines(prev?.text ?? null, last.text);
    return { file, versions, added: ch.added.size, removed: ch.removed, fresh: ch.fresh };
  });
}

const fmtMs = (ms) => (!ms ? '0 s' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const STATE_ICON = { done: 'check', running: 'hourglass', waiting: 'approve', failed: 'error', partial: 'timeline', pending: 'dot' };

export function progressHtml(m, t) {
  if (m.status === 'idle') return `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('progress.none'))}</span></p>`;
  const testRows = m.tests.length ? `<table class="pg-tests"><thead><tr><th>${escapeHtml(t('progress.test'))}</th><th>${escapeHtml(t('progress.kind'))}</th><th>${escapeHtml(t('progress.latest'))}</th><th>${escapeHtml(t('progress.byRound'))}</th></tr></thead><tbody>${m.tests.map((x) => {
    const last = x.rounds.at(-1);
    return `<tr data-test-row="${escapeHtml(x.node)}"><td>${icon('flask')}<span>${escapeHtml(x.name)}</span></td><td>${escapeHtml(t(`progress.kind.${x.kind}`))}</td><td>${last ? `<b class="ok">${last.passed}</b> ${escapeHtml(t('progress.passed'))} · <b class="${last.failed ? 'bad' : ''}">${last.failed}</b> ${escapeHtml(t('progress.failed'))}${last.skipped ? ` · ${last.skipped} ${escapeHtml(t('progress.skipped'))}` : ''}` : '—'}</td><td class="pg-rounds">${x.rounds.map((r, i) => `<i class="${r.ok ? 'ok' : 'bad'}" title="${escapeHtml(t('progress.roundOf', { n: i + 1 }))}: ${r.passed} / ${r.failed}">${i + 1}</i>`).join('')}</td></tr>`;
  }).join('')}</tbody></table>` : '';
  return `<div class="pg">
    <div class="pg-head st-${escapeHtml(m.status)}">
      <div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.percent}"><i style="width:${m.percent}%"></i></div>
      <b class="pg-percent">${m.percent}%</b>
      <span class="pg-chip">${icon(m.status === 'succeeded' ? 'check' : m.status === 'failed' ? 'error' : 'hourglass')}<span>${escapeHtml(t(`run.status.${m.status}`))}</span></span>
      ${m.round ? `<span class="pg-chip">${icon('refresh')}<span>${escapeHtml(t('progress.round', { n: m.round }))}</span></span>` : ''}
      <span class="pg-chip">${icon('clock')}<span>${escapeHtml(fmtMs(m.ms))}</span></span>
      <span class="pg-chip">${icon('list')}<span>${escapeHtml(t('progress.nodes', { done: m.touched, total: m.nodes }))}</span></span>
    </div>
    <ol class="pg-phases">${m.phases.map((p, i) => `<li class="pg-phase ${p.state}" data-phase="${i}" title="${escapeHtml(`${p.name} · ${p.done} / ${p.total}`)}">${icon(STATE_ICON[p.state] ?? 'dot')}<span class="pg-name">${escapeHtml(p.name)}</span><span class="pg-mini"><i style="width:${Math.round((p.done / Math.max(1, p.total)) * 100)}%"></i></span><small>${p.done}/${p.total}</small></li>`).join('')}</ol>
    ${testRows}
  </div>`;
}

export function codeHtml(files, selected, t) {
  if (!files.length) return `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('code.none'))}</span></p>`;
  const cur = files.find((f) => f.file === selected) ?? files.at(-1);
  const last = cur.versions.at(-1);
  const prev = cur.versions.at(-2);
  const { added } = changedLines(prev?.text ?? null, last.text);
  const lines = last.text.split('\n');
  const width = String(lines.length).length;
  return `<div class="code-split">
    <div class="code-files" role="listbox">${files.map((f) => `<button class="code-file ${f === cur ? 'active' : ''}" data-code-file="${escapeHtml(f.file)}" role="option" aria-selected="${f === cur}" title="${escapeHtml(f.file)}">${icon('file')}<span class="ell">${escapeHtml(f.file)}</span><small class="code-ver">v${f.versions.length}</small>${f.fresh ? `<small class="code-new">${escapeHtml(t('code.new'))}</small>` : `<small class="code-plus">+${f.added}</small><small class="code-minus">−${f.removed}</small>`}</button>`).join('')}</div>
    <div class="code-view">
      <div class="code-head">${icon('code')}<b class="ell">${escapeHtml(cur.file)}</b><span class="muted">${escapeHtml(t('code.versionOf', { n: cur.versions.length }))}${prev ? ` · ${escapeHtml(t('code.changed', { n: added.size }))}` : ''}</span><span class="grow"></span><button class="small-button" data-code-copy="${escapeHtml(cur.file)}">${icon('copy')}<span>${escapeHtml(t('code.copy'))}</span></button></div>
      <pre class="code-body" tabindex="0">${lines.map((l, i) => `<span class="code-line ${prev && added.has(i + 1) ? 'changed' : ''}"><i>${String(i + 1).padStart(width, ' ')}</i>${escapeHtml(l) || ' '}</span>`).join('')}</pre>
    </div>
  </div>`;
}
