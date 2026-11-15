// HTML of the side and bottom panels: the library (blocks to drag onto the
// canvas), the model explorer, the properties editor generated from each block
// type's property list, and the bottom panel (statistics, charts, problems,
// event log, experiment results). Pure functions of the app state → HTML;
// app.js binds the events (data-* attributes say what each control edits).
import { BLOCK_TYPES, CATEGORIES, PARADIGM, baseOf, isPathType, pathLength, pathPoints, typesIn } from '../sim/blocks.js';
import { DISTRIBUTIONS, DIST_KINDS, distMean, formatDist, histogram, sampleMany } from '../sim/random.js';
import { countBySeverity, referenceNames } from '../sim/model.js';
import { checkFixes } from '../sim/diagnose.js';
import { SCENARIO_KPIS, bestScenarioIndex, scenarioDiff } from '../sim/experiments.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml } from './dom.js';
import { barRows, fmtNum, histogramChart, lineChart, pct, stackRows, timelineChart } from './charts.js';
import { stepperHtml } from '../stepper.js';

const e = escapeHtml;
const tt = (key, fallback) => t(key, null, fallback);

/** Label of a block type, an option value, a property. */
export const typeName = (type) => tt(`block.${type}`, type);
export const typeDesc = (type) => tt(`block.${type}.desc`, '');
const optName = (key, value) => (value === '' ? tt('opt.none', '—') : tt(`opt.${key}.${value}`, tt(`opt.${value}`, String(value))));
const propName = (key) => tt(`prop.${key}`, key);
const unitText = (unit, model) => {
  const tu = model.settings.timeUnit;
  return { time: tu, length: 'm', speed: `m/${tu}`, perTime: `/${tu}`, costPerTime: `/${tu}` }[unit] ?? '';
};
/** Number properties that count things: shown with a count unit (개 / pcs). */
const COUNT_KEYS = new Set(['capacity', 'units', 'fleet', 'doors', 'bays', 'levels', 'spaces', 'batchSize', 'size', 'copies', 'maxArrivals', 'count', 'cols', 'rows', 'lanes', 'inputs', 'outputs', 'maxTimes', 'quantity']);
/** Distribution parameters without the property's unit (shape factors, counts). */
const UNITLESS_DIST = new Set(['shape', 'k', 'alpha', 'beta']);

// ───────────────────────── library

export function libraryHtml(state) {
  const cat = state.libraryCategory;
  const q = state.libraryQuery.trim().toLowerCase();
  const all = Object.keys(BLOCK_TYPES);
  const types = all.filter((type) => (cat === 'all' || BLOCK_TYPES[type].cat === cat) && (!q || `${type} ${typeName(type)} ${typeDesc(type)}`.toLowerCase().includes(q)));
  const chip = (id, glyph, label, count) => `<button class="lib-chip ${cat === id ? 'active' : ''}" data-lib-cat="${id}" title="${e(label)}">${icon(glyph)}<span>${e(label)}</span><small>${count}</small></button>`;
  return `<div class="panel-header">${icon('library')}<span>${e(tt('panel.library', 'Library'))}</span><button class="icon-button" data-command="leftPanel" title="${e(tt('action.leftPanel', ''))}">${icon('foldLeft')}</button></div>
    <div class="lib-body">
      <label class="search-box">${icon('search')}<input type="search" data-lib-search value="${e(state.libraryQuery)}" placeholder="${e(tt('library.search', 'Search blocks'))}" aria-label="${e(tt('library.search', 'Search blocks'))}"/></label>
      <div class="lib-chips">${chip('all', 'libAll', tt('library.all', 'All'), all.length)}${CATEGORIES.map((c) => chip(c.id, c.icon, tt(`category.${c.id}`, c.id), typesIn(c.id).length)).join('')}</div>
      <p class="lib-hint">${icon('bulb')}<span>${e(tt('library.hint', 'Drag a block onto the canvas, or click it and then click where it goes.'))}</span></p>
      <div class="lib-grid">${types.map((type) => `<button class="lib-card ${state.placing === type ? 'active' : ''}" draggable="true" data-lib-type="${type}" title="${e(`${typeName(type)} — ${typeDesc(type)}`)}">
          <span class="lib-icon" style="--block:${BLOCK_TYPES[type].color}">${icon(BLOCK_TYPES[type].icon)}</span><b>${e(typeName(type))}</b><small>${e(typeDesc(type))}</small></button>`).join('') || `<div class="start-empty">${icon('info')}<span>${e(tt('library.none', 'No block matches.'))}</span></div>`}</div>
    </div>`;
}

// ───────────────────────── explorer

export function explorerHtml(model, state, live = null) {
  const q = state.explorerQuery.trim().toLowerCase();
  const sel = new Set(state.selection);
  const groups = CATEGORIES.map((c) => ({ id: c.id, icon: c.icon, blocks: model.blocks.filter((b) => BLOCK_TYPES[b.type].cat === c.id && (!q || b.name.toLowerCase().includes(q) || typeName(b.type).toLowerCase().includes(q))) })).filter((g) => g.blocks.length);
  const row = (b) => {
    const st = live?.(b.id);
    const badge = st ? (st.count != null ? `✓${st.count}` : st.value != null ? fmtNum(st.value) : '') : '';
    return `<div class="tree-row ${sel.has(b.id) ? 'selected' : ''}" data-select-block="${b.id}" title="${e(`${b.name} · ${typeName(b.type)}`)}">${icon(BLOCK_TYPES[b.type].icon)}<span class="tree-name">${e(b.name)}</span><small class="muted">${e(typeName(b.type))}</small>${badge ? `<span class="tree-badge">${e(badge)}</span>` : ''}</div>`;
  };
  const body = groups.map((g) => {
    const collapsed = state.collapsed.has(g.id);
    return `<div class="tree-group"><button class="tree-row tree-head" data-toggle-group="${g.id}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}${icon(g.icon)}<span class="tree-name">${e(tt(`category.${g.id}`, g.id))}</span><small class="muted">${g.blocks.length}</small></button>${collapsed ? '' : g.blocks.map(row).join('')}</div>`;
  }).join('');
  const links = model.links.length ? `<div class="tree-row tree-head static">${icon('connectTool')}<span class="tree-name">${e(tt('explorer.links', 'Links'))}</span><small class="muted">${model.links.length}</small></div>` : '';
  return `<div class="panel-header">${icon('outliner')}<span>${e(tt('panel.explorer', 'Model'))}</span><label class="search-box compact">${icon('search')}<input type="search" data-explorer-search value="${e(state.explorerQuery)}" placeholder="${e(tt('explorer.search', 'Find'))}"/></label><button class="icon-button" data-command="rightPanel" title="${e(tt('action.rightPanel', ''))}">${icon('foldRight')}</button></div>
    <div class="explorer-tree">${body || `<div class="start-empty">${icon('info')}<span>${e(tt('explorer.empty', 'The model is empty: drag blocks from the library.'))}</span></div>`}${links}</div>`;
}

// ───────────────────────── properties

const numberInput = (attr, value, { min = '', max = '', step = 'any', unit = '' } = {}) => `<span class="num-field"><input type="number" ${attr} value="${e(value)}" ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''} step="${step}"/>${unit ? `<i>${e(unit)}</i>` : ''}</span>`;
const propRow = (glyph, label, control, cls = '', tip = label) => `<div class="prop-row ${cls}" title="${e(tip)}"><span class="prop-label">${icon(glyph)}<span>${e(label)}</span></span><span class="prop-control">${control}</span></div>`;
const section = (id, glyph, title, body, state) => {
  const closed = state.closedSections.has(id);
  return `<div class="prop-section"><button class="prop-section-head" data-toggle-section="${id}">${icon(closed ? 'caretRight' : 'caretDown', 'icon tiny')}${icon(glyph)}<span>${e(title)}</span></button>${closed ? '' : `<div class="prop-section-body">${body}</div>`}</div>`;
};

