// Workflow editor: per workflow the statuses and transitions as a diagram (status boxes you can drag, arrows,
// "from any" transitions, the initial status) and as a table; transitions are added / edited with their rules
// (conditions, validators, post functions — ARCHITECTURE §3.4) in a structured editor. Box positions are kept
// per workflow in localStorage (the workflow row has no layout column).
import { tr, esc, icon, btn, ibtn, select, input, textarea, card, note, userOptions, CATEGORY_ICON } from '../util.js';
import { table, bindTables } from './collection.js';
import { jqlInput, bindJql } from './jql.js';

export const RULES = {
  conditions: { onlyAssignee: [], onlyReporter: [], projectRole: ['role'], subtasksDone: [], jql: ['jql', 'message'] },
  validators: { fieldRequired: ['field', 'message'], commentRequired: ['message'], jql: ['jql', 'message'] },
  postFunctions: { assignToCurrentUser: [], assignToReporter: [], unassign: [], setResolution: ['resolutionId'], clearResolution: [], setField: ['field', 'value'], addLabel: ['label'], addComment: ['body'] },
};
const RULE_ICON = {
  onlyAssignee: 'user', onlyReporter: 'user', projectRole: 'key', subtasksDone: 'check', jql: 'search', fieldRequired: 'warning', commentRequired: 'comment',
  assignToCurrentUser: 'user', assignToReporter: 'user', unassign: 'close', setResolution: 'check', clearResolution: 'clear', setField: 'edit', addLabel: 'tag', addComment: 'comment',
};
const KIND_ICON = { conditions: 'lock', validators: 'warning', postFunctions: 'play' };
const REQUIRED_FIELDS = ['assignee', 'resolution', 'storyPoints', 'dueDate', 'description', 'priority', 'originalEstimate', 'labels', 'components', 'fixVersions'];
export const SET_FIELDS = ['priorityId', 'assigneeId', 'typeId', 'storyPoints', 'dueDate', 'startDate', 'description', 'summary', 'flagged', 'color'];
const FIELD_ICON = { assignee: 'user', assigneeId: 'user', resolution: 'check', storyPoints: 'percent', dueDate: 'calendar', startDate: 'calendar', description: 'notes', summary: 'notes', priority: 'sort', priorityId: 'sort', originalEstimate: 'clock', labels: 'tag', components: 'container', fixVersions: 'calendar', typeId: 'layers', flagged: 'flag', color: 'palette' };

const BOX_W = 156;
const BOX_H = 42;
const layoutKey = (wfId) => `myboard.workflowLayout.${wfId}`;
function loadLayout(wfId) { try { return JSON.parse(globalThis.localStorage?.getItem(layoutKey(wfId)) ?? '{}') ?? {}; } catch { return {}; } }
function saveLayout(wfId, layout) { try { globalThis.localStorage?.setItem(layoutKey(wfId), JSON.stringify(layout)); } catch { /* private window */ } }

/** Box positions: stored ones, the rest in columns by category (to do · in progress · done). */
export function layoutOf(statuses, stored = {}) {
  const out = {};
  const rows = { todo: 0, inprogress: 0, done: 0 };
  const col = { todo: 0, inprogress: 1, done: 2 };
  for (const s of statuses) {
    const c = s.category in col ? s.category : 'todo';
    const auto = { x: 70 + col[c] * 240, y: 26 + rows[c] * 86 };
    rows[c] += 1;
    out[s.id] = stored[s.id] && Number.isFinite(stored[s.id].x) ? { x: stored[s.id].x, y: stored[s.id].y } : auto;
  }
  return out;
}

const currentWorkflow = (S) => {
  const wfs = S.config.workflows;
  return wfs.find((w) => w.id === S.pending.wf) ?? wfs.find((w) => S.config.types.some((t) => t.workflowId === w.id)) ?? wfs[0] ?? null;
};
const statusName = (S, id) => S.config.statuses.find((s) => s.id === id)?.name ?? '?';
const ruleCount = (rules) => ['conditions', 'validators', 'postFunctions'].reduce((n, k) => n + (rules?.[k]?.length ?? 0), 0);

