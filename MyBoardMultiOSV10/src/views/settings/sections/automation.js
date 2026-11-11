// Automation rules (ARCHITECTURE §3.4): the list (enable / disable, run now with { matched, acted, errors },
// runs, last run, last error) and the rule editor (trigger incl. scheduled, JQL conditions, actions).
import { tr, esc, icon, btn, ibtn, select, input, textarea, checkbox, card, note, stepper, dateTime, userOptions, CATEGORY_ICON } from '../util.js';
import { bindSteppers } from '../../../stepper.js';
import { table, bindTables } from './collection.js';
import { jqlInput, bindJql } from './jql.js';
import { SET_FIELDS, valueControl } from './workflow.js';

export const TRIGGERS = ['issue.created', 'issue.transitioned', 'issue.updated', 'comment.created', 'scheduled', 'manual'];
const TRIGGER_ICON = { 'issue.created': 'plus', 'issue.transitioned': 'routeOrtho', 'issue.updated': 'edit', 'comment.created': 'comment', scheduled: 'clock', manual: 'play' };
export const ACTIONS = ['transition', 'assign', 'setField', 'comment', 'addLabel', 'removeLabel'];
const ACTION_ICON = { transition: 'routeOrtho', assign: 'user', setField: 'edit', comment: 'comment', addLabel: 'tag', removeLabel: 'tag' };
const HISTORY_FIELDS = ['status', 'assignee', 'priority', 'type', 'summary', 'description', 'labels', 'storyPoints', 'dueDate', 'resolution', 'epic', 'fixVersions', 'components', 'flagged'];
const tkey = (type) => type.replace('.', '_');

const blankRule = (S) => ({ id: null, name: '', enabled: true, trigger: { type: 'issue.created' }, conditions: [], actions: [{ type: 'comment', body: '' }] });

function summary(S, rule) {
  const t = rule.trigger ?? {};
  const st = (id) => S.config.statuses.find((s) => s.id === id)?.name ?? tr('wf.any');
  let text = tr(`trigger.${tkey(t.type ?? 'manual')}`);
  if (t.type === 'issue.transitioned') text += ` (${st(t.fromStatusId)} → ${st(t.toStatusId)})`;
  if (t.type === 'scheduled') text += ` · ${tr('auto.every', { n: t.everyMinutes ?? '?' })}`;
  return text;
}

