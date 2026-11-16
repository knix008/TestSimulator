// The right panel's "Node" tab: the selected node's settings, drawn from its field list (core/nodes/defs.js),
// with a live preview of {{ expressions }} against the last run, a variable picker, and the node's last
// input / output. With nothing selected it shows the agent's own settings (name, variables, webhook, deploy).
import { nodeDef, COMMON_FIELDS, BUILTIN_TOOLS, categoryOf, label as L } from '../../core/nodes/defs.js';
import { render as renderExpr, toText, OPERATORS } from '../../core/expr.js';
import { PROVIDERS } from '../../core/providers/index.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { stepperHtml, bindSteppers } from '../stepper.js';
import { jsonView } from './jsonview.js';

/** The icon in front of a setting's name: by its key, else by its kind. */
const FIELD_ICONS = {
  model: 'sparkles', system: 'notes', prompt: 'chat', tools: 'plug', kbs: 'book', kb: 'book', memory: 'recent', memoryWindow: 'list', maxSteps: 'timeline',
  effort: 'speed', maxTokens: 'text', json: 'braces', schema: 'braces', input: 'text', categories: 'tag', instructions: 'notes', fields: 'list',
  query: 'search', topK: 'list', title: 'text', text: 'notes', conditions: 'filter', combine: 'branch', value: 'variable', cases: 'switch', items: 'list',
  max: 'list', mode: 'switch', values: 'variable', template: 'text', code: 'code', seconds: 'hourglass', message: 'chat', method: 'globe', url: 'web',
  headers: 'list', auth: 'key', body: 'braces', maxChars: 'text', agent: 'robot', op: 'file', path: 'folder', content: 'notes', command: 'terminal',
  cwd: 'folder', offsetDays: 'calendar', timeZone: 'globe', timeoutMinutes: 'clock', level: 'flag', status: 'server', color: 'palette', sample: 'braces',
  greeting: 'chat', minutes: 'clock', time: 'clock', weekday: 'calendar', cron: 'calendarClock', respond: 'send', retries: 'refresh', retryDelay: 'clock',
  timeout: 'hourglass', onError: 'warning', toolDescription: 'info',
};
const TYPE_ICONS = { text: 'text', textarea: 'notes', code: 'code', json: 'braces', number: 'percent', boolean: 'check', select: 'list', multiselect: 'tag', model: 'sparkles', credential: 'key', kb: 'book', agent: 'robot', list: 'list', kv: 'variable', conditions: 'filter' };
export const fieldIcon = (f) => FIELD_ICONS[f.key] ?? TYPE_ICONS[f.type] ?? 'dot';

const visible = (when, config) => !when || Object.entries(when).every(([k, want]) => {
  const v = config[k];
  if (Array.isArray(v)) return (Array.isArray(want) ? want : [want]).some((w) => v.includes(w));
  return (Array.isArray(want) ? want.map(String) : [String(want)]).includes(String(v));
});

