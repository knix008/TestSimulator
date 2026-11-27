// HTML of the simulation panels: the Model tab's outline and details, the Project tab's toolbox and
// schematic, Engineering Data, Design Exploration. Pure builders over the app's context; events
// are wired by app.js through data-* attributes.
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';
import { stepperHtml } from '../stepper.js';
import { BCS, BC_CATS, GROUPS, RESULTS, SYSTEMS, SYSTEM_IDS, FOLLOW_UPS, fieldShown } from '../sim/catalog.js';
import { TEMPLATES, selfIntersects } from '../sim/shapes.js';
import { MATERIALS, MATERIAL_FIELDS, MATERIAL_GROUPS, materialName } from '../sim/materials.js';
import { factor, fmt, toDisplay, unitLabel, SYSTEMS as UNIT_SYSTEMS } from '../sim/units.js';
import { resultItems } from '../sim/results.js';
import { OUTPUT_KINDS, outputsOf } from '../sim/project.js';

const e = escapeHtml;

// ───────────────────────── fields

/** One property row: icon, label, control. */
export const row = (glyph, label, control, extra = '') => `<div class="sd-row ${extra}" title="${e(label)}"><span class="sd-label">${icon(glyph, 'icon tiny')}<span>${e(label)}</span></span><span class="sd-control">${control}</span></div>`;

/** A number in display units as a stepper (path = where it lives in the project, SI inside). */
export function numberControl(ctx, path, si, kind, { min = -1e30, max = 1e30, step = 1, integer = false, label = '', model = false } = {}) {
  const us = ctx.units();
  const f = model ? 1 : factor(kind, us);
  const unit = model ? (kind === 'angle' ? '°' : 'mm') : unitLabel(kind, us);
  // Display = SI × factor (+ offset for temperatures in °F / K).
  const disp = (v) => (model ? v : toDisplay(kind, v, us));
  const shown = si === null || si === undefined ? '' : integer ? Math.round(si) : Number(disp(si).toPrecision(6));
  const dstep = integer ? Math.max(1, step) : niceStep(step * f);
  return stepperHtml({ key: `${model ? 'm' : 'k'}|${kind}|${path}`, value: shown, min: min === -1e30 ? -1e30 : disp(min), max: max === 1e30 ? 1e30 : disp(max), step: dstep, unit, label, decreaseTip: ctx.t('stepper.decrease', { label }), increaseTip: ctx.t('stepper.increase', { label }) });
}