export const automationSection = {
  id: 'automation', glyph: 'sparkles',
  render(S) {
    const rules = S.data.rules ?? [];
    const result = (rule) => {
      const r = S.pending.runResult;
      if (!r || r.id !== rule.id) return '';
      const errors = r.result?.errors ?? [];
      return `<div class="ps-run-result ${errors.length ? 'warn' : 'ok'}" data-run-result="${esc(rule.id)}">${icon(errors.length ? 'warning' : 'check')}<span>${esc(tr('auto.result', { matched: r.result?.matched ?? 0, acted: r.result?.acted ?? 0, errors: Array.isArray(errors) ? errors.length : Number(errors) || 0 }))}</span>
        ${Array.isArray(errors) && errors.length ? `<ul>${errors.slice(0, 5).map((x) => `<li>${esc(typeof x === 'string' ? x : `${x.key ?? x.issueId ?? ''} ${x.message ?? x.code ?? ''}`)}</li>`).join('')}</ul>` : ''}</div>`;
    };
    return `${table(S, {
      kind: 'automation', rows: rules, extra: result,
      cols: [
        { head: tr('auto.on'), width: '56px', cell: (r, e) => `<label class="ps-switch" title="${esc(tr(r.enabled ? 'auto.disable' : 'auto.enable'))}"><input type="checkbox" data-field="enabled" ${r.enabled ? 'checked' : ''} ${e ? '' : 'disabled'} aria-label="${esc(tr('auto.on'))}" /><i></i></label>` },
        { head: tr('col.name'), width: 'minmax(130px, 1.3fr)', cell: (r) => `<span class="ps-user"><b>${esc(r.name)}</b><small>${icon(TRIGGER_ICON[r.trigger?.type] ?? 'sparkles')} ${esc(summary(S, r))}</small></span>` },
        { head: tr('auto.runs'), width: '64px', cell: (r) => `<span class="ps-num">${Number(r.runCount ?? 0)}</span>` },
        { head: tr('auto.lastRun'), width: 'minmax(120px, 0.9fr)', cell: (r) => `<span class="ps-user"><span>${esc(r.lastRunAt ? dateTime(r.lastRunAt) : tr('auto.never'))}</span>${r.lastError ? `<small class="danger-text" title="${esc(r.lastError)}">${icon('error')} ${esc(String(r.lastError).slice(0, 60))}</small>` : ''}</span>` },
        { head: '', width: '34px', cell: (r, e) => ibtn('rule-run', tr('auto.runNow'), 'play', { disabled: !e }) },
        { head: '', width: '34px', cell: () => ibtn('rule-edit', tr('auto.edit'), 'edit') },
      ],
      emptyText: tr('auto.none'),
    })}
    <div class="ps-actions">${btn('rule-new', tr('auto.new'), 'plus', { cls: 'primary', disabled: !S.canEdit })}</div>
    ${S.pending.ruleDraft ? ruleEditor(S, S.pending.ruleDraft) : note(tr('auto.hint'))}`;
  },
  bind(S, el) {
    const rules = () => S.data.rules ?? [];
    const findR = (id) => rules().find((r) => r.id === id);
    bindJql(S, el);
    bindTables(S, el, {
      automation: {
        find: findR,
        onField: (r, name, value) => S.patch(tr(value ? 'auto.enabledOp' : 'auto.disabledOp', { name: r.name }), S.url('automation', r.id), r, { enabled: Boolean(value) }),
        remove: (id) => S.api.del(S.url('automation', id)),
      },
    });
    bindSteppers(el, (key, value) => { if (key === 'everyMinutes' && S.pending.ruleDraft) S.pending.ruleDraft.trigger.everyMinutes = value; });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const draft = S.pending.ruleDraft;
      const id = button.closest('[data-id]')?.dataset.id;
      switch (button.dataset.act) {
        case 'rule-new': S.pending.ruleDraft = blankRule(S); S.render(); break;
        case 'rule-edit': { const r = findR(id); S.pending.ruleDraft = structuredClone({ id: r.id, rev: r.rev, name: r.name, enabled: r.enabled, trigger: r.trigger ?? { type: 'manual' }, conditions: r.conditions ?? [], actions: r.actions ?? [] }); S.render(); break; }
        case 'rule-run': {
          const r = findR(id);
          try {
            const result = await S.api.post(`${S.url('automation', r.id)}/run`, {});
            S.pending.runResult = { id: r.id, result };
            S.say('success', tr('auto.ran', { name: r.name }));
          } catch (error) { S.pending.runResult = null; S.fail(error); return; }
          await S.refresh();
          break;
        }
        case 'cond-add': draft.conditions.push({ jql: '' }); S.render(); break;
        case 'cond-delete': draft.conditions.splice(Number(button.dataset.idx), 1); S.render(); break;
        case 'action-add': draft.actions.push({ type: 'comment', body: '' }); S.render(); break;
        case 'action-delete': draft.actions.splice(Number(button.dataset.idx), 1); S.render(); break;
        case 'rule-cancel': S.pending.ruleDraft = null; S.render(); break;
        case 'rule-save': await saveRule(S, draft); break;
        default:
      }
    });
    const update = (target, rerender) => {
      const draft = S.pending.ruleDraft;
      if (!draft) return;
      const d = target.dataset;
      if (d.rf === 'name') draft.name = target.value;
      else if (d.rf === 'enabled') draft.enabled = target.checked;
      else if (d.rf === 'trigger') { draft.trigger = { type: target.value, ...(target.value === 'scheduled' ? { everyMinutes: 60 } : {}) }; if (rerender) S.render(); } else if (d.tf) {
        if (d.tf === 'fields') draft.trigger.fields = [...el.querySelectorAll('[data-tf="fields"]')].filter((x) => x.checked).map((x) => x.value);
        else draft.trigger[d.tf] = target.value || undefined;
      } else if (d.cond != null) draft.conditions[Number(d.cond)].jql = target.value;
      else if (d.ai != null && d.af) {
        const a = draft.actions[Number(d.ai)];
        if (d.af === 'type') { draft.actions[Number(d.ai)] = defaultAction(S, target.value); if (rerender) S.render(); return; }
        let value = target.value;
        if (a.type === 'assign' && d.af === 'userId') value = value === '' ? null : value;
        if (d.af === 'field') { a.field = value; a.value = ''; if (rerender) S.render(); return; }
        if (d.af === 'value' && a.field === 'flagged') value = value === 'true';
        if (d.af === 'value' && a.field === 'storyPoints' && value !== '') value = Number(value);
        a[d.af] = value;
      }
    };
    el.addEventListener('change', (event) => update(event.target, true));
    el.addEventListener('input', (event) => { if (event.target.tagName !== 'SELECT' && event.target.type !== 'checkbox') update(event.target, false); });
  },
};

