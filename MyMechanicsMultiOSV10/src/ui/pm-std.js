// PropertyManager pages of the standard-part and route features, and the pieces the library / routing pages
// of app-std.js share with them (HTML only — app.js and app-std.js bind the data-pm* attributes).
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select } from './propertymanager.js';
import { STD_ITEMS, STD_KINDS, STD_CATEGORIES, PIPE_SIZES, GEAR_MODULES, METRIC, designation, sizeTable, sizeOf, gearCircles, helicalGeometry, bevelGeometry, pulleyGeometry, bearingBalls, hubKeyway, gearProfile } from '../cad/stdparts.js';
import { isoThread } from '../cad/threads.js';
import { materialName } from '../cad/materials.js';
import { ROUTE_ICONS } from '../cad/std-types.js';
import { getLanguage } from '../i18n.js';
import { harnessModel, harnessFlat, harnessSvg, harnessPoints, WIRE_SIZES, WIRE_COLOURS } from '../cad/harness.js';
import { CONNECTOR_TYPE_IDS, CLIP_TYPE_IDS, connectorDims } from '../cad/harness-parts.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
export const ROUTE_COLOURS = ['#d23c3c', '#2f6fd6', '#2e9e4f', '#f0c419', '#222428', '#f2f2f2', '#e07b22', '#8a4fd1'];
export const AXIS_CHOICES = [['z', '+Z'], ['-z', '−Z'], ['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y']];

/** Local names for the designations ("Spur gear", "Elbow 90°" …). */
export const stdNames = (t) => ({ spurGear: t('std.item.spurGear'), helicalGear: t('std.item.helicalGear'), bevelGear: t('std.item.bevelGear'), gearRack: t('std.item.gearRack'), timingPulley: t('std.item.timingPulley'), elbow90: t('std.item.elbow90'), elbow45: t('std.item.elbow45'), pipeTee: t('std.item.pipeTee'), flange: t('std.item.flange') });

/** Thread display choices of a threaded part (data-pm-select stdThreads). */
export const threadModeSelect = (api, value, key = 'stdThreads') => select(key, [['auto', api.t('thread.mode.auto')], ['cosmetic', api.t('thread.mode.cosmetic')], ['modelled', api.t('thread.mode.modelled')]], value ?? 'auto', api.t('thread.display'));

/**
 * The size / length / gear choices of a library part (`p`): selects keyed stdSize, stdLength, stdModule,
 * stdThreads; fields teeth, mateTeeth, helixAngle, width, height, bore; the hand and the keyway.
 */
export function sizeControls(api, p) {
  const { t } = api;
  const item = STD_ITEMS[p.kind];
  const out = [];
  const num = (key, label, opts = {}) => field(api, key, p[key], { label, ...opts });
  if (item.pipe) out.push(select('stdSize', PIPE_SIZES.map((s) => [s, s]), p.dn, t('std.size')));
  else if (item.gear) {
    out.push(select('stdModule', GEAR_MODULES.map((m) => [String(m), `m ${m}`]), String(p.module), t('std.module')));
    out.push(num('teeth', t(p.kind === 'gearRack' ? 'std.rackTeeth' : 'std.teeth'), { unit: 'count', glyph: 'spurGear', min: p.kind === 'gearRack' ? 1 : 6, step: 1 }));
    if (p.kind === 'helicalGear') {
      out.push(num('helixAngle', t('std.helixAngle'), { unit: 'angle', glyph: 'dimAngle', min: 0 }));
      out.push(`<label class="pm-field"><span class="pm-label">${escapeHtml(t('std.hand'))}</span></label>${seg('hand', [['right', t('std.hand.right'), 'flipH'], ['left', t('std.hand.left'), 'flipH']], p.hand ?? 'right')}`);
    }
    if (p.kind === 'bevelGear') out.push(num('mateTeeth', t('std.mateTeeth'), { unit: 'count', glyph: 'bevelGear', min: 6, step: 1 }));
    out.push(num('width', t('std.faceWidth'), { min: 0.1 }));
    if (p.kind === 'gearRack') out.push(num('height', t('std.rackHeight'), { min: 0.1 }));
    else out.push(num('bore', t('std.bore'), { glyph: 'dimDiameter', min: 0 }), check('keyway', p.keyway, t('std.keyway'), 'parallelKey'));
  } else if (item.pulley) {
    out.push(select('stdSize', item.sizes.map((s) => [s, s]), String(p.size), t('std.profile')));
    out.push(num('teeth', t('std.teeth'), { unit: 'count', glyph: 'timingPulley', min: 10, step: 1 }));
    out.push(num('width', t('std.faceWidth'), { min: 0.1 }), num('bore', t('std.bore'), { glyph: 'dimDiameter', min: 0 }), check('keyway', p.keyway, t('std.keyway'), 'parallelKey'));
  } else out.push(select('stdSize', item.sizes.map((s) => [s, s]), String(p.size), t('std.size')));
  if (item.lengths) out.push(select('stdLength', item.lengths(String(p.size)).map((l) => [String(l), `${l} mm`]), String(p.length), t('std.length')));
  if (item.threads) out.push(threadModeSelect(api, p.threads));
  return out.join('');
}