// ───────────────────────── the diagram

const trim = (text, n = 20) => (String(text).length > n ? `${String(text).slice(0, n - 1)}…` : String(text));

/** Point where the line from the box centre towards (dx, dy) leaves the box. */
function edgePoint(cx, cy, dx, dy, pad = 2) {
  const tx = dx ? (BOX_W / 2 + pad) / Math.abs(dx) : Infinity;
  const ty = dy ? (BOX_H / 2 + pad) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function diagramSvg(S, wf, layout) {
  const statuses = S.config.statuses;
  const transitions = wf.transitions ?? [];
  const xs = statuses.map((s) => layout[s.id].x);
  const ys = statuses.map((s) => layout[s.id].y);
  const width = Math.max(560, ...xs.map((x) => x + BOX_W + 40));
  const height = Math.max(160, ...ys.map((y) => y + BOX_H + 50));
  const center = (id) => ({ x: layout[id].x + BOX_W / 2, y: layout[id].y + BOX_H / 2 });
  const edges = [];
  const anyByTarget = {};
  for (const t of transitions) {
    if (!layout[t.toStatusId]) continue;
    if (!t.fromStatusId) { (anyByTarget[t.toStatusId] ??= []).push(t); continue; }
    if (!layout[t.fromStatusId]) continue;
    const a = center(t.fromStatusId);
    const b = center(t.toStatusId);
    const selected = S.pending.trDraft?.id === t.id;
    if (t.fromStatusId === t.toStatusId) {
      const x = layout[t.fromStatusId].x + BOX_W - 24; const y = layout[t.fromStatusId].y;
      edges.push(`<g class="ps-wf-edge ${selected ? 'selected' : ''}" data-tr="${esc(t.id)}"><path d="M${x} ${y} c 0 -30 30 -30 30 0" marker-end="url(#ps-arrow)"/><text x="${x + 15}" y="${y - 26}" text-anchor="middle">${esc(trim(t.name, 16))}</text></g>`);
      continue;
    }
    const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
    const reverse = transitions.some((o) => o.fromStatusId === t.toStatusId && o.toStatusId === t.fromStatusId);
    const nx = reverse ? (-dy / len) * 8 : 0; const ny = reverse ? (dx / len) * 8 : 0;
    const p1 = edgePoint(a.x + nx, a.y + ny, dx, dy, 1);
    const p2 = edgePoint(b.x + nx, b.y + ny, -dx, -dy, 5);
    const mx = (p1.x + p2.x) / 2 + nx * 1.4; const my = (p1.y + p2.y) / 2 + ny * 1.4;
    const label = trim(t.name, 18);
    const w = Math.max(30, label.length * 6.6 + 12);
    const rules = ruleCount(t.rules);
    edges.push(`<g class="ps-wf-edge ${selected ? 'selected' : ''}" data-tr="${esc(t.id)}"><title>${esc(`${t.name}: ${statusName(S, t.fromStatusId)} → ${statusName(S, t.toStatusId)}`)}</title>
      <path d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" marker-end="url(#ps-arrow)"/>
      <rect class="ps-wf-label" x="${(mx - w / 2).toFixed(1)}" y="${(my - 10).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="6"/>
      <text x="${mx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle">${esc(label)}${rules ? ` ⚙${rules}` : ''}</text></g>`);
  }
  const anys = Object.entries(anyByTarget).map(([target, list]) => {
    const { x, y } = layout[target];
    const cx = x - 30; const cy = y + BOX_H / 2;
    const names = list.map((t) => t.name).join(', ');
    return `<g class="ps-wf-any" data-tr="${esc(list[0].id)}"><title>${esc(tr('wf.fromAnyTitle', { names, to: statusName(S, target) }))}</title>
      <circle cx="${cx}" cy="${cy}" r="10"/><text x="${cx}" y="${cy + 4}" text-anchor="middle">*</text>
      <path d="M${cx + 10} ${cy} L${x - 4} ${cy}" marker-end="url(#ps-arrow)"/></g>`;
  }).join('');
  const nodes = statuses.map((s) => {
    const { x, y } = layout[s.id];
    const initial = wf.initialStatusId === s.id;
    const selected = S.pending.wfSel === s.id;
    return `<g class="ps-wf-node cat-${esc(s.category)} ${selected ? 'selected' : ''} ${initial ? 'initial' : ''}" data-status="${esc(s.id)}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${esc(s.name)}">
      <title>${esc(`${s.name} · ${tr(`category.${s.category}`)}${initial ? ` · ${tr('wf.initial')}` : ''}`)}</title>
      <rect width="${BOX_W}" height="${BOX_H}" rx="9" style="--sc:${esc(s.color || '#888')}"/><rect class="ps-wf-stripe" width="6" height="${BOX_H}" rx="3" style="fill:${esc(s.color || '#888')}"/>
      ${initial ? `<path class="ps-wf-start" d="M-22 ${BOX_H / 2 - 7} l12 7 l-12 7 z"/>` : ''}
      <text x="${BOX_W / 2 + 3}" y="${BOX_H / 2 + 5}" text-anchor="middle">${esc(trim(s.name))}</text></g>`;
  }).join('');
  return `<svg class="ps-wf-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(tr('wf.diagram'))}">
    <defs><marker id="ps-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ps-wf-head"/></marker></defs>
    ${edges.join('')}${anys}${nodes}</svg>`;
}

// ───────────────────────── the rule editor

const ruleTypeOptions = (kind) => Object.keys(RULES[kind]).map((type) => ({ value: type, label: tr(`rule.${type}`), icon: RULE_ICON[type] ?? 'dot' }));

function paramControl(S, kind, rule, param, index) {
  const attrs = `data-rkind="${kind}" data-ridx="${index}" data-rparam="${param}"`;
  const roles = ['viewer', 'member', 'admin'].map((r) => ({ value: r, label: tr(`role.${r}`), icon: 'key' }));
  switch (param) {
    case 'role': return select(`r-${param}`, rule.role ?? 'admin', roles, { attrs, title: tr('rule.param.role'), glyph: 'key' });
    case 'jql': return jqlInput(`r-${param}`, rule.jql, { attrs });
    case 'message': return input(`r-${param}`, rule.message, { attrs, placeholder: tr('rule.param.message') });
    case 'label': return input(`r-${param}`, rule.label, { attrs, placeholder: tr('rule.param.label') });
    case 'body': return textarea(`r-${param}`, rule.body, { attrs, rows: 2, placeholder: tr('rule.param.body') });
    case 'resolutionId': return select(`r-${param}`, rule.resolutionId ?? S.config.resolutions[0]?.id ?? '', S.config.resolutions.map((r) => ({ value: r.id, label: r.name, icon: 'check' })), { attrs, title: tr('rule.param.resolution'), glyph: 'check' });
    case 'field': {
      const custom = S.config.fields.map((f) => ({ value: f.id, label: `${f.name} (${tr('fields.custom')})`, icon: 'field' }));
      const base = (kind === 'validators' ? REQUIRED_FIELDS : SET_FIELDS).map((f) => ({ value: f, label: tr(`fname.${f}`), icon: FIELD_ICON[f] ?? 'field' }));
      return select(`r-${param}`, rule.field ?? base[0].value, [...base, ...custom], { attrs, title: tr('rule.param.field'), glyph: 'field' });
    }
    case 'value': return valueControl(S, rule.field ?? SET_FIELDS[0], rule.value, attrs);
    default: return '';
  }
}

/** A value box that fits the field (priority / user / type dropdowns, a yes/no, else text). */
export function valueControl(S, field, value, attrs) {
  const v = value == null ? '' : String(value);
  if (field === 'priorityId') return select('r-value', v, [{ value: '', label: tr('common.none'), icon: 'close' }, ...S.config.priorities.map((p) => ({ value: p.id, label: p.name, icon: 'sort' }))], { attrs, title: tr('rule.param.value'), glyph: 'sort' });
  if (field === 'assigneeId') return select('r-value', v, userOptions(S.people, { none: tr('details.unassigned') }), { attrs, title: tr('rule.param.value'), glyph: 'user' });
  if (field === 'typeId') return select('r-value', v, S.config.types.map((x) => ({ value: x.id, label: x.name, icon: 'layers' })), { attrs, title: tr('rule.param.value'), glyph: 'layers' });
  if (field === 'flagged') return select('r-value', v === 'true' || v === '1' ? 'true' : 'false', [{ value: 'true', label: tr('common.yes'), icon: 'flag' }, { value: 'false', label: tr('common.no'), icon: 'close' }], { attrs, title: tr('rule.param.value'), glyph: 'flag' });
  if (field === 'dueDate' || field === 'startDate') return input('r-value', v, { type: 'date', attrs, title: tr('rule.param.value') });
  return input('r-value', v, { attrs, placeholder: tr('rule.param.value') });
}

function rulesEditor(S, rules) {
  return ['conditions', 'validators', 'postFunctions'].map((kind) => `<div class="ps-rules" data-rules="${kind}">
    <h4 class="ps-sub">${icon(KIND_ICON[kind])}<span>${esc(tr(`rules.${kind}`))}</span><small class="muted">${esc(tr(`rules.${kind}Hint`))}</small></h4>
    ${(rules[kind] ?? []).map((rule, i) => `<div class="ps-rule" data-rkind="${kind}" data-ridx="${i}">
      ${select('r-type', rule.type, ruleTypeOptions(kind), { attrs: `data-rkind="${kind}" data-ridx="${i}" data-rparam="type"`, title: tr('rule.type'), glyph: KIND_ICON[kind] })}
      <span class="ps-rule-params">${RULES[kind][rule.type]?.map((param) => paramControl(S, kind, rule, param, i)).join('') || `<span class="muted">${esc(tr(`rule.${rule.type}Text`))}</span>`}</span>
      ${ibtn('rule-delete', tr('common.delete'), 'trash', { cls: 'danger', attrs: `data-rkind="${kind}" data-ridx="${i}"` })}
    </div>`).join('') || `<div class="ps-empty small">${icon('info')}<span>${esc(tr('rules.none'))}</span></div>`}
    ${btn('rule-add', tr(`rules.add.${kind}`), 'plus', { attrs: `data-rkind="${kind}"` })}
  </div>`).join('');
}

const statusOptions = (S, { any = false } = {}) => [...(any ? [{ value: '', label: tr('wf.any'), icon: 'sparkles' }] : []), ...S.config.statuses.map((s) => ({ value: s.id, label: s.name, icon: CATEGORY_ICON[s.category] ?? 'flag' }))];

function draftEditor(S, draft) {
  return card(draft.id ? tr('wf.editTransition', { name: draft.name || '' }) : tr('wf.newTransition'), 'routeOrtho', `<div class="ps-form">
      <div class="ps-row"><div class="ps-row-label">${icon('edit')}<span>${esc(tr('col.name'))}</span></div><div class="ps-row-control">${input('d-name', draft.name, { attrs: 'data-dfield="name"', placeholder: tr('wf.transitionName'), disabled: !S.canEdit })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('arrowStart')}<span>${esc(tr('wf.from'))}</span></div><div class="ps-row-control">${select('d-from', draft.fromStatusId ?? '', statusOptions(S, { any: true }), { attrs: 'data-dfield="fromStatusId"', title: tr('wf.from'), glyph: 'flag', disabled: !S.canEdit })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('arrowEnd')}<span>${esc(tr('wf.to'))}</span></div><div class="ps-row-control">${select('d-to', draft.toStatusId ?? '', statusOptions(S), { attrs: 'data-dfield="toStatusId"', title: tr('wf.to'), glyph: 'flag', disabled: !S.canEdit })}</div></div>
    </div>
    ${rulesEditor(S, draft.rules)}
    <div class="ps-actions">${btn('draft-save', tr('common.save'), 'save', { cls: 'primary', disabled: !S.canEdit })}${btn('draft-cancel', tr('common.cancel'), 'close')}</div>`, { cls: 'ps-draft', attrs: 'data-draft' });
}

// ───────────────────────── the section

export const workflowSection = {
  id: 'workflow', glyph: 'routeOrtho',
  render(S) {
    const wf = currentWorkflow(S);
    const wfs = S.config.workflows;
    if (!wf) return `${note(tr('wf.none'))}${newWorkflowLine(S)}`;
    const layout = layoutOf(S.config.statuses, loadLayout(wf.id));
    const usedBy = S.config.types.filter((t) => t.workflowId === wf.id);
    const sel = S.pending.wfSel && S.config.statuses.find((s) => s.id === S.pending.wfSel);
    const transitions = (wf.transitions ?? []).map((t) => ({ ...t }));
    return `<div class="ps-toolbar">
        ${select('wf-pick', wf.id, wfs.map((w) => ({ value: w.id, label: w.name, icon: 'routeOrtho' })), { title: tr('wf.pick'), glyph: 'routeOrtho', disabled: wfs.length < 2 })}
        ${input('wf-name', wf.name, { attrs: 'data-wf="name"', placeholder: tr('wf.name'), disabled: !S.canEdit })}
        <label class="ps-mini">${icon('play')}<span>${esc(tr('wf.initial'))}</span>${select('wf-initial', wf.initialStatusId ?? '', statusOptions(S), { attrs: 'data-wf="initialStatusId"', title: tr('wf.initial'), glyph: 'play', disabled: !S.canEdit })}</label>
        <span class="grow"></span>
        ${btn('wf-delete', tr('wf.delete'), 'trash', { cls: 'danger', disabled: !S.canEdit })}
      </div>
      <p class="ps-p muted">${esc(usedBy.length ? tr('wf.usedBy', { types: usedBy.map((t) => t.name).join(', ') }) : tr('wf.unused'))}</p>
      ${S.pending.wfDelete ? wfDeleteConfirm(S, wf, usedBy) : ''}
      ${card(tr('wf.diagram'), 'diagram', `<div class="ps-wf-bar">${sel ? `<span class="ps-chip">${icon('flag')}<span>${esc(sel.name)}</span></span>${btn('tr-new-from', tr('wf.newFrom', { name: sel.name }), 'plus', { disabled: !S.canEdit })}${btn('tr-new-to', tr('wf.newTo', { name: sel.name }), 'arrowEnd', { disabled: !S.canEdit })}` : `<span class="muted">${esc(tr('wf.diagramHint'))}</span>`}<span class="grow"></span>${btn('wf-autolayout', tr('wf.autoLayout'), 'autoArrange')}</div>
        <div class="ps-wf-canvas" data-wf-canvas="${esc(wf.id)}">${diagramSvg(S, wf, layout)}</div>
        <div class="ps-wf-legend">${['todo', 'inprogress', 'done'].map((c) => `<span class="ps-chip cat-${c}">${icon(CATEGORY_ICON[c])}<span>${esc(tr(`category.${c}`))}</span></span>`).join('')}<span class="ps-chip">${icon('sparkles')}<span>${esc(tr('wf.anyLegend'))}</span></span></div>`)}
      ${S.pending.trDraft ? draftEditor(S, S.pending.trDraft) : ''}
      ${card(tr('wf.transitions'), 'table', `${table(S, {
        kind: 'transitions', rows: transitions,
        cols: [
          { head: tr('col.name'), width: 'minmax(120px, 1.2fr)', cell: (t, e) => input('name', t.name, { disabled: !e, placeholder: tr('col.name') }) },
          { head: tr('wf.from'), width: 'minmax(130px, 1fr)', cell: (t, e) => select('fromStatusId', t.fromStatusId ?? '', statusOptions(S, { any: true }), { disabled: !e, attrs: 'data-empty-null', title: tr('wf.from'), glyph: 'flag' }) },
          { head: tr('wf.to'), width: 'minmax(130px, 1fr)', cell: (t, e) => select('toStatusId', t.toStatusId, statusOptions(S), { disabled: !e, title: tr('wf.to'), glyph: 'flag' }) },
          { head: tr('wf.rules'), width: '92px', cell: (t) => `<span class="ps-chip ${ruleCount(t.rules) ? 'ok' : ''}" title="${esc(tr('wf.rulesTitle', { c: t.rules?.conditions?.length ?? 0, v: t.rules?.validators?.length ?? 0, p: t.rules?.postFunctions?.length ?? 0 }))}">${icon('gear')}<span>${ruleCount(t.rules)}</span></span>` },
          { head: '', width: '34px', cell: (t) => ibtn('tr-edit', tr('wf.editRules'), 'edit') },
        ],
        emptyText: tr('wf.noTransitions'),
      })}<div class="ps-actions">${btn('tr-new', tr('wf.addTransition'), 'plus', { cls: 'primary', disabled: !S.canEdit })}</div>`)}
      ${newWorkflowLine(S)}`;
  },
  bind(S, el) {
    const wf = currentWorkflow(S);
    bindJql(S, el);
    if (!wf) { bindNewWorkflow(S, el); return; }
    const findT = (id) => (wf.transitions ?? []).find((t) => t.id === id);
    bindTables(S, el, { transitions: { find: findT, remove: (id) => S.api.del(S.url('transitions', id)) } });
    bindNewWorkflow(S, el);
    const openDraft = (t, preset = {}) => {
      S.pending.trDraft = t
        ? { id: t.id, rev: t.rev, name: t.name, fromStatusId: t.fromStatusId ?? null, toStatusId: t.toStatusId, rules: structuredClone({ conditions: [], validators: [], postFunctions: [], ...(t.rules ?? {}) }) }
        : { id: null, name: '', fromStatusId: null, toStatusId: S.config.statuses[0]?.id ?? null, rules: { conditions: [], validators: [], postFunctions: [] }, ...preset };
      S.render();
      el.ownerDocument.querySelector('[data-draft] [data-dfield="name"]')?.focus();
    };
    el.addEventListener('change', (event) => {
      const target = event.target;
      if (target.dataset.field === 'wf-pick') { S.pending.wf = target.value; S.pending.trDraft = null; S.pending.wfSel = null; S.render(); return; }
      if (target.dataset.wf) {
        const value = target.value;
        if (target.dataset.wf === 'name' && !value.trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        S.patch(tr('op.edit', { name: wf.name }), S.url('workflows', wf.id), wf, { [target.dataset.wf]: value || null });
        return;
      }
      const draft = S.pending.trDraft;
      if (!draft) return;
      if (target.dataset.dfield) { draft[target.dataset.dfield] = target.value || null; if (target.dataset.dfield !== 'name') S.render(); return; }
      if (target.dataset.rparam) updateRule(S, draft, target, true);
    });
    el.addEventListener('input', (event) => {
      const draft = S.pending.trDraft;
      const target = event.target;
      if (!draft) return;
      if (target.dataset.dfield === 'name') draft.name = target.value;
      else if (target.dataset.rparam && target.tagName !== 'SELECT') updateRule(S, draft, target, false);
    });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      const edge = event.target.closest('[data-tr]');
      if (edge && !button) { openDraft(findT(edge.dataset.tr)); return; }
      if (!button || button.disabled) return;
      const draft = S.pending.trDraft;
      switch (button.dataset.act) {
        case 'tr-new': openDraft(null); break;
        case 'tr-new-from': openDraft(null, { fromStatusId: S.pending.wfSel, toStatusId: S.config.statuses.find((s) => s.id !== S.pending.wfSel)?.id ?? S.pending.wfSel }); break;
        case 'tr-new-to': openDraft(null, { fromStatusId: null, toStatusId: S.pending.wfSel }); break;
        case 'tr-edit': openDraft(findT(button.closest('[data-id]').dataset.id)); break;
        case 'draft-cancel': S.pending.trDraft = null; S.render(); break;
        case 'rule-add': {
          const kind = button.dataset.rkind;
          const type = Object.keys(RULES[kind])[0];
          draft.rules[kind].push(defaultsFor(S, kind, { type }));
          S.render();
          break;
        }
        case 'rule-delete': draft.rules[button.dataset.rkind].splice(Number(button.dataset.ridx), 1); S.render(); break;
        case 'draft-save': await saveDraft(S, wf, draft); break;
        case 'wf-autolayout': saveLayout(wf.id, {}); S.render(); break;
        case 'wf-delete': S.pending.wfDelete = true; S.render(); break;
        case 'wf-delete-cancel': S.pending.wfDelete = false; S.render(); break;
        case 'wf-delete-do': {
          const target = el.querySelector('[data-field="wf-move-to"]')?.value;
          S.pending.wfDelete = false;
          await S.run(async () => {
            if (target) for (const type of S.config.types.filter((t) => t.workflowId === wf.id)) await S.api.patch(S.url('types', type.id), { workflowId: target, rev: type.rev });
            await S.api.del(S.url('workflows', wf.id));
            S.pending.wf = target || null;
          }, { ok: tr('wf.deleted', { name: wf.name }) });
          break;
        }
        default:
      }
    });
    bindDiagram(S, el, wf);
  },
};