function niceStep(s) {
  if (!(s > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(s));
  const m = s / p;
  return Number(((m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p).toPrecision(3));
}

export const selectControl = (path, value, options, glyph = 'list') => `<select data-select="${e(path)}" data-icon="${glyph}">${options.map(([v, label, ic]) => `<option value="${e(v)}" ${String(v) === String(value) ? 'selected' : ''} ${ic ? `data-icon="${ic}"` : ''}>${e(label)}</option>`).join('')}</select>`;

export const toggleControl = (path, on, label) => `<label class="switch-wrap" title="${e(label)}"><input type="checkbox" data-toggle-field="${e(path)}" ${on ? 'checked' : ''} aria-label="${e(label)}" /><span class="switch" aria-hidden="true"></span></label>`;

export const textControl = (path, value, label) => `<input class="sd-text" type="text" data-text="${e(path)}" value="${e(value ?? '')}" aria-label="${e(label)}" spellcheck="false" />`;

function optionsOf(ctx, f) {
  if (f.options === '$bodies') return [['', ctx.t('opt.firstBody'), 'body'], ...ctx.state.project.bodies.map((b) => [b.id, b.name, 'body'])];
  if (f.options === '$fluids') return MATERIALS.filter((m) => m.group === 'fluid').map((m) => [m.id, materialName(m, ctx.lang()), 'droplet']);
  return f.options.map((v) => [v, ctx.t(`opt.${v}`), optIcon(v)]);
}

const OPT_ICONS = { inlet: 'bcInlet', outlet: 'bcOutlet', wall: 'bcWall', slip: 'bcFrictionless', opening: 'bcOutlet', laminar: 'simFluid', turbulent: 'vortex', external: 'simFluid', internal: 'shapeDuct', loop: 'bcCoil', straight: 'bcCurrent' };
const optIcon = (v) => OPT_ICONS[v] ?? 'dot';

/** A catalog field (settings or boundary condition) bound to `base` (a path to the object holding it). */
export function fieldRows(ctx, base, obj, f, labelKey) {
  const label = ctx.t(`${labelKey}.${f.key}`, null, f.key);
  const path = `${base}.${f.key}`;
  const v = obj[f.key];
  const glyph = FIELD_ICONS[f.key] ?? (f.type === 'bool' ? 'toggleOn' : f.type === 'select' ? 'list' : 'smartDim');
  switch (f.type) {
    case 'number': return row(glyph, label, numberControl(ctx, path, v, f.kind, { ...f, label }));
    case 'optional': {
      const on = v !== null && v !== undefined;
      return row(glyph, label, `<span class="sd-optional">${toggleControl(`${path}#on`, on, label)}${on ? numberControl(ctx, path, v, f.kind, { label, step: 1e-4 }) : `<span class="muted">${e(ctx.t('opt.free'))}</span>`}</span>`);
    }
    case 'select': return row(glyph, label, selectControl(path, v ?? f.def, optionsOf(ctx, f), glyph));
    case 'bool': return row(glyph, label, toggleControl(path, Boolean(v), label));
    case 'vector': return ['X', 'Y', 'Z'].map((axis, i) => row(i === 0 ? glyph : 'dot', `${label} ${axis}`, numberControl(ctx, `${path}.${i}`, v?.[i] ?? 0, f.kind, { label: `${label} ${axis}`, step: f.kind === 'ratio' ? 0.1 : 1 }), i ? 'sub' : '')).join('');
    case 'table': return tableRows(ctx, path, v ?? [], f, label);
    default: return '';
  }
}

const FIELD_ICONS = {
  modes: 'simModal', steps: 'steps', endTime: 'clock', fmin: 'frequency', fmax: 'frequency', points: 'chartLine', damping: 'damper', vector: 'arrowVector', value: 'smartDim',
  direction: 'arrowVector', axis: 'axis', origin: 'origin', omega: 'rotate', h: 'bcConvection', ambient: 'thermometer', emissivity: 'sun', current: 'bcCurrent', turns: 'bcCoil',
  remanence: 'bcMagnet', plasticity: 'simNonlinear', largeDeflection: 'bend', referenceTemperature: 'thermometer', volumeFraction: 'percent', iterations: 'repeat',
  inletVelocity: 'arrowVector', turbulence: 'vortex', thermal: 'simThermal', buoyancy: 'arrowUp', fluid: 'droplet', flowType: 'simFluid', cellSize: 'grid', maxCells: 'grid',
  history: 'chartLine', spectrum: 'chartLine', psd: 'chartLine', speed: 'arrowVector', temperature: 'thermometer', friction: 'bcFrictionless', impedance: 'bcAbsorbing',
};

function tableRows(ctx, path, rows, f, label) {
  const us = ctx.units();
  const ul = (kind) => (kind === 'model' ? 'mm' : unitLabel(kind, us));
  const shown = (kind, v) => (kind === 'model' ? v : toDisplay(kind, v, us));
  const head = f.cols.map(([key, kind]) => `<th>${e(ctx.t(`col.${key}`, null, key))}${ul(kind) ? ` <small>(${e(ul(kind))})</small>` : ''}</th>`).join('');
  const body = rows.map((r, i) => `<tr>${f.cols.map(([, kind], c) => `<td><input class="sd-cell" type="text" inputmode="decimal" data-cell="${e(path)}|${i}|${c}|${kind}" value="${e(fmt(shown(kind, r[c]), 6))}" /></td>`).join('')}<td><button class="icon-button" data-table-del="${e(path)}|${i}" title="${e(ctx.t('action.deleteRow'))}">${icon('trash', 'icon tiny')}</button></td></tr>`).join('');
  return `<div class="sd-table" title="${e(label)}"><div class="sd-table-head">${icon(FIELD_ICONS[f.key] ?? 'chartLine', 'icon tiny')}<span>${e(label)}</span><span class="grow"></span><button class="small-button" data-table-add="${e(path)}">${icon('plus', 'icon tiny')}<span>${e(ctx.t('action.addRow'))}</span></button></div>
    <table><thead><tr>${head}<th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// ───────────────────────── Model tab: outline

const treeRow = (key, glyph, label, { depth = 0, selected = false, cls = '', badge = '', toggle = '', eye = null } = {}) =>
  `<div class="tree-row sim-row ${selected ? 'selected' : ''} ${cls}" data-sel="${e(key)}" style="padding-left:${6 + depth * 14}px" title="${e(label)}">
    ${toggle}${icon(glyph)}<span class="tree-label">${e(label)}</span>${badge}${eye !== null ? `<button class="icon-button tree-eye" data-eye="${e(eye.id)}" title="${e(eye.tip)}">${icon(eye.hidden ? 'eyeOff' : 'eye', 'icon tiny')}</button>` : ''}
  </div>`;

const STATUS_ICON = { setup: 'statusSetup', meshed: 'statusSetup', solved: 'check', outdated: 'refresh', error: 'error', solving: 'hourglass' };

export function outlineHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const sel = ctx.selected();
  const isSel = (kind, id = null) => sel?.kind === kind && (id === null || sel.id === id);
  const out = [];
  out.push(treeRow('project', 'project', p.name || t('tabs.untitled', { n: 1 }), { selected: isSel('project'), cls: 'tree-root' }));
  out.push(treeRow('geometry', 'geometry', `${t('outline.geometry')} (${p.bodies.length})`, { depth: 1, selected: isSel('geometry') }));
  for (const b of p.bodies) {
    if (b.tool) {
      const owner = p.bodies.find((x) => (x.ops ?? []).some((o) => o.tool === b.id));
      out.push(treeRow(`body:${b.id}`, 'solidSubtract', `${b.name} · ${t('outline.toolOf', { name: owner?.name ?? '?' })}`, { depth: 3, selected: isSel('body', b.id), cls: 'tool-body' }));
      continue;
    }
    const mat = materialName(p.materials.find((m) => m.id === b.material) ?? MATERIALS.find((m) => m.id === b.material), ctx.lang());
    out.push(treeRow(`body:${b.id}`, TEMPLATES[b.template]?.icon ?? 'shapeBox', `${b.name} · ${mat}`, { depth: 2, selected: isSel('body', b.id), cls: b.suppressed ? 'suppressed' : '', eye: { id: b.id, hidden: b.hidden, tip: t(b.hidden ? 'action.showBody' : 'action.hideBody') } }));
  }
  out.push(treeRow('materials', 'material', `${t('outline.materials')} (${p.materials.length})`, { depth: 1, selected: isSel('materials') }));
  out.push(treeRow('lights', 'sun', `${t('outline.lights')} (${(p.lights ?? []).length})`, { depth: 1, selected: isSel('lights') }));
  for (const l of p.lights ?? []) out.push(treeRow(`light:${l.id}`, LIGHT_ICONS[l.type] ?? 'sun', `${l.name} · ${t(`light.${l.type}`)}`, { depth: 2, selected: isSel('light', l.id), cls: l.enabled ? '' : 'suppressed' }));
  const sys = ctx.activeSystem();
  for (const s of p.systems) {
    const def = SYSTEMS[s.type];
    const active = s.id === sys?.id;
    out.push(treeRow(`system:${s.id}`, def.icon, s.name || t(`sys.${s.type}`), { depth: 1, selected: isSel('system', s.id), cls: `sys-node ${active ? 'active-system' : ''}`, badge: `<span class="sys-status ${s.status}" title="${e(t(`status.sys.${s.status}`))}">${icon(STATUS_ICON[s.status] ?? 'dot', 'icon tiny')}</span>` }));
    if (!active) continue;
    out.push(treeRow(`settings:${s.id}`, 'analysisSettings', t('outline.settings'), { depth: 2, selected: isSel('settings', s.id) }));
    out.push(treeRow(`mesh:${s.id}`, 'mesh', `${t('outline.mesh')}${s.result?.mesh ? ` · ${s.result.mesh.nodes.toLocaleString()} ${t('mesh.nodesShort')}` : ''}`, { depth: 2, selected: isSel('mesh', s.id) }));
    if (s.enclosure && (def.enclosure)) out.push(treeRow(`enclosure:${s.id}`, 'enclosure', t('outline.enclosure'), { depth: 2, selected: isSel('enclosure', s.id) }));
    if (def.contacts) {
      out.push(treeRow(`contacts:${s.id}`, 'simContact', `${t('outline.contacts')} (${s.contacts.length})`, { depth: 2, selected: isSel('contacts', s.id) }));
      for (const c of s.contacts) out.push(treeRow(`contact:${c.id}`, 'simContact', contactLabel(ctx, c), { depth: 3, selected: isSel('contact', c.id), cls: c.suppressed ? 'suppressed' : '' }));
    }
    for (const bc of s.bcs) {
      const def2 = BCS[bc.type];
      const count = def2?.target === 'none' ? '' : ` (${(bc.faces?.length ?? 0) + (bc.bodies?.length ?? 0)})`;
      const missing = def2?.target !== 'none' && !(bc.faces?.length || bc.bodies?.length);
      out.push(treeRow(`bc:${bc.id}`, def2?.icon ?? 'dot', `${bc.name || t(`bc.${bc.type}`)}${count}`, { depth: 2, selected: isSel('bc', bc.id), cls: `${bc.suppressed ? 'suppressed' : ''} ${missing ? 'warn' : ''} bc-${def2?.cat}` }));
    }
    const probes = s.probes ?? [];
    out.push(treeRow(`probes:${s.id}`, 'probe', `${t('outline.probes')} (${probes.length})`, { depth: 2, selected: isSel('probes', s.id) }));
    probes.forEach((q, i) => out.push(treeRow(`probe:${q.id}`, 'probe', `${q.name || `P${i + 1}`} · ${q.point.map((v) => fmt(v, 4)).join(', ')}`, { depth: 3, selected: isSel('probe', q.id) })));
    out.push(treeRow(`solution:${s.id}`, 'solution', t('outline.solution'), { depth: 2, selected: isSel('solution', s.id), cls: s.status === 'error' ? 'error' : '' }));
    for (const item of resultItems(s, s.result)) {
      out.push(treeRow(`result:${s.id}:${item.key}`, RESULT_ICONS[item.quantity] ?? 'contour', ctx.resultTitle(s, item), { depth: 3, selected: isSel('result', `${s.id}:${item.key}`) }));
    }
  }
  return `<div class="tree sim-tree" role="tree">${out.join('')}</div>`;
}

const LIGHT_ICONS = { directional: 'sun', point: 'lightsOn', spot: 'lightSpot' };

const RESULT_ICONS = {
  displacement: 'resDisplacement', vonMises: 'resStress', safety: 'resSafety', temperature: 'thermometer', flux: 'arrowVector', mode: 'simModal', bucklingMode: 'simBuckling',
  life: 'simFatigue', damage: 'simFatigue', fatigueSafety: 'resSafety', speed: 'simFluid', streamlines: 'streamline', pressureCell: 'bcPressure', potential: 'bcVoltage',
  efield: 'arrowVector', fluxDensity: 'bcMagnet', density: 'simTopology', spl: 'simAcoustic', acousticMode: 'simAcoustic', plasticStrain: 'simNonlinear',
};

function contactLabel(ctx, c) {
  const name = (id) => ctx.state.project.bodies.find((b) => b.id === id)?.name ?? '?';
  return `${ctx.t(`opt.${c.type}`)} — ${name(c.a)} / ${name(c.b)}`;
}

// ───────────────────────── Model tab: details

const section = (glyph, title, body) => `<section class="sd-section"><h4>${icon(glyph, 'icon tiny')}<span>${e(title)}</span></h4>${body}</section>`;
const info = (glyph, label, value) => row(glyph, label, `<span class="sd-value">${e(value)}</span>`);
const button = (cmd, glyph, label, cls = '') => `<button class="small-button ${cls}" data-command="${e(cmd)}" title="${e(label)}">${icon(glyph, 'icon tiny')}<span>${e(label)}</span></button>`;

export function detailsHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const sel = ctx.selected() ?? { kind: 'project' };
  const us = ctx.units();
  const sys = ctx.activeSystem();
  switch (sel.kind) {
    case 'project': return section('project', t('outline.project'), [
      row('rename', t('details.name'), textControl('name', p.name, t('details.name'))),
      row('units', t('settings.unitSystem'), selectControl('$units', us, UNIT_SYSTEMS.map((k) => [k, t(`units.${k}`), 'units']), 'units')),
      info('geometry', t('outline.geometry'), String(p.bodies.length)), info('simSystems', t('details.systems'), String(p.systems.length)),
    ].join(''));
    case 'geometry': return section('geometry', t('outline.geometry'), `<p class="sd-help">${e(t('help.geometry'))}</p><div class="sd-buttons">${['addBox', 'addCylinder', 'addTube', 'addSphere', 'importStl'].map((c) => button(c, ctx.commands[c]?.icon ?? 'plus', t(ctx.commands[c]?.label ?? c))).join('')}</div>`);
    case 'body': {
      const b = p.bodies.find((x) => x.id === sel.id);
      if (!b) return '';
      const tpl = TEMPLATES[b.template];
      const mats = [...p.materials, ...MATERIALS.filter((m) => !p.materials.some((x) => x.id === m.id))];
      return [
        section(tpl?.icon ?? 'shapeBox', t('details.body'), [
          row('rename', t('details.name'), textControl(`bodies.${b.id}.name`, b.name, t('details.name'))),
          row('material', t('details.material'), selectControl(`bodies.${b.id}.material`, b.material, mats.map((m) => [m.id, materialName(m, ctx.lang()), 'material']), 'material')),
          row('suppress', t('details.suppressed'), toggleControl(`bodies.${b.id}.suppressed`, b.suppressed, t('details.suppressed'))),
          row('grid', t('details.meshSize'), numberControl(ctx, `bodies.${b.id}.meshSize`, b.meshSize ?? 0, 'length', { min: 0, step: 0.0005, label: t('details.meshSize') })),
        ].join('')),
        section('ruler', t('details.dimensions'), (tpl?.params ?? []).map((q) => row(PARAM_ICONS[q.key] ?? 'smartDim', t(`param.${q.key}`, null, q.key), numberControl(ctx, `bodies.${b.id}.params.${q.key}`, b.params[q.key] ?? q.def, 'length', { model: true, min: q.min ?? 0, max: q.max ?? 1e6, step: q.step ?? 1, integer: q.integer, label: t(`param.${q.key}`, null, q.key) }))).join('')),
        tpl?.profile ? profileSection(ctx, b, tpl) : '',
        opsSection(ctx, b),
        section('move', t('details.placement'), [
          ...['X', 'Y', 'Z'].map((a, i) => row(i ? 'dot' : 'move', `${t('details.position')} ${a}`, numberControl(ctx, `bodies.${b.id}.position.${i}`, b.position[i], 'length', { model: true, step: 1, label: `${t('details.position')} ${a}` }))),
          ...['X', 'Y', 'Z'].map((a, i) => row(i ? 'dot' : 'rotate', `${t('details.rotation')} ${a}`, numberControl(ctx, `bodies.${b.id}.rotation.${i}`, b.rotation[i], 'angle', { model: true, step: 5, min: -360, max: 360, label: `${t('details.rotation')} ${a}` }))),
        ].join('')),
        `<div class="sd-buttons">${button('duplicateBody', 'copy', t('cmd.duplicateBody'))}${button('deleteSelection', 'trash', t('cmd.delete'), 'danger')}</div>`,
      ].join('');
    }
    case 'lights': return section('sun', t('outline.lights'), `<p class="sd-help">${e(t('help.lights'))}</p>${(p.lights ?? []).map((l) => info(LIGHT_ICONS[l.type] ?? 'sun', l.name, t(`light.${l.type}`))).join('')}<div class="sd-buttons">${button('addLight', 'sun', t('cmd.addLight'), 'primary')}</div>`);
    case 'light': {
      const l = (p.lights ?? []).find((x) => x.id === sel.id);
      if (!l) return '';
      const base = `lights.${l.id}`;
      const xyz = (key, glyph, label) => ['X', 'Y', 'Z'].map((a, i) => row(i ? 'dot' : glyph, `${label} ${a}`, numberControl(ctx, `${base}.${key}.${i}`, l[key][i], 'length', { model: true, step: 5, label: `${label} ${a}` }))).join('');
      return [section(LIGHT_ICONS[l.type] ?? 'sun', t('details.light'), [
        row('rename', t('details.name'), textControl(`${base}.name`, l.name, t('details.name'))),
        row('sun', t('light.type'), selectControl(`${base}.type`, l.type, ['directional', 'point', 'spot'].map((k) => [k, t(`light.${k}`), LIGHT_ICONS[k]]), 'sun')),
        row('toggleOn', t('light.enabled'), toggleControl(`${base}.enabled`, l.enabled !== false, t('light.enabled'))),
        row('palette', t('light.color'), `<input type="color" data-light-color="${e(l.id)}" value="${e(l.color ?? '#fff4d6')}" aria-label="${e(t('light.color'))}" />`),
        row('sparkles', t('light.intensity'), numberControl(ctx, `${base}.intensity`, l.intensity ?? 1.5, 'ratio', { min: 0, max: 20, step: 0.1, label: t('light.intensity') })),
        l.type === 'spot' ? row('lightSpot', t('light.angle'), numberControl(ctx, `${base}.angle`, l.angle ?? 30, 'angle', { model: true, min: 1, max: 89, step: 1, label: t('light.angle') })) : '',
      ].join('')),
      section('move', t('light.position'), xyz('position', 'move', t('details.position'))),
      l.type === 'point' ? '' : section('target', t('light.target'), xyz('target', 'target', t('light.target'))),
      `<p class="sd-help">${e(t('help.light'))}</p>`,
      `<div class="sd-buttons">${button('deleteSelection', 'trash', t('cmd.delete'), 'danger')}</div>`].join('');
    }

    case 'materials': return section('material', t('outline.materials'), `${p.materials.map((m) => info('material', materialName(m, ctx.lang()), `${p.bodies.filter((b) => b.material === m.id).length} ${t('details.bodiesShort')}`)).join('')}<div class="sd-buttons">${button('tabData', 'material', t('cmd.tabData'))}</div>`);
    case 'system': case 'settings': {
      const s = ctx.systemById(sel.id);
      if (!s) return '';
      const def = SYSTEMS[s.type];
      const rows = def.settings.filter((f) => visibleSetting(s, f)).map((f) => fieldRows(ctx, `systems.${s.id}.settings`, s.settings, f, 'set')).join('');
      return [
        section(def.icon, t(`sys.${s.type}`), [
          row('rename', t('details.name'), textControl(`systems.${s.id}.name`, s.name, t('details.name'))),
          info('statusSetup', t('details.status'), t(`status.sys.${s.status}`)),
          `<p class="sd-help">${e(t(`sysDesc.${s.type}`))}</p>`,
        ].join('')),
        rows ? section('analysisSettings', t('outline.settings'), rows) : '',
        `<div class="sd-buttons">${button('solve', 'solve', t('cmd.solve'), 'primary')}${(FOLLOW_UPS[s.type] ?? []).map((f) => `<button class="small-button" data-follow="${f}" title="${e(t('cmd.followUp', { name: t(`sys.${f}`) }))}">${icon(SYSTEMS[f].icon, 'icon tiny')}<span>${e(t(`sys.${f}`))}</span></button>`).join('')}</div>`,
      ].join('');
    }
    case 'mesh': {
      const s = ctx.systemById(sel.id);
      if (!s) return '';
      const m = s.result?.mesh ?? state.setupMesh?.info;
      return [
        section('mesh', t('outline.mesh'), [
          row('grid', t('mesh.size'), numberControl(ctx, `systems.${s.id}.mesh.size`, s.mesh.size, 'length', { min: 0, step: 0.0005, label: t('mesh.size') })),
          `<p class="sd-help">${e(t('help.meshSize'))}</p>`,
          row('order', t('mesh.order'), selectControl(`systems.${s.id}.mesh.order`, s.mesh.order, [[1, t('mesh.linear'), 'meshLinear'], [2, t('mesh.quadratic'), 'meshQuadratic']], 'order')),
          row('grid', t('mesh.maxNodes'), numberControl(ctx, `systems.${s.id}.mesh.maxNodes`, s.mesh.maxNodes ?? 600000, 'count', { min: 1000, max: 5e6, step: 10000, integer: true, label: t('mesh.maxNodes') })),
        ].join('')),
        m ? section('statistics', t('mesh.statistics'), [
          info('dot', t('mesh.nodes'), m.nodes.toLocaleString()), info('dot', t('mesh.elements'), m.elements.toLocaleString()),
          info('dot', t('mesh.elementType'), m.order === 2 ? 'TET10' : 'TET4'), info('dot', t('mesh.qualityMin'), fmt(m.quality.min, 3)),
          info('dot', t('mesh.qualityAvg'), fmt(m.quality.avg, 3)), info('dot', t('mesh.aspectMax'), fmt(m.quality.aspectMax, 3)),
          `<div class="sd-hist">${m.quality.histogram.map((n, i) => `<span style="height:${Math.round((100 * n) / Math.max(1, ...m.quality.histogram))}%" title="${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${n}"></span>`).join('')}</div>`,
        ].join('')) : '',
        `<div class="sd-buttons">${button('generateMesh', 'mesh', t('cmd.generateMesh'), 'primary')}</div>`,
      ].join('');
    }
    case 'enclosure': {
      const s = ctx.systemById(sel.id);
      return section('enclosure', t('outline.enclosure'), [
        row('enclosure', t('enclosure.enabled'), toggleControl(`systems.${s.id}.enclosure.enabled`, s.enclosure.enabled, t('enclosure.enabled'))),
        row('ruler', t('enclosure.padding'), numberControl(ctx, `systems.${s.id}.enclosure.padding`, s.enclosure.padding ?? 0, 'length', { min: 0, step: 0.001, label: t('enclosure.padding') })),
        `<p class="sd-help">${e(t('help.enclosure'))}</p>`,
      ].join(''));
    }
    case 'probes': {
      const s = ctx.systemById(sel.id);
      return section('probe', t('outline.probes'), `<p class="sd-help">${e(t('help.probes'))}</p>${(s?.probes ?? []).map((q, i) => info('probe', q.name || `P${i + 1}`, q.point.map((v) => fmt(v, 4)).join(', '))).join('')}<div class="sd-buttons">${button('addProbe', 'probe', t('cmd.addProbe'), state.pickProbe ? 'primary' : '')}</div>`);
    }
    case 'probe': {
      const q = sys?.probes?.find((x) => x.id === sel.id);
      if (!q) return '';
      const base = `systems.${sys.id}.probes.${q.id}`;
      const values = (ctx.model.probeValues?.() ?? []).find((v) => v.probe.id === q.id);
      return [section('probe', t('details.probe'), [
        row('rename', t('details.name'), textControl(`${base}.name`, q.name ?? '', t('details.name'))),
        ...['X', 'Y', 'Z'].map((a, i) => row(i ? 'dot' : 'probe', `${t('details.position')} ${a}`, numberControl(ctx, `${base}.point.${i}`, q.point[i], 'length', { model: true, step: 1, label: `${t('details.position')} ${a}` }))),
        values ? info('cursor', t('res.probeValue'), `${fmt(toDisplay(values.kind, values.value, us))} ${unitLabel(values.kind, us)}`) : '',
        values ? info('dot', t('res.probeNode'), `#${values.node} · ${fmt(values.distance, 3)} mm`) : '',
        `<p class="sd-help">${e(t('help.probe'))}</p>`,
      ].join('')), `<div class="sd-buttons">${button('deleteSelection', 'trash', t('cmd.delete'), 'danger')}</div>`].join('');
    }
    case 'contacts': return section('simContact', t('outline.contacts'), `<p class="sd-help">${e(t('help.contacts'))}</p><div class="sd-buttons">${button('addContact', 'plus', t('cmd.addContact'))}${button('autoContacts', 'magic', t('cmd.autoContacts'))}</div>`);
    case 'contact': {
      const c = sys?.contacts.find((x) => x.id === sel.id);
      if (!c) return '';
      const bodies = p.bodies.map((b) => [b.id, b.name, 'body']);
      return section('simContact', t('outline.contacts'), [
        row('simContact', t('contact.type'), selectControl(`systems.${sys.id}.contacts.${c.id}.type`, c.type, ['bonded', 'noSeparation', 'frictionless', 'rough', 'frictional'].map((k) => [k, t(`opt.${k}`), 'simContact']), 'simContact')),
        row('body', t('contact.a'), selectControl(`systems.${sys.id}.contacts.${c.id}.a`, c.a, bodies, 'body')),
        row('body', t('contact.b'), selectControl(`systems.${sys.id}.contacts.${c.id}.b`, c.b, bodies, 'body')),
        c.type === 'frictional' ? row('bcFrictionless', t('contact.friction'), numberControl(ctx, `systems.${sys.id}.contacts.${c.id}.friction`, c.friction ?? 0.2, 'ratio', { min: 0, max: 2, step: 0.05, label: t('contact.friction') })) : '',
        row('suppress', t('details.suppressed'), toggleControl(`systems.${sys.id}.contacts.${c.id}.suppressed`, c.suppressed, t('details.suppressed'))),
        `<p class="sd-help">${e(t(`contactHelp.${c.type}`))}</p>`,
        `<div class="sd-buttons">${button('deleteSelection', 'trash', t('cmd.delete'), 'danger')}</div>`,
      ].join(''));
    }
    case 'bc': {
      const bc = sys?.bcs.find((x) => x.id === sel.id);
      if (!bc) return '';
      const def = BCS[bc.type];
      const base = `systems.${sys.id}.bcs.${bc.id}`;
      const target = def.target;
      const scope = target === 'none' ? `<p class="sd-help">${e(t('bc.scopeAll'))}</p>` : [
        target.includes('faces') ? row('face', t('bc.faces'), `<span class="sd-value">${(bc.faces ?? []).length}</span><button class="small-button" data-command="clearFaces">${icon('trash', 'icon tiny')}<span>${e(t('action.clear'))}</span></button>`) : '',
        target.includes('bodies') ? row('body', t('bc.bodies'), `<span class="sd-bodies">${p.bodies.map((b) => `<label class="sd-check"><input type="checkbox" data-bc-body="${e(b.id)}" ${bc.bodies?.includes(b.id) ? 'checked' : ''}/><span>${e(b.name)}</span></label>`).join('')}</span>`) : '',
        `<p class="sd-help pick-help">${icon('cursor', 'icon tiny')}${e(t(target.includes('faces') ? 'help.pickFaces' : 'help.pickBodies'))}</p>`,
      ].join('');
      return [
        section(def.icon, t(`bc.${bc.type}`), [
          row('rename', t('details.name'), textControl(`${base}.name`, bc.name ?? '', t('details.name'))),
          scope,
          ...def.fields.filter((f) => fieldShown(f, bc)).map((f) => fieldRows(ctx, base, bc, f, 'bcf')),
          row('suppress', t('details.suppressed'), toggleControl(`${base}.suppressed`, bc.suppressed, t('details.suppressed'))),
          `<p class="sd-help">${e(t(`bcDesc.${bc.type}`))}</p>`,
        ].join('')),
        `<div class="sd-buttons">${button('deleteSelection', 'trash', t('cmd.delete'), 'danger')}</div>`,
      ].join('');
    }
    case 'solution': {
      const s = ctx.systemById(sel.id);
      if (!s) return '';
      return [section('solution', t('outline.solution'), [
        info('statusSetup', t('details.status'), t(`status.sys.${s.status}`)),
        s.error ? `<p class="sd-error">${icon('error', 'icon tiny')}${e(ctx.errorText(s.error))}</p>` : '',
        ...(s.result?.notes ?? []).map((n) => `<p class="sd-note">${icon('warning', 'icon tiny')}${e(ctx.noteText(n))}</p>`),
        s.result ? info('clock', t('details.solveTime'), `${fmt((s.result.elapsedMs ?? 0) / 1000, 3)} s`) : '',
        s.result?.mesh ? info('mesh', t('mesh.nodes'), s.result.mesh.nodes.toLocaleString()) : '',
        ...Object.entries(outputsOf(s, s.result)).map(([k, v]) => info('dot', t(`out.${k}`), `${fmt(toDisplay(OUTPUT_KINDS[k] ?? 'ratio', v, us))} ${unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us)}`)),
      ].join('')), `<div class="sd-buttons">${button('solve', 'solve', t('cmd.solve'), 'primary')}${s.result ? button('exportCsv', 'csvFile', t('cmd.exportCsv')) : ''}${s.result ? button('print', 'print', t('cmd.report')) : ''}</div>`].join('');
    }
    case 'result': {
      const [sid, key] = sel.id.split(/:(.+)/);
      const s = ctx.systemById(sid);
      const item = resultItems(s, s?.result).find((i) => i.key === key);
      if (!item) return '';
      const spec = RESULTS[item.quantity];
      const shown = ctx.model.shown?.display;
      const range = shown?.values ? minmaxOf(shown.values) : null;
      return [
        section(RESULT_ICONS[item.quantity] ?? 'contour', ctx.resultTitle(s, item), [
          range ? info('arrowUp', t('res.max'), `${fmt(toDisplay(spec.kind, range[1], us))} ${unitLabel(spec.kind, us)}`) : '',
          range ? info('arrowDown', t('res.min'), `${fmt(toDisplay(spec.kind, range[0], us))} ${unitLabel(spec.kind, us)}`) : '',
          item.mode?.frequency !== undefined ? info('frequency', t('res.frequency'), `${fmt(item.mode.frequency)} Hz`) : '',
          item.mode?.factor !== undefined ? info('simBuckling', t('res.loadFactor'), item.mode.factor === null ? '—' : fmt(item.mode.factor)) : '',
          item.mode?.effectiveMass ? info('mass', t('res.effectiveMass'), item.mode.effectiveMass.map((v) => fmt(v, 3)).join(' / ')) : '',
          state.probe ? info('cursor', t('res.probe'), `${fmt(toDisplay(state.probe.kind, state.probe.value, us))} ${unitLabel(state.probe.kind, us)}`) : '',
        ].join('')),
        section('palette', t('res.display'), [
          row('deform', t('res.deformation'), selectControl('$deform', state.settings.deformScale ?? 'auto', [['auto', t('opt.autoScale'), 'deform'], ['true', t('opt.trueScale'), 'deform'], ['undeformed', t('opt.undeformed'), 'deform'], ['10', '×10', 'deform'], ['100', '×100', 'deform'], ['1000', '×1000', 'deform']], 'deform')),
          row('palette', t('res.colormap'), selectControl('$colormap', state.settings.colormap ?? 'rainbow', ['rainbow', 'viridis', 'coolwarm', 'thermal', 'grayscale'].map((c) => [c, t(`cmap.${c}`), 'palette']), 'palette')),
          row('bands', t('res.bands'), selectControl('$bands', String(state.settings.contourBands ?? 0), [['0', t('opt.smooth'), 'bands'], ['8', '8', 'bands'], ['12', '12', 'bands'], ['16', '16', 'bands']], 'bands')),
        ].join('')),
        sectionControls(ctx),
        (spec.vector || item.quantity === 'speed') ? section('arrowField', t('res.vectors'), [
          row('arrowField', t('cmd.showArrows'), toggleControl('$showArrows', state.settings.showArrows !== false, t('cmd.showArrows'))),
          state.settings.showArrows !== false ? row('count', t('res.arrowCount'), stepperHtml({ key: 'k|count|$arrowCount', value: state.settings.arrowCount ?? 300, min: 20, max: 3000, step: 20, unit: '', label: t('res.arrowCount') })) : '',
          `<p class="sd-help">${e(t('help.arrows'))}</p>`,
        ].join('')) : '',
        probeSection(ctx),
        `<div class="sd-buttons">${(spec.animate || shown?.frames) ? button('animate', state.animate ? 'pause' : 'play', t(state.animate ? 'cmd.stopAnimation' : 'cmd.animate'), 'primary') : ''}${button('exportCsv', 'csvFile', t('cmd.exportCsv'))}${button('exportImage', 'exportImage', t('cmd.exportImage'))}${item.quantity === 'density' ? button('exportStl', 'stlFile', t('cmd.exportStl')) : ''}</div>`,
      ].join('');
    }
    default: return '';
  }
}

