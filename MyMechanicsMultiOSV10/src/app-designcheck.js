// Design checker (Tools): the project checked against a standard (cad/design-check.js). The PropertyManager holds
// the standard (its rules on / off, their severities and parameters — learnt from the project, loaded or saved as
// .mmstd, kept in the settings between sessions), the check, and the findings: each one opens its document and
// selects its item, the fixable ones are corrected one by one or all at once (one undo step), and the report is
// saved as HTML.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { RULES, CATEGORIES, SEVERITIES, defaultStandard, normalizeStandard, learnStandard, runCheck, applyFix, applyAllFixes, reportHtml } from './cad/design-check.js';

const SEV_ICON = { error: 'error', warning: 'warning', info: 'info' };

export function createDesignCheckTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'designCheck';
  const project = () => ctx.project();

  /** The standard in use: the settings' (normalised), or the defaults. */
  function standard() {
    try { if (state.settings.designStandard) return normalizeStandard(state.settings.designStandard); } catch { /* defaults */ }
    return defaultStandard(t('dc.defaultName'));
  }
  const saveStandard = (s) => ctx.updateSettings({ designStandard: s }, { quiet: true });
  const editStandard = (mutate) => { const s = standard(); mutate(s); saveStandard(s); const e = editing(); if (owns(e)) e.result = null; ctx.renderLeft(); };

  // ───────────────────────── mode

  function begin() {
    if (!project()) { notify('info', t('dc.needProject')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'designCheck', result: null, filter: 'all', open: null };
    ctx.renderAll();
  }
  function finish() { ctx.cancelEditing({ quiet: true }); }

  function check() {
    const e = editing(); if (!owns(e) || !project()) return null;
    e.result = runCheck(project(), standard(), ctx.checkContext());
    ctx.renderLeft();
    const n = e.result.findings.length;
    notify(n ? 'info' : 'success', n ? t('dc.found', { count: n, errors: e.result.counts.error }) : t('dc.clean'));
    return e.result;
  }

  /** Opens the finding's document and selects its item; the checker stays open with its findings. */
  function goTo(f) {
    const e = editing(); if (!owns(e) || !f) return;
    const keep = { ...e };
    if (f.doc?.kind && f.doc.kind !== 'project') ctx.switchDocument({ kind: f.doc.kind, id: f.doc.id });
    state.editing = keep;
    if (f.target?.kind === 'feature') ctx.select([{ kind: 'feat', id: f.target.id }]);
    else if (f.target?.kind === 'mate') ctx.select([{ kind: 'mate', id: f.target.id }]);
    else if (f.target?.kind === 'annotation' || f.target?.kind === 'view') { state.drawingSelected = f.target.id; ctx.renderDrawing(); }
    ctx.renderAll();
  }

  function fix(index) {
    const e = editing(); const f = e?.result?.findings[index]; if (!f?.fixable) return;
    let ok = false;
    ctx.change('op.designFix', (p) => { ok = applyFix(p, f, { setUnits: (u) => ctx.updateSettings({ units: u }, { quiet: true }) }); });
    if (ok) { notify('success', t('dc.fixed', { text: message(f) })); check(); }
  }
  function fixAll() {
    const e = editing(); const list = e?.result?.findings.filter((f) => f.fixable) ?? [];
    if (!list.length) return 0;
    let n = 0;
    ctx.change('op.designFixAll', (p) => { n = applyAllFixes(p, list, { setUnits: (u) => ctx.updateSettings({ units: u }, { quiet: true }) }); });
    check();
    notify('success', t('dc.fixedAll', { count: n }));
    return n;
  }

  // ───────────────────────── texts

  const ruleName = (id) => t(`dc.rule.${id}`);
  const arg = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(+v.toFixed(4)) : String(v ?? ''));
  function message(f) {
    const a = Object.fromEntries(Object.entries(f.args ?? {}).map(([k, v]) => [k, arg(v)]));
    if (f.rule === 'partProps' || f.rule === 'titleBlock') a.field = t(`dc.field.${f.args.field}`, null, f.args.field);
    if (f.rule === 'sketchDefined') a.state = t(`dc.state.${f.args.state}`);
    if (f.rule === 'minFillet') a.what = t(`dc.what.${f.args.what}`);
    if (f.rule === 'rebuild') a.error = t(`rebuild.${f.args.error}`, null, f.args.error);
    return t(`dc.msg.${f.rule}`, a);
  }

  // ───────────────────────── exports

  /** The HTML report of a check result, in the app's language. */
  function reportFor(r, projectName) {
    return reportHtml(r, {
      project: projectName ?? '', text: message,
      labels: { title: t('cmd.designCheck'), project: t('dc.project'), standard: t('dc.standard'), date: t('dc.date'), passed: t('dc.passed'), none: t('dc.clean'), doc: t('dc.doc'), item: t('dc.item'), message: t('dc.finding'), ruleHeader: t('dc.rule'), rule: ruleName, severity: Object.fromEntries(SEVERITIES.map((s) => [s, t(`dc.sev.${s}`)])) },
    });
  }
  async function exportReport() {
    const e = editing(); const r = e?.result ?? check(); if (!r) return undefined;
    const html = reportFor(r, project()?.name ?? '');
    return ctx.saveExport(`${ctx.fileSafe(project()?.name ?? 'project')} - design check.html`, 'html', html, 'text/html');
  }
  async function saveStandardFile() {
    const s = standard();
    return ctx.saveExport(`${ctx.fileSafe(s.name || 'standard')}.mmstd`, 'mmstd', `${JSON.stringify(s, null, 2)}\n`, 'application/json');
  }
  async function loadStandardFile(text = null) {
    const raw = text ?? await ctx.readText({ name: t('dc.standardFile'), extensions: ['mmstd', 'json'] });
    if (raw == null) return false;
    try { const s = normalizeStandard(JSON.parse(raw)); saveStandard(s); const e = editing(); if (owns(e)) e.result = null; notify('success', t('dc.loaded', { name: s.name })); ctx.renderLeft(); return true; }
    catch { notify('error', t('dc.badStandard')); return false; }
  }
  function learn() {
    const p = project(); if (!p) return;
    const s = learnStandard(p, { name: t('dc.learntName', { name: p.name }), units: ctx.units() });
    saveStandard(s); const e = editing(); if (owns(e)) e.result = null;
    notify('success', t('dc.learnt', { name: s.name })); ctx.renderLeft();
  }

  // ───────────────────────── PropertyManager

  function paramEditor(id, r) {
    const fields = Object.entries(r).filter(([k]) => k !== 'on' && k !== 'severity');
    if (!fields.length) return `<p class="pm-note">${escapeHtml(t('dc.noParams'))}</p>`;
    return fields.map(([k, v]) => {
      const label = t(`dc.param.${k}`, null, k);
      if (typeof v === 'boolean') return `<label class="pm-check"><input type="checkbox" data-pm-toggle="dcp:${id}:${k}" ${v ? 'checked' : ''}/><span>${escapeHtml(label)}</span></label>`;
      if (typeof v === 'number') return ctx.pm.pmNum(`dcp:${id}:${k}`, v, label, 'smartDim');
      return `<label class="pm-field"><span class="pm-label">${escapeHtml(label)}</span><input type="text" class="pm-text" data-pm-field="dcp:${id}:${k}" value="${escapeHtml(Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? +x.toFixed(4) : x)).join(', ') : v)}" spellcheck="false"/></label>`;
    }).join('');
  }

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmSeg } = ctx.pm;
    const s = standard();
    const stdGroup = pmGroup('designCheck', t('dc.standard'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('dc.standardName'))}</span><input type="text" class="pm-text" data-pm-field="dcName" value="${escapeHtml(s.name)}" spellcheck="false"/></label><div class="pm-row">${pmButton('dc.learn', 'designCheckLearn', t('dc.learn'))}${pmButton('dc.load', 'folderOpen', t('dc.load'))}${pmButton('dc.save', 'save', t('dc.save'))}${pmButton('dc.reset', 'undo', t('dc.reset'))}</div>`);
    const rules = CATEGORIES.map((cat) => {
      const rows = Object.keys(RULES).filter((id) => RULES[id].category === cat).map((id) => {
        const r = s.rules[id];
        const open = e.open === id;
        return `<div class="dc-rule ${r.on ? '' : 'off'} ${open ? 'open' : ''}" data-rule="${id}"><label class="pm-check"><input type="checkbox" data-pm-toggle="dcOn:${id}" ${r.on ? 'checked' : ''}/></label><button type="button" class="dc-rule-name" data-pm="dc.open:${id}" title="${escapeHtml(t(`dc.help.${id}`))}">${icon(SEV_ICON[r.severity], `icon tiny dc-${r.severity}`)}<span>${escapeHtml(ruleName(id))}</span>${RULES[id].fix ? `<i class="dc-fixable" title="${escapeHtml(t('dc.fixableRule'))}">${icon('designCheckFix', 'icon tiny')}</i>` : ''}</button></div>${open ? `<div class="dc-params"><p class="pm-note">${escapeHtml(t(`dc.help.${id}`))}</p>${pmSeg(`dcSev:${id}`, SEVERITIES.map((v) => [v, t(`dc.sev.${v}`), SEV_ICON[v]]), r.severity)}${paramEditor(id, r)}</div>` : ''}`;
      }).join('');
      return `<div class="dc-cat"><div class="dc-cat-title">${escapeHtml(t(`dc.cat.${cat}`))}</div>${rows}</div>`;
    }).join('');
    const rulesGroup = pmGroup('designCheckRules', t('dc.rules', { on: Object.values(s.rules).filter((r) => r.on).length, all: Object.keys(RULES).length }), `<div class="dc-rules">${rules}</div><div class="pm-row">${pmButton('dc.run', 'designCheck', t('dc.run'), 'primary')}</div>`);
    let results = '';
    const r = e.result;
    if (r) {
      const shown = r.findings.map((f, i) => [f, i]).filter(([f]) => e.filter === 'all' || f.severity === e.filter);
      const counts = SEVERITIES.map((v) => `<span class="dc-count dc-${v}">${icon(SEV_ICON[v], 'icon tiny')}${r.counts[v]}</span>`).join('');
      const rows = shown.map(([f, i]) => `<li class="dc-finding dc-${f.severity}" data-finding="${i}"><button type="button" class="dc-go" data-pm="dc.go:${i}" title="${escapeHtml(t('dc.goTo'))}">${icon(SEV_ICON[f.severity], 'icon tiny')}<span class="dc-text"><b>${escapeHtml(ruleName(f.rule))}</b> — ${escapeHtml(message(f))}<small>${escapeHtml([f.doc?.name, f.target?.name].filter(Boolean).join(' › '))}</small></span></button>${f.fixable ? `<button type="button" class="icon-button" data-pm="dc.fix:${i}" title="${escapeHtml(t('dc.fix'))}">${icon('designCheckFix', 'icon tiny')}</button>` : ''}</li>`).join('');
      const fixable = r.findings.filter((f) => f.fixable).length;
      results = pmGroup('designCheckResults', t('dc.results'), `<div class="dc-summary">${counts}<span class="grow"></span><span class="pm-note">${escapeHtml(t('dc.passedCount', { passed: r.passed.length, checked: r.checked.length }))}</span></div>${r.skipped?.length ? `<p class="pm-note">${escapeHtml(t('dc.skipped', { rules: r.skipped.map(ruleName).join(', ') }))}</p>` : ''}${pmSeg('dcFilter', [['all', t('dc.all')], ...SEVERITIES.map((v) => [v, t(`dc.sev.${v}`), SEV_ICON[v]])], e.filter)}${r.findings.length ? `<ul class="dc-findings">${rows}</ul>` : `<p class="pm-note">${icon('check', 'icon tiny')} ${escapeHtml(t('dc.clean'))}</p>`}<div class="pm-row">${fixable ? pmButton('dc.fixAll', 'designCheckFix', t('dc.fixAll', { count: fixable })) : ''}${pmButton('dc.report', 'exportFile', t('dc.report'))}</div>`);
    }
    return [pmHead('designCheck', t('cmd.designCheck'), t('pm.help.designCheck')), stdGroup, rulesGroup, results].join('');
  }

  /** "a, b, 3" → the parameter's type: numbers for a number list, strings otherwise. */
  function parseParam(def, raw) {
    if (Array.isArray(def)) {
      const parts = String(raw).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
      if (def.length && typeof def[0] === 'number') { const nums = parts.map(Number); return nums.every(Number.isFinite) ? nums : null; }
      return parts;
    }
    if (typeof def === 'number') { const v = Number(String(raw).replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null; }
    return String(raw);
  }

  function field(key, raw) {
    if (key === 'dcName') { const v = String(raw ?? '').trim(); if (v) editStandard((s) => { s.name = v; }); return undefined; }
    const m = /^dcp:(\w+):(\w+)$/.exec(key);
    if (m) {
      const [, id, k] = m;
      const v = parseParam(standard().rules[id]?.[k], raw);
      if (v == null || (k === 'pattern' && (() => { try { new RegExp(v); return false; } catch { return true; } })())) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return undefined; }
      editStandard((s) => { s.rules[id][k] = v; });
    }
    return undefined;
  }
  function set(key, value) {
    const e = editing();
    if (key === 'dcFilter') { e.filter = value; return ctx.renderLeft(); }
    const m = /^dcSev:(\w+)$/.exec(key);
    if (m && SEVERITIES.includes(value)) editStandard((s) => { s.rules[m[1]].severity = value; });
    return undefined;
  }
  function toggle(key, checked) {
    let m = /^dcOn:(\w+)$/.exec(key);
    if (m) { editStandard((s) => { s.rules[m[1]].on = Boolean(checked); }); return true; }
    m = /^dcp:(\w+):(\w+)$/.exec(key);
    if (m) { editStandard((s) => { s.rules[m[1]][m[2]] = Boolean(checked); }); return true; }
    return false;
  }

  const NAMES = new Set(['dc.run', 'dc.go', 'dc.fix', 'dc.fixAll', 'dc.report', 'dc.learn', 'dc.load', 'dc.save', 'dc.reset', 'dc.open']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    switch (name) {
      case 'dc.run': return check();
      case 'dc.go': return goTo(e?.result?.findings[Number(arg)]);
      case 'dc.fix': return fix(Number(arg));
      case 'dc.fixAll': return fixAll();
      case 'dc.report': return exportReport();
      case 'dc.learn': return learn();
      case 'dc.load': return loadStandardFile();
      case 'dc.save': return saveStandardFile();
      case 'dc.reset': saveStandard(defaultStandard(t('dc.defaultName'))); if (owns(e)) e.result = null; return ctx.renderLeft();
      case 'dc.open': if (owns(e)) e.open = e.open === arg ? null : arg; return ctx.renderLeft();
      default: return undefined;
    }
  }

  const commands = {
    designCheck: { icon: 'designCheck', label: 'cmd.designCheck', enabled: () => Boolean(project()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
  };
  const api = { begin, check, fix, fixAll, goTo: (i) => goTo(editing()?.result?.findings[i]), exportReport, learn, loadStandardFile, saveStandardFile, standard, result: () => editing()?.result ?? null, message, reportFor };
  /** After undo / redo the findings no longer describe the project: cleared until the next check. */
  function afterHistory() { const e = editing(); if (owns(e)) { e.result = null; ctx.renderLeft(); } }
  return { commands, owns, pm, pick: () => undefined, field, set, select: () => false, toggle, accept: () => finish(), handles, command, subject: () => t('cmd.designCheck'), finish, afterHistory, api };
}