function defaultsFor(S, kind, rule) {
  const out = { type: rule.type };
  for (const param of RULES[kind][rule.type] ?? []) {
    if (param === 'role') out.role = 'admin';
    if (param === 'field') out.field = kind === 'validators' ? REQUIRED_FIELDS[0] : SET_FIELDS[0];
    if (param === 'resolutionId') out.resolutionId = S.config.resolutions[0]?.id ?? null;
    if (param === 'jql' || param === 'label' || param === 'body') out[param] = '';
    if (param === 'value') out.value = '';
  }
  return out;
}

function updateRule(S, draft, target, rerender) {
  const kind = target.dataset.rkind;
  const index = Number(target.dataset.ridx);
  const param = target.dataset.rparam;
  const rule = draft.rules[kind][index];
  if (!rule) return;
  if (param === 'type') { draft.rules[kind][index] = defaultsFor(S, kind, { type: target.value }); S.render(); return; }
  let value = target.value;
  if (param === 'value' && rule.field === 'flagged') value = value === 'true';
  if (param === 'value' && rule.field === 'storyPoints' && value !== '') value = Number(value);
  rule[param] = value;
  if (param === 'field') { rule.value = ''; if (rerender) S.render(); }
}

/** The rules as the core takes them: empty optional texts dropped. */
export function cleanRules(rules) {
  const out = {};
  for (const kind of ['conditions', 'validators', 'postFunctions']) {
    out[kind] = (rules[kind] ?? []).map((rule) => Object.fromEntries(Object.entries(rule).filter(([k, v]) => k === 'type' || k === 'value' || (v !== '' && v != null))));
  }
  return out;
}