/** The profile points of a profile body (model units), as an editable table. */
function profileSection(ctx, b, tpl) {
  const cols = tpl.profile === 'rz' ? [['r', 'model'], ['z', 'model']] : [['x', 'model'], ['y', 'model']];
  const pts = b.profile ?? [];
  const warn = pts.length >= 3 && selfIntersects(pts) ? `<p class="sd-error">${icon('warning', 'icon tiny')}${e(ctx.t('help.profileCrossing'))}</p>` : '';
  return section('polygonTool', ctx.t('details.profile'), `${tableRows(ctx, `bodies.${b.id}.profile`, pts, { key: 'profile', cols }, ctx.t('details.profile'))}${warn}<p class="sd-help">${e(ctx.t(tpl.profile === 'rz' ? 'help.profileRz' : 'help.profileXy'))}</p>`);
}

/** Boolean operations of a body: each tool with a remove button, and the add buttons. */
function opsSection(ctx, b) {
  const p = ctx.state.project;
  const ops = b.ops ?? [];
  if (b.tool) {
    const owner = p.bodies.find((x) => (x.ops ?? []).some((o) => o.tool === b.id));
    return section('solidSubtract', ctx.t('details.operations'), `<p class="sd-help">${e(ctx.t('help.toolBody', { name: owner?.name ?? '?' }))}</p>`);
  }
  const list = ops.map((o, i) => {
    const tool = p.bodies.find((x) => x.id === o.tool);
    const glyph = { subtract: 'solidSubtract', union: 'solidUnion', intersect: 'solidIntersect' }[o.op] ?? 'solidUnion';
    const label = ctx.t(`cmd.bool${o.op[0].toUpperCase()}${o.op.slice(1)}`);
    return row(glyph, label, `<span class="sd-value">${e(tool?.name ?? '?')}</span><button class="icon-button" data-op-del="${e(b.id)}|${i}" title="${e(ctx.t('cmd.delete'))}">${icon('trash', 'icon tiny')}</button>`);
  }).join('');
  const buttons = p.bodies.length > 1 ? `<div class="sd-buttons">${['subtract', 'union', 'intersect'].map((op) => button(`bool:${op}`, { subtract: 'solidSubtract', union: 'solidUnion', intersect: 'solidIntersect' }[op], ctx.t(`cmd.bool${op[0].toUpperCase()}${op.slice(1)}`))).join('')}</div>` : '';
  return section('solidUnion', ctx.t('details.operations'), `${list || `<p class="sd-help">${e(ctx.t('help.operations'))}</p>`}${buttons}`);
}