export function createInspector(host, opts) {
  const { t } = opts;
  const lang = () => opts.lang();
  let current = null; // node id or null (agent)
  let previewTimer = null;

  const doc = () => opts.getDoc();
  const node = () => doc()?.nodes.find((n) => n.id === current) ?? null;

  function change(key, value, { rerender = false, label = null } = {}) {
    const id = current;
    opts.onChange(label ?? `${t('op.edit')}: ${key}`, (d) => {
      const n = d.nodes.find((x) => x.id === id);
      if (!n) return;
      if (key === '$name') n.name = String(value);
      else if (key === '$description') n.description = String(value);
      else n.config = { ...n.config, [key]: value };
    }, { coalesce: `${id}:${key}` });
    if (rerender) render(); else schedulePreview();
  }

  function changeAgent(key, value, { rerender = false } = {}) {
    opts.onChange(`${t('op.edit')}: ${key}`, (d) => { d[key] = value; }, { coalesce: `agent:${key}` });
    if (rerender) render();
  }

  // ───────────── fields

  function fieldHtml(f, config) {
    const value = config[f.key] ?? f.default;
    const id = `f-${f.key}`;
    const lbl = L(f.label, lang());
    const hint = f.hint ? `<small class="field-hint">${escapeHtml(L(f.hint, lang()))}</small>` : '';
    const exprTools = f.expr ? `<button type="button" class="icon-button field-vars" data-vars="${escapeHtml(f.key)}" title="${escapeHtml(t('inspector.insertVariable'))}">${icon('braces')}</button>` : '';
    const big = ['textarea', 'json', 'code'].includes(f.type) ? `<button type="button" class="icon-button field-expand" data-expand="${escapeHtml(f.key)}" title="${escapeHtml(t('inspector.expand'))}" aria-label="${escapeHtml(t('inspector.expand'))}">${icon('fullscreen')}</button>` : '';
    const head = `<label class="field-label" for="${id}">${icon(fieldIcon(f))}<span>${escapeHtml(lbl)}</span>${exprTools}${big}</label>`;
    const preview = f.expr ? `<div class="field-preview" data-preview="${escapeHtml(f.key)}"></div>` : '';
    const ph = f.placeholder ? `placeholder="${escapeHtml(L(f.placeholder, lang()))}"` : '';
    let control = '';
    switch (f.type) {
      case 'text':
        control = `<input id="${id}" type="text" class="field-input ${f.expr ? 'expr' : ''}" data-field="${f.key}" value="${escapeHtml(value)}" ${ph} spellcheck="false" />`;
        break;
      case 'textarea': case 'json': case 'code':
        control = `<textarea id="${id}" class="field-input ${f.type === 'textarea' ? '' : 'mono'} ${f.expr ? 'expr' : ''}" data-field="${f.key}" rows="${f.rows ?? 3}" ${ph} spellcheck="false" ${f.type === 'code' ? 'data-code' : ''}>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</textarea>`;
        break;
      case 'number':
        control = stepperHtml({ key: f.key, value: Number(value) || 0, min: f.min ?? 0, max: f.max ?? 100000, step: 1, unit: f.unit ? ` ${f.unit}` : '', label: lbl });
        break;
      case 'boolean':
        control = `<label class="switch-wrap"><input id="${id}" type="checkbox" data-field="${f.key}" ${value ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`;
        return `<div class="field field-inline">${head}${control}${hint}</div>`;
      case 'select':
        control = `<select id="${id}" data-field="${f.key}" data-icon="list">${(f.options ?? []).map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(L(o.label, lang()))}</option>`).join('')}</select>`;
        break;
      case 'multiselect': {
        const set = new Set(Array.isArray(value) ? value : []);
        control = `<div class="chip-grid">${(f.options ?? []).map((o) => `<label class="chip-check ${set.has(o.value) ? 'on' : ''}" title="${escapeHtml(L(BUILTIN_TOOLS.find((b) => b.id === o.value)?.desc ?? o.label, lang()))}"><input type="checkbox" data-multi="${f.key}" value="${escapeHtml(o.value)}" ${set.has(o.value) ? 'checked' : ''} />${o.icon ? icon(o.icon) : ''}<span>${escapeHtml(L(o.label, lang()))}</span></label>`).join('')}</div>`;
        break;
      }
      case 'model': control = modelHtml(f, value); break;
      case 'credential': {
        const creds = opts.catalogs().credentials ?? [];
        control = `<select id="${id}" data-field="${f.key}" data-icon="key"><option value="">${escapeHtml(t('inspector.none'))}</option>${creds.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === value ? 'selected' : ''}>${escapeHtml(`${c.name} (${c.provider})`)}</option>`).join('')}</select>`;
        break;
      }
      case 'kb': {
        const kbs = opts.catalogs().kbs ?? [];
        if (f.single) control = `<select id="${id}" data-field="${f.key}" data-icon="book"><option value="">${escapeHtml(t('inspector.choose'))}</option>${kbs.map((k) => `<option value="${escapeHtml(k.id)}" ${k.id === value ? 'selected' : ''}>${escapeHtml(k.name)}</option>`).join('')}</select>`;
        else {
          const set = new Set(Array.isArray(value) ? value : []);
          control = kbs.length ? `<div class="chip-grid">${kbs.map((k) => `<label class="chip-check ${set.has(k.id) ? 'on' : ''}" title="${escapeHtml(`${k.docs.length} docs · ${k.chunks} chunks`)}"><input type="checkbox" data-multi="${f.key}" value="${escapeHtml(k.id)}" ${set.has(k.id) ? 'checked' : ''} />${icon('book')}<span>${escapeHtml(k.name)}</span></label>`).join('')}</div>` : `<p class="muted small">${escapeHtml(t('inspector.noKbs'))}</p>`;
        }
        control += `<button type="button" class="small-button" data-open-view="knowledge">${icon('book')}<span>${escapeHtml(t('view.knowledge'))}</span></button>`;
        break;
      }
      case 'agent': {
        const agents = (opts.catalogs().agents ?? []).filter((a) => a.id !== doc()?.id);
        control = `<select id="${id}" data-field="${f.key}" data-icon="robot"><option value="">${escapeHtml(t('inspector.choose'))}</option>${agents.map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === value ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>`;
        break;
      }
      case 'list': {
        const rows = Array.isArray(value) ? value : [];
        control = `<div class="rows" data-list="${f.key}">${rows.map((v, i) => `<div class="row-edit"><input type="text" class="field-input" data-list-item="${f.key}" data-index="${i}" value="${escapeHtml(v)}" /><button type="button" class="icon-button danger" data-list-remove="${f.key}" data-index="${i}" title="${escapeHtml(t('inspector.remove'))}">${icon('trash')}</button></div>`).join('')}
          <button type="button" class="small-button" data-list-add="${f.key}">${icon('plus')}<span>${escapeHtml(t('inspector.add'))}</span></button></div>`;
        break;
      }
      case 'kv': {
        const rows = Array.isArray(value) ? value : [];
        control = `<div class="rows" data-kv="${f.key}">${rows.map((r, i) => `<div class="row-edit kv"><input type="text" class="field-input" data-kv-key="${f.key}" data-index="${i}" value="${escapeHtml(r.key)}" placeholder="${escapeHtml(L(f.keyLabel ?? { ko: '이름', en: 'Key' }, lang()))}" /><input type="text" class="field-input ${f.expr ? 'expr' : ''}" data-kv-value="${f.key}" data-index="${i}" value="${escapeHtml(r.value)}" placeholder="${escapeHtml(L(f.valueLabel ?? { ko: '값', en: 'Value' }, lang()))}" /><button type="button" class="icon-button danger" data-kv-remove="${f.key}" data-index="${i}" title="${escapeHtml(t('inspector.remove'))}">${icon('trash')}</button></div>`).join('')}
          <button type="button" class="small-button" data-kv-add="${f.key}">${icon('plus')}<span>${escapeHtml(t('inspector.add'))}</span></button></div>`;
        break;
      }
      case 'conditions': {
        const rows = Array.isArray(value) ? value : [];
        control = `<div class="rows" data-conds="${f.key}">${rows.map((r, i) => `<div class="row-edit cond"><input type="text" class="field-input expr" data-cond="left" data-index="${i}" value="${escapeHtml(r.left)}" spellcheck="false" />
          <select data-cond="op" data-index="${i}" data-icon="filter">${OPERATORS.map((op) => `<option value="${op}" ${op === r.op ? 'selected' : ''}>${escapeHtml(t(`op.${op}`))}</option>`).join('')}</select>
          <input type="text" class="field-input expr" data-cond="right" data-index="${i}" value="${escapeHtml(r.right)}" spellcheck="false" ${['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'].includes(r.op) ? 'disabled' : ''} />
          <button type="button" class="icon-button danger" data-cond-remove="${i}" title="${escapeHtml(t('inspector.remove'))}">${icon('trash')}</button></div>`).join('')}
          <button type="button" class="small-button" data-cond-add>${icon('plus')}<span>${escapeHtml(t('inspector.add'))}</span></button></div>`;
        break;
      }
      default: control = `<input type="text" data-field="${f.key}" value="${escapeHtml(value)}" />`;
    }
    return `<div class="field field-${f.type}">${head}${control}${hint}${preview}</div>`;
  }

  function modelHtml(f, value) {
    const cat = opts.catalogs();
    const [provider, ...rest] = String(value || '').split(':');
    const model = rest.join(':');
    const ready = new Map((cat.providerStatus ?? []).map((p) => [p.id, p.ready]));
    const opt = (p) => `<option value="${p.id}" ${p.id === provider ? 'selected' : ''}>${escapeHtml(p.label)}${ready.get(p.id) === false ? ` (${t('models.noKey')})` : ''}</option>`;
    const list = cat.models?.[provider] ?? PROVIDERS.find((p) => p.id === provider)?.models ?? [];
    return `<div class="model-pick">
      <select data-model-provider="${f.key}" data-icon="sparkles"><option value="" ${!provider ? 'selected' : ''}>${escapeHtml(t('inspector.defaultModel', { model: cat.defaultModel ?? '' }))}</option>${PROVIDERS.map(opt).join('')}</select>
      ${provider ? `<input type="text" class="field-input mono" list="models-${f.key}" data-model-name="${f.key}" value="${escapeHtml(model)}" placeholder="${escapeHtml(PROVIDERS.find((p) => p.id === provider)?.defaultModel ?? '')}" /><datalist id="models-${f.key}">${list.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>
      <button type="button" class="icon-button" data-model-refresh="${escapeHtml(provider)}" title="${escapeHtml(t('models.refresh'))}">${icon('refresh')}</button>` : ''}
    </div>`;
  }

  // ───────────── node view

  function renderNode(n) {
    const def = nodeDef(n.type);
    const cat = categoryOf(def?.category);
    const config = n.config ?? {};
    const main = (def?.fields ?? []).filter((f) => !f.advanced && visible(f.when, config));
    const advanced = (def?.fields ?? []).filter((f) => f.advanced && visible(f.when, config));
    const common = def?.note || def?.trigger ? [] : COMMON_FIELDS;
    const step = opts.lastStep(n.id);
    const toolsOf = (doc()?.edges ?? []).filter((e) => e.from === n.id && e.fromPort === 'tools').map((e) => doc().nodes.find((x) => x.id === e.to)?.name).filter(Boolean);
    const usedAsTool = (doc()?.edges ?? []).some((e) => e.to === n.id && e.fromPort === 'tools');
    host.innerHTML = `<div class="inspector" style="--cat:${cat.color}">
      <div class="insp-head"><span class="node-icon">${icon(def?.icon ?? 'dot')}</span>
        <input class="insp-name" data-field="$name" value="${escapeHtml(n.name)}" aria-label="${escapeHtml(t('inspector.name'))}" />
        <span class="insp-type" title="${escapeHtml(n.type)}">${escapeHtml(L(def?.label, lang()) || n.type)}</span></div>
      <p class="insp-desc muted">${escapeHtml(L(def?.desc, lang()))}</p>
      <div class="insp-actions">
        <button class="small-button" data-insp="run-from" title="${escapeHtml(t('inspector.runToHereTip'))}">${icon('play')}<span>${escapeHtml(t('inspector.runToHere'))}</span></button>
        <button class="small-button ${n.disabled ? 'active' : ''}" data-insp="toggle-disabled">${icon('powerOff')}<span>${escapeHtml(n.disabled ? t('inspector.enable') : t('inspector.disable'))}</span></button>
        ${def?.note ? '' : `<button class="small-button ${n.pinned != null ? 'active' : ''}" data-insp="pin" ${step?.output == null && n.pinned == null ? 'disabled' : ''} title="${escapeHtml(t('inspector.pinTip'))}">${icon('pin')}<span>${escapeHtml(n.pinned != null ? t('inspector.unpin') : t('inspector.pin'))}</span></button>`}
      </div>
      ${def?.toolPort ? `<div class="insp-note">${icon('plug')}<span>${escapeHtml(toolsOf.length ? t('inspector.graphTools', { names: toolsOf.join(', ') }) : t('inspector.toolPortHint'))}</span></div>` : ''}
      ${usedAsTool ? `<div class="field"><label class="field-label">${icon('info')}<span>${escapeHtml(t('inspector.toolDescription'))}</span></label><textarea class="field-input" rows="2" data-field="toolDescription" placeholder="${escapeHtml(t('inspector.toolDescriptionHint'))}">${escapeHtml(config.toolDescription ?? '')}</textarea></div>` : ''}
      <section class="insp-section">${main.map((f) => fieldHtml(f, config)).join('')}</section>
      ${advanced.length ? `<details class="insp-section" ${opts.openSections?.has('advanced') ? 'open' : ''} data-section="advanced"><summary>${icon('gear')}<span>${escapeHtml(t('inspector.advanced'))}</span></summary>${advanced.map((f) => fieldHtml(f, config)).join('')}</details>` : ''}
      ${common.length ? `<details class="insp-section" ${opts.openSections?.has('common') ? 'open' : ''} data-section="common"><summary>${icon('warning')}<span>${escapeHtml(t('inspector.errorsRetries'))}</span></summary>${common.map((f) => fieldHtml(f, config)).join('')}</details>` : ''}
      <details class="insp-section" data-section="notes" ${opts.openSections?.has('notes') ? 'open' : ''}><summary>${icon('notes')}<span>${escapeHtml(t('inspector.description'))}</span></summary><textarea class="field-input" rows="2" data-field="$description">${escapeHtml(n.description ?? '')}</textarea></details>
      ${def?.note ? '' : lastRunHtml(n, step)}
    </div>`;
    bindSteppers(host, (key, value) => change(key, value));
    schedulePreview(0);
  }

  function lastRunHtml(n, step) {
    if (!step && n.pinned == null) return `<div class="insp-run muted small">${icon('info')}<span>${escapeHtml(t('inspector.noRunYet'))}</span></div>`;
    const status = step ? `<span class="run-chip st-${step.status}">${escapeHtml(t(`run.status.${step.status}`))}</span> <span class="muted">${step.ms ?? 0} ms${step.usage ? ` · ${step.usage.input}/${step.usage.output} tok` : ''}${step.model ? ` · ${escapeHtml(step.model)}` : ''}</span>` : '';
    return `<details class="insp-section insp-run" open data-section="lastrun"><summary>${icon('timeline')}<span>${escapeHtml(t('inspector.lastRun'))}</span> ${status}</summary>
      ${step?.error ? `<div class="run-error">${icon('error')}<span>${escapeHtml(step.error.message)}</span></div>` : ''}
      <div class="io-grid">
        <div><h4>${escapeHtml(t('run.input'))}</h4>${jsonView(step?.input, { max: 4 })}</div>
        <div><h4>${escapeHtml(n.pinned != null ? t('inspector.pinnedOutput') : t('run.output'))}</h4>${jsonView(n.pinned != null ? n.pinned : step?.output, { max: 4 })}</div>
      </div></details>`;
  }

  // ───────────── agent view

  function renderAgent() {
    const d = doc();
    if (!d) { host.innerHTML = `<div class="inspector empty muted">${icon('info')}<span>${escapeHtml(t('inspector.nothing'))}</span></div>`; return; }
    const hook = d.nodes.some((n) => n.type === 'trigger.webhook');
    const schedule = d.nodes.some((n) => n.type === 'trigger.schedule');
    host.innerHTML = `<div class="inspector agent-settings">
      <div class="insp-head"><span class="node-icon agent">${icon('robot')}</span><input class="insp-name" data-agent="name" value="${escapeHtml(d.name)}" aria-label="${escapeHtml(t('inspector.agentName'))}" /></div>
      <div class="field"><label class="field-label">${icon('notes')}<span>${escapeHtml(t('inspector.agentDescription'))}</span></label><textarea class="field-input" rows="2" data-agent="description">${escapeHtml(d.description ?? '')}</textarea></div>
      <div class="field"><label class="field-label">${icon('variable')}<span>${escapeHtml(t('inspector.variables'))}</span><small class="muted"> vars.*</small></label>
        <div class="rows">${(d.variables ?? []).map((v, i) => `<div class="row-edit kv"><input class="field-input" data-var-key="${i}" value="${escapeHtml(v.key)}" placeholder="name" /><input class="field-input" data-var-value="${i}" value="${escapeHtml(v.value)}" placeholder="value" /><button class="icon-button danger" data-var-remove="${i}" title="${escapeHtml(t('inspector.remove'))}">${icon('trash')}</button></div>`).join('')}
        <button class="small-button" data-var-add>${icon('plus')}<span>${escapeHtml(t('inspector.add'))}</span></button></div></div>
      <div class="field field-inline"><label class="field-label">${icon('deploy')} ${escapeHtml(t('inspector.deployed'))}</label><label class="switch-wrap"><input type="checkbox" data-agent-deploy ${d.deployed ? 'checked' : ''} ${d.id ? '' : 'disabled'} /><span class="switch"></span></label><small class="field-hint">${escapeHtml(t('inspector.deployedHint'))}</small></div>
      ${hook ? `<div class="field"><label class="field-label">${icon('webhook')} ${escapeHtml(t('inspector.webhookUrl'))}</label>${d.id ? `<div class="copy-row"><input class="field-input mono" readonly value="${escapeHtml(opts.hookUrl?.() ?? '')}" /><button class="icon-button" data-copy-hook title="${escapeHtml(t('common.copy'))}">${icon('copy')}</button><button class="icon-button" data-rotate-secret title="${escapeHtml(t('inspector.rotateSecret'))}">${icon('refresh')}</button></div><small class="field-hint mono">curl -X POST -H "Content-Type: application/json" -d '{"text":"hi"}' &lt;URL&gt;</small>` : `<p class="muted small">${escapeHtml(t('inspector.saveFirst'))}</p>`}</div>` : ''}
      ${schedule ? `<div class="field"><label class="field-label">${icon('calendarClock')} ${escapeHtml(t('inspector.nextRuns'))}</label><div class="muted small" data-next-runs>${escapeHtml(opts.nextRuns?.() ?? '')}</div></div>` : ''}
      <div class="field"><label class="field-label">${icon('info')} ${escapeHtml(t('inspector.stats'))}</label><div class="muted small">${escapeHtml(t('inspector.statsText', { nodes: d.nodes.length, edges: d.edges.length }))}</div></div>
    </div>`;
  }

  function render() {
    const n = node();
    if (current && !n) current = null;
    if (n) renderNode(n); else renderAgent();
  }

  // ───────────── expression preview

  function schedulePreview(delay = 250) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreviews, delay);
  }

  function updatePreviews() {
    const n = node();
    if (!n) return;
    const scope = opts.previewScope(n.id);
    for (const el of host.querySelectorAll('[data-preview]')) {
      const value = n.config?.[el.dataset.preview];
      if (typeof value !== 'string' || !value.includes('{{')) { el.innerHTML = ''; continue; }
      if (!scope) { el.innerHTML = `<span class="muted">${icon('info')} ${escapeHtml(t('inspector.previewNeedsRun'))}</span>`; continue; }
      try {
        const out = renderExpr(value, scope);
        const text = toText(out);
        el.innerHTML = `<span class="preview-ok" title="${escapeHtml(text)}">= ${escapeHtml(text.length > 300 ? `${text.slice(0, 300)}…` : text || '""')}</span>`;
      } catch (err) {
        el.innerHTML = `<span class="preview-error">${icon('error')} ${escapeHtml(err.message)}</span>`;
      }
    }
  }

  // ───────────── events

  host.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.field) { if (el.type !== 'checkbox') change(el.dataset.field, el.value, { label: el.dataset.field === '$name' ? t('op.rename') : null }); if (el.dataset.field === '$name') opts.onRename?.(); return; }
    if (el.dataset.listItem) { const key = el.dataset.listItem; const list = [...(node().config[key] ?? [])]; list[Number(el.dataset.index)] = el.value; change(key, list); return; }
    if (el.dataset.kvKey || el.dataset.kvValue) {
      const key = el.dataset.kvKey ?? el.dataset.kvValue;
      const rows = (node().config[key] ?? []).map((r) => ({ ...r }));
      const r = rows[Number(el.dataset.index)];
      if (el.dataset.kvKey) r.key = el.value; else r.value = el.value;
      change(key, rows);
      return;
    }
    if (el.dataset.cond && el.tagName !== 'SELECT') { const rows = (node().config.conditions ?? []).map((r) => ({ ...r })); rows[Number(el.dataset.index)][el.dataset.cond] = el.value; change('conditions', rows); return; }
    if (el.dataset.modelName) { const prov = host.querySelector(`[data-model-provider="${el.dataset.modelName}"]`)?.value ?? ''; change(el.dataset.modelName, prov ? `${prov}:${el.value}` : ''); return; }
    if (el.dataset.agent) { changeAgent(el.dataset.agent, el.value); if (el.dataset.agent === 'name') opts.onRename?.(); return; }
    if (el.dataset.varKey != null || el.dataset.varValue != null) {
      const i = Number(el.dataset.varKey ?? el.dataset.varValue);
      const vars = (doc().variables ?? []).map((v) => ({ ...v }));
      if (el.dataset.varKey != null) vars[i].key = el.value; else vars[i].value = el.value;
      changeAgent('variables', vars);
    }
  });

  host.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.field && el.type === 'checkbox') return change(el.dataset.field, el.checked, { rerender: true });
    if (el.dataset.field && el.tagName === 'SELECT') return change(el.dataset.field, el.value, { rerender: true });
    if (el.dataset.multi) {
      const key = el.dataset.multi;
      const set = new Set(node().config[key] ?? []);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      return change(key, [...set], { rerender: true });
    }
    if (el.dataset.cond === 'op') { const rows = (node().config.conditions ?? []).map((r) => ({ ...r })); rows[Number(el.dataset.index)].op = el.value; return change('conditions', rows, { rerender: true }); }
    if (el.dataset.modelProvider) {
      const key = el.dataset.modelProvider;
      const prov = el.value;
      const def = PROVIDERS.find((p) => p.id === prov)?.defaultModel ?? '';
      change(key, prov ? `${prov}:${def}` : '', { rerender: true });
      if (prov) opts.loadModels?.(prov);
      return undefined;
    }
    if ('agentDeploy' in el.dataset) return opts.onDeploy?.(el.checked);
    return undefined;
  });

  host.addEventListener('click', async (event) => {
    const el = event.target.closest('button, summary');
    if (!el) return;
    if (el.tagName === 'SUMMARY') { const s = el.parentElement.dataset.section; if (s) setTimeout(() => { if (el.parentElement.open) opts.openSections?.add(s); else opts.openSections?.delete(s); }, 0); return; }
    const n = node();
    if (el.dataset.listAdd) { change(el.dataset.listAdd, [...(n.config[el.dataset.listAdd] ?? []), ''], { rerender: true }); return; }
    if (el.dataset.listRemove) { const list = [...(n.config[el.dataset.listRemove] ?? [])]; list.splice(Number(el.dataset.index), 1); change(el.dataset.listRemove, list, { rerender: true }); return; }
    if (el.dataset.kvAdd) { change(el.dataset.kvAdd, [...(n.config[el.dataset.kvAdd] ?? []), { key: '', value: '' }], { rerender: true }); return; }
    if (el.dataset.kvRemove) { const rows = [...(n.config[el.dataset.kvRemove] ?? [])]; rows.splice(Number(el.dataset.index), 1); change(el.dataset.kvRemove, rows, { rerender: true }); return; }
    if ('condAdd' in el.dataset) { change('conditions', [...(n.config.conditions ?? []), { left: '{{ input }}', op: 'equals', right: '' }], { rerender: true }); return; }
    if (el.dataset.condRemove) { const rows = [...(n.config.conditions ?? [])]; rows.splice(Number(el.dataset.condRemove), 1); change('conditions', rows, { rerender: true }); return; }
    if (el.dataset.expand) {
      const f = (nodeDef(n.type)?.fields ?? []).find((x) => x.key === el.dataset.expand);
      if (!f || !opts.expand) return;
      const raw = n.config[f.key] ?? f.default;
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      const res = await opts.expand({ title: `${n.name} › ${L(f.label, lang())}`, value: text, mono: f.type !== 'textarea', hint: f.expr ? t('inspector.expandHint') : '' });
      if (res == null || res === text) return;
      let value = res;
      if (f.type === 'json') { try { value = JSON.parse(res); } catch { value = res; } }
      change(f.key, value, { rerender: true });
      return;
    }
    if (el.dataset.vars) { await pickVariable(el, el.dataset.vars); return; }
    if (el.dataset.modelRefresh) { opts.loadModels?.(el.dataset.modelRefresh, { force: true }); return; }
    if (el.dataset.openView) { opts.openView?.(el.dataset.openView); return; }
    if (el.dataset.insp === 'toggle-disabled') { opts.onChange(t(n.disabled ? 'inspector.enable' : 'inspector.disable'), (d) => { const x = d.nodes.find((y) => y.id === n.id); if (x) x.disabled = !x.disabled; }); render(); return; }
    if (el.dataset.insp === 'pin') { opts.onPin?.(n.id); return; }
    if (el.dataset.insp === 'run-from') { opts.onRunTo?.(n.id); return; }
    if ('varAdd' in el.dataset) { changeAgent('variables', [...(doc().variables ?? []), { key: '', value: '' }], { rerender: true }); return; }
    if (el.dataset.varRemove) { const vars = [...(doc().variables ?? [])]; vars.splice(Number(el.dataset.varRemove), 1); changeAgent('variables', vars, { rerender: true }); return; }
    if ('copyHook' in el.dataset) { opts.copy?.(opts.hookUrl?.() ?? ''); return; }
    if ('rotateSecret' in el.dataset) opts.onRotateSecret?.();
  });

  // Tab in code fields types two spaces.
  host.addEventListener('keydown', (event) => {
    const el = event.target;
    if (event.key === 'Tab' && el.matches?.('textarea[data-code]')) {
      event.preventDefault();
      const s = el.selectionStart;
      el.setRangeText('  ', s, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  /** The {} button: the paths the last run knows, inserted at the cursor. */
  async function pickVariable(button, key) {
    const n = node();
    const field = host.querySelector(`[data-field="${key}"]`) ?? host.querySelector(`[data-kv-value="${key}"]`);
    const scope = opts.previewScope(n.id) ?? {};
    const items = [];
    const walk = (prefix, value, depth) => {
      if (depth > 2 || items.length > 60) return;
      if (value && typeof value === 'object' && !Array.isArray(value)) for (const [k, v] of Object.entries(value).slice(0, 15)) { const p = /^[\w$]+$/.test(k) ? `${prefix}.${k}` : `${prefix}["${k}"]`; items.push(p); walk(p, v, depth + 1); }
    };
    items.push('input'); walk('input', scope.input, 1);
    items.push('trigger'); walk('trigger', scope.trigger, 1);
    for (const other of doc().nodes.filter((x) => x.id !== n.id && !nodeDef(x.type)?.note)) { const p = `nodes.${other.name}.output`; items.push(p); walk(p, scope.nodes?.[other.name]?.output, 3); }
    for (const v of doc().variables ?? []) if (v.key) items.push(`vars.${v.key}`);
    items.push('item', 'index', 'run.id', 'env.now');
    const chosen = await opts.chooseVariable?.([...new Set(items)].slice(0, 80), button);
    if (!chosen || !field) return;
    const text = `{{ ${chosen} }}`;
    field.focus();
    const s = field.selectionStart ?? field.value.length;
    field.setRangeText(text, s, field.selectionEnd ?? s, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return {
    show(id) { current = id; render(); },
    current: () => current,
    render,
    refreshPreview: () => schedulePreview(0),
  };
}