const GROUP_ICONS = { main: 'sliders', entity: 'tag', resources: 'fPool', quality: 'check', failures: 'warning', cost: 'money', statechart: 'fStatechart' };
const PROP_ICONS = { time: 'clock', interarrival: 'clock', rate: 'speed', capacity: 'layers', look: 'design', pool: 'fPool', units: 'fPool', speed: 'speed', mtbf: 'warning', mttr: 'refresh', dwell: 'clock', equation: 'calculate', initial: 'fStock', value: 'fParameter', expression: 'calculate', color: 'palette', fill: 'palette', text: 'textTool', schedule: 'calendar' };

export function propertiesHtml(model, state, ctx) {
  const sel = state.selection;
  const blocks = sel.map((id) => model.blocks.find((b) => b.id === id)).filter(Boolean);
  const link = sel.length === 1 ? model.links.find((l) => l.id === sel[0]) : null;
  const header = (glyph, title) => `<div class="panel-header">${icon(glyph)}<span>${e(title)}</span></div>`;
  if (link) return header('connectTool', tt('props.link', 'Link')) + linkProps(model, link);
  if (blocks.length > 1) return header('selectAll', tt('props.multi', 'Selection')) + multiProps(blocks);
  if (blocks.length === 1) return header(BLOCK_TYPES[blocks[0].type].icon, typeName(blocks[0].type)) + blockProps(model, blocks[0], state, ctx);
  return header('gear', tt('props.model', 'Model settings')) + modelProps(model, state, ctx);
}

function blockProps(model, b, state, ctx) {
  const spec = BLOCK_TYPES[b.type];
  const locked = ctx.running;
  const out = [];
  out.push(`<div class="props"><div class="prop-master"><span class="lib-icon big" style="--block:${spec.color}">${icon(spec.icon)}</span><div class="grow"><input class="name-input" data-rename value="${e(b.name)}" aria-label="${e(tt('prop.name', 'Name'))}" ${locked ? 'disabled' : ''}/><small class="muted">${e(typeDesc(b.type))}</small></div></div>
    <div class="prop-buttons">
      <button class="small-button" data-command="duplicate" title="${e(tt('action.duplicate', ''))}" ${locked ? 'disabled' : ''}>${icon('duplicate')}</button>
      <button class="small-button" data-command="rotate90" title="${e(tt('action.rotate90', ''))}" ${locked || isPathType(b.type) ? 'disabled' : ''}>${icon('rotateRight')}</button>
      <button class="small-button" data-command="zoomSelection" title="${e(tt('action.zoomSelection', ''))}">${icon('zoomSelection')}</button>
      <span class="grow"></span>
      <button class="small-button danger" data-command="delete" title="${e(tt('action.delete', ''))}" ${locked ? 'disabled' : ''}>${icon('trash')}</button>
    </div>`);
  // Live numbers first while running: that is what the user looks at then.
  if (ctx.liveHtml) out.push(section('live', 'statistics', tt('props.live', 'Live statistics'), ctx.liveHtml, state));
  const groups = [...new Set(spec.props.map((p) => p.group))];
  for (const g of groups) {
    const rows = spec.props.filter((p) => p.group === g && (!p.when || p.when(b.props))).map((p) => propControl(model, b, p, locked && !p.live, ctx)).join('');
    if (rows) out.push(section(`g-${g}`, GROUP_ICONS[g] ?? 'sliders', tt(`group.${g}`, g), rows, state));
  }
  // Placement.
  const pos = [
    propRow('position', 'X', numberInput('data-pos="x"', round(b.x), { step: 0.5, unit: 'm' })),
    propRow('position', 'Y', numberInput('data-pos="y"', round(b.y), { step: 0.5, unit: 'm' })),
  ];
  if (!isPathType(b.type)) pos.push(propRow('rotateRight', tt('prop.rot', 'Rotation'), numberInput('data-pos="rot"', round(b.rot ?? 0), { step: 15, unit: '°' })));
  if (spec.resizable || b.w != null) { pos.push(propRow('autoSize', tt('prop.w', 'Width'), numberInput('data-pos="w"', round(b.w ?? spec.w), { min: 0.5, step: 0.5, unit: 'm' }))); pos.push(propRow('autoSize', tt('prop.h', 'Depth'), numberInput('data-pos="h"', round(b.h ?? spec.h), { min: 0.5, step: 0.5, unit: 'm' }))); }
  if (isPathType(b.type)) {
    const L = pathLength(pathPoints(b));
    pos.push(propRow('ruler', tt('prop.length', 'Length'), `<span class="prop-value">${L.toFixed(2)} m · ${b.points.length} ${e(tt('prop.points', 'points'))}</span>`));
    if (b.type !== 'wall' && Number(b.props.speed) > 0) pos.push(propRow('clock', tt('prop.travel', 'Travel time'), `<span class="prop-value">${fmtNum(L / Number(b.props.speed))} ${e(model.settings.timeUnit)}</span>`));
    pos.push(`<p class="panel-hint">${icon('bulb')}<span>${e(tt('props.pathHint', 'Drag the points on the canvas; double-click a segment to add a point; right-click a point to remove it.'))}</span></p>`);
  }
  out.push(section('placement', 'position', tt('group.placement', 'Placement'), pos.join(''), state));
  out.push('</div>');
  return out.join('');
}

const round = (v) => Math.round(Number(v) * 1000) / 1000;

function propControl(model, b, p, disabled, ctx) {
  const v = b.props[p.key];
  const unit = unitText(p.unit, model) || (COUNT_KEYS.has(p.key) && (p.type === 'int' || p.type === 'number') ? tt('unit.count', 'pcs') : '');
  const dis = disabled ? 'disabled' : '';
  const label = propName(p.key);
  const glyph = PROP_ICONS[p.key] ?? 'sliders';
  const hint = p.hint ? `<small class="prop-hint">${e(tt(`hint.${p.hint}`, ''))}</small>` : '';
  switch (p.type) {
    case 'number': case 'int':
      if (p.live && ctx.running) {
        const min = Number(b.props.min ?? 0); const max = Number(b.props.max ?? 10);
        return propRow(glyph, label, `<input type="range" data-live-param="${e(b.name)}" min="${min}" max="${max}" step="${(max - min) / 200 || 0.01}" value="${e(v)}"/><output>${fmtNum(v, 4)}</output>`, 'tall');
      }
      return propRow(glyph, label, numberInput(`data-prop="${p.key}" ${dis}`, v, { min: p.min ?? '', max: p.max ?? '', step: p.type === 'int' ? 1 : p.step ?? 'any', unit }) + hint, hint ? 'tall' : '');
    case 'text': return propRow(glyph, label, `<input type="text" data-prop="${p.key}" value="${e(v)}" ${dis}/>${hint}`, hint ? 'tall' : '');
    case 'bool': return propRow(glyph, label, `<label class="switch-wrap"><input type="checkbox" data-prop="${p.key}" ${v ? 'checked' : ''} ${dis}/><span class="switch"></span></label>`);
    case 'color': return propRow('palette', label, `<input type="color" data-prop="${p.key}" value="${e(v || '#888888')}" ${dis}/>${v === '' ? `<small class="muted">${e(tt('opt.none', '—'))}</small>` : ''}`);
    case 'select': return propRow(glyph, label, `<select data-prop="${p.key}" ${dis}>${p.options.map((o) => `<option value="${e(o)}" ${o === v ? 'selected' : ''}>${e(optName(p.key, o))}</option>`).join('')}</select>${hint}`, hint ? 'tall' : '');
    case 'pool': {
      const pools = model.blocks.filter((x) => baseOf(x.type) === 'resourcePool').map((x) => x.name);
      return propRow('fPool', label, `<select data-prop="${p.key}" ${dis}><option value="">${e(tt('opt.none', '—'))}</option>${pools.map((n) => `<option ${n === v ? 'selected' : ''}>${e(n)}</option>`).join('')}</select>${hint}`, hint ? 'tall' : '');
    }
    case 'ref': {
      const options = model.blocks.filter((x) => x.id !== b.id && (p.refBase === '*' ? BLOCK_TYPES[x.type].cat !== 'layout' && !['event', 'flow', 'variable', 'stock', 'lookup', 'smooth'].includes(baseOf(x.type)) : baseOf(x.type) === p.refBase)).map((x) => x.name);
      return propRow('connectTool', label, `<select data-prop="${p.key}" ${dis}><option value="">${e(tt('opt.none', '—'))}</option>${options.map((n) => `<option ${n === v ? 'selected' : ''}>${e(n)}</option>`).join('')}</select>${hint}`, hint ? 'tall' : '');
    }
    case 'expr': {
      const err = ctx.exprError?.(v);
      return propRow(glyph, label, `<input type="text" class="expr-input ${err ? 'invalid' : ''}" data-prop="${p.key}" value="${e(v)}" list="ref-names" spellcheck="false" ${dis}/>${err ? `<small class="prop-hint danger-text">${e(err)}</small>` : hint}${unit ? `<small class="prop-hint">${e(unit)}</small>` : ''}`, 'tall');
    }
    case 'dist': return distEditor(p, v ?? { type: 'constant', value: 0 }, unit, disabled, label, glyph);
    case 'types': return listEditor(p.key, label, v ?? [], [['name', 'text'], ['color', 'color'], ['weight', 'number']], disabled);
    case 'schedule': return listEditor(p.key, label, v ?? [], [['start', 'number'], ['end', 'number'], ['value', 'number']], disabled, p.valueKey, { start: model.settings.timeUnit, end: model.settings.timeUnit, value: p.valueKey === 'rate' ? `/${model.settings.timeUnit}` : tt('unit.count', 'pcs') });
    case 'states': return listEditor(p.key, label, v ?? [], [['name', 'text'], ['color', 'color']], disabled);
    case 'transitions': return transitionsEditor(b, v ?? [], disabled, label, model.settings.timeUnit);
    default: return '';
  }
}