/** The section plane of the 3D view: on/off, axis, offset, clipping. */
function sectionControls(ctx) {
  const { t, state } = ctx;
  const sec = state.section;
  return section('sectionPlane', t('res.section'), [
    row('sectionPlane', t('cmd.sectionPlane'), toggleControl('$section.enabled', sec.enabled, t('cmd.sectionPlane'))),
    sec.enabled ? row('axis', t('res.sectionAxis'), selectControl('$section.axis', sec.axis, [['x', 'X', 'axisX'], ['y', 'Y', 'axisY'], ['z', 'Z', 'axisZ']], 'axis')) : '',
    sec.enabled ? row('move', t('res.sectionOffset'), stepperHtml({ key: 'k|ratio|$section.offset', value: Math.round(sec.offset * 100), min: 0, max: 100, step: 1, unit: '%', label: t('res.sectionOffset') })) : '',
    sec.enabled ? row('styleHidden', t('res.sectionClip'), toggleControl('$section.clip', sec.clip, t('res.sectionClip'))) : '',
    sec.enabled ? row('flipTool', t('res.sectionFlip'), toggleControl('$section.flip', sec.flip, t('res.sectionFlip'))) : '',
    `<p class="sd-help">${e(t('help.section'))}</p>`,
  ].join(''));
}