async function saveDraft(S, wf, draft) {
  if (!String(draft.name ?? '').trim()) { S.say('danger', tr('wf.nameRequired')); S.render(); return; }
  if (!draft.toStatusId) { S.say('danger', tr('wf.toRequired')); S.render(); return; }
  const missingJql = ['conditions', 'validators'].some((k) => draft.rules[k].some((r) => r.type === 'jql' && !String(r.jql ?? '').trim()));
  if (missingJql) { S.say('danger', tr('wf.jqlRequired')); S.render(); return; }
  const body = { name: draft.name.trim(), fromStatusId: draft.fromStatusId || null, toStatusId: draft.toStatusId, rules: cleanRules(draft.rules) };
  const done = await S.run(async () => {
    if (draft.id) return S.api.patch(S.url('transitions', draft.id), { ...body, rev: draft.rev });
    return S.api.post(S.url('transitions'), { ...body, workflowId: wf.id });
  }, { ok: tr('wf.saved', { name: body.name }) });
  if (done) { S.pending.trDraft = null; S.render(); }
}

function wfDeleteConfirm(S, wf, usedBy) {
  const others = S.config.workflows.filter((w) => w.id !== wf.id);
  return `<div class="ps-confirm">${icon('warning')}<span class="ps-confirm-text">${esc(usedBy.length ? tr('wf.deleteUsed', { name: wf.name, count: usedBy.length }) : tr('del.ask', { name: wf.name }))}</span>
    ${usedBy.length && others.length ? select('wf-move-to', others[0].id, others.map((w) => ({ value: w.id, label: w.name, icon: 'routeOrtho' })), { title: tr('del.replaceWith'), glyph: 'replace' }) : ''}
    <span class="grow"></span>${btn('wf-delete-do', tr('common.delete'), 'trash', { cls: 'danger primary', disabled: Boolean(usedBy.length && !others.length) })}${btn('wf-delete-cancel', tr('common.cancel'), 'close')}</div>`;
}

