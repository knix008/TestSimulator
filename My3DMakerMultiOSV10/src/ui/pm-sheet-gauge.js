// The gauge table and bend calculation groups of the sheet metal PropertyManager pages (base flange, convert to
// sheet metal, lofted bend): a gauge (thickness, radius and K from a table) and how bends are laid out flat
// (K-factor, K table by r/t, DIN 6935, bend allowance or bend deduction table). HTML only — app.js binds them
// (keys gaugeTable / gauge / gaugeRadius, bendMethod, row fields cg:i:col · kr:i:col · br:i:col, smRow* commands).
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, seg, select } from './propertymanager.js';
import { GAUGE_TABLE_IDS, BEND_METHODS, gaugeRowsOf, gaugeOf, DEFAULT_K_ROWS } from '../cad/sheet-gauge.js';

const METHOD_ICONS = { kFactor: 'smartDim', kTable: 'table', din6935: 'dimRadius', allowance: 'bendTable', deduction: 'dimHorizontal' };

/** A small editable table: columns [key, label, kind ('len' | 'num' | 'angle' | 'text')], rows of values. */
export function rowTable(api, prefix, cols, rows, { seedLabel = null } = {}) {
  const cell = (i, [key, , kind], v) => {
    const shown = kind === 'text' ? String(v ?? '') : kind === 'len' ? api.fmtLenBare(Number(v) || 0) : api.fmt(Number(v) || 0);
    return `<td><input type="text" class="pm-text short ${kind === 'text' ? '' : 'num'}" data-pm-field="${prefix}:${i}:${key}" data-unit="${kind === 'len' ? 'length' : 'number'}" value="${escapeHtml(shown)}" spellcheck="false" aria-label="${escapeHtml(key)} ${i + 1}"/></td>`;
  };
  const head = `<tr>${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th></th></tr>`;
  const body = rows.map((r, i) => `<tr>${cols.map((c) => cell(i, c, r[c[0]])).join('')}<td><button type="button" class="icon-button" data-pm="smRowDel:${prefix}.${i}" title="${escapeHtml(api.t('gauge.delRow'))}">${icon('trash')}</button></td></tr>`).join('');
  const add = `<div class="pm-row-buttons"><button type="button" class="small-button" data-pm="smRowAdd:${prefix}">${icon('plus')}<span>${escapeHtml(api.t('gauge.addRow'))}</span></button>${prefix === 'cg' ? '' : `<button type="button" class="small-button" data-pm="smRowsSeed:${prefix}">${icon('refresh')}<span>${escapeHtml(seedLabel ?? api.t('gauge.seed'))}</span></button>`}</div>`;
  return `<table class="pm-mini-table">${head}${body}</table>${add}`;
}

/** The sheet's thickness field, unless a gauge table sets it. */
export function thicknessField(api, f) {
  const g = gaugeOf(f);
  if (!g) return field(api, 'thickness', f.thickness, { label: api.t('pm.thickness'), min: 0.05 });
  return `<p class="pm-note">${icon('sheetMetal', 'icon tiny')}${escapeHtml(api.t('gauge.fromTable', { gauge: g.name, thickness: api.fmtLen ? api.fmtLen(g.thickness) : String(g.thickness) }))}</p>`;
}

/** Bend radius and K (or the gauge's radii), the gauge table and the bend method with its table. */
export function gaugeGroups(api, f) {
  const { t } = api;
  const table = GAUGE_TABLE_IDS.includes(f.gaugeTable) ? f.gaugeTable : 'none';
  const rows = gaugeRowsOf(f);
  const g = gaugeOf(f);
  let gaugeBody = select('gaugeTable', GAUGE_TABLE_IDS.map((id) => [id, t(`gauge.table.${id}`), id === 'none' ? 'close' : 'sheetMetal']), table, t('gauge.table'));
  if (table === 'custom') gaugeBody += rowTable(api, 'cg', [['name', t('gauge.name'), 'text'], ['thickness', t('pm.thickness'), 'len'], ['radius', t('pm.bendRadius'), 'len'], ['k', 'K', 'num']], f.customGauges ?? []);
  if (g && rows.length) {
    gaugeBody += select('gauge', rows.map((r) => [r.name, `${r.name} — ${api.fmtLen ? api.fmtLen(r.thickness) : r.thickness}`, 'sheetMetal']), g.name, t('gauge.gauge'));
    const radius = g.radii.find((r) => Math.abs(r - Number(f.radius)) < 1e-6) ?? g.radii[0];
    gaugeBody += select('gaugeRadius', g.radii.map((r) => [String(r), api.fmtLen ? api.fmtLen(r) : String(r), 'dimRadius']), String(radius), t('pm.bendRadius'));
  }
  const method = BEND_METHODS.includes(f.bendMethod) ? f.bendMethod : 'kFactor';
  let bendBody = seg('bendMethod', BEND_METHODS.map((m) => [m, t(`gauge.method.${m}`), METHOD_ICONS[m]]), method);
  if (!g) bendBody += field(api, 'radius', f.radius, { label: t('pm.bendRadius'), glyph: 'dimRadius', min: 0 });
  if (method === 'kFactor' && !g) bendBody += field(api, 'kFactor', f.kFactor, { label: t('pm.kFactor'), unit: 'number', glyph: 'smartDim', min: 0 });
  if (method === 'kTable') bendBody += rowTable(api, 'kr', [['ratio', 'r / t', 'num'], ['k', 'K', 'num']], f.kRows?.length ? f.kRows : DEFAULT_K_ROWS);
  if (method === 'allowance' || method === 'deduction') {
    bendBody += rowTable(api, 'br', [['angle', t('pm.angle'), 'angle'], ['radius', t('pm.bendRadius'), 'len'], ['value', t(method === 'allowance' ? 'gauge.ba' : 'gauge.bd'), 'len']], f.bendRows ?? []);
    if (!(f.bendRows ?? []).length) bendBody += `<p class="pm-note">${escapeHtml(t('gauge.emptyTable'))}</p>`;
  }
  bendBody += `<p class="pm-note">${escapeHtml(t(`gauge.help.${method}`))}</p>`;
  return group('sheetMetal', t('gauge.title'), gaugeBody) + group('bendTable', t('gauge.bendCalc'), bendBody);
}
