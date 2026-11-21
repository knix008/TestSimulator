// PropertyManager pages of the standard-part and route features, and the pieces the library / routing pages
// of app-std.js share with them (HTML only — app.js and app-std.js bind the data-pm* attributes).
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select } from './propertymanager.js';
import { STD_ITEMS, STD_KINDS, STD_CATEGORIES, PIPE_SIZES, GEAR_MODULES, designation, sizeTable, sizeOf } from '../cad/stdparts.js';
import { materialName } from '../cad/materials.js';
import { ROUTE_ICONS } from '../cad/std-types.js';
import { getLanguage } from '../i18n.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
export const ROUTE_COLOURS = ['#d23c3c', '#2f6fd6', '#2e9e4f', '#f0c419', '#222428', '#f2f2f2', '#e07b22', '#8a4fd1'];
export const AXIS_CHOICES = [['z', '+Z'], ['-z', '−Z'], ['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y']];

/** Local names for the designations ("Spur gear", "Elbow 90°" …). */
export const stdNames = (t) => ({ spurGear: t('std.item.spurGear'), elbow90: t('std.item.elbow90'), elbow45: t('std.item.elbow45'), pipeTee: t('std.item.pipeTee'), flange: t('std.item.flange') });

/** The size / length / gear choices of a library part (`p`): selects keyed stdSize, stdLength, stdModule. */
export function sizeControls(api, p) {
  const { t } = api;
  const item = STD_ITEMS[p.kind];
  const out = [];
  if (item.pipe) out.push(select('stdSize', PIPE_SIZES.map((s) => [s, s]), p.dn, t('std.size')));
  else if (item.gear) {
    out.push(select('stdModule', GEAR_MODULES.map((m) => [String(m), `m ${m}`]), String(p.module), t('std.module')));
    out.push(field(api, 'teeth', p.teeth, { label: t('std.teeth'), unit: 'count', glyph: 'spurGear', min: 6, step: 1 }));
    out.push(field(api, 'width', p.width, { label: t('std.faceWidth'), min: 0.1 }));
    out.push(field(api, 'bore', p.bore, { label: t('std.bore'), glyph: 'dimDiameter', min: 0 }));
  } else out.push(select('stdSize', item.sizes.map((s) => [s, s]), String(p.size), t('std.size')));
  if (item.lengths) out.push(select('stdLength', item.lengths(String(p.size)).map((l) => [String(l), `${l} mm`]), String(p.length), t('std.length')));
  return out.join('');
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
  return `<dl class="pm-results std-summary"><dt>${escapeHtml(t('std.designation'))}</dt><dd>${escapeHtml(designation(p, stdNames(t)))}</dd><dt>${escapeHtml(t('std.standard'))}</dt><dd>${escapeHtml(item.standard)}</dd><dt>${escapeHtml(t('std.material'))}</dt><dd>${escapeHtml(materialName(item.material, getLanguage() === 'en' ? 'en' : 'ko'))}</dd></dl>`;
}

/** Placement of a part in a part: position, axis, spin; join to the body. */
export function placementGroup(api, p, { merge = true } = {}) {
  const { t } = api;
  return group('moveBody', t('std.placement'), `${['x', 'y', 'z'].map((k) => field(api, k, p[k] ?? 0, { label: k.toUpperCase(), glyph: 'pointTool' })).join('')}<label class="pm-field"><span class="pm-label">${escapeHtml(t('std.axis'))}</span></label>${seg('axis', AXIS_CHOICES, p.axis ?? 'z')}${field(api, 'angle', p.angle ?? 0, { label: t('std.spin'), unit: 'angle', glyph: 'dimAngle' })}${merge ? check('merge', p.merge, t('std.merge'), 'combineBodies') : ''}`);
}

/** The route's settings: kind, section, bends / fittings, colour (cables). */
export function routeSettings(api, f) {
  const { t } = api;
  const kinds = seg('kind', [['pipe', t('route.pipe'), ROUTE_ICONS.pipe], ['tube', t('route.tube'), ROUTE_ICONS.tube], ['cable', t('route.cable'), ROUTE_ICONS.cable]], f.kind);
  let section;
  if (f.kind === 'pipe') {
    section = `${select('dn', PIPE_SIZES.map((s) => [s, s]), f.dn, t('route.pipeSize'))}${seg('fittings', [['bends', t('route.bends'), 'pipeBend'], ['elbows', t('route.elbows'), 'pipeElbow']], f.fittings ?? 'bends')}${f.fittings === 'elbows' ? note(t('route.elbowRadius')) : field(api, 'bendRadius', f.bendRadius, { label: t('route.bendRadius'), glyph: 'dimRadius', min: 0.1 })}<label class="pm-field"><span class="pm-label">${escapeHtml(t('route.flanges'))}</span></label>${seg('flanges', [['none', t('route.flangeNone')], ['start', t('route.flangeStart')], ['end', t('route.flangeEnd')], ['both', t('route.flangeBoth')]], f.flanges ?? 'none')}`;
  } else if (f.kind === 'tube') {
    section = `${field(api, 'od', f.od, { label: t('route.od'), glyph: 'dimDiameter', min: 0.1 })}${field(api, 'wall', f.wall, { label: t('route.wall'), min: 0.01 })}${field(api, 'bendRadius', f.bendRadius, { label: t('route.bendRadius'), glyph: 'dimRadius', min: 0.1 })}`;
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

/** Route length and bill of materials. */
export function routeBomHtml(api, bom) {
  const { t } = api;
  if (!bom) return '';
  const item = (r) => {
    if (r.item === 'elbow') return `${t('route.bom.elbow')} ${r.angle}°`;
    return t(`route.bom.${r.item}`);
  };
  const rows = bom.rows.map((r) => `<tr><td>${r.color ? `<i class="route-swatch" style="--swatch:${escapeHtml(r.color)}"></i>` : ''}${escapeHtml(item(r))}</td><td>${escapeHtml(r.size)}</td><td>${r.qty}</td><td>${r.length == null ? '—' : escapeHtml(api.fmtLen(r.length))}</td></tr>`).join('');
  return group('bom', t('route.bom'), `<dl class="pm-results"><dt>${escapeHtml(t('route.length'))}</dt><dd data-route-length="${bom.length.toFixed(3)}">${escapeHtml(api.fmtLen(bom.length))}</dd>${bom.bends != null ? `<dt>${escapeHtml(t('route.bendCount'))}</dt><dd>${bom.bends}</dd>` : ''}</dl><div class="std-table-wrap"><table class="std-table route-bom"><tr><th>${escapeHtml(t('route.bom.item'))}</th><th>${escapeHtml(t('route.bom.size'))}</th><th>${escapeHtml(t('route.bom.qty'))}</th><th>${escapeHtml(t('route.bom.cutLength'))}</th></tr>${rows}</table></div>`);
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
    return [routeSettings(api, f), routePoints(api, f, { paths, picking: e?.pick === 'points3d', drawPlane: e?.drawPlane ?? 'top' }), routeBomHtml(api, bom)].join('');
  },
};

export { STD_KINDS };