const newWorkflowLine = (S) => `<div class="ps-add" data-add="workflows">${input('new-workflow', '', { placeholder: tr('wf.newName'), attrs: 'data-new="workflow"', disabled: !S.canEdit })}${btn('wf-create', tr('wf.create'), 'plus', { disabled: !S.canEdit })}</div>`;

function bindNewWorkflow(S, el) {
  el.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act="wf-create"]');
    if (!button || button.disabled) return;
    const name = el.querySelector('[data-new="workflow"]').value.trim();
    if (!name) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
    await S.run(async () => {
      const row = await S.api.post(S.url('workflows'), { name, initialStatusId: S.config.statuses[0]?.id ?? null });
      S.pending.wf = row?.id ?? null;
      return row;
    }, { ok: tr('created', { name }) });
  });
}

/** Status boxes: drag to move (positions saved), click to select. */
function bindDiagram(S, el, wf) {
  const canvas = el.querySelector('[data-wf-canvas]');
  if (!canvas) return;
  canvas.addEventListener('pointerdown', (event) => {
    const node = event.target.closest('.ps-wf-node');
    if (!node || event.button !== 0) return;
    event.preventDefault();
    const id = node.dataset.status;
    const stored = loadLayout(wf.id);
    const layout = layoutOf(S.config.statuses, stored);
    const start = { x: event.clientX, y: event.clientY, ox: layout[id].x, oy: layout[id].y };
    let moved = false;
    const svgOf = () => canvas.querySelector('svg');
    const move = (e) => {
      const dx = e.clientX - start.x; const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      layout[id] = { x: Math.max(40, Math.round((start.ox + dx) / 2) * 2), y: Math.max(8, Math.round((start.oy + dy) / 2) * 2) };
      const scroll = { left: canvas.scrollLeft, top: canvas.scrollTop };
      canvas.innerHTML = diagramSvg(S, wf, layout);
      Object.assign(canvas, { scrollLeft: scroll.left, scrollTop: scroll.top });
      svgOf()?.querySelector(`[data-status="${CSS.escape(id)}"]`)?.classList.add('dragging');
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (moved) { saveLayout(wf.id, layout); return; }
      S.pending.wfSel = S.pending.wfSel === id ? null : id;
      S.render();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  });
  canvas.addEventListener('keydown', (event) => {
    const node = event.target.closest?.('.ps-wf-node');
    if (!node) return;
    const step = event.shiftKey ? 20 : 4;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); S.pending.wfSel = node.dataset.status; S.render(); return; }
    if (!d) return;
    event.preventDefault();
    const layout = layoutOf(S.config.statuses, loadLayout(wf.id));
    const id = node.dataset.status;
    layout[id] = { x: Math.max(40, layout[id].x + d[0]), y: Math.max(8, layout[id].y + d[1]) };
    saveLayout(wf.id, layout);
    canvas.innerHTML = diagramSvg(S, wf, layout);
    canvas.querySelector(`[data-status="${CSS.escape(id)}"]`)?.focus();
  });
}