/** Probe values of the shown result. */
function probeSection(ctx) {
  const { t } = ctx;
  const vals = ctx.model.probeValues?.() ?? [];
  const us = ctx.units();
  const body = vals.map((v, i) => info('probe', v.probe.name || `P${i + 1}`, `${fmt(toDisplay(v.kind, v.value, us))} ${unitLabel(v.kind, us)}`)).join('');
  return section('probe', t('outline.probes'), `${body || `<p class="sd-help">${e(t('help.probes'))}</p>`}<div class="sd-buttons">${button('addProbe', 'probe', t('cmd.addProbe'), ctx.state.pickProbe ? 'primary' : '')}</div>`);
}

function visibleSetting(s, f) {
  const st = s.settings;
  if (!fieldShown(f, st)) return false;
  if (s.type === 'fluid' || s.type === 'fsi') {
    if (['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'].includes(f.key)) return st.flowType !== 'internal';
    if (f.key === 'endTime') return !st.steady;
    if (['buoyancy', 'inletTemperature', 'initialTemperature', 'gravity'].includes(f.key)) return Boolean(st.thermal);
  }
  if (s.type === 'fatigue' && f.key === 'ratio') return st.loading === 'ratio';
  if (s.type === 'fatigue' && f.key === 'meanTheory') return st.method !== 'strainLife';
  return true;
}