function defaultAction(S, type) {
  switch (type) {
    case 'transition': return { type, statusId: S.config.statuses[0]?.id ?? null };
    case 'assign': return { type, userId: 'reporter' };
    case 'setField': return { type, field: 'priorityId', value: S.config.priorities[0]?.id ?? '' };
    case 'comment': return { type, body: '' };
    default: return { type, label: '' };
  }
}

function actionParams(S, a, i) {
  const attrs = (field) => `data-ai="${i}" data-af="${field}"`;
  const fix = (html) => html;
  switch (a.type) {
    case 'transition': return fix(select('a-status', a.statusId ?? '', S.config.statuses.map((s) => ({ value: s.id, label: s.name, icon: CATEGORY_ICON[s.category] ?? 'flag' })), { attrs: attrs('statusId'), title: tr('auto.toStatus'), glyph: 'flag' }));
    case 'assign': return fix(select('a-user', a.userId ?? '', userOptions(S.people, { none: tr('details.unassigned'), extra: [{ value: 'reporter', label: tr('auto.reporter'), icon: 'user' }, { value: 'currentUser', label: tr('auto.currentUser'), icon: 'user' }] }), { attrs: attrs('userId'), title: tr('auto.assignTo'), glyph: 'user' }));
    case 'setField': {
      const fields = [...SET_FIELDS.map((f) => ({ value: f, label: tr(`fname.${f}`), icon: 'edit' })), ...S.config.fields.map((f) => ({ value: `custom:${f.id}`, label: `${f.name} (${tr('fields.custom')})`, icon: 'field' }))];
      return fix(`${select('a-field', a.field ?? 'priorityId', fields, { attrs: attrs('field'), title: tr('rule.param.field'), glyph: 'field' })}${valueControl(S, a.field, a.value, attrs('value'))}`);
    }
    case 'comment': return fix(textarea('a-body', a.body, { rows: 2, attrs: attrs('body'), placeholder: tr('auto.commentPlaceholder') }));
    default: return fix(input('a-label', a.label, { attrs: attrs('label'), placeholder: tr('rule.param.label') }));
  }
}