/** Figures of the part worth knowing: thread diameters, gear circles, the ball set, the keyway. */
export function stdInfo(api, p) {
  const { t } = api;
  const item = STD_ITEMS[p.kind];
  const f = (v) => api.fmt?.(v, 3) ?? String(Math.round(v * 1000) / 1000);
  const rows = [];
  const row = (label, value) => rows.push(`<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`);
  try {
    if (item?.threads && METRIC[p.size]) {
      const s = isoThread(METRIC[p.size].d, METRIC[p.size].p);
      row(t('thread.diameters'), t('std.threadInfo', { d: s.d, p: s.P, d2: f(s.d2), d3: f(item.nut ? s.d1 : s.d3) }));
    }
    if (p.kind === 'ballBearing') { const g = bearingBalls(p.size); row(t('std.col.balls'), t('std.info.balls', { count: g.count, dw: f(g.Dw), dm: f(g.pitch) })); }
    if (p.kind === 'spurGear') {
      const c = gearCircles(p);
      row(t('std.info.pitchDia'), f(c.pitch)); row(t('std.info.tipDia'), f(c.tip)); row(t('std.info.rootDia'), f(c.root));
      if (gearProfile({ module: Number(p.module), teeth: Math.round(Number(p.teeth)) }).undercut) row(t('std.info.undercut'), '⚠');
    }
    if (p.kind === 'helicalGear') {
      const g = helicalGeometry({ module: Number(p.module), teeth: Number(p.teeth), width: Number(p.width), helixAngle: Number(p.helixAngle) });
      row(t('std.info.pitchDia'), f(g.pitchDiameter)); row(t('std.info.tipDia'), f(g.tipDiameter)); row(t('std.info.lead'), Number.isFinite(g.lead) ? f(g.lead) : '∞'); row(t('std.info.twist'), `${f(g.twist)}°`);
    }
    if (p.kind === 'bevelGear') {
      const g = bevelGeometry({ module: Number(p.module), teeth: Number(p.teeth), mateTeeth: Number(p.mateTeeth) });
      row(t('std.info.pitchAngle'), `${f((g.delta * 180) / Math.PI)}°`); row(t('std.info.coneDistance'), f(g.Re)); row(t('std.info.tipDia'), f(g.tipDiameter));
    }
    if (p.kind === 'timingPulley') { const g = pulleyGeometry(p.size, Number(p.teeth)); row(t('std.info.pitchDia'), t('std.info.pulley', { da: f(g.da), d0: f(g.d0) })); }
    if ((item?.gear || item?.pulley) && p.kind !== 'gearRack' && p.kind !== 'bevelGear' && item) row(t('std.col.rootRadius'), item.pulley ? '—' : t('std.info.fillet'));
    if (p.keyway && Number(p.bore) > 0) { const k = hubKeyway(Number(p.bore)); row(t('std.keyway'), k ? t('std.keywayFor', { key: k.key.replace('x', '×'), b: k.b, t2: k.t2 }) : t('std.keywayNone')); }
  } catch { /* incomplete values while typing */ }
  return rows.length ? `<dl class="pm-results std-info">${rows.join('')}</dl>` : '';
}