function distEditor(p, d, unit, disabled, label, glyph) {
  const dis = disabled ? 'disabled' : '';
  // Each parameter is a sub-row: its name in the label column, the box in the control column (like every row).
  const params = (DISTRIBUTIONS[d.type] ?? []).map((k) => {
    const textual = d.type === 'empirical' || d.type === 'expression';
    const name = tt(`dist.${k}`, k);
    const control = textual
      ? `<input type="text" data-dist="${p.key}:${k}" value="${e(d[k] ?? '')}" ${dis} ${k === 'expr' ? 'list="ref-names"' : ''}/>`
      : numberInput(`data-dist="${p.key}:${k}" ${dis}`, d[k] ?? 0, { unit: UNITLESS_DIST.has(k) || d.type === 'poisson' ? '' : unit });
    return `<div class="prop-row dist-sub" title="${e(`${label} · ${name}`)}"><span class="prop-label"><span>${e(name)}</span></span><span class="prop-control">${control}</span></div>`;
  }).join('');
  let preview = '';
  if (d.type !== 'expression' && d.type !== 'constant') {
    const values = sampleMany(d, 1500, 3);
    const h = histogram(values, 22);
    const top = Math.max(...h.counts) || 1;
    preview = `<svg class="dist-preview" viewBox="0 0 220 40" preserveAspectRatio="none">${h.counts.map((c, i) => `<rect x="${i * 10 + 0.5}" y="${40 - (c / top) * 38}" width="9" height="${(c / top) * 38}" rx="1"/>`).join('')}</svg><div class="dist-range"><span>${fmtNum(h.min)}</span><span>${e(tt('dist.mean', 'mean'))} ${fmtNum(distMean(d))} ${e(unit)}</span><span>${fmtNum(h.max)}</span></div>`;
  }
  return `<div class="dist-group" title="${e(`${label}: ${formatDist(d)}`)}"><div class="prop-row dist-row"><span class="prop-label">${icon(glyph)}<span>${e(label)}</span></span><span class="prop-control">
      <select data-dist-kind="${p.key}" ${dis}>${DIST_KINDS.map((k) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${e(tt(`distKind.${k}`, k))}</option>`).join('')}</select></span></div>
      ${params}${preview ? `<div class="dist-preview-row">${preview}</div>` : ''}</div>`;
}

function listEditor(key, label, rows, fields, disabled, valueKey = '', units = {}) {
  const dis = disabled ? 'disabled' : '';
  const head = fields.map(([f]) => `<span>${e(tt(`col.${f === 'value' && valueKey ? valueKey : f}`, f))}</span>`).join('');
  const body = rows.map((r, i) => `<div class="list-row" style="--cols:${fields.length}">${fields.map(([f, kind]) => kind === 'color' ? `<input type="color" data-list="${key}:${i}:${f}" value="${e(r[f] ?? '#888888')}" ${dis}/>` : `<input type="${kind === 'number' ? 'number' : 'text'}" step="any" data-unit="${e(kind === 'number' ? units[f] ?? '' : '')}" data-list="${key}:${i}:${f}" value="${e(r[f] ?? '')}" ${dis}/>`).join('')}<button class="icon-button" data-list-del="${key}:${i}" title="${e(tt('action.delete', ''))}" ${dis}>${icon('close')}</button></div>`).join('');
  return `<div class="prop-row tall list-prop"><span class="prop-label">${icon('list')}<span>${e(label)}</span></span><span class="prop-control column">
    <div class="list-row head" style="--cols:${fields.length}">${head}<span></span></div>${body}
    <button class="small-button" data-list-add="${key}" ${dis}>${icon('plus')}<span>${e(tt('props.addRow', 'Add'))}</span></button></span></div>`;
}

function transitionsEditor(b, rows, disabled, label, tu = '') {
  const trUnit = (kind) => ({ rate: `/${tu}`, timeout: tu, contact: `/${tu}`, neighbors: tt('unit.count', 'pcs'), neighborsOutside: tt('unit.count', 'pcs') }[kind] ?? '');
  const dis = disabled ? 'disabled' : '';
  const states = (b.props.states ?? []).map((s) => s.name);
  const sel = (i, f, value) => `<select data-list="transitions:${i}:${f}" ${dis}>${states.map((s) => `<option ${s === value ? 'selected' : ''}>${e(s)}</option>`).join('')}</select>`;
  const body = rows.map((r, i) => `<div class="tr-card">
      <div class="tr-line">${sel(i, 'from', r.from)}<span>→</span>${sel(i, 'to', r.to)}<button class="icon-button" data-list-del="transitions:${i}" ${dis}>${icon('close')}</button></div>
      <div class="tr-line"><select data-list="transitions:${i}:kind" ${dis}>${(baseOf(b.type) === 'cellGrid' ? ['rate', 'timeout', 'contact', 'neighbors', 'neighborsOutside', 'condition'] : ['rate', 'timeout', 'contact', 'condition']).map((k) => `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${e(tt(`trKind.${k}`, k))}</option>`).join('')}</select>
        <input type="${r.kind === 'condition' ? 'text' : 'number'}" step="any" data-unit="${e(trUnit(r.kind))}" data-list="transitions:${i}:value" value="${e(r.value ?? '')}" title="${e(tt(`trValue.${r.kind}`, ''))}" ${dis}/></div>
      ${r.kind === 'contact' && baseOf(b.type) !== 'cellGrid' ? `<div class="tr-line"><span class="muted">${e(tt('col.trigger', 'with'))}</span>${sel(i, 'trigger', r.trigger)}<span class="muted">${e(tt('col.radius', 'radius'))}</span><input type="number" step="any" data-unit="m" data-list="transitions:${i}:radius" value="${e(r.radius ?? 1)}" ${dis}/></div>` : ''}
      ${baseOf(b.type) === 'cellGrid' && ['contact', 'neighbors', 'neighborsOutside'].includes(r.kind) ? `<div class="tr-line"><span class="muted">${e(tt('col.trigger', 'with'))}</span>${sel(i, 'trigger', r.trigger)}${r.kind !== 'contact' ? `<span class="muted">${e(tt('col.max', 'max'))}</span><input type="number" step="1" data-unit="${e(tt('unit.count', 'pcs'))}" data-list="transitions:${i}:max" value="${e(r.max ?? 8)}" ${dis}/>` : ''}</div>` : ''}
      <small class="prop-hint">${e(tt(`trValue.${r.kind}`, ''))}</small>
    </div>`).join('');
  return `<div class="prop-row tall list-prop"><span class="prop-label">${icon('fStatechart')}<span>${e(label)}</span></span><span class="prop-control column">${body}<button class="small-button" data-list-add="transitions" ${dis}>${icon('plus')}<span>${e(tt('props.addTransition', 'Add transition'))}</span></button></span></div>`;
}

function linkProps(model, l) {
  const a = model.blocks.find((b) => b.id === l.from.block); const b = model.blocks.find((x) => x.id === l.to.block);
  return `<div class="props">
    ${propRow('fSource', tt('props.from', 'From'), `<span class="prop-value">${e(a?.name ?? '?')}${l.from.port >= 0 ? ` · ${e(tt('props.port', 'port'))} ${l.from.port + 1}` : ''}</span>`)}
    ${propRow('fSink', tt('props.to', 'To'), `<span class="prop-value">${e(b?.name ?? '?')}${l.to.port >= 0 ? ` · ${e(tt('props.port', 'port'))} ${l.to.port + 1}` : ''}</span>`)}
    ${propRow('connectTool', tt('props.kind', 'Kind'), `<span class="prop-value">${e(tt(`linkKind.${l.kind}`, l.kind))}</span>`)}
    ${propRow('polyline', tt('props.bends', 'Bends'), `<span class="prop-value">${(l.points ?? []).length}</span>`)}
    <div class="prop-actions"><button class="small-button" data-command="straighten">${icon('routeStraight')}<span>${e(tt('action.straighten', 'Straighten'))}</span></button><button class="small-button danger" data-command="delete">${icon('trash')}<span>${e(tt('action.delete', 'Delete'))}</span></button></div>
    <p class="panel-hint">${icon('bulb')}<span>${e(tt('props.linkHint', 'Drag the link to add a bend; drag a bend to move it.'))}</span></p>
  </div>`;
}

function multiProps(blocks) {
  const align = ['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distributeH', 'distributeV'];
  return `<div class="props"><p class="prop-value">${e(tt('props.selected', '{n} blocks selected').replace('{n}', blocks.length))}</p>
    <div class="prop-buttons wrap">${align.map((a) => `<button class="small-button" data-command="${a}" title="${e(tt(`action.${a}`, a))}">${icon(a)}</button>`).join('')}</div>
    <div class="prop-actions"><button class="small-button" data-command="duplicate">${icon('duplicate')}<span>${e(tt('action.duplicate', ''))}</span></button><button class="small-button danger" data-command="delete">${icon('trash')}<span>${e(tt('action.delete', ''))}</span></button></div>
    <ul class="prop-list">${blocks.map((b) => `<li>${icon(BLOCK_TYPES[b.type].icon)}<span>${e(b.name)}</span></li>`).join('')}</ul></div>`;
}

function modelProps(model, state, ctx) {
  const s = model.settings;
  const locked = ctx.running ? 'disabled' : '';
  const n = (key, label, glyph, opts = {}) => propRow(glyph, label, numberInput(`data-model="${key}" ${locked}`, s[key], opts));
  const byParadigm = { de: 0, sd: 0, abm: 0, layout: 0 };
  for (const b of model.blocks) byParadigm[PARADIGM[BLOCK_TYPES[b.type].cat]] += 1;
  const rows = [
    propRow('textTool', tt('model.name', 'Name'), `<input type="text" data-model-text="name" value="${e(model.name)}" ${locked}/>`),
    propRow('notes', tt('model.description', 'Description'), `<textarea data-model-text="description" rows="2" ${locked}>${e(model.description)}</textarea>`, 'tall'),
    propRow('clock', tt('model.timeUnit', 'Time unit'), `<select data-model="timeUnit" ${locked}>${['s', 'min', 'h', 'day'].map((u) => `<option value="${u}" ${u === s.timeUnit ? 'selected' : ''}>${e(tt(`unit.${u}`, u))}</option>`).join('')}</select>`),
    n('duration', tt('model.duration', 'Run length'), 'hourglass', { min: 0, unit: s.timeUnit }),
    n('warmup', tt('model.warmup', 'Warm-up'), 'hourglass', { min: 0, unit: s.timeUnit }),
    n('seed', tt('model.seed', 'Random seed'), 'dice', { step: 1 }),
    propRow('dice', tt('model.randomSeed', 'New seed each run'), `<label class="switch-wrap"><input type="checkbox" data-model="randomSeed" ${s.randomSeed ? 'checked' : ''} ${locked}/><span class="switch"></span></label>`),
  ];
  const sd = [
    n('sdDt', tt('model.sdDt', 'SD time step'), 'fStock', { min: 0.0001, unit: s.timeUnit }),
    propRow('calculate', tt('model.sdMethod', 'Integration'), `<select data-model="sdMethod" ${locked}><option value="euler" ${s.sdMethod === 'euler' ? 'selected' : ''}>Euler</option><option value="rk4" ${s.sdMethod === 'rk4' ? 'selected' : ''}>Runge–Kutta 4</option></select>`),
    n('agentDt', tt('model.agentDt', 'Agent time step'), 'fAgents', { min: 0.0001, unit: s.timeUnit }),
    n('sampleInterval', tt('model.sampleInterval', 'Chart sampling'), 'fChart', { min: 0, unit: s.timeUnit }),
  ];
  const layout = [
    n('floorWidth', tt('model.floorWidth', 'Floor width'), 'autoSize', { min: 10, unit: 'm' }),
    n('floorDepth', tt('model.floorDepth', 'Floor depth'), 'autoSize', { min: 10, unit: 'm' }),
    n('costPerEntity', tt('model.costPerEntity', 'Cost per finished item'), 'money', { min: 0 }),
  ];
  const summary = `<div class="badges model-badges"><span class="badge">${icon('fProcessCat')}${e(tt('paradigm.de', 'Discrete event'))} ${byParadigm.de}</span><span class="badge">${icon('fStock')}${e(tt('paradigm.sd', 'System dynamics'))} ${byParadigm.sd}</span><span class="badge">${icon('fAgents')}${e(tt('paradigm.abm', 'Agents'))} ${byParadigm.abm}</span><span class="badge">${icon('connectTool')}${e(tt('explorer.links', 'Links'))} ${model.links.length}</span></div>`;
  return `<div class="props">${summary}${section('m-run', 'runPlay', tt('group.run', 'Run'), rows.join(''), state)}${section('m-sd', 'fStock', tt('group.continuous', 'Continuous time'), sd.join(''), state)}${section('m-layout', 'tplFactory', tt('group.layout', 'Layout and cost'), layout.join(''), state)}
    <p class="panel-hint">${icon('bulb')}<span>${e(tt('props.modelHint', 'Select a block to edit it. Names in equations: Block.metric, SD names, Population.State, time.'))}</span></p></div>`;
}

/** The names equations can use, for <datalist id="ref-names">. */
export function refNamesDatalist(model) {
  return `<datalist id="ref-names">${[...referenceNames(model).keys()].map((n) => `<option value="${e(n)}"></option>`).join('')}</datalist>`;
}

/** Live numbers of one block (properties panel while running / after a run). */
export function liveHtml(summary, model) {
  if (!summary) return '';
  const u = model.settings.timeUnit;
  const labels = {
    in: ['statIn', ''], out: ['statOut', ''], arrivals: ['statArrivals', ''], lost: ['statLost', ''], waiting: ['statWaiting', ''], contentsMean: ['statContentsMean', ''], contentsMax: ['statContentsMax', ''],
    utilization: ['statUtilization', '%'], blockedShare: ['statBlocked', '%'], downShare: ['statDown', '%'], idleShare: ['statIdle', '%'], processMean: ['statProcessMean', u], rejects: ['statRejects', ''], failures: ['statFailures', ''],
    lengthMean: ['statLengthMean', ''], lengthMax: ['statLengthMax', ''], waitMean: ['statWaitMean', u], waitMax: ['statWaitMax', u], reneged: ['statReneged', ''],
    cycleMean: ['statCycleMean', u], cycleSd: ['statCycleSd', u], cycleMax: ['statCycleMax', u], throughput: ['statThroughput', `/${u}`], transitMean: ['statTransit', u], capacity: ['statCapacity', ''],
    fillMean: ['statFill', '%'], dwellMean: ['statDwell', u], distance: ['statDistance', 'm'], fleet: ['statFleet', ''], openShare: ['statOpen', '%'], busyMean: ['statBusyMean', ''], cost: ['statCost', ''], agents: ['statAgents', ''], transitions: ['statTransitions', ''],
  };
  const rows = Object.entries(summary).filter(([k, v]) => labels[k] && typeof v === 'number').map(([k, v]) => {
    const [key, unit] = labels[k];
    const text = unit === '%' ? pct(v) : `${fmtNum(v)}${unit ? ` ${unit}` : ''}`;
    return `<div class="stat-row"><span>${e(tt(`stat.${key}`, key))}</span><b>${e(text)}</b></div>`;
  });
  if (summary.states) rows.push(...Object.entries(summary.states).map(([name, st]) => `<div class="stat-row"><span>${e(name)}</span><b>${st.now} <small class="muted">(${e(tt('stat.mean', 'mean'))} ${fmtNum(st.mean)})</small></b></div>`));
  return `<div class="props-stats">${rows.join('')}</div>`;
}

// ───────────────────────── bottom panel

export const BOTTOM_TABS = [['diagnosis', 'bottleneck'], ['stats', 'statistics'], ['charts', 'fChart'], ['problems', 'problems'], ['log', 'trace'], ['experiments', 'experiment']];

export function bottomTabsHtml(state, counts) {
  const badge = (id) => {
    if (id === 'problems') { const c = counts.problems; return c.error ? `<span class="tab-count bad">${c.error}</span>` : c.warning ? `<span class="tab-count warn">${c.warning}</span>` : ''; }
    if (id === 'diagnosis' && counts.issues) { const n = counts.issues.filter((x) => x.severity === 'error' || x.severity === 'warning').length; return n ? `<span class="tab-count warn">${n}</span>` : counts.issues.some((x) => x.severity === 'success') ? '<span class="tab-count good">✓</span>' : ''; }
    if (id === 'log') return counts.log ? `<span class="tab-count">${counts.log}</span>` : '';
    return '';
  };
  return `<div class="bottom-tabs">${BOTTOM_TABS.map(([id, glyph]) => `<button class="bottom-tab ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}">${icon(glyph)}<span>${e(tt(`bottom.${id}`, id))}</span>${badge(id)}</button>`).join('')}<span class="grow"></span><button class="icon-button" data-command="bottomPanel" title="${e(tt('action.bottomPanel', ''))}">${icon('foldBottom')}</button></div>`;
}

/** KPI cards and per-block tables. */
export function statsHtml(results, model) {
  if (!results) return emptyBottom('runPlay', tt('stats.empty', 'Run the model (F5) to see statistics.'));
  const k = results.kpi; const u = model.settings.timeUnit;
  const kpi = (glyph, label, value, cls = '') => `<div class="kpi ${cls}">${icon(glyph)}<div><small>${e(label)}</small><b>${e(value)}</b></div></div>`;
  const cards = [
    kpi('clock', tt('kpi.time', 'Model time'), `${fmtNum(results.time)} ${u}`),
    kpi('fSink', tt('kpi.completed', 'Completed'), String(k.completed)),
    kpi('speed', tt('kpi.throughput', 'Throughput'), `${fmtNum(k.throughput, 3)} /${u}`),
    kpi('hourglass', tt('kpi.cycle', 'Mean cycle time'), `${fmtNum(k.cycleMean)} ${u}`),
    kpi('layers', tt('kpi.wip', 'Mean WIP'), fmtNum(k.wipMean)),
    kpi('bottleneck', tt('kpi.bottleneck', 'Bottleneck'), k.bottleneck ? `${k.bottleneck.name} ${pct(k.bottleneck.utilization)}` : '—', k.bottleneck?.utilization > 0.9 ? 'bad' : ''),
    k.lost ? kpi('warning', tt('kpi.lost', 'Lost'), String(k.lost), 'bad') : '',
    k.cost ? kpi('money', tt('kpi.cost', 'Cost'), fmtNum(k.cost)) : '',
  ].join('');
  const entries = Object.entries(results.blocks);
  const busy = entries.filter(([, b]) => b.utilization != null && (b.base ?? b.type) !== 'resourcePool');
  const util = busy.length ? stackRows(busy.map(([name, b]) => ({ label: name, parts: [{ name: tt('stat.statUtilization', 'busy'), value: b.utilization ?? 0, color: '#22c55e' }, { name: tt('stat.statBlocked', 'blocked'), value: b.blockedShare ?? 0, color: '#f97316' }, { name: tt('stat.statDown', 'failed'), value: b.downShare ?? 0, color: '#ef4444' }] }))) : '';
  const pools = entries.filter(([, b]) => (b.base ?? b.type) === 'resourcePool');
  const poolBars = pools.length ? barRows(pools.map(([name, b]) => ({ label: name, value: b.utilization }))) : '';
  const table = (title, types, cols) => {
    const rows = entries.filter(([, b]) => types.includes(b.base ?? b.type));
    if (!rows.length) return '';
    return `<div class="stat-table"><h4>${e(title)}</h4><table><thead><tr><th>${e(tt('col.name', 'Name'))}</th>${cols.map(([, label]) => `<th>${e(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(([name, b]) => `<tr data-select-name="${e(name)}"><td>${e(name)}</td>${cols.map(([key, , f]) => `<td>${e(f ? f(b[key]) : fmtNum(b[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const tables = [
    table(tt('stats.servers', 'Stations'), ['process', 'delay', 'robot', 'dock', 'combine'], [['in', tt('stat.statIn', 'In')], ['out', tt('stat.statOut', 'Out')], ['utilization', tt('stat.statUtilization', 'Busy'), pct], ['blockedShare', tt('stat.statBlocked', 'Blocked'), pct], ['downShare', tt('stat.statDown', 'Failed'), pct], ['processMean', `${tt('stat.statProcessMean', 'Time')} (${u})`], ['rejects', tt('stat.statRejects', 'Rejects')]]),
    table(tt('stats.queues', 'Queues'), ['queue'], [['out', tt('stat.statOut', 'Out')], ['lengthMean', tt('stat.statLengthMean', 'Mean length')], ['lengthMax', tt('stat.statLengthMax', 'Max')], ['waitMean', `${tt('stat.statWaitMean', 'Mean wait')} (${u})`], ['waitMax', `${tt('stat.statWaitMax', 'Max wait')} (${u})`], ['reneged', tt('stat.statReneged', 'Left')]]),
    table(tt('stats.measures', 'Time measurement and areas'), ['timeEnd', 'restrictedStart', 'match', 'maintenance', 'event'], [['out', tt('stat.statOut', 'Out')], ['timeMean', `${tt('stat.statTimeMean', 'Mean time')} (${u})`], ['timeMax', `${tt('stat.statTimeMax', 'Max time')} (${u})`], ['insideMean', tt('stat.statInside', 'Mean inside')], ['pairs', tt('stat.statPairs', 'Pairs')], ['maintenances', tt('stat.statMaint', 'Maintenances')], ['fired', tt('stat.statFired', 'Fired')]]),
    table(tt('stats.flows', 'Sources and sinks'), ['source', 'sink'], [['arrivals', tt('stat.statArrivals', 'Arrivals')], ['out', tt('stat.statOut', 'Out')], ['cycleMean', `${tt('stat.statCycleMean', 'Cycle')} (${u})`], ['throughput', `${tt('stat.statThroughput', 'Throughput')} (/${u})`], ['lost', tt('stat.statLost', 'Lost')]]),
    table(tt('stats.handling', 'Handling and storage'), ['conveyor', 'road', 'transporter', 'rack', 'parking'], [['in', tt('stat.statIn', 'In')], ['out', tt('stat.statOut', 'Out')], ['contentsMean', tt('stat.statContentsMean', 'Mean contents')], ['utilization', tt('stat.statUtilization', 'Busy'), pct], ['fillMean', tt('stat.statFill', 'Fill'), pct], ['transitMean', `${tt('stat.statTransit', 'Transit')} (${u})`]]),
  ].join('');
  const sd = Object.entries(results.sd);
  const sdTable = sd.length ? `<div class="stat-table"><h4>${e(tt('paradigm.sd', 'System dynamics'))}</h4><table><thead><tr><th>${e(tt('col.name', 'Name'))}</th><th>${e(tt('col.kind', 'Kind'))}</th><th>${e(tt('col.value', 'Value'))}</th></tr></thead><tbody>${sd.map(([name, v]) => `<tr data-select-name="${e(name)}"><td>${e(name)}</td><td>${e(typeName(v.kind))}</td><td>${fmtNum(v.value, 3)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const pops = entries.filter(([, b]) => ['population', 'cellGrid'].includes(b.base ?? b.type));
  const popTable = pops.map(([name, b]) => `<div class="stat-table"><h4>${e(name)}</h4><table><thead><tr><th>${e(tt('col.state', 'State'))}</th><th>${e(tt('col.now', 'Now'))}</th><th>${e(tt('stat.mean', 'Mean'))}</th><th>${e(tt('stat.statContentsMax', 'Max'))}</th></tr></thead><tbody>${Object.entries(b.states).map(([s, v]) => `<tr><td>${e(s)}</td><td>${v.now}</td><td>${fmtNum(v.mean)}</td><td>${v.max}</td></tr>`).join('')}</tbody></table></div>`).join('');
  const advice = adviceHtml(results);
  return `<div class="stats-view"><div class="kpis">${cards}</div>${advice}<div class="stats-columns">${util ? `<div class="stat-table"><h4>${e(tt('stats.utilization', 'Utilization'))}</h4>${util}<div class="legend"><i style="background:#22c55e"></i>${e(tt('stat.statUtilization', 'Busy'))}<i style="background:#f97316"></i>${e(tt('stat.statBlocked', 'Blocked'))}<i style="background:#ef4444"></i>${e(tt('stat.statDown', 'Failed'))}</div></div>` : ''}${poolBars ? `<div class="stat-table"><h4>${e(tt('stats.pools', 'Resource pools'))}</h4>${poolBars}</div>` : ''}</div>${tables}${sdTable}${popTable}</div>`;
}

/** Plain advice from the results: the bottleneck, starving or blocked stations, long queues. */
export function adviceHtml(results) {
  const tips = [];
  const k = results.kpi;
  if (k.bottleneck && k.bottleneck.utilization > 0.85) tips.push(['bottleneck', tt('advice.bottleneck', '{name} is busy {u} of the time — it limits the flow. Add capacity there or shorten its process time.').replace('{name}', k.bottleneck.name).replace('{u}', pct(k.bottleneck.utilization))]);
  for (const [name, b] of Object.entries(results.blocks)) {
    if (b.blockedShare > 0.15) tips.push(['warning', tt('advice.blocked', '{name} is blocked {u} of the time: the next step cannot take its output. Add buffer space after it.').replace('{name}', name).replace('{u}', pct(b.blockedShare))]);
    if (b.downShare > 0.1) tips.push(['warning', tt('advice.down', '{name} is down {u} of the time. Better maintenance would help.').replace('{name}', name).replace('{u}', pct(b.downShare))]);
    if ((b.base ?? b.type) === 'queue' && b.lengthMax >= 50) tips.push(['fQueue', tt('advice.queue', '{name} grew to {n}: arrivals outpace the next step.').replace('{name}', name).replace('{n}', b.lengthMax)]);
    if (b.lost > 0) tips.push(['warning', tt('advice.lost', '{name} lost {n} arrivals because the next step was full.').replace('{name}', name).replace('{n}', b.lost)]);
    if (b.reneged > 0) tips.push(['fQueue', tt('advice.reneged', '{n} left {name} after waiting too long.').replace('{name}', name).replace('{n}', b.reneged)]);
  }
  if (!tips.length) return '';
  return `<ul class="advice">${tips.slice(0, 6).map(([g, text]) => `<li>${icon(g)}<span>${e(text)}</span></li>`).join('')}</ul>`;
}

/** Dashboard charts: the model's own charts plus WIP / output over time and a station state timeline. */
export function chartsHtml(sim, model) {
  if (!sim || sim.series.t.length < 2) return emptyBottom('fChart', tt('charts.empty', 'Charts fill in while the model runs.'));
  const times = sim.series.t;
  const get = (k) => sim.series.data.get(k) ?? [];
  const cards = [];
  model.charts.forEach((c, i) => {
    const series = c.series.map((k) => ({ name: k, values: get(k) }));
    cards.push(`<div class="chart-card"><div class="chart-head"><b>${e(c.title || c.series.join(', '))}</b><span class="grow"></span><button class="icon-button" data-chart-edit="${i}" title="${e(tt('charts.edit', 'Edit'))}">${icon('edit')}</button><button class="icon-button" data-chart-del="${i}" title="${e(tt('action.delete', 'Delete'))}">${icon('close')}</button></div>${lineChart(times, series, { area: c.kind === 'area', xLabel: model.settings.timeUnit })}</div>`);
  });
  if (model.blocks.some((b) => b.type === 'sink')) {
    cards.push(`<div class="chart-card"><div class="chart-head"><b>${e(tt('charts.wip', 'Work in process and output'))}</b></div>${lineChart(times, [{ name: tt('kpi.wip', 'WIP'), values: get('wip') }, { name: tt('kpi.completed', 'Completed'), values: get('completed') }], { xLabel: model.settings.timeUnit })}</div>`);
  }
  const stations = [...sim.nodes.values()].filter((n) => n.timeline?.length).slice(0, 12);
  if (stations.length) {
    const colors = { idle: '#eab308', busy: '#22c55e', blocked: '#f97316', failed: '#ef4444' };
    cards.push(`<div class="chart-card wide"><div class="chart-head"><b>${e(tt('charts.timeline', 'Station states'))}</b><span class="grow"></span><span class="legend">${Object.entries(colors).map(([k, c]) => `<i style="background:${c}"></i>${e(tt(`state.${k}`, k))}`).join('')}</span></div>${timelineChart(stations.map((n) => ({ label: n.name, segments: n.timeline })), sim.now, { colors })}</div>`);
  }
  const sinks = [...sim.nodes.values()].filter((n) => n.base === 'sink' && n.cycle?.n > 0);
  if (sinks.length) {
    cards.push(`<div class="chart-card"><div class="chart-head"><b>${e(tt('charts.cycleHistogram', 'Cycle times'))}</b></div>${histogramChart(sim.cycleSamples ?? [], { title: '' })}</div>`);
  }
  return `<div class="charts-view"><div class="chart-tools"><button class="small-button" data-command="addChart">${icon('plus')}<span>${e(tt('action.addChart', 'Add chart'))}</span></button></div><div class="chart-grid">${cards.join('')}</div></div>`;
}

export function problemsHtml(problems, state) {
  const counts = countBySeverity(problems);
  const filter = state.problemFilter;
  const list = problems.filter((p) => filter === 'all' || p.severity === filter);
  const SEV = { error: 'error', warning: 'warning', info: 'info' };
  const chip = (id, label, n) => `<button class="segment ${filter === id ? 'active' : ''}" data-problem-filter="${id}">${id !== 'all' ? icon(SEV[id]) : ''}${e(label)} ${n}</button>`;
  return `<div class="problems-view"><div class="problems-header"><span class="segmented small">${chip('all', tt('problems.all', 'All'), problems.length)}${chip('error', tt('problems.errors', 'Errors'), counts.error)}${chip('warning', tt('problems.warnings', 'Warnings'), counts.warning)}${chip('info', tt('problems.infos', 'Notes'), counts.info)}</span><span class="grow"></span><button class="small-button" data-command="checkNow">${icon('refresh')}<span>${e(tt('action.checkNow', 'Check'))}</span></button></div>
    <div class="problems-list">${list.length ? list.map((p) => { const fixes = checkFixes(p); return `<div class="problem-row sev-${p.severity}" ${p.block ? `data-select-block="${p.block}"` : ''}>${icon(SEV[p.severity])}<span>${e(t(`check.${p.key}`, p.params, p.key))}${fixes.length ? `<small class="problem-fix">${icon('bulb', 'icon tiny')}${e(fixes.map((f) => t(`fix.${f.key}`, f.params, f.key)).join(' · '))}</small>` : ''}</span></div>`; }).join('') : `<div class="problems-empty">${icon('check')}<span>${e(tt('problems.none', 'No problems.'))}</span></div>`}</div></div>`;
}

export function logHtml(logs, model) {
  if (!logs.length) return emptyBottom('trace', tt('log.empty', 'Notable events (breakdowns, repairs, customers leaving, errors) and your messages appear here.'));
  const u = model?.settings.timeUnit ?? '';
  return `<div class="log-view"><table><tbody>${[...logs].reverse().slice(0, 400).map((l) => `<tr class="log-${e(l.kind)}"><td class="muted">${l.t != null ? `${fmtNum(l.t)} ${e(u)}` : e(l.at ?? '')}</td><td>${icon(l.kind === 'error' ? 'error' : l.kind === 'failure' ? 'warning' : l.kind === 'repair' ? 'check' : 'info')}</td><td>${e(l.block ?? '')}</td><td>${e(l.text ?? t(`log.${l.kind}`, l, l.kind))}</td></tr>`).join('')}</tbody></table></div>`;
}

/** The experiments tab: the last experiment, then the saved scenarios side by side. */
export function experimentsHtml(exp, model, scenarios = []) {
  const scen = scenariosHtml(scenarios);
  if (!exp) return scen ? `<div class="exp-view">${scen}</div>` : emptyBottom('experiment', tt('exp.empty', 'Experiments run the model many times: parameter variation, Monte Carlo replications and optimization. Simulation › Experiment…'));
  const body = experimentHtml(exp, model);
  return scen ? body.replace(/<\/div>$/, `${scen}</div>`) : body;
}

const EXP_GLYPH = { montecarlo: 'montecarlo', optimize: 'optimize', sensitivity: 'fTornado', multiopt: 'fMultiOpt' };

function experimentHtml(exp, model) {
  const u = model.settings.timeUnit;
  const head = `<div class="exp-head">${icon(EXP_GLYPH[exp.kind] ?? 'experiment')}<b>${e(tt(`exp.kind.${exp.kind}`, exp.kind))}</b><span class="muted">${e(exp.objective)}${exp.parameter ? ` · ${e(exp.parameter)}` : ''} · ${exp.runCount ?? exp.runs.length} ${e(tt('exp.runs', 'runs'))} · ${fmtNum(exp.seconds)} s</span><span class="grow"></span><button class="small-button" data-command="exportExperimentCsv">${icon('csvFile')}<span>CSV</span></button></div>`;
  if (exp.kind === 'montecarlo') {
    const v = exp.runs.map((r) => r.value);
    return `<div class="exp-view">${head}<div class="kpis"><div class="kpi">${icon('calculate')}<div><small>${e(tt('exp.mean', 'Mean'))}</small><b>${fmtNum(exp.mean, 3)}</b></div></div><div class="kpi">${icon('ruler')}<div><small>${e(tt('exp.ci', '95% interval'))}</small><b>±${fmtNum(exp.ci, 3)}</b></div></div><div class="kpi">${icon('minus')}<div><small>${e(tt('exp.min', 'Min'))}</small><b>${fmtNum(Math.min(...v), 3)}</b></div></div><div class="kpi">${icon('plus')}<div><small>${e(tt('exp.max', 'Max'))}</small><b>${fmtNum(Math.max(...v), 3)}</b></div></div></div>${histogramChart(v, { width: 640, height: 180, title: exp.objective })}</div>`;
  }
  if (exp.kind === 'sensitivity') return `<div class="exp-view">${head}<p class="exp-best">${icon('info')}<span>${e(t('exp.sensBase', { obj: exp.objective, v: fmtNum(exp.baseValue, 4), p: exp.percent }))}</span></p><div class="exp-columns">${tornadoChart(exp)}<table class="exp-table"><thead><tr><th>${e(tt('exp.parameter', 'Parameter'))}</th><th>${e(tt('exp.low', 'Low'))}</th><th>${e(tt('exp.high', 'High'))}</th><th>${e(tt('exp.swing', 'Swing'))}</th></tr></thead><tbody>${exp.rows.map((r) => `<tr><td>${e(r.label)}</td><td>${fmtNum(r.low, 4)} → ${fmtNum(r.lowValue, 4)}</td><td>${fmtNum(r.high, 4)} → ${fmtNum(r.highValue, 4)}</td><td><b>${fmtNum(r.swing, 4)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  if (exp.kind === 'multiopt') {
    const h = exp.history;
    const chart = lineChart(h.map((_, i) => i + 1), [{ name: tt('exp.bestSoFar', 'Best so far'), values: h.map((x) => x.best) }, { name: exp.objective, values: h.map((x) => x.value) }], { width: 640, height: 200, xLabel: tt('exp.evaluation', 'Run'), legend: true });
    const better = (a, b) => (exp.goal === 'minimize' ? a.value - b.value : b.value - a.value);
    const top = [...h].filter((x) => Number.isFinite(x.value)).sort(better).slice(0, 10);
    const bestText = exp.params.map((p, k) => `${p.label} = ${fmtNum(exp.best.values[k], 4)}`).join(' · ');
    return `<div class="exp-view">${head}<p class="exp-best">${icon('star')}<span>${e(t('exp.multiBest', { params: bestText, obj: exp.objective, v: fmtNum(exp.best.value, 4), n: exp.evaluations, space: exp.space }))}</span></p><div class="exp-columns">${chart}<table class="exp-table"><thead><tr><th>#</th>${exp.params.map((p) => `<th>${e(p.label)}</th>`).join('')}<th>${e(exp.objective)}</th></tr></thead><tbody>${top.map((x, i) => `<tr class="${i === 0 ? 'best' : ''}"><td>${i + 1}</td>${x.values.map((v) => `<td>${fmtNum(v, 4)}</td>`).join('')}<td>${fmtNum(x.value, 4)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const xs = [...new Set(exp.runs.map((r) => r.x))];
  const means = xs.map((x) => { const vals = exp.runs.filter((r) => r.x === x).map((r) => r.value); return vals.reduce((a, b) => a + b, 0) / vals.length; });
  const best = exp.best;
  const chart = lineChart(xs, [{ name: exp.objective, values: means }], { width: 640, height: 200, xLabel: exp.parameter, legend: false });
  const rows = xs.map((x, i) => `<tr class="${best && best.x === x ? 'best' : ''}"><td>${fmtNum(x, 4)}</td><td>${fmtNum(means[i], 4)}</td><td>${exp.runs.filter((r) => r.x === x).length}</td></tr>`).join('');
  return `<div class="exp-view">${head}${best ? `<p class="exp-best">${icon('star')}<span>${e(tt('exp.best', 'Best: {param} = {x} → {obj} = {v}').replace('{param}', exp.parameter).replace('{x}', fmtNum(best.x, 4)).replace('{obj}', exp.objective).replace('{v}', fmtNum(best.value, 4)))}</span></p>` : ''}<div class="exp-columns">${chart}<table class="exp-table"><thead><tr><th>${e(exp.parameter)}</th><th>${e(exp.objective)}</th><th>${e(tt('exp.runs', 'runs'))}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">${e(tt('exp.unit', 'Time unit: {u}').replace('{u}', u))}</p></div>`;
}

/** Tornado chart: per parameter, the objective at its low (blue) and high (orange) value around the base. */
function tornadoChart(exp) {
  const rows = exp.rows; const W = 640; const L = 220; const rowH = 26; const H = rows.length * rowH + 34;
  const max = Math.max(1e-12, ...rows.flatMap((r) => [Math.abs(r.effectLow), Math.abs(r.effectHigh)]));
  const mid = L + (W - L - 20) / 2; const half = (W - L - 20) / 2 - 4;
  const x = (v) => mid + (v / max) * half;
  const bars = rows.map((r, i) => {
    const y = 8 + i * rowH;
    const bar = (v, color) => { const a = x(0); const b = x(v); return `<rect x="${Math.min(a, b).toFixed(1)}" y="${y + 3}" width="${Math.max(1, Math.abs(b - a)).toFixed(1)}" height="${rowH - 8}" rx="3" fill="${color}"/>`; };
    return `<text x="${L - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle" class="chart-label">${e(r.label.length > 32 ? r.label.slice(0, 31) + '…' : r.label)}</text>${bar(r.effectLow, '#3b82f6')}${bar(r.effectHigh, '#f97316')}`;
  }).join('');
  const legend = `<g class="chart-label"><rect x="${L}" y="${H - 18}" width="10" height="10" fill="#3b82f6"/><text x="${L + 14}" y="${H - 9}">−${exp.percent}%</text><rect x="${L + 70}" y="${H - 18}" width="10" height="10" fill="#f97316"/><text x="${L + 84}" y="${H - 9}">+${exp.percent}%</text><text x="${W - 20}" y="${H - 9}" text-anchor="end">±${e(fmtNum(max, 3))}</text></g>`;
  return `<svg class="chart tornado" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${e(tt('exp.kind.sensitivity', 'Sensitivity'))}"><line x1="${mid}" y1="4" x2="${mid}" y2="${H - 26}" stroke="currentColor" stroke-opacity="0.4"/>${bars}${legend}</svg>`;
}

/** Saved scenarios (Simulation › Save scenario) side by side: KPIs with the best one marked, and what changed. */
function scenariosHtml(list) {
  if (!list?.length) return '';
  const head = `<div class="exp-head scen-head">${icon('fCompare')}<b>${e(tt('scenario.title', 'Scenario comparison'))}</b><span class="muted">${list.length}</span><span class="grow"></span><button class="small-button" data-scenario-clear>${icon('trash')}<span>${e(tt('scenario.clear', 'Clear'))}</span></button></div>`;
  const cols = list.map((s, i) => `<th>${e(s.name)} <button class="icon-button tiny" data-scenario-remove="${i}" title="${e(tt('scenario.remove', 'Remove'))}" aria-label="${e(tt('scenario.remove', 'Remove'))}">${icon('close')}</button></th>`).join('');
  const rows = SCENARIO_KPIS.map(([key]) => {
    const best = bestScenarioIndex(list, key);
    return `<tr><th>${e(tt(`metric.${key}`, key))}</th>${list.map((s, i) => { const v = s.values[key]; const first = Number(list[0].values[key]); const d = i > 0 && Number.isFinite(first) && first !== 0 && Number.isFinite(Number(v)) ? ((Number(v) - first) / Math.abs(first)) * 100 : null; return `<td class="${i === best ? 'best' : ''}">${v == null ? '—' : key === 'bottleneckUtil' ? pct(v) : fmtNum(v, 3)}${d != null && Math.abs(d) >= 0.05 ? ` <small class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtNum(d, 1)}%</small>` : ''}</td>`; }).join('')}</tr>`;
  }).join('');
  const bn = `<tr><th>${e(tt('scenario.bottleneck', 'Bottleneck'))}</th>${list.map((s) => `<td>${e(s.bottleneck || '—')}</td>`).join('')}</tr>`;
  const diff = `<tr><th>${e(tt('scenario.changes', 'Changes from the first'))}</th>${list.map((s, i) => { if (!i) return `<td class="muted">—</td>`; const d = scenarioDiff(list[0], s); return `<td class="scen-diff">${d.length ? d.slice(0, 6).map((x) => `<div>${e(x)}</div>`).join('') + (d.length > 6 ? `<div class="muted">+${d.length - 6}</div>` : '') : `<span class="muted">${e(tt('scenario.same', 'Same model'))}</span>`}</td>`; }).join('')}</tr>`;
  return `<section class="scen-view">${head}<div class="scen-scroll"><table class="exp-table scen-table"><thead><tr><th></th>${cols}</tr></thead><tbody>${rows}${bn}${diff}</tbody></table></div></section>`;
}

/**
 * The diagnosis tab: each problem found in the run as a card — severity, title, the evidence (numbers),
 * the likely cause and the fixes; a fix with an action has an Apply button (data-apply="issue:fix").
 */
export function diagnosisHtml(issues, applied, ctx) {
  if (!issues) return emptyBottom('bottleneck', tt('diag.empty', 'Run the model: the problems found and how to fix them appear here.'));
  const SEV = { error: 'error', warning: 'warning', info: 'info', success: 'check' };
  const counts = { error: 0, warning: 0, info: 0 };
  for (const x of issues) if (x.severity in counts) counts[x.severity] += 1;
  const head = `<div class="diag-head">${icon('bottleneck')}<b>${e(tt('diag.heading', 'Analysis and improvements'))}</b><span class="muted">${e(t('diag.summary', { n: issues.filter((x) => x.severity !== 'success').length, error: counts.error, warning: counts.warning, info: counts.info }))}</span><span class="grow"></span>${ctx.running ? `<span class="badge">${icon('runPlay')}${e(tt('diag.live', 'Live while running'))}</span>` : ''}<button class="small-button" data-command="restart" title="${e(tt('action.restart', ''))}">${icon('runReset')}<span>${e(tt('diag.rerun', 'Run again'))}</span></button></div>`;
  const cards = issues.map((x, i) => `<article class="diag-card sev-${x.severity}">
      <header>${icon(SEV[x.severity] ?? 'info')}<b>${e(t(`diag.${x.id}.title`, x.params, x.id))}</b><span class="grow"></span>${x.block ? `<button class="small-button" data-select-name="${e(x.block)}" title="${e(tt('diag.show', 'Show'))}">${icon('zoomSelection')}<span>${e(x.block)}</span></button>` : ''}</header>
      <div class="diag-evidence">${x.evidence.map(([k2, v]) => `<span class="diag-chip"><small>${e(t(`ev.${k2}`, null, k2))}</small><b>${e(v)}</b></span>`).join('')}</div>
      <p class="diag-cause">${icon('question', 'icon tiny')}<span>${e(t(`diag.${x.id}.cause`, x.params, ''))}</span></p>
      ${x.fixes.length ? `<ul class="diag-fixes">${x.fixes.map((f, j) => { const done = applied.has(`${x.id}:${x.block ?? ''}:${f.key}`); return `<li>${icon('bulb', 'icon tiny')}<span>${e(t(`fix.${f.key}`, f.params, f.key))}</span>${f.action ? `<button class="small-button" data-apply="${i}:${j}" ${done || ctx.running ? 'disabled' : ''}>${icon(done ? 'check' : 'runReset')}<span>${e(done ? tt('diag.applied', 'Applied') : tt('diag.apply', 'Apply'))}</span></button>` : ''}</li>`; }).join('')}</ul>` : ''}
    </article>`).join('');
  return `<div class="diag-view">${head}<div class="diag-grid">${cards}</div></div>`;
}

const emptyBottom = (glyph, text) => `<div class="bottom-empty">${icon(glyph)}<span>${e(text)}</span></div>`;
export { stepperHtml };