function ruleEditor(S, draft) {
  const t = draft.trigger ?? { type: 'manual' };
  const statuses = [{ value: '', label: tr('wf.any'), icon: 'sparkles' }, ...S.config.statuses.map((s) => ({ value: s.id, label: s.name, icon: CATEGORY_ICON[s.category] ?? 'flag' }))];
  let triggerParams = '';
  if (t.type === 'issue.transitioned') {
    triggerParams = `<label class="ps-mini">${esc(tr('wf.from'))}${select('t-from', t.fromStatusId ?? '', statuses, { attrs: 'data-tf="fromStatusId"', title: tr('wf.from'), glyph: 'flag' })}</label><label class="ps-mini">${esc(tr('wf.to'))}${select('t-to', t.toStatusId ?? '', statuses, { attrs: 'data-tf="toStatusId"', title: tr('wf.to'), glyph: 'flag' })}</label>`;
  } else if (t.type === 'issue.updated') {
    triggerParams = `<div class="ps-checkgrid">${HISTORY_FIELDS.map((f) => `<label class="ps-check"><input type="checkbox" data-tf="fields" value="${f}" ${(t.fields ?? []).includes(f) ? 'checked' : ''} /><span>${esc(tr(`hfield.${f}`))}</span></label>`).join('')}</div><div class="ps-hint">${esc(tr('auto.fieldsHint'))}</div>`;
  } else if (t.type === 'scheduled' || t.type === 'manual') {
    triggerParams = `${t.type === 'scheduled' ? `<label class="ps-mini">${esc(tr('auto.everyMinutes'))}${stepper('everyMinutes', t.everyMinutes ?? 60, { min: 1, max: 10080, step: 1, unit: tr('unit.min'), label: tr('auto.everyMinutes') })}</label>` : ''}
      <div class="ps-mini wide">${esc(tr('auto.whichIssues'))}${jqlInput('t-jql', t.jql, { attrs: 'data-tf="jql"', placeholder: tr('auto.whichPlaceholder') })}</div>`;
  }
  return card(draft.id ? tr('auto.editTitle', { name: draft.name }) : tr('auto.newTitle'), 'sparkles', `<div class="ps-form">
      <div class="ps-row"><div class="ps-row-label">${icon('edit')}<span>${esc(tr('col.name'))}</span></div><div class="ps-row-control">${input('r-name', draft.name, { attrs: 'data-rf="name"', placeholder: tr('auto.namePlaceholder') })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('check')}<span>${esc(tr('auto.on'))}</span></div><div class="ps-row-control">${checkbox('r-enabled', draft.enabled, tr('auto.enabledText'), { attrs: 'data-rf="enabled"' })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('sparkles')}<span>${esc(tr('auto.trigger'))}</span></div><div class="ps-row-control">${select('r-trigger', t.type, TRIGGERS.map((x) => ({ value: x, label: tr(`trigger.${tkey(x)}`), icon: TRIGGER_ICON[x] })), { attrs: 'data-rf="trigger"', title: tr('auto.trigger'), glyph: 'sparkles' })}<div class="ps-trigger-params">${triggerParams}</div></div></div>
    </div>
    <h4 class="ps-sub">${icon('filter')}<span>${esc(tr('auto.conditions'))}</span><small class="muted">${esc(tr('auto.conditionsHint'))}</small></h4>
    ${draft.conditions.map((c, i) => `<div class="ps-rule">${jqlInput('c-jql', c.jql, { attrs: `data-cond="${i}"` })}${ibtn('cond-delete', tr('common.delete'), 'trash', { cls: 'danger', attrs: `data-idx="${i}"` })}</div>`).join('') || `<div class="ps-empty small">${icon('info')}<span>${esc(tr('auto.noConditions'))}</span></div>`}
    ${btn('cond-add', tr('auto.addCondition'), 'plus')}
    <h4 class="ps-sub">${icon('play')}<span>${esc(tr('auto.actions'))}</span><small class="muted">${esc(tr('auto.actionsHint'))}</small></h4>
    ${draft.actions.map((a, i) => `<div class="ps-rule" data-action-row="${i}">${select('a-type', a.type, ACTIONS.map((x) => ({ value: x, label: tr(`action.${x}`), icon: ACTION_ICON[x] })), { attrs: `data-ai="${i}" data-af="type"`, title: tr('auto.actionType'), glyph: 'play' })}<span class="ps-rule-params">${actionParams(S, a, i)}</span>${ibtn('action-delete', tr('common.delete'), 'trash', { cls: 'danger', attrs: `data-idx="${i}"` })}</div>`).join('')}
    ${btn('action-add', tr('auto.addAction'), 'plus')}
    <div class="ps-actions">${btn('rule-save', tr('common.save'), 'save', { cls: 'primary', disabled: !S.canEdit })}${btn('rule-cancel', tr('common.cancel'), 'close')}</div>`, { cls: 'ps-draft', attrs: 'data-rule-draft' });
}

async function saveRule(S, draft) {
  if (!draft.name.trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
  if (!draft.actions.length) { S.say('danger', tr('err.INVALID_ACTIONS')); S.render(); return; }
  const trigger = Object.fromEntries(Object.entries(draft.trigger).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
  const body = { name: draft.name.trim(), enabled: draft.enabled, trigger, conditions: draft.conditions.filter((c) => String(c.jql ?? '').trim()), actions: draft.actions };
  const done = await S.run(() => (draft.id ? S.api.patch(S.url('automation', draft.id), { ...body, rev: draft.rev }) : S.api.post(S.url('automation'), body)), { ok: tr('auto.saved', { name: body.name }) });
  if (done) { S.pending.ruleDraft = null; S.render(); }
}