/** The size table of the item; the current size's row is marked, a row click picks that size. */
export function sizeTableHtml(api, p) {
  const { t } = api;
  const [cols, rows] = sizeTable(p.kind);
  const current = sizeOf(p);
  const head = `<tr><th>${escapeHtml(t('std.col.size'))}</th>${cols.map((c) => `<th>${escapeHtml(t(`std.col.${c}`))}</th>`).join('')}</tr>`;
  const body = rows.map(([size, ...vals]) => `<tr class="${String(size) === String(current) ? 'active' : ''}" data-pm-set="stdSize" data-value="${escapeHtml(String(size))}" title="${escapeHtml(t('std.pickSize'))}"><th>${escapeHtml(String(size))}</th>${vals.map((v) => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('');
  return `<div class="std-table-wrap"><table class="std-table">${head}${body}</table></div>`;
}

/** The kind chooser of a library part (grouped by category). */
export function kindSelect(api, p) {
  const { t } = api;
  const options = STD_CATEGORIES.flatMap((c) => c.items.map((k) => [k, `${t(`std.cat.${c.id}`)} › ${t(`std.item.${k}`)}`, STD_ITEMS[k].icon]));
  return select('stdKind', options, p.kind, t('std.kind'));
}

/** Designation, standard and material of a library part. */
export function stdSummary(api, p) {
  const { t } = api;
  const item = STD_ITEMS[p.kind];
  return `<dl class="pm-results std-summary"><dt>${escapeHtml(t('std.designation'))}</dt><dd>${escapeHtml(designation(p, stdNames(t)))}</dd><dt>${escapeHtml(t('std.standard'))}</dt><dd>${escapeHtml(item.standard)}</dd><dt>${escapeHtml(t('std.material'))}</dt><dd>${escapeHtml(materialName(item.material, getLanguage() === 'en' ? 'en' : 'ko'))}</dd></dl>${stdInfo(api, p)}`;
}

/** Placement of a part in a part: position, axis, spin; join to the body. */
export function placementGroup(api, p, { merge = true } = {}) {
  const { t } = api;
  return group('moveBody', t('std.placement'), `${['x', 'y', 'z'].map((k) => field(api, k, p[k] ?? 0, { label: k.toUpperCase(), glyph: 'pointTool' })).join('')}<label class="pm-field"><span class="pm-label">${escapeHtml(t('std.axis'))}</span></label>${seg('axis', AXIS_CHOICES, p.axis ?? 'z')}${field(api, 'angle', p.angle ?? 0, { label: t('std.spin'), unit: 'angle', glyph: 'dimAngle' })}${merge ? check('merge', p.merge, t('std.merge'), 'combineBodies') : ''}`);
}

/** The route's settings: kind, section, bends / fittings, colour (cables). */
export function routeSettings(api, f) {
  const { t } = api;
  const kinds = seg('kind', [['pipe', t('route.pipe'), ROUTE_ICONS.pipe], ['tube', t('route.tube'), ROUTE_ICONS.tube], ['cable', t('route.cable'), ROUTE_ICONS.cable], ['harness', t('route.harness'), ROUTE_ICONS.harness]], f.kind);
  let section;
  if (f.kind === 'pipe') {
    section = `${select('dn', PIPE_SIZES.map((s) => [s, s]), f.dn, t('route.pipeSize'))}${seg('fittings', [['bends', t('route.bends'), 'pipeBend'], ['elbows', t('route.elbows'), 'pipeElbow']], f.fittings ?? 'bends')}${f.fittings === 'elbows' ? note(t('route.elbowRadius')) : field(api, 'bendRadius', f.bendRadius, { label: t('route.bendRadius'), glyph: 'dimRadius', min: 0.1 })}<label class="pm-field"><span class="pm-label">${escapeHtml(t('route.flanges'))}</span></label>${seg('flanges', [['none', t('route.flangeNone')], ['start', t('route.flangeStart')], ['end', t('route.flangeEnd')], ['both', t('route.flangeBoth')]], f.flanges ?? 'none')}`;
  } else if (f.kind === 'tube') {
    section = `${field(api, 'od', f.od, { label: t('route.od'), glyph: 'dimDiameter', min: 0.1 })}${field(api, 'wall', f.wall, { label: t('route.wall'), min: 0.01 })}${field(api, 'bendRadius', f.bendRadius, { label: t('route.bendRadius'), glyph: 'dimRadius', min: 0.1 })}`;
  } else if (f.kind === 'harness') {
    section = `${field(api, 'diameter', f.diameter, { label: t('harness.emptyDiameter'), glyph: 'dimDiameter', min: 0.1 })}${field(api, 'fill', f.fill ?? 0.8, { label: t('harness.fill'), unit: 'number', glyph: 'harnessBundle', min: 0.05 })}${field(api, 'bendRadius', f.bendRadius, { label: t('harness.bendRadius'), glyph: 'dimRadius', min: 0 })}${field(api, 'endAllowance', f.endAllowance ?? 0, { label: t('harness.endAllowance'), glyph: 'smartDim', min: 0 })}<label class="pm-field"><span class="pm-label">${escapeHtml(t('harness.tape'))}</span></label><span class="route-colours" role="radiogroup">${['#2b2d31', '#222428', '#8f969e', '#2f6fd6', '#e07b22'].map((c) => `<button type="button" class="route-colour ${c === f.color ? 'active' : ''}" data-pm-set="color" data-value="${c}" style="--swatch:${c}" title="${c}" aria-pressed="${c === f.color}"></button>`).join('')}</span>${note(t('harness.rule'))}`;
  } else {
    section = `${field(api, 'diameter', f.diameter, { label: t('route.diameter'), glyph: 'dimDiameter', min: 0.1 })}<label class="pm-field"><span class="pm-label">${escapeHtml(t('route.colour'))}</span></label><span class="route-colours" role="radiogroup">${ROUTE_COLOURS.map((c) => `<button type="button" class="route-colour ${c === f.color ? 'active' : ''}" data-pm-set="color" data-value="${c}" style="--swatch:${c}" title="${c}" aria-pressed="${c === f.color}"></button>`).join('')}</span>${note(t('route.cableSpline'))}`;
  }
  return [group(ROUTE_ICONS[f.kind] ?? 'pipeRoute', t('route.type'), kinds), group('dimDiameter', t('route.section'), section)].join('');
}

/** The point table (pt3:i:j fields, addPt3 / delPt3), the path chooser and the plane for clicked points. */
export function routePoints(api, f, { paths = [], picking = false, drawPlane = null } = {}) {
  const { t } = api;
  const pathSel = paths.length ? select('path', [['', t('route.ownPoints')], ...paths.map((p) => [p.id, p.name, 'sketch3d'])], f.path ?? '', t('route.path')) : '';
  if (f.path) return group('sketch3d', t('route.points'), `${pathSel}${note(t('route.followsPath'))}`);
  const rows = (f.points ?? []).map((p, i) => `<div class="pt3-row"><b>${i + 1}</b>${['x', 'y', 'z'].map((axis, j) => `<input type="text" class="pm-text" data-pm-field="pt3:${i}:${j}" data-num value="${escapeHtml(api.fmtLenBare(p[j]))}" title="${axis.toUpperCase()}" spellcheck="false"/>`).join('')}<button class="icon-button" data-pm="delPt3:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
  const planes = drawPlane ? `<label class="pm-field"><span class="pm-label">${escapeHtml(t('route.clickPlane'))}</span></label>${seg('drawPlane', [['top', t('plane.top')], ['front', t('plane.front')], ['right', t('plane.right')]], drawPlane)}` : '';
  return group('tablePattern', t('route.points'), `${pathSel}<div class="pt3-table"><div class="pt3-row head"><b>#</b><span>X</span><span>Y</span><span>Z</span><span></span></div>${rows}</div><div class="pm-row"><button class="small-button" data-pm="addPt3">${icon('plus')}<span>${escapeHtml(t('pm.addPoint'))}</span></button></div>${planes}${note(t(picking ? 'route.clickToAdd' : 'route.typePoints'))}`);
}

const ptInputs = (api, key, p) => ['x', 'y', 'z'].map((axis, j) => `<input type="text" class="pm-text" data-pm-field="${key}:${j}" data-num value="${escapeHtml(api.fmtLenBare(p[j]))}" title="${axis.toUpperCase()}" spellcheck="false"/>`).join('');
const delBtn = (api, cmd) => `<button class="icon-button" data-pm="routeEdit:${cmd}" title="${escapeHtml(api.t('action.delete'))}">${icon('trash', 'icon tiny')}</button>`;
const addBtn = (api, cmd, glyph, label) => `<button class="small-button" data-pm="routeEdit:${cmd}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
const txt = (key, value, title = '') => `<input type="text" class="pm-text" data-pm-field="${escapeHtml(key)}" value="${escapeHtml(value ?? '')}" title="${escapeHtml(title)}" spellcheck="false"/>`;
const sel = (key, options, current, title = '') => `<select data-pm-select="${escapeHtml(key)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${options.map(([v, text]) => `<option value="${escapeHtml(v)}" ${String(v) === String(current) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;

/** Branches of the route: each starts on the network (tee / saddle / splice there) with its own size and points. */
export function routeBranches(api, f) {
  const { t } = api;
  const list = (f.branches ?? []).map((b, i) => {
    let size = '';
    if (f.kind === 'pipe') size = sel(`rb:${i}:dn`, [['', `${t('route.sameSize')} (${f.dn})`], ...PIPE_SIZES.map((s) => [s, s])], b.dn ?? '', t('route.pipeSize'));
    else if (f.kind === 'tube') size = `${txt(`rb:${i}:od`, b.od ?? '', t('route.od'))}${txt(`rb:${i}:wall`, b.wall ?? '', t('route.wall'))}`;
    else if (f.kind === 'cable') size = `${txt(`rb:${i}:diameter`, b.diameter ?? '', t('route.diameter'))}<span class="route-colours">${ROUTE_COLOURS.map((c) => `<button type="button" class="route-colour ${c === (b.color ?? f.color) ? 'active' : ''}" data-pm-set="rb:${i}:color" data-value="${c}" style="--swatch:${c}" title="${c}"></button>`).join('')}</span>`;
    const rows = (b.points ?? []).map((p, k) => `<div class="pt3-row"><b>${k + 1}</b>${ptInputs(api, `rbp:${i}:${k}`, p)}${k ? delBtn(api, `delBranchPt.${i}.${k}`) : '<span></span>'}</div>`).join('');
    return `<div class="route-branch"><div class="pm-row"><b>${icon('routeBranch', 'icon tiny')}${escapeHtml(t('route.branch'))} ${i + 1}</b><span class="grow"></span>${delBtn(api, `delBranch.${i}`)}</div>${size ? `<div class="route-branch-size">${size}</div>` : ''}<div class="pt3-table"><div class="pt3-row head"><b>#</b><span>X</span><span>Y</span><span>Z</span><span></span></div>${rows}</div>${addBtn(api, `addBranchPt.${i}`, 'plus', t('pm.addPoint'))}</div>`;
  }).join('');
  return group('routeBranch', t('route.branches'), `${list}<div class="pm-row">${addBtn(api, 'addBranch', 'routeBranch', t('route.addBranch'))}</div>${note(t(f.kind === 'pipe' ? 'route.branchPipe' : f.kind === 'tube' ? 'route.branchTube' : f.kind === 'harness' ? 'route.branchHarness' : 'route.branchCable'))}`);
}

/** A connector's housing size as text ("9 × 6.5 × 16"). */
const connDimsText = (c) => { const d = connectorDims(c.type ?? 'rect25', c.pins ?? 1); const n = (v) => String(Math.round(v * 10) / 10); return d.shape === 'round' ? `Ø${n(d.D)} × ${d.depth}` : `${n(d.w)} × ${n(d.h)} × ${d.depth}`; };

/** Harness tables: connectors (name, point, pins), clips (point), wires (from pin, to pin, size, colour, clips). */
export function harnessTables(api, f, features = []) {
  const { t } = api;
  const pts = harnessPoints(f, features);
  const ptName = (p) => p.map((v) => api.fmtLenBare(v)).join(', ');
  const ptKey = (p) => p.join(',');
  const conns = f.connectors ?? [];
  const cRows = conns.map((c, i) => {
    const opts = pts.map((p) => [ptKey(p), ptName(p)]);
    if (!pts.some((p) => ptKey(p) === ptKey(c.at))) opts.unshift([ptKey(c.at), `${ptName(c.at)} ⚠`]);
    return `<div class="harness-row conn">${txt(`hc:${i}:name`, c.name, t('harness.name'))}${sel(`hc:${i}:at`, opts, ptKey(c.at), t('harness.point'))}${txt(`hc:${i}:pins`, c.pins, t('harness.pins'))}${delBtn(api, `delConn.${i}`)}${sel(`hc:${i}:type`, CONNECTOR_TYPE_IDS.map((k) => [k, t(`harness.conn.${k}`)]), c.type ?? 'rect25', t('harness.connType'))}<span class="harness-dims">${escapeHtml(connDimsText(c))}</span></div>`;
  }).join('');
  const kRows = (f.clips ?? []).map((c, i) => `<div class="pt3-row"><b title="${escapeHtml(c.name ?? '')}">${escapeHtml(c.name ?? `C${i + 1}`)}</b>${ptInputs(api, `hk:${i}`, c.at)}${delBtn(api, `delClip.${i}`)}</div><div class="harness-clip-type">${sel(`hk:${i}:type`, CLIP_TYPE_IDS.map((k) => [k, t(`harness.clip.${k}`)]), c.type ?? 'pClip', t('harness.clipType'))}</div>`).join('');
  const names = conns.map((c) => [c.name, c.name]);
  const wRows = (f.wires ?? []).map((w, i) => `<div class="harness-row wire" style="--swatch:${escapeHtml(WIRE_COLOURS[w.color] ?? '#888')}">${txt(`hw:${i}:name`, w.name, t('harness.name'))}${sel(`hw:${i}:from`, names, w.from, t('harness.from'))}${txt(`hw:${i}:fromPin`, w.fromPin, t('harness.pin'))}${sel(`hw:${i}:to`, names, w.to, t('harness.to'))}${txt(`hw:${i}:toPin`, w.toPin, t('harness.pin'))}${sel(`hw:${i}:gauge`, WIRE_SIZES.map((g) => [g, `${g} mm²`]), w.gauge, t('harness.gauge'))}${sel(`hw:${i}:color`, Object.keys(WIRE_COLOURS).map((k) => [k, t(`harness.colour.${k}`)]), w.color, t('route.colour'))}${txt(`hw:${i}:via`, (w.via ?? []).join(', '), t('harness.via'))}${delBtn(api, `delWire.${i}`)}</div>`).join('');
  return [
    group('harnessConnector', t('harness.connectors'), `<div class="harness-row head conn"><span>${escapeHtml(t('harness.name'))}</span><span>${escapeHtml(t('harness.point'))}</span><span>${escapeHtml(t('harness.pins'))}</span><span></span></div>${cRows}<div class="pm-row">${addBtn(api, 'addConn', 'harnessConnector', t('harness.addConnector'))}</div>`),
    group('harnessClip', t('harness.clips'), `<div class="pt3-table">${kRows}</div><div class="pm-row">${addBtn(api, 'addClip', 'harnessClip', t('harness.addClip'))}</div>${note(t('harness.clipRule'))}`),
    group('harnessWire', t('harness.wires'), `<div class="harness-wires">${wRows}</div><div class="pm-row">${addBtn(api, 'addWire', 'harnessWire', t('harness.addWire'))}${api.schematics?.length ? addBtn(api, 'fromSchematic', 'schematic', t('harness.fromSchematic')) : ''}</div>${note(t('harness.wireRule'))}`),
  ].join('');
}

/** Labels of the flattened harness drawing and its tables in the user's language. */
export const harnessLabels = (t) => ({ title: t('harness.flat'), pin: t('harness.pin'), wire: t('harness.wire'), colour: t('route.colour'), size: 'mm²', to: t('harness.to'), from: t('harness.from'), length: t('route.length'), wireList: t('harness.wireList') });

/** Harness results: wire list, bundle diameters, the flattened harness (preview, SVG / DXF export). */
export function harnessResults(api, f, bom, features = []) {
  const { t } = api;
  if (!bom || bom.kind !== 'harness') return '';
  const wl = bom.wires.map((w) => `<tr><td><i class="route-swatch" style="--swatch:${escapeHtml(WIRE_COLOURS[w.color] ?? '#888')}"></i>${escapeHtml(w.wire)}</td><td>${escapeHtml(`${w.from}:${w.fromPin}`)}</td><td>${escapeHtml(`${w.to}:${w.toPin}`)}</td><td>${escapeHtml(String(w.gauge))}</td><td data-wire-length="${w.length}">${escapeHtml(api.fmtLen(w.length))}</td></tr>`).join('');
  const dia = [...new Set(bom.bundles.map((b) => b.diameter))].sort((a, b) => b - a).map((d) => `Ø${api.fmt(d, 2)}`).join(' · ');
  let flat = '';
  try { flat = harnessSvg(harnessFlat(harnessModel(f, features)), { labels: harnessLabels(t) }); } catch (error) { flat = `<p class="pm-error">${icon('error')}<span>${escapeHtml(t(`rebuild.${error.code ?? 'route-failed'}`, null, error.code ?? ''))}</span></p>`; }
  return [
    group('harnessWire', t('harness.wireList'), `<div class="std-table-wrap"><table class="std-table route-bom"><tr><th>${escapeHtml(t('harness.wire'))}</th><th>${escapeHtml(t('harness.from'))}</th><th>${escapeHtml(t('harness.to'))}</th><th>mm²</th><th>${escapeHtml(t('route.length'))}</th></tr>${wl}</table></div><dl class="pm-results"><dt>${escapeHtml(t('harness.bundleDiameters'))}</dt><dd>${escapeHtml(dia)}</dd></dl>`),
    group('harnessFlat', t('harness.flat'), `<div class="harness-flat">${flat}</div><div class="pm-row">${addBtn(api, 'exportSvg', 'exportFile', t('harness.exportSvg'))}${addBtn(api, 'exportDxf', 'exportFile', t('harness.exportDxf'))}</div>${note(t('harness.flatRule'))}${note(t('harness.drawingHint'))}`),
  ].join('');
}

/** Route length and bill of materials. */
export function routeBomHtml(api, bom) {
  const { t } = api;
  if (!bom) return '';
  const item = (r) => {
    if (r.item === 'elbow') return `${t('route.bom.elbow')} ${r.angle}°`;
    if (r.item === 'elbowCut') return `${t('route.bom.elbowCut', { from: r.from })} ${r.angle}°`;
    if (r.item === 'lateral' || r.item === 'saddle') return `${t(`route.bom.${r.item}`)}${r.angle != null ? ` ${r.angle}°` : ''}`;
    if (r.item === 'connector' || r.item === 'clip') return `${t(`route.bom.${r.item}`)} (${t(`harness.${r.item === 'connector' ? 'conn' : 'clip'}.${r.type}`)})`;
    return t(`route.bom.${r.item}`);
  };
  const rows = bom.rows.map((r) => `<tr><td>${r.color ? `<i class="route-swatch" style="--swatch:${escapeHtml(r.color)}"></i>` : ''}${escapeHtml(item(r))}</td><td>${escapeHtml(r.size)}</td><td>${r.qty}</td><td>${r.length == null ? '—' : escapeHtml(api.fmtLen(r.length))}</td></tr>`).join('');
  return group('bom', t('route.bom'), `<dl class="pm-results"><dt>${escapeHtml(t('route.length'))}</dt><dd data-route-length="${bom.length.toFixed(3)}">${escapeHtml(api.fmtLen(bom.length))}</dd>${bom.bends != null ? `<dt>${escapeHtml(t('route.bendCount'))}</dt><dd>${bom.bends}</dd>` : ''}</dl><div class="std-table-wrap"><table class="std-table route-bom"><tr><th>${escapeHtml(t('route.bom.item'))}</th><th>${escapeHtml(t('route.bom.size'))}</th><th>${escapeHtml(t('route.bom.qty'))}</th><th>${escapeHtml(t('route.bom.cutLength'))}</th></tr>${rows}</table></div>${(bom.notes ?? []).map((n) => note(t(`route.note.${n}`))).join('')}`);
}

/** Feature PM pages (propertymanager.js calls them after the header). */
export const STD_PM = {
  stdPart(api, f) {
    const { t } = api;
    const p = { ...f };
    return [
      group(STD_ITEMS[f.kind]?.icon ?? 'stdLibrary', t('std.part'), `${kindSelect(api, p)}${sizeControls(api, p)}${stdSummary(api, p)}`),
      group('csvFile', t('std.sizeTable'), sizeTableHtml(api, p)),
      placementGroup(api, p),
    ].join('');
  },
  route(api, f, e) {
    const paths = (api.featuresBefore?.(f) ?? []).filter((x) => (x.type === 'sketch3d' || x.type === 'curveXYZ') && !x.suppressed);
    const bom = api.previewResult?.ok ? api.previewResult.route?.bom : null;
    const features = api.featuresBefore?.(f) ?? [];
    return [routeSettings(api, f), routePoints(api, f, { paths, picking: e?.pick === 'points3d', drawPlane: e?.drawPlane ?? 'top' }), routeBranches(api, f), f.kind === 'harness' ? harnessTables(api, f, features) : '', routeBomHtml(api, bom), harnessResults(api, f, bom, features)].join('');
  },
};

export { STD_KINDS };