function minmaxOf(v) { let lo = Infinity; let hi = -Infinity; for (const x of v) { if (!Number.isFinite(x)) continue; lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo, hi]; }

const PARAM_ICONS = { width: 'width', depth: 'depth', height: 'height', radius: 'radius', outer: 'radius', inner: 'radius', thickness: 'thickness', length: 'width', holeDiameter: 'hole' };

// ───────────────────────── Project tab

export function toolboxHtml(ctx) {
  const { t } = ctx;
  return `<div class="toolbox"><div class="toolbox-head">${icon('toolbox')}<b>${e(t('toolbox.title'))}</b></div>
    <p class="sd-help">${e(t('toolbox.help'))}</p>
    ${GROUPS.map((g) => `<section class="toolbox-group"><h4>${icon(g.icon, 'icon tiny')}<span>${e(t(`group.${g.id}`))}</span></h4>
      <div class="toolbox-items">${SYSTEM_IDS.filter((id) => SYSTEMS[id].group === g.id).map((id) => `<button class="toolbox-item" data-add-system="${id}" draggable="true" title="${e(t(`sysDesc.${id}`))}">${icon(SYSTEMS[id].icon)}<span>${e(t(`sys.${id}`))}</span></button>`).join('')}</div>
    </section>`).join('')}</div>`;
}

const CELLS = ['engineeringData', 'geometry', 'model', 'setup', 'solution', 'results'];
const CELL_ICONS = { engineeringData: 'material', geometry: 'geometry', model: 'mesh', setup: 'analysisSettings', solution: 'solution', results: 'contour' };

function cellState(ctx, s, cell) {
  const p = ctx.state.project;
  switch (cell) {
    case 'engineeringData': return p.materials.length ? 'ok' : 'todo';
    case 'geometry': return p.bodies.length ? 'ok' : 'todo';
    case 'model': return s.result?.mesh || ctx.state.setupMesh ? 'ok' : 'refresh';
    case 'setup': return s.bcs.length || !SYSTEMS[s.type].bcs.length ? 'ok' : 'todo';
    case 'solution': return s.status === 'solved' ? 'ok' : s.status === 'error' ? 'error' : s.status === 'outdated' ? 'refresh' : 'todo';
    case 'results': return s.status === 'solved' ? 'ok' : 'todo';
    default: return 'todo';
  }
}
const CELL_STATE_ICON = { ok: 'check', todo: 'questionSmall', refresh: 'refresh', error: 'error' };

export function schematicHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const sys = ctx.activeSystem();
  if (!p.systems.length) return `<div class="schematic empty"><div class="schematic-empty">${icon('simSystems')}<p>${e(t('schematic.empty'))}</p></div></div>`;
  // Columns: each system in its column; dependent systems sit right of their source.
  const col = new Map();
  for (const s of p.systems) {
    const link = p.links.find((l) => l.to === s.id);
    col.set(s.id, link && col.has(link.from) ? col.get(link.from) + 1 : 0);
  }
  const rowOf = new Map();
  const used = new Map();
  for (const s of p.systems) { const c = col.get(s.id); const r = used.get(c) ?? 0; used.set(c, r + 1); rowOf.set(s.id, r); }
  const W = 236; const H = 248; const GX = 70; const GY = 34;
  const pos = (s) => [24 + col.get(s.id) * (W + GX), 24 + rowOf.get(s.id) * (H + GY)];
  const maxC = Math.max(...col.values()); const maxR = Math.max(...rowOf.values());
  const links = p.links.map((l) => {
    const a = p.systems.find((s) => s.id === l.from); const b = p.systems.find((s) => s.id === l.to);
    if (!a || !b) return '';
    const [ax, ay] = pos(a); const [bx, by] = pos(b);
    const y1 = ay + 36 + 5.5 * 34; const y2 = by + 36 + 4.5 * 34;
    return `<path class="schematic-link" d="M${ax + W} ${y1} C ${ax + W + 40} ${y1}, ${bx - 40} ${y2}, ${bx} ${y2}" /><circle class="schematic-dot" cx="${bx}" cy="${y2}" r="4" />`;
  }).join('');
  const blocks = p.systems.map((s, i) => {
    const [x, y] = pos(s);
    const letter = String.fromCharCode(65 + (i % 26));
    return `<div class="sys-block ${s.id === sys?.id ? 'active' : ''}" data-system="${e(s.id)}" style="left:${x}px;top:${y}px;width:${W}px">
      <div class="sys-block-head"><span class="sys-letter">${letter}</span>${icon(SYSTEMS[s.type].icon)}<span class="sys-block-type">${e(t(`sys.${s.type}`))}</span><button class="icon-button" data-system-menu="${e(s.id)}" title="${e(t('schematic.menu'))}">${icon('chevronDown', 'icon tiny')}</button></div>
      ${CELLS.map((c, k) => { const st = cellState(ctx, s, c); return `<button class="sys-cell" data-cell="${c}" data-system="${e(s.id)}" title="${e(t(`cellTip.${c}`))}"><span class="sys-cell-no">${k + 1}</span>${icon(CELL_ICONS[c], 'icon tiny')}<span class="sys-cell-name">${e(t(`cell.${c}`))}</span><span class="cell-state ${st}">${icon(CELL_STATE_ICON[st], 'icon tiny')}</span></button>`; }).join('')}
      <div class="sys-block-name">${e(s.name || t(`sys.${s.type}`))}</div>
    </div>`;
  }).join('');
  const width = 48 + (maxC + 1) * (W + GX);
  const height = 48 + (maxR + 1) * (H + GY);
  return `<div class="schematic"><div class="schematic-canvas" style="width:${width}px;height:${height}px"><svg class="schematic-links" width="${width}" height="${height}">${links}</svg>${blocks}</div></div>`;
}

// ───────────────────────── Engineering Data

export function dataTabHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const us = ctx.units();
  const selId = state.dataSel ?? p.materials[0]?.id;
  const m = p.materials.find((x) => x.id === selId);
  const list = p.materials.map((x) => `<button class="data-mat ${x.id === selId ? 'active' : ''}" data-mat="${e(x.id)}"><span class="mat-swatch" style="background:${e(x.color ?? '#999')}"></span><span>${e(materialName(x, ctx.lang()))}</span><small>${p.bodies.filter((b) => b.material === x.id).length}</small></button>`).join('');
  const lib = MATERIAL_GROUPS.map((g) => `<section class="toolbox-group"><h4>${icon('material', 'icon tiny')}<span>${e(t(`matGroup.${g}`))}</span></h4><div class="toolbox-items">${MATERIALS.filter((x) => x.group === g).map((x) => `<button class="toolbox-item" data-add-mat="${x.id}" ${p.materials.some((y) => y.id === x.id) ? 'disabled' : ''}><span class="mat-swatch" style="background:${x.color}"></span><span>${e(materialName(x, ctx.lang()))}</span></button>`).join('')}</div></section>`).join('');
  const props = m ? MATERIAL_FIELDS.map(([key, kind]) => row(MAT_ICONS[key] ?? 'dot', t(`mat.${key}`), numberControl(ctx, `materials.${m.id}.${key}`, m[key] ?? 0, kind, { min: key === 'fatigueB' || key === 'fatigueC' ? -1 : 0, step: stepOf(m[key]), label: t(`mat.${key}`) }))).join('') : '';
  // The material lists sit in the left panel (dataListHtml); this tab shows the chosen material's properties.
  void list; void lib;
  return `<div class="data-tab">
    <section class="data-props">${m ? `<h3>${icon('material')}<span>${e(materialName(m, ctx.lang()))}</span><span class="grow"></span><button class="small-button" data-mat-reset="${e(m.id)}">${icon('undo', 'icon tiny')}<span>${e(t('data.reset'))}</span></button><button class="small-button danger" data-mat-del="${e(m.id)}" ${p.bodies.some((b) => b.material === m.id) ? 'disabled' : ''}>${icon('trash', 'icon tiny')}<span>${e(t('cmd.delete'))}</span></button></h3>
      ${row('rename', t('details.name'), textControl(`materials.${m.id}.name.${ctx.lang()}`, materialName(m, ctx.lang()), t('details.name')))}
      ${row('palette', t('data.color'), `<input type="color" data-mat-color="${e(m.id)}" value="${e(m.color ?? '#999999')}" />`)}
      <div class="data-grid">${props}</div>
      <p class="sd-help">${e(t('data.help'))}</p>` : `<p class="muted">${e(t('data.pick'))}</p>`}</section>
  </div>`;
  void us;
}

/** Engineering Data's left panel: the project's materials (with how many bodies use each) and the library. */
export function dataListHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const selId = state.dataSel ?? p.materials[0]?.id;
  const list = p.materials.map((x) => `<button class="data-mat ${x.id === selId ? 'active' : ''}" data-mat="${e(x.id)}" title="${e(materialName(x, ctx.lang()))}"><span class="mat-swatch" style="background:${e(x.color ?? '#999')}"></span><span>${e(materialName(x, ctx.lang()))}</span><small>${p.bodies.filter((b) => b.material === x.id).length}</small></button>`).join('');
  const lib = MATERIAL_GROUPS.map((g) => `<section class="toolbox-group"><h4>${icon('material', 'icon tiny')}<span>${e(t(`matGroup.${g}`))}</span></h4><div class="toolbox-items">${MATERIALS.filter((x) => x.group === g).map((x) => `<button class="toolbox-item" data-add-mat="${x.id}" ${p.materials.some((y) => y.id === x.id) ? 'disabled' : ''} title="${e(t('data.addToProject', { name: materialName(x, ctx.lang()) }))}"><span class="mat-swatch" style="background:${x.color}"></span><span>${e(materialName(x, ctx.lang()))}</span></button>`).join('')}</div></section>`).join('');
  return `<div class="data-list"><h3>${icon('material')}<span>${e(t('data.project'))}</span><small class="muted">${p.materials.length}</small></h3>${list || `<p class="muted">${e(t('data.none'))}</p>`}<h3>${icon('library')}<span>${e(t('data.library'))}</span></h3>${lib}</div>`;
}

/** Design Exploration's left panel: the parameters, the objective and the design points as a tree. */
export function studyTreeHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const st = p.study;
  const us = ctx.units();
  const rows = st.rows ?? [];
  const shown = (q, v) => fmt(q?.model ? v : toDisplay(q?.kind ?? 'ratio', v, us), 4);
  const item = (glyph, label, attrs = '') => `<div class="tree-row sim-row" ${attrs} style="padding-left:22px" title="${e(label)}">${icon(glyph)}<span class="tree-label">${e(label)}</span></div>`;
  const head = (glyph, label, n = '') => `<div class="tree-row sim-row tree-root" title="${e(label)}">${icon(glyph)}<span class="tree-label">${e(label)}</span>${n !== '' ? `<small class="muted">${n}</small>` : ''}</div>`;
  const params = p.parameters.map((q) => item('parameter', `${q.label} · ${shown(q, q.min)} … ${shown(q, q.max)} ${q.model ? 'mm' : unitLabel(q.kind, us)}`, `data-study-param="${e(q.id)}"`)).join('');
  const sys = ctx.activeSystem();
  const objective = st.objective ?? (sys ? SYSTEMS[sys.type].outputs?.[0] : null);
  const points = rows.map((r, i) => item(r.error ? 'error' : Object.keys(r.outputs ?? {}).length ? 'check' : 'hourglass', `#${i + 1} · ${r.inputs.map((v, j) => shown(p.parameters[j], v)).join(', ')}`)).join('');
  const optimum = st.fit?.optimum ? `${head('simDoe', t('study.optimum'))}${item('target', st.fit.optimum.inputs.map((v, j) => `${p.parameters[j]?.label} ${shown(p.parameters[j], v)}`).join(', '))}` : '';
  return `<div class="tree sim-tree study-tree">
    ${head('parameter', t('study.parameters'), p.parameters.length)}${params || `<p class="sd-help pad">${e(t('study.noParams'))}</p>`}
    ${head('target', t('study.objective'))}${objective ? item(st.goal === 'max' ? 'arrowUp' : 'arrowDown', `${t(`out.${objective}`)} — ${t(st.goal === 'max' ? 'opt.maximize' : 'opt.minimize')}`) : ''}
    ${head('table', t('study.results'), rows.length)}${points || `<p class="sd-help pad">${e(t('study.noRows'))}</p>`}
    ${optimum}
  </div>`;
}

const stepOf = (v) => { const a = Math.abs(Number(v) || 1); return 10 ** Math.floor(Math.log10(a)) / 10; };
const MAT_ICONS = { density: 'mass', young: 'spring', poisson: 'ratio', yield: 'resStress', ultimate: 'resStress', conductivity: 'simThermal', specificHeat: 'thermometer', cte: 'expand', resistivity: 'bcVoltage', permeability: 'bcMagnet', permittivity: 'bcCharge', viscosity: 'droplet', soundSpeed: 'simAcoustic' };

// ───────────────────────── Design Exploration

export function studyTabHtml(ctx) {
  const { state, t } = ctx;
  const p = state.project;
  const us = ctx.units();
  const st = p.study;
  const sys = ctx.activeSystem();
  const candidates = ctx.parameterCandidates();
  const params = p.parameters.map((q) => `<tr><td>${icon('parameter', 'icon tiny')} ${e(q.label)}</td>
    <td>${numberControl(ctx, `parameters.${q.id}.min`, q.min, q.kind, { model: q.model, label: t('study.min'), step: q.step ?? 1 })}</td>
    <td>${numberControl(ctx, `parameters.${q.id}.max`, q.max, q.kind, { model: q.model, label: t('study.max'), step: q.step ?? 1 })}</td>
    <td>${numberControl(ctx, `parameters.${q.id}.levels`, q.levels ?? 3, 'count', { integer: true, min: 2, max: 9, label: t('study.levels') })}</td>
    <td><button class="icon-button" data-param-del="${e(q.id)}" title="${e(t('cmd.delete'))}">${icon('trash', 'icon tiny')}</button></td></tr>`).join('');
  const outs = sys ? (SYSTEMS[sys.type].outputs ?? []) : [];
  const rows = st.rows ?? [];
  const outKeys = [...new Set(rows.flatMap((r) => Object.keys(r.outputs ?? {})))];
  const table = rows.length ? `<table class="study-table"><thead><tr><th>#</th>${p.parameters.map((q) => `<th>${e(q.label)}</th>`).join('')}${outKeys.map((k) => `<th>${e(t(`out.${k}`))}<br><small>${e(unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us))}</small></th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.error ? 'error' : ''}"><td>${i + 1}</td>${r.inputs.map((v, j) => `<td>${fmt(p.parameters[j]?.model ? v : toDisplay(p.parameters[j]?.kind ?? 'ratio', v, us))}</td>`).join('')}${outKeys.map((k) => `<td>${r.outputs?.[k] !== undefined ? fmt(toDisplay(OUTPUT_KINDS[k] ?? 'ratio', r.outputs[k], us)) : r.error ? '!' : '…'}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="muted">${e(t('study.noRows'))}</p>`;
  const fit = st.fit;
  const fitHtml = fit ? Object.entries(fit.surfaces ?? {}).map(([k, sfc]) => `<div class="fit-row"><b>${e(t(`out.${k}`))}</b><span>R² = ${fmt(sfc.r2, 4)}</span><span class="sens">${p.parameters.map((q, j) => `<span class="sens-bar" title="${e(q.label)}: ${fmt(sfc.sensitivity[j], 3)}"><i style="width:${Math.min(100, Math.abs(sfc.sensitivity[j]) * 50)}%;background:${sfc.sensitivity[j] >= 0 ? 'var(--accent)' : '#e5484d'}"></i><em>${e(q.label)}</em></span>`).join('')}</span></div>`).join('') : '';
  const opt = fit?.optimum ? `<div class="study-opt">${icon('target')}<b>${e(t('study.optimum'))}</b>${p.parameters.map((q, j) => `<span>${e(q.label)} = ${fmt(q.model ? fit.optimum.inputs[j] : toDisplay(q.kind, fit.optimum.inputs[j], us))} ${e(q.model ? 'mm' : unitLabel(q.kind, us))}</span>`).join('')}${Object.entries(fit.optimum.outputs).map(([k, v]) => `<span>${e(t(`out.${k}`))} ≈ ${fmt(toDisplay(OUTPUT_KINDS[k] ?? 'ratio', v, us))} ${e(unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us))}</span>`).join('')}</div>` : '';
  return `<div class="study-tab">
    <section class="study-card"><h3>${icon('parameter')}<span>${e(t('study.parameters'))}</span><span class="grow"></span>${selectControl('$addParam', '', [['', t('study.addParam'), 'plus'], ...candidates.map((c) => [c.path, c.label, 'parameter'])], 'plus')}</h3>
      ${p.parameters.length ? `<table class="param-table"><thead><tr><th>${e(t('study.name'))}</th><th>${e(t('study.min'))}</th><th>${e(t('study.max'))}</th><th>${e(t('study.levels'))}</th><th></th></tr></thead><tbody>${params}</tbody></table>` : `<p class="muted">${e(t('study.noParams'))}</p>`}
    </section>
    <section class="study-card"><h3>${icon('simDoe')}<span>${e(t('study.design'))}</span></h3>
      ${row('simDoe', t('study.method'), selectControl('study.method', st.method, [['ccd', t('opt.ccd'), 'simDoe'], ['fullFactorial', t('opt.fullFactorial'), 'grid'], ['lhs', t('opt.lhs'), 'dice']], 'simDoe'))}
      ${st.method === 'lhs' ? row('count', t('study.samples'), numberControl(ctx, 'study.samples', st.samples ?? 12, 'count', { integer: true, min: 4, max: 200, label: t('study.samples') })) : ''}
      ${row('simSystems', t('study.system'), sys ? `<span class="sd-value">${e(sys.name || t(`sys.${sys.type}`))}</span>` : `<span class="muted">${e(t('study.noSystem'))}</span>`)}
      ${row('target', t('study.objective'), selectControl('study.objective', st.objective ?? outs[0] ?? '', outs.map((k) => [k, t(`out.${k}`), 'target']), 'target'))}
      ${row('target', t('study.goal'), selectControl('study.goal', st.goal ?? 'min', [['min', t('opt.minimize'), 'arrowDown'], ['max', t('opt.maximize'), 'arrowUp']], 'target'))}
      <div class="sd-buttons">${button('runStudy', 'play', t('cmd.runStudy'), 'primary')}${button('fitStudy', 'chartLine', t('cmd.fitStudy'))}${button('clearStudy', 'trash', t('cmd.clearStudy'), 'danger')}</div>
    </section>
    <section class="study-card wide"><h3>${icon('table')}<span>${e(t('study.results'))}</span><span class="muted">${rows.length}</span></h3>${table}</section>
    <section class="study-card wide"><h3>${icon('chartLine')}<span>${e(t('study.surfaces'))}</span></h3>${fitHtml || `<p class="muted">${e(t('study.noFit'))}</p>`}${opt}<div class="study-chart">${ctx.studyChart?.() ?? ''}</div></section>
  </div>`;
}

export { BC_CATS };
